import { subcommands } from 'cmd-ts';
import { getVersion } from '../version.js';
import { commandHash } from './hash.js';
import { commandManifest } from './manifest.js';
import { commandSync } from './sync.js';
import { commandValidate } from './validate.js';

export const cmd = subcommands({
  name: 'sss',
  description: 'Simple snowball sync - Sync files to S3/Snowball',
  version: getVersion().version ?? 'unknown',
  cmds: { hash: commandHash, manifest: commandManifest, sync: commandSync, validate: commandValidate },
});
