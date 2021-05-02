import { S3Fs } from '@linzjs/s3fs';
import Command, { flags } from '@oclif/command';
import pLimit from 'p-limit';
import { hashFile } from '../hash';
import { logger } from '../log';
import { ManifestLoader } from '../manifest.loader';
import { getVersion } from '../version';
const s3 = new S3Fs();

const Q = pLimit(5);

export class ValidateManifest extends Command {
  static flags = {
    verbose: flags.boolean({ description: 'verbose logging' }),
    target: flags.string({ description: 's3 location to validate' }),
    sample: flags.integer({ description: 'Percentage of files to check', default: 1 }),
  };

  static args = [{ name: 'inputFile', required: true }];

  async run(): Promise<void> {
    const { args, flags } = this.parse(ValidateManifest);
    if (flags.verbose) logger.level = 'trace';

    logger.info(getVersion(), 'Validate:Start');

    const manifest = await ManifestLoader.load(args.inputFile);

    const sourcePath = flags.target ?? manifest.path;

    const promises = [];
    const stats = { hashMissing: 0, hashMissMatch: 0, count: 0 };
    const percent = flags.sample / 100;
    const toVerify = manifest.filter((f) => f.size > 1024 * 1024 && Math.random() < percent);
    logger.info({ percent: flags.sample, count: toVerify.length }, 'Validate:Files');
    for (let i = 0; i < toVerify.length; i++) {
      const file = toVerify[i];
      if (file.hash == null) {
        stats.hashMissing++;
        continue;
      }
      promises.push(
        Q(async () => {
          const filePath = s3.join(sourcePath, file.path);
          const stream = s3.readStream(filePath);
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
