# Behaviours

A behaviour sets what a key does on tap, hold and long hold, for each tap
count: a single tap, a double tap and so on. The keyboard can hold 128
behaviours, with five tap counts each.

Open one from **Keymap → Behaviours**, or select a key and use the Behaviours
tab. The list on the left groups behaviours by how this layer reaches them:
on this layer, through a combo, through a transparent key, and so on. Select
any key and its behaviour opens, even if it doesn't have one yet; there is no
separate Add.

Transparent keys and `KC_NO` can't have a behaviour. Select a transparent key
and the key that answers it from below opens instead, with the layer it comes
from; the base layer is always on, so one answers even with no layer preview.

## The grid

A behaviour is a grid. There is a row for each tap count (**Single tap**
to **Quintuple tap**) and a column each for **Tap**, **Hold** and **Long
hold**. Click a cell to set what it sends with **Sends** and **Pick…**, or
double-click it to open the keycode picker straight away. Click
**Remove tier** to empty it. Every change goes into your draft as you make
it; **Done**, or Escape, closes the cell and puts you back on it.

A **Hold** or **Long hold** cell also sets **How it runs**:

- **held until release**: held down while you hold the key
- **tap at Tap / hold threshold** (or Long hold threshold): taps once, as soon
  as the threshold passes
- **tap on release after** the threshold: taps when you let go
- **repeat while held**: taps again and again, at the **Repeat rate** you set

A Tap cell fires when you let go before the Tap / hold threshold.

A cell that acts on a layer or runs a pointing mode names it the same way:
an icon for what it is (the board's outline for a layer, the Pointing modes
icon for a pointing mode) in its colour, its name and a tag for what the
action does, such as **HOLD** or **LOCK**. An icon with no colour means that
colour, or its lighting, is off. The line under it starts with **layer** or
**pointing mode**. A macro has the Macros icon (a robot) and a custom key the
Custom keys icon (a square with a plus), in the colour of the words, since
neither has a colour of its own. The hover card names them the same way.

### What an empty cell does

An empty cell isn't nothing: it's the **standard key**, what the key does
with no behaviour. Nothing you set on one tap count reaches another. Where
the key would do something on its own, the cell is dashed and shows it,
marked **standard key**:

- An empty Single tap sends the key's own keycode, and an empty Hold holds
  it. A layer-tap key holds its layer; a mod-tap key holds its modifiers. A
  macro plays. A pointing mode's lock key locks the mode, and a switch key
  turns combos, behaviours or auto-mouse on or off (below). A custom key sends its shortcut; a Tap-toggle one does
  nothing on a tap, a One-shot one arms its layers, and one with no shortcut
  does nothing.
- A hold that starts as the key goes down, such as a layer key's or a
  pointing mode's, says **held from the press**. A One-shot custom key's
  hold also says **arms on release**: let go after the tap / hold threshold
  and its layers stay armed for the next key.
- An empty Tap on a Double tap or later sends the key's own tap once per
  press, so an empty Double tap sends it twice. It's never the Single tap
  you set: a Right Option whose Single tap toggles a lock sends Right Option
  twice on a quick double tap.
- A Single tap set to Transparent is the exception: the key below is then
  the key's tap wherever a Tap is empty, marked **key below**. A pointing
  key on a layer types the key under it however many times you tap.
- A Tap-toggle custom key with no behaviour counts taps by itself: its
  Quintuple tap says **locks its layers**.
- An empty Long hold beside a Hold shows the Hold carrying on.
- An empty Hold beside a Long hold shows the tap a release sends before the
  long hold threshold, unless the key's own hold fills it: on the Single
  tap a layer-tap, mod-tap, layer or pointing-mode key holds its own there.
- With neither a Hold nor a Long hold, the empty Hold and Long hold show the
  tap: however long you hold, letting go sends it. On the Single tap the
  key's own hold comes first, so this shows only on a key with no hold of
  its own, such as a macro; on a later tap count it shows on any key.
- A Double tap or later with nothing set at all is the key pressed that many
  times, the last one held: its Hold says how many taps go out first
  (**after 1 tap** on a Double tap) and shows the key held. A key whose tap
  sends nothing, such as a layer key, just holds.
