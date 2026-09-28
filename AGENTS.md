# Charybdis Live — Agent Instructions

This app edits the **connected keyboard**. Authored C defaults are edited
directly in the firmware repository; the app never edits those files.

Start with `git status --short`, then read the setup in [README.md](README.md)
and the reading map in [docs/README.md](docs/README.md). Read Current Product
Status and Open Issues in [the direction](docs/LIVE_EDIT_APP_DIRECTION.md)
before changing behavior; read its relevant decisions before architecture work.
The interface direction and its prototype are in [design/](design/README.md).

## Repository ownership

This repository is the app. On Noah's development machine, the active firmware
checkout is `/Users/noah/dev/charybdis/charybdis-4x6`, the app checkout is
`/Users/noah/dev/charybdis/charybdis-live`, and the upstream QMK build dependency
is `/Users/noah/dev/charybdis/bastardkb-qmk`. See the
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
- `scripts/preview.js` renders the interface against the test fixtures.
- `scripts/check-compatibility.js` runs Live-owned integration runners against explicitly selected
  firmware source; it is never imported by runtime code.

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
design/             the interface direction and its clickable prototype
docs/               app-owned product direction, specs and contributor workflows
upstream/           pinned external contracts and inputs; read its AGENTS.md
scripts/            developer entry points and build steps
tests/              mirrors core/, plus the view modules and the posted payloads
dev/                ignored generated previews, never authoritative source
```

## Documentation ownership

Use [docs/README.md](docs/README.md) to place new documentation. Update the
existing governing document first. Product behavior changes update README and
the relevant spec in the same pass; architecture decisions update the direction
or an app-owned spec. Keep Current Product Status and Open Issues accurate.
Each decision has one home: app decisions continue the D-L series here, while a
D-L heading marked as a firmware decision is only a pointer to the firmware
repository's direction, which owns that text. Change a firmware decision there,
as firmware work, not here.
Do not put app plans or new app specifications under `upstream/`.

Active plans may live in `docs/plans/`; include scope, acceptance criteria and
remaining work. When complete, fold lasting rules into the governing document
and delete the plan (D-L07). Test logs and session narratives belong in reports,
commit messages or the final handoff, not permanent finding registers. Record
which checks actually ran and any limitations; never imply unit tests prove
hardware acceptance.

## Working alongside firmware agents

Use this repository for Live changes. Older firmware checkouts may still contain
an in-tree app copy; it is historical and must not receive new app work.
Separate agents should use separate Git worktrees when changing this same repo.
Do not reset, stage or commit unrelated work left by another agent. The presence
of a sibling checkout does not authorize editing it.

The compatibility bridge reads three working copies: coordinate a stable period
with agents changing them, and use the actual worktree paths being tested.
There is no automated build or device reservation system. Coordinate before
sharing a QMK build directory or opening the physical keyboard; close competing
Live/VIA/diagnostic sessions. Fixture previews and ordinary app tests need no
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
npm run preview               # then serve the folder and open dev/index.html
```

Run `npm ci` when dependencies change. Run targeted tests during development,
then `npm run check`, `npm run keycodes -- --check`, and `git diff --check`
before handing code changes back. For preview/setup changes also run
`npm run preview`. Docs-only changes may skip runtime checks; say so.
Firmware host tests and QMK compilation are not this repository's build gates.
Before merging wire/schema or cross-language codec changes, run
`npm run test:compat -- --firmware PATH --live PATH --qmk PATH --report NEW_FILE`
as described in [COMPATIBILITY.md](docs/COMPATIBILITY.md). UI-only changes need
only the independent app checks. Wire/schema changes require this bridge;
see [`upstream/README.md`](upstream/README.md). Never weaken a failing test to
make extraction or a protocol change pass.

### Checking it the way the panel renders it

`dev/index.html` is this interface alone. The panel is this interface *inside*
the host's own stylesheet, which arrives in a cascade layer — so it loses to
every property this sheet declares, and wins every property it does not. That
has already cost us twice: `body { padding: 0 20px }` squeezed the whole app,
and the host's `code { background; color; padding; border-radius }` turned every
inline keycode into a coloured chip in a black-and-white interface.

`npm run preview -- --vscode` writes `dev/vscode-dark.html` and
`dev/vscode-light.html`: the same page with the host's real stylesheet and theme
colours read out of the installed app, under the theme class it puts on `<body>`.
Look at a new surface there, not only in `dev/index.html`.

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
