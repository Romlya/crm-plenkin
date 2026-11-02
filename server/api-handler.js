const code = require('./_h1') + require('./_h2');
const Module = require('module');
const m = new Module(__filename + '.rt');
m.filename = __filename + '.rt';
m.paths = Module._nodeModulePaths(__dirname);
m._compile(code, m.filename);
module.exports = m.exports;
