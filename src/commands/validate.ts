import { fsa } from '@linzjs/s3fs';
import Command, { flags } from '@oclif/command';
import pLimit from 'p-limit';
import { hashFile } from '../hash';
import { logger } from '../log';
import { ManifestLoader } from '../manifest.loader';
import { registerSnowball, SnowballArgs } from '../snowball';
import { getVersion } from '../version';

const Q = pLimit(5);

export class ValidateManifest extends Command {
  static flags = {
    ...SnowballArgs,
    sample: flags.string({ description: 'Percentage of files to check', default: '1' }),
  };

  static args = [{ name: 'manifest', required: true }];

  async run(): Promise<void> {
    const { args, flags } = this.parse(ValidateManifest);
    if (flags.verbose) logger.level = 'trace';

    logger.info(getVersion(), 'Validate:Start');

    registerSnowball(flags);

    const manifest = await ManifestLoader.load(args.manifest);

    const sourcePath = flags.target ?? manifest.path;

    // Validate all the files exist
    logger.info('Validate:FileList');
    const expectedFiles = new Map(manifest.files);
    const targetManifest = await ManifestLoader.create('/never', sourcePath);

    for (const file of targetManifest.files.values()) {
      if (expectedFiles.has(file.path)) {
        const expected = expectedFiles.get(file.path);
        if (expected?.size !== file.size) logger.error({ file, expected }, 'FileSizeMissmatch');
        expectedFiles.delete(file.path);
      } else {
        if (file.path === 'manifest.json') continue;
        logger.error({ file }, 'ExtraFileFound');
      }
    }
    if (expectedFiles.size > 0) {
      logger.fatal({ missing: expectedFiles }, 'Validate:FileList:Failed');
      return;
    }
    logger.info({ files: targetManifest.files.size }, 'Validate:FileList:Ok');

    // Validate the contents
    const promises = [];
    const stats = { hashMissing: 0, hashMissMatch: 0, count: 0 };
    const percent = Number(flags.sample) / 100;
    if (isNaN(percent)) throw new Error('--sample is not a number');
    const toVerify = manifest.filter(() => Math.random() < percent);
    logger.info({ percent: flags.sample, count: toVerify.length }, 'Validate:Files');
    for (let i = 0; i < toVerify.length; i++) {
      const file = toVerify[i];
      if (file.hash == null) {
        stats.hashMissing++;
        continue;
      }
      promises.push(
        Q(async () => {
          const filePath = fsa.join(sourcePath, file.path);
          const stream = fsa.readStream(filePath);
          const hash = await hashFile(stream);

          if (file.hash !== hash) {
            stats.hashMissMatch++;
            logger.warn({ index: i, path: filePath, expected: file.hash, got: hash }, 'Validate:Mismatch');
          } else {
            logger.debug({ index: i, filePath, size: file.size, hash: file.hash }, 'Validate:File');
          }

          stats.count++;
          if (stats.count % 1_000 === 0) {
            logger.info({ count: stats.count, total: toVerify.length }, 'Validate:Progress');
          }
        }),
      );
    }

    if (stats.hashMissing) logger.error({ count: stats.hashMissing }, 'Validate:Missing');

    await Promise.all(promises);

    if (stats.hashMissMatch > 0 || stats.hashMissing) {
      logger.warn(stats, 'Validate:Done');
    } else {
      logger.info(stats, 'Validate:Done');
    }
  }
}
