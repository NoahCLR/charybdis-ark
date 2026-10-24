# A live edit held for released keys waits for the release

Cited as D-L69.

The keyboard takes a live edit or Revert only at a safe boundary, when no key, lock, modifier, one-shot or other intent is held, and holds it until then without a limit (firmware D-F32, live-edits.md "Checking and publishing"). Ark waits for it the same way: while the edit status reports Ark's own transaction waiting for a safe boundary (phase 4, or 5 for a Revert, with flag 8), there is no time limit, and the panel says what to let go of from edit status page 2. **Cancel edit** aborts a held edit, which the keyboard allows before publication; a held Revert cannot be aborted, so it only waits. Other edits are refused as busy meanwhile, in the same words. The 5 s limit stays for loading and checking, and for the moments either side of the wait. A read that finds exactly Ark's edit published (one revision on, its transaction the last, the bytes it sent) confirms it as that edit's step rather than starting the draft history again. The flow is in [A live edit](../architecture/profile-snapshot-and-progress.md#a-live-edit).

## Considered options

A longer limit (30 s, as a read waits): rejected, because the keyboard does not give up, so any limit only turns an edit that is about to land into a "Failed" that it then contradicts, and a person holding a layer key can hold it longer. Ark queueing further edits behind the held one: out of scope; one edit at a time keeps the draft equal to what the keyboard confirmed (D-L65).
