import { subcommands } from 'cmd-ts';
import { getVersion } from '../version';
import { commandHash } from './hash';
import { commandManifest } from './manifest';
import { commandSync } from './sync';
import { commandValidate } from './validate';

export const cmd = subcommands({
  name: 'sss',
  description: 'Simple snowball sync - Sync files to S3/Snowball',
  version: getVersion().version ?? 'unknown',
  cmds: { hash: commandHash, manifest: commandManifest, sync: commandSync, validate: commandValidate },
});
