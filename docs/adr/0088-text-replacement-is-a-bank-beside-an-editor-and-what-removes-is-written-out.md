# Text replacement is a bank beside an editor, and what removes is written out

Cited as D-L88.

The Text replacement screen is built as Macros, Custom keys and Pointing modes are: a **bank** at the left and the **editor** of the item picked beside it (`.pad.library`). It was first a table of its own, a row per replacement edited in place, with a toolbar, a panel under each chip and a card of its own for Try it. Nothing else in Ark looked or worked like it, and a person who knew Macros had to learn it from nothing. It now has no component of its own where Ark had one.

- **The bank** is a card named Replacements with how much of what the keyboard holds is used ("15 of 1,024 inputs", the ceiling an edit meets first, D-L84), a search over replacements and inputs, the items, **+ New replacement**, the list's files (**Import…** and **Export**, small, under the items where a bank folds its unused slots), and **Text replacement memory** as Macros shows Macro memory. An item is a bank tile drawn as a row, since a replacement and its inputs are text: the replacement on one line (a macro as "▶ name"), its inputs under it. The list is in dictionary order; the order control went, since a search finds anything faster than a second order.
- **The editor** is one card for the replacement picked: a title bar with the screen's icon, the replacement as its title, a small tag (Text or Macro) and **Delete replacement** written out in red at the right; then sections under small-capital headings, **Replacement**, **Inputs** and **Try it**. The entry picked stays open across redraws and screens, as a bank's selection does, and the first is open when none is picked.
- **A replacement's macro is picked in the keycode picker**, opened by **Pick…** on the macros alone (`allowedKeys`), as a custom key's shortcut and a pointing mode's direction keys are picked. The picker shows macros by name, those in use apart from the empty ones. A field that takes no key of the board is not offered the board. There is no menu of 128 slots anywhere. **Edit in Macros →** goes to the macro, as a pointing mode's light goes to Lighting.
- **Inputs are chips.** **+ Input** becomes a field that adds one, or several with spaces between, and stays for the next. A chip opens in place to be written anew, with **Remove** beside its field. Moving an input to another replacement went: it was a second field in every chip for something Remove and + Input do in two steps, and the core still takes the edit.
- **New replacement** opens an editor with nothing in the list behind it, its text focused, as New macro opens a slot. A replacement always has an input (D-L84), so it joins the list with its first one; one the list already has is offered to be opened instead, and the checks refuse a duplicate as before.
- **With no replacements** the editor's place shows the empty pattern a macro with no steps has ("Your replacements start here"), with the starter list as its one primary action.
- **What heads the screen** (the switch's banner, a notice) runs across both panes (`.library-head`).
- **A file's summary is a sheet over the screen**, as a backup's comparison is, with the question's foot every dialog has (`dialogFoot`): Replace my list, Cancel, then Add to my list. Export's formats are a menu drawn and driven as the rail's menu is.

## What removes is written out

A control that removes, deletes, clears or discards something says so in words, in the red of every destructive action: Clear macro, Remove behaviour, Delete replacement, Remove, Discard. It is never a bare × or an icon alone. A × reads as "close" as easily as "delete", says nothing of what goes, and is a small target for something that loses work. This holds for the whole of text replacement and is the rule for new work: an input chip carries no ×, and opens to a field with **Remove** beside it. `browser-tests/autocorrect.spec.js` holds the screen to it.

Older controls that clear a field with a small × (a pointing mode's direction key, the chips of the picker's selection) are not changed here; they are the exception to bring in line, not a pattern to follow.

## The rest of the feature, matched to its neighbours

Every surface text replacement touches is the one its neighbours use, not one of its own:

- **The Host card** is a settings row and nothing else, as the switches of combos and behaviours are. Its link to the list (**Edit replacements →**, the only such link on any card) went; its one line says what off does and where the list is, as the combo switch says "in Keymap → Combos".
- **The `AC_*` keys** are in the picker's Switch keys with those for combos, behaviours and auto-mouse, worded alike (Text replacement On, Text replacement Off, Toggle Text replacement), and like them have no help of their own: a tile's tip is its keycode. What a switch key does is said once for all of them, in the guide.
- **Review** lists an entry as it lists a macro or a custom key: its name, then a line for each part that changed (Replacement, Input).
- **Memory** on the Keyboard screen counts **Text replacement inputs** among what is in use and shows **Text replacement memory** after Macro memory.
- **Checks and warnings** are the notes and callouts of every screen (`.note.warn`, `.unavailable`), and Review's findings are profile checks like any other.

## Considered options

Keeping the table and restyling it: it would still have been the only list in Ark edited in place, with a toolbar no other screen has. Tiles in a grid, as Macros has: a tile holds thirteen characters, and a replacement is a sentence with words under it. A × on each chip with the chip's text opening the field: two targets in one chip, one of them a bare ×. An **Add** button for a new replacement: nothing else in an editor is saved by a button, and the first input is the moment it becomes an entry. Giving every switch key the help the `AC_*` keys had: a change to three other features to keep one sentence, which the guide already says.
