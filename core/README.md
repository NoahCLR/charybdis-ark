# Charybdis Ark Core

This is the app itself: everything except the VS Code shell and the webview.
It has no VS Code or webview dependency. Its layers — `data`, `transport`,
`schema`, `protocol`, `model`, `session` — import in one direction only; the
table is in [`../AGENTS.md`](../AGENTS.md) and `tests/layering.test.js`
enforces it.

## Reading the keyboard

`session/profile-device-service.js` enumerates matching interfaces, keeps
native paths and handles out of the webview, and reads what the keyboard says
about itself: firmware identity from Profile Wire capabilities and status
pages, the profile keymap and macro domains, the committed profile, combos, settings,
keyboard options and the base RGB effect. It publishes a sanitized snapshot;
`session/device-model.js` adapts those independent reads for the read-only
view. With a draft open, its `buildSnapshotModel` renders the complete snapshot
and its cached decoded form directly, taking editability from the draft binding;
the real device state supplies the keyboard header and diagnostics (D-L61).
The settings, macro and custom-key editor views are built only by
`device-model.js` (`editorViews`): the service keeps them for the profile the
editors follow, and a draft builds its own. An editor read and a restore
attach the same device facts to that profile in one read before anything is
written: settings limits, keyboard options and, where Unicode macros play,
the detected host OS.
Both inputs share configuration presentation. `session/panel-session.js` adds the draft and the panel's own state to it,
routes each message the webview posts, and runs the Rename & Reorder panel.
`session/panel-session-state.js` decides whether the draft takes an edit now
(`draftBinding`, published as `draft.editable` and `draft.reason`) and holds
the session's compound transitions and outbox (D-L60).
`session/panel-loop.js` is the loop every host runs around them: route a
message, run it, publish the model, turn a failure into the panel's notice,
and decide what an export holds. A host passes in only its own functions
(posting to the panel, toasts, progress, saving a recovery copy, choosing a
profile file, saving an export), listed at the top of that file, so
`extension.js` keeps only VS Code's dialogs, files and progress, and the web
page's host (`web/web-host.mjs`) only the browser's. What differs between
hosts reaches the panel as `model.host` (`panel-session.js`): whether it offers
Choose keyboard or a theme toggle, its recovery copies, its words for
connecting, and why it cannot reach a keyboard at all. `session/demo-session.js`
is the demo (D-L53): the same draft over the bundled demo profile with no device
behind it, which the loop answers to in place of the device service's state
while it is open.

`session/firmware-support.js` owns the firmware gates and their diagnostics.
Ark supports only current firmware (D-L64): the exact Profile Wire (2.0) and
schema (4.0) versions of the base, major and minor, which imply everything the
keyboard does. The feature word (`PROFILE_WIRE_FEATURES` in
`protocol/profile-wire-v1.js`) only describes the build: split, saves and
pointing. Apply needs a split build that saves (`CURRENT_MUTATION_FEATURES`),
and no code past these gates asks whether a feature is there. They answer
different questions and retain different requirements:

| Predicate | Requirements |
| --- | --- |
| `canRead` / `evaluateProfileCompatibility` | The exact Profile Wire and schema versions, report framing, status pages, RGB and behaviour domains; advertised capacities and the action ABI are not compared |
| `canEdit` (also exported as `supportsCompleteProfile`) | The exact base (`isCurrentBase`), current layer count, every registered profile domain and a known action ABI |
| `canApply` | The complete-document gate plus a split build that saves (feature bits 0 and 1), which brings candidate reuse and streaming with it |
| `evaluateLiveMutationCompatibility` | Connection and established read compatibility, the mutation features, candidate chunk size, known and converged peer; it publishes the existing ordered reasons and recovery facts |
| `editableDomains` | Independent view gates: complete idle read for behaviours/pointing, committed idle read for combos, current layers and the corresponding idle view for macros/settings, and an idle custom-key view |

