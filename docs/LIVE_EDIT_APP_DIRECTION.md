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

Each decision has one home. Both direction documents keep every D-L heading, so
a citation resolves in either repository, but only the owner holds the text and
the other keeps a one-line pointer. Change a decision where its text lives. New
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
| Layout and 16 layers | Read/write; key labels and picker legends follow the chosen host layout (D-L56); names and overlay order travel with complete profiles; a reorder renumbers layer keys by default ("Keys follow their layers") |
| Key behaviours, combos and RGB | Read/write editors over the shared draft; selected keys open an unstored behaviour grid until the first edit; matching Keys reach sections share open state across tabs, open independently, and use the page scrollbar |
| Macros | 128 named VIA macro slots with literal Text, editable steps, Advanced raw payload, recorder and live validation; capability-gated Unicode text, saved macOS/Windows/Linux host setup and a host keyboard layout macro text is typed and checked through; changing Host rechecks stored playback and reviews affected macros with that setting (D-L56); per-macro input protection defaults on for Unicode entry, with On/Off overrides (D-L57); shared-memory and per-macro limits shown and enforced (D-L25, D-L26) |
| Custom keys | 128 named keys that do what their behaviour says: rename, add or open the behaviour, place, see where each is used (D-L42) |
| Mouse | Pointer and sniping DPI, auto-sniping and auto-mouse: global-policy sections the core files under the Mouse area, so the rail, the review and import counts all place them there. The auto-mouse fade delay is a share of the timeout, edited on its lighting stage (D-L17) |
| Pointing modes | 32 device-owned slots (sparse PD domain v3, RGB v4); live codecs accept only the current action vocabulary and profile formats (D-L54). See [PD-mode domain v1](../upstream/firmware/docs/architecture/pd-mode-domain-v1.md) |
| Global policy | Every other portable setting, including startup layers, combo matching and device-reported lighting and key options; Windows Unicode setup links to WinCompose and macOS Unicode setup warns about Option shortcuts (D-L56); unsupported firmware features stay read-only |
| Backup and restore | Complete current-format snapshots, choose or drop a file for import review against the keyboard, recovery file and verified restore; the preceding eight-layer backup is translated before review (D-L54) |
| Drafts and Apply | One draft with item-by-item review, discard by edit group, Show, undo/redo and draft history; the review checks reachable actions, confirms active warnings and traps, and blocks profiles the destination cannot save (D-L36); Apply shows its steps and says where a failure happened; one coherent capture supplies the editor and draft, and copy/read status updates retain the active editor (D-L19, D-L23, D-L29, D-L30) |
| Recovery | Atomic logical Apply, capability-gated differential custom uploads (D-L58), differential VIA transfer, reboot recovery fencing, firmware roll-forward after the decision, resume after a lost or power-cycled peer link, bounded cancel owned by the keyboard (D-L20–D-L22, D-L27, D-L39) |
| Where it runs | The VS Code extension, and a web page that runs all of Ark in Chrome or Edge over WebHID (D-L52): Choose keyboard, one tab at a time, recovery copies in the browser's storage, a light/dark toggle. A phone gets only a notice that Ark runs on a computer, with links to the repositories; a tablet gets Ark. `npm run build:web` writes the page as static files; a workflow publishes it to Cloudflare Pages: `dev` at `ark-dev.ncleroy.dev`, `main` at `ark.ncleroy.dev` from the first release |
| Demo without a keyboard | Explore a demo, in both hosts and on a browser without WebHID: the bundled demo profile (`core/data/`) in a real draft under current firmware's capabilities, every screen editable and reviewed; Apply refused, Export saves the draft, Open a profile file replaces it, leaving with edits not exported asks first (D-L53) |

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
- the web page's first release to `ark.ncleroy.dev` (D-L52);
- the open issues below.

## Open Issues

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
- The first live app (v1, which lived at the same path) ported Studio's interface
  (D-L06). It was frozen by D-L35 and then removed; the profiles it wrote remain
  a firmware compatibility check in
  `tests/fixtures/stored_profile_live_v1.fixture`.

## Remaining Load-Bearing Contracts

The firmware direction records three contracts the app must preserve: the
canonical profile format (D-L15), one logical generation across the VIA and
custom stores (D-L21), and adopting or surfacing writes by external VIA clients,
which is not yet built.

