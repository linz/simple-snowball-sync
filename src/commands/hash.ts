import Command, { flags } from '@oclif/command';
import { promises as fs } from 'fs';
import pLimit from 'p-limit';
import * as path from 'path';
import { hashFile } from '../hash';
import { logger } from '../log';
import { ManifestLoader } from '../manifest.loader';
import { getVersion } from '../version';

const Q = pLimit(5);

export class HashManifest extends Command {
  static flags = {
    verbose: flags.boolean({ description: 'verbose logging' }),
  };

  static args = [{ name: 'inputFile', required: true }];

  async run(): Promise<void> {
    const { args, flags } = this.parse(HashManifest);
    if (flags.verbose) logger.level = 'debug';

    logger.info(getVersion(), 'Hash:Start');

    const manifest = await ManifestLoader.load(args.inputFile);

    const toHash = manifest.filter((f) => f.hash == null);
    if (toHash.length === 0) {
      logger.info({ total: manifest.files.size }, 'AllFilesHashed');
      return;
    }
    logger.debug({ total: toHash.length }, 'Hash:File');

    const promises = [];
    let count = 0;
    for (const file of toHash) {
      promises.push(
        Q(async () => {
          logger.debug({ count, total: toHash.length, file }, 'Hash:File');
          const filePath = path.join(manifest.path, file.path);
          file.hash = await hashFile(filePath);
          count++;

          if (count % 1_000) logger.info({ count, total: toHash.length }, 'Hash:Progress');
        }),
      );
    }

    await Promise.all(promises);

    await fs.writeFile(args.inputFile, JSON.stringify(manifest.toJson(), null, 2));
    logger.info({ path: args.inputFile, count: manifest.files.size }, 'Manifest:Hashed');
  }
}
