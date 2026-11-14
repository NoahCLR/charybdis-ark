# The info mark opens on a press, and a tip is one control's one line

Cited as D-L96.

Ark has two kinds of help that open over the screen: the tip (`data-tip`,
D-L80), at the pointer while it rests on a control, and the info mark (D-L88),
a circled i whose list says how a section works. They drifted together. Tips
explained whole ideas that an info mark already explained (Flash interval,
Flash length, the background effect's choices), sat on things that are no
control (a colour's value), or repeated what the screen said beside them. And
the info mark opened as a tip does, while the pointer rested on it or the
focus was on it, so a list meant to be read closed if the pointer slipped,
and could not be opened by touch. Noah asked (2026-11-13) whether the two
were being mixed, and which pattern is better.

## The decision

The two do different jobs, as design systems split tooltips from toggletips:

- **A tip is one control's one line.** It says what the control does, or what
  pressing it changes ("Removes it for every pointing mode"). It never
  explains an idea, never repeats text on screen, and is never the only place
  something needed is said. It opens at the pointer and on focus, as D-L80
  has it.
- **The info mark holds what a section or an idea means, read once.** A press
  on it (a click, or Enter or Space) opens its list and keeps it open until
  it is pressed again, Escape is pressed, or a press lands elsewhere; it stays
  open across a redraw, and opening one closes any other. Resting the pointer
  on it previews the list, as before. The focus alone opens nothing: a screen
  reader hears the list as the mark's description, and the button says
  whether it is open (`aria-expanded`).
- **What is needed every time is on screen:** state, warnings, refusals,
  values and units. No sentence lives in two of the three.

This amends D-L88, whose marks opened on hover and focus.

## Considered options

- **Keep the info mark opening on hover and focus.** No new interaction, but a
  list to be read stays fragile, and touch cannot open it.
- **Only a press, no hover.** Cleaner, but resting the pointer to glance at a
  list is how the marks have been used since D-L88; a preview costs nothing.

## Consequences

- The board's Shortcuts mark, Text replacement's marks and any later one open
  the same way (`webview/ui/info-mark.mjs`); each screen keeps calling
  `infoMark` and `attachInfoMarks`.
- A tip that explains is a review finding: move the explanation to the
  section's info mark, or cut it to the control's one line. So is help read
  once that sits on screen as a note, or in a fold that holds only help:
  it goes behind an info mark beside its heading, and what is needed every
  time stays on show beside it.
