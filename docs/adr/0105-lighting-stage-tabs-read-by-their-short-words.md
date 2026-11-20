# Lighting's stage tabs read by their short words

Cited as D-L105. Amends D-L103 where it says the stage tabs read by their
names wherever every name fits the strip.

Lighting's stage tabs read by their names (Background effect, Combo
feedback) where all seven fit the strip, and by short words (Background,
Combos) where they did not. To fit the names in a 1440px window, the tabs had
4px of padding and no gap between them, and they read as crowded under the
layer tabs' 12px.

The stage tabs now keep the layer tabs' and the Keymap's padding and gaps,
and read by their short words at every width: **Background**, **Layers**,
**Auto-mouse**, **Pointing modes**, **Combos**, **Behaviours** and **Text
replacements** (`stages[].short`, `core/model/vocabulary.js`). Pointing modes
needs no shorter word, and Replacement feedback reads as what it gives
feedback on. The stage's whole name stays in its stage bar, its tab's tip and
its accessible name, as D-L95 has it. Each tab is still as wide as its word
in bold, so picking a tab moves none (D-L103), and the measure that switched
between names and words is gone.

With the Mac's font the strip fits from about a 1370px window; with a wider
font, as Windows' and Linux's are, from about 1500px. Narrower, it scrolls,
as any strip too wide for its row does.

## Considered options

Keeping the names where they fit, with the wider padding: they would fit only
from about a 1610px window, so most windows would read by short words anyway,
and the tabs would change their words as the window was resized.

Padding between the two (8px): the names would fit from about 1510px, and the
tabs would still look tighter than the layer tabs above the board.
