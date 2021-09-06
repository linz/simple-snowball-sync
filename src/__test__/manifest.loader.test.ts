import o from 'ospec';
import { Manifest } from '../manifest';
import { isManifestsDifferent, ManifestLoader } from '../manifest.loader';

o.spec('ManifestLoader', () => {
  // Common test data (some manifests are used in different tests)

  const manifestA = createManifest([
    { path: 'RGBi Imagery/RGBI_Canterbury 0.3m Rural Aerial Photos (2015-16)/RGBI_BX16_5K_0607.tif' },
  ]);

  const manifestB = createManifest([{ path: 'RGBi_otago_rural_2017-2019_0.3m/2018_BZ13_5000_0901.tif' }]);

  const manifestC = createManifest([
    { path: 'RGBi_otago_rural_2017-2019_0.3m/2018_BZ13_5000_0901.tif' },
    { path: 'RGBi_otago_rural_2017-2019_0.3m/2018_BZ13_5000_0902.tif' },
  ]);

  const manifestD = createManifest([{ path: 'RGBi_otago_rural_2017-2019_0.3m/2018_BZ13_5000_0901.tif', size: 123 }]);

  const manifestE = createManifest([
    { path: 'RGBi_otago_rural_2017-2019_0.3m/2018_BZ13_5000_0901.tif', size: 123, hash: 'abc' },
  ]);

  const manifestF = createManifest([
    { path: 'RGBi_otago_rural_2017-2019_0.3m/2018_BZ13_5000_0901.tif', size: 123, hash: 'empty' },
  ]);

  const manifestALoaded: ManifestLoader = new ManifestLoader(manifestA.path, manifestA);
  const manifestBLoaded: ManifestLoader = new ManifestLoader(manifestB.path, manifestB);
  const manifestCLoaded: ManifestLoader = new ManifestLoader(manifestC.path, manifestC);
  const manifestDLoaded: ManifestLoader = new ManifestLoader(manifestD.path, manifestD);
  const manifestELoaded: ManifestLoader = new ManifestLoader(manifestE.path, manifestE);
  const manifestFLoaded: ManifestLoader = new ManifestLoader(manifestF.path, manifestF);

  o('should return true because manifests are different', async () => {
    o(await isManifestsDifferent(manifestALoaded, manifestBLoaded)).equals(true);
  });

  o('should return false because both manifest are the same', async () => {
    o(await isManifestsDifferent(manifestALoaded, manifestALoaded)).equals(false);
  });

  o('should return false because manifestC only contains additional data', async () => {
    o(await isManifestsDifferent(manifestCLoaded, manifestBLoaded)).equals(false);
  });

  o('should return true because manifest D contains same file name than B but size is different', async () => {
    o(await isManifestsDifferent(manifestBLoaded, manifestDLoaded)).equals(true);
  });

  o('should return true because manifest E contains same file name than D but hash is different', async () => {
    o(await isManifestsDifferent(manifestDLoaded, manifestELoaded)).equals(true);
  });

  o('should return false even if file hash in manifestF is undefined (simulated by "empty")', async () => {
    o(await isManifestsDifferent(manifestFLoaded, manifestELoaded)).equals(false);
  });
});

function createManifest(files: { path: string; size?: number; hash?: string }[]): Manifest {
  const filesList: { path: string; size: number; hash?: string }[] = [];

  files.forEach((file) => {
    let currentSize = file.path.length;
    if (file.size) currentSize = file.size;
    let currentHash;
    if (file.hash === 'empty') {
      currentHash = undefined;
    } else if (file.hash) {
      currentHash = file.hash;
    } else {
      currentHash = file.path;
    }
    filesList.push({ path: file.path, size: currentSize, hash: currentHash });
  });

  return {
    path: '/media/paul/RGBi1',
    size: 12141773487666,
    files: filesList,
  };
}
