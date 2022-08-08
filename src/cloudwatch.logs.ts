import { CloudWatchLogs } from 'aws-sdk';
import { createInterface, Interface } from 'readline';
import { Readable } from 'stream';

const region = process.env['AWS_REGION'] ?? process.env['AWS_DEFAULT_REGION'] ?? 'ap-southeast-2';

export class CloudWatchStream {
  stream: Readable;
  rl: Interface;
  sendTimeout: NodeJS.Timeout | null;
  client: CloudWatchLogs;

  logs: { message: string; timestamp: number }[] = [];
  logsSize = 0;
  isFailed = false;
  isInit = false;
  logGroupName: string;
  logStream: string;

  constructor(stream: Readable, opt: { logGroupName?: string; logStream: string }) {
    this.stream = stream;
    this.rl = createInterface({ input: stream });
    this.rl.on('line', this.process);
    this.logGroupName = opt.logGroupName ?? '/cli/simple-snowball-sync';
    this.logStream = opt.logStream;
    this.client = new CloudWatchLogs({ region });
  }

  process = (line: string): void => {
    this.logs.push({ timestamp: Date.now(), message: line });
    this.logsSize += line.length;
    // Force a send if over 64KB
    if (this.logsSize > 64 * 1024) this.flush();
    else if (this.sendTimeout == null) this.sendTimeout = setTimeout(this.flush, 5000);
  };

  _initPromise: Promise<void> | null = null;
  /** Create a logGroup */
  init(): Promise<void> {
    if (this._initPromise) return this._initPromise;
    this._initPromise = new Promise(async (resolve) => {
      try {
        await this.client.createLogGroup({ logGroupName: this.logGroupName }).promise();
      } catch (e: any) {
        if (e.code !== 'ResourceAlreadyExistsException') {
          this.fail(e);
          return resolve();
        }
      }

      try {
        await this.client.createLogStream({ logGroupName: this.logGroupName, logStreamName: this.logStream }).promise();
      } catch (e) {
        this.fail(e);
      }

      resolve();
    });
    return this._initPromise;
  }

  /** Something went wrong log a error and stop processing logs*/
  private fail(err: unknown): void {
    this.isFailed = true;
    console.error({ err }, 'CloudWatch:Failed');
    if (this.sendTimeout) clearTimeout(this.sendTimeout);
    this.rl.off('line', this.process);
  }

  /** Limit the flush to a single push */
  _flush = Promise.resolve();
  _nextToken: string | undefined;

  private putLogs = async (): Promise<void> => {
    await this.init();
    const logs = this.logs;
    this.logs = [];
    this.logsSize = 0;
    if (this.isFailed) return;

    try {
      if (this._nextToken) {
        const ls = await this.client
          .describeLogStreams({ logGroupName: this.logGroupName, logStreamNamePrefix: this.logStream })
          .promise();
        if (ls.logStreams == null || ls.logStreams.length === 0) {
          throw new Error(`Failed to find LogStream: ${this.logGroupName}/${this.logStream}`);
        }
        this._nextToken = ls.logStreams[0].uploadSequenceToken;
        if (this._nextToken == null) {
          throw new Error(`Failed to find LogStream: ${this.logGroupName}/${this.logStream}`);
        }
      }

      const ret = await this.client
        .putLogEvents({
          logEvents: logs,
          logGroupName: this.logGroupName,
          logStreamName: this.logStream,
          sequenceToken: this._nextToken,
        })
        .promise();
      this._nextToken = ret.nextSequenceToken;
    } catch (e: any) {
      if (e.code === 'InvalidSequenceTokenException') {
        this._nextToken = e.expectedSequenceToken;
      } else {
        this.fail(e);
      }
    }
  };

  flush = (): Promise<void> => {
    if (this.isFailed) return Promise.resolve();
    if (this.sendTimeout) clearTimeout(this.sendTimeout);
    this.sendTimeout = null;
    this._flush = this._flush.then(this.putLogs);
    return this._flush;
  };
}
