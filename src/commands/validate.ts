import { fsa } from '@linzjs/s3fs';
import { command, option, positional, string } from 'cmd-ts';
import pLimit from 'p-limit';
import { hashFile } from '../hash';
import { setupLogger } from '../log';
import { ManifestFileName, ManifestLoader } from '../manifest.loader';
import { registerSnowball } from '../snowball';
import { endpoint, target, verbose } from './common';

const Q = pLimit(5);

export const commandValidate = command({
  name: 'validate',
  description: 'Validate a percentage of uploaded files',
  args: {
    verbose,
    endpoint,
    target,
    sample: option({ type: string, long: '--sample', defaultValue: () => '0' }),
    manifest: positional({ type: string, displayName: 'MANIFEST' }),
  },
  handler: async (args) => {
    const logger = await setupLogger('validate', args);
    await registerSnowball(args, logger);

    const manifest = await ManifestLoader.load(args.manifest, logger);
    logger.info({ correlationId: manifest.correlationId }, 'Validate:Manifest');

    const targetPath = args.target ?? manifest.dataPath;

    // Validate all the files exist
    logger.info('Validate:FileList');
    const expectedFiles = new Map(manifest.files);
    const targetManifest = await ManifestLoader.create('/never', targetPath, logger);
    const extraFiles = new Set<string>();

    for (const file of targetManifest.files.values()) {
      if (expectedFiles.has(file.path)) {
        const expected = expectedFiles.get(file.path);
        if (expected?.size !== file.size) logger.error({ file, expected }, 'Validate:FileList:FileSizeMissMatch');
        expectedFiles.delete(file.path);
      } else {
        // Manifest files are a extra file that is added
        if (file.path === ManifestFileName) continue;
        extraFiles.add(file.path);
      }
    }
    // Found extra files in the destination, not necessarily a problem
    if (extraFiles.size > 0) {
      for (const file of extraFiles) {
        logger.warn({ path: fsa.join(targetPath, file) }, 'Validate:FileList:ExtraFile');
      }
      logger.error({ extra: extraFiles.size }, 'Validate:FileList:Extra');
    }
    // Missing files this is a big problem!
    if (expectedFiles.size > 0) {
      for (const file of expectedFiles.keys()) {
        logger.warn({ path: fsa.join(targetPath, file) }, 'Validate:FileList:Missing');
      }
      logger.fatal({ missing: expectedFiles.size }, 'Validate:FileList:Failed');
      return;
    }

    logger.info({ files: targetManifest.files.size }, 'Validate:FileList:Ok');

    // Validate the contents
    const promises = [];
    const stats = { hashMissing: 0, hashMissMatch: 0, count: 0 };
    const percent = Number(args.sample) / 100;
    if (isNaN(percent)) throw new Error('--sample is not a number');
    const toVerify = manifest.filter(() => Math.random() < percent);
    logger.info({ percent: args.sample, count: toVerify.length }, 'Validate:Files');
    for (let i = 0; i < toVerify.length; i++) {
      const file = toVerify[i];
      if (file.hash == null) {
        stats.hashMissing++;
        continue;
      }
      promises.push(
        Q(async () => {
          const filePath = fsa.join(targetPath, file.path);
          const stream = fsa.readStream(filePath);
          const hash = await hashFile(stream);

          if (file.hash !== hash) {
            stats.hashMissMatch++;
            logger.warn({ index: i, path: filePath, expected: file.hash, got: hash }, 'Validate:SizeMismatch');
          } else {
            logger.debug({ index: i, filePath, size: file.size, hash: file.hash }, 'Validate:File');
          }

          stats.count++;
          if (stats.count % 1_000 === 0) {
            logger.info({ count: stats.count, total: toVerify.length }, 'Validate:Progress');
          }
        }).catch((error) => logger.error({ error, path: manifest.file(file.path) }, 'Validate:Failed')),
      );
    }

    if (stats.hashMissing) logger.error({ count: stats.hashMissing }, 'Validate:HashMissing');

    await Promise.all(promises);

    if (stats.hashMissMatch > 0 || stats.hashMissing) {
      logger.warn(stats, 'Validate:Done');
    } else {
      logger.info(stats, 'Validate:Done');
    }
  },
});
