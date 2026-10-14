# Lighting editor

The wire format belongs to the pinned firmware's
[lighting rules specification](../../upstream/firmware/docs/architecture/lighting-rules-v1.md).
Ark decodes RGB domain `0x10` version 5 once per draft history entry. The
application never reads a firmware checkout; integration tools use an
explicitly selected checkout.

The capability read behind feature bit 31 supplies bounds and seven registries.
Colour editing requires the keyboard's plain palette paint capability. Existing
length-tagged parts whose kinds Ark cannot interpret are retained as opaque
parameters. Such rules are read-only; unrelated edits, Apply and backup retain
their bytes. Unsupported kinds absent from the keyboard's registry are refused.

Rules remain in their stored priority order. Presentation inserts a heading
when the first positive condition's band changes. It never sorts by band.
Movement can cross a band; the first rule that paints an LED wins. Rules without
a positive condition appear under Always. Negated conditions remain visible.

A rule edit carries its index and expected stored identity, guarded by the
shared draft revision. Stable presentation keys follow moves and survive Undo
and Redo. Toggle changes only the disabled bit. Delete removes one rule and
reduces the auto-mouse scene suffix count if that rule belonged to it. Move
keeps the suffix count: moving across its boundary changes scene membership.
Recolour replaces the primary paint with a plain palette reference, reusing an
identical colour, replacing an unshared fixed-paint entry, or appending one
without renumbering other references. Opaque parts forbid replacement because
Ark cannot know their references. All
edits validate the complete resulting program before staging.

Review compares the complete lighting program, including tables, maps, palette
and extensions, and displays changed fixed colours. Discard restores it as one
unit so shared references cannot become detached. Lighting and Review show
actual encoded payload bytes against the reported 8 KiB budget, warning at
90 percent. Undo and Redo belong to the existing single draft.

The v4 translator validates the source and emits the canonical v5 bytes from
the shared conversion vectors, including capability-dependent omissions. Both
import review and direct restore translate before destination validation or
candidate staging. Unsupported versions fail. Offline documents with a tap
depth other than five carry `tapDepth`; connected validation uses the keyboard's
reported depth.

Identity colours and places are edited through the same draft. Layers and
pointing modes use one colour; behaviours use hold, long hold, tap and one
colour per extra tap branch. A field can inherit the table's board default,
paint real black, or say clear. Individual combo/behaviour edits create a
named-subject identity rule above their inherited feedback, because the parity
facts still use aggregate defaults. Colour by outcome adds a hold/long-hold
rule above that identity fallback: layer and mode outcomes use their identity;
unsupported outcomes clear and leave the identity fallback visible. These
selectors and the outcome paint require their advertised capability bits.

Keys has a Lighting tab for the current layer; each behaviour, combo,
pointing-mode, macro and custom-key editor also offers it. The tab names its
identity, place and deciding rules, marking shared rules as inherited. Macros
currently have no lighting fact or identity table, so their tab explains that
capability limit. A custom key uses its stored behaviour's identity. Customise
opens a painted look for the selected thing; it reopens an existing map when
one exists. The Keys board remains an identity preview, not an arbitrary rule
renderer or LED telemetry.

The painter draws the posted map and a brush colour; it is not the combined
rule result. Brush drags collect LED positions and post one draft edit on
release; selection is local navigation, and fill posts one edit for the
selection or whole board. Keyboard Enter/Space paints or selects a focused
key. Clear, off, identity, outcome and palette paints are offered only when
advertised. Static “keys that…” selections use semantic key meanings in the
current layer, then store those selected LEDs; they do not create live query
rules. Copy takes the source layer's first painted rule, or its mapped keys
in its identity when it has no painted map. Identity cells resolve to the
source colour, so copying retains the source look rather than substituting
the destination identity. Mirror pairs physical positions
rather than wiring offsets; two unmatched left thumbs, the trackball and the
unassigned LED keep their values.

Maps are stored canonically: at most 28 non-clear cells use sparse bytes,
more use dense bytes. An identical map is reused; a shared map detaches before
editing. Palette allocation reuses identical colours and abandoned known
references without renumbering anything. Opaque rules/extensions prohibit
reuse of potentially referenced slots. Repeated brush and identity changes
therefore retain a small palette. Unknown rules stay read-only and unchanged.
Combo deletion and behaviour insertion, deletion or retargeting carry their
identity records and named selectors with the owning rows; removed subjects
remove their known rules. Unknown parts remain byte-exact.

Review shows per-identity colour and place changes together with maps, rule
order and the encoded memory total. It warns about similar active/custom
identities using wrapped hue and saturation/value distance; this is advice,
not LED calibration. Shadowing is reported only when a higher known untimed
opaque rule provably covers the lower condition and target. Existing proven
layer/combo reachability findings inform impossible lighting conditions.
Unknown kinds and memory at 90% warn; destination brightness violations block.
Inspector, gesture timeline, presets, new state families and live mode remain
later phases.
