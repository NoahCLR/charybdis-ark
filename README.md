# Charybdis Ark

**Adjust, Review, Keep.**

Ark is the editor for [my Charybdis 4x6 firmware](https://github.com/NoahCLR/charybdis-4x6).
Plug the keyboard in and you see exactly what is on it. Change it, and save it
back. You don't write C, you don't reflash, and you don't need a firmware
checkout. Everything Ark shows comes from the keyboard itself.

## What you can change

- **Keys and layers.** Pick keys from an ANSI board or search all of QMK. Drag
  one key onto another to swap them. Rename, reorder and re-base layers, and
  preview several layers stacked the way the keyboard would resolve them.
- **Behaviours.** Set what a key does on tap, hold and long hold, for each tap
  count, in one grid with its timing.
- **Combos, macros and custom keys.** Build combos, write named macros or
  record them, and name your own custom keys.
- **Lighting.** Set layer and mode colours, combo and key feedback, and the
  auto-mouse fade. The board on screen is painted the way the keyboard will
  light up.
- **Trackball.** Set pointer speed, sniping and auto-mouse, and eight pointing
  modes (scroll, volume, zoom, arrows, your own shortcuts…) with their keys.

## Nothing is saved until you say so

Every edit goes into a draft with undo, redo and a full history. **Review**
lists what changed and checks what the layers let you reach. It warns you
about a layer you could lock yourself into, combos that can't fire and macros
that are too long to play. **Apply** saves a recovery copy, writes both halves
and reads the result back to prove it.

**Export profile** saves your whole setup as one file. **Import profile**
restores it after the same review.

## Install

It's early days: for now Ark runs as a VS Code extension, installed from a
checkout.

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
  while a profile is applied, and backups
- [Product goal](docs/PRODUCT_GOAL.md): what Ark is meant to become
- [Developing Ark](docs/REPOSITORY.md#development-and-installation)
