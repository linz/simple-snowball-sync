import Command, { flags } from '@oclif/command';
import { existsSync, promises as fs } from 'fs';
import pLimit from 'p-limit';
import * as path from 'path';
import { hashFile } from '../hash';
import { logger } from '../log';
import { Manifest } from '../manifest';
import { getVersion } from '../version';

const Q = pLimit(5);

export class ValidateManifest extends Command {
  static flags = {
    verbose: flags.boolean({ description: 'verbose logging' }),
    local: flags.boolean({ description: 'Validate local files' }),
    remote: flags.boolean({ description: 'Validate remote files' }),
  };

  static args = [{ name: 'inputFile', required: true }];

  async run(): Promise<void> {
    const { args, flags } = this.parse(ValidateManifest);
    if (flags.verbose) logger.level = 'debug';

    logger.info(getVersion(), 'Validate:Start');
    if (flags.local && flags.remote) {
      logger.error('only one of --local or --remote can be used');
      return;
    }

    if (!flags.local && !flags.remote) flags.local = true;
    let manifestFile = args.inputFile;
    if (existsSync(manifestFile + '.1')) manifestFile = manifestFile + '.1';
    const manifest = JSON.parse((await fs.readFile(manifestFile)).toString()) as Manifest;

    const promises = [];
    const stats = {
      hashMissing: 0,
      hashMissMatch: 0,
      count: 0,
    };
    for (const file of manifest.files) {
      if (file.hash == null) {
        stats.hashMissing++;
        return;
      }
      promises.push(
        Q(async () => {
          const filePath = path.join(manifest.path, file.path);
          const hash = await hashFile(filePath);
          if (file.hash !== hash) {
            stats.hashMissMatch++;
            logger.warn({ path: filePath, expected: file.hash, got: hash }, 'Hash:Missmatch');
          }

          stats.count++;
          if (stats.count % 1_000) logger.debug({ count: stats.count, total: manifest.files.length }, 'Hash:Progress');
        }),
      );
    }

    if (stats.hashMissing) logger.error({ count: stats.hashMissing }, 'Hash:Missing');

    await Promise.all(promises);

    if (stats.hashMissMatch > 0 || stats.hashMissing) {
      logger.warn(stats, 'Validate:Done');
    } else {
      logger.info(stats, 'Validate:Done');
    }
  }
}
