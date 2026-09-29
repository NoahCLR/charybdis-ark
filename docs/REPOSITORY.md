# Repository ownership and source provenance

Charybdis Ark is an independent VS Code extension repository. Its app core,
webview, tests, developer preview and keycode generation work from this checkout.
Firmware compilation, authored C profiles, hardware measurements and diagnostics
belong to the firmware repository.

## Local development workspace

On Noah's development machine the workspace is
`/Users/noah/dev/charybdis/charybdis.code-workspace`. Its folders are:

| Absolute path | Role |
| --- | --- |
| `/Users/noah/dev/charybdis/charybdis-ark` | Active app repository; make Ark changes here or in its task worktree |
| `/Users/noah/dev/charybdis/charybdis-4x6` | Active firmware/userspace repository owned by this project; current C implementation, tests and firmware docs |
| `/Users/noah/dev/charybdis/bastardkb-qmk` | Upstream QMK/Bastard Keyboards checkout and build dependency; inspect its behavior without treating it as our app or userspace source |
| `/Users/noah/dev/charybdis/builds` | Build artifacts via a local symlink, not source |
| `/Users/noah/dev/charybdis/charybdis-notes` | Work-queue Obsidian vault (private `NoahCLR/charybdis-notes`): notes, tasks, active plans and keyboard checks for all three repositories; its `AGENTS.md` governs claiming and status |

From the main Ark checkout the firmware and QMK paths are also
`../charybdis-4x6` and `../bastardkb-qmk`. These relative paths do not necessarily
hold inside a task worktree. For discovery on this machine, use:

```sh
git -C /Users/noah/dev/charybdis/charybdis-4x6 status --short
git -C /Users/noah/dev/charybdis/charybdis-4x6 worktree list
git -C /Users/noah/dev/charybdis/charybdis-ark worktree list
```

Use the worktree selected for the task when one is specified. Do not infer that
the main checkout contains another agent's branch. On another machine, consult
its workspace file or supplied checkout paths and verify the repository roots;
do not hardcode these machine-specific paths into app code or ordinary tests.

For **current firmware development**, read the actual firmware checkout's
`AGENTS.md`, `docs/LIVE_EDIT_APP_DIRECTION.md`, relevant specs under
`docs/architecture/`, and implementation under `users/noah/`. It may contain
uncommitted work: report the revision and dirty state when comparing behavior.
Developer read-only inspection is allowed and does not couple the application
runtime to firmware source. Sibling edits still require task scope to cover
them; preserve concurrent work.

For **the app's pinned compatibility baseline**, use this repo's `upstream/`
snapshots and manifest. They are not the current firmware checkout and may lag
ongoing development. Do not call them the latest firmware docs or regenerate
them merely because the sibling has changed. Review differences deliberately
and use the explicit compatibility bridge to test selected working copies.

## Extraction provenance

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
The extension identity is `noah.charybdis-ark`; the checkout's path does not
identify device profiles or recovery files. Recovery files saved under the
former identities `noah.charybdis-live` and `noah.charybdis-live-v2` are copied
into Ark's storage on start (D-L47).

Normal tests use injected HID adapters. `npm run probe:live-link` additionally
loads the native HID module and enumerates matching devices without opening or
writing them. A successful enumeration is not an Apply/recovery hardware test.
The GitHub workflow runs app checks, catalog verification, preview generation
and native module loading; it contains no publishing job.

For a local installation, check the extension symlink points at the intended
Ark checkout. F5 can test a worktree without retargeting that installed copy.
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
