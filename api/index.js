'use strict';

/**
 * Vercel Serverless Function: весь /api/* обслуживается этим обработчиком.
 * Постоянное хранилище — Vercel KV (Upstash Redis) через env KV_REST_API_URL/TOKEN.
 * Без KV данные живут в /tmp и теряются после cold start (демо-режим).
 */

const app = require('../server.js');

module.exports = async (req, res) => {
  await app.init();

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const original = url.searchParams.get('__p');

  if (original) {
    req.url = `/api/${original.replace(/^\/+/, '')}`;
  } else if (!req.url.startsWith('/api/')) {
    req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`;
  }

  await app.handleRequest(req, res);
};