`canCapture` and `canReadIdentity` distinguish a stable backup from a base read
under a candidate lease. Both reject previews and conflicts; a backup also
requires an active compiled/committed profile and the convergence flag.
`identityStateFlags` ignores only the pending-candidate flag in the base's
identity. All masks use named schema/protocol flags. The panel imports this
small support module directly; portable-session and service exports retain
their existing entry points for callers.

What current firmware is lives in one place per kind:

| What | Current | Where |
| --- | --- | --- |
| Profile Wire | 2.0, exactly | `PROFILE_WIRE_V1` in `protocol/profile-wire-v1.js` |
| Profile schema | 4.0, exactly | `PROFILE_BLOB_V1` in `schema/profile-blob-v1.js` |
| Domain versions | RGB 4, key behaviours 2, combos 3, settings 8, PD 3, keymap 1, macros 1 | `schema/profile-domains.js` |
| Store format | 6 (implied by Profile Wire 2, not on the wire) | `PROFILE_CANDIDATE_V1` in `protocol/profile-candidate-v1.js` |
| Payload size | 130,048 bytes, lengths and offsets 32 bits | `PROFILE_CANDIDATE_V1` |
| Action vocabulary | `0x6fd70b90` | `ACTION_ABI` in `schema/actions.js` |
| Transport and identity | Firmware-owned Raw HID, usage page `0xFF60`; firmware version in capability page 0 | `protocol/profile-wire-v1.js`, `protocol/raw-hid-unhandled.js` |
| Backup file | Version 5, one complete blob; 196,608-byte UTF-8 limit | `DOCUMENT_VERSION`, `FILE_MAX_BYTES` in `model/portable-profile.js` |
| Feature word | split, saves, pointing (bits 0–2) | `PROFILE_WIRE_FEATURES` |

The version stands for everything the base does (firmware D-F28): the feature
word holds only what a build genuinely varies by, never a step in the
firmware's history, and a later capability raises the minor version.
`CURRENT_PAIR_FEATURES` is everything the flashable pair reports, which the
demo and test keyboards report too. Profile Wire 2 retired every bit of the
earlier feature word (the firmware's `profile-wire-v1.md` records what each
meant), so a keyboard reporting one fails the capability decode: it is on the
previous base.

A keyboard that fails these gates, or stores a schema or domain in another
version (`decodeStoredProfileBlob`, and `readSettings` in
`protocol/portable-profile-v1.js`, raise `FIRMWARE_UPDATE_REQUIRED`), is read
no further than its identity: no independent reads, no draft, and a notice to
update both halves. Independent per-area reads remain only for current
firmware whose complete capture failed. Profile Wire state flag 9
(`STORED_EARLIER_FORMAT`) means a slot was refused as an earlier store format
or retired test layout, which the keyboard neither reads nor converts; the
Keyboard screen says it runs its built-in defaults until Apply saves the
current format.

The next firmware that adds a capability (a new Profile Wire or schema minor)
or bumps a domain version reaches Ark as one change to the table above, its
codec and tests, pinned and released with it (D-L44, D-L50). The agreement
check (`scripts/check-agreement.js`) fails a firmware whose versions are not
exactly Ark's, whose action-ABI digest Ark does not know, which lacks a
registered domain, or which is not a split build that saves.

A device operation that fails rejects, with the error it also records in the
snapshot (`error`, and a line in `diagnostics`), so the panel shows the failure
whoever awaited it; a refusal before one starts (not connected, not refreshed,
busy) rejects too. Callers catch what they can recover from and let the rest
become the panel's notice. Two reads are optional and never reject: base RGB
and combos record a failure as their own `{state: "unavailable"}`.
`disconnect()` always ends disconnected.

The service runs one device operation at a time. `runOperation` holds its own
lock for the whole operation, including restore's trailing health read, and
the optional reads go through it too. `busy` is derived from that lock and an
explicit disconnect, so a keyboard unplugged mid-operation stays busy until
the operation unwinds. A required operation that overlaps rejects with
`SERVICE_BUSY` and changes nothing; an optional read that overlaps resolves,
leaves the earlier error alone and records a diagnostic. The panel refuses
the same overlap first, out loud: an edit or a draft, backup, demo or read
control posted while a read or backup runs answers with a notice. A reloaded
panel's `ready` and host controls start nothing, so they are answered with
the model.

