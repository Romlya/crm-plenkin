const zlib = require('zlib');
const code = zlib.gunzipSync(Buffer.from('PLACEHOLDER_B64', 'base64')).toString('utf8');
module.exports = eval('0');
