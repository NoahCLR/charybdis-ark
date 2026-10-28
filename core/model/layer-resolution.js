// @ts-check
"use strict";

// Compile which layer can answer each physical position. The selected top
// layer is on; every lower non-transparent key is an alternative answer only
// while its layer is on and higher answering layers are off. KC_NO answers
// and blocks lower keys, just like any other non-transparent value. Which
// compiled answer answers under the layers that are on is the shared rule in
// rules/layer-answers.mjs, which the interface runs too (D-L73).

/** @typedef {import("../../contracts/panel.js").LayerAnswer} LayerAnswer */
const {answeringCandidate} = require("../../rules/layer-answers.mjs");

const TRANSPARENT = 0x0001;

/** @param {readonly (readonly (number | undefined)[])[]} layers @returns {LayerAnswer[][][]} */
function compileLayerAnswers(layers) {
    return layers.map((positions, top) => Array.from({length: positions.length}, (_, position) => {
        /** @type {LayerAnswer[]} */
        const answers = [];
        let blocked = 0;
        for (let layer = top; layer >= 0; layer--) {
            const value = layers[layer]?.[position];
            if (value === undefined || value === TRANSPARENT) continue;
            answers.push({layer, active: 1 << layer, blocked});
            if (layer === top) break;
            blocked |= 1 << layer;
        }
        return answers;
    }));
}

/** @param {readonly LayerAnswer[] | undefined} answers @param {number} active */
function answeringLayer(answers, active) {
    return answeringCandidate(answers, active)?.layer ?? null;
}

module.exports = {compileLayerAnswers, answeringLayer};
