import { fsa, FsS3 } from '@linzjs/s3fs';
import S3 from 'aws-sdk/clients/s3';
import { logger, LogType } from './log';
import * as path from 'path';
import * as os from 'os';
import * as AWS from 'aws-sdk';

FsS3.MaxListCount = 1_000; // Some folders are very large

export async function registerSnowball(
  flags: { target?: string; endpoint?: string; verbose?: boolean },
  log: LogType,
): Promise<S3> {
  if (flags.verbose) logger.level = 'debug';

  let endpoint = flags.endpoint;
  if (endpoint != null && !endpoint.startsWith('http')) endpoint = 'http://' + endpoint + ':8080';

  const client = endpoint ? new S3({ endpoint, s3ForcePathStyle: true, computeChecksums: true }) : new S3();
  if (flags.target) {
    fsa.register('s3://', new FsS3(new S3()));
    if (endpoint != null) fsa.register(flags.target, new FsS3(client));
  } else {
    fsa.register('s3://', new FsS3(client));
  }

  await registerBuckets(log);
  return client;
}

function tryParseJson(x: string | Buffer): unknown | null {
  try {
    return JSON.parse(x.toString());
  } catch (e) {
    return null;
  }
}

const configPath = path.join(os.homedir(), '.aws', 'fsa.json');
async function registerBuckets(log: LogType): Promise<void> {
  const fileExists = await fsa.exists(configPath);
  if (!fileExists) return;
  const config = tryParseJson(await fsa.read(configPath));
  if (typeof config !== 'object' || config == null) return;

  for (const [prefix, obj] of Object.entries(config)) {
    if (!prefix.startsWith('s3://')) {
      log.debug({ prefix }, 'FsaConfig:InvalidPrefix - Missing s3://');
      continue;
    }
    if (obj.roleArn == null) {
      log.debug({ prefix, cfg: obj }, 'FsaConfig:InvalidConfig - Missing "roleArn"');
      continue;
    }
    const sourceCredentials =
      obj.source === 'Ec2InstanceMetadata'
        ? new AWS.EC2MetadataCredentials()
        : new AWS.SharedIniFileCredentials({ profile: obj.source ?? process.env.AWS_PROFILE });

    const credentials = new AWS.ChainableTemporaryCredentials({
      params: { RoleArn: obj.roleArn, RoleSessionName: 'fsa-' + Math.random().toString(32) + '-' + Date.now() },
      masterCredentials: sourceCredentials,
    });

    log.debug({ prefix, source: obj.source, roleArn: obj.roleArn }, 'RegisterS3');
    fsa.register(prefix, new FsS3(new S3({ credentials })));
  }
}
