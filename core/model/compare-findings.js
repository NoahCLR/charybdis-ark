// @ts-check
"use strict";

// Review's findings beside the keyboard's: each new, already on the keyboard,
// or fixed by the draft. Layer reach (layer-reach.js) and the whole-profile
// checks (profile-checks.js) are compared alike.

const {LAYER_IDENTITY} = require("../data/charybdis-layout");

/** @typedef {import("../../contracts/model.js").Finding} Finding */

const GRAPH_FINDINGS = new Set(["trap", "trapOverflow", "unreachable", "unreachableCombo"]);

// A finding's identity across two profiles: what kind it is and which layers it
// is about, named by the keyboard layer each slot holds (`order[slot]`, as
// model/layer-order.js keeps it).
/** @param {Finding} finding @param {readonly number[]} [order] */
const findingKey = (finding, order = LAYER_IDENTITY) => `${finding.kind}:${finding.layers.map((slot) => order[slot]).sort((a, b) => a - b).join(",")}${finding.identity === undefined ? "" : `:${finding.identity}`}`;

// The findings for a draft beside its keyboard's: each finding in the draft is
// new or already on the keyboard, and each one the draft no longer has is fixed
// by it. The keyboard is walked as it is, not rearranged into the draft's
// order, since a reorder can make or mend a finding itself (a new base leaves
// the old one unreached); `order` says which keyboard layer each draft slot
// holds, so the two are matched layer with layer. Traps always ask to be
// confirmed.
/** @param {readonly Finding[]} before @param {readonly Finding[]} after @param {readonly number[]} [order] @returns {import("../../contracts/model.js").Check[]} */
function compareFindings(before, after, order = LAYER_IDENTITY) {
    const known = new Set(before.map((finding) => findingKey(finding))), still = new Set(after.map((finding) => findingKey(finding, order)));
    const incomplete = after.find(finding => finding.kind === "reachabilityIncomplete");
    const uncertainKinds = incomplete?.scope === "escapes" ? new Set(["trap", "trapOverflow"]) : GRAPH_FINDINGS;
    return [
        ...after.map(/** @returns {import("../../contracts/model.js").Check} */ (finding) => ({...finding, key: findingKey(finding, order), status: known.has(findingKey(finding, order)) ? "existing" : "new"})),
        ...before.filter((finding) => !still.has(findingKey(finding)) && !(incomplete && uncertainKinds.has(finding.kind)))
            .map(/** @returns {import("../../contracts/model.js").Check} */ (finding) => ({...finding, key: findingKey(finding), status: "fixed", place: undefined})),
    ];
}

module.exports = {compareFindings};
