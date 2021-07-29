import { fsa } from '@linzjs/s3fs';
import { promises as fs } from 'fs';
import { logger } from './log';
import { Manifest, ManifestFile } from './manifest';

const BackupExtension = '.1';
export const ManifestFileName = 'manifest.json';

function isManifestPath(fileName: string): boolean {
  if (fileName.endsWith('.json' + BackupExtension)) return true;
  if (fileName.endsWith('.json')) return true;
  return false;
}

/**
 * Compare the 'Files' data of two manifest.json files.
 * manifestA can contain more files than manifestB.
 *
 * @param manifestA The manifest in the source directory.
 * @param manifestB The manifest in the destination directory.
 * @returns true if manifestA contains all the files (with identical data) of manifestB.
 */
export function isManifestsDifferent(manifestA: ManifestLoader, manifestB: ManifestLoader): boolean {
  for (const value of manifestB.files.values()) {
    const comparedValue = manifestA.files.get(value.path);

    if (comparedValue == null) return true;
    if (comparedValue.path !== value.path) return true;
    if (comparedValue.size !== value.size) return true;
    if (comparedValue.hash !== value.hash) return true;
  }

  return false;
}

/**
 * Return true if a manifest.json generated for the same files exists in the destination directory.
 *
 * @param currentManifest The manifest in the source directory.
 * @param destPath The destination directory path (where files will be uploaded).
 * @returns true if a manifest containing different files exists in the destination directory.
 */
export async function isDifferentManifestExist(currentManifest: ManifestLoader, destPath: string): Promise<boolean> {
  const existingManifestPath = fsa.join(destPath, ManifestFileName);
  const isManifestExist = await fsa.exists(existingManifestPath);

  if (isManifestExist) {
    const existingManifest = await ManifestLoader.load(existingManifestPath);
    logger.info({ existingManifest }, 'CheckTargetDir');

    if (isManifestsDifferent(currentManifest, existingManifest)) return true;
  }

  return false;
}

export class ManifestLoader {
  files: Map<string, ManifestFile> = new Map();

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
    if (!isManifestPath(fileName)) throw new Error('Invalid manifest path ' + fileName);
    const buf = await fsa.read(fileName);
    try {
      const manifest: Manifest = JSON.parse(buf.toString());
      return new ManifestLoader(fileName, manifest);
    } catch (e) {
      if (fileName.endsWith(BackupExtension)) throw e;
      return this.load(fileName + BackupExtension);
    }
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
      if (filePath === '/' + ManifestFileName) continue; // Ignore the root manifest
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

  get isDirty(): boolean {
    return this._dirtyTimeout != null;
  }

  _dirtyTimeout: NodeJS.Timer | null = null;
  dirty(): void {
    if (this._dirtyTimeout != null) return;
    this._dirtyTimeout = setTimeout(async () => {
      this._dirtyTimeout = null;

      const startTime = Date.now();
      const outputData = JSON.stringify(this.toJson(), null, 2);

      await fs.writeFile(this.sourcePath + BackupExtension, outputData);
      await fs.rename(this.sourcePath + BackupExtension, this.sourcePath);

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
