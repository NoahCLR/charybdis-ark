# Firmware / Ark compatibility check

Ordinary Ark UI work runs `npm run check` without firmware or QMK. Before
merging wire, schema, encoder/decoder or macro-sizing changes, run the
compatibility bridge against the working copies involved in the change (D-L45):

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
Git, Node, Python 3, a C compiler with the runners' sanitizer support, Docker
(running) and the selected QMK tree are required: firmware's contract probe
(`tests/host/run_contract_probe.sh`) runs itself in the firmware's build
image, the one its host tests and releases use, and the runners call it. Missing checkouts or required integration inputs fail before any tests run. No dependency installation, fetching, device
access or firmware flashing occurs.
Optional-feature runners skip only when a readable contract lacks the feature.
A missing search tool or an unreadable contract fails the runner and the bridge.

It first compares every firmware input (including aliased sources) pinned in `upstream/manifest.json` with
the selected firmware working copy. A pinned fixture that differs or is missing
fails the check before any runner starts, because this repository's own tests
would be exercising stale bytes; refresh `upstream/` from a committed firmware
revision with `npm run upstream` as [its README](../upstream/README.md#updating-a-contract) describes. A
pinned spec that differs only lags: it is printed as a warning and listed under
`upstream.specs` in the report. Review it deliberately; it does not fail.

It also records whether every firmware and QMK source pin is published. Firmware pins must be contained in
the firmware checkout's `refs/remotes/origin/dev`, its trunk; firmware `main`
moves only by promotion merges of `dev`, so a pin on `dev` stays reachable from
both. The bridge never fetches,
so fetch both dependency checkouts first for a current answer. QMK pins must be contained in `refs/remotes/origin/noah-userspace-contracts-dev`, the BK fork's development branch. An unpublished pin is a
warning during local work, where any committed revision may be pinned. With `--publish`, it fails before any runner starts;
run that form before landing an Ark change that moves a pin (`land` also refuses
pins that are not on the published trunks).

The bridge then runs the eight Ark-owned integration runners under
`tests/integration/` in turn, the five below and then the candidate-transfer,
macro-domain and live-edit runners described after them:

- `run_qmk_portable_editor_tests.sh`: firmware option pages → app reader.
- `run_qmk_portable_profile_tests.sh`: firmware settings pages → app reader.
- `run_profile_compiled_defaults_v1_tests.sh`: app profiles → C validation. A
  profile Ark writes for current firmware (schema 4.0, RGB 4, key behaviours 2,
  combos 3, settings 8, PD 3) is accepted directly. The eight-slot profiles are
  frozen firmware-owned rejection evidence: refused as they are. The bridge
  also checks maximum names and the simultaneous maximum profile in normal and
  sanitizer builds.
- `run_profile_pd_v1_tests.sh`: app PD record corpus → C validation. The
  test-only version-1 envelope converts frozen 96-byte records into the current
  128-byte records checked with Ark's codec, preserving the frozen harness's
  mutation coverage without a production version-1 decoder. The current
  version-3 vectors and their mutations also require C to report Ark's error
  code and byte offset.
- `run_profile_rgb_v1_tests.sh`: app RGB encodings and malformed-byte corpus →
  C validation for RGB domain version 4 at five- and eight-tap depth, with
  address/undefined-behavior sanitizers. Both implementations reject a byte
  that names an older format.

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

The candidate-transfer runner adds Ark upload → production C candidate/store/
validator checks, including exact reconstructed bytes, all seven domains,
a valid 74,801-byte profile across the 64 KiB boundary, and corruption rejection,
in normal and sanitizer builds. Ark supports only current firmware (D-L64), so
firmware without the transfer extension fails this runner rather than skipping
it. Its scan opportunities are simulated and establish no hardware timing.

The macro-domain runner links firmware's incremental `profile_macros_v1`
validator. C-generated protected UTF-8/key/delay streams decode and re-encode
in Ark; Ark encodings, empty/sparse/dense/full domains, optional unused tails
and malformed corpora pass through C validation in normal and sanitizer
builds. Wide source offsets and exact transported bytes are checked. These
checks establish encoding agreement, not hardware latency or playback.

The live-edit runner links firmware's production Profile Wire edit channel
(`qmk_profile_edit_channel.c`) and working copy (`profile_working_copy.c`) with
its whole validator; the probe (`live-edit-probe.c`) stands in for the owner
between them, one half whose Save, edit mode and other-half facts the corpus
sets. Ark's own `LiveEditCoordinator` sends each edit: a one-domain edit, a
multi-domain edit whose stream crosses several 22-byte data reports, a created
domain and a whole replacement, each leaving a C working copy equal byte for
byte to what Ark's splicing records. It checks the refusals Ark relies on (a
new edit BUSY while one is received, out-of-order and overlapping splices, an
edit too large to stage, a damaged stream's commit CRC, a stale identity) and
decodes every reply with Ark's decoders: the SET reply, edit status pages 0–2,
the active profile, the mode and runtime pages, with each status flag bit
0–13 set at least once. Both normal and sanitizer builds run. It establishes
wire and splice agreement on one half, not the split link, Save's flash work
or hardware timing.

## Agreement with a firmware contract

The bridge proves byte-level equivalence of codecs; the agreement check answers
the release question: does this Ark speak that firmware? Firmware states its
contract with `tests/host/run_contract_probe.sh`: the exact Profile Wire
capability pages its keyboard answers, its BK pin (`qmk-pin.json`) and the
hashes of its fixtures. The probe runs in firmware's build image, so Docker
must be running (on CI's runners it pulls the image, which is public).
`npm run agreement -- --firmware PATH --qmk PATH`
judges it with Ark's own runtime code, where `--qmk` is a BK checkout
containing firmware's pin:

- the capability pages decode with Ark's Profile Wire decoder (all its
  consistency rules);
- the Profile Wire and profile schema versions are exactly the base Ark
  requires, major and minor (`SUPPORTED_PROFILE_PROTOCOL` and
  `SUPPORTED_PROFILE_SCHEMA` in `core/session/firmware-support.js`, D-L64): the
  version implies everything the keyboard does, and a later capability raises
  the minor;
- Ark knows the action-ABI digest (`KNOWN_ACTION_ABIS`);
- the firmware supports every profile domain Ark registers;
- it is a split build that saves (`CURRENT_MUTATION_FEATURES`, feature bits 0
  and 1): the feature word holds only build differences (firmware D-F28), so
  the pointing bit is reported, not compared;
- Ark's BK keycode and layout inputs equal those at firmware's BK pin (file
  equality, not commit equality);
- Ark's pinned fixtures equal the firmware's.

What can break Ark, and what checks it:

| Surface | Defined in | Ark learns it from | Checked by |
| --- | --- | --- | --- |
| Profile Wire channel | firmware `compat/qmk_profile_channel.c` | protocol and schema versions, feature flags | agreement (pages decode, versions, required features); golden fixtures |
| Stored profile format (blob, domains, settings, compiled defaults) | firmware `lib/profile/schema/` | schema version | the bridge's runners; agreement (fixtures equal) |
| Action vocabulary and action-ABI digest | firmware, and BK keycode values | digest against `KNOWN_ACTION_ABIS` | agreement (digest known) |
| Keycode catalog and layout | BK | Ark's pinned BK snapshot | agreement (files equal at firmware's BK pin); `npm run keycodes -- --check` |
| Keymap and macro domains | firmware profile codecs and config | domain versions and capability capacities | golden codecs, candidate and macro-domain runners |
| Keyboard options (RGB effects and order, LED flags) | BK's RGB matrix and firmware config | reported at runtime | portable-editor runner |
| Behaviour on the keyboard | firmware | nothing | keyboard checks only; not automatable |

