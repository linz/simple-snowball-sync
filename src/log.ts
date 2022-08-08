import pino from 'pino';
import { PrettyTransform } from 'pretty-json-log';
import { PassThrough } from 'stream';
import { ulid } from 'ulid';
import { CloudWatchStream } from './cloudwatch.logs';

const outputStream = new PassThrough();
const LogId = ulid();

if (process.stdout.isTTY) outputStream.pipe(PrettyTransform.stream());
export const cloudWatchStream = new CloudWatchStream(outputStream, { logStream: LogId });
export const logger = pino(outputStream).child({ id: LogId });
export type LogType = typeof logger;
