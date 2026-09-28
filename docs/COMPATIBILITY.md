# Firmware / Live compatibility check

Ordinary Live UI work runs `npm run check` without firmware or QMK. Before
merging wire, schema, encoder/decoder or macro-sizing changes, run this separate
bridge against the working copies involved in the change:

```sh
npm run test:compat -- \
  --firmware /Users/noah/dev/charybdis/charybdis-4x6 \
  --live /Users/noah/dev/charybdis/charybdis-live \
  --qmk /Users/noah/dev/charybdis/bastardkb-qmk \
  --report /tmp/charybdis-compatibility.json
```

Run from Live. All four arguments are required; checkout paths must be Git
repository roots. Use a new report filename for each run, outside the checkouts.
Git, Node, Python 3, a C compiler with the runners' sanitizer support, and the selected
QMK tree are required. Missing checkouts or firmware runners predating the
bridge fail before any tests run. No dependency installation, fetching, device
access or firmware flashing occurs.

The bridge sequentially runs these firmware-owned host runners:

- `run_qmk_portable_editor_tests.sh`: firmware option pages → app reader.
- `run_qmk_portable_profile_tests.sh`: firmware settings pages → app reader.
- `run_macro_program_size_tests.sh`: app size predictions against C decoding.
- `run_profile_compiled_defaults_v1_tests.sh`: app profiles → C validation.
- `run_profile_pd_v1_tests.sh`: app PD corpus → C validation.

The selected Live root is exported as `CHARYBDIS_LIVE_ROOT`; `QMK_ROOT` and
`QMK_HOME` identify the selected QMK tree. The firmware runner files come from
`--firmware`, not from the directory holding this command. The report contains
canonical paths, starting Git revisions and dirty statuses (including untracked
files), Node version, timestamps and each runner's exit status. Runner output
streams to the terminal. A failed runner stops the check and leaves a failed
report; an incomplete report is not a pass. Do not edit the checkouts during a
run: this tests working copies, not immutable snapshots or a dirty-tree archive.

For repeatable CI later, check out explicitly pinned commits of all three
repositories, ensure the trees are clean and retain the report and console log.
Revision pins belong in the integrating CI job; this command neither chooses
nor updates a known-compatible release automatically. These five checks do not
replace either repository's full suite or physical-device acceptance.

Firmware's ordinary full suite retains its in-tree Live default while repository
cleanup is pending. Set `CHARYBDIS_LIVE_ROOT` explicitly to test the independent
app there too. An invalid explicit path fails rather than falling back. The
bridge always selects Live explicitly. No runtime wire format or module
ownership changes are introduced by the bridge.
