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
their bytes. The same applies to a rule whose map contains a paint Ark does
not know: its map stays unchanged and its palette entries are not replaced.
Unsupported kinds absent from the keyboard's registry are refused.

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
identity, place and deciding rules, marking shared rules as inherited. Macro identity and Customise require both advertised macro identity and playing-state support; absent capabilities retain the explanatory read-only tab. A custom key uses its stored behaviour's identity. Customise
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
Local understanding and editable presets are described below. Live fact telemetry and temporary keyboard frames remain later work.


## Facts, construction and local simulation

The pinned firmware contract owns each descriptor's parameter widths, subject
kind, construction role and retained ordering. The application implements the
open registries in `schema/lighting-kinds-v1.js`; model vocabulary supplies all
stored-value words. The connected bitmaps select offered kinds. The rule editor
saves whole known rules through the guarded `editLightingRule` builder and core
validation; adding a rule creates a stable draft rule key. It never assembles a
second stored program in browser state. Unsaved form changes are local until
Save rule. State conditions are independently negatable; events are positive
first triggers with explicit flash. Linger is state/board only. The constructor
removes incompatible timing when changing between state and event roles.
Keys-that queries 0–9 and 13 ignore their selector and show no identity field.
Queries 10/11/12/14/15 select layer/mode/macro/behaviour/combo identities from
the corresponding model collections. An explicit query change to an unused
selector stores 255; rendering, other edits and opaque-rule rewrites never
canonicalise ignored stored bytes. The pure parameter-change helper feeds the
existing posted rule builder and core acceptance path.

The pure simulator registry walkers consume an explicit situation and a native
keymap basis posted with each draft. The basis contains native key values,
authored behaviour row ids and enabled/layer-qualified combo inputs. Query
selection and what-it-does paint share the direct native-action interpretation;
neither infers arbitrary branches, automatic activation provenance or Host OS.
Every advertised fact, target, paint and timing is covered by shared vectors.

Local timing stores whole last-matching ordered batches per (rule, thing).
Partial owner refresh replaces that batch without renewing its entry token.
Full departure retains only an eligible batch; full re-entry renews the token.
Filters qualify at event occurrence; a nonqualifying repeat preserves the old
flash and a qualifying repeat replaces it. Natural module priority precedes
newer full-match entry order, then kind/id/authored order. Monotonic observation
tokens are independent of saturated lifetime ages and wrapping timer samples.
The existing Standard auto-mouse scene fade and pulses retain their parity.

Event show-after runs inside the original flash interval. State departure
cannot mature a previously unmet show-after. The simulator is an authored local
timeline, not live telemetry or a split transport emulator. Each half renders
locally; the firmware's conservative freshness is conditional on nominal
equal-rate logical millisecond timers, not measured crystal drift. Unknown age
suppresses transient paint; late arrival never deliberately restarts a window.

The pinned RGB geometry associates LED55 with matrix56, while the last physical
layout key is matrix59 with no LED association. The simulator's relative targets,
queries and what-it-does paint use that RGB matrix map. Fixed LED55 bytes, the
existing painter schematic and identity-board layout indices remain unchanged.
The situation owner fields and choices explicitly name matrix0–59 and show the
pinned LED cross-reference; the board labels fixed LED0–57. Matrix24/54/58/59
have no association in that map. Label contrast uses the shared luminance
helper on the rendered RGB, including the trackball and extra LED.
Hardware and metadata reconciliation
is a separate follow-up; no physical wiring conclusion follows from these files.

## Working-memory admission

GET0x0D page15 carries a model id, capacity, owner-bitmap bytes and layout sizes;
page128+fact-id carries compiled subject-domain, selector-parameter and maximum
whole-batch-member bounds. Optional unknown pages remain unavailable; malformed
pages fail. Unknown model ids are retained without interpreting their layout.
No capacity is inferred from absent metadata or ordinary registry support.

For supported model1, enabled new flash/linger rules reserve
`B=ownerBytes`, `C=align4(12+M*(5+B))`, `S=sum(12+N*C)`, `W=max(C)` and
`Q=2*S+W`, with zero when no new timing is enabled. A named selector uses N=1;
Any uses the module's complete subject domain. Checked u32 arithmetic and
validated bounds reject overflow. Filters, occupancy, duration and sharing give
no discount. The current pinned build reports 8220 bytes; this is device data,
not a runtime default. Existing state/show-after and Standard acceptance is
unchanged. Saved v5 remains bounded by 8192 bytes and its existing byte counts.

Structural decoding deliberately retains an over-budget imported program. The
model publishes needed/available bytes and per-rule contributions separately
from saved bytes. Review blocks activation, and the shared restore path checks
admission before any recovery write or candidate mutation. Firmware validates
again before publication. Disabled timed rules reserve no working space; unknown
rule bytes remain read-only and are never rewritten to repair a budget.
Before the zero-cost shortcut, every enabled timing must have a known cost
classification. Unknown enabled timing makes the whole estimate unknown even
in a mixed known/unknown program or with future capability metadata. This blocks
Review/restore activation before recovery or candidate writes; imported bytes,
backups and history remain available. Disabled unknown timing contributes zero.


