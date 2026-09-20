# Contributing to إسلامي (Islami)

First — **jazak Allahu khayran** for considering a contribution.

This project is a **صدقة جارية** (ongoing charity). Every fix, every feature,
every typo you correct is work that continues to benefit people after you've
moved on. That's the entire point.

> **«مَنْ دَلَّ عَلَى خَيْرٍ فَلَهُ مِثْلُ أَجْرِ فَاعِلِهِ»**
> *"Whoever guides someone to good will have a reward like the one who did it."*

Before contributing, please read:

- **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)** — binding for all participation
- **[README.md](README.md)** — project overview and setup
- **[01-bugs.md](01-bugs.md)** — the known-defect list, with exact line references
- **[04-architecture.md](04-architecture.md)** — why the code is shaped the way it is

---

## Table of Contents

- [Ways to Contribute](#ways-to-contribute)
- [Getting Set Up](#getting-set-up)
- [Finding Something to Work On](#finding-something-to-work-on)
- [Coding Conventions](#coding-conventions)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)
- [Contributions We Cannot Accept](#contributions-we-cannot-accept)

---

## Ways to Contribute

You don't have to write code to help. All of these are genuinely valuable:

| Contribution | Skill needed |
|---|---|
| 🐞 **Fix a confirmed bug** from [`01-bugs.md`](01-bugs.md) | JavaScript |
| 🎨 **Build an animation** from [`02-uiux.md`](02-uiux.md) | CSS / JS |
| 💡 **Implement a feature** from [`03-features.md`](03-features.md) | JavaScript |
| 🏗️ **Refactor** per [`04-architecture.md`](04-architecture.md) | JavaScript architecture |
| ♿ **Improve accessibility** — screen readers, focus, contrast | HTML / ARIA |
| 📱 **Test on a real device** and report what breaks | Any |
| 📝 **Fix documentation** or unclear wording | Writing |
| 🌍 **Translate** the interface for non-Arabic speakers | Language |
| 🕌 **Verify religious content** — check adhkar and citations | Arabic / Islamic knowledge |
| 🔍 **Review a pull request** | Any |

> ⚠️ **Contributions are not judged by size.** Correcting a single mistranscribed
> harakah in the adhkar is as welcome as a major refactor. In a project handling
> sacred text, accuracy matters more than volume.

---

## Getting Set Up

### 1. Fork and clone

```bash
git clone https://github.com/<your-username>/sadaqa-jaria.git
cd sadaqa-jaria
```

### 2. Serve it locally

There is **no build step** and **no package manager**. But you must serve over
HTTP — the Service Worker will not register on `file://`.

```bash
python -m http.server 8080     # Python 3
npx serve .                    # Node
php -S localhost:8080          # PHP
```

Open **http://localhost:8080**.

### 3. Test on a real device (when relevant)

If your change touches layout, animation, or installation, test it on an actual
phone. DevTools device emulation does not reliably reproduce:

- Touch and swipe behaviour
- Haptic feedback (`navigator.vibrate`)
- PWA installation
- iOS Safari's rendering and `localStorage` restrictions

To test on your phone from your computer, serve on your LAN address
(`http://192.168.x.x:8080`) — but note that **install and Service Worker
features need HTTPS**, so for those use a tunnel such as Cloudflare Tunnel,
ngrok, or deploy to a preview environment.

---

## Finding Something to Work On

### Recommended starting points

1. **[`01-bugs.md`](01-bugs.md)** — 27 findings, each with a verified
   `file:line` reference. The 🔴 **Confirmed Bugs** (B-1 through B-7) are the
   highest impact and the safest place to start.
2. **[`02-uiux.md`](02-uiux.md)** — animation proposals A-1…A-7. One of them
   (A-3) is a **single line**: `Motion.flipAnimate` is fully implemented but
   never called.
3. **[`03-features.md`](03-features.md)** — 16 features in three tiers, with a
   recommended build order and dependency chains.

### Before you start coding

For anything larger than a small fix, **open an issue first** to discuss it.
This avoids duplicated effort and confirms the change fits the project's
constraints — some proposals have good reasons for not being implemented yet.

### Issue labels

| Label | Meaning |
|---|---|
| `good first issue` | Scoped, self-contained, has a clear solution |
| `bug` | Confirmed defect — read `01-bugs.md` for reference IDs |
| `enhancement` | Feature or improvement |
| `a11y` | Accessibility |
| `refactor` | Internal restructuring, no behaviour change |
| `help wanted` | Maintainers would especially welcome help |

When referencing a finding, please include its ID — for example, *"fixes B-11"*
or *"implements A-3"*. It links your change directly to the review document.

---

## Coding Conventions

These are drawn from the existing codebase. **Match the surrounding style** —
consistency matters more than personal preference.

### General

- **Vanilla JavaScript only.** No frameworks, no libraries, no CDN scripts.
  This is a deliberate architectural decision, not an oversight — see the
  [README](README.md#-dependencies).
- **No build step.** The files in the repo are the files that run. If your
  change would require a compiler, it isn't the right change.
- **No new dependencies.** If you believe one is genuinely necessary, open an
  issue to make the case first.
- **ES6+ is fine** — arrow functions, `const`/`let`, template literals,
  destructuring, optional chaining, `async`/`await`. Do **not** use syntax that
  requires transpilation (e.g. decorators, pipeline operator).

### Styling

- Use **CSS custom properties** for anything colour-, spacing-, or
  timing-related. Design tokens are defined at the top of the `<style>` block in
  `index.html`. Do not hardcode values that a token already covers.
- **Both themes must work.** Test every visual change in dark *and* light mode.
  Light mode is not an afterthought.
- **RTL is the default.** Use logical properties (`margin-inline`,
  `padding-inline`, `inset-inline-start`) rather than `left`/`right` where you can.
- Keep layout breakpoints responsive — the app targets phones first.

### Animation

- **Honour `prefers-reduced-motion`.** This is non-negotiable. Every existing
  animation path respects it, and yours must too:

  ```js
  if (prefersReducedMotion) {
    // set the end state directly — no animation
  }
  ```

- Prefer **transform and opacity** over animating layout properties. They run on
  the compositor and don't trigger reflow.
- Reuse the existing easing tokens (`--ease-out-quart`, `--ease-spring`, etc.)
  rather than inventing new curves. The project already has two competing
  easing vocabularies — **do not add a third**. (This inconsistency is logged in
  [`02-uiux.md`](02-uiux.md).)
- For staggered entrances, use the existing `Motion.staggerIn` helper.
- For list reordering and removal, use `Motion.flipAnimate` — it exists and works,
  but is currently called from nowhere.

### Storage

- **Never call `localStorage` directly.** Use the hardened `StorageManager` and
  wrap access in `try/catch` — Safari Private Browsing throws on write. Unguarded
  access is precisely what causes bugs B-6 and B-7.

  ```js
  // ❌ Don't
  localStorage.setItem('count', n);

  // ✅ Do
  try { localStorage.setItem('count', n); } catch (e) { /* fail silently */ }
  ```

- Any user data you add must degrade safely: a storage failure should never
  break the UI.

### Security

- **Escape all interpolated text** that reaches `innerHTML`. Use the existing
  `escapeHtml` helper. Data comes from remote APIs and must be treated as
  untrusted.
- Do not introduce `eval`, `new Function`, or inline event handlers — the
  project is trying to *remove* the 14 existing inline handlers so a real CSP
  becomes possible (see B-17).

### Content integrity — read this twice

- **Never alter the Quranic text.** Not for layout, not for normalisation, not
  for any reason. If text appears wrong, open an issue rather than "fixing" it.
- **Never add fabricated hadith or unattributed quotations.** Cite a source.
- Arabic normalisation logic (diacritic handling, hamza unification,
  `stripBismillah`) is **delicate**. If you touch it, test thoroughly across
  surahs that begin with Bismillah and those that do not.

### Comments

Comments in this codebase are written in **Arabic** — matching the project's
primary language. Arabic comments are welcome and encouraged. If your Arabic
isn't strong, write in English; a clear English comment is far better than
awkward machine-translated Arabic.

Comment **why**, not **what**. The existing code does this well — follow its lead.

---

## Commit Messages

The repo's history is mixed, but **new commits should use
[Conventional Commits](https://www.conventionalcommits.org/)**. It's readable
and diff-friendly.

```
<type>(<scope>): <short summary in imperative mood>

<optional body — explain WHY, not what>

<optional footer — e.g. "Fixes B-11" or "Implements A-3">
```

### Types

| Type | Use for |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `style` | CSS/visual changes, no logic change |
| `refactor` | Restructuring without behaviour change |
| `perf` | Performance improvement |
| `a11y` | Accessibility improvement |
| `docs` | Documentation only |
| `chore` | Tooling, config, metadata |

### Good examples

```
fix(tasbih): persist partial counts instead of discarding on reset

Previously `recordTasbih(goal)` fired per-lap, so a reset mid-count threw
away the user's progress. Now the partial count is committed before reset.

Fixes B-6
```

```
style(mushaf): scale Quran text independently of the UI

Shrinking the UI also shrank the mushaf text, defeating the purpose of the
size control. Added --mushaf-scale so the two scale separately.
```

### Please avoid

- `fix`, `update`, `changes`, `asdf`, `wip` — these tell a reader nothing
- Combining unrelated changes in one commit
- Committing commented-out code

---

## Pull Request Process

1. **Fork** the repository and create a branch from `main`:

   ```bash
   git checkout -b fix/tasbih-partial-counts
   ```

2. **Make your change.** Keep it focused — one logical change per PR. If you
   find an unrelated bug, open a separate issue rather than fixing it here.

3. **Test it yourself.** See the checklist below.

4. **Commit** using the message format above.

5. **Push** and open a PR against `main`.

6. **Describe your PR clearly.** Include:
   - **What** changed and **why**
   - **How** you tested it, and on which browsers/devices
   - Any **screenshots or a screen recording** for visual changes
   - The **finding ID** it addresses, if applicable

### PR checklist

Before submitting, confirm:

- [ ] Tested in **at least two browsers**
- [ ] Tested on **a real mobile device** (if the change is visual or touch-related)
- [ ] Verified with **`prefers-reduced-motion: reduce`** enabled
- [ ] Verified in **both dark and light** themes
- [ ] Confirmed the **RTL layout** isn't broken
- [ ] Confirmed **no new dependencies** and **no build step** introduced
- [ ] **Escaped** any user- or API-derived text reaching `innerHTML`
- [ ] `localStorage` access is wrapped in `try/catch`
- [ ] Quranic or religious content, if touched, is **verified accurate**
- [ ] Commit messages follow the convention

### Review

A maintainer will review your PR. Please be patient — this is a volunteer
project maintained alongside other responsibilities.

Review feedback is about the code, not about you. If changes are requested,
they're usually about consistency with existing patterns rather than
correctness. **Discussion is welcome** — if you disagree with a review comment,
say so and explain your reasoning.

### What happens next

- **Approved** → merged into `main`
- **Changes requested** → revise and push to the same branch; the PR updates automatically
- **No response for a while** → feel free to leave a polite nudge on the PR

---

## Reporting Bugs

A good bug report is worth more than most fixes. Please include:

1. **What you did** — the exact steps
2. **What you expected** to happen
3. **What actually happened**
4. **Browser, version, and OS** — and whether it's installed as a PWA
5. **Screenshots or a recording** if the issue is visual
6. **Console errors**, if any (DevTools → Console)

### Before opening an issue

- **Check [`01-bugs.md`](01-bugs.md) first** — it may already be a known issue.
  If so, you can add useful detail to that finding rather than filing a duplicate.
- **Search existing issues** to avoid duplicates.

### Security issues

Please **do not** open a public issue for a security vulnerability. Report it
privately via the maintainer's GitHub profile. See `security.txt`.

---

## Suggesting Features

Feature requests are welcome. A strong proposal includes:

- **The problem** it solves — not just the feature you want
- **Who benefits** and how often they'd use it
- **How it fits** the project's constraints (no server, no dependencies, offline-first)
- Whether it stays **usable offline**

### Design principles to respect

This app is an act of worship, and its design follows from that. Please keep
these in mind:

| Principle | Implication |
|---|---|
| **No server** | Nothing requiring a backend, accounts, or sync |
| **Offline-first** | Features should work without a connection where possible |
| **Compound benefit** | Favour features that remain useful to others over time |
| **Calm, not addictive** | No streaks-as-pressure, no notifications-as-nudges, no dark patterns |
| **Privacy** | No analytics, no telemetry, no third-party tracking — ever |
| **No monetisation** | No ads, no premium tiers, no upsells |

Requests that violate these aren't rejected out of rigidity — they simply
don't fit what this project is. If you think a principle is wrong, open an
issue and make the argument.

---

## Contributions We Cannot Accept

To save you time, these will be declined:

| ❌ | Why |
|---|---|
| **Analytics, tracking, or telemetry** | Contradicts the privacy principle |
| **Ads, paywalls, or premium tiers** | This is charity, not a product |
| **Altering or "modernising" the Quranic text** | Not negotiable, by any reason |
| **Fabricated hadith or unattributed religious claims** | Integrity of sacred content |
| **Sectarian, political, or polemical content** | Outside the project's scope — see the Code of Conduct |
| **A framework rewrite** | Would add a build step and dependency tree the project deliberately avoids |
| **Server-side features** | There is no server, and there won't be |
| **Collecting user data of any kind** | Violates the entire premise |

If you're unsure whether something fits, **just ask** — an issue costs nothing.

---

## Questions?

- **Questions and ideas** → [GitHub Discussions](https://github.com/ixboss/sadaqa-jaria/discussions)
- **Bugs and features** → [GitHub Issues](https://github.com/ixboss/sadaqa-jaria/issues)

---

<div align="center">

### 🤲 Thank You

Whatever you contribute — code, a bug report, a translation, or a du'a —
may Allah reward you for it, and make it beneficial.

**«إِنَّ اللَّهَ لَا يُضِيعُ أَجْرَ الْمُحْسِنِينَ»**

*"Indeed, Allah does not waste the reward of those who do good."*
— Surah At-Tawbah 9:120

<br>

**صدقة جارية · Sadaqah Jariyah**

</div>
