"use strict";
// Current firmware's compiled profile with every pointing slot from 6 on empty,
// so creation and duplication have destinations, whatever the compiled
// profile configures there; the authored Undo / Redo branch that reached slot
// 6 goes too, so a deliberately empty destination raises no unrelated warning.
const {createSnapshot} = require("../../core/model/portable-profile");
const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {decodePdDomain, encodePdDomain} = require("../../core/schema/pd-mode-domain-v1");
const {decodeKeyBehaviorDomain, encodeKeyBehaviorDomain} = require("../../core/schema/key-behavior-domain-v1");
const {compiled} = require("./portable-profile");

function document() {
    const doc = compiled();
    const blob = decodeProfileBlob(Buffer.from(doc.profile, "base64"));
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
    return createSnapshot({profile, actionAbiDigest: doc.actionAbiDigest, via: {layers: 8, layout: Buffer.alloc(960), macros: Buffer.alloc(7191), macroSlots: 64}});
}
module.exports = {document};
