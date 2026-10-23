// @ts-check
// What the Keyboard screen says about the connected keyboard: its product,
// its two halves and its firmware against this Ark. Pure: it reads the
// published model.

/** @typedef {import("../../contracts/panel.js").PublishedModel} Model */

// Where to get the firmware, as the README says.
export const FIRMWARE_RELEASES = "https://github.com/NoahCLR/charybdis-4x6/releases/latest";

// The master half is always the right one, with the USB cable and the
// trackball; the firmware builds force it. Each half's state in words.
/** @param {Model | null | undefined} model @returns {{side: string, role: string, ok: boolean, words: string}[]} */
export function halvesRows(model) {
    const halves = model?.device?.health?.halves;
    const connected = Boolean(model?.device?.connected);
    const left = halves === "agree" ? {ok: true, words: "connected, same saved settings"}
        : halves === "alone" ? {ok: false, words: "not answering: check the cable between the halves"}
        : halves === "apart" ? {ok: false, words: "connected, but holding different saved settings"}
        : {ok: false, words: "not read yet"};
    return [
        {side: "Right half (USB, trackball)", role: "master", ok: connected, words: connected ? "connected over USB" : "not connected"},
        {side: "Left half", role: "slave", ...(connected ? left : {ok: false, words: "not connected"})},
    ];
}

// A save the keyboard is in the middle of and will finish
// (`health.recoveryPending`), in the words the rail and the Keyboard screen
// both use.
export const SAVE_IN_PROGRESS = Object.freeze({
    label: "Save in progress",
    detail: "A save is in progress on the keyboard: it keeps its previous profile until both halves confirm the new one.",
});

// The rail's line about the keyboard itself, under the draft's: a restart it
// needs, or a save it is finishing. Null when there is neither, and in the
// demo.
/** @param {Model | null | undefined} model @returns {{tone: string, text: string, tip: string} | null} */
export function keyboardStatusLine(model) {
    const health = model?.device?.health;
    if (model?.demo?.active || !health) return null;
    if (health.restartNeeded) return {tone: "err", text: "Restart the keyboard",
        tip: "The slave half did not confirm a cancelled save, so the keyboard refuses new saves. Unplug the USB cable (not the cable between the halves), wait a few seconds and plug it back in. Nothing was lost."};
    if (health.recoveryPending) return {tone: "draft", text: SAVE_IN_PROGRESS.label, tip: SAVE_IN_PROGRESS.detail};
    return null;
}

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
        : {version, works: false, words: "Ark needs a newer firmware. Update both halves."};
}
