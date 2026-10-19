#!/bin/sh
set -eu
ROOT="${FIRMWARE_ROOT:?Set FIRMWARE_ROOT}"
: "${CHARYBDIS_ARK_ROOT:?Set CHARYBDIS_ARK_ROOT}"
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT INT TERM
for variant in normal sanitized; do
    flags=""
    if [ "$variant" = sanitized ]; then flags="-fsanitize=address,undefined -fno-omit-frame-pointer"; fi
    cc -std=c11 -Wall -Wextra -Werror -pedantic $flags -I"$ROOT" \
        "$CHARYBDIS_ARK_ROOT/tests/integration/macro-domain-probe.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_macros_v1.c" -o "$BUILD_DIR/probe"
    node "$CHARYBDIS_ARK_ROOT/tests/integration/macro-domain-corpus.js" "$BUILD_DIR/probe" "$BUILD_DIR"
done
