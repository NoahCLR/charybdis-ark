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
layout index, matrix position, LED index and stored keycode belong in the key
details, folded under **Where it is stored**. Reach rows and tables name keys
as the board does, never by layout index. Every Keys tab is at least as tall as
the Behaviours tab; a taller editor carries its height across tab changes, so
changing tabs does not move the page's scroll position.
The Behaviours, Combos, Macros and Trackball modes reach lists lead with **On
this view**, calculated for the selected layer plus exactly the lower layers
currently previewed on. **On this layer** means a key stored on the selected
layer, and the other route groups describe ways it can reach an item under
different activations. The view can therefore overlap those groups; it is the
current activation, not another storage location. A combo in the view requires
all inputs in that activation and uses the configured Combo layer matching
reference when one is set. Tab counts still count the selected layer's stored
routes. On the board, a key the selected layer stores keeps its own marks; a
transparent key answered from below wears that key's behaviour dots and the
badges of the combos On this view lists it in (`combosInPreview` in
webview/view/combo-reach.mjs). Under Combo layer matching the reference layer's keys
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
- A key or action that acts on a layer is named with that layer's mark before
  the layer's name, "Hold ■ Numbers", wherever markup names it: a branch, a
  combo's output or inputs, a behaviour's title, a reach, a review value.
  Name it through `actionMarked` or `keyNameMarked` in `webview/ui/marks.mjs`,
  never `esc(actionLabel(…))`. Only attributes and plain-text messages carry
  the words alone. Which layer a keycode acts on is the host's answer, never
  the interface's: `keyLayer` in `core/model/key-names.js` decides it, the
  model publishes it beside each label as `qmkKeyLayers`, and the review's
  marks use the same function. A device-model test holds every published
  name to carrying its layer's name, and `tests/view/key-names-marked.test.mjs`
  refuses a screen that escapes a key's name.

## Shared controls

The same kind of control looks and sits the same on every screen.

- A number field's unit (`ms`) rides inside the input at its right edge, the
  `.affix.unit` wrapper in `webview/styles.css`, so its label names only the
  value. A label stored with its unit, such as "Timeout (ms)" for the review's
  words, drops it where the field shows it (`fieldRow` in `ui/settings.mjs`,
  `scrollLabel` in `ui/pointing/common.mjs`).
- Whatever folds is a `<details>` whose summary starts with `DISCLOSURE`
  (`webview/lib/dom.mjs`): one chevron, turned down while open. A closed card
  summary drops its bottom rule. A card that does not fold has no chevron. The
  Keys tabs' groups keep their open state in the panel state, so each is a
  button (`groupHeader` in `ui/groups.mjs`) that starts with the same
  `DISCLOSURE`, turned down while `aria-expanded`.
- A sheet (Review, the keycode picker, Draft history) closes with one ghost
  **Close** at the right of its header, and by Escape; its footer holds only
  actions that change something and never repeats the dismissal.
- An editor's own actions sit at the right of its title bar as small text
  buttons (`btn tiny ghost`), a destructive one last: a behaviour, a pointing
  mode, a macro (Place on a key…, Discard local edits, Clear macro), a custom
  key. A button that takes you to another screen (Place on a layer…, Edit in
  Lighting, Show on the Keys screen, Edit groups) is the same small text button.
- A macro and a custom key are named by their editor's title, the shared
  `titleName` in `ui/title-name.mjs`: the title is the only name field, Enter
  commits, Escape restores the stored name, and the byte counter shows on focus
  or when over the limit.
- A tap-count badge (`branchBadge` in `ui/marks.mjs`) takes its branch colour as
  border and fill; the count stays in the text colour, so a dark colour reads.
- A table's number column (`th.num`, `td.num`) is right-aligned with tabular
  digits.
- A status card names its state in a chip with a dot at the right of its title,
  as Keyboard and Saves in progress do.
- The keycode picker draws a key's single legend smaller only when it does not
  fit the key (`legendFits` in `view/picker-board.mjs`).
