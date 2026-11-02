const zlib = require('zlib');
const b64 = [0,1,2].map(i => require('./api-handler-p' + i)).join('');
const code = zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8');
const Module = require('module');
const m = new Module(__filename + '.rt');
m.filename = __filename + '.rt';
m.paths = Module._nodeModulePaths(__dirname);
m._compile(code, m.filename);
module.exports = m.exports;
