# Combos

A combo is two or more keys pressed together that send something else. The
keyboard holds up to 128 combos, each with up to 16 keys.

## The combos on a layer

**Keys → Combos** lists the combos for the layer you picked, grouped by how
they are reached: on the selected key, on this layer, through a transparent
key, and the ones this layer can't reach. Each row shows its badge (C0, C1…),
its keys, what it sends, its **Window**, any conditions, and **Reached by**:
the layers its keys come from when they fall through or are matched
elsewhere, or "this layer" when every key is on the layer you picked.

Click a row to see its keys ringed on the board and open it for editing, with
**Delete**. The same badges sit on the key faces on the board.

## Making a combo

**New combo** opens the builder.

1. **Sends**: what the combo sends, with **Pick…**. A combo can't send a
   layer's **Tap-hold**, which decides tap or hold on a key of its own, so
   the picker doesn't offer it.
2. **Inputs**: **Pick on board** and click the keys on the board, then
   **Done**. Click a picked key again to drop it.
3. **Keep combo in draft**.

Keep stays off until the combo has what it sends and at least two keys, and
the note beside it says which is missing. At 16 keys the note says so and
**Pick on board** takes no more. Until you keep it, the builder holds
the combo on its own; **Cancel** drops it.

Each combo also has:

- **Combo window**: how close together its keys must be pressed. Empty, it
  follows the default; **Use default** puts it back.
- **Must be held**: fires only once its keys are held past the combo hold
  threshold. Let go sooner and the keys type themselves.
- **Tap only**: fires only if its keys are let go before the combo hold
  threshold. Held longer, the keys type themselves.
- **Keys in order**: fires only if its keys are pressed in the order listed.
- **Use this combo** and **Layers it runs on**, like a behaviour's.
- **Use output behaviour**: if what the combo sends has a behaviour, run it.
  Off, the combo sends its plain output.

Must be held and Tap only exclude each other.

A combo can send a custom key. With its output behaviour off, or with no
behaviour, it sends that key's shortcut, or nothing if it has none; the
builder says which.

## Settings → Combos

- **Enabled**: every combo on or off. A key on the keyboard can change it
  too.
- **Default combo window**: for every combo without its own. New combos start
  on it, and the combos that follow it change with it.
- **Combo hold threshold**: how long a combo that must be held, or is tap
  only, waits to tell a hold from a tap. Other combos ignore it.
- **Combo outputs use behaviours**: off, combos still fire but send their
  plain output.
- **On these layers**: a key joins combos only when the layer it comes from is
  on here.
- **Layer matching**: which layer's keys each layer's combos are matched
  against. Pick the layer itself to keep its combos independent.

## Where combos run

Like behaviours, a combo fires only where every switch allows it: **Enabled**
and **On these layers** in Settings, the combo's own **Use this combo** and
**Layers it runs on**, and **Join combos** on each of its keys in the Key tab.
Every key in the combo must be allowed to take part.

Whether the output's behaviour runs depends on the behaviours switch in
Settings, **Combo outputs use behaviours**, the combo's **Use output
behaviour**, and the behaviour's own switches. The output takes the layer of
the combo's last listed key.

Review warns about a combo that can't fire, for example when its keys never
sit on the same layers at once.
