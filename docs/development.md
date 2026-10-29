# Developing Ark

Ark is its own repository: the web page (D-L71), with its tests, fixture
preview and keycode catalog generation. Ordinary app commands read only this
checkout (D-L44). Firmware compilation, authored C profiles, hardware
measurements and diagnostics belong to the firmware repository. How a change
is made and handed back is in [AGENTS.md](../AGENTS.md); this page is the
reference behind it.

## Local development workspace

On Noah's Macs the checkouts sit side by side in one workspace folder
(`/Users/noah/dev/charybdis` on his main Mac, opened through
`charybdis.code-workspace`). A Mac has only the ones it works on:

| Folder | Role |
| --- | --- |
| `charybdis-ark` | This repository; make Ark changes here or in a task worktree |
| `charybdis-4x6` | The firmware: its C implementation, tests and specs |
| `bastardkb-qmk` | The BK fork of QMK the firmware builds against; inspect it, never treat it as app source |
| `builds` | Build artifacts (a symlink into iCloud Drive), not source |
| `charybdis-notes` | The work-queue vault: notes, tasks, plans, keyboard checks and the tools; its `AGENTS.md` governs claiming and status |

From the main checkout the others are `../charybdis-4x6` and so on. From a
task worktree the workspace is the folder above the main checkout:

```sh
workspace="$(dirname "$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")")"
git -C "$workspace/charybdis-4x6" status --short
git -C "$workspace/charybdis-4x6" worktree list
git -C "$workspace/charybdis-ark" worktree list
```

Use the worktree named for the task; the main checkout need not hold another
agent's branch. On another machine, take paths from its workspace file or the
paths you were given, and check they are repository roots. These paths never
go into app code or ordinary tests.

Two sources of firmware truth, for two questions:

- **What firmware does now**: the firmware checkout itself (its `AGENTS.md`,
  `GLOSSARY.md`, `docs/adr/`, `docs/spec/`, `docs/architecture/` and
  `users/noah/`). It may be dirty; give
  its revision and dirty state when comparing behaviour. Reading it is
  developer inspection and does not couple the app to it; editing it needs a
  task that covers it.
- **What Ark is pinned to**: the [upstream](../upstream/README.md) copies
  and manifest. They lag firmware development by design; do not re-pin just
  because the firmware moved.