Firmware version, compiled-default digest and capacities are reported, never
compared: they change with ordinary keymap edits. For the same reason Ark
imports no fixture the firmware regenerates from its keymap
([`upstream/README.md`](../upstream/README.md#updating-a-contract)). CI's `agreement` job runs it
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
the released pair speaks one contract (D-L50). A release may keep an older pin
that still agrees; a newer pin or a matching commit date is not the criterion.
A separate job, `compatibility with firmware dev (early warning)`, runs the bridge
against firmware `dev` and the BK trunk as they are now, nightly and on demand. It is not required and never blocks landing or
promotion; red means firmware moved in a way Ark must follow (re-pin with
`npm run upstream`, update codecs and tests). The reports record the selected
commits and are retained as artifacts.
`npm run pins -- --firmware PATH --qmk PATH` checks just ancestry without compiling.
Use `--firmware-ref REV --qmk-ref REV` to check membership in a selected local
release history; the defaults are the fetched origin trunks.
Revision pins belong in the integrating CI job; this command neither chooses
nor updates a known-compatible release automatically. These checks do not
replace either repository's full suite or physical-device acceptance.

Firmware's full suite and build are independent of Ark. It uses frozen,
firmware-owned regression inputs, while this integration gate exercises current
app-generated bytes. Firmware no longer needs a bridge-aware version of its
shell runners: Ark owns the compilation recipes and checks. If firmware moves
sources or changes build wiring, update Ark's integration recipes accordingly.
Ark's ordinary `npm run check` checks bridge orchestration using temporary test
repositories but never invokes the real firmware integration runners.

Ark talks to firmware-owned Raw HID: identity comes from capabilities and
base RGB/key options from Profile Wire. Apply publishes one complete blob
and one generation. A backup is Ark's version-5 envelope
([D-L15](adr/0015-a-backup-is-the-complete-effective-configuration.md),
rules in [`core/README.md`](../core/README.md)); the imported portable spec
retains a historical JSON section for the retired client and is not the current
Ark file format.
