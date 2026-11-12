# Leader waiting is a case of Replacement feedback

Cited as D-L92.

While the leader waits for what is typed after the Leader key (D-L91), the
keyboard holds a colour of its own, leading (firmware D-F72): a fourth case
of replacement feedback, semantic `3`, with a colour under the stage's
switch, locality and accents, held rather than flashed. Ark edits it on the
Replacement feedback tab (D-L89) as the other three cases are edited, with
nothing of its own. It arrives in lighting domain version 6 under profile
schema 4.7, the only ones Ark reads (D-L64): the record gains the leading
colour after the undone colour (`leadingColor`), and a replacement accent may
name the new case. Amended by D-L93: Leader waiting has its own locality, as every case does (lighting version 7, schema 4.8).

## The name

The case is **Leader waiting**, for what the keyboard is doing while it shows:
a person sees it after pressing Leader, as the other cases are named for what
the keyboard just did. It is a case, not a state, since Ark keeps "state" for
a behaviour's (D-L89). The firmware's word, leading, stays in code
(`AUTOCORRECT_FEEDBACK_GROUP_LEADING`, `leadingColor`). An accent for all four
cases was **Every replacement flash**; Leader waiting holds rather than
flashes, so it is now **Every case**, and an accent in the case's colour is
**Same as the case's colour**. The list's group is **Cases**, its column
**Colour**.

## How it differs from the three

- Its key is the Leader key that began it (firmware D-F72): the two
  localities that follow a key paint that key's half, or that key alone. The
  board's stand-in is the first key that sends Leader, found as Space and
  Backspace are for the others (`replacementTrigger`), ringed, and with none
  it paints as the keyboard paints a case whose key it cannot tell; the line
  under the board says it is held, where it paints and which key stands in
  (`lightingBoard`). The Locality's note says its trigger key is the Leader
  key. At first it named no key and lit both halves under those two
  localities; trying it, Noah found they did nothing for it and chose the
  Leader key (2026-11-12).
- **Flash length** stays the length of a flash; Leader waiting lasts as long
  as the leader waits, which Host's **Leader waits** sets, and the field says
  so.
- It is switched off as every case is, by its colour (D-L89). What off means
  now reads "does not light", since one case does not flash.
- What the leader sends still confirms in the text or macro colour (D-L91),
  taking Leader waiting's place; a leader that sends nothing just ends it.
- With Text replacement off and a leader input on the list, the tab stays
  live (D-L91), and its banner now says Leader waiting still lights too
  (vocabulary `settingOff.leading.stage`).

Each case says under its name when it shows (vocabulary `replacementWhen`),
and the Locality's note speaks of the case picked: a flash's trigger key, or
the Leader key for Leader waiting. Noah asked for that on trying the tab (2026-11-11):
one note for every case read as if Leader waiting were a flash, and nothing
said that it runs from the Leader key to the send or the end.

Review names the colour by the case, as it names the other three.

## Considered options

A stage of its own, or a colour beside the other feedback colours: the
firmware made leading a case of replacement feedback, sharing its switch,
locality and accents, so a tab of its own would edit bytes another tab owns.
Painting Leader waiting on the board from no key, both halves under the two
localities that follow a key: it was built first, and Noah found those
localities then did nothing for it (2026-11-12). Keeping "Every replacement flash": it
would say an accent for Leader waiting flashes, which it never does.
