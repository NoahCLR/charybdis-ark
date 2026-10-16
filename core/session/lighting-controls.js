// @ts-check
"use strict";
const {boundDraft} = require("./panel-session-state");
const {buildPanelModel} = require("./panel-session");
const {panelState} = require("./demo-session");
/** @typedef {import('./types.js').RunningPanelSession} Session */
/** @typedef {import('../../contracts/messages.js').ControlsOn<'lighting'> & Partial<import('../../contracts/edits.js').DraftIdentity>} Message */
/** @typedef {{surface(visible: boolean): Promise<unknown>}} Surface */
/** @type {Record<string, (session: Session, message: Message, surface: Surface) => Promise<unknown> | void>} */
const LIGHTING_ACTIONS = {
    surface(session, message, surface) {if (message.type === "lightingSurface") return surface.surface(message.visible === true);},
    pause(session) {session.service.lightingLive?.pauseLive();},
    stop(session) {return session.service.lightingLive?.stopPreview();},
    start(session, message) {const live = ready(session, message);live.startLive();},
    try(session, message) {
        const live = ready(session, message);
        if (message.type !== "tryLightingFrame") return;
        const model = buildPanelModel(session, panelState(session)), lighting = model.rgb.lighting;
        session.draft?.assertRevision(message.draftRevision ?? NaN);
        if (!lighting || lighting.unknownRules || lighting.rules.some(r => r.readOnly) || lighting.program.maps.some(map => map.some(v => v >= 128 && !lighting.descriptors.paints[v - 128])) || lighting.program.things.some(t => !lighting.descriptors.things[t.kind]) || lighting.program.extensions.some(e => !lighting.descriptors.domainExtensions[e.kind])) throw new Error("This look contains lighting Ark cannot fully interpret. Choose a complete known look.");
        if (!Array.isArray(message.frame) || message.frame.length !== 174 || message.frame.some(n => !Number.isInteger(n) || n < 0 || n > 255)) throw new Error("A temporary look needs one known RGB colour for each of the 58 LEDs.");
        live.startPreview(Uint8Array.from(message.frame));
    },
};
/** @param {Session} session @param {Message} message */
function ready(session, message) {
    boundDraft(session, panelState(session), message, "Read this keyboard again before starting Live lighting.");
    const live = session.service.lightingLive;
    if (!live || session.demo) throw new Error("Live lighting needs a connected keyboard that advertises support. The demo has no keyboard.");
    return live;
}
/** @param {Session} session @param {Message} message @param {Surface} surface */
function lightingControl(session, message, surface) {
    const action = require("./panel-control-registry").panelControl(message.type)?.action;
    if (action && LIGHTING_ACTIONS[action]) return LIGHTING_ACTIONS[action](session, message, surface);
}
module.exports = {LIGHTING_ACTIONS, lightingControl};
