# Text replacement

The keyboard replaces what you type when you finish a word, on any computer,
with nothing installed on it. It fixes a typo (`teh` becomes `the`), types
longer text for you (`pnumber` becomes your phone number) and can play a
macro. A replacement can fire after its own [Leader key](#after-the-leader-key)
instead, or both ways: then what you type after Leader is never seen by the
computer. This is the keyboard's autocorrect: its keys are still named for that
(`AC_ON`, `AC_OFF`, `AC_TOGG`), and searching Ark for "autocorrect" finds
them.

Your list is part of the keyboard's profile: Ark edits it, both halves store
it, and a backup holds it. The list is on the **Text replacement** screen;
its switch is a setting, on **Host**.

## How the keyboard uses the list

An entry is one **replacement** and its **inputs**, what you type to get
it: `because` for `becuase`, `becasue` and `beacuse`; `+31 6 1234 5678` for
`pnumber`. The replacement is written once, and each input belongs to one
replacement.

The keyboard replaces an input when you finish the word, with a space,
Enter, Tab or punctuation. It erases only the part that differs and types the
rest, then sends the key that ended the word, so Enter in a chat box sends
the replaced text. A word you are still typing is never touched.

A word is letters and digits, with apostrophes between them, so an input
typed as you type is always one word: `pnumber`, `myemail`, `sig2`,
`dosen't`. Apostrophes before or after it stay as typed and aren't part of
it: `'teh'` is fixed as "teh". The keyboard follows a word up to 32
characters and leaves a longer one alone.

### Part of a word, with `*`

An input is the whole word unless you write it with `*` where other
letters may go:

| You write | It matches | So it also fixes |
| --- | --- | --- |
| `pnumber` | the whole word | nothing else: "pnumbers" is left alone |
| `recieve*` | the start of a word | "recieved", "recieving" |
| `*mnet` | the end of a word | "statemnet" |
| `*tihng*` | anywhere in a word | "sometihng", "tihngs" |

A `*` goes at the start, at the end, or both; nowhere else. Only the matched
part is replaced, and the rest of the word stays. When more than one input
matches, one that is the whole word wins, then the longest; of two as
long, the first in alphabetical order.

### A replacement is text or a macro

**Text** is one line of up to 128 bytes: a word, a phone number, an e-mail
address, a sign-off. It can hold spaces, digits and any punctuation your
[host layout](macros.md#your-computer) types. Accented letters take two or
more bytes each.

**A macro** is for anything longer, anything of more than one line, or
anything that is more than text. Choose **Macro** and pick one of your
[macros](macros.md) by name, [as below](#replacement). When you finish the input, the keyboard
erases it, plays the macro, then sends the key you ended the word with. A
macro replacement differs from text:

- it replaces a whole word only, so its inputs have no `*`;
- it plays as it is stored, whatever capitals you typed;
- Backspace does not take it back, since what a macro did can't be undone by
  erasing;
- if its macro is empty, the keyboard leaves what you typed. Ark marks such a
  replacement, here and in Review, until the macro has steps.

### Capitals

Inputs match whatever their case, so one is stored in small letters. A
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

### A flash when it replaces

The keyboard can flash once as it replaces what you typed, in one colour for
text, another for a macro and a third when Backspace undoes a replacement,
so a change you did not expect does not pass unseen. A word it leaves alone
never flashes. What the [Leader key](#after-the-leader-key) sends flashes
the same way, in the text or macro colour: that flash is how you know it
went. The colours, where the flash paints and its switch are
[Replacement feedback](lighting.md#replacement-feedback) on Lighting.

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

### After the Leader key

Each replacement **fires** as you type, after the **Leader** key, or both:
you choose it on its editor, and its inputs stay the same whichever you
choose. After Leader, the keyboard holds back what you type and sends the
replacement, so nothing you typed reaches the computer; a replacement that
fires after Leader alone is left as you typed it when you finish its input
as a word. Put Leader on a key, in a behaviour's tap or hold, or as a combo's
output; the picker has it under **Other QMK**, in **Text replacement**, and
searching for "leader" finds it. A replacement's editor says where it is
while the replacement fires after Leader, with **Place on a key →**. Then press Leader and type `pn`, and your
phone number is all the computer sees.

- It sends as soon as no other input that fires after Leader could still
  follow: with `pn` on your list, Leader then `p` `n` sends at once.
- When one such input begins another, `abc` and `abcd`, press Enter to send
  the shorter one, or wait: after **Leader waits** on Host (2000 ms unless
  you set another, 1000 to 10000), it is sent too.
- A character that leaves what you typed the start of no such input drops
  it, that character included, and nothing is sent. Escape drops it too, and
  so do Enter and the wait when what you typed is none.
- Backspace takes back the last character, and with nothing typed ends it;
  Leader again starts over. Any other key, an arrow, Tab, a shortcut, a click
  or a macro key, ends it with nothing sent and then does what it always does.

An input is a word after Leader too, typed whole: `recieve*` is sent by
`recieve`, and a space or punctuation mark is in no input, so typing one drops
what you typed. Its replacement is typed exactly as written, with no capitals
rule, and there is no taking it back: Backspace afterwards is just Backspace.
A replacement that plays a macro can fire after Leader too. What the leader
sends flashes as any replacement does (above), and one that sends nothing
does not flash.

The leader works with text replacement switched off, on Host or by key. Ark
warns before you apply a list with replacements that fire after Leader and no
Leader key anywhere, and a Leader key with nothing on the list that fires
after it.

## Turning it on and off

The switch is on **Host**, under **Text replacement**: **Enabled** turns it
on or off for the whole keyboard. It is there because replacements are typed
through the host layout chosen above it, and because every such switch is a
Settings screen's: Behaviours, Combos and Pointer have theirs. It is saved
with the profile like any other setting. Off, the keyboard types every word
as you typed it and keeps your list. While it is off the Text replacement
screen says so across its top, with the way back to the switch. The Leader
key still sends the replacements that fire after it while it is off.
**Leader waits**, under **Enabled**, is how long the leader waits before it
sends an input that a longer one begins with.

The keyboard can't see where you are typing. In a password field or a
terminal a replacement is wrong, so put a key on the keyboard to switch it
off there: **Text replacement Off** (`AC_OFF`) or **Toggle Text
replacement** (`AC_TOGG`), with **Text replacement On** (`AC_ON`) to switch
it back. They are [switch keys](behaviours.md#switch-keys): they work until
the keyboard restarts, save nothing, and can't turn on what is off in Host.
That is why the switch says **↺ keyboard keys change this too**, and
**turned off by key** while a key has it off. The picker lists them under
**Other QMK**, in **Switch keys**, beside those for combos, behaviours and
auto-mouse; searching it for "autocorrect" finds them too.

## The replacements

The screen works as [Macros](macros.md) does: the list of **Replacements**
at the left, and the one you pick open beside it.

Each replacement is on one line, text as it is and a macro by its name after
the macros' icon (the one Macros and the key picker show), with its inputs
under it, each written as you wrote it, with its `*`.
That is what a replacement is called everywhere: here, in its editor's
title, in Review and in an import's summary. The first is open until you
pick another, and the one you picked stays open when you come back to the
screen. A dot marks one changed in your draft.

**Search** finds replacements by their text, by a macro's name or by an
input as it is written, and marks the inputs it found. A search that finds
nothing leaves the replacement that was open as it is. The heading counts
your inputs against what the keyboard holds, and under the list are **+ New
replacement** (while you are not searching), **Import…** and **Export**, and
the list's [memory](#memory).

Ark comes with no list of its own. With nothing in yours yet, the editor's
place says what a replacement is and offers the two ways to a first list:
**+ New replacement**, or **Import…** for a list you already have
([below](#importing-a-list)).

## Writing a replacement

The replacement open at the right has its name across the top, **Text** or
**Macro** beside it, and **Delete replacement**, which deletes it with its
inputs. Under that are its three parts.

### Replacement

Choose **Text** and type it; a counter under the field says how many of its
128 bytes it uses. Enter, or leaving the field, keeps it; Escape puts back
what it was. Changing it to a replacement the list already has joins the
two, and Ark says so under the field before you keep it: "“the” is already
on your list: this one's inputs will join it."

Or choose **Macro**. The macro's name shows in the field beside it;
**Pick…**, or the field itself, opens the same picker a key's keycode is
picked in, here with only your macros that have steps (an empty macro would
play nothing). Pick one and choose **Use keycode**. With no macro that has
steps yet, Pick… is off and **Make one in Macros →** goes there.
**Edit in Macros →**, in the editor's header, goes to the picked macro to see
or change its steps. Choosing Text or Macro changes nothing until you type
the text or pick the macro, and a line under the choice says so until then.

The ⓘ beside **Replacement**, **Inputs** and **Try it** sums up how each
works: when the keyboard replaces, capitals, Backspace and macros; how an
input is written with `*`, the wildcard, with examples and where it may go;
and what the preview can and cannot show. Hover
it, or reach it with Tab; Escape closes it. In a small window the list opens
where there is room, and scrolls when it is taller than that.

### Fires

**As you type**, **After Leader** or **Both** says how this replacement
fires: as you finish a word, after the [Leader key](#after-the-leader-key),
or either way. It is saved as soon as you choose, and its inputs stay as they
are. While it fires after Leader, a line under the choice says what the
Leader key does and where it is placed (keys by layer, behaviours, combos),
and **Place on a key →** takes you to the board to put it on a key. In the list each replacement is tagged
**As you type**, **After Leader** or **Both**.

### Inputs

The inputs are chips.

- **+ Input** opens a field: type an input and press Enter. Several with
  spaces between them are each added. The field empties for the next at
  once, so you can type one after another without waiting; Enter in it
  empty, or Escape, closes it. An input Ark can't keep comes back into the
  field with the reason under it, and nothing is added.
- **A chip** opens in place when you click it: change how it is written,
  with or without `*`, and press Enter, or choose **Remove** beside it.
  Escape leaves it as it was. Removing a replacement's last input takes it
  off your list, since the keyboard keeps no replacement without one, but
  its editor stays open with what it is and how it fires: give it a new
  input to put it back, or **Discard** it. Undo takes it back as it was.

To give an input to another replacement, remove it here and add it there.

### A new replacement

**+ New replacement** opens an empty one, with its text ready to type.

1. Type the replacement, or choose **Macro** and pick one.
2. Choose how it fires, if not as you type.
3. Press Enter, type its first input, and press Enter again. Several inputs
   with spaces between them are all added.

It joins your list with that first input, and stays open for more. Leaving
the editor from that field, for another replacement or another screen, keeps
the input as Enter does. Until then it waits at the top of the list as **not
on your list yet**, with what you typed for it, and **Discard** lets it go.

If the list already has that replacement, Ark says so and offers **Open it**
instead: the list never holds the same replacement twice.

### What Ark checks

Ark checks what you type as you type it, and says under the field why it
can't be kept. What it can't keep stays in its field, whenever you press
Enter, and nothing changes:

- an input is the replacement itself;
- an input already belongs to another replacement ("“teh” is already an
  input for “the”.");
- an input holds more than letters and digits. An apostrophe is allowed
  between two of them, as in `dosen't`;
- a `*` is somewhere other than the start or the end;
- a `*` is in an input of a macro, which plays for a whole word;
- the replacement is longer than 128 bytes or more than one line: use a
  macro for that. An input is at most 32 bytes;
- the list is full;
- your [host layout](macros.md#your-computer) can't type a character in it,
  so the keyboard could not type the replacement.

Everything is one step of the draft, so [Undo](review-and-save.md) works on
each.

## Try it

**Try it**, the last part of every replacement's editor, tries your whole
list, whichever replacement is open.

Type in its box as you would anywhere. Ark never changes what you type
there. Under the box, **Your keyboard would type** shows the same text as
your keyboard would type it with this draft's list:
type `teh` and a space, and the box still reads "teh " while the preview
reads "the ". Each replaced part is marked in the preview, and hovering it
says what it replaced. The line beside it says what was replaced last, and
that replacement is marked in the list; **Show it →** opens it.

Backspace straight after a replacement puts the word back in the preview, as
it would on the keyboard. **Preview with Caps Lock on** says whether the
preview takes Caps Lock to be on; set it by hand, and it follows your own
Caps Lock when you turn that on or off while you type there. **Clear**
empties the box and the preview.

With a keyboard connected and text replacement on, the keyboard replaces as
you type in the box too, by the list that is already applied, and the box
shows that as it shows anything typed. Ark then says so under the box: "Your
keyboard is replacing as you type here too. The preview shows this draft."
The preview is always the draft's list, so the two differ exactly where your
draft does.

For a replacement that plays a macro, the line says which: "“sig” plays
the macro “Sign-off”." The preview shows the macro's text when the macro is only
text; for a macro of keys and waits it shows the input gone, since Ark does
not play macros.

Try it reads text, so its preview can't show what depends on keys and time:
a shortcut, a cursor key, a held key, a macro key, or keys pressed while a
replacement is typed. It also can't tell how a character was typed: the
keyboard leaves a word alone when the character that ended it came through a
dead key (a quote on US-International, typed as the dead key and then
Space), and the preview shows it replaced. An edit in the middle of the box counts as a click
would: the text stays and the next key starts a new word. Try it works
whether text replacement is on or off.

The box can't hold the Leader key, and Ark never writes one into it. With a
replacement on your list that fires after Leader, **After Leader** under it
tries what you type
after the key, on its own: the line under it says whether the keyboard sends
a replacement, and which, waits for more (and what Enter or the wait would
send), or drops what you typed. A replacement your layout can't type, or a
macro that can't play, is sent as nothing, and it says so. The wait itself
and Escape need the keyboard.

## Importing a list

**Import…** opens a list from a file, or drop the file anywhere on the
screen. Ark reads three formats, by the file's extension:

- **`.json`**, Ark's own format, as **Export** writes it.
- **`.csv`**, a spreadsheet: columns `replacement` and `inputs` under a
  header row, in any order. The inputs cell can hold several inputs with
  spaces between them, each with its own `*`. How a replacement fires is in
  a `fires` column (`as you type`, `after leader` or `both`; empty is as you
  type). A row that plays a macro has
  the macro's number in a `macro` column and no replacement. Files as Excel,
  Numbers and Google Sheets save them all work: commas or semicolons, quoted
  cells, rows padded with empty cells.
- **`.txt`**, QMK's autocorrect dictionary: a line for each input,
  `typo -> correction`. QMK writes where it matches with colons, which Ark
  reads as its `*`: `:teh:` is `teh`, `:recieve` is `recieve*`, `mnet:` is
  `*mnet`, and with no colons `tihng` is `*tihng*`. Lines that start with
  `#` and blank lines are skipped. The keyboard's own lines that begin with
  how a replacement fires, `leader pn -> +31 6 1234 5678` and
  `both :adn: -> and`, are read too.

Files written before, by Ark or by hand, still read: a list that says
`typed` where it now says `inputs`, a spreadsheet whose
columns are `typos`, `correction` and `match` (`whole word`, `start`, `end`
or `anywhere`), with or without its header row, and JSON with `entries`,
`correction` and `typos`.

In every format, lines and rows with the same replacement, spelled exactly
alike, become one entry.

Before anything changes, a sheet over the screen shows what the file would
do, for each choice, as a [backup](backups.md) is compared before it is
used:

- the new replacements it makes, and their inputs;
- what it adds to replacements you already have;
- what is already in your list, which is skipped;
- the lines it refuses, in the file's order, each with its line or row number
  and the reason: the same checks as when you
  [write a replacement](#what-ark-checks). An input that your list already
  has for another replacement is refused and named;
- how many don't fit, and what stopped them: the inputs or the text the
  keyboard holds, the list's own memory, or a profile that is full.

Then choose **Add to my list**, which keeps your entries, or **Replace my
list**, which deletes them first and is written in red; or **Cancel**.
Either is one step of the draft, so Undo takes all of it back.

## Exporting your list

**Export** saves the whole list to your downloads, in the format you pick
from its menu:

- **Text (QMK)**: QMK's form, a line for each input, with its colons.
  It has no way to say a macro or the Leader key, so a replacement that plays
  one and one that fires after Leader alone are left out, and the file's
  first lines say how many were; one that fires both ways is written as it
  fires as you type, and the first lines say that too.
- **CSV**: a header row `replacement,inputs`, then a row for each
  replacement with all its inputs in one cell. With a replacement that fires
  after Leader, a `fires` column says how each fires; with a replacement
  that plays a macro, a `macro` column holds the macro's
  number. The file starts with a byte order mark, so Excel reads its accents.
  A spreadsheet may still retype a cell as it opens the file: a replacement
  of digits can lose a leading zero, and one that starts with `+`, `-` or `=`
  (a phone number such as `+31 6 1234 5678`) can be read as a formula. Format
  the column as text before you save from the spreadsheet, or keep the list
  in JSON.
- **JSON**: Ark's format, version 1:

  ```json
  {
    "version": 1,
    "replacements": [
      {"replacement": "because", "inputs": ["becuase", "becasue"]},
      {"replacement": "receive", "inputs": ["recieve*"]},
      {"macro": 5, "fires": "after leader", "inputs": ["sig"]}
    ]
  }
  ```

  `fires` is left out for a replacement that fires as you type. A file in another
  version is refused rather than guessed at.

A list exported as CSV or JSON imports as the same list, and so does one
exported as text when no replacement plays a macro or fires after Leader. A macro is named by its
number, so a list with one fits the keyboard it came from.

## Warnings

A warning marks a replacement in the list and a chip in its editor in amber,
with its reason in a line under what it is about. It never stops you saving.

- **Your host layout can't type it.** After you change the host
  layout, the top of the screen says how many replacements and inputs the
  new layout can't type, and each is marked. The keyboard skips them. Change
  the layout back or edit them. Review lists it too, as a warning to confirm
  once before saving.
- **Its macro is empty.** The keyboard leaves what you typed. Add steps in
  Macros or choose another replacement. Review lists it too, as it lists a
  pointing mode that runs an empty macro.
- **A replacement is itself an input for another.** With `a` for `b` and `b`
  for `c`, typing "b" yourself gives "c". Two entries that replace each
  other are marked as a loop.
- **A short input with `*`.** Under four letters, it catches many
  words you meant.
- **An input that matches inside a replacement.** Typing that
  replacement would change it.

## Memory

The list's heading counts your inputs against what the keyboard holds: 1,024
on current firmware. Under the list, **Text replacement memory** shows the
bytes the list uses of its 34,824, with a bar, how many bytes are free, and
your replacements and inputs. What is free is what the list can still grow
by: its own memory, the 20,480 bytes of text it may hold, or the room left
in the profile, whichever is least. The list shares the profile's memory
with everything else; the
[Keyboard screen](connecting.md#the-keyboard-screen)'s **Memory** panel
shows both, with **Text replacement inputs** among the counts and **Text
replacement memory** after Macro memory, its bar as full as the one here.

## Review and backups

Review lists each changed entry once, under **Text replacement**: added,
deleted, or with another replacement, and each input added, removed or
written anew, as it is written. **Show** opens that replacement in its
editor, and **Discard** puts one entry back. The switch is a setting, reviewed under **Settings**. See
[Review and save](review-and-save.md#review).

A [backup](backups.md) holds the whole list.
