// @ts-check
"use strict";
const vectors = require("../../upstream/firmware/tests/fixtures/lighting_vectors_v1.json");
const contract = require("../../upstream/firmware/tests/fixtures/lighting_contract_v1.json");
function lightingPages() {
    const pages = vectors.capability.map(hex => Buffer.from(hex, "hex"));
    for (const f of contract.registries.facts) pages[128 + f.id] = Buffer.from([f.id, f.subjectDomain, f.selectorParameter, f.historyMembers === "matrixKeys" ? 60 : f.historyMembers === "comboBuffer" ? 4 : Number(f.historyMembers)]);
    return pages;
}
function lightingCapabilities() {
    const pages = lightingPages();
    return require("../../core/protocol/lighting-capabilities-v1").decodeLightingCapabilities(pages.slice(0, 16), Object.fromEntries(contract.registries.facts.map(f => [f.id, pages[128 + f.id]])));
}
module.exports = {lightingPages, lightingCapabilities};
