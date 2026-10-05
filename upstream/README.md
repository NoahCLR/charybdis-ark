# Imported firmware and QMK contracts

This folder makes app development self-contained. These are reviewed snapshots,
not symlinks, a firmware checkout, or code the app loads from another repository.
The application runtime uses its own codecs and vendored `core/data/` catalog.
Tests, fixture previews and catalog maintenance use the files here.

For ongoing firmware development, inspect the real checkout, `charybdis-4x6`
beside this one in Noah's workspace, not these snapshots. The
[workspace map](../docs/REPOSITORY.md#local-development-workspace) explains how
to locate task worktrees and distinguish current source from this pinned baseline.

| Directory | Purpose | Owner |
| --- | --- | --- |
| `firmware/tests/fixtures/` | Golden wire bytes and stored profiles, including historical formats used to test migration | Firmware project |
| `firmware/docs/architecture/` | Profile Wire, domain, transaction, ownership and resource specifications used when developing the client | Firmware project |
| `qmk/data/constants/keycodes/` | Numeric keycode definitions and US aliases used by the catalog generator | QMK fork |
| `qmk/keyboards/bastardkb/charybdis/` | Keyboard keycode declarations and the 4×6 matrix layout contract | QMK fork |
| `qmk/version.txt` | Catalog's original QMK version stamp, synthesized for reproducible generation without a QMK Git checkout | Import metadata |

[`manifest.json`](manifest.json) records the repository URL, full commit ID,
original path, original SHA-256 and local SHA-256 for each imported file.
The firmware source is the committed source of this extraction; QMK's source
is the commit identified by the existing catalog. These pins describe source
provenance, not proof that every firmware/QMK combination passed hardware
acceptance.

Fixtures and QMK inputs are byte-for-byte copies. Documentation links are
adjusted to local copies when available and revision-pinned upstream URLs
otherwise; both hashes are recorded. Root `LICENSE` retains the original
firmware repository license; `qmk/LICENSE` retains the QMK license. Keep source
notices and provenance when updating any imported file.

## Ordinary development

`npm run check` checks the manifest hashes and exercises the imported vectors.
`npm run keycodes -- --check` reproduces the catalog using only `upstream/qmk/`.
`npm run preview` builds a fixture preview using only this checkout. None of
these commands requires a network connection or a sibling repository after
Node dependencies have been installed.

## Updating a contract

1. Select a committed firmware or QMK revision. Inspect the relevant protocol,
   schema, capability and migration changes before copying files. Use committed
   blobs, not an unreviewed working-tree snapshot. Locally, any committed
   revision will do, landed or not. A pin change lands only once its revision
   is on the source's published trunk (firmware `dev`; QMK
   `noah-userspace-contracts-dev`), and `land` refuses it otherwise: firmware
   pull requests are squash-merged, so a feature-branch commit is replaced by
   the merged one and the pinned links would point nowhere. Re-pin to the
   merged commit (BK lands merge commits, so its branch commits survive).
   Fetch the firmware checkout, then run the bridge with `--publish` before
   landing.
2. Refresh with the tool, which reads only committed blobs and never fetches:
   `npm run upstream -- --firmware PATH --qmk PATH` re-pins every listed file to
   firmware's local `dev` and to the BK commit that firmware's `qmk-pin.json`
   names, so Ark's BK inputs are the ones the firmware is built with (or
   `--firmware-rev REV` / `--qmk-rev REV`), one source per repository. It rewrites each file's hashes and transformation note, the QMK
   version stamp (`git describe --tags --exclude 'v2*'` of the pinned commit, so
   the stack's own `vYYYY.MM.DD` release tags never replace the upstream QMK
   version) and the keycode catalog. It lists files whose content changed
   separately from those whose pinned links only moved, and flags changed
   fixture or QMK input bytes. Documentation links to another imported file
   stay as written; every other relative link is pinned to the source commit.
   Never edit fixture bytes simply to match the app.
3. To add a file, list it in the manifest (`path`, `source`, `sourcePath`), then
   refresh. Historical fixtures still needed for compatibility stay listed.
4. Review the diff, then run `npm run check`, `npm run keycodes -- --check` and
   `npm run upstream -- --check --firmware PATH --qmk PATH`, which rebuilds every
   file from the commit its entry pins and fails on any difference; CI's
   compatibility job runs the same check. An explicit
   `npm run keycodes -- --qmk /path/to/qmk` compares a candidate checkout's
   catalog without updating the imported inputs or manifest.
5. For wire changes, update the app's codecs and tests in the same change and
   arrange compatibility testing with the firmware project. App tests prove
   behavior against these vectors; they do not compile or run current firmware.

Ark owns five cross-language runners under `tests/integration/`. They compile
probes from the selected firmware and compare readers, writers and macro sizing
with Ark's current implementation. Use the separate
[compatibility bridge](../docs/COMPATIBILITY.md); it also fails when a pinned
fixture differs from the selected firmware and lists specs that lag it. Firmware itself does not require
Ark; it keeps independent regression fixtures and C tests. The imported
snapshots here remain unchanged and do not replace integration or physical
interruption acceptance.
