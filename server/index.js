const http = require('http');
const fs = require('fs');
const path = require('path');
const handler = require('./api-handler');

const PORT = process.env.PORT || 3847;
const PUBLIC = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, urlPath) {
  let file = urlPath === '/' ? '/index.html' : urlPath;
  file = path.normalize(file).replace(/^(\.[./\\])+/, '');
  const full = path.join(PUBLIC, file);
  if (!full.startsWith(PUBLIC)) {
    res.statusCode = 403;
    return res.end('Forbidden');
  }
  fs.readFile(full, (err, data) => {
    if (err) {
      res.statusCode = 404;
      return res.end('Not found');
    }
    res.setHeader('Content-Type', MIME[path.extname(full)] || 'application/octet-stream');
    res.end(data);
  });
}

http
  .createServer(async (req, res) => {
    const url = (req.url || '/').split('?')[0];
    if (url.startsWith('/api')) {
      return handler(req, res);
    }
    return serveStatic(req, res, url);
  })
  .listen(PORT, () => {
    console.log('CRM ПЛЕНКИН → http://localhost:' + PORT);
    console.log('owner / plenkin2026 | manager / manager2026 | installer / montage2026');
  });
