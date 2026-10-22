// @ts-check
// Human-facing keycode sections. QMK's source groups are useful provenance,
// but they are not a useful first navigation model for somebody configuring a
// keyboard, so the picker presents task-shaped categories instead.

/** @typedef {Pick<import("../../contracts/panel.js").CatalogEntry, "group"> & {value?: string, key?: string, name?: string}} Entry */

const SYMBOLS = new Set([
    "KC_GRAVE", "KC_MINUS", "KC_EQUAL", "KC_LEFT_BRACKET", "KC_RIGHT_BRACKET",
    "KC_BACKSLASH", "KC_SEMICOLON", "KC_QUOTE", "KC_COMMA", "KC_DOT", "KC_SLASH",
    "KC_NONUS_HASH", "KC_NONUS_BACKSLASH",
]);
const NAVIGATION = new Set([
    "KC_INSERT", "KC_HOME", "KC_PAGE_UP", "KC_DELETE", "KC_END", "KC_PAGE_DOWN",
    "KC_RIGHT", "KC_LEFT", "KC_DOWN", "KC_UP", "KC_PRINT_SCREEN", "KC_SCROLL_LOCK", "KC_PAUSE",
]);

/** @param {Entry} entry */
const valueOf = (entry) => entry.value || entry.key || entry.name || "";
/** @param {string[]} groups @returns {(entry: Entry) => boolean} */
const inGroups = (...groups) => (entry) => groups.includes(entry.group);
// Macro slots are offered by their VIA_MACRO_n names in the Macros section.
const NATIVE_MACRO = /^QK_MACRO_\d+$/;
// QMK's User 0–31 entries occupy the retired, inert custom-key block.
// Keep their catalogue names for readback; current custom keys have their own names.
const RETIRED_USER = /^QK_USER_(?:[0-9]|[12][0-9]|3[01])$/;
// Charybdis's own drag scroll ignores the pointing-mode settings; drag scroll
// is the factory dragscroll pointing slot. A key already holding one still reads back
// by name, but the picker does not offer it.
const UNSUPPORTED = new Set(["DRGSCRL", "DRG_TOG"]);
// Keycodes for QMK features this firmware does not build, so they do nothing
// on any key: the build enables bootmagic, mouse keys, extra keys, RGB Matrix,
// pointing, combos and VIA, with QMK's default Magic, Grave Escape and Space
// Cadet. A stopgap written against that build until the keyboard reports its
// features.
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
/** @param {Entry} entry */
const unbuilt = (entry) => UNBUILT_GROUPS.has(entry.group) || UNBUILT.test(valueOf(entry));
// Whether the picker offers an entry at all, in any section or search.
/** @param {Entry} entry */
export const pickable = (entry) => !NATIVE_MACRO.test(valueOf(entry)) && !RETIRED_USER.test(valueOf(entry)) && !UNSUPPORTED.has(valueOf(entry)) && !unbuilt(entry);
// The Charybdis's own keys: DPI and sniping.
const isKeyboardKey = inGroups("kb");
// The keyboard's 128 custom keys, by the names the model gives them, and KC_NO/KC_TRNS.
const isCustom = inGroups("Custom keys", "internal");
/** @param {Entry} entry */
const isSymbol = (entry) => entry.group === "shifted" || (entry.group === "basic" && SYMBOLS.has(valueOf(entry)));
/** @param {Entry} entry */
const isNavigation = (entry) => entry.group === "basic" && NAVIGATION.has(valueOf(entry));
/** @param {Entry} entry */
const isNumpad = (entry) => entry.group === "basic" && /^KC_(?:KP|NUMPAD)_/.test(valueOf(entry));
/** @param {Entry} entry */
const isFunction = (entry) => entry.group === "basic" && /^KC_F(?:[1-9]|1\d|2[0-4])$/.test(valueOf(entry));
/** @param {Entry} entry */
const isMoreKey = (entry) => entry.group === "modifiers" || (entry.group === "basic"
    && !isSymbol(entry) && !isNavigation(entry) && !isNumpad(entry)
    && (isFunction(entry) || !/^KC_(?:[A-Z]|[0-9])$/.test(valueOf(entry))));

/** @returns {import("./types.js").PickerSection[]} */
export function pickerSections() {
    return [
        {id: "board", label: "Keyboard", kind: "board"},
        {id: "symbols", label: "Symbols", kind: "catalogue", filter: isSymbol},
        {id: "navigation", label: "Navigation", kind: "catalogue", filter: isNavigation},
        {id: "numpad", label: "Numpad", kind: "catalogue", filter: isNumpad},
        {id: "layers", label: "Layers", kind: "layers"},
        {id: "modes", label: "Pointing modes", kind: "modes"},
        {id: "macros", label: "Macros", kind: "macros"},
        {id: "mouse", label: "Mouse", kind: "catalogue", filter: (entry) => entry.group === "mouse" || isKeyboardKey(entry)},
        {id: "media", label: "Media", kind: "catalogue", filter: inGroups("media", "audio")},
        {id: "lighting", label: "Lighting", kind: "catalogue", filter: inGroups("backlight", "led_matrix", "underglow", "rgb", "rgb_matrix")},
        {id: "magic", label: "Magic", kind: "catalogue", filter: inGroups("magic", "swap_hands")},
        {id: "custom", label: "Custom keys", kind: "catalogue", filter: isCustom},
        {id: "more", label: "More keys", kind: "catalogue", filter: isMoreKey},
        {id: "other", label: "Other QMK", kind: "catalogue", filter: inGroups(
            "connection", "joystick", "midi", "programmable_button", "quantum", "sequencer", "steno", "system",
        )},
        {id: "all", label: "All keycodes", kind: "catalogue", filter: () => true},
    ];
}

/** @template {Entry} T @param {T[]} catalogue @param {import("./types.js").PickerSection | undefined} section */
export const entriesForPickerSection = (catalogue, section) =>
    section?.kind === "catalogue" ? catalogue.filter((entry) => pickable(entry) && section.filter(entry)) : [];