Panel controls are registered in `session/panel-control-registry.js`:
route, binding, demo policy, execution phase and named action. The router and
controllers consume it; the contract's payload groups and all handler names
are checked against that registry. Existing exported route sets are derived.

Device phase IDs and their words are owned by `model/vocabulary.js`:
`PHASE` identifies operations, while `VOCABULARY.phases` names them and marks
whether they write. Load, health and read-progress contracts carry `PhaseId`;
status presentation and the browser close warning use the shared phase facts.

Apply's transfer counters leave `ProfileDeviceService` through its optional
`onApplyProgress` callback. The panel loop posts that small view as
`applyProgress`, with the current draft ID and revision; the webview refreshes
only the commit bar. Full models still carry the latest Apply view and publish
on profile, connection and busy-state changes. Service clients without that
callback retain the full-snapshot notification path.

Layout, profile-page and portable-capture progress similarly use optional
`onReadProgress`, posted by the loop as `readProgress`. The service stores the
latest progress in its normal snapshot fields. The panel checks the message
against the active operation ID and phase, device and connection token, and
draft identity before updating its counter or loading placeholder in place.
`model.load` carries that operation identity and whether the device operation
itself is busy, independently of the panel's surrounding Apply/read control.
Completion, failure and connection changes still publish full models; clients
without the callback retain snapshot notifications. Full model updates that
change only read status keep Configure editors mounted; a conservative view
comparison includes all new model fields by default. Data, vocabulary,
permission, connection and form-reset changes rebuild the editor. Device and
Profile screens still rebuild for their diagnostics and backup state.

`schema/keymap-domain-v1.js` decodes every matrix position from the active
profile, falling back to the compiled domain when absent.
`data/charybdis-layout.js` owns the layer count and matrix geometry alongside
the visible layout. `matrixPosition(layoutIndex)` translates a visible key
into its stored slot for reads, edits, participation and review.
`session/profile-payload-reader.js` owns `ProfilePayloadReader`: verified byte
reuse behind a small interface. Its stateless protocol codec checks complete
metadata identities, retries coherent reads and verifies CRC/FNV. `ProfileDeviceService` owns one reader per connection;
`readKeyboardProfile` makes one coherent complete capture and uses its verified
raw layout, active payload and live combos for the editor as well as the draft.
It publishes completed data together; a failed capture on current firmware
falls back to independent read-only diagnostics and keeps the edit gate
closed. A keyboard that is not on current firmware, by its features or by a
stored schema or domain version (`FIRMWARE_UPDATE_REQUIRED`), is read no
further. Normal committed reads
always fetch bytes, including initial reads, post-Apply readback and standalone exports. Compiled defaults
are immutable during a connection and use verified reuse; reconnect drops the
reader. No Apply target or backup seeds it.

The complete portable read (`session/portable-profile-session.js`
`captureProfile`) takes lighting, behaviours and pointing from the running
profile, or from the compiled defaults (GET `0x05`) when nothing is committed,
and combos and settings from their own live readbacks. The compiled read
carries all five domains, but its combos are the authored ones and its settings
the immutable factory ones, so neither ever stands in for what the keyboard
runs, and no domain is taken twice. The retired pointing-mode page (GET
`0x09`) is never read. The payload readback's metadata page is layout 2: a
32-bit payload length, then generation, digest and CRC.

Custom Profile Wire pages use one monotonically increasing nonzero request-id
sequence per connected session (wrapping `255` to `1`), so a delayed response
from an older request cannot satisfy a newer one.

## Editing and applying

Every edit is staged in `session/profile-draft-session.js`: a complete
portable profile (`model/portable-profile.js`) with undo and redo history, a
review built by `model/profile-review.js`, the checks of what the layers let
you reach from `model/layer-reach.js` (a trap has to be confirmed before
Apply), and staleness checks on every message (draft id, revision, and the base
the form was built from). `buildPanelModel` projects the state; the panel loop's
`serviceChanged` step observes fresh portable captures and connection facts
before publishing. Repeated projection never changes the draft lifecycle.
Standalone exports return a fresh capture without installing editor state.

