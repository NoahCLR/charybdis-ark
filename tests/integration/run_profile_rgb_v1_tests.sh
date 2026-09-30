#!/bin/sh
set -eu
ROOT="${FIRMWARE_ROOT:?Set FIRMWARE_ROOT}"
APP="${CHARYBDIS_ARK_ROOT:?Set CHARYBDIS_ARK_ROOT}"
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT INT TERM
for version in 1 2; do
schema_flags=""
if [ "$version" = 2 ]; then schema_flags="-DNOAH_PD_PROFILE_ENABLE"; fi
node "$APP/tests/integration/rgb-corpus.js" "$ROOT" "$BUILD_DIR/corpus.bin" "$version"
for variant in normal sanitized; do
    flags=""
    if [ "$variant" = sanitized ]; then flags="-fsanitize=address,undefined -fno-omit-frame-pointer"; fi
    cc -std=c11 -Wall -Wextra -Werror -pedantic $flags $schema_flags -I"$ROOT" -I"$ROOT/users/noah" \
        "$APP/tests/integration/rgb-probe.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_rgb_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_reader.c" \
        -o "$BUILD_DIR/$variant"
    "$BUILD_DIR/$variant" "$BUILD_DIR/corpus.bin"
done
done
