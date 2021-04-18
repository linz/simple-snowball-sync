import { Command, flags } from '@oclif/command';
import { promises as fs } from 'fs';
import * as path from 'path';
import { logger } from '../log';
import { Manifest } from '../manifest';
import { getVersion } from '../version';

async function* parseDirectory(basePath: string, currentPath: string[]): AsyncGenerator<string> {
  const currentFolder = path.join(basePath, ...currentPath);

  const files = await fs.readdir(currentFolder, { withFileTypes: true });
  for (const file of files) {
    if (file.isDirectory()) {
      yield* parseDirectory(basePath, [...currentPath, file.name]);
    } else {
      yield path.join(...currentPath, file.name);
    }
  }
}

export class CreateManifest extends Command {
  static flags = {
    verbose: flags.boolean({ description: 'verbose logging' }),
  };

  static args = [{ name: 'inputFile', required: true }];

  async run(): Promise<void> {
    const { args, flags } = this.parse(CreateManifest);
    if (flags.verbose) logger.level = 'debug';

    logger.info(getVersion(), 'Manifest:Start');

    const inputPath = path.resolve(args.inputFile);
    const stat = await fs.stat(inputPath);
    if (!stat.isDirectory()) {
      logger.error({ path: inputPath }, 'Base path is not a folder');
      return;
    }

    const manifest: Manifest = { path: inputPath, size: 0, files: [] };
    const pathReg = new RegExp('\\' + path.sep, 'g');

    for await (const fileName of parseDirectory(inputPath, [])) {
      const stat = await fs.stat(path.join(inputPath, fileName));
      manifest.size += stat.size;
      manifest.files.push({ path: fileName, size: stat.size });
      if (manifest.files.length % 1000 === 0) {
        logger.info({ count: manifest.files.length, path: fileName }, 'Manifest:Progress');
      }
    }

    let manifestName = args.inputFile;
    if (manifestName.startsWith(path.sep)) manifestName = manifestName.slice(1);
    if (manifestName.endsWith(path.sep)) manifestName = manifestName.slice(0, manifestName.length - 1);
    manifestName = manifestName.replace(pathReg, '_').replace(/ /g, '_') + '.manifest.json';
    await fs.writeFile(manifestName, JSON.stringify(manifest, null, 2));
    logger.info({ path: manifestName, count: manifest.files.length }, 'Manifest:Created');
  }
}