Review compares stored values, including names that
match a fallback label and names retained by disabled pointing slots. The
review-completeness test mutates every editable decoded field shape and every
stored setting ID through its real codec, requiring a specific review item;
canonical identities, codec versions and derived counts are explicitly exempt.

`model/layer-resolution.js` compiles each position's possible source layers
and the active-layer conditions that select them. Layer reach uses those facts,
and `session/device-model.js` publishes them as each layer's `answers`, indexed
by layout position. They come from the layout values already decoded; model
building does not decode again. The webview selects these facts for its preview
instead of implementing the highest-active-non-transparent rule again.

The macro inspector (`model/macro-input.js`, through `model/macro-editor.js`) shares
staging's codec and limits. `validateViaMacro` receives a correlated
`macroValidation` reply without an edit, toast or device call; only a subsequent
`updateViaMacro` stages anything. `model/draft-edits.js` registers every edit
type once: the editor it goes to, the profile domain it rewrites and the words
its history step is recorded with. The router's `DRAFT_EDITS`, `stage()`'s
dispatch and the profile editor's domains all read it. The domain edits
themselves live in `model/device-profile-edits.js` and
`model/key-behavior-edits.js`.
Their destination facts include the behaviour capabilities decoded by the
session; pure domain presentation lives beside them in `model/device-profile-view.js`.
Draft history keeps each frozen document and its origin, label, time and layer
order in one entry, so branching and trimming preserve them together.

Apply goes through `session/portable-profile-session.js`: the reviewed base
is checked, a recovery copy is saved before the first device write, and one
complete candidate goes through `protocol/profile-candidate-v1.js` and
`session/candidate-upload-coordinator.js`. The base is checked again under the
lease. Firmware prepares both halves, makes its durable decision and activates
one generation after confirming the peer. No VIA bindings, staging, separate
generations or USB-half roll-forward remain. BEGIN bytes 24–31 are reserved
zero. Schema 4.0 implies logical store format 6 through Profile Wire 2.
CHUNK
and REUSE offsets and lengths are 32 bits. Candidate status page 0 (layout 2)
carries progress and the error id; `readCandidateStatus` reads page 3 for
where the error is only after a page 0 reporting one, and keeps it only when
its transaction, operation sequence and error sequence match that page 0,
rereading the pair otherwise (an error that never settles keeps its id, with
the location unknown).
Staging never retries an ambiguous transport outcome, commit is
transaction/digest-correlated and idempotent across a lost acknowledgement, and
success is accepted only after a fresh status read reports the new generation
on both halves. A keyboard the app cannot open a draft for is read-only; the
host refuses edits rather than writing them directly.

Live + review (D-L65, firmware D-F32) shares that draft. The edit mode is read
with the capabilities (`protocol/profile-edit-v1.js`); a keyboard not in Apply
is read by `session/live-profile-session.js` as its working copy (GET `0x21`)
and the saved profile beside it, both materialized from their stored bytes
(`model/portable-profile.js` `materializeStored`), the working copy's exact
bytes kept for splices. `ProfileDraftSession` then holds `live` state: review
compares saved with working, and the history moves only through
`confirmLive`/`confirmSaved`. `session/live-edits.js` routes every edit, undo,
discard, import, Save, Revert and mode switch: it computes the target with the
same editors (`propose`, `discardTarget`, `stepTarget`), asks first about a
trap or warning the edit adds (`checksAdded`), and sends it through
`ProfileDeviceService.postLiveEdit`, whose `session/live-edit-coordinator.js`
diffs the bytes into one splice per changed domain (`schema/profile-splices.js`),
streams them, waits for the keyboard's outcome and the other half, and never
replays. A refusal or stale identity rereads the keyboard.

