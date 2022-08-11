import { run } from 'cmd-ts';
import { cmd } from './commands/index.js';
import { Tracer } from './tracer.js';

Tracer.run(() => run(cmd, process.argv.slice(2)));
