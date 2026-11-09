# An autocorrect entry is one correction with its typos

Cited as D-L84.

Ark edits the keyboard's autocorrect list (firmware D-F68) as **entries**, each one correction with every typo that becomes it, the firmware's own words and the shape its domain stores. The Autocorrect screen draws a row per correction with its typos beside it, never a row per typo, and every edit names what it changes by its text: a correction by its spelling, a typo by its own. Typing a correction the list already has adds to that entry, and respelling a correction to one the list has joins the two, so the list never holds one correction twice; a typo is moved to another correction rather than given a second one.

The list's rules have one home in core, `core/model/autocorrect-list.js`, working on the model the codec reads and writes (`core/schema/autocorrect-domain-v1.js`), so the draft only ever holds a list the keyboard takes. Two kinds of finding come from it:

- **A refusal** stops an edit, in words: what the firmware's validator would refuse (an empty or over-long text, a character a typo may not hold, a typo that is its correction, a typo another correction has, a list past its ceilings), and an entry the chosen host layout cannot type when it is added or edited, since the keyboard could not type its correction.
- **A warning** is found on the list and never stops a save: an entry or typo the host layout no longer types after the layout changed, a correction another entry would change again, two that correct to each other, a part-of-word typo under four letters, and one that also matches inside a correction. The keyboard skips an entry it cannot type, so a layout change must not make the profile unsaveable; since the layout is changed on another screen, Review says it too, as one warning for the whole list (`untypableAutocorrect`, `core/model/profile-checks.js`).

The words a typo may hold and what each folds to are the firmware's table, generated into `core/data/autocorrect-words.json` from the pinned fixture; Ark folds what is typed with it and never derives its own.

What is typed is checked before it is kept by making the edit of the draft as it stands and throwing the result away (`validateAutocorrect`, answered by `autocorrectValidation`), so the check and the edit cannot disagree, and the interface holds no rule of the list.

Review's unit is the entry (`UNIT.autocorrect`), named by its correction as the keyboard spells it and, when the draft respelled it, by both spellings. An entry only the keyboard has is paired with the entry only the draft has that took most of its typos, and shown as one item, respelled. Discard puts an entry back with its typos, each taken from wherever the draft moved it.

## Considered options

A row per typo, as QMK's text format lists them: the same correction would be typed and stored once per typo, and adding another way of mistyping a word would mean spelling the word again. Letting the draft hold an entry the keyboard refuses and blocking the save in Review: every other edit keeps the draft a profile the keyboard takes, and a refusal where it is typed says what to fix sooner. Refusing a list a layout change left untypable: the layout is changed on another screen, for other reasons, and the keyboard already skips what it cannot type. Naming an entry by its place in the list: the stored order is by the text's bytes, so a place moves under every edit.
