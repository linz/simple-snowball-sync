import { fsa } from '@linzjs/s3fs';
import Command, { flags } from '@oclif/command';
import pLimit from 'p-limit';
import { hashFile } from '../hash';
import { logger } from '../log';
import { ManifestLoader } from '../manifest.loader';
import { registerSnowball, SnowballArgs } from '../snowball';
import { getVersion } from '../version';

const Q = pLimit(5);

export class HashManifest extends Command {
  static flags = {
    verbose: SnowballArgs.verbose,
    endpoint: SnowballArgs.endpoint,
    force: flags.boolean({ description: 'Force rehash all files' }),
  };

  static args = [{ name: 'manifest', required: true }];

  async run(): Promise<void> {
    const { args, flags } = this.parse(HashManifest);
    registerSnowball(flags);
    logger.info(getVersion(), 'Hash:Start');

    const manifest = await ManifestLoader.load(args.manifest);

    const toHash = flags.force ? [...manifest.files.values()] : manifest.filter((f) => f.hash == null);
    if (toHash.length === 0) {
      await fsa.write(args.manifest, Buffer.from(manifest.toJsonString()));
      logger.info({ path: args.manifest, total: manifest.files.size }, 'Hash:Done');
      return;
    }
    logger.debug({ total: toHash.length }, 'Hash:File');

    const promises = [];
    let count = 0;
    for (const file of toHash) {
      promises.push(
        Q(async () => {
          logger.debug({ count, total: toHash.length, file }, 'Hash:File');
          const filePath = fsa.join(manifest.path, file.path);
          const hash = await hashFile(fsa.readStream(filePath));
          manifest.setHash(file.path, hash);
          count++;
          if (count % 1_000 === 0) logger.info({ count, total: toHash.length }, 'Hash:Progress');
        }).catch((error) => logger.error({ error, path: fsa.join(manifest.path, file.path) }, 'Hash:Failed')),
      );
    }

    await Promise.all(promises);

    await fsa.write(args.manifest, Buffer.from(manifest.toJsonString()));
    logger.info({ path: args.inputFile, count: manifest.files.size }, 'Hash:Done');
  }
}
