# Pointing

Two screens set up the trackball. **Mouse** is how it moves the pointer.
**Pointing modes** make it do something else while a key is held or locked:
scroll, or send arrows and shortcuts as it moves.

Hover any label on Mouse for what it does.

## Mouse

**Pointer speed**

- **Normal pointer DPI**: the everyday speed, 400 to 3400 DPI.
- **Sniping DPI**: a slower speed for precise work, 100 to 400 DPI.

The DPI keys on the keyboard change these too, and Ark shows the new value.

**Auto-sniping**

- **Auto-sniping** uses the sniping speed while the **Auto-sniping layer** is
  on.
- **Sniping keys** shows where the **Sniping (hold)** and **Sniping toggle**
  keys are placed, with **Place on a key…** for each. Sniping is on while one
  of them is held or toggled, or the auto-sniping layer is on.

Sniping slows directional pointing modes too; scrolling modes ignore it.

**Auto-mouse**

- **Auto-mouse** turns the **Auto-mouse layer** on when you move the ball.
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
- **Duplicate** copies the mode into the first empty slot. **Clear slot**
  empties it.

Under the editor, **Keys** shows where the mode's hold and lock keys sit,
with **Place on a key…**, which puts its hold key on a key you pick on the
board. **Light** shows its colour and where it paints,
with **Edit in Lighting**.

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
- **Mouse button overrides**: while the mode runs, each button can pass
  through, do nothing, tap a shortcut or hold modifiers.

A click from a direction or an override is one press and release. It doesn't
run that button's own override, and a button already held stays held. Your
computer decides what each button number does.
