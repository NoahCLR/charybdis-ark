# Interface rendering and rule ownership

The app contracts behind
[D-L32](../adr/0032-things-sit-in-fixed-places.md) and
[D-L33](../adr/0033-one-home-for-each-shared-rule.md).
The [guide](../GUIDE.md#the-interface) explains using the interface; this
specification owns rendering invariants and the modules that supply shared
meaning. Layer dependencies and placement of new work remain governed by
[AGENTS.md](../../AGENTS.md).

It also states the interface rules of the decisions its sections cite: marks
(D-L31), catalog names and the picker (D-L05), custom key shortcuts (D-L63),
the draft binding and panel controls (D-L60), the snapshot and device models
(D-L61), draft marks and Draft history (D-L30), review changes and Discard
(D-L29), how the review presents checks (D-L36), making a layer the base
(D-L37), the import comparison (D-L15), the demo (D-L53), the lighting preview
(D-L12), macro steps and memory (D-L26), Host layouts and macro text (D-L56),
macro input protection (D-L57), participation controls (D-L55) and the
keyboard's name (D-L62).

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
The Behaviours, Combos, Macros and Pointing modes reach lists lead with **On
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
  as Device and Automatic recovery do.
- The keycode picker draws a key's single legend smaller only when it does not
  fit the key (`legendFits` in `view/picker-board.mjs`).
- Card and section names are sentence case, as the rail and the review name
  them. A folded settings card says what it holds now, in place of its
  rows: the layers left out, the options on, the operating system and
  layout (`foldedSummary` in `view/settings-layout.mjs`); an open one says
  nothing there.
- A slot bank (Macros, Custom keys) heads its card with its name and count,
  then its search across the column. Its tiles sit three across in a 340 px
  column and scroll inside the card, which stays in view beside the editor;
  `lib/scroll.mjs` keeps the bank's position across same-screen renders. A
  narrower window shows two across, and below 720 px the bank stacks above
  the editor.
- A list beside its editor (Lighting's layers and pointing modes) scrolls on
  its own past eight rows, `.rowlist.many`, with its heading kept in view. Its
  `data-scroll-list` key lets `lib/scroll.mjs` keep each list's position across
  same-screen renders without carrying it into another list, and bring the
  picked row into view.
- A heading inside a workbench column uses the column's `sect-h` style.
- Pages of cards (Mouse, Settings, Backups, Keyboard) share one width,
  `--page`. Side-by-side tables start at the top rather than stretching to
  each other's height.
- Keys and Lighting draw the same layer strip, Rename & Reorder included
  (`layerBar` and `attachLayersControl`).

## Marks

Each thing with a colour of its own has exactly one mark, drawn by
`webview/ui/marks.mjs` wherever the thing is named (D-L31):

| Thing | Mark |
| --- | --- |
| A behaviour tier (tap, hold, long hold) | the dot the keyboard flashes when it resolves (`tierDot`) |
| A tap count (2× and up) | its branch badge, in its tap-branch colour (`branchBadge`) |
| A layer | its layer colour |
| A pointing mode | the light its slot paints (`slotLight`) |
| A combo | its badge, in the combo feedback colour (`comboBadge`) |
| A lighting stage | its on/off dot |

A thing is marked where it is the subject and where it is only referred to: a
setting names what it governs (`governs` in `core/model/settings-editor.js`),
so its mark appears in Settings, in the editors' fields and in the review
alike. A stage that is off draws its marks off. A colour is the keyboard's own,
so a dark one reads dark. The draft's dot is not one of these marks; it marks
what the draft changed ([Draft marks](#draft-marks-and-draft-history)).

## Pointing tap outputs

Straight directions, diagonals and physical-button tap overrides use one tap
vocabulary, owned by `core/schema/pd-mode-domain-v1.js`. It includes plain
mouse buttons 1–8 (`0x00d1..0x00d8`) and VIA macro outputs
(`0x7700..0x777f`), which take inherit policy and mask zero (firmware D-F23);
every Profile Wire 2 firmware accepts both (Profile Wire 1's feature bits 28
and 29, D-L64). Mouse movement, wheel,
acceleration and modifier-wrapped mouse codes remain invalid. The firmware
owns the click runtime contract (D-F22); the [guide](../GUIDE.md#pointing-mode-clicks)
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

## Catalog names and the picker

A name the catalog gives a key is what the key does wherever it is placed
(D-L05). A key or a combo output runs QMK's full key handling, so any keycode
works there. A behaviour sends QMK and keyboard functions (keycodes past the
layer keycodes and below the user range: the DPI and sniping keys, RGB Matrix,
Magic, `QK_BOOT`) as a synthetic QMK record, so they run as on a key, and Ark
says so. A key whose own keycode is one keeps a plain key's fallback hold: with
only a double-tap branch on `SNIPING`, holding it still holds sniping, as with
no behaviour at all.

The picker offers only what does something on this keyboard (`pickable` in
`webview/view/picker-sections.mjs`). It leaves out the retired, inert
`QK_USER_0`–`QK_USER_31` entries, the Charybdis drag scroll (`DRGSCRL`,
`DRG_TOG`; drag scroll is the `PD_SLOT_0` pointing mode), unnamed `QK_KB`
slots, and keycodes for QMK features the build does not include (MIDI, audio,
RGBLight, Caps Word, Repeat…). That last list is written against the
firmware's build until the keyboard reports its features. A key that already
holds one of these still reads back by name. VIA macro slots appear as
`VIA_MACRO_0`–`VIA_MACRO_127` throughout the app; their QMK numeric identities
still round-trip, but the picker does not offer the duplicate `QK_MACRO_n`
names of the first 32 slots.

## Custom key shortcuts

Each custom key has an optional shortcut (firmware D-F26), stored in settings
domain 0x40, version 8: 128 two-byte records after the layer records, custom
key 0 first, each an 8-bit HID report modifier mask (bit 0 Left Ctrl … bit 7
Right GUI, any combination) and one key: none, a basic key `0x04..0xa4` or a
mouse button `0xd1..0xd8`. Both zero is no shortcut; modifiers alone and a key
alone are shortcuts. Ark reads and writes version 8 only
(`core/schema/settings-domain-v1.js`); a keyboard or backup storing an older
settings version is refused (D-L64). The shortcut is the key's own action
(D-L63).

The shortcut is edited on the Custom keys screen beside the name, through the
custom key editor (`updateCustomKeyShortcut`, `core/model/custom-key-editor.js`):
key and modifiers both in the keycode picker, as any key is set on the Keys
screen, the key limited to what the firmware accepts and the modifiers in its
row. In this `shortcut` mode the row's eight modifiers mix sides, which a
single keycode cannot, and the choice is a mask and a key (`shortcutPick` in
`webview/view/custom-key.mjs`). Elsewhere the keycode picker folds modifier
buttons and a clicked modifier key into one set (`modifierPick` in
`webview/view/keyvalues.mjs`) and stores the simplest keycode that holds it:
one modifier as the key, wrapped in the others while those are on one side.
Only a set with two or more modifiers on each side, or a key with modifiers
from both sides, needs more: a keycode field's picker (a layout key, a
behaviour cell, a combo output) then offers a custom key for it
(`shortcutOffer`, `customKeyChoice`). One that already has exactly that
shortcut and no behaviour is used. Where the field runs the custom key's
behaviour too, a layout key or a combo output, a match with a behaviour is
offered beside a new key and the person chooses; a behaviour step sends only
the shortcut and never chains a behaviour, so there any match is used.
Otherwise the first unused custom key (`unusedCustomKey`) is named and given
the shortcut by one `updateCustomKeyShortcut`, whose `then` carries the layout
or behaviour edit that uses it, staged in the same draft step. A combo output
is made at once and saved with its combo.

Review shows the shortcut as the custom key's Shortcut field, discarded with
its name. It is named in the host OS's words (`shortcutLabel`,
`core/model/key-names.js`) wherever the key is described: the screen, the
picker's tip, the board's hover card, the combo editor and the key inspector.

Because the shortcut is the key's own action, its behaviour row works on top:
the built-in tap and fallback hold of a custom key with a shortcut are the key
itself, shown as its shortcut, exactly as a plain key's are its keycode
(`builtInActions` in `core/model/built-in-behavior.js`). A bypassed custom key,
on a placement or as a combo output, sends its shortcut, or nothing without
one, and Ark words it so. A behaviour step may send a custom key as a tap,
press-and-hold or other hold (`placementProblem` in `core/schema/actions.js`);
it sends only that key's shortcut, never its behaviour, so behaviours never
chain. The firmware does not check that such a step's key has a shortcut; Ark
warns in Review (`shortcutlessCustomKeyStep`, `core/model/profile-checks.js`)
rather than refusing what the keyboard accepts.

## Shared rule ownership

- Settings help: `core/model/settings-editor.js` owns the descriptions for its
  Mouse and Settings fields. `hint` remains visible; optional `tooltip` adds
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
  Current named `CUSTOM_KEY_n`, N/A and Transparent remain selectable where
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
  `draft.reason`, with the session's compound transitions beside it
  ([Draft binding and panel controls](#draft-binding-and-panel-controls)).
- Interface: `canEdit(area)` for permission, `view/reach-groups.mjs` and
  `ui/groups.mjs` for grouped lists, `slotLight` in `ui/marks.mjs`, one form
  per macro slot and one `state.combo` for the builder.
  Every panel state field declares its initial value and draft-replacement
  policy together in `store.mjs`; `view/state-fields.mjs` constructs fresh
  state and resets fields from those declarations. A policy keeps the value,
  resets it, or computes a replacement from the state before the change.
  The declaration preserves the existing behavior: pending `cellHow` and the
  LED group builder (`ledPicks`, `trackball`, `rowColour`, `ledRow`) stay kept.

## Draft binding and panel controls

Whether the open draft may be changed against the keyboard now is one rule
(D-L60), `draftBinding` in `core/session/panel-session-state.js`, answered as
`{editable, reason}`: the draft is this keyboard's
(`ProfileDraftSession.bindingTo`: the selected keyboard, connected, over the
connection it was read through), on firmware that holds a complete profile,
current with the keyboard, and nothing is running. The demo's draft is bound
to the demo device, so the rule holds there unchanged ([Demo](#demo)). The
reasons come in a fixed order, so `busy` means only an operation in progress
stands in the way.

Core refuses by it and the interface offers by it. The router stages an edit,
opens or keeps an import or layer review and routes Apply only for a bound
draft; live macro validation answers to it; Apply checks its draft's keyboard
binding again as it writes. The model publishes it as `draft.editable` and
`draft.reason` (`contracts/panel.d.ts`), and the interface's `writable()`,
under `canEdit`, reads that value instead of recomputing it. A new connection
is therefore refused before any model has marked the draft stale.

Panel controls are registered once in
`core/session/panel-control-registry.js` (`CONTROLS`): their route, draft
identity and binding rule, demo policy, execution phase and named action. The
router, operation wrappers and demo refusals consume those policies;
controller modules implement the actions. History and local macro inspection
remain available before the ordinary busy guard, which refuses work with a
notice rather than dropping it. Read-only recovery paths remain available
without a draft. The keyed payload groups in `contracts/messages.d.ts` are
inert posted-data declarations; a registry test holds their control names and
routes to the runtime table, and the route sets kept for the shells are
derived from it. Closing the web page warns only when closing would lose
edits (unapplied ones, or the demo's unexported ones) or while the keyboard's
profile is being written, by an Apply or a device restore, not for every
backup operation (`leaving` in `web/web-host.mjs`).

Device operation phases have stable IDs (`PHASE` in
`core/model/vocabulary.js`), typed as `PhaseId` in the posted contracts. Their
status labels, read and busy words and write fact live beside those IDs and
reach the interface as `model.vocabulary.phases`. The interface displays those
words; progress correlation keeps comparing IDs. The web page's
active-restore warning uses the write fact. Changing presentation words cannot
change routing, progress acceptance or which operation writes to the keyboard.
Apply steps and candidate-transfer progress keep their separate identities.

`panel-session-state.js` also holds the panel session's compound transitions:
opening or replacing the draft (`setDraft`, `replaceDraft`), closing the import
review and layer editor together and resetting the forms when the keyboard or
draft under them changes (`closeEditors`), a read beginning and ending
(`beginRead`, `endRead`), the panel's own operations running
(`whilePanelBusy`), an Apply and its readback (`whileApplying`), and the
outbox the next model carries once (`takeOutbox`). The other session modules
call these rather than setting those fields together themselves.

## Snapshot model and device model

The editable configuration model is built directly from a complete snapshot
and its matching decoded form (`buildSnapshotModel` in
`core/session/device-model.js`; D-L61). A publish uses `decodedOf(snapshot)`,
so a frozen draft history entry is not decoded again. Layer positions, names,
behaviours, pointing slots, combos, macros, host layout, settings and lighting
all come from that snapshot; the facts read with it supply host OS detection
and the brightness and options limits. The draft binding supplies
editability, never simulated read success.

Building the panel model is a projection: it does not open, close, observe or
mark a draft stale. The panel loop explicitly observes service changes before
publishing their model. Rebase uses that same observation step, so a
completed snapshot is observed once. A standalone export reads its own
snapshot of the keyboard without replacing the editor's snapshot or its views,
so an export never moves the draft's comparison behind the user's edits.

The same module adapts independent device reads for a partial read
(`buildDeviceModel`). Both share configuration presentation, but a draft never
fabricates a `LayoutRead`, `CommittedRead` or base RGB read to pass through
the device adapter. The keyboard header and diagnostics show the actual device
state throughout; local changes only add the draft subtitle. The demo supplies
its own explicit header and diagnostics. A partial read keeps its independent
read-only view and domain failures even when a dirty draft is retained.

## Draft marks and Draft history

Every editor marks what the draft changed with the draft's dot (D-L30): a key,
a layer chip, a tab, a behaviour or combo row, a slot, a colour row, a
settings section, and the header of a folded group holding a change. The marks
come from the review's own changes (`draftMarks` in `webview/view/review.mjs`),
so the two never disagree.

**Discard all** is one more draft step: undo brings every change back, and the
keyboard is not read again, except for a stale draft, one bound to another
keyboard, or a recovery. Undo and Redo name the step they take back or bring
back. **Draft history** opens every step newest first, each with when it was
made and what it changed from the step before (not from the keyboard, as the
review compares); going to a step is several undos or redos at once. Core
sends the steps only while the sheet is open (`openProfileDraftHistory` is a
view control).

In Apply, the commit bar has one way on, **Review and apply** (**Review
changes** in the demo, whose review offers Export where Apply would be),
beside **Discard all**. It counts the draft's changes and adds how many were
added, changed and removed only when that says more than the count
(`statusBesideCount` in `webview/view/review.mjs`): "3 changes" when all three
changed something, "3 changes · 2 added · 1 changed" when they differ. In the
live modes the bar (`liveCommitBar` in `webview/ui/shell.mjs`) counts unsaved
changes and offers Revert, and in Live + review **Review and save**.

## Review changes and Discard

The review lists one change per thing that differs from the keyboard (D-L29):
a key on a layer, a layer's name, a behaviour, a combo, a macro with its name,
a settings section, a pointing slot, or one lighting record (LED groups and
the rows that paint them are one record, since rows name groups by id). A
change says whether the thing was added, changed or removed and lists only the
fields that differ, in the editors' words. Fields compare what is stored, not
what is shown, so a changed default or a renamed layer is one change where it
was made. Colour reads as in the editors ([Marks](#marks)). The draft's change
count counts changes. **Show** opens the change where it is edited; a removed
thing has Show only where it is still on screen
([Fixed positions](#fixed-positions-and-composed-reach)).

Combo numbers are packed positions. When the only net combo difference is one
removed row, review and history show that removal as one change and explain
that later combos move up one number. Discard reinserts the row at its former
position. If another combo also changed, review keeps the positional
differences visible rather than attributing them all to the deletion.

A change is also the unit **Discard** puts back, as one more undoable step.
The changes one staged edit made belong together, so a key swap or a moved
behaviour is one block with one Discard, titled by the edit that made it; a
later edit touching two groups joins them. Every change is listed under its
own area in rail order; a group spanning areas shows its part in each, and
each part's Discard takes back the whole group. Rebases, discards and steps
that fell out of the bounded history link nothing. A discard from a current
review keeps it current; once nothing described is left, the draft is the
keyboard's profile again, including bytes no change describes. A recovery
review is discarded whole or not at all. See `core/model/profile-review.js`,
`core/model/profile-revert.js`, `ProfileDraftSession.changes()` and
`webview/view/review.mjs`.

**Layers are compared by identity, not by slot.** Beside every history entry
the draft keeps which keyboard layer each slot now holds, set by Rename &
Reorder from the order it saves and never inferred from names or contents,
which two empty layers or a swap that also swaps the names would fool. The
review compares the draft with the keyboard's profile rearranged into that
order, with every layer reference following. So a reorder is one **Layer
priority** change, one row per layer that moved; everything else is compared
layer with layer. With **Keys follow their layers** off, keys that kept their
numbers now reach a different layer and are listed as the changes they are.
Discarding the order moves the layers back and keeps every other change; undo
and redo carry the order with their entry; a rebase keeps it; an import, a
discard of the whole draft and an Apply start again from the keyboard's order.
Group links are kept by layer, not by slot, so a later reorder does not tie
two layers' keys together. See `core/model/layer-order.js`.

## How the review presents checks

What the checks find, and how, is in
[Timing, built-in branches and reachability](timing-and-reachability.md#layer-reachability-and-escape);
this is how the review shows them and asks about them (D-L36).

The draft's findings are reported beside the keyboard's, both in the draft's
layer order, so each is **new**, **on the keyboard** or **fixed** by the
draft. Per-key findings include the key and code in their identity; grouped
empty-key notices include their positions, so replacing one issue with
another on the same layer does not call the new one existing.

The review lists them first, under Checks, each with the steps into it, the
way out and Show. Active warnings have orange backdrops; traps and blockers
are red; fixed findings stay quiet. Every warning or trap the draft keeps asks
for confirmation, whether the draft made it or the keyboard already had it:
Apply turns into **Apply anyway** / **Go back** (**Save anyway** in Live +
review; `checksToConfirm` in `webview/view/checks.mjs`, shown by
`ui/review-overlay.mjs`), and core refuses an Apply, a Live + review Save or
sending a draft live without that confirmation in the message. Notices and
fixed findings do not ask. Confirmation is tied to the reviewed draft
revision, so a changed draft must be reviewed and confirmed again.

A new warning or trap points to a draft edit group only when its source is
unambiguous: one group in the draft, or an unowned layer key changed at that
exact position (`checkSourceGroup` in `webview/view/checks.mjs`). The source
group is marked in the review, and the check links to it. A check already on
the keyboard has no draft source; checks with several plausible edits do not
guess.

## Making a layer the base

The base is a slot, not a layer (D-L37): the bottom one, always on, what every
transparent key falls through to, and what `TO(0)` returns to. Layer 0 is the
base in the firmware's lookup, in the RGB base effect and in layer ownership,
so `DF()` and `PDF()` stay refused (firmware D-F46). Rename & Reorder puts
another layer there with **Make base**, which swaps it with the current base,
as one reorder; the base row itself is never dragged, so a drag never changes
the base by accident.

With keys following their layers, the new base and the old one trade roles
rather than follow: a layer key that reached the base still reaches the bottom
slot, so `TO(0)` still goes home, and one that reached the new base now
reaches the old base, wherever it went. The key that held Numbers from Base
holds Base from Numbers, and `TO(Game)` becomes the key that switches back.
The swap holds whether or not keys follow their layers: with the toggle off, a
key that kept its number would reach whatever took the old base's slot once it
moved on, so the toggle only decides for references to the other layers.
Every other key, behaviour and combo reference follows its layer, as do names,
colours, LED group rows, and the pointer, sniping and combo-reference
settings, which name a layer by what it holds. The startup layers are slots
and stay on the bottom one.

On a base swap, transparent physical keys entering the base become `KC_NO`,
and `KC_NO` physical keys leaving the base become transparent; unused matrix
positions keep their stored values. A person can still deliberately place a
transparent key on the base afterwards. If the old base had no layer colour,
it receives the saved base HSV as its own all-keys layer colour, including
when the selected base effect is animated; an existing layer colour stays as
it was.

The swap cannot make the new base's empty keys do something, or reach the old
base when the only keys that did sit on the old base itself. The review's
checks name both, count base `KC_NO` and transparent keys separately, and
count every layer key that holds or toggles the base, rather than the reorder
inventing a way back. The checks compare the draft with the keyboard as it
is, matched layer with layer through the draft's order, so what a reorder
makes or mends is reported as new or fixed. The review's Layer priority change
names the new base first. See `reorderLayers` in
`core/model/portable-profile.js`.

## Import comparison

**Choose profile…** and dropping one file onto the Import profile card open
the same validated review in both shells and in the demo (D-L15). Dropping is
available only when Import is editable; multiple, unreadable and oversized
files are refused without changing the draft. File drops never navigate away
from Ark.

Before a backup becomes the draft or is restored, its card compares it with
what the keyboard holds, since that is what applying it would write, counting
the differences by what they configure: Keys, Lighting, Macros, Mouse and
Pointing modes (anything else under Other), each with added, changed and
removed totals (`CATEGORIES` and `categorySummary` in
`webview/view/review.mjs`). It names no single difference; that is the
draft's review. A backup identical to the keyboard says so, and can be used
only while the draft has edits: using it then puts the draft back to the
keyboard's profile, as **Discard all** does. A backup carries no layer order,
so it is compared slot by slot (`importDifferences` in
`core/session/panel-session.js`).

## Demo

The demo is a draft with no keyboard behind it (D-L53): the same
`ProfileDraftSession` a keyboard's read opens, over a profile document, run by
the shared panel loop, so both shells offer it (`core/session/demo-session.js`).
Its document is the bundled demo profile, an export of a real keyboard shipped
as data (`core/data/demo-profile.charybdis.json`, never hand-edited and never
read from a firmware checkout), or a backup opened in its place and checked
as Import checks one. It runs under the capabilities current firmware reports
(the 32-slot action vocabulary `0x6fd70b90`, its 16-layer and 128-slot limits
and keyboard options), held equal by test to what the fake current keyboard
reports.

While `session.demo` is set, the state the panel answers to is the demo's
(`panelState` in `demo-session.js`), in which the draft's source is present,
so the editing gates hold unchanged. What the panel is told is not a
keyboard: `model.device` says Demo with no connection, generation or halves,
`model.demo` says the demo is open, and the panel shows a persistent strip
saying so. What needs a keyboard is refused in core, not only hidden: Apply
and reviewing against the keyboard. Export saves the draft itself, since there
is no keyboard profile to export. Reading or choosing a keyboard leaves the
demo; with edits not exported since, the message must say the panel asked
(`discardDemo`), or it is refused. The demo is offered only with no keyboard
connected and no unapplied keyboard draft, and on a page that cannot reach a
keyboard only where the shell says so (`model.host.blocked.demo`).

## Lighting preview

Pass-through is a layer paint operation, not a colour (D-L12). Base RGB comes
from Profile Wire settings scalars 21 and 22. Brightness is absolute HSV
(0–255), as layer colours are; the reported keyboard limit constrains editing
and never rescales a read. The snapshot's already verified settings supply the
base preview. A standalone base-lighting read remains optional: a failure
clears that preview without discarding the profile.

The board is a **selected-layer preview**: base plus the selected layer (with
layer preview, every layer on, lowest first), their colours in layer order,
then their LED groups in reported order, following the firmware's membership,
pass-through and inheritance rules (`webview/view/lighting.mjs`). It is not
LED telemetry: editing respects the reported brightness ceiling, and effects,
animation phase, active layers and transient feedback are not reported. Exact
live appearance would need a device frame readout, not host reconstruction.

Colour editors keep every stored channel at zero brightness, and an explicit
black stays distinct from LED-row inheritance (the Lighting entry under
[Shared rule ownership](#shared-rule-ownership)). A saturated layer colour at
zero brightness paints black; only zero saturation and brightness pass
through.

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

## Macro steps, inspection and memory

The macro editor is an ordered list of editable Text, tap/chord, delay, press
and release steps over one escaped payload (D-L26). Text preserves literal
braces, whitespace and Unicode without exposing command syntax; the Raw
payload view exposes the raw commands, which round-trip to the same steps.
Incomplete step fields remain local instead of being silently removed or
coerced. Unparseable raw input is retained whole and blocks step editing, so
rebuilding a partial parse cannot lose its tail. Text fields contain long
input without overlapping feedback or controls. Recording appends commands to
the same payload.

Live inspection uses the production macro codec and the same playback, setup
and bank limits as staging (`core/model/macro-input.js`, called by
`core/model/macro-editor.js`). The panel loop answers `validateViaMacro` with
`macroValidation`, correlated by slot, exact payload, request id and draft id
and revision, without staging, history, toasts, device calls or a full model
redraw, and only for a bound draft
([Draft binding](#draft-binding-and-panel-controls)). The interface also
checks its current inspection context (Host setup, slot bytes and bank space)
before using a reply. Valid completed edits post `updateViaMacro`; rejected
input and its feedback remain local. Field input updates feedback without
replacing the field, preserving native editing and composition.

Every empty slot keeps room for ten key taps (30 bytes; `SLOT_RESERVE_TAPS` in
`core/model/macro-editor.js`). When free memory cannot keep that for every
empty slot, the highest-numbered empty slots are unavailable and cannot be
edited until space is freed. The firmware does not enforce the reserve, so the
app reports the remaining shared space after every profile edit. Every macro
name takes up to 32 UTF-8 bytes, following the shared counted-name contract of
the [portable profile](../../upstream/firmware/docs/architecture/portable-profile-v1.md).

## Host layouts and macro text

The keyboard types macro text through a host layout (firmware D-F16): for each
computer layout, which keys type each character, generated from macOS's and
Linux's own layout data and QMK's Windows data. Ark takes the firmware's
fixture through `upstream/` and generates `core/data/host-layouts.json` from
it (`scripts/generate-host-layouts.js`, rerun by `npm run upstream`); it reads
the fixture's character table and never re-derives it, so what the editor
accepts and what the keyboard types cannot disagree (D-L56).

Settings → Host offers the layouts of the effective OS, plus US. The keyboard
types through the layout whatever the OS, so a Host edit that changes the
effective OS carries the layout along (`followHostOs` in
`core/schema/host-settings.js`): kept if it is US or that OS's, else that OS's
layout of the same language, else US. Detection is not an edit, so Auto never
rewrites the layout; Host and the macro editor warn while the layout belongs
to another OS than the effective one. On macOS, Unicode entry needs the
Unicode Hex Input source, so it is a layout choice there, not a switch; the
switch stays for Windows and Linux. The macro editor refuses a character the
layout cannot type unless Unicode entry is available, naming it, and refuses
an ordinary key held across text that needs Unicode entry, as the keyboard's
preflight does.

Settings → Host links to WinCompose's GitHub project with the shared GitHub
mark when the effective OS is Windows and Unicode playback is enabled (Auto
follows detection). When macOS Unicode entry is selected, the Host section
warns that an active Unicode Hex Input source may interfere with Option
symbols and shortcuts, including word navigation, for ordinary keys and
key-step shortcuts as well as macro text. Ark neither switches the host input
source nor claims that its layout choice can preserve the usual source's
Option behaviour.

Keys are labelled as the layout prints them (`core/model/key-names.js`): the
layout screen, the picker's board and search, and Review, from the same data;
stored keycodes never change, and US keeps the catalogue's labels. The picker
includes Shift and Option/AltGr legends and marks dead keys with ◌. Shifted
symbols and shortcut base keys follow the layout; macOS ISO swaps the same key
positions in labels as in playback.

Stored macro status, live inspection and whole-profile warnings share
`core/model/macro-input.js`'s playback analysis, including ordinary holds
across text requiring Unicode entry. For each text macro, Review compares
native strokes from the pinned fixture, Unicode entry and unavailable
characters under the old and new Host setup, and lists only changed routes or
playback validity, including ASCII whose native keys change and macOS ISO
swaps. These derived Macros rows use the Host settings unit: discarding them
restores Host and keeps independently edited macro steps and names. Authored
text and explicit key steps are never rewritten to simulate a layout change.
An accepted but unplayable macro is a warning, not a save blocker.

## Macro input protection

The Macros editor offers per-macro playback protection as Automatic, On and
Off (firmware D-F17; D-L57). Automatic turns on for text the selected layout
cannot type natively and must enter as Unicode, not merely because UTF-8
contains non-ASCII text. Its effective state follows Host changes, and Review
groups that derived effect with Host; explicit overrides are macro changes and
discard with their slot. The explanation distinguishes keyboard-output
isolation from a host input lock: ignored presses are never replayed, held
modifiers resume, and suspended ordinary keys need release and a fresh press.
It does not promise protection from another keyboard, pointing or
consumer/media actions.

An explicit On or Off is a canonical three-byte prefix in the macro's own
bytes (`core/schema/macro-payload.js`); Automatic stores none. Text and name
edits preserve it, metadata-only empty slots keep their reserve, and bank
accounting includes its three bytes while playback accounting excludes them.

## Participation controls

Ark exposes the firmware's participation contract at every scope (D-L55):
master and source-layer switches in Settings, enabled and allowed-layer
controls on shared behaviour and combo definitions, and **Use behaviour** /
**Join combos** on physical placements. The key inspector explains blocked
scopes and navigates from a transparent inherited key to the placement that
supplies its keycode. Controls stage ordinary profile edits; Review and
partial Discard preserve other fields, Undo and Redo restore policy, and layer
reordering moves masks and placement bits with their layers. Disabling keeps
definitions and timing. A bypassed native key falls through normally; a
bypassed custom key sends its shortcut, or nothing without one. The
source-layer and gesture-capture rules are firmware-owned, in
[participation-policy.md](../../upstream/firmware/docs/architecture/participation-policy.md).

## Combo output behaviour permissions

Settings → Combos exposes **Combo outputs use behaviours**; each combo builder
exposes **Use output behaviour**. Both default on. They veto shared behaviour
use by generated outputs independently of chord participation. Switching
either off changes output processing while preserving the chord, timing and
participation policy.
Explain the native fallback beside the controls, and that a custom key sends
its shortcut, or nothing without one; the combo builder names the output's
shortcut. Every Profile Wire 2 firmware has them (Profile Wire 1's feature
bit 30, D-L64).

The global value is a tagged header field in the existing Settings section,
not another scalar ID. Review and section Discard include it. Per-combo edits,
Review, Undo/Redo, backup/export/import and layer rewriting preserve the row
permission. Zero-default backups opt in.
Native readback compares the permission as well as inputs, output and timing.
Combo-derived behaviour and macro/pointing reach lists honour the two output
permissions while retaining normal native outputs.

## Keyboard name

The keyboard's own name is the 273rd counted name in settings domain 0x40,
after the layer, macro and custom-key names, under firmware D-F14's name rule:
up to 32 bytes of UTF-8, no control characters (D-L62). Empty means the
firmware's built-in name (QMK `keyboard_name`); the firmware serves the
effective name as its USB product string. Because it is profile data, it is
edited in the draft, reviewed as Keyboard name, discarded on its own and kept
in backups.

Labels follow one rule (`deviceLabels` in `core/session/device-model.js`): a
listed keyboard is called by the product name it reports, and the connected
one by the name it stores once that is read, so a new name shows as soon as it
is applied. A serial number, or the listed number where the shell shows none,
is added only where two labels would otherwise match. The header shows a
stored name alone, and the manufacturer and product otherwise.

The Keyboard screen's title is the name: the shared title-name component
(`ui/title-name.mjs`, as macro and custom-key titles), `data-f="keyboard:name"`
inside `.keyboard-title`, with a byte count against the 32-byte name rule and
the reconnect note shown only while it has focus. Its placeholder is
`model.keyboardName.builtIn`, the firmware's built-in name while the
connected keyboard stores none and reports it over USB, else the device's
label. It follows `canEdit("settings")`; a Settings search that matches the
name points to Keyboard (`view/settings-layout.mjs matchesElsewhere`).

On `change` it posts `renameKeyboard` built by `keyboardNameMessage` in
`webview/view/edits.mjs`: `{name, expectedFingerprint}`, the name trimmed. Core
(`core/model/keyboard-name.js`) refuses names past 32 bytes or with control
characters; an empty name gives the keyboard back its built-in one. The review
change is `keyboardName` in Settings, with place `{kind: "settings", section:
"keyboard"}`, so Show opens the card and the draft mark is the section's.

### Restart after a rename

After a save that changes the stored name, the firmware's master half restarts
USB by itself once the transaction is idle on both halves, nothing is held, no
macro runs and Raw HID has been quiet for a second. Ark expects it
(`core/session/keyboard-reconnect.js`): the device service records the drop,
and a readback it cuts short, as diagnostics rather than errors, and the panel
shows it reconnecting. While a renamed keyboard is restarting the model
carries `reconnecting: {name, lost: false}` and a loading `load` whose
progress names the wait; the rail shows that name with a pulsing dot instead
of "No keyboard connected". Without a connected keyboard the draft's
`live.keyboard` is null and the rail shows no live save state.

Waiting for the safe departure has no timeout: held keys and macros may delay
it. Once the connection drops, the panel loop polls the device list for at
most 10 s in both shells. The web page stops connecting the first allowed
keyboard throughout the expectation.

A known serial number must match (node-hid; the master half's hardware ID
survives the restart); Ark never falls back from a known serial to a name.
Without a serial, Ark remembers the other keyboards listed before the save and
excludes their IDs. It reconnects only to one candidate reporting the new
name, and only when no other keyboard already had that name before the save.
An unknown built-in name after clearing the stored name, or ambiguous
identity, leaves the choice to the person in the keyboard menu. A sole listed
keyboard is not enough to establish identity. Once found, the keyboard is
connected and read again, and the notice says it is back. Timeout, ambiguity
and read failure notices keep the save result and the recovery copy's
location.

Firmware compares stored names, so changing the empty built-in-name sentinel
to its explicit text may restart even though the USB product text is
unchanged; Ark expects that too. A recovery restore whose previous name is
unreadable may also restart, so Ark expects it conservatively. Reading or
choosing a keyboard during the wait ends it; this also ends an expectation if
a repaired keyboard kept its name and never needed to restart.

In the live modes the keyboard runs its working copy, so a live edit, undo or
Revert that changes the stored name restarts USB the same way, without a save;
Ark expects that restart after each such edit as it does after a save. The
shell lists the keyboard again as a new device, but the draft is not left
behind with the old one: a live read naming the draft's edit session, which
the keyboard chooses afresh at every boot, is the same running keyboard, so
the draft follows it with its history, and the rename can be reviewed, saved
or reverted.

### Following a lost keyboard back

A keyboard lost unexpectedly is followed the same way where nothing else would
notice it come back. When a request goes unanswered past its timeout, Ark
closes the connection but the keyboard stays plugged in; when a keyboard drops
off USB in a shell that shows serial numbers (node-hid), its serial identifies
it on return. In those cases the device service records which keyboard it was
and what happened, and the panel loop waits up to 10 s for it: the same listed
device if it never left, otherwise by serial or unshared product name as
above. The model carries `reconnecting` with `lost: true` and its own words. A
web page follows Chrome's own connect events for a keyboard that dropped off.
Ark connects it again, reads it and says what happened ("did not answer within
1000 ms", "disconnected"). It does this at most once in 30 s; a keyboard that
fails again sooner is left to the person with the failure shown. The
diagnostics name the first bytes of the request that went unanswered.
