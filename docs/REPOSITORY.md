# Repository ownership and source provenance

Charybdis Ark is an independent repository for the VS Code extension and the
web page (D-L52). Its app core, webview, web host, tests, developer preview and
keycode generation work from this checkout.
Firmware compilation, authored C profiles, hardware measurements and diagnostics
belong to the firmware repository.

## Local development workspace

On Noah's Macs the checkouts sit side by side in one workspace folder
(`/Users/noah/dev/charybdis` on his main Mac, opened through
`charybdis.code-workspace`). A Mac has only the ones it works on. Its folders:

| Folder | Role |
| --- | --- |
| `charybdis-ark` | Active app repository; make Ark changes here or in its task worktree |
| `charybdis-4x6` | Active firmware/userspace repository owned by this project; current C implementation, tests and firmware docs |
| `bastardkb-qmk` | Upstream QMK/Bastard Keyboards checkout and build dependency; inspect its behavior without treating it as our app or userspace source |
| `builds` | Build artifacts via a symlink into iCloud Drive, not source |
| `charybdis-notes` | Work-queue Obsidian vault (private `NoahCLR/charybdis-notes`): notes, tasks, active plans and keyboard checks for all three repositories, and the tools; its `AGENTS.md` governs claiming and status |

From the main Ark checkout the others are `../charybdis-4x6` and so on. Inside
a task worktree, the workspace is the folder above the main checkout:

```sh
workspace="$(dirname "$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")")"
git -C "$workspace/charybdis-4x6" status --short
git -C "$workspace/charybdis-4x6" worktree list
git -C "$workspace/charybdis-ark" worktree list
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
The check workflow runs app checks, catalog verification, preview generation
and native module loading; it contains no publishing job. Publishing the web
page is its own workflow ([below](#publishing-the-web-page)).

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

For local firmware development, the active checkout is `charybdis-4x6` in the
workspace; see the
[workspace map](REPOSITORY.md#local-development-workspace). Agents can
inspect it while the app and its ordinary tests remain self-contained.

New contributors and agents should start with [AGENTS.md](../AGENTS.md) and the
[documentation map](../README.md), which defines reading order, document
ownership and where new plans or specifications belong.

### The code's layout

- `extension.js` — the VS Code surface: command, panel, and the host functions
  (dialogs, files, progress, toasts) the shared panel loop in
  `core/session/panel-loop.js` runs.
- `panel-html.js` — the panel's HTML shell, the only host file that knows
  webview URIs.
- `core/` — the device, with no host dependency, layered so imports point one
  way: `transport/`, `schema/`, `protocol/`, `model/`, `session/`, `data/`.
- `webview/` — the interface as browser ES modules, no build step. `lib/` and
  `view/` are pure and carry tests; `ui/` draws; `styles.css` is the design
  system.
- `tests/` — mirrors `core/`, plus the view modules and the payloads the
  interface posts.
- `web/` — the [web page](#the-web-build): its HTML, the browser host that
  does in a page what `extension.js` does in VS Code, what that host takes from
  `core/`, and the stand-ins the bundle uses in place of Node's `Buffer` and the
  native HID adapter. It may import `core/` (through `web/core.mjs`); the
  extension never loads it, and `webview/` never imports it.

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
npm run build:web          # build the web page into dist/web/
npm run web                # …then serve it at http://localhost:8975/
npm run check:site         # check dist/web/ is static files only, ready to publish
```

### The web build

