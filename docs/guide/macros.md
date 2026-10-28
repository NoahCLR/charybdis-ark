# Macros

A macro is a sequence one key plays: text, shortcuts, delays, keys held and
let go. The keyboard has 128 macro slots. A macro you name shows by that name
on the board and in the keycode picker.

## The slots

The **Slots** list shows every slot, M0 to M127, with its name or a preview
of its steps. The heading counts the slots in use, such as "18 of 128 used".
**Search by name** finds a macro by its name.

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
- **+ Delay** waits, in milliseconds.
- **+ Press** holds a key down, and **+ Release** lets it go.

Key steps open the keycode picker straight away. It offers only keys a macro
can send.

The sequence plays left to right as a row of tiles: ↓ press, ↑ release, a dot
for a tap, + for a chord, and a time for a wait. Click a tile to edit it
underneath, with **← Earlier**, **Later →** and **Remove**. Drag a tile to
move it anywhere in the sequence.

Selecting works as you'd expect: click, Shift-click a range, ⌘-click (Ctrl
off a Mac) to add one, ⌘A for all. ⌘C and ⌘V copy and paste steps, also into
another slot. Delete or Backspace removes the selected steps.

While you work in the macro editor, ⌘Z and ⇧⌘Z undo and redo whole steps.
Text fields keep their own typing undo.

A step that can't work, such as a key let go before it was pressed or still
held at the end, is marked ! and explained. Ark keeps such an edit out of
your draft until it is fixed, and never loses the last good version.
**Discard local edits** drops an edit that isn't in the draft yet. The chip
beside it says where the macro stands: **edited here** while an edit is not in
the draft yet, **changed in draft** once the draft changes the macro, and
**as read** when it matches the keyboard (in the demo, the demo setup).

**Clear macro** empties the slot. **Place on a key…** takes you to the Keymap
screen to put the macro on a key. Beside the title, chips name the layers
that use the macro; click one to see it there.

### Raw payload

The **Raw payload** switch shows the macro as text: `{KC_A}` taps a key,
`{+KC_A}` presses it, `{-KC_A}` lets it go and `{120}` waits 120 ms. Literal
braces are doubled, `{{` and `}}`. Text steps do that for you. A key is
named by a keycode the step editor offers, such as `KC_A`, never by a number
such as `{0x04}`, and an empty name between commas is left out, so `{KC_A,}`
is stored as `{KC_A}`. A macro that
doesn't read says why in the same words wherever Ark reads it: as you type,
when you save, and when a backup brings it.

## Recording

**● Record** captures what you type into the selected slot and appends it as
steps. Keys pressed together become one chord: hold ⌘, press A, let go, and
you get ⌘A. **Stop**, Escape, or clicking outside the recorder finishes the
take; so does switching slot or screen.

- **Record delays** keeps pauses longer than **After**, rounded to **Round
  to**. The wait before the first key is never recorded.
- **Preserve hold timing** keeps every press and release with its timing, for
  a macro that needs keys held for a while. It keeps Record delays on.
- **Clear take** puts back what the slot held before you recorded. Once you
  change the steps after a take, Clear take turns off and your edits stay.

The recorder takes every key a macro can send: letters, digits, F1–F24,
punctuation, modifiers, navigation keys, the numpad, Print Screen, the Menu
key and volume. Anything else is named under the recorder as not recorded.

## Uninterruptible playback

Each macro has a playback setting:

- **Automatic** turns protection on when your keyboard layout needs Unicode
  entry for the macro's text.
- **On** protects the whole macro.
- **Off** lets your typing mix with it.

While a protected macro plays, only the macro types. New key presses are
ignored, not queued. Keys you were already holding are suspended: modifiers
come back afterwards, but other keys need to be let go and pressed again. The
trackball and other keyboards are not held back.

## Your computer

Text is typed through your computer's keyboard layout, so Ark needs to know
which one you use. Set it under **Your computer** on **Host settings**; the
button at the foot of the macro editor takes you there.

- **Operating system**: **Auto** (what the keyboard detects over USB),
  **macOS**, **Windows** or **Linux**. It sets how keys are named, the layouts
  offered and how Unicode is typed. Detection is a best guess, and a KVM or
  switch can fool it; pick yours if it's wrong.
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
