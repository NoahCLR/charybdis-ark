# Live + review: edits reach the keyboard at once, Save keeps them

Cited as D-L65.

Firmware D-F32 gives the keyboard a working copy that runs unsaved edits, a Save and a Revert, and stores which edit mode a client uses. In Live + review, the mode of a keyboard never set, Ark opens its draft on that working copy: each edit is computed with the same editors as Apply and sent as byte splices, and the draft's history moves only when the keyboard confirms it. Save (after a recovery copy) makes the working copy permanent on both halves, and Revert or a replug brings back the saved profile, so edits still become permanent only through review. Apply and Live + review share one draft model, review, checks and history; the read, edit and Save rules are in [Live reads, edits and Save](../architecture/profile-capture-and-progress.md#live-reads-edits-and-save).

## Considered options

Ark keeping its own queue of unconfirmed edits so typing never waits for the keyboard: rejected, because a refusal would have to unwind the edits made after it, and the keyboard confirms an edit in a few reports.
