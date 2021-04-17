import { Command, flags } from '@oclif/command';
import { promises as fs } from 'fs';
import { logger } from '../log';
import { Manifest } from '../manifest';
import * as path from 'path';
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

    const manifest: Manifest = {
      path: inputPath,
      size: 0,
      files: [],
    };

    const pathReg = new RegExp('\\' + path.sep, 'g');

    for await (const fileName of parseDirectory(inputPath, [])) {
      const stat = await fs.stat(path.join(inputPath, fileName));
      manifest.size += stat.size;
      manifest.files.push({ path: fileName, size: stat.size });
      if (manifest.files.length % 1000 === 0)
        logger.debug({ count: manifest.files.length, path: fileName }, 'Progress');
    }

    const outputFile = args.inputFile.replace(pathReg, '_') + '.json';
    await fs.writeFile(outputFile, JSON.stringify(manifest, null, 2));
    logger.info({ path: outputFile, count: manifest.files.length }, 'Manifest:Created');
  }
}
