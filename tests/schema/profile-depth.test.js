"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {document, CURRENT_CAPABILITIES} = require("../fixtures/portable-profile");
const {validateSnapshot, fingerprint, summary, reorderLayers} = require("../../core/model/portable-profile");
const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {encodeKeyBehaviorDomain} = require("../../core/schema/key-behavior-domain-v1");
const {encodeRgbDomainV1} = require("../../core/schema/rgb-domain-v1");
const {ProfileDraftSession} = require("../../core/session/profile-draft-session");
const {profileDepthOptions} = require("../../core/schema/profile-depth");
const {behaviorRowsForView} = require("../../core/session/device-profile-view");
const {settingsEditorView} = require("../../core/model/settings-editor");

test("tap depth uses destination limits before offline palette counts and rejects invalid limits", () => {
    const payload = Buffer.alloc(16); payload[10] = 7;
    assert.equal(profileDepthOptions({}, payload).behaviors.limits.maxTapStepsPerBehavior, 8);
    assert.equal(profileDepthOptions({maxTapStepsPerBehavior: 5}, payload).rgb.tapBranchColorCount, 4);
    for (const depth of [0, 1, 1.5, 256]) assert.throws(() => profileDepthOptions({maxTapStepsPerBehavior: depth}));
});

test("depth eight survives complete-profile read, edit, history, reorder and partial discard; depth five refuses it", () => {
    const source = document(), decoded = validateSnapshot(source), blob = decodeProfileBlob(decoded.profile);
    const caps = {...CURRENT_CAPABILITIES, maxTapStepsPerBehavior: 8, maxPopulatedBehaviorSteps: 1024, maxBehaviorRows: 128};
    const row = {target: {kind: 1, operand: 4}, tapHoldTerm: decoded.settings.values[1], longerHoldTerm: 0, multiTapTerm: 0,
        steps: Array.from({length: 8}, (_, tapIndex) => ({tapIndex, tap: {kind: 1, operand: 5}}))};
    blob.domains[1].payload = encodeKeyBehaviorDomain({rows: [row]}, {limits: {maxTapStepsPerBehavior: 8, maxPopulatedSteps: 1024}});
    decoded.rgb.keyFeedback.tapBranchColors = Array.from({length: 7}, (_, h) => ({h, s: 255, v: 10}));
    blob.domains[0].payload = encodeRgbDomainV1(decoded.rgb, {tapBranchColorCount: 7});
    source.profile = encodeProfileBlob(blob).toString("base64");
    assert.equal(validateSnapshot(source, caps).behaviors.populatedStepCount, 8);
    assert.throws(() => validateSnapshot(source, {...caps, maxTapStepsPerBehavior: 5, maxPopulatedBehaviorSteps: 640}));
    const draft = new ProfileDraftSession({document: source, fingerprint: fingerprint(source), summary: summary(source)}, "test", caps);
    draft.stage({type: "updateKeyBehaviorFeedback", draftRevision: draft.revision, config: {tapBranchColors: Array.from({length: 7}, (_, h) => ({h: h + 1, s: 255, v: 10})),
        tapCommittedColor: decoded.rgb.keyFeedback.tapCommittedColor, holdActiveColor: decoded.rgb.keyFeedback.holdActiveColor,
        longHoldActiveColor: decoded.rgb.keyFeedback.longHoldActiveColor, tapCommitMode: "KEY_FEEDBACK_TAP_COMMIT_NON_BASE_TAPS",
        locality: "RGB_BOTH_HALVES"}});
    assert.equal(draft.current.decoded.rgb.keyFeedback.tapBranchColors[6].h, 7);
    draft.undo(draft.revision); assert.equal(draft.current.fingerprint, fingerprint(source));
    draft.redo(draft.revision);
    const item = draft.changes().find(item => item.unit === "rgb:key");
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
