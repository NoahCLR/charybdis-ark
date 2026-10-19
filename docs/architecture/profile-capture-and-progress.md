# Profile capture and operation progress

The app contract behind
[D-L23](../LIVE_EDIT_APP_DIRECTION.md#d-l23--apply-shows-its-steps-and-a-failure-says-where-why-and-what-was-saved).
The [guide](../GUIDE.md#applying-changes) describes Apply for the person using
Ark. Firmware owns the [one-store transaction](../../upstream/firmware/docs/architecture/logical-profile-transaction-v1.md)
and [Profile Wire](../../upstream/firmware/docs/architecture/profile-wire-v1.md).

## Apply and read progress

`core/session/apply-progress.js` names eight steps, moving forward only:
check the keyboard, save a recovery copy, send the profile, keyboard checks
it, copy the profile to the slave half, save it on the master half, finish
the slave half, check both halves. Master means the half on USB; slave its
partner over the split cable. Progress follows actual firmware states, so a
state completed between polls need not be displayed as active.

A failure keeps its step, the keyboard's reason (or the peer's last answer)
and what was saved. A confirmed pre-decision cancel means nothing was saved.
An ambiguous outcome keeps the recovery file and never silently retries.
After an observed decision, firmware completes the same generation once both
halves are connected. `AUTHORITY_FAILED` requires a USB replug; each half
keeps a complete generation until activation. There is no VIA input fence,
staged bank or host roll-forward to diagnose. The commit bar retains a failed
Apply until dismissed.

Transfer progress travels in separate `applyProgress` messages correlated to
the draft ID and revision. The service retains the latest view for snapshots;
progress updates only the commit bar, preserving the visible editor and local
forms. Connection, profile and busy-state changes still publish full models.

`readProgress` messages carry layout, profile or capture counters. They must
match operation ID, phase, device, connection token and draft ID/revision,
including an absent draft during initial reading. Late messages are ignored
once the operation ends. The service keeps counters for full snapshots;
individual replies never reconstruct a draft presentation model. Configure
editors retain their DOM when a full model changes only transient read status;
profile, vocabulary, permission, connection or form-reset changes redraw them.

## Complete captures and integrity

Capabilities identify the firmware, including its version. There are no VIA
identity, layout, macro or RGB commands. Unsupported bases are read no further
than capabilities and receive the update notice.

A capture reads compiled defaults, the active saved profile when present,
effective native combos and settings through Profile Wire. Missing active
domains come from the keyboard's own compiled profile. The resulting complete
blob has all seven domains once. Keymap `0x60` v1 carries all 16 × 60 matrix
positions as little-endian uint16 values, including the four unwired positions;
the visible layout projects the geometry in `core/data/charybdis-layout.js`.
Macros come from domain `0x70` v1. Base lighting comes from the captured
settings scalars 21/22; brightness is absolute HSV, never scaled by a limit.
Keyboard options, effect inventory, brightness limit and host metadata retain
their separate Profile Wire editor reads.

Profile payloads are checked against their metadata CRC32/FNV and active
status identity: generation, digest and, for a saved record, origin half.
Independent layout and domain reads use the same rule and recheck active
status after downloading. An active compiled profile always uses compiled
bytes, even with a newer saved record. If the running saved record cannot be
retrieved, the layout is unavailable; the latest committed record never
stands in for it. Macros and every other editable area come from the coherent
capture and remain unavailable when it fails. Settings are read coherently and checked again before the
final status read. Both halves must be converged, with no preview, candidate
or conflict during an ordinary capture. A changed identity refuses the capture.
One capture supplies the editable layout, domains, macros, base RGB and backup;
a failed capture leaves independent diagnostics but opens no editable draft.

`ProfilePayloadReader` belongs to one connection. Only bytes actually read
and verified may populate it. Compiled defaults may be reused on that
connection; initial saved reads, Refresh and Export download saved bytes afresh.
A metadata mismatch retries or downloads afresh and both hashes remain
required. Reconnect discards the reader. Authored target bytes never seed it.

A reviewed capture may serve as the recovery base only after a fresh profile
and settings identity check. Apply saves its recovery copy before any mutation,
checks the identity again under the candidate lease, and reuses exact active
bytes only when their digest matches that identity. Missing or mismatching
source bytes cause full upload. Candidate transfer keeps bounded batches and
differential REUSE; firmware validates the entire result. BEGIN bytes 24–31
are zero. Commit publishes one new generation, confirmed by transaction,
digest, local committed/active identity and peer identity when visible. A
lost peer link after firmware confirmed its record does not invalidate an
already active target; Ark reports that the peer is out of sight.

After Apply, the editor reads the configuration again while it stays visible
and busy. This readback is separate from the eight transaction steps. A later
read or export gets the generic operation bar rather than an old finished
Apply. No automated check establishes physical interruption acceptance.

## Live + review reads, edits and Save

Revert compares its confirmed saved generation and origin with the cached
base before using that base as the running profile. If either changed, Ark
rereads the pair; a failed read leaves the draft stale. An unsuccessful Send
live keeps the original Apply draft even if returning to Apply fails; it stays
stale over a live keyboard, so it cannot post as a live edit.


A keyboard not in Apply mode (or one still running unsaved live edits) is read
as a pair (D-L65, firmware D-F32): the edit status (GET `0x20` page 0), the
working copy through GET `0x21` with its session and revision, read twice
around its bytes, and the saved profile it began from, GET `0x04` with the
generation and origin the edit status names, or the compiled defaults over
generation 0. While the edit status's phase is not idle (an edit still being
received, checked or waiting for a safe boundary) the read polls page 0 and
starts only once it is idle; past 600 polls 50 ms apart it fails
`LIVE_EDIT_PENDING` and the draft stays to be read again. The edit status is
read again after the combos and toggles; a phase that is not idle, or a
different session, revision or saved generation, refuses the read as
`PROFILE_CHANGED`. Flag bit 11 (the other half refused the working copy) is
kept as the draft's "halves apart". Both documents are materialized from stored bytes alone
(no settings or combo readback overlay), and the working copy's exact bytes
are kept: a live edit's splices are computed against them.

