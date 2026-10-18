// @ts-check
"use strict";

// QMK spellings the vendored catalogue does not list: the mod-tap shorthands
// (LCTL_T(kc) and family), the deprecated wrapper and mod-tap names QMK still
// accepts (quantum_keycodes_legacy.h: SGUI, SCMD, C_S_T, ALL_T, …), the
// one-shot modifier names (OS_LCTL, …) and keycode names older keymaps use
// (KC_BTN1, KC_MS_U, KC_WH_D, RESET, …). Each one names exactly the keycode
// QMK compiles it to, so a keymap copied from a guide types in as it is.
// Inert data: the catalogue's encoder reads it.

/** @type {Readonly<Record<string, string>>} The modifiers each mod-tap shorthand holds, as MT() spells them. */
const MOD_TAP_SHORTHANDS = Object.freeze({
    LCTL_T: "MOD_LCTL", LSFT_T: "MOD_LSFT", LALT_T: "MOD_LALT", LGUI_T: "MOD_LGUI",
    CTL_T: "MOD_LCTL", SFT_T: "MOD_LSFT", ALT_T: "MOD_LALT", GUI_T: "MOD_LGUI",
    LOPT_T: "MOD_LALT", LCMD_T: "MOD_LGUI", LWIN_T: "MOD_LGUI",
    OPT_T: "MOD_LALT", CMD_T: "MOD_LGUI", WIN_T: "MOD_LGUI",
    LCS_T: "MOD_LCTL|MOD_LSFT", LCA_T: "MOD_LCTL|MOD_LALT", LCG_T: "MOD_LCTL|MOD_LGUI",
    LSA_T: "MOD_LSFT|MOD_LALT", LSG_T: "MOD_LSFT|MOD_LGUI", LAG_T: "MOD_LALT|MOD_LGUI",
    LCSG_T: "MOD_LCTL|MOD_LSFT|MOD_LGUI", LCAG_T: "MOD_LCTL|MOD_LALT|MOD_LGUI", LSAG_T: "MOD_LSFT|MOD_LALT|MOD_LGUI",
    RCTL_T: "MOD_RCTL", RSFT_T: "MOD_RSFT", RALT_T: "MOD_RALT", RGUI_T: "MOD_RGUI",
    ROPT_T: "MOD_RALT", ALGR_T: "MOD_RALT", RCMD_T: "MOD_RGUI", RWIN_T: "MOD_RGUI",
    RCS_T: "MOD_RCTL|MOD_RSFT", RCA_T: "MOD_RCTL|MOD_RALT", RCG_T: "MOD_RCTL|MOD_RGUI",
    RSA_T: "MOD_RSFT|MOD_RALT", RSG_T: "MOD_RSFT|MOD_RGUI", RAG_T: "MOD_RALT|MOD_RGUI",
    RCSG_T: "MOD_RCTL|MOD_RSFT|MOD_RGUI", RCAG_T: "MOD_RCTL|MOD_RALT|MOD_RGUI", RSAG_T: "MOD_RSFT|MOD_RALT|MOD_RGUI",
    MEH_T: "MOD_LCTL|MOD_LSFT|MOD_LALT", HYPR_T: "MOD_LCTL|MOD_LSFT|MOD_LALT|MOD_LGUI",
    // Deprecated in QMK, still compiled.
    C_S_T: "MOD_LCTL|MOD_LSFT", ALL_T: "MOD_LCTL|MOD_LSFT|MOD_LALT|MOD_LGUI",
    SGUI_T: "MOD_LSFT|MOD_LGUI", SCMD_T: "MOD_LSFT|MOD_LGUI", SWIN_T: "MOD_LSFT|MOD_LGUI",
    SAGR_T: "MOD_RSFT|MOD_RALT",
});

/** @type {Readonly<Record<string, string>>} Deprecated modifier wrappers and the wrapper they stand for. */
const WRAPPER_ALIASES = Object.freeze({SGUI: "LSG", SCMD: "LSG", SWIN: "LSG", SAGR: "RSA"});

