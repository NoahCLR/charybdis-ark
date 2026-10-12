# Interface rendering and rule ownership

The app contracts behind
[D-L32](../LIVE_EDIT_APP_DIRECTION.md#d-l32--things-sit-in-fixed-places) and
[D-L33](../LIVE_EDIT_APP_DIRECTION.md#d-l33--one-home-for-each-rule-the-app-needs-twice).
The [guide](../GUIDE.md#the-interface) explains using the interface; this
specification owns rendering invariants and the modules that supply shared
meaning. Layer dependencies and placement of new work remain governed by
[AGENTS.md](../../AGENTS.md).

## Fixed positions and composed reach

A repeated element sits in the same place every time it appears, so a screen
reads as a grid rather than as text that wraps wherever it lands.
Review and Draft history reserve separate positions for tap-count badges and
tier dots, including when either is absent; title slots fit a full combo badge
with space before its name.
The Keys workbench tabs count what the selected layer stores. The Key tab counts
mapped keys, excluding transparent and disabled positions; its selected key's
layout index belongs in the key details. Every Keys tab is at least as tall as
the Behaviours tab; a taller editor carries its height across tab changes, so
changing tabs does not move the page's scroll position.
The Behaviours, Combos, Macros and Pointing modes reach lists lead with **On
this view**, calculated for the selected layer plus exactly the lower layers
currently previewed on. **On this layer** means a key stored on the selected
layer, and the other route groups describe ways it can reach an item under
different activations. The view can therefore overlap those groups; it is the
current activation, not another storage location. A combo in the view requires
all inputs in that activation and uses the configured Combo Layer Matching
reference when one is set. Tab counts still count the selected layer's stored
routes. On the board, a key the selected layer stores keeps its own marks; a
transparent key answered from below wears that key's behaviour dots and the
badges of the combos On this view lists it in (`combosInPreview` in
webview/view/keyface.mjs). Under Combo Layer Matching the reference layer's keys
are matched instead, so no answer from below adds a badge.

Combo grouping skips activation enumeration when there are no combos. For
current-layer matching it enumerates only lower layers that can answer a
transparent position on the top layer, including disabled keys that block an
input below. Other holds cannot change the answer and are omitted, preserving
the smallest held set for each route. This keeps a first Macros open from
enumerating every combination of all 16 layers just to list its placements.

The reach sections have one open state by section identity across those four
tabs. Opening one does not close another. A section unique to one tab keeps its
own state; sections absent from another tab retain their state until shown
again. The Behaviours rail grows with its rows, so the Keys content pane is its
only vertical scroller.

- The review is one grid: a status gutter, the title with its area underneath
  when outside its section, the fields as sign · label · on the keyboard · in
  your draft, then Show and Discard at the edge. A field is marked as a diff
  marks a line: + added, − removed, nothing for changed. A side with nothing
  shows a dash in its own column.
- A destructive action is the last thing in its row.
- The draft's dot follows a row's label; on a tile it has one fixed spot.
- A removed thing keeps its mark and Show only where it is still on screen (a
  cleared pointing slot, an emptied macro slot).
- A table's owner reads by the name its dropdown offers, with its mark, never
  an enum.
- Where marked and unmarked labels share a column, every label gets the same
  mark slot (`marked(…, {slot: true})` in `webview/ui/marks.mjs`).

## Shared rule ownership

- Words: `core/model/vocabulary.js`, sent as `model.vocabulary`; stages are
  found by id, never by label.
- Key names: `core/model/key-names.js`. The catalogue names what QMK ships;
  the profile names its macros, pointing-mode keys and bare user slots. The
  effective Host OS also names Alt/Option and GUI/Command/Windows/Super,
  including modifier wrappers, mod-taps, layer-mod keys, Magic actions and Space Cadet keys,
  without changing stored keycodes. Macro command previews and held-key
  warnings resolve those same labels; raw payload editors keep stored codes.
  Modifier-bearing catalogue labels are identified centrally by their words,
  independently of picker groups, so another key family inherits the rule. The
  screens' `qmkKeyLabels` and the review are both built from it, each from
  its own snapshot, so a key reads the same in the combo table, the picker and
  the review. The webview never names a keycode: a form such as the combo builder
  stores keycodes and looks up their current labels on each render. It never
  caches display words across model updates. `hostKeyVocabulary()` in the same
  module derives all eight modifier controls, their stable picker wrappers,
  grid headings, summaries and accessibility labels from the modifier
  vocabulary. Key Options uses the same host naming rule. Auto with an unknown
  host uses neutral Alt/GUI wording. The webview has no modifier-name table;
  an unnamed value falls back to its stored code. Host-switch browser checks
  exercise open behaviour pickers, combo builders, macro previews and pointing
  editors through the production model-message handler. The stored name
  (`KC_KP_1`) is added only when a review row's two sides would read alike.
  A layer is always named by its name, in the picker's verbs: `MO(3)` reads
  "Hold Navigation", `LT(3,KC_SLASH)` "/ / Navigation", and a layer key's cap
  shows the layer's name. Only a raw keycode, where one is shown, keeps the
  number.
- Actions, native keycodes, decode limits, layer references:
  `core/schema/actions.js`; the pointing registry and key layout are data.
- Decoding: once per draft revision, carried as `decoded` and taken through
  `decodedOf`; history entries are frozen.
- Pure domain edits and presentation: `core/model/device-profile-edits.js`,
  `core/model/key-behavior-edits.js` and `core/model/device-profile-view.js`.
  The session translates wire capability bits into the model's destination
  facts before staging; the model imports no session or protocol modules.
- Settings bits and base lighting: `fieldMask` and `baseLighting` in
  `core/model/settings-editor.js`.
- Panel sequencing: `core/session/panel-controls.js`, tested with a fake
  service; the message loop around it, for every host:
  `core/session/panel-loop.js`. `extension.js` supplies dialogs, files,
  progress and toasts as host functions.
- Whether the draft takes an edit now: `draftBinding` in
  `core/session/panel-session-state.js`, published as `draft.editable` and
  `draft.reason`, with the session's compound transitions beside it (D-L60).
- Interface: `canEdit(area)` for permission, `view/reach-groups.mjs` and
  `ui/groups.mjs` for grouped lists, `slotLight` in `ui/marks.mjs`, one form
  per macro slot and one `state.combo` for the builder.
  Every panel state field declares its initial value and draft-replacement
  policy together in `store.mjs`; `view/state-fields.mjs` constructs fresh
  state and resets fields from those declarations. A policy keeps the value,
  resets it, or computes a replacement from the state before the change.
  The declaration preserves the existing behavior: pending `cellHow` and the
  LED group builder (`ledPicks`, `trackball`, `rowColour`, `ledRow`) stay kept.

## Focus across renders

Every form control (`input`, `select`, `textarea`) authors a nonempty `data-f`
identity. It is unique across the complete rendered surface, including an
underlying screen and its open picker or dialog. A field's identity includes
its semantic owner and field: pointing slot and setting, lighting stage and
layer/slot/channel, key position and layer, or macro slot and step. Reordering
an item carries its identity with it. Labels and current array positions do
not identify reorderable items.

The shared `webview/lib/focus.mjs` path captures that identity and the text
selection before a render, and restores them only when exactly one matching
form control remains. Removed or ambiguous identities receive no replacement
focus. A disclosure enclosing the restored field stays open so it remains
reachable. Buttons and SVG keyboard keys retain their authored action hooks.
Search uses this same path, including Settings filtering.

Macro steps have no identity in the stored format. The editor assigns local
opaque step IDs; `webview/view/macro-focus.mjs` carries them through edits and
reorders, and reconciles fresh host steps with matching prior values once per
step. The metadata names controls only. It is excluded from serialization and
posted edits; untouched step contents still come from the host payload rather
than a cached editor copy. Newly inserted or replaced steps receive fresh IDs.

A source guard requires every authored form control to name its identity.
Browser traversal checks nonempty, unique identities on screens and dialogs
and forces accepted-model DOM replacements to check focus restoration. The
Pointing caret and Settings-search regressions exercise text selection, and
macro checks exercise repeated and reordered steps.
