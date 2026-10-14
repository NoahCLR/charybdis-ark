"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {document, CURRENT_CAPABILITIES} = require("../fixtures/portable-profile");
const {validateSnapshot, fingerprint, summary, reorderLayers} = require("../../core/model/portable-profile");
const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {encodeKeyBehaviorDomain} = require("../../core/schema/key-behavior-domain-v1");
const {encodeLightingDomain} = require("../../core/schema/lighting-domain-v1");
const {ProfileDraftSession} = require("../../core/session/profile-draft-session");
const {profileDepthOptions} = require("../../core/schema/profile-depth");
const {behaviorRowsForView} = require("../../core/model/device-profile-view");
const {settingsEditorView} = require("../../core/model/settings-editor");

test("tap depth uses destination limits before offline palette counts and rejects invalid limits", () => {
    const payload = Buffer.alloc(16); payload[0] = 4; payload[10] = 7;
    assert.equal(profileDepthOptions({}, payload).behaviors.limits.maxTapStepsPerBehavior, 8);
    assert.equal(profileDepthOptions({maxTapStepsPerBehavior: 5}, payload).rgb.tapDepth, 5);
    for (const depth of [0, 1, 1.5, 256]) assert.throws(() => profileDepthOptions({maxTapStepsPerBehavior: depth}));
});

test("depth eight survives complete-profile read, edit, history, reorder and partial discard; depth five refuses it", () => {
    const source = document(), decoded = validateSnapshot(source), blob = decodeProfileBlob(decoded.profile);
    const caps = {...CURRENT_CAPABILITIES, maxTapStepsPerBehavior: 8, maxPopulatedBehaviorSteps: 1024, maxBehaviorRows: 128, lighting: {...CURRENT_CAPABILITIES.lighting, tapDepth: 8}};
    const row = {target: {kind: 1, operand: 4}, tapHoldTerm: decoded.settings.values[1], longerHoldTerm: 0, multiTapTerm: 0,
        steps: Array.from({length: 8}, (_, tapIndex) => ({tapIndex, tap: {kind: 1, operand: 5}}))};
    blob.domains[1].payload = encodeKeyBehaviorDomain({rows: [row]}, {limits: {maxTapStepsPerBehavior: 8, maxPopulatedSteps: 1024}});
    const table = decoded.rgb.things.find(t => t.kind === 4);
    table.default = [...table.default.slice(0, 4), ...Array(7).fill(0)];
    source.tapDepth = 8;
    blob.domains[0].payload = encodeLightingDomain(decoded.rgb, {tapDepth: 8});
    source.profile = encodeProfileBlob(blob).toString("base64");
    assert.equal(validateSnapshot(source, caps).behaviors.populatedStepCount, 8);
    assert.throws(() => validateSnapshot(source, {...caps, maxTapStepsPerBehavior: 5, maxPopulatedBehaviorSteps: 640}));
    const draft = new ProfileDraftSession({document: source, fingerprint: fingerprint(source), summary: summary(source)}, "test", caps);
    const rule = draft.current.decoded.rgb.rules[0];
    draft.stage({type: "editLightingRule", draftRevision: draft.revision, index: 0, expectedRule: require("../../core/model/lighting-editor").ruleIdentity(rule), action: "colour", colour: {h: 7, s: 255, v: 10}});
    assert.deepEqual(draft.current.decoded.rgb.things.find(t => t.kind === 4).default, table.default);
    draft.undo(draft.revision); assert.equal(draft.current.fingerprint, fingerprint(source));
    draft.redo(draft.revision);
    const item = draft.changes().find(item => item.unit === "rgb:rules");
    draft.discard(draft.revision, item.group); assert.equal(draft.current.fingerprint, fingerprint(source));
    const behavior = behaviorRowsForView(draft.current.decoded.behaviors)[0];
    draft.stage({type: "saveBehavior", draftRevision: draft.revision, behavior: {...behavior, enabled: false}});
    assert.equal(draft.current.decoded.behaviors.rows[0].steps[7].tapIndex, 7);
    assert.equal(draft.current.decoded.behaviors.rows[0].enabled, false);
    draft.undo(draft.revision); assert.equal(draft.current.fingerprint, fingerprint(source));
    const timing = settingsEditorView(draft.current, caps).sections.find(section => section.id === "keyTiming");
    draft.stage({type: "updateConfigDefaults", draftRevision: draft.revision, sectionId: "keyTiming", expectedFingerprint: draft.current.fingerprint,
        fields: timing.fields.map(field => ({macro: field.macro, value: field.macro === "tapHoldTerm" ? "175" : field.value}))});
    assert.equal(draft.current.decoded.behaviors.rows[0].tapHoldTerm, 0, "matching explicit timing adopts inheritance without losing the eighth step");
    assert.equal(draft.current.decoded.behaviors.rows[0].steps[7].tapIndex, 7);
    draft.discard(draft.revision, draft.changes().find(item => item.unit === "settings:keyTiming").group);
    assert.equal(draft.current.fingerprint, fingerprint(source));
    assert.equal(validateSnapshot(reorderLayers(source, [0, 15, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 1])).behaviors.rows[0].steps[7].tapIndex, 7);
});
