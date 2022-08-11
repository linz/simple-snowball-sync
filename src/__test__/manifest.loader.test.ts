import o from 'ospec';
import { Manifest } from '../manifest.js';
import { isManifestsDifferent, ManifestLoader } from '../manifest.loader.js';

o.spec('ManifestLoader', () => {
  const manifestA = createManifest();

  o('should return true because manifests are different', async () => {
    const manifestB: ManifestLoader = createManifest();
    manifestB.files.values().next().value.path = 'folder B/fileZ.tif';
    o(await isManifestsDifferent(manifestA, manifestB)).equals(true);
  });

  o('should return false because both manifest are the same', async () => {
    o(await isManifestsDifferent(manifestA, manifestA)).equals(false);
  });

  o('should return false because B only contains additional data', async () => {
    const manifestB: ManifestLoader = createManifest();
    manifestB.files.set('folder B/fileZ.tif', { path: 'folder B/fileZ.tif', size: 10, hash: 'abc' });
    o(await isManifestsDifferent(manifestB, manifestA)).equals(false);
  });

  o('should return true because manifest B contains same file name than A but size is different', async () => {
    const manifestB: ManifestLoader = createManifest();
    manifestB.files.values().next().value.size = 75;
    o(await isManifestsDifferent(manifestA, manifestB)).equals(true);
  });

  o('should return true because manifest B contains same file name than A but hash is different', async () => {
    const manifestB: ManifestLoader = createManifest();
    manifestB.files.values().next().value.hash = 'def';
    o(await isManifestsDifferent(manifestA, manifestB)).equals(true);
  });

  o('should return false even if file hash in manifestB is null', async () => {
    const manifestB: ManifestLoader = createManifest();
    manifestB.files.values().next().value.hash = null;
    o(await isManifestsDifferent(manifestB, manifestA)).equals(false);
  });
});

function createManifest(): ManifestLoader {
  const manifestData: Manifest = {
    path: '/path/to/files',
    size: 12141773487666,
    files: [{ path: 'folder A/Folder 2/fileA.tif', size: 150, hash: 'abc' }],
  };
  return new ManifestLoader(manifestData.path, manifestData, null as any);
}
