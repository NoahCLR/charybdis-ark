# Charybdis Ark

The words for the app: how a person reads the keyboard, edits it in a draft,
reviews and keeps changes, and backs them up. The keyboard's own words (profile,
half, generation, working copy, edit mode, Save, Apply, behaviour, pointing
mode and the rest) are in the [firmware's glossary](upstream/firmware/GLOSSARY.md),
which Ark imports at a pinned commit.

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
screen works and only Apply needs a keyboard.
_Avoid_: offline mode, sample keyboard, fixture (in the interface)

**Read-only**:
A keyboard Ark can show but not edit, because its complete profile could not
be read or another keyboard holds the draft.
_Avoid_: locked, view-only, disabled

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
Turning an Apply-mode draft into unsaved edits on the keyboard when switching
to a live edit mode.
_Avoid_: push, upload, apply live

## Review

**Review**:
The list of every change in the draft against the keyboard, with the checks,
that Apply and Save go through.
_Avoid_: diff view, summary, changes dialog

**Check**:
A finding Review makes about what the draft lets the keyboard do; each says
whether the draft made it, the keyboard already had it, or the draft fixes it.
_Avoid_: lint, validation (for this), issue, problem

**Trap**:
A layer that can be locked on with no way back to the base layer.
_Avoid_: dead end, stuck layer, layer lock-in

**Blocker**:
A check that keeps Apply disabled until it is fixed.
_Avoid_: error (for this), fatal

**Warning**:
A check that Apply or Save asks about before writing ("Apply anyway").
_Avoid_: caution, soft error

**Notice**:
A check that only informs, such as a behaviour that changes nothing.
_Avoid_: info, hint, tip

**Reachability**:
Which layers, combos, macros and pointing modes the keys can actually get to
from the base layer, and back.
_Avoid_: coverage, navigability, escape analysis

## Keeping changes

**Recovery copy**:
A backup Ark saves automatically before an Apply, a Save or a restart, of what
that operation could lose.
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
One of Ark's top-level views chosen from the rail: Keys, Lighting, Macros,
Custom keys, Mouse, Pointing modes, Settings, Backups and Keyboard.
_Avoid_: page, tab, area (for this), surface, panel

**Area**:
The part of the profile one screen edits, under which Review groups its
changes.
_Avoid_: section, domain (for this), category

**Frame**:
What stays around every screen: the rail, the top bar over the screen and
the bar.
_Avoid_: shell (for this), chrome, layout

**Rail**:
The column at the left that chooses the screen and shows the keyboard, its
edit mode and the draft's history.
_Avoid_: sidebar, nav, menu

**Bar**:
The floating bar at the foot of the window, the only way changes leave it:
Review, Apply, Save, Revert and their progress.
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
The card that opens when the pointer rests on a key on the board, listing
everything the key reaches.
_Avoid_: tooltip, key card, popover

**Keycode picker**:
The dialog that chooses what a key, branch, shortcut or output sends.
_Avoid_: key picker, keycode chooser, selector

**Layer preview**:
Showing several layers stacked on the board the way the keyboard would
resolve them.
_Avoid_: layer stack, overlay view

## Where Ark runs

**Shell**:
The program that runs Ark: the VS Code extension or the web page in Chrome.
_Avoid_: host (for this), platform, container

**Panel**:
Ark's window inside VS Code.
_Avoid_: webview (for the window), tab, view

**Ark branch**:
A branch of Ark opened from its own worktree in a new VS Code window, to try
it before it lands.
_Avoid_: preview build, dev build

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
