# Reading, applying and progress

How a read, an Apply and a live edit run through Ark's layers, and what holds
across them ([D-L11](../adr/0011-current-state-comes-from-the-keyboard.md),
[D-L19](../adr/0019-one-whole-profile-draft-and-review.md)). Firmware owns the
[one-store transaction](../../upstream/firmware/docs/spec/logical-profile-transaction-v1.md)
and [Profile Wire](../../upstream/firmware/docs/spec/profile-wire-v1/README.md).

## Who does what

- The shell (`extension.js`, `web/web-shell.mjs`) supplies recovery copies
  (each kept with what made it and the keyboard's name, which
  `core/session/recovery-copy.js` puts in its file name), file choosers, downloads, progress, a store for compiled defaults and, on
  the web, a sleep that tab throttling cannot slow.
- `core/session/panel-loop.js`, shared by both shells, hands each message to
  `routeMessage` (`core/session/panel-session.js`), runs `panel-controls.js` or `live-edits.js` and publishes
  the model with the session's outbox (notice, `resetDraftForms`).
- `core/session/profile-device-service.js` owns the connection: one operation
  at a time (`runOperation`, else `SERVICE_BUSY`), each failure recorded in
  `snapshot().error`, every change published as `snapshot()`.
- Below it: `portable-profile-session.js` (Apply-mode snapshot, Apply),
  `live-profile-session.js`, `live-edit-coordinator.js` and
  `candidate-upload-coordinator.js`.
- `core/transport/request-coordinator.js` sends one request at a time; a
  timeout closes the connection, except for a background look (below).

## Complete snapshots and integrity

`readKeyboard` (`panel-controls.js`) runs in this order:

1. List keyboards and connect; each connection gets a new `connectionToken`.
2. `refresh` reads capabilities; a keyboard not on the current base
   ([D-L64](../adr/0064-ark-supports-only-current-firmware.md)) is read no
   further. Then profile and candidate status, the edit mode, the toggles a
   key turned off (GET `0x22`) and edit progress. An edit the keyboard is
   still receiving is aborted, its transaction id retired.
3. `readKeyboardProfile` takes one snapshot: live (below) when the keyboard is
   not in Apply mode or still runs unsaved live edits, else `snapshotProfile`.
4. If the snapshot fails, the independent reads (`readLayout`,
   `readCommittedProfile`, `readBaseRgb`, `readCombos`) still run for
   diagnostics, and no editable draft opens.

`snapshotProfile` refuses a keyboard without its slave half, with unconverged
halves, or showing a preview, a pending candidate or a conflict. It reads
status, the compiled defaults, the active saved profile, native combos, the
settings twice and status again; any difference refuses the read as
`PROFILE_CHANGED`. `materializeProfile` (`core/model/portable-profile.js`)
then builds one seven-domain blob. Each domain comes from the active profile,
else the compiled defaults; settings come from the settings readback. Combos
come from the stored domain, their only durable owner (firmware D-F32). The
native readback stands in only when neither profile holds one, and refuses
combo hooks a profile cannot hold. Re-encoding it would turn a combo on a
custom key, or one sending `MO(5)`, into other bytes for the same keys, which
Apply would write and Live + review would list as changes.

A snapshot keeps two things apart. Its `document` is the materialized profile
that editors, review and backups use. Its `storage.profile` is the exact
active bytes, kept only as the next Apply's reuse source.

Every payload read (`core/protocol/profile-payload-v1.js`) reads metadata,
chunks and metadata again, retries when the metadata moved, and verifies
CRC32 and the FNV digest. A chunk shorter than the metadata said, or past its
end ("unknown page"), reads the metadata at once: a save that shortened the
payload mid-read retries the same way, and unchanged metadata is
`MALFORMED_RESPONSE`. The service then matches it to the active identity
(`payloadMatchesActive`: generation, digest and, for a saved record, origin
half) and reads status again. A keyboard running compiled defaults is read
from compiled bytes even when a newer saved record exists. GET `0x04` serves
the newest saved record, which may not be the one running; it never stands
in for it (`ACTIVE_PROFILE_UNAVAILABLE`).

