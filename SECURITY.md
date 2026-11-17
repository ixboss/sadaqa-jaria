# Security Policy — سياسة الأمان

## Reporting a vulnerability

**Preferred:** open a private security advisory on GitHub:
[Security → Report a vulnerability](https://github.com/ixboss/sadaqa-jaria/security/advisories/new)

**Or** email the maintainer directly: **hossam.m.ghareeb@gmail.com**

Please do **not** open a public issue for an undisclosed security problem. Include reproduction
steps, affected target(s), and — if possible — the browser/device. You will get a response and
next steps; fixes are released as soon as a safe patch is ready, and you'll be credited unless
you prefer otherwise.

## Scope

This project is a fully **static, offline-first** app — there is no backend server, no accounts,
no cloud sync, and no telemetry. All user data lives on-device:

- **v1 web app (repo root):** localStorage + Cache Storage
- **v2 shell (`apps/web-desktop`, Electron):** SQLite (WASM) over OPFS
- **Native ports:** SQLite (GRDB on iOS, bundled AndroidX SQLite on Android)

In scope: the shipped code in this repository (web, Electron, iOS, Android targets and the
shared `packages/core-data` engines), the build/asset tooling in `scripts/`, and the CI
workflows.

Partially in scope: outbound fetches to public read-only content endpoints
(`api.alquran.cloud`) used for on-demand Qur'an data — issues involving how this app *sends or
uses* that data are in scope; compromise of those third-party services themselves is not.

Out of scope: the GitHub Pages hosting platform itself, and third-party content servers'
internal security beyond what is described above.

## Supported versions

| Branch | Status |
| --- | --- |
| `main` (v1 PWA at root + v2 workspace under `apps/`) | ✅ supported |

## Notes for automated scanners

`.well-known/security.txt` remains the machine-readable canonical policy file.
