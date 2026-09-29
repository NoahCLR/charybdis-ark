"use strict";

// What a dual-role key does on its first press where its behaviour row leaves
// the tier empty. The keyboard fills that gap with the key's own meaning, so an
// empty cell is not "nothing": LT() taps its key and holds its layer, MT() taps
// its key and holds its modifiers, OSM() taps as a one-shot and holds its
// modifiers. Each fact is claimed only by firmware that advertises it: authored
// LT() rows since physical gesture timing (Profile Wire bit 17), MT() and OSM()
// rows since runtime-owned tapping (bit 18). Older firmware classified those
// keys in QMK first, and the app does not guess what that produced.
const {PROFILE_ACTION_KINDS: ACTION} = require("../schema/profile-blob-v1");
const {keycodeAction} = require("../schema/actions");

const within = (code, start, end) => code >= start && code <= end;

function builtInFirstStep(target, {physicalGestureTiming = false, ownedTapping = false} = {}) {
    if (target?.kind !== ACTION.QMK_KEYCODE || !Number.isInteger(target.operand)) return {};
    const code = target.operand;
    if (within(code, 0x4000, 0x4fff) && physicalGestureTiming) {
        return {tap: keycodeAction(code & 0xff), hold: {kind: ACTION.LAYER_MOMENTARY, operand: (code >> 8) & 0x0f}};
    }
    if (within(code, 0x2000, 0x3fff) && ownedTapping) {
        return {tap: keycodeAction(code & 0xff), hold: keycodeAction(((code >> 8) & 0x1f) << 8)};
    }
    if (within(code, 0x52a0, 0x52bf) && ownedTapping) {
        return {tap: keycodeAction(code), hold: keycodeAction((code & 0x1f) << 8)};
    }
    return {};
}

module.exports = {builtInFirstStep};
