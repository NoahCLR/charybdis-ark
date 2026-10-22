# A custom key's shortcut is its own action

Cited as D-L63.

Firmware D-F26 gives each custom key an optional shortcut, any mix of the eight modifiers plus at most one key, stored in settings domain version 8 (`core/schema/settings-domain-v1.js`). Ark treats the shortcut as the key's own action, the way a plain key's action is its keycode: the key's behaviour works on top of it, a bypassed custom key sends it, and a behaviour step that names a custom key sends only its shortcut, so behaviours never chain. Because one keycode cannot hold modifiers from both sides, a key field's picker offers a custom key carrying that shortcut instead, staged in the same draft step. The firmware accepts a step naming a custom key with no shortcut, so Review warns about one rather than refusing it.
