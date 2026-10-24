# Charybdis Ark core

The app without a shell: no DOM and no shell import (D-L71), layers that
import one way (D-L10, [architecture](../docs/architecture/README.md)). This page maps the modules
and the contracts a shell or adapter must keep. The rules for reading, the
draft, Apply and the live modes are in
[reading, applying and progress](../docs/architecture/profile-snapshot-and-progress.md);
the draft binding, panel controls and model are in the
[interface contracts](../docs/spec/interface-contracts.md).

## How data flows

**Reading.** A device adapter (`transport/`) carries 32-byte reports; one
`DeviceRequestCoordinator` serializes them per keyboard. `protocol/` modules
build requests and decode answers; `schema/` decodes the stored bytes.
`session/profile-device-service.js` owns the connection and publishes what it
holds as `snapshot()`. Its complete read, `readKeyboardProfile`, takes one
verified snapshot: `snapshotProfile` (`session/portable-profile-session.js`)
for a keyboard in Apply, `snapshotLive` (`session/live-profile-session.js`) for
one in a live edit mode or still running unsaved live edits; that read also
keeps the working copy's exact bytes, which live edits splice against.

**Editing.** The snapshot seeds `ProfileDraftSession`
(`session/profile-draft-session.js`): one complete document with its history.
`session/panel-session.js` routes each message the panel posts; an edit
reaches `stage()`, which finds its editor through `model/draft-edits.js` and
rewrites one domain. Review (`model/profile-review.js`) and the checks
(`model/profile-checks.js`, `model/layer-reach.js`) compare the draft with
the keyboard. `buildPanelModel` projects the draft through
`session/device-model.js` into the model the panel draws.

**Applying.** In Apply mode, `session/panel-controls.js` hands the reviewed
document to the service's `restorePortableProfile`, which runs
`restoreProfile` (`session/portable-profile-session.js`): recovery copy first,
then one candidate through `session/candidate-upload-coordinator.js` and
`protocol/profile-candidate-v1.js`. In the live modes,
`session/live-edits.js` computes each target with the same editors and sends
it through the service's `postLiveEdit`; `session/live-edit-coordinator.js`
splices it per domain (`schema/profile-splices.js`), and
`session/live-watch.js` looks at the keyboard between edits.

## The panel loop

`session/panel-loop.js` is the loop the web page's shell runs: route a
message, run it, publish the model, turn a failure into the panel's notice.
The shell passes in only what it has, as listed at the top of that file, plus
the device service's `adapter` and `sleep(ms)`. A background tab throttles
timers, so the page passes a `sleep` kept by a worker; otherwise `setTimeout`
is used. What the page offers reaches the panel as `model.shell`, whose
defaults are the page's (`SHELL_WORDS` in `session/panel-session.js`).
(`tests/session/panel-loop.test.js`)

## Current firmware, in one place each

Ark supports only current firmware (D-L64): the exact Profile Wire and schema
versions, which imply everything the keyboard does. Supporting the next
firmware is one change to this table, its codec and tests, pinned and
released with it (D-L44, D-L50).

| What | Current | Where |
| --- | --- | --- |
| Profile Wire | 2.0, exactly | `PROFILE_WIRE_V1` in `protocol/profile-wire-v1.js` |
| Profile schema | 4.0, exactly | `PROFILE_BLOB_V1` in `schema/profile-blob-v1.js` |
| Domain versions | RGB 4, key behaviours 2, combos 3, settings 8, PD 3, keymap 1, macros 1 | `schema/profile-domains.js` |
| Store format | 6 (implied by Profile Wire 2, not on the wire) | `PROFILE_CANDIDATE_V1` in `protocol/profile-candidate-v1.js` |
| Profile size | 130,048 bytes; lengths and offsets 32 bits | `PROFILE_CANDIDATE_V1`, `PROFILE_BLOB_V1` |
| Action vocabulary | `0x6fd70b90` | `ACTION_ABI` in `schema/actions.js` |
| Feature word | split, saves, pointing (bits 0–2) | `PROFILE_WIRE_FEATURES` in `protocol/profile-wire-v1.js` |
| Backup | version 5; 196,608-byte file limit | `DOCUMENT_VERSION`, `FILE_MAX_BYTES` in `model/portable-profile.js` |

The feature word holds only what a build varies by (firmware D-F28); a later
capability raises the minor version instead. The gates that judge a keyboard
against this table, and what each one requires, are in
`session/firmware-support.js` (`tests/session/firmware-support.test.js`). A
keyboard that fails them, or stores a schema or domain in another version
(`FIRMWARE_UPDATE_REQUIRED`), is read no further than its identity.

## The device service

