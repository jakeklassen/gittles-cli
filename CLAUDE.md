# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gittles is a GitHub stars CLI. It compiles to a **single native binary** with
[scriptc](https://github.com/vercel-labs/scriptc) — no Node, no V8, no JavaScript engine,
and no npm dependencies at runtime. Users authenticate via GitHub's device flow and
browse their starred repositories in a hand-written terminal UI.

It was an Ink + React + SQLite app; see `README.md` for why none of that stack survived
the port and what each source file replaces.

## Commands

```bash
pnpm build      # scriptc build source/main.ts -o gittles
pnpm coverage   # how much compiles statically, and what blocks the rest
pnpm test       # oxfmt --check, oxlint --type-aware, tsc --noEmit, vitest run
pnpm format     # oxfmt
pnpm lint       # oxlint --type-aware

pnpm exec vitest run source/ansi.test.ts   # a single test file
pnpm exec vitest run -t 'tolerates tag prefixes'
```

Building needs `clang`. On Linux, zig works via a `clang` → `zig cc` shim on `PATH`,
because scriptc's vendored mbedtls/quickjs builds invoke `clang` directly and ignore
`SCRIPTC_CC`.

## Architecture

- **Entry point**: `source/main.ts` — argv dispatch (browse, sync, login, logout, update)
- **UI**: `source/browser.ts` — one `render()` returning a frame, drawn with a line diff
- **Storage**: JSON files in `~/.config/gittles`
- **Releases**: `.github/workflows/release.yml` cross-compiles every target from one
  Linux runner, which only works because the binary is 100% static tier
- **Testing**: vitest over the pure helpers; the terminal behaviour is exercised by
  driving a real pty

## Writing code for scriptc

The compiler accepts a subset of TypeScript. Constraints that have already bitten:

- **Arrays are dense.** An out-of-bounds read traps rather than yielding `undefined`.
  Guard every index.
- **`JSON.parse(x) as T` validates.** Extra fields are fine, but a missing or
  mistyped declared field throws — which is how a schema change surfaces. Parsing
  stored data belongs in a `try`/`catch`.
- **Optional record fields** are supported; make new config fields optional so an older
  config still parses.
- **No `Date` beyond `Date.now()` and `new Date(ms).toISOString()`**, no `Intl`, no
  `toLocaleString`. `source/ansi.ts` hand-rolls ISO parsing and digit grouping.
- **`node:crypto` is hashing and randomness only** — no asymmetric key operations.
- **Not lowered**: `fs.renameSync`, `process.stdout.columns`, `SIGWINCH`,
  `then()` with two arguments, `Number.prototype.toString(radix)`.
- Prefer explicit loops over unfamiliar array methods, and check `pnpm coverage`
  when something does not compile — the diagnostics name the exact unsupported site.

## Rendering rules

Breaking any of these makes the UI visibly judder; see the README section for detail.

1. The frame is `rows - 1` lines tall, with no trailing newline.
2. Every line is clamped to the terminal width, and auto-wrap stays off.
3. Repaints touch only changed lines, and only on real input — never on a size report.
