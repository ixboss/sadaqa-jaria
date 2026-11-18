#!/usr/bin/node
// gen-tokens.mjs — tokens.json → packages/design-tokens/tokens.css
// Gate: validates every declared contrast pair with the WCAG 2.1 relative
// luminance formula; a failing pair exits non-zero (build stops, theme ships
// broken never). Emits :root (light) + [data-theme=…] blocks.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const tokensPath = join(here, '..', '..', 'packages', 'design-tokens', 'tokens.json');
const outPath = join(here, '..', '..', 'packages', 'design-tokens', 'tokens.css');
const tokens = JSON.parse(readFileSync(tokensPath, 'utf8'));

// --- WCAG 2.1 contrast ------------------------------------------------------
function luminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a 6-digit hex color: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(fg, bg) {
  const [l1, l2] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

let failures = 0;
for (const [theme, colors] of Object.entries(tokens.themes)) {
  for (const pair of tokens.contrastPairs) {
    const ratio = contrast(colors[pair.fg], colors[pair.bg]);
    if (ratio < pair.min) {
      console.error(`CONTRAST FAIL [${theme}] ${pair.label}: ${pair.fg} on ${pair.bg} = ${ratio.toFixed(2)} < ${pair.min}`);
      failures++;
    } else {
      console.log(`contrast ok [${theme}] ${pair.label}: ${ratio.toFixed(2)}:1 (min ${pair.min})`);
    }
  }
}
if (failures > 0) {
  console.error(`${failures} contrast pair(s) failed — fix tokens.json`);
  process.exit(1);
}

// --- emit tokens.css --------------------------------------------------------
const cssVars = (colors) => Object.entries(colors).map(([k, v]) => `  --color-${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}: ${v};`).join('\n');
const css = `/* GENERATED from packages/design-tokens/tokens.json — do not hand-edit.
   Regenerate: node scripts/tools/gen-tokens.mjs
   All contrast pairs validated (WCAG 2.1) at generation time. */
:root {
${cssVars(tokens.themes.light)}

  /* typography */
  --font-quran: ${tokens.typography.quranFamily};
  --font-ui: ${tokens.typography.uiFamily};
  --lh-arabic: ${tokens.typography.arabicLineHeight};
  --lh-count: ${tokens.typography.countLineHeight};
  --mushaf-plate-base: ${tokens.typography.mushafPlateBase};
  --font-feature-count: ${tokens.typography.tabularNumerals};

  /* radii (concentric: outer = inner + padding) */
${Object.entries(tokens.radii).filter(([k]) => k !== 'rule').map(([k, v]) => `  --radius-${k}: ${v};`).join('\n')}

  /* spacing scale */
${Object.entries(tokens.spacing).filter(([k]) => k !== 'unit').map(([k, v]) => `  --space-${k}: ${v};`).join('\n')}

  /* glass — CONTROL LAYER ONLY (${tokens.meta.glassPolicy.allowedOn.join(', ')}) */
  --glass-fill: ${tokens.glass.fill};
  --glass-fill-strong: ${tokens.glass.fillStrong};
  --glass-blur: ${tokens.glass.blur};
  --glass-saturate: ${tokens.glass.saturate};
  --glass-border: ${tokens.glass.borderHighlight};
  --glass-shadow: ${tokens.glass.shadow};

  /* motion */
  --ease-standard: ${tokens.motion.easing};
${Object.entries(tokens.motion.durations).map(([k, v]) => `  --dur-${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}: ${v}ms;`).join('\n')}
}
[data-theme='sepia'] {
${cssVars(tokens.themes.sepia)}
}
[data-theme='dark'] {
${cssVars(tokens.themes.dark)}
}
[data-theme='oled'] {
${cssVars(tokens.themes.oled)}
}
`;
writeFileSync(outPath, css);
console.log(`wrote ${outPath} (${Buffer.byteLength(css)} bytes)`);

// --- cross-version drift report --------------------------------------------
// css/tokens.css (v1 PWA) is a hand-maintained palette that EVOLVED separately
// from the v2 tokens (the 2026 v2 redesign changed both palette and variable
// vocabulary, so emitting the generated file would rewrite v1's identity).
// The gate instead makes the coupling explicit: every generation reports where
// the shared semantic roles diverge, so a palette change can never silently
// skip the v1 PWA (2026-11 audit finding 13).
const v1Path = join(here, '..', '..', 'css', 'tokens.css');
if (existsSync(v1Path)) {
  const v1 = readFileSync(v1Path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''); // strip comments
  const grab = (css, name) => {
    const m = css.match(new RegExp(name.replace(/-/g, '\\-') + ':\\s*([^;]+);'));
    return m ? m[1].trim() : null;
  };
  const darkBlock = v1.slice(0, v1.indexOf('body.theme-light'));
  const roles = [
    ['bg (dark)', tokens.themes.dark['bg'] ?? tokens.themes.dark['colorBg'], '--bg'],
    ['accent (dark)', tokens.themes.dark['accent'] ?? tokens.themes.dark['colorAccent'], '--accent'],
    ['ease (primary)', tokens.motion.easing, '--ease-premium'],
  ];
  const drift = [];
  for (const [label, upstream, v1Var] of roles) {
    const local = grab(darkBlock, v1Var);
    if (upstream && local && upstream !== local) {
      drift.push(`${label}: v1=${local} vs tokens.json=${upstream}`);
    }
  }
  if (drift.length) {
    console.warn('tokens drift (v1 css/tokens.css vs tokens.json — deliberate post-redesign divergence, keep both files in mind):');
    for (const d of drift) console.warn('  ~ ' + d);
  } else {
    console.log('tokens drift: v1 css/tokens.css matches tokens.json on shared roles');
  }
}
