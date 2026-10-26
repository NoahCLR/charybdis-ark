# Pointing

Two screens set up the trackball. **Mouse** is how it moves the pointer.
**Pointing modes** make it do something else while a key is held or locked,
or while a layer is on: scroll, or send arrows and shortcuts as it moves.

Hover any label on Mouse for what it does.

## Mouse

**Pointer speed**

- **Normal pointer DPI**: the everyday speed, 400 to 3400 DPI.
- **Sniping DPI**: a slower speed for precise work, 100 to 400 DPI.

The DPI keys on the keyboard change these too, and Ark shows the new value.

**Auto-sniping**

- **Auto-sniping** uses the sniping speed while any of the **Auto-sniping
  layers** is on. Each layer has its own switch, as the other per-layer
  settings do; folded, the row says which are on ("Only Navigation"). Turning
  **Auto-sniping** off keeps the layers you chose.
- While one of those layers is on, moving the ball doesn't turn on a separate
  pointer layer, so the layer's own keys stay under your hand.
- **Sniping keys** shows where the **Sniping (hold)** and **Sniping toggle**
  keys are placed, with **Place on a key…** for each. Sniping is on while one
  of them is held or toggled, or one of the auto-sniping layers is on.

Sniping slows directional pointing modes too; scrolling modes ignore it.

**Auto-mouse**

- **Auto-mouse** turns the **Pointer layer** on when you move the ball. A
  layer a pointing mode's link uses can't be the pointer layer.