`ProfilePayloadReader` (`profile-payload-reader.js`) belongs to one
connection, and only bytes read from the keyboard and verified enter it.
Compiled defaults cannot change while the firmware runs, so the reader reuses
them, and a new connection may start from the copy the shell kept, used only
when its CRC32 and FNV pass and the keyboard's fresh metadata names exactly
it. Saved bytes download afresh except for two reads bound to fresh metadata:
the profile step after Apply (`reuse`) and a live read with nothing unsaved
(`sameAs`). Authored or reconstructed bytes have no way in
(`tests/session/profile-payload-reader.test.js`,
`tests/session/active-profile-reads.test.js`).

## The draft

`observePortable` (`panel-session.js`) opens a `ProfileDraftSession`
(`profile-draft-session.js`) from a complete snapshot of an editable keyboard
and follows later snapshots. Its history holds up to 101 frozen entries, each
with its document, origin, label, time and layer order.

- The draft is bound to the device and `connectionToken` it was read over. An
  untouched draft follows the keyboard. One with edits stays, marked stale,
  when the connection changes or a read finds the keyboard changed; Apply
  then refuses until **Review against the keyboard** (`rebase`) compares it
  with a fresh read.
- Each edit message names `draftId` and the draft revision; an older one is
  refused.
- An incomplete form keeps its state in the interface until kept. When the
  draft is replaced under it (undo, redo, jump, discard, rebase, Apply,
  import, another keyboard), the session sets `resetDraftForms` and each field
  in `STATE_FIELDS` (`webview/store.mjs`) does what it declares.
