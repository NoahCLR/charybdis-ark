# Lighting

The **Lighting** screen sets what the keyboard lights, and when. The board on
screen is painted the way the keyboard will light up with your draft, for the
layer you pick under it.

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

Each stage's tab shows the colour it paints. Stages 2 to 6 have a **Stage
on** switch, which turns the whole stage off without losing its colours. A
stage that paints nothing right now is drawn off and says why.

### Colours

Every stage uses the same colour editor: drag in the square and along the
**Hue** strip, or type **H**, **S** and **V**. Brightness stops at the limit
the keyboard reports.

**Turn off** stores HSV(0, 0, 0), and what that does depends on the stage. A
layer with no colour paints nothing, so what is underneath shows through, and
an LED row with none takes its stage's colour. Everywhere else black is
black: a pointing mode, combo feedback or a key feedback colour turned off
paints its area black while it runs, and the auto-mouse fade ends on black.
To paint nothing there, switch the tab's **Stage on** off. A colour with
brightness at zero but some hue and saturation also paints black, and keeps
its hue and saturation for when you raise the brightness again.

### Background effect

QMK's own effect, drawn first, under everything else. A layer with no colour
shows it.

- **Colour**: solid colour shows it as it is; most animated effects build on
  it.
- **Effect**: the effects this keyboard has.
- **LEDs**: which LEDs the effect lights: all, none, modifiers, keys, or
  modifiers and keys. Layer colours and feedback can paint any LED.
- **Animation speed**: effects without animation ignore it.

### Layer colours

Pick a layer in the list to give it a colour. **Which keys light up**: **Keys
mapped on this layer only** leaves the keys that are transparent or empty on
the layer unpainted, so what is beneath shows there; **All keys** paints
every key. Transparent keys keep their ▽ on the board either way. A layer with
no colour shows the background effect; **Give it a colour** adds one.

### Auto-mouse fade

How the auto-mouse layer's light fades when the layer drops out:

- **Fade mode**: follow the real destination, or fade to an **End colour**
  where the background effect would show, or on all keys.
- **Hold before fading**: how much of the auto-mouse timeout the colour holds
  before it fades. The timeout itself is on [Mouse](pointing.md#mouse), and
  changing it keeps this share.

The board shows where the fade lands, not the animation. With auto-mouse off,
this stage paints nothing.

### Pointing modes

Each pointing mode can light while it runs, over whatever the layer paints.
Pick a mode, give it a colour, and choose where it paints:

- **Both halves**, **Left half** or **Right half**: that area, whichever key
  started the mode.
- **The half holding the trigger key**: the whole half the key that started
  the mode is on, that key included; both halves when a combo's keys span
  them.
- **Only the trigger key**: just the key that started the mode, or every key
  of the combo that did.

A mode with no known trigger key paints every key under the last two.
**Preview it active on the board** shows it.

### Combo feedback

The colour a combo's keys wear while you hold them, and where it paints. The
combo badges on the board take their outline from it.

### Key feedback

The colours a key flashes as a behaviour fires: **Tap committed**, **Hold
active**, **Long hold active**, and one for each tap count from the double tap
on. **On the board** shows the same colours under the same names. Under
**When and where**:

- **Tap commit**: **Double taps and more** flashes when a double tap or more
  fires, unless it sends a layer or pointing key, whose own stage shows it;
  **Off** doesn't flash for taps.
- **Locality**: where the flash paints, with the same choices as a pointing
  mode.
- **Flash interval**: how long each on or off phase lasts.

These are also the colours of the behaviour dots on the board.

## LED groups

The **LED groups** tab paints single LEDs, over a stage's own colour.

1. Click LEDs on the board to select them (the trackball's LED is a button
   beside it).
2. Under **New row from the selection**, choose which stage's table it goes
   in, what it belongs to (a layer, a pointing mode or a feedback state, or
   all of them), and its colour.
3. **Keep row in draft**.

**Save selection as a group** keeps the selected LEDs as a reusable group for
other rows; with nothing selected there is nothing to save. Groups are
numbered by the LEDs they hold, so saving or removing one can renumber the
others; every row keeps its LEDs. **Used by** lists the tables and owners
whose rows use a group, and a group in use cannot be removed. Rows apply in
order, so a later row wins on an LED they share. A row whose colour is turned
off takes its stage's colour.
