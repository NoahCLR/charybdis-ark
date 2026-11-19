# Ark has no switches for QMK's key options, and Host is Typing

Cited as D-L102. Amends D-L87: the Settings screen that holds Text
replacement's switch is **Typing**, and the switch is its last card.

Host had a card, **Key swaps & typing**, with a switch for each of QMK's key
options the keyboard stores (firmware `settings-domain.md`): swap left Ctrl
and Caps Lock, Caps Lock as left Ctrl, swap Alt and GUI on either side,
disable GUI, swap Ctrl and GUI on either side, swap backtick and Escape,
backslash and Backspace, Escape and Caps Lock, N-key rollover and one-shot
keys. They are QMK's own options, set as well by its Magic keys, and a remap
in the keymap does what each swap does, on the layers a person chooses.

Ark no longer offers them. The card is gone from Host, which now holds Your
computer and Text replacement (see Typing, below). The options stay in the
keyboard's settings word with Text replacement's switch (option 12), and Ark
keeps and sends whatever the keyboard stores for them: an Apply never changes
one. Text replacement's switch is the one field on that word
(`ownedKeyOptions`, `core/model/settings-editor.js`). A difference in any
other bit, from a backup restored, say, is one **Other key options** change
in Review (counted with the keys in a backup's summary), with no Show and
with Discard, as one in a bit Ark had no switch for was before. QMK's Magic
keys stay in the picker.

## Typing

What is left on that screen says how the keyboard's text comes out on the
computer: its system, its layout and Unicode entry, which macros and
replacements type through, and Text replacement's switch with how long the
leader waits. "Host" is USB's and QMK's word for that computer, the one rail
label a person had to decode, while Behaviours, Combos and Pointer each name
what they govern. The screen is **Typing** on the rail and its title, and
**Typing settings** wherever a link, a tip or a fix names it (the
vocabulary's `SETTINGS_SCREENS`). Only the words change: the screen's id, its
section's id and the `host*` identifiers stay `host`, as Text replacement
kept the firmware's `autocorrect` in code (D-L87). Its first card is still
**Your computer**.

## Considered options

Clearing the options to QMK's defaults on Apply: it would undo a swap a
person set with a Magic key or VIA without saying so, from a screen that no
longer names it.

Hiding the card but keeping its fields for the review: Review would name
switches no screen has, and its Show would go nowhere.

**Computer** for the screen: it and its first card, Your computer, would say
one thing twice, and Text replacement would read oddly under it. Typing can
suggest how a key press feels; that is Behaviours', and the screen's subtitle
says what it holds.
