// @ts-check
"use strict";

// Each half's flash pauses (GET 0x0D, firmware D-F29) for the Keyboard
// screen's Diagnostics, read as the firmware's spec says to get fresh ones:
// read page 1, give the master half time to pull the slave half's figures
// over the split link, and read it again. The panel asks when the fold
// opens, once per connection while it is open, and with its Read keyboard
// (`readFlashPauses`, `refresh` with `flashPauses`); nothing else reads
// them, the live watch included.
//
// Each read is a background read of the device service, so it never runs
// alongside an operation; nor while the panel holds the keyboard, as the
// watch's look does not. The wait between them holds nothing.

const {FLASH_PAUSES_V1} = require("../protocol/flash-pauses-v1");

const PULL_WAIT_MS = FLASH_PAUSES_V1.PULL_MS + 250;

/** @param {import("./types.js").RunningPanelSession} session */
const mayRead = (session) => !session.demo && !session.portableBusy && !session.readBusy && !session.applyRunning;

// Resolves true when the figures were read at least once.
/** @param {import("./types.js").RunningPanelSession} session @param {{publish: () => void, sleep?: (ms: number) => Promise<void>}} options */
async function readFlashFigures(session, {publish, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))}) {
    if (!mayRead(session) || !await session.service.readFlashPauses()) return false;
    publish();
    await sleep(PULL_WAIT_MS);
    if (mayRead(session) && await session.service.readFlashPauses()) publish();
    return true;
}

module.exports = {PULL_WAIT_MS, readFlashFigures};
