import { fsa } from '@linzjs/s3fs';
import { existsSync, promises as fs } from 'fs';
import { logger } from './log';
import { Manifest, ManifestFile } from './manifest';

export class ManifestLoader {
  files: Map<string, ManifestFile> = new Map();
  isDirty = false;
  path: string;
  sourcePath: string;
  size: number;

  constructor(sourcePath: string, manifest: Manifest) {
    this.sourcePath = sourcePath;
    this.path = manifest.path;
    this.size = manifest.size;
    for (const file of manifest.files) this.files.set(file.path, file);
  }

  static async load(fileName: string): Promise<ManifestLoader> {
    if (!fileName.endsWith('.json')) throw new Error('Invalid manifest path ' + fileName);
    let sourceFile = fileName;
    if (existsSync(fileName + '.bak')) sourceFile = fileName + '.bak';
    const buf = await fsa.read(sourceFile);

    const manifest: Manifest = JSON.parse(buf.toString());
    return new ManifestLoader(fileName, manifest);
  }

  static async create(outputPath: string, inputPath: string): Promise<ManifestLoader> {
    const manifest: Manifest = { path: inputPath, size: 0, files: [] };
    for await (const rec of fsa.listDetails(inputPath)) {
      if (rec.size == null || rec.size === 0) continue;
      manifest.size += rec.size;
      manifest.files.push({ path: rec.path.slice(inputPath.length), size: rec.size });
      if (manifest.files.length % 1_000 === 0) {
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
      await fs.writeFile(this.sourcePath + '.1', JSON.stringify(this.toJson(), null, 2));
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
      path: this.path,
      size,
      files,
    };
  }
  toJsonString(): string {
    return JSON.stringify(this.toJson(), null, 2);
  }
}
