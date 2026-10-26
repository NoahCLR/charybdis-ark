# Any layer can be the base

Cited as D-L37.

The base is a slot, not a layer: the bottom one, always on, what every transparent key falls through to and what `TO(0)` returns to, because the firmware treats layer 0 as the base throughout and refuses `DF()` and `PDF()` (firmware D-F46). Rename & Reorder's **Make base** swaps a layer with the current base as one reorder, and the two trade roles: a layer key that reached the base still reaches the bottom slot, so `TO(0)` still goes home, and one that reached the new base now reaches the old one, whether or not keys follow their layers. A pointing slot's link (firmware D-F62) is renumbered as layer keys are, the swap included, so the keys that started a mode still start it and a link never lands on the base; a move that would still leave a link on the pointer layer or a default layer, or one layer starting two modes, is refused. Where the swap leaves no way back, the review's checks (D-L36) say so rather than the reorder inventing one; the rule is `reorderLayers` in `core/model/portable-profile.js`.

## Considered options

Moving references to the base along with it, as the first version did, turns `MO(n)`, `LT(n, …)`, `TT(n)` and `TG(n)` into `MO(0)` and the like, which do nothing because the base is always on.
