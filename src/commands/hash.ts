import { fsa } from '@linzjs/s3fs';
import { boolean, command, flag, positional, string } from 'cmd-ts';
import pLimit from 'p-limit';
import { performance } from 'perf_hooks';
import { hashFile } from '../hash';
import { logger } from '../log';
import { ManifestFile } from '../manifest';
import { ManifestLoader } from '../manifest.loader';
import { registerSnowball } from '../snowball';
import { getVersion } from '../version';
import { endpoint, verbose } from './common';

export const commandHash = command({
  name: 'hash',
  description: 'Hash manifest files',
  args: {
    verbose,
    endpoint,
    force: flag({ long: 'force', description: 'Force rehash all files', type: boolean }),
    manifest: positional({ type: string, displayName: 'MANIFEST' }),
  },
  handler: async (args) => {
    if (args.verbose) logger.level = 'trace';
    await registerSnowball(args, logger);
    logger.info(getVersion(), 'Hash:Start');
    const manifest = await ManifestLoader.load(args.manifest);

    const toHash = args.force ? [...manifest.files.values()] : manifest.filter((f) => f.hash == null);
    if (toHash.length === 0) {
      await fsa.write(args.manifest, Buffer.from(manifest.toJsonString()));
      logger.info({ path: args.manifest, total: manifest.files.size }, 'Hash:Done');
      return;
    }
    logger.debug({ total: toHash.length }, 'Hash:File');

    await hashFiles(toHash, manifest);

    await fsa.write(args.manifest, Buffer.from(manifest.toJsonString()));
    logger.info({ path: args.manifest, count: manifest.files.size }, 'Hash:Done');
  },
});

export async function hashFiles(toHash: ManifestFile[], manifest: ManifestLoader, Q = pLimit(5)): Promise<void> {
  let count = 0;
  let startTime = performance.now();

  const promises = toHash.map((file) => {
    return Q(async () => {
      logger.debug({ count, total: toHash.length, file }, 'Hash:File');
      const hash = await hashFile(fsa.readStream(manifest.file(file)));
      manifest.setHash(file.path, hash);
      count++;
      if (count % 1_000 === 0) {
        const duration = Number((performance.now() - startTime).toFixed(4));
        startTime = performance.now();
        logger.info({ count, total: toHash.length, duration }, 'Hash:Progress');
      }
    }).catch((error) => logger.error({ error, path: manifest.file(file) }, 'Hash:Failed'));
  });

  await Promise.all(promises);
}
