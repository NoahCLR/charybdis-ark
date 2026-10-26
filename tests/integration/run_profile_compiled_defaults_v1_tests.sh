#!/bin/sh

set -eu

ROOT="${FIRMWARE_ROOT:?Set FIRMWARE_ROOT to the selected firmware checkout}"
: "${CHARYBDIS_ARK_ROOT:?Set CHARYBDIS_ARK_ROOT to the selected Ark checkout}"
KEYMAP_PATH="$ROOT/keyboards/bastardkb/charybdis/4x6/keymaps/noah"
BUILD_DIR="$(mktemp -d)"
CONFIG="$BUILD_DIR/compile_config.h"

cleanup() {
    rm -rf "$BUILD_DIR"
}

trap cleanup EXIT INT TERM

. "$ROOT/tests/host/noah_host_qmk_env.sh"
noah_host_export_qmk_cpath "$ROOT"

{
    printf '#pragma once\n'
    printf '#include "%s/users/noah/config.h"\n' "$ROOT"
    printf '#include "%s/config.h"\n' "$KEYMAP_PATH"
} >"$CONFIG"

# A profile from before the current format (eight pointing slots, schema 2)
# is refused by current firmware.
cp "$ROOT/tests/fixtures/client-regression/portable.bin.pd5" "$BUILD_DIR/old.bin"

node - "$BUILD_DIR/current.bin" "$BUILD_DIR/maximum.bin" "$BUILD_DIR/combo-permissions" <<'JS'
const fs = require("node:fs");
const app = process.env.CHARYBDIS_ARK_ROOT;
const {fingerprint, validateSnapshot} = require(app + "/core/model/portable-profile");
const {editMacro} = require(app + "/core/model/macro-editor");
const {editCustomKey} = require(app + "/core/model/custom-key-editor");
const {CAPABILITIES_32, document32} = require(app + "/tests/fixtures/pd-slots-32");
// Current schema 3.0 with slot 12 configured, all 128 macro/custom-key names
// at their 32-byte maximum and four custom-key shortcuts, plus the maximum
// profile.
let current = document32();
current = editMacro({document: current, fingerprint: fingerprint(current)},
    {keycode: "MACRO_0", payload: "hello{KC_A}", expectedFingerprint: fingerprint(current)});
for (let slot = 0; slot < 128; slot++) current = editMacro({document: current, fingerprint: fingerprint(current)},
    {keycode: `MACRO_${slot}`, name: `Macro ${slot} name`.padEnd(32, "!"), expectedFingerprint: fingerprint(current)});
for (let slot = 0; slot < 128; slot++) current = editCustomKey({document: current, fingerprint: fingerprint(current)},
    {keycode: `CUSTOM_KEY_${slot}`, name: `Custom key ${slot}`.padEnd(32, "?"), expectedFingerprint: fingerprint(current)}, CAPABILITIES_32);
// Shortcuts Ark writes (firmware D-F26): mixed sides with a key, modifiers
// alone, a mouse button alone, and every modifier with the last basic key.
for (const [slot, mods, key] of [[0, 0x41, 0x0e], [63, 0x0f, 0], [64, 0, 0xd1], [127, 0xff, 0xa4]]) current = editCustomKey({document: current, fingerprint: fingerprint(current)},
    {keycode: `CUSTOM_KEY_${slot}`, shortcut: {mods, key, layers: 0, layerKind: 0}, expectedFingerprint: fingerprint(current)}, CAPABILITIES_32);
fs.writeFileSync(process.argv[2], validateSnapshot(current, CAPABILITIES_32).candidate);
const fixture = fs.readFileSync(app + "/upstream/firmware/tests/fixtures/maximum_profile_v4.fixture", "utf8");
const maximum = Buffer.from(fixture.match(/^profile\.hex=(.*)$/m)[1], "hex");
const {decodeProfileBlob, encodeProfileBlob} = require(app + "/core/schema/profile-blob-v1");
if (!encodeProfileBlob(decodeProfileBlob(maximum)).equals(maximum)) throw new Error("Maximum profile does not round-trip through Ark");
fs.writeFileSync(process.argv[3], maximum);
// The unchanged domain versions admit both output permission bits. Exercise
// Ark-produced bytes through the firmware validator, normally and sanitized.
const {decodeSettings, encodeSettings} = require(app + "/core/schema/settings-domain-v1");
const {decodeComboDomain, encodeComboDomain} = require(app + "/core/schema/combo-domain-v1");
const comboVector = Buffer.from(fs.readFileSync(app + "/upstream/firmware/tests/fixtures/combo_output_behaviors_v1.fixture", "utf8").trim(), "hex");
for (const [name, global, perCombo] of [["global", false, true], ["row", true, false], ["both", false, false]]) {
    const blob = decodeProfileBlob(validateSnapshot(current).profile);
    const settingsDomain = blob.domains.find(domain => domain.id === 0x40);
    settingsDomain.payload = encodeSettings({...decodeSettings(settingsDomain.payload), comboOutputBehaviors: global});
    const combos = decodeComboDomain(comboVector);
    combos.rows[1].useOutputBehavior = perCombo;
    blob.domains.find(domain => domain.id === 0x30).payload = encodeComboDomain(combos);
    const document = {...current, profile: encodeProfileBlob(blob).toString("base64")};
    const checked = validateSnapshot(document, CAPABILITIES_32);
    if (checked.settings.comboOutputBehaviors !== global || checked.combos.rows[1].useOutputBehavior !== perCombo) throw new Error("Permission lost before firmware validation");
    fs.writeFileSync(`${process.argv[4]}.${name}.bin`, checked.candidate);
}

