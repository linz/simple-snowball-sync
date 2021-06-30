import { fsa, FsS3 } from '@linzjs/s3fs';
import { Command } from '@oclif/command';
import { promises as fs } from 'fs';
import * as path from 'path';
import { logger } from '../log';
import { ManifestLoader } from '../manifest.loader';
import { registerSnowball, SnowballArgs } from '../snowball';
import { getVersion } from '../version';

export class CreateManifest extends Command {
  static flags = {
    endpoint: SnowballArgs.endpoint,
    verbose: SnowballArgs.verbose,
  };

  static args = [{ name: 'inputFile', required: true }];

  async parseInputPath(input: string): Promise<string | null> {
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

  async run(): Promise<void> {
    const { args, flags } = this.parse(CreateManifest);
    registerSnowball(flags);
    logger.info(getVersion(), 'Manifest:Start');

    const inputPath = await this.parseInputPath(args.inputFile);
    if (inputPath == null) return;

    const pathReg = new RegExp('\\' + path.sep, 'g');

    let manifestName = args.inputFile;
    if (manifestName.startsWith(path.sep)) manifestName = manifestName.slice(1);
    if (manifestName.endsWith(path.sep)) manifestName = manifestName.slice(0, manifestName.length - 1);
    manifestName = manifestName.replace(pathReg, '_').replace(/ /g, '_').replace(':', '') + '.manifest.json';

    const manifest = await ManifestLoader.create(manifestName, inputPath);

    await fsa.write(manifestName, Buffer.from((await manifest).toJsonString()));
    logger.info({ path: manifestName, count: manifest.files.size }, 'Manifest:Created');
  }
}
