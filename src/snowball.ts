import { fsa, FsS3 } from '@linzjs/s3fs';
import { flags } from '@oclif/command';
import S3 from 'aws-sdk/clients/s3';
import { logger } from './log';

export const SnowballArgs = {
  verbose: flags.boolean({ description: 'Verbose logging' }),
  target: flags.string({ description: 'S3 location to store files' }),
  endpoint: flags.string({ description: 'Snowball endpoint' }),
};

export function registerSnowball(flags: { target?: string; endpoint?: string; verbose?: boolean }): S3 {
  if (flags.verbose) logger.level = 'debug';

  let endpoint = flags.endpoint;
  if (endpoint != null && !endpoint.startsWith('http')) endpoint = 'http://' + endpoint + ':8080';

  const client = endpoint ? new S3({ endpoint, s3ForcePathStyle: true, computeChecksums: true }) : new S3();
  if (flags.target) {
    fsa.register('s3://', new FsS3(new S3()));
    fsa.register(flags.target, new FsS3(client));
  } else {
    fsa.register('s3://', new FsS3(client));
  }
  return client;
}
