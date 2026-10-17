# Profile capture and operation progress

The app contract behind
[D-L23](../LIVE_EDIT_APP_DIRECTION.md#d-l23--apply-shows-its-steps-and-a-failure-says-where-why-and-what-was-saved).
The [guide](../GUIDE.md#applying-changes) describes Apply for the person using
Ark; this specification owns capture integrity, progress correlation and
renderer updates. Firmware owns the wire and transaction contracts linked
below.

## Apply and read progress

`core/session/apply-progress.js` names the ten steps of an Apply and tracks
them forward only: check the keyboard, save a recovery copy, send the profile,
keyboard checks it, stage keys and macros on the slave half, copy the profile
to the slave half, save it on the master half, finish the slave half, write keys
and macros on the master half, check both halves. The master half is the one
connected over USB; the slave half is its partner over the split cable. These
roles do not imply left or right, and the Device screen explains them.
`restoreProfile()` reports at each real boundary with byte counts. A failure keeps its step, a reason from the
keyboard's own error (or the slave half's last answer), and whether anything
was saved. After the decision it says how the save ends. Ordinarily the
keyboard finishes it from the slave half's copy. When the candidate is (or
reads back as) `AUTHORITY_FAILED`, only a restart ends it: the message asks
for an unplug and replug, and says whether the master half types nothing
(VIA ACCEPT seen, or read back as queued, acknowledged, failed or rolled
forward), keeps typing (staged with nothing queued) or may type nothing (VIA
status unreadable), with that keyboard reason in place of the failed step's own.
The commit bar keeps a failed Apply on screen until dismissed.
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

## Complete captures and integrity

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
macro bank, including unused trailing bytes, remains freshly verified because
Apply compares the actual stored bank. The macro read map reconstructs
firmware-confirmed zero blocks and downloads every marked block; while the
keyboard reports the map unavailable (its storage not yet settled), the whole
bank is read. Portable progress names each read
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

## Candidate peer progress

Candidate status page 1 (see
[Profile Wire V1](../../upstream/firmware/docs/architecture/profile-wire-v1.md#candidate-operation-status))
reports the peer phase, transferred bytes and the peer's last split status. The
host counts its movement as progress while the keyboard is `PREPARING_PEER`, so
a slow copy no longer runs into the stall window. Firmware without page 1
answers `UNKNOWN_PAGE` and keeps the old behaviour.

## Sparse VIA macro reads

When a keyboard implements optional Profile Wire GET `0x0c`, a complete capture
reads its macro map and storage identity, downloads marked 256-byte blocks,
reconstructs omitted blocks as zero, rereads the metadata and verifies the
canonical full VIA-store digest. The map must match the capture's initial
storage identity; the final profile, storage and settings checks stay in place.
Adjacent blocks share one transfer range. Progress counts bytes actually
transferred, and an empty bank completes with zero macro data exchanges.

A stale nonzero tail is included even when it belongs to no macro. The final
write-validity byte is included in the map and retains its incomplete-write
check. Unsupported or initially unavailable maps use the full-bank reader,
including clean nonzero VIA layout options written by another client;
malformed maps, later unavailability, changed identities and corruption fail
the read. Freshness and exact stored bytes are preserved for initial capture,
Refresh, Export, recovery and differential Apply. Storage and backup formats
stay unchanged. The firmware owns the
[wire contract](../../upstream/firmware/docs/architecture/profile-wire-v1.md#sparse-via-macro-read-map--get-value-0x0c),
imported from its published implementation.
