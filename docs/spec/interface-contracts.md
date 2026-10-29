# Interface rendering and rule ownership

How Ark's interface renders and which module owns each rule more than one
screen needs. Each rule names the test that holds it; "(no test)" marks a
contract no test holds. `npm run preview` renders the real interface over
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

- Tab counts count what the selected layer stores (`tabReach`'s `count`,
  `webview/view/tab-reach.mjs`); the Key tab counts mapped keys, not
  transparent or disabled ones (`tests/view/tab-reach.test.mjs`,
  `tests/view/lighting.test.mjs`).
  Reach rows name keys as the board does, never by layout index (no test).
  A route through a behaviour names its key, then each cell that sends the
  row's thing as Review marks a tier (branch badge, tier dot, tier name),
  joined by "or"; a combo through a behaviour does the same after its
  "through". A behaviour on a key the row already names follows that key
  instead of naming it again (`tests/view/reach.test.mjs`,
  `browser-tests/marks.spec.js`).
- Every Keymap tab is as tall as the Behaviours tab, at every width: with
  another tab open, the editor the Behaviours tab would show is laid out
  behind it, the workbench's height read and the copy removed in the same
  step, so the page never holds two editors (`matchBehavioursHeight`,
  `browser-tests/keys-workbench.spec.js`). The tabs also share a minimum
  height, and a taller editor carries its height into the next render, so
  changing tabs keeps the scroll position (`tests/view/scroll.test.mjs`). A
  list never sets that height: every Keys
  tab that lists what a layer reaches draws one grouped table
  (`reachTable`, `webview/ui/groups.mjs`), which scrolls in its own pane under
  its column header and the band of the group in view, and keeps its place
  per tab. A pick made elsewhere scrolls its row into the pane; unfolding a
  group does not (`tests/view/scroll.test.mjs`,
  `browser-tests/keys-workbench.spec.js`).
