// @ts-check
"use strict";
// A published model over the pointing fixture profile, for the picker's
// pure view rules.
const {buildSnapshotModel} = require("../../core/session/device-model");
const portable = require("../../core/model/portable-profile");
const {document: pdDocument} = require("./pd-profile");
const {PROFILE_WIRE_KNOWN_MASKS} = require("../../core/protocol/profile-wire-v1");

const capabilities = {compiledLayerCount: 16, supportedDomainMask: 31, actionAbiDigest: 0x837cf479, featureFlags: PROFILE_WIRE_KNOWN_MASKS.CURRENT_PAIR_FEATURES};
const doc = pdDocument();
const snapshot = {document: doc, fingerprint: portable.fingerprint(doc), summary: portable.summary(doc), limits: {brightnessMax: 200}};
module.exports = buildSnapshotModel(snapshot, capabilities, {editable: true, reason: ""});
