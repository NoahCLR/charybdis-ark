# One whole-profile draft and review

Cited as D-L19.

A complete read of the keyboard seeds one draft per editor window: a single profile holding all seven domains (D-L15), which every editor, import and layer edit changes, with one undo history and one review. Apply writes only the exact revision that was reviewed, to the keyboard the draft belongs to; a change on the keyboard keeps the draft and blocks the stale Apply until **Review against the keyboard** compares it with a fresh read, never merging silently. One draft means one place to undo, one comparison with the keyboard and one thing to apply, so no editor can write behind another's back. In Live + review (D-L65) and Live (D-L66) the same draft's edits run on the keyboard's working copy; `core/session/profile-draft-session.js` holds it.

Amended 2026-10-29 (D-L71, D-L72): with the editor window gone, the one draft is held by the web page's tab that holds the keyboard, and a Web Lock makes any other Ark tab in the browser wait (`web/web-shell.mjs`); the draft belongs to one keyboard, and another connected keyboard stays read-only until the draft is saved or discarded. The edit modes are now named Live preview + save (D-L65's Live + review), Live edit (D-L66's Live) and Review and save.
