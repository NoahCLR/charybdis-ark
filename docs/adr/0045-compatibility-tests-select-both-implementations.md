# Compatibility tests select both implementations explicitly

Cited as D-L45.

Ark's cross-language runners in `tests/integration/` check its codecs against the firmware's own C, so the developer-only bridge (`npm run test:compat`) takes explicit firmware, Ark and QMK Git roots and records their revisions, dirty state and results, never borrowing an adjacent checkout and never becoming a dependency of ordinary app checks. Protocol changes run the bridge before merging; UI-only changes use the independent suite. A development pin may name any committed firmware revision, but a pushed pin must be on firmware's `dev` trunk, which `--publish` enforces, and since firmware `main` moves only by promotion merges of `dev`, a published pin stays reachable from both. See [the compatibility check](../development.md#the-compatibility-bridge).
