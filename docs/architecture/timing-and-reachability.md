# Timing, built-in branches and reachability

How Ark's checks are made from a profile and reach Review, and the
conservative analysis behind them
([D-L36](../adr/0036-review-checks-reach-and-save-blockers.md),
[D-L48](../adr/0048-timing-advice-follows-firmware-capability.md),
[D-L49](../adr/0049-timing-findings-constrain-reachability-conservatively.md);
for the person, the [guide](../guide/review-and-save.md#timing-checks)). Firmware owns timing
and [participation](../../upstream/firmware/docs/spec/participation-policy.md).
Ark owns the analysis, its limits and how inherited behaviour is shown.

## From profile to Review

1. `ProfileDraftSession.checks()` (`core/session/profile-draft-session.js`)
   passes the keyboard's decoded profile, the draft's, the draft's layer
   order and the snapshot's destination facts (brightness limit, effects,
   detected host OS) to `draftProfileChecks` (`core/model/profile-checks.js`).
   The result is cached per history entry and keyboard.
2. `profileFindings` runs on each side. It joins the layer walk
   (`layer-reach.js`), timing (`gesture-timing.js`), rows that change nothing
   (`inert-behaviors.js`) and whole-profile checks, among them the two
   **blockers**: brightness over the keyboard's limit, and an effect it lacks.
3. `compareFindings` (`layer-reach.js`) marks each check new, existing or
   fixed. Its `findingKey` names layers through the draft's order, so a check
   follows its layer through a reorder.

Core enforces each level, not only the interface:

- **Blocker.** Apply, and Save in Live preview + save, refuse it before a recovery
  copy or HID write. A live edit that adds one is not sent, nor is a draft
  holding one sent live.
- **Trap or warning.** Apply, and Save in Live preview + save, need `confirmChecks`
  for the reviewed revision, whether the draft made it or the keyboard had
  it. A live edit that adds one waits as a proposal (`checksAdded`).
- **Notice.** It only informs.

Data the keyboard would refuse outright is refused by its editor, the decoder
or Apply's preflight, never offered as a check. Held by
`tests/session/panel-controls.test.js` ("a destination blocker refuses Apply
before recovery or HID") and `tests/session/live-edits.test.js` ("an edit that
adds a trap waits for the person; cancelling sends nothing, confirming sends
it").

## Timing findings and analysis limits

`effectiveTimings` (`core/model/gesture-timing.js`) takes a row's own value,
else the setting. Every dual-role key (`MT()`, `LT()`, `OSL()`, `OSM()`,
`TT()`) follows the dual-role term, with or without a row. Any other row
follows the behaviour term. The checks, the layer walk, the editor's defaults
(`behaviorDefaults` in `core/session/device-model.js`), review and default
normalization all use this one function. So the editor and Review resolve a
key alike (D-L49).

`gestureTimingFindings` checks every row, placed or not, so moving a key
later cannot hide a problem:

- **Proof.** Hold and Long hold both tap on release, and Long hold is at or
  before Tap / hold: no release selects Hold. This warning is the only timing
  finding that removes an edge. The layer walk drops that Hold branch, on
  combo outputs too.
- **Overlap.** Other equal or reversed thresholds warn without naming an
  impossible action. Hold styles, input delivery and scan order decide that.
- **Comfort.** Windows and gaps under 50 ms are notices. This is a heuristic,
  never a validity rule, and no value is rewritten. Combo waits are not
  subtracted from repeat windows: the keyboard times repeats from presses.

Current firmware decides every `LT()`, `MT()` and `OSM()` key itself, with or
without a row (firmware D-F27). So Ark gives no advice about combo buffering
or QMK's tap classification (D-L48).

This is static analysis, not an input simulator. It models layer-source
resolution and participation. It does not prove pointing interception,
interruption, host bindings, scan cadence, fingers or overlapping chords
feasible, and unknown paths stay possible. Revisit the proof against the
firmware's release-matrix tests when release precedence changes.

## Layer reachability and escape

A **trap** is a set of locked layers, reachable from rest, from which Base
cannot be reached once every key is let go. The firmware has no timeout and
no "clear all" key, so only unplugging recovers. The keyboard accepts such a
profile, so Review says so before Apply (D-L36).

`layerReach` (`core/model/layer-reach.js`) models a state as locked layers
plus layers held on top. Each key resolves as the firmware does: the highest
active layer that is not transparent answers. A key moves the state by:

- its own layer action, less what its row replaces (a row with steps drops
  `TT()`'s fifth-tap lock);
- its row's branches (a hold branch holds a layer only when it presses and
  holds until release);
- the combos its presses complete;
- a pointing mode's key, held or locked, for the layers its link has the
  key turn on (firmware D-F62): the hold key holds them and the lock key
  toggles them as a layer lock, as for a key, a behaviour branch or a combo
  output that runs the mode;
- a custom key's shortcut (firmware D-F26), which turns its layers on as its
  kind's layer key does: held as `MO()`, locked as a lock of several, moved
  to as `TO()` of several, held with a fifth-tap lock as `TT()`, or held as a
  one-shot as `OSL()`. That is the key itself, a behaviour hold that presses
  and holds it, or a combo output that sends it. On its own key with its own
  row, the row sends the shortcut where it leaves a tier empty: tapped from an
  empty first tap, held from the fallback hold, which only the first press has
  and only while it authors neither a hold nor a long hold, so a lock or a
  move happens from either and a held shortcut only from that hold; a tap-toggle or one-shot shortcut's layers are on from every
  press, whatever the row, and a row with steps drops the tap-toggle's
  fifth-tap lock. A tap that sends it does what tapping that layer key does: a
  held or tap-toggle shortcut turns its layers on only for the tap, so it
  moves no state, while a lock, a move or a one-shot does; sent by a step, or
  by a combo that does not run the key's behaviour, a tap-toggle shortcut
  only holds, since its taps are its key's, while a combo that runs it acts as
  the key itself;
- the trackball, which turns on the pointer layer unless an auto-sniping
  layer other than it, or a linked layer that starts its mode, keeps it off.
  A link that a higher layer ends starts its mode, and so keeps the pointer
  layer off, only while no layer above that linked layer is on; one that any
  other layer ends, only while no layer outside both of the link's sets is
  on. The pointer
  layer, the default layers and Base never count as ending it.

Only layers the keyboard runs in a link count: the pointer layer or a default
layer in a link does nothing (`core/model/pointing-links.js`). Which source
wins while another mode runs is not walked: a linked layer that starts its
mode always counts as keeping the pointer layer off, even where a mode key
held over it would let the pointer layer back.

A key that turns several layers on is one effect on all of them: they go on
together, and a hold of them is released together, so the walk never reaches
a state where only some of one key's layers are on. A lock of several turns them all on, or all off once all of them are
on. A shortcut's Lock shares each layer's lock with `TG()` (firmware layer
ownership), so this is exact: turning them all off releases a layer a `TG()`
locked too, as the keyboard does. A pointing mode's lock key is walked the
same way, though the keyboard's mode owns its layers apart from the locks, so
there the walk may let go of a layer a `TG()` still keeps on. A move to several
locks them alone and lets every other lock go; `TO(0)`'s is the base alone,
which lets them all go. A hold's release joins
the walk once a state reached can make that hold. Layers are not tracked by
the key that holds or locks them, though: where two holds share a layer (a
shortcut holding Navigation and Extra, and an `MO()` of Navigation), letting
either go drops the shared layer, and the other's release still lets go of
what is left of it; a lock of one layer of a set toggles that layer alone.
Only there can the walk reach a state a person cannot, and so name a trap no
person could fall into. Holding is not limited by fingers, and a
one-shot counts as a hold. So the walk finds every way out a person could,
and elsewhere never invents a trap.

`compactWalk` compiles keys and combos into conditions on active layers.
`analyzeLayerStates` (`layer-state-graph.js`) explores them as shared Boolean
decisions, so independent layers do not multiply into separate states.

- A permanent `TO(0)`, or a toggle for every lockable layer, proves escape at
  once. Otherwise a backward pass finds the states with a way home.
- Separately escapable layers can still cover each other's exits, so layers
  are checked together.
- Review names up to four smallest trapping combinations, each with an entry
  path and a fix, and counts the rest.
- When the budget runs out before reachability is proved, `boundedWalk`
  enumerates up to 4,096 states and 65,536 edges.
- A check that still cannot finish is a `reachabilityIncomplete` warning
  naming the layers involved. When only escape is unproved, the reachability
  findings stand. Nothing is marked fixed where the check stayed uncertain.

Besides traps, the walk reports unreachable layers and combos, layer keys left
to QMK, and layer keys that do nothing (`findings` in `layer-reach.js`).

Combo inputs follow QMK: the reference layer's raw keys when it differs from
the highest active layer, else the resolved stack, transparency included.
Outputs follow the firmware's
[generated-output policy](../../upstream/firmware/docs/spec/participation-policy.md#combo-outputs):
the last declared member owns the output, and placement bypasses and layer
behaviour switches are physical-only. A bypassed custom output supplies no
escape.

Held by `tests/model/layer-reach.test.js` ("compiled source and
declared-owner conditions agree with an exhaustive profile oracle") and
`tests/model/layer-state-graph.test.js` ("compact analysis agrees with
exhaustive enumeration on seeded interacting graphs").

## Built-in branches

An empty tier is not "nothing": the keyboard runs the key's own meaning
there.

1. `builtInActions` (`core/model/built-in-behavior.js`) decides a key's
   built-in tap and hold.
2. `behaviorDefaults` (`core/session/device-model.js`) publishes them, with
   the effective timing, its source setting and `timingAlone`. It does so for
   every keycode the profile holds and every custom key, placed or not.
3. The editor draws them as dashed cells (`impliedBranch` in
   `webview/view/keyface.mjs`).

A dashed cell is display only; setting an action in it authors that tier. A
key's grid stays in the interface until an edit stores a row. The built-in
tap of `LT(n, kc)` is `kc`. The `LT()` keycode is only the row's lookup key:
copied into a tap branch, it would break the firmware's placement rules.
Core refuses transparent keys and `KC_NO` as row targets
(`key-behavior-edits.js`).

## Rows that change nothing

A row without steps is no row (firmware D-F27, "Rows without steps"). Its
timing applies only to a key the keyboard handles anyway. Its switch and
layers gate only what it holds. Its auto-mouse anchor applies on any key. So
`changesNothing` (`core/model/inert-behaviors.js`) holds for a row with no
steps, no anchor and no timing that applies to its key.

`timingAlone` follows the firmware key runtime's classification. It is
narrower than the contract's words ("dual-role, layer and pd-mode keys"):
`TO()`, `TG()`, `LOCK_LAYER()`, pointing-mode locks, `DF()` and `PDF()` are
not handled anyway. A firmware change to it is an Ark follow-up.

The rule crosses to the interface twice. `device-profile-view.js` publishes
`changesNothing` per stored row. `behaviorDefaults` publishes `timingAlone`
per key; a key with none counts as yes. `saveBehaviour`
(`webview/view/edits.mjs`) composes the same rule for the row it would post:

- An edit that would create such a row posts nothing.
- An edit that would leave a stored row so posts `deleteBehavior`, an
  undoable "Removed a behaviour".

`tests/view/edits.test.mjs` ("the editor removes exactly the rows the core's
review notes as changing nothing") holds both sides together. Rows read or
imported that already change nothing are kept, each with an `inertBehavior`
notice. Ark removes nothing on read.

## Inherited timing defaults

A stored timing of 0 follows the default.

1. When a default changes, `editSettings` (`core/model/settings-editor.js`)
   sets to 0 every explicit row value equal to the old effective default, in
   the same draft step. An unrelated settings edit rewrites no row.
2. `profileReview` (`core/model/profile-review.js`) lists each inherited-only
   effect as a field of the Tap & hold timing change, and the rewritten rows
   as behaviour changes.
3. Review groups changes by the edit that made them, so discarding the
   default discards both.

The editor shows defaults from `behaviorDefaults` without writing them, so a
displayed default stays a stored 0. Held by
`tests/session/profile-draft-session.test.js` ("default timing edits move
matching behaviours, report inherited effects, and discard atomically").
