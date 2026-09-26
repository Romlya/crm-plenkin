const zlib = require('zlib');
const b64 = require('./api-handler-p0.js') + require('./api-handler-p1.js') + require('./api-handler-p2.js');
const code = zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8');
const m = { exports: {} };
new Function('module', 'exports', 'require', '__dirname', '__filename', code)(
  m, m.exports, require, __dirname, __filename
);
module.exports = m.exports;
