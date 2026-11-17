// ============================================================================
// search.js — Arabic diacritic-insensitive normalizer (REA_SPEC §4.4, 5 steps)
// Used at INGESTION time (build-db.mjs pre-normalizes FTS columns) and at
// QUERY time (user input). One pipeline, one behavior.
// ============================================================================

/** Unicode ranges removed by step 2 (tashkeel + Quranic annotation marks). */
const TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g; // incl. tatweel U+0640
const PUNCT = /[.,;:!?«»"'()\-—–\[\]{}…•*\/\\|+_=~<>\u060C\u061B\u06D4\uFD3E\uFD3F\u061F]/g;

export function normalizeArabic(input) {
  return normalizeArabicStrict(input);
}

/**
 * Canonical pipeline (REA_SPEC §4.4): hamza ء is kept only word-initially
 * (protect token-start hamza, fold the rest, restore).
 */
export function normalizeArabicStrict(input) {
  if (typeof input !== 'string') throw new TypeError('normalizeArabicStrict expects a string');
  let s = input.normalize('NFC');
  s = s.replace(TASHKEEL, '');
  s = s
    .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627')
    .replace(/\u0624/g, '\u0648')
    .replace(/\u0626/g, '\u064A');
  // keep hamza only at token start: protect, fold, restore
  s = s.replace(/(^|\s)\u0621/g, '$1\u0001');
  s = s.replace(/\u0621/g, '');
  s = s.replace(/\u0001/g, '\u0621');
  s = s
    .replace(/\u0629/g, '\u0647')
    .replace(/\u0649/g, '\u064A');
  s = s.replace(PUNCT, ' ');
  s = s.toLowerCase().replace(/\s+/g, ' ').trim();
  return s;
}

/** Build the FTS5 MATCH expression for a user query (prefix match on last term). */
export function ftsQuery(userInput) {
  const norm = normalizeArabicStrict(userInput);
  if (!norm) return null;
  const terms = norm.split(' ').filter(Boolean);
  if (terms.length === 0) return null;
  const quoted = terms.map((t) => `"${t.replace(/"/g, '""')}"`);
  quoted[quoted.length - 1] += '*'; // prefix on final term: type-as-you-search
  return quoted.join(' ');
}
