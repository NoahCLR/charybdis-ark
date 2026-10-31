# Ark's architecture

Ark is a core with no shell dependency, the web page's shell that runs it,
an interface that only renders what the core posts, and the shared rules both
of them run. The keyboard is the source
of truth (D-L11); every edit goes through one draft (D-L19, D-L35).

## The layers

`core/` is split into layers that import one way only (D-L10).
`tests/layering.test.js` holds every rule on this page about imports.

| Layer | Owns | May import |
| --- | --- | --- |
| `core/data/` | Inert vendored data: the keycode catalog's names, the key layout, pointing-mode bindings, host keyboard layouts, the demo profile | nothing |
| `core/transport/` | Device adapters (WebHID for the page, node-hid for Node scripts, a fake) and the request coordinator that serialises requests to the keyboard | `data/` |
| `core/schema/` | Profile byte formats and domain decoders: each domain's layout, limits and canonical encoding; reading and writing a keycode by name (`keycodes.js`) | `data/`, `rules/` |
| `core/protocol/` | What is spoken to the keyboard over Profile Wire: framing, pages, live edits, candidate transfers | `transport/`, `schema/`, `data/`, `rules/` |
| `core/model/` | Complete profiles as documents: snapshots, backups, draft edits, Review's changes and checks, reachability, vocabulary | `schema/`, `data/`, `rules/` |
| `core/session/` | Everything that holds state across a connection: reads, the draft, Apply, Save, live edits, recovery copies, and the panel loop the shell runs | all of the above |
| `rules/` | Firmware rules the page also runs as a person clicks (which layer answers under the layers turned on, whether a pointing link starts its mode, the order the lighting stages paint in), and what they read, such as QMK's keycode layout (D-L73) | `rules/` only |

Every layer may import from itself, type-only imports follow the same rules,
and any layer may use the inert type declarations in `contracts/`. `data/`
is inert and `transport/` moves bytes without knowing what they mean, so
neither runs a rule.

Around the core:

- **The shell** (D-L71), `web/`: the web page. It passes in what only it
  has: its device adapter, posting to the panel, progress, a file chooser,
  downloads and the browser's storage for recovery copies.
  `core/session/panel-loop.js` routes each panel message, runs it and
  publishes the model. The device service takes its adapter from its caller,
  with no default: the page passes WebHID's, and Node scripts that drive a
  keyboard (`scripts/probe-live-link.js`, `npm run preview -- --device`) pass
  the node-hid adapter themselves. The web build refuses node-hid and its
  adapter.
- **The interface**, `webview/`: browser ES modules with no build step.
  It imports nothing from `core/`, not even types; it renders the model the
  shell posts and posts edits back. `webview/view/` turns the model into what
  is drawn and builds every posted edit, purely, and is the one part of the
  interface that imports `rules/`; `webview/ui/` holds the frame
  (`frame.mjs`), the screens and their components; `webview/lib/` the DOM,
  focus and colour helpers, and `once.mjs`, an answer kept per model or per
  key. The store and screens reach a rule through
  `view/`. The interface never imports `web/`, and of the interface the
  shell imports only `webview/view/`.
- **The shared rules**, `rules/` (D-L73): synchronous ES modules that import
  only each other, use no DOM and no Node, and take primitives (masks, index
  arrays, plain records), never a decoded profile or the posted model. Core
  loads them with `require()`, `webview/view/` by relative path, and the web
  build bundles them into both. A firmware decision that depends only on the
  profile is computed in core and published instead; a rule is here only
  because the page has to run it as a person clicks. The shell runs none.
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
- Documents, completeness and layer-reference rewrites: `core/model/`. A
  change to a document's domains goes through `editProfileDomains`
  (`core/model/portable-profile.js`), never a decode and encode of its own.
- The words for a value the keyboard stores: `core/model/vocabulary.js`,
  posted as `model.vocabulary` and read through `webview/view/vocabulary.mjs`.
- A draft edit type: one entry in `core/model/draft-edits.js`, its payload in
  `contracts/edits.d.ts`, its builder in `webview/view/edits.mjs`. A new
  editor or profile domain also gets its handler in
  `core/model/draft-editor.js`, where `applyDraftEdit` makes every draft edit;
  no other runtime module runs an editor's edit (`tests/scripts/conventions.test.js`).
- What a review item names and Discard puts back (a review unit): a builder
  in `UNIT` and a reading in `parseUnit`, both in
  `core/model/review-units.js`, never a string of its own.
