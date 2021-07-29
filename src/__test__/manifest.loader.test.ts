import o from 'ospec';
import { Manifest } from '../manifest';
import { isManifestsDifferent, ManifestLoader } from '../manifest.loader';

o.spec('ManifestLoader', () => {
  const manifestA: Manifest = JSON.parse(
    `{
    "path": "/media/paul/RGBi1",
    "size": 12141773487666,
    "files": [
      {
        "path": "RGBi Imagery/RGBI_Canterbury 0.3m Rural Aerial Photos (2015-16)/RGBI_BX16_5K_0607.tif",
        "size": 384096570,
        "hash": "sha256-BT9aW9cqFR0P3rTknVjHDjPPPuVucu68RdEqEbMQ2L4="
      }
  ]
  }`,
  );

  const manifestB: Manifest = JSON.parse(
    `{
        "path": "/media/paul/Backup Plus",
        "size": 4324872183643,
        "files": [
        {
            "path": "RGBi_otago_rural_2017-2019_0.3m/2018_BZ13_5000_0901.tif",
            "size": 384096489,
            "hash": "sha256-HijtEqFOIZsy5GHIl+1cu67ap6Sj4Xrv46kUW7PFcf0="
        }
       ]
      }`,
  );

  const manifestALoaded: ManifestLoader = new ManifestLoader(manifestA.path, manifestA);
  const manifestBLoaded: ManifestLoader = new ManifestLoader(manifestB.path, manifestB);

  o('should return true because manifests are different', async () => {
    o(isManifestsDifferent(manifestALoaded, manifestBLoaded)).equals(true);
  });

  o('should return false because both manifest are the same', async () => {
    o(isManifestsDifferent(manifestALoaded, manifestALoaded)).equals(false);
  });
});
