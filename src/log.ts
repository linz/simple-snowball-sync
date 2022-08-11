import pino from 'pino';
import { PrettyTransform } from 'pretty-json-log';
import { PassThrough } from 'stream';
import { ulid } from 'ulid';

export const outputStream = new PassThrough();
export const CliId = ulid();
const prettyTransform = new PrettyTransform();

export const logger = pino(outputStream).child({ id: CliId });
export type LogType = typeof logger;

if (process.stdout.isTTY) {
  outputStream.pipe(PrettyTransform.stream(process.stdout, prettyTransform));
  // the pretty transform will remove all the trace logs
  logger.level = 'trace';
}

if (process.argv.includes('--verbose')) {
  prettyTransform.pretty.level = 10;
  logger.level = 'trace';
}
