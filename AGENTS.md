# Charybdis Ark — Agent Instructions

This app edits the **connected keyboard**. Authored C defaults are edited
directly in the firmware repository; the app never edits those files.

Start with `git status --short`, then read the development setup in
[docs/REPOSITORY.md](docs/REPOSITORY.md#development-and-installation) and the reading map in [docs/README.md](docs/README.md). Read Current Product
Status and Open Issues in [the direction](docs/LIVE_EDIT_APP_DIRECTION.md)
before changing behavior; read its relevant decisions before architecture work.
The interface's rules are in [the guide](docs/GUIDE.md)'s "The interface"
section and the direction's decisions; `npm run preview` renders the real interface.

## How a change is made

Only Noah works on this repository. His private notes vault, `charybdis-notes`,
sits beside this repository's main checkout (from any worktree:
`"$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/../charybdis-notes"`). It holds the work queue and the tools every change goes through.
If it is there, read its `AGENTS.md` before your first change in a session:
**Every agent, wherever it starts** (work starts from a note or right here,
and Noah's commands have skills) and **Branches, landing and pushing** (your
own worktree on a `<type>/<slug>` branch from `dev`, `verify`, a draft pull
request with `open-pr` linked to the thread, landing only on Noah's
"land it" with `land`, `release` as the only way `main` moves, and saying
what each of Noah's commands will do before asking for it). The tools enforce
part of it; the rest is yours to follow. This file still governs the code
itself.

Without the vault: branch from `dev` as `<type>/<slug>`, run the checks this
file lists, and open a pull request into `dev` on `NoahCLR/charybdis-ark`. Never
push `dev` or `main` directly, and nothing goes upstream. Noah lands
and releases.

## Repository ownership

This repository is the app. On Noah's Macs, the checkouts sit side by side in
one workspace folder: the app (`charybdis-ark`), the firmware
(`charybdis-4x6`) and the upstream QMK build dependency (`bastardkb-qmk`),
whichever of them that Mac has. See the
[local workspace map](docs/REPOSITORY.md#local-development-workspace) for roles,
worktree discovery and how to inspect ongoing firmware work.

Agents may read those checkouts to understand current firmware behavior; the
runtime's repository-independence rule does not prohibit developer discovery.
Do not edit sibling repositories as part of an app task unless the user requests
it. Preserve unrelated changes, and inspect Git status before interpreting a
checkout as a committed baseline.

The imported contract files in [`upstream/`](upstream/README.md) have pinned
provenance and checksums. Read its instructions before changing them. No
ordinary test, preview, or catalog command may require a sibling checkout.

## The one rule

**The application runtime must not read the firmware repository.** No parsing `keymap.c`,
`config.h`, or `rgb_config.c`. No walking a QMK checkout at runtime. No
`vscode` import below `extension.js` and `panel-html.js`.

Developer-only tools, never imported by the application runtime:

- `scripts/generate-keycode-catalog.js` regenerates the vendored catalog.
- `scripts/refresh-upstream.js` re-pins or checks the `upstream/` snapshots from explicitly
  selected firmware and QMK checkouts (committed blobs only).
- `scripts/check-agreement.js` (`npm run agreement`) judges a firmware's stated contract with
  Ark's own runtime decoder and gating; required on `main` in CI.
- `scripts/preview.js` renders the interface against the test fixtures.
- `scripts/check-compatibility.js` runs Ark-owned integration runners against explicitly selected
  firmware source; it is never imported by runtime code.
- `tools/branch-window/` is a separate developer extension that opens Ark from
  any of its worktrees in a new window
  ([REPOSITORY.md](docs/REPOSITORY.md#trying-a-branch-before-it-lands)). It is
  its own VS Code shell, so it may import `vscode`; nothing in the app imports it.

## Layout

```
extension.js        VS Code surface only: command, panel, message relay
panel-html.js       the panel's HTML shell; the only host file that knows webview URIs
core/               the app, with no host dependency
  transport/        device adapters and the request coordinator
  schema/           profile byte formats and domain decoders
  protocol/         wire formats spoken to the device
  model/            complete portable documents and layer-reference rewrites
  session/          stateful orchestration across a connection
  data/             vendored data, e.g. the keycode catalog
webview/            the interface: browser ES modules, no build step
  lib/              colour and DOM helpers (pure)
  view/             model → presentation (pure, tested)
  ui/               screens and components
  styles.css        the design system
docs/               app-owned product direction, specs and contributor workflows
upstream/           pinned external contracts and inputs; read its AGENTS.md
scripts/            developer entry points and build steps
tools/              developer tools outside the app, e.g. the branch-window extension
tests/              mirrors core/, plus the view modules and the posted payloads
preview/            ignored generated previews, never authoritative source
```

## Documentation ownership

Use [docs/README.md](docs/README.md) to place new documentation. Update the
existing governing document first. Product behavior changes update
[docs/GUIDE.md](docs/GUIDE.md) and the relevant spec in the same pass, and
`README.md` when what a user can do changes. `README.md` is a short pitch for
Charybdis owners, in Noah's personal voice: what you can change, that nothing
is saved until reviewed, installing, and links; keep it short. `docs/GUIDE.md`
is for people using Ark in depth: how each screen, review, apply and backups
behave. Keep development material out of both: setup, commands, the code's layout, CI,
compatibility and release mechanics go in
[docs/REPOSITORY.md](docs/REPOSITORY.md#development-and-installation).
Architecture decisions update the direction or an app-owned spec. Keep Current Product Status and Open Issues accurate.
Each decision has one home: app decisions continue the D-L series here, while a
D-L heading marked as a firmware decision is only a pointer to the firmware
repository's direction, which owns that text. Change a firmware decision there,
as firmware work, not here.
Do not put app plans or new app specifications under `upstream/`.

Active plans live in the work-queue vault (below), not in this repository;
include scope, acceptance criteria and remaining work. When complete, fold
lasting rules into the governing document here and delete the plan (D-L07). Test logs and session narratives belong in reports,
commit messages or the final handoff, not permanent finding registers. Record
which checks actually ran and any limitations; never imply unit tests prove
hardware acceptance.

## Work queue

Work is filed, refined and planned in the work-queue vault,
`charybdis-notes` beside this checkout (an Obsidian vault; see the
[local workspace map](docs/REPOSITORY.md#local-development-workspace)). Its
`AGENTS.md` says how a note becomes a task and how a task is claimed and
handed back. It never overrides this file: every change here follows the
rules above, whichever way the task arrived. From a worktree, find it as
described under "How a change is made"; never copy it into this repository.

## Branches

`dev` is the trunk. Branch each task from `dev` in its own worktree, named
`<type>/<slug>` (`fix/`, `feat/`, `refactor/`, `docs/`, `chore/`; the work-queue
vault's `AGENTS.md`, "Branch names"; `open-pr` and `land` refuse any other name),
verify it,
and open a pull request into `dev` with the vault's `_agents/bin/open-pr`; when
Noah says so, the vault's `_agents/bin/land` merges it on GitHub (squash) for
exactly the verified commit, without waiting for CI. `dev` takes changes only
through pull requests and is never pushed directly. `main` is the released line and only moves by the vault's
`_agents/bin/release`, as a merge commit whose tree is exactly `dev`'s. Each
landed commit's message ends with what verify ran, and the firmware and QMK
commits it was tested against are the pins in its own `upstream/manifest.json`.
Push only to `NoahCLR/charybdis-ark`. The work-queue vault's
`_agents/bin/verify` runs this file's checks for what a branch changed
(adding the compatibility bridge for wire, schema or `upstream/` changes),
and `_agents/bin/land` merges a branch's pull request into `dev` after verifying
it. A pin to firmware or QMK names a commit on that repository's trunk, taken
after its landing (firmware squashes, so a landed commit has a new hash).

## Working alongside firmware agents

Use this repository for Ark changes. Older firmware checkouts may still contain
an in-tree app copy; it is historical and must not receive new app work.
Separate agents should use separate Git worktrees when changing this same repo.
Do not reset, stage or commit unrelated work left by another agent. The presence
of a sibling checkout does not authorize editing it.

The compatibility bridge reads three working copies: coordinate a stable period
with agents changing them, and use the actual worktree paths being tested.
The shared `verify` command serializes QMK pair builds; there is no device reservation system. Coordinate before
sharing a QMK build directory or opening the physical keyboard; close competing
Ark/VIA/diagnostic sessions. Fixture previews and ordinary app tests need no
device. Do not flash or Apply a profile merely to verify an editor change.

## Layer rules

Dependencies point one way. Adding an import that violates this is the moment to
stop and reconsider, not to work around. `tests/layering.test.js` enforces it.

| Layer | May import |
| --- | --- |
| `data/` | nothing — inert vendored content |
| `transport/` | `data/` |
| `schema/` | `data/` |
| `protocol/` | `transport/`, `schema/`, `data/` |
| `model/` | `schema/`, `data/` |
| `session/` | `transport/`, `protocol/`, `schema/`, `model/`, `data/` |
| `webview/` | nothing from `core/` — it receives the model as a message |

Every layer may also import from itself.

## Where new work goes

- A new device command or wire format → `protocol/`
- A new profile domain or byte layout → `schema/`
- Anything holding state across a connection → `session/`
- Portable documents, completeness and layer-reference rewrites → `model/`
- A new screen or component → `webview/ui/`
- A rule about what something *means* (a colour, a key face, a locality) →
  `webview/view/`, with a test. These modules are pure on purpose.
- The words for a value the keyboard stores (a hold helper, a locality, a
  pointing axis, a stage) → `core/model/vocabulary.js`. It reaches the
  interface as `model.vocabulary` (read it through `webview/view/vocabulary.mjs`);
  never write an enum-to-words table in a screen. A new enum value without a
  word fails `tests/model/vocabulary.test.js`.
- Naming an action, its native keycode, decode limits, a "Layer n" reference →
  `core/schema/actions.js`. The pointing-mode keycode registry and the key
  layout are inert data in `core/data/`, readable from every layer; the
  interface gets a slot's bindings as `pdModes[].binding`.
- What a panel control does in order (read, apply, discard, rebase, import,
  layers) → `core/session/panel-controls.js`. `extension.js` passes in only
  what a host has: progress, the recovery file, a chosen profile file.

## Conventions

- Decode a document once. A snapshot may carry its read-only `decoded` form;
  take it with `decodedOf(snapshot)`, which decodes afresh when the snapshot's
  document is not the one it was decoded from. Draft history entries are
  frozen and decoded once each, so a model publish decodes nothing new.
- A webview number that is also a wire number (pointing kinds, axes, buttons,
  modifier bits) is pinned to its schema by `tests/enum-drift.test.mjs`.
- Whether an area can be edited is `canEdit(area)` in `webview/store.mjs`,
  nowhere else.

- Every `core/` module gets a test in the matching `tests/` directory.
- Every edit the webview posts is built by a pure function in
  `webview/view/edits.mjs` (pointing records by `view/pointing-config.mjs`),
  and screens post what those return rather than assembling objects inline.
  `tests/edits.test.mjs` stages each builder's output against a real
  `ProfileDraftSession`, so a change of message shape fails there rather than
  on a keyboard.
- Markup is built with `el()` from template strings, so every value from the
  keyboard or the host goes through `esc()` (or `textContent`) — including in
  attributes. Nothing unescaped reaches `el()` or `innerHTML`.
- Decode defensively. Everything arriving from a device is untrusted input:
  validate length, reject noncanonical encodings, and fail with a stable code
  rather than a guess.
- Report device state verbatim, including zeros. A blanked value misreports the
  keyboard.
- Validate what the device rejects, not more. A profile the firmware would
  accept must not be refused here; where something is merely inert — a key bound
  to an empty pointing slot, for instance — the profile carries the fact and the
  interface explains the consequence.
- Look a key up by what its value means, never by what the keyboard calls it.
  A position carries both: `keycode` is the stored name (`QK_USER_16`, or bare
  hex where the vocabulary names nothing) and `semantic` is the name every other
  domain uses (`PD_SLOT_0`, `VIA_MACRO_0`, `LEFT_THUMB`). Behaviour rows, macro
  slots and pointing slots are keyed by the second, so a lookup goes through
  `keyMeaning(position)`; matching on `position.keycode` silently finds nothing.
- Colour comes from the model, never from a constant. If a surface shows a hue,
  it asks `view/lighting.mjs` for it, and a stage that is off must look off.
- Edits are posted, never applied locally. The draft lives in the host, so what
  is drawn is what would be applied.

## Verification

```sh
npm run check                 # syntax across the tree, then all tests
npm run keycodes -- --check   # fails if the vendored catalog has drifted
npm run test:browser          # fixture browser smoke, Chromium required
npm run preview               # then serve the folder and open preview/index.html
```

Run `npm ci` when dependencies change. Run targeted tests during development,
then `npm run check`, `npm run keycodes -- --check`, and `git diff --check`
before handing code changes back. For preview/setup changes also run
`npm run preview`. Docs-only changes may skip runtime checks; say so.
Firmware host tests and QMK compilation are not this repository's build gates.
Before merging wire/schema or cross-language codec changes, run
`npm run test:compat -- --firmware PATH --ark PATH --qmk PATH --report NEW_FILE`
as described in [COMPATIBILITY.md](docs/COMPATIBILITY.md). UI-only changes need
only the independent app checks. Wire/schema changes require this bridge;
see [`upstream/README.md`](upstream/README.md). Local work may pin a
firmware commit that has not landed yet; before landing a change that moves a
pin, fetch the firmware checkout and run the bridge with `--publish` (`land`
refuses pins that are not on the published trunks). Never weaken a failing test to
make extraction or a protocol change pass.

### Checking it the way the panel renders it

`preview/index.html` is this interface alone. The panel is this interface *inside*
the host's own stylesheet, which arrives in a cascade layer — so it loses to
every property this sheet declares, and wins every property it does not. That
has already cost us twice: `body { padding: 0 20px }` squeezed the whole app,
and the host's `code { background; color; padding; border-radius }` turned every
inline keycode into a coloured chip in a black-and-white interface.

`npm run preview -- --vscode` writes `preview/vscode-dark.html` and
`preview/vscode-light.html`: the same page with the host's real stylesheet and theme
colours read out of the installed app, under the theme class it puts on `<body>`.
Look at a new surface there, not only in `preview/index.html`.

### Proving a control is wired

A control that posts nothing looks exactly like one that works, and no unit test
sees it: the tests stage payloads, they do not press buttons. So when a screen
gains an editable control, drive it in the preview, which logs every post to
`window.__posted`:

```js
// change one control, then press the surface's own save button if it has one
window.__posted.length = 0;
el.value = "777"; el.dispatchEvent(new Event("change", {bubbles: true}));
// the sentinel has to appear in what was posted
JSON.stringify(window.__posted).includes("777");
```

Two failures this catches, both of which once shipped unnoticed: a field with
no listener at all, and a field rendered twice, where the second registration
silently wins and edits to the visible one are dropped. Then add the payload to
`tests/edits.test.mjs` so its shape is pinned for good.

### Publishing protected main

`main` publication requires a same-repository `dev` → `main` PR with the
`Promotion from dev` check and this repository's CI jobs (`check` on both
systems, `browser`, `compatibility`, `agreement`), including for
administrators. Only the shared vault's `release` opens it and only
`release --publish` merges it, when Noah asks; never push `main` directly or
bypass protection. CI runs only on those pull requests and nightly, never on
`dev` (D-L51).
