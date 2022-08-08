import { STS } from 'aws-sdk';
import pino from 'pino';
import { PrettyTransform } from 'pretty-json-log';
import { PassThrough } from 'stream';
import { ulid } from 'ulid';
import { CloudWatchStream } from './cloudwatch.logs';
import { getVersion } from './version';

const outputStream = new PassThrough();
const LogId = ulid();

if (process.stdout.isTTY) outputStream.pipe(PrettyTransform.stream());
export const cloudWatchStream = new CloudWatchStream(outputStream, { logStream: LogId });
const logger = pino(outputStream).child({});
export type LogType = typeof logger;

const sts = new STS();
/** Load the AWS User */
async function getCaller(): Promise<string | undefined> {
  try {
    const ret = await sts.getCallerIdentity().promise();
    return ret.UserId;
  } catch (e) {
    return;
  }
}
export async function setupLogger(cmd: string, flags: { verbose: boolean }): Promise<LogType> {
  if (flags.verbose) logger.level = 'trace';
  console.log('SetupLogger', cmd);

  const log = logger.child({ id: LogId });

  const user = await getCaller();

  log.info({ command: { package: '@linzjs/simple-snowball-sync', cmd, ...getVersion() }, user }, 'Command:Start');
  return log;
}
