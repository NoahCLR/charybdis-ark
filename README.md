# Charybdis Ark

**Adjust, Review, Keep.**

Ark is the editor for [my Charybdis 4x6 firmware](https://github.com/NoahCLR/charybdis-4x6).
Plug the keyboard in and you see exactly what is on it. Change it, and save it
back. You don't write C, you don't reflash, and you don't need a firmware
checkout. Everything Ark shows comes from the keyboard itself.

Paste text straight into a macro, including code and literal braces, and add
shortcuts or delays as separate steps. Pick your computer's keyboard layout in
Settings and macros type through it, accents included; emoji use Unicode entry.
Switch layouts and Review shows which macros type differently or need a fix.
Macros can suspend held typing keys and ignore new presses during playback,
automatically when Unicode entry is needed or by your choice per macro.
Key and modifier names follow that OS throughout the editors and Review.

## What you can change

- **Keys and layers.** Pick keys from a board labelled for your keyboard layout
  or search supported QMK keys, with modifier combinations the keyboard can store. Drag
  one key onto another to swap them. Rename, reorder and re-base layers, and
  preview several of the 16 layers stacked the way the keyboard would resolve them.
- **Behaviours.** Set what a key does on tap, hold and long hold, for each tap
  count, in one grid with its timing. Keep up to 128 definitions with five tap
  counts each, and choose which layers and placements use them.
- **Combos, macros and custom keys.** Build combos, write named macros or
  record taps and chords with optional hold timing, and build, reorder, copy
  and paste macro steps with their own undo and redo. Macros share the
  profile's free space, up to the keyboard's macro limit, and one macro can use all of it. Name your own
  custom keys and give each a shortcut (any modifiers, left and right mixed,
  and one key, held as long as you hold the key) and a behaviour, even before
  it sits on a layer. There are 128 slots in each bank; a combo can have up to
  16 inputs, with its own enable and layer controls. Choose whether combo
  outputs use shared behaviours, for every combo or one at a time; the chord
  stays active either way.
- **Lighting.** Set the background effect, layer and mode colours, combo and
  key feedback, and the idle timeout in seconds or minutes. Tune the
  auto-mouse fade. The board on screen is painted the way the keyboard will
  light up, with black overlays kept distinct from inherited colours.
- **Its name.** Call the keyboard what you like, and that is the name your
  computer, Chrome and Ark show once it is applied.
- **Trackball.** Set pointer speed, sniping and auto-mouse, and 32 pointing
  slots (scroll, volume, zoom, arrows, your own
  shortcuts…), with their keys. Directions and button overrides can click
  mouse buttons 1–8 or run a macro too. Mouse and Settings explain each
  control on hover.

## Nothing is saved until you say so

Choose how edits reach the keyboard, beside its name: **Live + review** (the
default), **Live** or **Apply**. In Live + review every edit takes effect on the
keyboard at once, so you can try it as you type, and nothing is permanent until
you review and **Save**; **Revert**, or unplugging the keyboard, puts back what
was saved. In Live, like VIA, the keyboard saves by itself after a
quiet interval, even with Ark closed. Unplugging loses every edit since the
last successful save. In Apply, edits wait in Ark until you apply them. If the
keyboard ever stops saving, Ark says so and restarts it for you, putting your
unsaved edits back.

Either way every edit goes into a draft with undo, redo and a full history. **Review**
lists what changed and checks what the layers let you reach. It warns you
about a layer you could lock yourself into, combos that can't fire and macros
your Host setup can't play, and in Live + review it asks before an edit that
would trap you reaches the keyboard. **Apply** (or **Save**) keeps a recovery
copy, writes both halves as one complete profile and reads the result back,
and you can stay in the editor while it does.

On **Backups**, **Export profile** saves your whole setup as one file, and
**Import profile** takes one by choosing it or dropping it onto the Import
card, then restores it after the same review. Every Apply keeps a copy of what it
replaced, ready to use again. During save recovery, Ark shows only a layout
it can verify the keyboard is running.

No keyboard to hand? **Explore a demo** opens Ark on a complete setup with nothing
connected. Every screen works and every edit shows up in the review; only Apply
needs the keyboard, and Export takes what you made there to yours.

## Install

It's early days: Ark runs as a VS Code extension, installed from a checkout,
and now also as a web page in Chrome or Edge, talking to the keyboard over
WebHID. The released page is at **https://ark.ncleroy.dev**; nothing to install,
just open it on your computer. On a phone it just says so.
You can also build it and open it locally (`npm run web`).

For the extension:

```sh
git clone https://github.com/NoahCLR/charybdis-ark.git
cd charybdis-ark
npm ci
ln -s "$PWD" ~/.vscode/extensions/noah.charybdis-ark-0.1.0   # then reload VS Code
```

Click **Charybdis Ark** in the status bar, or run **Charybdis: Open Charybdis
Ark** from the command palette.

The keyboard needs the left/right pair from the
[latest firmware release](https://github.com/NoahCLR/charybdis-4x6/releases/latest):
Ark works with current firmware only, and reads or restores nothing older,
backups from older firmware included. VIA is no longer supported. A plain `qmk compile` image can't be
read or saved by Ark.

## Learn more

- [Ark guide](docs/GUIDE.md): every screen, Review's checks, what happens
  while a profile is applied, backups, and using Ark in Chrome
- [Product goal](docs/PRODUCT_GOAL.md): what Ark is meant to become
- [Developing Ark](docs/REPOSITORY.md#development-and-installation)
