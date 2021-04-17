import Command, { flags } from '@oclif/command';
import S3 from 'aws-sdk/clients/s3';
import { createReadStream, promises as fs } from 'fs';
import { PassThrough } from 'stream';
import pLimit from 'p-limit';
import * as path from 'path';
import * as tar from 'tar-stream';
import { logger } from '../log';
import { Manifest, ManifestFile } from '../manifest';
import { BucketKey, s3Util } from '../s3';
import { getVersion } from '../version';
import { createHash } from 'crypto';
import { writeFile } from 'node:fs';

const Stats = {
  count: 0,
  size: 0,
  totalFiles: 0,
  totalSize: 0,
};

const OneMb = 1024 * 1024;
const OneGb = OneMb * 1024;
const MaxTarSizeByes = 5 * OneGb;
const MaxTarFileCount = 10_000;

const S3UploadOptions = {
  partSize: 100 * OneMb, // 100mb chunks
};

let Q = pLimit(5);

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
    const client = new S3({ endpoint, s3ForcePathStyle: true, computeChecksums: true });

    if (flags.concurrency !== 5) Q = pLimit(flags.concurrency);

    if (!args.inputFile.endsWith('.json')) throw new Error('InputFile must be a json file');

    const mani = JSON.parse((await fs.readFile(args.inputFile)).toString()) as Manifest;
    Stats.totalFiles = mani.files.length;
    Stats.totalSize = mani.size;

    /** Filter files down to MB size */
    const filterSize = flags.filter * 1024 * 1024;
    const smallFiles: ManifestFile[] = [];
    const bigFiles: ManifestFile[] = [];
    for (const file of mani.files) {
      if (file.size > filterSize) bigFiles.push(file);
      else smallFiles.push(file);
    }
    logger.info({ bigFiles: bigFiles.length, smallFiles: smallFiles.length, filterMb: flags.filter }, 'FilterFiles');

    watchStats();

    watchManifest(args.inputFile, mani);

    // Upload larger files
    await uploadBigFiles(client, mani.path, bigFiles, target);
    // Tar small files and upload them
    await uploadSmallFiles(client, mani.path, smallFiles, target);
    // Upload the manifest
    await client
      .upload({
        Bucket: target.bucket,
        Key: path.join(target.key, 'manifest.json'),
        Body: JSON.stringify(mani),
      })
      .promise();

    await fs.writeFile(args.inputFile + '.1', JSON.stringify(mani, null, 2));
    logger.info({ sizeMb: (Stats.size / 1024 / 1024).toFixed(2), count: Stats.count }, 'Sync:Done');
  }
}

/** Every 30 seconds write out where we are upto */
function watchManifest(path: string, manifest: Manifest): void {
  const current = JSON.stringify(manifest);
  const logInterval = setInterval(async () => {
    const updated = JSON.stringify(manifest);
    if (current === updated) return;

    logger.info('WriteUpdatedManifest');
    console.time('writeManifest');
    await fs.writeFile(path + '.1', updated);
    console.timeEnd('writeManifest');
  }, 10_000);
  logInterval.unref();
}

function watchStats(): void {
  const startTime = Date.now();
  const logInterval = setInterval(() => {
    const movedMb = Number((Stats.size / 1024 / 1024).toFixed(2));

    const totalTime = (Date.now() - startTime) / 1000;
    const speed = Number((movedMb / totalTime).toFixed(2));

    const percent = ((Stats.size / Stats.totalSize) * 100).toFixed(2);
    logger.info({ count: Stats.count, percent, movedMb, speed }, 'Upload:Progress');
  }, 2000);
  logInterval.unref();
}

async function uploadBigFiles(client: S3, root: string, files: ManifestFile[], target: BucketKey): Promise<void> {
  const log = logger.child({ type: 'big' });
  let promises: Promise<unknown>[] = [];

  const startIndex = await s3Util.findUploaded(client, files, target, logger);
  log.info({ startOffset: startIndex, files: files.length }, 'Upload');
  for (let index = startIndex; index < files.length; index++) {
    const file = files[index];
    const p = Q(async () => {
      const hash = createHash('sha256');
      const fileStream = createReadStream(path.join(root, file.path));
      fileStream.on('data', (chunk) => hash.update(chunk));

      const uploadCtx = {
        Bucket: target.bucket,
        Key: path.join(target.key, file.path),
        Body: fileStream,
      };
      const targetUri = `s3://${target.bucket}/${uploadCtx.Key}`;

      log.debug(
        { count: Stats.count, total: Stats.totalFiles, path: file.path, size: file.size, target: targetUri },
        'Upload:Start',
      );
      await client.upload(uploadCtx, S3UploadOptions).promise();
      Stats.count++;
      Stats.size += file.size;
      file.hash = 'sha256-' + hash.digest('base64');
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

async function uploadSmallFiles(client: S3, root: string, files: ManifestFile[], target: BucketKey): Promise<void> {
  let log = logger.child({ type: 'small' });

  let tarIndex = 0;
  for (const chunk of chunkSmallFiles(files)) {
    const tarFileName = `batch-${tarIndex++}.tar`;
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
    packer.pipe(passStream);

    let totalSize = 0;
    const promises = chunk.map((file) => {
      return Q(async () => {
        const filePath = path.join(root, file.path);
        const buffer = await fs.readFile(filePath);

        const fileHash = createHash('sha256').update(buffer).digest('base64');
        packer.entry({ name: file.path }, buffer);
        if (Stats.count % 1_000 === 0) log.debug({ count: Stats.count, total: Stats.totalFiles }, 'Tar:Progress');

        totalSize += file.size;
        file.hash = 'sha256-' + fileHash;
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
        'snowball-auto-extract': 'true',
      },
    };
    await client.upload(uploadCtx, S3UploadOptions).promise();
    await tarPromise;
    Stats.size += totalSize;
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