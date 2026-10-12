#!/bin/sh
# Syntax across everything this app ships, the strict type checks
# (npm run typecheck), then the whole test suite.
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"

node scripts/syntax-coverage.js
npm run typecheck
node --test tests/
