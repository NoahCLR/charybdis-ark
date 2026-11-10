# A text replacement entry is one replacement with what is typed for it

Cited as D-L84.

Ark edits the keyboard's autocorrect list (firmware D-F68) as **entries**, each one **replacement** with everything **typed** for it, the shape the firmware's domain stores. The list is for more than typos (a phone number for `pnumber`, a sign-off for `sig`), so a person reads replacement and typed, never correction and typo, and the feature is text replacement (D-L87). The firmware's names are kept in the code: a replacement is a `correction` and a typed form a `typo` in the codec, the model, the contracts and the edits, as on the wire and in the imported fixtures.

The Text replacement screen draws a row per replacement with what is typed for it beside it as chips, never a row per typed form, and every edit names what it changes: a replacement by its text or its macro slot, a typed form by its stored letters. Adding a replacement the list already has adds to that entry, and changing a replacement to one the list has joins the two, so the list never holds one replacement twice; a typed form is moved to another replacement rather than given a second one.

## Where a typed form matches is written with `*`

The keyboard stores one of four matches with each typed form: the whole word, the start of a word, the end, or anywhere in one. Ark has no control, label or message for them. A typed form is the whole word unless it is written with `*` where other letters may go: `recieve*` the start, `*mnet` the end, `*tihng*` anywhere. Core reads the `*` (`typedOf`) and writes it back (`typedForm`); a chip shows the typed form exactly as its owner wrote it, the add row and a typed form's panel carry one line of help, and a `*` anywhere else, alone or doubled, is refused in plain words. The panel publishes each typed form both ways: its stored letters, which name it in an edit, and as it is written.

Four named matches were a choice a person had to understand before typing a word, repeated on every row, for something most entries never use. Written into the typed form, the default needs nothing and the rest is one character where the eye already is.

## A replacement is text or a macro

A replacement is one line of text of up to 128 bytes, or a macro slot the keyboard plays (firmware D-F68, D-F69). An entry that plays a macro has no text and its `macro`; among the entries it is named by a key no text can be (`entryKey`), which is what the panel publishes as an entry's `id`, what Review's unit and a finding's place name, and what the screen marks. The screen shows a macro by its name and offers Text or Macro wherever a replacement is typed or changed. A macro plays for a whole word only, so a typed form with `*` is refused for one. A replacement whose macro has no steps is a warning on its row and a check in Review (`inertAutocorrectMacro`), the way a pointing mode that runs an empty macro is said: the keyboard accepts it and does nothing, so the profile carries it.

## Refusals and warnings

The list's rules have one home in core, `core/model/autocorrect-list.js`, working on the model the codec reads and writes (`core/schema/autocorrect-domain-v1.js`), so the draft only ever holds a list the keyboard takes. Two kinds of finding come from it:

- **A refusal** stops an edit, in words: what the firmware's validator would refuse (an empty or over-long text, a character a typed form may not hold, a typed form that is its replacement, one another replacement has, a macro slot the keyboard lacks, a list past its ceilings), a `*` where it cannot go, and an entry the chosen host layout cannot type when it is added or edited, since the keyboard could not type its replacement.
- **A warning** is found on the list and never stops a save: a replacement or typed form the host layout no longer types after the layout changed, a replacement another entry would change again, two that replace each other, a typed form with `*` under four letters, one that also matches inside a replacement, and a macro with no steps. The keyboard skips an entry it cannot type, so a layout change must not make the profile unsaveable; since the layout is changed on another screen, Review says it too, as one warning for the whole list (`untypableAutocorrect`, `core/model/profile-checks.js`).

The list has two counted ceilings, replacements and typed forms, both 1,024 on current firmware. Since a replacement always has something typed for it, the first can never be met before the second, so the screen and the Keyboard screen's Memory panel show typed forms against their ceiling and never a ceiling of replacements; core still holds both, and a list past either is refused by the one it passed.

The words a typed form may hold and what each folds to are the firmware's table, generated into `core/data/autocorrect-words.json` from the pinned fixture; Ark folds what is typed with it and never derives its own.

What is typed is checked before it is kept by making the edit of the draft as it stands and throwing the result away (`validateAutocorrect`, answered by `autocorrectValidation`), so the check and the edit cannot disagree, and the interface holds no rule of the list.

Review's unit is the entry (`UNIT.autocorrect`), named by its key as the keyboard has it and, when the draft changed its replacement, by both keys. An entry only the keyboard has is paired with the entry only the draft has that took most of what was typed for it, and shown as one item, changed. Discard puts an entry back with what was typed for it, each taken from wherever the draft moved it.

## Considered options

A row per typed form, as QMK's text format lists them: the same replacement would be typed and stored once per typed form, and adding another way of typing it would mean writing it again. A menu or four buttons for where a typed form matches: tried first, and it read as a decision to make on every entry. A regular-expression-like syntax: more than the keyboard stores, and nothing a person should need to learn for "also fix recieved". Long text as a second kind of replacement stored in the list: the profile already has macros, with their own memory, editor and names; a replacement that names one needs no second store. Naming a macro replacement by the macro's name in the list: a macro is renamed and reordered on its own screen, and the keyboard stores a slot. Letting the draft hold an entry the keyboard refuses and blocking the save in Review: every other edit keeps the draft a profile the keyboard takes, and a refusal where it is typed says what to fix sooner. Refusing a list a layout change left untypable: the layout is changed on another screen, for other reasons, and the keyboard already skips what it cannot type. Naming an entry by its place in the list: the stored order is by the text's bytes, so a place moves under every edit.
