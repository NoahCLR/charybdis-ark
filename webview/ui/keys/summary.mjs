// @ts-check
// A key's summary (view/key-summary.mjs) as markup: the one "Does" line the
// Key tab shows, and the tap / hold rows the hover card shows.

import {esc} from "../../lib/dom.mjs";
import {actionLabel, keyMeaning, keyName} from "../../view/keyface.mjs";
import {actionMarked, keyNameMarked, marked, sends} from "../marks.mjs";

/** @typedef {import("../../../contracts/panel.js").PublishedModel | null} Model */
/** @typedef {ReturnType<typeof import("../../view/key-summary.mjs").keySummary>} Summary */

// One action by the press that runs it: "Tap F", "Hold ■ Navigation" (a hold
// of a layer hold says Hold once), "Tap . from ■ Base" for a transparent one.
/** @param {Model} model @param {Summary["parts"][number]} part */
export function partHtml(model, part) {
    const words = actionLabel(model, part.action);
    // A hold of a layer hold says hold once: "Hold ■ Number", "2× hold ■ Number".
    const holdsLayer = /hold$/i.test(part.lead) && /^Hold /.test(words);
    const what = sends(model, part.action) || actionMarked(model, part.action, holdsLayer && part.lead !== "Hold" ? words.slice(5) : words);
    const lead = holdsLayer && part.lead === "Hold" ? "" : `${esc(part.lead)} `;
    const from = part.from ? ` <span class="dim">from</span> ${marked(model, {kind: "layer", layer: part.from.index}, part.from.displayName || part.from.name)}` : "";
    return `${lead}${what}${from}`;
}

const DOES_PARTS = 4;

// The Key tab's "Does" line: a layer key's sentence, the actions by press,
// or the key's own name when it does just that.
/** @param {Model} model @param {import("../../../contracts/panel.js").Position} position @param {Summary} summary */
export function doesHtml(model, position, summary) {
    if (summary.kind === "disabled") return "Nothing <span class=\"dim\">· blocks the layers below</span>";
    const name = keyNameMarked(model, keyName(position), keyMeaning(position));
    if (summary.kind === "layer") return `${name}${summary.effect ? `: ${esc(summary.effect)}` : ""}`;
    // One line: the first few actions, then how many more the Behaviours tab holds.
    const shown = summary.parts.slice(0, DOES_PARTS).map((part) => partHtml(model, part));
    if (summary.parts.length > DOES_PARTS) shown.push(`<span class="dim">+${summary.parts.length - DOES_PARTS} more</span>`);
    if (summary.parts.length) return shown.join(" <span class=\"dim\">·</span> ");
    return name;
}