- Card and section names are sentence case, as the rail and the review name
  them. A settings card shows its setting count, including a card of one.
- A slot bank (Macros, Custom keys) heads its card with its name and count,
  then its search across the column. Its tiles sit three across in a 340 px
  column and scroll inside the card, which stays in view beside the editor;
  `lib/scroll.mjs` keeps the bank's position across same-screen renders. A
  narrower window shows two across, and below 720 px the bank stacks above
  the editor.
- A list beside its editor (Lighting's layers and trackball modes) scrolls on
  its own past eight rows, `.rowlist.many`, with its heading kept in view. Its
  `data-scroll-list` key lets `lib/scroll.mjs` keep each list's position across
  same-screen renders without carrying it into another list, and bring the
  picked row into view.
- A heading inside a workbench column uses the column's `sect-h` style.
- Pages of cards (Trackball, Settings, Backups, Keyboard) share one width,
  `--page`. Side-by-side tables start at the top rather than stretching to
  each other's height.
- Keys and Lighting draw the same layer strip, Rename & Reorder included
  (`layerBar` and `attachLayersControl`).

## Design tokens

`webview/styles.css` is one design system, and its sizes are tokens declared
once in its `:root` block (light values follow it). A rule names a token,
never a literal; `tests/view/design-tokens.test.mjs` fails on a literal font
size, weight, radius or control height, on opacity used to dim text, on more
than 24 distinct padding literals, and on a token used but not declared. The
board's SVG units, the phone page and glyph marks sized to their box are the
listed exceptions.

| Family | Tokens |
| --- | --- |
| Type (size / line) | `--fs-title` 20/26, `--fs-heading` 15/20, `--fs-subhead` 13/18, `--fs-body` 13/19, `--fs-small` 12/17 (hints), `--fs-eyebrow` 11/14 caps `.08em`, `--fs-micro` 10.5/14 (tabular tags) |
| Weight | `--fw-regular` 400, `--fw-medium` 500, `--fw-strong` 600 |
| Text tiers | `--text`, `--text-2`, `--text-3` (at least 4.5:1 on every surface, both themes), `--text-disabled` (disabled controls and decorative glyphs only) |
| Status | `--draft` amber, for unsaved draft work and nothing else; `--warning`, `--danger`, `--ok` |
| Space | `--s-1`…`--s-7`: 4, 8, 12, 16, 24, 32, 48 |
| Radius | `--r-chip` 4, `--r-control` 6, `--r-card` 10, `--r-sheet` 14 |
| Control height | `--h-chip` 24, `--h-compact` 28 (compact buttons, inline selects), `--h-control` 32 (buttons, fields), `--h-tab` 36 (tabs, navigation) |
| Elevation | `--shadow-1` popovers and the draft bar, `--shadow-2` sheets |
| Frame | `--rail` 232, `--topbar` 64, `--bar` 48, `--board-h` `clamp(380px, 52vh, 560px)` (`max(300px, 45vh)` under 800 px tall), `--key-max` 64, `--page`, `--measure` |

- Every uppercase group label (rail groups, section and list heads, table
  column heads, the hover card's sections) is one `.eyebrow` style.
- Text is never dimmed with `opacity`. Quiet, read-only and idle things use a
  text tier, a dashed edge or a word; disabled controls use `--text-disabled`.
- One focus ring: `outline: 2px solid var(--focus)`, offset 2 px, on every
  `:focus-visible`, a switch's on its track and a board key's inset inside
  the key so neighbours do not cover it.
- Layout switches are container queries on the content box (`.content`,
  named `content`) or the sheet, never window media queries: the content is
  the window less the rail.
- The board card on Keys and Lighting is `position: sticky` at the top of
  `.content`, `--board-h` tall, its SVG fitted by width and height with keys
  at most `--key-max`; the workbench's tab strip sticks under it. Hide board
  (`state.hideBoard`) folds the card to its layer tabs. Legends are sized in
  `view/geometry.mjs` (`legendFit`) from the key's drawn width `k`, which
  `ui/board.mjs` measures and redraws for: main `clamp(9, .22k, 14)` px,
  second line `clamp(8.5, .16k, 10.5)` px; a long legend shrinks to that
  floor, then wraps, then squeezes no further than 0.85.
- Remembered view preferences (`showKeycodes`, `hideBoard`) are read and
  written by `view/preferences.mjs` through the host's panel state
  (`getState` / `setState`); the web page keeps that state in its storage
  (`web/panel-channel.mjs`). They are never posted.

## Action grammar

Every button is one of these, so what a button does can be read from how it
looks. `browser-tests/design-tokens.spec.js` fails when a surface (the
content, the draft bar, the rail, a sheet) shows more than one filled button
or an icon button has no `aria-label`.

| Kind | Class | Form |
| --- | --- | --- |
| Commit | `.btn.primary` | filled; one per surface |
| Create or open | `.btn` | outlined, 32 px; "…" when more input follows |
| Object action | `.btn.text` (`.btn.ghost.tiny`) | text, 28 px, at the end of its row or title |
| Destructive | `.btn.text.destructive` | text, last in its row, `--danger` on hover |
| Go elsewhere | `.btn.text` | text naming the destination, ending "→" in its words |
| Dismiss | `.btn.ghost` | borderless |
| Icon | `.btn.icon` | 28 × 28, with an `aria-label` |
| View state | `.btn.toggle[aria-pressed]` | stays pressed while on |
| Stored on/off | `.sw` | a switch, its label part of a target at least 28 px tall |
| Shows its value | `.value-btn` | looks like its value (a keycap, a name), 32 px, opens a picker |

The draft bar is docked under the content across its width, at least
`--bar` tall; the hover card opens after `HOVER_DELAY_MS` (300 ms) on a cold
board, at once while warm, and for keyboard focus (`view/hover-timing.mjs`).

## Pointing tap outputs

Straight directions, diagonals and physical-button tap overrides use one tap
vocabulary, owned by `core/schema/pd-mode-domain-v1.js`. It includes plain
mouse buttons 1–8 (`0x00d1..0x00d8`, Profile Wire feature bit 28) and VIA
macro outputs (`0x7700..0x777f`, feature bit 29), which take inherit policy
and mask zero (firmware D-F23); Ark requires both features (D-L64). Mouse movement, wheel,
acceleration and modifier-wrapped mouse codes remain invalid. The firmware
owns the click runtime contract (D-F22); the [guide](../GUIDE.md#trackball-mode-clicks)
describes its effect for users.

`core/model/pointing-taps.js` supplies the allowed picker names and aliases,
separates keys that may carry modifier wrappers, and finds stored macro
outputs for the empty-macro check. The panel receives this through `pdModeEditing`; it does
not duplicate the schema's allowlist. All three tap field families use these
restrictions. Typed names, aliases and numeric codes are resolved and checked
before staging, with a reason for unsupported outputs.

The picker offers all 128 VIA macros by their current profile names, even though QMK's catalogue names only slots 0–31. The pure
`webview/view/keyvalues.mjs` helper resolves macro identities and presentation;
its numbers are checked against the schema. Every tap form uses
`tapRecord` to reset a newly chosen macro to inherit and zero mask. The host
refuses noncanonical policy bytes. Held-modifier rows show fixed Inherit with
the reason; Every step outputs show the drop-while-busy tip, and empty slots
show that they do nothing yet.

Backups retain click and macro records exactly. No field, history step or
import silently substitutes a keyboard shortcut.

## Words and keycodes

One thing has one name on every surface (decisions §3). The words for a value
the keyboard stores live in `core/model/vocabulary.js` and reach the webview
as `model.vocabulary`; a setting's label, hint, hover help and its section's
`search` words (the older and QMK names Settings search still matches: host,
startup, magic, auto-mouse, pointing) live in `core/model/settings-editor.js`;
a key's name is `core/model/key-names.js`'s. The rules:

- Layer verbs are one set: Hold (`MO`), Lock (`TG` and `LOCK_LAYER`, the same
  lock on this firmware), Tap-hold (`LT`), Tap-toggle (`TT`), One-shot (`OSL`)
  and Move to (`TO`). Key names, the cap's second line (`view/keyface.mjs`,
  which recognises a lock stored as a user keycode by its `semantic`), the
  picker and the review all use them. A trackball mode's two keys are its hold
  and its lock.
- `KC_NO` is Nothing (its cap a dash); `KC_TRANSPARENT` is Transparent.
- A behaviour's cells are actions; its rows are tap counts; a hold action has
  How it runs. Rows count actions (`actionsWords` in `view/keyface.mjs`).
- Slots are 0-based and tagged M5, K5 and P5 (`slotTag` in
  `core/model/vocabulary.js`); an unnamed one reads "Macro 5", "Custom key 5"
  or "Mode 5". A combo is named by its inputs and output
  (`comboIdentityMarked` in `ui/marks.mjs`, and the review's titles), its
  C-number a quiet mark, since a deletion renumbers the rest.
- On a non-layer lighting stage HSV(0, 0, 0) is Black, not off: the colour
  editor's `black` option labels the button and states what goes dark
  (`blackConsequence` in `view/lighting.mjs`).

**Show keycodes** (`state.showKeycodes`, off by default) is decided in one
place, `webview/view/show-keycodes.mjs`. `ALWAYS` lists where a keycode is
always shown because you act on it there: the Key tab's Keycode field, the
picker footer, Where it is stored, a macro's raw payload and a review value's
tooltip. `OPTIONAL` lists every other place a screen may print one (hover card,
behaviour rows, titles and cells, combo Sends, stack rows, picker buttons,
reach rows, the placing bar); there `keycodeAside` returns the keycode only
with the preference on, and never when it repeats the words. Screens draw it
with `keycodeMark` (`ui/marks.mjs`) as a muted mono suffix; a new place is
added to `OPTIONAL` first, or `keycodeShown` throws. Search in the picker and
Settings always matches QMK names.

## Shared rule ownership

- Settings help: `core/model/settings-editor.js` owns the descriptions for its
  Trackball and Settings fields. `hint` remains visible; optional `tooltip` adds
  an explanation where the hint is a numeric range. The shared setting-row
  renderer combines them for `data-tip`, including read-only reasons. Keyboard
  name and combo timing rows use the same hover path. `ui/hover.mjs` displays
  all of them; screens do not maintain separate tooltip catalogues.
- Number entry: a text field for a stored whole number authors
  `inputmode="numeric"`, and a duration in seconds or minutes
  `inputmode="decimal"`. `webview/lib/number-entry.mjs`, mounted once on the
  root, keeps only their digits (and the duration's first point) as text is
  typed, pasted or dropped, with the caret where it was. A `type="number"`
  field cannot be read back while its text is not a number, so the same path
  refuses a non-digit before it is inserted. A field never shows text its
  edit would refuse as not a number; range limits are still checked by the
  edit.
- Screens: `webview/view/screens.mjs` owns their IDs, labels, icons, rail
  groups, availability, placeholder titles, renderer dispatch and redraw
  policy. The app supplies render functions to keep this registry pure.
  `PanelState.screen` takes its ID union from the registry's keys; a new
  screen cannot add a second ID list elsewhere. Unknown IDs show an
  unavailable surface with a menu recovery path rather than another screen.
- Words: `core/model/vocabulary.js`, sent as `model.vocabulary`; stages are
  found by id, never by label.
- Lighting: `webview/ui/lighting.mjs` owns the board, stage tabs and switches.
  Its `ui/lighting/` modules each own one stage's surface and listeners: base,
  layers, auto-mouse fade, pointing overlays, combo feedback, key feedback and
  LED groups. Shared colour controls retain the stored owner's focus identity;
  LED override tables share their owner presentation. Stage modules read the
  published model and post the same pure edit builders as other screens.
  Zero brightness never replaces the stored hue or saturation with zeros or
  hides those channels. `view/lighting.mjs` owns layer pass-through (zero
  saturation and brightness) and LED-row inheritance (all three channels
  zero); an explicit black row remains distinct from an inherited colour.
- Pointing: `webview/ui/pointing.mjs` owns slot selection; `ui/pointing/`
  composes the slot editor from movement, reach and Advanced surfaces, with an
  empty-slot surface for creation and copying. Its form controls register one
  reader per rendered field, sharing the editor's complete-record staging
  callback. Switching movement rebuilds the readers for the new kind; pending
  button and modifier choices stay with the editor until a valid record posts.
- App surfaces: `webview/ui/device.mjs` owns device facts;
  `ui/review-overlay.mjs` owns the review sheet, check confirmation, Show and
  Discard listeners; `ui/leave-demo.mjs` owns the unsaved-demo dialog. The app
  composes these surfaces and keeps message routing, screen rendering, shared
  focus/scroll restoration and window keyboard handlers.
- Key names: `core/model/key-names.js`. The catalogue names what QMK ships;
  the profile names its macros, pointing-mode keys and bare user slots. The
  effective Host OS also names Alt/Option and GUI/Command/Windows/Super,
  including modifier wrappers, mod-taps, layer-mod keys, Magic actions and Space Cadet keys,
  without changing stored keycodes. Macro command previews and held-key
  warnings resolve those same labels; raw payload editors keep stored codes.
  Basic-key compact labels are also derived there, from host-resolved full names,
  and published as `qmkKeyShortLabels`: modifiers retain L/R and the effective
  host's Cmd/Opt, Win/Alt, Super/Alt or neutral GUI/Alt wording. Layout legends
  and stored keycodes do not change. The sequence renderer reads that map on
  every render and keeps full names in hover and accessibility labels; unknown
  compact names fall back to the full published name or stored identity.
  Modifier-bearing catalogue labels are identified centrally by their words,
  independently of picker groups, so another key family inherits the rule. The
  screens' `qmkKeyLabels` and the review are both built from it, each from
  its own snapshot, so a key reads the same in the combo table, the picker and
  the review. The webview never names a keycode: a form such as the combo builder
  stores keycodes and looks up their current labels on each render. It never
  caches display words across model updates. `hostKeyVocabulary()` in the same
  module derives all eight modifier controls, their stable picker wrappers,
  grid headings, summaries and accessibility labels from the modifier
  vocabulary. Key options uses the same host naming rule. Auto with an unknown
  host uses neutral Alt/GUI wording. The webview has no modifier-name table;
  an unnamed value falls back to its stored code. Compact keycodes have one
  modifier-side flag. The picker folds modifiers alone, or with a modifier
  key, into the simplest keycode that holds them (`modifierPick` in
  `webview/view/keyvalues.mjs`); otherwise it checks its model-supplied
  modifier bits and the selected key's existing mask (`pickerModifierProblem`)
  and refuses mixed left/right selections, where a layout key, behaviour cell
  or combo output offers a custom key's shortcut instead (D-L63). Both native
  expression encoders refuse those combinations too; numeric
  stored values keep their exact interpretation. Host-switch browser checks
  exercise open behaviour pickers, combo builders, macro previews and pointing
  editors through the production model-message handler. The stored name
  (`KC_KP_1`) is added only when a review row's two sides would read alike.
  A layer is always named by its name, in the picker's verbs: `MO(3)` reads
  "Hold Navigation", `LT(3,KC_SLASH)` "/ / Navigation", and a layer key's cap
  shows the layer's name. Only a raw keycode, where one is shown, keeps the
  number.
- Picker selection: `webview/view/picker-sections.mjs` owns `pickable` for
  every catalogue section and search. Inert `QK_USER_0`–`QK_USER_31` entries
  stay in the catalogue for exact readback and backups, but are never offered.
  Current named `CUSTOM_KEY_n`, Nothing (`KC_NO`) and Transparent remain selectable where
  the field supports them. Selection policy never rewrites stored identities.
- Actions, native keycodes, decode limits, layer references:
  `core/schema/actions.js`; the pointing registry and key layout are data.
- Decoding: once per draft revision, carried as `decoded` and taken through
  `decodedOf`; history entries are frozen.
- Pure domain edits and presentation: `core/model/device-profile-edits.js`,
  `core/model/key-behavior-edits.js` and `core/model/device-profile-view.js`.
  The session passes the keyboard's capacities to the model as destination
  facts before staging; the model imports no session or protocol modules.
- Layer answers: `core/model/layer-resolution.js` compiles possible answers
  and their active-layer conditions from decoded layout values. Layer reach
  and the published panel model use the same compiler. Each panel layer's
  `answers[layoutIndex]` names source stack slots with required and blocked
  active-layer masks; disabled keys are answers that block lower keys.
  `webview/view/layer-resolution.mjs` selects those facts for the preview and
  lists possible answers without resolving transparency again. Absent facts
  provide no answer. `view/keyface.mjs` owns labels and tier presentation,
  `view/combo-reach.mjs` owns combo matching and badges, and `view/reach.mjs`
  composes behaviour, macro and pointing routes from those answers.
- Settings bits and base lighting: `fieldMask` and `baseLighting` in
  `core/model/settings-editor.js`.
  The idle lighting timeout is published and staged in milliseconds, with
  duration presentation metadata. `view/duration.mjs` converts the editor's
  seconds or minutes to the nearest millisecond; whole-minute values initially
  use minutes, other values use seconds. The unit preference survives renders
  and changing it stages nothing. Empty or invalid text cannot save a section;
  zero stays visible and means lighting stays on. Review compares stored
  milliseconds and names the time in human units.
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

The Macros screen composes `ui/macros/editor.mjs`, `steps.mjs`, `recorder.mjs`
and `validation.mjs`. Validation retains the payload, request and draft-context
checks before staging. `view/macro-cache.mjs` retains only the latest parsed
payload for each slot and reading purpose on one published model; a replacement
model uses fresh host parsing options. Labels are resolved while rendering.
Parsed host steps carry no local focus metadata: step identity is assigned to
copies by the existing focus path, and serialization excludes that identity.

The macro title itself is the sole name field (`titleName`, Shared controls),
with the same stable `data-f` identity and host-posted name edit.
An empty macro has zero editor steps. Direct Text, Key/chord, Delay, Press and
Release actions replace the step-type selector. Text and Delay focus their
fields; key actions open the existing basic-key picker before inserting a step,
so cancellation leaves no incomplete placeholder. `appendSequenceStep()` replaces
only a sole empty Text step; literal whitespace and later Text blocks are retained.
Removing the last step or clearing the macro returns to the empty canvas.

`view/macro-history.mjs` owns bounded immutable step-history transitions; the
`ui/macros/history.mjs` module integrates them with selection, the clipboard,
normal inspection/staging and focused shortcut routing. Each slot stores at most
100 undo entries in its MacroForm, including payload, incomplete steps and local
focus/selection IDs. Selection alone is not an edit. Continuous input for one
field coalesces until change/blur or a structural command. A new edit clears
redo; native field undo returning to the group origin drops that no-op group.
Add, remove, reorder, key/text/delay/raw edits, Clear, local discard and a finished
take use the same tracker. Undo/redo restores local editor snapshots and posts
valid payloads through inspection, never an undoProfileDraft/redoProfileDraft
command. Invalid intermediate snapshots remain editable locally. Rename and
protection are not step-history entries. Accepted model publishes preserve
history; resetDraftForms drops it with the existing macroForms reset policy.

Step Undo/Redo shortcuts take precedence over draft history only while focus
belongs to the macro editor, and never fall through when its tracker is empty
or read-only. Text inputs retain native undo/copy/paste, and open dialogs keep
their own keys: the global history router checks dialog ownership before draft
Undo/Redo, including button focus. Undo/redo/copy/paste are keyboard-only, with no dedicated
buttons; focusing the sequence accesses step history after typing. Selection
uses click, Shift-click range, Ctrl/Meta-click toggle and Ctrl/Meta+A; Copy
retains selected steps in sequence order without local IDs. The in-memory
step clipboard is shared between slots and independent of the board clipboard.
Paste assigns fresh IDs, inserts after the last selected step or appends without
selection, selects the pasted group and records one history entry. Group deletion
is one entry. A sole blank Text starter is replaced on paste. Invalid raw input
cannot accept pasted steps. Recording suspends editor commands and records their
key chords normally; stopping records the completed take once rather than each
captured event. Read-only editors permit copying, but not undo/redo or paste.

The macro sequence uses two fixed tile sizes: 64 × 80 CSS pixels for one key
or a delay and 144 × 80 for a chord or text, at every layout width. Content
wraps/clips inside those sizes; it never determines tile dimensions. Press and
release use small down/up marks, taps a dot and delays inline milliseconds.
Reading order is left to right, then the next row. Selecting a tile reveals
its existing editor beneath the sequence. Selection follows its local focus ID,
not its index. Tiles keep their selected border without an additional native
focus outline. Delete/Backspace removes the focused tile, or the selected step
from a button in its inspector, through the same validated path as Remove. It
then focuses the next surviving step after the focused removed step, counting
only survivors before it (previous at the end), or the first add action when
empty. Form fields retain ordinary editing keys; modified keys, composition,
read-only mode, dialogs and recording cannot trigger deletion. Auto-repeat is
consumed without deleting more steps. Drag insertion and Earlier/Later share the pure
`view/macro-sequence.mjs` move rule, preserve step objects and metadata, and post
through the existing validation/staging path. The complete sequence is the drop
surface: its leading/trailing whitespace and gaps between wrapped rows use
`sequenceInsertionAt()` to find the nearest row and insertion position. Drops
recompute their target from the actual drop coordinates, not a stale hover marker;
leaving the sequence clears the marker. Read-only and recording sequences
do not offer dragging. The name, protection, placement, recorder, clear/discard,
raw input, shared bank-memory feedback and draft history paths remain available.
The sequence leads the editor; lengthy typing/protection guidance is a separate
disclosure in the footer below the recorder, beside Host settings. Add-step controls use
bordered 36 px buttons; Discard local edits and Clear macro are title-bar text
buttons. Record/Stop uses a 42 px button with the same dimensions in either
state, and the Record heading takes the Sequence heading's style. Raw payload has a persistent
checkbox toggle at the right of the add-step row; its panel opens above the
sequence, including automatically for an unparseable payload. Protection and all
recorder settings stay visible. The macro bank has its own scroll area, as
every slot bank does (Shared controls), so a slot change does not require
scrolling past the editor. The shared scroll path
captures and restores both the bank and outer content positions during same-screen
renders, including slot selection, accepted edits and captured recording events.

The same view module diagnoses orphan releases, repeated holds/taps of held keys
and unfinished holds by canonical key identity, marking affected tiles and
showing a reason before staging. Invalid intermediate orders remain editable
locally; no automatic sorting or encoding changes repair them. Host inspection
still judges the complete payload and prevents invalid, unsupported or oversized
edits from replacing the last valid draft. Local step diagnostics do not replace
the firmware decoder or the host's validation authority. Routine per-macro memory
and successful-staging notes are omitted; the feedback area collapses when there
is no error or pending inspection. Shared bank memory remains visible.

`recorder.mjs` owns capture listeners and finishes a take when its slot is no
longer the editable, visible Macros slot, a dialog opens, or the user clicks
outside the recorder. The app reconciles this ownership before rendering, so
rail navigation and editor jumps share the same policy. Finishing removes
capture listeners and stages through the original slot's normal host validation;
another selected slot never receives the take. Discard explicitly cancels its
active capture and detaches listeners before resetting the form; the outside
click handler cannot stage that discarded take. Explicit takes release any
captured held keys before validation. Outside clicks keep their intended action,
including native disclosure toggles, before the editor redraws.

`view/macro-recording.mjs` owns captured-event normalization and macro encoding,
without DOM or host access. The recorder defaults to taps and chords, with no
capture-style selector. All recorder settings are visible, including **Preserve
hold timing**, off by default and disabled during a take. The boolean preference
survives renders and draft changes. Enabling the preference
selects explicit encoding and forces effective delay recording on; disabling it
restores the stored delay preference. The control shows the effective delay
choice and retains the existing threshold/rounding controls. Both encodings
observe down and up events.
Compact capture groups an overlap into a chord only when every press precedes
the first release. A modifier held around several complete groups joins each
shortcut; nested modifier holds follow the same rule. Other rolling overlaps
retain their original explicit sequence. No transitive overlap becomes a chord.
Explicit capture keeps each event and its timing. Duplicate downs and releases
of keys not captured by this take add nothing. Pending compact groups render
as a provisional chord; pending explicit groups retain held presses, and
finishing supplies any missing releases in reverse press order. The UI passes
the take end timestamp so synthetic releases preserve the last hold duration;
rounding, thresholds and delay splitting apply normally. Earlier end timestamps
are clamped to the last event, and a take with all physical releases gets no
extra trailing delay.

Compact delays measure gaps between completed groups; explicit delays measure
event gaps. The first event has no leading delay. Threshold and rounding apply
before pauses longer than 65,535 ms split into supported delay steps. Existing
payload text is retained verbatim before the take; host validation still decides
whether the resulting macro can be staged.

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


## Combo output behaviour permissions

Settings → Combos exposes **Combo outputs use behaviours**; each combo builder
exposes **Use output behaviour**. Both default on. Switching either off changes
output processing while preserving the chord, timing and participation policy.
Explain the native fallback beside the controls, and that a custom key sends
its shortcut, or nothing without one; the combo builder names the output's
shortcut. They are firmware feature bit 30, which Ark requires (D-L64).

The global value is a tagged header field in the existing Settings section,
not another scalar ID. Review and section Discard include it. Per-combo edits,
Review, Undo/Redo, backup/export/import and layer rewriting preserve the row
permission. Zero-default backups opt in.
Native readback compares the permission as well as inputs, output and timing.
Combo-derived behaviour and macro/pointing reach lists honour the two output
permissions while retaining normal native outputs.

## Keyboard name

Settings opens with a **Keyboard** card (`.settings-group[data-section="keyboard"]`)
holding one text field, `data-f="settings:keyboard-name"`, in the ordinary
(not monospace) face, with a live byte count against the 32-byte name rule.
Its placeholder is `model.keyboardName.builtIn`, the firmware's built-in name
while the connected keyboard stores none and reports it over USB, else
"Built-in name". It follows `canEdit("settings")` and the Settings search.

On `change` it posts `renameKeyboard` built by `keyboardNameMessage` in
`webview/view/edits.mjs`: `{name, expectedFingerprint}`, the name trimmed. Core
(`core/model/keyboard-name.js`) refuses names past 32 bytes or with control
characters; an empty name gives the keyboard back its built-in one. The review
item is `keyboardName` in Settings, with place `{kind: "settings", section:
"keyboard"}`, so Show opens the card and the draft mark is the section's.

While a renamed keyboard is restarting (D-L62) the model carries
`reconnecting: {name}` and a loading `load` whose progress names the wait; the
rail shows that name with a pulsing dot instead of "No keyboard connected".

The safe departure may wait for held keys or macros without a timeout. The
10-second return wait starts when the connection drops. Reconnection requires
the original serial when known; without one, known other keyboards are
excluded and a unique, unshared target name identifies the returning device.
An unknown built-in name or ambiguous identity leaves selection to the user.
Recovery restores also expect a possible rename when the previous name was
unreadable. An explicit built-in name can restart even with unchanged USB text.
