// Serves converted model folders over HTTP for local testing (CORS + cross-origin-isolation safe).
// Usage: node tools/serve-models.mjs <folder> [port]
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';

const root = process.argv[2];
const port = Number(process.argv[3] ?? 8788);
if (!root) throw new Error('usage: node tools/serve-models.mjs <folder> [port]');
const types = { '.json': 'application/json', '.onnx': 'application/octet-stream', '.txt': 'text/plain' };

createServer((req, res) => {
  const path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  try {
    if (!path.startsWith(normalize(root)) || !statSync(path).isFile()) throw new Error('nf');
    res.setHeader('Content-Type', types[extname(path)] ?? 'application/octet-stream');
    res.setHeader('Content-Length', statSync(path).size);
    createReadStream(path).pipe(res);
  } catch {
    res.statusCode = 404;
    res.end('not found');
  }
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}/`));