- The draft lives only in the open session; when leaving the web page asks
  first is in the
  [interface contracts](../spec/interface-contracts.md#draft-binding-and-panel-controls).

## Apply

[D-L20](../adr/0020-differential-apply.md),
[D-L23](../adr/0023-apply-shows-its-steps-and-failures.md) and
[D-L58](../adr/0058-transfer-less-validate-the-complete-saved-result.md);
for the person, the [guide](../guide/review-and-apply.md#applying).

1. `DRAFT_ACTIONS.apply` (`panel-controls.js`) refuses blockers and
   unconfirmed traps or warnings before any recovery copy or HID write, in
   core and not only in the interface
   ([D-L36](../adr/0036-review-checks-reach-and-save-blockers.md)).
   `ProfileDraftSession.apply` requires the reviewed revision and the bound
   keyboard.
2. `restorePortableProfile` (service) refuses what the keyboard would: a
   brightness over its limit, an effect it lacks, an action placed where it
   cannot run (`profilePlacementProblem`).
3. `restoreProfile` (`portable-profile-session.js`) reuses the reviewed
   snapshot as its base only when the fingerprint matches and a fresh
   profile-and-settings identity read agrees; otherwise it reads a new one.
4. The shell saves a recovery copy of the base. No copy, no write.
5. `CandidateUploadCoordinator.upload` plans against the snapshot's exact
   active bytes (`candidate-transfer-plan.js`), aligning domains by identity
   so a resized domain keeps later ones reusable. BEGIN takes the firmware's
   store admission, and `verifyBase` reads the identity again under it. REUSE
   copies unchanged ranges, naming the source's kind, origin (`255` for
   compiled defaults), generation, CRC32 and digest. Changed ranges stream at
   most four chunks per confirmed batch; on BUSY the admitted part drains
   before a resend, and a lost reply stays ambiguous. A missing or mismatched
   source uploads everything. The firmware validates the whole candidate.
6. `commit` polls the candidate states. `CONVERGING_PEER` proves the commit
   decision; from there the firmware finishes the slave half and activation.
7. The final status must show the target digest committed and active, a newer
   generation, this transaction, no conflict and, when the slave half is
   visible, its matching generation. A slave half that dropped out after
   confirming is reported as out of sight. The draft resets to the result, and
   `rereadKeyboard` reads layout, profile (`reuse`), combos and base lighting.

`withFailure` pins a failure to its step, the keyboard's reason
(`failureReason`) and what was saved. Before the commit, or after a cancel the
keyboard confirmed, nothing was saved (`RESTORE_NOT_SAVED`). After the
decision the keyboard finishes the same generation once both halves are
connected, unless it reports `AUTHORITY_FAILED`, which only a replug ends.
Otherwise the outcome is unknown and the recovery copy is named; nothing
retries silently. Each half runs a complete generation until activation:
there is no input fence and no roll-forward by Ark (firmware D-F31). BEGIN
answered BUSY while a DPI or lighting key change awaits publication waits
within the status budget and says so; any frame waits while a live edit or
save holds admission.

`ApplyProgress` (`apply-progress.js`) names eight steps and only moves
forward, since polling can report an earlier phase late. Each view goes out
as an `applyProgress` message tagged with draft id and revision and is kept in
`snapshot().liveApply`; `webview/messages.mjs` takes it only for its busy
draft, never going back, and redraws only the bar. A failed Apply stays in
the bar until dismissed; a finished one shows only while its control runs.
Read counters go as `readProgress`, taken only when operation id, phase,
device, connection token and draft id and revision match, and never rebuild
an editor (`tests/view/messages.test.mjs`). Apply's order and outcomes are
held by `tests/session/portable-profile-session.test.js`; the compatibility
bridge (`tests/integration/run_candidate_transfer_tests.sh`) runs the uploader
against the firmware's candidate transaction and validator.

## Live reads, edits and Save

[D-L65](../adr/0065-live-and-review-edits-reach-the-keyboard-at-once.md),
[D-L66](../adr/0066-in-live-the-keyboard-saves-by-itself.md) and
[D-L67](../adr/0067-a-stopped-keyboard-says-so-and-ark-restarts-it.md);
for the person, the [guide](../guide/review-and-apply.md#edit-modes). The
keyboard stores its edit mode (firmware D-F32), and `refresh` reads it; when
it cannot, Ark uses Apply's reads until the next `refresh`. Live + review (the
mode of a keyboard never set) and Live open the draft on the keyboard's
working copy. All modes share the draft, review, checks and history.

### Reading a live keyboard

`snapshotLive` (`live-profile-session.js`) reads a pair. It waits for the edit
status to go idle (no edit being received, checked or waiting for a held key;
`LIVE_EDIT_PENDING` after 600 polls 50 ms apart) and for a running save,
the keyboard's own or Save, to end (status flag 6; `LIVE_SAVE_PENDING` after
as long). It reads the working copy (GET `0x21`; a page that no longer fits
reads its page 0 again, as a payload read does) and checks its session,
revision and saved generation, then the saved profile it began from (GET
`0x04`, or the compiled defaults over generation 0). With nothing unsaved and
the saved record running, the working copy's bytes serve as the saved bytes
once they pass that record's fresh metadata (`sameAs`). Combos, toggles and
the edit status follow. Any move refuses that read as `PROFILE_CHANGED` (a
saved profile that moved under every payload attempt, `GENERATION_UNSTABLE`,
counts too), and the pair is read again, three times in all, before the read fails
`PROFILE_CHANGED` ("kept changing"). In Live a rename restarts USB before the
keyboard's own save, so the follow-back read is where that save lands. Both documents come from stored bytes
alone (`materializeStored`, no readback overlay), and the working copy's
exact bytes are kept: every live edit is a splice against them.

`ProfileDraftSession.observeLive` keeps the history only while the keyboard
vouches for it (same session and revision, same saved and current
fingerprints), also over a new connection, or when it shows exactly the edit
Ark sent last (below). Anything else starts again from
the keyboard and says why: a new session is a restart, after which unsaved
edits are gone or were saved first (`restartedWithUnsaved`); a moved revision
is `changedElsewhere`. `follow` keeps the draft on the same keyboard listed
under a new device id after a rename, by its session.

