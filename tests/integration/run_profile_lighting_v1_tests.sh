#!/bin/sh
set -eu
ROOT="${FIRMWARE_ROOT:?Set FIRMWARE_ROOT}"
APP="${CHARYBDIS_ARK_ROOT:?Set CHARYBDIS_ARK_ROOT}"
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT INT TERM
node "$APP/tests/integration/lighting-corpus.js" "$BUILD_DIR/vectors.txt"
# The shared corpus covers every schema registry row, independent of the
# separately tested production module/consumer feature gates. Match the
# firmware-owned schema runner at the pin.
FLAGS="-DNOAH_LIGHTING_SCHEMA_ALL_KINDS -DNOAH_PORTABLE_PROFILE_ENABLE -DRGB_MATRIX_ENABLE -DRGB_KEY_BEHAVIOR_FEEDBACK_ENABLE -DPOINTING_DEVICE_ENABLE -DRGB_PD_MODE_FEEDBACK_ENABLE -DCOMBO_ENABLE -DRGB_COMBO_FEEDBACK_ENABLE -DPOINTING_DEVICE_AUTO_MOUSE_ENABLE -DRGB_AUTOMOUSE_GRADIENT_ENABLE -DNOAH_PD_PROFILE_ENABLE"
for variant in normal sanitized; do
    SANITIZE=""
    if [ "$variant" = sanitized ]; then SANITIZE="-fsanitize=address,undefined -fno-omit-frame-pointer"; fi
    # shellcheck disable=SC2086
    cc -std=c11 -Wall -Wextra -Werror -pedantic $FLAGS $SANITIZE \
        -I"$ROOT" -I"$ROOT/users/noah" \
        "$ROOT/tests/host/profile_lighting_v1_test.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_lighting_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_lighting_v1_convert.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_rgb_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_reader.c" \
        -o "$BUILD_DIR/$variant"
    "$BUILD_DIR/$variant" "$BUILD_DIR/vectors.txt"
done
