'use strict';
// Run with node --test tools/verify-monetaire-repair-isolated.cjs.
// This is a Node test run of actual checked-in modules with explicit dependency
// doubles. It is NOT a repository Vitest, database, Next.js, or browser run.
require('../tests/monetaire-client-isolated.cjs');
require('../tests/monetaire-projection-isolated.cjs');
require('../tests/monetaire-board-contract-isolated.cjs');
