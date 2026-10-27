# Charybdis Ark

**Adjust, Review, Keep.**

Ark is the editor for [my Charybdis 4x6 firmware](https://github.com/NoahCLR/charybdis-4x6).
Plug the keyboard in and you see exactly what is on it, because everything Ark
shows comes from the keyboard itself. Change it and save it back to both
halves. No C, no reflash, no firmware checkout.

## What you can change

- **Keys and layers.** Pick keys from a board labelled for your computer's
  keyboard layout, or search every key the firmware supports. Drag one key
  onto another to swap them. Rename and reorder the 16 layers, make any of
  them the base, and preview several stacked the way the keyboard resolves
  them.
- **Behaviours.** What a key does on tap, hold and long hold, for each tap
  count, in one grid with its timing.
- **Combos.** Keys pressed together, with their own timing and layers.
- **Macros.** Paste text straight in, code and emoji included, add shortcuts
  and delays, or record what you type. Macros type through your computer's
  keyboard layout.
- **Custom keys.** Name your own keys, give each a shortcut and a behaviour.
  A shortcut holds up to six keys at once, media keys among them, and can
  turn layers on too, several at once, held, locked, moved to, tap-toggled or
  one-shot, as a layer key would.
- **The trackball.** Pointer speed, sniping on the layers you pick,
  auto-mouse, and 32 pointing modes that scroll or send arrows and shortcuts
  as the ball moves, each of which can run while its layers are on and turn
  layers on with its key.
- **Lighting.** The background effect, layer and pointing-mode colours, combo
  and key feedback, and the idle timeout. The board on screen lights up the
  way the keyboard will.
- **Its name.** Call the keyboard what you like; your computer and Chrome show
  that name too.

## Nothing is permanent until you say so

Pick how edits reach the keyboard, under **Edits** beside its name. In
**Live + review**, the default, every edit runs on the keyboard straight away
so you can try it, and nothing is kept until you review it and **Save**.
Unplug it and it goes back to what was saved. **Live** works like VIA: the keyboard saves by itself a few seconds
after you stop. **Apply** keeps your edits in Ark until you review and apply
them.

Whichever you pick, every edit goes into one draft with undo, redo and a full
history. **Review** lists every change and checks what your layers let you
reach, so you don't lock yourself into a layer with no way back. Saving keeps
a recovery copy first and writes both halves as one complete profile.

**Export profile** saves your whole setup as one file and **Import profile**
brings it back, through the same review.

No keyboard to hand? **Explore a demo** opens Ark on a complete setup with
nothing connected.

## Install

Open **<https://ark.ncleroy.dev>** in Chrome or Edge on your computer. Nothing
to install: Ark is a web page.

The keyboard needs both halves from the
[latest firmware release](https://github.com/NoahCLR/charybdis-4x6/releases/latest).
Ark works with current firmware only.

## Learn more

- [The Ark guide](docs/guide/README.md): every screen, one page each
- [What Ark is for](docs/adr/0068-the-keyboard-alone-is-enough.md)
- [Developing Ark](docs/development.md)
