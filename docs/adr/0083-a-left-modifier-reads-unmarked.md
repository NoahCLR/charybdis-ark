# A left modifier reads unmarked

Cited as D-L83.

Wherever Ark names modifiers together, the left one reads by its name alone and the right one says so: "Ctrl+Option+Spacebar", "Ctrl+Right Option+K", joined by "+" as a modified keycode's name always was. This holds for a modified key, a custom key's shortcut, the keycode picker's modifier row and Review. A modifier key on its own keeps its side ("Left Ctrl", "Right Command"), because a board that has both needs the key's name to say which one it is. The rule has one home: the vocabulary's `modifiers`, put into the host's words by `hostKeyVocabulary` (`core/model/key-names.js`). A custom key's shortcut is worded by one rule that core and the picker both read (`shortcutWords`, `rules/shortcut-notation.mjs`): its modifiers, then its keys in press order, then its layers. Its join is "+" too, so a shortcut and a modified key read alike.

Before, the two ways of naming disagreed. A modified keycode can hold modifiers from one side only, and its name left the left side unmarked ("Ctrl+Option+Command+Spacebar"). A custom key's shortcut can mix sides (firmware D-F26), so its name marked every side: "Left Ctrl + Left Option + Spacebar". The same keys read two ways in one behaviour grid. Leaving left unmarked loses nothing when sides mix: "Ctrl+Right Ctrl" still says both.

The keycode picker's footer always shows the pick in QMK's names, a shortcut included, so a shortcut and a keycode can be compared in one notation. A shortcut shows as the chord of its parts: each modifier as its key, then its keys, then each layer as the layer key its kind acts as (`KC_LEFT_CTRL+KC_RIGHT_ALT+KC_K`, `KC_LEFT_GUI+TG(3)+TG(5)`; `shortcutChord`). Words stay everywhere a person reads what a key does: the cells, the Shortcut field, the picker's offers, hover cards and Review.

## Considered options

Marking every side everywhere, the shortcut's old way: modified keys would then read "Left Ctrl+Left Option+Spacebar" on every cap and cell, longer, for a side the keycode cannot change anyway. Keeping the two ways: the same keys read differently depending on whether a keycode or a custom key sends them. Joining with " + " everywhere: key faces break a name of two or more words onto two lines between words (D-L78), so spaces in modified keys' names would change how every such cap wraps. Words in the shortcut picker's footer: every other picker's footer shows QMK's spelling, and the words already appear in the Shortcut field once the shortcut is used.
