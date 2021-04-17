export interface Manifest {
  path: string;
  size: number;
  files: ManifestFile[];
}

export interface ManifestFile {
  path: string;
  size: number;
  hash?: string;
}
