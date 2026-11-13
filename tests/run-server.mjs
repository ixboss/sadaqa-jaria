/**
 * خادم ملفات ثابت بسيط (بدون اعتماديات) لخدمة المستودع محلياً أثناء الاختبارات.
 * الاستخدام: node tests/run-server.mjs [port]
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8123);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    let path = decodeURIComponent(u.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    let body = await readFile(file);
    // خطاف اختباري: ?update-test=N يجعل sw.js بايتات مختلفة لنفس المحتوى
    // لفرض دورة تحديث SW حقيقية في e2e-sw-update.mjs بلا تعديل ملفات على القرص
    if (path.endsWith('sw.js') && u.search.includes('update-test')) {
      body = Buffer.concat([body, Buffer.from(`\n// update-test variant ${u.search}\n`)]);
    }
    // ترويسات كاش مطابقة لاستراتيجية التحديث: المستند والـSW إعادة تحقق دائماً،
    // الأصول الثابتة كاش طويل (التحديث الفعلي يتم عبر Stale-While-Revalidate في sw.js)
    const headers = { 'content-type': MIME[extname(file)] || 'application/octet-stream' };
    if (path.endsWith('.html') || path.endsWith('sw.js') || path.endsWith('manifest.json')) {
      headers['cache-control'] = 'no-cache';
    } else if (/\.(woff2?|png|jpg|svg|ico)$/.test(path)) {
      headers['cache-control'] = 'public, max-age=2592000'; // الخطوط والأيقونات: ٣٠ يوماً
    } else if (/\.(js|css)$/.test(path)) {
      headers['cache-control'] = 'public, max-age=3600';    // غير مُهشَّرة: ساعة فقط
    }
    res.writeHead(200, headers);
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`static server on http://127.0.0.1:${PORT}/index.html`));
