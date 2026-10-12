// @ts-check
"use strict";
const {PHASE, PHASE_WORDS} = require("../model/vocabulary");

// Panel controls have one policy: where they run, what they bind to, what
// the demo permits and which operation surrounds them. The actions themselves
// live in the controller modules; this inert table cannot import them.
/** @typedef {'draft' | 'portable' | 'demo' | 'read' | 'view' | 'host' | 'inspect'} Route */
/** @typedef {{route: Route, action: string, binding: 'none' | 'apply' | 'import' | 'profile' | 'inspect', demo: 'allow' | 'refuse' | 'ignore' | 'leave' | 'export' | 'open' | 'replace' | 'close' | 'host-leave', phase: 'panel' | 'apply' | 'restore' | 'read' | 'view' | 'host' | 'inspect', identity: boolean}} Control */
/** @type {Readonly<Record<import('../../contracts/messages.js').ControlType, Readonly<Control>>>} */
const CONTROLS = Object.freeze({
    reviewProfileDraft: Object.freeze({route: "draft", action: "review", binding: "none", demo: "allow", phase: "panel", identity: true}),
    undoProfileDraft: Object.freeze({route: "draft", action: "undo", binding: "none", demo: "allow", phase: "panel", identity: true}),
    redoProfileDraft: Object.freeze({route: "draft", action: "redo", binding: "none", demo: "allow", phase: "panel", identity: true}),
    jumpProfileDraft: Object.freeze({route: "draft", action: "jump", binding: "none", demo: "allow", phase: "panel", identity: true}),
    discardProfileDraft: Object.freeze({route: "draft", action: "discard", binding: "none", demo: "allow", phase: "panel", identity: true}),
    discardProfileDraftChanges: Object.freeze({route: "draft", action: "discardChanges", binding: "none", demo: "allow", phase: "panel", identity: true}),
    applyProfileDraft: Object.freeze({route: "draft", action: "apply", binding: "apply", demo: "refuse", phase: "apply", identity: true}),
    rebaseProfileDraft: Object.freeze({route: "draft", action: "rebase", binding: "none", demo: "refuse", phase: "panel", identity: true}),
    closeProfileDraftReview: Object.freeze({route: "draft", action: "closeReview", binding: "none", demo: "allow", phase: "panel", identity: true}),
    exportPortableProfile: Object.freeze({route: "portable", action: "export", binding: "none", demo: "export", phase: "panel", identity: false}),
    choosePortableProfile: Object.freeze({route: "portable", action: "choose", binding: "profile", demo: "allow", phase: "panel", identity: false}),
    reviewPortableProfile: Object.freeze({route: "portable", action: "reviewImport", binding: "import", demo: "allow", phase: "panel", identity: false}),
    restorePortableProfile: Object.freeze({route: "portable", action: "restore", binding: "profile", demo: "allow", phase: "restore", identity: false}),
    managePortableLayers: Object.freeze({route: "portable", action: "manageLayers", binding: "profile", demo: "allow", phase: "panel", identity: false}),
    editPortableLayer: Object.freeze({route: "portable", action: "editLayer", binding: "profile", demo: "allow", phase: "panel", identity: false}),
    savePortableLayers: Object.freeze({route: "portable", action: "saveLayers", binding: "profile", demo: "allow", phase: "restore", identity: false}),
    cancelPortableReview: Object.freeze({route: "portable", action: "cancel", binding: "none", demo: "allow", phase: "panel", identity: false}),
    openDemo: Object.freeze({route: "demo", action: "open", binding: "none", demo: "open", phase: "panel", identity: false}),
    openDemoProfile: Object.freeze({route: "demo", action: "openProfile", binding: "none", demo: "replace", phase: "panel", identity: false}),
    leaveDemo: Object.freeze({route: "demo", action: "leave", binding: "none", demo: "close", phase: "panel", identity: false}),
    ready: Object.freeze({route: "read", action: "read", binding: "none", demo: "ignore", phase: "read", identity: false}),
    refresh: Object.freeze({route: "read", action: "read", binding: "none", demo: "leave", phase: "read", identity: false}),
    selectDevice: Object.freeze({route: "read", action: "select", binding: "none", demo: "leave", phase: "read", identity: false}),
    openProfileDraftHistory: Object.freeze({route: "view", action: "openHistory", binding: "none", demo: "allow", phase: "view", identity: false}),
    closeProfileDraftHistory: Object.freeze({route: "view", action: "closeHistory", binding: "none", demo: "allow", phase: "view", identity: false}),
    chooseKeyboard: Object.freeze({route: "host", action: "chooseKeyboard", binding: "none", demo: "host-leave", phase: "host", identity: false}),
    setTheme: Object.freeze({route: "host", action: "setTheme", binding: "none", demo: "allow", phase: "host", identity: false}),
    downloadRecovery: Object.freeze({route: "host", action: "downloadRecovery", binding: "none", demo: "allow", phase: "host", identity: false}),
    validateViaMacro: Object.freeze({route: "inspect", action: "validateMacro", binding: "inspect", demo: "allow", phase: "inspect", identity: false}),
});

/** @param {string | null | undefined} type @returns {Readonly<Control> | undefined} */
function panelControl(type) {
    return type && Object.hasOwn(CONTROLS, type) ? CONTROLS[/** @type {import('../../contracts/messages.js').ControlType} */ (type)] : undefined;
}
/** @param {Route} route */
const controlsOn = (route) => new Set(Object.entries(CONTROLS).filter(([, control]) => control.route === route).map(([type]) => type));

// Only the active write states warn on closing a browser tab. A portable
// control may merely stage a draft, choose a file or export; it is not a write.
/** @param {{applyRunning?: boolean, service?: {phase?: import("../../contracts/model.js").PhaseId}}} session */
function writingProfile(session) {
    return Object.values(CONTROLS).some(control => control.phase === "apply" && session.applyRunning
        || control.phase === "restore" && Boolean(PHASE_WORDS[session.service?.phase || PHASE.IDLE]?.writes));
}
module.exports = {CONTROLS, panelControl, controlsOn, writingProfile};
