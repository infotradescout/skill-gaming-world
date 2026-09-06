/* Isolated repair checks, NOT the repository Vitest/build/browser/PostgreSQL suite.
 * Uses installed TypeScript, or TYPESCRIPT_PATH, without downloading dependencies.
 * Each group runs in a separate process; service dependencies are explicitly doubled.
 */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { spawnSync } = require('node:child_process');
const mode = process.argv[2];
if (!mode) {
  let failed = false;
  for (const group of ['core', 'memory', 'persistence-contract']) {
    console.log(`\n=== ${group} ===`);
    const child = spawnSync(process.execPath, [__filename, group], { stdio: 'inherit', env: process.env });
    if (child.error) console.error(child.error.message);
    failed ||= child.status !== 0;
  }
  process.exit(failed ? 1 : 0);
}
if (!['core', 'memory', 'persistence-contract'].includes(mode)) throw Error('Unknown check group');
const ts = require(process.env.TYPESCRIPT_PATH || 'typescript');
const tests = require('node:test');
const root = path.resolve(__dirname, '..');
const RealDate = Date;
let now = 1001000;
const mocks = new Map();
const vi = {
  hoisted: factory => factory(),
  mock: (name, factory) => mocks.set(name, factory()),
  useFakeTimers: () => {
    global.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : [now])); }
      static now() { return now; }
    };
  },
  setSystemTime: value => { now = Number(value); },
  useRealTimers: () => { global.Date = RealDate; },
};
require.extensions['.ts'] = (module, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  if (result.diagnostics?.some(item => item.category === ts.DiagnosticCategory.Error)) {
    throw Error(`TypeScript syntax transpilation failed: ${filename}`);
  }
  module._compile(result.outputText, filename);
};
const original = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vitest') return { ...tests, vi };
  if (mocks.has(request)) return mocks.get(request);
  if (request === '@/domain') return original.call(this, path.join(root, 'src/domain/robot-combat.ts'), parent, isMain);
  if (mode === 'memory') {
    if (request === 'drizzle-orm' || request === '@/db/schema') return {};
    if (request === '@/db/client') return { getDatabase() { throw Error('Unexpected database use in memory fixture'); } };
    if (request === './env') return { getRuntimeEnv: () => ({ DEMO_MODE: process.env.DEMO_MODE === 'true' }) };
    if (request === './player-access') return { evaluateDemoPlayerAccess: () => ({ allowed: true }) };
    if (request === './persistent-player-access') return { assertPersistentPlayerAccess() { throw Error('Unexpected configured access in memory fixture'); } };
  }
  if (mode === 'persistence-contract' && request === './player-access') {
    return { evaluateDemoPlayerAccess: () => { throw Error('Unexpected demo access in configured fixture'); } };
  }
  return original.call(this, request, parent, isMain);
};
const files = mode === 'core'
  ? ['src/domain/robot-combat.test.ts', 'src/lib/robot-match-clock.test.ts', 'src/lib/robot-match-snapshot.test.ts']
  : mode === 'memory'
    ? ['src/lib/robot-combat-service.test.ts']
    : ['src/lib/robot-combat-persistence-contract.test.ts'];
for (const file of files) require(path.join(root, file));
