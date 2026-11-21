#!/usr/bin/env node
// Runs the tests. The file list is collected here, because `node --test "test/*.test.js"` does not expand the glob on Node 20.
// Usage: node scripts/run-tests.mjs
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = readdirSync(join(root, 'test')).filter((f) => f.endsWith('.test.js')).sort().map((f) => join('test', f));
const r = spawnSync(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit' });
process.exit(r.status ?? 1);
