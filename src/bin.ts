import { run } from 'cmd-ts';
import { cmd } from './commands/index';
import { cloudWatchStream } from './log';

run(cmd, process.argv.slice(2)).finally(() => cloudWatchStream.flush());
