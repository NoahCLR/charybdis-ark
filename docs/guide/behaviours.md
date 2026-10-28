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
hold**. Click a cell to set what it sends with **Sends** and **Pick…**. Click
**Remove tier** to empty it.

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
**pointing mode**. The hover card names them the same way.

### What an empty cell does

An empty cell isn't nothing. Where the key would do something on its own, the
cell is dashed and shows it, marked **built in**:

- An empty Single tap sends the key's own keycode, and an empty Hold holds
  it. A layer-tap key holds its layer; a mod-tap key holds its modifiers.
- An empty Double tap or later repeats the Single tap once per press, so an
  empty Double tap sends it twice.
- An empty Long hold beside a Hold shows the Hold carrying on.
- An empty Hold beside a Long hold shows the tap a release sends before the
  Long hold threshold.
- A pointing-mode key holds its mode from the press, unless its row holds
  another mode on a later tap: then it waits for the Tap / hold threshold,
  so the two modes never overlap. That holds however the key is stored, by
  its name or as its keycode.

Setting an action in a dashed cell replaces what it shows. Modifier keys on
their own show nothing built in.

Tapping faster than the deepest tap count you set is just typing: each press
sends the Single tap again. So a Backspace whose Double tap types V sends
Backspace for one tap, V for two and three Backspaces for three.

### Timing

Above the grid are the behaviour's timings:

- **Multi tap window**: how long after letting go the next press still counts
  as another tap.
- **Tap / hold threshold**: how long a press lasts before it counts as a
  hold.
- **Long hold threshold**: how long before it counts as a long hold.

A timing that follows the keyboard's default shows it greyed, with the
setting it comes from, such as `200 · dual-role` on an `LT` or `MT` key,
`150 · behaviour default` on any other key, and `400 · default` for the long
hold threshold or multi tap window. Type a value to give this behaviour its own;
clear the field to follow the default again. The defaults are under
**Tap & hold timing** on Behaviour settings (below).

When Review's checks find a problem with the timing, a note above the grid
says so.

## More switches

- **Use this behaviour**: turn it off to keep everything it does but stop it
  running, until you turn it on again.
- **Layers it runs on**: the layers a key can come from for this behaviour to
  run.
- **Keeps the pointer layer on**: pressing this key counts as using the
  trackball, so auto-mouse keeps the pointer layer on instead of turning it
  off.

These, and the timings, wait until the behaviour does something. On a plain
key such as Tab, a timing does nothing until the behaviour has a branch.

## Keeping, moving and removing

A behaviour joins your draft only when it changes something: a cell, a
timing that matters for the key, or Keeps the pointer layer on. One that ends
up changing nothing is removed again, and Undo brings it back. A behaviour
already on the keyboard that changes nothing says so, so you can remove it or
give it a branch.

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
| The whole keyboard | **Behaviour settings**, the Behaviours card | **Enabled** |
| Each layer | **Behaviour settings**, the Behaviours card | **On these layers** |
| This behaviour | the behaviour editor | **Use this behaviour** and **Layers it runs on** |
| This key on this layer | the Key tab | **Use behaviour** |

The layer that counts is the one the key comes from: a transparent key takes
the switches of the layer it falls through to. When a behaviour is off for a
key, the key does what it would without one: the board shows no dots on it,
and the Key tab and the hover card say which switch is keeping it off, with
no branches or timing, since none of them run.

A key on the keyboard can turn behaviours or combos off for now. Behaviour
settings or Combo settings then marks the switch **turned off by key**. That
isn't a change and isn't in Review: the key, or unplugging, turns it back on.

## Behaviour settings

**Behaviour settings** (**Behaviours** under Settings in the rail) shows two
cards, both open: **Tap & hold timing** and **Behaviours**, the switches in
the table above.

**Tap & hold timing** holds the keyboard's default timings, used wherever a behaviour leaves its own
empty:

- **Dual-role tap / hold threshold**: for keys that type on tap and hold a
  layer or modifier, such as `LT` and `MT` keys, with or without a behaviour.
- **Behaviour tap / hold threshold**: for every other key with a behaviour.
- **Long hold threshold**.
- **Multi tap window**.

Changing a default moves every behaviour that follows it.