/** @type {Readonly<Record<string, string>>} A name QMK accepts, as the expression it compiles to. */
const NAMES = Object.freeze({
    // One-shot modifiers.
    OS_LCTL: "OSM(MOD_LCTL)", OS_LSFT: "OSM(MOD_LSFT)", OS_LALT: "OSM(MOD_LALT)", OS_LGUI: "OSM(MOD_LGUI)",
    OS_LCS: "OSM(MOD_LCTL|MOD_LSFT)", OS_LCA: "OSM(MOD_LCTL|MOD_LALT)", OS_LCG: "OSM(MOD_LCTL|MOD_LGUI)",
    OS_LSA: "OSM(MOD_LSFT|MOD_LALT)", OS_LSG: "OSM(MOD_LSFT|MOD_LGUI)", OS_LAG: "OSM(MOD_LALT|MOD_LGUI)",
    OS_LCSG: "OSM(MOD_LCTL|MOD_LSFT|MOD_LGUI)", OS_LCAG: "OSM(MOD_LCTL|MOD_LALT|MOD_LGUI)", OS_LSAG: "OSM(MOD_LSFT|MOD_LALT|MOD_LGUI)",
    OS_RCTL: "OSM(MOD_RCTL)", OS_RSFT: "OSM(MOD_RSFT)", OS_RALT: "OSM(MOD_RALT)", OS_RGUI: "OSM(MOD_RGUI)",
    OS_RCS: "OSM(MOD_RCTL|MOD_RSFT)", OS_RCA: "OSM(MOD_RCTL|MOD_RALT)", OS_RCG: "OSM(MOD_RCTL|MOD_RGUI)",
    OS_RSA: "OSM(MOD_RSFT|MOD_RALT)", OS_RSG: "OSM(MOD_RSFT|MOD_RGUI)", OS_RAG: "OSM(MOD_RALT|MOD_RGUI)",
    OS_RCSG: "OSM(MOD_RCTL|MOD_RSFT|MOD_RGUI)", OS_RCAG: "OSM(MOD_RCTL|MOD_RALT|MOD_RGUI)", OS_RSAG: "OSM(MOD_RSFT|MOD_RALT|MOD_RGUI)",
    OS_MEH: "OSM(MOD_LCTL|MOD_LSFT|MOD_LALT)", OS_HYPR: "OSM(MOD_LCTL|MOD_LSFT|MOD_LALT|MOD_LGUI)",
    // Hyper and Meh as keys of their own.
    KC_HYPR: "HYPR(KC_NO)", KC_MEH: "MEH(KC_NO)",
    // Mouse keys before QMK 0.27 renamed them.
    KC_BTN1: "MS_BTN1", KC_BTN2: "MS_BTN2", KC_BTN3: "MS_BTN3", KC_BTN4: "MS_BTN4",
    KC_BTN5: "MS_BTN5", KC_BTN6: "MS_BTN6", KC_BTN7: "MS_BTN7", KC_BTN8: "MS_BTN8",
    KC_MS_BTN1: "MS_BTN1", KC_MS_BTN2: "MS_BTN2", KC_MS_BTN3: "MS_BTN3", KC_MS_BTN4: "MS_BTN4",
    KC_MS_BTN5: "MS_BTN5", KC_MS_BTN6: "MS_BTN6", KC_MS_BTN7: "MS_BTN7", KC_MS_BTN8: "MS_BTN8",
    KC_MS_U: "MS_UP", KC_MS_D: "MS_DOWN", KC_MS_L: "MS_LEFT", KC_MS_R: "MS_RGHT",
    KC_MS_UP: "MS_UP", KC_MS_DOWN: "MS_DOWN", KC_MS_LEFT: "MS_LEFT", KC_MS_RIGHT: "MS_RGHT",
    KC_WH_U: "MS_WHLU", KC_WH_D: "MS_WHLD", KC_WH_L: "MS_WHLL", KC_WH_R: "MS_WHLR",
    KC_MS_WH_UP: "MS_WHLU", KC_MS_WH_DOWN: "MS_WHLD", KC_MS_WH_LEFT: "MS_WHLL", KC_MS_WH_RIGHT: "MS_WHLR",
    KC_ACL0: "MS_ACL0", KC_ACL1: "MS_ACL1", KC_ACL2: "MS_ACL2",
    KC_MS_ACCEL0: "MS_ACL0", KC_MS_ACCEL1: "MS_ACL1", KC_MS_ACCEL2: "MS_ACL2",
    // Boot and EEPROM keys before QK_ names.
    RESET: "QK_BOOT", EEP_RST: "EE_CLR", EEPROM_RESET: "EE_CLR",
    // Modifier and language keys by their older names.
    KC_LCTRL: "KC_LCTL", KC_RCTRL: "KC_RCTL", KC_LSHIFT: "KC_LSFT", KC_RSHIFT: "KC_RSFT",
    KC_LANG1: "KC_LNG1", KC_LANG2: "KC_LNG2", KC_LANG3: "KC_LNG3", KC_LANG4: "KC_LNG4", KC_LANG5: "KC_LNG5",
    KC_LANG6: "KC_LNG6", KC_LANG7: "KC_LNG7", KC_LANG8: "KC_LNG8", KC_LANG9: "KC_LNG9",
    KC_RO: "KC_INT1", KC_KANA: "KC_INT2", KC_JYEN: "KC_INT3", KC_HENK: "KC_INT4", KC_MHEN: "KC_INT5",
    KC_HAEN: "KC_LNG1", KC_HANJ: "KC_LNG2", KC_ZKHK: "KC_GRV",
});

module.exports = {MOD_TAP_SHORTHANDS, WRAPPER_ALIASES, NAMES};
