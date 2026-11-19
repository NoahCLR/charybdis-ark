# The Keyboard screen hides Diagnostics and drops Built into this firmware

Cited as D-L100.

The Keyboard screen ended with two folds a person using the keyboard does not
use. **Built into this firmware** listed the firmware's compiled limits, each
of which already shows where a person meets it: a count's limit under Memory,
the layers the keymap has, the speed steps a pointer speed offers.
**Diagnostics** held the last read's details, Ark's log of the connection
and each half's flash pauses: things for whoever looks into a fault.

Built into this firmware is gone, with `webview/view/firmware-facts.mjs`.
Diagnostics stays, unchanged, but the Keyboard screen draws it only on a
page whose address has `?diagnostics` (`diagnosticsShown`,
`webview/view/keyboard-view.mjs`); without it the fold is not drawn and the
flash pauses are never read. Its Read keyboard, which was drawn over the
fold's title and was the Keyboard screen's only one, moves to This keyboard's
heading, shown either way; with Diagnostics open it still reads the flash
pauses after the keyboard. No sentence Ark
shows a person sends them to Diagnostics: a read with parts that did not
decode, and an answer Ark could not read, say what happened and what to do
without it. The guide tells whoever needs them how to open them
([Connecting](../guide/connecting.md#the-keyboard-screen)). The rule is in
the interface contract's Keyboard screen list
([interface contracts](../spec/interface-contracts.md)).

## Considered options

Removing Diagnostics too: rejected, because a failure's own error and the
flash pauses are the only place Ark shows them, and a fault on a keyboard
far from a debugger is looked into from there.

A setting, a keyboard shortcut or a hidden press to show them: rejected. A
setting puts a switch for a developer tool in front of every person; a
shortcut or press is found by accident and cannot be linked. An address
works on any Ark page, can be sent to someone, and is gone again on the next
page opened without it.
