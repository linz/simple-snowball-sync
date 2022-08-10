import { fsa, FsS3 } from '@linzjs/s3fs';
import S3 from 'aws-sdk/clients/s3';
import { boolean, command, flag, number, option, positional, string } from 'cmd-ts';
import { createHash } from 'crypto';
import pLimit from 'p-limit';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { PassThrough } from 'stream';
import * as tar from 'tar-stream';
import { createGzip } from 'zlib';
import { logger, LogType } from '../log.js';
import { ManifestFile } from '../manifest.js';
import { isDifferentManifestExist, ManifestFileName, ManifestLoader } from '../manifest.loader.js';
import { registerSnowball } from '../snowball.js';
import { ot, Tracer } from '../tracer.js';
import { uploadFile } from '../upload.js';
import { endpoint, msSince, target, verbose } from './common.js';
import { hashFiles } from './hash.js';

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

class SyncState {
  manifest: ManifestLoader;
  concurrency: number;
  scan: boolean;
  Q: pLimit.Limit;
  logger: LogType;
}
const state = new SyncState();

export const commandSync = command({
  name: 'sync',
  description: 'Sync a manifest to a target location',
  args: {
    verbose,
    endpoint,
    target,
    concurrency: option({
      long: 'concurrency',
      type: number,
      description: 'Number of upload threads to run',
      defaultValue: () => 5,
    }),
    filter: option({
      long: 'filter',
      type: number,
      description: 'Use tar to sync files smaller than this (Mb)',
      defaultValue: () => 1,
    }),
    scan: flag({
      long: 'scan',
      type: boolean,
      description: 'Scan the target looking for missing files to upload',
    }),
    manifest: positional({ type: string, displayName: 'MANIFEST' }),
  },
  handler: (args) => {
    return Tracer.startRootSpan('command:sync', async (span) => {
      span.setAttribute('target', args.target);
      span.setAttribute('concurrency', args.concurrency);
      const startTime = performance.now();

      state.logger = logger;

      const target = args.target;

      FsS3.parse(target); // Asserts target is a s3 uri
      if (target == null) throw new Error('--target must be in the format s3://bucket/prefix');
      client = await registerSnowball(args, logger);

      logger.info({ target, concurrency: args.concurrency, endpoint: args.endpoint }, 'Sync:Start');

      // Only use tar compression if uploading to a snowball
      if (args.endpoint == null) args.filter = -1;

      if (!args.manifest.endsWith('.json')) throw new Error('Manifest must be a json file');

      state.manifest = await ManifestLoader.load(args.manifest, logger);
      if (await isDifferentManifestExist(state.manifest, target, logger)) {
        throw new Error('The existing manifest in the target directory contains different files.');
      }
      logger.info({ correlationId: state.manifest.correlationId }, 'Sync:Manifest');

      state.Q = pLimit(args.concurrency);
      state.concurrency = args.concurrency;
      state.scan = args.scan;

      Stats.totalFiles = state.manifest.files.size;
      Stats.totalSize = state.manifest.size;

      /** Filter files down to MB size */
      const filterSize = args.filter * 1024 * 1024;
      const smallFiles: ManifestFile[] = [];
      const bigFiles: ManifestFile[] = [];
      for (const file of state.manifest.files.values()) {
        if (file.size > filterSize) bigFiles.push(file);
        else smallFiles.push(file);
      }
      logger.info({ files: bigFiles.length, smallFiles: smallFiles.length, filterMb: args.filter }, 'Sync:FilterFiles');

      watchStats();

      // Upload larger files and Tar small files and upload them
      if (bigFiles.length > 0) await uploadBigFiles(state, bigFiles, target);
      if (smallFiles.length > 0) await uploadSmallFiles(state, smallFiles, target);

      // Force a scan after the upload completes
      if (state.scan === false) {
        state.scan = true;
        if (bigFiles.length > 0) await uploadBigFiles(state, bigFiles, target);
        if (smallFiles.length > 0) await uploadSmallFiles(state, smallFiles, target);
      }

      const manifestJson = Buffer.from(state.manifest.toJsonString());
      // Upload the manifest
      await fsa.write(fsa.join(target, ManifestFileName), manifestJson);
      await fsa.write(args.manifest, manifestJson);

      // Force rehash any file that is missing a hash
      const missingHashes = state.manifest.filter((f) => f.hash == null);
      if (missingHashes.length > 0) {
        logger.warn({ count: missingHashes.length }, 'MissingHashes');
        await hashFiles(missingHashes, state.manifest, logger);
      }
      logger.info(
        { sizeMb: (Stats.size / 1024 / 1024).toFixed(2), count: Stats.count, duration: msSince(startTime) },
        'Sync:Done',
      );
    });
  },
});

