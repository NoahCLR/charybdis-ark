# Current state comes from the keyboard, including compiled defaults

Cited as D-L11.

Ark shows what the keyboard runs, not what a repository says it should run: at runtime it parses no C file and reads no firmware file, which `tests/layering.test.js` checks across `core/`, `webview/`, `web/` and `extension.js`. A keyboard with nothing saved still serves its compiled defaults over Profile Wire, in the same page layout as a saved profile, so a keyboard flashed from other data than a repository holds still reads truthfully, labelled as compiled defaults. Only keyboard-definition data that no device command exposes, such as the vendored keycode catalog (D-L05) and the layout matrix, ships with the app, as inert decoding data in `core/data/` that never carries configuration. How a snapshot of that state is read and checked is in [reading, applying and progress](../architecture/profile-snapshot-and-progress.md).
