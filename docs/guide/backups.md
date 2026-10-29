# Backups

A backup is one file that holds everything the keyboard stores: keys,
layers, behaviours, combos, macros, custom keys, pointing modes, lighting,
settings and the keyboard's name. It holds the complete profile, so importing
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
had. In Review and save, the keyboard changes only once you review and save
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
Clearing the site's data deletes them, so download any you want to keep.

## Firmware updates

A backup imports onto the same firmware release. Ark works with the current
firmware only and converts nothing: when a firmware update changes how the
profile is stored, the keyboard starts from its compiled defaults and older
backups no longer import. Check the firmware's release notes before updating,
and export a fresh backup afterwards.

To go back to the profile you had before your changes, import a backup made
before them.
