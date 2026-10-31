# Coding standards

What a review holds a change to. The rules under **Judgement** need a reader;
the ones under **Checked** are enforced by the named test, so a review only
confirms the change did not weaken that test. Words follow `GLOSSARY.md`;
decisions are cited as D-L<n> (`docs/adr/`) and firmware D-F<n>.

## Judgement

### Where code lives

- A change lands in the layer that owns it
  ([architecture](docs/architecture/README.md#where-new-work-goes)). An import
  the layer rules refuse is a sign the work is in the wrong place: move the
  work, never route around the rule.
- A rule more than one place needs has one owning module, and core publishes
  its meaning to the interface (D-L33). A screen that re-derives vocabulary,
  device policy, layer resolution or editability is a second home for that
  rule. The owners are listed in the
  [interface contracts](docs/spec/interface-contracts.md#shared-rule-ownership).
- A firmware decision that depends only on the profile is computed in core
  and published; the interface interprets what is posted (D-L73). A firmware
  rule the page has to run as a person clicks lives once in `rules/`, as
  [the shared rules](docs/architecture/README.md#the-layers) say.
- A fact is imported from its home, which
  [Facts and their homes](docs/architecture/README.md#facts-and-their-homes)
  names: a limit, a keycode or keycode range, the layer count and a layer
  mask are never written as literals (see **Checked**).
- The interface may copy a constant, because it may not import core: the copy
  is named once and pinned to its home by a drift test
  (`tests/view/enum-drift.test.mjs`). It never copies a rule; a rule both
  sides run goes in `rules/` (D-L73), and so does what such a rule reads,
  such as QMK's keycode layout.
- The words for a value the keyboard stores live in `core/model/vocabulary.js`
  and reach the interface as `model.vocabulary`; a screen holds no
  enum-to-words table of its own (see **Checked**).
- Whether an area can be edited is `editGate(model, area)` in
  `webview/view/edit-gate.mjs`, which reads the published `draft.editable`
  and says why not (no other module reads it; see **Checked**). Core decides
  it once, with `draftBinding` (D-L60); nothing else recomputes it.
- Types are strict at the existing seams (D-L59). Internal types sit beside
  their owning layer; `contracts/` holds only what crosses the panel.
- A union in `contracts/` that a runtime value also lists is tied to it: a
  table keyed by the union is typed `Record<Union, …>`, so a missing member
  fails the type check, and a list is compared with the union by a test
  (see **Checked**).

### Data from the keyboard

- Decode once. Take a snapshot's decoded form with `decodedOf(snapshot)`
  (`core/model/portable-profile.js`); a draft history entry is decoded once.
  Change a document's domains with `editProfileDomains` and read another
  document's with `readProfileDomains`, beside it: they hold the codec
  options and the full-profile refusal.
- Decode defensively: everything from a keyboard or a file is untrusted.
  Check lengths, refuse noncanonical bytes and fail with a stable `code`, never
  a guess.
- Report the keyboard's state verbatim, zeros included. A blanked or rounded
  value misreports the keyboard.
- Refuse what the firmware refuses, and no more. A profile the firmware would
  accept is accepted; something merely inert, such as a key bound to an empty
  pointing slot, is carried and explained (a Review notice), not rejected.
- Ark supports current firmware only (D-L64): code past the version gates in
  `core/session/firmware-support.js` assumes the current base and asks no
  feature questions.

### The interface

- Edits are posted, never applied locally: the draft lives in the core, so
  what is drawn is what would be applied (D-L35).
- A screen posts what a builder returns: edits from `webview/view/edits.mjs`
  (pointing records from `webview/view/pointing-config.mjs`), controls from
  `webview/view/controls.mjs`; never an object assembled inline (see
  **Checked**). A new builder gets its payload staged in
  `tests/view/edits.test.mjs`.
- Markup is built with `el()` from template strings, and every value from the
  keyboard, a file or the shell goes through `esc()` or `textContent`,
  attributes included (see **Checked**; numbers too, unless built from
  constants).
- A control's `data-f` identity names the stored owner and field, never a
  label or array position, so a reordered item keeps it; focus is kept with
  `webview/lib/focus.mjs`.
- Colour comes from the model through `webview/view/lighting.mjs`; a stage
  that is off looks off.
- Look a key up by what it means, `keyMeaning(position)`, never by
  `position.keycode`: behaviour rows, macros and pointing slots are keyed by
  the semantic name.
- An interface change follows the
  [interface contracts](docs/spec/interface-contracts.md) and the decisions
  they cite; a new editable control has been driven in the preview to prove
  it posts ([development](docs/development.md#proving-a-control-is-wired)).

### Tests

- New behaviour and every changed invariant gets a test in the same change,
  at the module's interface, in the `tests/` directory that mirrors it.
- A failing test is fixed at its cause. A test changes only when the behaviour
  it pins changed on purpose.
- Unit tests and the preview never stand for the keyboard: a change that
  needs hardware acceptance says so.

### Documentation

- A lasting rule goes into the document that governs it in the same change:
  a decision as an ADR, a contract in `docs/spec/`, a cross-layer flow in
  `docs/architecture/`. Verification runs, counts and dated progress belong
  in commit messages, not docs.
- A change to what a person sees or does updates its page in `docs/guide/`
  and, when a capability changes, `README.md`. The README stays a short
  pitch in Noah's voice; development material goes in `docs/development.md`.
- Names in code, interface text and docs use `GLOSSARY.md`'s terms, never the
  words it lists to avoid.

## Checked

| Rule | Check |
| --- | --- |
| `core/` layers import one way, type imports included, and no layer, `rules/`, the interface or the shell names a Node built-in or a package beyond its list (node-hid in `transport/`, `buffer` in `web/`), types included; `contracts/` is inert and imports only itself | `tests/layering.test.js` |
| `rules/` imports only `rules/`, uses no DOM or Node, and loads with `require()`; core runs it only from `schema/` up, the interface only from `webview/view/`, the shell never | `tests/layering.test.js`, `tsconfig.rules.json` |
| The interface imports nothing from `core/`, types included, and no Node built-in by any import; it never imports `web/`, and the shell imports only `webview/view/` of it | `tests/layering.test.js` |
| The runtime never reads the firmware repository: no `keymap.c`, `config.h`, `rgb_config.c` or QMK paths in `core/`, `rules/`, `webview/` or `web/` | `tests/layering.test.js` |
| The device service takes its adapter from its caller, with no default; the web build refuses node-hid and its adapter | `tests/session/profile-device-service.test.js`, `tests/scripts/web-build.test.js` |
| Every `core/` module has a test in the matching `tests/` layer, and every `rules/` module one in `tests/rules/` | `tests/layering.test.js` |
| Every source module starts with `// @ts-check` and is in a type-check configuration; the strict type checks pass | `tests/scripts/conventions.test.js`, `tests/scripts/syntax-coverage.test.js`, `npm run typecheck` |
| Screens author no colour literals | `tests/scripts/conventions.test.js` |
| Markup reaches an HTML sink only in the interface, as `.innerHTML =`, `.outerHTML =` or `.insertAdjacentHTML(…)` handed one `html(…)` call, `webview/lib/dom.mjs`'s Trusted Types policy for markup (D-L74), the forms the escape check judges; a sink is named no other way (a quoted name, a key, `Object.assign`), and no module uses a sink no policy passes (`setHTMLUnsafe`, `DOMParser`, `createContextualFragment`, `document.write`, `srcdoc`, `importScripts`), and only `web/page.mjs` starts a worker | `tests/scripts/conventions.test.js`, the browser suite on the built page and the preview, both under Trusted Types |
| A QMK keycode number from `0x2000` to `0x7fff` is written only in `rules/qmk-keycodes.mjs`, `core/data/user-keycodes.js` and the interface's pinned copy of the layer-lock block, in hex or, where it meets a name that says code, in decimal | `tests/scripts/conventions.test.js` |
| No layer mask is written as `0xffff` or `(1 << 16) - 1`, and no layer count as `16` (`{length: 16}`, `new Array(16)`, a comparison or default), outside their homes and pinned copies; the exceptions say why | `tests/scripts/conventions.test.js` |
| The interface keeps no table of words of its own: three or more phrases by key or `{label, what}` records by key, or two or more `[id, phrase]` pairs, in a list or a `Map`; the exceptions say why | `tests/scripts/conventions.test.js` |
| Semantic lookups never use a position's stored keycode name | `tests/scripts/conventions.test.js` |
| Only `webview/view/edit-gate.mjs` reads the draft's `editable`; every other webview module asks `editGate(model, area)` | `tests/scripts/conventions.test.js` |
| Only `webview/view/key-identity.mjs` and the keycode grammar's reader (`webview/view/keycode-expression.mjs`) read the keycode alias table, `qmkKeycodeAliases`; every other webview module asks `keyIdentity(model, spelling)` | `tests/scripts/conventions.test.js` |
| A table core keys by keycode name (`qmkKeyLabels`, `qmkKeyKinds`, `qmkKeyLayers`, …) and the host layout's `hostLayoutLegends` are read only in `webview/view/key-identity.mjs`; every other webview module asks `keyIdentity(model, spelling)` for the fact (`label`, `kind`, `layer`, `legends`, …); the exceptions say why | `tests/scripts/conventions.test.js` |
| Only `core/model/draft-editor.js` runs an editor's edit (`editSettings`, `editMacro`, `editCustomKey`, `editKeyboardName`, `PROFILE_EDITS`), in tests too; only `core/model/device-profile-edits.js` and the behaviour editor's own test run `editKeyBehaviors` | `tests/scripts/conventions.test.js` |
| Only `core/session/connection-state.js` writes the device service's edit mode (`editMode`, `editModeUnknown`) | `tests/scripts/conventions.test.js` |
| No webview module posts an object literal: `post()` and `postLeavingDemo()` take a builder's output or a message the store hands back | `tests/scripts/conventions.test.js` |
| Every stored enum value has a word | `tests/model/vocabulary.test.js` |
| A draft edit type agrees across `core/model/draft-edits.js`, `contracts/edits.d.ts` and `webview/view/edits.mjs` | `tests/model/draft-edits.test.js` |
| A webview number that is also a wire number equals the schema's | `tests/view/enum-drift.test.mjs` |
| A runtime list holds exactly its contract union's members: `PhaseId`, `ApplyStep`, `EditMode` (read by `tests/fixtures/contract-unions.js`) | `tests/model/vocabulary.test.js`, `tests/session/apply-progress.test.js`, `tests/protocol/profile-edit-v1.test.js` |
| Every form control has a `data-f` identity, unique on screen | `tests/view/form-identities.test.mjs`, `browser-tests/focus-identities.spec.js` |
| No screen names a key or action as plain text | `tests/view/key-names-marked.test.mjs` |
| Every value interpolated into webview markup, or handed to `el()` or an HTML setter, is escaped, a number by construction or markup a checked template made; the exceptions say why | `tests/view/markup-escaped.test.mjs` |
| Every file Ark ships parses | `scripts/syntax-coverage.js` (in `npm run check`) |
| The published site carries its Content Security Policy as a header and in the page, its Trusted Types allow-list exactly the page's policies, and the opener policy and HSTS on every file | `scripts/check-static-site.js`, `tests/scripts/web-build.test.js` |
| The vendored keycode catalog reproduces from `upstream/qmk/` | `npm run keycodes -- --check` |
| `upstream/` files match their pinned sources | `tests/scripts/upstream.test.js`, `npm run upstream -- --check` |
| Ordinary checks, the preview and the catalog need no sibling checkout | `tests/scripts/upstream.test.js` (no relative path leaves the repository); CI's `check` job, which checks out Ark alone |