## Local understanding and editable starting presets

The pinned firmware's [phase 4 contract](../../upstream/firmware/docs/architecture/lighting-rules-v1.md#local-understanding-and-editable-presets)
defines the existing support and proof limits. No host trace or new wire kind
is implied. `LightingSimulator.frame` and `walk` produce both pixels and optional
per-LED contribution records. Inspector consumes those records in stored rule
order, retaining the subject, owners, foreground/background source, below reads
and fade/composition weight. A zero-weight lower paint is covered at that
endpoint. A first positive atom supplies subjects; a first negation or no atom
supplies the board. Later positive atoms only filter; they never rebind identity.
Unknown active rules/maps/extensions make rendering and explanation incomplete,
not clear. Fixed LED and matrix-key selection preserve the geometry boundary above.

Whole-rule-clear counterfactuals disable the rule locally, including its
background, and replay the same observations through a fresh simulator with
unchanged indices. They make no posted edit. Replay advances the existing
lifetime wakeups between inputs while the previous situation holds, strictly
before the next observation, so a departed state cannot newly mature at an
equal boundary. It never invents event repeats or renews a continuous entry.
D1/D2, retained batches and legacy Standard/fade composition remain owned by
the existing simulator and shared vectors. A known solid base colour is supplied
to below-reading paints; without a base sample that part is explicitly illustrative.

Gesture illustrations use each stored row's native target/action codes, real
native placements, participation and inherited/effective row terms. They project
solitary short-press branch selection, held thresholds or release settlement
onto the existing facts/events, with actual feedback-half-period edges between
displayed milestones, with selectable moments on both sides of a configured
feedback half-period. Only authored tiers create thresholds. Layer preview is
qualified by the pinned handled-key contract: a delayed momentary-layer hold
previews only when the tap locks or goes to that same layer and any longer
hold also leads there. A plain tap, LT tap or mismatched longer action makes no
such promise. Registered layer/mode ownership survives a release-pending longer
tier until replacement or release. That output is independent of current
feedback phase/outcome: a prior delegated output can remain held with no visible
behaviour slot while a different longer action waits for release. Layer/mode
Painting feedback is steady and Standard delegates to its scene; ordinary
registered-key and repeat feedback retains configured blink edges. Transparent,
built-in/immediate planning, QMK buffering, pointer interception and combo
arbitration remain explicit conditional/unsupported paths. This is neither a
complete key planner nor physical timing evidence. Each overview look has its
own explicit situation and fresh history; other subjects use the selected shown
layer, while layer subjects use their own native layer. Empty/disabled and
unsupported subjects have no fabricated look. Editor/Inspector navigation posts
no draft edit.

A complete capture already reads compiled defaults; its exact RGB payload is
retained as `factoryLighting` snapshot metadata, outside the portable document.
History carries the read's basis; imports cannot replace it with authored source.
The demo uses its immutable bundled starting lighting, even when another file
is opened. `model.rgb.lighting.presets` holds core-validated previews. Standard
uses those exact compiled bytes or the existing exact v4 converter. Missing
factory data disables construction instead of approximating Standard.

Minimal selects only Standard's layer-active rules and required data, without
fade/tap-commit extensions or other feedback rules. Teaching starts from that
layer recipe with current identity tables, then places top-layer fact9/target8
query10/paint9 direct-layer-key hints above it. Enabled combos, in ascending id
order above those hints, use fact9/target8 query15/C/paint2. Their resolved slot0
colours are copied at creation to palette entries independent of all retained
identity references; copies may share with other copies. Inherit resolves before
copying, none/missing emits no accent, black is opaque. Live query matching still
checks enabled, allowed shown layer and exact native inputs. These are configured
input hints, not a reachability claim. The UI explicitly says later identity
edits do not update copied colours and recreating the preset refreshes them.
There is no hidden provenance, automatic recolouring, fake held-combo fact or
new protocol paint.

`replaceLightingPreset` carries the chosen name, expected lighting bytes,
explicit unknown-replacement intent and the preview revision. Core reconstructs
and validates all capabilities, references, palette/saved bounds, brightness
and working admission before staging a single lighting-domain rewrite. The
browser never supplies an unchecked replacement program. Opaque lighting needs
an intentional replacement acknowledgement; the old bytes remain in Undo and
backups. Other domains remain byte-exact. Normal history, Review, Discard and
export semantics apply; no device write occurs. A changed draft invalidates the
preview. Review's never-visible event-delay proof and conservative coverage/
reachability rules never turn a heuristic or unknown into a blocker.

Physical pointing cadence, drift, global/interrupt/allocator high-water and LED
geometry/appearance remain unproved. The firmware's useful8220/200ms48RPC/~137ms,
fact-delta5RPC/~20ms and quiet-reboot1s-heartbeat plus~946ms-cold-resync models
are software projections, not new UI or hardware acceptance.
