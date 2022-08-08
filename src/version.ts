import * as fs from 'fs';
import { join } from 'path';

function getGitHash(): string | null {
  const path = join(__dirname, '..', '.git', 'HEAD');
  if (!fs.existsSync(path)) return null;
  const rev = fs.readFileSync(path).toString().trim();
  if (rev.indexOf(':') === -1) return rev;
  return fs
    .readFileSync(join(__dirname, '..', '.git', rev.substring(5)))
    .toString()
    .trim();
}

function getPackageJson(): string | null {
  const path = join(__dirname, '..', 'package.json');
  if (fs.existsSync(path)) return JSON.parse(fs.readFileSync(path).toString()).version;
  return null;
}

let _version: { hash: string | null; version: string | null } | null;
export function getVersion(): { hash: string | null; version: string | null } {
  if (_version == null) _version = { hash: getGitHash(), version: getPackageJson() };
  return _version;
}
