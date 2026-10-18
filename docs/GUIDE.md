# Ark guide

The long version of the [README](../README.md): what each screen edits, how
the interface behaves, what Review checks, what happens while a profile is
applied, and how backups work. Developing Ark is described in
[REPOSITORY.md](REPOSITORY.md#development-and-installation).

## Installing and upgrading

Installing is described in the [README](../README.md#install). Ark works with
the current firmware only: the left/right pair from the latest firmware
release. A keyboard running anything older, or anything else, is read no
further than its identity: Ark says to update both halves and shows nothing it
could edit. See [Firmware versions](#firmware-versions).

If `~/.vscode/extensions/noah.charybdis-ark-0.1.0` already links to an older
checkout, retarget that symlink when you are ready to switch. The link keeps
the name `-0.1.0` whatever version Ark is: VS Code records the installed
extension by its folder, so a renamed link is a second install. Keep the
extension identity `noah.charybdis-ark`; recovery files use VS Code's
extension-global storage, outside this checkout.
If an older `noah.charybdis-live-0.1.0` link is still installed, remove it: the
app was named Charybdis Live, and Ark copies the recovery files saved under that
identity into its own storage on start.

## Using Ark in Chrome

Ark also runs as a web page, in Chrome or Edge on a computer, with the same
screens as in VS Code; the released page's address is in the
[README](../README.md#install). It is a set of static files: once the page has loaded it
talks to nothing but the keyboard, and nothing you do leaves your computer.
The page reaches a keyboard over WebHID, which only Chrome and Edge have and
only on a page served over HTTPS (or from `localhost`). In Safari, Firefox or on
a plain `http://` address the page says Ark needs Chrome or Edge over HTTPS
instead of offering a keyboard; the demo still works there, on a tablet too.
On a phone the page shows only the keyboard's outline and a notice that Ark
runs on a computer, with links to Ark's and the firmware's repositories and to
BastardKB, the keyboard's official seller: no phone browser can reach the
keyboard, and Ark's screens need a computer's.

**Choosing the keyboard.** A page sees only the keyboards you have let it open.
The first time, the page says **Connect your Charybdis**: Ark edits a
Charybdis 4x6 running the charybdis-4x6 firmware, with a link to install it,
then **Choose keyboard** and **Explore a demo**. Choose **Choose keyboard** and pick your Charybdis in Chrome's
list; Ark then reads it. After that the page reconnects to it by itself whenever
it opens, without asking again. **Choose keyboard**, under the keyboard's name,
lets the page open another one and switches to whichever you pick. The page
follows what Chrome allows it to open: one allowed keyboard is connected,
several fill the rail's selector, and plugging one in or out updates both at
once. Keyboards are listed by their names ([Naming the
keyboard](#naming-the-keyboard)); a browser shows no serial numbers, so two
with the same name are numbered. **Disconnect** lets go of the keyboard and takes back the page's
permission to open it, so it is not reopened until you choose it again; if the
page may still open another keyboard, Ark connects that one.

**One tab at a time.** Only one Ark tab holds the keyboard. A second one says
Ark is open in another tab, and takes over when that tab closes. Closing or
reloading the tab while the draft has unapplied edits, or while Apply is
running, asks first: the draft lives in the tab and does not survive a reload.
Apply keeps its pace in a background tab, but keep the tab open until it ends.

**Light and dark.** The rail's **⋯** menu switches between a light and a dark
theme. Ark starts from your system's setting and remembers your choice in this
browser. In VS Code there is no toggle; the panel follows VS Code's theme.

**The rail and the top bar stay quiet.** The rail opens with Ark's mark: the
board and its name on one line. Under it is the keyboard's name and a chip that
says in words how it is: **Both halves connected**, **Slave half not found**,
**Halves out of sync**, **Not connected**, or **Demo**, its dot green, orange
or hollow, and pulsing while a read runs. Hovering it says what to do: check
the cable between the halves, or wait and read again. With more than one
keyboard its name is the selector. The web page adds **Choose keyboard** and
**Disconnect** beneath. Below that the rail shows only a save in progress or a
restart; the draft's changes are counted in the draft bar. The screen and the
Keyboard screen say what is wrong and offer **Read** to read the keyboard again. A
screen's top bar holds its title and one line saying what the screen is for;
a search sits in the panel it filters.

**Copies saved before each Apply, and files.** Apply saves a copy of what the
keyboard had in the browser's storage before it writes anything, and refuses
to write if it cannot be saved. Backups lists every copy, newest first, named
by the keyboard and when, with **Use as draft**, **Download** and **Delete**. Ark asks Chrome to keep this storage when space runs
low, but clearing the site's data (or the browser's) deletes the copies, so
download any you want to keep. **Save a backup file…** downloads the backup file;
**Choose a backup file…** opens the browser's file chooser and takes files up to
256 KiB, enough for any complete profile. Errors
show in the rail's message rather than as a notification, and the page's
version and commit are in the rail's **⋯** menu, with GitHub's logo: choose them
to open that commit on GitHub in a new tab.

## Exploring without a keyboard

With no keyboard connected, the connect area offers **Explore a demo** beside
**Read keyboard** (VS Code) or **Choose keyboard** (the web page). It is offered
on a browser without WebHID too, since it needs no keyboard. The demo opens a
complete setup, as current firmware holds one (16 layers, 32 trackball mode slots,
128 macros and 128 custom keys), in the same draft a keyboard's opens in. Every
screen works, and every edit stages, is checked and shows in the review exactly
as it would on a keyboard; undo, redo, Discard, the draft history, **Layers…**
and Restore all work on it.

It never claims to be a keyboard. A strip across the top of the window says
**Demo · no keyboard** on every screen; the rail names it Demo, with a hollow
dot and no connection, halves or recovery to report, and the Keyboard screen says what it
stands in for. Nothing in it reaches a keyboard, and nothing is kept: the demo
lives in this window until it is left or closed.

**Apply needs a keyboard.** The commit bar's button reads **Review changes**,
and where the review would offer Apply it says Apply needs a keyboard and
offers **Save a backup file…**. That button, there or on Backups, saves the demo's
setup with your edits as a backup file (`charybdis-demo-<date>.charybdis.json`);
on your keyboard, **Choose a backup file…** under Restore reviews it against what the keyboard holds
before anything is applied.

**Open a backup file…**, on the strip, replaces the demo's setup with one of
your saved `.charybdis.json` backup files, checked as Restore checks it. A file
Restore would refuse is refused, and the demo stays as it was.

**Leaving.** **Leave demo** on the strip, or **Choose keyboard** or **Read**,
leaves the demo for a keyboard. With edits not saved to a backup file since, Ark asks first
and offers Save a backup file…; opening another backup file asks the same way. Closing or
reloading a web page with such edits asks too. While a keyboard is connected,
or a draft holds unapplied edits for one, the demo is not offered.

## Reading the keyboard

**Read from keyboard** runs one complete read at a time. Connecting,
refreshing and exporting each read and verify the whole saved configuration.
Ark skips macro storage the keyboard confirms is empty, and reads the whole
bank while the keyboard cannot yet say; progress counts the bytes transferred.
A change during a read fails it, so you can read again. Ark says both halves
are connected only after the firmware reports a known, converged peer;
matching generation numbers alone are insufficient. A failed committed-profile
read remains an error instead of being labelled as compiled defaults. Those
defaults are shown only when fresh device status reports no committed profile.
A keyboard whose slave half is not connected cannot give a complete read: Ark
says so at once and shows the layout it could read, rather than waiting for
the halves to agree.

The initial read uses one verified capture for the editor, draft and complete
backup, so keys, saved profile bytes and combos are downloaded once. Keys are
read in chunks, and immutable firmware defaults can be reused within the
connection. The loading message names the transfer and shows its byte count.
Read-status changes retain the editor; changed data or edit permissions redraw
it. Reconnecting starts fresh.

When more than one compatible keyboard is connected, the selector at the top
left chooses which one to read and edit. Each is listed by the name it reports;
two with the same name add their serial number, or a number where the host
shows none. Switching keeps a dirty draft attached
to its original keyboard; the other keyboard stays read-only until you switch
back or discard that draft. Device choices keep their identity across rescans
within the panel, so replacing one keyboard cannot reuse its draft by list order.
Switching keyboards closes an open layer editor or import review; reopen it on
the selected keyboard before keeping changes.

After a disconnect, a retained dirty draft requires **Review against the
keyboard** before editing, checking a macro, keeping an import or layer review,
or applying, even if the HID path and saved profile look unchanged. These
controls wait for a complete, current read on the draft's own keyboard; the
review adopts that keyboard's reported capacities, including its macro memory.
The demo remains editable without a keyboard.

During initial read, refresh or device selection, every screen menu is disabled
and a loading step replaces the screen. Once the read finishes, Keyboard opens
if the keyboard reported its capabilities. Backups opens when a
connected keyboard runs current firmware with complete-profile
backup. The Configure
menus open only with an editable draft.
If a screen cannot be identified, Ark shows **Screen unavailable**; choose a
screen from the menu to continue.

## What it edits

What each screen edits:

| Surface | What it edits |
| --- | --- |
| Keys | Layout keys, key behaviours, combos, layer names and priority; reachable behaviours, macros and trackball modes are shown in place, whether a key, a behaviour's action or a combo reaches them |
| Custom keys | The 128 custom keys' names, shortcuts and, for each, its behaviour: timings, the tap count × tap/hold/long hold grid and participation, for a key on a layer or on none; where each is placed |
| Lighting | All lighting, the base effect (effect, colour, brightness, speed, which LEDs, lights off after), six stages and the stage mask, layer and trackball mode colours with where they light, keys with their own colour, combo and key feedback with the flash speed, mouse fade with its hold as a share of the timeout, LED group rows and saved groups |
| Macros | Named slots: literal Text, a compact sequence of key/delay/press/release tiles, drag reordering and a selected-step editor, raw payload, live size feedback, configurable recorder and placement; search by name, and the layers that set each macro off — by key, behaviour or combo — in their layer colour, each opening that layer in Keys with the macro picked |
| Trackball | Pointer (ball speed), Sniping (its speed, auto-sniping and where its keys are placed) and the Mouse layer — the Settings sections the keyboard's model files under Trackball, each posted whole — then all 32 trackball mode slots: movement, step distance in millimetres with the stored counts, sensitivity, direction shortcuts and how often they send, which layer it keeps while it runs, scroll tuning with each field's rule, what each shortcut does with held modifiers, button overrides, placement, templates, clear and duplicate |
| Settings | Tap & hold timing · where behaviours and combos run · combo timing (the default combo window and the combo hold threshold, which the keyboard stores with its combos) · combo layer matching · key options · your computer · default layers · what is built into this firmware (read-only); each section posted whole, read-only where the firmware build leaves an option out |
| Backups | Back up (Save a backup file…) and Restore (Choose a backup file…: the file against the keyboard, counted by what it configures, and whether it fits, before it becomes the draft); the copies saved before each Apply, each usable as a draft |
| Keyboard | The keyboard's name (the screen's title, click to rename); its firmware and whether it works with this Ark; both halves; memory; diagnostics |

## The interface

Every colour on screen is a colour the keyboard emits; one amber signal marks
work that has not reached the keyboard yet. The one exception is the
connection's status chip: green or orange for a keyboard that is ready or
needs its halves seen to. Orange also marks a warning, such as a key that
reaches an empty pointing slot; amber is never used for anything but the
draft. Colour on any screen comes from the model, never from a constant, and a stage
that is switched off is drawn as off — hollow dots, plain badges, unlit keys.
The draft bar is the only way changes leave the window.

**The frame.** The rail is on the left and the screen's top bar, 64 px tall,
above it. The draft bar is docked along the bottom of the screen, across its
width, and never covers what it is about. The rail's foot holds **Draft
history**, undo (↺) and redo (↻), and a **⋯** menu with the theme (on the web
page), **Show keycodes** and the build. **Show keycodes** puts each key's QMK
keycode beside its name across Ark; the key you are editing always shows its
own. It is off at first and remembered by VS Code or the browser, as is
**Hide board**. On Keys and Lighting the board card stays at the top of the
screen while the workbench under it scrolls, so a key's editor is in view as
soon as the key is clicked; **Hide board**, at the right of the workbench's
tabs, folds the board to its layer tabs for a long edit and brings it back
when pressed again. What the board's marks mean, and its shortcuts, are behind
the **?** at the board's top right.

**Controls.** Every control that takes the keyboard shows the same ring when
it is reached with Tab, a switch on its track. A disabled control reads in a
fainter colour, never faded; a read-only field keeps its value readable with a
dashed edge. Buttons follow one grammar: the one action that commits a
surface is filled; one that creates something or opens a dialog is outlined,
ending in "…" when it asks for more; an object's own actions are small text
buttons at the end of its row or title, the destructive one last and red
under the pointer; a button that takes you to another screen is a text button
naming where; a view choice, such as Hide board or Pick on board, is a button
that stays pressed; a stored on/off is a switch; and an icon-only button is
named for screen readers.

Hover over a setting's label or control on Trackball or Settings to see what it
does. Read-only settings also explain why they cannot be edited. Visible
hints and numeric limits stay beside the setting. A number field takes only
digits (a time in seconds or minutes also takes one decimal point): letters
and other characters typed or pasted into it do not appear. A time's unit sits
inside its field at the right, on every screen, so the label names only the
value; the review still names the unit.

A Settings section's one-per-layer switches (Default layers, and where
Behaviours and Combos run) are one row: its label and what it means, then a
switch for each layer in a grid, named and marked in the layer's colour. A
search for one layer's name still finds its switch. Settings and the
behaviour editor call the time between taps the **Multi tap window**.

**Settings** reads top to bottom: Tap & hold timing; Where behaviours and
combos run (Behaviours and Combos, each with its master switch and layers);
Combo timing (the default combo window and the combo hold threshold, editable
on current firmware with or without combos); Combo layer matching, a select
per layer four across; Key options, where an option the firmware was built
without says **Not in this firmware** and does nothing; Your computer; then,
folded, Default layers and **Built into this firmware**. That last section is
read-only: the layers, tap counts, macro, custom key, trackball mode and combo
slots, LEDs, brightness and repeat ceilings and DPI steps the keyboard
reports, and QMK's tap-hold options, which the keyboard does not report; each
needs a firmware build to change. A folded section says what it holds in
words ("16 layers", "13 options"). Settings that QMK keeps live (combos on or
off, default layers, key options) say **↺ keyboard keys change this too**: a
key on the keyboard, or VIA, can change them, and the draft then asks to be
updated. Search reads each setting's words, its hover help (where QMK's names
are) and a section's other names; it says when nothing matches, and points to
matches on another screen ("3 matches on Trackball →").

Anything that folds has a chevron before its name, turned down while it is
open: a Settings section, a behaviour's **Layers it runs on**, a group of
review checks, a trackball mode's Advanced, a group in a Keys tab. Review, the keycode picker and
Draft history each close with **Close** at their top right, or Escape; their
footers hold only what acts, such as Apply, Save a backup file…, Clear and Use key.
An editor's own actions, such as Move to another key…, Duplicate, Clear slot and Clear
macro, are small text buttons at the right of its title bar, the destructive
one last; so are the buttons that take you to another screen, such as Place on
a layer… and Edit in Lighting. A macro and a custom key are named by their
editor's title: click it to rename. A tap-count badge from 2× on is tinted
with the colour that tap count flashes while it waits, its count in the normal text colour so a
dark colour still reads. Numbers in a table line up on their last digit.

When an accepted edit redraws the screen, the same field keeps keyboard focus
and its text selection while it remains available. Search fields also keep
the caret where you are editing, including when filtering Settings.

Repeated badges, tap and hold dots and draft marks have fixed positions, including an
empty mark slot when neighboring labels have marks. Review and Draft history
keep title marks separate from their names. Review fields line up as the
change sign, label, value on the keyboard and value in the draft; an absent
value shows a dash. Show and Discard stay at the edge, and a destructive action
is last in its row. A removed item keeps its mark and Show only when its editor
still shows that slot, such as a cleared pointing or macro slot. Owner selectors
use their displayed names and marks. A key or action that holds, locks or taps
to a layer always shows that layer's colour before the layer's name, so
"Hold ■ Numbers" reads the same in the hover card, the Keys tabs, the behaviour
grid and the review.

### Words and keycodes

Ark names one thing one way on every screen, in the words of what the
keyboard does. A behaviour is a grid of **actions**: a row per **tap count**
(Single tap, Double tap…) and a column each for tap, hold and long hold; a
hold action says **How it runs**, a behaviour row says how many actions it
sets ("3 actions"), and **Clear** empties one cell. A layer key's verb is one
of **Hold**, **Lock**, **Tap-hold**, **Tap-toggle**, **One-shot** and **Move
to**, on the key cap, in the hover card, in the picker and in the review; QMK's
`TG()` is a lock on this keyboard, so it reads Lock like a layer lock does.
`KC_NO` is **Nothing**: it does nothing and blocks the layers below, and its
cap shows a dash. A **Transparent** key falls through to the layer below, and
where Ark knows what answers it says so ("Transparent → Esc from Base").
Settings calls QMK's default layers **Default layers**: always on underneath
every other layer, normally only Base. The section about the computer is **Your
computer**, with its **Operating system**. The rail groups the screens as
CONFIGURE and MANAGE; the trackball has one screen, **Trackball**, whose modes
are **Trackball modes**, and the mouse layer QMK calls auto-mouse is the **Mouse
layer**. Sniping is **Sniping (precision speed)** where it is first named. Slots are numbered from 0 as their keycodes are and tagged **M5**,
**K5** and **P5** for macro, custom key and trackball mode 5; one with no name
reads "Macro 5", "Custom key 5" or "Mode 5". A combo is named by its keys and
what it sends, "Space + Delete → Hold Number", with its C-number as a quiet
index, since deleting a combo renumbers the ones after it. Settings and the
picker search still find the older and QMK words (host, startup, magic,
pointing, auto-mouse, `KC_ESCAPE`).

**Show keycodes** is one switch, off by default and remembered. Keycodes are
always shown where you act on one: the Key tab's Keycode field, the picker's
footer, **Where it is stored**, a macro's raw payload and a review value's
tooltip. Everywhere else the switch decides: with it on, the hover card,
behaviour rows, titles and cells, combo Sends, the Key tab's "This key on every
layer" rows, reach rows and picker buttons add the keycode as a muted suffix;
with it off they show only words. A trackball mode's directions and button
taps read as the computer's keys ("Command + Z"); with the switch on, each
also has its keycode field for typed entry.

### The board

After the complete keyboard read opens an editable draft, the board stays at
the top of the screen at a capped height (about half the window, its keys no
wider than 64 px), painted with the light the keyboard would actually show for
that layer — the base effect, then
the layer's colour on the keys it owns — with the legends drawn on top in
whichever of black or white stays readable, and the behaviour dots and combo
badges on the key face in the feedback colours the keyboard flashes. A key's
legend is sized from the key as drawn, never smaller than 9 px (8.5 px for its
second line) unless the key has no room; a long name wraps onto two lines
before its letters are narrowed.
Resting the pointer on a key opens a card of everything it reaches: the first
after a moment, then at once as you move from key to key, and for a moment
after leaving the board. Tabbing to a key opens its card too, and Escape
closes it. Every
action there reads by its name first, then the keycode it stores; a custom key
or pointing mode reads as `CUSTOM_KEY_n` or `PD_SLOT_n` rather than its number.
A custom key says under its name what its shortcut sends, held and tapped as
the key is or where its behaviour leaves a tap or hold empty, or that it has
none.
A layer-tap or mod-tap key always lists what its tap sends, what its hold does,
the tap / hold threshold it runs on and who decides it: the keyboard, when it
has a behaviour row that runs there (even one with no actions), or QMK, when
it has none or its row is switched off or bypassed there. Any other key with a
behaviour row with no actions says in one line that the keyboard's key engine
handles it. A behaviour switched off or bypassed there says so and why, and
what the key sends instead: its own keycode, or a custom key's shortcut.
A behaviour lists each tap count's actions and how a hold runs, and the
behaviour names the thresholds it runs on in milliseconds, its own or the
keyboard's default; a hold that taps at or after a threshold names
that threshold's time, and one that repeats its rate in Hz. A macro lists its steps — held (↓), let go (↑),
tapped, typed and waited. An action that sends a custom key says it sends that
key's shortcut, never its behaviour. Each combo leads with what it sends and how many keys
it takes, with the keys that press it beneath and the hovered key marked among
them. When a combo sends a key that has a behaviour, and that behaviour runs —
the combo's own output behaviour, the keyboard's behaviours and Combo outputs
use behaviours are all on — its row says so, and the behaviour opens in its own
card beside the key's, tinted in the combo colour the keyboard flashes (grey
when that is off) and naming the combos that run it; up to three such cards
show, with a count of any more. A combo sending a custom key whose behaviour
does not run says what its shortcut sends, or that it sends nothing. A transparent key reads "Transparent →" what answers it and from which
layer, following the layers you
preview.

On the board, drag one key onto another to swap them, ⌘C and ⌘V copy a key
onto the selected key, and Delete or Backspace makes it transparent. ⌘Z undoes
and ⇧⌘Z or ⌘Y redoes the draft outside the macro editor. A focused macro
editor uses its own step history, while a text field keeps its native text undo. Open dialogs keep their keyboard shortcuts; Undo/Redo
there does not move draft history. **Draft history**, with undo and redo
beside it, sits at the foot of the rail once a keyboard or the demo has been
read into a draft; it opens every step of the
draft, newest first, each with when it was made and what it changed from the
step before it (not from the keyboard, as the review compares); go straight
back or forward to any of them. Board keys work from the keyboard too: Space or Enter
selects one, and Enter on the selected key opens its picker.

### Layers

The standard firmware reserves 16 layers, so ordinary editing never changes
the layer count or needs a reflash. **Layers…** lists them with the
highest-priority layer first and Base at the bottom.

A layer tab shows its layer's number after its name, except for a layer named
only by its number ("Layer 8"), so the number is never said twice.
The layers are tabs along the foot of the board card, next to the workbench
rather than in it, since a layer is not a property of the selected key; the
picked one opens into the board
it shows, on Keys and on Lighting alike; **Layers…** stays at the end
of those tabs on both screens, outside what scrolls, and opens upward over the board, so a layer
is renamed and reordered where its keys are on screen. Drag a row by the grip
on its left to move it within the full sixteen-layer stack, or focus the grip
and press ↑ ↓. The bottom row is the
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

When **Make base** swaps a layer with the current base, empty
physical keys entering the base become Nothing (`KC_NO`); Nothing keys leaving it
become transparent. Unused matrix positions keep their values. If the former
base had no layer colour, it receives the saved base HSV as its own all-key
colour, even when an animated base effect is
selected. The review gives Transparent and Nothing base keys separate notices.

**⌘-click** (Ctrl-click off a Mac) more layer tabs to preview them on
together. The board then shows what the keyboard would answer with, by the
firmware's rule: the highest layer on wins, a transparent key is answered by the
highest layer below it that is also on, and Base is always on. Keys answered from
below are seen through the top layer's glass: frosted like a transparent key,
their legend sharp, in the light of the layer that answers, with that key's
behaviour dots and the badges of the combos it fires with these layers on, and
on Lighting the board paints every layer on, lowest first, as the keyboard does.
The highest layer keeps the tab joined to the board and every edit is stored on
it; a key answered from below says so on the Key tab, and setting it overrides
that answer. ⌘-click Base on its own to see the picked layer over just Base;
from Base, ⌘-click a layer to see it over Base.
⌘-click a layer again to take it out, or click any tab to go back to
one layer. Layers on under the top one are tinted and outlined in their own
light, so the set reads from the tabs. The set holds across Keys and Lighting and is dropped
when the keyboard or its layer order changes. It is a what-if: a set no key can
actually hold together still previews.

### The workbench

Under the board, one workbench whose tabs are the key, its behaviour, its combos,
and the macros and trackball modes the layer reaches. A behaviour is tap count ×
tap, hold and long hold, so it is drawn as a grid of actions: a row for every tap count the keyboard allows,
always all of them, and a column each for Tap, Hold and Long hold. Each timing
heads what it governs: **Multi tap window** (release to next press) the tap
counts, the Tap / hold threshold the Hold column and the Long hold threshold
its own; Tap fires on release.
The timing fields over Hold and Long hold read **Tap / hold threshold** and
**Long hold threshold**, and a hold cell's **How it runs** names its own
column's: "tap at Tap / hold threshold" under Hold, "tap at Long hold
threshold" under Long hold. Behaviour and combo
timings matching the default show a muted placeholder such as `150 · default`;
other values look entered, with `ms` inside the field. Clearing an override restores the
default. LT keys show their own dual-role default.
Changing a behaviour timing default moves every row following it, including
explicit values matching the old default; distinct custom timings stay fixed.
Review lists inherited effective-time changes under Tap & hold timing and any
matching overrides converted to defaults under their behaviours. Those stored
changes discard together with the default edit.
Selecting a key opens its grid in Behaviours even before it has a stored row.
Only a grid action, timing override or anchor change adds the row to the draft;
browsing leaves the board and behaviour counts unchanged. Transparent and
Nothing keys cannot have behaviours. In a layer preview, a transparent key opens the
key the board shows through it: the editor names the layer that supplies that
key and says the behaviour belongs to its keycode, so changing it changes that
key wherever it is pressed. Turning layers on or off in the preview updates the
open key, whichever you did first. Empty cells preserve the key's built-in
actions until you override them. An empty cell shows, dashed and marked
"built in", what the key does there on its own. An empty tap sends the key's
own tap once per press, so an empty Double tap sends it twice (`×2`), at every
tap count up to the deepest one the behaviour sets; past that, the presses are
separate shorter gestures and the cell stays empty. On the first press, an
`LT()` holds its layer and an `MT()` or `OSM()` its modifiers. A plain key,
such as `-` or `Ctrl+C`, stays held down until release, unless that first
press sets a Hold or Long hold. A custom key with a shortcut does the same
with its shortcut, and its dashed cells read as that shortcut. Shift, Ctrl,
Alt and Cmd on their own show
nothing built in. An empty Long hold beside a Hold, set or built in, shows
that the Hold carries on, since nothing takes over at the Long hold threshold: one held
until release stays held, one that repeats keeps repeating, one that sends
on release still sends whenever you let go, and one that fired at its
threshold does nothing more. An empty Hold beside a Long hold shows the tap
a release before the Long hold threshold sends, for plain keys, custom keys and macros;
layer and trackball mode keys send no tap once held. **Move to another key…** moves a behaviour to another
key through the key picker; when that key already has one, you choose to
overwrite it, swap the two, or cancel, and either is one undoable draft step.
The keyboard owns its layer keys, so a behaviour takes QMK's layer keys where
the keyboard can run them: `TG()`,
`TO()` and `LOCK_LAYER()` anywhere, `OSL()` as a tap, `TT()` and `MO()` as a
"held until release" hold action; `LT()` and `LM()` stay keys and combos,
and `DF()`/`PDF()` are refused.

In **Keys → Combos**, **Pick on board** brings the board into view so its keys
can be selected as combo inputs.
The **Key** tab count is the number of mapped keys on the selected layer.
The Key tab says what the selected key does; **Where it is stored** unfolds
its stored keycode, matrix row and column, layout index and LED index, and
stays open for every key once opened. **This key on every layer** lists the
position from the highest layer down; three or more transparent layers in a
row fold into one line that says they fall through, and clicking it shows
each of them. Reach tables name the keys that reach a row, as the board
labels them, rather than their layout indexes; a combo's row already names
its inputs, so it says only which layer answers a transparent one.
In **Keys → Behaviours**, reach sections open independently. Matching sections
share their expanded or collapsed state across the Behaviours, Combos, Macros
and Trackball modes tabs. The full list scrolls with the Keys page rather than
inside the rail.
The Behaviours, Combos, Macros and Trackball modes tabs start with **On this
view**: what the board reaches with the selected layer and any layers previewed
under it. **On this layer** stays tied to keys stored on the selected layer;
the tab counts use that layer too. Use ⌘-click on layer tabs to change the
composed view. Combo rows use the keyboard's Combo layer matching reference
when one is configured.
Every Keys workbench tab is at least as tall as Behaviours, so switching tabs
keeps the page at the same scroll position. If an editor grows taller, that
height stays while switching tabs.

The Macros tab and the board's hover card show a macro's steps as small
versions of the Macros editor's tiles, with the same marks and short key names:
↓ press, ↑ release, a dot for a tap and a clock for a wait, with arrows from one
step to the next. Typed text is in quotes and cut short when long. In the
Macros tab, hover a step for its full key name or more of its text.

### The keycode picker

The key picker, **Choose a key**, leads with a board labelled for your computer's keyboard layout
(ANSI for US; see [Your computer](#your-computer)), then task-shaped Symbols,
Navigation, Numpad, Layers, Trackball modes, Macros, Mouse, Media, Lighting,
Key options (QMK's Magic keys) and Custom keys sections. Keys supported by this firmware are available under
More keys, Other QMK and All keycodes, and search spans those entries — named
macros included, found by the name they were given. Layers offers each layer
as Hold (`MO`), Lock (`LOCK_LAYER`, the same lock as QMK's `TG`) and Tap-hold
(`LT`); a keyboard that owns its layer keys adds Tap-toggle (`TT`), One-shot
(`OSL`) and Move to (`TO`). Trackball modes offers each mode as Hold and
Lock. Under each button its keycode shows with **Show keycodes** on.
A modifier key counts as a modifier: choose modifiers alone, or with a
modifier key, and the picker stores the simplest keycode that holds them, which
the footer shows. Command with the Left Command key is just `KC_LEFT_GUI`, and
Left with Right Command, picked any way, is one keycode (`RGUI(KC_LEFT_GUI)`):
one modifier becomes the key and the others wrap it, which works while all
but one sit on one side. A keycode cannot hold two or more modifiers from each
side, or a key such as K with modifiers from both sides. For those, on a key
on the board, a behaviour cell or a combo output, the picker offers a custom
key instead. A custom key that already sends exactly that, and nothing more,
is offered by number and name. On a key or as a combo output, a custom key's
own behaviour runs too, so a match that has a behaviour is offered beside
**Make Custom key N**, and you choose: that key, behaviour and all, or a new
one with the shortcut alone. A behaviour cell sends only a custom key's
shortcut and never chains its behaviour, so there any match is used as it
is. Otherwise **Use Custom key N**
takes the first custom key that does nothing yet (no name, behaviour or
shortcut, on no layer), gives it that shortcut and a name in words, and uses
it. On a key or in a behaviour cell that is one draft change, which Review
shows and one Undo takes back. A combo output is made at once and saved with
the combo.
The retired **User 0–31** keys are hidden from every picker section and search
because they do nothing on current firmware. Choose the named **Custom keys**,
including Right Thumb, Left Thumb and Click Spam, instead. Existing retired
assignments keep their stored names and bytes when read or backed up.
Where no keycode can hold the modifiers picked and no custom key is offered,
such as a trackball mode's direction shortcut, the picker explains it and
disables **Use key**. A symbol's built-in Shift counts as a modifier too.

Macro keycodes are shown as `VIA_MACRO_0` through `VIA_MACRO_127` in the live
editor, including slots whose QMK values have no named constant.

### Custom keys

**Custom keys** lists the 128 custom keys. A custom key is a named shortcut
held as long as you hold the key (a macro plays and finishes), with taps and
holds of its own. Rename one by clicking its editor's title, as on Macros, give
it a shortcut, add or edit its behaviour, place it on a key, and see where it
is used; the key picker offers them in its own Custom keys section, each tip
naming the shortcut it sends. Their names are stored on the keyboard; a
keyboard with none stored reports the names authored in `keymap.c`.

The list works as Macros' does: **+ New custom key** opens the first unused
key, the keys in use (named, sending a shortcut or carrying a behaviour) stay
in view and are counted "5 in use", and the rest fold behind **Show N
unused**. An unnamed key's tile shows the shortcut it sends (⌃⌥Space on macOS,
Ctrl+Alt+Space elsewhere). Search finds a key by name, by "K5" or by its
shortcut. The list scrolls on its own beside the editor, so picking one far
down keeps the editor in view, and keeps its place while you edit. The amber
draft mark by the title says the key differs from the keyboard in your draft.

The editor is one card: the title and K5, **Placed on** with **Place on a
key…**, then **Sends** and **Taps and holds**. What a custom key sends is its
own action, the way an ordinary key's keycode is: one key and any of the eight
modifiers, held while the custom key is held and tapped when it is tapped.
**Sends** shows it as a keycap (its words in the tip); clicking it opens the
keycode picker as on the Keys screen: click the key, from those a shortcut can hold (letters,
digits, symbols, navigation, function keys and mouse buttons 1–8), and the
modifiers in the row above the board. A modifier key on the board is its
button in that row, and a shifted symbol is Shift and its key, so picking
**!** lights Left Shift and picks 1; the keys offered are the Keys screen's,
less those a shortcut cannot send (media, layers and the like). Here left
and right mix freely (Left
Ctrl + Right Alt + K), which a single keycode cannot store, and **Use
shortcut** saves it. Modifiers alone (a held Hyper) and a key alone are both
shortcuts; **Clear** removes it. One sentence under it says whether the
key sends its shortcut, its behaviour, both, or nothing yet ("Does nothing
yet: choose what it sends"). A behaviour on
the key works on top: an empty tap or hold sends the shortcut, as an
ordinary key's empty cells send its keycode. A behaviour step on another key
may send a custom key; it sends that key's shortcut only, never its
behaviour, and Review warns about a step naming a custom key that has no
shortcut. Shortcut changes are draft edits, reviewed beside the name with
Discard, Undo and Redo, and saved by Apply.

**Taps and holds** reads "none" with **Add taps and holds…** until the key has
a behaviour; that button opens the key's behaviour editor, posting nothing
until you set something. With a behaviour, the editor is always open: the
same one as Keys → Behaviours, without a title of its own (the card's title
names the key): timings, the grid of actions and participation, and once
the key has a behaviour, **Move to another key…** and **Remove behaviour**. It works for
a key on no layer yet, so a custom key can get its taps and holds where it is
defined. A key with no behaviour shows the key's defaults, with its shortcut
in the cells the behaviour leaves empty, and the first change adds the
behaviour to the draft. Edits here are the same draft changes as on the Keys
screen, with the same review, undo and redo, and with a cell open, Delete, ⌘C
and ⌘V act on it as they do there. **Move to another key…** to another custom key moves
the screen to that key; to any other key, it opens the behaviour on the Keys
screen, where that key's behaviours are. A key that is placed also offers
**Show on the Keys screen →**, which opens its behaviour there with the board
showing the keys that reach it, on a layer that reaches the key. Picking
another key closes the cell open in this key's behaviour; a cell open on the
Keys screen stays open there.

### Lighting

Lighting owns every light on the keyboard. **All lighting**, at the right of
the topbar, is QMK's RGB Matrix switch: off, every LED stays dark, including
layer colours and all feedback. While it is off, every stage says so with a
**Turn on** button and the board is dark.

The stage tabs are the order the keyboard paints in: **Base effect · Layers ·
Mouse fade · Trackball modes · Combos · Key feedback**, then **LED groups**,
which is not a stage. Each tab's swatch is the colour the stage paints now; a
stage that paints nothing is drawn hollow. The strip fits a 1100 px window.
Each stage opens with its name, what it paints and its own switch, **Show this
stage**: off, the stage paints nothing and keeps its colours.

**Base effect** edits the effect under every other stage. The keyboard keeps
it with its global settings, so each change saves that settings section:
**Effect** (named from the keyboard's own list), the colour, brightness on the
keyboard's own scale ("150 of 200", never the 0–255 scale the keyboard reports
over VIA), **Speed** for an animated effect, **Lights** (All LEDs, Thumb keys
and trackball, Main keys, or both) and **Lights off after**. An animated effect
has no single colour, so the board draws it as a soft glow of its hue and says
"animated" under the board; it never looks off. Settings no longer lists the
base effect or the flash speed; searching Settings for them points to
Lighting.

**Lights off after** uses seconds or minutes: `60000` milliseconds reads as `1`
minute. Choose the unit beside the value; changing units alone does not edit
the draft. Fractions are accepted and rounded to the nearest millisecond. `0`
keeps lighting on, and the maximum is 24 hours (1440 minutes). Review names the
time in seconds or minutes, or **Always on** for zero.

The board on Lighting shows legends and light only: behaviour dots appear on
Key feedback and combo badges on Combos, where they are the subject. Hovering a
key says what paints its LED now (the base effect, a layer's colour, a key with
its own colour, a previewed trackball mode) and when that light is seen through
from a lower layer.

On **Layers** and **Trackball modes**, the 240 px list beside the editor
scrolls on its own, keeps its place when you pick a row, and shows the picked
row when you switch back to it. Each row is one line: the swatch, the name, and
where the colour paints when that is not the usual case (**every key**, **no
colour**, **black**). A layer's **Lights** is **Keys that do something**
(transparent and Nothing keys leave the layers below showing) or **Every key**.
Holding a layer key previews its colours first; this follows Show this stage on
Layers.

**Keys with their own colour** lists this layer's rows and the rows for **All
layers** (marked). Click keys on the board to pick them ("3 keys · Colour them
on Symbol…"), then **+ Colour picked keys** makes a row for them on the layer
shown and opens it. **Edit** opens a row's colour and **Use the picked keys**
replaces its keys; drag a row by its grip (or press ↑ ↓ on the grip) to
reorder, since a later row wins on the keys it shares.

The colour editor has a 240 × 150 saturation and brightness field, a hue strip,
the numbers the keyboard stores (Hue 0–255, Saturation 0–255, Brightness of
200) and presets **In use on this keyboard**, each naming who uses it.
Lowering brightness to zero keeps the hue and saturation and paints black.

Black is black. On a layer, the button is **No colour (lower layers show)** and
stores HSV(0, 0, 0), which the keyboard skips. On the other stages (a trackball
mode, Combos, Key feedback and the mouse fade's end colour) the same value
paints the LEDs dark while the stage shows, so the button is **Black**, the
editor says what goes dark ("While Dragscroll runs, the right half goes dark"),
the list says **black** and the board paints black. To show nothing, turn the
stage off. A row in Keys with their own colour or LED groups stored as HSV(0,
0, 0) takes its stage's colour instead.

**Show it running on the board** on Trackball modes previews the mode as the
keyboard paints it. **The half holding the trigger key** and **Only the
trigger key** start from the mode's first placed key (on the layer shown, else
the lowest layer that places it); with no key placed, the keyboard paints
everywhere, and the board says so. The mouse fade starts from the mouse
layer's colour and replaces the layer colours while it runs; the board shows
the layers, not the fade.

**Key feedback** lists its colours in the order a gesture shows them:
**Waiting on 2×**…**5×** (while more taps may follow), **Holding** (pending or
active), **Long hold** and **Multi-tap sent**. The switch **Flash after a double
tap or more** decides whether a sent multi-tap flashes, since a single tap never
does; **Flash speed** is how long each on or off phase lasts. **Combos** paint
while a combo's keys are held, but not while the combo holds a layer: that
layer's colour shows instead.

**LED groups** are saved sets of LEDs, named by what they hold ("Thumbs, both
halves + trackball"), with **Used by** in words. Hovering a group or a row
outlines its keys on the board. Pick LEDs on the board, choose the stage and
whom the row is for, then **Add**.

## Naming the keyboard

The **Keyboard** screen's title is the keyboard's name: click it to give the
keyboard a name of your own, Enter to finish, Escape to put it back. It is
what Chrome's keyboard chooser, your computer's list of devices and Ark's
keyboard menu call it, and while you edit it the screen says the keyboard
reconnects for a moment after Apply to take it. Leave it empty for the
firmware's built-in name (Charybdis (4x6) Splinky), which the title shows
greyed when the keyboard reports it. A name is up to 32 bytes of UTF-8,
counted as you type; accented letters take two. A Settings search for "name"
points to Keyboard.

The name is stored in the keyboard's profile, so it is a draft edit like any
other: Review lists it as **Keyboard name**, Undo and Discard take it back,
and backups carry it. Ark calls the keyboard by its new name as soon as the
Apply is read back; the computer and Chrome see it once the keyboard has
reconnected ([below](#applying-changes)). The serial number does not change,
so Chrome keeps its permission to open the keyboard.

Under the title, **This keyboard** names the product, the firmware's version
with "works with this Ark ✓" (or that both halves need updating, with a link
to the firmware release), Ark's own version, and the two halves: the right
half, with the USB cable and the trackball, is the master; the left half is
the slave. When the keyboard needs a restart it says so here with the steps.
**Memory** shows how full the profile is ([below](#profiles-and-backups)), and
**Diagnostics**, folded, holds the saved profile's generation and digest, the
read phase, what was read and **Read from keyboard**. While a half is missing
or the halves disagree, every screen shows a strip under its title saying so,
with **Keyboard →**.

## Choosing where behaviours and combos run

Definitions and participation are separate. Switching something off keeps
its actions, inputs, outputs, timing and names, ready to enable again.

| Scope | Where to change it | What it controls |
| --- | --- | --- |
| Whole keyboard | Settings → Behaviours or Combos | **Enabled**, the master switch for that engine |
| Source layer | The same Settings section | **On these layers**: one switch per layer, in a grid, for whether keys from that layer use behaviours or join combos |
| Definition | Keys → Behaviours, a custom key's **What it does** on Custom keys, or the combo editor | **Use this behaviour** or **Use this combo**, and **Layers it runs on** for that shared definition |
| Physical placement | Pick a key in Keys | **Use behaviour** and **Join combos** for that source layer and position |

All applicable switches must allow an event. The layer that supplies the
non-transparent keycode owns its policy: a transparent overlay inherits the
lower source layer's controls. The key inspector explains an inherited
placement and offers **Open source placement**, and names each switch keeping
the behaviour or combos off there, in the words its control uses ("Settings has
behaviours off on this layer", "Use this behaviour is off").

For a plain gaming key, disable **Use behaviour** on that placement to emit
its underlying keycode directly; disabling **Join combos** independently stops
that placement entering a combo. A custom key bypassed this way sends its
shortcut, or nothing if it has none; the key inspector says which. A combo still needs every physical
input to be eligible. A gesture already in progress completes under the
policy captured when it started.

A combo output uses the source layer of its last declared input, regardless
of which input you press last. Its behaviour follows the behaviour master,
**Combo outputs use behaviours** in Settings → Combos, **Use output behaviour**
in that combo's editor, and the behaviour's **Use this behaviour** and **Layers it runs on**; physical placement
controls and source-layer behaviour switches do not apply to that generated
output. Another input's allowance cannot enable it.

The two output switches default on. Turning either off keeps the combo active
and sends its normal action; a custom key sends its shortcut, or nothing if it
has none; the combo editor says which for its output. These switches keep
inputs, outputs, timing and layer permissions intact.

The profile holds up to 128 shared behaviour definitions and 128 combos with
up to 16 inputs each. Firmware normally provides five tap steps per behaviour
(640 steps total); Ark uses the connected keyboard's advertised tap depth and
matching tap-feedback colours when firmware is configured for more. Layer, macro,
custom-key, trackball mode and keyboard names allow up to 32 UTF-8 bytes; accented letters
can use more than one byte. All edits go through the draft, Review, Undo and
Apply, including switches and layer allowances.

## Trackball

**Trackball** is one screen for everything the ball does. Its list starts with
three fixed entries, then the modes, then the empty slots folded into chips.

- **Pointer**: the ball speed (DPI) for ordinary movement. It lists the modes
  kept at Normal speed, which follow it. The DPI keys on the keyboard change it
  too; Ark shows the speed the keyboard reports.
- **Sniping (precision speed)**: a slower speed for precise work, on while a
  sniping key is held (`SNIPING`) or toggled (`SNP_TOG`), and while the
  auto-sniping layer is on. It shows where each sniping key is placed, with
  **Place on a key…**. Sniping also slows directional modes; scrolling ignores
  it.
- **Mouse layer**: the layer moving the ball turns on, and its timeout. It
  turns off as soon as you type a key that is not a mouse key, and stays off
  while the auto-sniping layer is on. **Fine-tuning** holds the movement
  debounce, the delay after typing and the threshold, in sensor counts with
  their distance at the pointer speed. While the mouse layer is off, the fields
  that depend on it say so. **Edit the fade in Lighting →** opens its fade.

Each fixed entry is Settings' rows, and a change saves its whole section, as
Settings does.

Current firmware has 32 trackball mode slots. Each mode's card says what it
sends ("↑ Volume Up ↓ Volume Down") and where it is reached: its keys on
layers, and the behaviours and combos that run it. **+ New mode** opens the
first empty slot. The key picker lists the slots in two columns; Lighting's
slot list scrolls beside the colour editor. Each slot keeps its own Hold and
Lock key (`PD_SLOT_n`, `PD_SLOT_n_LOCK`) and lighting row. An empty slot takes
no room in the profile, so 32 slots cost only what you configure.

A mode's editor reads in the order you set one up:

1. **Name** and **Movement** (directional keys and shortcuts, or scrolling).
2. **Step distance**: how far the ball turns for each step, in millimetres,
   with the counts the keyboard stores beside it ("2.5 mm · 40 counts at 400
   DPI"). Either can be edited. A step is counts at a DPI, so the millimetres
   hold at the speed shown; while sniping is on, a directional mode's step is
   longer, and the line says by how much. A scrolling mode shows its distance
   per wheel step the same way.
3. **Sensitivity**: the mode's DPI, from 100 up to the sensor's 12000, or
   **Normal (400 DPI)** to follow the pointer.
4. What each direction sends, as the computer's keys. **When a direction is
   empty** appears only while one is, and **Send both neighbours** only in
   eight directions. A scrolling mode instead says which way it scrolls, which
   of those axes are reversed, and the modifiers it holds.
5. **While this mode runs**: keep the mouse layer on, so its buttons stay
   under your fingers, or go back to the typing layer, so keys type as usual.
   The keyboard decides this when the mode starts and keeps it until it ends.
6. **Where it is reached**, with **Place on a key…**, and its **Light** with
   **Edit in Lighting →**.
7. **Advanced**: held modifiers per direction; every scroll field with what it
   does and what it accepts; and the button overrides, **1 · left click**,
   **2 · right click** and **3 · middle click**: pass through, **Block the
   click**, tap a shortcut (with its own held-modifier choice: Inherit, Ignore
   the chosen ones, or Exact) or hold modifiers.

A value the keyboard would refuse is not added to the draft: the field says
which rule it breaks — thresholds, divisors and the lock timeout above 0,
gesture expiry at least the lock timeout, ratios at least 1:1, retention at
most selection, decay at least 2 — and keeps what you typed.

**Duplicate** copies a mode into the first empty slot with its colour, named
"<name> copy". A new or switched-to scrolling mode starts from this keyboard's
Dragscroll: its speed, direction and tuning.

An empty slot starts from a template — **Volume**, **Brightness**, **Zoom**,
**Scroll**, **Arrows** and **Undo / Redo** as the firmware ships them, and
**Back / Forward** (mouse buttons 4 and 5) and **Tabs** (Ctrl Shift Tab /
Ctrl Tab) — each one ordinary edit in the draft. **Start empty…** keeps a
blank directional or scrolling mode, and **Copy from** another mode.

### Cleared trackball modes

A key bound to a **cleared trackball mode slot** is allowed. The keyboard keeps its
mode keycodes in a fixed registry and its runtime refuses to activate a slot
with an empty record, so such a key is inert, not invalid — it does nothing
until the slot is configured again. The clear goes through even while something
still reaches the slot, the validated profile counts what
still points at the empty slot, and the Trackball screen and the hover card
say the key does nothing for now.

The same reasoning runs the other way, so the keycode picker offers **every**
slot, configured or not: its Trackball modes section lists every slot as a
row, tagged P0…P31, each with a Hold and a Lock key, and marks an empty slot's row as doing
nothing yet. Search finds the same keys as `Mode 6 · hold (empty)`. A board can be laid out before its modes are, and the key says `empty`
on its second line until the slot is filled in.

### Trackball mode clicks

A straight direction, diagonal or physical-button tap override can send a
plain **Mouse Button 1–8**, including buttons 3 and 4.
Choose it from the direction's button, or, with **Show keycodes** on, enter
its QMK name, such as `MS_BTN3`. The pointing picker
offers only outputs that field accepts: keyboard keys and shortcuts, media
and system keys, and supported mouse buttons. Pointer movement, wheel,
acceleration, layer controls and mode controls are refused. Supported macros
are offered too ([below](#trackball-mode-macros)). Mouse
buttons and media/system keys must be plain keycodes; modifier wrappers such
as `C(MS_BTN3)` are refused.

A click is one press and release. It counts as one output for **How often it
sends**, the per-report limit and empty-direction handling. It uses the same
held-modifier policies as a keyboard tap: **Inherit** keeps held modifiers,
**Ignore** leaves out the selected modifiers, and **Exact** sends without held
modifiers. It does not run the clicked button's behaviour or this mode's button
overrides, so an override may click its own number. If another source already
holds that button, the click adds no new press edge and leaves it held. The
computer decides what a button number means; buttons 3 and 4 do not necessarily
mean Back and Forward.

### Trackball mode macros

A direction's button **→ Macros** offers all 128 VIA slots
by their names for a direction, diagonal or button tap override. The output
shows the name beside its stored keycode. An empty macro is allowed and marked
**does nothing yet**; add its steps on Macros. It sends nothing and leaves a
Once per movement gesture available.

Macro outputs always **Inherit** held modifiers. Playback continues across
scans, so Ignore and Exact cannot cover it; the macro's own input protection
still applies. A mouse click inside a macro bypasses this mode's button
overrides and reaches the host as the macro normally would.

The keyboard runs one macro at a time. Triggers while it is busy are dropped,
never queued. **Every step** is allowed; its macro output carries a tip pointing
to **Once per movement**, usually a better fit for a longer sequence.

## Your computer

**Settings → Your computer** stores **Operating system** (Auto, macOS, Windows or Linux), the
**Keyboard layout** your computer types with, and on Windows and Linux a
**Unicode playback** switch. Auto uses the keyboard’s USB OS guess,
not the OS running Ark. The section shows the detected and effective OS from
the last Read keyboard, including while edits are pending. Reading refreshes
Auto names and Unicode setup without changing those edits or their history.
Detection may be unknown or incorrect, especially
through switches/KVMs; choose a manual override when needed. If Auto is unknown,
Unicode text will not play until detection succeeds or an override is selected.
Neither OS detection nor selection checks the computer’s input configuration.

**Keyboard layout** lists the layouts for the effective OS, plus US (all of them
when the OS is unknown): ABC, Dutch, Unicode Hex Input, British, German and
French on macOS; US International, United Kingdom, German and French on Windows
and on Linux. Macro text is typed through it, so pick the layout that is active
on the computer; the keyboard cannot check. US is the default. Choosing a **Operating system** brings the layout along: it stays if
it belongs to that OS (US belongs to all of them), and otherwise becomes that
OS's layout of the same language (German, French, British or United Kingdom),
or US. It is one change, so one undo restores both. Auto cannot do this for
you: when the keyboard is detected on another OS than its layout's, for example
plugged into another computer, the layout stays, and Your computer and the macro editor
warn that macros may type the wrong characters until it matches. On macOS, **ISO keyboard on macOS** matters if macOS set this
keyboard up as ISO (its Keyboard Setup Assistant asks): macOS then swaps the key
left of 1 with the one left of Z, and macros must swap them too. On macOS there
is no Unicode switch: choose the **Unicode Hex Input** layout for emoji and
other characters your layout cannot type.

While Unicode Hex Input is active on your Mac, Option symbols and shortcuts
may stop working, including Option+Left/Right for word navigation. This affects
ordinary typing, behaviours and macro key steps as well. Your computer shows a warning
when its macOS setup uses Unicode entry. Ark does not switch the Mac's input
source: switch back to your usual source for those keys, and match Ark's layout
before playing macros. Merely selecting a layout in Ark does not change how
macOS handles your keys.

Keys are labelled as the layout prints them, on the layout screen, in the
picker's Keyboard tab and in Review: with German, the key QMK stores as `KC_Y`
reads `Z` and `KC_SCLN` reads `Ö`, and searching the picker for `ö` finds it.
Letters show their capital, as on a keycap; a dead key shows its accent and ◌.
The picker board shows Shift above and Option/AltGr on the right, with
Shift+Option/AltGr at the top right. The ISO option swaps the affected labels
on macOS just as it swaps macro playback. Shifted symbols and shortcuts follow
the layout too. The QMK name stays in each key's details and still finds it in
search. Only the
labels change: the keys stored on the keyboard stay the same, so changing the
layout never moves a key. US shows the familiar ANSI labels.

The effective OS names modifier keys consistently in the layout, picker, macros,
pointing controls and Review: Option/Command on macOS, Alt/Windows on Windows,
Alt/Super on Linux. Shortcuts, mod-taps, layer-mod keys, Key options actions and
macro command previews follow the same rule. Display
names refresh in open editors when Your computer changes; stored keycodes
and key assignments do not. Auto with an unknown OS uses Alt/GUI names. Both of these settings
travel through Review, undo/redo, readback and backups.

When the effective OS is Windows and **Unicode playback** is on, the Your computer section
section shows **WinCompose on GitHub** with the GitHub icon. The link opens the
helper's project in your browser; install and run it with Right Alt as Compose.
Auto uses the detected OS for this link too. It disappears when Unicode playback
is off or the effective OS changes.

Changing Your computer rechecks every stored macro against the new typing setup. Review
lists affected text macros with their old and new entry method and playback
status, including a macro that becomes ready or needs a fix. These effects
discard together with that change; separately edited macro text and names
stay in the draft. Text and key steps are preserved: text uses the new layout's
keys automatically, while explicit key steps still send the keys you chose.

## Text macros

The Macros list starts with **+ New macro**, which opens the first free slot,
then a search, the slots in use and **Show N empty**, which folds the rest. A
macro that is a single shortcut is usually simpler as a custom key, which the
screen's subtitle says and the editor offers with a link to Custom keys: a
custom key holds its shortcut as long as you hold the key and uses no macro
memory.

An empty macro starts with no steps. Choose **Text**, **Key / chord**, **Delay**,
**Press** or **Release** above the sequence, or start **Record** below it.
Key actions open their picker immediately; cancelling leaves the sequence
unchanged. Text opens and focuses its text box, and Delay opens its millisecond
field. Adding another first action replaces a sole empty Text step, so there
is no placeholder to remove; written text, including whitespace, stays intact.
Type or paste exactly what you want Text
to type: braces, code, whitespace and line breaks are literal. Accents, curly
quotes, symbols, emoji and combining sequences are preserved too. Typing `{KC_A}` in Text types those six characters.

Use those same actions for another Text block, a key or chord, a delay, a press and
hold, or a release. Click the macro's title to rename it directly; Enter finishes
the edit and Escape cancels it. The byte count appears while editing the title.
The sequence plays left to right, continuing on the next
row. Individual keys and delays use one fixed tile size; chords and text use
a wider size with the same height. A down arrow means press, an up arrow means
release, and a dot means tap. Delays show their milliseconds inline. Long labels
and text stay within the tile; hover shows the full value. Short modifier names
keep their side and follow Your computer, such as L Cmd on macOS and L Win on Windows.
Click a tile to open its editor underneath, including the full Text box or key
picker. Drag any tile anywhere in the sequence to reorder: the beginning,
row gaps and the space after the last tile accept drops too, with an insertion
marker. Or use **Earlier** / **Later**
and **Remove** in its editor. Delete or Backspace removes the focused tile (or the selected
step while a button in its editor has focus), then focuses the next tile or the
previous one at the end, accounting for every removed step in a group. In text
and number fields these keys edit the value as usual.
Each slot has its own keyboard undo/redo for step edits:
additions, deletion, reordering, changed keys, text/delays, raw edits, Clear and
finished recordings. With focus in the macro editor, ⌘/Ctrl+Z undoes steps;
⇧⌘/Ctrl+Z or ⌘/Ctrl+Y redoes them. An empty step history does not undo another
part of the draft. Text fields retain native typing undo and text copy/paste;
focus the sequence to undo or redo whole step edits. Continuous field edits form one history item
until you leave the field. Renaming and playback protection use the draft as usual.

Click to select one tile, Shift-click a range, or ⌘/Ctrl-click to add/remove a
selection. ⌘/Ctrl+A selects all steps. ⌘/Ctrl+C copies the selection
in sequence order; ⌘/Ctrl+V inserts new steps after the last selected
step, or at the end without a selection. The step clipboard works between macro
slots in this Ark window. Delete/Backspace removes the selected group when a
selected tile has focus. Pasting and group deletion each take one undo item.
History survives accepted edits, rerenders and slot switches; replacing the
draft through draft Undo/Redo, import, Apply or changing keyboard starts fresh.

The editor follows a moved step. A release before
that key's press, a repeated press of a held key, or an unfinished hold marks the
affected tiles and stays local for correction; it never replaces the valid draft.
Under the title (click to rename) and its M5 tag, **Placed on** lists the
layers that set the macro off, with **Place on a key…** beside them, and
**Uninterruptible playback** follows with its consequence. The amber draft
mark by the title says the macro differs from the keyboard in your draft.
The add-step row comes next, with validation errors under the sequence;
**Typing & playback help** opens the longer explanation.
Your computer in Settings and that help sit at the bottom, below the recorder.
**Clear macro** is a text button at the right of the title, last; **Discard
this edit** joins it only while an edit is still local (typed but not yet in
your draft). **Raw payload** is a pressed toggle at the right of the add-step
row and reveals its editor above the sequence. All recorder options remain
visible below. The slots sit three across in a bank that scrolls independently
of the editor and keeps its position when selecting a slot, editing or recording.

A chord stays one step: Ark stores it as the firmware does (the keys pressed
in order, the last one tapped, the rest released in reverse) and reads that
back, and Ark's older all-pressed-then-all-released form, as one chord, so a
chord authored in the firmware's `keymap.c` shows as one tile too.
Key pickers offer only the basic keys macros can send;
a chord takes up to 16 distinct keys, and a press or release takes one.
**Record** is an ordinary outlined button; while recording it turns red,
reads **Recording · Stop (Esc)**, and a listening tile ends the sequence where
the next key lands. Record appends key steps; **Undo recording** restores what
was there before recording. **Discard this edit** cancels an active take and
returns to the draft macro without keeping the recorded keys.
The recorder takes every key a macro can send, Delete, Home, End, Page Up and
Down, Insert, Caps Lock, the numpad, the ISO key beside Shift, Print Screen,
Menu, F13–F24 and the volume keys included, and keeps them from acting on the
page while recording. A key a macro cannot send is named under the recorder as
not recorded rather than passing as a pause. Shortcuts your computer keeps for
itself (⌘Tab, ⌘Space, screenshots) never reach Ark; add them with **+ Key /
chord**.
During recording, step Undo/Redo/Copy/Paste and selection shortcuts are suspended.
Their chords are captured as ordinary macro keys.
Recording groups keys pressed together into one editable
chord. For example, holding Command, pressing A and releasing both records
Command+A, rather than a Command tap followed by an A tap. A modifier held
across several shortcuts joins each chord. Overlaps in which a new key arrives
after another key has already been released keep their press/release sequence,
so Ark does not turn keys that were never all held together into a chord.
For a macro that needs keys held for a particular time, turn on **Preserve
hold timing** beside the other recorder settings. It keeps each press and
release separately, preserving how long keys are held. A shortcut then appears
as press/release steps rather than one chord step. This option is off by default
and cannot change during a take.

**Record delays** keeps pauses above **After**, rounded to **Round to**, both
in milliseconds. Normal recording keeps pauses between completed taps/chords.
**Preserve hold timing** keeps Record delays on and records gaps between
individual events, including holds, with that same threshold and rounding.
Turning it off restores your previous delay choice. Neither records the wait
before the first key. Long pauses use several delay steps if needed.

Recording belongs to the selected slot while its recorder is open. **Stop**,
Escape, switching slots, leaving Macros, opening a dialog, or clicking outside
the recorder finishes the take in that original slot. Recorder options and
ordinary redraws keep it running. With **Preserve hold timing** on,
finishing also releases any keys captured as still held, preserving their hold
duration up to the moment the take ends. Otherwise, it finishes
the pending tap or chord. Incomplete or invalid
takes remain local for correction and are not kept in the draft.

**Uninterruptible playback** is saved per macro.
**Automatic** turns it on when the selected layout needs Unicode entry for any
text in the macro. For example, Dutch types `é` natively, so it stays off;
Unicode Hex Input needs Unicode entry for `é`, so it turns on. **On** protects
the whole macro, including delays, and **Off** allows ordinary input throughout.
Changing the layout rechecks Automatic and lists its effect in Review.

Protection ignores new keypresses from this keyboard until playback and cleanup
finish; it does not queue or replay them. Their releases are ignored too, even
after playback ends, while releases of keys held before playback still work.
Playback starts immediately and suspends ordinary keys already held. Only the macro's keyboard output reaches
the computer during playback, including its own modifiers. Physical releases
keep updating internal state; modifiers still held resume after cleanup.
Ordinary keys remaining held do not resume automatically: release and press them
again. This avoids an unwanted fresh character when playback ends. Another macro
can still type the same key. Pointing, consumer/media actions and input from another keyboard remain outside
this keyboard-output protection. Reset and error cleanup still release the macro's keys. The option
does not change macOS Unicode Hex Input's effect on Option shortcuts.

Text edits and renames preserve the choice. Review, undo/redo, discard, exports
and imports carry it with the macro.

Shared macro memory is one line under the slot bank, "408 of 34,903 bytes",
with its bar. Every empty slot keeps room there for ten key taps (Ark's
reserve, not a keyboard rule); when it cannot, the highest empty slots read
**unavailable** and cannot be picked until a macro is shortened or cleared.
That sentence shows only when a slot is out of room or memory is more than 80%
used. The bank's heading counts the slots in use, "18 in use", as Custom keys
counts its keys. The editor shows "Checking this edit…" or an error only while
an edit is still local, without routine memory or staging notes. Valid edits enter the draft when you finish editing a field or change a key step. Incomplete,
invalid or oversized edits stay visible locally with their reason and never
replace the last valid draft. **Discard this edit** returns to the draft's
current macro; use step Undo while editing the macro, or draft Undo from the rail
to reverse a draft change. Text boxes
keep long content inside their step editor, with scrolling and preserved line breaks.

**Raw payload** offers the existing command syntax: `{KC_A}` taps a
key, `{+KC_A}` presses it, `{-KC_A}` releases it, and `{120}` waits 120 ms.
Literal braces there must be doubled as `{{` and `}}`; Text escapes them for you.
Valid raw edits read back as editable steps. A raw edit that cannot be completely
parsed disables step editing until corrected or discarded, preserving its whole
input. Both views describe the same macro and are checked against the same free memory.

Text is typed through the **Keyboard layout** in **Settings → Your computer**, with the
keys that layout uses: on German, `z` is the key QMK calls `KC_Y`; on macOS
Dutch, `é` is Option+E then E and `€` is Option+2. Every layout types all of
ASCII. A character the layout cannot type, such as an emoji, needs Unicode
entry: on macOS, the Unicode Hex Input layout, enabled and active as the input
source; on Windows, Unicode playback with WinCompose running and Right Alt as
Compose; on Linux, Unicode playback with an input method or application that
accepts Ctrl+Shift+U entry (support varies by application). Ark cannot check
the active input source or installed helper. The macro editor says which
character the layout cannot type and refuses to save it until Unicode entry is
set up. A macro may hold an ordinary key across text the layout types, but not
across text that needs Unicode entry; holding a modifier is fine. Unicode
edits require a known effective OS.

A layout change can make a stored macro unplayable, for example when an
ordinary key is held across `é` and the new layout needs Unicode entry for it.
The slot keeps its name with a red mark and the reason in its tip, the editor
says "This stored macro cannot play" with the reason and a link to **Your
computer in Settings**, and Review warns before Apply. Release that key before
the text, or choose a layout that can type the character; characters with no
native route need Unicode setup. Ark cannot repair those sequences without
changing what you authored.

Bank usage counts UTF-8 bytes. The keyboard plays a stored macro in windows,
so one macro can use all the free memory. Valid supplementary characters and joined emoji count
by their scalar sequence, not their apparent glyph count. Unpaired UTF-16
surrogates, malformed UTF-8 and unsupported control characters are rejected.
Avoid concurrent typing and release ordinary keys before playback. Cancellation
can leave text already typed; macOS may commit a partial hex entry. Actual text
insertion on each host requires physical keyboard acceptance.

## Review and the draft

Every edit is kept in a local draft and reaches the keyboard only through
review and apply. Complete edits stage into the draft as they are made;
incomplete builders such as a new combo keep their local form until it is
valid. Review lists each changed thing once, under the area it is
edited in, with the fields that changed, can open it where it is edited, and
can discard part of the draft. Stored names are compared even when clearing
one leaves the same default label; Review explains the stored name and its
fallback separately. A disabled trackball mode slot's retained name is reviewed too.
In Review and Draft history, combo badges have
space before their names, and tap-count badges and tap and hold dots occupy separate
aligned positions. A macro's steps read as the editor's tiles (text, keys,
chords and delays), with the stored payload in the value's tooltip. Things made by the same edit (a key swap, a
moved behaviour) go back together, as one undoable step. Layers are compared
by which layer they are, not where they sit, so a reorder is one **Layer
priority** item and a key edited or a layer renamed after it is its own item;
each can be discarded without the other. A keyboard the app cannot open a draft for — its
complete profile could not be read — is read-only: the host refuses any edit
rather than writing it directly.

Removing one combo appears as one deletion in Review and Draft history; later
combo numbers shift because the keyboard stores them in a packed table. That is
why Review names a combo by its keys and what it sends ("Space + Delete → Hold
Number"), with its C-number as a quiet mark beside the name.

The draft bar and the review's title count the draft's changes. They add
how many were added, changed and removed only when that says more than the
count: "3 changes" alone when all three changed something, "3 changes · 2
added · 1 changed" when they differ.

Before anything is applied, the review **checks** what the layers let you
reach: whether you can reach your layers and combos and get back to Base after
locking layers. A layer that can lock with no way back to Base — nothing on it,
or on anything held over it, releases the lock or moves back — is a **trap**:
the review shows the steps into it and a suggested repair. Independent
controls are checked together; the first four smallest trapping combinations
have paths, including a necessary hold release, and if more minimal
combinations exist, their number is shown. Safe layers added beside the same
trap do not create more warnings. Combos are checked against keys that occur
together on a reachable stack, including keys inherited through transparent
positions. Active traps have red cards; warnings have orange cards. Apply asks
"Apply anyway" before writing whenever the draft has a trap or warning,
including one already on the keyboard.

For unusually complex interactions, Review can ask you to check specific
layers together and requires confirmation before Apply. **Show** opens one of
those layers. Check whether their keys cover each other's exits, or keep a
TO(0) escape accessible through every overlay. If Ark checked reachability but
could not establish every escape, the warning says so; the completed checks
still appear.

Other checks cover a layer with keys nothing reaches, a layer key onto an empty
layer, Transparent and Nothing keys on Base, a pointer layer that cannot work,
and layer keys the keyboard leaves to QMK. They also name combos that cannot
fire, actions aimed at empty trackball mode slots, and macros your computer setup
cannot play.
Brightness or lighting effects unsupported by the destination are blockers:
Apply stays disabled until they are fixed. Notices and checks fixed by the draft need no
confirmation. Each check says whether the draft made it, the keyboard already
has it, or the draft fixes it. When a new warning or trap has a clear source in
the draft, the check links to that change and the change is highlighted. If
several edits could be responsible, the review leaves the source unlabeled.

### Timing checks

The keyboard times gestures from the physical presses, and owns the tapping of
authored LT(), MT() and OSM() rows, so combo buffering does not delay them.
Timing checks resolve inherited defaults, warn about overlapping or impossible
release holds, and exclude proven-impossible layer routes. Narrow gesture/chord
windows receive advice; this is conservative analysis, not a guarantee that
every gesture is physically practical.

## Applying changes

Ark calls the half connected over USB the **master half**, and its partner the
**slave half**. These names describe their connection roles, whichever side
holds each role. Keyboard explains the names; Apply progress, failures and
recovery notices use them consistently.

**Review and apply** saves the previous profile, then commits the complete profile
to both halves as one recovery-first logical transaction and verifies the
readback. It asks for confirmation when the review has a warning or trap, and
stays disabled until save blockers are resolved
([above](#review-and-the-draft)).
Apply sends changed profile data and lets the keyboard copy unchanged data into
the new profile. It still checks the complete result and saves both halves
together, including the first save from firmware defaults.

After Apply completes, the editor stays visible while the app reads keys,
profile domains, combos and base lighting back from the keyboard. The bottom
bar names each read and shows its progress; editing resumes when it finishes.
You can stay on any screen during this readback, including Macros; the progress
counter updates without rebuilding the visible editor. An initial keyboard read
updates its loading message in the same way. Saved profile bytes are always
read back and checked after Apply. Only that readback is shown as following an Apply. A later read, export or
discard names what it reads and says nothing about saving, because it writes
nothing to the keyboard.

The Review's note says what Apply does, in order: it first saves a copy of
what the keyboard has now; you let go of your keys when asked; typing pauses
for a moment while the new setup switches on; cut off before then, the
keyboard keeps its old setup, and after that it finishes the new one by
itself. Its footer names where the draft goes ("To Charybdis - Home · both
halves connected", the saved profile's digest under the pointer). Apply asks
for confirmation only for warnings and traps this draft brings; ones already
on the keyboard stay listed but are not asked about again.

While it runs, the draft bar shows three steps: **Save a copy**, **Write both
halves** and **Switch over**, the running one with what it is doing and how
many bytes are through. **Details** lists the keyboard's own ten: check the
keyboard, save a previous profile, send the profile, let the keyboard check
it, stage keys and macros on the slave half, copy the profile to that half,
save on the master half, finish the slave half, write the master's keys and
macros, then check both halves. While the keyboard waits for a quiet keyboard
the bar's headline is **Let go of every key to finish**, counting down the 60
seconds it waits.

Saved, the bar says **✓ Saved to both halves** until you dismiss it or edit
again, with **Put back what it had**: that makes what the keyboard held before
this Apply your draft, to review and apply like any edit (Undo takes it back).
A failed Apply stays until dismissed and says one of three things about what
was saved: nothing was saved (the keyboard kept its profile); the keyboard had
decided to save and finishes by itself, which Ark reads again after 15
seconds; or Ark can't tell, so read the keyboard. It names the step that
stopped and the keyboard's reason. The later editor readback is separate from
those transaction steps.

When the keyboard changes under a draft (a key on it, or VIA, changed a
setting), the bar names what changed and offers **Update draft**, which
compares your draft with the keyboard as it is now and keeps your changes.

What to expect while it applies:

- You can stay on any screen, including Macros. The save bar updates while
  the editor stays visible and disabled; changing screens is optional.
- Apply waits for held keys, locked layers and pointer modes to clear before
  the commit decision, and says so; after 60 s the save is cancelled and
  nothing changes. Anything that fails before the decision leaves the saved
  profile unchanged. A save the app abandoned before the decision is cancelled
  by the keyboard within about 15 seconds, and the next save can start once
  both halves are connected.
- It then holds key input for the few moments while the master half's keys and
  macros are rewritten and the new profile activates. If the app is closed in
  that window, the keyboard finishes the save on its own from the slave half's
  copy within about 15 seconds. Most failures after the decision end the same
  way: Ark says the keyboard finishes by itself, and you read it again once
  both halves have been connected for about 15 seconds.
- Rarely, the halves stop agreeing on the saved profile after the decision:
  the slave half reports a newer one, or another save ran at the same time.
  The keyboard cannot finish that save by itself, and waiting does nothing.
  If it had already started holding key input, the master half types nothing
  until it restarts. Ark says so and asks you to unplug the USB cable (not the
  cable between the halves), wait a few seconds, plug it back in and read the
  keyboard again; the recovery file stays the fallback. When Ark can tell that
  key input was never held, it says the master half keeps typing the old
  profile until then; when it cannot tell, it says the master half may type
  nothing.
- If the cable between the halves comes out after the decision, the master half
  keeps typing the old profile until the rewrite starts, and the save resumes
  when the cable goes back in. If it comes out during the rewrite, the master
  half finishes and switches to the new profile, and the app says the slave
  half is not connected.
- After power loss in the middle of a save, the master half types nothing until
  its keys and macros are one complete version again, which may need the slave
  half connected.
- After an Apply that changes the keyboard's name, the master half restarts its
  USB connection by itself once it is safe: both halves hold the new profile,
  no key is held, no macro runs and Ark has been quiet for a second. The
  keyboard is gone for well under a second and comes back under the new name.
  Ark expects this: it says it is reconnecting rather than reporting an error,
  then connects the same keyboard again, reads it and says it is back. With
  another keyboard it cannot tell apart, it leaves the choice to you in the
  keyboard menu. In Chrome, clearing the name can also need that choice,
  because Ark may not know the built-in name. Held keys or macros can delay
  the restart for as long as they need; the 10-second return timeout starts
  only when the keyboard disconnects. If it does not return in that time,
  Ark says so and you read it again. The notice keeps the recovery-copy
  location even if reconnecting fails.

Drafts live in the editor window (in Chrome, the tab); closing it loses
unapplied changes. In VS Code one Ark panel holds the keyboard in a window:
**Open Charybdis Ark** again shows the panel already open. VS Code cannot ask
before a panel closes, so closing it during Apply does not stop the save: Ark
finishes it, says so, and lets go of the keyboard afterwards. Keep the keyboard
connected until then, and open Ark again to see the result. The
transaction and recovery contract is specified in
[`docs/architecture/logical-profile-transaction-v1.md`](../upstream/firmware/docs/architecture/logical-profile-transaction-v1.md).
Physical power-loss acceptance across every decision boundary is still in
progress, so keep the recovery file that Apply creates.

## Profiles and backups

Charybdis Ark's **Save a backup file…** saves the configuration read from the
keyboard: every layer and key position, behaviours, combos, named VIA macros,
lighting and global settings. Flashed defaults and live edits become one
portable file.
Saving a backup file leaves the editor and any local draft unchanged, even if the keyboard
has changed since its last editor read.

A backup restores onto the same firmware release; check the release notes
before updating firmware ([below](#firmware-versions)).

**Saved before each Apply** lists the copy every Apply saves first, named
"Before Apply · Charybdis - Home · 18 Oct 2026, 07:12". In Chrome they are
kept in the browser's storage, each with **Use as draft** (it opens the same
comparison as a backup file), **Download** and **Delete** (see [Using Ark in
Chrome](#using-ark-in-chrome)). VS Code keeps them as files in the
extension's local storage and the notice after Apply shows the full path;
restore one with **Choose a backup file…**. **Start from the firmware's
defaults** is not available yet: the keymap and macros need firmware support
first.

On **Backups**, use **Choose a backup file…** or drop one backup file
onto the **Restore** card. Both open the same comparison, as a sheet over the
screen, including in the demo: what the file changes, counted by what it
configures, and whether it fits ("This file fits: 4,101 of 53,216 bytes"). **Use as draft** replaces the draft; Undo brings it back, and the keyboard
changes only after Review and Apply. A file that holds exactly what the
keyboard runs changes nothing and cannot be used, unless the draft has edits:
then using it puts the draft back to the keyboard's profile, as **Discard all**
does. Restore is disabled while the keyboard or
draft is unavailable, stale or busy. Multiple, unreadable, invalid and oversized
files are refused without replacing your draft.

**Memory**, on the Keyboard screen, shows how full the profile is. Its bar is the space the
keyboard stores behaviours, combos, lighting, trackball modes, custom keys,
settings and every name in: 53,216 bytes on current firmware, the size the
keyboard reports. Under it, **In use** counts what you have set up against what
the keyboard holds, each with a short bar, in the words of the screen that
edits it. Behaviours, behaviour tap counts, combos, LED groups and LED
overrides count toward limits: at one, the row says full and the keyboard
refuses one more. Macro slots with steps, custom keys with a name, a shortcut
or a behaviour, and trackball mode slots that hold a mode count out of the 128,
128 and 32 the keyboard has, each bar showing the slots in use against the free
ones. Every empty macro slot keeps room in macro memory for ten key taps; when
the memory cannot, the highest empty slots are unavailable until a macro is
shortened or cleared, and the Macros bar fills its free end in red for them,
its row saying how many are unavailable. Hover a row for what it counts. The
profile bar turns orange from 90%, when the next edit may not fit. The figures
are your draft's while it has changes, and
the keyboard's otherwise; they follow every edit, undo and discard. Macro steps
are stored apart from the profile, so the card shows them as a second bar,
counted slot by slot on Macros.

### Firmware versions

Ark works with the current firmware only, the pair from the latest firmware
release; each Ark release names the firmware release it was built with. It
reads, edits and restores only what that firmware stores, and converts
nothing. A keyboard on older firmware is told to update both halves and read
no further, and a backup in an older format is refused at Restore. When a
firmware update changes the stored format, the keyboard starts from its
flashed defaults, and backups from before the update no longer restore.

Executable custom combo hooks and unsupported macro content
cannot be represented as profile data; saving a backup file reports these explicitly instead
of producing an incomplete file.
The [portable profile contract](../upstream/firmware/docs/architecture/portable-profile-v1.md) records
format limits, compatibility, restore ordering and remaining hardware checks.
