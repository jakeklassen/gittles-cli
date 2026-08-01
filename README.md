# gittles

Browse your GitHub stars from the terminal. A single native binary — **no Node, no V8,
no JavaScript engine, and no npm dependencies at runtime** — built from ordinary
TypeScript with [scriptc](https://github.com/vercel-labs/scriptc).

`scriptc coverage` reports **943/943 statements static (100%)**: 4.2 MB, ~11 ms to first
frame, against ~500-1300 ms for the previous Ink implementation.

## Install

```console
$ curl -fsSL https://raw.githubusercontent.com/jakeklassen/gittles-cli/main/install.sh | sh
```

## Source layout

Every file replaces a dependency the Ink version needed:

| File                 | What it replaces                                                        |
| -------------------- | ----------------------------------------------------------------------- |
| `source/github.ts`   | `@octokit/rest` — one `node:https` request fn, `JSON.parse(body) as T`  |
| `source/auth.ts`     | `@octokit/auth-oauth-device` — device flow with polling                 |
| `source/store.ts`    | `@libsql/client` + drizzle + `conf` — JSON files in `~/.config/gittles` |
| `source/ansi.ts`     | `chalk` + `supports-color` + `date-fns` + `Intl`                        |
| `source/terminal.ts` | `ink`'s input layer + `open` + `terminal-size` — key decoding, `stty`   |
| `source/browser.ts`  | `ink` + `react` — the whole TUI as one render function                  |
| `source/spinner.ts`  | `ink-spinner` — braille spinner + progress bar                          |
| `source/banner.ts`   | `cfonts` — its `block` font art, in both color layers                   |
| `source/update.ts`   | `update-notifier` — release check, verified download, self-replace      |
| `source/main.ts`     | `meow` — `process.argv`                                                 |

## What it looks like

```console
$ gittles
★ GITTLES  │  jakeklassen
300 stars · synced 1h ago · 300 shown
────────────────────────────────────────────────────────────────────────────
/ to search
    g9wp/sdl3-deno                            ★ 18     2mo ago  TypeScript
    vercel-labs/scriptc                    ★ 2,606     26m ago  TypeScript
❯   earendil-works/pi-review                 ★ 280     12d ago  TypeScript
    A review extension for Pi
    ccusage/ccusage                       ★ 17,634     11m ago  Rust
    schollz/croc                          ★ 39,198      3h ago  Go
────────────────────────────────────────────────────────────────────────────
1/300  v0.3.0  2 marked · c to unstar
↑↓/jk move · / search · o open · d mark · c commit · ? help · q quit
```

The selected row gets a 256-color background, its description sits directly beneath it
in dim text, marked rows go red + struck through, and languages are colored from a
small GitHub-palette map.

One line of the list area is permanently reserved for that description — emitted blank
when the repo has none — so moving the selection never reflows the list. Without the
reservation, stepping onto a repo with a description would push every row below it
down by one.

`sync` drives the spinner from a progress callback threaded through `fetchStars`. With
a limit the total is known, so it renders a bar; without one it counts up per page:

```console
$ gittles sync 250
⠹ ███████████████████░░░░░ 80% 200/250 stars
✔ synced 250 stars  +12 new  -3 gone

$ gittles sync
⠧ fetched 1,700 stars (page 17)…
✔ synced 2,934 stars  +2934 new  -0 gone

$ gittles sync          # with a stale token
✖ sync failed: fetching stars failed (HTTP 401): { "message": "Bad credentials", … }
```

The banner is cfonts' `block` font art, byte-identical to what `cfonts.say('Gittles')`
emits, and colored the way `colors: ['cyan', 'yellow']` colored it: cfonts paints that
font in two layers, so `█` (the face) is cyan and the `╔═╗` outline is yellow.
`colorize` emits one escape per run of same-layer characters rather than per character.

```console
 ██████╗ ██╗████████╗████████╗██╗     ███████╗███████╗
██╔════╝ ██║╚══██╔══╝╚══██╔══╝██║     ██╔════╝██╔════╝
██║  ███╗██║   ██║      ██║   ██║     █████╗  ███████╗
██║   ██║██║   ██║      ██║   ██║     ██╔══╝  ╚════██║
╚██████╔╝██║   ██║      ██║   ███████╗███████╗███████║
 ╚═════╝ ╚═╝   ╚═╝      ╚═╝   ╚══════╝╚══════╝╚══════╝
```

Login is the real GitHub device flow — POST for a code, open the browser, poll until
authorized:

```console
  1. open https://github.com/login/device
  2. enter the code 8963-D75A
  (opened in your browser)
⠹ waiting for authorization…
```

The cursor is restored on every exit path, including failures and Ctrl-C.

## Things worth knowing if you work on it

- **Color detection is real**: `NO_COLOR`, `FORCE_COLOR`, `TERM`, `COLORTERM` and
  `process.stdout.isTTY` (which _is_ lowered, unlike `.columns`). Piping the output
  turns color off automatically.
- **Nested styles need care.** A nested reset (`ESC[0m`) also clears the row
  background, so `rowLine` re-opens the highlight after each one.
- **`JSON.parse(x) as Star[]` throws on a schema change.** That is the documented
  "lying cast" divergence, and it fires on a stale `stars.json`. `loadStars` catches it
  and reports an empty cache so the app re-syncs instead of crashing.
- **Only what GitHub accepted leaves the store.** A failed unstar keeps the repo in the
  list and keeps it marked; the first version dropped it locally, which is a data-loss
  bug the 401 test caught.
- **Frame geometry is the whole game.** Three rules keep the UI from juddering as the
  selection moves, and breaking any one of them is immediately visible:
  1. The frame is `rows - 1` lines tall. Emit as many lines as the terminal has rows
     and it scrolls.
  2. No trailing newline after the last line — same reason.
  3. Every line is `clampToWidth`'d and auto-wrap is off (`ESC[?7l`), so an overflowing
     line is cut instead of wrapping onto the next row. This matters because printable
     width is counted in JS characters, while emoji and CJK take two columns.

  The list area is padded to a fixed line count for the same reason — including the
  empty-search state, which used to add a line and shift everything below it.

- **Only repaint on real input, and only the changed lines.** Two flicker sources that
  a full-frame repaint hides until you look for them:
  - The stdin handler used to redraw at the end of _every_ chunk — and the size-query
    answers are chunks, so idle repainted the whole screen 10×/s at a 100 ms poll
    (107 KB per 3 idle seconds). Size reports are now consumed without a repaint:
    **3.7 KB per 3 idle seconds, one frame.**
  - `draw(state, false)` diffs against the previous frame and rewrites only changed
    lines with `ESC[<row>;1H`. A keypress is **541 bytes and four line writes**, not a
    3.5 KB full-screen repaint. `draw(state, true)` forces a full paint for the first
    frame and after a resize.
  - Every frame is wrapped in **DEC 2026 synchronized output** (`ESC[?2026h/l`), so a
    terminal cannot present a half-written frame. Windows Terminal, kitty, iTerm2 and
    WezTerm honour it; others ignore it harmlessly.

## Terminal polish: what the static tier gives you

All verified by building and running, not assumed:

- **Spinners** — `setInterval` animates all 10 braille frames _while a real HTTPS request
  is in flight_; the event loop is epoll on Linux, so timers and I/O interleave properly.
- **Progress bars**, colors, `\r` + `ESC[2K` line rewriting, cursor hide/show, alt screen.
- **Ctrl-C cleanup** — `process.on('SIGINT')` fires, so the cursor and main screen can be
  restored on exit.

Two gaps, both about **terminal size** — neither is fatal, but both need working around:

- `process.stdout.columns` is SC2020-blocked — and the spelling the compiler's own hint
  suggests (`(process.stdout as typeof process.stdout & { columns?: number }).columns`)
  still errors. Worth reporting upstream. `$COLUMNS`/`$LINES` then `stty size` covers it.
- `SIGWINCH` is not in the supported process-event set (`SIGINT`, `SIGTERM`, `exit`,
  `warning`, `unhandledRejection`, `rejectionHandled`), so a resize raises no signal.

## Self-updating

`gittles update`, or `u` on the footer notice in the browser:

```console
⠹ downloading gittles-linux-x64…
⠙ verifying checksum…
✔ updated 0.1.0 → v0.2.0
```

The footer shows the running version, and swaps it for the notice when a newer
release exists. The check runs **after the first frame**, never before it — a network round-trip would
cost more than the entire rest of the program — and at most once every 24 h, cached in
`config.json` alongside a `skippedVersion` so a declined release stops nagging.

Installing is download → verify → swap:

1. `GET /repos/{repo}/releases/latest`, pick the asset named for
   `process.platform`/`process.arch`.
2. Follow the 302 to `objects.githubusercontent.com`, collecting **Buffers** — decoding
   to a string corrupts the executable.
3. SHA-256 the payload with `node:crypto` (which does lower statically) and compare it
   against the release's `checksums.txt`. **No checksum, no install.**
4. Write beside the target so the move is a rename within one filesystem, `chmod 755`,
   then swap.

Swapping the binary that is currently executing needs care, and the behaviour was
tested against a genuinely running process:

```
a) direct overwrite : OSError: Text file busy (errno 26)
b) rename over it   : OK
c) unlink + rewrite : OK
running process still redrawing: True
```

So the obvious approach fails. `fs.renameSync` has no scriptc lowering, so this uses
`spawnSync('mv', ['-f', staged, target])`; the running process keeps its old inode
either way. `process.execPath` locates the binary — `process.argv[1]` does not, it is
whatever was typed (`./gittles`).

Verified end to end against a real release (`GITTLES_UPDATE_REPO` and
`GITTLES_UPDATE_ASSET` exist to point the updater at somebody else's releases):

```
✔ updated 0.1.0 → v2.97.0
  size now: 13391688 bytes (expected 13391688)
3e2d4a166da4ee5020c592737b65eec0e724946d5d5b962f5fe59d99116dc4bf  gh_2.97.0_windows_arm64.zip
3e2d4a166da4ee5020c592737b65eec0e724946d5d5b962f5fe59d99116dc4bf  ./gittles
```

Both refusal paths were exercised too: an asset missing for this platform, and an asset
with no published checksum.

Not done yet:

- **Signing.** TLS plus a checksum from the same origin protects against corruption, not
  against a compromised release. Real signing needs ed25519 verification, unprobed.
- **Windows** cannot unlink a running exe but can rename it: move self aside, write the
  new one, delete the leftover on next start.
- **Root-owned install dirs.** `installUpdate` checks `W_OK` first and refuses with a
  message rather than downloading 4 MB and then failing.

Because the app is 100% static, `SCRIPTC_CC=zigcc SCRIPTC_TARGET=…` cross-compiles every
platform binary from one machine — the release job that feeds this is a single matrix-free
CI step. (A `--dynamic` build could not do that.)

## Resizing without SIGWINCH

`watchSize` polls instead, preferring a route that forks nothing:

1. Every 250 ms it writes `ESC[18t` (XTWINOPS, "report text area size in characters").
   The terminal answers **on stdin** with `ESC[8;<rows>;<cols>t`, which `decodeKeys`
   tags as `size-report` so it is consumed before key handling ever sees it.
2. If no answer ever arrives — XTWINOPS is optional and some terminals disable it —
   a slower 2 s timer shells out to `stty size` instead.

On a change, `resize()` re-clamps the scroll, issues a full `ESC[2J` (leftovers from
the old geometry would survive the usual per-line erase) and repaints.

Verified against a real pty with `TIOCSWINSZ` — the same ioctl dragging a window edge
performs — in both modes:

```
XTWINOPS queries answered: 9      `stty` fallback used: no
  frame   0: 27 lines x 100 cols
  frame   5: 19 lines x  60 cols
  frame   9: 44 lines x 140 cols
position indicator across frames: ['1/3621']   ← replies never leaked into input
```

Cost: a 5-byte write per tick, or one `stty` fork every 2 s on terminals that need it.
The poll cadence is 100 ms by default and tunable with `GITTLES_RESIZE_MS`, measured
from the ioctl to the first frame at the new width:

| poll   | min   | median | max    |
| ------ | ----- | ------ | ------ |
| 250 ms | 19 ms | 148 ms | 226 ms |
| 100 ms | 8 ms  | 40 ms  | 90 ms  |
| 50 ms  | 14 ms | 31 ms  | 52 ms  |

Median tracks half the interval, as polling does. 100 ms puts the median inside the
~100 ms window where a response still reads as immediate; 50 ms buys ~10 ms more for
double the wakeups, which is not worth it.

## Installing

```console
$ curl -fsSL https://raw.githubusercontent.com/jakeklassen/gittles-cli/main/install.sh | sh
```

Defaults to `~/.local/bin`, which keeps `gittles update` working without sudo.
`install.sh` derives the asset name from `uname` using Node's platform/arch spelling —
the same names `assetNameFor()` builds — verifies the SHA-256 against the release's
`checksums.txt` (and refuses without one), and warns if the install directory is not on
`PATH`. `GITTLES_INSTALL_DIR`, `GITTLES_VERSION`, `GITTLES_TAG`, `GITTLES_REPO` and
`GITTLES_ASSET` override the defaults; `GITTLES_VERIFY_ATTESTATION=1` additionally
verifies build provenance through the gh CLI. The whole script is wrapped in `main()`
and invoked on the last line, so a truncated download cannot half-execute.

## Developing

```console
$ pnpm install                    # scriptc, plus @types/node for its typecheck gate
$ pnpm build                      # needs clang; on Linux, zig works via a clang shim
$ pnpm test                       # oxfmt, oxlint, tsc, vitest
```

On Linux the vendored mbedtls/quickjs builds invoke `clang` directly and ignore
`SCRIPTC_CC=zigcc`, so put a `clang` → `zig cc` shim on `PATH` if you only have zig.

## What does not survive the port

Each of these was compiled and run, not assumed:

- **ink 6** — builds, then aborts: `WebAssembly.instantiate is not supported`
  (yoga-layout is wasm; the island also has no `Intl`).
- **@libsql/client** — aborts: `Neon: unsupported Linux architecture` (native N-API addon).
  `node:sqlite` is rejected at compile time (SC1010) and FFI to libsqlite3 isn't possible
  yet (no pointer returns, no callbacks).
- **conf** — aborts in the island's `node:util` shim.
- **@octokit/rest** — SC2008: its intersection type has no runtime shape.
- **meow** — SC1090: `import.meta` has no equivalent in a compiled binary.
- **blessed / neo-blessed** — `Cannot find module './widgets/node'`: builds require paths
  dynamically, so nothing can be embedded at build time.
- **OpenTUI** — requires Bun's `bun:ffi` and a per-platform native Zig library. Not portable
  to scriptc at all.

## The one React option: ink 3

ink 3 uses `yoga-layout-prebuilt` (emscripten **asm.js**, no wasm), and it does render
inside a scriptc `--dynamic` binary — flexbox, borders, colors — with two patched deps:

```js
// node_modules/yoga-layout-prebuilt/yoga-layout/build/Release/nbind.js
// the island's TextDecoder is utf-8 only; emscripten has a pure-JS UTF16 fallback
-var UTF16Decoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-16le") : undefined;
+var UTF16Decoder = undefined;
```

```js
// node_modules/patch-console/build/index.js
// the island's node:console shim has no `Console` class ("not a function")
-const internalConsole = new console.Console(stdout, stderr);
+// no-op: ink only uses this to capture console output while mounted
```

Cost: 5.9 MB binary and ~140 ms startup (quickjs parsing ~1 MB of asm.js yoga) versus
4.0 MB / ~1 ms for the hand-rolled renderer here, plus a permanent pin to ink 3.
