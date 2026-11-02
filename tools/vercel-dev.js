'use strict';

/**
 * Локальная эмуляция Vercel: запросы /api/* прогоняются через api/index.js
 * так же, как это делает rewrite в vercel.json.
 *
 * Запуск: node tools/vercel-dev.js
 */

const http = require('node:http');
const handler = require('../api/index.js');

const PORT = Number(process.env.PORT || 7826);

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    const rest = req.url.slice(5);
    req.url = `/api?__p=${encodeURIComponent(rest)}`;
  }
  handler(req, res).catch((error) => {
    console.error('[vercel-dev]', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Внутренняя ошибка' }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`Vercel-эмуляция: http://localhost:${PORT}`);
  console.log(`Хранилище: ${process.env.VERCEL ? 'Vercel' : 'локально'} · KV: ${process.env.KV_REST_API_URL ? 'да' : 'нет'}`);
});
