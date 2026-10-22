#!/bin/sh

set -eu

ROOT="${FIRMWARE_ROOT:?Set FIRMWARE_ROOT}"
: "${CHARYBDIS_ARK_ROOT:?Set CHARYBDIS_ARK_ROOT}"
BUILD_DIR="$(mktemp -d)"

. "$ROOT/tests/host/noah_host_qmk_env.sh"
noah_host_export_qmk_cpath "$ROOT"

cleanup() {
    rm -rf "$BUILD_DIR"
}

trap cleanup EXIT INT TERM

sh "$ROOT/tests/host/run_contract_probe.sh" --output "$BUILD_DIR/contract.json"

# Ark's live-edit reports through the production edit channel and working
# copy; the probe stands in for the owner between them (live-edit-probe.c).
build_and_run() {
    name="$1"
    shift
    cc -std=gnu11 -Wall -Wextra -Werror "$@" \
        -DQMK_KEYBOARD_H='"noah_real_profile_keyboard.h"' \
        -DNOAH_HOST_PRODUCTION_MATRIX -DQMK_STUB_SUPPRESS_LAYER_COUNT \
        -DPOINTING_DEVICE_ENABLE -DNOAH_PORTABLE_PROFILE_ENABLE \
        -DNOAH_LIVE_PROFILE_OWNER_ENABLE -DNOAH_LIVE_PROFILE_MUTATION_ENABLE -DCOMBO_ENABLE \
        -DTOTAL_EEPROM_BYTE_COUNT=0x9000u \
        -I"$ROOT" \
        -I"$ROOT/users/noah" \
        -I"$ROOT/tests/host/include" \
        -include "$ROOT/tests/host/include/noah_compile_config.h" \
        "$CHARYBDIS_ARK_ROOT/tests/integration/live-edit-probe.c" \
        "$ROOT/users/noah/lib/compat/qmk_profile_edit_channel.c" \
        "$ROOT/users/noah/lib/profile/runtime/profile_working_copy.c" \
        "$ROOT/users/noah/lib/profile/runtime/effective_profile_provider.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_reader.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_domain_registry.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_blob_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/key_behavior_domain_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_rgb_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_validator_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_keymap_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_macros_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_combo_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_pd_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_settings_v1.c" \
        "$ROOT/users/noah/lib/profile/storage/profile_checksum.c" \
        -o "$BUILD_DIR/live_edit_probe_$name"
    node "$CHARYBDIS_ARK_ROOT/tests/integration/live-edit-corpus.js" "$BUILD_DIR/live_edit_probe_$name" "$BUILD_DIR" "$BUILD_DIR/contract.json"
}

build_and_run normal
build_and_run sanitized -fsanitize=address,undefined -fno-omit-frame-pointer
