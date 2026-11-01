// @ts-check
// What the Keyboard screen says about the connected keyboard: its product,
// its two halves and its firmware against this Ark. Pure: it reads the
// published model.

import {vocabulary} from "./vocabulary.mjs";

/** @typedef {import("../../contracts/panel.js").PublishedModel} Model */

// Where to get the firmware, as the README says.
export const FIRMWARE_RELEASES = "https://github.com/NoahCLR/charybdis-4x6/releases/latest";

// Each half by its role: the master half is always the right one, with the
// USB cable and the trackball (the firmware builds force it), and the slave
// half the left. The side follows as detail. Each half's state in words.
/** @param {Model | null | undefined} model @returns {{half: string, side: string, ok: boolean, words: string}[]} */
export function halvesRows(model) {
    const halves = model?.device?.health?.halves;
    const connected = Boolean(model?.device?.connected);
    const slave = halves === "agree" ? {ok: true, words: "connected, same saved settings"}
        : halves === "alone" ? {ok: false, words: "not answering: check the cable between the halves"}
        : halves === "apart" ? {ok: false, words: "connected, but holding different saved settings"}
        : {ok: false, words: "not read yet"};
    return [
        {half: "Master half", side: "right, USB and trackball", ok: connected, words: connected ? "connected over USB" : "not connected"},
        {half: "Slave half", side: "left", ...(connected ? slave : {ok: false, words: "not connected"})},
    ];
}

// A save the keyboard is in the middle of and will finish
// (`health.recoveryPending`), in the words the rail's keyboard dot and the
// Keyboard screen both use.
export const SAVE_IN_PROGRESS = Object.freeze({
    label: "Save in progress",
    detail: "A save is in progress on the keyboard: it keeps its previous profile until both halves confirm the new one.",
});

// A keyboard whose slave half never confirmed a cancelled save
// (`health.restartNeeded`), in the words the rail's keyboard dot, the
// Keyboard screen and the bar use. The bar offers Ark's Restart for it
// (D-L67); the steps say the other way out, unplugging the master half's USB
// cable, for where there is no bar.
export const RESTART_NEEDED = Object.freeze({
    label: "Restart the keyboard",
    detail: "The slave half did not confirm a cancelled save, so the keyboard refuses new saves until it restarts. Nothing was lost.",
    steps: Object.freeze([
        "Unplug the USB cable from the master half (not the cable between the halves).",
        "Wait a few seconds, then plug it back in.",
        "Read the keyboard again.",
    ]),
});

// The Keyboard screen's Product row: the firmware's built-in name, which Ark
// knows while the keyboard carries no stored name (it is then the keyboard's
// USB product). A renamed keyboard reports its given name over USB instead
// (firmware D-F25), and the title already shows that, so the row is left out
// (null) rather than repeating it.
/** @param {Model | null | undefined} model @returns {string | null} */
export function productName(model) {
    if (model?.demo?.active) return "Charybdis 4x6 (demo)";
    return model?.keyboardName?.builtIn || null;
}

// The firmware's line on the Keyboard screen: its version, and whether this
// Ark works with it or what to do.
/** @param {Model | null | undefined} model */
export function firmwareLine(model) {
    const firmware = model?.firmware;
    if (!firmware) return {version: "", works: false, words: "Not read yet."};
    const version = firmware.version ? `charybdis-4x6 firmware ${firmware.version}` : "charybdis-4x6 firmware";
    return firmware.worksWithArk
        ? {version, works: true, words: "works with this Ark ✓"}
        : {version, works: false, words: vocabulary(model).firmwareUpdate};
}
