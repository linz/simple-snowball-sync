import { fsa } from '@linzjs/s3fs';
import { existsSync, promises as fs } from 'fs';
import { logger } from './log';
import { Manifest, ManifestFile } from './manifest';

export class ManifestLoader {
  files: Map<string, ManifestFile> = new Map();
  isDirty = false;
  dataPath: string;
  sourcePath: string;
  size: number;

  constructor(sourcePath: string, manifest: Manifest) {
    this.sourcePath = sourcePath;
    this.dataPath = manifest.path;
    this.size = manifest.size;
    for (const file of manifest.files) {
      file.path = ManifestLoader.normalize(file.path);
      this.files.set(file.path, file);
    }
  }

  file(fileName: string | ManifestFile): string {
    if (typeof fileName === 'string') return fsa.join(this.dataPath, fileName);
    return fsa.join(this.dataPath, fileName.path);
  }

  static async load(fileName: string): Promise<ManifestLoader> {
    if (!fileName.endsWith('.json')) throw new Error('Invalid manifest path ' + fileName);
    let sourceFile = fileName;
    if (existsSync(fileName + '.bak')) sourceFile = fileName + '.bak';
    const buf = await fsa.read(sourceFile);

    const manifest: Manifest = JSON.parse(buf.toString());
    return new ManifestLoader(fileName, manifest);
  }

  /** Remove leading and trailing slashes */
  static normalize(input: string): string {
    if (input.startsWith('/')) input = input.slice(1);
    if (input.endsWith('/')) input = input.slice(0, input.length - 1);
    return input;
  }

  static async *list(inputPath: string): AsyncGenerator<ManifestFile> {
    // Force a directory otherwise backup1*, will match backup10/ backup11/ etc..
    if (!inputPath.endsWith('/')) inputPath = inputPath + '/';
    for await (const rec of fsa.listDetails(inputPath)) {
      if (rec.size == null) continue;
      const filePath = ManifestLoader.normalize(rec.path.slice(inputPath.length));
      if (filePath === '/manifest.json') continue; // Ignore the root manifest
      yield { path: filePath, size: rec.size };
    }
  }

  static async create(outputPath: string, inputPath: string): Promise<ManifestLoader> {
    const manifest: Manifest = { path: inputPath, size: 0, files: [] };
    for await (const rec of this.list(inputPath)) {
      manifest.size += rec.size;
      manifest.files.push(rec);
      if (manifest.files.length % 5_000 === 0) {
        logger.info({ count: manifest.files.length, path: rec.path }, 'Manifest:Progress');
      }
    }

    return new ManifestLoader(outputPath, manifest);
  }

  setHash(path: string, hash: string): void {
    const file = this.files.get(path);
    if (file == null) throw new Error('File not found: ' + path);

    if (file.hash === hash) return;
    file.hash = hash;
    this.dirty();
  }

  filter(f: (f: ManifestFile) => boolean): ManifestFile[] {
    const output: ManifestFile[] = [];
    for (const file of this.files.values()) if (f(file)) output.push(file);
    return output;
  }

  _dirtyTimeout: NodeJS.Timer | null = null;
  dirty(): void {
    this.isDirty = true;
    if (this._dirtyTimeout != null) return;
    this._dirtyTimeout = setTimeout(async () => {
      const startTime = Date.now();
      const outputData = JSON.stringify(this.toJson(), null, 2);
      await fs.writeFile(this.sourcePath + '.1', outputData);
      await fs.writeFile(this.sourcePath, outputData);

      logger.info({ duration: Date.now() - startTime }, 'Manifest:Update');
    }, 15_000);
    this._dirtyTimeout.unref();
  }

  toJson(): Manifest {
    const files = [];
    let size = 0;
    for (const file of this.files.values()) {
      files.push(file);
      size += file.size;
    }
    return {
      path: this.dataPath,
      size,
      files,
    };
  }
  toJsonString(): string {
    return JSON.stringify(this.toJson(), null, 2);
  }
}
