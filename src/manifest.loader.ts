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
    for (const file of manifest.files) this.files.set(file.path, file);
  }

  static async load(fileName: string): Promise<ManifestLoader> {
    let sourceFile = fileName;
    if (existsSync(fileName + '.1')) sourceFile = fileName + '.1';
    const buf = await fs.readFile(sourceFile);

    const manifest: Manifest = JSON.parse(buf.toString());
    return new ManifestLoader(fileName, manifest);
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
    for (const file of this.files.values()) {
      if (f(file)) output.push(file);
    }
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
