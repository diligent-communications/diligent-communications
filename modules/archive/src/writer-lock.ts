import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { platform } from 'node:os';
import { systemFailure } from './files.ts';

type Lock =
  | { outcome: 'locked'; close: () => Promise<void> }
  | { outcome: 'archive-in-use' }
  | { outcome: 'lock-unavailable'; detail: string };

// The OS drops the named pipe or abstract socket when the writer dies.
export async function takeWriterLock(archiveId: string): Promise<Lock> {
  const name = 'diligent-archive-' + createHash('sha256').update(archiveId).digest('hex');
  const system = platform();
  let endpoint: string;
  if (system === 'win32') {
    endpoint = '\\\\?\\pipe\\' + name;
  } else if (system === 'linux') {
    endpoint = '\0' + name;
  } else {
    return { outcome: 'lock-unavailable', detail: 'no supported local endpoint on this system' };
  }

  const server = createServer((socket) => socket.destroy());
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen({ path: endpoint, exclusive: true }, () => {
        server.off('error', reject);
        resolve();
      });
    });
  } catch (error) {
    const code = systemFailure(error);
    return code === 'EADDRINUSE' ? { outcome: 'archive-in-use' } :
      { outcome: 'lock-unavailable', detail: code };
  }
  return { outcome: 'locked', close: () => new Promise<void>((resolve, reject) => {
    server.close((error) => { if (error) reject(error); else resolve(); });
  }) };
}
