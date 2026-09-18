const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'public');
const port = Number(process.env.PORT || 3000);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function safePath(urlPath) {
  const clean = decodeURIComponent((urlPath || '/').split('?')[0]);
  const file = clean === '/' ? '/index.html' : clean;
  const resolved = path.normalize(path.join(root, file));
  return resolved.startsWith(root) ? resolved : null;
}

const server = http.createServer((req, res) => {
  const filePath = safePath(req.url);
  if (!filePath) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      fs.readFile(path.join(root, 'index.html'), (fallbackErr, data) => {
        if (fallbackErr) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(data);
      });
      return;
    }
    fs.readFile(filePath, (readErr, data) => {
      if (readErr) { res.writeHead(500); res.end('Server error'); return; }
      res.writeHead(200, {
        'Content-Type': types[path.extname(filePath)] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(data);
    });
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`GENESIS running on 0.0.0.0:${port}`);
});