Live (D-L66) is the same draft with the keyboard saving by itself.
`session/live-watch.js` looks at a live keyboard between edits: hosts call the
panel loop's `watch()`, which reads the edit status about once a second
(`ProfileDeviceService.readLiveStatus`, never while an operation runs) and hands
it to `ProfileDraftSession.observeLiveStatus`, which moves what is saved when
the keyboard saved by itself (`confirmKeyboardSaved`, history kept) and keeps
its flags (`live-profile-session.js` `liveKeyboardStatus`); a revision or mode
Ark did not make rereads the keyboard. Leaving Live calls
`ProfileDeviceService.flushWorkingCopy` (`LiveEditCoordinator.flush`), with a
recovery copy of the current saved profile before any explicit Save, before the
mode changes.

## Byte formats

`schema/profile-domains.js` owns each domain's ID, model key, version, wire
capability bit, review area and codecs: the one place a domain is added or its
version bumped. Each domain is read and written in that one version. Envelope validation, candidate masks,
portable encoding, device decoding, usage and partial reverts read that registry.
Codec loading is deferred so this metadata stays available to the envelope and
the codecs themselves. `replaceDomain` rewrites one payload while preserving
the other envelopes and their canonical validation.

The stored field table in `schema/settings-domain-v1.js` supplies settings
count and byte offsets, numeric bounds and range hints, and the layer references
that follow a reorder. Startup layers follow reach when keys stay put; the
per-layer policy masks follow storage. Editor labels and grouping still belong
to `model/settings-editor.js`.

`schema/bytes.js` owns integer bounds, byte views and copies, reserved-byte
checks, protocol error construction and the canonical check. Codecs keep their
existing error names, codes and location fields; a caller chooses whether bytes
are viewed or copied.

Every registered domain codec has one contract: `decode(bytes, options) →
value` and `encode(value, options) → Buffer`, where a decoded value is an
encoder input and encodes back to exactly the bytes it was read from. Each
domain decoder ends with `canonical` from `bytes.js`: it re-encodes what it
read, with the options it read under, and refuses bytes that come out
differently. An encoder that refuses the value refuses the bytes in its own
words. The pointing decoder writes with `writePdDomain`, because its encoder
checks its output by decoding it. The codecs share this check, not an error
class: RGB throws `RgbDomainProtocolError`, behaviours
`ProfileBlobProtocolError`, combos and settings a plain `Error` with one code
each (`INVALID_COMBO_DOMAIN`, `INVALID_SETTINGS`), and pointing a plain `Error`
with a code per cause and the byte offset. Every byte-level refusal carries a
string `code`; `tests/schema/profile-domains.test.js` pins the contract and
these identities for every registered domain.

`schema/profile-blob-v1.js` encodes and strictly decodes the `NLP1` header and
its ordered domain envelopes (6 bytes: id, version and a 32-bit payload
length, schema 4), the four-byte semantic action values, and the FNV-1a 32-bit
and CRC32 helpers. It accepts schema 4.0 only; unknown domains
and every other domain version are rejected, and `decodeStoredProfileBlob`
says so to a keyboard storing one. Complete snapshots use sixteen layers and
the current 32-slot action vocabulary; an older backup is refused, never
translated (D-L54, D-L64). The domain codecs —
`rgb-domain-v1.js`, `key-behavior-domain-v1.js`,
`combo-domain-v1.js`, `pd-mode-domain-v1.js`, `settings-domain-v1.js` — are
exact inverses of their decoders, under the canonical check above, and enforce
the firmware's limits. The RGB
byte contract is frozen in [`rgb-domain-v1.md`](../upstream/firmware/docs/architecture/rgb-domain-v1.md), a pinned firmware spec;
its firmware counterpart is `users/noah/lib/profile/schema/profile_rgb_v1.c`.
`schema/compiled-profile-v1.js` resolves expressions in the keyboard's
vocabulary (`KC_A`, `LT(1, KC_A)`, `PD_SLOT_0`, `VIA_MACRO_3`) to actions and
native keycodes, refusing any whose bits would land on another keycode.

