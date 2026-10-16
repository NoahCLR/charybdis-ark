#!/bin/sh
set -eu
ROOT="${FIRMWARE_ROOT:?Set FIRMWARE_ROOT}"
APP="${CHARYBDIS_ARK_ROOT:?Set CHARYBDIS_ARK_ROOT}"
. "$ROOT/tests/host/noah_host_qmk_env.sh"
noah_host_export_qmk_cpath "$ROOT"
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT INT TERM
# Independently generated Python goldens and Ark-built reports must agree before
# the selected production C implementation consumes the Ark corpus.
python3 "$ROOT/tools/lighting_live_reference.py" --check --vectors "$BUILD_DIR/python"
node "$APP/tests/integration/lighting-live-corpus.js" "$BUILD_DIR/ark"
cmp "$BUILD_DIR/python" "$BUILD_DIR/ark"
SOURCE="$ROOT/users/noah/lib/compat/qmk_lighting_live.c"
for variant in normal sanitized; do
    SANITIZE=""
    if [ "$variant" = sanitized ]; then SANITIZE="-fsanitize=address,undefined -fno-omit-frame-pointer"; fi
    FLAGS="-std=c11 -Wall -Wextra -Werror -Wno-unused-parameter -pedantic -DNOAH_LIGHTING_LIVE_TEST -DNOAH_LIGHTING_LIVE_ENABLE=1 -DNOAH_LIVE_PROFILE_OWNER_ENABLE -DVIA_ENABLE -DSPLIT_KEYBOARD -DRPC_M2S_BUFFER_SIZE=128 -DMATRIX_ROWS=10 -DMATRIX_COLS=6 -DNOAH_LIGHTING_SCHEMA_ALL_KINDS -DRGB_MATRIX_ENABLE"
    # Production two-half mailbox/read/upload/expiry/reset implementation, with
    # the firmware's independent C host harness. No QMK image or device I/O.
    # shellcheck disable=SC2086
    cc $FLAGS $SANITIZE -DQMK_KEYBOARD_H='"qmk_stub.h"' -I"$ROOT" -I"$ROOT/users/noah" -I"$ROOT/tests/host/include" \
        -Dnoah_lighting_live_test_exhaust=peer_test_exhaust -Dnoah_lighting_live_handle=peer_handle -Dnoah_lighting_live_task=peer_task -Dnoah_lighting_live_close=peer_close -Dnoah_lighting_live_colour=peer_colour \
        -c "$SOURCE" -o "$BUILD_DIR/peer.o"
    # shellcheck disable=SC2086
    cc $FLAGS $SANITIZE -DQMK_KEYBOARD_H='"qmk_stub.h"' -I"$ROOT" -I"$ROOT/users/noah" -I"$ROOT/tests/host/include" \
        "$ROOT/tests/host/lighting_live_test.c" "$SOURCE" "$BUILD_DIR/peer.o" -o "$BUILD_DIR/probe"
    "$BUILD_DIR/probe" "$BUILD_DIR/ark"
    for namespace in 1 2 3 4; do "$BUILD_DIR/probe" "$BUILD_DIR/ark" "$namespace"; done
done
