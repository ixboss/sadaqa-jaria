#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const entries = new Map();
const cache = {
  async match(request) { return entries.get(request) || null; },
  async put(request, response) { entries.set(request, response); },
};
const listeners = new Map();
let networkRequests = 0;
let backgroundRefreshes = 0;
const context = {
  AbortController,
  URL,
  Response,
  Request,
  setTimeout,
  clearTimeout,
  console,
  self: { addEventListener: (name, callback) => listeners.set(name, callback) },
  caches: {
    async open() { return cache; },
    async match(request) { return entries.get(request) || null; },
  },
  fetch: async (_request, options = {}) => {
    if (options.cache === 'no-store') backgroundRefreshes++;
    else networkRequests++;
    return new Response('quran page payload', { status: 200 });
  },
};
vm.runInNewContext(`${source}\n;globalThis.runCacheCheck = cacheFirstWithTimeout;`, context);

const first = await context.runCacheCheck('page-1', 'api-cache');
assert.equal(await first.text(), 'quran page payload');
assert.equal(networkRequests, 1);
assert.ok(entries.has('page-1'), 'successful cache-miss response is persisted');

const second = await context.runCacheCheck('page-1', 'api-cache');
assert.equal(await second.text(), 'quran page payload');
assert.equal(networkRequests, 1, 'cached response avoids another network request');
assert.equal(backgroundRefreshes, 1, 'cached response triggers its background refresh');

console.log('PASS service worker stores successful API cache misses and serves them from cache');
