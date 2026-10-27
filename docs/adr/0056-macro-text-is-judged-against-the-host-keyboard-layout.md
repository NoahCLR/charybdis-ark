# Macro text is judged against the host's keyboard layout

Cited as D-L56.

The keyboard types macro text through a host layout (firmware D-F16), so Ark judges, labels and reviews macro text against that same layout: `scripts/generate-host-layouts.js` turns the firmware's pinned fixture into `core/data/host-layouts.json` and keeps its character table rather than re-deriving it, so what the editor accepts and what the keyboard types cannot disagree. The layout belongs to an OS, so a Host edit that changes the effective OS carries the layout along (`followHostOs` in `core/schema/host-settings.js`), while detection alone never rewrites it. Keys are labelled as the layout prints them but stored keycodes never change, and Ark never rewrites authored text or key steps to simulate a layout change; a macro the new layout cannot play is a warning, not a save blocker.
