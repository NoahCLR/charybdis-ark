# Text replacement is the feature's name, and its switch is a Host setting

Cited as D-L87.

## The name

What the firmware calls autocorrect (firmware D-F68, D-F69) is **Text replacement** wherever a person reads it: the rail, the screen's title, the Host card, the Memory panel, Review's area, the picker's words for the `AC_*` keys, every message, the guide and the README. It fixes typos, and it also types a phone number for `pnumber` and plays a macro for `sig`; "autocorrect" names the first of those and hides the others, and "typo" and "correction" made every abbreviation read as a mistake. An entry is a **replacement** and its **inputs** (D-L84).

The firmware's name stays where the firmware's things are named: the domain (`autocorrect`), the screen's id, the source files and identifiers, the contracts' edit and message types, the imported specs and fixtures, and QMK's keycodes. Renaming them would be a second vocabulary for one wire format, and a diff across every layer for no change a person sees. The seam is `GLOSSARY.md`, which maps the two, and the place a string is written: a string a person reads says text replacement, replacement and input; an identifier keeps the firmware's word.

"Autocorrect" is said to a person in one place, on purpose: the first paragraph of the guide's page. A search for the word still finds the feature's keys in the picker, whose search keeps QMK's own labels beside Ark's; the keys have no help of their own, as no switch key has (D-L88). "Shortcut" is not used for it: that is a custom key's (firmware D-F26).

## The switch

Ark's rail has two kinds of screen. A **Configure** screen holds content: keys, lighting, macros, the replacement list, custom keys, pointing modes. A **Settings** screen holds the switches and numbers that govern how that content runs: Behaviours, Combos, Pointer, Host. Behaviours, combos and auto-mouse each have their master switch on a Settings screen, marked "↺ keyboard keys change this too" with the live override beside it (the switch keys, firmware D-F66), and their editors say across the top when it is off, with the way to it (`settingOffBanner`).

Text replacement follows that. Its stored switch, key option 12 of the settings (firmware `settings-domain.md`), is a settings section of its own, **Text replacement**, on **Host**, between Your computer and Key swaps & typing: replacements are typed through the host layout chosen in the card above it, which is the one setting that decides whether an entry can fire at all. The card has the switch as **Enabled**, its override mark, and one line that says what off does and where the list is, as the combo switch says where combos are; it has no link of its own (D-L88). The Text replacement screen has no switch: it is the list, adding to it, Try it, import and export, and its memory. While the switch is off it shows the same banner the combo and behaviour editors show, which goes to the Host card. Review lists a change to the switch under Settings, as it lists the other masters, and its summary counts it beside the list.

So a section is edited on the screen `SETTINGS_SCREENS` draws it on and nowhere else: `screenOfSection` is the one answer to where Review's Show goes, and no section is special.

The list's memory is the Keyboard screen's with the rest of the profile's: **Text replacement inputs** among the counts in use, the ceiling an edit meets first (D-L84), and **Text replacement memory** after Macro memory, the list's bytes against its own limit. The screen's bank shows the same two figures (D-L88).

## Considered options

Keeping "Autocorrect" and explaining that it also replaces abbreviations: the name is read before the explanation, and the entries' own words followed it. "Text expansion" or "snippets": they name the abbreviations and hide the typo fixes, which most of a list still is. Renaming the code, the contracts and the screen id too: a rename of what the keyboard itself calls autocorrect, on the wire and in its keys, would leave Ark's words for the firmware's things unlike the firmware's. The switch at the top of its own screen, as first built: the one master switch not on a Settings screen, so a person who learned where switches are would not find it, and Review filed it apart from every other. The switch on its own Settings screen: one row is not a screen. Among Key swaps & typing, where the keyboard stores it: it is no key swap, and its switch keys override it as no swap's do, which that card's own mark could not say for one row.