`ProfileDeviceService` runs one operation at a time: an overlapping required
operation rejects with `SERVICE_BUSY` and changes nothing. A failure rejects
and is also recorded in `snapshot()`, so the panel shows it whoever awaited
it; the optional reads (base RGB, combos) never reject and record
`{state: "unavailable"}` instead. The full convention is the class comment.
(`tests/session/service-operation-lock.test.js`)

## Domain codecs

`schema/profile-domains.js` registers each domain once: ID, version, wire bit,
review area and codecs. Adding a domain or bumping its version starts there.
Every codec is `decode(bytes, options) → value` and
`encode(value, options) → Buffer`, and decoding then encoding gives back
exactly the bytes read. Decoders enforce this with `canonical` from
`schema/bytes.js` and refuse bytes that come out differently, with a string
`code`. The one exception is the macro domain: an unused tail after the last
slot is accepted on read, and encoding writes the streams alone.
`tests/schema/profile-domains.test.js` holds the contract for every domain.

## Backups

A backup is Ark's envelope (D-L15), version 5, with exactly these fields:
`format` (`"charybdis-profile"`), `version`, `keyboard` (`"charybdis-4x6"`),
`actionAbiDigest` (one Ark knows) and `profile`, the complete canonical
schema-4 blob in base64 with all seven domains once. Decoded layers and macro
slots are views for the editors, never extra fields. Anything else (version 4
or older, another schema, action vocabulary or domain version, an unknown
field) is refused, never translated (D-L54), and a file over
`FILE_MAX_BYTES` is refused before parsing. The firmware's
[portable profile](../upstream/firmware/docs/spec/portable-profile-v1.md) and
[Profile Wire](../upstream/firmware/docs/spec/profile-wire-v1/README.md) own
the domain contracts. `tests/model/portable-profile.test.js` holds it.

## Adapter contract

A device adapter (native, browser or the tests' fake) implements
`listDevices()` and `connect(id)`; a connected device implements `write`,
`onReport`, `onDisconnect` and `close`, as typed in `transport/types.d.ts`.
Reports cross this boundary as exactly 32 bytes (`Buffer` or `Uint8Array`);
anything else is `INVALID_REPORT`. Every adapter matches the same four Raw HID
identifiers (`transport/device-adapter.js`), and every error carries a stable
`code` from `LIVE_LINK_ERROR_CODES`: branch on it, never on the message.

The device service has no default adapter: `new ProfileDeviceService({adapter})`
takes the one its caller passes, and throws a `TypeError` without one, so the
page can never reach for a native module.

**Native** (`NodeHidDeviceAdapter`), for development: Node scripts and agents
pass it to drive a keyboard (`scripts/probe-live-link.js`,
`npm run preview -- --device`); node-hid is a development dependency and the
web build refuses it. node-hid loads at the first
`listDevices()` or `connect()`, not on `require`, so a missing native module
is `NATIVE_MODULE_UNAVAILABLE`, not a crash. It opens only a path its last
enumeration returned, and on macOS opens it non-exclusively. node-hid wants a
zero report-id byte: writes get it, reads accept 32 bytes or 33 with it, and
any other report ends the connection. (`tests/transport/node-hid-adapter.test.js`)

**Browser** (`WebHidDeviceAdapter`). It takes `navigator.hid` as its `hid`
option and never names `navigator`; without one every call is
`NATIVE_MODULE_UNAVAILABLE`. `listDevices()` lists only interfaces the page
may already open, the one last chosen first. `requestDevice()` opens Chrome's
picker and must run inside a click. WebHID has no path, so each `HIDDevice`
object gets an id (`webhid:1`, …) that lasts until the keyboard is unplugged.
`forget()` closes the keyboard last opened and withdraws the page's
permission. (`tests/transport/webhid-adapter.test.js`)

## Coordinator contract

`DeviceRequestCoordinator.connect(id)` gives a connection whose `request()`
queues per keyboard: one request is on the wire at a time. A request's
`matchResponse` decides which report answers it (byte 0 by default; Profile
Wire also matches its request ID, 1 to 255 per connection); a report that
matches nothing is set aside as unexpected.

The stale-reply rule: once a request may have reached the keyboard, an
ambiguous outcome (timeout, cancellation, failed write, malformed report, a
matcher that throws) ends the connection and fails everything queued.
Reconnect before retrying. Cancelling a request still queued removes only
that one. The exception is `softTimeout`, for background reads the caller can
miss: its timeout fails that request alone, and its late answer is set aside.

When nothing on the keyboard handles a request, firmware echoes it with byte 0
set to `0xFF`. `protocol/raw-hid-unhandled.js` takes exactly that echo of the
request just sent as a definite refusal (`UNHANDLED`) and keeps the
connection; any other `0xFF` report is never an answer.
(`tests/transport/transport.test.js`, `tests/protocol/raw-hid-unhandled.test.js`)
