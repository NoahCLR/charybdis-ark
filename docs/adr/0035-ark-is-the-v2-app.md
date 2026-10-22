# Ark is the v2 app, and edits go only through a draft

Cited as D-L35.

The first live app ported Studio's interface (D-L06); v2 replaced it with Ark's own, keeping the core, its layering and the rule that the app never reads the firmware repository. The interface is browser ES modules whose pure `webview/view/` builders make every posted edit, and `tests/view/edits.test.mjs` stages those exact messages against a real draft. An edit exists only as a reviewed draft or the keyboard's working copy, which a replug discards: a keyboard Ark cannot open a draft for is read-only, and the host refuses edits rather than writing them directly. Only a reviewed Apply or Save makes an edit permanent, unless the person chooses Live, where the keyboard saves every checked edit itself (D-L65, D-L66).
