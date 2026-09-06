'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
let ts;
try { ts = require('typescript'); }
catch {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const root = execFileSync(npm, ['root', '-g'], { encoding: 'utf8' }).trim();
  ts = require(path.join(root, 'typescript'));
}
const root = path.resolve(__dirname, '..');
function createLoader(doubles = {}) {
  const cache = new Map();
  function load(file) {
    let full = path.resolve(root, file);
    if (!fs.existsSync(full)) {
      full = ['.ts', '.tsx', '.cjs'].map(ext => full + ext).find(p => fs.existsSync(p));
      if (!full) throw new Error('Missing source module: ' + file);
    }
    if (cache.has(full)) return cache.get(full).exports;
    const source = fs.readFileSync(full, 'utf8');
    const output = ts.transpileModule(source, {
      fileName: full, reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    });
    const errors = (output.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
    if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {
      getCanonicalFileName: n => n, getCurrentDirectory: () => root, getNewLine: () => '\n',
    }));
    const module = { exports: {} };
    cache.set(full, module);
    const native = Module.createRequire(full);
    const requireForFile = id => {
      if (Object.prototype.hasOwnProperty.call(doubles, id)) return doubles[id];
      if (id.startsWith('.')) return load(path.resolve(path.dirname(full), id));
      if (id.startsWith('@/')) throw new Error('Explicit dependency double required: ' + id);
      return native(id);
    };
    new Function('require', 'module', 'exports', '__filename', '__dirname', output.outputText)(
      requireForFile, module, module.exports, full, path.dirname(full),
    );
    return module.exports;
  }
  return load;
}
module.exports = { createLoader, root, ts };
