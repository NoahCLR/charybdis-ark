# The keyboard is named in its profile, and its restart is expected

Cited as D-L62.

The keyboard's own name is one more counted name in the settings domain (firmware D-F14's name rule), and the firmware serves it as its USB product string, so it is edited in the draft, reviewed, discarded and backed up like any other profile data. A changed name makes the master half restart USB by itself, after a save or, in the live modes, after the edit; Ark expects that drop rather than reporting it as an error, and follows the same keyboard back by serial number, or else by a new name no other keyboard had, never by guessing (`core/session/keyboard-reconnect.js`). A keyboard lost unexpectedly is followed back the same way at most once in 30 seconds. A live draft follows a keyboard that comes back under its own edit session, so a rename can still be reviewed, saved or reverted. The rules are in [Keyboard name](../spec/interface-contracts.md#keyboard-name).
