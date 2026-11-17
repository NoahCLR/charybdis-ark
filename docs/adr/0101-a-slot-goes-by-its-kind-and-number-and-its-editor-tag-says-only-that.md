# A slot goes by its kind and number, and its editor's tag says only that

Cited as D-L101. Amends D-L88: a replacement's editor wears no tag.

Macros, Custom keys, Pointing modes and Text replacement each put a small tag
beside the editor's title, and each tag said something different. A macro's
said **Macro 0**, what the slot is called until it has a name. A custom
key's said **Key 0** and then its keycode, `CUSTOM_KEY_0`: "Key 0" reads as a
key on the board, and the keycode was a second fact the hover card and All
keycodes already show. A pointing mode's said **Mode 0**, while everywhere
else, its name field, its keys on the board, the picker, Review and the
checks, called an unnamed mode **Slot 0**. A replacement's said **Text** or
**Macro**: what kind of replacement it is, which its Replacement section
shows right below, in the place the other three put where the item lives.

A slot with no name of its own goes by its kind and its number, everywhere
Ark names it: **Macro 3**, **Custom key 3**, **Pointing mode 3**. Core makes
these words (`macroDefaultName`, `customKeyDefaultName`,
`pointingDefaultName`, `core/model/vocabulary.js`) and publishes each slot's
as its `defaultName`; `slotName` falls back to `pointingDefaultName`, so a
key that runs an empty slot reads **Pointing mode 6 · hold (empty)**.

The tag in an editor's title bar is that default name and nothing else: what
the name field holds while it is empty, shown always, so a named item still
says where it lives. A thing with no slot number wears no tag, so a
replacement's editor, and a new replacement's, has none.

## Considered options

Keeping **Slot N** for pointing modes and tagging the editor **Pointing mode
N**: rejected, because the title bar would then read **Slot 0** in its name
field beside **Pointing mode 0** in its tag, two names for one slot side by
side. The longer name costs a key's cap a second line, which the cap already
takes for a name joined by a `·`.

The keycode beside the tag, for all three: rejected. It is a second fact in
a place for one; a person meets the keycode in the hover card, the picker's
footer and All keycodes, where it is the subject.

A tag on a replacement saying what it is or that it is new: rejected. Text
or Macro is chosen in the Replacement section under the title, the list
marks a macro replacement by the macros' icon, and a new one's title already
reads **New replacement** beside **Discard**.
