export interface Manifest {
  path: string;
  size: number;
  correlationId?: string;
  files: ManifestFile[];
}

export interface ManifestFile {
  path: string;
  size: number;
  hash?: string;
}