- Naming an action, its native keycode or a layer reference:
  `core/schema/actions.js`. Where a kind of QMK keycode sits in the number
  space, how it packs its arguments, and how a modifier wrapper is spelled:
  `rules/qmk-keycodes.mjs`, never a literal of its own. Turning a keycode
  into its name and back: `core/schema/keycodes.js`.
- A firmware decision that depends only on the profile: computed in core
  and published in the model. A firmware rule the page has to run as a
  person clicks: `rules/`, with a test in `tests/rules/`, imported by core
  and by `webview/view/`.
- A rule about what something means on screen (a colour, a key face, a
  locality): `webview/view/`, with a test. A screen or component:
  `webview/ui/`.
- A question about the layers the board shows (which key answers, what the
  view shows, the combos and behaviours it reaches): asked of the view
  value, `webview/view/layer-view.mjs`, which a screen takes from
  `currentView()` in `webview/store.mjs` rather than passing the model, the
  layer and the preview to each function.
- What that view reaches as a Keymap tab lists it (its groups, their
  entries and empty words, the tab's count, the keys a picked row rings):
  `tabReach(view, tab)`, `webview/view/tab-reach.mjs`. A tab draws its rows
  from it; a new tab or group gets its lists and words there.
- What that view shows at each key of the board (the key that answers, the
  layer supplying it, its light, dots and badges): `boardKeys(view)`,
  `webview/view/board-keys.mjs`; `webview/ui/board.mjs` only draws it. What
  reaches one key, for the hover card and the Key tab: `keyReachAt(view,
  index)`, `webview/view/key-reach.mjs`.
- Which key a spelling is (the name the profile knows it by, one spelling
  per key, the macro, custom key or pointing slot it is, and the behaviour
  row keyed exactly by it or listening to it however it is spelled), what
  core publishes of it (its label, kind, layer and what it does to it, the
  layers it turns on, the host layout's legends), and whether two spellings
  are one key: `keyIdentity(model, spelling)` and `sameKey`,
  `webview/view/key-identity.mjs`. Nothing else in the interface reads the
  alias table or a table core keys by keycode name (`qmkKeyLabels`,
  `qmkKeyKinds`, …, `hostLayoutLegends`): each is a fact of the key, read
  under every name it goes by.
- Whether an area takes an edit now, and what to say when it does not (or
  nothing, while the draft is busy): `editGate(model, area)`,
  `webview/view/edit-gate.mjs`. A screen disables its controls by it and
  draws its words, or its own sentence where it has none; a new area gets
  its rule there.

## Facts and their homes

Before writing a constant, a table of words or a rule that another module
may also need, find its kind here and import it from its home. A new kind
gets one home, a row here and a test. The interface may not import `core/`,
so it may keep a copy of a constant that a drift test pins, but never of a
rule (D-L73). Each rule, and interface behaviour with one owner, has its
owner and tests in the
[ownership table](../spec/interface-contracts.md#shared-rule-ownership); a
row here for a kind of rule points there rather than repeating it.

| Fact | Home | Held by |
| --- | --- | --- |
| QMK's keycode layout: blocks, packing, modifier bits, wrapper spellings (`MODIFIER_WRAPPERS`) and `MOD_` names (`MOD_NAMES`) | `rules/qmk-keycodes.mjs`, which core and `webview/view/` both import | `tests/rules/qmk-keycodes.test.mjs`, `tests/view/keycode-expression.test.mjs`, `tests/scripts/conventions.test.js` |
| The keyboard's own keycode blocks: custom keys, pointing-mode keys, layer locks, and the names Ark writes for a custom key and a macro slot (`customKeyName`, `macroName`) | `core/data/user-keycodes.js`, `core/data/pd-mode-keys.js`, `macroName` beside `macroOfName` in `rules/qmk-keycodes.mjs`; the Charybdis pointer keys (`QK_KB`) are the keycode catalog's; the interface's copy of the layer-lock block in `webview/view/keycode-expression.mjs` | `tests/data/user-keycodes.test.js`, `tests/data/pd-mode-keys.test.js`, `tests/view/enum-drift.test.mjs`, `tests/scripts/conventions.test.js` |
| Keycode names, labels and aliases | the keycode catalog, `core/data/keycode-catalog.js`, vendored from `upstream/qmk/`; a keycode read and written by them in `core/schema/keycodes.js` | `tests/data/keycode-catalog.test.js`, `tests/schema/keycodes.test.js`, `npm run keycodes -- --check` |
| Which keycodes the keycode picker offers: not those of features this firmware does not build, the retired user block, QMK's own macro names or Charybdis's own drag scroll | `core/data/offered-keycodes.js`, published on each `qmkKeycodes` entry as `offered` and read by `pickable` in `webview/view/picker-sections.mjs` | `tests/data/offered-keycodes.test.js`, `tests/view/picker-sections.test.mjs` |
| What each layer key does to its layer, by QMK's function (`MO` … `PDF`, `LT`, `LM`, `LOCK_LAYER`), the modifiers a layer-mod holds with it and what a layer-tap taps | `keyLayerForm`, `layerModWords` and `layerTapWords` in `core/model/key-names.js` (a layer-mod's and a mod-tap's modifiers from the keycode's own bits, `heldModifierWords`), published as `qmkKeyLayerForms`, `qmkKeyLayerMods` and `qmkKeyLayerTaps` beside `qmkKeyLayers` and read as `keyIdentity(model, spelling).layerForm`, `.layerMods`, `.layerTap` and `.layer` in `webview/view/key-identity.mjs` | `tests/model/profile-model.test.js`, `tests/view/key-identity.test.mjs`, `tests/view/keyface.test.mjs` |
| Which key a keycode spelling is, by the names core publishes for it (`qmkKeycodeAliases`): the name the profile knows it by, one canonical spelling per key, what core publishes of it under every name it goes by, and whether two spellings are one key | `keyIdentity` and `sameKey` in `webview/view/key-identity.mjs`, the only interface module reading the alias table beside the keycode grammar's reader (`webview/view/keycode-expression.mjs`), and the only one reading a table core keys by keycode name | `tests/view/key-identity.test.mjs`, `tests/scripts/conventions.test.js` |
| Which keys the interface treats apart: transparent (`KC_TRANSPARENT`), disabled (`KC_NO`), a macro's and a custom key's | `keyKind` in `core/model/key-names.js`, published by every name a keycode is read under as `qmkKeyKinds` and read as `keyIdentity(model, spelling).kind` in `webview/view/key-identity.mjs` | `tests/model/key-names.test.js`, `tests/model/profile-model.test.js`, `tests/view/keyface.test.mjs` |
| Actions, native keycodes and layer references | `core/schema/actions.js` | `tests/schema/actions.test.js` |
| Macro limits | `MACRO_DOMAIN_V1` in `core/schema/macro-domain-v1.js`; the keys held at once and the longest delay, `MACRO_LIMITS` in `rules/macro-payload.mjs`, which core and the interface both read | `tests/schema/macro-domain-v1.test.js`, `tests/rules/macro-payload.test.mjs` |
| Combo limits | `COMBO_LIMITS` in `core/schema/combo-domain-v1.js` | `tests/schema/combo-domain-v1.test.js` |
| Behaviour limits and tap depth | `KEY_BEHAVIOR_LIMITS` in `core/schema/key-behavior-domain-v1.js`, `core/schema/profile-depth.js` | `tests/schema/key-behavior-domain-v1.test.js`, `tests/schema/profile-depth.test.js` |
| Custom key count | `CUSTOM_KEY_SLOTS` in `core/data/user-keycodes.js` | `tests/data/user-keycodes.test.js` |
| Pointing slot count | `POINTING_SLOT_COUNT` in `core/data/pd-mode-keys.js` | `tests/data/pd-mode-keys.test.js`, `tests/view/enum-drift.test.mjs` |
| The profile blob's size and action limits | `PROFILE_BLOB_V1` and `PROFILE_ACTION_LIMITS` in `core/schema/profile-blob-v1.js`; the demo's are built from these (`DEMO_CAPABILITIES` in `core/session/demo-session.js`) | `tests/schema/profile-blob-v1.test.js` |
| Layer count, layer masks and their helpers | `LAYERS`, `ALL_LAYERS`, `LAYER_IDENTITY`, `layersOfMask`, `layersAbove` in `core/data/charybdis-layout.js`; the interface's `LAYERS` and `ALL_LAYERS` in `webview/view/layout.mjs` | `tests/data/charybdis-layout.test.js`, `tests/view/enum-drift.test.mjs`, `tests/scripts/conventions.test.js` |
| Stored settings: ID, name and accepted values | `STORED` and `SETTING` in `core/schema/settings-domain-v1.js`; a field's label, kind and section in `core/model/settings-editor.js`; a section's heading in `vocabulary.settingsSections` | `tests/schema/settings-domain-v1.test.js`, `tests/model/settings-editor.test.js` |
| The words for stored values and operations | `core/model/vocabulary.js`, posted as `model.vocabulary` in every model and read through `webview/view/vocabulary.mjs`; a stage is found by its id, never its label; an unnamed layer's, pointing slot's and macro's name are core's too, published as each layer's and slot's `displayName` (read through `layerCalled` and `slotCalled` in `webview/view/vocabulary.mjs`), `portable.layers.titles` and each macro slot's `defaultName`; a key feedback state's tier mark is `feedbackTiers` | `tests/model/vocabulary.test.js`, `tests/session/panel-session.test.js`, `tests/view/enum-drift.test.mjs`, `tests/view/vocabulary.test.mjs`, `tests/scripts/conventions.test.js` |
| Wire enums | the `core/schema/` or `core/protocol/` module that encodes them; the interface's copies in `webview/view/` | `tests/view/enum-drift.test.mjs` |
| Contract unions | `contracts/`; a runtime list is tied to its union by a test (`PhaseId`, `ApplyStep`, `EditMode`), a table keyed by one by its `Record<Union, …>` type (`TimingTerm`, `TimingSource`, `UsageCountId`, `MacroStepKind`) | `tests/fixtures/contract-unions.js`, read by `tests/model/vocabulary.test.js`, `tests/session/apply-progress.test.js`, `tests/protocol/profile-edit-v1.test.js`; `npm run typecheck` |
| Draft edit types | `core/model/draft-edits.js`, payload in `contracts/edits.d.ts`, builder in `webview/view/edits.mjs`; each editor's or domain's handler, and the check that a form was drawn from the draft, in `core/model/draft-editor.js` | `tests/model/draft-edits.test.js`, `tests/model/draft-editor.test.js`, `tests/view/edits.test.mjs` |
| Review units: the string each review item names and Discard puts back | `UNIT`, `parseUnit` and `unitByLayer` in `core/model/review-units.js`; the interface's copies of the units it reads in `webview/view/macro.mjs` (`macroUnit`) and `webview/view/review.mjs` | `tests/model/review-units.test.js`, `tests/view/enum-drift.test.mjs` |
| Firmware rules the page runs as a person clicks | `rules/` (D-L73); each rule's owner is its row in the ownership table, such as [Layer answers](../spec/interface-contracts.md#layer-answers) | `tests/rules/`, `tests/layering.test.js`, and the tests its row names |
| Firmware decisions that depend only on the profile | computed in core and published (D-L73); each decision's owner and tests are in its section of the interface contracts: [Layer answers](../spec/interface-contracts.md#layer-answers) (each layer's `answers`), [Participation controls](../spec/interface-contracts.md#participation-controls) (`participation`, from `core/model/participation.js`), `comboReferenceLayers` and `comboReach` (both `core/model/combo-reach.js`, the first also what Review's walk matches combos on; [Fixed positions and composed reach](../spec/interface-contracts.md#fixed-positions-and-composed-reach)), each layer's `alwaysOn` (`core/model/profile-model.js`, the same section), each combo's `outputBehaviorLayers` ([Combo output behaviour permissions](../spec/interface-contracts.md#combo-output-behaviour-permissions)), each behaviour row's built-in tap and hold, `fromPress` included (`builtIn`, `core/model/built-in-behavior.js`; [Timing, built-in branches and reachability](timing-and-reachability.md)), [Pointing links](../spec/interface-contracts.md#pointing-links) (`pdModes[].linkStarts`, `qmkKeyTurnsOn`) | the tests those rows name, `tests/model/profile-model.test.js`, `tests/model/built-in-behavior.test.js` |
| The LED each key carries, and the trackball's | `KEY_LEDS` and `TRACKBALL_LED` in `core/data/charybdis-layout.js`, published as `model.leds` and read through `keyLed` and `trackballLed` in `webview/view/lighting.mjs` | `tests/data/charybdis-layout.test.js`, `tests/session/panel-session.test.js`, `tests/view/lighting.test.mjs` |
| The tap of a tap-toggle key that locks its layers | `TAPPING_TOGGLE` in `rules/qmk-keycodes.mjs` | `tests/rules/qmk-keycodes.test.mjs` |
| Host keyboard layouts | `core/data/host-layouts.js`, with `host-layouts.json` | `tests/data/host-layouts.test.js` |
| Backup size limit | `FILE_MAX_BYTES` in `core/model/portable-profile.js`; the interface's copy in `webview/view/backups.mjs` | `tests/scripts/conventions.test.js`, `tests/view/enum-drift.test.mjs` |
| Colours | the model, through `webview/view/lighting.mjs`; the page's own ink as CSS tokens in `webview/styles.css` | `tests/scripts/conventions.test.js` |

QMK's keycode layout is a shared rule in `rules/` (D-L73), so the keycode
catalog in `data/` keeps only names, and of the keyboard's own blocks the
interface keeps only a pinned copy of the layer-lock block. Who reads a key
expression, and in which dialect, is the QMK key expressions row of the
[ownership table](../spec/interface-contracts.md#shared-rule-ownership).

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
