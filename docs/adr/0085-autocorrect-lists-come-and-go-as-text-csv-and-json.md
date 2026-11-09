# Autocorrect lists come and go as text, CSV and JSON

Cited as D-L85.

The autocorrect list (D-L84) is imported from, and exported to, three file formats, read and written in one module, `core/model/autocorrect-import.js`:

- **Text**, QMK's autocorrect dictionary: `typo -> correction` a line, `#` comments and blank lines skipped. Colons around the typo say where it matches: both the whole word, a leading one the start of a word, a trailing one the end, none anywhere in a word. It is what people who used QMK's autocorrect already have.
- **CSV**, for a spreadsheet: columns `typos`, `correction` and an optional `match` (`whole word`, `start`, `end`, `anywhere`; empty is the whole word). The typos cell may hold several typos with spaces between them, since a typo never holds a space, and the row's match is each one's. A header row that names the columns allows any order. Ark reads what Excel, Numbers and Google Sheets save: RFC 4180 quoting, a comma or a semicolon between cells (the one the first row has more of, since a European spreadsheet saves semicolons), a byte order mark. Ark writes a header row `correction,typos,match`, commas, and a row for each correction and match, so the file opens one word a row.
- **JSON**, Ark's own: `{"version": 1, "entries": [{"correction": …, "typos": [{"typo": …, "match": "whole word"}]}]}`. A file in another version is refused whole. The starter list is kept in this format (`core/data/autocorrect-starter.json`) and read as a file is.

In every format, lines and rows with the same correction, spelled exactly alike, are one entry, so a file can give one correction many typos however it lists them. A list exported in any format imports as the same list.

A file is untrusted and never trusted to be well formed. A line Ark cannot read (no arrow, a wrong number of columns, an unknown match, an empty cell) is refused with its line, row or entry number and the reason, and the rest is read. Only a file that is not a list at all is refused whole: over 262,144 bytes, not JSON under a `.json` name, or another version.

Nothing changes on import until the owner chooses. Core reads the file against the draft and answers with a preview of both choices, **Add to my list** and **Replace my list**: the corrections it would make, the typos it would add to corrections the list has, the typos already there (skipped), the lines refused by the list editor's own rules (D-L84), and how many typos do not fit what the keyboard holds. In Add, a typo the list already sends to another correction is refused and named, never moved. The choice is then one draft edit carrying the preview's entries, which core plans again as it applies it, so what is kept is what the list takes at that moment and one undo takes it back.

Export writes the draft's list, the edits not yet saved included: it is what the screen shows.

## Considered options

JSON only: a list could not be brought from QMK or edited in a spreadsheet. CSV with one typo a row, as the text format has: the correction would be typed once per typo, against D-L84, and Ark still reads such a file, since rows with one correction merge. Guessing a wrong column count or an unknown match: a spreadsheet saved with the wrong separator would import as nonsense; a refusal with its row number says what to fix. Importing straight into the draft and leaving the owner to Review: a file's refused lines and what did not fit have nowhere to be said in Review, which compares the draft with the keyboard. Copying an existing typo list for the starter list: Ark is GPL-2.0, and the lists in common use are under licences it cannot take text from, so the starter list is written for Ark and a test holds that none of its typos is an English word (SCOWL, `tests/fixtures/english-words/`).
