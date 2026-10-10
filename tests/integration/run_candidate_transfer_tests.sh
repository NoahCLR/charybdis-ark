#!/bin/sh

set -eu

ROOT="${FIRMWARE_ROOT:?Set FIRMWARE_ROOT}"
: "${CHARYBDIS_ARK_ROOT:?Set CHARYBDIS_ARK_ROOT}"
if ! rg -q NOAH_PROFILE_CANDIDATE_V1_VALUE_REUSE "$ROOT/users/noah/lib/profile/protocol/profile_candidate_v1.h"; then
    echo "Candidate transfer bridge skipped: selected firmware predates differential candidate transfer."
    exit 0
fi
BUILD_DIR="$(mktemp -d)"

. "$ROOT/tests/host/noah_host_qmk_env.sh"
noah_host_export_qmk_cpath "$ROOT"

cleanup() {
    rm -rf "$BUILD_DIR"
}

trap cleanup EXIT INT TERM

build_and_run() {
    name="$1"
    shift
    cc -std=c11 -Wall -Wextra -Werror -pedantic "$@" \
        -DQMK_KEYBOARD_H='"qmk_stub.h"' \
        -DQMK_STUB_SUPPRESS_LAYER_COUNT \
        -DVIA_ENABLE -DPOINTING_DEVICE_ENABLE -DNOAH_PD_PROFILE_ENABLE -DNOAH_PORTABLE_PROFILE_ENABLE \
        -DTOTAL_EEPROM_BYTE_COUNT=0x23000u \
        -I"$ROOT" \
        -I"$ROOT/users/noah" \
        -I"$ROOT/tests/host/include" \
        -include "$ROOT/tests/host/include/noah_compile_config.h" \
        "$CHARYBDIS_ARK_ROOT/tests/integration/candidate-transfer-probe.c" \
        "$ROOT/users/noah/lib/profile/protocol/profile_candidate_v1.c" \
        "$ROOT/users/noah/lib/profile/protocol/profile_wire_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_reader.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_domain_registry.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_blob_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/key_behavior_domain_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_rgb_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_validator_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_combo_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_pd_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_settings_v1.c" \
        "$ROOT/users/noah/lib/profile/runtime/effective_profile_provider.c" \
        "$ROOT/users/noah/lib/profile/storage/profile_checksum.c" \
        "$ROOT/users/noah/lib/profile/storage/profile_store.c" \
        "$ROOT/users/noah/lib/profile/storage/profile_candidate_transaction.c" \
        "$ROOT/users/noah/lib/profile/storage/profile_candidate_store_backend.c" \
        -o "$BUILD_DIR/profile_candidate_store_backend_test_$name"
    node "$CHARYBDIS_ARK_ROOT/tests/integration/candidate-transfer-corpus.js" "$BUILD_DIR/profile_candidate_store_backend_test_$name" "$BUILD_DIR"
}

build_and_run normal
build_and_run sanitized -fsanitize=address,undefined -fno-omit-frame-pointer
