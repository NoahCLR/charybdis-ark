# Interface rendering and rule ownership

How Ark's interface renders and which module owns each rule more than one
screen needs. Each rule names the test that holds it; "(no test)" marks a
contract nothing checks yet. `npm run preview` renders the real interface over
the demo. The [guide](../guide/README.md) explains using it; layering
and placement of new work follow the
[architecture](../architecture/README.md#where-new-work-goes).

## Fixed positions and composed reach

A repeated element sits in the same place every time it appears, so a screen
reads as a grid (D-L32).

- Review and Draft history keep one slot for the tap-count badge and one for
  the tier dot, even when either is absent; a title slot fits a full combo
  badge (no test).
- The review is one grid: a status gutter, the title (with its area under it
  when outside that area's group), the fields as sign · label · on the
  keyboard · in your draft, then Show and Discard at the edge. A field is
  marked + added, − removed, nothing for changed; an empty side shows a dash
  (no test).
- Where marked and unmarked labels share a column, every label gets the same
  mark slot, `marked(…, {slot: true})` (no test).
- A removed thing keeps its mark and Show only where it is still on screen,
  such as a cleared pointing slot (`tests/view/review.test.mjs`).

The Keys workbench keeps what the selected layer stores apart from what the
layers in view reach:

- Tab counts count what the selected layer stores; the Key tab counts mapped
  keys, not transparent or disabled ones (`tests/view/lighting.test.mjs`).
  Reach rows name keys as the board does, never by layout index (no test).
- The Keys tabs share one minimum height, and a taller editor carries its
  height into the next render, so changing tabs keeps the scroll position
  (`tests/view/scroll.test.mjs`).
- Reach groups come in one order, `GROUP_ORDER`, so headers stay put between
  tabs, and the view's groups lead (`tests/view/reach-groups.test.mjs`).
  **On this view** is the selected layer plus exactly the lower layers
  previewed on: an activation, not a storage place, so it may overlap the
  other groups. A combo is in the view only when that activation holds all its
  inputs, matched on the Combo layer matching reference when one is set
  (`tests/view/reach.test.mjs`, `tests/view/combo-reach.test.mjs`).
- On the board, a transparent key answered from below wears that key's
  behaviour dots and the badges of the combos it fires in the view
  (`combosInPreview`); under Combo layer matching nothing from below adds a
  badge (`tests/view/combo-reach.test.mjs`).
- Combo grouping enumerates only lower layers that can answer a transparent
  top-layer position, including disabled keys that block an input below
  (`tests/view/combo-reach.test.mjs`, `tests/view/layer-resolution.test.mjs`).
- Reach sections keep one open state per section across the Keys tabs, and
  opening one closes none (`tests/view/reach-groups.test.mjs`).

## Shared controls

The same kind of control looks and sits the same on every screen.

- A number field's unit rides inside the input (`.affix.unit`), so its label
  names only the value (no test).
- A folding card or group starts its summary with `DISCLOSURE`
  (`webview/lib/dom.mjs`): one chevron, turned down while open; the Keys
  groups are buttons (`groupHeader`) with the same chevron, turned down while
  `aria-expanded`. A card that does not fold has none (no test).
- A sheet (Review, the keycode picker, Draft history) closes with one ghost
  **Close** at the right of its header, and by Escape; its foot holds only
  actions that change something (no test).
- An editor's own actions, and buttons to another screen, are small text
  buttons (`btn tiny ghost`) at the right of its title bar. A destructive
  action is the last thing in its row (no test).
- A macro, a custom key and the keyboard are named by their editor's title,
  `titleName`: Enter commits, Escape restores the stored name, and the byte
  count shows on focus or when over the limit
  (`browser-tests/macro-ux.spec.js`, `browser-tests/custom-key-behaviour.spec.js`).
- A folded Settings card says what it holds now; an open one says nothing
  there (`tests/view/settings-layout.test.mjs`).
- A slot bank (Macros, Custom keys) and a list beside its editor (Lighting's
  layers and pointing modes) scroll on their own and keep their place across
  renders of the same screen, each list apart (`data-scroll-list`)
  (`tests/view/scroll.test.mjs`, `browser-tests/macro-ux.spec.js`,
  `browser-tests/lighting-controls.spec.js`).
- Keys and Lighting draw the same layer strip on the board
  (`tests/view/navigation-profile-ui.test.mjs`), Rename & Reorder included
  (no test).

## Marks

Each thing with a colour of its own has exactly one mark, drawn by
`webview/ui/marks.mjs` wherever the thing is named (D-L31):

| Thing | Mark |
| --- | --- |
| A behaviour tier (tap, hold, long hold) | the dot the keyboard flashes when it resolves (`tierDot`) |
| A tap count (2× and up) | its branch badge in its tap-branch colour (`branchBadge`) |
| A layer | its layer colour |
| A pointing mode | the light its slot paints (`slotLight`) |
| A combo | its badge in the combo feedback colour (`comboBadge`) |
| A lighting stage | its on/off dot |

- A thing is marked where it is the subject and where it is referred to. A
  setting carries the mark of what it governs (`governs` in
  `core/model/settings-editor.js`) in Settings, the editors and the review
  (`tests/model/profile-review.test.js`).
- A key or action that acts on a layer is named with that layer's mark first,
  "Hold ■ Numbers", through `actionMarked` or `keyNameMarked`; only attributes
  and plain-text messages carry the words alone
  (`tests/view/key-names-marked.test.mjs`). Which layer a keycode acts on is
  `keyLayer` in `core/model/key-names.js`, published as `qmkKeyLayers`
  (`tests/session/device-model.test.js`).
- A stage that is off draws its marks off. A colour is the keyboard's own, so
  a dark one reads dark; a badge keeps its count in the text colour (no test).
- The draft's dot is not one of these marks
  ([Draft marks](#draft-marks-and-draft-history)).

## Shared rule ownership

A rule more than one place needs has one owning module, and core publishes its
meaning to the interface (D-L33). Owners with rules of their own have a section
below.

| Rule | Owner | Held by |
| --- | --- | --- |
| Settings help: `hint` stays visible, `tooltip` adds to it, read-only reasons join them in `data-tip`, shown by `webview/ui/hover.mjs` | `core/model/settings-editor.js` | `browser-tests/settings-tooltips.spec.js` |
| Number entry: whole numbers author `inputmode="numeric"`, durations `"decimal"`; typing, pasting or dropping keeps only digits (and a duration's first point) with the caret in place; range limits stay with the edit | `webview/lib/number-entry.mjs` | `tests/view/number-entry.test.mjs`, `browser-tests/number-entry.spec.js` |
| Screens: IDs, labels, rail groups, availability, rendering and redraw; `PanelState.screen` takes its IDs from here; an unknown ID shows an unavailable screen | `webview/view/screens.mjs` | `tests/view/screens.test.mjs`, `browser-tests/screens-registry.spec.js` |
| Words, sent as `model.vocabulary`; stages are found by id, never by label | `core/model/vocabulary.js` | `tests/model/vocabulary.test.js`, `tests/view/enum-drift.test.mjs` |
| Actions, native keycodes, decode limits, layer references | `core/schema/actions.js` | `tests/schema/actions.test.js` |
| Decoding once: a snapshot's `decoded` form is taken with `decodedOf` (`core/model/portable-profile.js`), which decodes afresh only when the document changed; draft history entries are frozen and decoded once each | `core/model/portable-profile.js`, `core/session/profile-draft-session.js` | `tests/session/profile-draft-session.test.js` |
| Pure edits and presentation; the model imports no session or protocol module | `core/model/device-profile-edits.js`, `key-behavior-edits.js`, `device-profile-view.js` | `tests/model/device-profile-edits.test.js`, `tests/layering.test.js` |
| Layer answers: which stack slots answer each position under which active layers, for reach and the published model alike; the interface never resolves transparency again | `core/model/layer-resolution.js` | `tests/model/layer-resolution.test.js`, `tests/view/layer-resolution.test.mjs` |
| Idle lighting timeout: staged in milliseconds, edited in seconds or minutes; changing the unit stages nothing; zero means always on | `webview/view/duration.mjs` | `tests/view/duration.test.mjs`, `browser-tests/preview.spec.js` |
| Shortcut words: ⌘ and ⇧⌘ on a Mac, Ctrl and Ctrl+Shift elsewhere, in text, tips and `aria-keyshortcuts`; no screen writes ⌘ itself | `webview/view/shortcuts.mjs` | `tests/view/shortcuts.test.mjs`, `browser-tests/shortcut-glyphs.spec.js` |
| Panel sequencing; the shells supply dialogs, files, progress and toasts; a failure's notice is its sentence, never its code | `core/session/panel-controls.js`, `panel-loop.js` | `tests/session/panel-controls.test.js`, `tests/session/panel-loop.test.js` |
| Panel state fields declare their initial value and draft-replacement policy together | `webview/store.mjs`, `webview/view/state-fields.mjs` | `tests/view/state-fields.test.mjs` |
| Lighting: one `webview/ui/lighting/` module per stage, posting the shared edit builders | `webview/ui/lighting.mjs` | `browser-tests/lighting-controls.spec.js` |
| Pointing: the slot editor holds pending button and modifier choices until a complete record posts | `webview/ui/pointing.mjs`, `webview/ui/pointing/` | `browser-tests/pointing-controls.spec.js` |
| Device facts, the review sheet, the unsaved-demo dialog; the app keeps routing, rendering, focus and scroll, and window keys | `webview/ui/device.mjs`, `ui/review-overlay.mjs`, `ui/leave-demo.mjs` | (no test) |

## Key names and the picker

A name the catalog gives a key is what the key does wherever it is placed
(D-L05). Names come from `core/model/key-names.js`; what the picker offers is
`pickable` in `webview/view/picker-sections.mjs`.

- The catalog names what QMK ships; the profile names macros, pointing-mode
  keys and custom keys. The effective host OS names Alt/Option and
  GUI/Command/Windows/Super, an unknown one neutral Alt/GUI, and the selected
  host layout names keys as it prints them (dead keys marked ◌); stored
  keycodes never change (`tests/model/key-names.test.js`,
  `browser-tests/host-layout.spec.js`).
- The interface never names a keycode and has no modifier-name table: it
  looks up the published labels on every render
  (`tests/view/key-names-marked.test.mjs`,
  `browser-tests/host-vocabulary.spec.js`).
- A layer is named by its name in the picker's verbs: `MO(3)` reads "Hold
  Navigation", `LT(3,KC_SLASH)` "/ / Navigation"
  (`tests/model/key-names.test.js`). The stored name (`KC_KP_1`) is added
  only where a review row's two sides would read alike
  (`tests/model/profile-review.test.js`).
- A behaviour sends QMK and keyboard functions (DPI and sniping keys, RGB
  Matrix, Magic, `QK_BOOT`) as a synthetic record, so they run as on a key
  (`tests/model/key-behavior-edits.test.js`). `DF()` and `PDF()` stay refused
  (firmware D-F46).
- The picker offers only what does something on this keyboard: not
  `QK_USER_0`–`QK_USER_31`, `DRGSCRL`/`DRG_TOG` (drag scroll is the
  `PD_SLOT_0` pointing mode), unnamed `QK_KB` slots, features the build lacks,
  or the `QK_MACRO_n` duplicates of `VIA_MACRO_n`. A key that holds one still
  reads back by name (`tests/view/picker-sections.test.mjs`,
  `browser-tests/retired-user-keys.spec.js`).
- The picker folds modifiers into the simplest keycode that holds them
  (`modifierPick`): modifiers on one side alone, or with one modifier on the
  other side, are a keycode (`S(KC_LEFT_CTRL)`, `RGUI(KC_LEFT_GUI)`). Only two
  or more on each side are refused, with a custom key's shortcut offered
  instead where the field allows one (`tests/view/keyvalues.test.mjs`,
  `tests/view/keycode-expression.test.mjs`).
- A layout key's picker (`layoutKey`) and a combo output's (`comboOutput`)
  keep Use off for what the draft refuses there (`keyProblem`,
  `comboOutputProblem`); a combo output's picker offers no Tap-hold, which
  needs a key of its own (`tests/view/keycode-expression.test.mjs`).

## Pointing tap outputs

Straight directions, diagonals and physical-button tap overrides share one tap
vocabulary, owned by `core/schema/pd-mode-domain-v1.js`: keys, mouse buttons
1–8 (firmware D-F22) and VIA macros (firmware D-F23), which take inherit
policy and mask zero. Mouse movement, wheel, acceleration and
modifier-wrapped mouse codes are refused, and backups keep click and macro
records exactly (`tests/schema/pd-mode-domain-v1.test.js`).

- `core/model/pointing-taps.js` supplies the picker's names and aliases and
  which keys may carry modifiers; the interface gets them through
  `pdModeEditing` and keeps no allowlist of its own
  (`tests/model/pointing-taps.test.js`). Typed outputs are checked before
  staging, with a reason (`browser-tests/pointing-clicks.spec.js`).
- The picker offers all 128 VIA macros by profile name, and `tapRecord` resets
  a newly chosen macro to inherit and mask zero. A macro row says it inherits
  and why, and that a busy trigger is dropped
  (`tests/view/keyvalues.test.mjs`, `browser-tests/pointing-macros.spec.js`).

## Custom key shortcuts

A custom key's optional shortcut (firmware D-F26) is its own action (D-L63):
a modifier mask and one key (none, a basic key or a mouse button); both zero
is no shortcut. Ark reads and writes settings version 8 only (D-L64;
`tests/schema/settings-domain-v1.test.js`).

- The Custom keys screen edits it through `updateCustomKeyShortcut`, with key
  and modifiers in the keycode picker's `shortcut` mode, where modifiers may
  mix sides (`tests/model/custom-key-editor.test.js`).
- A field that needs a mixed-side set offers a custom key (`shortcutOffer`).
  One with exactly that shortcut and no behaviour is used. A layout key or
  combo output also runs the key's behaviour, so a match with one is offered
  beside a new key; a behaviour step sends only the shortcut, so any match is
  used. Otherwise the first unused custom key gets the shortcut in the same
  draft step as the edit that uses it; a combo output's key is made only when
  the combo is kept (`tests/view/custom-key.test.mjs`,
  `tests/view/edits.test.mjs`, `browser-tests/custom-key-shortcut.spec.js`).
- Review shows it as the key's Shortcut field, discarded with the name, and
  names it in the host OS's words (`tests/model/custom-key-editor.test.js`).
- A custom key with a shortcut taps and falls back to holding itself
  (`tests/model/built-in-behavior.test.js`). Bypassed, it sends its shortcut,
  or nothing without one, and Ark says so (`tests/view/custom-key.test.mjs`).
- A behaviour step sending a custom key sends only its shortcut. The firmware
  allows one without a shortcut, so Review warns rather than refusing
  (`shortcutlessCustomKeyStep`; `tests/model/profile-checks.test.js`).

## Draft binding and panel controls

Whether the open draft may be changed now is one rule (D-L60): `draftBinding`
in `core/session/panel-session-state.js`, answering `{editable, reason}`. A
bound draft belongs to the selected, connected keyboard over the connection it
was read through, on firmware holding a complete profile, current with the
keyboard, with nothing running. Reasons come in a fixed order, so `busy` means
only an operation stands in the way. The demo's draft is bound to the demo
(`tests/session/panel-session-state.test.js`).

- Core refuses by it and the interface offers by it. The router stages edits,
  opens import and layer reviews, answers macro inspection and routes Apply
  only for a bound draft, and Apply checks again as it writes
  (`tests/session/panel-loop.test.js`, `tests/session/panel-session.test.js`).
  `writable()` under `canEdit` reads the published `draft.editable`
  (`tests/view/messages.test.mjs`).
- Panel controls are registered once in `CONTROLS`
  (`core/session/panel-control-registry.js`): route, draft identity, binding
  rule, demo policy, phase and action. History and local macro inspection run
  before the busy guard, which refuses with a notice rather than dropping work
  (`tests/session/panel-control-registry.test.js`).
- Device operation phases have stable IDs (`PHASE`) with their words and write
  fact beside them; progress compares IDs, so words never change routing
  (`tests/model/vocabulary.test.js`).
- Closing the web page asks first only when it would lose edits (an unapplied
  draft, unsaved Live + review edits, a Live edit on its way, the demo's
  unexported edits) or while an Apply, a Save or a restore writes the profile
  (`leaving` in `web/web-host.mjs`; `tests/web-host.test.mjs`, live cases: no
  test).

## Snapshot model and device model

The editable model is built from one complete snapshot and its decoded form
(`buildSnapshotModel` in `core/session/device-model.js`; D-L61); the draft
binding supplies editability, never a simulated read
(`tests/session/device-model.test.js`). Building it is a projection that never
opens, closes, observes or marks a draft stale, and a partial read keeps its
read-only view even while a dirty draft is kept
(`tests/session/panel-session.test.js`). A standalone export reads its own
snapshot and leaves the editor's alone
(`tests/session/profile-device-service.test.js`).

## Draft marks and Draft history

- Every editor marks what the draft changed with the draft's dot (D-L30), down
  to the header of a folded group holding a change. The marks come from the
  review's own changes (`draftMarks`), so the two never disagree
  (`tests/view/review.test.mjs`).
- **Discard all** is one more step that undo takes back; the keyboard is read
  again only for a stale draft, one bound to another keyboard, or a recovery
  (`tests/session/panel-controls.test.js`).
- **Draft history** lists every step newest first, with when it was made and
  what it changed from the step before; Undo and Redo name the step they move
  (`tests/session/profile-draft-session.test.js`). Core sends the steps only
  while the sheet is open (`tests/session/panel-session.test.js`).
- In Apply the bar offers **Review and apply** (**Review changes** in the
  demo) beside **Discard all**, and adds added, changed and removed counts
  only when they say more than the total (`statusBesideCount`;
  `tests/view/review.test.mjs`). In the live modes it counts unsaved changes
  and offers Revert, and in Live + review **Review and save**
  (`browser-tests/live-edits.spec.js`).

## Review changes and Discard

The review lists one change per thing that differs from the keyboard (D-L29):
a key on a layer, a layer's name, a behaviour, a combo, a macro, a Settings
card, a pointing slot, or one lighting record (LED groups and the rows that
paint them are one record; no test).

- A change says added, changed or removed and lists only the fields that
  differ, in the editors' words. Fields compare what is stored, not what is
  shown, so a changed default or renamed layer is one change
  (`tests/model/profile-review.test.js`,
  `tests/model/profile-review-completeness.test.js`). **Show** opens it where
  it is edited (`tests/view/review.test.mjs`).
- Removing one combo is one change that says later combos move up, and
  Discard puts it back in place; with another combo changed too, the
  positional differences stay visible (`tests/model/profile-review.test.js`,
  `tests/model/profile-revert.test.js`).
- The changes one edit made form one group with one Discard; a later edit
  touching two groups joins them. Each change sits under its own area in rail
  order, and each part's Discard takes back the whole group. Once nothing
  described is left, the draft is the keyboard's profile again
  (`tests/session/profile-draft-session.test.js`,
  `tests/view/review.test.mjs`). A recovery review is discarded whole (no
  test).
- Layers are compared by identity, not slot: beside every history entry the
  draft keeps which keyboard layer each slot holds, set by Rename & Reorder
  and never inferred. A reorder is one **Layer priority** change; undo, redo
  and rebase carry the order, and an import, a whole discard and an Apply
  start again from the keyboard's (`tests/model/layer-order.test.js`,
  `tests/session/profile-draft-session.test.js`).

## How the review presents checks

What the checks find is in
[timing and reachability](../architecture/timing-and-reachability.md); this is
how the review shows them (D-L36).

- Each check is **new**, **on the keyboard** or **fixed**, comparing the
  draft's with the keyboard's in the draft's layer order
  (`tests/model/layer-reach.test.js`).
- Every warning or trap the draft keeps, made by it or not, asks for
  confirmation: **Apply anyway** / **Go back** (**Save anyway** in Live +
  review); notices and fixed checks do not (`checksToConfirm`;
  `tests/view/checks.test.mjs`). Core refuses an Apply, a Live + review Save or
  sending live without it, and it holds only for the reviewed revision
  (`tests/session/panel-controls.test.js`, `tests/session/live-edits.test.js`,
  `tests/session/profile-draft-session.test.js`).
- A new check names a draft edit group only when its source is unambiguous
  (`checkSourceGroup`; `tests/view/checks.test.mjs`).

## Making a layer the base

The base is a slot, not a layer (D-L37): the bottom one, always on, what
`TO(0)` returns to. **Make base** swaps a layer with the base as one reorder,
and the base row is never dragged (`tests/session/panel-session.test.js`).
`reorderLayers` in `core/model/portable-profile.js` holds the swap rules: the
two bases trade roles whether or not keys follow their layers, empty keys
change between `KC_NO` and transparent as they enter or leave the base, and an
uncoloured old base gets the saved base colour
(`tests/model/portable-profile.test.js`). The swap invents no way back; the
review's checks name what it leaves unreachable
(`tests/model/layer-reach.test.js`).

## Import comparison

**Choose profile…** and dropping one file on the Import profile card open the
same validated review in both shells and the demo (D-L15). A drop works only
when Import is editable, refuses several, unreadable or oversized files, and
never navigates away (`browser-tests/preview.spec.js`,
`tests/session/panel-loop.test.js`).

The card counts the backup's differences from the keyboard by area
(`categorySummary`; `tests/view/review.test.mjs`) and names none singly. A
backup identical to the keyboard says so and is usable only while the draft
has edits (`browser-tests/web-page.spec.js`). A backup carries no layer order,
so it is compared slot by slot (no test).

## Demo

The demo is a draft with no keyboard behind it (D-L53): the same
`ProfileDraftSession` over the bundled demo profile, or a backup checked as
Import checks one, under the capabilities current firmware reports
(`core/session/demo-session.js`; `tests/session/demo-session.test.js`,
`tests/data/demo-profile.test.js`).

- The editing gates hold unchanged; `model.device` says Demo with no
  connection and a strip says the demo is open
  (`tests/view/demo-view.test.mjs`).
- Core refuses Apply and reviewing against a keyboard; Export saves the draft.
  Leaving the demo with unexported edits needs `discardDemo`. The demo is
  offered only with no keyboard connected and no unapplied keyboard draft
  (`tests/session/demo-session.test.js`).

## Lighting preview

The board is a selected-layer preview, not LED telemetry (D-L12): base
lighting plus the selected layer (with layer preview, every layer on, lowest
first), then their LED groups, following the firmware's membership,
pass-through and inheritance rules (`webview/view/lighting.mjs`;
`tests/view/lighting.test.mjs`).

Brightness is absolute HSV; the reported limit constrains editing and never
rescales a read (`tests/session/base-rgb.test.js`). Pass-through is zero
saturation and brightness; LED-row inheritance is all three channels zero,
distinct from an explicit black (`tests/view/lighting.test.mjs`). Zero
brightness never hides the stored hue and saturation
(`browser-tests/review-regressions.spec.js`).

## Macro editor

An ordered list of Text, key/chord, delay, press and release steps over one
escaped payload (D-L26), in `webview/ui/macros/`.

- Text keeps literal braces, whitespace and Unicode; the Raw payload view
  round-trips to the same steps (`tests/view/macro.test.mjs`). Unparseable
  raw input is kept whole and blocks step editing
  (`browser-tests/macro-history.spec.js`). Incomplete fields stay local
  (`browser-tests/macro-steps.spec.js`).
- An empty macro has no steps; a key action opens the picker before adding,
  so cancelling leaves nothing (`browser-tests/macro-ux.spec.js`).
- Inspection uses the production codec and the setup and bank limits staging
  uses (`core/model/macro-input.js`), answered inline for a bound draft
  without staging (`tests/session/panel-loop.test.js`). The interface drops a
  reply whose context has changed (`browser-tests/macro-steps.spec.js`).
- `webview/view/macro-sequence.mjs` marks orphan releases, repeated holds and
  unfinished holds without repairing them (`tests/view/macro-sequence.test.mjs`).
- Every empty slot keeps room for ten key taps; when memory runs short the
  highest-numbered empty slots are unavailable. A name takes up to 32 UTF-8
  bytes (`tests/model/macro-editor.test.js`).
- Step history (`webview/view/macro-history.mjs`) keeps up to 100 entries per
  slot; typing in one field coalesces, and undo posts through inspection,
  never as draft undo (`tests/view/macro-history.test.mjs`). Step Undo/Redo
  win over draft history only while focus is in the macro editor, never fall
  through, and leave text fields and dialogs their own keys
  (`browser-tests/macro-history.spec.js`).
- One step clipboard serves every slot; paste is one entry with fresh IDs
  (`browser-tests/macro-history.spec.js`). Delete focuses the next surviving
  step (`browser-tests/macro-ux.spec.js`). Drag and Earlier/Later share one
  move rule; read-only and recording sequences do not drag
  (`browser-tests/macro-sequence.spec.js`).
- The recorder finishes a take when its slot stops being the visible editable
  one, a dialog opens or the person clicks outside, and stages it to its own
  slot only (`browser-tests/macro-recording-scope.spec.js`). Encoding is
  `webview/view/macro-recording.mjs` (`tests/view/macro-recording.test.mjs`).

## Focus across renders

- Every form control (`input`, `select`, `textarea`) authors a nonempty
  `data-f` identity, unique across the screen and any open picker or dialog.
  It names the field's owner and field, never a label or array position, so a
  reordered item carries it (`tests/view/form-identities.test.mjs`,
  `browser-tests/focus-identities.spec.js`).
- `webview/lib/focus.mjs` saves the identity and text selection before a
  render and restores them only when exactly one match remains
  (`browser-tests/focus-identities.spec.js`). A disclosure around the
  restored field stays open (no test).
- Macro steps get local IDs that `webview/view/macro-focus.mjs` carries
  through edits and reorders; they never reach the payload
  (`tests/view/macro-focus.test.mjs`).

## Host layouts and macro text

The keyboard types macro text through a host layout (firmware D-F16). Ark
generates `core/data/host-layouts.json` from the firmware's fixture
(`npm run upstream`) and never re-derives it, so what the editor accepts is
what the keyboard types (D-L56; `tests/data/host-layouts.test.js`).

- A Host edit that changes the effective OS carries the layout along
  (`followHostOs`); detection is not an edit, so Auto never rewrites it, and
  Host warns while the layout belongs to another OS
  (`tests/schema/host-settings.test.js`, `tests/model/settings-editor.test.js`).
- On macOS, Unicode entry is a layout choice, not a switch
  (`tests/schema/host-settings.test.js`).
- The editor refuses a character the layout cannot type without Unicode entry,
  and an ordinary key held across text that needs it
  (`tests/model/macro-editor.test.js`).
- Review lists text macros whose routes change with a Host edit; those rows
  belong to Host and discard with it. An unplayable macro is a warning, not a
  save blocker (`browser-tests/macro-host-review.spec.js`,
  `tests/model/profile-checks.test.js`).

## Macro input protection

Each macro offers protection as Automatic, On or Off (firmware D-F17; D-L57).
Automatic turns on for text the layout must enter as Unicode
(`tests/model/macro-editor.test.js`). An explicit choice is a three-byte
canonical prefix in the macro's bytes that edits keep and the bank counts;
Automatic stores none (`tests/schema/macro-payload.test.js`). Review groups
Automatic's effect with Host and an explicit choice with its macro (no test).

## Participation controls

Ark exposes the firmware's participation contract at every scope (D-L55),
whose rules are in
[participation-policy.md](../../upstream/firmware/docs/spec/participation-policy.md):
switches in Settings, enabled and allowed layers on shared behaviours and
combos, and **Use behaviour** / **Join combos** on placements
(`browser-tests/participation.spec.js`).

The Key tab explains each blocked scope, and a transparent key leads to the
placement that supplies it (`tests/view/participation.test.mjs`). Controls
are ordinary draft edits; switching off keeps definitions and timing, and a
reorder moves masks and placement bits with their layers
(`tests/view/edits.test.mjs`).

## Combo output behaviour permissions

Settings → Combos has **Combo outputs use behaviours** and each combo builder
**Use output behaviour**. Both default on and veto behaviour use by a combo's
output, independently of chord participation
(`browser-tests/combo-output-behaviors.spec.js`).

- The global value is a flag in the Settings header, not a scalar
  (`tests/schema/settings-domain-v1.test.js`). Review, Discard, Undo/Redo,
  backups and layer reorder keep both; a backup without the field reads it as
  on (`tests/view/edits.test.mjs`).
- Native readback compares the permission (`tests/protocol/combo-readback-v1.test.js`),
  and reach lists honour both (`tests/view/combo-reach.test.mjs`).
- The combo builder names a custom key output's shortcut, or says it sends
  nothing (no test).

## Keyboard name

The keyboard's own name is one more counted name in the settings domain
(firmware D-F14's name rule; D-L62). Empty means the firmware's built-in name,
and the firmware serves the effective name as its USB product string
(firmware D-F25). It is profile data, reviewed as Keyboard name under Settings
(`tests/model/keyboard-name.test.js`).

- `deviceLabels` names a listed keyboard by its product name and the connected
  one by its stored name, adding a serial or number only where two labels
  match (`tests/session/device-model.test.js`).
- The Keyboard screen's title is the name (`titleName`), following
  `canEdit("settings")`, with the built-in name as placeholder
  (`browser-tests/settings-shell.spec.js`). It posts trimmed; core refuses
  more than 32 bytes or control characters (`tests/view/edits.test.mjs`,
  `tests/model/keyboard-name.test.js`).

### Restart after a rename

A change to the stored name, by a save or in the live modes by an edit, undo
or Revert, makes the firmware restart USB once it is safe (firmware D-F25).
Ark expects it (`core/session/keyboard-reconnect.js`;
`tests/session/keyboard-reconnect.test.js`):

- The drop is a diagnostic, not an error, and the model carries
  `reconnecting: {name, lost: false}`.
- Waiting for the restart has no timeout; once the connection drops, the loop
  waits at most 10 s. The web page stops connecting the first allowed
  keyboard meanwhile (that part: no test).
- A known serial must match. Without one, Ark reconnects only to a keyboard
  not listed before the save that reports a new name no other keyboard had;
  anything else is left to the person. Reading or choosing a keyboard ends the
  wait.
- After a live rename, a read naming the draft's edit session is the same
  keyboard, so the draft follows it with its history
  (`tests/session/live-edits.test.js`).

### Following a lost keyboard back

A keyboard lost unexpectedly (a request Ark waits on goes unanswered, or it
drops off USB in a shell that shows serial numbers) is followed back the same
way, with `lost: true`, at most once in 30 s; a web page follows Chrome's
connect events instead (`tests/session/lost-keyboard.test.js`). The
diagnostics name the first bytes of the unanswered request (no test).
