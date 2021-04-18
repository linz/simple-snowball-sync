import Command, { flags } from '@oclif/command';
import S3 from 'aws-sdk/clients/s3';
import { createHash } from 'crypto';
import { createReadStream, promises as fs } from 'fs';
import pLimit from 'p-limit';
import * as path from 'path';
import { PassThrough } from 'stream';
import * as tar from 'tar-stream';
import { createGzip } from 'zlib';
import { logger } from '../log';
import { ManifestFile } from '../manifest';
import { ManifestLoader } from '../manifest.loader';
import { BucketKey, s3Util } from '../s3';
import { getVersion } from '../version';

const Stats = {
  /** Files uploaded over all runs */
  count: 0,
  /** Total bytes uploaded this run */
  size: 0,
  /** Total bytes uploaded over all runs */
  progressSize: 0,
  /** Total files to upload */
  totalFiles: 0,
  /** Total size of files to upload */
  totalSize: 0,
};

const OneMb = 1024 * 1024;
const OneGb = OneMb * 1024;
/**
 * Limit the size of unpacked tar balls uploaded to s3
 * Snowball allows upto 100GB per tar
 **/
const MaxTarSizeByes = 5 * OneGb;
/**
 * Limit the file count side of the tars
 * Snowballs allow upto 100,000 files
 */
const MaxTarFileCount = 10_000;

const S3UploadOptions = {
  /**
   * Force chunks to be at least 250Mb,
   * lots of small chunks (<100Mb) take too long to transfer on high speed networks
   */
  partSize: 105 * OneMb,
};

let Q = pLimit(5);
let client: S3;

export class SnowballSync extends Command {
  static flags = {
    target: flags.string({ description: 'S3 location to store files' }),
    endpoint: flags.string({ description: 'Snowball endpoint' }),
    concurrency: flags.integer({ description: 'Number of upload threads to run', default: 5 }),
    verbose: flags.boolean({ description: 'Verbose logging' }),
    filter: flags.integer({ description: 'Use tar to sync files smaller than this (Mb)', default: 1 }),
  };

  static args = [{ name: 'inputFile', required: true }];
  async run(): Promise<void> {
    const { args, flags } = this.parse(SnowballSync);
    if (flags.verbose) logger.level = 'debug';

    const target = s3Util.parse(flags.target);
    if (target == null) throw new Error('--target must be in the format s3://bucket/prefix');

    logger.info({ target, concurrency: flags.concurrency, endpoint: flags.endpoint, ...getVersion() }, 'Sync:Start');

    let endpoint = flags.endpoint;
    if (endpoint != null && !endpoint.startsWith('http')) endpoint = 'http://' + endpoint + ':8080';
    if (endpoint) logger.info({ endpoint }, 'SettingS3 Endpoint');
    client = new S3({ endpoint, s3ForcePathStyle: true, computeChecksums: true });

    if (flags.concurrency !== 5) Q = pLimit(flags.concurrency);

    if (!args.inputFile.endsWith('.json')) throw new Error('InputFile must be a json file');

    const manifest = await ManifestLoader.load(args.inputFile);

    Stats.totalFiles = manifest.files.size;
    Stats.totalSize = manifest.size;

    /** Filter files down to MB size */
    const filterSize = flags.filter * 1024 * 1024;
    const smallFiles: ManifestFile[] = [];
    const bigFiles: ManifestFile[] = [];
    for (const file of manifest.files.values()) {
      if (file.size > filterSize) bigFiles.push(file);
      else smallFiles.push(file);
    }
    logger.info({ bigFiles: bigFiles.length, smallFiles: smallFiles.length, filterMb: flags.filter }, 'FilterFiles');

    watchStats();

    // Upload larger files
    await uploadBigFiles(manifest, bigFiles, target);
    // Tar small files and upload them
    await uploadSmallFiles(manifest, smallFiles, target);
    const manifestJson = manifest.toJsonString();
    // Upload the manifest
    await client
      .upload({
        Bucket: target.bucket,
        Key: path.join(target.key, 'manifest.json'),
        Body: manifestJson,
      })
      .promise();

    await fs.writeFile(args.inputFile, manifestJson);
    logger.info({ sizeMb: (Stats.size / 1024 / 1024).toFixed(2), count: Stats.count }, 'Sync:Done');
  }
}

