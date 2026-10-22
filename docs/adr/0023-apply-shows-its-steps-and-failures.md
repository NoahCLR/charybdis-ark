# Apply shows its steps, and a failure says where, why and what was saved

Cited as D-L23.

Apply and the reads after it show the steps they are actually in, and a failed Apply keeps its step, the keyboard's reason and whether anything was saved, including what ends it: the keyboard finishing the same generation by itself once both halves are connected, or a replug when the halves stopped agreeing. A slow or failed save is then explainable, and acting on it is safe, without progress traffic changing the draft or the visible editor. The contract is [Profile capture and operation progress](../architecture/profile-capture-and-progress.md); the steps are named in `core/session/apply-progress.js`.
