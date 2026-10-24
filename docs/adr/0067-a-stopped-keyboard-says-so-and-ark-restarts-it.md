# A keyboard that stopped saving says so, and Ark restarts it

Cited as D-L67.

A keyboard whose profile storage stopped refuses every Save, Revert and edit until it restarts, which otherwise looks like a keyboard that is not ready or a slave half catching up. Ark shows it as one state, stopped, which outranks every other live state, with Restart as the only action (firmware D-F34). Restart first keeps any unsaved edits as a recovery copy, asks both halves to restart, follows the same keyboard back as after a rename (D-L62), reads it once it has finished starting (D-L70), and puts the edits back unsaved as one live edit (`core/session/keyboard-restart.js`). Ark offers Restart only when the keyboard says it stopped and never restarts it by itself, since a restart loses what runs unsaved and only a person should choose that over unplugging. Firmware without restart never sets the flag, so no capability check is needed.

## Considered options

Offering Restart in the keyboard menu at any time: dropped, because a restart otherwise is a choice about losing unsaved edits that only the stopped state makes for the person, and a half left apart after an unacknowledged restart rejoins by itself (firmware D-F34).
