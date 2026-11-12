# A colour of saturation and value zero is passthrough wherever it is owned

Cited as D-L94.

HSV(0, 0, 0) meant three things on Lighting: a layer's colour was
passthrough, a replacement feedback case's was off, and a pointing mode's,
combo feedback's or a behaviour feedback case's turned its LEDs dark. So the
colour editor's one button was **Make passthrough**, **Turn off** that
switched a case off, or **Turn off** that darkened the LEDs, and nothing told
the two kinds of "off" apart. The keyboard now has one rule (firmware D-F74,
Noah, 2026-11-12: "shouldnt it just all be passthrough?"): every colour a
layer, a pointing slot, combo feedback or a feedback case owns is
**passthrough** when its saturation and value are 0, at any hue. It paints
nothing, and what is beneath shows; the other slots and cases still light,
and so do accents in a colour of their own. Value 0 with saturation above 0
turns the colour's LEDs **off**: they go dark, covering what is beneath. It
arrives with lighting version 7 and schema 4.8 (D-L93), with no bytes of its
own.

## The words

**Passthrough** and **Off** are the two choices, and a person reads only
those. Off is the word for LEDs that go dark, because that is what they do
(Noah, 2026-11-12: "off is better than black, the leds are off"). It was
**Black** at first, the colour's name in HSV; it never stands for
passthrough, which paints nothing at all.

## How Ark says it

- One test matches the keyboard's: `colourPaints` in `rules/led-light.mjs`,
  saturation and value 0 painting nothing, which the board, Review and
  accents use. The screens ask it as `isPassthrough` and `isOff` (value 0
  with saturation, `ledsOff`), from `webview/view/lighting.mjs`.
- Every owned colour's editor offers **Make passthrough**, storing
  HSV(0, 0, 0), and **Off**, storing value 0 with the hue and saturation kept
  (255 when there was none), on a row of their own under its name. A
  passthrough colour reads **Passthrough** with a note saying what shows; an
  off one says its LEDs go dark. **Give it a colour** brings a passthrough
  colour back, beside **Off**. The words are `colourOff` in
  `core/model/vocabulary.js` (`offAction`, `offWord` for passthrough;
  `ledsOffTip`, `ledsOffNote` for Off); "Turn off" and "switch the Stage on
  off" are gone for these colours.
- Lists say **passthrough**, or **off** with where it paints. Review reads an
  owned colour as **passthrough** or **off**; two passthrough colours that
  differ only in a hue the keyboard reported read apart by it
  (`passthrough · HSV(30, 0, 0)`).
- The board paints nothing for a passthrough owner, and its accents that
  take its colour stay dark. The line under the board says it is
  passthrough.

## What keeps its meaning

An accent's HSV(0, 0, 0) still takes its owner's colour (**Same as …**), and
so paints nothing for a passthrough owner. The auto-mouse fade's end colour
is literal: its **Turn off** stores HSV(0, 0, 0) and the fade ends with the
LEDs off. The background effect has neither choice.

## Considered options

- **Keep off for replacement cases and dark elsewhere, and fix only the
  list's word.** Rejected: the keyboard no longer stores three meanings.
- **Black for the dark colour.** Tried first and left: the LEDs are off,
  and a person reads off.
- **Off as a saved colour preset rather than a choice.** Rejected: it is the
  one colour whose meaning changed, so it sits beside passthrough where a
  person makes the choice.