Every profile length and offset is 32 bits: the blob's 6-byte domain
envelopes, the payload readback's metadata (layout 2), candidate BEGIN, CHUNK
and REUSE, the candidate status pages and the capability pages. Capability
layout 3 (`decodeCapabilityPages` in `protocol/profile-wire-v1.js`) reports the
counts that fit a byte on page 1 and the wider ones on page 2; any other
layout is refused. Current firmware reports 16 layers, 128 VIA macros, 128
custom keys, 128 KiB flash slots, a 130,048-byte payload capacity and a
34,903-byte macro domain. The action vocabulary `0x6fd70b90` is schema 4's:
the firmware folds the schema major into the digest, so it differs from schema
3's `0x837cf479` with no keycode changed. The action ABI describes the engine
vocabulary independently of authored rows, so empty and populated builds
advertise the same ABI. Macro keycodes keep the historical `VIA_MACRO_n`
names; they do not imply VIA support (firmware D-F31). The connected
keyboard's advertised tap depth governs behaviour steps and the RGB tap-branch
palette throughout read, edit, history, reorder and partial discard
(`schema/profile-depth.js`); a backup carries its depth in the counted RGB
palette, and import and Apply validate it against the destination's advertised
limits.

The keymap codec (`keymap-domain-v1.js`, domain `0x60` v1) retains all 60
matrix positions on each of 16 layers, including unwired positions, as
little-endian uint16 values. The macro codec (`macro-domain-v1.js`, `0x70` v1)
checks the firmware’s bank grammar and reads 128 streams; unused bank tails
are accepted, while writing streams produces their canonical terminators
alone. The registry describes all seven domains.

A backup is a version-5 document (`DOCUMENT_VERSION` in
`model/portable-profile.js`) with exactly `format`, `version`, `keyboard`,
`actionAbiDigest` and `profile`, where `profile` is the complete canonical
schema-4 blob in base64 with all seven domains once (D-L15). Ark owns this
envelope; the firmware's
[portable profile](../upstream/firmware/docs/architecture/portable-profile-v1.md)
owns the domain contracts, and its "Portable document" section describes a
retired client format, not this one. A backup carries every domain and never
falls back to the destination's compiled data. `validateSnapshot` returns
decoded `layers` and `macroSlots` views; they are not extra serialized fields,
and edits to them replace their domains. Domain replacements keep every
unrelated domain, including during review, undo, partial discard and layer
reordering; a reorder (`reorderLayers`) moves layers and rewrites the
references that follow them together, the base staying the layer at index
zero (D-L37). Unrelated edits preserve optional unused macro-tail bytes;
replacing macro content reclaims that capacity when calculating shared
profile headroom. Import, demo file opening and restore take only this format:
version-4 separate-field files and older formats, and any other schema, action
vocabulary or domain version, are refused, never translated, and malformed
input fails without a data-dropping fallback (D-L54). Files are limited to
196,608 UTF-8 bytes (`FILE_MAX_BYTES`), enough for a 130,048-byte blob and its
envelope. The extension, web host and drop importer enforce that bound.

Capture materializes omitted domains from compiled defaults and overlays the
live combo/settings readbacks: a domain absent from the keyboard's profile
means its compiled default, while an explicitly empty one stays empty. Base lighting uses those captured settings;
standalone lighting reads also use Profile Wire scalars 21/22. All seven
domains count toward usage and macro room, which is bounded by both remaining
profile space and the advertised macro-domain capacity. Exact active bytes
are retained only as a verified differential-transfer source.

All 128 macro slots share the profile's remaining space, within the
macro-domain limit the keyboard reports (`macroBytes`): a key tap takes 3
bytes, ASCII text 1 byte per character, Unicode text its UTF-8 bytes. The
keyboard plays a stored macro in 512-byte windows (firmware D-F14), so the only
limit on one macro is free memory. Apply encodes the streams with their
terminators in domain `0x70`, subject to the destination's domain limit and
the remaining whole-profile capacity (`validateSnapshot`). The domain stores
streams, not a bank size, so the profile fingerprint (`fingerprintOf`) does not
depend on the keyboard's bank. `model/macro-editor.js` (`profileMacroBudget`)
keeps room for ten key taps (30 bytes) in every empty slot, which the firmware
does not enforce; when free memory cannot, the highest-numbered empty slots are
unavailable until space is freed (D-L26). A retained draft reviewed against a
reconnected keyboard adopts its reported capabilities and drops its cached
decoding, review and checks before editing resumes (`acceptCapabilities` in
`session/profile-draft-session.js`). Each macro name holds up to 32 UTF-8 bytes
in the settings domain's counted names.

