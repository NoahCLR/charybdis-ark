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
(`autocorrect`, `AC_ON`, `core/model/autocorrect-*.js`); the guide says
"autocorrect" once, and the picker's search keeps QMK's words for its keys,
so a search for it finds the feature.
_Avoid_: autocorrect (in anything a person reads, but for that one mention),
text expansion, snippets, shortcut (a custom key's)

**Replacement**:
What an entry of the text replacement list puts in place of its input:
a line of text of up to 128 bytes, or a macro, named by its slot and shown by
its name. Stored once. The firmware and Ark's code call it a `correction`.
_Avoid_: correction (in anything a person reads), word, expansion, output

**Input**:
What is typed to get a replacement: one word of letters and digits, a
misspelling or an abbreviation such as `pnumber`. A replacement has one or
more. A heading, a count and a label read **Inputs** ("15 of 1,024 inputs",
"+ Input"), a sentence says "an input" or "its inputs", and a list file names
them `inputs`. It belongs to one replacement. The firmware and Ark's code
call it a `typo`, on the wire as in the identifiers.
_Avoid_: typed, typed form, what is typed for it (Ark's words before; a file
that says `typed` is still read), typo (as the term; a misspelling is still a
typo, and "common typo fixes" says so), variation, trigger, abbreviation (as
the term), pattern

**`*`** (in an input):
Where other letters may go. An input is the whole word unless it is
written with one: `recieve*` the start of a word, `*mnet` the end, `*tihng*`
anywhere in one (D-L84). It is how Ark writes, shows and takes the four
matches the keyboard stores; no control, label or message names a match.
_Avoid_: whole word, start of word, end of word, anywhere (as a choice or a
label), match type, wildcard, boundary

**Try it**:
The last section of a replacement's editor on the Text replacement screen: a
box to type in, which Ark never changes, and under it the **preview**, that
text as the keyboard would type it once the draft is applied, under the
draft's list and host layout, each replaced part marked. It runs the
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
on, a pointing mode runs, a combo's inputs are held or a key shows a feedback
state (D-L77). It is added and changed on that stage's tab on Lighting, its
LEDs picked on the board and named by index ("LEDs 24–28, 53–55"). The
different sets of LEDs accents light are **LED sets**; Ark keeps them.
_Avoid_: LED group, LED override, group row, assignment

**Passthrough**:
A layer colour that paints nothing, so what is beneath it shows through: the
layers on under it, or the background effect. Ark stores it as HSV(0, 0, 0);
the keyboard treats any layer colour with no saturation or brightness so. It
is a layer's alone: black in every other stage is black.
_Avoid_: no colour, off (for a layer), transparent (that is a key)

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
