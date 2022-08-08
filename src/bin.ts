import { run } from 'cmd-ts';
import { cmd } from './commands/index';

run(cmd, process.argv.slice(2));
