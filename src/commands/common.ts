import { boolean, option, flag, optional, positional, string } from 'cmd-ts';
import { performance } from 'perf_hooks';

export const verbose = flag({
  long: 'verbose',
  type: boolean,
  defaultValue: () => false,
  description: 'Verbose logging',
});
export const endpoint = option({ long: 'endpoint', type: optional(string), description: 'S3 endpoint to use' });
export const manifest = positional({ type: string, displayName: 'MANIFEST', description: 'Manifest file location' });
export const target = option({ long: 'target', description: 'S3 location to store files' });

/** Track ms since a performance.now() call limited to 4dp */
export function msSince(lastTick: number): number {
  return Number((performance.now() - lastTick).toFixed(4));
}
