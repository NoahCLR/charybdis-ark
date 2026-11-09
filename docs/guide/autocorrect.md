# Autocorrect

The keyboard fixes the typos you list as you type, on any computer, with
nothing installed on it. The list is part of the keyboard's profile: Ark
edits it, both halves store it, and a backup holds it.

Everything here is on the **Autocorrect** screen.

## How the keyboard uses the list

An **entry** is one **correction**, the right word, and every **typo** that
should become it: `because` ← `becuase` `becasue` `beacuse`. The correction
is written once, and each typo belongs to one correction.

The keyboard corrects a typo when you finish the word, with a space, Enter or
punctuation. It erases only the part that differs and types the rest. A word
you are still typing is never touched.

Each typo says where it has to be in a word:

- **Whole word**, the default: the typo is the entire word. `teh` fixes
  "teh", and leaves "tehran" alone.
- **Start of word** and **End of word**: the word starts or ends with it.
- **Anywhere in a word**: it is somewhere in the word. `tihng` → `thing`,
  anywhere, also fixes "something" and "things".

Only the matched part is replaced. When more than one typo matches, a typo
that is the whole word wins, then the longest.

Typos match whatever their case, so a typo is stored in small letters. The
correction keeps your capitals: "Teh" becomes "The", "TEH" becomes "THE", and
a correction written with capitals, such as `iPhone`, keeps them.

## Adding an entry

Under **Add**, type the **Correction**, then its typos with a space between
them, pick where they match, and choose **Add** or press Enter.

Typing a correction the list already has adds the typos to that entry. The
list never holds the same correction twice.

Ark checks what you type as you type it, and says under the form why it
can't be added:

- a typo is the correction itself;
- a typo already belongs to another correction ("“teh” already corrects to
  “the”."); move it instead, as below;
- a typo holds something other than letters and digits. An apostrophe is
  allowed between two of them, as in `dosen't`;
- a correction or a typo is longer than 32 bytes. Accented letters take two
  or more bytes each;
- the list is full;
- your [host layout](macros.md#your-computer) can't type a character in it,
  so the keyboard could not type the correction.

## Editing the list

Each row is an entry: the correction, then its typos. A typo that doesn't
match the whole word says where it matches.

Click an entry to open it:

- **Correction** respells it. Respelling it to a correction the list already
  has joins the two entries.
- Each typo has its spelling, where it matches, **Move to…** and **×**.
  **Move to…** takes the correction the typo should belong to instead; a
  correction the list doesn't have yet is made.
- **Another typo, then Enter** adds one to this entry.
- **Delete entry** removes the correction and its typos. Deleting an entry's
  last typo removes the entry too.

A field is kept when you leave it or press Enter; Escape puts it back.
**Done** closes the entry.

**Search** finds entries by correction or by typo, and opens the entry a typo
was found in. **A to Z** and **Most typos** set the order.

## The starter list

**Add the starter list…** offers about 200 common English words with the
ways they are usually mistyped, some 400 typos, each matching the whole word.
An empty list offers it too. It is written for Ark, and no typo in it is an
English word.

It is added like a file: Ark first shows what it would do, as below.

## Importing a list

**Import…** opens a list from a file, or drop the file anywhere on the
screen. Ark reads three formats, by the file's extension:

- **`.txt`**, QMK's autocorrect dictionary: a line a typo, `typo ->
  correction`. A colon before the typo matches the start of a word, after it
  the end, both the whole word, and neither anywhere in a word: `:teh: -> the`,
  `tihng -> thing`. Lines that start with `#` and blank lines are skipped.
- **`.csv`**, a spreadsheet: columns `typos`, `correction` and, if you like,
  `match`. The typos cell can hold several typos with spaces between them.
  `match` is `whole word`, `start`, `end` or `anywhere`, and an empty one is
  the whole word. A header row that names the columns lets them be in any
  order. Files as Excel, Numbers and Google Sheets save them all work: commas
  or semicolons, quoted cells, with or without a header.
- **`.json`**, Ark's own format, as **Export** writes it.

In every format, lines and rows with the same correction, spelled exactly
alike, become one entry.

Before anything changes, Ark shows what the file would do, for each choice:

- the new corrections it makes, and their typos;
- the typos it adds to corrections you already have;
- the typos already in your list, which are skipped;
- the lines it refuses, each with its line or row number and the reason: the
  same checks as when you [add an entry](#adding-an-entry). A typo your list
  already sends to another correction is refused and named;
- how many typos don't fit, when the file holds more than the keyboard does.

Then choose **Add to my list**, which keeps your entries, or **Replace my
list**, which removes them first; or **Cancel**. Either is one step of the
draft, so Undo takes all of it back.

## Exporting your list

**Export as** saves the list as it is on screen, to your downloads:

- **Text**: QMK's form, a line a typo.
- **CSV**: a header row `correction,typos,match`, then a row for each
  correction and match, with that correction's typos in one cell. It opens in
  a spreadsheet one word a row.
- **JSON**: Ark's format, version 1:

  ```json
  {
    "version": 1,
    "entries": [
      {"correction": "because", "typos": [{"typo": "becuase", "match": "whole word"}]}
    ]
  }
  ```

  A file in another version is refused rather than guessed at.

A list exported in any format imports as the same list.

## Warnings

A warning marks an entry or a typo that will misbehave. It never stops you
saving.

- **It will not fire on your host layout.** After you change the host
  layout, the top of the screen says how many entries the new layout can't
  type, and each is marked. The keyboard skips them. Change the layout back
  or edit them. Review lists it too, as a warning to confirm once before
  saving.
- **A correction is itself a typo.** With `a` → `b` and `b` → `c`, typing
  "b" yourself gives "c". Two entries that correct to each other are marked
  as a loop.
- **A short part-of-word typo.** A typo under four letters that matches part
  of a word fires inside words you meant.
- **A typo that matches inside a correction.** Typing that correction would
  change it.

## Memory

The heading counts the corrections and typos. **Autocorrect memory** shows
what the list uses of what the keyboard holds: 1,024 corrections, 1,024
typos and 20,480 bytes of text on current firmware. The list also shares the
profile's memory with everything else.

## Review and backups

Review lists each changed entry once: added, removed or respelled, with the
typos added, removed, moved or matched elsewhere. **Discard** puts one entry
back. See [Review and save](review-and-save.md#review).

A [backup](backups.md) holds the whole list.
