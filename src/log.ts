import { STS } from 'aws-sdk';
import pino from 'pino';
import { PrettyTransform } from 'pretty-json-log';
import { PassThrough } from 'stream';
import { ulid } from 'ulid';
import { CloudWatchStream } from './cloudwatch.logs';
import { getVersion } from './version';

const outputStream = new PassThrough();
const LogId = ulid();

export const cloudWatchStream = new CloudWatchStream(outputStream, { logStream: LogId });
const logger = pino(outputStream).child({});
export type LogType = typeof logger;

const sts = new STS();
/** Load the AWS User */
async function getCaller(): Promise<{ userId?: string; accountId?: string } | undefined> {
  try {
    const ret = await sts.getCallerIdentity().promise();
    return { userId: ret.UserId, accountId: ret.Account };
  } catch (e) {
    return;
  }
}
export async function setupLogger(cmd: string, flags: { verbose: boolean }): Promise<LogType> {
  // If we are pretty logging use the prettier to restrict what is shown to the user with the rest of the logs being shipped to cloudwatch
  if (process.stdout.isTTY) {
    const prettyTransform = new PrettyTransform();
    prettyTransform.pretty.level = flags.verbose ? 10 : 30;
    outputStream.pipe(PrettyTransform.stream(process.stdout, prettyTransform));
    logger.level = 'trace';
  } else {
    if (flags.verbose) logger.level = 'trace';
  }

  const log = logger.child({ id: LogId });

  const caller = await getCaller();
  log.info({ command: { package: '@linzjs/simple-snowball-sync', cmd, ...getVersion() }, ...caller }, 'Command:Start');
  return log;
}
