# Users see Save for both keyboard operations

Cited as D-L72.

The keyboard makes edits permanent in two ways: Apply replaces the saved profile with a whole new one (firmware D-F40), which Review and save uses, and Save keeps the working copy the live modes run (firmware D-F32). A person sees Save for both: the buttons, the bar, the checks' questions, the progress, the recovery copies, the notices and the guide. The edit modes are named for it, Live edit, Live preview + save and Review and save, offered in that order (firmware's glossary names them the same). A person wants one word for "make my edits permanent", and which operation the keyboard runs underneath is the mode's business, not theirs. Code, the protocol, the firmware and earlier decisions keep Apply and Save as two operations, so a message to the keyboard and a step in the code still say which one it is. Noah's call, 2026-10-27.

## Considered options

Keeping Apply on screen for Review and save: rejected, because it gives one outcome two words, and a person would have to learn which mode uses which. Renaming Apply in code and the protocol as well: rejected, because the two operations do differ on the wire, and the firmware's words for them are a contract Ark imports.
