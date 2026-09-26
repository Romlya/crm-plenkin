const crypto = require('crypto');
const { verifyPassword, hashPassword } = require('./pass');
const store = require('./store');

module.exports = async function handler(req, res) {
  res.statusCode = 503;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'Updating API, retry in 30s' }));
};
