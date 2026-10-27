# The keycode catalog is vendored, not parsed

Cited as D-L05.

The keyboard reports keycodes as bare `uint16` values, and Ark must turn them into names and names back into values without a firmware workspace. A build step, `npm run keycodes` (`scripts/generate-keycode-catalog.js`), reads QMK's keycode data and the Charybdis keyboard's own keycode enum from Ark's pinned QMK snapshot once and writes the checked-in `core/data/keycode-catalog.json`, stamped with the QMK version it came from. QMK drift then arrives as a reviewable diff, which `npm run keycodes -- --check` catches, rather than as a silent change in behaviour. Which catalog entries the picker offers is a separate rule, owned by `pickable` in `webview/view/picker-sections.mjs` ([interface contracts](../spec/interface-contracts.md)).
