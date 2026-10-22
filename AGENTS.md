# Charybdis Ark — Agent Instructions

Ark edits the connected keyboard over Raw HID, in VS Code and as a web page.
It is a client of the keyboard, never of the firmware repository: the runtime
reads no firmware file (D-L11, held by `tests/layering.test.js`).

## How a change is made

Start with `git status --short`, and never reset, stage or commit work you
did not write.

Only Noah works on this repository. His private notes vault, `charybdis-notes`,
sits beside this repository's main checkout (from any worktree:
`"$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/../charybdis-notes"`).
It holds the work queue and the tools every change goes through. If it is
there, read its `AGENTS.md` before your first change in a session: **Every
agent, wherever it starts** and **Branches, landing and pushing** (a
`<type>/<slug>` worktree from `dev`, `verify`, a draft pull request with
`open-pr`, landing only on Noah's "land it", `release` alone moving `main`,
and saying what each command will do before asking for it). It never
overrides this file.

Without the vault: branch from `dev` as `<type>/<slug>`, run the checks below,
and open a pull request into `dev` on `NoahCLR/charybdis-ark`. Never push
`dev` or `main` directly, and push nowhere else. Noah lands and releases.

## Checks

Run targeted tests while working, then before handing back:

```sh
npm run check                 # syntax, strict types, every test
npm run keycodes -- --check   # the vendored catalog still reproduces
git diff --check
npm run preview               # interface changes: drive a new control to prove it posts
npm run test:browser          # interface changes
```

A wire, schema or codec change also runs the compatibility bridge
(`npm run test:compat`, Docker running). The vault's `verify` is the handoff
gate and runs all of these against the pins. Name the checks that ran and any
skipped; [Developing Ark](docs/development.md) has the rest.

## Guardrails no check covers

- Edit only this repository. Sibling checkouts (`charybdis-4x6`,
  `bastardkb-qmk`) may be read to understand firmware, never edited from an
  Ark task. Firmware decisions (firmware D-F…) change there, as firmware work.
- `upstream/` holds pinned imports; change them only as
  [`upstream/README.md`](upstream/README.md) says. Never change expected bytes
  to make a test pass.
- Never flash firmware or Apply a profile to verify a change, and coordinate
  before opening the physical keyboard. Unit tests never prove hardware
  acceptance.
- A product behaviour change updates `docs/GUIDE.md`, `README.md` when a
  capability changes, and the governing spec, in the same change. A lasting
  decision is an ADR (the next D-L number,
  [domain docs](docs/agents/domain.md)). Plans and known gaps live in the
  vault, never in `docs/`; pull requests never link or quote it.

## Where to look

- [`GLOSSARY.md`](GLOSSARY.md): the app's words, for code, text and docs.
- [`docs/adr/`](docs/adr/): decisions (D-L<n>); read those touching the area
  before changing behaviour or architecture.
- [`docs/spec/`](docs/spec/): contracts, such as the interface's; firmware's
  wire specs are under `upstream/firmware/docs/`.
- [`docs/architecture/`](docs/architecture/README.md): the layers, where new
  work goes, and the flows that cross them.
- [`CODING_STANDARDS.md`](CODING_STANDARDS.md): what review holds a change to.
- [`docs/development.md`](docs/development.md): setup, commands, the web
  build, trying a branch, pins, the compatibility bridge, CI and publishing.

## Agent skills

### Issue tracker

Issues live in the private work-queue vault beside this checkout, whose
`_agents/tracker.md` maps every tracker operation. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage roles are the vault's `status` and `kind` values. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the root. See `docs/agents/domain.md`.
