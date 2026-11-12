# Each feedback case has its own locality and accents

Cited as D-L93.

A pointing mode on Lighting has its own colour, its own **Where it paints**
and its own accents, and a layer its own colour, paint mode and accents.
Behaviour feedback and Replacement feedback had one Locality for every case,
and Behaviour feedback's four tap branches shared one accent owner, **Tap
branch pending**, so an accent for the double tap also lit for the triple
tap (Noah, 2026-11-12: "I would like the behaviors and text replacement to
work the same way that PD modes and layers work"). The keyboard now stores a
locality per case and lets an accent name one tap branch (firmware D-F73), in
lighting domain version 7 under profile schema 4.8, the only ones Ark reads
(D-L64). Ark edits both stages as it edits pointing modes.

## The cases

Behaviour feedback has seven cases: the tiers, **Tap committed**, **Hold
active** and **Long hold active**, and a tap branch for each tap count from
the double tap, **Double tap** to **Quintuple tap**, named as the behaviour
grid names its rows (`branchName`). The last stands for every deeper count,
as the keyboard paints it. Each tap branch is its own accent owner,
`KEY_FEEDBACK_GROUP_TAP_COUNT_2` to `_5`, the firmware's names; **Tap branch
pending** as one owner is gone from what a person reads. Replacement
feedback keeps its four cases (D-L89, D-L92).

## Every tap branch

An accent can also light for all four tap branches and no tier: firmware
semantic `7`, `KEY_FEEDBACK_GROUP_TAP_BRANCH_ANY` (firmware D-F75), which
Noah asked for as pointing modes have **Every pointing mode** (2026-11-12).
On a tap branch, **Lights for** offers the branch, **Every tap branch** and
**Every behaviour state**; on a tier, the tier and **Every behaviour state**.
The accent keeps the colour choice every accent has: **Same as the feedback
colour** takes the colour of the branch showing, or a colour of its own. It
lists, tagged, on each tap branch's tab, opens on the first from All
accents, and paints after the accents for every state and before those for
one case, as the keyboard paints them. The group is one vocabulary entry,
`accents.keyBehavior.group` (its owner, words and members), read by
`groupOwner` in `webview/view/accents.mjs`.

## How the tabs show it

- Picking a case shows its colour, then **Where it paints** with that case's
  **Locality**, laid out as Pointing modes lays out a slot's. Changing it
  changes that case alone (`keyFeedbackLocality`,
  `autocorrectFeedbackLocality` in `webview/view/edits.mjs`, each posting the
  whole record with one field replaced, as a colour does). Replacement
  feedback keeps the note under the field saying which key the case follows.
- What a stage keeps for every case moves to a section of its own, since it
  says when, not where: **When it flashes** on Behaviour feedback (the
  tap-commit policy and **Flash interval**), **How long it flashes** on
  Replacement feedback (**Flash length**). The **Stage on** switch rides on
  that section. The two sections share the column beside the colour, so the
  tab is no taller than before.
- The list's second column, **Paints**, says where each case paints, as the
  Pointing modes list does, or **passthrough** or **off** (D-L94).
- **Lights for** offers the picked case, **Every tap branch** on a tap branch
  (below), and the stage's **Every** owner; All accents lists the tap
  branches as separate owners, and Open goes to that branch's row.
- Review names a locality change by its case and the field:
  **Hold active · Locality: All LEDs → The half holding the trigger key**.
  Undo and revert work on the record as before.
- The locality that paints the whole keyboard is **All LEDs**, which it is:
  every LED on both halves, the trackball's included. It was "Both halves"
  (Noah, 2026-11-12). A layer colour's **All keys** paint mode is **All
  LEDs** too, for the same reason, its field **Which LEDs light up**, and the
  auto-mouse fade's **End colour on all LEDs**. Only the words changed; the
  stored values are the same.

## What the board shows

On Behaviour feedback the board now shows the picked case, which it did not
before, from a key standing in for one showing it: the first key, on the
layer shown and then the others, whose behaviour would show that case as the
keyboard draws it, ringed while the case's locality follows a key. The
behaviour must run on that layer; a tap branch needs a step at its count;
hold and long hold need that tier set to an action that is no layer or
pointing key, whose own stage shows it; tap committed needs a step with a tap
and no hold, or, under the tap-commit policy, a tap at a double tap or more
that is no layer or pointing key (`showsCase` in
`webview/view/lighting-board.mjs`). With none the keyboard never shows the case,
since it shows only on keys that produce it, so the board shows nothing for it
and the line under the board says so. It paints in the
case's colour by the case's own locality, then the accents for every state,
for every tap branch when it is one, and for the case, as firmware stage 7 does (`rules/led-light.mjs`,
`behaviour`). Replacement feedback's board paints the picked case by that
case's locality.

The board shows one case at a time. When keys show several, the keyboard
paints the widest area first and lets the newest key decide a shared one
(firmware D-F73); the guide says so, and the board does not simulate it.

## Considered options

- **One Locality per stage, with accents per tap branch only.** Rejected:
  Noah asked for the stages to work as pointing modes and layers do, and the
  locality is where the cases differed most.
- **Keep the tap branches as one owner, with the branch picked in the accent
  editor.** Rejected: an owner per branch is what the keyboard stores, and
  it lists and reviews as every other owner does.
