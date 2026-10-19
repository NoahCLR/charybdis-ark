// @ts-check
"use strict";
// The test profile (./portable-profile) with every pointing slot from 6 on
// empty, so creation and duplication have destinations whatever the profile
// configures there; any behaviour step reaching those slots goes too, so a
// deliberately empty destination raises no unrelated warning.
const {createSnapshot, validateSnapshot} = require("../../core/model/portable-profile");
const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {decodePdDomain, encodePdDomain} = require("../../core/schema/pd-mode-domain-v1");
const {decodeKeyBehaviorDomain, encodeKeyBehaviorDomain} = require("../../core/schema/key-behavior-domain-v1");
const {compiled} = require("./portable-profile");

function document() {
    const doc = compiled();
    const blob = decodeProfileBlob(validateSnapshot(doc).candidate);
    /** @param {import("../../core/schema/types.js").SemanticAction | undefined} action */
    const reachesExtension = action => action && [4, 5].includes(action.kind) && action.operand >= 6;
    const profile = encodeProfileBlob({domains: blob.domains.map(domain => {
        if (domain.id === 0x50) return {...domain, payload: encodePdDomain(decodePdDomain(domain.payload).map(slot => slot.id < 6 ? slot : {id: slot.id, kind: 0, name: ""}))};
        if (domain.id === 0x20) {
            const table = decodeKeyBehaviorDomain(domain.payload);
            table.rows = table.rows.map(row => ({...row, steps: row.steps.filter(step =>
                ![step.tap, step.hold?.action, step.longHold?.action].some(reachesExtension))}));
            return {...domain, payload: encodeKeyBehaviorDomain(table)};
        }
        return domain;
    })});
    return createSnapshot({profile, actionAbiDigest: doc.actionAbiDigest});
}
module.exports = {document};