Settings scalar 27 holds the Host settings (`schema/host-settings.js`): bits
0..1 the host OS (Auto, macOS, Windows, Linux), bit 8 Unicode playback, bits
16..23 the host keyboard layout and bit 24 a Mac that classified the keyboard
as ISO (D-L56). The keyboard accepts canonical UTF-8 text; text and backups
preserve exact Unicode scalar sequences. The detected OS is read with GET
`0x0B` (`protocol/host-os-v1.js`); Auto follows it, falls back when it is
unknown, and a saved OS override takes precedence. The detected OS is volatile:
a complete Read refreshes the current draft's presentation caches without
changing stored edits, history, revision or conflict fingerprints. Physical
host insertion remains a hardware acceptance requirement, separate from codec
and UI verification.

## Keycode catalog

`npm run keycodes` (`scripts/generate-keycode-catalog.js`) writes the
checked-in `data/keycode-catalog.json` from Ark's pinned QMK snapshot, stamped
with the QMK version it came from (D-L05); `npm run keycodes -- --check` fails
when the two differ. Besides QMK's keycode data it reads the layout extras'
shifted US symbols (`S(KC_1)` is `KC_EXLM`) and the keyboard's own keycodes
from `enum charybdis_keycodes` in `keyboards/bastardkb/charybdis/charybdis.h`.
Those take their `QK_KB` slots under the header's short name (`DRGSCRL`), with
the long name and `QK_KB_n` kept as aliases, so every spelling resolves. The
`QK_KB` range is fixed by QMK and the keyboard code, not by the userspace action
ABI, so these keys need no matching vocabulary. Their drag scroll is the
keyboard code's own, at a fixed `CHARYBDIS_DRAGSCROLL_DPI` that the Pointing
modes settings do not reach. Drag scroll is the `PD_SLOT_0` pointing mode, so
the picker does not offer `DRGSCRL` or `DRG_TOG` (`UNSUPPORTED` in
`webview/view/picker-sections.mjs`); a key already holding one still reads back
as "Built-in drag scroll".

## Adapter contract

An injected device adapter implements:

```js
listDevices() -> Promise<Array<{id: string, ...metadata}>>
connect(deviceId) -> Promise<ConnectedDevice>
```

Each connected device implements:

```js
write(report32) -> Promise<void>
onReport(listener) -> disposer
onDisconnect(listener) -> disposer
close() -> Promise<void>
```

Reports are always `Buffer` or `Uint8Array` values of exactly 32 bytes. Adapters
may return a disposer function or an object with `dispose()` from either event
subscription.

`FakeDeviceAdapter` implements the same contract for unit tests.

## Native desktop adapter

`NodeHidDeviceAdapter` is the concrete `node-hid` 3.x implementation. Requiring
its module does not load `node-hid`; the native dependency is first requested
when `listDevices()` or `connect()` runs. Tests may inject either `hidModule` or
`loadHid` into its constructor.

Enumeration is restricted to all four QMK Raw HID identifiers:

- vendor id `0xA8F8`
- product id `0x1833`
- usage page `0xFF60`
- usage `0x61`

Only paths returned by a matching enumeration may be opened. On macOS the
adapter requests non-exclusive access so a desktop connection does not claim
the full HID device. The adapter boundary always uses 32-byte protocol frames;
native writes are prefixed with the zero report-id byte required by `node-hid`,
and reads accept either 32 protocol bytes or 33 bytes with that zero prefix.
Any other native report invalidates the device session.

The four identifiers live in `transport/device-adapter.js` and are shared by
every adapter.

## Browser adapter

