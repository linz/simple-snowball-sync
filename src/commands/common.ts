import { boolean, option, flag, optional, positional, string } from 'cmd-ts';

export const verbose = flag({
  long: 'verbose',
  type: boolean,
  defaultValue: () => false,
  description: 'Verbose logging',
});
export const endpoint = option({ long: 'endpoint', type: optional(string), description: 'S3 endpoint to use' });
export const manifest = positional({ type: string, displayName: 'MANIFEST', description: 'Manifest file location' });
export const target = option({ long: 'target', description: 'S3 location to store files' });
