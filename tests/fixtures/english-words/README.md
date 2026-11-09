# English words, for the starter list's test

`words.txt.gz` is an English word list, one word a line, in small letters,
sorted. `tests/data/autocorrect-starter.test.js` reads it to hold that no typo
in Ark's starter autocorrect list (`core/data/autocorrect-starter.json`) is a
real word. Nothing else reads it and Ark does not ship it.

It is derived from SCOWL (Spell Checker Oriented Word Lists), release
2020.12.07, by Kevin Atkinson, <http://wordlist.aspell.net/>:

- the `final/` lists of every English spelling category (`english`,
  `american`, `british`, `british_z`, `canadian`, `australian` and their
  `variant_1` lists), words, capitalised words, proper names and
  contractions, at sizes 10 to 70;
- without the abbreviation lists, the `special` lists and the `variant_2`
  and `variant_3` lists, which hold spellings SCOWL itself marks as
  questionable or wrong;
- each word in small letters, kept only if it is letters with apostrophes
  between them, each once.

That is 166,444 words: only the words, which is all the test needs. Sizes
up to 70 draw on SCOWL's own lists and on sources its `Copyright` file gives
as public domain; the sources with further conditions (the UK Advanced
Cryptics Dictionary among them) enter at size 80 and are not in this file.

SCOWL's licence permits use, copying, modification and distribution for any
purpose, provided its copyright and permission notices are kept. They are in
[`SCOWL-Copyright.txt`](SCOWL-Copyright.txt), SCOWL's `Copyright` file
unchanged, which also lists the sources SCOWL was compiled from and their own
terms. The starter list itself is written for Ark and takes nothing from
SCOWL.
