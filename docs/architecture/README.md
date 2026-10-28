# Ark's architecture

Ark is a core with no shell dependency, the web page's shell that runs it,
and an interface that only renders what the core posts. The keyboard is the source
of truth (D-L11); every edit goes through one draft (D-L19, D-L35).

## The layers

`core/` is split into layers that import one way only (D-L10).
`tests/layering.test.js` holds every rule on this page about imports.

| Layer | Owns | May import |
| --- | --- | --- |
| `core/data/` | Inert vendored data: the keycode catalog, QMK's keycode layout, the key layout, pointing-mode bindings, host keyboard layouts, the demo profile | nothing |
| `core/transport/` | Device adapters (WebHID for the page, node-hid for Node scripts, a fake) and the request coordinator that serialises requests to the keyboard | `data/` |
| `core/schema/` | Profile byte formats and domain decoders: each domain's layout, limits and canonical encoding | `data/` |
| `core/protocol/` | What is spoken to the keyboard over Profile Wire: framing, pages, live edits, candidate transfers | `transport/`, `schema/`, `data/` |
| `core/model/` | Complete profiles as documents: snapshots, backups, draft edits, Review's changes and checks, reachability, vocabulary | `schema/`, `data/` |
| `core/session/` | Everything that holds state across a connection: reads, the draft, Apply, Save, live edits, recovery copies, and the panel loop the shell runs | all of the above |

Every layer may import from itself, type-only imports follow the same rules,
and any layer may use the inert type declarations in `contracts/`.

Around the core:

- **The shell** (D-L71), `web/`: the web page. It passes in what only it
  has: its device adapter (WebHID; the device service has no default), posting
  to the panel, progress, a file chooser, downloads and the browser's storage
  for recovery copies. `core/session/panel-loop.js` routes each panel
  message, runs it and publishes the model. Node scripts that drive a keyboard
  (`scripts/probe-live-link.js`, `npm run preview -- --device`) pass the
  node-hid adapter themselves; the web build refuses it.
- **The interface**, `webview/`: browser ES modules with no build step.
  It imports nothing from `core/`, not even types; it renders the model the
  shell posts and posts edits back. `webview/view/` turns the model into what
  is drawn and builds every posted edit, purely; `webview/ui/` holds the
  frame (`frame.mjs`), the screens and their components; `webview/lib/` the
  DOM, focus and colour helpers.
- **`contracts/`**: type declarations shared by the core, the shell and the
  interface for what crosses the panel boundary. No runtime code.

## Where new work goes

- A device command or wire format: `core/protocol/`.
- A profile domain or byte layout: `core/schema/`. A stored setting's ID,
  name and accepted values go once in the field table in
  `core/schema/settings-domain-v1.js`; its label, kind and section in
  `core/model/settings-editor.js`, which names it through `SETTING`.
- Anything holding state across a connection: `core/session/`. What a panel
  control does, in order, is `core/session/panel-controls.js`.
- Documents, completeness and layer-reference rewrites: `core/model/`.
- The words for a value the keyboard stores: `core/model/vocabulary.js`,
  posted as `model.vocabulary` and read through `webview/view/vocabulary.mjs`.
- A draft edit type: one entry in `core/model/draft-edits.js`, its payload in
  `contracts/edits.d.ts`, its builder in `webview/view/edits.mjs`.
- Naming an action, its native keycode or a layer reference:
  `core/schema/actions.js`. Where a kind of QMK keycode sits in the number
  space, how it packs its arguments, and how a modifier wrapper is spelled:
  `core/data/qmk-keycodes.js`, never a literal of its own.
- A rule about what something means on screen (a colour, a key face, a
  locality): `webview/view/`, with a test. A screen or component:
  `webview/ui/`.

## Flows that cross layers

- [Reading, applying and progress](profile-snapshot-and-progress.md): how a
  snapshot is read and checked, how the draft is applied or saved, live edits,
  and the progress each operation reports.
- [Timing, built-in branches and reachability](timing-and-reachability.md):
  how Review works out what the layers let the keys reach and which timing
  findings constrain it.

The interface's own rules are a contract, in
[`docs/spec/interface-contracts.md`](../spec/interface-contracts.md); the
transport adapter and coordinator contracts are in
[`core/README.md`](../../core/README.md).
