# The keyboard alone is enough

Cited as D-L68.

Ark is meant to be first-grade control software for the Charybdis: a person with only the keyboard and Ark can read what it runs, change anything the firmware stores as data, review it, keep it on both halves, back it up and recover it, without C, a firmware checkout or a reflash. Everything Ark shows comes from the keyboard (D-L11) and every change goes through one draft and Review (D-L19, D-L35). Each operation moves data one way and says which: a read takes the keyboard's profile into Ark, Apply or Save writes the draft to the keyboard, Export profile writes a backup and Import profile opens one as the draft. The keyboard keeps one active profile; named copies live outside it as backups (D-L15), not as extra profiles on the keyboard. What only a firmware build can change, such as a capacity or a compiled limit, is shown as a fact of the keyboard that names the build it needs (`webview/view/firmware-facts.mjs`), never hidden or offered as an edit; which fields are live data and which are compiled is firmware's classification, which Ark imports under `upstream/firmware/`.

## Considered options

Several named profiles stored on the keyboard: not chosen, because one active profile plus backups covers switching setups without spending the keyboard's storage on copies, until storage measurements and use show otherwise.