JS

build_and_run() {
    name="$1"
    shift
    bin="$BUILD_DIR/profile_compiled_defaults_v1_test_$name"
    cc -std=c11 -Wall -Wextra -Werror -Wno-unused-parameter -pedantic "$@" \
        -DNOAH_COMPILED_DEFAULTS_TEST \
        -DCOMBO_ENABLE \
        -DPOINTING_DEVICE_ENABLE \
        -DRGB_MATRIX_ENABLE \
        -DRGB_MATRIX_WS2812 \
        \
        -DMCU_RP \
        -DTOTAL_EEPROM_BYTE_COUNT=0x9000u \
        -DNOAH_HOST_PRODUCTION_MATRIX -DQMK_STUB_SUPPRESS_LAYER_COUNT \
        -DQMK_KEYBOARD_H='"noah_real_profile_keyboard.h"' \
        -I"$ROOT" \
        -I"$ROOT/users/noah" \
        -I"$ROOT/tests/host/include" \
        -include "$CONFIG" \
        "$ROOT/tests/host/profile_compiled_defaults_v1_test.c" \
        "$KEYMAP_PATH/keymap.c" \
        "$KEYMAP_PATH/pd_config.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_pd_v1.c" \
        "$ROOT/users/noah/lib/profile/runtime/active_profile_pd_runtime.c" \
        "$KEYMAP_PATH/rgb_config.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_compiled_defaults_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_keymap_compiled_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_macros_compiled_v1.c" \
        "$ROOT/users/noah/lib/macro/macro_payload_parse.c" \
        "$ROOT/users/noah/lib/macro/macro_payload_encode.c" \
        "$ROOT/users/noah/lib/macro/macro_payload_keycodes.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_rgb_compiled_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/key_behavior_compiled_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_combo_compiled_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_pd_compiled_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_settings_defaults.c" \
        "$ROOT/users/noah/lib/profile/runtime/profile_action_runtime_v1.c" \
        "$ROOT/users/noah/lib/profile/runtime/profile_action_placement_v1.c" \
        "$ROOT/users/noah/lib/action/action_kind.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_domain_registry.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_blob_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_reader.c" \
        "$ROOT/users/noah/lib/profile/schema/key_behavior_domain_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_rgb_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_validator_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_keymap_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_macros_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_combo_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_settings_v1.c" \
        "$ROOT/users/noah/lib/profile/storage/profile_checksum.c" \
        -o "$bin"
    if [ "$name" = configured ] || [ "$name" = configured_sanitized ]; then
        "$bin" "$ROOT/tests/fixtures/compiled_profile_pd_v2.fixture"
        "$bin" "$ROOT/tests/fixtures/compiled_profile_pd_v2.fixture" --reject-profile "$BUILD_DIR/old.bin"
        "$bin" "$ROOT/tests/fixtures/compiled_profile_pd_v2.fixture" --import-profile "$BUILD_DIR/current.bin"
        "$bin" "$ROOT/tests/fixtures/compiled_profile_pd_v2.fixture" --import-profile "$BUILD_DIR/maximum.bin"
        for permission in global row both; do
            "$bin" "$ROOT/tests/fixtures/compiled_profile_pd_v2.fixture" --import-profile "$BUILD_DIR/combo-permissions.$permission.bin"
        done
        if [ -n "${NOAH_TEST_PD_IMPORT:-}" ]; then
            "$bin" "$ROOT/tests/fixtures/compiled_profile_pd_v2.fixture" --import-profile "$NOAH_TEST_PD_IMPORT"
        fi
    elif [ "$name" = empty ]; then
        "$bin" "$ROOT/tests/fixtures/compiled_profile_pd_v2.fixture" --empty-profile "$BUILD_DIR/current.bin"
    fi
}

build_and_run configured -DNOAH_PORTABLE_PROFILE_ENABLE
build_and_run configured_sanitized -DNOAH_PORTABLE_PROFILE_ENABLE -fsanitize=address,undefined -fno-omit-frame-pointer
build_and_run empty -DNOAH_KEYMAP_EMPTY_KEY_BEHAVIORS -DNOAH_KEYMAP_EMPTY_COMBOS -DNOAH_PORTABLE_PROFILE_ENABLE

# Keep the materializer available when RGB is compiled out: that variant emits
# the canonical key-behavior domain alone and must remain warning-clean.
cc -std=c11 -Wall -Wextra -Werror -Wno-unused-parameter -pedantic \
    \
    \
    -DMCU_RP \
    -DTOTAL_EEPROM_BYTE_COUNT=0x9000u \
    -DNOAH_HOST_PRODUCTION_MATRIX -DQMK_STUB_SUPPRESS_LAYER_COUNT \
    -DQMK_KEYBOARD_H='"noah_real_profile_keyboard.h"' \
    -I"$ROOT" \
    -I"$ROOT/users/noah" \
    -I"$ROOT/tests/host/include" \
    -include "$CONFIG" \
    -fsyntax-only \
    "$ROOT/users/noah/lib/profile/schema/profile_compiled_defaults_v1.c" \
    "$ROOT/users/noah/lib/profile/schema/profile_rgb_compiled_v1.c" \
    "$ROOT/users/noah/lib/profile/schema/key_behavior_compiled_v1.c" \
    "$ROOT/users/noah/lib/profile/schema/profile_combo_compiled_v1.c" \
    "$ROOT/users/noah/lib/profile/schema/profile_pd_compiled_v1.c" \
    "$ROOT/users/noah/lib/profile/schema/profile_settings_defaults.c" \
    "$ROOT/users/noah/lib/profile/runtime/profile_action_runtime_v1.c"
