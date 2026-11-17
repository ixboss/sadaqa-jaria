<!--
Sadaqah Jariyah project — jazak Allahu khayran for the contribution!
-->

## What does this PR do?

<!-- One or two sentences. -->

## Related issue

<!-- e.g. Fixes #12, or "none" -->

## How was it tested?

<!-- Run the relevant checks and paste the results, e.g.:
- npm test                 (v1 PWA suite)
- npm run test:core        (v2 engine unit tests)
- npm run parity:verify    (52 cross-target parity checks)
- npm run test:v2 / test:v2:p4 / test:electron
-->

## PR checklist

- [ ] No secrets, no committed build output, no new dependencies without discussion
- [ ] Works offline (no server assumptions) and keeps the Arabic-first RTL layout intact
- [ ] Cross-target parity preserved (engines in `packages/core-data` are the golden reference — no per-platform math reimplementation)