`WebHidDeviceAdapter` implements the same contract over Chrome's WebHID. It
takes the `hid` object (`navigator.hid`) as an option and never names
`navigator` itself; without one, every call fails with
`NATIVE_MODULE_UNAVAILABLE`.

`listDevices()` returns the interfaces this page has already been allowed to
open (`getDevices()`) whose collections carry the Raw HID usage page and
usage, the one last chosen in `requestDevice()` first. `forget()` closes the
interface last opened and calls `HIDDevice.forget()`, so the page may not open
it again until it is chosen. `requestDevice()` opens Chrome's picker filtered to all four
identifiers and must run from a user gesture; a dismissed picker fails with
`CANCELLED`. WebHID has no device path, so each `HIDDevice` object gets an id
(`webhid:1`, `webhid:2`, …) the first time the adapter sees it and keeps it
while Chrome keeps that object, which is as long as the keyboard stays plugged
in. Descriptors carry node-hid's keys; those WebHID cannot know (path, serial
number, manufacturer, release, interface) are `undefined`.

Reports are sent with report id 0. An `inputreport` must carry report id 0 and
exactly 32 bytes and reaches `onReport` as a `Buffer`; anything else
invalidates the session. Chrome's `disconnect` event for the open device ends
the connection; `close()` removes both listeners and closes the device once.

A browser tab in the background has its timers throttled, so the waits between
polls while saving a profile (the candidate coordinator) take a `sleep(ms)` the host passes as an
option of `ProfileDeviceService` (or of `openPanelLoop`); the web page passes
one kept by a worker. Without it they use `setTimeout`, as the extension does.

The read-only CLI lists matching interfaces without opening or writing to one:

```sh
npm run probe:live-link
npm run probe:live-link -- --json
```

## Coordinator contract

Create one `DeviceRequestCoordinator` for an adapter, then call `connect(id)` to
obtain a `CoordinatedDeviceConnection`. Connections for different device ids
have independent queues. A single device sends exactly one request at a time.

```js
const connection = await coordinator.connect(deviceId);
const response = await connection.request(report, {
    timeoutMs: 1000,
    signal,
    matchResponse(responseReport, requestReport) {
        return responseReport[0] === requestReport[0];
    },
});
```

The default matcher compares byte 0. Versioned custom live-profile frames must
supply a matcher that also checks their transaction id.

When nothing on the keyboard handles a report, the firmware answers with the request
echoed back and byte 0 set to `0xFF`. Every protocol module accepts exactly that
echo of its own request (`protocol/raw-hid-unhandled.js`) and treats it as a
definite refusal: a stable error such as `UNHANDLED` or `KEYBOARD_NOT_READY`,
with the connection left open. A `0xFF` report that is not an echo of the
request — another client's reply — is never taken for an answer.

Cancellation of a queued request removes only that request. Timeout,
cancellation, write failure, malformed input, or matcher failure after a
request has reached the device invalidates the whole connection. This is the
stale-reply isolation rule: a request with an ambiguous outcome is never
followed by another request on the same HID session. Reconnect before retrying.

Stable error codes are exported as `LIVE_LINK_ERROR_CODES`:

- `ALREADY_CONNECTED`
- `CANCELLED`
- `CONNECT_FAILED`
- `DEVICE_NOT_FOUND`
- `DISCONNECTED`
- `ENUMERATION_FAILED`
- `INVALID_ADAPTER`
- `INVALID_REPORT`
- `NATIVE_MODULE_UNAVAILABLE`
- `NOT_CONNECTED`
- `RESPONSE_MATCH_FAILED`
- `TIMEOUT`
- `WRITE_FAILED`

The UI should branch on `error.code`, not error message text.

## Tests

```sh
npm run check   # syntax, strict types, then every test
npm test        # the tests alone
```

The tests use Node's built-in runner and the fake adapter. Golden vectors and
layout inputs come from the pinned snapshots under `upstream/`; ordinary app
tests require no sibling checkout. Strict checking uses the layer's local
declarations and the shared posted-data contracts under `contracts/` (see
[Type checking](../docs/REPOSITORY.md#type-checking)).
