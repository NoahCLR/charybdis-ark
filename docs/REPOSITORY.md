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

### Working on Ark

Open this folder directly in VS Code. Use Node 26.10.0 (`nvm use` with the
checked-in `.nvmrc`), run `npm ci`, then `npm run check`. Press F5 with
**Run Charybdis Ark** to launch an Extension Development Host. No firmware
repository, QMK checkout, or multi-root workspace is required.

The root `.editorconfig` defines indentation and whitespace conventions.
Folder settings select VS Code's built-in JavaScript, JSON, HTML and CSS
formatters and the YAML extension for YAML; Markdown is not reformatted on
save. **Check Charybdis Ark** is available as the default test task. The
extension supplies its own **Charybdis Ark** status-bar button; the shared
parent workspace does not add a duplicate or a test button.

[`upstream/README.md`](../upstream/README.md) explains the imported test vectors,
protocol references and QMK catalog inputs. [`docs/REPOSITORY.md`](REPOSITORY.md)
records source provenance and the repository boundary.

For local firmware development, the active checkout is
`/Users/noah/dev/charybdis/charybdis-4x6`; see the
[workspace map](REPOSITORY.md#local-development-workspace). Agents can
inspect it while the app and its ordinary tests remain self-contained.

New contributors and agents should start with [AGENTS.md](../AGENTS.md) and the
[documentation map](../README.md), which defines reading order, document
ownership and where new plans or specifications belong.

### The code's layout

- `extension.js` — the VS Code surface: command, panel, message relay.
- `panel-html.js` — the panel's HTML shell, the only host file that knows
  webview URIs.
- `core/` — the device, with no host dependency, layered so imports point one
  way: `transport/`, `schema/`, `protocol/`, `model/`, `session/`, `data/`.
- `webview/` — the interface as browser ES modules, no build step. `lib/` and
  `view/` are pure and carry tests; `ui/` draws; `styles.css` is the design
  system.
- `tests/` — mirrors `core/`, plus the view modules and the payloads the
  interface posts.

The layer rules and where new work belongs are in [`AGENTS.md`](../AGENTS.md).
The application runtime must not read the firmware repository, and the webview
receives the model as a message rather than importing the core. Developer
inspection and the explicit compatibility tests may read selected firmware
checkouts; ordinary app checks remain self-contained.

### Commands

```sh
npm ci
npm run check           # syntax across the tree, then all tests
npm run preview         # build preview/model.json from the test fixtures
npm run preview -- --device  # …or from the keyboard that is plugged in, read-only
npm run preview -- --vscode  # also write preview/vscode-{dark,light}.html, as the panel renders
npm run probe:live-link # read-only enumeration of matching HID interfaces
npm run keycodes -- --check # verify the catalog against the local pinned QMK inputs
npm run keycodes           # regenerate from those same inputs
```

### Running it without a keyboard

F5 provides a separate development host without changing the installed link. The repo's `.vscode/launch.json` has *Run Charybdis Ark*, which
launches an Extension Development Host with a debugger attached.

To work on the interface without a keyboard, run `npm run preview`, serve this
folder (`python3 -m http.server 8972`) and open `preview/index.html`. The preview
stands in for the extension host: it answers the webview's `ready` with one
fixture model and logs every edit the interface posts back.
Use `npm run preview -- --multiple --vscode` to inspect the selector with two
fixture keyboards in the VS Code themed preview.

### Compatibility with firmware

For protocol changes, run the separate [firmware compatibility check](COMPATIBILITY.md)
against explicit firmware, Ark and QMK checkouts before merging. UI-only work
continues to use the independent app checks.
Ark owns these integration runners under `tests/integration/`; they read the
selected firmware sources. Firmware's own tests and build require no Ark
checkout or app dependencies.

### CI and publishing

Development is verified locally, so CI does not run on `dev` or on pull requests
into it (D-L51). A release's `dev` → `main` pull request runs the independent app
suite on Linux and macOS, loads the native HID module, runs the browser smoke,
checks every imported source pin against its published trunk, runs the
[compatibility bridge](COMPATIBILITY.md) at the pins and judges the firmware
contract Ark will sit next to (`agreement`). Nightly, never blocking, CI checks
`dev` (app suite, browser, early-warning bridge and agreement with firmware
`dev`) and whether the published mains still agree. Reports are retained in
Actions.

`npm run test:browser` starts a fixture-only preview and drives a pointer-speed
edit, checking the complete posted settings section and the host stylesheet
cascade. Install its browser once with `npx playwright install chromium`.
The small host-style fixture covers known padding/cascade regressions; it is not
a VS Code extension-host or physical-device acceptance test.

The shared vault tools own publication: `verify` records a pass for the tested
tree and the pinned firmware and QMK commits; `land` merges the task's pull
request for exactly the verified commit, with verify's summary in its message.
The installed pre-push hook
refuses direct pushes to `dev` and `main`. `release` prepares a release and
`release --publish` publishes it (below). They never apply a profile to the
keyboard.

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

### Protected main promotions

`main` moves only by the shared vault's `release`, so every `main` is a
released, tested stack. GitHub `main` requires a pull request and these checks,
including for administrators: `Promotion from dev`, and this repository's CI on
the promotion pull request itself: `check (ubuntu-latest)`, `check (macos-latest)`,
`browser`, `compatibility` and `agreement`. `Promotion from dev` accepts only
this repository's `dev` branch and a merge tree identical to that branch. Force
pushes and deletion are blocked. Promotions merge as merge commits, so the
promoted development history stays reachable; task pull requests into `dev` are
squashed.

`release` prepares a release: it decides from the agreement check whether Ark
releases alone, after firmware or together with it, lands Ark's version through
its own pull request, drafts the notes and opens the `dev` → `main` pull request.
`release --publish` waits for the required checks, re-checks agreement against
firmware's `main` as it is then (its prepared `dev` in a joint release), merges
the pull request for exactly the prepared `dev` head, tags it and publishes the
GitHub release. Direct `main` pushes are rejected by the local hook as well.
Normal task development reaches `dev` through task pull requests.

`dev` cannot be force-pushed or deleted on GitHub and accepts changes only
through pull requests, and published `v*` release tags cannot be moved or
deleted (rulesets without bypass). Merge commits take the pull request's title
and body, so a release's notes are its promotion's commit message.
