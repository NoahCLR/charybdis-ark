#!/bin/sh
# Installs the Chrome the browser tests use (CI only), retrying a stalled install.
#
# A normal install takes 25-40 seconds. On GitHub's runners one has hung for over
# an hour, and with no limit a hung install holds the web page's publish queue or
# a release's browser check for up to six hours. Each attempt is stopped after
# ARK_CHROME_INSTALL_SECONDS (default 60) and retried, up to three attempts.
set -u

limit="${ARK_CHROME_INSTALL_SECONDS:-60}"
attempts=3
attempt=1
while :; do
    if timeout --kill-after=10 "$limit" npx playwright install --with-deps chromium; then
        exit 0
    fi
    if [ "$attempt" -ge "$attempts" ]; then
        echo "Chrome install failed or took over ${limit}s $attempts times; giving up" >&2
        exit 1
    fi
    echo "Chrome install attempt $attempt failed or took over ${limit}s; retrying" >&2
    # A stopped attempt can leave apt's package database half configured.
    sudo dpkg --configure -a >/dev/null 2>&1 || true
    attempt=$((attempt + 1))
done
