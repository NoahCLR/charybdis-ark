# Connecting

Ark talks to your Charybdis over USB. It needs the left and right halves from
the [latest firmware release](https://github.com/NoahCLR/charybdis-4x6/releases/latest),
flashed to both halves. It works with the current firmware only.

## Where Ark runs

Ark is a web page. Open <https://ark.ncleroy.dev> in Chrome or Edge on your
computer. There is nothing to install. The page reaches the keyboard over
WebHID, which only Chrome and Edge have, and only over HTTPS. In another
browser the page says Ark needs Chrome or Edge and offers only the demo. On a
phone it shows a short notice instead: a phone can't reach the keyboard.

## Reading the keyboard

With no keyboard, Ark shows **Connect your keyboard**. Choose **Choose
keyboard** and pick your Charybdis in Chrome's list. After that the page
connects to it by itself whenever it opens.

Ark then reads the whole profile the keyboard runs: keys, layers, behaviours,
combos, macros, pointing modes, lighting and settings. The screen says what it
is reading while it works, and the screens open once the read is done.
Everything Ark shows comes from that read.

A keyboard that has just been plugged in or restarted takes a few seconds to
start. Ark says **Waiting for the keyboard to finish starting…** and reads it
once it has. If it hasn't after 15 seconds, Ark says so; read it again in a
moment, or unplug it and plug it back in.

If the keyboard runs older firmware, Ark stops there and tells you to update
both halves. Nothing on the keyboard changes. The Keyboard screen links to the
firmware release.

If Ark can show the keyboard but can't read its complete profile, the editing
screens say **Keyboard not ready for edits** and offer **Read keyboard** to
try again. The usual cause is a missing half: check the cable between the
halves.

## The rail

The column on the left is the rail. From the top:

- The keyboard button: the keyboard's name, its edit mode under it, and a
  dot that says how it is:
  - green: connected, both halves together
  - orange: the slave half isn't found, or the halves disagree
  - red: no keyboard, or the keyboard needs a restart
  - grey: not read yet, or reconnecting
  - a hollow ring: the demo

  The dot pulses while Ark is reading or busy. Hover it for what it means and
  what to do: it also says when the keyboard is finishing a save, when a DPI
  or lighting key change is still reaching both halves, and in Live edit when the
  keyboard has saved by itself.

  Click the button, or press Enter or ↓ on it, for its menu. The arrow keys
  move in it and Esc closes it.
  - **Edits**: how your edits reach the keyboard, each mode with what it
    does, and a ✓ on the current one. See
    [Review and save](review-and-save.md#edit-modes).
  - **Keyboard**: with more than one Charybdis connected, which one to edit.
  - **Choose keyboard…** and **Disconnect**. Disconnect lets go of the
    keyboard and takes back the page's permission to open it, until you
    choose it again.

  While the keyboard is busy the button waits. With no keyboard, or in the
  demo, its menu offers only Choose keyboard.
- The screens: **Keys**, **Lighting**, **Macros**, **Custom keys**, **Mouse**,
  **Pointing modes** and **Settings** under Configure; **Backups** and
  **Keyboard** under Keyboard.
- Messages from Ark, each with ✕ to dismiss it.
- **Draft history**, with undo (↺) and redo (↻).

With more than one Charybdis connected, pick which one to edit under
**Keyboard** in the keyboard menu. A draft with edits stays with its own
keyboard; the other stays read-only until you switch back or discard the
draft.

## One tab, one keyboard

Only one Ark tab holds the keyboard. A second tab says Ark is open
in another tab, and takes over when that one closes. If closing or reloading
the tab would lose something (edits not saved, or a save still
running), the browser asks first.

## The demo

No keyboard to hand? **Explore a demo** opens Ark on a complete setup with
nothing connected: 16 layers, 32 pointing modes, 128 macros and 128 custom
keys. Every screen works, and every edit shows up in Review. Only saving needs
a keyboard.

A strip across the top says **Demo · no keyboard**. It has two buttons:

- **Open a profile file…** puts one of your backups in place of the demo
  setup.
- **Leave demo** goes back to connecting a keyboard.

Nothing in the demo reaches a keyboard and nothing is kept. To take what you
made to your keyboard, export it from Review or the Backups screen, then
import it there. If you leave with edits you haven't exported, Ark asks first
and offers **Export…**.

The demo is offered only when no keyboard is connected.

## The Keyboard screen

The Keyboard screen is about the keyboard itself.

**Its name.** The title is the keyboard's name. Click it to rename the
keyboard, Enter to finish, Escape to put it back. Leave it empty for the
firmware's built-in name. A name is up to 32 bytes: letters take one,
accented letters two. The name is part of the profile, so it goes through
Review like any edit, and backups carry it. Once the keyboard has it, your
computer, Chrome and Ark all call it by that name. To take it, the keyboard
drops off USB for a moment and comes back, and Ark follows it. In Live edit the
keyboard is often saving the new name just then; Ark waits for the save and
reads it again rather than asking you to.

**This keyboard** shows the product, the firmware and whether it works with
this Ark, Ark's own version, and the two halves. The product is the
firmware's built-in name; a renamed keyboard reports only its new name, so
Ark leaves the product out rather than repeat the title. The halves are the
**Master half**, the right one with the USB cable and the trackball, and the
**Slave half**, the left one. Each says whether it is connected and holds the
same saved settings.

**Memory** shows how full the profile is. Behaviours, combos, lighting,
pointing modes, custom keys, settings and names share one space. **In use** counts what you have set up against what the keyboard
holds: behaviours, tap counts, combos, LED groups, LED overrides, macros,
custom keys and pointing modes. Macro steps live in the same space, within a limit
of their own, shown as **Macro memory**. The bar turns orange from 90%, when the next edit
may not fit. While your draft has changes, the figures are the draft's.

**Built into this firmware** lists what only a new firmware build can change:
how many layers, tap counts, macros, pointing modes and combos there are, the
repeat ceiling and the DPI steps.

**Diagnostics** holds the details of the last read and **Read keyboard**,
which reads it again. It also shows each half's **flash pauses**: how long
the master half and the slave half each stopped to work on their flash since
they started. That is the longest erase of a sector, the longest write of a
page, the most flash time in one scan, how long the last save took and how
much of it was flash, and how many saves there have been. Hover over a figure
for its exact microseconds. Ark reads them when you open Diagnostics, when a
keyboard connects while it is open, and again with its **Read keyboard**; the
slave half's arrive through the master half, so they show a moment after the
master half's. A half with nothing to report yet says **not measured yet**.
The demo shows sample figures.

## Light and dark

The button at the top right of a screen switches between a light and a dark
theme. Ark starts from your system's setting and remembers your choice.
