#!/bin/sh
set -eu
ROOT="${FIRMWARE_ROOT:?Set FIRMWARE_ROOT}"
APP="${CHARYBDIS_ARK_ROOT:?Set CHARYBDIS_ARK_ROOT}"
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT INT TERM
# Format 3, the one RGB format the 32-slot firmware reads.
node "$APP/tests/integration/rgb-corpus.js" "$ROOT" "$BUILD_DIR/corpus.bin"
for variant in normal sanitized; do
    flags=""
    if [ "$variant" = sanitized ]; then flags="-fsanitize=address,undefined -fno-omit-frame-pointer"; fi
    cc -std=c11 -Wall -Wextra -Werror -pedantic $flags -DNOAH_PD_PROFILE_ENABLE -I"$ROOT" -I"$ROOT/users/noah" \
        "$APP/tests/integration/rgb-probe.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_rgb_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_reader.c" \
        -o "$BUILD_DIR/$variant"
    "$BUILD_DIR/$variant" "$BUILD_DIR/corpus.bin"
done
