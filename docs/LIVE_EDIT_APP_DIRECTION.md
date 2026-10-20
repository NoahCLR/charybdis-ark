# Ark — Direction

The current status of Ark and the decisions behind it. The end goal is
the [product goal](PRODUCT_GOAL.md); the technical authority is
[`architecture/device-resident-profile.md`](../upstream/firmware/docs/architecture/device-resident-profile.md).
This document records how we get there and what we decided along the way.
Verification logs, build numbers and the branch's setup history are in git, not
here.

## Who Owns What

This repository owns the app, the [product goal](PRODUCT_GOAL.md), the product's
status and the app's decisions. The firmware repository
([NoahCLR/charybdis-4x6](https://github.com/NoahCLR/charybdis-4x6); local paths in
the [workspace map](REPOSITORY.md#local-development-workspace)) owns the device:
its runtime, stored profile, wire and split protocols, its specs (pinned here
under [`upstream/`](../upstream/README.md)) and the decisions that constrain it,
in its `docs/LIVE_EDIT_APP_DIRECTION.md`, "the firmware direction" below.

Each decision has one home. D-L identifiers and their original heading anchors
remain findable in both repositories, but only the owner holds the text. This
document groups firmware-owned decisions in the
[pointer table](#firmware-decision-pointers). Change a decision where its text
lives. New
app decisions continue the D-L series here; firmware numbers its own from D-F01.

## The Direction In One Sentence

The keyboard becomes the source of truth, and Ark becomes a client of
the keyboard rather than a client of the repository.

## Current Product Status

Ark ([this repository](../README.md)) reads
everything it edits from the keyboard without a firmware workspace, keeps every
change in one reviewed draft, and applies it to both halves as one atomic
logical generation. The user reports that the workflow works on their keyboard;
that is useful manual feedback, not completion of the hardware acceptance
matrix.

| Product surface | Current state |
| --- | --- |
| Layout and 16 layers | Read/write keys, layer names and order; a reorder renumbers layer keys by default, any layer can be the base, and key labels follow the host layout (D-L15, D-L29, D-L37, D-L56) |
| Key behaviours, combos and RGB | Read/write editors over the shared draft, with participation controls at every scope and global/per-combo output behaviour permissions; a behaviour that changes nothing is never kept, and Review notes one read from the keyboard ([rows that change nothing](architecture/timing-and-reachability.md#rows-that-change-nothing)) (D-L12, D-L32, D-L49, D-L55) |
| Macros | 128 VIA macros renamed directly through their titles; empty canvas with direct step actions, fixed-size sequence tiles, drag reordering across the whole sequence, Delete/Backspace step removal, per-slot step undo/redo and a shared step clipboard, a selected-step editor, a raw-payload toolbar toggle and live validation, including visible invalid hold order; recorder scoped to its visible slot with taps/chords by default and optional hold timing alongside its other settings; Unicode text, typed and checked through the host's OS and keyboard layout; per-macro input protection; one shared memory, shown and enforced (D-L25, D-L26, D-L56, D-L57) |
| Custom keys | 128 named keys, each with an optional shortcut (one key and any modifiers, sides mixed) as its own action and a behaviour on top: rename, set or clear the shortcut, edit the behaviour on the same screen whether or not the key is placed, place, see where each is used; behaviour steps may send one's shortcut (D-L42, D-L63) |
| Mouse | Pointer and sniping DPI, auto-sniping (with where the sniping keys are placed) and auto-mouse, settings the core files under Mouse, so the rail, the review and import counts all place them there; the auto-mouse fade is a share of the timeout, edited on its lighting stage (D-L17) |
| Pointing modes | 32 device-owned slots in the sparse PD domain (D-L41, D-L54); mouse-button 1–8 clicks and VIA macro outputs from directions, diagonals and tap overrides; see [the editor contract](architecture/interface-contracts.md#pointing-tap-outputs) and [PD-mode domain v1](../upstream/firmware/docs/architecture/pd-mode-domain-v1.md) |
| Settings | Every other portable setting, grouped by task and ordered by how often it is changed: tap & hold timing, key swaps & typing, behaviours and combos each with their layers and combo matching, Host, default layers; set-once cards start folded and say their state. Key options the firmware build leaves out stay read-only (D-L18, D-L56). Lighting the keyboard stores as settings is edited on Lighting: All lighting and the idle timeout (in seconds or minutes) above every stage, the background effect (QMK's own effect) on its stage, the feedback flash interval with key feedback. What the firmware was built with is read-only on Keyboard |
| Keyboard name | The keyboard's own name, its USB product string, edited as the Keyboard screen's title and stored in the settings domain; an Apply that renames it is followed through the keyboard's USB restart (D-L62) |
| Backup and restore | Complete current-format backup files, restore review against the keyboard, the copies saved before each Apply (each usable as a draft) and verified restore; older formats are refused, never converted (D-L15, D-L23, D-L54, D-L64) |
| Drafts and Apply | One draft with item-by-item review, discard by edit group, Show, undo/redo and history; the review checks reachable actions, confirms warnings and traps and blocks what the destination cannot save; Apply names its steps and halves and says where a failure happened (D-L19, D-L23, D-L29, D-L30, D-L36, D-L60, D-L61) |
| How edits reach the keyboard | Per keyboard, stored on it, three modes: **Live + review** (the default) sends every edit, undo and discard to the keyboard's working copy at once, asks before one adds a trap or warning, reviews the working copy against the saved profile and Saves or Reverts on the keyboard; **Live** sends edits the same way and the keyboard saves them by itself after 3 s of quiet, which Ark shows as "saved by the keyboard" from its status; **Apply** keeps edits in Ark's draft as before. Switching asks Save/Revert or Send/Discard first where work would be lost; leaving Live has the keyboard save first. Edits the keyboard's adjustment keys make are read again as news; toggles a key turned off show as turned off by key (D-L65, D-L66, firmware D-F32) |
| Firmware supported | Current firmware only: the new base, Profile Wire 2.0 and profile schema 4.0, required exactly (major and minor), whose version implies everything the keyboard does; the feature word only describes the build (split, saves, pointing). A keyboard on anything else, the previous base included, is read no further than its identity and told to update; a keyboard whose saved profile is in an earlier store format or retired test layout says it runs its built-in defaults (D-L48, D-L64) |
| Recovery | One-store atomic Apply, differential profile transfer, firmware commit recovery after the decision, resume after a lost or power-cycled peer link, verified running-layout reads or an unavailable layout during recovery, bounded cancel owned by the keyboard (D-L20–D-L22, D-L27, D-L39, D-L58) |
| Where it runs | The VS Code extension, and a web page in Chrome or Edge over WebHID; Cloudflare Git integration publishes `dev` to `ark-dev.ncleroy.dev`, `main` to `ark.ncleroy.dev`, and task branches to PR previews; a phone gets only a notice (D-L02, D-L52) |
| Demo without a keyboard | The bundled demo profile in a real draft, in both hosts: every screen editable and reviewed, Apply refused, Export saves the draft (D-L53) |

The rail's keyboard dot shows connection and both-half convergence, in plain
words on hover; the rail lists draft state
and recovery state. Convergence needs the firmware's peer-known and
peer-converged flags, not just matching generations. With several compatible
keyboards connected, a selector picks one (on the web page among those
the page may open, the one last chosen first), each listed by its name and
told apart by serial number or a number only where two read alike (D-L62); a
dirty draft stays bound to its keyboard, and a reconnect requires an explicit
review before Apply.

Remaining before calling the product complete:

- physical interruption acceptance at every durable boundary;
- guided recovery, and an explicit reset to compiled defaults;
- broad hardware acceptance, including blank-firmware restore and the
  [PD-mode hardware matrix](../upstream/firmware/docs/architecture/pd-mode-domain-v1.md#hardware-acceptance).
  USB role migration is untested: on the normal pair the left half exposes no
  Raw HID interface (`FORCE_SLAVE`/`usb_disconnect`), so it needs role-switching
  firmware;
- the open issues below.

## Open Issues

- **Custom key shortcuts need keyboard acceptance (D-L63).** Set a mixed-side
  shortcut, a modifier-only one and a key-only one, apply, read back and hold
  each on both halves; put a behaviour on the key and send it from another
  key's behaviour step and as a bypassed combo output. Automated tests use the
  firmware's fixtures and fake adapters only.

- **Combo output permissions need keyboard acceptance (D-L55).** Confirm global
  and per-combo bypass, including two combos sharing an output, custom outputs
  and unchanged physical behaviours, after reading and saving both halves.

- **Renaming the keyboard needs broader hardware acceptance (D-L62).** Apply a new
  name and an empty one, in VS Code and in Chrome, with one keyboard and with
  two: confirm the restart, that Ark follows the same keyboard back, that
  Chrome keeps its permission and that the OS and chooser show the new name.
  Include a restart delayed beyond 10 seconds, explicit built-in text, a
  recovery restore, and another keyboard already using the target name.
  Automated tests use fake adapters only.

- **Post-decision failures need keyboard acceptance (D-L23).** Lost split
  authority or a concurrent commit (`AUTHORITY_FAILED`) requires a USB replug.
  Each half keeps a complete profile; there is no input fence or host rewrite.
  Confirm the restart guidance and that both halves recover one complete
  generation. Automated checks cannot establish physical interruption safety.

- **Refusing older firmware needs keyboard acceptance (D-L64).** Read a
  keyboard on an older firmware release, the previous base (Profile Wire 1,
  schema 3) included, and confirm Ark names the update and reads nothing it
  could edit, in VS Code and in Chrome. After flashing the new base over a
  saved schema-3 profile, confirm the Keyboard screen says the keyboard runs
  its built-in defaults, and that an Apply clears it.
- **The one-store base needs keyboard acceptance (D-L64).** Read, edit and
  Apply from both hosts, including keys, macros, shared profile-space limits,
  both halves, reboot and interrupted saves. Measure first read, Refresh,
  Export and save pauses with small and large profiles. Firmware exposes
  per-half pause diagnostics, but Ark has no diagnostics view for them yet.
- **Live + review needs keyboard acceptance (D-L65).** Edit every domain live
  (keys, behaviours, combos, lighting, pointing, settings, macros) and confirm
  both halves take each edit at once; Save and read back after a replug;
  Revert; undo and redo; a replug dropping unsaved edits; the mode switch and
  its questions, in VS Code and in Chrome; the combos key showing as turned off
  by key. Automated tests use a fake keyboard with a working copy only.
- **Live needs keyboard acceptance (D-L66).** Edit in Live, close Ark, replug:
  the edit is kept after a successful save; unplug before saving (including
  with a key held or a failed save): all edits since the last successful save
  are gone and Ark says so; switch between all three modes with unsaved work and with an Apply
  draft; a DPI or RGB key's change shows in Ark within a second and survives a
  replug in Live and Apply; "saved by the keyboard" appears after the quiet
  period; in VS Code and in Chrome. Automated tests use a fake keyboard whose
  own save a test triggers; the real quiet period, flash pauses and polling
  load are untested on hardware.
- **Menus and a live keyboard need keyboard acceptance in Chrome on macOS
  (D-L66).** On 2026-10-19 the web Ark, in Live on Noah's keyboard, lost the
  connection each time a dropdown was opened. A keyboard session the same day
  confirmed the cause in Chrome for Testing 153 on macOS: no input report
  reaches the page while a `<select>`'s native menu is open. Looks pause while
  a menu may be open, a missed look keeps the connection, and a lost keyboard
  is connected again; the pause was then defeated by the focus change a real
  press makes (now fixed and tested). Hold each dropdown open for several
  seconds in Live and Live + review in Noah's own Chrome and confirm nothing
  drops; if it does, note the request the diagnostics name.
- **Ark polls a live keyboard once a second (D-L66).** Four status reports per
  second while a live draft is open and nothing else holds the keyboard; a
  key adjustment then rereads the whole working copy (and the saved profile),
  which takes a moment on a large profile.
- **The picker's list of unbuilt QMK features is written by hand** (D-L05).
  `webview/view/picker-sections.mjs` hides keycodes for features this build
  does not include, matched against its rules files and QMK's defaults. It
  drifts when a feature is enabled or disabled. The keyboard should report its
  built features so the picker reads them from the device.
- **Chords written in the firmware's form need keyboard acceptance.** Ark
  writes a chord as the firmware does (presses, a tap of the last key, releases
  in reverse) and reads that and its older all-down-all-up form back as one
  chord. Record and apply a chord macro, read it back, and play it on both
  halves; the step round-trip is unit-tested only.
- **Apply's three failure verdicts need keyboard acceptance (D-L23).** Confirm
  nothing saved, the keyboard finishing a decided save by itself, and unknown,
  against what the keyboard runs after a replug.
- **Firmware open issues** are tracked in the firmware direction, including the
  one-half power-cycle recovery transition, why a peer stops acknowledging a push or
  fails a flash write mid-copy (D-L22, D-L27), physical acceptance of buffered gesture timing
  (firmware D-F01) and the keycode-block migration not yet run on hardware (D-L42).

## The Tools

- **Charybdis Ark** (this repository) is the app and the only one
  developed (D-L35). Nothing at runtime reads the firmware repository.
- The first live app, v1, is removed; see
  [Historical decisions](#historical-decisions).

## Remaining Load-Bearing Contracts

The firmware direction owns one-store publication and recovery (D-L21,
D-F31). Ark preserves a complete effective profile (D-L15), uploads one
candidate and accepts success only for the confirmed complete generation.
VIA is unsupported; the firmware answers Raw HID itself.

## Firmware decision pointers

These decisions are owned by the firmware direction. Each identifier and its
original heading anchor remain here so existing citations resolve; change the
text in the firmware repository.

| Decision | Subject | Owner |
| --- | --- | --- |
| <a id="d-l07--specs-are-promoted-process-is-deleted"></a>D-L07 | Specs are promoted, process is deleted | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l07--specs-are-promoted-process-is-deleted) |
| <a id="d-l08--the-live-profile-owner-is-on-by-default"></a>D-L08 | The live-profile owner is on by default | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l08--the-live-profile-owner-is-on-by-default) |
| <a id="d-l13--combo-readback-is-device-data"></a>D-L13 | Combo readback is device data | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l13--combo-readback-is-device-data) |
| <a id="d-l14--device-edits-are-saved-as-a-complete-generation-bound-profile"></a>D-L14 | Device edits are saved as a complete, generation-bound profile | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l14--device-edits-are-saved-as-a-complete-generation-bound-profile) |
| <a id="d-l17--the-keyboard-reports-its-brightness-limit"></a>D-L17 | The keyboard reports its brightness limit | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l17--the-keyboard-reports-its-brightness-limit) |
| <a id="d-l18--native-settings-use-device-reported-capabilities"></a>D-L18 | Native settings use device-reported capabilities | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l18--native-settings-use-device-reported-capabilities) |
| <a id="d-l21--apply-publishes-one-atomic-logical-generation"></a>D-L21 | Apply publishes one atomic logical generation in one store (D-F31) | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l21--apply-publishes-one-atomic-logical-generation) |
| <a id="d-l22--a-cancelled-save-ends-in-bounded-time-and-says-why-it-ended"></a>D-L22 | A cancelled save ends in bounded time, and says why it ended | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l22--a-cancelled-save-ends-in-bounded-time-and-says-why-it-ended) |
| <a id="d-l24--directional-modes-can-read-eight-directions"></a>D-L24 | Directional modes can read eight directions | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l24--directional-modes-can-read-eight-directions) |
| <a id="d-l25--via-macros-have-names-user-macros-are-retired"></a>D-L25 | VIA macros have names; user macros are retired | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l25--via-macros-have-names-user-macros-are-retired) |
| <a id="d-l27--a-stale-copy-on-the-other-half-can-no-longer-hold-off-every-later-one"></a>D-L27 | A stale copy on the other half can no longer hold off every later one | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l27--a-stale-copy-on-the-other-half-can-no-longer-hold-off-every-later-one) |
| <a id="d-l28--dominant-axis-and-eight-directions-are-one-directional-engine"></a>D-L28 | Dominant axis and eight directions are one directional engine | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l28--dominant-axis-and-eight-directions-are-one-directional-engine) |
| <a id="d-l34--layer-keycodes-are-owned-in-the-firmware-and-the-app-follows"></a>D-L34 | Layer keycodes are owned in the firmware, and the app follows | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l34--layer-keycodes-are-owned-in-the-firmware-and-the-app-follows) |
| <a id="d-l38--the-dual-role-setting-is-qmks-tapping-term"></a>D-L38 | The dual-role setting is QMK's tapping term | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l38--the-dual-role-setting-is-qmks-tapping-term) |
| <a id="d-l39--only-the-keyboard-ends-a-staging-together-with-its-candidate"></a>D-L39 | Only the keyboard ends a staging, together with its candidate | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l39--only-the-keyboard-ends-a-staging-together-with-its-candidate) |
| <a id="d-l40--firmware-builds-use-only-the-eight-slot-pointing-engine"></a>D-L40 | Firmware builds use only the slot-based pointing engine | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l40--firmware-builds-use-only-the-slot-based-pointing-engine) |
| <a id="d-l41--pointing-keycodes-name-slots-not-factory-presets"></a>D-L41 | Pointing keycodes name slots, not factory presets | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l41--pointing-keycodes-name-slots-not-factory-presets) |
| <a id="d-l42--userspace-keycodes-sit-in-fixed-blocks-and-custom-keys-are-named"></a>D-L42 | Userspace keycodes sit in fixed blocks, and custom keys are named | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l42--userspace-keycodes-sit-in-fixed-blocks-and-custom-keys-are-named) |
| <a id="d-l43--split-activity-optimization-at-qmks-default-baud"></a>D-L43 | Split activity optimization, at QMK's default baud | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l43--split-activity-optimization-at-qmks-default-baud) |
| <a id="d-l46--firmware-has-no-reverse-dependency-on-ark"></a>D-L46 | Firmware has no reverse dependency on Ark | [Firmware direction](https://github.com/NoahCLR/charybdis-4x6/blob/dev/docs/LIVE_EDIT_APP_DIRECTION.md#d-l46--firmware-has-no-reverse-dependency-on-ark) |

## Decisions

Numbers are stable and cited from code and docs.
Firmware decisions are indexed in the [pointer table](#firmware-decision-pointers);
the firmware direction owns their text.
Decisions about the retired v1 app, and the numbers retired without a heading,
are under [Historical decisions](#historical-decisions) at the end.

<a id="d-l02--ark-is-a-vs-code-extension-for-now"></a>

### D-L02 — Ark runs in VS Code and a web page

Ark ships as its own VS Code extension and as a web page beside it (D-L52).
Both hosts run the same core and interface, and neither requires a firmware
workspace (D-L44). The core has no `vscode` imports: a host supplies its device
adapter and shell without rewriting the app.

The web host lets people use Ark without installing VS Code, while keeping the
extension available for those who already use it. A standalone desktop host
remains a shell and adapter choice rather than a reason to fork the app.

### D-L04 — The source editor is retired

Profile Studio has been removed. Authored C defaults are edited directly in the
firmware repository and validated by its host tests and introspection tools.
Ark edits device profiles and does not import or export C source.

### D-L05 — The keycode catalog is vendored, not parsed

A build step (`npm run keycodes`) reads QMK's `*.hjson` keycode files once and
emits a checked-in JSON catalog inside Ark, stamped with the QMK
version it came from. Keycodes arrive in the profile keymap domain as `uint16`, and the app
needs both directions without a firmware workspace. Vendoring also turns QMK
version drift into a diffable file rather than a silent behaviour change.

The same step also reads the layout extras' shifted US symbols (`S(KC_1)` is
`KC_EXLM`) and the keyboard's own keycodes from `enum charybdis_keycodes` in
`keyboards/bastardkb/charybdis/charybdis.h`. Those take their QK_KB slots under
the header's short name (`DRGSCRL`), with the long name and `QK_KB_n` kept as
aliases. The `QK_KB` range is fixed by QMK and the keyboard code, not by the
userspace action ABI, so these keys need no matching vocabulary. Their drag
scroll is the keyboard code's own, at a fixed `CHARYBDIS_DRAGSCROLL_DPI`, which
the Pointing modes settings do not reach. Drag scroll is the `PD_SLOT_0`
pointing mode, so the picker does not offer `DRGSCRL` or `DRG_TOG`; a key
already holding one still reads back as "Built-in drag scroll".

A name the catalog gives a key must be what the key does wherever it is
placed. A key or a combo output runs QMK's full key handling, so any keycode
works there. A behaviour sends QMK and keyboard functions (keycodes past the
layer keycodes and below the user range: the DPI and sniping keys, RGB Matrix,
Magic, `QK_BOOT`) as a synthetic QMK record, so they run as on a key, and says
so (Profile Wire 1's feature bit 15; every Profile Wire 2 firmware does). A key whose own keycode is one keeps a
plain key's fallback hold: with only a double-tap branch on `SNIPING`, holding
it still holds sniping, as with no behaviour at all.

The picker offers only what does something on this keyboard. It leaves out
retired user macros and inert `QK_USER_0`–`QK_USER_31` entries, the Charybdis
drag scroll and unnamed `QK_KB` slots, and
keycodes for QMK features the build does not include (MIDI, audio, RGBLight,
Caps Word, Repeat…); see Open Issues. A key that already holds one still reads
back by name.
VIA macro slots appear as `VIA_MACRO_0`–`VIA_MACRO_127` throughout the app.
Their QMK numeric identities still round-trip, but the picker does not offer
duplicate `QK_MACRO_n` names from the first 32 slots.

### D-L09 — Ark owns a canonical profile format, not `.c`

Backup, restore, sharing and version control go through the portable profile.
`.c` import and export remain outside Ark. This amends the product goal,
which listed the C files as an import source and export target of the control
software; honouring that would drag C parsing and the repository dependency
back into the app.

### D-L10 — Ark is layered, and the layering is enforced

`core/` is split into `transport`, `schema`, `protocol`, `model`, `session` and
`data`, with imports pointing one way and `tests/` mirroring it. The webview
never imports `core/`; it renders the model the host posts, so the core runs in
plain Node and the UI stays replaceable. The rules and where new work belongs
are in [`AGENTS.md`](../AGENTS.md).
The structure exists because the thing it replaced was a 14,539-line file that
grew one convenience at a time.

Type-only dependencies follow these same rules. Shared declarations for posted
panel data live outside core in `contracts/` (D-L59), so the interface can share
the host's contract while remaining independent of the core.

### D-L11 — Current state comes from the keyboard, including compiled defaults

The app parses no C file and reads no repository file at runtime;
`tests/layering.test.js` fails if a `core/` module names one. A keyboard with
nothing committed still runs its compiled defaults, which Profile Wire value
`0x05` serves over the same page layout as the committed payload. If the
flashed firmware was built from different data than the repository holds, the
app shows what is flashed. Compiled defaults are labelled as such; generation 0
reads as "no committed profile".

Compiled defaults are authored data in the keymap files: layer names beside the
layouts, each macro's name beside its payload, a combo's own window on its row
(`COMBO_WINDOW`), and LED groups kept for later in `rgb_config.c`. Userspace
only serves them. With nothing stored, the settings readback reports those
names and the combos run with those windows; saved LED groups ride in the
compiled RGB domain. A stored profile keeps its own.

Two pieces of keyboard-definition data ship with the app because no device
command exposes them: the vendored keycode catalog and the Charybdis layout
matrix. Neither carries configuration; they only decode what the device sends.

Readback is tested through the posted model and rendered controls, not just
the byte decoders: passing codec tests once coexisted with a profile that never
reached the UI. Semantic links to native keycodes are enabled only for a known
action ABI advertised by the keyboard. Layer preview membership follows the
firmware: transparent and no-action keycodes are unmapped whatever their alias.
Every decoded `uint16` must encode back to its original value. Zero timing
values stay visible, with the unreported firmware default stated. Recorded
device bytes are test-only fixtures, never runtime data.

The Configure screens reveal the keyboard only after the complete portable
read has opened an editable draft. One coherent capture supplies layout,
macros, base lighting and every profile domain. Independent reads remain
available for diagnostics after a capture failure, behind one loading state.
Every screen menu is disabled during that read. Afterwards, Configure requires
an editable draft; Backups requires complete-profile support; Keyboard requires a connected
keyboard that reported its capabilities.

### D-L12 — RGB rule identity and preview appearance are separate

Pass-through is a layer paint operation, not a colour. Base RGB comes from
Profile Wire settings scalars 21 and 22. Brightness is absolute HSV (0–255),
just like layer colours; the reported keyboard limit constrains editing and
never rescales a read. The complete capture uses its already verified settings
for the base preview. A standalone base-lighting read remains optional: a
failure clears that preview without discarding the profile.

The board is a **selected-layer preview**: base plus the selected layer, their
colours in layer order, then their LED groups in reported order, following the
firmware's membership, pass-through and inheritance rules. It is not LED
telemetry: editing respects the reported brightness ceiling, and effects, animation phase,
active layers and transient feedback are not reported. Exact live appearance
would need a future device-frame readout, not host reconstruction.

Colour editors retain every stored channel at zero brightness. A saturated
layer colour at zero brightness paints black; a layer colour with zero
saturation and brightness paints nothing. LED-row inheritance requires all
three channels to be zero. The editor never substitutes the inheritance
sentinel for an explicit black colour.

### D-L15 — A portable profile is the complete effective configuration

Export and import own the whole keyboard snapshot. Flashed and committed
domains are materialized into the same document from device reads: every
matrix position, all 128 macros and their names (D-L25), RGB, behaviours,
effective combos, pointing slots, global settings and layer names. Missing and
explicitly empty domains mean different things; a complete file carries every
domain and never falls back to destination authored data. Domain contracts are in
[portable-profile-v1.md](../upstream/firmware/docs/architecture/portable-profile-v1.md).
Ark owns the JSON envelope: document version 5 has exactly `format`, `version`,
`keyboard`, `actionAbiDigest` and `profile`. `profile` is the complete canonical
schema-4 blob in base64, all seven domains once. Keymap and macros are decoded
views, with edits replacing their domains. The UTF-8 file limit is 196,608 bytes,
enough for a 130,048-byte blob and its JSON envelope. Earlier separate-field
files, including document version 4, are refused without conversion. Unrelated
edits preserve optional unused macro-tail bytes; replacing macro content
reclaims that capacity when calculating shared profile headroom. The
imported spec's historical portable-document section describes that retired
client format; it does not define Ark's version-5 envelope.

The standard image reserves 16 layers; base stays at index zero and the app
moves overlays and rewrites references together. The action ABI describes the
engine vocabulary independently of authored rows, so empty and populated
builds advertise the same ABI. The old five-layer snapshot bridge is retired
(D-L40). Ark edits current portable snapshots and refuses older ones (D-L54,
D-L64). No firmware is flashed by the app.

Choose profile and dropping one file onto the Import profile card open the
same validated review in both hosts and in the demo. Dropping is available only
when Import is editable; multiple, unreadable and oversized files are refused
without changing the draft. File drops never navigate away from Ark.

Before a file becomes the draft or is restored, its card compares it with what
the keyboard holds, since that is what applying it would write, counting the
differences by what they configure: Keys, Lighting, Macros, Mouse and Pointing
modes (anything else under Other), each with added, changed and removed
totals. It names no single difference; that is the draft's review. A file
identical to the keyboard says so, and can be used only while the draft has
edits: using it then puts the draft back to the keyboard's profile, as
**Discard all** does. A file carries no layer order, so it is compared slot by slot. See
`importDifferences` in `core/session/panel-session.js` and `categorySummary`
in `webview/view/review.mjs`.

### D-L19 — One whole-profile draft and review

A complete device snapshot seeds one window-local draft. Its single profile
blob contains all seven domains (D-L15); editors use decoded domain views.
Every editor, import and layer edit updates it, with one undo history. Keep does not write HID.
Each frozen history entry holds its document, edit origin, label, time and
layer order together; branching and trimming move the whole entry, while its
document retains its cached decode.
Apply requires the exact reviewed draft revision and the matching connected
device; draft revisions are never device generations. Unfinished forms survive
keeping another section and re-reading the device; undo, redo and review
require them to be kept or discarded first. An external change preserves the
draft and blocks a stale Apply; **Review against the keyboard** compares it
against a fresh read and never silently merges. A failed complete capture
leaves independent diagnostics and opens no editable draft or complete backup.
Export captures what the keyboard runs,
not unapplied changes. Closing the editor loses the draft.

In Live + review (D-L65) and Live (D-L66) the same draft is the keyboard's
working copy: its history moves only when the keyboard confirms an edit, review
compares it with the saved profile, and Save replaces Apply (in Live the
keyboard saves by itself). The rules above for review, checks and recovery
copies hold for every mode.

### D-L20 — Differential Apply

Apply checks the reviewed capture's live profile and settings identity before
saving its recovery copy, then checks again under the acquired candidate lease.
It reuses exact verified active-profile ranges with the source kind, origin,
generation, CRC32 and FNV digest, and streams changed bytes in bounded batches.
Reconstructed or edited target bytes never seed the readback cache. A missing
or mismatched source falls back to a full upload. Firmware validates the complete
candidate and publishes one new generation on both halves. Refresh and Export
remain independent integrity reads. There is no second store, VIA staging,
ACCEPT wait or USB-half roll-forward (firmware D-F31).

### D-L23 — Apply shows its steps, and a failure says where, why and what was saved

Apply and readback expose their actual steps, and a failed Apply retains its
step, the keyboard's reason and whether anything was saved. Progress updates
must preserve the visible editor and remain bound to the operation that made
them. A complete coherent capture opens the draft; fresh integrity checks and
exact stored bytes remain required wherever the contract calls for a new read.

After the decision, a failure also says what ends it: the keyboard finishing
the same generation by itself once both halves are connected, or, when it reports lost split
authority or a concurrent commit, a restart by unplugging and replugging it.
Each half keeps running a complete generation until activation; Ark never
claims that a removed VIA input fence is holding keys.

This makes a slow or failed operation explainable without allowing progress
traffic or cached authored bytes to change the draft's meaning. The detailed
contract is [Profile capture and operation progress](architecture/profile-capture-and-progress.md);
the user flow is in the [guide](GUIDE.md#applying-changes).

### D-L26 — Macro slots share one visible memory, and every slot says what fits

All 128 slots share the profile’s remaining space, subject to the macro-domain
limit the keyboard reports (34,903 bytes on current firmware; a key tap takes 3 bytes, ASCII text
1 byte per character, Unicode text its UTF-8 bytes). The keyboard plays a
stored macro in 512-byte windows (streaming macro playback,
firmware D-F14; Profile Wire 1's feature bit 27, part of the base since D-F28), so the only limit on one macro is the free memory.
Reviewing a retained draft against a reconnected keyboard adopts its reported
capabilities and invalidates the draft's cached decoding and checks before
editing resumes.

A portable profile stores macro streams, not a bank size. Apply encodes them
with their terminators in domain `0x70`, subject to the destination’s domain
limit and the remaining whole-profile capacity; a
profile's fingerprint covers the streams, so the same macros match across bank
sizes.

The primary macro editor is an ordered list of editable Text, tap/chord, delay,
press and release steps, shown as fixed-size sequence tiles. Empty macros start
with no steps; direct add actions create Text, tap/chord, delay, press or release
steps. Text preserves literal braces, whitespace and Unicode without exposing
command syntax. A Raw payload toggle beside the add actions exposes raw commands
that round-trip to the same steps. Incomplete step fields
remain local instead of being silently removed or coerced. Unparseable raw input
is retained whole and blocks step editing so rebuilding a partial parse cannot
lose its tail. Text fields contain long input without overlapping feedback or
controls. Recording appends commands to the same escaped payload.

Live inspection uses the production macro codec and the same playback, setup
and bank limits as staging (`model/macro-input.js`, called by `macro-editor.js`).
The panel loop answers `validateViaMacro` with `macroValidation`, correlated by
slot, exact payload, request id and draft id/revision, without staging, history,
toasts, device calls or a full model redraw. The interface also checks its
current inspection context (host setup, slot bytes and bank space) before using
a reply. Valid completed edits post the existing `updateViaMacro`; rejected
input and its feedback remain local. Field input updates feedback without
replacing the field, preserving native editing and composition.

Every empty slot keeps room for ten key taps (30 bytes); when free memory
cannot keep that for every empty slot, the highest-numbered empty slots are
unavailable and cannot be edited until space is freed. The firmware does not enforce the reserve, so the
app reports the remaining shared space after every profile edit. The current settings version gives every macro
name up to 32 UTF-8 bytes, following the shared counted-name contract; see the
[portable profile](../upstream/firmware/docs/architecture/portable-profile-v1.md).

The keyboard accepts canonical UTF-8 text and settings
scalar 27’s Host settings: bits 0..1 select Auto/macOS/Windows/Linux; bit 8
independently enables Unicode. Text and backups preserve exact scalar
sequences. Settings → Host owns both
controls and shows detected/effective OS from the
keyboard’s GET 0x0B readback. Auto follows that USB guess, with manual override
and unknown fallback; it cannot confirm input setup. The macro screen links to
Host settings. Both choices participate in draft review and history.
Detected OS metadata is volatile: a complete Read keyboard refreshes the
current draft and its presentation caches without changing stored edits,
history, revision or conflict fingerprints. Saved OS overrides remain part
of the document and take precedence over that metadata.
Scalar 27 also holds the keyboard layout (bits 16–23, with bit 24 for a
macOS ISO keyboard); see D-L56. Profile Wire 1 announced these with feature
bits 21 and 22; every Profile Wire 2 firmware has them (firmware D-F28).
See the [guide](GUIDE.md#text-macros). Physical host insertion remains
an acceptance requirement, separate from codec and UI verification.

### D-L29 — The review lists items, discarded in the groups their edits made

The review lists one item per thing that differs from the keyboard: a key on a
layer, a layer's name, a behaviour, a combo, a macro with its name, a settings
section, a pointing slot, or one lighting record (LED groups and the rows that
paint them are one record, since rows name groups by id). An item says whether
it was added, changed or removed and lists only the fields that differ, in the
editors' words. Fields compare what is stored, not what is shown, so a changed
default or a renamed layer is one item where it was made. Colour reads as in
the editors (D-L31). The draft's change count counts items. **Show** opens the
item where it is edited; a removed item has no Show.

Combo numbers are packed positions. When the only net combo difference is one
removed row, review and history show that removal as one item and explain that
later combos move up one number. Discard reinserts the row at its former
position. If another combo also changed, review keeps the positional differences
visible rather than attributing them all to the deletion.

An item is also the unit **Discard** puts back, as one more undoable step. The
items one staged edit changed belong together, so a key swap or a moved
behaviour is one block with one Discard, titled by the edit that made it; a
later edit touching two groups joins them. Every item is listed under its own
area in rail order; a group spanning areas shows its part in each, and each
part's Discard takes back the whole group. Rebases, discards and steps that
fell out of the bounded history link nothing. A discard from a current review
keeps it current; once nothing described is left, the draft is the keyboard's
profile again, including bytes no item describes. A recovery review is
discarded whole or not at all. See `core/model/profile-review.js`,
`core/model/profile-revert.js`, `ProfileDraftSession.changes()` and
`webview/view/review.mjs`.

**Layers are compared by identity, not by slot.** Beside every history entry
the draft keeps which keyboard layer each slot now holds, set by Rename & Reorder
from the order it saves and never inferred from names or contents, which two
empty layers or a swap that also swaps the names would fool. The review
compares the draft with the keyboard's profile rearranged into that order, with
every layer reference following. So a reorder is one **Layer priority** item,
one row per layer that moved; everything else is compared layer with layer.
With "Keys follow their layers" off, keys that kept their numbers now reach a
different layer and are listed as the changes they are. Discarding the order
moves the layers back and keeps every other change; undo and redo carry the
order with their entry; a rebase keeps it; an import, a discard of the whole
draft and an Apply start again from the keyboard's order. Group links are kept
by layer, not by slot, so a later reorder does not tie two layers' keys
together. See `core/model/layer-order.js`.

### D-L30 — The draft shows itself where it is edited

Every editor marks what the draft changed with the draft's amber dot: a key, a
layer chip, a tab, a behaviour or combo row, a slot, a colour row, a settings
section, and the header of a folded group holding a change. The marks come from
the same review items (`draftMarks` in `webview/view/review.mjs`), so the two
never disagree.

**Discard all** is one more draft step: undo brings every change back, and the
keyboard is not read again, except for a draft out of step with it, bound to
another keyboard, or a recovery. Undo and Redo name the step they take back or
bring back. **Draft history** opens every step newest first, each with when it
was made and what it changed from the step before (not from the keyboard, as
the review compares); going to a step is several undos or redos at once. The
host sends the steps only while the sheet is open. The commit bar has one way
on, **Review and apply**, and says what the draft holds ("4 added · 10 changed
· 1 removed").

### D-L31 — One mark per thing that has a colour

Each thing with a colour of its own has exactly one mark, drawn by
`webview/ui/marks.mjs` wherever the thing is named:

| Thing | Mark |
| --- | --- |
| A behaviour tier (tap, hold, long hold) | the dot the keyboard flashes when it resolves |
| A tap count (2× and up) | its branch badge, in its tap-branch colour |
| A layer | its layer colour |
| A pointing mode | the light its slot paints |
| A combo | its badge, in the combo feedback colour |
| A lighting stage | its on/off dot |

A thing is marked where it is the subject and where it is only referred to: a
setting names what it governs (`governs` in `core/model/settings-editor.js`),
so its mark appears in Settings, in the editors' fields and in the review
alike. A stage that is off draws its marks off. A colour is the keyboard's own,
so a dark one reads dark.

### D-L32 — Things sit in fixed places

Repeated elements reserve fixed positions, and the interface distinguishes
stored placements from routes in a composed layer view. Shared reach sections
keep their identity across the workbench tabs.

Stable positions let people compare rows and switch editors without losing
their place. Keeping storage and activation distinct prevents a preview from
misreporting what an edit changes. Rendering and reach rules live in
[Interface rendering and rule ownership](architecture/interface-contracts.md#fixed-positions-and-composed-reach);
the [guide](GUIDE.md#the-interface) describes the workbench.

### D-L33 — One home for each rule the app needs twice

Every shared rule has one owning module, and the host publishes its meaning to
the interface. Screens do not rebuild vocabulary, device policy or draft state.

Duplicated knowledge drifted: stored values had different words in review and
screens, the pointing keycode registry was written six times, a dirty draft was
decoded 10–16 times per publish, and the host sequenced Apply itself. The ownership
contract is [Interface rendering and rule ownership](architecture/interface-contracts.md#shared-rule-ownership);
[AGENTS.md](../AGENTS.md) governs dependencies and where new work belongs.

### D-L36 — The review checks reachable actions and save blockers

A layer can lock with nothing left to release it: `TG(n)` on Base when layer n
covers that key and has no `TG(n)`, `TO(0)` or `LOCK_LAYER(n)` of its own, a
chain of locks where the second hides the first one's way out, `TT()`'s fifth
tap, a behaviour branch or combo that locks. The firmware has no timeout and no
"clear all" key, so only unplugging recovers it. The keyboard cannot refuse
such a profile, and should not: the rules are the person's to break. The app
says so before Apply instead.

`core/model/layer-reach.js` walks every state a profile can reach from a
keyboard at rest, a set of locked layers with any layers held on top, resolving
every key as the firmware does and following each key's own layer action, its
behaviour branches, the combos that match the highest layer on, and the
trackball waking the pointer layer (unless the sniping layer keeps it off). A
**trap** is a set of locks it can reach from which Base cannot be reached once
every key is let go. It also reports, as warnings and notices, a layer with
keys that nothing reaches, a layer key onto a layer with no keys of its own,
transparent and `KC_NO` keys on Base in separate notices, a pointer layer that
cannot work, and layer keys the keyboard leaves to QMK (`DF()`, `PDF()`, a layer
past the bank). A combo whose reference differs from the highest active layer
uses the reference's raw keys; otherwise its inputs come from the resolved
active stack, including keys inherited through transparency. A combo is warned
about when no reachable stack can supply all its inputs. Holding is not limited
by fingers and a one-shot counts as a hold. The first four trapped lock states
have paths; any remainder is counted explicitly.

`core/model/profile-checks.js` adds whole-profile findings for bindings that
reach empty pointing slots (keys, behaviours and combo outputs), macros too long
for the keyboard's playback engine, and destination brightness or lighting
effects the keyboard would refuse. The latter are **blockers**: review shows
them, disables Apply, and the host refuses Apply before writing a recovery copy.
Other invalid data is still refused by its editor, profile decoder or save
preflight rather than offered for confirmation.

The draft reports its findings beside the keyboard's, both in the draft's
layer order, so each is **new**, **on the keyboard** or **fixed** by the draft.
Per-key findings include the key and code in their identity; grouped empty-key
notices include their positions, so replacing one issue with another on the
same layer does not call the new one existing.
The review lists them first, under Checks, each with the steps into it, the way
out and Show. Active warnings have orange backdrops; traps and blockers are red;
fixed findings stay quiet. Every warning or trap the draft keeps asks for
confirmation, whether the draft made it or the keyboard already had it: Apply
turns into "Apply anyway / Go back", and the host refuses to start an Apply of
such a draft unless the message confirms it. Notices and fixed findings do not
ask. Confirmation is tied to the reviewed draft revision, so a changed draft
must be reviewed and confirmed again. A new warning or trap points to a draft
edit group only when its source is unambiguous: one group in the draft, or an
unowned layer key changed at that exact position. The source group is marked
in the review, and the check links to it. A check already on the keyboard has
no draft source; checks with several plausible edits do not guess.

Two firmware facts were settled on the way. QMK's auto-mouse kept a lock of its
own on `TG()`/`TO()` of the pointer layer that `TO(0)` never released; the
runtime now takes those flips back and holds auto-mouse on for as long as the
pointer layer is locked (`docs/POINTER_MODES.md`). And a layout key the keyboard
does not own is refused where it is placed, since the keyboard's save check
covers behaviours and combos only; one already on the keyboard is reported, not
refused, so it never blocks an unrelated Apply.

### D-L37 — Any layer can be the base

The base is a slot, not a layer: the bottom one, always on, what every
transparent key falls through to, and what `TO(0)` returns to (layer 0 is the
base in the firmware's lookup, in the RGB base effect and in layer ownership,
so `DF()`/`PDF()` stay refused, D-L34). Rename & Reorder puts another layer
there with **Make base**, which swaps it with the current base, as one
reorder; the base row itself is never dragged, so a drag never changes the base
by accident.

With keys following their layers, the new base and the old one trade roles
rather than follow: a layer key that reached the base still reaches the bottom
slot, so `TO(0)` still goes home, and one that reached the new base now reaches
the old base, wherever it went. The key that held Numbers from Base holds Base
from Numbers, and `TO(Game)` becomes the key that switches back. Following them
instead, as the first version did, turned `MO(n)`, `LT(n, …)`, `TT(n)` and
`TG(n)` into `MO(0)` and the like, which do nothing because the base is always
on. The swap holds whether or not keys follow their layers: with the toggle off,
a key that kept its number would reach whatever took the old base's slot once
it moved on, so the toggle only decides for references to the other layers.
Every other key, behaviour and combo reference follows its layer, as do
names, colours, LED group rows, and the pointer, sniping and combo-reference
settings, which name a layer by what it holds. The startup layers are slots and
stay on the bottom one. On a base swap, transparent physical keys entering the
base become `KC_NO`, and `KC_NO` physical keys leaving the base become
transparent; unused matrix positions keep their stored values. A person
can still deliberately place a transparent key on the base afterwards. If the
old base had no layer colour, it receives the saved base HSV as its own
all-keys layer colour, including when the selected base effect is animated;
an existing layer colour stays as it was. The swap cannot make the new base's
empty keys do something or reach the old base when the
only keys that did sit on the old base itself; the review's checks (D-L36) name
both, count base `KC_NO` and transparent keys separately, and count every layer key that holds or toggles the base, rather than
the reorder inventing a way back. The checks compare the
draft with the keyboard as it is, matched layer with layer through the draft's
order, so what a reorder makes or mends is reported as new or fixed. The
review's Layer priority item names the new base first. See
`reorderLayers` in `core/model/portable-profile.js`.

### D-L44 — The app has its own repository and pinned firmware inputs

Charybdis Ark owns its code, contributor instructions, tests, preview and
catalog generation in an independent repository. The VS Code host remains
unchanged. Firmware test vectors, device contracts and the QMK catalog inputs
live under `upstream/`, with revision and checksum provenance. Ordinary app
commands read only this checkout; an explicit catalog import may read an
external QMK checkout. Imported specifications describe the pinned firmware,
not a second firmware implementation. Updating a device contract requires
reviewed inputs and coordinated firmware compatibility tests. The source
firmware repository and its consumers are maintained separately. See
[repository ownership](REPOSITORY.md) and [upstream inputs](../upstream/README.md).

### D-L45 — Compatibility tests select both implementations explicitly

The developer-only compatibility bridge runs every Ark-owned cross-language
runner in `tests/integration/` against explicit firmware, Ark and QMK Git roots.
It records revisions, dirty state and results without changing runtime or
requiring firmware for ordinary app checks. Protocol changes run the bridge
before merging; UI-only changes use the independent suite. Development pins
any committed firmware revision; a pushed pin names a commit on firmware's
remote `dev`, its trunk, which `--publish` enforces. Firmware `main` moves
only by promotion merges of `dev`, so a published pin stays reachable from both. See
[compatibility workflow](COMPATIBILITY.md).

### D-L47 — The app is named Ark

Charybdis Live is now Charybdis Ark: "Ark" in running text, `charybdis-ark` for
the repository and package, `charybdisArk.*` for commands and
`CHARYBDIS_ARK_ROOT` for the bridge. Ark stands for **Adjust, Review, Keep**:
adjust a draft, review its changes, then keep them on the keyboard with Apply.
"Live" named a feature, live editing, and
read ambiguously as the product; the feature keeps its words (live editing, the
live profile, Live Link). Historical paths such as `tools/charybdis-live/` and
the D-L35 title keep the name they had. VS Code keys an extension's storage by
its identity, so on start Ark copies recovery files saved under
`noah.charybdis-live` and `noah.charybdis-live-v2` into its own storage, never
moving or overwriting one. Portable profiles keep the `.charybdis.json`
extension: it names the keyboard, not the app.

### D-L48 — Gesture timing advice follows firmware capability

Current firmware times gestures from physical presses, owns the tapping of
authored LT(), MT() and OSM() rows and, since firmware D-F27, decides every
LT(), MT() and OSM() key with or without a row, holding every dual-role key at
the dual-role threshold unless its row sets its own. Profile Wire 1 announced
these with feature bits 17, 18 and 31; Profile Wire 2 implies them (D-L64). So Ark gives no advice
about combo buffering or native QMK tap classification, which only firmware
without them needed, and never says who decides a key's tap or hold: the
keyboard always does.
General guidance still explains double hold as press–release–press-and-hold,
the released repeat gap, and tap/hold classification. Firmware buffering can
postpone output even when it preserves physical gesture eligibility.

The firmware owns timing semantics (D-F01 in its direction); Ark consumes the
capability, not source code. Hardware acceptance of a particular firmware build
is separate from recognition of its advertised policy.

### D-L49 — Timing findings constrain the reachability graph conservatively

Timing findings remove only proven-impossible branches from the layer graph.
Unknown paths remain possible. Warnings describe legal but risky relationships;
comfort notices never become validity rules or silently rewrite values.
Built-in branches and inherited defaults are resolved once from the profile and
advertised firmware semantics for the editor and review alike.

A conservative graph avoids invented traps while still identifying locks with
no escape. Bounded checks must report uncertainty rather than claim a proof
they could not finish. The detailed contract and its analysis limits are in
[Timing, built-in branches and reachability](architecture/timing-and-reachability.md);
the [guide](GUIDE.md#timing-checks) explains what the findings mean.

### D-L50 — Ark agrees with firmware by contract; `main` is a released stack

Ark talks to a keyboard, not to a firmware commit: it follows the capability
pages the keyboard answers, and one Ark serves a range of firmware. Ark and
firmware are in sync when the contract agrees, not when commits match. The
agreement check (`npm run agreement`) decodes the pages firmware states with
Ark's own runtime decoder and gating, and requires Ark's BK keycode and layout
inputs and pinned fixtures to equal firmware's (file equality, not commit
equality); keymap values are reported, never gating.

Development tests against Ark's own pins. Ark and firmware release separately,
and together when the contract between them changes (firmware D-F06). A release
must agree with the firmware it will sit next to, retaining compatible older
pins when appropriate; equal commit dates or newest pins are not the criterion.
This permits independent app releases without weakening the published contract.
See [agreement](COMPATIBILITY.md#agreement-with-a-firmware-contract) for the check
and [CI facts](REPOSITORY.md#ci-and-publishing) for when it runs.

### D-L51 — CI runs for releases; agreement judges the other release

Local verification owns development checks. CI runs on promotions to `main`
and nightly, rather than on task pull requests into `dev`. Promotion agreement
judges the firmware Ark will be released next to: firmware `main`, or the
prepared partner for a joint release. The publication command rechecks that
contract before publication. Nightly checks report development drift and
published incompatibility without blocking development.

This keeps the development loop local while protecting the two published
products against contract drift. Cloudflare's Git-triggered page builds and PR
previews are separate from these GitHub Actions jobs (D-L52); Cloudflare's build
result gates publication alone. Job names, partner selection
and branch protections live in [CI and publishing](REPOSITORY.md#ci-and-publishing).
The development and publication process is governed by [AGENTS.md](../AGENTS.md),
which points to the work-queue tools.

### D-L52 — Ark is also a web page

Ark runs in Chrome (and Edge) as a web page, beside the VS Code extension, so
using it needs no VS Code, no checkout and no install. Both hosts run the same
`core/` and panel through the shared host loop (`core/session/panel-loop.js`);
the page's host (`web/`) does over WebHID, in the page, what `extension.js`
does in VS Code. What differs between them reaches the panel in the model
(`model.host`): Choose keyboard, the host's words for connecting, the theme
toggle and the recovery copies. The panel never asks which host it is in.

The page is static files with no server code: `npm run build:web` writes the
complete site, hashed names and all, and after it loads the page makes no
network request (its policy says `connect-src 'none'`). The keyboard is reached
only through WebHID, after the person picks it in Chrome's picker. One tab holds
the keyboard (a Web Lock), as one panel does in a VS Code window; leaving with
unapplied edits or during Apply asks first (a VS Code panel cannot ask, so one
closed during Apply finishes the save before it releases the keyboard); Apply's waits run on a worker's clock, so a background tab does not slow
it. Recovery copies are kept in the browser's storage (IndexedDB), listed on
Backups with Use as draft, Download and Delete each; clearing the site's data deletes them.

A phone gets none of this: the page shows a notice that Ark runs on a computer,
with links to Ark's and the firmware's repositories and to BastardKB, the
keyboard's official seller, and starts neither the host nor the panel
(`web/phone.mjs`). No phone browser has WebHID, and the
interface is built for a computer's screen. A phone is touch only with a screen
whose shorter side is under 600 pixels, decided once as the page loads: a tablet
gets Ark, where it offers the demo, and turning a phone or resizing a desktop
window never swaps Ark out from under a draft.

The page is published by Cloudflare Pages' Git integration, as the folder
the build writes and nothing else: `dev`
to the preview address `ark-dev.ncleroy.dev` for testing, `main`, the
project's production branch, to `ark.ncleroy.dev`. Cloudflare installs the locked
dependencies, builds the static page and publishes it. Testing belongs to local
verification before opening the draft PR and to the release/nightly GitHub
Actions jobs (D-L51); Cloudflare does not rerun those checks. Build tests cover
the static-only output contract, including the absence of Pages Functions and
`_worker.js`. Task branches get
preview URLs in their draft pull requests, and a handoff includes the successful
preview for that PR's head commit. Cloudflare is the automatic publisher;
GitHub Actions continues to own the release and nightly checks (D-L51).
Cloudflare's successful build gates publication; its preview status reports a
published build, not a test-suite result or release approval.
Build configuration and retry instructions live in
[Publishing the web page](REPOSITORY.md#publishing-the-web-page).
The build's `_headers` sends the page's
policy with `frame-ancestors 'none'`, which only a header can set,
`Permissions-Policy: hid=(self)`, `nosniff` and `no-referrer`; the page is
revalidated on every load and each hashed file cached for good, so a release
shows on the next load and never mixes with an old one's files. The demo without
a keyboard is D-L53.

### D-L53 — The demo is a draft with no keyboard behind it

Ark can be explored with no keyboard. The demo is not a simulated keyboard
answering the wire protocol: it is the same `ProfileDraftSession` a keyboard's
read opens, over a profile document, run by the shared host loop, so every
screen, edit, check and review behaves as on a keyboard and both hosts offer it
(`core/session/demo-session.js`). Its document is the bundled demo profile, an
export of a real keyboard shipped as data (`core/data/demo-profile.charybdis.json`,
never hand-edited and never read from a firmware checkout), or a profile file
opened in its place and checked as Import checks one. It runs under the
capabilities current firmware reports (the 32-slot action vocabulary
`0x6fd70b90`, its 16-layer/128-slot limits and keyboard options), held equal to what the fake
current keyboard reports by test.

Inside the session the demo is the draft's device: while `session.demo` is set,
the state the panel answers to is the demo's (`panelState`), in which the draft's
source is present, so the editing gates hold unchanged. What the panel is told
is not a keyboard: `model.device` says Demo with no connection, generation or
halves, `model.demo` says the demo is open, and the panel shows a persistent
strip saying so. What needs a keyboard is refused in core, not only hidden:
Apply and reviewing against the keyboard. Export saves the draft itself, since
there is no keyboard profile to export. Reading or choosing a keyboard leaves
the demo; with edits not exported since, the message must say the panel asked
(`discardDemo`), or it is refused. The demo is offered only with no keyboard
connected and no unapplied keyboard draft, and on a page that cannot reach a
keyboard only where the host says so (`model.host.blocked.demo`).

### D-L54 — Current live formats, and nothing older

Ark's live codecs follow firmware D-F14 and D-F28: Profile Wire 2.0, schema
4.0, RGB 4, key behaviours 2, combos 3, settings 8 (D-L62, D-L63) and sparse
PD 3, keymap 1 and macros 1; 16 layers, 128 VIA macros and 128 custom keys; action vocabulary
`0x6fd70b90` (schema 4's: the firmware folds the schema major into the digest,
so it moved from schema 3's `0x837cf479` with no keycode changed). Every
profile length and offset is 32 bits: the blob's 6-byte domain envelopes, the
payload readback's metadata (layout 2), candidate BEGIN, CHUNK and REUSE, the
candidate status pages and the capability pages. Capability layout 3 reports
the counts that fit a byte on page 1 and the wider ones on page 2: 128 KiB
flash slots, a 130,048-byte payload capacity and a 34,903-byte macro domain.
Candidate status page 0 (layout 2) carries progress and the error id; page 3
says where the error is, and is kept only when its transaction, operation
sequence and error sequence match the page 0 it follows. Candidate uploads
store in format 6, which Profile Wire 2 implies (BEGIN no longer carries it),
with BEGIN bytes 24–31 reserved zero. Each domain is read and written in that one
version (D-L64).

The connected firmware's advertised tap depth governs both behaviour steps
and the RGB tap-branch palette throughout read, edit, history, reorder and
partial Discard. Offline snapshots carry that depth in the counted RGB palette;
import and Apply validate it against the destination's advertised limits.

Import, demo file opening and restore take only backups in these formats; an
older schema, action vocabulary or domain version is refused, never
translated, and malformed input fails without a data-dropping fallback.
Upgrading to firmware that changes the stored format starts from flashed
defaults; backups from before it no longer import. The guide says so.

### D-L55 — Participation controls edit policy, preserving definitions

Ark exposes the firmware's participation contract at every scope: master and
source-layer switches in Settings, enabled/allowed-layer controls on shared
behaviour and combo definitions, and Use behaviour / Join combos on physical
placements. The key inspector explains blocked scopes and navigates from a
transparent inherited key to the placement that supplies its keycode. Controls
stage ordinary profile edits; Review and partial Discard preserve other fields,
Undo/Redo restore policy, and layer reordering moves masks and placement bits
with their layers. Disabling retains definitions and timing. A bypassed native
key falls through normally; a bypassed custom key sends its shortcut, or
nothing without one (D-L63).

The firmware also exposes a default-on global **Combo outputs
use behaviours** switch in Settings → Combos and **Use output behaviour** per
combo. These veto shared behaviour use by generated outputs independently of
chord participation. Native outputs fall through; a custom output sends its
shortcut, or nothing without one (D-L63). Zero-default backups retain the
former opt-in behaviour. Review, history, section Discard, backups, layer
rewrites and reach checks preserve both permissions. See
[interface-contracts.md](architecture/interface-contracts.md#combo-output-behaviour-permissions).

The source-layer and gesture capture rules remain firmware-owned in
[participation-policy.md](../upstream/firmware/docs/architecture/participation-policy.md).

### D-L56 — Macro text is judged against the host's keyboard layout

The keyboard types macro text through a host layout (firmware D-F16): for each
computer layout, which keys type each character, generated from macOS's and
Linux's own layout data and QMK's Windows data. Ark vendors the firmware's
fixture through `upstream/` and generates `core/data/host-layouts.json` from it
(`scripts/generate-host-layouts.js`, rerun by `npm run upstream`); it reads
the fixture's character table and never re-derives it, so what the editor
accepts and what the keyboard types cannot disagree.

Settings → Host offers the layouts of the effective OS, plus US (feature
bit 22). The keyboard types
through the layout whatever the OS, so a Host edit that changes the effective
OS carries the layout along (`followHostOs` in `core/schema/host-settings.js`):
kept if it is US or that OS's, else that OS's layout of the same language, else
US. Detection is not an edit, so Auto never rewrites the layout; Host and the
macro editor warn while the layout belongs to another OS than the effective one. On macOS, Unicode
entry needs the Unicode Hex Input source, so it is a layout choice there, not a
switch; the switch stays for Windows and Linux. The macro editor refuses a
character the layout cannot type unless Unicode entry is available, naming it,
and refuses an ordinary key held across text that needs Unicode entry, as the
keyboard's preflight does. Settings → Host links
to WinCompose's GitHub project with the shared GitHub mark when the effective
OS is Windows and Unicode playback is enabled (Auto follows detection).
When macOS Unicode entry is selected, the Host section warns that an active
Unicode Hex Input source may interfere with Option symbols and shortcuts,
including word navigation. This applies to ordinary keys and key-step shortcuts
as well as macro text. Ark neither switches the host input source nor claims
that its layout choice can preserve the usual source's Option behaviour.
Keys are labelled as the layout prints them
(`core/model/key-names.js`): the layout screen, the picker's board and search,
and Review, from the same data; stored keycodes never change, and US keeps the
catalogue's labels. The picker includes Shift and Option/AltGr legends and
marks dead keys with ◌. Shifted symbols and shortcut base keys follow the
layout; macOS ISO swaps the same key positions in labels as in playback.

Stored macro status, live inspection and whole-profile warnings share
`model/macro-input.js`'s playback analysis, including ordinary holds across text
requiring Unicode entry. Review compares native strokes from the pinned fixture,
Unicode entry and unavailable characters under the old and new Host setup for
each text macro. It lists only changed routes or playback validity,
including ASCII whose native keys change and macOS ISO swaps. These derived
Macros rows use the Host settings unit: discard restores Host, preserving
independently edited macro steps and names. Authored text and explicit key steps
are never rewritten to simulate a layout change. An accepted but unplayable
macro remains a warning, not a save blocker.

### D-L57 — Macro input protection is automatic with a per-slot override

Feature bit 23 advertises per-macro playback protection (firmware D-F17).
The Macros editor offers Automatic, On and Off. Automatic turns on for text
the selected layout cannot type natively and must enter as Unicode, not merely
because UTF-8 contains non-ASCII text. Its effective state follows Host changes,
and Review groups that derived effect with Host; explicit overrides are macro
changes and discard with their slot. Ignored presses are never replayed, and
the explanation distinguishes keyboard-output isolation from a host input lock.
Feature bit 26 extends bit 23 with immediate isolation of already-held ordinary
keys and unrelated keyboard output, so the explanation says that held
modifiers resume and suspended ordinary keys require release and a fresh
press; it does not promise protection from another keyboard, pointing or
consumer/media actions.

The optional canonical prefix belongs to the macro bytes. Text/name edits
preserve it, metadata-only empty slots keep their reserve, and bank accounting
includes its three bytes while playback accounting excludes it.

### D-L58 — Transfer less, validate the complete saved result

Current firmware reuses and streams candidate data (D-F18); both come with a
build that saves (feature bit 1, which Ark requires to Apply). Apply plans changes against the exact raw
active profile retained by the coherent capture, rather than the portable
document's materialized live settings. Domains
are aligned by identity so resizing one preserves reuse of unchanged later
ones. Firmware copies unchanged ranges into its inactive candidate; the host
sends short or changed ranges. A missing or mismatched source streams the whole
profile. Compiled defaults are an
origin-independent reuse source: translate the status page's unused origin to
REUSE's sentinel `255`, keeping generation zero. Committed sources keep their
reported generation and physical origin. The captured status and stale-base
identity remain unchanged.

Streaming admits at most four host chunks before a completion check, still
through the serialized connection. A check proves the admitted prefix's exact
transaction, target digest, length, next offset and operation-sequence advance.
BUSY drains that prefix before retrying the definitely unadmitted suffix. Lost
replies remain ambiguous and are not retried blindly. Full firmware validation,
recovery copies, stale-base checks, both-half durable publication, verification
and fresh post-Apply editor readback remain required. No app-authored bytes seed
the payload reader's verified-read cache; a proven Apply result can retain its
raw target only as the next differential upload's source.

Upload progress separates prepared, uploaded and reused bytes. The legacy
`bytesSent` field remains an alias for prepared bytes; chunk index and count
describe actual host data chunks, excluding reuse commands.

The compatibility bridge exercises Ark's uploader against firmware's production
candidate transaction, dual-slot backend and whole-profile validator, including source
corruption, in normal and sanitizer builds. Its scheduling is simulated; reduced
bytes or exchanges do not establish keyboard timings or physical acceptance.
That probe ends at validation. Firmware's separate host suites cover committed
reuse through the production owner, both-half saving and reboot, with hardware
eligibility supplied by their test adapters. No host test proves hardware acceptance.

### D-L59 — Strict types at the existing seams, source execution retained

Ark uses strict TypeScript checking over its JavaScript sources. The extension
and fixture interface continue to execute source directly; type checking emits
no files and is part of the ordinary app check gate. Every application runtime
module is checked automatically, including new modules. Core, extension,
browser host, renderer and dedicated-worker checks use their own environments.
Developer scripts, shared fixtures and integration corpus generators also
enter strict checking automatically. The preview builder includes the browser
API declarations its imports need, and the independent branch-window tool
checks against its own minimum VS Code version. Individual test cases retain
their runtime checks.

Types describing a module's internal interface live in its owning layer.
Posted panel data has one shared contract under `contracts/`, containing only
inert declarations with dependencies confined to itself. Hosts, core and the
interface may take those types; the interface still imports no core module or
core type. This extends D-L10's layer rules to type-only dependencies without
introducing a runtime connection between renderer and core. The renderer
store and reply handler consume the same published-model and message contracts
as both hosts; pure control builders sit beside the edit builders. Progress
replies keep the existing read/draft identity checks before changing the model.

Types describe application contracts, not proof that device bytes or imported
files are valid. Defensive decoding, canonical checks, stable errors, firmware
compatibility tests and physical acceptance keep their existing responsibilities.
The migration mechanics and the check command live in REPOSITORY.md.

### D-L60 — One draft binding decides editing

Whether the open draft may be changed against the keyboard now is one rule,
`draftBinding` in `core/session/panel-session-state.js`, answered as
`{editable, reason}`: the draft is this keyboard's
(`ProfileDraftSession.bindingTo`: the selected keyboard, connected, over the
connection it was read through), on firmware that holds a complete profile,
current with the keyboard, and nothing is running. The demo's draft is bound
to the demo device, so the rule holds there unchanged (D-L53). The reasons
come in a fixed order, so `busy` means only an operation in progress stands in
the way.

Core refuses by it and the interface offers by it. The router stages an edit,
opens or keeps an import or layer review and routes Apply only for a bound draft; live macro
validation answers to it; Apply's draft checks its keyboard binding again as it
writes. The model publishes it as `draft.editable` and `draft.reason`
(`contracts/panel.d.ts`), and the interface's `writable()`, under `canEdit`,
reads that value instead of recomputing it. A new connection is therefore
refused before any model has marked the draft stale.

Panel controls are registered once in
`core/session/panel-control-registry.js` (`CONTROLS`): their route, draft
identity and binding rule, demo policy, execution phase and named action.
The router, operation wrappers and demo refusals consume those policies;
controller modules implement the actions. History and local macro inspection
remain available before the ordinary busy guard, which refuses work with a
notice rather than dropping it. Read-only recovery paths
remain available without a draft. Closing a browser tab warns for unapplied
edits, an active Apply or an active device restore, rather than every portable
operation. The keyed payload groups in `contracts/messages.d.ts` are inert
posted-data declarations; a registry test holds their control names and routes
to the runtime table. Route sets retained for hosts are derived from it.

Device operation phases have stable IDs (`PHASE` in
`core/model/vocabulary.js`), typed as `PhaseId` in the posted contracts.
Their status labels, read and busy words and write fact live beside those IDs
and reach the interface as `model.vocabulary.phases`. The interface displays
those words; progress correlation continues comparing IDs. The browser's
active-restore warning uses the write fact. Changing presentation words cannot
change routing, progress acceptance or which operation writes to the keyboard.
Apply steps and candidate-transfer progress keep their separate identities.

The same module holds the panel session's compound transitions: opening or
replacing the draft, closing the import review and layer editor together (and
resetting the forms when the keyboard or draft under them changes), a read
beginning and ending, the panel's own operations running, an Apply and its
readback, and the outbox the next model carries once. The other session
modules call these rather than setting those fields together themselves.

### D-L61 — Draft presentation consumes snapshots, device health consumes reads

The editable configuration model is built directly from a complete snapshot
and its matching decoded form (`buildSnapshotModel` in
`core/session/device-model.js`). A publish uses `decodedOf(snapshot)`, so a
frozen draft history entry is not decoded again. Layer positions, names,
behaviours, pointing slots, combos, macros, host layout, settings and lighting
all come from that snapshot; its capture facts supply host detection and
brightness/options limits. Draft presentation takes editability from D-L60's
binding, rather than inferring it from simulated read success.

Building the panel model is a projection: it does not open, close, observe or
mark a draft stale. The panel loop explicitly observes service changes before
publishing their model. Rebase uses that same observation step, so a completed
capture is observed once. A standalone export captures the current keyboard
without replacing the editor snapshot or its views; this keeps an export from
moving the draft's comparison behind the user's edits.

The same module adapts independent device reads for a partial capture
(`buildDeviceModel`). Both inputs share configuration
presentation, but a draft never fabricates a `LayoutRead`, `CommittedRead` or
base RGB read to pass through the device adapter. The keyboard header and
diagnostics use the actual device state throughout; local changes only add
the existing draft subtitle. The demo supplies its own explicit header and
diagnostics (D-L53). A partial capture keeps its independent read-only view
and domain failures even when a dirty draft is retained.

### D-L62 — The keyboard is named in its profile, and its restart is expected

The keyboard's own name is the 273rd counted name in settings domain 0x40
(since version 7; firmware D-F14's name rule: up to 32 bytes of UTF-8, no control
characters), after the layer, macro and custom-key names. Empty means the
firmware's built-in name (QMK `keyboard_name`); the firmware serves the
effective name as its USB product string. Because it is profile data, it is
edited in the draft (`renameKeyboard`, `core/model/keyboard-name.js`), reviewed
as Keyboard name, discarded on its own and kept in backups.

Labels follow one rule (`deviceLabels` in `core/session/device-model.js`): a
listed keyboard is called by the product name it reports, and the connected
one by the name it stores once that is read, so a new name shows as soon as it
is applied. A serial number, or the listed number where the host shows none,
is added only where two labels would otherwise match. The header shows a
stored name alone, and the manufacturer and product otherwise.

After a save that changes the stored name, the firmware's master half restarts
USB by itself once the transaction is idle on both halves, nothing is held, no
macro runs and Raw HID has been quiet for a second. Ark expects it
(`core/session/keyboard-reconnect.js`): the device service records the drop,
and a readback it cuts short, as diagnostics rather than errors; the panel
shows it reconnecting. Waiting for the safe departure has no timeout: held
keys and macros may delay it. Once the connection drops, the panel loop polls
the device list for at most 10 s in both hosts. The web page stops connecting
the first allowed keyboard throughout the expectation.

A known serial number must match (node-hid; the master half's hardware ID
survives the restart); Ark never falls back from a known serial to a name.
Without a serial, Ark remembers the other keyboards listed before the save
and excludes their IDs. It reconnects only to one candidate reporting the new
name, and only when no other keyboard already had that name before the save.
An unknown built-in name after clearing the stored name, or ambiguous identity,
leaves the choice to the person in the keyboard menu. A sole listed keyboard
is not enough to establish identity. Once found it is connected and read
again, and the notice says it is back. Timeout, ambiguity and read failure
notices retain the save result and recovery-copy location.

Firmware compares stored names, so changing the empty built-in-name sentinel
to its explicit text may restart even though the USB product text is unchanged;
Ark expects that too. A recovery restore whose previous name is unreadable may
also restart, so Ark expects it conservatively. Reading or choosing a keyboard
during the wait ends it; this also ends an expectation if a repaired keyboard
kept its name and never needed to restart.

In the live modes the keyboard runs its working copy, so a live edit, undo or
Revert that changes the stored name restarts USB the same way, without a save;
Ark expects that restart after each such edit as it does after a save. The
host lists the keyboard again as a new device, but the draft is not left
behind with the old one: a live read naming the draft's edit session, which
the keyboard chooses afresh at every boot, is the same running keyboard, so
the draft follows it with its history, and the rename can be reviewed, saved
or reverted (before 2026-10-19 it said the draft belonged to another keyboard
and offered only Discard).

**A keyboard lost unexpectedly** is followed the same way where nothing else
would notice it come back. When a request goes unanswered past its timeout,
Ark closes the connection but the keyboard stays plugged in; when a keyboard
drops off USB in a host that shows serial numbers (node-hid), its serial
identifies it on return. In those cases the device service records which
keyboard it was and what happened, and the panel loop waits up to 10 s for it:
the same listed device if it never left, otherwise by serial or unshared
product name as above. A web page follows Chrome's own connect events for a
keyboard that dropped off, as before. Ark connects it again,
reads it and says what happened ("did not answer within 1000 ms",
"disconnected"). It does this at most once in 30 s; a keyboard that fails again
sooner is left to the person with the failure shown. The diagnostics name the
first bytes of the request that went unanswered.

### D-L63 — A custom key's shortcut is its own action

Firmware D-F26 gives each custom key an optional shortcut, stored in settings
domain 0x40, version 8: 128 two-byte records after the layer records, custom
key 0 first, each an 8-bit HID report modifier mask (bit 0 Left Ctrl … bit 7
Right GUI, any combination) and one key, none, a basic key `0x04..0xa4` or a
mouse button `0xd1..0xd8`. Both zero is no shortcut; modifiers alone and a key
alone are shortcuts. Ark reads and writes version 8 only
(`core/schema/settings-domain-v1.js`): a keyboard or backup storing settings 7,
from before D-F26, is not current firmware and is refused (D-L64).

The shortcut is edited on the Custom keys screen beside the name, through the
custom key editor (`updateCustomKeyShortcut`, `core/model/custom-key-editor.js`):
key and modifiers both in the keycode picker, as any key is set on the Keys
screen: the key limited to what the firmware accepts, the modifiers in its row.
In this `shortcut` mode the row's eight modifiers mix sides, which a single
keycode cannot, and the choice is a mask and a key (`shortcutPick` in
`webview/view/custom-key.mjs`). The keycode picker folds modifier buttons and
a clicked modifier key into one set (`modifierPick` in
`webview/view/keyvalues.mjs`) and stores the simplest keycode that holds it:
one modifier as the key, wrapped in the others while those are on one side.
Only a set with two or more modifiers on each side, or a key with modifiers
from both sides, needs more: a keycode field's picker (a layout key, a
behaviour cell, a combo output) then offers a custom key for it
(`shortcutOffer`, `customKeyChoice`). One that already has exactly that
shortcut and no behaviour is used. Where the field runs the custom key's
behaviour too, a layout key or a combo output, a match with a behaviour is
offered beside a new key and the person chooses; a behaviour step sends only
the shortcut and never chains a behaviour, so there any match is used.
Otherwise the first unused custom key (`unusedCustomKey`) is named and given
the shortcut by one `updateCustomKeyShortcut`, whose `then` carries the layout
or behaviour edit that uses it, staged in the same draft step. A combo output
is made at once and saved with its combo.
Review shows it as the custom key's Shortcut field, discarded with its name.
It is named in the host's words (`shortcutLabel`, `core/model/key-names.js`)
wherever the key is described: the screen, the picker's tip, the board's hover
card, the combo editor and the key inspector.

Because the shortcut is the key's own action, its behaviour row works on top:
the built-in tap and fallback hold of a custom key with a shortcut are the key
itself, shown as its shortcut, exactly as a plain key's are its keycode
(`builtInActions`). A bypassed custom key, on a placement or as a combo
output, sends its shortcut, or nothing without one, and Ark words it so. A
behaviour step may now send a custom key as a tap, press-and-hold or other
hold (`placementProblem`); it sends only that key's shortcut, never its
behaviour, so behaviours never chain. The firmware does not check that such a
step's key has a shortcut; Ark warns in Review
(`shortcutlessCustomKeyStep`, `core/model/profile-checks.js`) rather than
refusing what the keyboard accepts.

### D-L64 — Ark supports only current firmware

Ark reads, edits, applies and restores only what the current firmware release
stores and reports, and converts nothing. Firmware and Ark are one stack
(D-L50): each Ark release is built against a firmware release, and an older
keyboard is updated rather than accommodated.

What current firmware is lives in one place per kind:

| What | Current | Where |
| --- | --- | --- |
| Profile Wire | 2.0, exactly | `PROFILE_WIRE_V1` in `core/protocol/profile-wire-v1.js` |
| Profile schema | 4.0, exactly | `PROFILE_BLOB_V1` in `core/schema/profile-blob-v1.js` |
| Domain versions | RGB 4, key behaviours 2, combos 3, settings 8, PD 3, keymap 1, macros 1 | `core/schema/profile-domains.js` |
| Store format | 6 (implied by Profile Wire 2, not on the wire) | `PROFILE_CANDIDATE_V1` in `core/protocol/profile-candidate-v1.js` |
| Payload size | 130,048 bytes, lengths and offsets 32 bits | `PROFILE_CANDIDATE_V1`, `PROFILE_BLOB_V1` |
| Action vocabulary | `0x6fd70b90` | `ACTION_ABI` in `core/schema/actions.js` |
| Transport and identity | Firmware-owned Raw HID, usage page `0xFF60`; firmware version in capability page 0 | `core/protocol/profile-wire-v1.js`, `raw-hid-unhandled.js` |
| Portable file | Version 5, one complete blob; 196,608-byte UTF-8 limit | `DOCUMENT_VERSION`, `FILE_MAX_BYTES` in `core/model/portable-profile.js` |
| Feature word | split, saves, pointing (bits 0–2) | `PROFILE_WIRE_FEATURES` |

Keymap `0x60` v1 holds all sixteen layers and sixty matrix positions as
little-endian uint16 values. Macro `0x70` v1 holds all 128 streams in the
existing bank grammar. Effective reads materialize absent domains from the
keyboard’s compiled defaults. The candidate always contains all seven domains;
profile usage and macro headroom include them all.

Apply sends that one candidate and publishes one generation (firmware D-F31).
Capture retains exact active bytes only for differential transfer. Identity is
reported by Profile Wire capabilities; base lighting and key options use
Profile Wire settings and editor metadata. VIA commands, staging, bindings,
separate generations and roll-forward are removed. Macro keycode aliases keep
the historical `VIA_MACRO_n` names; they do not imply VIA support.

The version stands for everything the base does (firmware D-F28): the feature
word holds only what a build genuinely varies by, never a step in the
firmware's history, and a later capability raises the minor version.
`CURRENT_MUTATION_FEATURES` (a split build that saves) is what Apply needs and
`CURRENT_PAIR_FEATURES` all the flashable pair reports, which the demo and
test keyboards report too. `core/session/firmware-support.js` requires them:
reads and `canEdit` need the exact Profile Wire and schema versions, major and
minor; `canEdit` also needs current layers, every domain and the known action
ABI; `canApply` adds a split build that saves; the compatibility diagnostic
lists what a keyboard lacks. Past those gates no code asks whether a feature
is there.

A keyboard that fails them, or stores a schema or domain in another version
(`decodeStoredProfileBlob` and `readSettings` raise `FIRMWARE_UPDATE_REQUIRED`),
is read no further than its identity: no independent reads, no draft, and a
notice to update both halves. A backup in another format is refused at
Import, in the demo and at restore. Independent per-area reads remain only for
current firmware whose complete capture failed.

The next firmware that adds a capability (a new Profile Wire or schema minor)
or bumps a domain version reaches Ark as one change to these tables, its
codec and tests, pinned and released with it (D-L44, D-L50); the agreement
check fails a firmware whose versions are not exactly Ark's, which lacks a
registered domain, or which is not a split build that saves. Profile Wire 2
retired every bit of the earlier feature word (firmware `profile-wire-v1.md`
records what each meant), so a keyboard reporting one is on the previous base
and refused. A firmware update that changes the stored format starts the
keyboard from flashed defaults, and backups from before it no longer import:
schema-3 backups (document version 3, action vocabulary `0x837cf479`) and
schema-4 separate-field backups (document version 4) are refused. Version 5
contains every domain in one blob. The keyboard says so too: Profile Wire state flag 9
means a slot was refused as an earlier store format or retired test layout,
which it neither reads nor converts; the Keyboard screen says it runs its built-in defaults
until Apply saves the current format.

This replaces the read-only display of older keyboards (formerly in D-L63),
the preceding-backup translation (formerly in D-L54) and every per-feature
fallback: ASCII-only macros, US-only host layouts, the 512-byte macro program
limit, store format 4 with its 64 KiB slots and 10,327-byte macro bank, narrow
pages, one-at-a-time candidate chunks, uploads without reuse, missing
settings-limit, option and macro-map pages, the combo-output, click and macro
blockers, and the gesture-timing advice for firmware without physical timing
(D-L48).

### D-L65 — Live + review: edits reach the keyboard at once, Save keeps them

*Builds on firmware D-F32 (working copy, live edits, Save, Revert, edit mode)
and the plan's answers 1–3 and 10.*

**Two modes, one draft.** How edits reach a keyboard is stored on it (Profile
Wire `0x27`) and read with its capabilities: **Apply** keeps the existing
draft, review and Apply; **Live + review**, the default of a keyboard never
set, opens the draft on the keyboard's working copy. Both share the draft
model, review, checks and history; they differ in when an edit reaches the
keyboard and what makes it permanent. Live, the third mode, is D-L66. An
Apply-mode keyboard still running unsaved edits (left by another client) opens
as Live + review, since only Save or Revert can settle them.

**The read.** A live read takes the working copy (GET `0x21`, which pages the
active profile with its session and revision) and the saved profile it began
from (GET `0x04`, or the compiled defaults over generation 0), checked as one
pair by the edit status before and after. Both are materialized from their
stored bytes alone: settings readback now reports stored values (firmware
D-F32), so no readback is overlaid, and a live edit's splices are made against
the keyboard's exact bytes. An Apply-mode read is unchanged.

**An edit.** Every posted edit, undo, redo, history jump, group discard, put
back, import and layer change computes its target document with the same
editors as Apply, then sends the difference: one splice per changed domain,
covering only the bytes between the common prefix and suffix, all in one
revision (so a key swap or a custom key placed in the same step stays one
edit). The draft's history moves only when the keyboard confirms the edit; it
shows as made on both halves only when the other half holds the same revision.
An edit too large to stage beside the profile is sent as a whole replacement,
which needs nothing unsaved. A target that is exactly the saved profile, while
the keyboard holds a working copy, is sent as Revert instead: an edit would
leave a working copy identical to what is saved, reported unsaved ("Unsaved
edits match what is saved", keyboard check 2026-10-19), which Live would save
again as a new generation of the same bytes. The history records the step as
it would an edit. A refused or stale edit is said and the keyboard
read again; a read that finds the same working copy keeps the history,
anything else (another client, a restart, a Save elsewhere) starts it again
from what the keyboard has, with no provenance invented, and says so. The
same working copy read over a new connection keeps the history: the keyboard
vouches for it by its session and revision. A lost answer ends the
connection; reading again shows whether the edit landed; nothing is replayed.
After a reconnect, an edit Ark left half sent (the keyboard still receiving
it) is aborted rather than left to its 15 s lease, and its transaction id is
never used again on that connection. A read waits while the keyboard is still
taking an edit (a held key keeps it from a safe boundary) and is never
trusted until the edit status is idle; past 30 s the draft stays to be read
again. Ark records the bytes it sent as the keyboard's (a replacement's own
bytes, a splice edit's result) and checks the keyboard's working copy has
their length (edit status page 2), reading it again if not.

**Traps.** Before sending, the edit's checks are compared with the working
copy's: a new trap or warning waits as a proposal the person sends anyway or
drops (plan answer 2); a new blocker is refused. Save confirms the review's
traps and warnings exactly as Apply does.

**The other half.** An edit shows as on both halves once the other half
holds its revision. Until then it is catching up: the next edit waits for it
(BUSY) up to 30 s while the other half answers, since after a refusal the
master half sends it the whole working copy once, which takes longer than an
edit. Refused again, the halves are apart (edit status flag 11): Ark stops
waiting at once, says the halves run different profiles, and offers Revert in
place of Review and save, because Save and new edits are BUSY until a Revert
or an Apply. A save waiting for a quiet keyboard on either half says so.

**Save and Revert.** Discard all is Revert: the keyboard runs its saved
profile again, one history step that undo sends back when the saved profile
has not changed. Revert checks its returned saved generation and origin
against the cached base; if another client saved meanwhile, Ark rereads the
actual saved profile and starts history there. Save needs the exact
reviewed revision, keeps a recovery copy of the saved profile, then asks the
keyboard to write its working copy as a new generation (candidate REUSE from
the working copy, both halves, the same power-loss guarantees). A replug boots
the saved profile; the next read says the unsaved edits are gone.

**Switching modes** (plan answer 3). The keyboard refuses any mode change
with unsaved edits, so a live draft with unsaved edits asks Save or Revert
first, whichever way it goes, worded for that direction; entering Live +
review with an Apply draft asks Send live or Discard. The question lists the
traps and warnings Save or Send confirms (as review does), so answering it is
the confirmation. Send live keeps the Apply draft until the keyboard takes it:
refused, Ark tries to return the keyboard to Apply and keeps the original
draft even if that return is refused. A kept Apply draft over a live keyboard
stays stale until the keyboard returns to Apply and is read again. Halves
that stored different modes are settled by choosing the same mode again
(**Settle** beside the switch). The keyboard takes a new mode at once and
stores it when quiet; while a write is owed after a failure (flag 12) Ark
says a replug may lose it. A mode Ark cannot read (anything but a firmware
without it) leaves the keyboard in Apply's reads and is read again at the next
status refresh or read.

**Toggles** (plan answer 10). The combos and behaviours toggles a key turns off
are read beside their stored masters (GET `0x22`), in either mode and again
at every status refresh, and shown as **turned off by key** where the master
is edited; they never enter the draft, review or backups. Export in Live +
review captures what the keyboard runs.

Considered: keeping Ark's own pending queue of unconfirmed edits, so typing
never waits for the keyboard; rejected because a refusal would have to unwind
edits made after it, and the keyboard confirms an edit in a few reports.

### D-L66 — Live: the keyboard saves by itself, Ark says so

*Builds on D-L65 and firmware D-F32 (the keyboard's own save, edit status
page 3, status flags 10–13); plan answers 3 and 4.*

**Three modes.** The mode switch offers Apply, Live and Live + review. Their
rules, including what a replug does:

| Mode | An edit | Made permanent by | Replug with edits not yet permanent |
| --- | --- | --- | --- |
| Apply | stays in Ark's draft | review, then Apply | nothing on the keyboard to lose; the draft is Ark's |
| Live | reaches both halves at once | the keyboard, after 3 s with no edit and no key held, with or without Ark | loses every edit since the last successful save |
| Live + review | reaches both halves at once | review, then Save | reverts to the saved profile |

The 3 s is the quiet interval before saving starts, not a bound on possible
loss. Holding a key postpones the save. A failed automatic save leaves that
revision unsaved, and unplugging loses every edit since the last successful
save, however long ago that was.

**Live edits are Live + review's edits.** The same path, trap question, undo
and redo (D-L65). There is no Save and Ark starts no timer: the keyboard's
edit status says when it saved (page 3: an automatic save of this revision and
generation, nothing unsaved), and only that is shown as **saved by the
keyboard**. What is saved then moves to what runs while the history stays, so
undo still sends an edit back (and the keyboard saves that too). A failed
automatic save (page 1's last save failed after Ark's last edit) is shown with
**Save again**, an ordinary Save after a recovery copy, needing no review
since every edit was checked before it was sent; or Revert. A save holds the
profile until it lands, and the keyboard's own starts 3 s after an edit and
takes seconds (about 6 s for a 6 KB profile): an edit made meanwhile waits for
it, within the save timeout, instead of being refused after the ordinary 3 s
busy wait (seen on the keyboard on 2026-10-19, where such edits were lost).

**Looking between edits.** While a live draft is open, nothing else holds the
keyboard and the draft is current, Ark reads the edit status about once a
second (both hosts, through the shared panel loop; the timer never keeps a
process alive). A look that races with an edit is dropped. A look is a
background read: each of its requests waits 3 s, and an unanswered one only
skips that look, keeping the connection; its late answer is set aside, never
taken as another request's. Three unanswered looks in a row mean the keyboard
is lost (D-L62). The web page pauses looks while a `<select>`'s native menu
may be open (Chrome on macOS holds back a page's input reports until it
closes) and while the page is hidden. A press on the select moves focus to it,
so the control focused before loses it just after the press; that is not the
menu closing, only the select losing focus is (on 2026-10-19 that focus
change let three looks go out unanswered and dropped Noah's keyboard). User
operations keep their strict timeouts. It shows the
keyboard's own save and the flags; a revision or mode Ark did not make (an
adjustment key, another app) rereads the keyboard as news, not a failure, in
every live mode. Under an Apply draft the same look notes the keyboard's
session, revision and saved generation, and when its keys changed what it runs
and it saved that, reads it again as Refresh would (an edited draft then says
the keyboard changed, D-L19); an Apply keyboard opened live because it ran
unsaved adjustments goes back to an Apply draft once it has saved them. The
first observation is compared with the successful capture's saved identity,
so it cannot miss a change already saved before the first poll. A transient
`PROFILE_CHANGED` during a reread stays eligible for another automatic read;
a cycle permits three failed captures, then leaves Read keyboard to the
person. Other stale drafts and persistent read errors require manual recovery.
An edit refused STALE for the same reason says "not sent", rereads, and asks the
person to make it again: replaying it on a state they have not seen could undo
the key's change.

**Switching.** The keyboard refuses a mode change while it has unsaved edits,
so: leaving Live + review with unsaved edits, for either other mode, asks Save
or Revert; entering Live or Live + review from Apply with a draft asks Send
live or Discard; leaving Live asks nothing: Ark waits for a save of the
keyboard's own that is running, then has it save what is left (its newest
pair, looking again if a key moved it), then switches. A save Ark asks for
keeps a recovery copy of the actual saved profile as any Save does, including
when an automatic save advanced the saved base since the last capture. Ark
rereads that base inside the flush operation and rechecks the identity after
recovery before requesting Save. A failure (recovery unavailable, halves
apart, a failed save) leaves the mode as it was and says why. The mode answer is acknowledged
once the keyboard reads it back; its write to EEPROM follows when the keyboard
is quiet.

**Closing and losing the connection.** In Live closing Ark, or the link
dropping, is not an error: the keyboard continues saving without Ark, and the
web page asks before leaving only while an edit is on its way. On reconnect
Ark reads what the keyboard kept and says whether edits it knew of were saved
before a restart or lost since the last successful save. In Live + review the page
still asks with unsaved edits, since a replug discards them. What the keyboard
said of its own saving ("saved by the keyboard", saving, a failed save) is
shown only while it is connected; a lost keyboard is connected again by itself
(D-L62).

**Queued key adjustments.** Status flag 13 means a DPI or lighting key change
awaits publication. Live drafts show this while it waits. If Apply BEGIN
answers BUSY, Ark waits within its firmware-aware budget for the flag to
clear before resubmitting BEGIN, with the reason shown in Apply progress.
The reviewed-base identity check still runs after BEGIN acquires admission;
a changed base requires another review, never a silent overwrite.

**Flags.** D-L65's handling holds in Live too, and the look between edits
keeps it current: the other half refusing the working copy (flag 11) is
**halves apart** with Revert (Save, and so Live's own save, is refused); a
save waiting for a quiet keyboard on either half (flags 9, 10) says so; an
edit mode the keyboard has not stored yet (flag 12) marks the switch, since a
replug may bring the previous mode back.

Considered: Ark asking for Save after its own 3 s timer in Live; rejected
because the keyboard already does it with or without Ark, and two schedulers
would race. Considered: retrying a STALE edit on the reread state; rejected
for the reason above.

## Historical decisions

These describe the retired v1 app; their lasting rules are stated in the
decisions above, the [guide](GUIDE.md) and [`AGENTS.md`](../AGENTS.md). D-L01
(branch from `refactor/live_edit`, revert only Studio's shell) and D-L03 (move
`live-link/` into Ark, since layered into `core/` by D-L10) were branch setup
and are complete. D-L16 wired Studio's macro UI into v1 and went with it
(D-L35). The first live app (v1, which lived at the same path) ported Studio's
interface (D-L06). It was frozen by D-L35 and then removed; the profiles it
wrote are an older format, refused like any other (D-L64).

### D-L06 — v1 ported Studio's whole UI and rebuilt only the model source

*Superseded by D-L35.* Studio's webview does no file access: the host posts a
`model`, the webview renders it, and edits come back as typed messages. The
reusable seam was therefore the model, not the widgets, so v1 took Studio's UI
verbatim and supplied the model from the keyboard. The original plan, forking
the presentation and rebuilding the state, misread where that seam sits;
lifting "the presentation" out of 534 functions in one template literal was
impossible. v2 then replaced the ported UI with its own.

### D-L35 — Charybdis Live v2 is the app

*Numbered D-L21 when written, alongside the atomic-Apply decision.* v2 was
built beside v1 as `tools/charybdis-live-v2/`, and took over the plain name
`tools/charybdis-live/` once v1 was removed. It keeps v1's core, its layering and the one rule
(nothing reads the firmware repository), and replaces v1's ported Studio
interface with its own: browser ES modules with pure, tested `view/` modules,
every posted edit built by `webview/view/edits.mjs` and staged against a real
draft in `tests/view/edits.test.mjs`, and a board that shows what the firmware does.
Edits exist only as a reviewed draft; a keyboard the app cannot open a draft for
is read-only, and the host refuses edits rather than writing them directly.
Live + review (D-L65) keeps this: an edit reaches the keyboard's working copy,
which a replug discards, and only a reviewed Save makes it permanent. Live
(D-L66) is the person's choice to let the keyboard save every checked edit by
itself instead. v1
was frozen by this decision and has since been removed. The current core
reads and applies the one-store profile through firmware-owned Profile Wire;
no VIA transport or second-bank writer remains (D-L64, firmware D-F31).
