import { createHash } from 'crypto';
import { createReadStream } from 'fs';

export async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(`sha256-${hash.digest('base64')}`));
    stream.on('error', (err) => reject(err));
  });
}