- **Timeout**: how long the layer stays on after the ball stops. The lighting
  fade keeps its share of it (see [Lighting](lighting.md#auto-mouse-fade)).
- **Movement debounce**, **Delay after typing** and **Movement threshold**
  tune when movement counts.

## Pointing modes

There are 32 pointing mode slots. The screen lists the modes you have as
cards, with the empty slots as numbered chips beneath them. An empty chip in
amber still has keys pointing at it.

Each slot has two keys: one that runs the mode while it is held, and one that
locks it on until pressed again. The picker shows them as **Hold** and
**Lock** under Pointing modes.

### Starting a mode

An empty slot offers **New directional mode**, **New scrolling mode**, or
**Copy from** another slot with **Duplicate into this slot**.

A key can point at an empty slot. It just does nothing until the slot holds a
mode, and the board marks it **empty**. So you can lay out the keys first and
fill in the modes later, and clearing a slot doesn't break the keys that use
it.

### Every mode

- **Name**: up to 32 bytes, counted under it as on the other names; an
  accented letter takes two.
- **Movement**: **Directional keys / shortcuts** or **Scrolling**.
- **Pointer speed while active**: the mode's own DPI, or **Normal pointer
  speed** to keep the Mouse setting.
- **Light**: its colour and where it paints, with **Edit in Lighting**.
- **Duplicate** copies the mode into the first empty slot. **Clear slot**
  empties it.

### How it starts

One card holds every way the mode starts. Its keys start it; layers can
start it too, and its key can turn layers on.

**Keys** shows where the mode's hold and lock keys sit, with **Place on a
key…**, which puts its hold key on a key you pick on the board.

Then the layers. A layer the mode is linked to lends it its keys, whatever
they are: clicks, modifiers, layer keys, behaviours. This is where a mode gets
keys of its own: put what it needs on a layer, and have the layer start the
mode, the mode's key turn the layer on, or both. The card lists every layer,
in the order of the layer tabs, with two switches:

- **Starts this pointing mode**: while this layer is on, held or locked, the
  mode runs. A layer starts one mode at most, so a layer that already starts
  another mode has this switch off limits, and the row says which mode
  (**already starts Volume**).
- **Turned on by this pointing mode's key**: while the mode's own key runs
  it, held or locked, this layer stays on, and goes off when the mode ends
  unless something else keeps it on. Any mix of layers, including ones other
  modes' keys turn on or that start another mode.

A default layer (always on, so the mode would run all the time) and the
pointer layer can't be in a link: their rows are dimmed, say why, and both
switches are off limits. Settings won't make a layer a link uses the
pointer layer or a default layer: take it out of the link first. A layer
reorder moves a link as it moves layer keys, so the same keys still start
the mode ([Rename & Reorder](board-and-layers.md#rename--reorder)). If a
profile arrives with a link on such a layer, the card and Review say the
keyboard ignores that layer until you switch it off.

Once a layer starts the mode, **Ends when another layer turns on** offers
three buttons:

- **Never**;
- **A higher layer**: a layer above the highest layer that starts this mode
  and is on;
- **Any layer**: any layer that is on and is in neither column.

That layer ends the mode, and it comes back when the layer goes off. The
pointer layer and the default layers never end it, and a mode started by its
key isn't affected. Switching off the last layer that starts the mode sets it
back to **Never**.

A mode started by its key wins over one its layers started. When several
modes' layers are on, the mode whose highest starting layer that is on ranks
highest runs; if another layer has ended that mode, the next one down runs
instead.

While a mode runs, however it started, its colour paints beneath the lowest
layer in either column that is on: those layers' own colours show over it, so
a layer coloured to light only its mapped keys shows those keys on the mode's
colour, and any higher layer covers both. To show only the layer, colour it
on all keys. With none of them on, or with no link, a mode paints over the
layers as before.

When the mode's key turns on a layer below the pointer layer and the mode
keeps the pointer layer, the pointer layer covers it, and the card warns you.
Have the key turn on a layer above it, or choose **Return to the typing
layer** under Advanced.

**Duplicate** copies the layers a mode's key turns on, but not the layers
that start it, since a layer starts only one mode; set those on the copy.

### Directional modes

Moving the ball sends a key or shortcut for each direction.

- **Reads**: **Dominant axis**, **Eight directions** (adds the diagonals),
  **Vertical only** or **Horizontal only**.
- Each direction takes a key or shortcut, chosen with **Pick…** or typed as a
  QMK keycode name. The field shows it as the picker does: "Mouse Button 3",
  a macro by its name.
- **When a direction is empty**: its neighbours take over, send both
  neighbours (eight directions only), or nothing.
- **How often it sends**: **Every step** sends again each time the ball moves
  a threshold further. **Once per movement** sends once, however far the ball
  goes, and again when it moves back the other way or after a short pause.

A direction can also click a mouse button, **Mouse Button 1** to **8**, or play
a macro. Both are in the picker. It can't move the pointer, scroll, or change
layers or modes.

The keyboard plays one macro at a time, and a trigger while one is playing is
dropped. For a longer macro, **Once per movement** is usually the better fit.

### Scrolling modes

- **Movement per wheel step**, across and up and down: how far the ball moves
  for one step of the wheel.
- **Scrolls**: **Both axes**, **Horizontal only** or **Vertical only**. With
  one axis, drift the other way doesn't scroll.
- **Reverse scrolling** for either axis or both.
- **Hold modifiers while scrolling**, for example Shift to scroll sideways in
  some apps.

### Advanced

**Advanced** holds the finer settings and stays open as you move between
slots:

- **After this mode ends**: keep the pointer layer on, or go back to the
  typing layer.
- How far the ball moves before a direction sends, shown in millimetres at
  the mode's DPI.
- **Held modifiers**: what each direction does when you are already holding
  modifiers. **Inherit modifiers** adds them, **Ignore** leaves out the ones
  you pick, and **Exact shortcut** sends only its own. A macro always inherits.
- **Scroll tuning** for scrolling modes: thresholds, gesture expiry and how it
  picks an axis.

Mouse buttons 1–3 always click as they do without the mode. A click from a
direction is one press and release, and a button already held stays held.
Your computer decides what each button number does.

Modes once had mouse button overrides, which made buttons 1–3 do something
else while the mode ran. The keyboard no longer has them; a linked layer does
that job (see [How it starts](#how-it-starts)). A backup made on firmware that had them is
from older firmware, and Ark refuses it (see
[Backups](backups.md)).