### A live edit

Every posted edit, undo, redo, jump, group discard, put back, import and
layer change goes through `proposeLive` (`live-edits.js`):

1. The draft's own editors compute the target (`propose`, or `stepTarget`).
2. `checksAdded` compares its checks with what the keyboard runs: a new
   blocker is refused; a new trap or warning waits as a proposal the person
   sends or drops.
3. A target equal to the saved profile, while edits are unsaved, goes as
   Revert; as an edit it would leave an "unsaved" copy of the saved bytes,
   which Live would save as a new generation.
4. `LiveEditCoordinator.post` sends begin, one splice per changed domain, the
   inserted bytes and commit, as one revision. Splices that do not fit beside
   the profile are refused `LIVE_EDIT_TOO_LARGE`, except that an import, put
   back, Send live or restart put-back goes as a whole replacement when
   nothing is unsaved. It waits for this half to finish, checks the active
   length against the bytes it recorded (`LIVE_EDIT_MISMATCH`), then waits
   up to 3 s for the slave half: not yet is "catching up", a refusal is
   "halves apart".
5. Only then does `confirmLive` move the draft's history.

Loading and checking an edit get 5 s. An edit the keyboard holds for its safe
boundary (phase 4 with flag 8, Ark's own transaction in progress) waits with
no limit, since the firmware publishes it once nothing is held and never drops
it ([D-L69](../adr/0069-a-held-edit-waits-for-the-release.md)); the 5 s start
again once it moves on. While it waits the coordinator reads edit status page
2 each 50 ms and reports `{kind, reasons, cancelling}` through `onWaiting`; the
service publishes it as `liveWaiting`, and the panel model as `liveWait`, in
`heldWords` (`core/model/vocabulary.js`): "Let go of the held keys to finish
the edit", naming a key, a locked layer or pointer mode, a modifier or
one-shot, or a one-shot layer. **Cancel edit** (`abortLiveEdit`, registry
phase `within`, the one control the busy guard lets through) has the
coordinator send the edit's abort at its next look; aborted, `post` resolves
`cancelled` and the draft stays as it was. An edit published before that look
lands as usual, and the notice says Cancel edit came too late (`cancelTooLate`).
A refusal while it waits is no failure: the panel shows its words without
"Failed". Every other request meanwhile is
refused as busy in the same words. A Revert held the same way (phase 5) waits
alike, without Cancel edit: the keyboard answers its abort `BUSY`.

Once the keyboard has the edit whole, `onCommitted` gives the draft its
transaction (`expectLive`). If the edit's answer then fails (a lost reply, a
checking phase past its limit, the length tripwire), the next read that shows
exactly that edit published (same session, one revision on, the transaction
the keyboard finished last, the target's fingerprint, the same saved profile)
confirms it as the edit's step instead of starting the history again; in
Live, a saved profile that is exactly that edit is the keyboard's own save.

`sendWhenFree` retries a BUSY begin, Save, Revert or mode change for 3 s, 30 s
while the slave half is catching up, and 120 s while a save runs (Live's own
starts 3 s after the last edit). It stops at once when the halves are apart,
the slave half is absent or a half has stopped. A refusal reads the keyboard
again (`reread`); refusals that leave the working copy untouched (too
large, halves apart) need no read. STALE means the keyboard moved first,
usually an adjustment key: Ark reads again and asks for the edit again,
without a failure. A lost answer closes the connection; the next
read shows whether the edit landed, and no edit is replayed.

### Save and Revert

**Save** (Live + review) needs the reviewed revision, confirms traps and
warnings as Apply does and refuses blockers. The shell saves a recovery copy
of the saved profile; the keyboard then writes its working copy as a new
generation on both halves through the candidate path. A refused save leaves
the working copy as it was. **Discard all** is Revert, one history step that
undo sends back. When Revert's confirmed saved generation or origin differs
from the draft's, another client saved meanwhile, and Ark reads the pair
again instead of trusting its cached saved profile.

### Live, and looking between edits

In Live the keyboard saves 3 s after the last edit with no key held, with or
without Ark, which starts no timer. Save is refused until that save fails;
**Save again** then saves after a recovery copy, with no review, since every
edit was checked before it was sent.

`core/session/live-watch.js`, run by `panel-loop.js` for both shells, looks at
the edit status about once a second. It skips while an operation, an Apply or
a proposal holds the keyboard, and drops a look that raced one. A look is a
background read (`softTimeout`): a missed answer skips it and keeps the
connection, and the late reply is set aside; three misses in a row mean the
keyboard is lost and Ark follows it back (`keyboard-reconnect.js`,
[D-L62](../adr/0062-the-keyboard-is-named-in-its-profile.md)). The web page
pauses looks while a `<select>` menu may be open, since Chrome on macOS holds
back input reports then, and while hidden (`web/native-popups.mjs`).

- Same pair, new saved generation, nothing unsaved: the keyboard saved by
  itself. What is saved moves to what runs; the history stays.
- A revision, session or mode Ark did not make: Ark reads the pair again, as
  news.
- Under an Apply draft: a key adjustment the keyboard has saved is read again;
  the first look compares with the snapshot's saved generation and origin.
  Until then the draft keeps what the keyboard says of itself
  (`observeApplyStatus`) and publishes it as `draft.keyboard`, so the rail
  says an adjustment is pending in Apply too.
- A read refused `PROFILE_CHANGED` is retried, up to three times per draft.
- A live draft whose follow-back read failed that way stays bound to the old
  device id or connection. When the keyboard connected now names the
  draft's edit session, it is the same keyboard on the same boot: the draft
  follows it (`followSession`) and the look reads it again, within the same
  bound. Another session (another keyboard, or a restart) ends the retry. The follow-back itself says its read failed (`awaitReconnect` takes
  a read that is not ready as failed).
- A notice never carries a decoder's text: an answer that did not decode
  says so, and the diagnostics keep the detail (`failureWords`,
  `panel-controls.js`).

### Switching edit modes

`setEditMode` (`live-edits.js`) settles work first, as the keyboard refuses a
mode change with unsaved edits. Leaving Live asks nothing: `flush` waits for
a running save and, before each Save, reads the actual saved profile (an
automatic save may have moved it) and saves its recovery copy. Leaving
Live + review with unsaved edits needs Save or Revert. Entering a live mode
from a dirty Apply draft needs Send live (checks confirmed) or Discard; Send
live keeps the Apply draft until the keyboard confirms the edit; on a
refusal it tries to switch back to Apply and keeps the draft, stale until
read again. A failure leaves the mode as it was; after a change the draft
starts from a fresh read.

### A stopped keyboard and Restart

A stopped half outranks every other live state, and refusals then fail
`LIVE_KEYBOARD_STOPPED`. `restartKeyboard` (`keyboard-restart.js`) saves the
unsaved working copy (read, or else the draft's copy) as a recovery copy
first, and restarts only once it is saved. It then expects the keyboard to
drop off USB, follows it back, and `putBackAfterRestart` sends the kept edits
as one unsaved live edit. Ark offers Restart only when the keyboard says it
stopped.

## Backups

A backup is the snapshot's `document`
([D-L15](../adr/0015-a-backup-is-the-complete-effective-configuration.md));
its envelope is in [`core/README.md`](../../core/README.md#backups). Export reads the keyboard again
(`readPortableProfile`) and writes what it runs: the working copy in a live
mode, never the draft. A reviewed import becomes one draft edit (one live
edit in a live mode); on a keyboard with no editable draft it is written at
once through Apply's path, recovery copy first.
