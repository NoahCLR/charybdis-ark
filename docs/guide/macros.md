# Macros

A macro is a sequence one key plays: text, shortcuts, delays, keys held and
let go. The keyboard has 128 macro slots. A macro you name shows by that name
on the board and in the keycode picker.

## The slots

The **Macros** list opens on the slots in use, in order, each with its name
or a preview of its steps, and on the slot open in the editor. **+ New
macro** opens the first free slot with its name ready to type. **Show all
128 slots** lists the unused ones after it, M0 to M127. The heading counts
the slots in use, such as "18 of 128 used". **Search by name** finds a macro
by its name or its slot, through every slot.

A slot can carry a mark:

- **setup**: a character in it needs Unicode entry that isn't set up (see
  [Your computer](#your-computer)).
- **blocked**: it can't play with your computer's current settings. The
  editor says why.
- **unavailable**: an empty slot with no room left (see [Memory](#memory)).

## Writing a macro

Pick a slot. Its name is the editor's title: click it to rename, Enter to
finish, Escape to put it back.

Add steps with the buttons above the sequence:

- **+ Text** types what you type or paste, exactly: code, braces, line
  breaks, accents and emoji included.
- **+ Key or chord** taps a key, or up to 16 keys together, such as ⌘C.
- **+ Delay** waits, a number of milliseconds (ms).
- **+ Press** holds a key down, and **+ Release** lets it go.

Key steps open the keycode picker straight away. It offers only keys a macro
can send.

The sequence plays left to right as a row of tiles, each named under it:
↓ press, ↑ release, a dot for a key, + for a chord, and a time for a delay.
Click a tile to edit it underneath, with **← Earlier**, **Later →**,
**Done** and **Remove**; **Done** or Escape closes it and puts you back on
its tile. Drag a tile to move it anywhere in the sequence.

Selecting works as you'd expect: click, Shift-click a range, ⌘-click (Ctrl
off a Mac) to add one, ⌘A for all. ⌘C and ⌘V copy and paste steps, also into
another slot. Delete or Backspace removes the selected steps.

While you work in the macro editor, ⌘Z and ⇧⌘Z undo and redo whole steps.
Text fields keep their own typing undo.

A step that can't work, such as a key let go before it was pressed or still
held at the end, is marked ! and explained. Ark keeps such an edit out of
your draft until it is fixed, and never loses the last good version: ⌘Z
takes the edit back. A macro your draft changes has a dot on its slot. In the
live modes an edit reaches the keyboard once Ark has checked it, and the dot
marks a change the keyboard hasn't saved.

**Clear macro** empties the slot: its steps, its name and its playback
protection, in one step you can undo. Keys that play it stay on the board and
do nothing until the slot holds a macro again. **Place on a key →** takes you to the Keymap
screen to put the macro on a key. Under the title, chips name the layers
that use the macro and how (a key, a behaviour or a combo), or say it is not
placed yet; click one to see it there.

### Edit as text

The **Edit as text** switch shows the macro as text you can edit: `{KC_A}` taps a key,
`{+KC_A}` presses it, `{-KC_A}` lets it go and `{120}` waits 120 ms. Literal
braces are doubled, `{{` and `}}`. Text steps do that for you. A key is
named by a keycode the step editor offers, such as `KC_A`, never by a number
such as `{0x04}`, and an empty name between commas is left out, so `{KC_A,}`
is stored as `{KC_A}`. A macro that
doesn't read says why in the same words wherever Ark reads it: as you type,
when you save, and when a backup brings it.

## Recording

**Record** captures what you type into the selected slot and appends it as
steps. Keys pressed together become one chord: hold ⌘, press A, let go, and
you get ⌘A. Keys that roll over each other in a tangle stay as their press
and release steps. Every key you press goes into the take, Escape, Enter
and Tab included. **Stop**, holding Escape for a second, or clicking outside
the recorder finishes the take; so does switching slot or screen, or
switching to another window. A chord you were in the middle of when you
switched away (⌘Tab, Alt+Tab) is left out. The recorder's heading says **recording** while
it captures, and **recorded** while **Clear take** can still put the slot back.

- **Record delays** keeps the pauses longer than the time after each step,
  rounded to the second time. The wait before the first key is never recorded.
- **Preserve hold timing** keeps every press and release with its timing, for
  a macro that needs keys held for a while. It keeps Record delays on.
- **Clear take** puts back what the slot held before you recorded. Once you
  change the steps after a take, Clear take turns off and your edits stay.

The recorder takes every key a macro can send: letters, digits, F1–F24,
punctuation, modifiers, navigation keys, the numpad, Print Screen, the Menu
key and volume. Anything else is named under the recorder as not recorded.
Keys your computer or browser keeps for itself never reach the recorder and
still do what they always do: ⌘Tab, ⌘Space, ⌘W (it closes the tab) and ⌘Q on
a Mac, Alt+Tab and the Windows key's shortcuts on Windows. Add those, and an
Escape held longer than a second, as key steps instead.

On a Mac, keys pressed while ⌘ is held each become their own shortcut, so
holding ⌘ and pressing C then V records ⌘C then ⌘V. A Mac doesn't say when
those keys are let go. To record ⌘ with two other keys at once, add it as a
key step. On Windows, AltGr records as Right Alt.

## Uninterruptible playback

Each macro has an **Uninterruptible playback** setting:

- **Automatic** turns it on when your keyboard layout needs Unicode entry for
  the macro's text, and says after its name whether it is on or off.
- **On** makes the whole macro play uninterruptibly.
- **Off** lets your typing mix with it.

While a macro plays uninterruptibly, only the macro types. New key presses
are ignored, not queued. Keys you were already holding are suspended: modifiers
come back afterwards, but other keys need to be let go and pressed again. The
trackball and other keyboards are not held back.

## Your computer

Text is typed through your computer's keyboard layout, so Ark needs to know
which one you use. Set it under **Your computer** on **Host settings**; the
button at the foot of the macro editor takes you there.

- **Operating system**: **Auto** (what the keyboard detects over USB, named
  in the choice, such as **Auto (macOS detected)**), **macOS**, **Windows** or
  **Linux**. It sets how keys are named, the layouts offered and how Unicode
  is typed; it swaps no keys. Detection is a best guess, and a KVM or switch
  can fool it; pick yours if it's wrong.
- **Keyboard layout**: the layout your computer types with. US, plus ABC,
  Dutch, Unicode Hex Input, British, German and French on macOS; US
  International, United Kingdom, German and French on Windows and Linux.
  Changing the operating system brings the layout along to the same language
  where there is one.
- **ISO keyboard on macOS**: turn it on if macOS set this keyboard up as ISO.
  macOS then swaps the keys left of 1 and left of Z, and macros swap them too.
- **Unicode playback** (Windows and Linux) types characters your layout can't,
  such as emoji. On Windows it needs WinCompose running, with Right Alt as
  Compose; Ark links to it. On Linux it uses Ctrl+Shift+U, which not every app
  accepts.

On macOS, choose the **Unicode Hex Input** layout for emoji and other
characters your layout can't type, and make it your Mac's input source. While
it is active, Option symbols and shortcuts such as Option+Left may stop
working. Ark warns you, but it can't switch your Mac's input source or check
it.

The keyboard can't see how your computer is set up either. If a macro types
the wrong characters, check that Ark's layout matches the one your computer
uses.

Changing these settings rechecks every macro, and Review lists the macros
that now type differently or need a fix. A macro that can't type a character
with your setup says which one, and isn't kept until you fix it.

Keys are labelled the way your layout prints them, everywhere in Ark: with
German, the key QMK calls `KC_Y` reads Z. Modifiers are named for your
system: Command and Option on macOS, Windows and Alt on Windows, Super and Alt
on Linux. Only the labels change; the keys stored on the keyboard stay the
same.

## Memory

Macros share the profile's memory with everything else, within a macro limit
of their own. The **Macro memory** bar shows how much is used. A key tap takes
3 bytes; text takes its UTF-8 bytes. One macro can use all of it.

Every empty slot keeps room for ten key taps. When there isn't enough left,
the highest empty slots become **unavailable** until you shorten or clear a
macro.