## Decisions

Numbers are stable and cited from code and docs. D-L01 (branch from
`refactor/live_edit`, revert only Studio's shell) and D-L03 (move `live-link/`
into Ark, since layered into `core/` by D-L10) were branch setup and
are complete. D-L16 wired Studio's macro UI into v1 and went with it (D-L35).
Firmware decisions keep their heading here and their text in the firmware direction.

### D-L02 — Ark is a VS Code extension for now

It ships as its own extension.
Its `core/` has no `vscode` imports, so repackaging as a standalone desktop app
is a shell and adapter swap rather than a rewrite. The independent repository
needs no firmware workspace (D-L44); requiring VS Code remains a distribution
limitation. The trigger to repackage is the first non-developer user.

Amended by D-L52: the second host is a web page, beside the extension rather
than instead of it, so using Ark no longer requires VS Code.

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

### D-L06 — v1 ported Studio's whole UI and rebuilt only the model source

*Superseded by D-L35.* Studio's webview does no file access: the host posts a
`model`, the webview renders it, and edits come back as typed messages. The
reusable seam was therefore the model, not the widgets, so v1 took Studio's UI
verbatim and supplied the model from the keyboard. The original plan, forking
the presentation and rebuilding the state, misread where that seam sits;
lifting "the presentation" out of 534 functions in one template literal was
impossible. v2 then replaced the ported UI with its own.

### D-L07 — Specs are promoted, process is deleted

Firmware decision; its text is in the firmware direction.

### D-L08 — The live-profile owner is on by default

Firmware decision; its text is in the firmware direction.

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

### D-L13 — Combo readback is device data

Firmware decision; its text is in the firmware direction.

### D-L14 — Device edits are saved as a complete, generation-bound profile

Firmware decision; its text is in the firmware direction.

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
differences by what they configure: Keys, Lighting, Macros and Pointing modes,
each with added, changed and removed totals. It names no single difference;
that is the draft's review. A file identical to the keyboard says so and cannot
be used. A file carries no layer order, so it is compared slot by slot. See
`importDifferences` in `core/session/panel-session.js` and `categorySummary`
in `webview/view/review.mjs`.

### D-L17 — The keyboard reports its brightness limit

Firmware decision; its text is in the firmware direction.

### D-L18 — Native settings use device-reported capabilities

Firmware decision; its text is in the firmware direction.

### D-L19 — One whole-profile draft and review

A complete device snapshot seeds one window-local draft. Every editor, import
and layer edit updates it, with one undo history. Keep does not write HID.
Apply requires the exact reviewed draft revision and the matching connected
device; draft revisions are never device generations. Unfinished forms survive
keeping another section and re-reading the device; undo, redo and review
require them to be kept or discarded first. An external change preserves the
draft and blocks a stale Apply; **Review against keyboard** compares it
against a fresh read and never silently merges. An incomplete read is labelled
as recovery, never as a complete backup. Export captures the saved keyboard,
not unapplied changes. Closing the editor loses the draft.

### D-L20 — Differential Apply

The VIA macro bank is 10,327 bytes and a 32-byte Raw HID report carries 28 data
bytes, so one complete macro read is 369 exchanges; the old path read the
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

### D-L21 — Apply publishes one atomic logical generation

Firmware decision; its text is in the firmware direction.

### D-L22 — A cancelled save ends in bounded time, and says why it ended

Firmware decision; its text is in the firmware direction.

### D-L23 — Apply shows its steps, and a failure says where, why and what was saved

