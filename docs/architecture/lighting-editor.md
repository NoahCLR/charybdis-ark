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

Saved identities are projected read-only onto existing Keys and pointing
surfaces for phase 1. That board is an identity preview, not an arbitrary rule
renderer or LED telemetry. Identity editing, painter, new facts, inspector,
timeline, presets and live mode belong to later phases.
