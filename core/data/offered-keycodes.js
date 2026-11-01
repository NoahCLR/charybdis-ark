// @ts-check
"use strict";

// Which of the keycode catalog's entries the keycode picker offers. A key
// already holding one of the others still reads back by name; the picker just
// never offers it. Core marks each entry the model publishes (`offered`).
//
// - A macro slot is offered by its MACRO_n name, not as QMK's QK_MACRO_n.
// - QMK's User 0–31 entries name the retired, inert custom-key block
//   (user-keycodes.js); the current custom keys have names of their own.
// - Charybdis's own drag scroll ignores the pointing-mode settings; drag
//   scroll is the factory dragscroll pointing slot.
// - Keycodes for QMK features this firmware does not build do nothing on any
//   key. The build enables bootmagic, mouse keys, extra keys, RGB Matrix,
//   pointing, combos and VIA, with QMK's default Magic, Grave Escape and
//   Space Cadet; this list is written against that build until the keyboard
//   reports its features.

const NATIVE_MACRO = /^QK_MACRO_\d+$/;
const RETIRED_USER = /^QK_USER_(?:[0-9]|[12][0-9]|3[01])$/;
const UNSUPPORTED = new Set(["DRGSCRL", "DRG_TOG"]);
const UNBUILT_GROUPS = new Set([
    "audio", "backlight", "connection", "joystick", "led_matrix", "midi", "programmable_button",
    "rgb", "sequencer", "steno", "swap_hands", "underglow",
]);
const UNBUILT = new RegExp("^(?:" + [
    "QK_AUTO_SHIFT_", "QK_AUTOCORRECT_", "QK_CAPS_WORD_", "QK_DYNAMIC_MACRO_", "QK_DYNAMIC_TAPPING_TERM_",
    "QK_HAPTIC_", "QK_KEY_OVERRIDE_", "QK_SECURE_", "QK_TRI_LAYER_", "QK_UNICODE_MODE_",
    "QK_ALT_REPEAT_KEY$", "QK_LAYER_LOCK$", "QK_LEADER$", "QK_LOCK$", "QK_REPEAT_KEY$", "QK_VELOCIKEY_TOGGLE$",
    "KC_LOCKING_",
    // The QK_KB slots the Charybdis leaves unnamed.
    "QK_KB_\\d+$",
].join("|") + ")");

/** Whether the picker offers this catalog entry. @param {{name: string, group: string}} entry */
const offered = ({name, group}) => !NATIVE_MACRO.test(name) && !RETIRED_USER.test(name) && !UNSUPPORTED.has(name)
    && !UNBUILT_GROUPS.has(group) && !UNBUILT.test(name);

module.exports = {offered};