function watchStats(): void {
  const startTime = Date.now();
  const logInterval = setInterval(() => {
    const movedMb = Number((Stats.size / 1024 / 1024).toFixed(2));

    const totalTime = (Date.now() - startTime) / 1000;
    const speed = Number((movedMb / totalTime).toFixed(2));

    const percent = ((Stats.progressSize / Stats.totalSize) * 100).toFixed(3);
    logger.info({ count: Stats.count, percent, movedMb, speed }, 'Upload:Progress');
  }, 5000);
  logInterval.unref();
}

async function uploadBigFiles(m: ManifestLoader, files: ManifestFile[], target: BucketKey): Promise<void> {
  const log = logger.child({ type: 'big' });
  let promises: Promise<unknown>[] = [];

  const startIndex = await s3Util.findUploaded(client, files, target, logger);
  // Update the stats for where we started from
  Stats.count += startIndex;
  for (let i = 0; i < startIndex; i++) Stats.progressSize += files[i].size;

  log.info({ startOffset: startIndex, files: files.length }, 'Upload:Start');
  for (let index = startIndex; index < files.length; index++) {
    const file = files[index];
    const p = Q(async () => {
      // Hash the file while uploading
      const hash = createHash('sha256');
      const fileStream = createReadStream(path.join(m.path, file.path));
      fileStream.on('data', (chunk) => hash.update(chunk));

      const uploadCtx = {
        Bucket: target.bucket,
        Key: path.join(target.key, file.path),
        Body: fileStream,
      };
      const targetUri = `s3://${target.bucket}/${uploadCtx.Key}`;

      log.debug(
        { bigCount: index, bigTotal: files.length, path: file.path, size: file.size, target: targetUri },
        'Upload:Start',
      );
      await client.upload(uploadCtx, S3UploadOptions).promise();
      Stats.count++;
      Stats.size += file.size;
      Stats.progressSize += file.size;
      m.setHash(file.path, 'sha256-' + hash.digest('base64'));
    });

    promises.push(p);
    if (promises.length > 1000) {
      logger.debug({ index }, 'Upload:Join');
      await Promise.all(promises);
      promises = [];
    }
  }

  await Promise.all(promises);
}

async function uploadSmallFiles(m: ManifestLoader, files: ManifestFile[], target: BucketKey): Promise<void> {
  let log = logger.child({ type: 'tar' });

  let tarIndex = 0;
  for (const chunk of chunkSmallFiles(files)) {
    const tarFileName = `batch-${tarIndex++}.tar.gz`;
    const targetFileName = path.join(path.join(target.key, tarFileName));
    const targetUri = `s3://${target.bucket}/${targetFileName}`;
    log = log.child({ target: targetUri });

    const head = await s3Util.head(client, { Bucket: target.bucket, Key: targetFileName });
    if (head) {
      log.info('Tar:Exists');
      continue;
    }

    const packer = tar.pack();
    log.info({ files: chunk.length }, 'Tar:Start');
    const tarPromise = new Promise((resolve) => packer.on('end', resolve));

    const passStream = new PassThrough();
    packer.pipe(createGzip()).pipe(passStream);

    let totalSize = 0;
    let tarCount = 0;
    const promises = chunk.map((file) => {
      return Q(async () => {
        const filePath = path.join(m.path, file.path);
        const buffer = await fs.readFile(filePath);

        const fileHash = createHash('sha256').update(buffer).digest('base64');
        packer.entry({ name: file.path }, buffer);
        if (tarCount % 1_000 === 0) log.debug({ tarCount, tarTotal: chunk.length }, 'Tar:Progress');

        tarCount++;
        totalSize += file.size;
        m.setHash(file.path, 'sha256-' + fileHash);
      });
    });

    await Promise.all(promises);

    packer.finalize();

    log.info({ count: Stats.count, total: Stats.totalFiles }, 'Upload:Start');
    const uploadCtx = {
      Bucket: target.bucket,
      Key: targetFileName,
      Body: passStream,
      Metadata: {
        'snowball-auto-extract': 'true', // Auto extract the tar file once its uploaded to s3
      },
    };
    await client.upload(uploadCtx, S3UploadOptions).promise();
    await tarPromise;
    Stats.size += totalSize;
    Stats.progressSize += totalSize;
    Stats.count += chunk.length;
  }
}

/** Chunk small files into 10,000 file or 1GB chunks which ever occurs first*/
function* chunkSmallFiles(files: ManifestFile[]): Generator<ManifestFile[]> {
  let output = [];
  let currentSize = 0;
  for (const file of files) {
    output.push(file);
    currentSize += file.size;
    if (output.length > MaxTarFileCount || currentSize > MaxTarSizeByes) {
      yield output;
      output = [];
      currentSize = 0;
    }
  }

  if (output.length > 0) yield output;
}