The web version of Ark (D-L52) runs `core/` and the panel inside Chrome rather
than in VS Code. `npm run build:web` (`scripts/build-web.js`, esbuild) writes
the complete static site into the ignored `dist/web/`, ready to publish as it
is: `index.html` (from `web/index.html`); the page's host (`web/page.mjs`)
and `web/core.mjs`, the part of `core/` a browser host needs, with the code
they share in a chunk; the host's clock worker (`web/sleep-worker.js`);
`webview/app.mjs` with everything it imports; and `webview/styles.css`. Every
file but `index.html` carries a hash of its content in its name, so a new
release can never be served an old file. `index.html` names them itself, and
the version (`package.json`) and commit (git, or `ARK_COMMIT` in the
environment) the build came from. `_headers` (from `web/_headers`) is what
Cloudflare Pages sends with the page when it is [published](#publishing-the-web-page).
`dist/web-manifest.json`, beside the site rather than in it, lists the hashed
names for tests and tools; it is never published and the page never fetches it.
Each build empties the folder first. `npm run check:site`
(`scripts/check-static-site.js`) checks that `dist/web/` holds only what the
build writes, with no server code Pages would run.

To try the page, run `npm run web`: it builds, then serves `dist/web/` at
`http://localhost:8975/` (`scripts/serve.js`, a static server for this machine
only). Open that in Chrome or Edge; `localhost` is a secure context, so WebHID
works there as over HTTPS. Choose keyboard asks Chrome for the keyboard once;
after that the page reconnects to it on load. The page holds the keyboard as
the extension does, so close Ark in VS Code (and VIA) first. Recovery copies
saved while trying it live in that origin's storage
(`http://localhost:8975`), not in VS Code's.

The page carries its Content Security Policy in a `<meta>` tag, so it holds
under any server: scripts, styles and the worker from the page's own origin,
the panel's inline style attributes, and `connect-src 'none'`, so after it
loads the page makes no request at all. The policy is written once, as
`POLICY` in `scripts/build-web.js`; `_headers` sends the same policy with
`frame-ancestors 'none'`, which only works as a header.

The browser host (`web/web-host.mjs`) runs the shared panel loop over
`WebHidDeviceAdapter` and gives the panel an `acquireVsCodeApi` stand-in
(`web/panel-channel.mjs`) that, like VS Code, delivers every message later and
as a copy. Chrome opens its keyboard picker and file chooser only from a click,
and a message reaches the host only after the click has ended, so the stand-in
also shows the host each message synchronously, as a copy, while the panel's
click handler is still running: the host starts `navigator.hid.requestDevice()`
(or the file chooser) there, and the message that follows waits for what was
picked. The host holds a Web Lock for as long as the page is open, so a second
tab waits rather than connecting; warns on `beforeunload` while the draft has
unapplied edits or Apply runs; passes `core/` a `sleep` driven by a dedicated
worker, whose timers Chrome does not throttle in a background tab as it does the
page's; and keeps recovery copies in IndexedDB after asking for persistent
storage.

It is a separate output, not a step of the extension: the extension still runs
`core/` and `webview/` as they are, and `webview/` stays build-free source. No
module of `core/` is rewritten for the browser. Its `Buffer` is the `buffer`
package in the bundle (`web/buffer.mjs`), and `web/no-native-hid.js` takes the
place of `core/transport/node-hid-adapter.js`, so a browser host passes its own
device adapter. The build fails if node-hid, `vscode` or any Node built-in
would reach a bundle, or if a bundle takes any package but `buffer`. A browser
host needs a secure context (HTTPS or localhost) for the draft's
`crypto.randomUUID()`.

To export more of `core/` to a browser host, add it to `web/core.mjs`.
`npm run test:browser` builds it and checks it in Chrome: the bundle has to
decode and re-encode every profile fixture exactly as Node does, stage edits and
build the same panel model, and the bundled panel has to render that model and
post its edits. It then loads the built page with a fake `navigator.hid`
(`browser-tests/fake-hid.js`) whose keyboard is `tests/fixtures/fake-keyboard.js`,
a read-only simulated Charybdis answering in Node: Choose keyboard, a complete
read, an edit, an export, an Apply the fake refuses (which still leaves a
recovery copy to list and download), the theme, a reload that reconnects
without the picker, a second tab that is refused, a browser without WebHID, and
that no request went anywhere but the page's own files.

### Publishing the web page

`.github/workflows/publish-web.yml` publishes the page to Cloudflare Pages
whenever `dev` or `main` moves. It builds the page (`npm ci`, then the web
build, with `ARK_COMMIT` set to the pushed commit), runs the page's browser
tests (`web-page.spec.js` and `web-build.spec.js`) against exactly those files
(`ARK_WEB_BUILT=1` stops Playwright rebuilding them), checks they are static
files only (`scripts/check-static-site.js`), and only then uploads `dist/web/`
with Wrangler (`cloudflare/wrangler-action`, pinned to a commit) as
`pages deploy dist/web --project-name=charybdis-ark --branch=<dev|main>`. A
failed build, test or check publishes nothing, and the address keeps the page
it had. The project name is the workflow's `PAGES_PROJECT`.

| Branch | Where it goes |
| --- | --- |
| `dev` | a preview deployment, at `https://ark-dev.ncleroy.dev` (and `dev.charybdis-ark.pages.dev`), for testing |
| `main` | the production deployment, at `https://ark.ncleroy.dev` (and `charybdis-ark.pages.dev`) |

The workflow has `contents: read` only, never runs on pull requests, and
publishes one run at a time per branch (a newer push waits; an upload is never
cancelled). It is D-L51's one exception: it runs on `dev` pushes, and its tests
gate only the publish. Its job is not one of `main`'s required checks and is
deliberately not named like them. If `CLOUDFLARE_API_TOKEN` or
`CLOUDFLARE_ACCOUNT_ID` is missing, the run still builds and tests the page,
then fails at "Require the Cloudflare credentials", naming the missing secret:
a red run, rather than a green one that left the address on an old page.

`_headers` sends, for every file, the page's Content Security Policy with
`frame-ancestors 'none'`, `Permissions-Policy: hid=(self)`,
`X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`. `/` and
`/index.html` are `Cache-Control: no-cache`: the browser may keep the page but
asks for it again on every load (an unchanged page is a cheap 304), so a
release shows on the next load. `no-store` would add nothing but a full
download each time. Each hashed file gets
`public, max-age=31536000, immutable` by an exact rule of its own, which the
build writes for the files it wrote: a new page names new files, so it never
mixes with an old one's, and no file whose name stays the same is ever marked
immutable. Pages joins a header named by two matching rules, so nothing sets
`Cache-Control` under `/*`.

**One-time setup, before the first run (Noah):**

1. In Cloudflare, create a Pages project named `charybdis-ark` for direct
   upload, not a Git connection, with `main` as its production branch:
   `npx wrangler pages project create charybdis-ark --production-branch=main`,
   or in the dashboard Workers & Pages, Create, Pages, *Upload assets*. Any
   other name works if `PAGES_PROJECT` in the workflow says the same.
2. Add the custom domains `ark.ncleroy.dev` and `ark-dev.ncleroy.dev` to the
   project, under Custom domains, and wait for both to show Active (until then
   Pages answers 522). `README.md` gives the first. Then, in the `ncleroy.dev`
   zone's DNS, change the `ark-dev` CNAME's target to
   `dev.charybdis-ark.pages.dev` and keep it proxied. A branch's own domain
   works only through a proxied record in a zone on Cloudflare; with other DNS,
   or unproxied, it serves the production page instead.
3. Create an API token with only *Account, Cloudflare Pages, Edit*, for this
   account.
4. In GitHub (Settings, Secrets and variables, Actions), add the token as
   `CLOUDFLARE_API_TOKEN` and the account id (shown on the account's overview)
   as `CLOUDFLARE_ACCOUNT_ID`.

**Publishing by hand.** To publish `dev` or `main` again without a push, run
the workflow from the Actions tab (*Publish the web page*, Run workflow, pick
the branch) or with `gh workflow run publish-web.yml --ref dev`. Other branches
are refused. Without GitHub, from a clean checkout of the branch, run the same
steps locally and upload with Wrangler, logged in with `npx wrangler login`:

```sh
npm ci && npm run build:web
npx playwright test browser-tests/web-page.spec.js browser-tests/web-build.spec.js
npm run check:site
npx wrangler pages deploy dist/web --project-name=charybdis-ark --branch=dev   # or main
```

Locally Playwright rebuilds `dist/web/` before testing it; that is the same
build, as long as nothing changed in between.

### Trying a branch before it lands

`tools/branch-window/` is a second, separate VS Code extension
(`noah.charybdis-ark-branch`), a developer tool that is not part of Ark. Link it
once from the main checkout, then reload VS Code:

```sh
ln -s "$PWD/tools/branch-window" ~/.vscode/extensions/noah.charybdis-ark-branch-0.1.0
```

Its **Ark branch** button, beside **Charybdis Ark**, lists every Ark worktree
on a branch: the main checkout first, then the most recently committed. Picking
one opens a new window running that checkout's Ark, as F5 does but without a
debugger; the installed Ark keeps running unchanged in every other window.
Close the window to stop. It checks out and installs nothing: a branch is
listed while its worktree exists, with the modules `verify` installed there,
and disappears when `land` removes it. Detached worktrees (the tools' cached
pin checkouts) are not listed.

### Running it without a keyboard

F5 provides a separate development host without changing the installed link. The repo's `.vscode/launch.json` has *Run Charybdis Ark*, which
launches an Extension Development Host with a debugger attached.

To work on the interface without a keyboard, run `npm run preview`, serve this
folder (`node scripts/serve.js . --port 8972`) and open `preview/index.html`.
`preview/index.html?host=web` answers as the web page's host instead, with
its Choose keyboard, theme toggle, build line and recovery copies;
`?host=web-none` has no keyboard yet and `?host=web-unsupported` no WebHID. The preview
stands in for the extension host: it answers the webview's `ready` with one
fixture model and logs every edit the interface posts back.
Use `npm run preview -- --multiple --vscode` to inspect the selector with two
fixture keyboards in the VS Code themed preview, and `npm run preview -- --slots 32`
for the 32-slot pointing firmware (its compiled profile, with slot 12
configured too).

### Compatibility with firmware

For protocol changes, run the separate [firmware compatibility check](COMPATIBILITY.md)
against explicit firmware, Ark and QMK checkouts before merging. UI-only work
continues to use the independent app checks.
Ark owns these integration runners under `tests/integration/`; they read the
selected firmware sources. Firmware's own tests and build require no Ark
checkout or app dependencies.

### CI and publishing

Development is verified locally, so CI does not run on `dev` or on pull requests
into it (D-L51). The one exception is [publishing the web page](#publishing-the-web-page),
which builds and tests the page on each `dev` and `main` push before it
uploads it, and gates nothing else. A release's `dev` → `main` pull request runs the independent app
suite on Linux and macOS, loads the native HID module, runs the browser smoke,
checks every imported source pin against its published trunk, runs the
[compatibility bridge](COMPATIBILITY.md) at the pins and judges the firmware
contract Ark will sit next to (`agreement`). Nightly, never blocking, CI checks
`dev` (app suite, browser, early-warning bridge and agreement with firmware
`dev`) and whether the published mains still agree. Reports are retained in
Actions.

`npm run test:browser` starts a fixture-only preview and drives a pointer-speed
edit, checking the complete posted settings section and the host stylesheet
cascade, then checks [the web build](#the-web-build) in Chrome against Node
and the built page against a fake keyboard. Install its browser once with `npx playwright install chromium`.
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
