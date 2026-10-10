"use strict";

const {compiled, settings, CURRENT_CAPABILITIES} = require("./portable-profile");
const {encodeMacroPayload} = require("../../core/schema/macro-payload");
const {fingerprint} = require("../../core/model/portable-profile");

function hostMacros(hostWord, payloads) {
    const policy = settings();
    policy.values[27] = hostWord;
    const document = compiled({policy});
    payloads.forEach((payload, index) => {document.macros[index] = encodeMacroPayload(payload, {unicode: true}).toString("base64");});
    return {snapshot: {document, fingerprint: fingerprint(document), hostOs: {detected: 1}},
        capabilities: {...CURRENT_CAPABILITIES, featureFlags: (1 << 21) | (1 << 22)}};
}

module.exports = {hostMacros};
