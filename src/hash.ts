import { createHash } from 'crypto';
import { Readable } from 'stream';

export async function hashFile(stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(`sha256-${hash.digest('base64')}`));
    stream.on('error', (err) => reject(err));
  });
}
