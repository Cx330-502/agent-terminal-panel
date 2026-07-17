import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import test from 'node:test';
import { LinuxNetworkProbe } from '../src/communication/linuxNetworkProbe';

test('Linux process probe observes bytes on a real child TCP socket', async (t) => {
  if (process.platform !== 'linux') return t.skip('Linux ss integration only');
  const server = createServer((socket) => {
    socket.on('data', () => socket.write(Buffer.alloc(8192, 7)));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  assert(address && typeof address !== 'string');

  const child = spawn(
    process.execPath,
    [
      '-e',
      `const net=require('node:net');const s=net.connect(${address.port},'127.0.0.1',()=>s.write(Buffer.alloc(4096,3)));s.on('data',()=>setTimeout(()=>{},5000));`
    ],
    { stdio: 'ignore' }
  );
  t.after(() => child.kill());
  assert(child.pid);
  await new Promise((resolve) => setTimeout(resolve, 120));

  const sample = (await new LinuxNetworkProbe().sample(new Map([['session', child.pid]]))).get(
    'session'
  );
  if (sample?.error?.includes('ENOENT')) return t.skip('ss is not installed');
  assert.equal(sample?.available, true);
  assert.equal(sample?.loopback, true);
  assert((sample?.sockets[0]?.sentBytes ?? 0) > 0);
  assert((sample?.sockets[0]?.receivedBytes ?? 0) > 0);
});
