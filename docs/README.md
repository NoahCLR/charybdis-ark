# Documentation map

Start at the root [AGENTS.md](../AGENTS.md) for development rules and
[README.md](../README.md) for installation, commands and current user behavior.
This map tells a new contributor what to read and where to write.

Looking for the firmware on disk? The active checkout on Noah's machine is
`/Users/noah/dev/charybdis/charybdis-4x6`. Start with the
[local workspace map](REPOSITORY.md#local-development-workspace) for current
source and worktrees; `upstream/` is the pinned baseline, not that checkout.

| Document | Responsibility | Read when |
| --- | --- | --- |
| [PRODUCT_GOAL.md](PRODUCT_GOAL.md) | Product promise and completion criteria | Understanding what the app should become |
| [LIVE_EDIT_APP_DIRECTION.md](LIVE_EDIT_APP_DIRECTION.md) | Product status, open issues and the app's D-L decisions; firmware decisions are pointers to the firmware direction | Changing behavior or architecture |
| [REPOSITORY.md](REPOSITORY.md) | Repository ownership, source provenance and environment boundaries | Starting in a new checkout |
| [COMPATIBILITY.md](COMPATIBILITY.md) | Explicit cross-repository integration workflow | Changing wire formats, schemas or shared codec assumptions |
| [core/README.md](../core/README.md) | Runtime data flow and adapter contract | Working in core or the extension shell |
| [upstream/README.md](../upstream/README.md) | Imported inputs, provenance and update procedure | Reading or updating firmware/QMK contracts |

## Where new documents belong

Extend an existing document when it already owns the subject. Use these
locations only when a new document is warranted; create directories as needed.

| Location | Content |
| --- | --- |
| `docs/architecture/<subject>.md` | App-owned technical contracts too substantial for the direction or core guide |
| `docs/<workflow>.md` | Contributor procedures, setup and integration workflows |
| `upstream/` | Imported source snapshots only, governed by its manifest and instructions |

Link new durable documents from this map or the document that governs them.
Keep one authoritative description of each rule; link instead of copying it.
Retain D-L identifiers when amending decisions. Do not introduce parallel
backlogs, dated review folders, agent diaries or completion reports in `docs/`.
Current product gaps belong in the direction's Open Issues; tasks and active
plans belong in the work-queue vault (`charybdis-notes`, see the
[workspace map](REPOSITORY.md#local-development-workspace)), not in `docs/`.

## Authority and evidence

The connected keyboard is the runtime source of truth. Local app documents
describe the client; imported firmware specifications describe the pinned
upstream revision. New app decisions cannot redefine a firmware wire contract.
Coordinate such changes with firmware and run the compatibility bridge.
Bare firmware paths in imported documents refer to the source repository, not
this checkout. Historical decisions are context, not evidence of current
hardware behavior.

Generated previews belong in ignored `preview/`. Compatibility reports belong
outside the three tested checkouts, as required by the bridge. Put verification
commands/results in commit messages and handoffs. Physical measurements remain
owned by the firmware project's measurement procedures; link their evidence
rather than inventing acceptance claims or duplicating raw captures here.

## Handoff to another agent

An agent can start from this repo with AGENTS, this map and the task request;
no prior conversation is required. Check Git status before assuming a baseline:
uncommitted and untracked files are available in this working directory but
will not appear in a fresh clone or worktree. Preserve them until their owner
commits or explicitly transfers them. Protocol work uses Ark-owned integration runners against the selected
firmware source; keep those build recipes aligned with firmware wiring. Passing tests against
a dirty checkout is not a pinned compatibility release.