async function uploadBigFiles(state: SyncState, files: ManifestFile[], target: string): Promise<void> {
  let promises: Promise<unknown>[] = [];

  const { bucket, key } = FsS3.parse(target);

  if (state.scan) {
    // Scan the target folder validating all files have uploaded
    const fileMap = new Map();
    for (const f of files) fileMap.set(f.path, f);
    for await (const file of ManifestLoader.list(target)) {
      const existing = fileMap.get(file.path);
      if (existing == null) continue;
      if (existing.size !== file.size) {
        state.logger.warn(
          { path: file.path, sourceSize: existing.size, targetSize: file.size },
          'Upload:Scan:Mismatch',
        );
      } else {
        fileMap.delete(file.path);
      }
    }
    // Filter the list down to all the files
    if (fileMap.size !== files.length) {
      state.logger.info({ existing: files.length - fileMap.size, todo: fileMap.size }, 'Upload:Scan:Existing');
      files = [...fileMap.values()];
    }
  } else {
    // Only upload files that have no hash
    files = files.filter((f) => f.hash == null);
  }
  if (files.length === 0) return;

  state.logger.info({ index: 0, files: files.length }, 'Upload:Start');
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const p = state
      .Q(async () => {
        return Tracer.tracer.startActiveSpan('sync:upload:' + file.path, {}, ot.context.active(), async (span) => {
          // Hash the file while uploading
          const hash = createHash('sha256');
          const fileStream = fsa.readStream(state.manifest.file(file));
          fileStream.on('data', (chunk) => hash.update(chunk));

          const uploadCtx = { Bucket: bucket, Key: path.join(key ?? '', file.path), Body: fileStream };
          const targetUri = fsa.join(target, file.path);

          const startTime = performance.now();
          state.logger.trace(
            { index, total: files.length, path: file.path, size: file.size, target: targetUri },
            'Upload:File:Start',
          );
          await uploadFile(client, uploadCtx);
          Stats.count++;
          Stats.size += file.size;
          Stats.progressSize += file.size;
          const digest = 'sha256-' + hash.digest('base64');
          state.manifest.setHash(file.path, digest);
          state.logger.debug(
            {
              index,
              total: files.length,
              path: file.path,
              size: file.size,
              hash,
              target: targetUri,
              duration: msSince(startTime),
            },
            'Upload:File:Done',
          );
          span.setAttribute('index', index);
          span.setAttribute('path', file.path);
          span.setAttribute('size', file.size);
          span.setAttribute('hash', digest);
          span.setAttribute('target', targetUri);
          span.end();
        });
      })
      .catch((err) => {
        state.logger.error({ err, path: file.path }, 'Upload:File:Failed');
        throw err;
      });

    promises.push(p);
    if (promises.length > 1000) {
      state.logger.debug({ index }, 'Upload:Join');
      await Promise.all(promises);
      promises = [];
    }
  }
  await Promise.all(promises);
}

async function uploadSmallFiles(state: SyncState, files: ManifestFile[], target: string): Promise<void> {
  let log = state.logger.child({ type: 'tar' });
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
      return state.Q(async () => {
        const buffer = await fsa.read(state.manifest.file(file));

        const fileHash = createHash('sha256').update(buffer).digest('base64');
        packer.entry({ name: file.path }, buffer);
        if (tarCount % 1_000 === 0) log.debug({ tarCount, tarTotal: chunk.length }, 'Tar:Progress');

        tarCount++;
        totalSize += file.size;
        state.manifest.setHash(file.path, 'sha256-' + fileHash);
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

function watchStats(): void {
  const startTime = performance.now();
  let lastTick = startTime;
  const logInterval = setInterval(() => {
    const movedMb = Number((Stats.size / 1024 / 1024).toFixed(2));

    const duration = msSince(lastTick);
    lastTick = performance.now();
    const totalTimeSeconds = (lastTick - startTime) / 1000;
    const speed = Number((movedMb / totalTimeSeconds).toFixed(2));

    const percent = ((Stats.progressSize / Stats.totalSize) * 100).toFixed(3);
    state.logger.info({ count: Stats.count, percent, movedMb, speed, duration }, 'Upload:Progress');
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
