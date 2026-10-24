# The demo is a draft with no keyboard behind it

Cited as D-L53.

Ark can be explored with no keyboard, and the demo is not a simulated keyboard answering the wire protocol: it is the same `ProfileDraftSession` a keyboard's read opens, over a profile document, run by the shared panel loop (`core/session/demo-session.js`). Every screen, edit, check and review therefore behaves as on a keyboard, while what needs one, Apply and reviewing against the keyboard, is refused in core, not only hidden. Its document is the bundled demo profile, an export of a real keyboard shipped as data (`core/data/demo-profile.charybdis.json`), or a profile file opened in its place, under the capabilities current firmware reports.
