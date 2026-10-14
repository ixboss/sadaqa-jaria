#!/usr/bin/env node
/**
 * scripts/prepare-www.mjs
 *
 * يجهّز مجلد www/ الخاص بـ Capacitor من ملفات الويب الثابتة الموجودة في جذر الريبو.
 * التطبيق ليس له خطوة بناء (no build step) — كل ما نحتاجه هو نسخ الملفات
 * التي يحتاجها وقت التشغيل، مع استبعاد ملفات الريبو والمستودعات والأدوات.
 *
 * الناتج: www/index.html + كل أصوله، جاهز لـ `cap sync`.
 *
 * الاستخدام:
 *   node scripts/prepare-www.mjs          # يبني www/ في الجذر
 *   node scripts/prepare-www.mjs --check  # يتحقق فقط دون كتابة (للاختبارات)
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const WWW = resolve(ROOT, 'www');

const isCheck = process.argv.includes('--check');

/**
 * الملفات/المجلدات التي تُستبعد من www/ دائماً:
 * - ملفات النظام والريبو والأدوات (لا تُقدّم في التطبيق)
 * - مشاريع الموبايل الأصلية ومجلد الإخراج نفسه
 */
const EXCLUDE_TOP = new Set([
  '.git',
  '.github',
  '.well-known',
  '.zcode',
  '.zcodeignore',
  '__pycache__',
  'node_modules',
  'www',
  'android',
  'ios',
  'scripts',
  'tests',
  'docs',
  '.vscode',
  '.idea'
]);

/** امتدادات/أسماء ملفات لا داعي لها داخل حزمة التطبيق */
const EXCLUDE_FILENAMES = new Set([
  '.gitignore',
  '.gitattributes',
  '.DS_Store',
  'Thumbs.db',
  '.nojekyll',
  'package.json',
  'package-lock.json',
  'capacitor.config.json',
  'tsconfig.json',
  // ملفات أدوات الريبو وخوادم الويب — ليست جزءاً من تطبيق الموبايل
  '.htaccess',
  '.icon-build.py',
  '.social-preview-build.py',
  '.verify-icons.py',
  '.verify-nav.py',
  'LICENSE',
  // sitemap/robots خاصة بمحركات البحث على الويب فقط
  'robots.txt',
  'sitemap.xml'
]);

// ملفات Markdown والأدوات المساعدة ليست جزءاً من واجهة التطبيق
const EXCLUDE_EXTENSIONS = new Set(['.md', '.pyc', '.log']);

/**
 * ملفات الويب الأساسية التي يجب أن تتواجد دائماً في www/ —
 * إذا نقصت أي منها فإن البناء سيفشل صراحةً (fail fast) بدلاً
 * من إنتاج حزمة ناقصة تصمت عند المستخدم.
 */
const REQUIRED_FILES = [
  'index.html',
  'manifest.json',
  'app.js',
  'features.js',
  'config.js',
  'surah-meta.js',
  'backup.js',
  'mushaf.js',
  'pageflip.js',
  'sw.js'
];

/** مجلدات الأصول التي تُنسخ بالكامل */
const ASSET_DIRS = ['icons', 'assets'];

/**
 * يجمع كل المسارات النسبية للملفات داخل مسار معين (تكرارياً).
 * @param {string} dir مسار مطلق
 * @returns {string[]} مسارات نسبية بفاصل '/' دائماً
 */
function collectFiles(dir) {
  const out = [];
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...collectFiles(abs));
    } else if (ent.isFile()) {
      out.push(relative(ROOT, abs).split(sep).join('/'));
    }
  }
  return out;
}

/**
 * يقرر هل يُضمّ ملف (نسبي من الجذر) في حزمة www/ أم لا.
 * @param {string} rel مسار نسبي بفاصل '/'
 */
function isIncluded(rel) {
  const top = rel.split('/')[0];
  if (EXCLUDE_TOP.has(top)) return false;
  if (EXCLUDE_FILENAMES.has(basename(rel))) return false;
  if (EXCLUDE_EXTENSIONS.has(basename(rel).slice(basename(rel).lastIndexOf('.')))) return false;
  return true;
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function main() {
  // 1) تأكد من وجود الملفات الإلزامية قبل أي شيء
  const missing = REQUIRED_FILES.filter((f) => !existsSync(join(ROOT, f)));
  if (missing.length) {
    console.error('✖ prepare-www: ملفات ويب إلزامية ناقصة من جذر الريبو:');
    for (const f of missing) console.error('   - ' + f);
    process.exitCode = 1;
    return;
  }

  // 2) اجمع قائمة الملفات: الجذر + مجلدات الأصول
  const rootFiles = collectFiles(ROOT).filter((rel) => !rel.includes('/'));
  const assetFiles = ASSET_DIRS.flatMap((d) => collectFiles(join(ROOT, d)));
  const all = [...rootFiles, ...assetFiles].filter(isIncluded).sort();

  if (!all.includes('index.html')) {
    console.error('✖ prepare-www: index.html غير موجود في القائمة النهائية — لن تُبنى حزمة صالحة');
    process.exitCode = 1;
    return;
  }

  // 3) في وضع --check: تحقق من قابلية القراءة فقط، دون كتابة
  if (isCheck) {
    let ok = 0;
    for (const rel of all) {
      readFileSync(join(ROOT, rel));
      ok++;
    }
    console.log(`✓ prepare-www --check: ${ok} ملف قابل للنسخ (لم يُكتب شيء)`);
    return;
  }

  // 4) امسح www/ القديم لإعادة بناء نظيفة (لا بقايا ملفات محذوفة)
  rmSync(WWW, { recursive: true, force: true });
  mkdirSync(WWW, { recursive: true });

  // 5) انسخ كل ملف مع الحفاظ على البنية
  let copied = 0;
  const manifest = {};
  for (const rel of all) {
    const src = join(ROOT, rel);
    const dst = join(WWW, rel);
    mkdirSync(dirname(dst), { recursive: true });
    const buf = readFileSync(src);
    writeFileSync(dst, buf);
    manifest[rel] = sha256(buf);
    copied++;
  }

  // 6) سجلّ تلقائي يلخّص محتوى الحزمة (يساعد على تشخيص مشاكل المزامنة)
  const meta = {
    generatedAt: new Date().toISOString(),
    appVersion: '2.4.0',
    fileCount: copied,
    files: manifest
  };
  writeFileSync(join(WWW, '.prepare-www.json'), JSON.stringify(meta, null, 2) + '\n');

  const sizeKB = Math.round(
    Object.keys(manifest).reduce((sum, rel) => sum + statSync(join(ROOT, rel)).size, 0) / 1024
  );
  console.log(`✓ prepare-www: تم بناء www/ — ${copied} ملف (~${sizeKB} ك.ب)`);
  console.log(`  النقطة الدخول: www/index.html`);
}

try {
  main();
} catch (err) {
  console.error('✖ prepare-www: فشل غير متوقع:');
  console.error(err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
}
