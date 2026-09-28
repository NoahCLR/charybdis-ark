# Plan: published-pin CI, RGB integration and local hooks

Parked until Ark and firmware both have their remotes. Nothing here is
implemented. Firmware's half is `docs/plans/ci-and-hooks.md` in the firmware
repository. When done, fold the lasting rules into `AGENTS.md`,
[compatibility](../COMPATIBILITY.md) and [upstream](../../upstream/README.md),
then delete this file (D-L07).

Goal: a pushed Ark change is checked against published firmware, and cheap
failures are caught before a commit rather than in review.

## Where things stand

CI (`.github/workflows/check.yml`) runs `npm ci`, `npm run check`,
`npm run keycodes -- --check`, `npm run preview` and loads `node-hid` on Ubuntu
and macOS. It never sees firmware. The published-pin rule (D-L45) is enforced
only when someone runs `npm run test:compat -- … --publish` locally. The RGB
domain has no cross-language runner. There are no hooks. Measured locally,
`npm run check` takes about 24 seconds.

Hooks are a convenience: they only run in a clone where someone installed them,
and `--no-verify` skips them. CI is the enforcement.

## Steps

1. **Published pin in CI.** Clone firmware's `main` from its repository and fail
   unless the `upstream/manifest.json` pin is an ancestor of it, and unless each
   pinned file at that commit matches its `sourceSha256`. Reuse `pinPublished`
   and `compareUpstream` from `scripts/check-compatibility.js`, not new logic.
2. **Integration in CI (decide first).** Run the full `test:compat` against
   firmware `main` and the QMK fork's `noah-userspace-contracts`. It needs a C
   compiler with sanitizer support. Decide between every push and only changes
   under `upstream/`, `core/schema/`, `core/protocol/` or `tests/integration/`.
3. **RGB integration runner.** Add `tests/integration/run_rgb_domain_v1_tests.sh`
   comparing `core/schema/rgb-domain-v1.js` with firmware's
   `users/noah/lib/profile/schema/profile_rgb_v1.c` in both directions, and add it
   to the bridge's runners. Firmware's
   [what Ark consumes](https://github.com/NoahCLR/charybdis-4x6/blob/main/docs/architecture/ark-compatibility.md#what-ark-consumes)
   list gains the probe it compiles.
4. **Hooks with prek.** Add `.pre-commit-config.yaml`; `prek` and `pre-commit`
   both read it, prek is preferred for its single binary.
   - pre-commit: `node --test tests/upstream.test.js` and
     `npm run keycodes -- --check`;
   - pre-push: `npm run check`.
5. **Agent rules.** In `AGENTS.md`: run `prek install --hook-type pre-commit
   --hook-type pre-push` once per clone (hooks sit in the shared `.git/hooks`, so
   every worktree gets them); never bypass with `--no-verify`.

## Acceptance

- CI fails when the pin is not on firmware `main` or a pinned file differs from
  its recorded source, and passes otherwise.
- A broken RGB encoder fails `test:compat` in the new runner.
- A hand-edited `upstream/` file blocks a commit; a failing test blocks a push.
- A commit in a task worktree runs the same hooks.
