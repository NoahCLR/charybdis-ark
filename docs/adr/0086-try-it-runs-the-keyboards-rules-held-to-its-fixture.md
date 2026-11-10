# Try it runs the keyboard's rules, held to its fixture

Cited as D-L86.

Ark has one matcher for the text replacement list (D-L84), `core/model/autocorrect-matcher.js`. It reads the characters a computer would show, with `\b` for Backspace, and answers with what the keyboard would leave on screen: which typed form fires when a word ends, the case its replacement takes, what the host layout can type under Caps Lock, the undo, and the limits of a word and of a replacement. The rules are the firmware's (`upstream/firmware/docs/spec/autocorrect-v1.md`, firmware D-F69), and every case of the firmware's behaviour fixture that has a text form (`screen`) is run through the matcher in `tests/model/autocorrect-matcher.test.js`. A case that needs a key, a timing or a setting (`keyboardOnly`) is listed as skipped with its reason, and a reason the test does not know fails it. A disagreement is settled in the firmware's spec and fixture first, never by changing the imported bytes.

A replacement that plays a macro is in the matcher too, since the fixture holds it: the typed form goes, there is no case rule and no undo, and a macro that is empty, or that the host's settings cannot play, is passed over. The matcher is told what each slot plays by its caller. Core gives it the macro's text when the macro types only text, so the box shows what the computer would end with; for a macro of keys, shortcuts or waits it gives none, and the box shows the typed form gone. Either way the answer names the slot that played, and the screen says so by the macro's name. Ark never plays a macro to find out.

Two things ask the matcher. **Try it**, beside the list on the Text replacement screen, shows what the keyboard would do with a sentence under the draft's list and host layout. The interface runs no rule: it reads its box as typing (text added at the end, one character gone as a Backspace, any other edit as text that stands, which is what a click is to the keyboard) and posts that to core (`tryAutocorrect`), which answers without staging anything. The list's warnings (D-L84) ask the same matcher which typed form fires on a replacement's own words, so a warning and the keyboard cannot disagree either.

The switch that turns the feature on is not this screen's: it is a Host setting (D-L87).

## Considered

Running the matcher in the interface, as a shared rule (`rules/`, D-L73): the matcher needs the list, the word table and the host layouts' strokes, which core holds and the interface does not; a box typed in is quick enough over the panel boundary. A second, simpler matcher for the warnings: two homes for "which typo fires". Showing a made-up rendering of a macro's keys in the box ("⌘Space"): the box shows what the computer would end with, and a shortcut ends with nothing Ark can know.
