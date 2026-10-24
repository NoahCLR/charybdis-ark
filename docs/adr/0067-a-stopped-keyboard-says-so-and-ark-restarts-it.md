# A keyboard that stopped saving says so, and Ark restarts it

Cited as D-L67.

A keyboard whose profile storage stopped refuses every Save, Revert and edit until it restarts, which otherwise looks like a keyboard that is not ready or a slave half catching up. Ark shows it as one state, stopped, which outranks every other state the keyboard reports, with Restart as the only action (firmware D-F34). It does so in every edit mode: under an Apply draft the look between edits reads the same flags, so a refused Apply never reads as a keyboard that is not ready. Restart first keeps any unsaved edits as a recovery copy, asks both halves to restart, follows the same keyboard back as after a rename (D-L62), reads it once it has finished starting (D-L70), and puts the edits back unsaved as one live edit (`core/session/keyboard-restart.js`). An Apply draft holds no edits on the keyboard, so it needs no recovery copy and stays as it is across the restart, edits and draft history included, while the keyboard holds what the draft began from; Ark looks at the keyboard again at once, so one that stopped again says so, and an Apply it would refuse is refused as stopped. Ark offers Restart only when the keyboard says it stopped and never restarts it by itself, since a restart loses what runs unsaved and only a person should choose that over unplugging. Firmware without restart never sets the flag, so no capability check is needed.

## Considered options

Offering Restart in the keyboard menu at any time: dropped, because a restart otherwise is a choice about losing unsaved edits that only the stopped state makes for the person, and a half left apart after an unacknowledged restart rejoins by itself (firmware D-F34).
