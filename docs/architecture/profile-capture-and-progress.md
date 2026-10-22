# Profile capture and operation progress

The app contract behind reading the keyboard
([D-L11](../adr/0011-current-state-comes-from-the-keyboard.md)), the draft
([D-L19](../adr/0019-one-whole-profile-draft-and-review.md)), Apply and its
progress ([D-L20](../adr/0020-differential-apply.md),
[D-L23](../adr/0023-apply-shows-its-steps-and-failures.md),
[D-L58](../adr/0058-transfer-less-validate-the-complete-saved-result.md)) and
the live edit modes
([D-L65](../adr/0065-live-and-review-edits-reach-the-keyboard-at-once.md),
[D-L66](../adr/0066-in-live-the-keyboard-saves-by-itself.md),
[D-L67](../adr/0067-a-stopped-keyboard-says-so-and-ark-restarts-it.md)).
The guide describes [Apply](../GUIDE.md#applying-changes) and
[the edit modes](../GUIDE.md#how-edits-reach-the-keyboard) for the person
using Ark. Firmware owns the [one-store transaction](../../upstream/firmware/docs/architecture/logical-profile-transaction-v1.md)
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
An ambiguous outcome keeps the recovery copy and never silently retries.
After an observed decision, firmware completes the same generation once both
halves are connected, and a failure after the decision says what ends it:
the keyboard finishing that generation by itself, or, when it reports lost
split authority (`AUTHORITY_FAILED`) or a concurrent commit, a USB replug.
Each half keeps a complete generation until activation. There is no VIA input
fence, staged bank, ACCEPT wait or host roll-forward to diagnose (firmware
D-F31), and Ark never claims that an input fence is holding keys. The commit
bar retains a failed Apply until dismissed.

If BEGIN answers BUSY while status flag 13 says a DPI or lighting key change
awaits publication, Apply waits within its firmware-aware budget for the flag
to clear before resubmitting BEGIN, and Apply progress shows the reason. The
reviewed-base identity check still runs after BEGIN acquires admission; a
changed base requires another review, never a silent overwrite (D-L66).

Transfer progress travels in separate `applyProgress` messages correlated to
the draft ID and revision. The service retains the latest view for snapshots;
progress updates only the commit bar, preserving the visible editor and local
forms. Connection, profile and busy-state changes still publish full models.
Upload progress separates prepared (`bytesSent`), uploaded (`bytesUploaded`)
and reused (`bytesReused`) bytes; chunk index and count describe actual host
data chunks, excluding reuse commands.

`readProgress` messages carry layout, profile or capture counters. They must
match operation ID, phase, device, connection token and draft ID/revision,
including an absent draft during initial reading. Late messages are ignored
once the operation ends. The service keeps counters for full snapshots;
individual replies never reconstruct a draft presentation model. Configure
editors retain their DOM when a full model changes only transient read status;
profile, vocabulary, permission, connection or form-reset changes redraw them.

## Where current state comes from

Ark parses no C file and reads no firmware or repository file at runtime;
`tests/layering.test.js` fails if a module under `core/`, `webview/` or
`web/`, or `extension.js`, names one. A keyboard with nothing saved still runs
its compiled defaults, which Profile Wire value `0x05` serves over the same
page layout as a saved payload. If the flashed firmware was built from other
data than a repository holds, Ark shows what is flashed. Compiled defaults are
labelled as such; generation 0 reads as no saved profile.

Compiled defaults are authored data in the firmware's keymap files: layer
names beside the layouts, each macro's name beside its payload, a combo's own
window on its row (`COMBO_WINDOW`), and LED groups in `rgb_config.c`. The
firmware's userspace only serves them. With nothing stored, the settings
readback reports those names and the combos run with those windows; saved LED
groups ride in the compiled RGB domain. A stored profile keeps its own.

Keyboard-definition data that no device command exposes ships with the app as
decoding data in `core/data/`: the vendored keycode catalog (D-L05) and the
Charybdis layout matrix. Neither carries configuration; they only decode what
the device sends.

Readback is tested through the posted model and rendered controls, not only
the byte decoders. Semantic links to native keycodes are enabled only for a
known action ABI advertised by the keyboard. Layer preview membership follows
the firmware: transparent and no-action keycodes are unmapped whatever their
alias. Every decoded `uint16` must encode back to its original value. Zero
timing values stay visible, with the unreported firmware default stated.
Recorded device bytes are test-only fixtures, never runtime data.

## Complete captures and integrity

Capabilities identify the firmware, including its version. There are no VIA
identity, layout, macro or RGB commands. Unsupported bases are read no further
than capabilities and receive the update notice.

A capture reads compiled defaults, the active saved profile when present,
effective native combos and settings through Profile Wire. Missing active
domains come from the keyboard's own compiled profile. Combos are taken as the
active profile stores them, its only durable owner (firmware D-F32); the
native combo readback only says whether the keyboard has combo hooks a
profile cannot hold, and stands in for a keyboard that stores no combos. It
is never re-encoded into the domain: a combo on a custom key or sending MO(5)
would come back as native keycodes, the same keys in other bytes, which an
Apply would write and Live + review would list as changes. The resulting complete
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

The Configure screens show the keyboard only after the complete read has
opened an editable draft. Independent reads stay available for diagnostics
after a failed snapshot, behind one loading state, and every screen menu is
disabled while the read runs. Afterwards Configure requires an editable draft,
Backups complete-profile support, and Keyboard a connected keyboard that
reported its capabilities.

`ProfilePayloadReader` belongs to one connection. Only bytes actually read
from a keyboard and verified may populate it. Compiled defaults are immutable
while the firmware runs: they are reused on the connection, and Reconnect,
which discards the reader, starts the next one from the copy the service last
verified, which a host may keep between runs (`compiledDefaults`; VS Code's
global state, the page's local storage). A kept copy must pass its own CRC32
and FNV, and is used only when the keyboard's fresh metadata names exactly it;
otherwise the defaults download. Refresh and Export download saved bytes
afresh. A live capture with nothing unsaved, while the keyboard runs the saved
record itself (active kind committed, the saved generation and origin), takes
the bytes it just read of what the keyboard runs as the saved profile once
they pass the saved record's fresh metadata (length, CRC32, FNV); the keyboard
served them from that record's flash, so the read still checks it. With
unsaved edits it downloads the saved bytes. A metadata mismatch retries or
downloads afresh and both hashes remain required. Authored target bytes never
seed the reader.

A reviewed capture may serve as the recovery base only after a fresh profile
and settings identity check. Apply saves its recovery copy before any mutation,
checks the identity again under the candidate lease, and reuses exact active
bytes only when their digest matches that identity; the transfer itself is
[candidate transfer](#candidate-transfer). BEGIN bytes 24–31
are zero. Commit publishes one new generation, confirmed by transaction,
digest, local committed/active identity and peer identity when visible. A
lost peer link after firmware confirmed its record does not invalidate an
already active target; Ark reports that the peer is out of sight.

After Apply, the editor reads the configuration again while it stays visible
and busy (`rereadKeyboard`). This readback is separate from the eight
transaction steps. Its layout step downloads the saved bytes afresh, the read
of what was stored; the profile step right after reuses them through the
reader's `reuse` (fresh metadata before and after, both hashes) and downloads
on any difference. A later
read or export gets the generic operation bar rather than an old finished
Apply. No automated check establishes physical interruption acceptance.

## Candidate transfer

Apply requires a build that saves (Profile Wire feature bit 1); current
firmware's candidate reuse and streaming come with it (firmware D-F18). Apply
plans the candidate against the exact raw active profile the snapshot
retained, not the backup document's materialized live settings. Domains are
aligned by identity, so resizing one keeps unchanged later ones reusable.
Firmware copies unchanged ranges into its inactive candidate (REUSE, naming
the source's kind, origin, generation, CRC32 and FNV digest); the host streams
short or changed ranges. A missing or mismatched source streams the whole
profile. Compiled defaults are an origin-independent reuse source: the status
page's unused origin becomes REUSE's sentinel `255`, with generation zero.
Committed sources keep their reported generation and physical origin. The
captured status and stale-base identity are unchanged by that translation.

Streaming admits at most four host chunks before a completion check, still
through the serialized connection. A check proves the admitted prefix's exact
transaction, target digest, length, next offset and operation-sequence
advance. BUSY drains that prefix before retrying the definitely unadmitted
suffix. A lost reply stays ambiguous and is never retried blindly. Firmware
validates the complete candidate and publishes one new generation on both
halves; recovery copies, stale-base checks, verification and the fresh
post-Apply readback stay required. Refresh and Export remain independent
integrity reads. No app-authored, reconstructed or edited bytes seed the
payload reader's verified-read cache; a proven Apply result may keep its raw
target only as the next differential upload's source.

The compatibility bridge (`tests/integration/run_candidate_transfer_tests.sh`)
exercises Ark's uploader against firmware's production candidate transaction,
dual-slot backend and whole-profile validator, including a corrupted source,
in normal and sanitizer builds. Its scheduling is simulated: fewer bytes or
exchanges there establish no keyboard timing or physical acceptance, and the
probe ends at validation. Firmware's own host suites cover committed reuse
through the production owner, both-half saving and reboot. No host test proves
hardware acceptance.

## The draft

A complete snapshot seeds one window-local draft: a single profile blob with
all seven domains
([D-L15](../adr/0015-a-backup-is-the-complete-effective-configuration.md)),
of which editors use decoded domain views. Every editor, import and layer
edit updates it, with one undo history
(`core/session/profile-draft-session.js`). Each frozen history entry holds its
document, edit origin, label, time and layer order together; branching and
trimming move the whole entry, and its document keeps its cached decode. In
Apply mode keeping a form changes only the draft and writes nothing to the
keyboard.

An incomplete form, such as a new combo before it has an output and two
inputs, keeps its own state outside the draft until it is kept; it survives
keeping another area and reading the keyboard again. An undo, redo, history
jump, discard, rebase, Apply, import, another keyboard or the demo replaces
the draft under the forms and starts each form again from the model
(`STATE_FIELDS` in `webview/store.mjs`).

Apply requires the exact reviewed draft revision and the matching connected
keyboard; draft revisions are never device generations. A change on the
keyboard keeps the draft and makes it stale, which blocks Apply; **Review
against the keyboard** compares it with a fresh read and never merges
silently. A failed snapshot leaves independent diagnostics and opens no
editable draft and no complete backup. Export writes what the keyboard runs,
not unapplied changes. Closing the editor loses the draft.

In Live + review and Live the same draft is the keyboard's working copy: its
history moves only when the keyboard confirms an edit, review compares it
with the saved profile, and Save replaces Apply (in Live the keyboard saves by
itself). The rules for review, checks and recovery copies hold in every mode.

## Live reads, edits and Save

How edits reach a keyboard is stored on it (Profile Wire `0x27`) and read
with its capabilities (D-L65, firmware D-F32). Apply keeps the draft, review
and Apply above. Live + review, the mode of a keyboard never set, and Live
open the draft on the keyboard's working copy. The modes share the draft
model, review, checks and history, and differ in when an edit reaches the
keyboard and what makes it permanent; the
[guide's table](../GUIDE.md#how-edits-reach-the-keyboard) says what a replug
does in each. An Apply-mode keyboard still running unsaved edits (left by
another client) opens as Live + review, since only Save or Revert can settle
them. If reading the mode fails on firmware that has one, Ark keeps to
Apply's reads and reads the mode again at the next status refresh or read.

### Reading a live keyboard

A keyboard not in Apply mode (or one still running unsaved live edits) is read
as a pair (D-L65, firmware D-F32): the edit status (GET `0x20` page 0), the
working copy through GET `0x21` with its session and revision, read twice
around its bytes, and the saved profile it began from, GET `0x04` with the
generation and origin the edit status names, or the compiled defaults over
generation 0. While the edit status's phase is not idle (an edit still being
received, checked or waiting for a safe boundary, such as a held key) the read
polls page 0 and starts only once it is idle; past 600 polls 50 ms apart it
fails `LIVE_EDIT_PENDING` and the draft stays to be read again. The edit
status is read again after the combos and toggles (pages 0–3, so the read also
carries the keyboard's own saves and flags); a phase that is not idle, or a
different session, revision or saved generation, refuses the read as
`PROFILE_CHANGED`. Flag bit 11 (the other half refused the working copy) is
kept as the draft's "halves apart". Both documents are materialized from
stored bytes alone (no settings or combo readback overlay), and the working
copy's exact bytes are kept: a live edit's splices are computed against them.

A read that finds the same working copy keeps the draft's history, also over
a new connection: the keyboard vouches for it by its session and revision.
Anything else (another client, a restart, a Save elsewhere) starts the history
again from what the keyboard has, with no provenance invented, and says so. A
replug boots the saved profile; the next read says the unsaved edits are gone.

### A live edit

Every posted edit, undo, redo, history jump, group discard, put back, import
and layer change computes its target document with the same editors as Apply,
then sends the difference: one splice per changed domain, covering only the
bytes between the common prefix and suffix, all in one revision (so a key swap,
or a custom key placed in the same step, stays one edit). The draft's history
moves only when the keyboard confirms the edit, and the edit shows as made on
both halves only once the other half holds the same revision. An edit too
large to stage beside the profile is sent as a whole replacement, which needs
nothing unsaved. A target that is exactly the saved profile, while the
keyboard holds a working copy, is sent as Revert: as an edit it would leave a
working copy identical to what is saved but reported unsaved, which Live would
save again as a new generation of the same bytes. The history records that
step as it would an edit.

Before sending, the edit's checks are compared with the working copy's: a new
trap or warning waits as a proposal the person sends anyway or drops; a new
blocker is refused.

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
after a refusal, when the master half resends the whole copy), or within the
save timeout (120 s, asked every 50 ms) while flag 6 says a save runs: in Live
the keyboard's own save starts 3 s after an edit and holds the profile for
seconds (about 6 s for a 6 KB profile), and an edit made then waits for it
rather than being lost; with flag 11 it stops at once (`LIVE_HALVES_APART`).
When the halves are apart, Ark says they run different profiles and offers Revert in
place of Review and save, since Save and new edits are BUSY until a Revert or
an Apply. Anything else refused is reported and
the keyboard read again; STALE (the keyboard moved first, usually an
adjustment key) rereads and says the edit was not sent, without a failure; a
refusal Ark makes before sending (too large, halves apart) is not. A lost
answer ends the connection (the transport closes it on a timeout); the next
read shows whether the edit landed, and no edit is replayed. On every new
connection Ark reads page 0 and aborts an edit still being received (SET
`0x24` with its transaction id), which it never uses again on that connection;
an unaborted one would end by the keyboard's 15 s lease, last result ABORTED.

### Save and Revert

**Discard all** is Revert: the keyboard runs its saved profile again, one
history step that undo sends back while the saved profile has not changed.
Revert compares its confirmed saved generation and origin with the cached
base before using that base as the running profile. If either changed (another
client saved meanwhile), Ark rereads the pair and starts the history at the
actual saved profile; a failed read leaves the draft stale.

Save asks for the exact reviewed revision and a recovery copy of the saved
profile before it sends SET `0x25`, and confirms the review's traps and
warnings exactly as Apply does. The keyboard writes its working copy as a new
generation (candidate REUSE from the working copy, both halves, the same
power-loss guarantees as Apply). Edit status page 1 reports its progress and
outcome (the save's transaction, result and candidate error), and a quiet-wait
on either half (flags 9 and 10) or a held key is said as such. A refused save
leaves the working copy as it was. Revert (SET `0x26`) waits for the working
copy to be inactive. Neither uploads a candidate.

### Live: the keyboard's own save

In Live an edit follows the same path, trap question, undo and redo as in
Live + review (D-L66), but there is no Save and Ark starts no timer. The
keyboard starts saving after 3 s with no edit and no key held, with or without
Ark; the 3 s is that quiet interval, not a bound on possible loss. Holding a
key postpones the save, a failed automatic save leaves that revision unsaved,
and unplugging loses every edit since the last successful save, however long
ago that was.

Only edit status page 3 saying so (an automatic save of this revision and
generation, nothing unsaved) is shown as **saved by the keyboard**. What is
saved then moves to what runs while the history stays, so undo still sends an
edit back, and the keyboard saves that too. A failed automatic save (page 1's
last save failed after Ark's last edit) is shown with **Save again**, an
ordinary Save after a recovery copy that needs no review, since every edit was
checked before it was sent, or with Revert. An edit made while the keyboard's
own save holds the profile waits for it within the save timeout (above).

### Looking between edits

Between edits (D-L66) a live draft's panel reads edit status pages 0–3 about
once a second, only while no operation holds the keyboard and the draft is
current; a look that overlaps an edit is dropped. Both shells run the look
through the shared panel loop (`core/session/live-watch.js`,
`core/session/panel-loop.js`), and its timer never keeps a process alive. A
look is a background read: each of its requests waits 3 s, and an unanswered
one only skips that look, keeping the connection; its late answer is set
aside, never taken as another request's. Three unanswered looks in a row mean
the keyboard is lost, and it is followed back
([D-L62](../adr/0062-the-keyboard-is-named-in-its-profile.md)). User
operations keep their strict timeouts. The web page pauses looks while a
`<select>`'s native menu may be open (Chrome on macOS holds back a page's
input reports until it closes) and while the page is hidden
(`web/native-popups.mjs`). A press on the select moves focus to it, so the
control focused before blurs just after the press; that is not the menu
closing, only the select losing focus is.

The same session and revision with nothing unsaved and a new saved generation
is the keyboard's own save (page 3 says whether it was automatic). A revision
or mode Ark did not make (an adjustment key, another app) rereads the pair
above as news, not a failure, in every live mode. An edit refused STALE for
that reason says it was not sent, rereads, and asks the person to make it
again; it is never replayed on a state they have not seen. Under an Apply
draft the same look notes the keyboard's session, revision and saved
generation; when its keys changed what it runs and it saved that, Ark reads
the keyboard again as Refresh would (an edited draft then becomes stale). An
Apply keyboard opened live because it ran unsaved adjustments goes back to an
Apply draft once it has saved them.

An automatic reread rejected as `PROFILE_CHANGED` remains eligible on the next
poll, up to three failed captures per cycle. Success clears the retry state;
other failures or budget exhaustion leave the stale draft for Read keyboard.
The first Apply observation compares its saved generation and origin with the
successful capture, so a saved adjustment before that first poll is detected.

The look keeps the flags current in every live mode: flag 11 (the other half
refused the working copy) is **halves apart** with Revert (Save, and so
Live's own save, is refused); flags 9 and 10 (a save waiting for a quiet
keyboard on either half) say so; flag 12 (an edit mode not stored yet) marks
the switch, since a replug may bring the previous mode back; flag 13 (a DPI or
lighting key change awaiting publication) is shown on a live draft while it
waits.

### Switching edit modes

The keyboard refuses a mode change while it has unsaved edits. Leaving Live +
review with unsaved edits, for either other mode, asks Save or Revert first,
worded for that direction; entering Live or Live + review from Apply with a
draft asks Send live or Discard. The question lists the traps and warnings
Save or Send live confirms, as review does, so answering it is the
confirmation.

Send live keeps the Apply draft until the keyboard takes it. A refused STALE
edit returns an unsuccessful publication outcome through the proposal path,
and Send live reports success only for a confirmed publication. Otherwise Ark
tries to return the keyboard to Apply and keeps the original Apply draft even
if that return is refused; the kept draft stays stale over a live keyboard, so
it cannot post as a live edit, until the keyboard is back in Apply and read
again.

Leaving Live asks nothing. Ark first waits for a running save (page 1's save
phase, page 3's in-progress flag), then sends Save for the keyboard's current
pair, looking again after STALE or BUSY, bounded by the save timeout; the
other half's refusal (flag 11) ends it with the mode unchanged. Before each
explicit flush Save, Ark captures the actual saved profile, including when an
automatic save advanced it since the last snapshot, and obtains its recovery
copy; failure stops before Save or a mode change. The identity is checked
again after recovery, and a moved pair is retried within the same save budget.
A failure (recovery unavailable, halves apart, a failed save) leaves the mode
as it was and says why.

A mode answer is acknowledged once the keyboard reads it back; its write to
EEPROM follows when the keyboard is quiet, and while a write is owed after a
failure (flag 12) Ark says a replug may lose it. Halves that stored different
modes are settled by choosing the same mode again (**Settle** beside the
switch).

### Closing and losing the connection

In Live, closing Ark or the link dropping is not an error: the keyboard goes
on saving without Ark, and the web page asks before leaving only while an edit
is on its way. In Live + review the page asks while there are unsaved edits,
since a replug discards them (`leaving` in `web/web-host.mjs`). On reconnect
Ark reads what the keyboard kept and says whether the edits it knew of were
saved before a restart or lost since the last successful save. What the
keyboard said of its own saving (saved by the keyboard, saving, a failed save)
is shown only while it is connected; a lost keyboard is connected again by
itself (D-L62).

### Toggles a key turns off

The combos and behaviours toggles a key turns off are read beside their
stored masters (GET `0x22`), in every mode and again at every status refresh,
and shown as **turned off by key** where the master is edited. They never
enter the draft, review or backups. Export in Live + review writes what the
keyboard runs.

### A stopped keyboard

Edit status flag 14 (the master half stopped) or 15 (the slave half says it
did) is one state, **stopped** (D-L67; firmware D-F34,
[a stopped keyboard, and Restart](../../upstream/firmware/docs/architecture/profile-wire-v1.md#a-stopped-keyboard-and-restart)).
It outranks every other live state (halves apart, a failed save, an adjustment
pending, catching up): the rail says **Stopped saving · Restart**, the bar
**The keyboard stopped saving. Restart it to continue.** with Restart as its
only action, and a refusal the keyboard gives while its flags say so
(`LIVE_KEYBOARD_STOPPED`) ends with the same sentence instead of "not ready".

Restart (`core/session/keyboard-restart.js`) is a draft control bound to no
Apply, since a stopped keyboard's draft may be stale. With unsaved edits Ark
reads what the keyboard runs (GET `0x21`, or, if that read fails, the draft's
own copy of it, which is what Ark last confirmed), saves it as a recovery copy
exactly as Apply saves one, and restarts only once that copy is saved. It
sends the restart (SET `0x28`), expects the keyboard to drop off without
reporting an error, and follows the same keyboard back as after a rename
(D-L62), by serial number or else by its unchanged name. Once that keyboard is
read again, the kept edits go back unsaved as one live edit, a whole
replacement when too large for one: Live + review leaves them for review and
Save, Live's own save takes them. The notice says how the restart ended, then
what became of the edits.

When it goes wrong, Ark says what and names the recovery copy: firmware
without restart answers unhandled and nothing happens (unplug instead); a
slave half that did not acknowledge the restart rejoins by itself (firmware
D-F34), and Ark says to unplug if the halves still do not agree; a keyboard
that stops again at once has a fault in flash or firmware, and the edits are
not sent to it; a keyboard that does not come back is said at the wait's
bound.

Ark offers Restart only when the keyboard says it stopped and never restarts
it by itself. There is no capability check: firmware D-F34 adds no feature
bit (firmware D-F28), and firmware without restart never sets the flags, so
Ark never offers it there; one that answers SET `0x28` unhandled is told apart
above.

## Candidate peer progress

Candidate status page 1 reports phase, transferred bytes, safe-boundary waits
and the last split answer. Movement extends the no-progress budget during
`PREPARING_PEER`. Bounded cancellation, decided recovery and activation belong
to firmware. Removed GET `0x0c` macro maps and VIA staging values are never
requested; the current base is required rather than using an older fallback.

## Portable files

[D-L15](../adr/0015-a-backup-is-the-complete-effective-configuration.md)
owns Ark's version-5 JSON envelope: one complete base64 profile blob, with no
separate keymap or macro fields. Decoded domain views serve editors, review,
undo and layer rewrites. Exact active bytes retained for REUSE are separate
from that materialized effective document and never become a second authority.
