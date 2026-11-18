#!/usr/bin/env node
// ============================================================================
// build-engines-bundle.mjs — compiles the v2 core-data engines (prayer, qibla)
// into ONE classic-script bundle for the v1 PWA (js/core-data.bundle.js).
//
// Why: the v1 PWA is global-lexical classic modules (no ESM in index.html),
// yet it must compute prayers/qibla with the SAME golden engine the other
// three targets use — otherwise v1 drifts (2026-11 audit: the v1 device-tz
// bug was the cost of the parallel math). The bundle is committed and a
// freshness check in tests/parity/verify-parity.mjs fails CI when the
// engines change without regenerating.
//
// Transform (mechanical, ESM → IIFE registry):
//   import { A, B as C } from './x.js'  → const { A, B: C } = __deps[key]
//   import X from './x.js'              → const { default: X } = __deps[key]
//   export function/const NAME          → strip keyword; exports.NAME = NAME
//   export default NAME / class X       → exports.default = NAME
//   export { A as B }                   → exports.B = A
// Modules run in topological order so top-level consts initialize safely.
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENGINES = join(ROOT, 'packages', 'core-data', 'engines');
const VENDOR = join(ROOT, 'packages', 'core-data', 'vendor', 'adhan');
const OUT = join(ROOT, 'js', 'core-data.bundle.js');
const ENTRIES = [
  join(ENGINES, 'prayer.js'),
  join(ENGINES, 'qibla.js'),
];

const IMPORT_RE = /import\s+(?:([A-Za-z_$][\w$]*)\s*,\s*)?(?:\{([\s\S]*?)\}|([A-Za-z_$][\w$]*))\s*from\s*['"]([^'"]+)['"]\s*;?/g;
const keyOf = (abs) => abs.slice(ROOT.length + 1).replace(/\\/g, '/');

/** Parse one module's source into { imports, source, exports, defaultExport }. */
function parseModule(abs) {
  const raw = readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
  const imports = [];
  let source = raw.replace(IMPORT_RE, (_m, def, named, single, spec) => {
    const from = resolve(dirname(abs), spec);
    imports.push({ def, named, single, from });
    return ''; // dropped; prologue re-created below
  });
  const reg = { named: new Map(), default: null };
  source = source
    // `export { A, B as C };`
    .replace(/^\s*export\s*\{([\s\S]*?)\}\s*;?\s*$/gm, (_m, list) => {
      for (const part of list.split(',').map((s) => s.trim()).filter(Boolean)) {
        const m = part.match(/^([\w$]+)(?:\s+as\s+([\w$]+))?$/);
        if (m) reg.named.set(m[1], m[2] ?? m[1]);
      }
      return '';
    })
    // `export default NAME;` / `export default class X {` / `export default function X(`
    .replace(/^export\s+default\s+(class|function)\s+([A-Za-z_$][\w$]*)/m, (_m, kind, name) => {
      reg.default = name;
      return `${kind} ${name}`;
    })
    .replace(/^export\s+default\s+([A-Za-z_$][\w$]*)\s*;/m, (_m, name) => {
      reg.default = name;
      return '';
    })
    // `export function NAME` / `export const NAME =` / `export let NAME =`
    .replace(/^export\s+(function|const|let)\s+([A-Za-z_$][\w$]*)/gm, (_m, kind, name) => {
      if (kind === 'function' || reg.default === null) {
        if (kind !== 'const' && kind !== 'let') reg.named.set(name, name);
        else reg.named.set(name, name);
      }
      return `${kind} ${name}`;
    });
  return { imports, source: source.trim(), reg };
}

/** Topological gather from entries. */
function gather(entries) {
  const order = [];
  const seen = new Map(); // abs → parsed
  const visit = (abs) => {
    if (seen.has(abs)) return;
    const parsed = parseModule(abs);
    seen.set(abs, parsed);
    for (const imp of parsed.imports) visit(imp.from);
    order.push(abs);
  };
  for (const e of entries) visit(e);
  return { order, seen };
}

const { order, seen } = gather(ENTRIES);

const chunks = [];
for (const abs of order) {
  const { imports, source, reg } = seen.get(abs);
  const prologue = imports.map((imp) => {
    const key = keyOf(imp.from);
    const parts = [];
    if (imp.def) parts.push(`default: ${imp.def}`);
    if (imp.named) {
      for (const spec of imp.named.split(',').map((s) => s.trim()).filter(Boolean)) {
        const m = spec.match(/^([\w$]+)(?:\s+as\s+([\w$]+))?$/);
        if (m) {
          const local = m[2] ?? m[1];
          parts.push(local === m[1] ? m[1] : `${m[1]}: ${local}`);
        }
      }
    }
    if (imp.single) parts.push(`default: ${imp.single}`);
    return `  const { ${parts.join(', ')} } = __deps[${JSON.stringify(key)}];`;
  }).join('\n');
  const registrations = [];
  if (reg.default) registrations.push(`  exports.default = ${reg.default};`);
  for (const [name, as] of reg.named) registrations.push(`  exports[${JSON.stringify(as)}] = ${name};`);
  const depKeys = imports.map((imp) => JSON.stringify(keyOf(imp.from)));
  chunks.push(
    `__define(${JSON.stringify(keyOf(abs))}, [${depKeys.join(', ')}], function (exports, __deps) {\n` +
    (prologue ? prologue + '\n' : '') +
    source + '\n' +
    registrations.join('\n') +
    `\n});`,
  );
}

const K_PRAYER = keyOf(join(ENGINES, 'prayer.js'));
const K_QIBLA = keyOf(join(ENGINES, 'qibla.js'));

const bundle = `// ============================================================================
// core-data.bundle.js — GENERATED from packages/core-data/engines (prayer.js,
// qibla.js + vendored adhan 4.4.6). DO NOT HAND-EDIT.
//   Regenerate: node scripts/tools/build-engines-bundle.mjs
// Freshness is enforced: tests/parity/verify-parity.mjs re-compiles and
// compares bytes, so an engine edit without regeneration fails CI.
// Purpose: the v1 PWA (classic scripts) consumes the SAME golden v2 engines
// as web-desktop/Electron/iOS/Android via window.CoreData (2026-11 audit
// finding 14 — the parallel v1 math was the source of the device-tz bug).
// ============================================================================
(function () {
  'use strict';
  var __registry = {};
  var __define = function (key, depKeys, factory) {
    var __deps = {};
    for (var i = 0; i < depKeys.length; i++) __deps[depKeys[i]] = __registry[depKeys[i]];
    var m = {};
    factory(m, __deps);
    __registry[key] = m;
  };

${chunks.join('\n\n')}

  var __global = typeof window !== 'undefined' ? window : globalThis;
  __global.CoreData = Object.freeze({
    prayer: Object.freeze(__registry[${JSON.stringify(K_PRAYER)}]),
    qibla: Object.freeze(__registry[${JSON.stringify(K_QIBLA)}]),
  });
})();
`;

writeFileSync(OUT, bundle);
console.log(`✔ core-data bundle: ${OUT} (${order.length} modules, ${Buffer.byteLength(bundle)} bytes)`);
if (!bundle.includes('daySchedule') || !bundle.includes('qiblaBearing')) {
  throw new Error('bundle is missing expected engine exports — transform broken');
}