A live edit is begin, splices, inserted data and commit, then edit status page
0 until this half's last finished transaction is the edit's and nothing is in
progress. Edit status page 2's active length must then equal the bytes Ark
records as the working copy (a splice edit's result, a replacement's own
bytes), else the keyboard is read again (`LIVE_EDIT_MISMATCH`). Then it waits
until the other half holds the same session and revision (3 s; past it the edit
runs on the master half and the rail says the slave half is catching up), or
stops at once when flag 11 says the other half refused it (halves apart).
BUSY at begin, Save or a mode change is retried for 3 s, or for 30 s while
the other half answers but does not yet hold the working copy (catching up
after a refusal, when the master half resends the whole copy); with flag 11
it stops at once (`LIVE_HALVES_APART`). Anything else refused, STALE included,
is reported and the keyboard read again; a refusal Ark makes before sending
(too large, halves apart) is not. A lost answer ends the connection (the
transport closes it on a timeout); the next read shows whether the edit
landed, and no edit is replayed. On every new connection Ark reads page 0 and
aborts an edit still being received (SET `0x24` with its transaction id),
which it never uses again on that connection; an unaborted one would end by
the keyboard's 15 s lease, last result ABORTED.

Save asks for the exact reviewed revision and a recovery copy of the saved
profile before it sends SET `0x25`; edit status page 1 reports its progress and
outcome (the save's transaction, result and candidate error), and a quiet-wait
on either half (flags 9 and 10) or a held key is said as such. A refused save leaves the working copy as it was.
Revert (SET `0x26`) waits for the working copy to be inactive. Neither uploads a
candidate.

## Candidate peer progress

Candidate status page 1 reports phase, transferred bytes, safe-boundary waits
and the last split answer. Movement extends the no-progress budget during
`PREPARING_PEER`. Bounded cancellation, decided recovery and activation belong
to firmware. Removed GET `0x0c` macro maps and VIA staging values are never
requested; the current base is required rather than using an older fallback.

## Portable files

[D-L15](../LIVE_EDIT_APP_DIRECTION.md#d-l15--a-portable-profile-is-the-complete-effective-configuration)
owns Ark's version-5 JSON envelope: one complete base64 profile blob, with no
separate keymap or macro fields. Decoded domain views serve editors, review,
undo and layer rewrites. Exact active bytes retained for REUSE are separate
from that materialized effective document and never become a second authority.
