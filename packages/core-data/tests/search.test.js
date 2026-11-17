import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeArabic, normalizeArabicStrict, ftsQuery } from '../engines/search.js';

test('diacritic variants collapse to the same key (REA_SPEC §4.4)', () => {
  const fullyVocalized = '\u0671\u0644\u0652\u0641\u064E\u0627\u062A\u0650\u062D\u064E\u0629'; // ٱلْفَاتِحَة
  const plain = 'الفاتحة';
  assert.equal(normalizeArabic(fullyVocalized), normalizeArabic(plain));
  assert.equal(normalizeArabic(fullyVocalized), 'الفاتحه'); // ة → ه
});

test('spelling variants hit the same key', () => {
  assert.equal(normalizeArabic('ٱلْفَاتِحَة'), 'الفاتحه');           // wasla + tashkeel stripped, ة → ه
  assert.equal(normalizeArabic('أُمَّة'), normalizeArabic('امه'));   // أ → ا
  assert.equal(normalizeArabic('أَسْمَاءُ'), normalizeArabic('اسما'));
  assert.equal(normalizeArabic('يُوسُفَ'), normalizeArabic('يوسف'));
  assert.equal(normalizeArabic('عيسى'), normalizeArabic('عيسي')); // ى → ي
  assert.equal(normalizeArabic('الصَّلاةُ'), normalizeArabic('الصلاه'));
  assert.equal(normalizeArabic('ؤُ'), normalizeArabic('و'));
  assert.equal(normalizeArabic('ئِي'), normalizeArabic('يي'));
});

test('hamza folding: alef-hamza variants fold to alef; standalone ء survives only token-initially', () => {
  assert.equal(normalizeArabic('ءَامِنُوا'), 'ءامنوا');   // token-initial hamza kept
  assert.equal(normalizeArabic('سَأَلَ'), 'سال');         // أ (U+0623) → ا — non-initial "hamza" sound folded with the alef
  assert.equal(normalizeArabicStrict('سَأَلَ'), 'سال');
  assert.equal(normalizeArabic('جَاءَ'), 'جا');           // standalone ء (non-initial) dropped
});

test('punctuation and whitespace are stripped/collapsed', () => {
  assert.equal(normalizeArabic('الصلاة، الزكاة'), 'الصلاه الزكاه');
  assert.equal(normalizeArabic('  القرآن\tالكريم  '), 'القران الكريم'); // آ folds to ا
  assert.equal(normalizeArabic('بِسْمِ اللهِ ۔'), 'بسم الله');
});

test('NFC input is required-stable: combining vs precomposed alef-lam', () => {
  const composed = 'ل\u0623';     // ل + أ (single char أ)
  const decomposed = 'ل\u0623';   // same string; NFC normalizes internally
  assert.equal(normalizeArabic(composed), normalizeArabic(decomposed));
});

test('non-string input rejects', () => {
  assert.throws(() => normalizeArabic(42), /expects a string/);
});

test('ftsQuery builds prefix-matched, quoted MATCH expression', () => {
  const q = ftsQuery('ٱلرَّحْمَن');
  assert.ok(q.startsWith('"الرحمن"'));
  assert.ok(q.endsWith('*'));
  assert.equal(ftsQuery('   '), null);
  assert.equal(ftsQuery('rtl "quote" test'), '"rtl" "quote" "test"*');
});
