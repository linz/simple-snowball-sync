import { S3 } from 'aws-sdk';
import { PutObjectRequest } from 'aws-sdk/clients/s3';
import { ErrorList } from './error.list';

const OneMb = 1024 * 1024;

const S3UploadOptions = {
  /**
   * Force chunks to be at least 105 Mb,
   * lots of small chunks (<100Mb) take too long to transfer on high speed networks
   */
  partSize: 105 * OneMb,
};

export const BackOff = {
  /** Number of upload retries */
  count: 3,
  /** Back off time in ms */
  time: 500,
};

/**
 * Upload a file to an S3 bucket.
 * AWS specific.
 *
 * @param client
 * @param uploadCtx
 * @param retries
 */
export async function uploadFile(client: S3, uploadCtx: PutObjectRequest): Promise<void> {
  const uploadErrors: Error[] = [];
  while (uploadErrors.length < BackOff.count) {
    try {
      await client.upload(uploadCtx, S3UploadOptions).promise();
      return;
    } catch (e) {
      // Sleep for back off
      await new Promise((resolve) => setTimeout(resolve, BackOff.time * (uploadErrors.length + 1), {}));
      uploadErrors.push(e);
      if (uploadErrors.length === BackOff.count) {
        break;
      }
    }
  }
  throw new ErrorList('UploadRetriesFailed', uploadErrors);
}
