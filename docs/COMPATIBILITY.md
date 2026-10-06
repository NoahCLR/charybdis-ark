# Firmware / Ark compatibility check

Ordinary Ark UI work runs `npm run check` without firmware or QMK. Before
merging wire, schema, encoder/decoder or macro-sizing changes, run this separate
bridge against the working copies involved in the change:

```sh
npm run test:compat -- \
  --firmware ../charybdis-4x6 \
  --ark . \
  --qmk ../bastardkb-qmk \
  --report /tmp/charybdis-compatibility.json
```

Run from the main Ark checkout, with the firmware and QMK checkouts beside it
(from a worktree, use their paths in the workspace). All four arguments are required; checkout paths must be Git
repository roots. Use a new report filename for each run, outside the checkouts.
Git, Node, Python 3, a C compiler with the runners' sanitizer support, and the selected
QMK tree are required. Missing checkouts or required integration inputs fail before any tests run. No dependency installation, fetching, device
access or firmware flashing occurs.

It first compares every firmware input (including aliased sources) pinned in `upstream/manifest.json` with
the selected firmware working copy. A pinned fixture that differs or is missing
fails the check before any runner starts, because this repository's own tests
would be exercising stale bytes; refresh `upstream/` from a committed firmware
revision with `npm run upstream` as [its README](../upstream/README.md#updating-a-contract) describes. A
pinned spec that differs only lags: it is printed as a warning and listed under
`upstream.specs` in the report. Review it deliberately; it does not fail.

It also records whether every firmware and QMK source pin is published. Firmware pins must be contained in
the firmware checkout's `refs/remotes/origin/dev`, its trunk. The bridge never fetches,
so fetch both dependency checkouts first for a current answer. QMK pins must be contained in `refs/remotes/origin/noah-userspace-contracts-dev`, the BK fork's development branch. An unpublished pin is a
warning during local work. With `--publish`, it fails before any runner starts;
run that form before landing an Ark change that moves a pin (`land` also refuses
pins that are not on the published trunks).

The bridge then sequentially runs these Ark-owned integration runners under `tests/integration/`:

- `run_qmk_portable_editor_tests.sh`: firmware option pages → app reader.
- `run_qmk_portable_profile_tests.sh`: firmware settings pages → app reader.
- `run_macro_program_size_tests.sh`: app size predictions against C decoding.
- `run_profile_compiled_defaults_v1_tests.sh`: app profiles → C validation. The
  eight-slot profiles must be refused as they are and accepted once Ark has
  translated them (`upgradePdSlots`), whose bytes must equal the firmware's
  reference translation (`tests/host/translate_eight_slot_profile.py`); a
  32-slot profile Ark writes itself is accepted directly.
- `run_profile_pd_v1_tests.sh`: app PD corpus → C validation: the version-1
  record corpus, and the firmware's version-2 vectors plus Ark's mutations of
  them, where C must report Ark's error code at Ark's byte offset.
- `run_profile_rgb_v1_tests.sh`: app RGB encodings and malformed-byte corpus → C validation, for the schema-1 build (format 1) and the 32-slot build (format 3), with address/undefined-behavior sanitizers. Ark reads every backup format; each C build accepts its own compiled format.

The selected Ark root is exported as `CHARYBDIS_ARK_ROOT`; `QMK_ROOT` and
`QMK_HOME` identify the selected QMK tree. The integration runner files come from
`--ark`; their C probes and firmware implementation come from `--firmware`.
`FIRMWARE_ROOT` identifies that source root. Firmware owns no Ark-dependent
runner or app-path selector. The report contains
canonical paths, starting Git revisions and dirty statuses (including untracked
files), Node version, timestamps and each runner's exit status. Runner output
streams to the terminal. A failed runner stops the check and leaves a failed
report; an incomplete report is not a pass. Do not edit the checkouts during a
run: this tests working copies, not immutable snapshots or a dirty-tree archive.

## Agreement with a firmware contract

The bridge proves byte-level equivalence of codecs; the agreement check answers
the release question: does this Ark speak that firmware? Firmware states its
contract with `tests/host/run_contract_probe.sh`: the exact Profile Wire
capability pages its keyboard answers, its BK pin (`qmk-pin.json`) and the
hashes of its fixtures. `npm run agreement -- --firmware PATH --qmk PATH`
judges it with Ark's own runtime code, where `--qmk` is a BK checkout
containing firmware's pin:

- the capability pages decode with Ark's Profile Wire decoder (all its
  consistency rules);
