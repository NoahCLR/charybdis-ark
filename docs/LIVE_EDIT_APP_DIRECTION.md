# Ark — Direction

The current status of Ark and the decisions behind it. The end goal is
the [product goal](PRODUCT_GOAL.md); the technical authority is
[`architecture/device-resident-profile.md`](../upstream/firmware/docs/architecture/device-resident-profile.md).
This document records how we get there and what we decided along the way.
Verification logs, build numbers and the branch's setup history are in git, not
here.

## Who Owns What

This repository owns the app, the [product goal](PRODUCT_GOAL.md), the product's
status and the app's decisions. The firmware repository
([NoahCLR/charybdis-4x6](https://github.com/NoahCLR/charybdis-4x6); local paths in
the [workspace map](REPOSITORY.md#local-development-workspace)) owns the device:
its runtime, stored profile, wire and split protocols, its specs (pinned here
under [`upstream/`](../upstream/README.md)) and the decisions that constrain it,
in its `docs/LIVE_EDIT_APP_DIRECTION.md`, "the firmware direction" below.

Each decision has one home. D-L identifiers and their original heading anchors
remain findable in both repositories, but only the owner holds the text. This
document groups firmware-owned decisions in the
[pointer table](#firmware-decision-pointers). Change a decision where its text
lives. New
app decisions continue the D-L series here; firmware numbers its own from D-F01.

## The Direction In One Sentence

The keyboard becomes the source of truth, and Ark becomes a client of
the keyboard rather than a client of the repository.

## Current Product Status

Ark ([this repository](../README.md)) reads
everything it edits from the keyboard without a firmware workspace, keeps every
change in one reviewed draft, and applies it to both halves as one atomic
logical generation. The user reports that the workflow works on their keyboard;
that is useful manual feedback, not completion of the hardware acceptance
matrix.

| Product surface | Current state |
| --- | --- |
| Layout and 16 layers | Read/write keys, layer names and order; a reorder renumbers layer keys by default, any layer can be the base, and key labels follow the host layout (D-L15, D-L29, D-L37, D-L56) |
| Key behaviours, combos and RGB | Read/write editors over the shared draft, with participation controls at every scope (D-L12, D-L32, D-L49, D-L55) |
| Macros | 128 named VIA macros with Text, steps, Advanced raw payload, recorder and live validation; capability-gated Unicode text, typed and checked through the host's OS and keyboard layout; per-macro input protection; one shared memory, shown and enforced (D-L25, D-L26, D-L56, D-L57) |
| Custom keys | 128 named keys that do what their behaviour says: rename, add or open the behaviour, place, see where each is used (D-L42) |
| Mouse | Pointer and sniping DPI, auto-sniping and auto-mouse, settings the core files under Mouse, so the rail, the review and import counts all place them there; the auto-mouse fade is a share of the timeout, edited on its lighting stage (D-L17) |
| Pointing modes | 32 device-owned slots in the sparse PD domain (D-L41, D-L54); see [PD-mode domain v1](../upstream/firmware/docs/architecture/pd-mode-domain-v1.md) |
| Global policy | Every other portable setting, including startup layers, combo matching, Host and device-reported lighting and key options; the lighting idle timeout is edited in seconds or minutes; unsupported firmware features stay read-only (D-L18, D-L56) |
| Backup and restore | Complete current-format snapshots, import review against the keyboard, recovery file and verified restore; the preceding eight-layer backup is translated before review (D-L15, D-L23, D-L54) |
| Drafts and Apply | One draft with item-by-item review, discard by edit group, Show, undo/redo and history; the review checks reachable actions, confirms warnings and traps and blocks what the destination cannot save; Apply names its steps and halves and says where a failure happened (D-L19, D-L23, D-L29, D-L30, D-L36, D-L60, D-L61) |
| Recovery | Atomic logical Apply, differential custom and VIA transfer, reboot recovery fencing, firmware roll-forward after the decision, resume after a lost or power-cycled peer link, bounded cancel owned by the keyboard (D-L20–D-L22, D-L27, D-L39, D-L58) |
| Where it runs | The VS Code extension, and a web page in Chrome or Edge over WebHID, published from `dev` to `ark-dev.ncleroy.dev` and from `main` to `ark.ncleroy.dev`; a phone gets only a notice (D-L02, D-L52) |
| Demo without a keyboard | The bundled demo profile in a real draft, in both hosts: every screen editable and reviewed, Apply refused, Export saves the draft (D-L53) |

The rail's health strip shows connection, both-half convergence, draft state
and recovery state. Convergence needs the firmware's peer-known and
peer-converged flags, not just matching generations. With several compatible
keyboards connected, a selector picks one; a dirty draft stays bound to its
keyboard, and a reconnect requires an explicit review before Apply.

Remaining before calling the product complete:

- physical interruption acceptance at every durable boundary;
- adoption or conflict reporting for writes by external VIA clients;
- guided recovery, and an explicit reset to compiled defaults;
- broad hardware acceptance, including blank-firmware restore and the
  [PD-mode hardware matrix](../upstream/firmware/docs/architecture/pd-mode-domain-v1.md#hardware-acceptance).
  USB role migration is untested: on the normal pair the left half exposes no
  Raw HID interface (`FORCE_SLAVE`/`usb_disconnect`), so it needs role-switching
  firmware;
- the open issues below.

## Open Issues

- **Sparse macro read timing needs hardware acceptance (D-L23).** Compare
  first read, Refresh and Export with mostly empty and full macro banks, and
  after shortening a macro. Automated counts prove reduced transfer volume;
  they do not measure USB latency or typing/pointing cadence.
- **The picker's list of unbuilt QMK features is written by hand** (D-L05).
  `webview/view/picker-sections.mjs` hides keycodes for features this build
  does not include, matched against its rules files and QMK's defaults. It
  drifts when a feature is enabled or disabled. The keyboard should report its
  built features so the picker reads them from the device.
- **Firmware open issues** are tracked in the firmware direction: the one-half
  power-cycle recovery transition, why a peer stops acknowledging a push or
  fails a flash write mid-copy (D-L22, D-L27), physical acceptance of buffered gesture timing
  (firmware D-F01) and the keycode-block migration not yet run on hardware (D-L42).

## The Tools

- **Charybdis Ark** (this repository) is the app and the only one
  developed (D-L35). Nothing at runtime reads the firmware repository.
- The first live app, v1, is removed; see
  [Historical decisions](#historical-decisions).

## Remaining Load-Bearing Contracts

The firmware direction records three contracts the app must preserve: the
canonical profile format (D-L15), one logical generation across the VIA and
custom stores (D-L21), and adopting or surfacing writes by external VIA clients,
which is not yet built.

## Firmware decision pointers

These decisions are owned by the firmware direction. Each identifier and its
original heading anchor remain here so existing citations resolve; change the
text in the firmware repository.

| Decision | Subject | Owner |
| --- | --- | --- |
| <a id="d-l07--specs-are-promoted-process-is-deleted"></a>D-L07 | Specs are promoted, process is deleted | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l07--specs-are-promoted-process-is-deleted) |
| <a id="d-l08--the-live-profile-owner-is-on-by-default"></a>D-L08 | The live-profile owner is on by default | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l08--the-live-profile-owner-is-on-by-default) |
| <a id="d-l13--combo-readback-is-device-data"></a>D-L13 | Combo readback is device data | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l13--combo-readback-is-device-data) |
| <a id="d-l14--device-edits-are-saved-as-a-complete-generation-bound-profile"></a>D-L14 | Device edits are saved as a complete, generation-bound profile | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l14--device-edits-are-saved-as-a-complete-generation-bound-profile) |
| <a id="d-l17--the-keyboard-reports-its-brightness-limit"></a>D-L17 | The keyboard reports its brightness limit | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l17--the-keyboard-reports-its-brightness-limit) |
| <a id="d-l18--native-settings-use-device-reported-capabilities"></a>D-L18 | Native settings use device-reported capabilities | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l18--native-settings-use-device-reported-capabilities) |
| <a id="d-l21--apply-publishes-one-atomic-logical-generation"></a>D-L21 | Apply publishes one atomic logical generation | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l21--apply-publishes-one-atomic-logical-generation) |
| <a id="d-l22--a-cancelled-save-ends-in-bounded-time-and-says-why-it-ended"></a>D-L22 | A cancelled save ends in bounded time, and says why it ended | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l22--a-cancelled-save-ends-in-bounded-time-and-says-why-it-ended) |
| <a id="d-l24--directional-modes-can-read-eight-directions"></a>D-L24 | Directional modes can read eight directions | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l24--directional-modes-can-read-eight-directions) |
| <a id="d-l25--via-macros-have-names-user-macros-are-retired"></a>D-L25 | VIA macros have names; user macros are retired | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l25--via-macros-have-names-user-macros-are-retired) |
| <a id="d-l27--a-stale-copy-on-the-other-half-can-no-longer-hold-off-every-later-one"></a>D-L27 | A stale copy on the other half can no longer hold off every later one | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l27--a-stale-copy-on-the-other-half-can-no-longer-hold-off-every-later-one) |
| <a id="d-l28--dominant-axis-and-eight-directions-are-one-directional-engine"></a>D-L28 | Dominant axis and eight directions are one directional engine | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l28--dominant-axis-and-eight-directions-are-one-directional-engine) |
| <a id="d-l34--layer-keycodes-are-owned-in-the-firmware-and-the-app-follows"></a>D-L34 | Layer keycodes are owned in the firmware, and the app follows | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l34--layer-keycodes-are-owned-in-the-firmware-and-the-app-follows) |
| <a id="d-l38--the-dual-role-setting-is-qmks-tapping-term"></a>D-L38 | The dual-role setting is QMK's tapping term | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l38--the-dual-role-setting-is-qmks-tapping-term) |
| <a id="d-l39--only-the-keyboard-ends-a-staging-together-with-its-candidate"></a>D-L39 | Only the keyboard ends a staging, together with its candidate | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l39--only-the-keyboard-ends-a-staging-together-with-its-candidate) |
| <a id="d-l40--firmware-builds-use-only-the-eight-slot-pointing-engine"></a>D-L40 | Firmware builds use only the eight-slot pointing engine | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l40--firmware-builds-use-only-the-eight-slot-pointing-engine) |
| <a id="d-l41--pointing-keycodes-name-slots-not-factory-presets"></a>D-L41 | Pointing keycodes name slots, not factory presets | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l41--pointing-keycodes-name-slots-not-factory-presets) |
| <a id="d-l42--userspace-keycodes-sit-in-fixed-blocks-and-custom-keys-are-named"></a>D-L42 | Userspace keycodes sit in fixed blocks, and custom keys are named | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l42--userspace-keycodes-sit-in-fixed-blocks-and-custom-keys-are-named) |
| <a id="d-l43--split-activity-optimization-at-qmks-default-baud"></a>D-L43 | Split activity optimization, at QMK's default baud | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l43--split-activity-optimization-at-qmks-default-baud) |
| <a id="d-l46--firmware-has-no-reverse-dependency-on-ark"></a>D-L46 | Firmware has no reverse dependency on Ark | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l46--firmware-has-no-reverse-dependency-on-ark) |

