"use strict";

// What a key does where its behaviour row leaves a tier empty. The keyboard
// fills that gap with the key's own meaning, so an empty cell is not "nothing".
//
// The key's own tap fills an empty tap at every tap count the row reaches, sent
// once per press: a double tap that authors no tap sends it twice. A plain key
// (a basic keycode, alone or with modifiers) taps itself; LT() taps its key,
// MT() taps its key and OSM() arms its one-shot.
//
// The built-in hold belongs to the first press. LT() holds its layer and MT()
// and OSM() their modifiers, whatever else the row authors. A plain key's hold
// is a fallback: held, it stays down until release, but only while the first
// press authors neither a hold nor a long hold (`fallback`).
//
// A press that has a Long hold but no hold of its own stays in its tap window
// until Long hold, so a release after Tap / hold and before Long hold still
// sends that count's tap (`releaseTaps`). That holds for plain keys, custom
// keys and macros. Layer keys send no tap once held past Tap / hold, pointing
// keys hold their mode, and dual-role keys always have their own hold.
//
// Plain keys have done this on every firmware with a Profile Wire. Dual-role
// keys are claimed only by firmware that advertises it: authored LT() rows since
// physical gesture timing (Profile Wire bit 17), MT() and OSM() rows since
// runtime-owned tapping (bit 18). Older firmware classified those keys in QMK
// first, and the app does not guess what that produced. A bare modifier key is
// buffered rather than tapped, so it claims nothing.
const {PROFILE_ACTION_KINDS: ACTION} = require("../schema/profile-blob-v1");
const {keycodeAction} = require("../schema/actions");
const {customKeyOfCode} = require("../data/user-keycodes");

const within = (code, start, end) => code >= start && code <= end;
const plainKey = (code) => (within(code, 0x0004, 0x00ff) && !within(code, 0x00e0, 0x00e7)) || within(code, 0x0100, 0x1fff);

function builtInActions(target, {physicalGestureTiming = false, ownedTapping = false} = {}) {
    if (target?.kind === ACTION.CUSTOM_KEY || target?.kind === ACTION.VIA_MACRO) return {releaseTaps: true};
    if (target?.kind !== ACTION.QMK_KEYCODE || !Number.isInteger(target.operand)) return {};
    const code = target.operand;
    if (customKeyOfCode(code) !== undefined || within(code, 0x7700, 0x777f)) return {releaseTaps: true};
    if (plainKey(code)) {
        return {tap: keycodeAction(code), hold: keycodeAction(code), fallback: true, releaseTaps: true};
    }
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

module.exports = {builtInActions};
