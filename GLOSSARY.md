# Charybdis Ark

The words for the app: how a person reads the keyboard, edits it in a draft,
reviews and keeps changes, and backs them up. The keyboard's own words
(profile, half, generation, working copy, edit mode, Save, Apply, behaviour,
pointing mode, switch key, the autocorrect list with its entries, and the
rest) are in the [firmware's
glossary](upstream/firmware/GLOSSARY.md), which Ark imports at a pinned
commit. A person sees the keyboard's Apply and its Save both as **Save**
(D-L72).

## Reading the keyboard

**Read**:
Downloading and checking the keyboard's complete profile so Ark shows exactly
what it runs.
_Avoid_: sync, load, pull, refresh (for the action)

**Snapshot**:
One complete, verified read of the keyboard that the editor, the draft and a
backup all start from.
_Avoid_: capture, dump, cache

**Demo**:
Ark running on a complete example profile with no keyboard connected; every
screen works and only saving needs a keyboard.
_Avoid_: offline mode, sample keyboard, fixture (in the interface)

**Read-only**:
A keyboard Ark can show but not edit, because its complete profile could not
be read or another keyboard holds the draft.
_Avoid_: locked, view-only, disabled

**Flash pauses**:
How long each half stopped to work on its flash since it started, as it
measures them, shown under Diagnostics on the Keyboard screen.
_Avoid_: stalls, latency, flash timing

## The draft

**Draft**:
The edited profile Ark holds for one keyboard, based on one read of it; every
change goes into it, whatever the edit mode.
_Avoid_: working copy, staging, pending profile, local copy, candidate

**Edit**:
One change a person makes, recorded in the draft as a single undoable step,
however many things it touches.
_Avoid_: mutation, patch, operation, action (for this)

**Draft history**:
Every step of the draft, newest first, that undo and redo move through.
_Avoid_: undo stack, changelog, timeline, revision (for a step)

**Change**:
One changed thing as Review lists it: a key, a behaviour, a combo, a setting,
compared with what the keyboard holds.
_Avoid_: diff, delta, item (for this)

**Discard**:
Throwing away a change, or the whole draft, so the draft matches the keyboard
again.
_Avoid_: revert (for the draft), reset, undo (for this), drop

**Stale draft**:
A draft whose keyboard changed since the read it was based on, so it must be
reviewed against the keyboard before it can be kept.
_Avoid_: conflict (alone), outdated draft, drifted draft

**Send live**:
Turning a draft made in Review and save into unsaved edits on the keyboard
when switching to a live edit mode.
_Avoid_: push, upload, apply live

## Review

**Review**:
The list of every change in the draft against the keyboard, with the checks,
that every save goes through.
_Avoid_: diff view, summary, changes dialog

**Check**:
A finding Review makes about what the draft lets the keyboard do; each says
whether the draft made it, the keyboard already had it, or the draft fixes it.
_Avoid_: lint, validation (for this), issue, problem

**Trap**:
A layer that can be locked on with no way back to the base layer, or a
pointing mode that can be locked with no way to turn it off.
_Avoid_: dead end, stuck layer, layer lock-in

**Blocker**:
A check that keeps Save disabled until it is fixed.
_Avoid_: error (for this), fatal

**Warning**:
A check that Save asks about before writing ("Save anyway").
_Avoid_: caution, soft error

**Notice**:
A check that only informs, such as a behaviour that changes nothing.
_Avoid_: info, hint, tip

**Reachability**:
Which layers, combos, macros and pointing modes the keys can actually get to
from the base layer, and back.
_Avoid_: coverage, navigability, escape analysis

## Keeping changes

**Save** (on screen):
Making the draft's edits permanent on the keyboard: the
keyboard's Apply in Review and save, its Save in the live modes (D-L72).
_Avoid_: Apply (on screen), commit, write, push

**Recovery copy**:
A backup Ark saves automatically before a save or a restart, of what
that operation could lose, and of the unsaved edits when a Save is cut short.
_Avoid_: recovery file, Before Apply copy, safety backup, snapshot

**Backup**:
A complete profile kept as one file outside the keyboard, made by Export
profile and read back by Import profile.
_Avoid_: portable document, portable profile, profile file, export (for the
file), dump

**Export profile**:
Writing the profile the keyboard runs to a backup without changing anything.
_Avoid_: save (for this), download, backup now

**Import profile**:
Opening a backup against the keyboard so it can become the draft after
review.
_Avoid_: restore (alone), load, upload

## The interface

