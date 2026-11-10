# Text replacement

The keyboard replaces what you type when you finish a word, on any computer,
with nothing installed on it. It fixes a typo (`teh` becomes `the`), types
longer text for you (`pnumber` becomes your phone number) and can play a
macro. This is the keyboard's autocorrect: its keys are still named for that
(`AC_ON`, `AC_OFF`, `AC_TOGG`), and searching Ark for "autocorrect" finds
them.

Your list is part of the keyboard's profile: Ark edits it, both halves store
it, and a backup holds it. The list is on the **Text replacement** screen;
its switch is a setting, on **Host**.

## How the keyboard uses the list

An entry is one **replacement** and everything **typed** for it:
`because` for `becuase`, `becasue` and `beacuse`; `+31 6 1234 5678` for
`pnumber`. The replacement is written once, and each typed form belongs to
one replacement.

The keyboard replaces a typed form when you finish the word, with a space,
Enter, Tab or punctuation. It erases only the part that differs and types the
rest, then sends the key that ended the word, so Enter in a chat box sends
the replaced text. A word you are still typing is never touched.

A word is letters and digits, with apostrophes between them, so what you
type for a replacement is always one word: `pnumber`, `myemail`, `sig2`,
`dosen't`. Apostrophes before or after it stay as typed and aren't part of
it: `'teh'` is fixed as "teh". The keyboard follows a word up to 32
characters and leaves a longer one alone.

### Part of a word, with `*`

A typed form is the whole word unless you write it with `*` where other
letters may go:

| You write | It matches | So it also fixes |
| --- | --- | --- |
| `pnumber` | the whole word | nothing else: "pnumbers" is left alone |
| `recieve*` | the start of a word | "recieved", "recieving" |
| `*mnet` | the end of a word | "statemnet" |
| `*tihng*` | anywhere in a word | "sometihng", "tihngs" |

A `*` goes at the start, at the end, or both; nowhere else. Only the matched
part is replaced, and the rest of the word stays. When more than one typed
form matches, one that is the whole word wins, then the longest; of two as
long, the first in alphabetical order.

### A replacement is text or a macro

