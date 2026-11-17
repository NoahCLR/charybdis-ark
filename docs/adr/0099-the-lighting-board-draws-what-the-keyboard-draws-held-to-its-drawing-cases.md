# The Lighting board draws what the keyboard draws, held to its drawing cases

Cited as D-L99.

The Lighting board is drawn by a rule of Ark's own (`rules/led-light.mjs`,
D-L73), fed by `webview/view/lighting.mjs` and
`webview/view/lighting-board.mjs`, and the keyboard draws the same lighting
in its own stages (firmware RGB domain, Drawing). The release review found
the two had drifted: on Pointing modes the board showed the picked mode as it
paints with no linked layer on, over every layer, where the keyboard paints a
mode beneath the lowest layer of its link that is on (firmware D-F62). Nothing
held the preview to the keyboard, so the next drift would have gone unseen
too.

## The decision

- **The board draws what the keyboard draws.** For the layers on, the
  running pointing mode, the held combo, the behaviour feedback case and the
  replacement flash it shows, every LED takes the colour the keyboard's stages
  would give it. That includes a linked pointing mode beneath its link's
  layers: with a layer that starts it or one its key turns on on, the board
  paints the mode beneath the lowest of them, as the keyboard does, on
  Pointing modes as on Combo feedback. This reverses the earlier choice to
  show a mode as it paints with no linked layer on.
- **The preview is held to the firmware's drawing cases.** The firmware
  publishes still frames of its drawing, LED by LED, each held against its
  real render path by a host test (`tests/fixtures/rgb_render_v1.json`,
  firmware RGB domain, "The drawing cases"). Ark imports the file under
  `upstream/` and runs every case through the preview
  (`tests/view/drawing-cases.test.mjs`): the case's lighting payload goes
  into a profile document that core publishes, its state becomes the
  preview's inputs in one adapter (the base viewed with the case's layers
  held, a running mode's link as a mask, a combo's partition as given), and
  each LED's colour is compared exactly with the case's. A case the adapter
  does not know fails the test; one the preview cannot express is skipped by
  name with its reason. Where a case fails, Ark's rule or its inputs change,
  never the imported fixture.

## What the cases do not cover

The cases are still frames of a solid background, drawn as the master half.
They hold nothing of fades (the auto-mouse fade and its end colour), flash and
blink timing (flashing holds, tap-commit pulses, the replacement flash length,
dark phases), animated background effects, the layer preview, several
behaviour keys at once (newest-key arbitration, case order within an area,
the slave half between packets), slave-half drawing from mirrored state, the
boot indicator, which partition a combo falls in (the combo runtime's choice;
Ark's `comboHeld` makes it from what core publishes), or a link naming an
inert layer, which the keyboard ignores. The idle timeout is a case, but the
preview does not model it, so it is skipped. These stay held by Ark's own
tests and by the keyboard.

## The LED table, settled

When the cases were first run, Ark's layout (`core/data/charybdis-layout.js`)
and the keyboard's own LED table (BK's `keyboard.json`, which the cases'
board is checked against) disagreed on one key: Ark gave the lower right
thumb key, layout 55 at matrix `[9, 5]`, LED 55, and the keyboard's table
filed LED 55 under matrix `[9, 2]`, which no key uses, so that key had no LED
of its own. Noah tried both on the keyboard (2026-11-17): an accent on LED 55
lit that key, and a layer painting only its mapped keys left it dark. Ark's
table was the true one; the keyboard's was corrected, and lighting that
follows a key now lights it.

The keyboard's table also lists LED 57, with no key. It is the last LED in
the right half's chain and is not populated on the board, so Ark knows no
such LED and the case comparison leaves it out. `tests/data/charybdis-layout.test.js`
holds Ark's layout and each key's LED to the imported `keyboard.json`, and
the firmware's runner refuses an LED table in which a key carries no LED.

## Considered and rejected

- **Bending the adapter to a case.** A difference hidden there would be the
  drift this decision exists to catch.
- **Running the cases through the whole Lighting board** (`lightingBoard`,
  which finds a stand-in key from the keymap). The cases name their keys, so
  the preview's inputs are given directly; how the board picks a key stays
  held by `tests/view/lighting-board.test.mjs`.

Held by: `tests/view/drawing-cases.test.mjs`, `tests/rules/led-light.test.mjs`,
`tests/view/lighting.test.mjs`, `tests/view/lighting-board.test.mjs`.
