#!/usr/bin/node
// vendor-adhan.mjs — copy the pinned adhan@4.4.6 ESM build into packages/core-data/vendor/adhan/
// Usage: node scripts/tools/vendor-adhan.mjs <dir-with-extracted-npm-package>
// Security: verifies the barrel checksum before copying; refuses a mismatched source.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const srcDir = process.argv[2];
if (!srcDir) { console.error('usage: node scripts/tools/vendor-adhan.mjs <extracted-package-dir>'); process.exit(1); }
const esmDir = join(srcDir, 'lib', 'esm');
const typesDir = join(srcDir, 'lib', 'types');
for (const d of [esmDir, typesDir]) {
  try { statSync(d); } catch { console.error(`missing ${d} — pass the extracted npm package dir (contains lib/esm + lib/types)`); process.exit(1); }
}

const repoRoot = fileURLToPath(new URL('../../', import.meta.url)); // repo root
const dstDir = join(repoRoot, 'packages', 'core-data', 'vendor', 'adhan');

const expectedBarrelSha = '0d5a24f01bc2b576a52e76d9bb76847b3a8d71e4537ca76690b70ee18cdcd596';
const barrelPath = join(esmDir, 'Adhan.js');
const barrelSha = createHash('sha256').update(readFileSync(barrelPath)).digest('hex');
if (barrelSha !== expectedBarrelSha) {
  console.error(`REFUSED: Adhan.js sha256 mismatch (${barrelSha}) — source does not match pinned adhan@4.4.6`);
  process.exit(1);
}

let copied = 0;
for (const f of readdirSync(esmDir)) {
  if (!f.endsWith('.js')) continue;             // module files only (skip .map)
  writeFileSync(join(dstDir, f), readFileSync(join(esmDir, f)));
  copied++;
}
for (const f of readdirSync(typesDir)) {
  if (!f.endsWith('.d.ts')) continue;
  writeFileSync(join(dstDir, f), readFileSync(join(typesDir, f)));
  copied++;
}
console.log(`vendored ${copied} files into ${dstDir}`);
