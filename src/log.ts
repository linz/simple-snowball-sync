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

export function setupLogger(cmd: string, flags: { verbose: boolean }): LogType {
  if (flags.verbose) logger.level = 'trace';
  console.log('SetupLogger', cmd);

  const log = logger.child({ id: LogId });

  log.info({ command: { package: '@linzjs/simple-snowball-sync', cmd, ...getVersion() } }, 'Command:Start');
  return log;
}