- A pointing-mode key holds its mode from the press, unless its row holds
  another mode on a later tap: then it waits for the Tap / hold threshold,
  so the two modes never overlap. That holds however the key is stored, by
  its name or as its keycode.

Setting an action in a dashed cell replaces what it shows. A modifier key on
its own, such as Left Command, is a key like any other: a quick Single tap
sends it, and holding it holds it.

Tapping faster than the deepest tap count you set is just typing the key:
every press is the standard key. So a Backspace whose Double tap types V sends
Backspace for one tap, V for two and three Backspaces for three, and three
taps then a held fourth send three Backspaces and then hold Backspace. The
rows past your deepest tap count show it the same way.

A behaviour that sets only its Single tap never waits for another tap: each
press is a Single tap of its own, sent as you let go, so five quick taps send
five, each as you let go of it. Its later rows say **each press**, even
after a Transparent Single tap, and their Hold and Long hold say **as Single
tap**.

### Timing

The behaviour's timings sit at the end of the switches row, under
**Timings**, which opens them in a small panel over the grid, each named
beside its field after its mark, the mark **Timings** wears when the behaviour
sets that timing (below):

- **Multi tap window**: how long after letting go the next press still counts
  as another tap.
- **Tap / hold threshold**: how long a press lasts before it counts as a
  hold.
- **Long hold threshold**: how long before it counts as a long hold.

A timing that follows the keyboard's default shows it greyed, with the
setting it comes from: `200 · dual-role` for the tap / hold threshold of an
`LT` or `MT` key, and otherwise `default`, such as `150 · default`. Type a
value to give this behaviour its own; clear the field to follow the default
again. The defaults are under **Tap & hold timing** on Behaviour settings
(below); hover a timing field, or a tier's heading, to read what it means.

The Long hold threshold must be later than the Tap / hold threshold, whether
the behaviour sets them or follows the defaults, and even when it has no Long
hold: the keyboard would never count a press as a Hold before a Long hold. A
timing that would put it at or before is not saved: it stays in its field,
edged red, with the values that clash under the fields, and the message
beside the rail says why, starting with **Failed:**. Once a timing puts them
in order, what you typed is saved together; closing **Timings** instead drops
it, and the fields show what is saved again. A behaviour the keyboard already
holds that way keeps it until you save it; Review warns about it meanwhile.

Closed, **Timings** wears the mark of each timing this behaviour sets: the
Hold or Long hold tier's dot for a threshold, and the "N×" badge for the
Multi tap window, the marks their defaults wear on Behaviour settings. When
all three follow the defaults it wears none. Hover **Timings** to read which
it sets. The panel stays open while you edit, and closes with Esc or a click
elsewhere.

When Review's checks find a problem with the timing, a note above the grid
says so, headed **Timing notice** or **Timing warning**.

## More switches

- **Use this behaviour**: turn it off to keep everything it does but stop it
  running, until you turn it on again.
- **Layers it runs on**: opens a panel of the layers a key can come from for
  this behaviour to run. A layer that **Behaviour settings** keeps behaviours
  off says *off in Behaviour settings* in its row. Its switch still works: for a
  key on that layer it takes effect once Settings allows it, and for a combo
  sending this behaviour it applies now, since a combo's output doesn't follow
  that setting. Click outside the panel, or press Esc, to close it.
- **Keeps the pointer layer on**: pressing this key counts as using the
  trackball, so auto-mouse keeps the pointer layer on instead of turning it
  off.

While **Enabled** on Behaviour settings is off, an amber banner at the top of
the Behaviours tab says so, and at the top of a custom key's **What it does**.
Everything stays editable. Click the banner to go to that switch.

These, and the timings, wait until the behaviour does something. On a plain
key such as Tab, a timing does nothing until the behaviour has a branch.

## Keeping, moving and removing

A behaviour joins your draft only when it changes something: a cell, a
timing that matters for the key, or Keeps the pointer layer on. One that ends
up changing nothing is removed again, and Undo brings it back. A behaviour
already on the keyboard that changes nothing is a Review notice, and the
key's card says so, so you can remove it or give it a branch; the editor
itself says nothing about it.

**Change key…** moves the behaviour to another key. If that key has its own,
you choose **Overwrite**, **Swap** or **Cancel**; either way it is one undo.
**Remove behaviour** removes it, and its keys send their plain keycode again.