**Text** is one line of up to 128 bytes: a word, a phone number, an e-mail
address, a sign-off. It can hold spaces, digits and any punctuation your
[host layout](macros.md#your-computer) types. Accented letters take two or
more bytes each.

**A macro** is for anything longer, anything of more than one line, or
anything that is more than text. Choose **Macro** and pick one of your
[macros](macros.md) by name. When you finish the typed form, the keyboard
erases it, plays the macro, then sends the key you ended the word with. A
macro replacement differs from text:

- it replaces a whole word only, so what you type for it has no `*`;
- it plays as it is stored, whatever capitals you typed;
- Backspace does not take it back, since what a macro did can't be undone by
  erasing;
- if its macro is empty, the keyboard leaves what you typed. Ark marks such a
  replacement, here and in Review, until the macro has steps.

### Capitals

Typed forms match whatever their case, so one is stored in small letters. A
text replacement takes the case of the part it replaces, as the computer
shows it, Caps Lock included: "Teh" becomes "The", "TEH" becomes "THE", and
anything else, such as "tEh", gives the replacement as written. A replacement
written with capitals keeps them: "iphone" and "Iphone" both become `iPhone`.
Digits and punctuation have no capitals, so a phone number comes out as
written however you typed `pnumber`. When your layout can't type the
capitals, the keyboard types the replacement as written.

### Undoing a replacement

Press Backspace straight after a text replacement that a space or
punctuation ended, and the keyboard puts the word back as you typed it.
Ending the word again then leaves it alone. After Enter or Tab there is no
undo, since the text may already be sent: Backspace is just Backspace. A
macro has no undo.

### What it leaves alone

Only what you type counts. After a shortcut, an arrow or another cursor key,
Delete, a mouse click or a macro, the keyboard starts on a new word, so it
never replaces text it didn't see you type. After Backspace past the start of
the word, or a key held until it repeats, it waits for the next word.

A replacement takes a moment to type, about a hundredth of a second a
character, so the longest takes about a second and a half. You can type on:
the keys you press meanwhile wait and come out after it in order, and
modifiers you hold stay out of it.

Your list is stored on the keyboard as you wrote it, and anyone who connects
the keyboard to Ark can read it. Don't use a replacement for a password.

## Turning it on and off

The switch is on **Host**, under **Text replacement**: **Enabled** turns it
on or off for the whole keyboard. It is there because replacements are typed
through the host layout chosen above it, and because every such switch is a
Settings screen's: Behaviours, Combos and Pointer have theirs. It is saved
with the profile like any other setting. Off, the keyboard types every word
as you typed it and keeps your list. **Edit replacements →** under it goes to
the list, and while it is off the Text replacement screen says so across its
top, with the way back to the switch.

The keyboard can't see where you are typing. In a password field or a
terminal a replacement is wrong, so put a key on the keyboard to switch it
off there: **Text replacement Off** (`AC_OFF`) or **Toggle Text
replacement** (`AC_TOGG`), with **Text replacement On** (`AC_ON`) to switch
it back. They are [switch keys](behaviours.md#switch-keys): they work until
the keyboard restarts, save nothing, and can't turn on what is off in Host.
That is why the switch says **↺ keyboard keys change this too**, and
**turned off by key** while a key has it off. The picker lists them under
**Other QMK**, in **Switch keys**; searching it for "autocorrect" finds them
too.

## The list

Each row is a replacement, then what is typed for it as chips, each written
as you wrote it, with its `*`. A replacement that plays a macro is marked
**Macro** and shows the macro's name.

**Search** finds replacements by their text, by a macro's name, or by
something typed, and marks what it found. **A to Z** and **Most typed** set
the order.

### Adding a replacement

**Add replacement** opens a row at the top of the list.

1. Choose **Text** and type the replacement, or choose **Macro** and pick a
   macro. **New macro…** goes to Macros to make one.
2. Press Enter to move on, and type what you would type for it. A space or
   Enter turns each into a chip, so several can be typed in a row;
   Backspace in the empty field takes the last chip back, and its × removes
   it.
3. Press Enter in the empty field, or choose **Add**.

A replacement the list already has is added to, and the row says so before
you add: the list never holds the same replacement twice.

Ark checks what you type as you type it, and says under the row why it can't
be added:

- something typed is the replacement itself;
- something typed already belongs to another replacement ("“teh” is already
  typed for “the”."); move it instead, as below;
- something typed holds more than letters and digits. An apostrophe is
  allowed between two of them, as in `dosen't`;
- a `*` is somewhere other than the start or the end;
- a `*` is in something typed for a macro, which plays for a whole word;
- the replacement is longer than 128 bytes or more than one line: use a
  macro for that. What you type is at most 32 bytes;
- the list is full;
- your [host layout](macros.md#your-computer) can't type a character in it,
  so the keyboard could not type the replacement.

### Changing a row

- **The replacement**: click it to change it where it stands, to other text
  or, with **Macro**, to a macro. Enter keeps it; Escape leaves it. Changing
  it to a replacement the list already has joins the two.
- **+ typed**, at the end of a row's chips: type one more thing and press
  Enter. The field stays for the next; Escape closes it.
- **A chip** opens a small panel for that typed form: how it is **Typed**,
  with or without `*`; **Move to**, which takes the replacement it should
  belong to instead, and makes one the list doesn't have yet; and
  **Remove**. Removing a replacement's last typed form removes the
  replacement.
- **×**, at the end of a row: deletes the replacement and everything typed
  for it. Undo takes it back.

Everything is one step of the draft, so [Undo](review-and-save.md) works on
each.

## Try it

**Try it**, beside the list, is a box to type in as you would on the
keyboard. It shows what the computer would end with, using the list as it
stands in the draft and your host layout: type `teh` and a space, and the box
reads "the ". The line under it says what was replaced, and that replacement
and its chip are marked in the list. Backspace straight after puts the word
back, as on the keyboard. **Caps Lock** follows your own Caps Lock while you
type there, and can be set by hand.

For a replacement that plays a macro, the line says which: "“sig” plays
macro “Sign-off”." The box shows the macro's text when the macro is only
text; for a macro of keys and waits it shows what you typed gone, since Ark
does not play macros.

Try it reads text, so it can't show what depends on keys and time: a
shortcut, a cursor key, a held key, a macro key, or keys pressed while a
replacement is typed. An edit in the middle of the box counts as a click
would: the text stays and the next key starts a new word. Try it works
whether text replacement is on or off. On a narrow window it folds under the
list.

## Common typo fixes

An empty list offers **Add common typo fixes**: about 200 common English
words with the ways they are usually mistyped, some 400 typed forms, each a
whole word. It is written for Ark, and nothing typed in it is an English
word. It is added like a file: Ark first shows what it would do, as below.

## Importing a list

**Import…** opens a list from a file, or drop the file anywhere on the
screen. Ark reads three formats, by the file's extension:

- **`.json`**, Ark's own format, as **Export** writes it.
- **`.csv`**, a spreadsheet: columns `replacement` and `typed` under a
  header row, in any order. The typed cell can hold several typed forms with
  spaces between them, each with its own `*`. A row that plays a macro has
  the macro's number in a `macro` column and no replacement. Files as Excel,
  Numbers and Google Sheets save them all work: commas or semicolons, quoted
  cells.
- **`.txt`**, QMK's autocorrect dictionary: a line for each typed form,
  `typo -> correction`. QMK writes where it matches with colons, which Ark
  reads as its `*`: `:teh:` is `teh`, `:recieve` is `recieve*`, `mnet:` is
  `*mnet`, and with no colons `tihng` is `*tihng*`. Lines that start with
  `#` and blank lines are skipped.

Files written before, by Ark or by hand, still read: a spreadsheet whose
columns are `typos`, `correction` and `match` (`whole word`, `start`, `end`
or `anywhere`), with or without its header row, and JSON with `entries`,
`correction` and `typos`.

In every format, lines and rows with the same replacement, spelled exactly
alike, become one entry.

Before anything changes, Ark shows what the file would do, for each choice:

- the new replacements it makes, and what is typed for them;
- what it adds to replacements you already have;
- what is already in your list, which is skipped;
- the lines it refuses, each with its line or row number and the reason: the
  same checks as when you [add a replacement](#adding-a-replacement).
  Something typed that your list already has for another replacement is
  refused and named;
- how many don't fit, when the file holds more than the keyboard does.

Then choose **Add to my list**, which keeps your entries, or **Replace my
list**, which removes them first; or **Cancel**. Either is one step of the
draft, so Undo takes all of it back.

## Exporting your list

**Export** saves the list as it is on screen, to your downloads, in the
format you pick from its menu:

- **Text (QMK)**: QMK's form, a line for each typed form, with its colons.
  It has no way to say a macro, so a replacement that plays one is left out,
  and the file's first line says how many were.
- **CSV**: a header row `replacement,typed`, then a row for each
  replacement with everything typed for it in one cell. With a replacement
  that plays a macro in the list, a third column, `macro`, holds the macro's
  number.
- **JSON**: Ark's format, version 1:

  ```json
  {
    "version": 1,
    "replacements": [
      {"replacement": "because", "typed": ["becuase", "becasue"]},
      {"replacement": "receive", "typed": ["recieve*"]},
      {"macro": 5, "typed": ["sig"]}
    ]
  }
  ```

  A file in another version is refused rather than guessed at.

A list exported as CSV or JSON imports as the same list, and so does one
exported as text when no replacement plays a macro. A macro is named by its
number, so a list with one fits the keyboard it came from.

## Warnings

A warning marks a replacement or a chip in amber, with its reason on the row
or in the chip's panel. It never stops you saving.

- **It will not fire on your host layout.** After you change the host
  layout, the top of the screen says how many replacements the new layout
  can't type, and each is marked. The keyboard skips them. Change the layout
  back or edit them. Review lists it too, as a warning to confirm once
  before saving.
- **Its macro is empty.** The keyboard leaves what you typed. Add steps in
  Macros or choose another replacement. Review lists it too, as it lists a
  pointing mode that runs an empty macro.
- **A replacement is itself typed for another.** With `a` for `b` and `b`
  for `c`, typing "b" yourself gives "c". Two entries that replace each
  other are marked as a loop.
- **A short typed form with `*`.** Under four letters, it fires inside many
  words you meant.
- **A typed form that matches inside a replacement.** Typing that
  replacement would change it.

## Memory

The heading counts your replacements and everything typed for them. Under
the list, a bar shows the list's memory, with what it uses of what the
keyboard holds: 1,024 typed forms and 34,824 bytes on current firmware. The
list also shares the profile's memory with everything else; the
[Keyboard screen](connecting.md#the-keyboard-screen)'s **Memory** panel shows both, with
**Text replacement typed** among the counts and **Text replacement memory**
after Macro memory.

## Review and backups

Review lists each changed entry once, under **Text replacement**: added,
removed, or with another replacement, and what was typed for it added,
removed, moved or written anew, each as it is written. **Discard** puts one
entry back. The switch is a setting, reviewed under **Settings**. See
[Review and save](review-and-save.md#review).

A [backup](backups.md) holds the whole list.
