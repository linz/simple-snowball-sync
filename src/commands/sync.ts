import { fsa, FsS3 } from '@linzjs/s3fs';
import Command, { flags } from '@oclif/command';
import S3 from 'aws-sdk/clients/s3';
import { createHash } from 'crypto';
import pLimit from 'p-limit';
import * as path from 'path';
import { PassThrough } from 'stream';
import * as tar from 'tar-stream';
import { createGzip } from 'zlib';
import { logger } from '../log';
import { ManifestFile } from '../manifest';
import { isDifferentManifestExist, ManifestLoader, ManifestFileName } from '../manifest.loader';
import { registerSnowball, SnowballArgs } from '../snowball';
import { uploadFile } from '../upload';
import { getVersion } from '../version';
import { hashFiles } from './hash';

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

let client: S3;

export class SnowballSync extends Command {
  static flags = {
    ...SnowballArgs,
    concurrency: flags.integer({ description: 'Number of upload threads to run', default: 5 }),
    filter: flags.integer({ description: 'Use tar to sync files smaller than this (Mb)', default: 1 }),
    scan: flags.boolean({ description: 'Scan the target looking for missing files to upload', default: false }),
  };

  manifest: ManifestLoader;
  concurrency: number;
  scan: boolean;
  Q: pLimit.Limit;

  static args = [{ name: 'manifest', required: true }];
  async run(): Promise<void> {
    const { args, flags } = this.parse(SnowballSync);

    const target = flags.target;
    if (target == null) throw new Error('--target must be in the format s3://bucket/prefix');
    client = await registerSnowball(flags, logger);

    logger.info({ target, concurrency: flags.concurrency, endpoint: flags.endpoint, ...getVersion() }, 'Sync:Start');

    // Only use tar compression if uploading to a snowball
    if (flags.endpoint == null) flags.filter = -1;

    if (!args.manifest.endsWith('.json')) throw new Error('Manifest must be a json file');

    this.manifest = await ManifestLoader.load(args.manifest);
    if (await isDifferentManifestExist(this.manifest, target)) {
      throw new Error('The existing manifest in the target directory contains different files.');
    }

    this.Q = pLimit(flags.concurrency);
    this.concurrency = flags.concurrency;
    this.scan = flags.scan;

    Stats.totalFiles = this.manifest.files.size;
    Stats.totalSize = this.manifest.size;

    /** Filter files down to MB size */
    const filterSize = flags.filter * 1024 * 1024;
    const smallFiles: ManifestFile[] = [];
    const bigFiles: ManifestFile[] = [];
    for (const file of this.manifest.files.values()) {
      if (file.size > filterSize) bigFiles.push(file);
      else smallFiles.push(file);
    }
    logger.info({ bigFiles: bigFiles.length, smallFiles: smallFiles.length, filterMb: flags.filter }, 'FilterFiles');

    watchStats();

    // Upload larger files
    await this.uploadBigFiles(bigFiles, target);
    // Tar small files and upload them
    await this.uploadSmallFiles(smallFiles, target);
    const manifestJson = Buffer.from(this.manifest.toJsonString());
    // Upload the manifest
    await fsa.write(fsa.join(target, ManifestFileName), manifestJson);
    await fsa.write(args.manifest, manifestJson);

    // Force rehash any file that is missing a hash
    const missingHashes = this.manifest.filter((f) => f.hash == null);
    if (missingHashes.length > 0) {
      logger.warn({ count: missingHashes.length }, 'MissingHashes');
      await hashFiles(missingHashes, this.manifest);
    }
    logger.info({ sizeMb: (Stats.size / 1024 / 1024).toFixed(2), count: Stats.count }, 'Sync:Done');
  }

  async uploadBigFiles(files: ManifestFile[], target: string): Promise<void> {
    const log = logger.child({ type: 'big' });
    let promises: Promise<unknown>[] = [];

    const { bucket, key } = FsS3.parse(target);

    if (this.scan) {
      // Scan the target folder validating all files have uploaded
      const fileMap = new Map();
      for (const f of files) fileMap.set(f.path, f);
      for await (const file of ManifestLoader.list(target)) {
        const existing = fileMap.get(file.path);
        if (existing == null) continue;
        if (existing.size !== file.size) {
          logger.warn({ path: file.path, sourceSize: existing.size, targetSize: file.size }, 'Upload:Scan:Mismatch');
        } else {
          fileMap.delete(file.path);
        }
      }
      // Filter the list down to all the files
      if (fileMap.size !== files.length) {
        logger.info({ existing: files.length - fileMap.size, todo: fileMap.size }, 'Upload:Scan:Existing');
        files = [...fileMap.values()];
      }
    } else {
      // Only upload files that have no hash
      files = files.filter((f) => f.hash == null);
    }

    log.info({ startOffset: 0, files: files.length }, 'Upload:Start');
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const p = this.Q(async () => {
        // Hash the file while uploading
        const hash = createHash('sha256');
        const fileStream = fsa.readStream(this.manifest.file(file));
        fileStream.on('data', (chunk) => hash.update(chunk));

        const uploadCtx = {
          Bucket: bucket,
          Key: path.join(key ?? '', file.path),
          Body: fileStream,
        };
        const targetUri = fsa.join(target, file.path);

        log.debug(
          { bigCount: index, bigTotal: files.length, path: file.path, size: file.size, target: targetUri },
          'Upload:Start',
        );
        await uploadFile(client, uploadCtx);
        Stats.count++;
        Stats.size += file.size;
        Stats.progressSize += file.size;
        this.manifest.setHash(file.path, 'sha256-' + hash.digest('base64'));
      }).catch((err) => {
        logger.error({ err, path: this.manifest.file(file) }, 'UploadFailed');
        process.exit(1);
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

  async uploadSmallFiles(files: ManifestFile[], target: string): Promise<void> {
    let log = logger.child({ type: 'tar' });
    const { bucket, key } = FsS3.parse(target);

    let tarIndex = 0;
    for (const chunk of chunkSmallFiles(files)) {
      const tarFileName = `batch-${tarIndex++}.tar.gz`;
      const targetUri = fsa.join(target, tarFileName);
      log = log.child({ target: targetUri });

      const head = await fsa.exists(targetUri);
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
        return this.Q(async () => {
          const buffer = await fsa.read(this.manifest.file(file));

          const fileHash = createHash('sha256').update(buffer).digest('base64');
          packer.entry({ name: file.path }, buffer);
          if (tarCount % 1_000 === 0) log.debug({ tarCount, tarTotal: chunk.length }, 'Tar:Progress');

          tarCount++;
          totalSize += file.size;
          this.manifest.setHash(file.path, 'sha256-' + fileHash);
        });
      });

      await Promise.all(promises);

      packer.finalize();

      log.info({ count: Stats.count, total: Stats.totalFiles }, 'Upload:Start');
      const uploadCtx = {
        Bucket: bucket,
        Key: fsa.join(key ?? '', tarFileName),
        Body: passStream,
        Metadata: {
          'snowball-auto-extract': 'true', // Auto extract the tar file once its uploaded to s3
        },
      };
      await uploadFile(client, uploadCtx);
      await tarPromise;
      Stats.size += totalSize;
      Stats.progressSize += totalSize;
      Stats.count += chunk.length;
    }
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
