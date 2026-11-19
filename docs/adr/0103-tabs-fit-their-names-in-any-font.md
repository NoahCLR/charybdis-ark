# Lighting's stage tabs fit their names in any font

Cited as D-L103. Amends D-L95 where it says the stage tabs keep fixed widths.

Amended 2026-11-20 (D-L105): the stage tabs read by their short words at every width, with the layer tabs' padding, so the measure that chose between names and short words (`fitStageWords`) is gone. Each tab is still as wide as its word in bold.

Lighting's stage tabs had fixed widths in pixels, set from their names in the
Mac's system font, with a narrower set and short words below a 1400px window.
Ark draws its text in the system's own font, and other systems draw it wider:
on Linux, in DejaVu Sans, every stage name was cut short with "…" at 1440px,
and on Windows Segoe UI is wider than the Mac's too.

Each stage tab, and All accents, is now as wide as its label in the bold the
picked tab uses, whatever the font: the label's text is laid again, bold and
unseen, under itself, so picking a tab still moves none. Whether the tabs read
by their names or their short words follows whether every name fits the strip,
measured in the font that is drawn (`fitStageWords`, `webview/ui/lighting.mjs`),
not a window width. Where they read by short words the stage bar still names
the stage whole, as D-L95 has it.

For the same reason the combo builder keeps Use this combo and Layers it runs
on on one row with a smaller least gap between them, which their row's spread
to its two edges hides on the Mac.

Browser tests draw these screens in a font wider than the Mac's, so a layout
measured in one font fails on the machine the tests run on, not only on
Linux.

## Considered options

Shipping a web font, so every system draws the same text: the Mac would lose
its own font, and the widths would still be measured by hand.

Installing the Mac's metrics on CI: Linux and Windows users would still see
names cut.
