import { fsa, FsS3 } from '@linzjs/s3fs';
import { command, positional, string } from 'cmd-ts';
import { promises as fs } from 'fs';
import * as path from 'path';
import { logger } from '../log';
import { ManifestFileName, ManifestLoader } from '../manifest.loader';
import { registerSnowball } from '../snowball';
import { getVersion } from '../version';
import { endpoint, verbose } from './common';

export const commandManifest = command({
  name: 'manifest',
  description: 'Create a manifest file',
  args: {
    verbose,
    endpoint,
    manifest: positional({ type: string, displayName: 'MANIFEST' }),
  },
  handler: async (args) => {
    if (args.verbose) logger.level = 'trace';

    await registerSnowball(args, logger);
    logger.info(getVersion(), 'Manifest:Start');

    const inputPath = await parseInputPath(args.manifest);
    if (inputPath == null) return;

    const pathReg = new RegExp('\\' + path.sep, 'g');

    const manifestName =
      ManifestLoader.normalize(args.manifest).replace(pathReg, '_').replace(/ /g, '_').replace(':', '') +
      '.' +
      ManifestFileName;

    const manifest = await ManifestLoader.create(manifestName, inputPath);

    await fsa.write(manifestName, Buffer.from((await manifest).toJsonString()));
    logger.info({ path: manifestName, count: manifest.files.size }, 'Manifest:Created');
  },
});

async function parseInputPath(input: string): Promise<string | null> {
  if (input.startsWith('s3://')) {
    const res = FsS3.parse(input);
    if (res == null) return null;
    return input;
  }
  const fullPath = path.resolve(input);
  const stat = await fs.stat(fullPath);
  if (!stat.isDirectory()) {
    logger.error({ path: fullPath }, 'Base path is not a folder');
    return null;
  }
  return fullPath;
}
