# Backups

A backup is one file that holds everything the keyboard stores: keys,
layers, behaviours, combos, macros, the text replacement list, custom keys,
pointing modes, lighting, settings and the keyboard's name. It holds the complete profile, so importing
it doesn't depend on what the keyboard had before.

Everything here is on the **Backups** screen. It needs a keyboard on current
firmware, or the demo.

## Export profile

**Export profile…** saves the profile the keyboard runs as a backup. It
changes nothing on the keyboard or in your draft. The file goes to your
downloads, named like
`charybdis-2026-10-23.charybdis.json`.

In Live preview + save it exports what the keyboard runs, unsaved changes
included.

Keep one somewhere safe before you try something big.

## Import profile

**Import profile…**, or drop a backup file onto the **Import profile** card.
Ark checks the file and compares it with the keyboard before anything
changes. The sheet says:

- whether it fits the keyboard's memory ("This file fits: 5,408 of 130,048
  bytes"), or warns that it doesn't ("This file does not fit: 140,000 bytes,
  and this keyboard holds 130,048."),
- how many things it changes, counted by what they are: keys on each layer,
  behaviours, lighting, macros and so on.

**Use as draft** makes the file your draft. Undo brings back the draft you
had. **Cancel**, or Escape, closes the sheet and changes nothing. In Review and save, the keyboard changes only once you review and save
it; in Live preview + save the file is sent to the keyboard as unsaved edits,
for you to review and save.

A file that holds exactly what the keyboard runs changes nothing, so it can't
be used, unless your draft has edits: then using it puts the draft back to
the keyboard's profile, like **Discard all**.

Ark refuses a file it can't read, more than one file at a time, and a file
from older firmware. It never replaces your draft with a file it refused.

A backup always becomes a draft first, so **Import profile…** and a recovery
copy's **Use as draft** wait until Ark has read the keyboard's complete
profile. If it can't, read the keyboard again (see
[Connecting](connecting.md#reading-the-keyboard)).

## Import a VIA layout

Coming from VIA? Save your layout there (**Save + Load**, **Save Current
Layout**), then choose or drop that `.layout.json` file on the **Import
profile** card here, as you would a backup. It opens the same sheet, titled
"Use this VIA layout as your draft?".

A VIA layout holds keys and macros only, so it changes only those:

- its layers replace Base and the layers after it, as many as the file has,
  and every layer above them is emptied (all transparent),
- its macros fill the first macro slots, and every slot above them is
  emptied,
- layer and macro names are cleared, since they named what was there before,
  and so is everything else set per layer: combo matching, the keys taken out
  of behaviours or combos, default layers, auto-sniping layers, and which
  layers use behaviours and combos (all of them again). The layers the file
  doesn't fill also lose their colours and accents; the ones it fills keep
  theirs.
- the pointer layer (Auto-mouse's) becomes the file's highest layer above
  Base with mouse buttons, where VIA keymaps keep them; if no layer has any,
  Auto-mouse is turned off. Pointing modes stop being started by layers the
  file empties. The sheet says when the pointer layer moved or Auto-mouse
  turned off.

Importing a VIA layout is a fresh start, so by default your draft's
behaviours, combos and custom keys go too. When your draft has any, the
sheet asks "Start from a blank slate?" with a switch for each, all on to
begin with; turn one off to keep that kind:

- **Remove the draft's behaviours**: the behaviours on ordinary keys.
- **Remove the draft's combos**: every combo. Combo timing is a setting, so it
  stays.
- **Remove the draft's custom keys, with their behaviours**: each custom key's
  name, shortcut and behaviour, as **Clear** in Keys does.

Each switch updates the sheet's counts at once, so they always say what
**Use as draft** does. Whatever you keep still turns on the layers it turned
on, so those layers stay listed instead of folding away as empty layers.
Pointing modes, the rest of lighting and settings, and the text replacement
list stay as your draft has them.

A key Ark doesn't know or can't place, a custom key from older Ark firmware
(which does nothing on current firmware), or a macro it can't type, is left
empty, and the sheet lists each with why ("Left empty: 1 key and 1 macro Ark
cannot bring from this file"). Everything else in the file still comes. Ark
refuses a layout for another keyboard (its layers don't have the 4x6's 60
keys) or with more layers than the keyboard holds.

A VIA layout comes into your draft, so it needs the keyboard's complete
profile read first. **Undo** takes the whole import back.

## Recovery copies

Before every save and before leaving Live edit, Ark saves a recovery copy of
what the keyboard held, and it doesn't save anything if it can't save one. A
restart with unsaved edits keeps a copy of those edits the same way.

Each copy is named by what made it, the keyboard it came from and when, for
example "Before saving live edits · Noah's Charybdis · 23 Oct 2026, 14:02". A
copy from before a save in Review and save is "Before saving a draft". Copies
kept by an older Ark don't record those, and are named "Recovery copy" and
when.

The copies are kept in the browser and listed under **Recovery copies**,
newest first, each with **Use as draft**, **Download** and **Delete**. Use as
draft opens the same comparison as a backup file. A downloaded copy is named
the same way (`recovery-<when>-before-save-noah-s-charybdis.charybdis.json`).
A deleted copy is gone for good, so **Delete** asks first, in the copy's row:
"Delete this copy?" with **Cancel** and **Delete**. Cancel, or Escape, leaves
the copy as it was. Clearing the site's data deletes them, so download any
you want to keep.

## Firmware updates

A backup imports onto the same firmware release. Ark works with the current
firmware only and converts nothing: when a firmware update changes how the
profile is stored, the keyboard starts from its compiled defaults and older
backups no longer import. Check the firmware's release notes before updating,
and export a fresh backup afterwards.

To go back to the profile you had before your changes, import a backup made
before them.
