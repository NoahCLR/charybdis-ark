# Lighting

The **Lighting** screen sets what the keyboard lights, and when. The board on
screen is painted the way the keyboard will light up with your draft, for the
layer you pick under it, and numbers each key by its LED for
[accents](#accents).

## All lighting and the idle timeout

Beside the title:

- **All lighting** turns every LED on or off. Off, nothing lights, and the
  board and every stage are drawn off.
- **Idle timeout**: how long the keyboard waits without activity before its
  lighting goes dark. Set it in **seconds** or **minutes**, up to 24 hours. 0
  keeps the lighting on. Switching the unit only changes how it reads.

## Stages

Lighting is painted in six stages, each over the one before it:

1. **Background effect**
2. **Layer colours**
3. **Auto-mouse fade**
4. **Pointing modes**
5. **Combo feedback**
6. **Key feedback**

Each stage's tab shows the colour it paints, and says under its controls,
behind **What this stage does**, what the stage does and what the board
shows of it; opened once, it stays open on every stage. Stages 2 to 6 have a **Stage
on** switch on the line of the section that says where or when the stage
paints (**Where it paints**, **When and where**, **Timing**), which turns the
whole stage off without losing its colours. A
stage that paints nothing right now is drawn off and says why.

### Colours

Every stage uses the same colour editor: drag in the square and along the
**Hue** strip, or type **Hue**, **Saturation** and **Brightness**. Brightness stops at the limit
the keyboard reports.

**Turn off** stores HSV(0, 0, 0), and the colour then reads **Off**; what
that does depends on the stage. On a layer the button is **Make
passthrough** and the colour reads **Passthrough**: the layer paints nothing,
so what is underneath shows through.
Everywhere else black is
black: a pointing mode, combo feedback or a key feedback colour turned off
paints its area black while it runs, and the auto-mouse fade ends on black.
To paint nothing there, switch the stage's **Stage on** off. A colour with
brightness at zero but some hue and saturation also paints black, and keeps
its hue and saturation for when you raise the brightness again.

### Background effect

QMK's own effect, drawn first, under everything else. A passthrough layer
shows it.

- **Colour**: solid colour shows it as it is; most animated effects build on
  it.
- **Effect**: the effects this keyboard has.
- **LEDs**: which LEDs the effect lights: all, none, modifiers, keys, or
  modifiers and keys. Layer colours and feedback can paint any LED.
- **Animation speed**: effects without animation ignore it.

### Layer colours

Pick a layer in the list to give it a colour; the
[empty layers](board-and-layers.md#empty-layers) are folded at its end, and
one with a colour is not empty. **Which keys light up**: **Keys
mapped on this layer only** leaves the keys that are transparent or empty on
the layer unpainted, so what is beneath shows there; **All keys** paints
every key. Transparent keys keep their ▽ on the board either way. A
passthrough layer shows the background effect, and the list says
**passthrough** for it; **Give it a colour** adds one.

### Auto-mouse fade

How the pointer layer's light fades when auto-mouse turns it off:

- **Fade mode**: follow the real destination, or fade to an **End colour**
  where the background effect would show, or on all keys.
- **Hold before fading**: how much of the auto-mouse timeout the colour holds
  before it fades. The timeout itself is on
  [Pointer settings](pointing.md#pointer-settings), and changing it keeps this
  share.

The board shows where the fade lands, not the animation. With auto-mouse off,
this stage paints nothing.

### Pointing modes

Each pointing mode can light while it runs, over whatever the layer paints.
A mode linked to layers paints beneath the lowest of them that is on instead
(a layer that starts it or one its key turns on),
however the mode started: those layers' own colours show over it, and higher
layers cover both (see [Pointing](pointing.md#3-what-starts-it)). Pick a mode,
give it a colour, and choose where it paints. The empty slots are folded at
the list's end, as the empty layers are in Layer colours: click the **Empty
slots** band to show them.

- **Both halves**, **Left half** or **Right half**: that area, whichever key
  started the mode.
- **The half holding the trigger key**: the whole half the key that started
  the mode is on, that key included; both halves when a combo's keys span
  them.
- **Only the trigger key**: just the key that started the mode, or every key
  of the combo that did.

A mode with no known trigger key paints every key under the last two.
While this tab is open, the board shows the picked mode running, with its
accents, as it paints with no linked layer on. When two pointing slots are
swapped on the Pointing modes screen, each mode's colour and accents go with
it (see [Pointing modes](pointing.md#pointing-modes)).

### Combo feedback

The colour a combo's keys wear while you hold them, and where it paints. The
combo badges on the board take their outline from it. While this tab is open,
the board shows one combo held, with its accents. The list on the left shows
the combos that fire on the layer shown, with the layers previewed under it,
as the Keymap's **Combos** tab lists them **On this view**, in two groups:
**Combo feedback**, the combos that light this colour, then **Hold a layer**,
the combos whose output holds a layer (MO, TT, OSL, LM, LT, or a custom key
whose shortcut holds layers) and so show that layer's light instead.
The first is held until you pick another. The keys that press it are ringed as on
the Keymap, and the ones holding it get the solid ring. Where an input is on
more than one key (two Backspace keys), it is held from the half its other
keys are on; click another ringed key to hold it from there instead, since
the half it lights follows the keys you press. A combo whose output holds a
layer shows no combo light: the board turns that layer on instead, since the
layer's own light shows the hold. A combo whose output runs a pointing mode
paints beneath it: the board runs the mode from the combo's keys, and the mode
covers the combo's colour wherever both paint. Where no combo fires on the
layer shown, the line under the board says so.

### Key feedback

The colours a key flashes as a behaviour fires, in two groups, as the
behaviour grid has a column per tier and a row per tap count:

- **Tiers**: **Tap committed**, **Hold active** and **Long hold active**
  flash as that tier fires.
- **Tap branches**: one for each tap count from the double tap on, flashed
  while a run of taps waits on that count.

Under **When and where**:

- **Tap branch commit**: **Double taps and more** flashes when a double tap
  or more fires, unless it sends a layer or pointing key, whose own stage
  shows it; **Off** doesn't flash for taps.
- **Locality**: where the flash paints, with the same choices as a pointing
  mode.
- **Flash interval**: how long each on or off phase lasts.

These are also the colours of the behaviour dots on the board and of the
behaviour grid's branch numbers.

## Accents

An **accent** lights some LEDs in a colour of their own while a layer is on,
a pointing mode runs, a combo's inputs are held or a key shows a feedback
state. **Layer colours**, **Pointing modes**, **Combo feedback** and **Key
feedback** each end with an **Accents** list for what the tab has picked: the
layer shown, the pointing mode, or the feedback colour. The list includes the
accents that light for all of them, tagged **Every layer**, **Every pointing
mode** or **Every feedback state**, which you change or remove from any of
their lists. Combo accents light for every combo. The background effect and
the auto-mouse fade have none.

Every key on the board carries its LED's number on a small label over its
top-left corner, and the trackball in its middle; the keys' legends stay as
they are on the Keymap. Accents name their LEDs by those numbers: **LEDs
24–28, 53–55**.
Point at an accent in a list and its LEDs glow on the board. Click it to keep
them glowing while you scroll the list or point at others; click it again to
let go.

1. **Add accent**, then click keys on the board to pick their LEDs, or drag
   across keys to pick each one the drag crosses. Clicking a picked key takes
   it back. The board shows the picked LEDs in the accent's colour, ringed.
2. **Colour**: **Its own**, set with the colour editor, or the stage's (**Same
   as the layer**, the mode, combo feedback or the feedback colour), useful to
   keep keys lit where a layer paints only its mapped keys.
3. **Lights for**: just what the tab picked, or all of them.
4. **Keep accent in draft** (**Send accent to keyboard** in the live modes,
   where it takes effect at once). **Cancel** drops it.

**Change** reopens an accent with its LEDs picked; keeping it changes it where
it stands, so it keeps its place in the order the keyboard paints them, a later
accent repainting an earlier one where they share LEDs. **Remove** takes it
away.

On a layer above Base, the list also shows Base's accents, which stay lit over
the layers above it; **Go to Base** is where they're changed. One exception:
while a pointing mode linked to a layer above Base runs, it paints over Base
and its accents, beneath that layer.

An accent of a combo or a feedback state lights the same LEDs whichever combo
or key caused it.

**All accents**, after the stages, lists every accent by the stage that paints
it and who it lights for; click a line to keep its LEDs glowing on the board,
and **Open** goes to it on its stage's tab.

The keyboard holds at most 640 accents, 255 on any one stage, and 128
different LED sets across every stage (older firmware holds 32 accents and 16
sets; Ark uses whatever the connected keyboard reports): accents that light the same LEDs share one set, and a set no accent
lights any more is freed. Each list shows how many are used (also **Accents**
and **LED sets** under **Memory** on the Keyboard screen). Adding one more is
refused in the draft, saying which is full, before the keyboard sees it;
remove one first.
