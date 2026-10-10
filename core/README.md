# Charybdis Ark Core

This is the app itself: everything except the VS Code shell and the webview.
It has no VS Code or webview dependency. Its layers — `data`, `transport`,
`schema`, `protocol`, `model`, `session` — import in one direction only; the
table is in [`../AGENTS.md`](../AGENTS.md) and `tests/layering.test.js`
enforces it.

## Reading the keyboard

`session/profile-device-service.js` enumerates matching interfaces, keeps
native paths and handles out of the webview, and reads what the keyboard says
about itself: VIA and firmware versions, the Profile Wire capability and status
pages, the layout, the committed profile, combos, macro banks, settings,
keyboard options and the base RGB effect. It publishes a sanitized snapshot;
`session/device-model.js` turns that into the `model` the webview renders, and
`session/panel-session.js` adds the draft and the panel's own state to it,
routes each message the webview posts, and runs the Rename & Reorder panel.
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

`protocol/via-layout-v1.js` reads the matrix through the existing 28-byte VIA
buffer-read path, then produces visible positions in the pinned layout order.
`session/profile-payload-reader.js` owns `ProfilePayloadReader`: verified byte
reuse behind a small interface. Its stateless protocol codec checks complete
metadata identities, retries coherent reads and verifies CRC/FNV. `ProfileDeviceService` owns one reader per connection;
`readKeyboardProfile` makes one coherent complete capture and uses its verified
raw layout, active payload and live combos for the editor as well as the draft.
It publishes completed data together; a failed capture falls back to independent
read-only diagnostics and keeps the edit gate closed. Normal committed reads
always fetch bytes, including initial reads, post-Apply readback and standalone exports. Compiled defaults
are immutable during a connection and use verified reuse; reconnect drops the
reader. No Apply target or portable document seeds it.

The complete portable read (`session/portable-profile-session.js`
`captureProfile`) takes lighting, behaviours and pointing from the running
profile, or from the compiled defaults (GET `0x05`) when nothing is committed,
and combos and settings from their own live readbacks. The compiled read
carries all five domains, but its combos are the authored ones and its settings
the immutable factory ones, so neither ever stands in for what the keyboard
runs, and no domain is taken twice. The retired legacy pointing-mode page
(GET `0x09`, feature bit 13) is never read.

Custom Profile Wire pages use one monotonically increasing nonzero request-id
sequence per connected session (wrapping `255` to `1`), so a delayed response
from an older request cannot satisfy a newer one.

## Editing and applying

Every edit is staged in `session/profile-draft-session.js`: a complete
portable profile (`model/portable-profile.js`) with undo and redo history, a
review built by `model/profile-review.js`, the checks of what the layers let
you reach from `model/layer-reach.js` (a trap has to be confirmed before
Apply), and staleness checks on every message (draft id, revision, and the base
the form was built from).

The macro inspector (`model/macro-input.js`, through `model/macro-editor.js`) shares
staging's codec and limits. `validateViaMacro` receives a correlated
`macroValidation` reply without an edit, toast or device call; only a subsequent
`updateViaMacro` stages anything. The domain edits themselves live in
`session/device-profile-edits.js` and
`session/key-behavior-edits.js`.

Apply goes through `session/portable-profile-session.js`: a recovery copy is
written before the first device write, the profile is staged on both halves
through the candidate mailbox (`protocol/profile-candidate-v1.js`,
`session/candidate-upload-coordinator.js`) and the peer VIA stage
(`session/logical-via-stage-coordinator.js`), and one generation is published.
Every candidate is schema 2.0 in logical store format 3 (`NR`), bound to the
VIA store generation and digest it publishes with: `candidateMetadataForBlob`
refuses a missing binding or a zero generation or digest before anything is
sent, and there is no custom-only format 0.
Staging never retries an ambiguous transport outcome, commit is
transaction/digest-correlated and idempotent across a lost acknowledgement, and
success is accepted only after a fresh status read reports the new generation
on both halves. A keyboard the app cannot open a draft for is read-only; the
host refuses edits rather than writing them directly.

## Byte formats

`schema/profile-blob-v1.js` encodes and strictly decodes the `NLP1` header and
its ordered domain envelopes, the four-byte semantic action values, and the
FNV-1a 32-bit and CRC32 helpers. It accepts schema 2.0 only; unknown domains
and retired domain versions are rejected. Complete snapshots use eight layers
and the current 32-slot action vocabulary, with no backup-upgrade chain (D-L54). The domain
codecs — `rgb-domain-v1.js`, `key-behavior-domain-v1.js`,
`combo-domain-v1.js`, `pd-mode-domain-v1.js`, `settings-domain-v1.js` — are
exact inverses of their decoders and enforce the firmware's limits. The RGB
byte contract is frozen in [`rgb-domain-v1.md`](../upstream/firmware/docs/architecture/rgb-domain-v1.md), a pinned firmware spec;
its firmware counterpart is `users/noah/lib/profile/schema/profile_rgb_v1.c`.
`schema/compiled-profile-v1.js` resolves expressions in the keyboard's
vocabulary (`KC_A`, `LT(1, KC_A)`, `PD_SLOT_0`, `VIA_MACRO_3`) to actions and
native keycodes, refusing any whose bits would land on another keycode.

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

`listDevices()` returns only the interfaces this page has already been allowed
to open (`getDevices()`) whose collections carry the Raw HID usage page and
usage. `requestDevice()` opens Chrome's picker filtered to all four
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
polls while reading and saving a profile (the candidate and VIA stage
coordinators, and the storage wait) take a `sleep(ms)` the host passes as an
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

When nothing on the keyboard handles a report, QMK answers with the request
echoed back and byte 0 set to `0xFF`. Every protocol module accepts exactly that
echo of its own request (`protocol/via-unhandled-v1.js`) and treats it as a
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
npm run check   # syntax across the tree, then every test
npm test        # the tests alone
```

The tests use Node's built-in runner and the fake adapter. Golden vectors are
read from the firmware repository's `tests/fixtures/` and the upstream
`keyboard.json` in `../bastardkb-qmk`, so the suite expects this checkout's
sibling layout; the app itself never reads either at runtime.
