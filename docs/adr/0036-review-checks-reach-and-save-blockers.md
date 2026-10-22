# The review checks reachable layers and save blockers

Cited as D-L36.

A profile can lock a layer with nothing left to release it, and since the firmware has no timeout and no "clear all" key, only unplugging recovers; the keyboard accepts such a profile anyway, because the rules are the person's to break. So Ark says so before the draft is kept: `core/model/layer-reach.js` walks every layer state the profile can reach from a keyboard at rest and reports traps, warnings and notices, `core/model/profile-checks.js` adds whole-profile findings, and each is shown as new, already on the keyboard, or fixed by the draft. An active trap or warning must be confirmed for the reviewed revision, and the host enforces that, not only the panel; a blocker, a value the destination keyboard would refuse, disables Apply. The walk and its limits are in [Timing, built-in branches and reachability](../architecture/timing-and-reachability.md).
