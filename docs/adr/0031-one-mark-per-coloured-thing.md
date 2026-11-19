# One mark per thing that has a colour, and per macro and custom key

Cited as D-L31.

Each thing with a colour of its own on the keyboard (a behaviour tier, a tap count, a layer, a pointing mode, a combo, a lighting stage) has exactly one mark, drawn by `webview/ui/marks.mjs` wherever it is the subject or only referred to, in the keyboard's own colour, and drawn off when its stage is off. A colour then means one thing on every surface, and a setting shows the mark of what it governs (`governs` in `core/model/settings-editor.js`) in Settings, in the editors and in the review alike.

A macro and a custom key have no colour of their own, but have a mark too, so they read as the thing they are beside a layer or a pointing mode: their screen's rail icon (the Macros screen's robot, the Custom keys screen's square with a plus) in the colour of the words around it, wherever a key or action names one, the review's values included. The Macros and Custom keys screens' own lists, where every item is one, leave it off.

A layer's and a pointing mode's mark is its kind's icon in its colour (the board for a layer, the Pointing modes screen's icon for a pointing mode), so one mark says both what the thing is and its colour, and a layer and a pointing mode that share a colour still read apart. A swatch shows the colour itself, and is not a mark: it is used only where the colour is the subject (a colour field or value, a pointing slot's Light value) or where every item is a layer and only the colour tells them apart (the layer bar, a list of layer chips); a pointing slot is always named by its mark. A per-layer setting shows its layer's mark in its Settings grid and in the review alike.

A setting that governs every tap count at once, the Multi tap window, shows one mark for the set rather than a mark for each: the branch badge counting "N×", its border and fill split into an equal, hard-edged share of each tap-branch colour in tap order. A share whose colour is off is left empty, so every tap count keeps its place.

Amended 2026-10-24: a layer's and a pointing mode's mark was its swatch, and Settings' per-layer grids showed each layer's swatch.

Amended 2026-11-01: the Multi tap window was marked as the 2× tap count, by its badge in the 2× tap-branch colour alone.

Amended 2026-11-02: a macro and a custom key, having no colour of their own, had no mark.
