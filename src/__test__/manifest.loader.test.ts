import o from 'ospec';
import { Manifest } from '../manifest';
import { isManifestsDifferent, ManifestLoader } from '../manifest.loader';

o.spec('ManifestLoader', () => {
  // Common test data (some manifests are used in different tests)

  const manifestA: Manifest = {
    path: '/media/paul/RGBi1',
    size: 12141773487666,
    files: [
      {
        path: 'RGBi Imagery/RGBI_Canterbury 0.3m Rural Aerial Photos (2015-16)/RGBI_BX16_5K_0607.tif',
        size: 384096570,
        hash: 'sha256-BT9aW9cqFR0P3rTknVjHDjPPPuVucu68RdEqEbMQ2L4=',
      },
    ],
  };

  const manifestB: Manifest = {
    path: '/media/paul/Backup Plus',
    size: 4324872183643,
    files: [
      {
        path: 'RGBi_otago_rural_2017-2019_0.3m/2018_BZ13_5000_0901.tif',
        size: 384096489,
        hash: 'sha256-HijtEqFOIZsy5GHIl+1cu67ap6Sj4Xrv46kUW7PFcf0=',
      },
    ],
  };

  const manifestC: Manifest = {
    path: '/media/paul/Backup Plus',
    size: 4324872183643,
    files: [
      {
        path: 'RGBi_otago_rural_2017-2019_0.3m/2018_BZ13_5000_0901.tif',
        size: 384096489,
        hash: 'sha256-HijtEqFOIZsy5GHIl+1cu67ap6Sj4Xrv46kUW7PFcf0=',
      },
      {
        path: 'RGBi_otago_rural_2017-2019_0.3m/2018_BZ13_5000_0902.tif',
        size: 124354353456,
        hash: 'sha256-12345456678899654333354546ghhgfhfhdf5654bg5',
      },
    ],
  };

  const manifestD: Manifest = {
    path: '/media/paul/Backup Plus',
    size: 4324872183643,
    files: [
      {
        path: 'RGBi_otago_rural_2017-2019_0.3m/2018_BZ13_5000_0901.tif',
        size: 123,
        hash: 'sha256-HijtEqFOIZsy5GHIl+1cu67ap6Sj4Xrv46kUW7PFcf0=',
      },
    ],
  };

  const manifestE: Manifest = {
    path: '/media/paul/Backup Plus',
    size: 4324872183643,
    files: [
      {
        path: 'RGBi_otago_rural_2017-2019_0.3m/2018_BZ13_5000_0901.tif',
        size: 123,
        hash: 'sha256-HijtEqFOIZsy5GHIl+1cu67ap6Sj4Xrv46kUW7PFcf0=123',
      },
    ],
  };

  const manifestALoaded: ManifestLoader = new ManifestLoader(manifestA.path, manifestA);
  const manifestBLoaded: ManifestLoader = new ManifestLoader(manifestB.path, manifestB);
  const manifestCLoaded: ManifestLoader = new ManifestLoader(manifestC.path, manifestC);
  const manifestDLoaded: ManifestLoader = new ManifestLoader(manifestD.path, manifestD);
  const manifestELoaded: ManifestLoader = new ManifestLoader(manifestE.path, manifestE);

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
});
