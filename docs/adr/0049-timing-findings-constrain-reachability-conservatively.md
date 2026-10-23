# Timing findings constrain the reachability graph conservatively

Cited as D-L49.

Timing findings remove only proven-impossible branches from the layer graph and leave unknown paths possible, so the review never invents a trap but still finds locks with no escape. Warnings describe legal but risky relationships, comfort notices never become validity rules or rewrite values, and a bounded check that cannot finish reports uncertainty rather than claiming a proof. Built-in branches and inherited defaults are resolved once, for the editor and the review alike. The contract and its limits are in [Timing, built-in branches and reachability](../architecture/timing-and-reachability.md); the [guide](../guide/review-and-apply.md#timing-checks) explains the findings.
