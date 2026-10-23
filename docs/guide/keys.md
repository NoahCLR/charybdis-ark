# Keys

Select a key on the board, and the **Key** tab under it says what the key
does on this layer and lets you change it.

## The Key tab

**This position** shows the key's **Keycode** and what it **Does**. Change it
by typing a keycode or with **Pick…**. The field takes QMK's spellings, such
as `LCTL_T(KC_A)` or `SGUI(KC_S)`. A keycode the keyboard can't store stays in
the field with the reason under it, and nothing changes.

**Where it is stored** unfolds the key's matrix row and column, layout index
and LED index. Once open, it stays open as you select other keys.

**Use behaviour** and **Join combos** switch this key, on this layer, out of
behaviours and combos. Turn off Use behaviour on a gaming layer, for example,
so the key sends its plain keycode at once. The line under the switches says
whether the behaviour runs here and the key can join combos, and if not,
which switch keeps it off. A transparent key takes its switches from the
layer it falls through to; **Open source placement** goes there.

**This key on every layer** lists this position on all 16 layers, highest
first. Three or more transparent layers in a row fold into one line; click it
to see each. Click a row to switch to that layer.

**What this key reaches** links to its behaviour, its combos (or **New** to
start one with this key) and any pointing mode it runs.

When you preview layers together and the key is answered from a lower layer,
the Key tab says so. A keycode you set here goes on the top layer and wins.

## The keycode picker

**Pick…**, or double-clicking a key, opens the keycode picker. It starts with
a board labelled for your computer's keyboard layout (set in
[Settings → Your computer](macros.md#your-computer)), with Shift above each
legend and Option or AltGr on the right. Below it are sections by task:
**Symbols**, **Navigation**, **Numpad**, **Layers**, **Pointing modes**,
**Macros**, **Mouse**, **Media**, **Lighting**, **Magic** and **Custom keys**,
then **More keys**, **Other QMK** and **All keycodes**. **Search every
section** finds keys by name, including your macros by the names you gave
them.

The picker shows only what this firmware can do: keys for features it wasn't
built with are left out.

**Layers** offers each layer as:

| Button | Keycode | What it does |
| --- | --- | --- |
| **Hold** | `MO` | the layer is on while the key is held |
| **Lock** | `LOCK_LAYER` | turns the layer on until pressed again |
| **Tap-hold** | `LT` | taps a key, holds the layer; pick the tap key next |
| **Tap-toggle** | `TT` | holds the layer, or toggles it when tapped |
| **One-shot** | `OSL` | the layer is on for the next key |
| **Move** | `TO` | switches to the layer |

**Pointing modes** offers each mode as **Hold** (on while the key is down) or
**Toggle** (on until pressed again).

### Modifiers

The row of modifiers above the board wraps the key you pick: Command + C
stores `G(KC_C)`. The footer shows the keycode you'll get, and **Use keycode**
stores it.

Modifiers picked with no other key are stored with one of them as the key,
wrapped in the rest: Left Ctrl + Left Shift stores `S(KC_LEFT_CTRL)`, and
Left + Right Command `RGUI(KC_LEFT_GUI)`.

A keycode can hold modifiers from one side only. For anything else, such as
Left Ctrl + Right Ctrl + C, or two modifiers from each side with no key, the
picker offers a custom key instead (on a board key, in a behaviour, or as a
combo output):

- **Use Custom key N** takes a free custom key, gives it that shortcut and a
  name, and uses it. On a key it is one draft step, and one undo takes it
  back. As a combo output it is made when you keep the combo, in the same
  step; **Cancel** leaves the draft as it was.
- If a custom key already sends exactly that, the picker offers it by name.
  If that key also has a behaviour of its own, you choose: that key, behaviour
  and all, or **Make Custom key N** with the shortcut alone.

**Use keycode** stays off for anything the keyboard can't store, so the
picker never closes into an error.

## Custom keys

The **Custom keys** screen holds 128 keys you name yourself. Each can send a
shortcut, have its own taps and holds, and go on any key or combo. The picker
lists them under **Custom keys**.

Pick one from the list (**Search by name** finds it by name or number). Its
name is the editor's title: click it to rename, Enter to keep, Escape to put
it back.

**Shortcut** is what the key sends: one key and any modifiers, held while you
hold the custom key and tapped when you tap it. **Pick…** opens the picker
with only the keys a shortcut can send. Here left and right modifiers mix
freely, so Left Ctrl + Right Option + K is fine. Modifiers alone, or a key
alone, are a shortcut too. **Clear** removes it.

**What it does** says whether the key sends its shortcut, its behaviour, both
or nothing yet, and holds the same behaviour editor as the Keys screen. It
works before the key is on any layer. Where the behaviour leaves a tap or hold
empty, the key sends its shortcut. **Show on the Keys screen** opens its
behaviour there, once the key is placed.

**On layers** shows where the key is used; click a layer to see it there.
**Place on a key…** takes you to the board: pick a layer, then click the key
to put it on.

A behaviour on another key can send a custom key too. It sends only that
key's shortcut, never its behaviour.

## Key swaps & typing

**Settings → Key swaps & typing** holds keyboard-wide options that apply on
every layer:

- **Modifiers**: swap left Ctrl and Caps Lock, use Caps Lock as left Ctrl,
  swap Option and Command on either side, disable the Command keys, swap Ctrl
  and Command on either side.
- **Keys**: swap backtick and Escape, backslash and Backspace, or Escape and
  Caps Lock.
- **Typing**: one-shot modifiers and layers, more than six keys at once, and
  autocorrect.

An option this firmware was built without says **Not in this firmware** and
does nothing. These options are marked **↺ keyboard keys change this too**:
a key on the keyboard can change them until the keyboard restarts, and they
then come back to what is set here.
