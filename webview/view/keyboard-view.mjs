// @ts-check
// What the Keyboard screen and the halves banner say about the connected
// keyboard: its two halves, its firmware against this Ark, and when to say
// a half is missing. Pure: it reads the published model.

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

// The strip under the topbar on every screen, while a half is missing or the
// halves disagree; nothing otherwise, and nothing in the demo.
/** @param {Model | null | undefined} model @returns {string} */
export function halvesBanner(model) {
    if (!model?.device?.connected || model?.demo?.active) return "";
    const halves = model.device.health?.halves;
    if (halves === "alone") return "The left half isn't answering. You can edit; Apply waits for both halves.";
    if (halves === "apart") return "The halves hold different saved settings. Apply waits until they agree.";
    return "";
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