`core/session/apply-progress.js` names the ten steps of an Apply and tracks
them forward only: check the keyboard, save a recovery copy, send the profile,
keyboard checks it, stage keys and macros on the other half, copy the profile
to the other half, save it on this half, finish the other half, write keys and
macros on this half, check both halves. `restoreProfile()` reports at each real
boundary with byte counts. A failure keeps its step, a reason from the
keyboard's own error (or the other half's last answer), and whether anything
was saved. The commit bar keeps a failed Apply on screen until dismissed.
Transfer progress uses a separate `applyProgress` panel message, correlated to
the current draft ID and revision. The service retains the latest view for
full snapshots; progress alone updates the commit bar without rebuilding the
profile model or the visible editor. Connection, profile and busy-state changes
still publish full models. The active screen must not add work to each copy
chunk, including when a macro's local Text or Advanced input is present.
Read counters use a separate `readProgress` message for layout, profile pages
and portable capture. The service retains these counters for full snapshots;
the panel updates its commit bar or initial-read placeholder in place. A read
message must match the active operation ID, phase, device, connection token
and draft ID/revision (including an absent draft during the initial read), and
is ignored once that operation ends. Full models still publish operation
boundaries, completed data and failures. This rule covers initial reads and
post-Apply readback in both hosts; progress must not reconstruct the draft's
presentation model on every device reply.
Layout reads use the existing VIA buffer command (`0x12`) in 28-byte chunks,
decode the full 10 × 6 matrix per layer in big-endian keycodes, and expose only
the pinned visible positions in layout order. Sixteen layers take 69 requests;
progress counts visible keys, including the final 896-key total.
Profile payload reuse belongs to the connection's `ProfilePayloadReader`. It
can retain only bytes actually read and verified by CRC32 and FNV-1a. Compiled
defaults can be reused while that connection holds. Initial reading uses one
coherent complete capture for the editor and portable draft: layout, committed
payload and live combos are downloaded once and installed together after the
capture's checks pass. Initial committed reads, exports and post-Apply readback
download bytes afresh. A failed capture leaves independent diagnostics readable
but never opens an editable draft. Every reuse checks the complete fresh metadata identity before
and after, verifies both hashes, retries or downloads afresh on a mismatch,
and retains the capture's status, storage and settings coherence checks.
Reconnect discards the reader. Authored Apply target bytes never seed its cache:
the stored metadata alone is not a fresh integrity read of flash. The complete
macro bank, including unused trailing bytes, remains freshly read because Apply
compares and verifies the actual stored bank. Portable progress names each read
and reports transferred bytes. Configure editors retain their DOM when a full
model changes only transient read status; data, vocabulary, permission or
connection changes and form-reset/edit replies redraw. New model fields are
included in this comparison by default; Device and Profile retain full renders.
After a successful Apply, the app reads layout, committed domains, combos and
VIA base lighting again. The editor and rail stay visible but busy; the commit
bar names the current read and its page progress until editing resumes. This
readback is separate from the ten transaction steps and does not claim another
two-half verification. A finished Apply reaches the model only while its own
control still runs; any later busy operation (read, export, discard, review
against the keyboard) gets the generic busy bar, which names the operation and
mentions the saved profile only while a profile is being written.

