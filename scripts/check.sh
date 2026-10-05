#!/bin/sh
# Syntax across everything this app ships, then the whole test suite.
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"

for file in extension.js panel-html.js playwright.config.js browser-tests/*.js scripts/*.js; do
    node --check "$file"
done
find core tests tools -name "*.js" -print0 | xargs -0 -n1 node --check
find webview tests -name "*.mjs" -print0 | xargs -0 -n1 node --check
for file in tests/integration/*.sh; do sh -n "$file"; done
node --test tests/