## Decisions

Numbers are stable and cited from code and docs.
Firmware decisions are indexed in the [pointer table](#firmware-decision-pointers);
the firmware direction owns their text.
Decisions about the retired v1 app, and the numbers retired without a heading,
are under [Historical decisions](#historical-decisions) at the end.

<a id="d-l02--ark-is-a-vs-code-extension-for-now"></a>

### D-L02 — Ark runs in VS Code and a web page

Ark ships as its own VS Code extension and as a web page beside it (D-L52).
Both hosts run the same core and interface, and neither requires a firmware
workspace (D-L44). The core has no `vscode` imports: a host supplies its device
adapter and shell without rewriting the app.

The web host lets people use Ark without installing VS Code, while keeping the
extension available for those who already use it. A standalone desktop host
remains a shell and adapter choice rather than a reason to fork the app.

### D-L04 — The source editor is retired

Profile Studio has been removed. Authored C defaults are edited directly in the
firmware repository and validated by its host tests and introspection tools.
Ark edits device profiles and does not import or export C source.

### D-L05 — The keycode catalog is vendored, not parsed

A build step (`npm run keycodes`) reads QMK's `*.hjson` keycode files once and
emits a checked-in JSON catalog inside Ark, stamped with the QMK
version it came from. Keycodes arrive from VIA as bare `uint16`, and the app
needs both directions without a firmware workspace. Vendoring also turns QMK
version drift into a diffable file rather than a silent behaviour change.

The same step also reads the layout extras' shifted US symbols (`S(KC_1)` is
`KC_EXLM`) and the keyboard's own keycodes from `enum charybdis_keycodes` in
`keyboards/bastardkb/charybdis/charybdis.h`. Those take their QK_KB slots under
the header's short name (`DRGSCRL`), with the long name and `QK_KB_n` kept as
aliases. The `QK_KB` range is fixed by QMK and the keyboard code, not by the
userspace action ABI, so these keys need no matching vocabulary. Their drag
scroll is the keyboard code's own, at a fixed `CHARYBDIS_DRAGSCROLL_DPI`, which
the Pointing modes settings do not reach. Drag scroll is the `PD_SLOT_0`
pointing mode, so the picker does not offer `DRGSCRL` or `DRG_TOG`; a key
already holding one still reads back as "Built-in drag scroll".

A name the catalog gives a key must be what the key does wherever it is
placed. A key or a combo output runs QMK's full key handling, so any keycode
works there. A behaviour sends QMK and keyboard functions (keycodes past the
layer keycodes and below the user range: the DPI and sniping keys, RGB Matrix,
Magic, `QK_BOOT`) as a synthetic QMK record, so they run as on a key, and says
so with Profile Wire feature bit 15. A key whose own keycode is one keeps a
plain key's fallback hold: with only a double-tap branch on `SNIPING`, holding
it still holds sniping, as with no behaviour at all. Older firmware sent them through
`tap_code16()`, which keeps only the low byte (`DPI_MOD` sent nothing), so
against a keyboard without bit 15 the app refuses them in a behaviour's target,
tap or hold (`behaviorEmitProblem` in `core/schema/actions.js`).

The picker offers only what does something on this keyboard. It leaves out
retired user macros, the Charybdis drag scroll and unnamed `QK_KB` slots, and
keycodes for QMK features the build does not include (MIDI, audio, RGBLight,
Caps Word, Repeat…); see Open Issues. A key that already holds one still reads
back by name.
VIA macro slots appear as `VIA_MACRO_0`–`VIA_MACRO_63` throughout the app.
Their QMK numeric identities still round-trip, but the picker does not offer
duplicate `QK_MACRO_n` names from the first 32 slots.

### D-L09 — Ark owns a canonical profile format, not `.c`

Backup, restore, sharing and version control go through the portable profile.
`.c` import and export remain outside Ark. This amends the product goal,
which listed the C files as an import source and export target of the control
software; honouring that would drag C parsing and the repository dependency
back into the app.

### D-L10 — Ark is layered, and the layering is enforced

`core/` is split into `transport`, `schema`, `protocol`, `model`, `session` and
`data`, with imports pointing one way and `tests/` mirroring it. The webview
never imports `core/`; it renders the model the host posts, so the core runs in
plain Node and the UI stays replaceable. The rules and where new work belongs
are in [`AGENTS.md`](../AGENTS.md).
The structure exists because the thing it replaced was a 14,539-line file that
grew one convenience at a time.

Type-only dependencies follow these same rules. Shared declarations for posted
panel data live outside core in `contracts/` (D-L59), so the interface can share
the host's contract while remaining independent of the core.

### D-L11 — Current state comes from the keyboard, including compiled defaults

The app parses no C file and reads no repository file at runtime;
`tests/layering.test.js` fails if a `core/` module names one. A keyboard with
nothing committed still runs its compiled defaults, which Profile Wire value
`0x05` serves over the same page layout as the committed payload. If the
flashed firmware was built from different data than the repository holds, the
app shows what is flashed. Compiled defaults are labelled as such; generation 0
reads as "no committed profile".

Compiled defaults are authored data in the keymap files: layer names beside the
layouts, each macro's name beside its payload, a combo's own window on its row
(`COMBO_WINDOW`), and LED groups kept for later in `rgb_config.c`. Userspace
only serves them. With nothing stored, the settings readback reports those
names and the combos run with those windows; saved LED groups ride in the
compiled RGB domain. A stored profile keeps its own.

Two pieces of keyboard-definition data ship with the app because no device
command exposes them: the vendored keycode catalog and the Charybdis layout
matrix. Neither carries configuration; they only decode what the device sends.

Readback is tested through the posted model and rendered controls, not just
the byte decoders: passing codec tests once coexisted with a profile that never
reached the UI. Semantic links to native keycodes are enabled only for a known
action ABI advertised by the keyboard. Layer preview membership follows the
firmware: transparent and no-action keycodes are unmapped whatever their alias.
Every decoded `uint16` must encode back to its original value. Zero timing
values stay visible, with the unreported firmware default stated. Recorded
device bytes are test-only fixtures, never runtime data.

The Configure screens reveal the keyboard only after the complete portable
read has opened an editable draft. Layout, committed domains, VIA base RGB and
the complete profile arrive in separate reads and are published separately for
diagnostics, but their partial previews must stay behind one loading state.
Every screen menu is disabled during that read. Afterwards, Configure requires
an editable draft; Profile & backups requires complete-profile support; Device requires a connected
keyboard that reported its capabilities.

### D-L12 — RGB rule identity and preview appearance are separate

Pass-through is a layer paint operation, not a colour. The app reads QMK RGB
Matrix settings over standard VIA channel 3 (brightness, effect, speed,
hue/saturation), outside custom-profile generation identity, requiring
consecutive matching samples since VIA has no atomic snapshot. An unstable read
clears the base colour and leaves custom-profile readback intact.

The board is a **selected-layer preview**: base plus the selected layer, their
colours in layer order, then their LED groups in reported order, following the
firmware's membership, pass-through and inheritance rules. It is not LED
telemetry: brightness is scaled to a ceiling, and effects, animation phase,
active layers and transient feedback are not reported. Exact live appearance
would need a future device-frame readout, not host reconstruction.

Colour editors retain every stored channel at zero brightness. A saturated
layer colour at zero brightness paints black; a layer colour with zero
saturation and brightness paints nothing. LED-row inheritance requires all
three channels to be zero. The editor never substitutes the inheritance
sentinel for an explicit black colour.

### D-L15 — A portable profile is the complete effective configuration

Export and import own the whole keyboard snapshot. Flashed and committed
domains are materialized into the same document from device reads: every
matrix position, the VIA macros and their names (D-L25), RGB, behaviours,
effective combos, pointing slots, global settings and layer names. Missing and
explicitly empty domains mean different things; a complete file carries every
domain and never falls back to destination authored data. The contract is in
[portable-profile-v1.md](../upstream/firmware/docs/architecture/portable-profile-v1.md).

The standard image reserves 16 layers; base stays at index zero and the app
moves overlays and rewrites references together. The action ABI describes the
engine vocabulary independently of authored rows, so empty and populated
builds advertise the same ABI. The old five-layer snapshot bridge is retired
(D-L40). Ark edits current portable snapshots and translates the immediately preceding
eight-layer backup before Import review (D-L54). No firmware is flashed by the app.

Choose profile and dropping one file onto the Import profile card open the
same validated review in both hosts and in the demo. Dropping is available only
when Import is editable; multiple, unreadable and oversized files are refused
without changing the draft. File drops never navigate away from Ark.

Before a file becomes the draft or is restored, its card compares it with what
the keyboard holds, since that is what applying it would write, counting the
differences by what they configure: Keys, Lighting, Macros, Mouse and Pointing
modes (anything else under Other), each with added, changed and removed
totals. It names no single difference; that is the draft's review. A file identical to the keyboard says so and cannot
be used. A file carries no layer order, so it is compared slot by slot. See
`importDifferences` in `core/session/panel-session.js` and `categorySummary`
in `webview/view/review.mjs`.

### D-L19 — One whole-profile draft and review

A complete device snapshot seeds one window-local draft. Every editor, import
and layer edit updates it, with one undo history. Keep does not write HID.
Each frozen history entry holds its document, edit origin, label, time and
layer order together; branching and trimming move the whole entry, while its
document retains its cached decode.
Apply requires the exact reviewed draft revision and the matching connected
device; draft revisions are never device generations. Unfinished forms survive
keeping another section and re-reading the device; undo, redo and review
require them to be kept or discarded first. An external change preserves the
draft and blocks a stale Apply; **Review against keyboard** compares it
against a fresh read and never silently merges. An incomplete read is labelled
as recovery, never as a complete backup. Export captures the saved keyboard,
not unapplied changes. Closing the editor loses the draft.

### D-L20 — Differential Apply

The VIA macro bank is 34,903 bytes (10,327 on earlier firmware) and a 32-byte
Raw HID report carries 28 data bytes, so one complete macro read is 1,247
exchanges (369 before); the old path read the
profile four times and rewrote the whole bank. Apply now verifies and reuses
the snapshot already loaded as its recovery base, uses custom, VIA and settings
identities for the compare-and-swap checks, writes only changed 28-byte blocks
and reads those back exactly. Refresh and Export remain independent complete
reads.

"Changed" means changed from the bank the keyboard holds, not from one rebuilt
from the document: a valid bank may keep stale bytes after its 128th macro,
which a document cannot carry. A capture keeps the exact layout and macro
bytes it read, and an Apply result the target it proved; a cached snapshot
without them is read again. See
[Portable Profile V1](../upstream/firmware/docs/architecture/portable-profile-v1.md#portable-document).

Most of the remaining delay was split scheduling: every mutating split RPC
first returns `BUSY` to acknowledge mailbox admission, and the sender treated
that like a failure and waited 50 ms per 14-byte chunk. Expected admission now
gets one bounded 5 ms retry; a peer that stays busy still enters the
100–1000 ms backoff and transport failures keep the 50–1000 ms path. On
hardware this took a layer-name-only Apply from 13.05 s to 5.51 s.

### D-L23 — Apply shows its steps, and a failure says where, why and what was saved

Apply and readback expose their actual steps, and a failed Apply retains its
step, the keyboard's reason and whether anything was saved. Progress updates
must preserve the visible editor and remain bound to the operation that made
them. A complete coherent capture opens the draft; fresh integrity checks and
exact stored bytes remain required wherever the contract calls for a new read.

This makes a slow or failed operation explainable without allowing progress
traffic or cached authored bytes to change the draft's meaning. The detailed
contract is [Profile capture and operation progress](architecture/profile-capture-and-progress.md);
the user flow is in the [guide](GUIDE.md#applying-changes).

### D-L26 — Macro slots share one visible memory, and every slot says what fits

All 128 slots share the keyboard's macro memory, whose size the keyboard
reports (34,903 bytes on current firmware, 10,327 before the macro expansion;
a key tap takes 3 bytes, ASCII text 1 byte per character, Unicode text its
UTF-8 bytes). Firmware advertising streaming macro playback (feature bit 27,
firmware D-F14) plays a stored macro in 512-byte windows, so the only limit on
one macro is the free memory. Older firmware plays a macro only if it compiles
into at most 512 bytes (`MACRO_PAYLOAD_IR_MAX_BYTES`), about 170 key taps; for
it the app computes that size exactly (`macroProgramBytes`, checked against the
firmware decoder by `run_macro_program_size_tests.sh`), refuses an edit past
it, and marks a slot VIA wrote past it as too long.
Reviewing a retained draft against a reconnected keyboard adopts the current
firmware's capabilities and invalidates the draft's cached decoding and checks,
so an upgrade or downgrade changes these limits before editing resumes.

A portable profile stores macro streams, not a bank size. Restore pads them to
the destination's bank or refuses them, naming how many bytes are over; a
profile's fingerprint covers the streams, so the same macros match across bank
sizes.

The primary macro editor is an ordered list of editable Text, tap/chord, delay,
press and release steps. Empty macros start with Text; it preserves literal
braces, whitespace and Unicode without exposing command syntax. Raw commands
remain under Advanced and round-trip to the same steps. Incomplete step fields
remain local instead of being silently removed or coerced. Unparseable raw input
is retained whole and blocks step editing so rebuilding a partial parse cannot
lose its tail. Text fields contain long input without overlapping feedback or
controls. Recording appends commands to the same escaped payload.

Live inspection uses the production macro codec and the same playback, setup
and bank limits as staging (`model/macro-input.js`, called by `macro-editor.js`).
The panel loop answers `validateViaMacro` with `macroValidation`, correlated by
slot, exact payload, request id and draft id/revision, without staging, history,
toasts, device calls or a full model redraw. The interface also checks its
current inspection context (host setup, slot bytes and bank space) before using
a reply. Valid completed edits post the existing `updateViaMacro`; rejected
input and its feedback remain local. Field input updates feedback without
replacing the field, preserving native editing and composition.

Every empty slot keeps room for ten key taps (30 bytes); when free memory
cannot keep that for every empty slot, the highest-numbered empty slots show no
room and cannot be edited until space is freed. The firmware does not enforce the reserve, so the
app shows what a VIA edit left. Current settings version 6 gives every macro
name up to 32 UTF-8 bytes, following the shared counted-name contract; see the
[portable profile](../upstream/firmware/docs/architecture/portable-profile-v1.md).

Unicode-capable firmware (feature bit 21) accepts canonical UTF-8 text and
settings scalar 27’s Host settings, without changing the settings-v6 shape:
bits 0..1 select Auto/macOS/Windows/Linux; bit 8 independently enables Unicode.
Ark requires the capability for Unicode edits and nonzero Host settings, preserving
legacy ASCII editing. Non-ASCII scalars cost four compiled bytes each; text
and backups preserve exact scalar sequences. Settings → Host owns both
controls and shows detected/effective OS from the
keyboard’s GET 0x0B readback. Auto follows that USB guess, with manual override
and unknown fallback; it cannot confirm input setup. The macro screen links to
Host settings. Both choices participate in draft review and history.
Stored macro decoding and presentation preserve valid Unicode without a
destination capability context, so capture, backup comparison, Review and
history can read it. Write validation still enforces the destination capability.
Detected OS metadata is volatile: a complete Read keyboard refreshes the
current draft and its presentation caches without changing stored edits,
history, revision or conflict fingerprints. Saved OS overrides remain part
of the document and take precedence over that metadata.
Host-layout firmware (feature bit 22) adds the keyboard layout to scalar 27
(bits 16–23, with bit 24 for a macOS ISO keyboard); see D-L56.
See the [guide](GUIDE.md#text-macros). Physical host insertion remains
an acceptance requirement, separate from codec and UI verification.

### D-L29 — The review lists items, discarded in the groups their edits made

The review lists one item per thing that differs from the keyboard: a key on a
layer, a layer's name, a behaviour, a combo, a macro with its name, a settings
section, a pointing slot, or one lighting record (LED groups and the rows that
paint them are one record, since rows name groups by id). An item says whether
it was added, changed or removed and lists only the fields that differ, in the
editors' words. Fields compare what is stored, not what is shown, so a changed
default or a renamed layer is one item where it was made. Colour reads as in
the editors (D-L31). The draft's change count counts items. **Show** opens the
item where it is edited; a removed item has no Show.

Combo numbers are packed positions. When the only net combo difference is one
removed row, review and history show that removal as one item and explain that
later combos move up one number. Discard reinserts the row at its former
position. If another combo also changed, review keeps the positional differences
visible rather than attributing them all to the deletion.

An item is also the unit **Discard** puts back, as one more undoable step. The
items one staged edit changed belong together, so a key swap or a moved
behaviour is one block with one Discard, titled by the edit that made it; a
later edit touching two groups joins them. Every item is listed under its own
area in rail order; a group spanning areas shows its part in each, and each
part's Discard takes back the whole group. Rebases, discards and steps that
fell out of the bounded history link nothing. A discard from a current review
keeps it current; once nothing described is left, the draft is the keyboard's
profile again, including bytes no item describes. A recovery review is
discarded whole or not at all. See `core/model/profile-review.js`,
`core/model/profile-revert.js`, `ProfileDraftSession.changes()` and
`webview/view/review.mjs`.

**Layers are compared by identity, not by slot.** Beside every history entry
the draft keeps which keyboard layer each slot now holds, set by Rename & Reorder
from the order it saves and never inferred from names or contents, which two
empty layers or a swap that also swaps the names would fool. The review
compares the draft with the keyboard's profile rearranged into that order, with
every layer reference following. So a reorder is one **Layer priority** item,
one row per layer that moved; everything else is compared layer with layer.
With "Keys follow their layers" off, keys that kept their numbers now reach a
different layer and are listed as the changes they are. Discarding the order
moves the layers back and keeps every other change; undo and redo carry the
order with their entry; a rebase keeps it; an import, a discard of the whole
draft and an Apply start again from the keyboard's order. Group links are kept
by layer, not by slot, so a later reorder does not tie two layers' keys
together. See `core/model/layer-order.js`.

### D-L30 — The draft shows itself where it is edited

Every editor marks what the draft changed with the draft's amber dot: a key, a
layer chip, a tab, a behaviour or combo row, a slot, a colour row, a settings
section, and the header of a folded group holding a change. The marks come from
the same review items (`draftMarks` in `webview/view/review.mjs`), so the two
never disagree.

**Discard all** is one more draft step: undo brings every change back, and the
keyboard is not read again, except for a draft out of step with it, bound to
another keyboard, or a recovery. Undo and Redo name the step they take back or
bring back. **Draft history** opens every step newest first, each with when it
was made and what it changed from the step before (not from the keyboard, as
the review compares); going to a step is several undos or redos at once. The
host sends the steps only while the sheet is open. The commit bar has one way
on, **Review and apply**, and says what the draft holds ("4 added · 10 changed
· 1 removed").

### D-L31 — One mark per thing that has a colour

Each thing with a colour of its own has exactly one mark, drawn by
`webview/ui/marks.mjs` wherever the thing is named:

| Thing | Mark |
| --- | --- |
| A behaviour tier (tap, hold, long hold) | the dot the keyboard flashes when it resolves |
| A tap count (2× and up) | its branch badge, in its tap-branch colour |
| A layer | its layer colour |
| A pointing mode | the light its slot paints |
| A combo | its badge, in the combo feedback colour |
| A lighting stage | its on/off dot |

A thing is marked where it is the subject and where it is only referred to: a
setting names what it governs (`governs` in `core/model/settings-editor.js`),
so its mark appears in Settings, in the editors' fields and in the review
alike. A stage that is off draws its marks off. A colour is the keyboard's own,
so a dark one reads dark.

### D-L32 — Things sit in fixed places

Repeated elements reserve fixed positions, and the interface distinguishes
stored placements from routes in a composed layer view. Shared reach sections
keep their identity across the workbench tabs.

Stable positions let people compare rows and switch editors without losing
their place. Keeping storage and activation distinct prevents a preview from
misreporting what an edit changes. Rendering and reach rules live in
[Interface rendering and rule ownership](architecture/interface-contracts.md#fixed-positions-and-composed-reach);
the [guide](GUIDE.md#the-interface) describes the workbench.

### D-L33 — One home for each rule the app needs twice

Every shared rule has one owning module, and the host publishes its meaning to
the interface. Screens do not rebuild vocabulary, device policy or draft state.

Duplicated knowledge drifted: stored values had different words in review and
screens, the pointing keycode registry was written six times, a dirty draft was
decoded 10–16 times per publish, and the host sequenced Apply itself. The ownership
contract is [Interface rendering and rule ownership](architecture/interface-contracts.md#shared-rule-ownership);
[AGENTS.md](../AGENTS.md) governs dependencies and where new work belongs.

### D-L36 — The review checks reachable actions and save blockers

A layer can lock with nothing left to release it: `TG(n)` on Base when layer n
covers that key and has no `TG(n)`, `TO(0)` or `LOCK_LAYER(n)` of its own, a
chain of locks where the second hides the first one's way out, `TT()`'s fifth
tap, a behaviour branch or combo that locks. The firmware has no timeout and no
"clear all" key, so only unplugging recovers it. The keyboard cannot refuse
such a profile, and should not: the rules are the person's to break. The app
says so before Apply instead.

`core/model/layer-reach.js` walks every state a profile can reach from a
keyboard at rest, a set of locked layers with any layers held on top, resolving
every key as the firmware does and following each key's own layer action, its
behaviour branches, the combos that match the highest layer on, and the
trackball waking the pointer layer (unless the sniping layer keeps it off). A
**trap** is a set of locks it can reach from which Base cannot be reached once
every key is let go. It also reports, as warnings and notices, a layer with
keys that nothing reaches, a layer key onto a layer with no keys of its own,
transparent and `KC_NO` keys on Base in separate notices, a pointer layer that
cannot work, and layer keys the keyboard leaves to QMK (`DF()`, `PDF()`, a layer
past the bank). A combo whose reference differs from the highest active layer
uses the reference's raw keys; otherwise its inputs come from the resolved
active stack, including keys inherited through transparency. A combo is warned
about when no reachable stack can supply all its inputs. Holding is not limited
by fingers and a one-shot counts as a hold. The first four trapped lock states
have paths; any remainder is counted explicitly.

`core/model/profile-checks.js` adds whole-profile findings for bindings that
reach empty pointing slots (keys, behaviours and combo outputs), macros too long
for the keyboard's playback engine, and destination brightness or lighting
effects the keyboard would refuse. The latter are **blockers**: review shows
them, disables Apply, and the host refuses Apply before writing a recovery copy.
Other invalid data is still refused by its editor, profile decoder or save
preflight rather than offered for confirmation.

The draft reports its findings beside the keyboard's, both in the draft's
layer order, so each is **new**, **on the keyboard** or **fixed** by the draft.
Per-key findings include the key and code in their identity; grouped empty-key
notices include their positions, so replacing one issue with another on the
same layer does not call the new one existing.
The review lists them first, under Checks, each with the steps into it, the way
out and Show. Active warnings have orange backdrops; traps and blockers are red;
fixed findings stay quiet. Every warning or trap the draft keeps asks for
confirmation, whether the draft made it or the keyboard already had it: Apply
turns into "Apply anyway / Go back", and the host refuses to start an Apply of
such a draft unless the message confirms it. Notices and fixed findings do not
ask. Confirmation is tied to the reviewed draft revision, so a changed draft
must be reviewed and confirmed again. A new warning or trap points to a draft
edit group only when its source is unambiguous: one group in the draft, or an
unowned layer key changed at that exact position. The source group is marked
in the review, and the check links to it. A check already on the keyboard has
no draft source; checks with several plausible edits do not guess.

Two firmware facts were settled on the way. QMK's auto-mouse kept a lock of its
own on `TG()`/`TO()` of the pointer layer that `TO(0)` never released; the
runtime now takes those flips back and holds auto-mouse on for as long as the
pointer layer is locked (`docs/POINTER_MODES.md`). And a layout key the keyboard
does not own is refused where it is placed, since the keyboard's save check
covers behaviours and combos only; one already on the keyboard is reported, not
refused, so it never blocks an unrelated Apply.

### D-L37 — Any layer can be the base

The base is a slot, not a layer: the bottom one, always on, what every
transparent key falls through to, and what `TO(0)` returns to (layer 0 is the
base in the firmware's lookup, in the RGB base effect and in layer ownership,
so `DF()`/`PDF()` stay refused, D-L34). Rename & Reorder puts another layer
there with **Make base**, which swaps it with the current base, as one
reorder; the base row itself is never dragged, so a drag never changes the base
by accident.

With keys following their layers, the new base and the old one trade roles
rather than follow: a layer key that reached the base still reaches the bottom
slot, so `TO(0)` still goes home, and one that reached the new base now reaches
the old base, wherever it went. The key that held Numbers from Base holds Base
from Numbers, and `TO(Game)` becomes the key that switches back. Following them
instead, as the first version did, turned `MO(n)`, `LT(n, …)`, `TT(n)` and
`TG(n)` into `MO(0)` and the like, which do nothing because the base is always
on. The swap holds whether or not keys follow their layers: with the toggle off,
a key that kept its number would reach whatever took the old base's slot once
it moved on, so the toggle only decides for references to the other layers.
Every other key, behaviour and combo reference follows its layer, as do
names, colours, LED group rows, and the pointer, sniping and combo-reference
settings, which name a layer by what it holds. The startup layers are slots and
stay on the bottom one. On a base swap, transparent physical keys entering the
base become `KC_NO`, and `KC_NO` physical keys leaving the base become
transparent; unused matrix positions keep their stored values. A person
can still deliberately place a transparent key on the base afterwards. If the
old base had no layer colour, it receives the saved base HSV as its own
all-keys layer colour, including when the selected base effect is animated;
an existing layer colour stays as it was. The swap cannot make the new base's
empty keys do something or reach the old base when the
only keys that did sit on the old base itself; the review's checks (D-L36) name
both, count base `KC_NO` and transparent keys separately, and count every layer key that holds or toggles the base, rather than
the reorder inventing a way back. The checks compare the
draft with the keyboard as it is, matched layer with layer through the draft's
order, so what a reorder makes or mends is reported as new or fixed. The
review's Layer priority item names the new base first. See
`reorderLayers` in `core/model/portable-profile.js`.

### D-L44 — The app has its own repository and pinned firmware inputs

Charybdis Ark owns its code, contributor instructions, tests, preview and
catalog generation in an independent repository. The VS Code host remains
unchanged. Firmware test vectors, device contracts and the QMK catalog inputs
live under `upstream/`, with revision and checksum provenance. Ordinary app
commands read only this checkout; an explicit catalog import may read an
external QMK checkout. Imported specifications describe the pinned firmware,
not a second firmware implementation. Updating a device contract requires
reviewed inputs and coordinated firmware compatibility tests. The source
firmware repository and its consumers are maintained separately. See
[repository ownership](REPOSITORY.md) and [upstream inputs](../upstream/README.md).

### D-L45 — Compatibility tests select both implementations explicitly

The developer-only compatibility bridge runs the five Ark-owned
cross-language runners against explicit firmware, Ark and QMK Git roots.
It records revisions, dirty state and results without changing runtime or
requiring firmware for ordinary app checks. Protocol changes run the bridge
before merging; UI-only changes use the independent suite. Development pins
any committed firmware revision; a pushed pin names a commit on firmware's
remote `dev`, its trunk, which `--publish` enforces. Firmware `main` moves
only by promotion merges of `dev`, so a published pin stays reachable from both. See
[compatibility workflow](COMPATIBILITY.md).

### D-L47 — The app is named Ark

Charybdis Live is now Charybdis Ark: "Ark" in running text, `charybdis-ark` for
the repository and package, `charybdisArk.*` for commands and
`CHARYBDIS_ARK_ROOT` for the bridge. Ark stands for **Adjust, Review, Keep**:
adjust a draft, review its changes, then keep them on the keyboard with Apply.
"Live" named a feature, live editing, and
read ambiguously as the product; the feature keeps its words (live editing, the
live profile, Live Link). Historical paths such as `tools/charybdis-live/` and
the D-L35 title keep the name they had. VS Code keys an extension's storage by
its identity, so on start Ark copies recovery files saved under
`noah.charybdis-live` and `noah.charybdis-live-v2` into its own storage, never
moving or overwriting one. Portable profiles keep the `.charybdis.json`
extension: it names the keyboard, not the app.

### D-L48 — Gesture timing advice follows firmware capability

Profile Wire feature bit 17 identifies physical gesture timing. Without it,
review and the behaviour editor warn when a reachable authored hold/repeat key
is buffered by an enabled combo, or an authored layer-tap also waits for native
QMK tapping. Advice names effective inherited timings and competing combo
windows, using the connected profile and native combo reference-layer rules.
It does not infer a safe timing from subtracting those windows.

Warnings participate in the existing new/existing/fixed review and remain
confirmable; they neither reject a legal profile nor rewrite its timings.
Unknown offline timing semantics do not produce a firmware-defect claim. On a
keyboard advertising bit 17, this legacy warning disappears. General guidance
still explains double hold as press–release–press-and-hold, the released repeat
gap, and tap/hold classification. Firmware buffering can postpone output even
when it preserves physical gesture eligibility.

The firmware owns timing semantics (D-F01 in its direction); Ark consumes the
capability, not source code. Hardware acceptance of a particular firmware build
is separate from recognition of its advertised policy.

### D-L49 — Timing findings constrain the reachability graph conservatively

Timing findings remove only proven-impossible branches from the layer graph.
Unknown paths remain possible. Warnings describe legal but risky relationships;
comfort notices never become validity rules or silently rewrite values.
Built-in branches and inherited defaults are resolved once from the profile and
advertised firmware semantics for the editor and review alike.

A conservative graph avoids invented traps while still identifying locks with
no escape. Bounded checks must report uncertainty rather than claim a proof
they could not finish. The detailed contract and its analysis limits are in
[Timing, built-in branches and reachability](architecture/timing-and-reachability.md);
the [guide](GUIDE.md#timing-checks) explains what the findings mean.

### D-L50 — Ark agrees with firmware by contract; `main` is a released stack

Ark talks to a keyboard, not to a firmware commit: it follows the capability
pages the keyboard answers, and one Ark serves a range of firmware. Ark and
firmware are in sync when the contract agrees, not when commits match. The
agreement check (`npm run agreement`) decodes the pages firmware states with
Ark's own runtime decoder and gating, and requires Ark's BK keycode and layout
inputs and pinned fixtures to equal firmware's (file equality, not commit
equality); keymap values are reported, never gating.

Development tests against Ark's own pins. Ark and firmware release separately,
and together when the contract between them changes (firmware D-F06). A release
must agree with the firmware it will sit next to, retaining compatible older
pins when appropriate; equal commit dates or newest pins are not the criterion.
This permits independent app releases without weakening the published contract.
See [agreement](COMPATIBILITY.md#agreement-with-a-firmware-contract) for the check
and [CI facts](REPOSITORY.md#ci-and-publishing) for when it runs.

### D-L51 — CI runs for releases; agreement judges the other release

Local verification owns development checks. CI runs on promotions to `main`
and nightly, rather than on task pull requests into `dev`. Promotion agreement
judges the firmware Ark will be released next to: firmware `main`, or the
prepared partner for a joint release. The publication command rechecks that
contract before publication. Nightly checks report development drift and
published incompatibility without blocking development.

This keeps the development loop local while protecting the two published
products against contract drift. Web-page publication is the `dev`-push
exception (D-L52); its checks gate that upload alone. Job names, partner selection
and branch protections live in [CI and publishing](REPOSITORY.md#ci-and-publishing).
The development and publication process is governed by [AGENTS.md](../AGENTS.md),
which points to the work-queue tools.

### D-L52 — Ark is also a web page

Ark runs in Chrome (and Edge) as a web page, beside the VS Code extension, so
using it needs no VS Code, no checkout and no install. Both hosts run the same
`core/` and panel through the shared host loop (`core/session/panel-loop.js`);
the page's host (`web/`) does over WebHID, in the page, what `extension.js`
does in VS Code. What differs between them reaches the panel in the model
(`model.host`): Choose keyboard, the host's words for connecting, the theme
toggle and the recovery copies. The panel never asks which host it is in.

The page is static files with no server code: `npm run build:web` writes the
complete site, hashed names and all, and after it loads the page makes no
network request (its policy says `connect-src 'none'`). The keyboard is reached
only through WebHID, after the person picks it in Chrome's picker. One tab holds
the keyboard (a Web Lock), as one panel does in a VS Code window; leaving with
unapplied edits or during Apply asks first (a VS Code panel cannot ask, so one
closed during Apply finishes the save before it releases the keyboard); Apply's waits run on a worker's clock, so a background tab does not slow
it. Recovery copies are kept in the browser's storage (IndexedDB), listed on
Profile & backups with a download each; clearing the site's data deletes them.

A phone gets none of this: the page shows a notice that Ark runs on a computer,
with links to Ark's and the firmware's repositories and to BastardKB, the
keyboard's official seller, and starts neither the host nor the panel
(`web/phone.mjs`). No phone browser has WebHID, and the
interface is built for a computer's screen. A phone is touch only with a screen
whose shorter side is under 600 pixels, decided once as the page loads: a tablet
gets Ark, where it offers the demo, and turning a phone or resizing a desktop
window never swaps Ark out from under a draft.

The page is published to Cloudflare Pages from GitHub Actions, as the folder
the build writes and nothing else (`.github/workflows/publish-web.yml`): `dev`
to the preview address `ark-dev.ncleroy.dev` for testing, `main`, the
project's production branch, to `ark.ncleroy.dev`. Each run builds the page,
tests those built files in Chrome and checks they are static files only, with
no Pages Functions or `_worker.js`, before Wrangler uploads them. This is
D-L51's one exception: it runs on `dev` pushes, and its tests gate only the
publish, never a merge or a release. The build's `_headers` sends the page's
policy with `frame-ancestors 'none'`, which only a header can set,
`Permissions-Policy: hid=(self)`, `nosniff` and `no-referrer`; the page is
revalidated on every load and each hashed file cached for good, so a release
shows on the next load and never mixes with an old one's files. The demo without
a keyboard is D-L53.

### D-L53 — The demo is a draft with no keyboard behind it

Ark can be explored with no keyboard. The demo is not a simulated keyboard
answering the wire protocol: it is the same `ProfileDraftSession` a keyboard's
read opens, over a profile document, run by the shared host loop, so every
screen, edit, check and review behaves as on a keyboard and both hosts offer it
(`core/session/demo-session.js`). Its document is the bundled demo profile, an
export of a real keyboard shipped as data (`core/data/demo-profile.charybdis.json`,
never hand-edited and never read from a firmware checkout), or a profile file
opened in its place and checked as Import checks one. It runs under the
capabilities current firmware reports (the 32-slot action vocabulary
`0x837cf479`, its 16-layer/128-slot limits and keyboard options), held equal to what the fake
current keyboard reports by test.

Inside the session the demo is the draft's device: while `session.demo` is set,
the state the panel answers to is the demo's (`panelState`), in which the draft's
source is present, so the editing gates hold unchanged. What the panel is told
is not a keyboard: `model.device` says Demo with no connection, generation or
halves, `model.demo` says the demo is open, and the panel shows a persistent
strip saying so. What needs a keyboard is refused in core, not only hidden:
Apply and reviewing against the keyboard. Export saves the draft itself, since
there is no keyboard profile to export. Reading or choosing a keyboard leaves
the demo; with edits not exported since, the message must say the panel asked
(`discardDemo`), or it is refused. The demo is offered only with no keyboard
connected and no unapplied keyboard draft, and on a page that cannot reach a
keyboard only where the host says so (`model.host.blocked.demo`).

### D-L54 — Current live formats, with a preceding-backup bridge

Ark's live codecs follow firmware D-F14: schema 3.0, RGB 4, key behaviours 2,
combos 3, settings 6 and sparse PD 3; 16 layers, 128 VIA macros and 128 custom
keys; action vocabulary `0x837cf479`. Three capability pages report the wider
counts, 64 KiB storage slots and 65,504-byte payload capacity. Candidate uploads
use store format 4 and a nonzero VIA binding. Earlier live firmware remains
read-only; Ark does not edit its domains or upload old bytes.

The connected firmware's advertised tap depth governs both behaviour steps
and the RGB tap-branch palette throughout read, edit, history, reorder and
partial Discard. Offline snapshots carry that depth in the counted RGB palette;
import and Apply validate it against the destination's advertised limits.

Import has one explicit bridge for the immediately preceding schema 2.0 backup
with action ABI `0xf79c6151` (eight layers, 64 macros/custom keys, 32 pointing
slots; RGB 3, behaviours 1, combos 2, settings 5 and PD 2). Translation preserves
all fields, remaps native custom-key references by slot, adds transparent layers
and empty name/macro slots, and enables every new participation policy. It
first validates source records, action references, counts, names and macro
capacity against that preceding format's limits, then validates the translated
document under the current complete-profile contract
before Import review. The connected keyboard and draft remain unchanged until
Use as draft and then the existing recovery-first Apply flow. Demo file opening
and restore use the same translator. Unknown versions and malformed input fail;
there is no general historical upgrade chain or data-dropping fallback.

Upgrading firmware changes storage geometry and starts from flashed defaults.
Export with the preceding Ark first, flash the matched pair to both halves,
then import and review that backup with this Ark. The guide carries these steps.

### D-L55 — Participation controls edit policy, preserving definitions

Ark exposes the firmware's participation contract at every scope: master and
source-layer switches in Settings, enabled/allowed-layer controls on shared
behaviour and combo definitions, and Use behaviour / Join combos on physical
placements. The key inspector explains blocked scopes and navigates from a
transparent inherited key to the placement that supplies its keycode. Controls
stage ordinary profile edits; Review and partial Discard preserve other fields,
Undo/Redo restore policy, and layer reordering moves masks and placement bits
with their layers. Disabling retains definitions and timing. A bypassed native
key falls through normally; a bypassed custom key produces no output.

The source-layer and gesture capture rules remain firmware-owned in
[participation-policy.md](../upstream/firmware/docs/architecture/participation-policy.md).

### D-L56 — Macro text is judged against the host's keyboard layout

The keyboard types macro text through a host layout (firmware D-F16): for each
computer layout, which keys type each character, generated from macOS's and
Linux's own layout data and QMK's Windows data. Ark vendors the firmware's
fixture through `upstream/` and generates `core/data/host-layouts.json` from it
(`scripts/generate-host-layouts.js`, rerun by `npm run upstream`); it reads
the fixture's character table and never re-derives it, so what the editor
accepts and what the keyboard types cannot disagree.

Settings → Host offers the layouts of the effective OS, plus US, behind feature
bit 22; older firmware shows the layout read-only at US. The keyboard types
through the layout whatever the OS, so a Host edit that changes the effective
OS carries the layout along (`followHostOs` in `core/schema/host-settings.js`):
kept if it is US or that OS's, else that OS's layout of the same language, else
US. Detection is not an edit, so Auto never rewrites the layout; Host and the
macro editor warn while the layout belongs to another OS than the effective one. On macOS, Unicode
entry needs the Unicode Hex Input source, so it is a layout choice there, not a
switch; the switch stays for Windows and Linux. The macro editor refuses a
character the layout cannot type unless Unicode entry is available, naming it,
and refuses an ordinary key held across text that needs Unicode entry, as the
keyboard's preflight does. On Unicode-capable firmware, Settings → Host links
to WinCompose's GitHub project with the shared GitHub mark when the effective
OS is Windows and Unicode playback is enabled (Auto follows detection).
When macOS Unicode entry is selected, the Host section warns that an active
Unicode Hex Input source may interfere with Option symbols and shortcuts,
including word navigation. This applies to ordinary keys and key-step shortcuts
as well as macro text. Ark neither switches the host input source nor claims
that its layout choice can preserve the usual source's Option behaviour.
Keys are labelled as the layout prints them
(`core/model/key-names.js`): the layout screen, the picker's board and search,
and Review, from the same data; stored keycodes never change, and US keeps the
catalogue's labels. The picker includes Shift and Option/AltGr legends and
marks dead keys with ◌. Shifted symbols and shortcut base keys follow the
layout; macOS ISO swaps the same key positions in labels as in playback.

Stored macro status, live inspection and whole-profile warnings share
`model/macro-input.js`'s playback analysis, including ordinary holds across text
requiring Unicode entry. Review compares native strokes from the pinned fixture,
Unicode entry and unavailable characters under the old and new Host setup for
each text macro. It lists only changed routes or playback validity,
including ASCII whose native keys change and macOS ISO swaps. These derived
Macros rows use the Host settings unit: discard restores Host, preserving
independently edited macro steps and names. Authored text and explicit key steps
are never rewritten to simulate a layout change. An accepted but unplayable
macro remains a warning, not a save blocker.

### D-L57 — Macro input protection is automatic with a per-slot override

Feature bit 23 advertises per-macro playback protection (firmware D-F17).
The Macros editor offers Automatic, On and Off. Automatic turns on for text
the selected layout cannot type natively and must enter as Unicode, not merely
because UTF-8 contains non-ASCII text. Its effective state follows Host changes,
and Review groups that derived effect with Host; explicit overrides are macro
changes and discard with their slot. Ignored presses are never replayed, and
the explanation distinguishes keyboard-output isolation from a host input lock.
Feature bit 26 extends bit 23 with immediate isolation of already-held ordinary
keys and unrelated keyboard output. On supporting firmware the explanation says
that held modifiers resume and suspended ordinary keys require release and a
fresh press. Older bit-23 firmware retains the earlier warning to release keys
before starting; neither explanation promises protection from another keyboard,
pointing or consumer/media actions.

The optional canonical prefix belongs to the macro bytes. Text/name edits
preserve it, metadata-only empty slots keep their reserve, and bank accounting
includes its three bytes while playback accounting excludes it. Portable decode
preserves overrides without a destination; staging and Apply require the
capability. The app does not pretend older firmware enforces protection.

### D-L58 — Transfer less, validate the complete saved result

On firmware advertising D-F18's candidate-reuse and streaming capabilities,
Apply plans changes against the exact raw active profile retained by the coherent
capture, rather than the portable document's materialized live settings. Domains
are aligned by identity so resizing one preserves reuse of unchanged later
ones. Firmware copies unchanged ranges into its inactive candidate; the host
sends short or changed ranges. A missing or mismatched source uses a full upload.
Older firmware uses the original chunk path. Compiled defaults are an
origin-independent reuse source: translate the status page's unused origin to
REUSE's sentinel `255`, keeping generation zero. Committed sources keep their
reported generation and physical origin. The captured status and stale-base
identity remain unchanged.

Streaming admits at most four host chunks before a completion check, still
through the serialized connection. A check proves the admitted prefix's exact
transaction, target digest, length, next offset and operation-sequence advance.
BUSY drains that prefix before retrying the definitely unadmitted suffix. Lost
replies remain ambiguous and are not retried blindly. Full firmware validation,
recovery copies, stale-base checks, both-half durable publication, verification
and fresh post-Apply editor readback remain required. No app-authored bytes seed
the payload reader's verified-read cache; a proven Apply result can retain its
raw target only as the next differential upload's source.

Upload progress separates prepared, uploaded and reused bytes. The legacy
`bytesSent` field remains an alias for prepared bytes; chunk index and count
describe actual host data chunks, excluding reuse commands.

The compatibility bridge exercises Ark's uploader against firmware's production
candidate transaction, dual-slot backend and whole-profile validator, including source
corruption, in normal and sanitizer builds. Its scheduling is simulated; reduced
bytes or exchanges do not establish keyboard timings or physical acceptance.
That probe ends at validation. Firmware's separate host suites cover committed
reuse through the production owner, both-half saving and reboot, with hardware
eligibility and the peer VIA bank supplied by their test adapters.

### D-L59 — Strict types at the existing seams, source execution retained

Ark uses strict TypeScript checking over its JavaScript sources. The extension
and fixture interface continue to execute source directly; type checking emits
no files and is part of the ordinary app check gate. Every application runtime
module is checked automatically, including new modules. Core, extension,
browser host, renderer and dedicated-worker checks use their own environments.
Developer scripts, shared fixtures and integration corpus generators also
enter strict checking automatically. The preview builder includes the browser
API declarations its imports need, and the independent branch-window tool
checks against its own minimum VS Code version. Individual test cases retain
their runtime checks.

Types describing a module's internal interface live in its owning layer.
Posted panel data has one shared contract under `contracts/`, containing only
inert declarations with dependencies confined to itself. Hosts, core and the
interface may take those types; the interface still imports no core module or
core type. This extends D-L10's layer rules to type-only dependencies without
introducing a runtime connection between renderer and core. The renderer
store and reply handler consume the same published-model and message contracts
as both hosts; pure control builders sit beside the edit builders. Progress
replies keep the existing read/draft identity checks before changing the model.

Types describe application contracts, not proof that device bytes or imported
files are valid. Defensive decoding, canonical checks, stable errors, firmware
compatibility tests and physical acceptance keep their existing responsibilities.
The migration mechanics and the check command live in REPOSITORY.md.

### D-L60 — One draft binding decides editing

Whether the open draft may be changed against the keyboard now is one rule,
`draftBinding` in `core/session/panel-session-state.js`, answered as
`{editable, reason}`: the draft is this keyboard's
(`ProfileDraftSession.bindingTo`: the selected keyboard, connected, over the
connection it was read through), on firmware that holds a complete profile,
current with the keyboard, and nothing is running. The demo's draft is bound
to the demo device, so the rule holds there unchanged (D-L53). The reasons
come in a fixed order, so `busy` means only an operation in progress stands in
the way.

Core refuses by it and the interface offers by it. The router stages an edit,
opens or keeps an import or layer review and routes Apply only for a bound draft; live macro
validation answers to it; Apply's draft checks its keyboard binding again as it
writes. The model publishes it as `draft.editable` and `draft.reason`
(`contracts/panel.d.ts`), and the interface's `writable()`, under `canEdit`,
reads that value instead of recomputing it. A new connection is therefore
refused before any model has marked the draft stale.

Panel controls are registered once in
`core/session/panel-control-registry.js` (`CONTROLS`): their route, draft
identity and binding rule, demo policy, execution phase and named action.
The router, operation wrappers and demo refusals consume those policies;
controller modules implement the actions. History and local macro inspection
remain available before the ordinary busy guard, which refuses work with a
notice rather than dropping it. Read-only recovery paths
remain available without a draft. Closing a browser tab warns for unapplied
edits, an active Apply or an active device restore, rather than every portable
operation. The keyed payload groups in `contracts/messages.d.ts` are inert
posted-data declarations; a registry test holds their control names and routes
to the runtime table. Route sets retained for hosts are derived from it.

Device operation phases have stable IDs (`PHASE` in
`core/model/vocabulary.js`), typed as `PhaseId` in the posted contracts.
Their status labels, read and busy words and write fact live beside those IDs
and reach the interface as `model.vocabulary.phases`. The interface displays
those words; progress correlation continues comparing IDs. The browser's
active-restore warning uses the write fact. Changing presentation words cannot
change routing, progress acceptance or which operation writes to the keyboard.
Apply steps and candidate-transfer progress keep their separate identities.

The same module holds the panel session's compound transitions: opening or
replacing the draft, closing the import review and layer editor together (and
resetting the forms when the keyboard or draft under them changes), a read
beginning and ending, the panel's own operations running, an Apply and its
readback, and the outbox the next model carries once. The other session
modules call these rather than setting those fields together themselves.

### D-L61 — Draft presentation consumes snapshots, device health consumes reads

The editable configuration model is built directly from a complete snapshot
and its matching decoded form (`buildSnapshotModel` in
`core/session/device-model.js`). A publish uses `decodedOf(snapshot)`, so a
frozen draft history entry is not decoded again. Layer positions, names,
behaviours, pointing slots, combos, macros, host layout, settings and lighting
all come from that snapshot; its capture facts supply host detection and
brightness/options limits. Draft presentation takes editability from D-L60's
binding, rather than inferring it from simulated read success.

Building the panel model is a projection: it does not open, close, observe or
mark a draft stale. The panel loop explicitly observes service changes before
publishing their model. Rebase uses that same observation step, so a completed
capture is observed once. A standalone export captures the current keyboard
without replacing the editor snapshot or its views; this keeps an export from
moving the draft's comparison behind the user's edits.

The same module adapts independent device reads for an earlier firmware or
partial capture (`buildDeviceModel`). Both inputs share configuration
presentation, but a draft never fabricates a `LayoutRead`, `CommittedRead` or
base RGB read to pass through the device adapter. The keyboard header and
diagnostics use the actual device state throughout; local changes only add
the existing draft subtitle. The demo supplies its own explicit header and
diagnostics (D-L53). Earlier firmware keeps its independent read-only view
and domain failures even when a dirty draft is retained.

## Historical decisions

These describe the retired v1 app; their lasting rules are stated in the
decisions above, the [guide](GUIDE.md) and [`AGENTS.md`](../AGENTS.md). D-L01
(branch from `refactor/live_edit`, revert only Studio's shell) and D-L03 (move
`live-link/` into Ark, since layered into `core/` by D-L10) were branch setup
and are complete. D-L16 wired Studio's macro UI into v1 and went with it
(D-L35). The first live app (v1, which lived at the same path) ported Studio's
interface (D-L06). It was frozen by D-L35 and then removed; the profiles it
wrote remain a compatibility check in the firmware's
`tests/fixtures/stored_profile_live_v1.fixture`.

### D-L06 — v1 ported Studio's whole UI and rebuilt only the model source

*Superseded by D-L35.* Studio's webview does no file access: the host posts a
`model`, the webview renders it, and edits come back as typed messages. The
reusable seam was therefore the model, not the widgets, so v1 took Studio's UI
verbatim and supplied the model from the keyboard. The original plan, forking
the presentation and rebuilding the state, misread where that seam sits;
lifting "the presentation" out of 534 functions in one template literal was
impossible. v2 then replaced the ported UI with its own.

### D-L35 — Charybdis Live v2 is the app

*Numbered D-L21 when written, alongside the atomic-Apply decision.* v2 was
built beside v1 as `tools/charybdis-live-v2/`, and took over the plain name
`tools/charybdis-live/` once v1 was removed. It keeps v1's core, its layering and the one rule
(nothing reads the firmware repository), and replaces v1's ported Studio
interface with its own: browser ES modules with pure, tested `view/` modules,
every posted edit built by `webview/view/edits.mjs` and staged against a real
draft in `tests/view/edits.test.mjs`, and a board that shows what the firmware does.
Edits exist only as a reviewed draft; a keyboard the app cannot open a draft for
is read-only, and the host refuses edits rather than writing them directly. v1
was frozen by this decision and has since been removed.
