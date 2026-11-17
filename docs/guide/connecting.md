# Connecting

Ark talks to your Charybdis over USB. It needs the left and right halves from
the [latest firmware
release](https://github.com/NoahCLR/charybdis-4x6/releases/latest), flashed to
both halves. It works with the current firmware only.

## Where Ark runs

Ark is a web page. Open <https://ark.ncleroy.dev> in Chrome or Edge on your
computer. There is nothing to install. The page reaches the keyboard over
WebHID, which only Chrome and Edge have, and only over HTTPS. In another
browser the page says Ark needs Chrome or Edge and offers only the demo. On a
phone it shows a short notice instead: a phone can't reach the keyboard.

## On Linux

Most Linux systems let Chrome only read a keyboard's hidraw device, so Chrome
lists the Charybdis but Ark can't open it: Ark says **Ark could not open the
keyboard** and points here. A udev rule gives it write access too. As
[Chrome's WebHID article](https://developer.chrome.com/docs/capabilities/hid)
gives it, for the Charybdis's vendor and product ids, put this line in
`/etc/udev/rules.d/50-charybdis.rules`:

```
KERNEL=="hidraw*", ATTRS{idVendor}=="a8f8", ATTRS{idProduct}=="1833", MODE="0664", GROUP="plugdev"
```

Your user must be in the `plugdev` group. Reload the rules with
`sudo udevadm control --reload-rules && sudo udevadm trigger`, then unplug the
keyboard and plug it back in.

## Reading the keyboard

With no keyboard, Ark shows **Connect your keyboard**. Choose **Choose
keyboard…** and pick your Charybdis in Chrome's list. After that the page
connects to it by itself whenever it opens. Under it, **Flash the firmware
first** is for a keyboard that doesn't have the firmware yet: **Firmware
releases** opens the [firmware's
releases](https://github.com/NoahCLR/charybdis-4x6/releases). Coming from
VIA, save your layout there before you flash, and once Ark has read the
keyboard [import it in Backups](backups.md#import-a-via-layout) to carry over
your keys and macros.

If something goes wrong, the message beside the rail starts with **Failed:**
and says what happened and what to do. A problem in Ark itself says only
that, and to reload the page if it keeps happening. If the page shows **Ark
did not finish loading**, reload it. If Ark itself fails to start, which
happens with JavaScript off, a file that didn't load, or a browser too old for
it, the page says what Ark needs instead of staying blank.

If a screen hits a problem in Ark while it is drawn, it says **Ark could not
draw this screen** in its place. The menu still works, and your draft is
kept while the page stays open, so choose another screen to carry on;
reloading the page loses a draft you haven't saved.

Ark then reads the whole profile the keyboard runs: keys, layers, behaviours,
combos, macros, pointing modes, lighting and settings. The screen says what it
is reading while it works, and the screens open once the read is done.
Everything Ark shows comes from that read.

A keyboard that has just been plugged in or restarted takes a few seconds to
start. Ark says **Waiting for the keyboard to finish starting…** and reads it
once it has. If it hasn't after 15 seconds, Ark says so; read it again in a
moment, or unplug it and plug it back in.

If the keyboard runs firmware other than the current one, Ark stops there
and says **This keyboard's firmware is not current, and Ark supports only
current firmware. Update both halves, then read the keyboard again.** Every
control that edits, and the Keyboard screen, says so too. Nothing on the
keyboard changes. The Keyboard screen links to the firmware's releases.

If Ark can show the keyboard but can't read its complete profile, the editing
screens say **Keyboard not ready for edits** and offer **Read keyboard** to
try again. The usual cause is a missing half: check the cable between the
halves.

## The rail

The column on the left is the rail. From the top:

- The keyboard button: the keyboard's name, its edit mode under it, and a
  dot that says how it is:
  - green: connected, both halves together
  - orange: the slave half isn't found, or the halves differ
  - red: no keyboard, or the keyboard needs a restart
  - grey: not read yet, or reconnecting
  - a hollow ring: the demo

  The dot pulses while Ark is reading or busy. Hover it for what it means and
  what to do: it also says when the keyboard is finishing a save, when a DPI
  or lighting key change is still reaching both halves, and in Live edit when
  the keyboard has saved by itself.

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
  demo, its menu offers only **Choose keyboard…**.
- The screens: **Keymap**, **Lighting**, **Macros**, **Custom keys** and
  **Pointing modes** under Configure; **Behaviours**, **Combos**, **Pointer**
  and **Host** under Settings, each showing all its settings at once;
  **Backups** and **Keyboard** under Keyboard. Elsewhere Ark calls those four
  Behaviour settings, Combo settings, Pointer settings and Host settings.
- Messages from Ark, each with ✕ to dismiss it. A long one scrolls in its own
  box rather than hiding the screens above it.
- **Draft history**, with undo and redo arrows and a count of the steps so far.

Rest the pointer on a button, a setting or a figure and a tip opens beside
the pointer, saying in one line what it does or showing it in full. Reaching
the control with the keyboard opens the tip too, over the control. A tip
never says what the screen already does: what a section or an idea means is
behind the ⓘ beside its heading, which a click keeps open.

In a window 1100 pixels wide or less, the rail keeps only its icons, so the
screen gets the width: hover an icon for its screen's name, and the keyboard
button is its dot. Messages then float over the screen's lower left corner.

With more than one Charybdis connected, pick which one to edit under
**Keyboard** in the keyboard menu. A draft with edits stays with its own
keyboard; the other stays read-only until you switch back or discard the
draft. With no keyboard connected, the bar says **Draft waiting for its
keyboard** and keeps your changes in Ark; connect the keyboard again with
**Choose keyboard…** to carry on.

## One tab, one keyboard

Only one Ark tab holds the keyboard. A second tab says Ark is open
in another tab, and takes over when that one closes. This holds too where
Chrome is set not to let Ark save data on your device. If closing or reloading
the tab would lose something (edits not saved, or a save still
running), the browser asks first.

Use one Ark page at a time: a tab can only see the other tabs at the same
address in the same browser and Chrome profile, so Ark open anywhere else
would reach the same keyboard, and the two would get in each other's way.

## The demo

No keyboard to hand? **Explore a demo** opens Ark on a complete example
profile with nothing connected: 16 layers, 32 pointing modes, 128 macros and
128 custom keys. Every screen works, and every edit shows up in Review. Only
saving needs a keyboard.

A strip across the top says **Demo · no keyboard**. It has two buttons:

- **Open a backup…** puts one of your backups in place of the demo
  profile.
- **Leave demo** goes back to connecting a keyboard.

Nothing in the demo reaches a keyboard and nothing is kept. To take what you
made to your keyboard, export it from Review or the Backups screen, then
import it there. If you leave with edits you haven't exported, Ark asks first
and offers **Export profile…**.

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

**Memory** shows how full the profile is. Behaviours, combos, macros, text
replacements, custom keys, pointing modes, lighting, settings and names share
one space. **In use** counts what you have set up against what the keyboard
holds, in the order of the rail's Configure screens and then Lighting:
behaviours, tap counts, combos, macros, the inputs of text replacements,
custom keys, pointing modes, LED sets and accents. Macro steps live in the
same space, within a limit of their own, shown as **Macro memory**, and so
does the text of replacements and their inputs, shown as **Text replacement
memory**. The bar turns orange from 90%, when the next edit may not
fit. While your draft has changes, the figures are the draft's. An edit that
would go past one of these counts, or past the shared space, is refused in the
draft before the keyboard sees it, saying which is full and what to remove.

**Read keyboard**, at the top right of This keyboard, reads the keyboard
again.

Ark hides its **Diagnostics** unless you ask for them: open Ark with
`?diagnostics` at the end of its address (for example
`https://ark.ncleroy.dev/?diagnostics`) and they appear at the bottom
of the Keyboard screen. They are for looking into a fault, not for using the
keyboard. They hold the details of the last read. Under them are the last few things Ark noted while
talking to the keyboard: connecting, a disconnect, an answer it set aside, and
a failure's own error with its code, which the message beside the rail leaves
out. It also shows each half's **flash pauses**: how long the master half and
the slave half each stopped to work on their flash since they started. That is
the longest erase of a sector, the longest write of a page, the most flash
time in one scan, how long the last save took and how much of it was flash,
and how many saves there have been. Hover over a figure for its exact
microseconds. Ark reads them when you open Diagnostics, when a keyboard
connects while it is open, and again with **Read keyboard** while it is
open; the slave
half's arrive through the master half, so they show a moment after the master
half's. A half with nothing to report yet says **not measured yet**. The demo
shows sample figures.

## Light and dark

The button at the top right of a screen switches between a light and a dark
theme. Ark starts from your system's setting and remembers your choice.