A behaviour belongs to a keycode, not a position: change the behaviour on Esc
and it changes wherever Esc is pressed.

## Layer keys in a behaviour

A cell can send `TG`, `TO` and `LOCK_LAYER`, `OSL` as a tap, and `MO` or `TT`
as a hold that is held until release. `LT` makes its own tap and hold choice,
so it works only on a key, not in a behaviour or a combo. `DF` and `PDF` are
refused: the base layer stays the base.

## Where behaviours run

Switching a behaviour off anywhere keeps everything it does, ready to switch
on again. A behaviour runs only where every switch allows it:

| Scope | Where | Switch |
| --- | --- | --- |
| The whole keyboard | **Behaviour settings**, the Where behaviours run card | **Enabled** |
| Each layer | **Behaviour settings**, the Where behaviours run card | **On these layers** |
| This behaviour | the behaviour editor | **Use this behaviour** and **Layers it runs on** |
| This key on this layer | the Key tab | **Use behaviour** |

The switches per layer fold the [empty layers](board-and-layers.md#empty-layers)
at their end; **Layers it runs on** shows any it is off on.

The layer that counts is the one the key comes from: a transparent key takes
the switches of the layer it falls through to. When one of these switches
keeps a behaviour off for a key, the key does what it would without one: the
board shows no dots on it, and the Key tab and the hover card say which
switch is keeping it off, with no branches or timing, since none of them run.

### Switch keys

A **switch key** on the keyboard turns behaviours, combos or
[auto-mouse](pointing.md#pointer-settings) on or off for the whole keyboard
until it restarts: **Behaviours On**, **Behaviours Off** and **Toggle
Behaviours** (`BH_ON`, `BH_OFF`, `BH_TOGG`), QMK's **Combo On**, **Combo Off**
and **Toggle Combo** (`CM_ON`, `CM_OFF`, `CM_TOGG`), and **Auto-mouse On**,
**Auto-mouse Off** and **Toggle Auto-mouse** (`AM_ON`, `AM_OFF`, `AM_TOGG`).
Nothing is saved, and the switches in Ark stay as they are. That is why each
switch, the **Enabled** of Behaviour settings and Combo settings and Pointer
settings' **Auto-mouse**, says **↺ keyboard keys change this too**. When a
switch key has turned one off while Ark has it on, its settings mark it
**turned off by key**. Nothing else says so: the board, the Key tab, the hover
card and Lighting's auto-mouse fade show what the switches in Ark allow. It
isn't a change and isn't in Review; the key, or unplugging, turns it back on.
A switch key can't turn on what is off in Ark.

A switch key goes on a key, in a behaviour's tap or hold, or as a combo's
output, but not in a macro. With a behaviour of its own it does what the
behaviour decides: held for its Hold it switches nothing, and where the
behaviour leaves the Tap empty, a tap switches. While behaviours are off a
key does what it would without one, so `BH_ON` and `BH_TOGG` turn them back
on even with a behaviour of their own. A behaviour already holding something
when behaviours go off keeps it until you let go. The picker lists all nine
under **Other QMK**, in **Switch keys**.

## Behaviour settings

**Behaviour settings** (**Behaviours** under Settings in the rail) shows two
cards, both open: **Where behaviours run**, the switches in the table above,
and **Tap & hold timing**.

**Tap & hold timing** holds the keyboard's default timings, used wherever a
behaviour leaves its own empty:

- **Dual-role tap / hold threshold**: for keys that type on tap and hold a
  layer or modifier, such as `LT` and `MT` keys, with or without a behaviour.
- **Behaviour tap / hold threshold**: for every other key with a behaviour.
- **Long hold threshold**.
- **Multi tap window**.

Each behaviour timing wears the colour its key feedback flashes: the two
behaviour thresholds their tier's dot, and the Multi tap window an "N×" badge
split between the tap-branch colours, Key feedback's colour for each tap count
from 2× up, since it decides all of them.

Changing a default moves every behaviour that follows it. Ark refuses a
change that would put a behaviour's Long hold threshold at or before its Tap /
hold threshold, the two behaviour defaults included, and names the behaviours
it would move; change their own timings first.
