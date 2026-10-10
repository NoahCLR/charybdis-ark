# Charybdis Ark

**Adjust, Review, Keep.**

Ark is the editor for [my Charybdis 4x6 firmware](https://github.com/NoahCLR/charybdis-4x6).
Plug the keyboard in and you see exactly what is on it. Change it, and save it
back. You don't write C, you don't reflash, and you don't need a firmware
checkout. Everything Ark shows comes from the keyboard itself.

Paste text straight into a macro, including code and literal braces, and add
shortcuts or delays as separate steps. Unicode text preserves accents, punctuation
and emoji on supporting firmware, with host detection, a manual OS override and separate Unicode setup in Settings.
Key and modifier names follow that OS throughout the editors and Review.

## What you can change

- **Keys and layers.** Pick keys from an ANSI board or search all of QMK. Drag
  one key onto another to swap them. Rename, reorder and re-base layers, and
  preview several of the 16 layers stacked the way the keyboard would resolve them.
- **Behaviours.** Set what a key does on tap, hold and long hold, for each tap
  count, in one grid with its timing. Keep up to 128 definitions with five tap
  counts each, and choose which layers and placements use them.
- **Combos, macros and custom keys.** Build combos, write named macros or
  record them, and name your own custom keys. There are 128 slots in each bank;
  a combo can have up to 16 inputs, with its own enable and layer controls.
- **Lighting.** Set layer and mode colours, combo and key feedback, and the
  auto-mouse fade. The board on screen is painted the way the keyboard will
  light up.
- **Trackball.** Set pointer speed, sniping and auto-mouse, and 32 pointing
  slots (scroll, volume, zoom, arrows, your own
  shortcuts…), with their keys.

## Nothing is saved until you say so

Every edit goes into a draft with undo, redo and a full history. **Review**
lists what changed and checks what the layers let you reach. It warns you
about a layer you could lock yourself into, combos that can't fire and macros
that are too long to play. **Apply** saves a recovery copy, writes both halves
and reads the result back to prove it. You can stay in the editor while it copies.

**Export profile** saves your whole setup as one file. **Import profile**
takes a current-format backup by choosing a file or dropping it onto the Import
card, then restores it after the same review. Backups from the previous
eight-layer, 32-pointing-slot firmware are translated for review too; see the
[upgrade steps](docs/GUIDE.md#upgrading-from-eight-layer-firmware).

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

The keyboard needs the left/right pair from a
[firmware release](https://github.com/NoahCLR/charybdis-4x6/releases/latest).
A plain `qmk compile` image can't be read or saved by Ark.

## Learn more

- [Ark guide](docs/GUIDE.md): every screen, Review's checks, what happens
  while a profile is applied, backups, and using Ark in Chrome
- [Product goal](docs/PRODUCT_GOAL.md): what Ark is meant to become
- [Developing Ark](docs/REPOSITORY.md#development-and-installation)
