# Timing, built-in branches and reachability

The app contract behind
[D-L49](../LIVE_EDIT_APP_DIRECTION.md#d-l49--timing-findings-constrain-the-reachability-graph-conservatively).
The [guide](../GUIDE.md#timing-checks) describes the findings shown to users.
Firmware owns timing and participation semantics; this specification owns
conservative analysis, its limits, and presentation of inherited behaviour.

## Timing findings and analysis limits

Ark resolves each row's timing overrides against the connected settings, including
the dual-role default for authored LT rows. A Hold and Long hold that both
tap on release ("tap on release after Tap / hold threshold", "… after Long
hold threshold") have
an impossible Hold branch when Long hold is
at or before Tap / hold: no release interval selects Hold. Review and the
behaviour editor warn, and the layer graph removes that proven-impossible edge,
including behaviours reached through combo outputs. Global-default edits are
analyzed in the same draft, with new/existing/fixed findings.

Other equal or reversed thresholds warn about overlapping tiers without claiming
which action is impossible: immediate actions, scan order and release modes
matter. Positive hold-tier gaps under 50 ms, first-tap and repeat windows under
50 ms, and enabled combo windows under 50 ms receive notices. This is an explicit
comfort heuristic, never a validity rule or a model of the person's dexterity.
Warnings remain confirmable and notices need no confirmation. No values change
automatically. Combo waits are not subtracted from physical repeat windows.

This is conservative static analysis, not a complete input-state simulator.
Stored layer-source resolution and participation policies are modeled; pointing
interception, interruption, host bindings, scan cadence, fingers and overlapping
chord sequences are not proven feasible.
Unknown paths remain in the graph rather than inventing traps. Invalid timing
relationships are reported even for unplaced rows so moving one later cannot
hide the problem. Revisit the rule against firmware release-matrix tests when
release precedence changes.

## Layer reachability and escape

Ark checks sets of held/locked states through shared Boolean decisions, so
independent layer controls do not expand into an exponential list of states.
A permanently available TO(0), or universally available toggles for every
lockable layer, proves a way home directly. Other profiles receive complete
forward reachability and backward escape checks under the same conservative
action model. A held layer can be released; traps concern locks that remain
after release. Two separately escapable layers can still cover each other's
exits together, so those interactions remain part of the check.

Review reports the smallest trapping layer combinations, with concrete entry
paths and repairs. Unrelated safe locks do not multiply one trap into thousands
of findings. Paths include a hold release when it is needed to reach a later
action. Up to four trapping combinations are named; any additional minimal
combinations are counted. New, existing and fixed findings continue to follow
layer identity through reordering.

Memory and work budgets keep checks responsive. If the compact proof cannot
finish, a bounded explicit walk may still resolve a small graph (4,096 states,
65,536 edges). Any remaining warning names the involved layers and opens one
for inspection. If reachability was established but escape was not, layer and
combo reachability findings remain valid and only escape is marked uncertain.
A partial check never reports an unproved absence or marks an earlier finding
fixed in the area that remains uncertain.
Generated combo-output behaviours honor the source layer of the last declared
combo member, which owns the output independently of physical press order.
Reference remapping changes the matched code, never that physical source.
When the owner code has several eligible placements, each placement's source
conditions separately admit the row or its native fallback; another member's
permissions cannot admit the output behaviour. Generated outputs have no
physical placement: only the behaviour master and row enable/allowed-layer
mask apply, as the firmware's participation contract defines.

Feature bit 18 identifies runtime-owned tapping, extending bit 17's authored LT
bypass to every handled key (including authored MT/OSM and owned TT/OSL). Ark
keeps native-buffering warnings for those families on bit-17-only firmware.
Neither capability changes stored profile bytes. Firmware owns that policy and
its native-key controls; Ark owns these findings and their presentation.

## Built-in branches and behaviour previews

An empty tap or first-press hold is not "nothing": the keyboard runs the key's
own action there. The behaviour grid shows it as a dashed "built in" cell,
derived from the stored keycode. An empty tap sends the key's own tap once per
press, so it is claimed at every tap count up to the row's deepest stored step
and marked `×N` past a single tap; deeper counts are separate gestures and stay
empty. The hold belongs to the first press. A plain key (a basic keycode, alone
or with modifiers) taps itself and holds itself down as a fallback that any
first-press hold or long hold replaces; every firmware with a Profile Wire does
this. Bare modifiers are buffered, not tapped, and claim nothing. Dual-role
keys are claimed only where firmware advertises them: an LT() row's tap and
layer hold on bit 17, an MT() or OSM() row's tap and modifier hold on bit 18.
Older firmware classified those keys in QMK first, so Ark claims nothing there.
The other hold tier also fills a cell. With no Long hold, nothing happens at
its threshold and a release never selects it, so the press's Hold, set or
built in, carries on as its helper runs (held, repeating, sending on release,
or already sent at the Tap / hold threshold); the vocabulary's `holdWithoutLongHold`
words it. With a Long hold and no Hold at all, the press stays in its tap
window until Long hold, and a release in between sends that count's tap, set
or built in; Ark claims this for plain keys, custom keys and macros
(`releaseTaps`), not for layer keys (no tap once held past Tap / hold),
pointing keys (their own hold) or bare modifiers.
A dashed cell is display only; setting an action in it authors the tier
(core/model/built-in-behavior.js, `impliedBranch` in webview/view/keyface.mjs).
New behaviour editors start with no authored branches, preserving these defaults.
Selecting a key opens its row or an unstored grid; only an action, timing override
or anchor change creates a draft row. Previews never enter the host model's stored
behaviour list, counts or board marks. Transparent keys and `KC_NO` have no
behaviour editor, and the host rejects them as new or retargeted row targets.
Behaviour rows are keyed by keycode, so in a layer preview selecting a
transparent position opens the keycode the board shows there, answered from
below (`behaviourKeyAt` in webview/view/behavior-editor.mjs), naming the layer
that supplies it and that the row is shared by that keycode. A position answered
by `KC_NO`, by nothing, or shown alone outside a preview keeps no editor.
Changing the previewed layers re-resolves a row opened from the selected key; a
row picked from the list stays (`toggleLayerOn` in webview/store.mjs).
Opening a custom key's behaviour follows the same rule.

## Inherited timing and review

The timing controls lead with **Multi tap window** (release to next press),
followed by Tap / hold and Long hold. Behaviour and combo timing inputs show
inherited or default-matching values as muted placeholders (`150 · default`),
with no default/custom marker after `ms` in the label. Other values remain entered.
Presentation alone never rewrites an explicit override that matches the default.
When a behaviour timing default changes, explicit row values equal to that
specific old default become inheritance zeros in the same draft step. Existing
zeros follow naturally; distinct custom values stay fixed. LT's Tap / hold follows
the dual-role default, other rows the normal threshold. Unchanged defaults and
unrelated settings edits do not normalize rows.
Review lists each inherited effective-time change under Tap & Hold Timing, with
the affected behaviour and old/new milliseconds. Explicit matches adopting
inheritance appear as stored behaviour changes grouped with the settings edit.
Inherited effects are not independent discard units, so discarding the default
does not discard unrelated edits on rows that already inherited it. Undo restores
the entire step, including any former explicit values.
The host supplies per-key defaults using the same timing
resolution as review, including LT's dual-role threshold. Displaying a default
keeps the stored inheritance zero; changing another field never freezes it as an
override. Clearing an override restores the default. An unchanged empty preview
posts nothing.
The target is a lookup key, not an implicit authored tap action: copying an
`LT()` target into a tap branch would fail the firmware's placement rules.
