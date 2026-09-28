# Repository ownership and source provenance

Charybdis Live is an independent VS Code extension repository. Its app core,
webview, tests, developer preview and keycode generation work from this checkout.
Firmware compilation, authored C profiles, hardware measurements, diagnostics
and Profile Studio belong to the firmware repository.

The initial app source is `tools/charybdis-live/` from
[`NoahCLR/charybdis-4x6` at `624e7185b7b85876bab14c63ce3ce510c00bd5d1`](https://github.com/NoahCLR/charybdis-4x6/tree/624e7185b7b85876bab14c63ce3ce510c00bd5d1/tools/charybdis-live).
This repository starts with a new Git history. Earlier app history, including
its former `tools/charybdis-live-v2/` location, remains in that source repository.
The root LICENSE, product goal and direction were brought from the same commit;
the product documents are now maintained here. Existing D-L decision numbers
remain stable. Firmware decisions retained in the direction are context for
client behavior and do not transfer ownership of firmware implementation.

The imported inputs have individual source records and update instructions in
[`upstream/`](../upstream/README.md). Protocol specifications there are snapshots
of firmware-owned contracts. Code snippets and bare firmware paths inside them
refer to the pinned source repository. The app must follow device-advertised
capabilities and schema identities, not assume that a keyboard runs the pinned
source revision.

## Development and installation

Use Node from `.nvmrc`, run `npm ci`, then `npm run check` and
`npm run keycodes -- --check`. `npm run preview` builds the offline fixture UI.
Open this repository directly in VS Code and use its F5 launch configuration.
The extension identity remains `noah.charybdis-live`; the checkout's path does
not identify device profiles or recovery files.

Normal tests use injected HID adapters. `npm run probe:live-link` additionally
loads the native HID module and enumerates matching devices without opening or
writing them. A successful enumeration is not an Apply/recovery hardware test.
The GitHub workflow runs app checks, catalog verification, preview generation
and native module loading; it contains no publishing job.

For a local installation, check the extension symlink points at the intended
Live checkout. F5 can test a worktree without retargeting that installed copy.
Recovery files live under VS Code's extension-global storage, outside
both source checkouts. Preserve those files and profile backups during a switch.
The independent repo does not require changes to a shared workspace or to the
firmware project's active working tree.

## Verification boundaries

App changes require the app suite, relevant targeted tests and whitespace
checks. Changes to preview/setup also require fixture preview generation.
Imported data changes require catalog/hash checks as appropriate. Firmware
host tests, compilation and physical-device acceptance are separate integration
gates for coordinated firmware or protocol changes; see the upstream guide.
No test here may silently substitute an adjacent firmware or QMK checkout for
the pinned inputs.

The explicit [compatibility bridge](COMPATIBILITY.md) tests selected working
copies together; it is separate from the independent app suite.
