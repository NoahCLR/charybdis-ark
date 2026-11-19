# A VIA layout imports its keys and macros into the draft

Cited as D-L97.

Someone coming to Ark from VIA has a layout VIA saved (Save + Load, Save
Current Layout: a `.layout.json` file), and Ark's Backups took only Ark's own
backups, so they started from the compiled defaults. Noah asked (2026-11-16)
for VIA layouts to import from the Backups screen, keys and macros only, any
number of layers, with the layers above the file's emptied.

## The decision

- **The same Import as a backup.** **Import profile…** and the drop zone take
  a VIA layout as they take a backup. A JSON object with `layers` and no
  backup's `format` is a VIA layout (`core/model/via-layout.js`), and it opens
  the same sheet: the file against the keyboard, area by area, and **Use as
  draft**. The draft's history calls it "Imported a VIA layout", and Undo
  takes it back as one step.
- **Keys and macros only, into the draft's own profile.** VIA keeps nothing
  else Ark stores, so the file is read into the draft as it is: its layers
  become layers 0 up, every layer above them becomes transparent keys, its
  macros fill the first macro slots and every slot above is emptied.
  Behaviours, combos, custom keys, pointing modes, lighting, settings and the
  text replacement list stay as the draft has them. With no draft (a keyboard
  whose profile could not be read whole) there is nothing to keep, and the
  file is refused in words.
- **A blank slate, unless something is kept.** Noah added (2026-11-16) that
  someone starting over should be able to drop the rest too, and then that
  it should be the default: a VIA layout is imported before the person has
  made the keyboard their own, so what the draft holds is someone else's.
  When the draft has any, the sheet offers one switch each: remove its
  behaviours on ordinary keys, its combos, its custom keys. All start on,
  and the callout names only the kinds the draft has. A behaviour on
  a custom key goes with the custom keys, since it is part of that key, and a
  custom key is emptied as the Keys editor empties one (`emptyCustomKey`).
  Combo timing is a setting and stays. Each switch reads the file again in
  core, so the sheet's counts are what Use as draft does. The question says
  that what is kept still turns its layers on.
- **Names go with what they named, and so does each layer's own state.**
  Layer and macro names are cleared: they described what the replaced layers
  and macros held, and VIA has none to give. Each layer's own state is reset
  with them (`resetLayerState`), so a layer the file leaves empty is an empty
  layer (D-L76) unless something kept still turns it on. On every layer:
  combos matched on its own keys, no key positions taken out of behaviours or
  combos, Base alone a default layer, behaviours and combos on for every
  layer, and no auto-sniping layer. Lighting only on the layers the file
  empties: a pass-through colour (D-L94) and no accent of their own. A layer
  the file fills keeps its colour and accents, the look its slot had, as
  Noah asked (2026-11-16) once the reset took them too. That is what
  `reorderLayers` moves with a layer, less what points at a layer from
  something the import keeps: Pointing's (below), a custom key's shortcut
  layers, and the layers a behaviour or combo may act on, which the blank
  slate takes. Noah found (2026-11-16) that emptied layers stayed listed for
  the old lighting they kept.
- **The file decides the pointer layer, and nothing points at a layer that
  is gone.** Someone importing a VIA layout is starting over, and what the
  old setup pointed at was someone else's (Noah, 2026-11-16). The pointer
  layer becomes the file's highest layer above Base that holds a mouse
  button, where VIA's keymaps keep them, whether the old one was emptied or
  filled: a filled layer may be a typing layer now. With none, Auto-mouse
  turns off rather than point at a guess, and a pointer layer the file
  empties becomes its last. A pointing mode's link lets go of the emptied
  layers, and one no layer starts any more has nothing to end it. The sheet
  says when the pointer layer moved or Auto-mouse turned off.
- **What is kept and plays a macro is named.** A replacement, a pointing
  mode's direction, and a behaviour or combo the blank slate keeps play a
  macro by its slot, and the import fills or empties every slot, so each
  now plays the file's macro in that slot, or nothing. The import leaves
  them as they are, and the sheet's callout names each after what stays,
  with what it now plays: "Kept, these still play a macro by its slot,
  which now holds this file's macro or nothing: the replacement for “sig”
  plays this file's Macro 3 and Combo 0 plays nothing (Macro 100 is
  emptied)", the first eight in full. It is read from the document Use as
  draft takes, so it follows the switches, and says nothing when nothing
  kept plays a macro. A pre-release review found (2026-11-16) that neither
  the sheet nor Review said so. Review says it as a notice among its checks,
  in the sheet's names with "the imported" for "this file's", while the
  import is a step of the draft, for each whose slot holds other steps than
  the keyboard's; never a blocker, and Save asks nothing of it.
- **What VIA wrote is read as VIA wrote it.** A key is QMK's name as VIA's
  key dictionaries spell it (protocols 12 and 13; `MACRO(n)`, `CUSTOM(n)`,
  VIA 10's `MACRO00` and `USER00`), its modifier sets (`MOD_LCTL | MOD_RCTL`
  is right Ctrl, as QMK's bits are or'd), the names VIA keeps that QMK has
  renamed (`KC_SLCK`, `RGB_TOG`, `KC_GESC`, …, at the code VIA gives each,
  kept with QMK's other older spellings in `core/data/keycode-legacy.js`, so
  they type in anywhere),
  or a code in hexadecimal. A macro is VIA's text, which is Ark's grammar
  (D-L73) but for a literal brace: VIA writes `\{`, Ark doubles it.
- **A key or macro Ark cannot carry is left empty and listed.** A key Ark
  does not know or cannot place (`keyPlacementProblem`), a custom key from
  before firmware D-F14 (VIA's `CUSTOM(64)` to `CUSTOM(127)`, which current
  firmware leaves inert, and whose behaviour the file never held), a macro that does
  not read or cannot be typed on the draft's host setup, and a macro past the
  keyboard's slots are left empty, and the sheet lists each with why, the
  first eight in full. The rest of the file still comes. Only a file that is
  no layout for this keyboard is refused whole: layers of another key count
  than the 4x6's 60, or more layers than the keyboard holds.

## Considered options

Checking VIA's `vendorProductId` against the keyboard: a layout's key count
already tells a file for another keyboard, and Ark keeps no table of the IDs
VIA's definitions give the 4x6's builds. Keeping the draft's layers above the
file's: a layer the file does not mention would keep keys from another
layout, reached by keys the import changed; emptying them is what was asked.
Refusing a file with one unknown key: VIA's own Load writes no key for a name
it cannot read, and a whole layout lost for one key helps nobody. Encoders:
the 4x6 has none. One "blank slate" switch for all three: someone keeping
their combos but not their behaviours would have to remove them by hand
afterwards, and three switches cost two lines. Starting them off, as first
built: it kept someone else's behaviours, combos and custom keys, and the
layers they turn on, by default, which is not what importing a VIA layout is
for; the sheet names what goes before anything changes, and Undo brings it
back.

## Consequences

VIA's own spellings are kept in `core/model/via-layout.js` beside the
reader, and QMK's renamed names with its other older spellings;
`tests/model/via-layout.test.js` holds examples taken from VIA's key
dictionaries, and ties the per-layer settings an import resets to every
per-layer setting, so a new one is not missed. MIDI keys, which VIA names
apart from QMK, are left out as unknown; the 4x6 has no MIDI.
