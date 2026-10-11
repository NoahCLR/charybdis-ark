#!/bin/sh
set -eu
ROOT="${FIRMWARE_ROOT:?Set FIRMWARE_ROOT}"
: "${CHARYBDIS_ARK_ROOT:?Set CHARYBDIS_ARK_ROOT}"
if ! rg -q NOAH_QMK_VIA_MACRO_READ_BLOCK_SIZE "$ROOT/users/noah/lib/compat/qmk_via_storage_regions.h"; then
    echo "Macro read map bridge skipped: selected firmware predates sparse macro reads."
    exit 0
fi
. "$ROOT/tests/host/noah_host_qmk_env.sh"
noah_host_export_qmk_cpath "$ROOT"
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT INT TERM
for variant in normal sanitized; do
    flags=""
    if [ "$variant" = sanitized ]; then flags="-fsanitize=address,undefined -fno-omit-frame-pointer"; fi
    for capacity in 34903 65535; do
        cc -std=c11 -Wall -Wextra -Werror -pedantic $flags \
            -DVIA_ENABLE -DTEST_KEYMAP_SIZE=1920 -DTEST_MACRO_SIZE="$capacity" \
            -DQMK_KEYBOARD_H='"qmk_stub.h"' \
            -I"$ROOT" -I"$ROOT/tests/host/include" \
            "$ROOT/tests/host/qmk_via_storage_regions_test.c" \
            "$ROOT/users/noah/lib/compat/qmk_via_storage_regions.c" -o "$BUILD_DIR/probe"
        for mode in empty sparse dense nonstandard; do
            "$BUILD_DIR/probe" "$BUILD_DIR/read.fixture" "$mode"
            node "$CHARYBDIS_ARK_ROOT/tests/integration/macro-read-map-corpus.js" "$BUILD_DIR/read.fixture" "$capacity" "$mode"
        done
    done
done