Candidate status page 1 (see
[Profile Wire V1](../upstream/firmware/docs/architecture/profile-wire-v1.md#candidate-operation-status))
reports the peer phase, transferred bytes and the peer's last split status. The
host counts its movement as progress while the keyboard is `PREPARING_PEER`, so
a slow copy no longer runs into the stall window. Firmware without page 1
answers `UNKNOWN_PAGE` and keeps the old behaviour.

### D-L24 — Directional modes can read eight directions

Firmware decision; its text is in the firmware direction.

### D-L25 — VIA macros have names; user macros are retired

Firmware decision; its text is in the firmware direction.

### D-L26 — Macro slots share one visible memory, and every slot says what fits

All 128 slots share the keyboard's macro memory (10,327 bytes on the 16-layer
geometry; a key tap takes 3 bytes, ASCII text 1 byte per character, Unicode text its UTF-8 bytes). A macro plays only if
the firmware compiles it into at most 512 bytes (`MACRO_PAYLOAD_IR_MAX_BYTES`),
about 170 key taps; a longer one used to be accepted and then silently never
played. The app computes that size exactly (`macroProgramBytes`, checked
against the firmware decoder by `run_macro_program_size_tests.sh`), refuses an
edit past it, and marks a slot VIA wrote past it as too long.

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

### D-L27 — A stale copy on the other half can no longer hold off every later one

Firmware decision; its text is in the firmware direction.

### D-L28 — Dominant axis and eight directions are one directional engine

Firmware decision; its text is in the firmware direction.

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

A repeated element sits in the same place every time it appears, so a screen
reads as a grid rather than as text that wraps wherever it lands.
Review and Draft history reserve separate positions for tap-count badges and
tier dots, including when either is absent; title slots fit a full combo badge
with space before its name.
The Keys workbench tabs count what the selected layer stores. The Key tab counts
mapped keys, excluding transparent and disabled positions; its selected key's
layout index belongs in the key details. Every Keys tab is at least as tall as
the Behaviours tab; a taller editor carries its height across tab changes, so
changing tabs does not move the page's scroll position.
The Behaviours, Combos, Macros and Pointing modes reach lists lead with **On
this view**, calculated for the selected layer plus exactly the lower layers
currently previewed on. **On this layer** means a key stored on the selected
layer, and the other route groups describe ways it can reach an item under
different activations. The view can therefore overlap those groups; it is the
current activation, not another storage location. A combo in the view requires
all inputs in that activation and uses the configured Combo Layer Matching
reference when one is set. Tab counts still count the selected layer's stored
routes. On the board, a key the selected layer stores keeps its own marks; a
transparent key answered from below wears that key's behaviour dots and the
badges of the combos On this view lists it in (`combosInPreview` in
webview/view/keyface.mjs). Under Combo Layer Matching the reference layer's keys
are matched instead, so no answer from below adds a badge.

The reach sections have one open state by section identity across those four
tabs. Opening one does not close another. A section unique to one tab keeps its
own state; sections absent from another tab retain their state until shown
again. The Behaviours rail grows with its rows, so the Keys content pane is its
only vertical scroller.

- The review is one grid: a status gutter, the title with its area underneath
  when outside its section, the fields as sign · label · on the keyboard · in
  your draft, then Show and Discard at the edge. A field is marked as a diff
  marks a line: + added, − removed, nothing for changed. A side with nothing
  shows a dash in its own column.
- A destructive action is the last thing in its row.
- The draft's dot follows a row's label; on a tile it has one fixed spot.
- A removed thing keeps its mark and Show only where it is still on screen (a
  cleared pointing slot, an emptied macro slot).
- A table's owner reads by the name its dropdown offers, with its mark, never
  an enum.
- Where marked and unmarked labels share a column, every label gets the same
  mark slot (`marked(…, {slot: true})` in `webview/ui/marks.mjs`).

### D-L33 — One home for each rule the app needs twice

Knowledge kept in several places drifted: stored values had different words in
the review and the screens, the pointing-mode keycode registry was written six
times, a dirty draft was decoded 10–16 times per publish, and the host
sequenced Apply itself. Each rule now has one home:

- Words: `core/model/vocabulary.js`, sent as `model.vocabulary`; stages are
  found by id, never by label.
- Key names: `core/model/key-names.js`. The catalogue names what QMK ships;
  the profile names its macros, pointing-mode keys and bare user slots. The
  effective Host OS also names Alt/Option and GUI/Command/Windows/Super,
  including modifier wrappers, mod-taps, layer-mod keys, Magic actions and Space Cadet keys,
  without changing stored keycodes. Macro command previews and held-key
  warnings resolve those same labels; raw payload editors keep stored codes.
  Modifier-bearing catalogue labels are identified centrally by their words,
  independently of picker groups, so another key family inherits the rule. The
  screens' `qmkKeyLabels` and the review are both built from it, each from
  its own snapshot, so a key reads the same in the combo table, the picker and
  the review. The webview never names a keycode: a form such as the combo builder
  stores keycodes and looks up their current labels on each render. It never
  caches display words across model updates. `hostKeyVocabulary()` in the same
  module derives all eight modifier controls, their stable picker wrappers,
  grid headings, summaries and accessibility labels from the modifier
  vocabulary. Key Options uses the same host naming rule. Auto with an unknown
  host uses neutral Alt/GUI wording. The webview has no modifier-name table;
  an unnamed value falls back to its stored code. Host-switch browser checks
  exercise open behaviour pickers, combo builders, macro previews and pointing
  editors through the production model-message handler. The stored name
  (`KC_KP_1`) is added only when a review row's two sides would read alike.
  A layer is always named by its name, in the picker's verbs: `MO(3)` reads
  "Hold Navigation", `LT(3,KC_SLASH)` "/ / Navigation", and a layer key's cap
  shows the layer's name. Only a raw keycode, where one is shown, keeps the
  number.
- Actions, native keycodes, decode limits, layer references:
  `core/schema/actions.js`; the pointing registry and key layout are data.
- Decoding: once per draft revision, carried as `decoded` and taken through
  `decodedOf`; history entries are frozen.
- Settings bits and base lighting: `fieldMask` and `baseLighting` in
  `core/model/settings-editor.js`.
- Panel sequencing: `core/session/panel-controls.js`, tested with a fake
  service; the message loop around it, for every host:
  `core/session/panel-loop.js`. `extension.js` supplies dialogs, files,
  progress and toasts as host functions.
- Interface: `canEdit(area)` for permission, `view/reach-groups.mjs` and
  `ui/groups.mjs` for grouped lists, `slotLight` in `ui/marks.mjs`, one form
  per macro slot and one `state.combo` for the builder.

### D-L34 — Layer keycodes are owned in the firmware, and the app follows

Firmware decision; its text is in the firmware direction.

### D-L35 — Charybdis Live v2 is the app

*Numbered D-L21 when written, alongside the atomic-Apply decision.* v2 was
built beside v1 as `tools/charybdis-live-v2/`, and took over the plain name
`tools/charybdis-live/` once v1 was removed. It keeps v1's core, its layering and the one rule
(nothing reads the firmware repository), and replaces v1's ported Studio
interface with its own: browser ES modules with pure, tested `view/` modules,
every posted edit built by `webview/view/edits.mjs` and staged against a real
draft in `tests/edits.test.mjs`, and a board that shows what the firmware does.
Edits exist only as a reviewed draft; a keyboard the app cannot open a draft for
is read-only, and the host refuses edits rather than writing them directly. v1
was frozen by this decision and has since been removed.

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

### D-L38 — The dual-role setting is QMK's tapping term

Firmware decision; its text is in the firmware direction.

### D-L39 — Only the keyboard ends a staging, together with its candidate

Firmware decision; its text is in the firmware direction.

### D-L40 — Firmware builds use only the eight-slot pointing engine

Firmware decision; its text is in the firmware direction.

### D-L41 — Pointing keycodes name slots, not factory presets

Firmware decision; its text is in the firmware direction.

### D-L42 — Userspace keycodes sit in fixed blocks, and custom keys are named

Firmware decision; its text is in the firmware direction.

### D-L43 — Split activity optimization, at QMK's default baud

Firmware decision; its text is in the firmware direction.

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

### D-L46 — Firmware has no reverse dependency on Ark

Firmware decision; its text is in the firmware direction.

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

### D-L50 — Ark agrees with firmware by contract; `main` is a released stack

Ark talks to a keyboard, not to a firmware commit: it follows the capability
pages the keyboard answers, and one Ark serves a range of firmware. Ark and
firmware are in sync when the contract agrees, not when commits match. The
agreement check (`npm run agreement`) decodes the pages firmware states with
Ark's own runtime decoder and gating, and requires Ark's BK keycode and layout
inputs and pinned fixtures to equal firmware's (file equality, not commit
equality); keymap values are reported, never gating. It is required on `main`.
`dev` tests against Ark's own pins; `main` moves only by a release, which tests
that exact stack and its agreement and publishes the table in the notes
(firmware D-F04). See [agreement](COMPATIBILITY.md#agreement-with-a-firmware-contract).

### D-L51 — CI runs for releases; agreement judges the other release

Development is verified locally (the work-queue vault's `verify`), so CI does not
run on `dev` or on pull requests into it. A release's `dev` → `main` pull request
runs everything `main` requires (`check` on Linux and macOS, `browser`,
`compatibility` at the pins and `agreement`). `agreement` judges the firmware
Ark will be released next to: firmware `main`, or firmware `dev` when the
pull request's hidden release marker names a joint release; the release command
re-checks it when it merges. Nightly runs check `dev`, warn early about firmware
`dev`, and raise an alarm if the published Ark `main` and firmware `main` ever
disagree; none of them blocks. The one workflow that does run on `dev` pushes
is publishing the web page (D-L52), whose tests gate only that publish. This replaces D-L50's "required on `main`" and
release-stack wording where they differ: Ark and firmware release separately,
and together only when the contract between them changes (firmware D-F06).

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
the keyboard (a Web Lock); leaving with unapplied edits or during Apply asks
first; Apply's waits run on a worker's clock, so a background tab does not slow
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
bit 22; older firmware shows the layout read-only at US. On macOS, Unicode
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
the explanation distinguishes physical-key admission from a host input lock.

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
Older firmware uses the original chunk path.

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
