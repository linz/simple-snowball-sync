import Command, { flags } from '@oclif/command';
import { logger } from '../log';
import { createReadStream, promises as fs } from 'fs';
import { Manifest } from '../manifest';
import pLimit from 'p-limit';
import * as path from 'path';
import S3 from 'aws-sdk/clients/s3';

let client: S3;

function headObject(ctx: { Bucket: string; Key: string }): Promise<S3.HeadObjectOutput | false> {
  return client
    .headObject(ctx)
    .promise()
    .catch((e) => {
      if (e.code === 'NotFound') return false;
      throw e;
    });
}

async function findMostRecentUpload(
  mani: Manifest,
  bucket: string,
  prefix: string[],
  checkRange: number,
): Promise<number> {
  let foundUploaded = -1;
  let foundNotUploaded = -1;
  let count = 0;
  let low = 0;
  let high = mani.files.length;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    const file = mani.files[mid];
    const ctx = {
      Bucket: bucket,
      Key: path.join(...prefix, file.path),
    };

    const found = await headObject(ctx);
    if (found) {
      if (mid > foundUploaded) foundUploaded = mid;
      low = mid + 1;
    } else {
      if (mid < foundNotUploaded || foundNotUploaded === -1) foundNotUploaded = mid;
      high = mid - 1;
    }

    logger.info(
      { index: mid, path: ctx.Key, exists: found !== false, foundUploaded, foundNotUploaded, low, high },
      'LastUpload:Search',
    );
    count++;
    if (count > 10) break;
  }
  if (foundUploaded < 0) return 0;
  for (let i = foundUploaded - checkRange; i < foundNotUploaded + checkRange; i++) {
    const file = mani.files[i];
    const ctx = {
      Bucket: bucket,
      Key: path.join(...prefix, file.path),
    };
    const head = await headObject(ctx);
    logger.debug(
      { index: i, path: ctx.Key, exists: head !== true, sizeS3: head && head.ContentLength, sizeLocal: file.size },
      'LastUpload:SearchForComplete',
    );

    if (head === false) return i;
    if (head.ContentLength !== file.size) return i;
  }
  throw new Error('Failed');
}

export class SnowballSync extends Command {
  static flags = {
    target: flags.string({ description: 's3 location to store files' }),
    endpoint: flags.string({ description: 'snowball endpoint', required: true }),
    concurrency: flags.integer({ description: 'Number of upload threads to run', default: 5 }),
    verbose: flags.boolean({ description: 'verbose logging' }),
    limit: flags.integer({ description: 'Only ingest this many files' }),
  };

  static args = [{ name: 'inputFile', required: true }];
  async run(): Promise<void> {
    const { args, flags } = this.parse(SnowballSync);
    if (flags.verbose) logger.level = 'debug';

    if (!flags.target?.startsWith('s3://')) throw new Error('--target must be in the format s3://bucket/prefix');

    const [bucket, ...prefix] = flags.target.slice(5).split('/');

    const queue = pLimit(flags.concurrency);

    let endpoint = flags.endpoint;
    if (!endpoint.startsWith('http')) endpoint = 'http://' + endpoint + ':8080';
    logger.info({ endpoint }, 'SettingS3 Endpoint');
    client = new S3({ endpoint, s3ForcePathStyle: true });

    if (!args.inputFile.endsWith('.json')) throw new Error('InputFile must be a json file');

    const mani = JSON.parse((await fs.readFile(args.inputFile)).toString()) as Manifest;

    let count = 0;
    let size = 0;
    let lastSize = 0;
    let promises = [];
    let lastFile = '';

    const startIndex = await findMostRecentUpload(mani, bucket, prefix, flags.concurrency);

    const logInterval = setInterval(() => {
      const mbMoved = ((size - lastSize) / 1024 / 1024).toFixed(2);
      lastSize = size;
      const percent = ((count / mani.files.length) * 100).toFixed(2);
      logger.info({ count, percent, transferred: mbMoved, lastFile }, 'UploadProgress');
    }, 2500);
    logInterval.unref();

    logger.info({ startOffset: startIndex, files: mani.files.length }, 'Upload:Start');
    for (let index = startIndex; index < mani.files.length; index++) {
      const file = mani.files[index];
      const p = queue(async () => {
        count++;
        size += file.size;
        lastFile = file.path;

        const uploadCtx = {
          Bucket: bucket,
          Key: path.join(...prefix, file.path),
          Body: createReadStream(path.join(mani.path, file.path)),
        };

        logger.debug(
          { index, path: file.path, size: file.size, target: `s3://${bucket}/${uploadCtx.Key}` },
          'Upload:Start',
        );
        await client.upload(uploadCtx).promise();
        // await new Promise(resolve => setTimeout(resolve, 100))
      });

      promises.push(p);
      if (promises.length > 250) {
        await Promise.all(promises);
        promises = [];
      }
    }

    await Promise.all(promises);
  }
}
