'use strict';

/**
 * Мини-эмуляция Upstash Redis REST для локальной проверки KV-хранилища.
 * GET /get/:key → {"result": value|null}
 * POST /set/:key → {"result": "OK"}
 */

const http = require('node:http');

const store = new Map();
const PORT = Number(process.env.PORT || 7828);

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const get = /^\/get\/(.+)$/.exec(url.pathname);
  const set = /^\/set\/(.+)$/.exec(url.pathname);

  if (get) {
    const key = decodeURIComponent(get[1]);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ result: store.has(key) ? store.get(key) : null }));
    return;
  }

  if (set && req.method === 'POST') {
    const key = decodeURIComponent(set[1]);
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      store.set(key, Buffer.concat(chunks).toString('utf8'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result: 'OK' }));
    });
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => console.log(`KV mock: http://localhost:${PORT}`));