- the protocol and profile schema are ones Ark speaks, and Ark knows the
  action-ABI digest (`KNOWN_ACTION_ABIS`);
- Ark's BK keycode and layout inputs equal those at firmware's BK pin (file
  equality, not commit equality);
- Ark's pinned fixtures equal the firmware's.

What can break Ark, and what checks it:

| Surface | Defined in | Ark learns it from | Checked by |
| --- | --- | --- | --- |
| Profile Wire channel | firmware `compat/qmk_via_profile_channel.c` | protocol and schema versions, feature flags | agreement (pages decode, versions); golden fixtures |
| Stored profile format (blob, domains, settings, compiled defaults) | firmware `lib/profile/schema/` | schema version | the bridge's runners; agreement (fixtures equal) |
| Action vocabulary and action-ABI digest | firmware, and BK keycode values | digest against `KNOWN_ACTION_ABIS` | agreement (digest known) |
| Keycode catalog and layout | BK | Ark's pinned BK snapshot | agreement (files equal at firmware's BK pin); `npm run keycodes -- --check` |
| VIA surface (layers, macro buffer, macro format) | BK's VIA and firmware config | capacities on the capability pages | agreement (decoder consistency rules); macro-size runner |
| Keyboard options (RGB effects and order, LED flags) | BK's RGB matrix and firmware config | reported at runtime | portable-editor runner |
| Behaviour on the keyboard | firmware | nothing | keyboard checks only; not automatable |

Firmware version, compiled-default digest and capacities are reported, never
compared: they change with ordinary keymap edits. CI's `agreement` job runs it
on a release's promotion pull request against firmware `main`, or firmware
`dev` when the release marker says the release is joint (D-L51), and nightly
against firmware `dev`; it is required on `main`, and its table is in the job
summary. Firmware's promotion pull request runs the same check the other way
round (`Agreement with Ark main`), and a nightly `published mains agree` job
checks Ark `main` against firmware `main`.

CI's required `compatibility` job checks all source pins, checks that `upstream/`
reproduces exactly from them (`npm run upstream -- --check`), and runs the bridge
with `--publish` against exactly the firmware and QMK commits Ark pins, on the
promotion pull request. Gating on the pins lets firmware move ahead without
turning Ark red: Ark claims compatibility with what it pins, and agreement proves
the released pair speaks one contract.
A separate job, `compatibility with firmware dev (early warning)`, runs the bridge
against firmware `dev` and the BK trunk as they are now, nightly and on demand. It is not required and never blocks landing or
promotion; red means firmware moved in a way Ark must follow (re-pin with
`npm run upstream`, update codecs and tests). The reports record the selected
commits and are retained as artifacts.
`npm run pins -- --firmware PATH --qmk PATH` checks just ancestry without compiling.
Use `--firmware-ref REV --qmk-ref REV` to check membership in a selected local
release history; the defaults are the fetched origin trunks.
Revision pins belong in the integrating CI job; this command neither chooses
nor updates a known-compatible release automatically. These six checks do not
replace either repository's full suite or physical-device acceptance.

Firmware's full suite and build are independent of Ark. It uses frozen,
firmware-owned regression inputs, while this integration gate exercises current
app-generated bytes. Firmware no longer needs a bridge-aware version of its
shell runners: Ark owns the compilation recipes and checks. If firmware moves
sources or changes build wiring, update Ark's integration recipes accordingly.
Ark's ordinary `npm run check` checks bridge orchestration using temporary test
repositories but never invokes the real firmware integration runners.
