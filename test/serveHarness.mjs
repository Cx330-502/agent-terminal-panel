import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root = process.cwd();
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  const file = resolve(root, `.${pathname}`);
  if (file !== root && !file.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Not a file');
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

server.listen(4173, '127.0.0.1', () => {
  console.log('Harness server listening on http://127.0.0.1:4173');
});
