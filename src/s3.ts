import path from 'path';
import { ManifestFile } from './manifest';
import type S3 from 'aws-sdk/clients/s3';
import { LogType } from './log';

export type BucketKey = { key: string; bucket: string };

function parse(uri?: string): BucketKey | null {
  if (uri == null || !uri.startsWith('s3://')) return null;

  const parts = uri.split('/');
  const bucket = parts[2];
  if (bucket == null || bucket.trim() === '') return null;
  const key = parts.slice(3).join('/');
  if (key == null || key.trim() === '') return null;
  return { key, bucket };
}

const CheckRange = 5;
async function findUploaded(client: S3, files: ManifestFile[], target: BucketKey, logger: LogType): Promise<number> {
  let foundUploaded = -1;
  let foundNotUploaded = -1;
  let count = 0;
  let low = 0;
  let high = files.length - 1;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    const file = files[mid];
    const ctx = {
      Bucket: target.bucket,
      Key: path.join(target.key, file.path),
    };

    const found = await headObject(client, ctx);
    const exists = found !== false;
    if (exists) {
      if (mid > foundUploaded) foundUploaded = mid;
      low = mid + 1;
    } else {
      if (mid < foundNotUploaded || foundNotUploaded === -1) foundNotUploaded = mid;
      high = mid - 1;
    }

    logger.info({ index: mid, path: ctx.Key, exists, foundUploaded, foundNotUploaded, low, high }, 'LastUpload:Search');
    count++;
    if (count > 50) break;
  }

  if (foundNotUploaded < 0) return files.length;
  if (foundUploaded < 0) return 0;
  const startIndex = Math.max(0, foundUploaded - CheckRange);
  const endIndex = Math.min(foundNotUploaded + CheckRange, files.length);
  for (let i = startIndex; i < endIndex; i++) {
    const file = files[i];
    const ctx = { Bucket: target.bucket, Key: path.join(target.key, file.path) };
    const head = await headObject(client, ctx);
    logger.debug(
      { index: i, path: ctx.Key, exists: head !== true, sizeS3: head && head.ContentLength, sizeLocal: file.size },
      'LastUpload:SearchForComplete',
    );

    if (head === false) return i;
    if (head.ContentLength !== file.size) return i;
  }
  throw new Error('Failed');
}

function headObject(client: S3, ctx: { Bucket: string; Key: string }): Promise<S3.HeadObjectOutput | false> {
  return client
    .headObject(ctx)
    .promise()
    .catch((e) => {
      if (e.code === 'NotFound') return false;
      throw e;
    });
}

export const s3Util = {
  parse,
  head: headObject,
  findUploaded,
};