Separate agents use separate worktrees. The [compatibility
bridge](#the-compatibility-bridge) reads three checkouts as they are, so agree
a quiet period with agents changing them and pass the paths actually under
test. Firmware's contract probe, which the bridge and
[agreement](#agreement-with-a-firmware-contract) call, runs in firmware's
build image, so Docker must be running. Nothing reserves the keyboard:
coordinate before using it, close other Ark tabs or diagnostic sessions first,
and never flash or Apply just to check an editor change. The fixture preview
and app tests need no keyboard.

## Development

### Working on Ark

Use Node 26.10.0 or newer (`nvm use` reads `.nvmrc`; `engines` says the
floor), run `npm ci`, then
`npm run check`. `npm run web` serves the page you are working on in Chrome
([the web build](#the-web-build)); `npm run preview` the interface against the
test fixtures. No firmware or QMK checkout is needed. Only the
cross-repository commands (`test:compat`, `agreement`, `pins`, `upstream`) and
`npm run keycodes -- --qmk PATH` read another checkout, and only the ones you
name.

`.editorconfig` sets whitespace; in VS Code, **Check Charybdis Ark** is the
default test task and `.vscode/settings.json` picks the formatters
and leaves Markdown unformatted on save.

### Commands

```sh
npm run check                # syntax across the tree, strict types, then all tests
npm test                     # the tests alone
npm run typecheck            # the strict type checks alone
npm run keycodes -- --check  # the vendored catalog reproduces from upstream/qmk
npm run preview              # preview/ from the test fixtures
npm run preview -- --device  # …or from the keyboard plugged in, read-only
npm run test:browser         # every Playwright spec, Chromium required
npm run probe:live-link      # list matching HID interfaces over node-hid, opening none
npm run build:web            # the web page into dist/web/
npm run web                  # build, then serve it at http://localhost:8975/
npm run check:site           # dist/web/ is static files only
npm run test:compat -- …     # the compatibility bridge
npm run agreement -- …       # agreement with a firmware's contract
npm run pins -- …            # are the pins on the published trunks
npm run upstream -- …        # re-pin or check upstream/
```

The cross-repository commands are described [below](#upstream-pins).

### The code's layout

```
core/            the app, with no shell dependency and no DOM (D-L71)
  transport/     device adapters and the request coordinator
  schema/        profile byte formats and domain codecs
  protocol/      wire formats spoken to the keyboard
  model/         complete documents, edits, review and layer rewrites
  session/       state across a connection, the draft, the shared panel loop
  data/          inert vendored data: the keycode catalog, the layout
rules/           firmware rules core and the interface both run, ES modules (D-L73)
contracts/       declarations for data posted between shell and panel; no code
webview/         the interface: browser ES modules, no build step
  lib/ view/     pure helpers and model → presentation, with tests
  ui/            the frame, screens and components
  styles.css     the design system
web/             the web shell and build entries
scripts/         developer entry points and build steps
tests/           mirrors core/; rules/ the shared rules, view/ the interface,
                 scripts/ the developer tools, integration/ the bridge's
                 runners, types/ compile-time cases
browser-tests/   Playwright specs: the preview's controls and the built page
upstream/        pinned firmware and QMK inputs; read its AGENTS.md
preview/ dist/   ignored output of `npm run preview` and `npm run build:web`
```

What each part may import, the shared rules in `rules/` among them, is in
[architecture](architecture/README.md#the-layers), and
`tests/layering.test.js` enforces it. How `core/` reads, edits and applies is
in [`core/README.md`](../core/README.md).

The app runtime never reads the firmware repository. These developer-only
tools may read explicitly selected checkouts, and nothing in the app imports
them:

- `scripts/generate-keycode-catalog.js` regenerates the vendored catalog
  (D-L05).
- `scripts/refresh-upstream.js` re-pins or checks `upstream/` from committed
  blobs.
- `scripts/check-compatibility.js` is the
  [compatibility bridge](#the-compatibility-bridge).
- `scripts/check-agreement.js` judges a firmware's stated contract
  ([agreement](#agreement-with-a-firmware-contract)).
- `scripts/preview.js` renders the interface against the test fixtures.
- `scripts/build-web.js` builds [the web page](#the-web-build).
- `scripts/probe-live-link.js` lists the keyboards node-hid sees.
- `scripts/generate-host-layouts.js` (`npm run host-layouts`) regenerates
  `core/data/host-layouts.json` from the pinned firmware fixture;
  `tests/data/host-layouts.test.js` checks it still reproduces.

node-hid is an optional dependency, so a native build that fails never stops
the page's `npm ci`; without it the probe says so and stops. Which adapter
each caller passes is in [architecture](architecture/README.md#the-layers). A
Node script that drives a keyboard, as `npm run preview -- --device` does,
passes the node-hid adapter to the device service itself:

```js
const {ProfileDeviceService} = require("./core/session/profile-device-service");
const {NodeHidDeviceAdapter} = require("./core/transport/node-hid-adapter");
const service = new ProfileDeviceService({adapter: new NodeHidDeviceAdapter()});
```

Close any Ark tab first: one connection at a time holds the keyboard.

### Type checking

Ark checks its JavaScript with strict TypeScript and emits nothing (D-L59);
`npm run typecheck` is part of `npm run check`. Each environment has its own
configuration, and `checkJs` takes in new modules under its `include`
automatically:

| Configuration | Checks | Environment |
| --- | --- | --- |
| `tsconfig.rules.json` | `rules/` | no Node types, no DOM; a rule runs in both |
| `tsconfig.json` | `core/`, `rules/`, `contracts/` and core's type tests | Node types only; the type tests import only core and contracts (`tests/layering.test.js`), so core cannot lean on a type only something above it brings |
| `tsconfig.shells.json` | `web/` | page DOM, no Node globals |
| `tsconfig.webview.json` | `webview/` | page DOM, no Node types |
| `tsconfig.worker.json` | `web/sleep-worker.js` | WebWorker |
| `tsconfig.developer.json` | `scripts/`, `tests/fixtures/`, integration corpora | Node |
| `tsconfig.preview.json` | the preview builder, macro inspector and `playwright.config.js` | Node and DOM |

Every module marked `// @ts-check` outside `tests/` and `browser-tests/` is in
one of these (`tests/scripts/syntax-coverage.test.js`).

One gotcha in the web shell's check. `Buffer` is its one Node-shaped global:
the build injects the `buffer` package (`web/buffer.mjs`), and
`web/bundled-buffer.d.ts` declares the members core uses, so a new one is
added there.

Rules for typed code:

- Posted data is declared once in `contracts/` (`messages.d.ts`, `panel.d.ts`,
  `model.d.ts`, `edits.d.ts`); neither it nor the interface imports core types.
  Type-only imports obey the layer rules. Internal declarations sit in the
  layer that owns them.
- A type import names the file with its runtime extension
  (`import("./types.js")` for `types.d.ts`, `.mjs` for an ES module) and uses
  that file's quotes: double in JavaScript, single in `.d.ts` and type tests.
- A type describes a value after validation. Device bytes and imported files
  still go through the runtime validators. Use concrete types or `unknown` at
  unvalidated inputs; an assertion needs a checked invariant.
- Mark a covered module `// @ts-check`. `npm run typecheck` uses the
  configuration's `checkJs`, but an editor finds only `tsconfig.json`, so
  without the pragma it shows no errors for the interface, the web shell or
  scripts.
- Compile-time cases live in `tests/types/`; a rejection case uses
  `@ts-expect-error`, so a missing error fails the check.

### Test fakes

Tests use injected device adapters (`core/transport/fake-device-adapter.js`).

- `tests/fixtures/connected-service.js` gives a connected
  `ProfileDeviceService`: it scans and connects to the fake keyboard as the
  panel does, rather than assigning the service's connection or capabilities.
  Replacing the adapter's `keyboard` makes it answer as another keyboard.
- `tests/fixtures/fake-keyboard.js` is a read-only simulated Charybdis that
  answers byte for byte. It backs the preview and the browser tests (through
  `browser-tests/fake-hid.js`).
- `tests/fixtures/writable-keyboard.js` takes Apply: candidate and store
  reports, both halves' profile records, the durable decision, the slave
  half's commit and activation. Its faults exercise BUSY, lost replies,
  cancellation and disconnected recovery. Restore tests call `restoreProfile`
  with a request connection and a test clock (`now`, `sleep`), as the device
  service passes its own (`tests/fixtures/portable-restore.js`).
- `tests/fixtures/panel-loop.js` runs the panel loop as the page does, for
  session tests: `fakeShell` records what the loop posts (`lastMessage`,
  `lastModel`, `notices` read it back), `testClock` moves on at every wait
  the loop asks for instead of waiting, and `openLoop` opens the loop on a
  fake keyboard, on that clock unless given another, and reads it once.
- `tests/fixtures/published-model.js` gives the interface's tests the model
  core publishes, built by core's own builders: `publishedModel` for a
  profile (the demo's unless given) with edits staged as the panel posts
  them, `panelModel` for the panel's whole model of a draft (`openDraft`), and
  `connectedState` for a connected keyboard. A fact renamed or reshaped in
  core fails the view tests too.

These fakes model protocol state and transfer correctness, not flash
durability, split scheduling or a physical interruption. A successful
`npm run probe:live-link` proves only that node-hid loads and enumerates.

### Running it without a keyboard

Run `npm run preview`, serve the folder (`node scripts/serve.js . --port 8972`)
and open `preview/index.html`. The page stands in for the web shell: it
answers the panel's `ready` with one fixture model, turns the theme toggle,
and logs every edit posted back. `?shell=` answers in other states (no
keyboard, a browser without WebHID, the demo, a live keyboard; each is
commented in `scripts/preview.js`), `?theme=light` starts in the light theme,
and `?screen=lighting` opens a screen. `npm run preview -- --multiple` adds a
second keyboard to the selector. Like the web page it requires Trusted Types,
so markup a test sets in it goes through `html` in `webview/lib/dom.mjs` too.
Look at a new screen in both themes.

### Proving a control is wired

A control that posts nothing looks exactly like one that works, and unit tests
stage payloads rather than press buttons. When a screen gains an editable
control, drive it in the preview, which logs every post to `window.__posted`:

```js
// change one control, then press the screen's own save button if it has one
window.__posted.length = 0;
el.value = "777"; el.dispatchEvent(new Event("change", {bubbles: true}));
// the sentinel has to appear in what was posted
JSON.stringify(window.__posted).includes("777");
```

This catches a field with no listener, and a field rendered twice whose second
registration wins so edits to the visible one are dropped. Then pin the
payload in `tests/view/edits.test.mjs`.

### Verification

Which checks a change runs before it is handed back is the one list in
[AGENTS.md](../AGENTS.md#checks). Preview or setup changes add
`npm run preview`, and a docs-only change may skip the runtime checks; say so.

The handoff gate is the work-queue vault's `verify`. For a branch of Ark it
always runs `npm ci`, loads node-hid, `npm run check`, catalog reproduction,
`upstream/` reproduction from the pins, the compatibility bridge and agreement
against the pinned firmware and QMK, docs-only changes included. Interface,
preview, browser-test or dependency changes add the preview and browser
smoke; `--full` runs them always. The firmware host suite and pair build are
not Ark gates.

Run the bridge yourself, against the checkouts involved, before handing back a
change that [the checks](../AGENTS.md#checks) send to it; UI-only work needs
only the app checks while developing. A local pin may name any committed
firmware revision. Before landing a change that moves a pin, fetch the
firmware checkout and run the bridge with `--publish`; `land` refuses a pin
that is not on its published trunk. No automated check is hardware acceptance.

### Trying a branch before it lands

A branch is tried through its pull request's preview: Cloudflare Pages builds
every pull request's head and serves the branch at its Branch Preview URL,
which follows the branch's latest build, given in Cloudflare's comment or
check on the pull request. Open that **Try this PR** link in Chrome or Edge
once the build has succeeded and the page's footer shows the head's commit
([publishing the web page](#publishing-the-web-page)).
The preview has its own origin, so its recovery copies and remembered
keyboard are its own; close any other Ark tab first, since one tab holds the
keyboard. To try a branch locally instead, `npm run web` in its worktree.

### The web build

The web page (D-L71) runs `core/` and the panel in Chrome or Edge.
`npm run build:web` writes the complete static site into the ignored
`dist/web/`; the file list, content hashing, version stamp (`ARK_COMMIT`
overrides git), Content Security Policy (`POLICY`, written once) and
`_headers` are described at the top of `scripts/build-web.js` and
`web/_headers`. `dist/web-manifest.json`, beside the site, maps hashed names
for tests and is never published. The bundles are minified with their names
kept, so a stack still names the source's functions; a test asks the build
for each bundle's inputs rather than reading them out of the output.
`npm run check:site` refuses anything Pages would run as server code, and a
site without its Content Security Policy, as a header and in the page, its
Trusted Types allow-list exactly the page's two policies, or without the
opener policy and HSTS `web/_headers` sends.

`core/`, `rules/` and `webview/` stay unbuilt source, and no module of `core/`
is rewritten for the browser. `rules/` reaches both the core and the panel
bundles. The build fails if node-hid, its adapter or any Node built-in would
reach a bundle, or a bundle takes any package but `buffer`. To give the web
shell more of `core/`, export it from `web/core.mjs` and name it in
`tests/scripts/web-build.test.js`, which pins the entry to what its readers
use.

The shell runs `core/` and the interface through the shared panel loop; what
it offers reaches the interface as `model.shell`. What it does, and why, is
in the file comments of `web/`: the click-time `gesture` path Chrome's
keyboard picker and file chooser need (`web/panel-channel.mjs`), the Web Lock
that makes a second tab wait, the `beforeunload` warning, the worker clock
that background tabs do not throttle, recovery copies in IndexedDB, and the
phone notice (`web/phone.mjs`). A browser shell needs a secure context
(HTTPS or localhost) for WebHID and the draft's `crypto.randomUUID()`.

To try it, `npm run web` and open `http://localhost:8975/` in Chrome or Edge.
Close any other Ark tab, and any Node script holding the keyboard, first.
Recovery copies made there stay in that origin's storage.

`npm run test:browser` builds the fixture preview and the page and runs every
spec in Chromium: the screens' controls and the edits they post, in both
themes, the bundle against Node (it must decode and re-encode every profile
fixture exactly), and the built page against a fake `navigator.hid` whose
keyboard is the read-only fake. Its specs load `core/` and the interface in
Node too, so Playwright leaves `rules/` to Node's own loaders
(`build.external` in `playwright.config.js`): its compiler would otherwise
give `require()` and `import()` of a rule the same compiled code. Install the
browser once with `npx playwright install chromium`. None of this tests Ark on
a keyboard.

### Publishing the web page

Cloudflare Pages' Git integration builds and publishes this repository; the
GitHub Actions workflows never upload the page.

| Branch | Where it goes |
| --- | --- |
| `main` | Production: `https://ark.ncleroy.dev` (and `charybdis-ark.pages.dev`) |
| `dev` | Preview: `https://ark-dev.ncleroy.dev` (and `dev.charybdis-ark.pages.dev`) |
| Task branches | Pull request previews with their own addresses |

Cloudflare runs `npm ci && npm run build:web`, no tests, and publishes
`dist/web/`. A failed build keeps the previous deployment. Its status gates
only publication; it is not one of `main`'s required checks and does not
stand in for `verify` or release CI. `npm run check` already holds the
static-output contract (`tests/scripts/web-build.test.js`,
`tests/scripts/check-static-site.test.js`).

A pull request handoff includes a **Try this PR** link only once that head's
Cloudflare build has succeeded and the page's footer shows that commit. The
link is the Branch Preview URL from Cloudflare's pull request comment or
check, which follows the branch, so the same link stays current as the
branch moves; never build the address from the branch name yourself.

**Cloudflare project settings (Noah).** In the `charybdis-ark` project,
connect `NoahCLR/charybdis-ark` with production branch `main`, framework
preset None, build command `npm ci && npm run build:web`, output directory
`dist/web` and the root directory blank. Set `SKIP_DEPENDENCY_INSTALL=1` for
Production and Preview, so that command's `npm ci` installs (`.nvmrc` picks
Node). Enable build comments, automatic production deployments and previews
for every non-production branch; watch paths `*`. Keep the custom domains
`ark.ncleroy.dev` and `ark-dev.ncleroy.dev` on the project; `ark-dev` needs
its proxied CNAME to `dev.charybdis-ark.pages.dev`, or it serves production.
See Cloudflare's [build
image](https://developers.cloudflare.com/pages/configuration/build-image/) and
[GitHub
integration](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/)
pages. To rebuild, use **Retry deployment** on the build in Cloudflare.

**Manual fallback**, from a clean checkout of the branch, testing the very
files it uploads:

```sh
npm ci && npm run build:web
npx playwright install chromium
ARK_WEB_BUILT=1 npx playwright test browser-tests/web-page.spec.js browser-tests/web-build.spec.js
npm run check:site
npx wrangler pages deploy dist/web --project-name=charybdis-ark --branch=dev   # or main
```

### CI and publishing

Development is verified locally, so GitHub Actions never runs on `dev` or on
pull requests into it (D-L51). A release's `dev` → `main` pull request runs
(`.github/workflows/check.yml`, `main-promotion.yml`):

- `check` on Linux and macOS: `npm run check`, catalog reproduction, the
  fixture preview, and loading node-hid;
- `browser`: `npm run test:browser` (Chrome installed by
  `scripts/install-chrome.sh`, which retries a stalled download);
- `compatibility`: the pins are published, `upstream/` reproduces from them,
  and the [bridge](#the-compatibility-bridge) passes with `--publish` at
  exactly the pinned firmware and QMK;
- `agreement`: [agreement](#agreement-with-a-firmware-contract) with firmware
  `main`, or firmware `dev` when the release marker says the release is joint;
- `Promotion from dev`: the head is this repository's `dev` and the merge tree
  is exactly `dev`'s.

Each action is pinned by its commit, with the tag in a comment, and `check`
also runs `git diff --check` on the pull request's change.

Gating on the pins lets firmware move ahead without turning Ark red: Ark
vouches for what it pins, and agreement proves the released pair
speaks one contract (D-L50). A release may keep an older pin that still
agrees.

Nightly, never blocking: `check` and `browser` on `dev`, agreement of Ark
`dev` with firmware `dev`, `compatibility with firmware dev (early warning)`
(the bridge against firmware `dev` and the BK trunk as they are; red means
re-pin with `npm run upstream` and follow in codecs and tests), and
`published mains agree` (Ark `main` against firmware `main`). Reports are kept
as artifacts. Firmware's own promotion runs the same check the other way
round (`Agreement with Ark main`).

`main` requires a same-repository `dev` → `main` pull request with
`Promotion from dev`, `check (ubuntu-latest)`, `check (macos-latest)`,
`browser`, `compatibility` and `agreement`, including for administrators.
Only the vault's `release` opens it and only `release --publish` merges it,
rechecking agreement for the pair first, when Noah asks; never push `main` or
bypass protection. Promotions are merge commits, so `dev`'s history stays
reachable, and their message is the pull request's title and body, so a
release's notes are its promotion's commit message. Task pull requests into
`dev` are squashed. `dev` and `main` cannot be force-pushed or deleted, `dev`
takes changes only through pull requests, and published `v*` tags cannot be
moved or deleted.

## Upstream pins

The firmware and QMK files Ark imports are reviewed copies under `upstream/`,
with commit and checksum provenance in `upstream/manifest.json`. Specs there
are copies of firmware-owned contracts; their code and bare firmware paths
refer to the pinned commit. Ark follows what the keyboard advertises, never
assuming it runs the pinned revision. How to re-pin, add a file or check
reproduction is in
[`upstream/README.md`](../upstream/README.md#updating-a-contract); never edit
fixture bytes to match the app.

## The compatibility bridge

The bridge (D-L45) runs Ark's codecs against the firmware's own C, from
explicitly selected checkouts:

```sh
npm run test:compat -- \
  --firmware ../charybdis-4x6 \
  --ark . \
  --qmk ../bastardkb-qmk \
  --report /tmp/charybdis-compatibility-$(date +%s).json
```

All four arguments are required. Each checkout must be a Git repository root;
the report must be a new file outside them. It needs Git, Node, Python 3, a C
compiler with the runners' sanitizer support, and Docker running for
firmware's contract probe. It installs and fetches nothing, and never touches
a keyboard.

In order, it:

1. compares every firmware file pinned in `upstream/manifest.json` with the
   selected firmware. A fixture that differs or is missing fails at once,
   because Ark's own tests would be checking stale bytes; re-pin `upstream/`.
   A spec that differs only lags: a warning, listed under `upstream.specs`.
2. checks that the pins are published: firmware pins on the firmware
   checkout's `refs/remotes/origin/dev`, QMK pins on
   `refs/remotes/origin/noah-userspace-contracts-dev`. It never fetches, so
   fetch both first. Unpublished is a warning locally and a failure with
   `--publish`.
3. runs the eight runners in `tests/integration/` in turn, stopping at the
   first failure. Their runner files come from `--ark`; their C probes and
   firmware sources from `--firmware`, exported as `FIRMWARE_ROOT`, with
   `CHARYBDIS_ARK_ROOT`, `QMK_ROOT` and `QMK_HOME`. What each runner proves is
   in [`tests/integration/README.md`](../tests/integration/README.md). A
   missing or incompatible source fails; no runner skips.

The report records each checkout's canonical path, starting revision and
dirty status (untracked files included), the Node version, times and each
runner's exit status; an incomplete report is not a pass. It tests the
checkouts as they are: do not edit them while it runs.

`npm run pins -- --firmware PATH --qmk PATH` checks only the ancestry, without
compiling; `--firmware-ref REV --qmk-ref REV` checks against a chosen local
history instead of the fetched trunks.

Ark owns these runners and their compilation recipes; firmware's suite and
build never need Ark. When firmware moves a source or changes its build
wiring, update the recipes here. `npm run check` tests the bridge's
orchestration against temporary repositories but never runs the real runners.
None of this replaces either repository's suite or hardware acceptance.

## Agreement with a firmware contract

The bridge proves the codecs agree byte for byte; agreement answers the
release question: does this Ark speak that firmware (D-L50)? Firmware states
its contract with `tests/host/run_contract_probe.sh` (the Profile Wire
capability pages its keyboard answers, its BK pin from `qmk-pin.json`, and its
fixture hashes), run in its build image. `npm run agreement -- --firmware
PATH --qmk PATH`, where `--qmk` is a BK checkout containing firmware's pin,
judges it with Ark's own runtime code. It fails unless:

- the capability pages decode with Ark's Profile Wire decoder;
- the Profile Wire and schema versions are exactly the ones Ark requires,
  major and minor (`SUPPORTED_PROFILE_PROTOCOL`, `SUPPORTED_PROFILE_SCHEMA` in
  `core/session/firmware-support.js`, D-L64);
- Ark knows the action-ABI digest (`KNOWN_ACTION_ABIS`);
- the firmware supports every domain Ark registers;
- it is a split build that saves (feature bits 0 and 1;
  `CURRENT_MUTATION_FEATURES` in `core/protocol/profile-wire-v1.js`). The
  feature word holds only build differences (firmware D-F28), so the pointing
  bit is reported, not compared;
- Ark's BK keycode and layout inputs equal those at firmware's BK pin (by
  content, not commit);
- Ark's pinned fixtures equal the firmware's.

Firmware version, compiled-default digest and capacities are reported, never
compared: they change with ordinary keymap edits. For the same reason Ark
imports no fixture the firmware regenerates from its keymap.

What can break Ark, and what checks it:

| Surface | Defined in | Ark learns it from | Checked by |
| --- | --- | --- | --- |
| Profile Wire channel | firmware `compat/qmk_profile_channel.c` | protocol and schema versions, feature flags | agreement; golden fixtures |
| Stored profile format (blob, domains, settings, compiled defaults) | firmware `lib/profile/schema/` | schema version | the bridge's runners; agreement (fixtures equal) |
| Action vocabulary and action-ABI digest | firmware, and BK keycode values | digest against `KNOWN_ACTION_ABIS` | agreement |
| Keycode catalog and layout | BK | Ark's pinned BK inputs | agreement (files equal at firmware's BK pin); `npm run keycodes -- --check` |
| Keymap and macro domains | firmware profile codecs and config | domain versions and capability capacities | golden codecs; candidate and macro-domain runners |
| Keyboard options (RGB effects and order, LED flags) | BK's RGB matrix and firmware config | reported at runtime | `qmk_portable_editor` runner |
| Behaviour on the keyboard | firmware | nothing | keyboard checks only |
