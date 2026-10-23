# The board and layers

The **Keys** screen opens on the board: a drawing of your Charybdis, showing
the layer you picked in the tabs underneath. Everything on it comes from the
keyboard, with your draft's edits on top.

## Reading the board

Each key is painted with the light the keyboard would show on that layer: the
background effect, then the layer's own colour. The legend is drawn in black
or white, whichever reads. The line under the board says what the layer
paints, or that it has no colour and the background effect shows through.

On a key face:

- Dots show the key's behaviour, one for each kind of branch it sets: tap,
  hold and long hold, in the colours the keyboard flashes. A number beside a
  dot counts branches of that kind.
- Badges such as **C0** mark the combos the key is part of.
- A frosted key is transparent: it falls through to the layer below.
- A small dot in the corner marks a key changed in your draft.

The legend under the board explains each mark.

## The hover card

Rest the pointer on a key and a card opens with everything it does:

- its name and the keycode it stores
- for a key that taps one thing and holds another, both, and the tap / hold
  threshold it uses
- its behaviour, branch by branch, with the thresholds it runs on
- the macro it plays, step by step, or the pointing mode it runs
- the combos it is part of, what each sends and its other keys
- for a transparent key, which layer answers it and what that key does

When a behaviour doesn't run on this key, or changes nothing, the card says
so and what the key sends instead.

## Editing on the board

- Click a key to select it. Double-click to open the keycode picker.
- Drag one key onto another to swap them.
- ⌘C copies the selected key and ⌘V pastes it onto the selected key, on any
  layer.
- Delete or Backspace makes the selected key transparent.
- ⌘Z undoes and ⇧⌘Z redoes.

From the keyboard: Space or Enter selects a key, and Enter on the selected key
opens its picker.

Off a Mac, use Ctrl where this guide says ⌘.

## Layers

The keyboard has 16 layers. The tabs under the board pick which one the board
shows and which one you edit. Each tab shows the layer's colour, name and
number. The highest layer that is on wins; a transparent key takes what the
next layer down does; the base layer is always on.

### Rename & Reorder

**Rename & Reorder**, after the last tab, opens the layer list over the
board, highest first, with the base at the bottom.

- Type in a name to rename a layer. Names are up to 32 bytes.
- Drag a row by its grip to move it, or focus the grip and press ↑ or ↓.
- **Make base** swaps a layer with the base. The base row itself can't be
  dragged.
- **Keys follow their layers**, on by default, renumbers every layer key
  (MO, LT, TG, TO, TT, OSL and the rest) so each still reaches the same layer
  after a move. Turned off, layer keys keep their numbers and reach whatever
  layer now sits there. Names, colours and the pointer and sniping settings
  move with their layer either way.

Nothing changes until you press **Keep layers in draft**. **Discard** drops
the moves.

Make base swaps the two layers' roles: a key that reached the new base now
reaches the old one. The new base's transparent keys become `KC_NO`, since
there is nothing under the base for them to fall through to, and `KC_NO` on
the old base becomes transparent. Review then checks what the move left
behind, such as a layer nothing reaches any more.

### Previewing layers together

⌘-click more tabs to see layers on together, the way the keyboard resolves
them. The highest one is where your edits go. Keys answered from a lower layer
are frosted, with that layer's light and legend. The line under the board
says which layers are on.

⌘-click a layer again to take it out, or click any tab to go back to one
layer. The preview carries over to the Lighting screen.

### Default layers

**Settings → Default layers** sets which layers are always on underneath
every other layer. Normally that is only the base. A key on the keyboard can
change this too, until the keyboard restarts.

## The workbench

Under the board, the workbench works on the selected key. Its tabs are:

- **Key**: what the key sends. See [Keys](keys.md).
- **Behaviours**: its taps and holds. See [Behaviours](behaviours.md).
- **Combos**: the combos on this layer. See [Combos](combos.md).
- **Macros** and **Pointing modes**: the macros and pointing modes this layer
  reaches, through keys, behaviours or combos. **Edit** opens one on its
  own screen.

Each tab counts what it holds for this layer, and a dot marks a draft change.
