# A choice may be drawn as shapes or as radio buttons

Cited as D-L107. Amends the interface spec's choice rule, which drew every
choice of two to four short options by `choiceField`.

A choice of two to four options whose words fit one line together shows them
all on screen, so each is read without opening anything and picked in one
click, and a longer one stays a menu (`onScreenChoice`,
`webview/view/choices.mjs`). Every such choice was drawn by `choiceField` as
one segmented row (`webview/ui/segmented.mjs`), so none could skip the rule.

A directional pointing mode's step 2 read as cluttered with three segmented
rows around its compass (Noah, 2026-11-21). Its options now stand in a column
beside the compass, and two of them keep the rule but not the segmented row:

- **Reads** is a row of shapes, each a drawing of the directions it reads,
  the picked one's name beside them. A drawing says which directions a mode
  reads faster than its words, and `choiceField` draws words only.
- **When a direction has no key** is radio buttons, each named in full,
  one under another. In a column a segmented row of three long names wraps
  into a boxed list that reads as out of place beside a row of shapes and a
  switch.

A choice may be drawn by hand like this where a screen needs it, as the
movement step's two large choices (`movement-choice.mjs`), the picker's
shortcut layer kinds and a colour's states already were. It still keeps the
rule's promises: every option on show, a radio group named by its label,
the arrow keys moving between options, each option's form identity its
field's then its value, and a stored value that is none of the options shown
as one more, "as stored" (`storedChoices`). A choice that is words in a row
is still drawn by `choiceField`.

## Considered options

Drawing When a direction has no key by `choiceField` in the column: a
segmented row of its three names wraps, and laid out as a list it is the
boxed list Noah found out of place.

A menu for When a direction has no key: one line, but its choices are then
read only by opening it, which the rule exists to avoid.
