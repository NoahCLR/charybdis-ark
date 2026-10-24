// @ts-check
// Each half's flash pauses (GET 0x0D, `model.device.flashPauses`) as the
// Keyboard screen's Diagnostics shows them: a column per half, the master
// half then the slave half with the side each reports, every pause in the
// unit that suits it and its exact microseconds in its tip. A half that
// reports no figures yet is "not measured yet", never zeros.

import {vocabulary, word} from "./vocabulary.mjs";

/** @typedef {import("../../contracts/model.js").FlashPauseFigures} Figures */
/** @type {readonly {field: Exclude<keyof Figures, "physicalHalf">, label: string, hint: string}[]} */
const FIGURES = [
    {field: "longestEraseUs", label: "Longest sector erase", hint: "The longest the half stopped to erase a 4 KiB sector of its flash."},
    {field: "longestProgramUs", label: "Longest page program", hint: "The longest the half stopped to write a 256-byte page of its flash."},
    {field: "longestStorageStepUs", label: "Most flash in one scan", hint: "The most flash time in one keyboard scan's storage step."},
    {field: "lastSaveUs", label: "Last save", hint: "The half's last save, from its start until it finished writing, including the transfer and any wait for a quiet keyboard."},
    {field: "lastSaveFlashUs", label: "Flash in the last save", hint: "How much of the last save the half spent stopped for its flash."},
    {field: "saves", label: "Saves since boot", hint: "How many saves the half has made since it started."},
];
const NOT_MEASURED = "not measured yet";

/** @param {number} us */
export function pauseWords(us) {
    if (us < 1000) return `${us} µs`;
    const ms = us / 1000;
    if (ms < 100) return `${ms.toFixed(1)} ms`;
    if (ms < 1000) return `${Math.round(ms)} ms`;
    return `${(us / 1e6).toFixed(2)} s`;
}

/** @param {{vocabulary?: import("../../contracts/model.js").Vocabulary, device?: {flashPauses?: import("../../contracts/model.js").FlashPausesView | null}} | null | undefined} model */
export function flashPausesView(model) {
    const read = model?.device?.flashPauses;
    if (!read) return null;
    if (read.state === "unavailable") return {failed: `Could not read the flash pauses: ${read.error}`};
    const sides = vocabulary(model).physicalHalves;
    /** @param {string} half @param {Figures | null} figures */
    const title = (half, figures) => figures ? `${half} (${word(sides, figures.physicalHalf)})` : half;
    const halves = [read.master, read.slave];
    return {
        halves: [title("Master half", read.master), title("Slave half", read.slave)],
        rows: FIGURES.map(({field, label, hint}) => ({label, hint, values: halves.map((figures) => !figures ? {text: NOT_MEASURED, tip: ""}
            : field === "saves" ? {text: String(figures.saves), tip: ""}
            : {text: pauseWords(figures[field]), tip: `${figures[field].toLocaleString("en-US")} µs`})})),
    };
}
