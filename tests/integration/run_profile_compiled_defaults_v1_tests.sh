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

# Earlier eight-slot profiles remain rejected. The immediately preceding
# 32-slot backup is translated by Ark and admitted by the current firmware below.
for suffix in .pd .pd3 .pd4 .pd5; do
    cp "$ROOT/tests/fixtures/client-regression/portable.bin$suffix" "$BUILD_DIR/portable.bin$suffix"
done

node - "$BUILD_DIR/current.bin" "$BUILD_DIR/translated.bin" "$BUILD_DIR/maximum.bin" <<'JS'
const fs = require("node:fs");
const app = process.env.CHARYBDIS_ARK_ROOT;
const {fingerprint, validateSnapshot} = require(app + "/core/model/portable-profile");
const {editMacro} = require(app + "/core/model/macro-editor");
const {editCustomKey} = require(app + "/core/model/custom-key-editor");
const {CAPABILITIES_32, document32} = require(app + "/tests/fixtures/pd-slots-32");
// Current schema 3.0 with slot 12 configured and all 128 macro/custom-key
// names at their 32-byte maximum, plus the previous backup and maximum profile.
let current = document32();
for (let slot = 0; slot < 128; slot++) current = editMacro({document: current, fingerprint: fingerprint(current)},
    {keycode: `VIA_MACRO_${slot}`, name: `Macro ${slot} name`.padEnd(32, "!"), expectedFingerprint: fingerprint(current)});
for (let slot = 0; slot < 128; slot++) current = editCustomKey({document: current, fingerprint: fingerprint(current)},
    {keycode: `CUSTOM_KEY_${slot}`, name: `Custom key ${slot}`.padEnd(32, "?"), expectedFingerprint: fingerprint(current)}, CAPABILITIES_32);
fs.writeFileSync(process.argv[2], validateSnapshot(current, CAPABILITIES_32).profile);
const {translateBackup} = require(app + "/core/model/backup-translation");
const previous = JSON.parse(fs.readFileSync(app + "/tests/fixtures/previous-profile.charybdis.json", "utf8"));
fs.writeFileSync(process.argv[3], validateSnapshot(translateBackup(previous), CAPABILITIES_32).profile);
const fixture = fs.readFileSync(app + "/upstream/firmware/tests/fixtures/maximum_profile_v3.fixture", "utf8");
const maximum = Buffer.from(fixture.match(/^profile\.hex=(.*)$/m)[1], "hex");
const {decodeProfileBlob, encodeProfileBlob} = require(app + "/core/schema/profile-blob-v1");
if (!encodeProfileBlob(decodeProfileBlob(maximum)).equals(maximum)) throw new Error("Maximum profile does not round-trip through Ark");
fs.writeFileSync(process.argv[4], maximum);
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
        -DVIA_ENABLE \
        -DMCU_RP \
        -DTOTAL_EEPROM_BYTE_COUNT=0x23000u \
        -DQMK_STUB_SUPPRESS_LAYER_COUNT \
        -DQMK_KEYBOARD_H='"noah_real_profile_keyboard.h"' \
        -I"$ROOT" \
        -I"$ROOT/users/noah" \
        -I"$ROOT/tests/host/include" \
        -include "$CONFIG" \
        "$ROOT/tests/host/profile_compiled_defaults_v1_test.c" \
        "$KEYMAP_PATH/keymap.c" \
        "$KEYMAP_PATH/pd_config.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_pd_v1.c" \
        "$ROOT/users/noah/lib/profile/runtime/effective_pd_runtime.c" \
        "$KEYMAP_PATH/rgb_config.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_compiled_defaults_v1.c" \
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
        "$ROOT/users/noah/lib/profile/schema/profile_combo_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_settings_v1.c" \
        "$ROOT/users/noah/lib/profile/storage/profile_checksum.c" \
        -o "$bin"
    if [ "$name" = configured ] || [ "$name" = configured_sanitized ]; then
        "$bin" "$ROOT/tests/fixtures/compiled_profile_pd_v2.fixture"
        for suffix in .pd .pd3 .pd4 .pd5; do
            "$bin" "$ROOT/tests/fixtures/compiled_profile_pd_v2.fixture" --reject-profile "$BUILD_DIR/portable.bin$suffix"
        done
        "$bin" "$ROOT/tests/fixtures/compiled_profile_pd_v2.fixture" --import-profile "$BUILD_DIR/current.bin"
        "$bin" "$ROOT/tests/fixtures/compiled_profile_pd_v2.fixture" --import-profile "$BUILD_DIR/translated.bin"
        "$bin" "$ROOT/tests/fixtures/compiled_profile_pd_v2.fixture" --import-profile "$BUILD_DIR/maximum.bin"
        if [ -n "${NOAH_TEST_PD_IMPORT:-}" ]; then
            "$bin" "$ROOT/tests/fixtures/compiled_profile_pd_v2.fixture" --import-profile "$NOAH_TEST_PD_IMPORT"
        fi
    elif [ "$name" = empty ]; then
        "$bin" "$ROOT/tests/fixtures/compiled_profile_pd_v2.fixture" --empty-profile "$BUILD_DIR/current.bin"
    fi
}

build_and_run configured -DNOAH_PD_PROFILE_ENABLE -DNOAH_PORTABLE_PROFILE_ENABLE
build_and_run configured_sanitized -DNOAH_PD_PROFILE_ENABLE -DNOAH_PORTABLE_PROFILE_ENABLE -fsanitize=address,undefined -fno-omit-frame-pointer
build_and_run empty -DNOAH_PD_PROFILE_ENABLE -DNOAH_KEYMAP_EMPTY_KEY_BEHAVIORS -DNOAH_KEYMAP_EMPTY_COMBOS -DNOAH_PORTABLE_PROFILE_ENABLE

# Keep the materializer available when RGB is compiled out: that variant emits
# the canonical key-behavior domain alone and must remain warning-clean.
cc -std=c11 -Wall -Wextra -Werror -Wno-unused-parameter -pedantic \
    -DNOAH_PD_PROFILE_ENABLE \
    -DVIA_ENABLE \
    -DMCU_RP \
    -DTOTAL_EEPROM_BYTE_COUNT=0x23000u \
    -DQMK_STUB_SUPPRESS_LAYER_COUNT \
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
