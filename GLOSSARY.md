# Charybdis Ark

The words for the app: how a person reads the keyboard, edits it in a draft,
reviews and keeps changes, and backs them up. The keyboard's own words (profile,
half, generation, working copy, edit mode, Save, Apply, behaviour, pointing
mode and the rest) are in the [firmware's glossary](upstream/firmware/GLOSSARY.md),
which Ark imports at a pinned commit. A person sees the keyboard's Apply and
its Save both as **Save** (D-L72).

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
A layer that can be locked on with no way back to the base layer.
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
One of Ark's top-level views chosen from the rail: Keys, Lighting, Macros,
Custom keys, Pointing modes, Mouse, Settings, Backups and Keyboard.
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
The card that opens when the pointer rests on a key on the board, listing
everything the key reaches.
_Avoid_: tooltip, key card, popover

**Keycode picker**:
The dialog that chooses what a key, branch, shortcut or output sends.
_Avoid_: key picker, keycode chooser, selector

**Mark**:
The small sign Ark draws beside anything with a colour of its own on the
keyboard, in that colour (D-L31): a tier's dot, a branch badge, a combo badge,
a stage's dot, and the board icon for a layer or the Pointing modes icon for a
pointing mode. A **swatch** is a plain square of a colour, shown where the
colour itself is the subject or where only the colour tells the items apart;
it is not a mark.
_Avoid_: tag, chip (for a mark), dot (for a layer's mark)

**Layer preview**:
Showing several layers stacked on the board the way the keyboard would
resolve them.
_Avoid_: layer stack, overlay view

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
