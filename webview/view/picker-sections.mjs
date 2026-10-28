// @ts-check
// Human-facing keycode sections. QMK's source groups are useful provenance,
// but they are not a useful first navigation model for somebody configuring a
// keyboard, so the picker presents task-shaped categories instead.

/** @typedef {Pick<import("../../contracts/panel.js").CatalogEntry, "group"> & {value?: string, key?: string, name?: string, offered?: boolean}} Entry */

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
// Whether the picker offers an entry at all, in any section or search: core
// marks the ones it never offers (core/data/offered-keycodes.js), a key
// already holding one still reading back by name.
/** @param {Entry} entry */
export const pickable = (entry) => entry.offered !== false;
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
