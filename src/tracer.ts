import otel, { Span } from '@opentelemetry/api';
import S3 from 'aws-sdk/clients/s3.js';
import STS from 'aws-sdk/clients/sts.js';
import apm from 'elastic-apm-node';
import { CloudWatchStream } from './cloudwatch.logs.js';
import { CliId, logger, outputStream } from './log.js';
import { getVersion } from './version.js';

const sts = new STS();
const s3 = new S3();

const TelemetryKey = 'telemetry.json';

export interface StsCallerId {
  accountId?: string;
  userId?: string;
}

const isAwsDisabled = process.env['AWS_PROFILE'] == null;
const isTelemetryDisabled = process.env['TELEMETRY_DISABLED'] != null;
export const ot = { trace: otel.trace, context: otel.context };
class AwsTraceControl {
  agent?: apm.Agent;
  tracer = ot.trace.getTracer('@linzjs/simple-snowball-sync', getVersion().version ?? 'unknown');
  rootSpan?: Span;
  logs: CloudWatchStream;
  isStarted = false;

  private async setup(): Promise<void> {
    if (isAwsDisabled) return logger.warn('$AWS_PROFILE is empty, skipping trace');
    if (isTelemetryDisabled) return logger.warn('$TELEMETRY_DISABLED is set, skipping trace');

    this.logs = new CloudWatchStream(outputStream, { logStream: CliId });

    const telemetryConfig = await s3
      .getObject({ Bucket: 'linz-bucket-config', Key: TelemetryKey })
      .promise()
      .catch(() => null);

    const param = telemetryConfig?.Body?.toString();
    if (param == null) return logger.warn({ key: TelemetryKey }, 'Telemetry Configuration missing, skipping trace');

    const cfg = JSON.parse(param);
    if (cfg.TelemetryEndpoint == null) return logger.warn('${TelemetryKey}.TelemetryEndpoint missing, skipping trace');
    if (cfg.TelemetryToken == null) return logger.warn('${TelemetryKey}.TelemetryToken missing, skipping trace');

    this.agent = await apm.start({
      serviceName: 'linzjs-simple-snowball-sync',
      serviceVersion: getVersion().version ?? 'unknown',
      serverUrl: cfg.TelemetryEndpoint,
      secretToken: cfg.TelemetryToken,
      ...({ opentelemetryBridgeEnabled: true } as any), // TODO typing doesnt allow ot bridge??
    });

    process.on('SIGINT', async () => {
      logger.info('Ctrl+C Shutting down');
      if (this.rootSpan) {
        this.rootSpan.setAttribute('interrupted', true);
        this.rootSpan.end();
      }
      await this.shutdown();
      process.exit();
    });
    this.isStarted = true;
    logger.debug('Telemetry:Setup:Done');
  }

  /** Start a root span that traces */
  startRootSpan<T>(name: string, cb: (s: Span) => Promise<T>): Promise<T> {
    if (this.rootSpan) throw new Error('Duplicate root span');
    logger.info(
      { command: { package: '@linzjs/simple-snowball-sync', cmd: 'hash', ...getVersion() } },
      'Command:Start',
    );

    return this.tracer.startActiveSpan(name, async (span) => {
      this.rootSpan = span;
      try {
        return await cb(span);
      } catch (e) {
        throw e;
      } finally {
        this.rootSpan.end();
      }
    });
  }

  /** Start a span off from the top level span if it exists */
  startSpan(name: string): Span {
    if (this.rootSpan == null) return this.tracer.startSpan(name);
    return this.tracer.startSpan(name, undefined, ot.trace.setSpan(ot.context.active(), this.rootSpan));
  }

  _callerId: Promise<StsCallerId | null> | null;
  get callerId(): Promise<StsCallerId | null> {
    if (isAwsDisabled) return Promise.resolve(null);
    if (this._callerId == null) {
      const span = this.startSpan('aws:get-caller-id');
      this._callerId = sts
        .getCallerIdentity()
        .promise()
        .then((f) => {
          span.setAttribute('accountId', f.Account ?? 'unknown');
          span.setAttribute('userId', f.UserId ?? 'unknown');
          return { accountId: f.Account, userId: f.UserId };
        })
        .catch((e) => {
          span.recordException(e);
          return null;
        })
        .finally(() => span.end());
    }
    return this._callerId;
  }

  _shutdown: Promise<void> | null = null;
  private shutdown(): Promise<void> {
    if (this._shutdown == null) {
      this._shutdown = (async (): Promise<void> => {
        if (this.logs != null) await this.logs.shutdown();
        if (this.agent != null) {
          await new Promise((r) => this.agent?.flush(r));
          this.agent.destroy();
        }
      })();
    }
    return this._shutdown;
  }

  async run(cb: () => Promise<unknown>): Promise<void> {
    await this.setup();
    try {
      await cb();
    } catch (e: any) {
      if (this.rootSpan) this.rootSpan.recordException(e);
      logger.fatal({ err: e }, 'Command:Failed');
    } finally {
      logger.trace('Telemetry:Sync');
      if (this.rootSpan) {
        const callerId = await this.callerId;
        if (callerId) {
          if (callerId.userId) this.rootSpan.setAttribute('userId', callerId.userId);
          if (callerId.accountId) this.rootSpan.setAttribute('accountId', callerId.accountId);
        }
        this.rootSpan.end();
      }
      await this.shutdown();
      logger.debug('Telemetry:Sync:Done');
    }
  }
}

export const Tracer = new AwsTraceControl();
