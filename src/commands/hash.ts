import Command, { flags } from '@oclif/command';
import { existsSync, promises as fs } from 'fs';
import pLimit from 'p-limit';
import * as path from 'path';
import { hashFile } from '../hash';
import { logger } from '../log';
import { Manifest } from '../manifest';
import { getVersion } from '../version';
import { watchManifest } from './sync';

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

    let manifestFile = args.inputFile;
    if (existsSync(manifestFile + '.1')) manifestFile = manifestFile + '.1';

    const manifest = JSON.parse((await fs.readFile(manifestFile)).toString()) as Manifest;

    const toHash = manifest.files.filter((f) => f.hash == null);
    if (toHash.length === 0) {
      logger.info('AllFilesHashed');
      return;
    }
    watchManifest(args.inputFile, manifest);

    const promises = [];
    let count = 0;
    for (const file of toHash) {
      promises.push(
        Q(async () => {
          logger.debug({ file }, 'Hash:File');
          const filePath = path.join(manifest.path, file.path);
          file.hash = await hashFile(filePath);
          count++;

          if (count % 1_000) logger.info({ count, total: toHash.length }, 'Hash:Progress');
        }),
      );
    }

    await Promise.all(promises);

    await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2));
    logger.info({ path: manifestFile, count: manifest.files.length }, 'Manifest:Hashed');
  }
}
