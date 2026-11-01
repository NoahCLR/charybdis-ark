# Pointing

Two screens set up the trackball. **Pointer settings** (**Pointer** under
Settings in the rail) is how it moves the pointer. **Pointing modes**, under
Configure, make it do something else while a key is held or locked, or while
a layer is on: scroll, or send arrows and shortcuts as it moves.

Hover any label on Pointer settings for what it does.

## Pointer settings

**Pointer speed**

- **Normal pointer DPI**: the everyday speed, 400 to 3400 DPI.
- **Sniping DPI**: a slower speed for precise work, 100 to 400 DPI.
- **Sniping keys**, under it, shows where the **Sniping (hold)** and
  **Sniping toggle** keys are placed, with **Place on a key…** for each.
  Sniping is on while one of them is held or toggled, or one of the
  auto-sniping layers is on.

The DPI keys on the keyboard change these too, and Ark shows the new value.

**Auto-sniping**

- **Auto-sniping** uses the sniping speed while any of the **Auto-sniping
  layers** is on. Each layer has its own switch, as the other per-layer
  settings do, the [empty layers](board-and-layers.md#empty-layers) folded at
  the end. Turning **Auto-sniping** off keeps the layers you chose.
- While one of those layers is on, moving the ball doesn't turn on a separate
  pointer layer, so the layer's own keys stay under your hand.

Sniping slows directional pointing modes too; scrolling modes ignore it.

**Auto-mouse**

- **Auto-mouse** turns the **Pointer layer** on when you move the ball. A
  layer a pointing mode's link uses can't be the pointer layer.
- **Timeout**: how long the layer stays on after the ball stops. The lighting
  fade keeps its share of it (see [Lighting](lighting.md#auto-mouse-fade)).
- **Movement debounce**, **Delay after typing** and **Movement threshold**
  tune when movement counts.

## Pointing modes

There are 32 pointing slots. The screen works like Macros: the modes you have
are listed on the left by name and slot number, with their colour. **+ New
mode** opens the first empty slot, and **Show all 32 slots** shows the empty
ones too. An empty slot in amber still has keys pointing at it.

Each slot has two keys: one that runs the mode while it is held, and one that
locks it on until pressed again. The picker shows them as **Hold** and
**Lock** under Pointing modes.

The mode's name is the editor's title: click it to rename, up to 32 bytes
(an accented letter takes two). **Place on a key…** beside it puts the
mode's hold key on a key you pick on the board. **Duplicate** copies the mode
into the first empty slot, and **Clear mode** empties the slot.

The editor runs in four steps, top to bottom.

### Starting a mode

An empty slot asks what the trackball should do: **Scroll** or **Send keys**.
Pick one and the slot holds a new mode that moves that way. **Or copy a mode** copies
one you already have into the slot instead.

A key can point at an empty slot. It just does nothing until the slot holds a
mode, and its key on the board reads by the slot's number, such as **Slot 6 ·
hold (empty)**. So you can lay out the keys first and fill in the modes later,
and clearing a slot doesn't break the keys that use it.

### 1. What the ball does

**Scroll** or **Send keys**. Switching redraws the steps below for the other
movement; nothing is saved to your draft until you change one of its settings.

### 2. What each direction sends

For a mode that sends keys, each direction it reads is a key drawn where the
ball sends it, around the ball. Click a key to pick another; hover it and
click **×** to clear it. A direction with no key shows **+ Key**.

- **Reads**: **Dominant axis**, **Eight directions** (adds the diagonals),
  **Vertical only** or **Horizontal only**.
- The picker offers only what a pointing mode can send, and its search finds
  a key by its QMK name or alias too. A key shows as the picker names it:
  "Mouse Button 3", a macro by its name. A stored keycode QMK has no name for
  shows as its hex value, such as `0x1004`, and saves back unchanged.
- **When a direction has no key**: its neighbours take over, send both
  neighbours (eight directions only), or nothing.
- **How often it sends**: **Every step** sends again each time the ball moves
  a threshold further. **Once per movement** sends once, however far the ball
  goes, and again when it moves back the other way or after a short pause.

A direction can also click a mouse button, **Mouse Button 1** to **8**, or play
a macro. Both are in the picker. It can't move the pointer, scroll, or change
layers or modes.

The keyboard plays one macro at a time, and a trigger while one is playing is
dropped; the key says so under it. For a longer macro, **Once per movement**
is usually the better fit.

### 2. How it scrolls

For a scrolling mode:

- **Scrolls**: **Both axes**, **Horizontal only** or **Vertical only**. With
  one axis, drift the other way doesn't scroll.
- **Reverse scrolling**: a switch for each axis, **Horizontal** and
  **Vertical**.
- **Speed**: how far the ball moves for one scroll step, **sideways** and
  **up and down**. Lower scrolls faster.
- **Feel**: **Fastest repeat** is the shortest time between two scroll steps,
  and **Axis kept after the ball stops** is how long a scroll keeps its axis
  once the ball stops: move again within it and it carries on the same way.
- **Hold modifiers while scrolling**, for example Shift to scroll sideways in
  some apps.

### 3. What starts it

**Its keys** shows the mode's hold and lock keys, by the mode's name, and
where they sit on the board.

Then the layers. A layer the mode is linked to lends it its keys, whatever
they are: clicks, modifiers, layer keys, behaviours. This is where a mode gets
keys of its own: put what it needs on a layer, and have the layer start the
mode, the mode's key turn the layer on, or both. Each list shows its layers
as chips; **×** takes one out, and **+ Add layer** adds one. The menu lists
every other layer in the order of the layer tabs, the
[empty ones](board-and-layers.md#empty-layers) in their own group at its end.

- **Layers**: while one of these layers is on, held or locked, the mode
  runs. A layer starts one mode at most, so a layer that already starts
  another mode is greyed out in the menu, which says which mode (**already
  starts Volume**).
- **Its key turns on**: while the mode's own key runs it, held or locked,
  these layers stay on, and each goes off when the mode ends unless
  something else keeps it on. Any mix of layers, including ones other modes'
  keys turn on or that start another mode.

A default layer (always on, so the mode would run all the time) and the
pointer layer can't be in a link: they are greyed out in both menus, saying
why. Settings won't make a layer a link uses the pointer layer or a default
layer: take it out of the link first. A layer reorder moves a link as it moves
layer keys, so the same keys still start the mode
([Rename & reorder](board-and-layers.md#rename--reorder)). If a profile arrives
with a link on such a layer, the step and Review say the keyboard ignores that
layer until you remove it.

Once a layer starts the mode, **Ends when** offers three buttons:

- **Never**;
- **A higher layer**: a layer above the highest layer that starts this mode
  and is on;
- **Any layer**: any layer that is on and is in neither list.

That layer ends the mode, and it comes back when the layer goes off. The
pointer layer and the default layers never end it, and a mode started by its
key isn't affected. Removing the last layer that starts the mode sets it
back to **Never**.

A mode started by its key wins over one its layers started. When several
modes' layers are on, the mode whose highest starting layer that is on ranks
highest runs; if another layer has ended that mode, the next one down runs
instead.

While a mode runs, however it started, its colour paints beneath the lowest
layer in either list that is on: those layers' own colours show over it, so
a layer coloured to light only its mapped keys shows those keys on the mode's
colour, and any higher layer covers both. To show only the layer, colour it
on all keys. With none of them on, or with no link, a mode paints over the
layers as before.

When the mode's key turns on a layer below the pointer layer and the mode
keeps the pointer layer, the pointer layer covers it, and the step warns you.
Have the key turn on a layer above it, or choose **Return to the typing
layer** under **While it runs**.

**Duplicate** copies the layers a mode's key turns on, but not the layers
that start it, since a layer starts only one mode; set those on the copy.

### 4. While it runs

- **Pointer speed**: the mode's own DPI, or **Normal pointer speed** to keep
  the one set on Pointer settings.
- **Light**: its colour and where it paints, with **Edit in Lighting**.
- **Pointer layer**: **Keep the pointer layer active** leaves
  it on while the mode runs, and a locked mode keeps auto-mouse on. **Return
  to the typing layer** turns it off as the mode starts, so your typing
  layer's keys stay under your hand. A mode its layers started never keeps it
  on.

### Advanced

**Advanced** holds the finer settings and stays open as you move between
slots:

- **Distance**: how far the ball moves before a direction sends, shown in millimetres at
  the mode's DPI. With **Every step**, one key per this distance; with **Once
  per movement**, how far it must go before the key is sent at all.
- **Held modifiers**: what each direction does when you are already holding
  modifiers. **Inherit modifiers** adds them, **Ignore** leaves out the ones
  you pick, and **Exact shortcut** sends only its own. A macro always inherits.
- **Scroll tuning** for scrolling modes. Hover a setting for what it does:
  - **Horizontal** and **Vertical activation threshold**: how far the ball
    must move on an axis before a scroll can use it. When both axes are below
    their thresholds, the scroll lets go of its axis.
  - **Axis selection ratio**: to pick an axis, its movement must be at least
    this many times the other's (7 : 4 is 1.75 times). Higher needs a
    straighter movement before a scroll starts.
  - **Axis retention ratio**: a scroll keeps its axis while that axis moves at
    least this many times the other (5 : 4 is 1.25 times). Below it, the other
    axis takes over only if it reaches the selection ratio.
  - **Cross-axis decay divisor**: each scroll step divides the other axis's
    leftover movement by this, so drift across a scroll fades instead of
    building up.
  - **Leftover movement kept for**: movement that hasn't yet made a whole
    scroll step is kept this long after the ball stops, then forgotten.

Mouse buttons 1–3 always click as they do without the mode. A click from a
direction is one press and release, and a button already held stays held.
Your computer decides what each button number does.

Modes once had mouse button overrides, which made buttons 1–3 do something
else while the mode ran. The keyboard no longer has them; a linked layer does
that job (see [What starts it](#3-what-starts-it)). A backup made on firmware that
had them is from older firmware, and Ark refuses it (see
[Backups](backups.md)).
