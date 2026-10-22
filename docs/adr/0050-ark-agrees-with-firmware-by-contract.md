# Ark agrees with firmware by contract, and main is a released stack

Cited as D-L50.

Ark talks to a keyboard, not to a firmware commit: it follows the capability pages the keyboard answers, so Ark and a firmware are in sync when their contract agrees, not when commits match, and one Ark serves every firmware build that states that contract. `npm run agreement` judges it with Ark's own runtime decoder and gates, and requires Ark's BK keycode and layout inputs and pinned fixtures to equal firmware's by content; values that change with ordinary keymap edits are reported, never compared. Ark and firmware release separately, and together when the contract between them changes (firmware D-F06), and a release must agree with the firmware it will sit next to on `main`, not with the newest pin or a matching date. See [agreement](../development.md#agreement-with-a-firmware-contract) and [CI and publishing](../development.md#ci-and-publishing).
