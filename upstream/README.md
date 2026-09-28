# Imported firmware and QMK contracts

This folder makes app development self-contained. These are reviewed snapshots,
not symlinks, a firmware checkout, or code the app loads from another repository.
The application runtime uses its own codecs and vendored `core/data/` catalog.
Tests, fixture previews and catalog maintenance use the files here.

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
   blobs, not an unreviewed working-tree snapshot.
2. Copy the required files at their existing paths here, retaining historical
   fixtures still needed for compatibility. Record a new source entry if only
   some files advance to a different revision; each file's `source` must resolve
   to the revision it actually came from.
3. Update `sourcePath`, `sourceSha256`, `sha256` and any transformation note in
   the manifest. For documentation, resolve relative links to local copies or
   pinned upstream source. Never edit fixture bytes simply to match the app.
4. For QMK changes, update all relevant catalog fragments, the keyboard header,
   layout and version stamp coherently. Run `npm run keycodes`, review the
   generated diff, then `npm run keycodes -- --check` and `npm run check`.
   An explicit `npm run keycodes -- --qmk /path/to/qmk` is available for comparing
   a candidate checkout, but it does not update the imported inputs or manifest.
5. For wire changes, update the app's codecs and tests in the same change and
   arrange compatibility testing with the firmware project. App tests prove
   behavior against these vectors; they do not compile or run current firmware.

The firmware project also owns five cross-language runners:
`run_qmk_portable_editor_tests.sh`, `run_qmk_portable_profile_tests.sh`,
`run_macro_program_size_tests.sh`, `run_profile_compiled_defaults_v1_tests.sh`
and `run_profile_pd_v1_tests.sh`, under its `tests/host/`. They compare app
readers, writers and macro sizing with C implementations. They are not included
here: they depend on firmware source, QMK and a C toolchain. The source revision
still targets its in-tree app; running it does not automatically validate this
independent checkout. Connecting those runners to an explicit app revision is
firmware integration work. Do not present these snapshots as a replacement for
that integration coverage or physical interruption acceptance.
