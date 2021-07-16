import { fsa } from '@linzjs/s3fs';
import { LogType } from './log';
import { ManifestFile } from './manifest';

export type BucketKey = { key: string; bucket: string };

async function findUploaded(files: ManifestFile[], target: string, checkRange = 5, logger: LogType): Promise<number> {
  let foundUploaded = -1;
  let foundNotUploaded = -1;
  let count = 0;
  let low = 0;
  let high = files.length - 1;
  // Double the range to be slightly safer
  checkRange = checkRange * 2;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    const file = files[mid];

    const filePath = fsa.join(target, file.path);
    const found = await fsa.exists(filePath);
    const exists = found !== false;
    if (exists) {
      if (mid > foundUploaded) foundUploaded = mid;
      low = mid + 1;
    } else {
      if (mid < foundNotUploaded || foundNotUploaded === -1) foundNotUploaded = mid;
      high = mid - 1;
    }

    logger.info(
      { index: mid, path: filePath, exists, foundUploaded, foundNotUploaded, low, high },
      'LastUpload:Search',
    );
    count++;
    if (count > 50) break;
  }

  if (foundNotUploaded < 0) return files.length;
  if (foundUploaded < 0) return 0;
  const startIndex = Math.max(0, foundUploaded - checkRange);
  const endIndex = Math.min(foundNotUploaded + checkRange, files.length);
  for (let i = startIndex; i < endIndex; i++) {
    const file = files[i];
    const filePath = fsa.join(target, file.path);
    const fileFound = await fsa.head(filePath);

    logger.debug(
      {
        index: i,
        path: filePath,
        exists: fileFound != null,
        sizeS3: fileFound?.size,
        sizeLocal: file.size,
      },
      'LastUpload:SearchForComplete',
    );

    if (fileFound == null) return i;
    if (fileFound.size !== file.size) return i;
  }
  throw new Error('Failed');
}

export const s3Util = {
  findUploaded,
};
