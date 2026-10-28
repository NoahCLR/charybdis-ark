# Keys

Select a key on the board, and the **Key** tab under it says what the key
does on this layer and lets you change it.

## The Key tab

**This key on this layer** (the layer's name follows, as in *This key on
this layer (Number)*) shows the key's **Keycode** and what it **Does**. Change it
by typing a keycode or with **Pick…**. The field takes QMK's spellings, such
as `LCTL_T(KC_A)` or `SGUI(KC_S)`. A keycode the keyboard can't store stays in
the field with the reason under it, and nothing changes.

**Where it is stored** unfolds the key's matrix row and column, layout index
and LED index. Once open, it stays open as you select other keys.

**Behaviour and combos for this key on this layer** holds **Use behaviour**
and **Join combos**. They switch only this key, on this layer, out of
behaviours and combos: the same key on another layer, and other keys on this
one, keep theirs. Turn off Use behaviour on a gaming layer, for example, so
the key sends its plain keycode at once. To switch a behaviour or a combo off
on every key, use its own **Use this behaviour** or **Use this combo**; to
switch a whole layer, Settings. The line under the switches says whether the
behaviour runs here and the key can join combos, and if not, which switch
keeps it off. A key transparent on this layer takes its switches from the
layer it falls through to; **Open this key on** that layer goes there.

**This key on every layer** lists this position on all 16 layers, highest
first. Three or more transparent layers in a row fold into one line; click it
to see each. Click a row to switch to that layer.

**What this key reaches** links to its behaviour, its combos (or **New** to
start one with this key) and any pointing mode it runs. A behaviour or combo
a switch keeps off here says **not used**, and which switch.

When you preview layers together and the key is answered from a lower layer,
the Key tab says so. A keycode you set here goes on the top layer and wins.

## The keycode picker

**Pick…**, or double-clicking a key, opens the keycode picker. It starts with
a board labelled for your computer's keyboard layout (set in
[Settings → Host](macros.md#your-computer)), with Shift above each
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

**Shortcut** is what the key sends: up to six keys held together, any
modifiers and any layers. The keys and modifiers are held while you hold the
custom key and tapped when you tap it: the modifiers go down first, then the
keys in the order you picked them, and they come back up the other way round.
**Pick…** opens the picker with only the keys a shortcut can send: keyboard
keys, media and system keys (play/pause, volume, sleep) and mouse keys
(buttons, the wheel, cursor movement). Click each key you want, in order;
click one again to take it out. A symbol such as `!` is its key with Shift,
and a shortcut has one set of modifiers, so that Shift is held for the whole
shortcut: `!` then `a` sends Shift + 1 + A, which types "!A". Taking a symbol
out takes its Shift with it, unless another symbol still needs it or you
turned Shift on yourself. A shortcut holds at most six keys, one media
key and one system key, since the computer reads one of each at a time: the
picker says so under the keys and keeps **Use shortcut** off until the choice
fits. A media key in a shortcut plays wherever the shortcut is sent: behind a
behaviour, from a bypassed key or as a combo's output. Here left and right
modifiers mix freely, so Left Ctrl + Right Option + K is fine. Its **Layers** section switches on the layers the shortcut turns on, as
many as you like, and **Turns them on as** says how, all of them alike, as a
layer key would:

- **Hold**, as `MO()`: Left Cmd + Navigation + Extra holds Command and both
  layers while you hold the key. They go off when you let go, unless a lock,
  another key or a pointing mode's key keeps them on, and a tap turns them on
  only for the tap.
- **Lock**, as `TG()`: pressing the key locks them all on, or all off again
  once all are locked.
- **Move to**, as `TO()`: pressing the key locks them alone and lets every
  other lock go.
- **Tap-toggle**, as `TT()`: on while you hold the key; tapping the key five
  times locks them, unless its behaviour has steps (any tap, hold or long
  hold), which replace those taps as they do `TT()`'s.
- **One-shot**, as `OSL()`: on while you hold the key; a tap, or holding it
  alone and letting go, turns them on for your next key press, and a quick
  second tap cancels that.

Tap-toggle and one-shot keys are layer keys like `TT()` and `OSL()`: their
layers are on from every press, even with a behaviour on the key, and they
wait the dual-role tap / hold threshold. With the other kinds, a behaviour on
the key sends the shortcut where it leaves a tap or a hold empty, so a lock or
a move happens from either. The base layer and the default layers are always on, so
their rows are dimmed and say so. Modifiers alone, a key alone or layers alone
are a shortcut too. **Clear** removes it.

**What it does** says whether the key sends its shortcut, its behaviour, both
or nothing yet, and holds the same behaviour editor as the Keymap screen. It
works before the key is on any layer. Where the behaviour leaves a tap or hold
empty, the key sends its shortcut. **Show on the Keymap screen** opens its
behaviour there, once the key is placed.

**On layers** shows where the key is used; click a layer to see it there, on
the Keymap screen's **Custom keys** tab with the key's row picked. That tab
lists every custom key a layer reaches, as the Macros tab does for macros.
**Place on a key…** takes you to the board: pick a layer, then click the key
to put it on.

A behaviour on another key can send a custom key too, and so can a combo. It
sends only that key's shortcut, layers included, never its behaviour. Sent
that way, a tap-toggle shortcut only holds its layers: its taps belong to its
own key. A combo set to run its output's behaviour is the exception: it acts
as the custom key itself, so its taps can lock a tap-toggle shortcut's layers
as the key's own do.

## Key swaps & typing

**Key swaps & typing**, on **Settings → Host** below Your computer, holds
keyboard-wide options that apply on every layer:

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