- Reach groups come in one order, `GROUP_ORDER`, so headers stay put between
  tabs, and the view's groups lead (`tests/view/reach-groups.test.mjs`).
  **On this view** is the selected layer plus exactly the lower layers
  previewed on: an activation, not a storage place, so it may overlap the
  other groups. Base, and every default layer the keyboard keeps, is on in it
  only once layers are previewed together, as the layer bar shows base on; a
  layer shown alone is the view by itself, and its transparent keys answer
  nothing there (what they fall through to is under **Through a transparent
  key**). The view is `viewPositions` (a layer view's `shown`); what the
  keyboard does, with base and its default layers always on (each published
  layer's `alwaysOn`), stays `resolvedPositions` (its `answers`), and a key
  they answer needs nothing held: the hover
  card's fall-through, a selected transparent key opening the behaviour from
  below, and picking a combo input on the board. A combo is in the view only
  when that activation holds all its inputs, matched on the Combo layer
  matching reference when one is set, as core publishes it per layer
  (`comboReferenceLayers` in `core/model/combo-reach.js`: the draft's layer
  records, else the keyboard's combo readback, else the layer itself; the
  same rule Review's walk matches combos on; `tests/model/combo-reach.test.js`,
  `tests/model/profile-model.test.js`, `tests/view/layer-resolution.test.mjs`,
  `tests/view/reach.test.mjs`, `tests/view/combo-reach.test.mjs`).
- On the board, a transparent key answered from below wears that key's
  behaviour dots and the badges of the combos it fires in the view
  (`view.combos.badgesAt`); under Combo layer matching nothing from below adds a
  badge (`tests/view/board-keys.test.mjs`, `tests/view/combo-reach.test.mjs`).
- Which combos fire from each layer, under which smallest hold and on which
  keys, is core's (`core/model/combo-reach.js`), published per layer as
  `comboReach` and kept until the keys, combos, their matching or the
  default layers change; the interface turns it back into the keys it draws
  and groups it. For each combo, core holds only the lower layers whose keys
  under a transparent top-layer key press one of its inputs, since holding
  any other layer can only hide one, and tries either those holds, smallest
  first, or the sets of answers its keys can give, whichever are fewer; it
  finds the same hold trying every hold would, which a seeded test holds it
  to, and a disabled key still blocks an input below
  (`tests/model/combo-reach.test.js`, `tests/model/profile-model.test.js`,
  `tests/view/combo-reach.test.mjs`).
- Reach sections keep one open state per section across the Keymap tabs, and
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
  (`browser-tests/macro-ux.spec.js`,
  `browser-tests/custom-key-behaviour.spec.js`).
- A Settings screen (Behaviours, Combos, Pointer, Host) draws its
  sections as open cards, none folding, and offers no search
  (`tests/view/settings-layout.test.mjs`,
  `browser-tests/settings-screens.spec.js`).
- A slot bank (Macros, Custom keys) and a list beside its editor (Lighting's
  layers and pointing modes) scroll on their own and keep their place across
  renders of the same screen, each list apart (`data-scroll-list`)
  (`tests/view/scroll.test.mjs`, `browser-tests/macro-ux.spec.js`,
  `browser-tests/lighting-controls.spec.js`).
- Keys and Lighting draw the same layer strip on the board
  (`tests/view/navigation-profile-ui.test.mjs`), Rename & reorder included
  (no test).

## Marks

Each thing with a colour of its own has exactly one mark, drawn by
`webview/ui/marks.mjs` wherever the thing is named (D-L31):

| Thing | Mark |
| --- | --- |
| A behaviour tier (tap, hold, long hold) | the dot the keyboard flashes when it resolves (`tierDot`); a key feedback state's LED rows carry its tier's (`vocabulary.feedbackTiers`) |
| A tap count (2× and up) | its branch badge in its tap-branch colour (`branchBadge`) |
| A layer | the board's icon in its layer colour (`kindIcon`); in a set of layers, before each layer's name (`valueMarked`) |
| A pointing mode | the Pointing modes screen's icon in the light its slot paints (`kindIcon`, `slotLight`) |
| A combo | its badge in the combo feedback colour (`comboBadge`) |
| A lighting stage | its on/off dot |

- A thing is marked where it is the subject and where it is referred to. A
  swatch shows a layer's or pointing mode's colour, and is not its mark, only
  where the colour is the subject (Lighting's colour fields and its lists of
  layer and pointing-mode colours, colour values in the review, a pointing
  slot's Light value) or where every item is a layer (the layer bar, the
  "On layers" chips on Custom keys and Macros); a pointing slot is named by
  its mark everywhere, its slot card, editor header and the Keymap tab's
  Pointing modes table included; those call `layerSwatch` or
  `slotLight` directly, never `mark` (`browser-tests/marks.spec.js`).
  Otherwise a setting carries the mark of what it governs (`governs` in
  `core/model/settings-editor.js`) on the Settings screens, its per-layer
  switches and layer matching included, the editors and the review
  (`tests/model/profile-review.test.js`).
- A key or action is named through `actionMarked` or `keyNameMarked`; only
  attributes and plain-text messages carry the words alone
  (`tests/view/key-names-marked.test.mjs`). One that acts on a layer or runs a
  pointing mode, named in the core's words for it ("Hold Numbers", "Zoom ·
  lock"), is drawn as `sends` draws it, inline: the mark, the name and the
  action as a tag, never the action's word as text; the review's values read
  the same (`valueMarked`; `browser-tests/marks.spec.js`). A layer-tap core
  names carries its layer's mark before the layer's name ("/ / ▦ Navigation",
  from `qmkKeyLayerTaps`), and so does a layer's name alone. A value Review
  cannot name so (a layer-tap no longer in the profile) has the mark in front
  of the whole value ("▦ J / Symbol"); a screen never cuts a name to place it.
  Which layer a keycode acts on is
  `keyLayer` in `core/model/key-names.js`, published as `qmkKeyLayers`, and
  what it does to that layer is `keyLayerForm`, published as
  `qmkKeyLayerForms`. A key cap (`keyFace` in `webview/view/keyface.mjs`)
  draws a line only for a layer-tap, a mod-tap and a dual-role layer key
  (`OSL()`, `TT()`): its tap above, its hold below. A dual-role layer key's
  cap names its layer, and below the line what it does to it
  (`vocabulary.keyCapLayerVerbs`, which lists exactly the layer forms core's
  `dualRole` counts); any other key reads on one line by core's name for it
  (`tests/model/profile-model.test.js`, `tests/view/keyface.test.mjs`,
  `tests/model/vocabulary.test.js`). Whether a key is transparent or
  disabled, or a macro's or a custom key's, is `keyKind` in
  `core/model/key-names.js`, published by every name a keycode is read under
  as `qmkKeyKinds` and read through `keyKindOf`; no screen knows one by its
  spelling (`tests/model/profile-model.test.js`,
  `tests/view/keyface.test.mjs`).
- In the behaviour grid and the hover card, a branch or combo action that acts
  on a layer, runs a pointing mode or plays a macro reads as that thing
  (`sends`): its mark (a macro has none), then its name and its tags
  ("Navigation `HOLD`", "Arrow `LOCK`"), and the line under it leads with its
  kind ("layer", "pointing mode"; `namedAction` in
  `webview/view/named-action.mjs`). A layer action's tag is what it does to
  its layer (`qmkKeyLayerForms`), in `vocabulary.layerKeyVerbs`; a layer-mod's
  is its modifiers, as core words them (`qmkKeyLayerMods`: "Navigation +
  Shift" is tagged "+ Shift"), and a layer-tap names what it taps as core
  words it (`qmkKeyLayerTaps`), never by cutting its label. A built-in cell
  draws it the same way, dim and dashed, and says "built in"
  (`browser-tests/behaviour-named-actions.spec.js`).
- A stage that is off draws its marks off; an icon loses its colour. A
  colour is the keyboard's own, so a dark one reads dark; a badge keeps its
  count in the text colour (no test).
- Where marked labels share a fixed mark slot (`marked(…, {slot: true})`), a
  layer's or pointing mode's icon fills the whole slot and ends where the tier
  dots do, so the words after it still start at one edge (no test).
- The draft's dot is not one of these marks
  ([Draft marks](#draft-marks-and-draft-history)).

## Shared rule ownership

A rule more than one place needs has one owning module, and core publishes its
meaning to the interface (D-L33). Each row says what the rule is, its owners
and the tests that hold it; a rule with more to say has a subsection after the
table, and owners with rules of their own have a section below. A fact, such
as QMK's keycode layout, a limit or the words for a stored value, is not a row
here: its home and tests are in
[Facts and their homes](../architecture/README.md#facts-and-their-homes).

| Rule | Owner | Held by |
| --- | --- | --- |
| Settings help: `hint` stays visible, `tooltip` adds to it, read-only reasons join them in `data-tip`, shown by `webview/ui/hover.mjs` | `core/model/settings-editor.js` | `browser-tests/settings-tooltips.spec.js` |
| Number entry: the input mode a field asks for, what typing keeps, and where range limits sit ([more](#number-entry)) | `webview/lib/number-entry.mjs` | `tests/view/number-entry.test.mjs`, `browser-tests/number-entry.spec.js` |
| Screens: IDs, labels, rail groups, availability, rendering and redraw; `PanelState.screen` takes its IDs from here; an unknown ID shows an unavailable screen | `webview/view/screens.mjs` | `tests/view/screens.test.mjs`, `browser-tests/screens-registry.spec.js` |
| Which settings sections each Settings screen draws, and where a section is edited ([more](#settings-screens-and-sections)) | `webview/view/settings-layout.mjs` | `tests/view/settings-layout.test.mjs`, `tests/view/review.test.mjs`, `browser-tests/settings-screens.spec.js` |
| Edit modes: their words and the order the switch offers them ([more](#edit-modes)) | `core/model/vocabulary.js`, `core/session/panel-session.js` | `tests/model/vocabulary.test.js`, `tests/protocol/profile-edit-v1.test.js`, `tests/session/live-watch.test.js`, `tests/view/edit-mode.test.mjs`, `tests/view/enum-drift.test.mjs`, `browser-tests/live-edits.spec.js` |
| Actions, native keycodes, decode limits, layer references | `core/schema/actions.js` | `tests/schema/actions.test.js` |
| Custom-key shortcut keys (firmware D-F26): which keys a shortcut holds, and the caps on them ([more](#custom-key-shortcut-keys)) | `core/schema/settings-domain-v1.js` (`SHORTCUT_KEY_CAPS`, `shortcutKeysRefusal`), `core/model/custom-key-editor.js` | `tests/schema/settings-domain-v1.test.js`, `tests/model/custom-key-editor.test.js`, `tests/view/custom-key.test.mjs`, `browser-tests/custom-key-shortcut.spec.js` |
| Decoding once: a snapshot's decoded form, and draft history entries ([more](#decoding-once)) | `core/model/portable-profile.js`, `core/session/profile-draft-session.js` | `tests/session/profile-draft-session.test.js` |
| Pure edits and presentation; the model imports no session or protocol module | `core/model/device-profile-edits.js`, `core/model/key-behavior-edits.js`, `core/model/device-profile-view.js` | `tests/model/device-profile-edits.test.js`, `tests/layering.test.js` |
| Layer answers: which stack slots answer each position under which active layers ([more](#layer-answers)) | `core/model/layer-resolution.js` compiles and publishes each position's answers; `rules/layer-answers.mjs` says which one answers under the layers that are on | `tests/model/layer-resolution.test.js`, `tests/rules/layer-answers.test.mjs`, `tests/view/layer-resolution.test.mjs` |
| Combo inputs: which keys press a combo's inputs (by the input positions the keyboard reports, otherwise by keycode or what the key means) and whether they cover every input, so its chord forms (D-L73) | `rules/combo-inputs.mjs`, read by `core/model/combo-reach.js` (`comboReach`) and `webview/view/combo-reach.mjs` (the view of the layers turned on, and which key is a combo's input number n) | `tests/rules/combo-inputs.test.mjs`, `tests/model/combo-reach.test.js`, `tests/view/combo-reach.test.mjs` |
| A definition's own switches: why a behaviour or combo's Use switch or its layers keep it off a layer (D-L73) | `rules/definition-switches.mjs`, read by `core/model/participation.js` and `webview/view/participation.mjs` | `tests/rules/definition-switches.test.mjs`, `tests/model/participation.test.js`, `tests/view/participation-oracle.test.mjs` |
| Layer keycode placement: where a layer keycode may be stored (a key, a tap, a press-and-hold branch, a combo's output), and that DF(), PDF(), a layer past the keyboard's and a lock of a layer it lacks go nowhere; each side says it in its own words (D-L73) | `rules/layer-placement.mjs`, said by `core/schema/actions.js` (`placementProblem`) and `webview/view/keycode-expression.mjs` (`keyProblem`, `comboOutputProblem`) | `tests/rules/layer-placement.test.mjs`, `tests/schema/actions.test.js`, `tests/view/keycode-expression.test.mjs` |
| QMK key expressions: how a name, a call (LCTL(KC_A), MT(), LT(), MO(n)…) or a number reads as the keycode it stores, in one grammar with two dialects whose differences are one table (`DIALECTS`): QMK's own, which core's encoder reads, and the keyboard's, with its own names and whitespace anywhere, which the draft stores by and the picker checks by, so the two accept the same keys (D-L73) | `rules/keycode-expression.mjs`, read by `core/schema/keycodes.js` (`encode`), `core/schema/compiled-profile-v1.js` (`resolveNativeQmkExpression`) and `webview/view/keycode-expression.mjs` (`keycodeValue`) | `tests/rules/keycode-expression.test.mjs`, `tests/schema/keycodes.test.js`, `tests/schema/compiled-profile-v1.test.js`, `tests/view/keycode-expression.test.mjs` |
| Macro text: how text, `{key}`, `{key,key}`, `{+key}`, `{-key}` and `{milliseconds}` read as steps, the limits on them, and why one does not read, as a reason code (D-L73). Core reads it by keycode, sending only the key names the step editor offers, and refuses a macro that leaves a key held, which the step editor names key by key; the step editor reads it by key name, as a person types. Both word each reason from `vocabulary.macroProblems` (core through `wordedMacroError`, wherever it reads a macro), and both skip an empty name between commas | `rules/macro-payload.mjs`, read by `core/schema/macro-payload.js` (`parsePayload`) and `webview/view/macro.mjs` (`parseMacro`) | `tests/rules/macro-payload.test.mjs`, `tests/schema/macro-payload.test.js`, `tests/view/macro.test.mjs`, `tests/view/macro-cache.test.mjs` |
| The lighting colour compositor: the order the stages paint in and the two "no colour" rules, a firmware rule (D-L73) ([more](#lighting-preview)) | `rules/led-light.mjs`, read by `webview/view/lighting.mjs` | `tests/rules/led-light.test.mjs`, `tests/view/lighting.test.mjs` |
| Idle lighting timeout: staged in milliseconds, edited in seconds or minutes; changing the unit stages nothing; zero means always on | `webview/view/duration.mjs` | `tests/view/duration.test.mjs`, `browser-tests/preview.spec.js` |
| Shortcut words: ⌘ and ⇧⌘ on a Mac, Ctrl and Ctrl+Shift elsewhere, in text, tips and `aria-keyshortcuts`; no screen writes ⌘ itself | `webview/view/shortcuts.mjs` | `tests/view/shortcuts.test.mjs`, `browser-tests/shortcut-glyphs.spec.js` |
| Panel sequencing; the page's shell supplies the file chooser, downloads, recovery storage and progress; a failure's notice is its sentence, never its code, and the reply marks it `failed` | `core/session/panel-controls.js`, `core/session/panel-loop.js` | `tests/session/panel-controls.test.js`, `tests/session/panel-loop.test.js`, `tests/view/messages.test.mjs` |
| What the page offers (`model.shell`, D-L71) ([more](#what-the-page-offers)) | `core/session/panel-session.js`, `webview/view/shell-panel.mjs` | `tests/session/panel-session.test.js`, `tests/view/shell-panel.test.mjs`, `browser-tests/preview.spec.js` |
| The device service's adapter, as [the layers](../architecture/README.md#the-layers) say | `core/session/profile-device-service.js`, `scripts/build-web.js` | `tests/session/profile-device-service.test.js`, `tests/scripts/web-build.test.js` |
| An Apply or Save cut short: its verdicts and the words a person reads ([more](#an-apply-or-save-cut-short)) | `core/session/interruption.js` | `tests/session/interruption.test.js`, `tests/session/portable-profile-session.test.js`, `tests/session/live-edits.test.js` |
| Panel state fields declare their initial value and draft-replacement policy together | `webview/store.mjs`, `webview/view/state-fields.mjs` | `tests/view/state-fields.test.mjs` |
| Lighting: one `webview/ui/lighting/` module per stage, posting the shared edit builders | `webview/ui/lighting.mjs` | `browser-tests/lighting-controls.spec.js` |
| Pointing: the slot editor holds a direction set to Ignore until its modifiers are chosen, and posts the complete record | `webview/ui/pointing.mjs`, `webview/ui/pointing/` | `browser-tests/pointing-controls.spec.js` |
| Pointing links (firmware D-F62): which layers may start a slot's mode or be turned on by its key ([more](#pointing-links)) | `core/model/pointing-links.js`, `core/model/layer-effects.js` (`keycodeLayersOn`), `rules/pointing-link-starts.mjs` (whether a published start holds under the layers on), `webview/view/pointing-link.mjs`, `webview/view/pointing-reach.mjs` | `tests/model/pointing-links.test.js`, `tests/rules/pointing-link-starts.test.mjs`, `tests/model/layer-reach.test.js`, `tests/model/layer-effects.test.js`, `tests/session/pd-mode-editing.test.js`, `tests/view/pointing-link.test.mjs`, `tests/view/pointing-reach.test.mjs`, `browser-tests/pointing-controls.spec.js`, `browser-tests/keys-workbench.spec.js` |
| Shortcut layers (firmware D-F26): which layers a custom key's shortcut may turn on ([more](#shortcut-layers)) | `core/model/shortcut-layers.js`, `webview/view/custom-key.mjs` (`shortcutLayerRows`) | `tests/model/shortcut-layers.test.js`, `tests/model/custom-key-editor.test.js`, `browser-tests/custom-key-shortcut.spec.js` |
| The rail's keyboard button and its menu ([more](#the-rails-keyboard-menu)) | `webview/view/keyboard-menu.mjs`, `webview/ui/keyboard-menu.mjs` | `tests/view/keyboard-menu.test.mjs`, `browser-tests/preview.spec.js`, `browser-tests/live-edits.spec.js` |
| The commit bar: which bar the frame shows over the draft (an Apply running, its read back, a failed one until dismissed, a held live edit, other work, a draft from another keyboard or one the keyboard changed under, a restart, the live modes', the review), drawn by `webview/ui/frame.mjs` | `webview/view/commit-bar.mjs` (`commitBarState`) | `tests/view/commit-bar.test.mjs`, `browser-tests/live-edits.spec.js`, `browser-tests/apply-progress.spec.js` |
| Whether an area takes an edit now: the draft core binds (`draft.editable`) and the area's own capability, Export only the keyboard; and what a screen says when it does not, or nothing while the draft is busy, which the commit bar says | `webview/view/edit-gate.mjs` (`editGate`) | `tests/view/edit-gate.test.mjs`, `tests/scripts/conventions.test.js` |
| Which key a spelling is, and whether two spellings are one key: the name the profile knows it by, one canonical spelling per key, the macro, custom key or pointing slot (held or locked) it is, and two ways of finding a behaviour row kept apart, the row keyed exactly by the spelling (what a key means, what a combo sends) and the row listening to the key however either is spelled (a picked or typed key); worked out once per model and spelling | `webview/view/key-identity.mjs` (`keyIdentity`, `sameKey`, `keycodeName`, `macroIndex`) | `tests/view/key-identity.test.mjs`, `tests/scripts/conventions.test.js` |
| The keycode picker: which keys and sections a field takes, what is lit and picked, what the pick stores and why it cannot be used yet, and what a search finds (at most `SEARCH_ROWS` keycodes), drawn by `webview/ui/picker.mjs` | `webview/view/picker.mjs`, `webview/view/picker-sections.mjs` | `tests/view/picker.test.mjs`, `tests/view/picker-sections.test.mjs` |
| What reaches one key and what it uses, which the hover card and the Key tab both draw: the layer's own key shown alone, the key answering it from below, and of its behaviour row whether it runs here, changes nothing or has no branches, and a dual-role key's threshold and hold; drawn by `webview/ui/hover-card.mjs` (placed by `webview/ui/hover.mjs`) and `webview/ui/keys/key-tab.mjs` | `webview/view/key-reach.mjs` (`keyReachAt`, `keyReach`, `keyBehaviour`) | `tests/view/key-reach.test.mjs`, `browser-tests/participation.spec.js` |
| What the board shows at each key and on the trackball: the key that answers in the view and the layer supplying it, glass or solid, its light, the dots and badges of what runs there, and in the LED selector each LED's index; drawn by `webview/ui/board.mjs` | `webview/view/board-keys.mjs` (`boardKeys`, `boardTrackball`) | `tests/view/board-keys.test.mjs`, `browser-tests/marks.spec.js`, `browser-tests/participation.spec.js`, `browser-tests/lighting-controls.spec.js` |
| One view of the layer stack: the layer the board shows and the layers previewed with it, by their place in the stack, which is each published layer's `index`; what answers and what shows at each key in it, and the combos and behaviours it reaches, each worked out once per model and view. Screens ask the current one (`currentView()`, `webview/store.mjs`) rather than passing the layer and the preview | `webview/view/layer-view.mjs` (`layerView`, read through `view.answerAt`, `view.shownAt`, `view.combos`, `view.behaviours`) | `tests/view/layer-view.test.mjs`, `tests/view/combo-reach.test.mjs`, `tests/view/behaviour-reach.test.mjs` |
| What a layer view reaches as each Keymap tab lists it: the tab's groups, what each lists and says when empty, the tab's count, and the group a row asked for by name is picked under | `webview/view/tab-reach.mjs` (`tabReach`) | `tests/view/tab-reach.test.mjs`, `tests/view/reach.test.mjs`, `tests/view/pointing-reach.test.mjs`, `browser-tests/keys-workbench.spec.js` |
| A reach row picked in a Keymap tab: its id (`group:name`, `reachRowId`), and the keys the board rings for it by the route it was picked under | `webview/view/tab-reach.mjs` (`tabReach`'s `keysFor`), `webview/view/behaviour-reach.mjs` (`behaviourRouteKeys`, read as `view.behaviours.routeKeys`) | `tests/view/tab-reach.test.mjs`, `tests/view/behaviour-reach.test.mjs`, `browser-tests/keys-workbench.spec.js` |
| Device facts, the review sheet, the unsaved-demo dialog; the app keeps routing, rendering, focus and scroll, and window keys | `webview/ui/device.mjs`, `webview/ui/review-overlay.mjs`, `webview/ui/leave-demo.mjs` | (no test) |

### Number entry

Whole numbers author `inputmode="numeric"`, durations `"decimal"`. Typing,
pasting or dropping keeps only digits (and a duration's first point) with the
caret in place. Range limits stay with the edit.

### Settings screens and sections

Which settings sections each Settings screen draws, in order, is
`SETTINGS_SCREENS`, and the screen a section is edited on, where the review's
Show goes, is `screenOfSection`; a note names it as the screen, named as
outside the rail, then the section ("Behaviour settings → Tap & hold timing",
`sectionPath`). Lighting's Auto-mouse links open Pointer settings and the
macro editor's Your computer link opens Host settings. Outside the rail, a
Settings screen is named as `vocabulary.settingsScreens` names it ("Pointer
settings"), since nothing around a link says it is a setting. Default layers
is on none: core still publishes it, so the review lists and reverts a stored
difference, and its checks, pointing links and layer reorder read the stored
value.

### Edit modes

The edit modes have their words, and the order the switch offers them
(`editMode.offered`): Live edit, Live preview + save, then Review and save.
The keyboard's Apply and Save both read as Save
([D-L72](../adr/0072-users-see-save-for-both-keyboard-operations.md)).

### Custom-key shortcut keys

Firmware D-F26. Which keys a shortcut holds (`customKeyShortcutKeys`, by
catalog name) and the caps on them are data the codec itself checks: at
most six, each once, at most one media and one system key, each cap with its
keycodes and the codec's words when broken, and the limits in words,
published as `customKeyShortcutKeyLimits` (`SHORTCUT_KEY_LIMITS`). The picker
reads the caps against the keycodes it would post and says the first one
broken (`shortcutPickProblem`), with no limit, category or name matching of
its own; every other refusal (a byte that is no such key, an old single-key
message) is the codec's words too (`shortcutStoreRefusal`,
`SHORTCUT_KEY_REFUSALS`).

### Decoding once

A snapshot's `decoded` form is taken with `decodedOf`
(`core/model/portable-profile.js`), which decodes afresh only when the
document changed; draft history entries are frozen and decoded once each.

### Layer answers

Which stack slots answer each position under which active layers is
compiled once by core and published. Whether a compiled answer answers under
the layers that are on is one shared rule, which core's layer walk and the
interface's board both run (D-L73); the interface never resolves
transparency again.

### What the page offers

What the page offers is `model.shell` (D-L71): its words, Choose keyboard
unless the tab is blocked, a light or dark theme, the Backups list, its build
and progress. Without a shell (the preview, tests) it offers the page's
defaults.

### An Apply or Save cut short

An Apply or Save cut short has the Apply verdicts (sent as
`apply.failure.verdict`, which the bar draws), the sentence every such notice
starts with, plain reasons for a lost connection, and the result a read shows
after a Save cut short. No device path, code or developer word reaches a
person.

The same holds for every failure's notice (D-L75), which starts with "Failed:"
unless it starts with a verdict. It says the failure's own sentence only when
Ark wrote one for a person: a plain `Error`, or one with Ark's code
(`failureSentence`, `core/model/vocabulary.js`). A fault in Ark, such as a
`TypeError` or the browser's own error, says `FAILURE_WORDS.unexpected`, and
its text goes to the device service's diagnostics. An answer from the keyboard
that does not read is marked `fault: "answer"`, by its protocol or, for the
profile's bytes, where Ark reads them (`answerFault`, `core/schema/bytes.js`),
and says `FAILURE_WORDS.unreadable`, or `FAILURE_WORDS.incompatible` when its
firmware answers in a form this Ark does not read; its text goes to the
diagnostics too. A byte format's own refusal, whose text names bytes or how
a record lays them out, is marked `fault: "ark"` and says
`FAILURE_WORDS.unexpected` unless Ark read those bytes from the keyboard; one
that answers a person's choice, such as a name too long or two pointing modes
started by one layer, says itself. One that says an edit would not fit
(`CAPACITY_EXCEEDED`) is the person's edit, refused in `PROFILE_FULL_WORDS`
before the keyboard sees it (`core/session/profile-draft-session.js`
`propose`): by the count it went past, as the usage table names it (LED
groups, LED overrides, behaviours, behaviour tap counts), or as the profile
being full. A sentence Ark wraps around a failure carries over only Ark's code
(`arkCode`), so a fault beneath it never silences it. A Save the upload
coordinator or the transport stopped says what its cause says (`failureReason`
in `core/session/apply-progress.js`): Ark's sentence, Ark's own problem, or
the keyboard's answer; only an answer the coordinator saw itself is the
keyboard's unexpected one. Where the keyboard rejected a profile is named by
its Review area (`PROFILE_AREAS`), and a reason Ark has no words for is said
as one, never by its name. A shell's own failures, and whatever its handling
of a message throws, become a notice through the loop's `fail`; a panel whose
file did not load leaves a plain message in the page, never a blank one.

### Pointing links

Firmware D-F62. Which layers may start a slot's mode or be turned on by its
key, and why not, are published as `pdModeEditing.linkTargets`.

The How it starts card (the mode's keys, then its layers, then what ends it;
the slot's light sits in its identity card) draws the layers with the shared
per-layer switches (`webview/ui/layer-switches.mjs`, whose grid Settings'
layer groups use), as a table: a row per layer, a "Starts this pointing mode"
and a "Turned on by this pointing mode's key" switch, each titled for the
layer in its row. A default layer or the pointer layer is a dimmed row saying
why in it, both switches disabled; a layer that starts another mode has its
"Starts" switch disabled and says "already starts" that mode in the row, its
key switch usable.

A changed link naming one is refused when staged, and so is a settings change
that makes a layer a link names the pointer layer or a default layer
(`settingsLinkRefusal`, staged by `core/model/settings-editor.js`); a layer
reorder renumbers a link as it renumbers layer keys (the base swap and Keys
follow their layers included) and refuses, in words, a move that would still
leave a link ignored, have one layer start two modes, or put two of a link's
layers on one (`reorderLinkRefusal`, `core/model/portable-profile.js`); a
stored layer the keyboard ignores (in an imported profile, say) stays
switchable off, said beside it and as a Review warning.

Review names each layer of a link, and of a behaviour's or combo's allowed
layers, after its mark (a `layers` review mark). What ends the mode is a
segmented radio group shown only beside starting layers; the posted record
resets it to Never with the last of them. A copied mode keeps the layers its
key turns on, not those that start it.

Whether the pointer layer covers a layer the mode's key turns on is core's,
published per slot as `pdModes[].pointerCovers`. So are the layers that start
a mode as the keyboard runs the link, each with the layers that end a start
from it (`linkStarts`, which layer reach walks too), published as
`pdModes[].linkStarts`, and the layers each keycode turns on as the key
pressed (`keycodeLayersOn` in `core/model/layer-effects.js`: a layer key's, a
mode key's link, a custom key's shortcut layers; never DF or PDF), published
as `qmkKeyTurnsOn`.

The Keys workbench's Pointing modes tab reads only these: a starting layer
reaches its mode by itself, and a key, behaviour cell or combo reaches it by
turning such a layer on with no layer ending that start on, the layer it is
pressed on included (`webview/view/pointing-reach.mjs` `pointingReach`, read
through `tabReach`). Its
columns say the link (the layers that start it, an ignored one marked with the
card's reason, what ends it, the layers its key turns on), a route that starts
it says what it sends, and the slot is tagged started beside hold or lock.

### Shortcut layers

Firmware D-F26. Which layers a custom key's shortcut may turn on, and why not
(the base layer and the default layers are always on), are published as
`customKeyShortcutLayers`. Staging a shortcut, a settings change and a layer
reorder are each refused in words where the keyboard would refuse the
profile, and a reorder that would merge two of a shortcut's layers is refused
too (`reorderShortcutRefusal`). A refused reorder in Rename & reorder is not
kept: the panel stays as it was (`core/session/panel-session.js`,
`applyLayerEdit`).

### The rail's keyboard menu

The rail's keyboard button shows the name, the edit mode under it and the
dot's tone and hover words (what the keyboard is doing, its halves and a
restart it needs, which the bar also offers; and a save it is finishing, a key
adjustment pending, Live edit's saved by the keyboard and the slave half
catching up, which the bar and notices do not say). Its menu offers the modes
in the keyboard's order with the vocabulary's `hint` and `detail`, Settle and
the not-stored mark, the keyboards when there are several, Choose keyboard
and Disconnect when the page offers them, and nothing while the keyboard is
busy. Choosing a mode runs the same switch and questions as before
(`webview/ui/edit-mode.mjs`); the menu is a menu button by keyboard (arrows,
Home, End, Enter, Esc and Tab back to the button).

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
  `PD_MODE_0` pointing mode), unnamed `QK_KB` slots, features the build lacks,
  or the `QK_MACRO_n` duplicates of `MACRO_n`. A key that holds one still
  reads back by name (`tests/view/picker-sections.test.mjs`,
  `browser-tests/retired-user-keys.spec.js`).
- A macro key reads as its name or `MACRO_n`, never the `VIA_MACRO_n` it was
  called before firmware D-F31; typed, that former name still stages its slot
  (`tests/view/keycode-expression.test.mjs`).
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

Straight directions and diagonals share one tap vocabulary, owned by
`core/schema/pd-mode-domain-v1.js`: keys, mouse buttons 1–8 (firmware D-F22)
and macros (firmware D-F23), which take inherit policy and mask zero. Mouse
movement, wheel, acceleration and modifier-wrapped mouse codes are refused,
and backups keep click and macro records exactly
(`tests/schema/pd-mode-domain-v1.test.js`).

- `core/model/pointing-taps.js` supplies the picker's names and aliases and
  which keys may carry modifiers; the interface gets them through
  `pdModeEditing` and keeps no allowlist of its own
  (`tests/model/pointing-taps.test.js`). Typed outputs are checked before
  staging, with a reason (`browser-tests/pointing-clicks.spec.js`).
- The picker offers all 128 macros by profile name, and `tapRecord` resets
  a newly chosen macro to inherit and mask zero. A macro row says it inherits
  and why, and that a busy trigger is dropped
  (`tests/view/keyvalues.test.mjs`, `browser-tests/pointing-macros.spec.js`).

## Custom key shortcuts

A custom key's optional shortcut (firmware D-F26) is its own action (D-L63):
a modifier mask, its `keys` in press order (up to six keyboard, media,
system and mouse keys, each once, at most one media key and one system key;
`SHORTCUT_KEYS`, `shortcutKeysRefusal`), a mask of the layers it turns on and
how it turns them on, all alike, as one layer key does (`layerKind`: hold,
lock, move to, tap-toggle or one-shot; `SHORTCUT_LAYER_KINDS`); no modifiers,
no keys and no layers is no shortcut, any part alone is one, and a kind other
than hold needs layers. Ark reads and writes settings version 11 only (D-L64;
`tests/schema/settings-domain-v1.test.js`).

- The Custom keys screen edits it through `updateCustomKeyShortcut`, with keys
  and modifiers in the keycode picker's `shortcut` mode, where modifiers may
  mix sides and each click adds a key in press order or takes it out; a symbol
  is its key with its modifiers, held for the whole shortcut, and taking it
  out leaves a modifier another symbol still needs or the person turned on
  (`shortcutPickKey`, `shortcutPickDrop`); the caps are published as
  `customKeyShortcutKeyLimits` and the first one broken is said in its words
  (`shortcutPickProblem`), with Use off, before anything posts, and its layers
  in that mode's **Layers** section: the shared per-layer switches
  (`webview/ui/layer-switches.mjs`) as a table, a row per layer, any number
  on, under a **Turns them on as** choice of kind by its layer key's verb (the
  vocabulary's `customKeys.layerKinds`), nothing to choose until a layer is
  on; Clear goes back to Hold (`tests/model/custom-key-editor.test.js`,
  `tests/view/custom-key.test.mjs`,
  `browser-tests/custom-key-shortcut.spec.js`).
- The base layer and the default layers are always on, so a shortcut cannot
  name them. Core publishes the rule as `customKeyShortcutLayers`
  (`core/model/shortcut-layers.js`): such a layer is a dimmed row saying why
  in it, its switch disabled. Staging a shortcut that
  names one is refused in words; so is a settings change that makes a layer a
  shortcut names a default layer, and a layer reorder that would (the reorder
  renumbers a shortcut's layers as it does layer keys;
  `tests/model/shortcut-layers.test.js`).
- Wherever a shortcut is named (the Custom keys list, key legends and tips,
  hover, Review, the behaviour grid) its layers follow its modifiers and keys
  by name, lowest first, led by their kind's verb unless held: "Left Cmd +
  Navigation + Extra", "Left Cmd + Lock Navigation + Extra" (`shortcutLabel`,
  `core/model/key-names.js`). The hover card's Shortcut section tags each
  layer with its kind and says what that does; the words that describe the
  shortcut say what it does with its layers ("locks Navigation + Extra";
  `webview/view/custom-key.mjs`, `tests/view/custom-key.test.mjs`).
- A tap-toggle or one-shot shortcut makes its key dual-role, as `TT()` and
  `OSL()` are: its tap / hold threshold follows the dual-role term
  (`holdTermSetting`, `core/model/gesture-timing.js`;
  `tests/model/gesture-timing.test.js`).
- A field that needs a mixed-side set offers a custom key (`shortcutOffer`).
  One with exactly that shortcut and no behaviour is used. A layout key or
  combo output also runs the key's behaviour, so a match with one is offered
  beside a new key; a behaviour step sends only the shortcut, so any match is
  used. Otherwise the first unused custom key gets the shortcut in the same
  draft step as the edit that uses it; a combo output's key is made only when
  the combo is kept (`tests/view/custom-key.test.mjs`,
  `tests/view/edits.test.mjs`, `browser-tests/custom-key-shortcut.spec.js`).
- Review shows it as the key's Shortcut field, its layers included,
  discarded with the name, and names it in the host OS's words
  (`tests/model/custom-key-editor.test.js`, `tests/view/edits.test.mjs`).
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
  `editGate(model, area)` (`webview/view/edit-gate.mjs`) reads the published
  `draft.editable`, and each area's own capability with it
  (`tests/view/edit-gate.test.mjs`).
- Panel controls are registered once in `CONTROLS`
  (`core/session/panel-control-registry.js`): route, draft identity, binding
  rule, demo policy, phase and action. History and local macro inspection run
  before the busy guard, which refuses with a notice rather than dropping work
  (`tests/session/panel-control-registry.test.js`). A control of phase
  `within` (Cancel edit, `abortLiveEdit`) is the one the guard takes: it ends
  the operation that is running. While the keyboard holds Ark's live edit for
  released keys the refusal is that wait's words, not a failure
  ([D-L69](../adr/0069-a-held-edit-waits-for-the-release.md)).
- Device operation phases have stable IDs (`PHASE`) with their words and write
  fact beside them; progress compares IDs, so words never change routing
  (`tests/model/vocabulary.test.js`).
- Closing the web page asks first only when it would lose edits (an unsaved
  draft in Review and save, unsaved edits in Live preview + save, an edit on
  its way in Live edit, the demo's unexported edits) or while an Apply, a Save
  or a restore writes the profile (`leaving` in `web/web-shell.mjs`;
  `tests/web-shell.test.mjs`, live cases: no test).

## Snapshot model and device model

The editable model is built from one complete snapshot and its decoded form
(`buildSnapshotModel` in `core/session/device-model.js`; D-L61); the draft
binding supplies editability, never a simulated read
(`tests/session/device-model.test.js`). Its profile part, from a snapshot or
from independent readback alike, is the stateless profile model
(`profileModel` in `core/model/profile-model.js`;
`tests/model/profile-model.test.js`); the session adds the keyboard's header
and diagnostics. Building it is a projection that never opens, closes,
observes or marks a draft stale, and a partial read keeps its read-only view
even while a dirty draft is kept (`tests/session/panel-session.test.js`). A
standalone export reads its own snapshot and leaves the editor's alone
(`tests/session/profile-device-service.test.js`).

- What every model of a build starts from is built once and frozen
  (`panelCatalog` in `core/model/profile-model.js`): the keycode catalogue as
  the picker reads it, `offered` included, its labels, aliases and short
  labels, what each key the interface treats apart is (`qmkKeyKinds`) by the
  names a profile on current firmware gives its macros and custom keys, the
  vocabulary as a host with no OS of its own reads it, the LED map and QMK's
  other spellings. A model shares its objects wherever the
  profile lays nothing over them. The panel loop posts it once, as
  `{type: "catalog"}`, before its first model and again after each `ready`,
  since a panel that loads again, or only after it was posted, has lost it;
  a shell that answers `ready` itself calls the loop's `ready()`. Each model
  then leaves those fields out and carries what its profile lays over them,
  `catalogOverlay`: an array's entries that differ, by index, and a record's
  keys whose value differs. A field that does not start from the catalog's is
  posted whole (`postedModel` in `core/session/panel-loop.js`). The store
  lays the catalog back under each model (`webview/catalog.mjs`), so every
  reader sees the whole model; a model that comes before its catalog waits
  for it, and a whole model, as the preview posts it, is taken as it is
  (`tests/session/panel-loop.test.js`, `tests/view/store-catalog.test.mjs`,
  `tests/web-shell.test.mjs`).
- The Keyboard screen's Diagnostics list, `model.diagnostics`, is what was
  read, then the device service's log, newest last and bounded by the service
  (`addDiagnostic`): the code and own text of a failure no notice says, with
  what lay under it (`causeText`), connections and the keyboard's odd answers.
  A draft open changes none of it (`tests/session/device-model.test.js`,
  `tests/session/failure-words.test.js`).

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
- In Review and save the bar offers **Review and save** (**Review changes** in
  the demo) beside **Discard all**, and adds added, changed and removed counts
  only when they say more than the total (`statusBesideCount`;
  `tests/view/review.test.mjs`). In the live modes it counts unsaved changes
  and offers Revert, and in Live preview + save **Review and save**
  (`browser-tests/live-edits.spec.js`). The review's button is **Save to
  keyboard** in both.
- In every edit mode a keyboard that stopped saving, or that needs a restart
  (`health.restartNeeded`), takes the bar with **Restart**, one bar when it
  says both (`restartOffer`; `tests/view/edit-mode.test.mjs`,
  `browser-tests/live-edits.spec.js`).

## Review changes and Discard

The review lists one change per thing that differs from the keyboard (D-L29):
a key on a layer, a layer's name, a behaviour, a combo, a macro, a settings
section, a pointing slot, or one lighting record (LED groups and the rows that
paint them are one record; no test).

- A change says added, changed or removed and lists only the fields that
  differ, in the editors' words. Fields compare what is stored, not what is
  shown, so a changed default or renamed layer is one change
  (`tests/model/profile-review.test.js`,
  `tests/model/profile-review-completeness.test.js`). **Show** opens it where
  it is edited, a settings section on the screen that draws it; one with no
  editor (Default layers, key options Ark has no switch for) has no Show
  (`tests/view/review.test.mjs`).
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
  draft keeps which keyboard layer each slot holds, set by Rename & reorder
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
  (`compareFindings`; `tests/model/layer-reach.test.js`,
  `tests/model/compare-findings.test.js`).
- Every warning or trap the draft keeps, made by it or not, asks for
  confirmation: **Save anyway** / **Go back**; notices and fixed checks do not
  (`checksToConfirm`; `tests/view/checks.test.mjs`). Core refuses an Apply, a
  Save in Live preview + save or sending live without it, and it holds only
  for the reviewed revision (`tests/session/panel-controls.test.js`,
  `tests/session/live-edits.test.js`,
  `tests/session/profile-draft-session.test.js`).
- A new check names a draft edit group only when its source is unambiguous
  (`checkSourceGroup`), and the group says how many new traps and warnings
  it is the source of, counted as the confirmation counts them: one standing
  for the traps past those named counts as that many (`checkSources`,
  `levelCountWords`; `tests/view/checks.test.mjs`).

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

**Import profile…** and dropping one file on the Import profile card open the
same validated review with a keyboard and in the demo (D-L15). A drop works only
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
  offered only with no keyboard connected and no unsaved keyboard draft
  (`tests/session/demo-session.test.js`).

## Lighting preview

The board is a selected-layer preview, not LED telemetry (D-L12): base
lighting plus the selected layer (with layer preview, every layer on, lowest
first; never the other default layers, which the keyboard's lighting does
not read), then their LED groups, a layer's own by the layer core publishes
it for (`ownerLayer`), following the firmware's membership, pass-through and
inheritance rules. The order the stages paint in, and the
two "no colour" rules, are the shared compositor (`rules/led-light.mjs`,
D-L73); `webview/view/lighting.mjs` gathers what each stage paints from the
model (`tests/rules/led-light.test.mjs`, `tests/view/lighting.test.mjs`).

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
  unfinished holds without repairing them
  (`tests/view/macro-sequence.test.mjs`).
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

## Uninterruptible playback

Each macro offers Uninterruptible playback as Automatic, On or Off (firmware
D-F17; D-L57), in the vocabulary's words (`macroUninterruptible`).
Automatic turns on for text the layout must enter as Unicode
(`tests/model/macro-editor.test.js`). An explicit choice is a three-byte
canonical prefix in the macro's bytes that edits keep and the bank counts;
Automatic stores none (`tests/schema/macro-payload.test.js`). Review groups
Automatic's effect with Host and an explicit choice with its macro (no test).

## Participation controls

Ark exposes the firmware's participation contract at every scope (D-L55),
whose rules are in the firmware's [participation
policy](../../upstream/firmware/docs/spec/participation-policy.md): switches
on Behaviour settings and Combo settings, enabled and allowed layers on
shared behaviours and combos, and **Use behaviour** / **Join combos** on
placements (`browser-tests/participation.spec.js`).

The Key tab explains each blocked scope, and a transparent key leads to the
placement that supplies it (`tests/view/participation.test.mjs`). The board,
the hover card and the Key tab judge a key at the placement that supplies it,
with every scope: the board draws a key's behaviour dots only where its
behaviour runs, and a combo's badge only where the key joins it and the keys
that may cover every input (`tests/view/combo-reach.test.mjs`); the hover card
and **What this key reaches** show a behaviour or combo that does not run as
not used, with its reasons and no branches or timing
(`browser-tests/participation.spec.js`). Words about one placement say *this
key on this layer (<layer>)*, never only the layer, so they cannot read as the
layer's switches. Controls are ordinary draft edits; switching off keeps
definitions and timing, and a reorder moves masks and placement bits with
their layers (`tests/view/edits.test.mjs`).

Core decides participation in `core/model/participation.js`, which layer
reach walks, and publishes it as `model.participation`: for each layer, why
no behaviour or no combo runs on it at all (the master switch, the layer's),
and the keys whose Use behaviour or Join combos is off there, by layout
index. A definition's own switches are the shared rule in
`rules/definition-switches.mjs`, which core and the interface both run
(`tests/rules/definition-switches.test.mjs`); the interface words each reason
code from `vocabulary.participationReasons`. Its reading of what core
publishes is checked against core's answer from the settings, and its layer
answers against a scan of the stored keymap, on seeded profiles, every layer,
key and definition (`tests/view/participation-oracle.test.mjs`).

## Combo output behaviour permissions

Combo settings has **Combo outputs use behaviours** and each combo builder
**Use output behaviour**. Both default on and veto behaviour use by a combo's
output, independently of chord participation
(`browser-tests/combo-output-behaviors.spec.js`). Core decides on which layers
each combo's output runs its behaviour, judged from its last input's layer,
with those switches, the behaviours switch and the behaviour's own
(`comboOutputBehaviorLayers` in `core/model/participation.js`, which layer
reach walks too), and publishes it per combo as `outputBehaviorLayers`; the
board, hover card and reach lists read it, finding which layer supplies that
input's key under the layers in view (`tests/model/participation.test.js`,
`tests/view/combo-reach.test.mjs`, `tests/view/reach.test.mjs`).

- The global value is a flag in the Settings header, not a scalar
  (`tests/schema/settings-domain-v1.test.js`). Review, Discard, Undo/Redo,
  backups and layer reorder keep both; a backup without the field reads it as
  on (`tests/view/edits.test.mjs`).
- Native readback compares the permission
  (`tests/protocol/combo-readback-v1.test.js`), and reach lists honour both
  (`tests/view/combo-reach.test.mjs`).
- The combo builder names a custom key output's shortcut, or says it sends
  nothing (no test).

## Flash pauses

The Keyboard screen's Diagnostics shows each half's flash pauses, GET `0x0D`
(firmware D-F29; `upstream/firmware/docs/spec/profile-wire-v1/hid-channel.md`,
"Flash pauses"), decoded by `core/protocol/flash-pauses-v1.js`
(`tests/protocol/flash-pauses-v1.test.js`).

- Page 0 is the master half's figures, page 1 the slave half's; each page is
  checked as the spec's table says, and a page without figures, or page 1
  answering status 3 before the master half has pulled the slave half's, is
  null ("not measured yet"), never zeros. Figures are published verbatim, in
  µs, as `model.device.flashPauses`; the view words them
  (`webview/view/flash-pauses.mjs`, `tests/view/flash-pauses.test.mjs`).
- They are read only when the fold opens (`readFlashPauses`), once for each
  connection while it stays open and nothing holds the keyboard
  (`state.flashPausesAsked` against `load.connectionToken`), and by its Read
  keyboard (`refresh` with `flashPauses`, after the keyboard is read). Each
  reads both pages, waits longer than the master half's one-second pull
  interval and reads both again, as the firmware's spec says to get fresh
  figures (`core/session/flash-pauses.js`;
  `browser-tests/settings-screens.spec.js`).
- Each read is a background read of the device service: skipped while an
  operation, the panel or the live watch's look holds the keyboard; the watch
  skips its look while one is out, and an operation that starts meanwhile
  waits for it to end. The watch never reads them. A failed read is the
  figures' own `unavailable`, never the keyboard's error, and keeps the
  connection (`tests/session/flash-pauses.test.js`).
- The demo reads nothing and shows sample figures.

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
  `editGate(model, "settings")`, with the built-in name as placeholder
  (`browser-tests/settings-screens.spec.js`). It posts trimmed; core refuses
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
- A read that is not ready after the keyboard is back is said as a failure,
  never as "back". When a live keyboard moved under that read (in Live edit,
  its own save after the rename), the live watch takes over: the keyboard whose
  status names the draft's edit session is followed and read again, within
  the watch's bound of three failed reads per draft
  (`tests/session/live-edits.test.js`).

### Following a lost keyboard back

A keyboard lost unexpectedly (a request Ark waits on goes unanswered, or it
drops off USB where the adapter shows serial numbers, as node-hid does) is
followed back the same way, with `lost: true`, at most once in 30 s; a web
page follows Chrome's connect events instead
(`tests/session/lost-keyboard.test.js`). The diagnostics name the first bytes
of the unanswered request (no test).

A keyboard a follow-back found is the one it waited for, though node-hid lists
it under a new device id at every enumeration: before the read, the draft, a
Restart's kept edits, a Save cut short and the copy from before an Apply move
to that id (`followKeyboard`), so the read is the draft's and Save, Apply and
Restart's put-back reach the keyboard
(`tests/session/keyboard-restart.test.js`,
`tests/session/keyboard-starting.test.js`). Restart's put-back sends only to
the session the read found, and says the edits are back only once the draft
confirms them unsaved.

### Reading a keyboard that has just come back

A keyboard answers over USB before it has decided which profile runs (firmware
D-F61). Before the editor's read, on every read Ark follows back (a restart, a
rename, a lost keyboard) and on Read keyboard, Ark polls profile status until
the keyboard has started (D-L70; `core/session/keyboard-starting.js`,
`tests/session/keyboard-starting.test.js`,
`tests/session/keyboard-restart.test.js`):

- Started: active kind not 3 (pending) and flag 7 (digests unavailable)
  clear, and the halves agree as the health's `agree` does
  (`halvesConverged`): the slave half known (flag 4) and holding the same saved
  profile (flag 5), the active, saved and slave half's generations equal, and
  conflict count 0.
- Meanwhile the service runs in phase `starting`, whose words, "Waiting for
  the keyboard to finish starting…", the loading screen and the bar show.
- The wait is at most 15 s on the service's clock, polling every 200 ms.
  Within it, a read refused `KEYBOARD_NOT_READY`, `ACTIVE_PROFILE_UNAVAILABLE`,
  `PROFILE_CHANGED` or `GENERATION_UNSTABLE` waits again and reads again.
- Past it, a keyboard still pending (kind 3 or flag 7) with its slave half
  known fails `KEYBOARD_STARTING`: the notice says it has not finished
  starting and names the recovery copy of a Restart or a Save cut short. Any
  other keyboard is read as it is, so a missing slave half gets the read's
  own words; a keyboard whose halves never agree waits the whole bound
  before each such read.
- After Restart, the put-back of the kept edits runs once that read is ready,
  whether the follow-back's read or a later Read keyboard.
