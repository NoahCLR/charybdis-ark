# Ark guide

The long version of the [README](../README.md): what each screen edits, how
the interface behaves, what Review checks, what happens while a profile is
applied, and how backups work. Developing Ark is described in
[REPOSITORY.md](REPOSITORY.md#development-and-installation).

## Installing and upgrading

Installing is described in the [README](../README.md#install). If
`~/.vscode/extensions/noah.charybdis-ark-0.1.0` already links to an older
checkout, retarget that symlink when you are ready to switch. Keep the extension identity `noah.charybdis-ark`;
recovery files use VS Code's extension-global storage, outside this checkout.
If an older `noah.charybdis-live-0.1.0` link is still installed, remove it: the
app was named Charybdis Live, and Ark copies the recovery files saved under that
identity into its own storage on start.

## What it edits

Every screen is drawn and wired to the host:

| Surface | What it edits |
| --- | --- |
| Keys | Layout keys, key behaviours, combos, layer names and priority; reachable behaviours, macros and pointing modes are shown in place, whether a key, a behaviour branch or a combo reaches them |
| Lighting | Six stages, the stage mask, layer and pointing-mode colours with their localities, combo and key feedback, auto-mouse fade with its hold as a share of the timeout, LED group rows and reusable groups |
| Macros | Both banks: name, payload, insert-at-cursor step builder, reorder/remove controls, parsed preview, configurable recorder and placement; search by name, and the layers that set each macro off — by key, behaviour or combo — in their layer colour, each opening that layer in Keys with the macro picked |
| Mouse | Pointer speed, sniping and auto-mouse — the Settings sections the keyboard's model files under Mouse, drawn with the same cards and posted whole |
| Pointing modes | All eight slots: movement, speed, direction shortcuts, scroll tuning, buttons, bindings, placement, clear and duplicate |
| Settings | Every other section the keyboard reports, posted whole, read-only where the firmware cannot report; the Combos section also carries the default combo window and the combo hold threshold, which the keyboard stores with its combos |
| Profile & backups | Import (the file against the keyboard, counted by what it configures — keys, lighting, macros, mouse, pointing — before it becomes the draft), export, upgrade export, recovery state |
| Device | Read-only: connection, committed generation, what was read |

The keycode picker leads with the ANSI board, then task-shaped Symbols,
Navigation, Numpad, Layers, Pointing modes, Macros, Mouse, Media, Lighting,
Magic and Custom sections. The complete QMK catalogue remains available under
More keys, Other QMK and All keycodes, and search spans all of it — named
macros included, found by the name they were given. Layers offers each layer
as Hold (`MO`), Lock (`LOCK_LAYER`, the same lock as QMK's `TG`) and Tap-hold
(`LT`); a keyboard that owns its layer keys adds Tap-toggle (`TT`), One-shot
(`OSL`) and Move (`TO`).

Colour on any screen comes from the model, never from a constant, and a stage
that is switched off is drawn as off — hollow dots, plain badges, unlit keys.

Every edit is kept in a local draft and reaches the keyboard only through
review and apply. Review lists each changed thing once, under the area it is
edited in, with the fields that changed, can open it where it is edited, and
can discard part of the draft: things made by the same edit (a key swap, a
moved behaviour) go back together, as one undoable step. Layers are compared
by which layer they are, not where they sit, so a reorder is one **Layer
priority** item and a key edited or a layer renamed after it is its own item;
each can be discarded without the other. A keyboard the app cannot open a draft for — its profile
could not be read, or its firmware predates profile editing — is read-only:
the host refuses any edit rather than writing it directly.

**Read from keyboard** runs one complete read at a time. The health strip says
both halves agree only after the firmware reports a known, converged peer;
matching generation numbers alone are insufficient. A failed committed-profile
read remains an error instead of being labelled as compiled defaults. Those
defaults are shown only when fresh device status reports no committed profile.
When more than one compatible keyboard is connected, the selector at the top
left chooses which one to read and edit. Switching keeps a dirty draft attached
to its original keyboard; the other keyboard stays read-only until you switch
back or discard that draft. Device choices keep their identity across rescans
within the panel, so replacing one keyboard cannot reuse its draft by list order.
Switching keyboards closes an open layer editor or import review; reopen it on
the selected keyboard before keeping changes.
After a disconnect, a retained dirty draft requires **Review against the
keyboard** before editing or applying, even if the HID path and saved profile
look unchanged.

Macro keycodes are shown as `VIA_MACRO_0` through `VIA_MACRO_63` in the live
editor, including slots whose QMK values have no named constant.
**Custom keys** lists the 64 custom keys: rename one, add or edit its
behaviour, place it on a key, and see where it is used; the key picker offers
them in its own Custom keys section. Their names are stored on the keyboard; a
keyboard with none stored reports the names authored in `keymap.c`.

## The interface

After the complete keyboard read opens an editable draft, the board stays on
screen, full width, painted with the light the keyboard would actually show for
that layer — the base effect, then
the layer's colour on the keys it owns — with the legends drawn on top in
whichever of black or white stays readable, and the behaviour dots and combo
badges on the key face in the feedback colours the keyboard flashes.
During initial read, refresh or device selection, every screen menu is disabled
and a loading step replaces the screen. Once the read finishes, Device opens
if the keyboard reported its capabilities. Profile & backups opens when a
connected keyboard supports complete-profile backup, including five-layer
firmware that can be read and backed up. The Configure
menus open only with an editable draft.

Underneath it, one workbench whose tabs are the key, its behaviour, its combos,
and the macros and pointing modes the layer reaches. A behaviour is tap count ×
tier, so it is drawn as a grid. Timing fields start with **Multi tap window**
(release to next press), then Tap / hold and Long hold. Behaviour and combo
timings matching the default show a muted placeholder such as `150 · default`;
other values look entered. Labels end at `ms`. Clearing an override restores the
default. LT keys show their own dual-role default.
Changing a behaviour timing default moves every row following it, including
explicit values matching the old default; distinct custom timings stay fixed.
Review lists inherited effective-time changes under Tap & Hold Timing and any
matching overrides converted to defaults under their behaviours. Those stored
changes discard together with the default edit.
Selecting a key opens its grid in Behaviours even before it has a stored row.
Only a grid action, timing override or anchor change adds the row to the draft;
browsing leaves the board and behaviour counts unchanged. Transparent keys and
`KC_NO` cannot have behaviours. In a layer preview, a transparent key opens the
key the board shows through it: the editor names the layer that supplies that
key and says the behaviour belongs to its keycode, so changing it changes that
key wherever it is pressed. Turning layers on or off in the preview updates the
open key, whichever you did first. Empty branches preserve the key's built-in
actions until you override them. A dual-role key's empty first tap or hold
shows, dashed and marked "built in", what the key does there on its own: an
`LT()` taps its key and holds its layer, an `MT()` or `OSM()` holds its
modifiers. **Change key…** moves a behaviour to another
key through the keycode picker; when that key already has one, you choose to
overwrite it, swap the two, or cancel, and either is one undoable draft step.
On a keyboard that owns its layer keys (Profile Wire feature bit 14), a
behaviour takes QMK's layer keys where the keyboard can run them: `TG()`,
`TO()` and `LOCK_LAYER()` anywhere, `OSL()` as a tap, `TT()` and `MO()` as a
"Press and hold until release" branch; `LT()` and `LM()` stay keys and combos,
and `DF()`/`PDF()` are refused.
On the board, drag one key onto another to swap them, ⌘C and ⌘V copy a key
onto the selected key, and Delete or Backspace makes it transparent. ⌘Z undoes
and ⇧⌘Z or ⌘Y redoes the draft everywhere except inside a text field, which
keeps its own undo. **Draft history** in the rail opens every step of the
draft, newest first, each with when it was made and what it changed from the
step before it (not from the keyboard, as the review compares); go straight
back or forward to any of them. Board keys work from the keyboard too: Space or Enter
selects one, and Enter on the selected key opens its picker.

The layer stack is not one of those tabs, because
it is not a property of the selected key. The layers are tabs along the foot
of the board card, next to the workbench, the picked one opening into the board
it shows, on Keys and on Lighting alike; **Rename & Reorder** stays at the end
of those tabs, outside what scrolls, and opens upward over the board, so a layer
is renamed and reordered where its keys are on screen. Drag a row by the grip
on its left to move it, or focus the grip and press ↑ ↓. The bottom row is the
base: always on, and what every transparent key falls through to. It is not
dragged; **Make base** on another row swaps that layer into it, and the old
base takes its place. **Keys follow their layers** (on by
default) renumbers every layer key (MO, LT, TG, TO, TT, OSL, LOCK_LAYER…) on
layers, behaviours and combos so each still reaches the same layer. Make base is
the exception: the two layers trade roles, so `TO(0)` still goes home and a key
that reached the new base now reaches the old one — the key that held Numbers
from Base holds Base from Numbers. Turned off, the layers move but those keys
keep their numbers — except the swap, which the toggle does not change. Names, colours and the pointer and sniping settings move
with their layer either way. After Make base, the review's checks say what it
left behind: transparent keys on the new base, which have nothing under them,
the old base if nothing reaches it, and any layer key that holds or toggles the
base, which does nothing since the base is always on.

**⌘-click** (Ctrl-click off a Mac) more layer tabs to preview them on
together. The board then shows what the keyboard would answer with, by the
firmware's rule: the highest layer on wins, a transparent key is answered by the
highest layer below it that is also on, and Base is always on. Keys answered from
below are seen through the top layer's glass: frosted like a transparent key,
their legend sharp, in the light of the layer that answers, and
on Lighting the board paints every layer on, lowest first, as the keyboard does.
The highest layer keeps the tab joined to the board and every edit is stored on
it; a key answered from below says so on the Key tab, and setting it overrides
that answer. ⌘-click Base on its own to see the picked layer over just Base.
⌘-click a layer again to take it out, or click any tab to go back to
one layer. Layers on under the top one are tinted and outlined in their own
light, so the set reads from the tabs. The set holds across Keys and Lighting and is dropped
when the keyboard or its layer order changes. It is a what-if: a set no key can
actually hold together still previews.

Before anything is applied, the review **checks** what the layers let you
reach. A layer that can lock with no way back to Base — nothing on it, or on
anything held over it, releases the lock or moves back — is a **trap**: the
review shows the steps into it and the way out. The first four trap states have
paths; if more exist, their number is shown. Combos are checked against keys
that occur together on a reachable stack, including keys inherited through
transparent positions. Active traps have red cards; warnings have orange cards.
Apply asks "Apply anyway" before writing whenever
the draft has a trap or warning, including one already on the keyboard.
Other checks cover a layer with keys nothing reaches, a layer key onto an empty
layer, transparent and `KC_NO` keys on Base, a pointer layer that cannot work,
and layer keys the keyboard leaves to QMK. They also name combos that cannot
fire, actions aimed at empty pointing slots, and macros too long to play.
Brightness or lighting effects unsupported by the destination are blockers:
Apply stays disabled until they are fixed. Notices and checks fixed by the draft need no
confirmation. Each check says whether the draft made it, the keyboard already
has it, or the draft fixes it. When a new warning or trap has a clear source in
the draft, the check links to that change and the change is highlighted. If
several edits could be responsible, the review leaves the source unlabeled.

Every colour on screen is a colour the keyboard emits; one amber signal marks
work that has not reached the keyboard yet. Complete edits stage into one draft
as they are made; incomplete builders such as a new combo keep their local form
until it is valid. The floating bar is the only way changes leave the window.
After Apply completes, it reports the keys, profile, combos and base lighting
being read back, while the editor stays visible and temporarily busy.

In **Manage layers**, **Make base** swaps a layer with the current base. Empty
physical keys entering the base become `KC_NO`; `KC_NO` physical keys leaving it
become transparent. Unused matrix positions keep their values. If the former
base had no layer colour, it receives the saved base HSV as its own all-key
colour, even when an animated base effect is
selected. The review gives transparent and `KC_NO` base keys separate notices.

In **Keys → Combos**, **Pick on board** brings the board into view so its keys
can be selected as combo inputs.
The **Key** tab count is the number of mapped keys on the selected layer;
the selected key's layout index appears in its details.
In **Keys → Behaviours**, reach sections open independently. Matching sections
share their expanded or collapsed state across the Behaviours, Combos, Macros
and Pointing modes tabs. The full list scrolls with the Keys page rather than
inside the rail.
The Behaviours, Combos, Macros and Pointing modes tabs start with **On this
view**: what the board reaches with the selected layer and any layers previewed
under it. **On this layer** stays tied to keys stored on the selected layer;
the tab counts use that layer too. Use ⌘-click on layer tabs to change the
composed view. Combo rows use the keyboard's Combo Layer Matching reference
when one is configured.
Every Keys workbench tab is at least as tall as Behaviours, so switching tabs
keeps the page at the same scroll position. If an editor grows taller, that
height stays while switching tabs.

## Timing checks

Review and the behaviour editor explain combo/tap timing risks on older
firmware, using the connected profile. Firmware with physical gesture timing
is recognized without changing the layout or tuning values.

Timing checks resolve inherited defaults, warn about overlapping or impossible
release tiers, and exclude proven-impossible layer routes. Narrow gesture/chord
windows receive advice; this is conservative analysis, not a guarantee that
every gesture is physically practical.

## Applying changes

Every edit goes into one local draft with undo, redo and a history, and reaches
the keyboard only through **Review and apply**. Apply
saves a recovery copy, then commits the complete profile to both halves as one
recovery-first logical transaction and verifies the readback. The review shows
warnings in orange, traps and save blockers in red. It checks layer reachability,
combos, inert pointing bindings, and macros the keyboard cannot play. Apply asks
for confirmation when a warning or trap is present and stays disabled until
destination save blockers are resolved.
Removing one combo appears as one deletion in Review and Draft history; later
combo numbers shift because the device stores them in a packed table.

After Apply completes, the editor stays visible while the app reads keys,
profile domains, combos and base lighting back from the keyboard. The bottom
bar names each read and shows its progress; editing resumes when it finishes.
Only that readback is shown as following an Apply. A later read, export or
discard names what it reads and says nothing about saving, because it writes
nothing to the keyboard.

What to expect while it applies:

- Apply waits for held keys, locked layers and pointer modes to clear before
  the commit decision, and says so; after 60 s the save is cancelled and
  nothing changes. Anything that fails before the decision leaves the saved
  profile unchanged. A save the app abandoned before the decision is cancelled
  by the keyboard within about 15 seconds, and the next save can start once
  both halves are connected.
- It then holds key input for the few moments while this half's keys and
  macros are rewritten and the new profile activates. If the app is closed in
  that window, the keyboard finishes the save on its own from the other half's
  copy within about 15 seconds.
- If the cable between the halves comes out after the decision, the USB half
  keeps typing the old profile until the rewrite starts, and the save resumes
  when the cable goes back in. If it comes out during the rewrite, the USB half
  finishes and switches to the new profile, and the app says the other half is
  not connected.
- After power loss in the middle of a save, the USB half types nothing until
  its keys and macros are one complete version again, which may need the other
  half connected.

Drafts live in the editor window; closing it loses unapplied changes. The
transaction and recovery contract is specified in
[`docs/architecture/logical-profile-transaction-v1.md`](../upstream/firmware/docs/architecture/logical-profile-transaction-v1.md).
Physical power-loss acceptance across every decision boundary is still in
progress, so keep the recovery file that Apply creates.

## Profiles and backups

Charybdis Ark's **Export profile** saves the configuration read from the
keyboard: every layer and key position, behaviours, combos, named VIA macros,
lighting and global settings. Flashed defaults and live edits become one
portable file. **Import profile** shows a review, saves a recovery copy, restores
both halves and verifies the complete readback. A failed or interrupted restore
reports the saved recovery file instead of claiming success. Recovery files are
kept in the extension's local storage; the app shows their full path.

The standard firmware reserves eight layers. **Manage layers** names and orders
the overlays, with the highest-priority layer shown first and Base fixed at the
bottom. Moving a layer updates the keys, behaviours, combos, RGB assignments and
pointer settings that refer to it. There is no need to change the layer count
or reflash for ordinary profile editing.

Old five-layer firmware is no longer built here. Its storage geometry is
incompatible with current firmware, so retain the old pair and its backups if
you still use it. Executable custom combo hooks and unsupported macro content
cannot be represented as profile data; export reports these explicitly instead
of producing an incomplete file.
The [portable profile contract](../upstream/firmware/docs/architecture/portable-profile-v1.md) records
format limits, compatibility, restore ordering and remaining hardware checks.

## Cleared pointing slots

A key bound to a **cleared pointing slot** is allowed. The keyboard keeps its
mode keycodes in a fixed registry and its runtime refuses to activate a slot
with an empty record, so such a key is inert, not invalid — it does nothing
until the slot is configured again. The clear goes through even while something
still reaches the slot, the validated profile counts what
still points at the empty slot, and the Pointing modes screen and the hover card
say the key does nothing for now.

The same reasoning runs the other way, so the keycode picker offers **every**
slot, configured or not: its Pointing modes section lists the eight slots as
rows, each with a Hold and a Toggle key, and marks an empty slot's row as doing
nothing yet. Search finds the same keys as `Slot 6 · hold (empty)`. A board can be laid out before its modes are, and the key says `empty`
on its second line until the slot is filled in.