**Screen**:
One of Ark's top-level views chosen from the rail, in three groups: Keymap,
Lighting, Macros, Text replacement, Custom keys and Pointing modes under
Configure; Behaviours, Combos, Pointer and Host under Settings; Backups and
Keyboard under Keyboard. Outside the rail, a Settings screen is named with "settings" after
it (Behaviour settings, Combo settings, Pointer settings, Host settings),
since nothing around a link or a tip says it is one.
_Avoid_: page, tab, area (for this), surface, panel

**Text replacement**:
What a person calls the keyboard replacing what is typed when a word ends: a
typo fixed, longer text typed, a macro played. It is the name on the rail,
the screen, the Host card, the Memory panel, the picker and every message.
The keyboard, its firmware and its keys call it **autocorrect**, and Ark's
code, contracts, screen id, domain name and files keep that name
(`autocorrect`, `AC_ON`, `core/model/autocorrect-*.js`). A person reads
"autocorrect" only where QMK's or the keyboard's own thing is named as
theirs: "QMK's autocorrect dictionary" (the file format), "QMK's autocorrect
keys", "the keyboard's autocorrect" where the guide first says what the
feature is. The picker's search keeps QMK's words for its keys, so a search
for it finds the feature.
_Avoid_: autocorrect (as Ark's name for the feature, its screen, its list or
anything on it), text expansion, snippets, shortcut (a custom key's)

**Replacement**:
What an entry of the text replacement list puts in place of its input:
a line of text of up to 128 bytes, or a macro, named by its slot and shown by
its name. Stored once. A replacement is **deleted** (an input is
**removed**). Wherever one is listed it is called the same, by core
(`replacementCalled`): its text, or its macro's name, which the screens draw
after the macros' mark (never a character such as "▶"); in a sentence,
its text in quotes or "the macro “Sign-off”". The firmware and Ark's code
call it a `correction`.
_Avoid_: correction (in anything a person reads), word, expansion, output

**Input**:
What is typed to get a replacement: one word of letters and digits, a
misspelling or an abbreviation such as `pnumber`, typed as you type or after
the Leader key as its replacement **fires**. A replacement has one or
more. A heading, a count and a label read **Inputs** ("15 of 1,024 inputs",
"+ Input"), a sentence says "an input" or "its inputs", and a list file names
them `inputs`. It belongs to one replacement. The firmware and Ark's code
call it a `typo`, on the wire as in the identifiers; the firmware's specs
and ADRs say "typed form" and its guide says input, as here
(`upstream/firmware/GLOSSARY.md`): the same thing.
_Avoid_: typed, typed form, what is typed for it (Ark's words before; a file
that says `typed` is still read), typo (as the term; a misspelling is still a
typo, and "typo fixes" says so), variation, trigger, abbreviation (as the
term), pattern

**Fires** (how a replacement fires):
Whether a replacement's inputs fire **As you type** (as a word ends), **After
Leader**, or **Both** (D-L91): the replacement's, never an input's, so
switching it leaves its inputs as they are. The switch is **Fires** on its
editor; a file says `fires`. The firmware calls it the correction's trigger,
bits 1–2 of its row's kind byte.
_Avoid_: mode, trigger (in anything a person reads), input kind

**Leader**:
Text replacement's own key, QMK's `QK_LEADER` (firmware D-F71): after it, what
is typed is held on the keyboard and sent only as the replacement of an
input that fires after it. It goes wherever a switch key goes, and the
picker offers it in **Other QMK**, **Text replacement**, beside **Switch
keys**; it is not a switch key.
_Avoid_: leader sequence, Leader mode, QMK Leader

**Leader input**:
An input of a replacement that fires after the Leader key: a word like any
input, typed whole after the key, `recieve*` sent by `recieve` (D-L91). Not a
kind of input of its own.
_Avoid_: leader sequence, leader typo, shortcut, code

**Leader waits** (the leader timeout):
How long the leader waits after its last key before it sends an input that a
longer one begins with, or drops what is held: settings scalar 32,
1000 to 10000 ms, on Host under **Text replacement**.
_Avoid_: leader term, leader window

**Leader waiting**:
The case of replacement feedback the keyboard shows
while the leader waits for what is typed after the Leader key (D-L92): a
colour held, not flashed, until the leader sends or gives up, where its own
locality names (D-L93), following the Leader key that began it; when no key
began it, on every key of the halves its locality names. The firmware calls it
leading, replacement-feedback semantic `3` (firmware D-F72).
_Avoid_: leading (in anything a person reads), leader flash, leader state

**`*`** (in an input):
Where other letters may go. An input is the whole word unless it is
written with one: `recieve*` the start of a word, `*mnet` the end, `*tihng*`
anywhere in one (D-L84). It is how Ark writes, shows and takes the four
matches the keyboard stores; no control, label or message names a match. It
may be called **the wildcard** ("Add *, the wildcard, where other letters
may go"), and an input written with one "catches" the words it matches.
_Avoid_: whole word, start of word, end of word, anywhere (as a choice or a
label), match type, boundary; fires (in anything a person reads: an input
catches a word, and the keyboard replaces it)

**Try it**:
The last section of a replacement's editor on the Text replacement screen: a
box to type in, which Ark never changes, and under it the **preview**, that
text as the keyboard would type it with the draft's list, through the
draft's host layout, each replaced part marked. It runs the
keyboard's own rules over text (D-L86), so the preview shows the replacements
and the undo, and nothing that needs a key or a timing: a shortcut, a cursor
key, a held key, a macro key. For a replacement that plays a macro it says
which, and shows the macro's text when that is all it is.
_Avoid_: simulator, test box; preview (for the section: the preview is the
line under its box)

**Area**:
The part of the profile Review groups its changes under, mostly one screen's,
and named as that screen is: Pointer is what Pointer settings edits. Settings
is what the rest of the Settings group edits.
_Avoid_: section, domain (for this), category

**Frame**:
What stays around every screen: the rail, the top bar over the screen and
the bar.
_Avoid_: shell (for this), chrome, layout

**Rail**:
The column at the left that chooses the screen, under its group's heading,
and shows the keyboard, its
edit mode and the draft's history. Its keyboard button opens the keyboard
menu: the edit modes, the keyboards to switch between, Choose keyboard and
Disconnect.
_Avoid_: sidebar, nav, menu

**Bar**:
The floating bar at the foot of the window, the only way changes leave it:
Review, Save, Revert and their progress.
_Avoid_: footer, save bar, toolbar, status bar

**Board**:
The drawing of the keyboard on screen, painted with the light the keyboard
would show for the chosen layer.
_Avoid_: keyboard view, layout view, canvas

**Workbench**:
The tabs under the board for the selected key: the key, its behaviour, its
combos and what the layer reaches.
_Avoid_: key inspector, detail panel, editor pane

**Hover card**:
The card that opens when the pointer rests on a key on the Keymap's board,
listing everything the key reaches. Lighting's board opens none.
_Avoid_: tooltip, key card, popover

**Tip**:
The words that open at the pointer when it rests on a control, saying what
the control does or what it shows in full.
_Avoid_: tooltip, title, hover text

**Info mark**:
A small circled i beside a heading, on a stage bar or on the board's corner,
whose list of terms and what each means opens while the pointer or the focus
is on it (D-L88, D-L95). It holds what is read once, how a section works or
what its choices mean, so the screen keeps only what is needed every time.
_Avoid_: help icon, tooltip (that is a tip), info button

**Stage bar**:
The strip across the top of every Lighting stage that holds what is the
whole stage's (D-L95): its name and what it does behind an info mark, the
settings every item on it shares, whether a switch elsewhere keeps it from
painting, and its **Stage on** switch at the end. Under it, the item picked
in the stage's list heads what is its own alone.
_Avoid_: stage header, toolbar, banner (that says a global switch is off)

**Keycode picker**:
The dialog that chooses what a key, branch, shortcut or output sends.
_Avoid_: key picker, keycode chooser, selector

**Mark**:
The small sign Ark draws beside anything with a colour of its own on the
keyboard, in that colour, and beside a macro or a custom key (D-L31): a
tier's dot, a branch badge (for the Multi tap window, "N×" in every
tap-branch colour), a combo badge, a stage's dot, the board icon for a layer
or the Pointing modes icon for a pointing mode, and the Macros or Custom keys
icon, in the words' colour, for a macro or a custom key, which have no colour.
A **swatch** is a plain square of a colour, shown where the colour itself is
the subject or where only the colour tells the items apart; it is not a mark.
_Avoid_: tag, chip (for a mark), dot (for a layer's mark)

**Layer preview**:
Showing several layers stacked on the board the way the keyboard would
resolve them.
_Avoid_: layer stack, overlay view

**Accent**:
LEDs that light in a colour of their own, or their stage's, while a layer is
on, a pointing mode runs, a combo's inputs are held, a key shows a behaviour
state, or the keyboard flashes for a replacement or waits after Leader (D-L77). It is added and changed on that stage's tab on Lighting, its
LEDs picked on the board and named by index ("LEDs 24–28, 53–55"). The
different sets of LEDs accents light are **LED sets**; Ark keeps them.
_Avoid_: LED group, LED override, group row, assignment

**Passthrough**:
A colour that paints nothing, so what is beneath it shows through: for a
layer, the layers on under it or the background effect; for a pointing mode,
combo feedback or a feedback case, whatever the stages before it paint
(D-L94, firmware D-F74). Ark stores it as HSV(0, 0, 0) with the
**Passthrough** choice; the keyboard treats any colour a layer, a pointing slot, combo
feedback or a feedback case owns with no saturation or brightness so, at any
hue. Its accents in a colour of their own still light. It is not **off**,
brightness zero with some saturation, whose LEDs go dark. An accent's
HSV(0, 0, 0) takes its owner's colour instead, and the auto-mouse fade's end
colour is literal, so HSV(0, 0, 0) turns the LEDs off there.
_Avoid_: no colour, off (for passthrough), transparent (that is a key)

**Off** (a colour):
Brightness zero with some saturation: a colour whose LEDs go dark, covering
what is beneath, stored with the **Off** choice beside **Colour** and
**Passthrough** (D-L94, D-L95). Not passthrough, which paints nothing and lets what is beneath show.
_Avoid_: black (in anything a person reads)

**Behaviour feedback**:
The lighting stage that shows the state of a key's behaviour, and its tab on
Lighting (D-L89): a key flashes, or holds, the colour of what its behaviour
is doing. Its **behaviour states**, its **cases**, are the tiers (**Tap
committed**, **Hold active**, **Long hold active**) and each tap branch
pending (**Double tap**, **Triple tap**, **Quadruple tap**, **Quintuple tap**,
the last for every deeper count too), each with its own colour, locality and
accents (D-L93, firmware D-F73); an accent lights for one case, for **Every
tap branch** (firmware D-F75), or for **Every behaviour state**. Its tap-commit policy and **Flash interval**, how long one
on or off phase lasts, are one setting for every case, on its stage bar. The
firmware's code and Ark's keep the stage's old name: the stage id `key`, the
record `keyFeedback`, the accent table `keyBehavior`, the edit
`updateKeyBehaviorFeedback`.
_Avoid_: key feedback, feedback state (for a behaviour state), behavior
feedback (the spelling)

**Replacement feedback**:
The lighting stage that flashes once as text replacement changes what was
typed, and holds a colour while the leader waits, painted last, and its tab
on Lighting (D-L89, D-L92). It has four **cases**, each with its own colour
and locality (D-L93): **Replaced with text**, **Replaced by a macro** and
**Replacement undone** (with Backspace), which flash, and **Leader
waiting**, held from the Leader key until the leader sends or gives up. A
passthrough case does not light; the others still do (D-L94). Its accents
light for one case or for **Every case**. A flash follows the key that ended
the word, or the Backspace that undid the replacement, and lasts its **Flash
length**, one for every case, apart from behaviour feedback's Flash
interval; Leader waiting follows the Leader key that began it. The firmware's
code and Ark's call the stage `autocorrect` feedback
(`autocorrectFeedback`, the accent table `autocorrect`).
_Avoid_: autocorrect feedback, autocorrect flash, typo light, correction
feedback (in anything a person reads); state (for a case: a behaviour
state is a key's)

**Empty layer**:
A layer with nothing in it: not the base or a default layer, no name of its
own, no key mapped, and nothing that uses it (D-L76). Lists of layers fold
them behind one disclosure at their end.
_Avoid_: unused layer, spare layer, blank layer

## Where Ark runs

**Shell**:
What runs Ark around its core: the web page's code (`web/`), which gives the
panel what a browser has (Chrome's keyboard picker, its storage, files and
downloads). Ark has one (D-L71).
_Avoid_: host (for this), platform, container

**Panel**:
Ark's interface (`webview/`), filling the page's tab; it renders the model
and posts edits back.
_Avoid_: webview (for the panel), window, view

**Pull request preview**:
A branch's Ark as Cloudflare builds and serves it for its pull request, at the
Branch Preview URL that follows the branch's latest build (**Try this PR**),
to try it before it lands.
_Avoid_: Ark branch (the retired VS Code window), preview build, dev build

## Agreement with the firmware

**Upstream**:
The firmware and QMK files Ark imports at pinned commits: contracts, fixtures
and this glossary's companion.
_Avoid_: vendored firmware, firmware copy, submodule

**Agreement**:
The check that a firmware states the contract Ark's own decoder expects.
_Avoid_: compatibility (for this), contract check, handshake

**Compatibility bridge**:
The cross-repository check that runs Ark's codecs against selected firmware
and QMK checkouts.
_Avoid_: compat test, integration bridge, agreement (for this)
