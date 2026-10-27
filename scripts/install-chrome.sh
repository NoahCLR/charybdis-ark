#!/bin/sh
# Installs the Chrome the browser tests use (CI only), retrying a stalled download.
#
# Only the browser is downloaded, from Playwright's CDN: GitHub's Ubuntu runners
# already have Google Chrome and the system libraries it needs. Installing them
# again with apt (--with-deps) depended on Ubuntu's package mirror, which on the
# runners has hung for over an hour and downloaded at 0.5 MB/s.
#
# A normal download takes well under a minute. Each attempt is stopped after
# ARK_CHROME_INSTALL_SECONDS (default 90) and retried, up to three attempts.
# timeout stops the attempt's whole process group, and nothing runs as root.
set -u

limit="${ARK_CHROME_INSTALL_SECONDS:-90}"
attempts=3
attempt=1
while :; do
    if timeout --kill-after=10 "$limit" npx playwright install chromium; then
        exit 0
    fi
    if [ "$attempt" -ge "$attempts" ]; then
        echo "Chrome install failed or took over ${limit}s $attempts times; giving up" >&2
        exit 1
    fi
    echo "Chrome install attempt $attempt failed or took over ${limit}s; retrying" >&2
    attempt=$((attempt + 1))
done
