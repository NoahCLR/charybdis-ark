// @ts-check
// Human-facing keycode sections. QMK's source groups are useful provenance,
// but they are not a useful first navigation model for somebody configuring a
// keyboard, so the picker presents task-shaped categories instead.

/** @typedef {import("./types.js").PickerEntry} Entry */
/** @typedef {import("./types.js").PickerKeyGroup} KeyGroup */

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
// The keyboard's 128 custom keys, by the names the model gives them.
const isCustom = inGroups("Custom keys");
/** @param {Entry} entry */
const isSymbol = (entry) => entry.group === "shifted" || (entry.group === "basic" && SYMBOLS.has(valueOf(entry)));
/** @param {Entry} entry */
const isNavigation = (entry) => entry.group === "basic" && NAVIGATION.has(valueOf(entry));
/** @param {Entry} entry */
const isNumpad = (entry) => entry.group === "basic" && /^KC_(?:KP_|NUMPAD_|NUM_LOCK$)/.test(valueOf(entry));
/** @param {Entry} entry */
const isFunction = (entry) => entry.group === "basic" && /^KC_F(?:[1-9]|1\d|2[0-4])$/.test(valueOf(entry));
/** @param {Entry} entry */
const isLetterOrDigit = (entry) => entry.group === "basic" && /^KC_(?:[A-Z]|[0-9])$/.test(valueOf(entry));
const TYPING = /^KC_(?:ENTER|ESCAPE|BACKSPACE|TAB|SPACE|CAPS_LOCK)$/;
// The keys most keymaps use: for typing, modifiers, getting around, the
// function keys, and what a key holds when it does nothing.
/** @param {Entry} entry */
const isCommonKey = (entry) => entry.group === "modifiers" || entry.group === "internal" || isNavigation(entry) || isFunction(entry)
    || (entry.group === "basic" && TYPING.test(valueOf(entry)));
/** @param {Entry} entry */
const isMoreKey = (entry) => entry.group === "basic" && !isSymbol(entry) && !isCommonKey(entry) && !isNumpad(entry) && !isLetterOrDigit(entry);

// A section's groups, in order, are the picker's own way of telling its keys
// apart; no keyboard stores them. A key is in the first group that takes it,
// and a section's last group takes the rest, so none is lost. They go by
// keycode name, which the catalogue fixes, never by a key's words.
/** @param {string} name @param {KeyGroup["takes"]} takes @returns {KeyGroup} */
const group = (name, takes) => ({name, takes});
/** @param {RegExp} names @returns {KeyGroup["takes"]} */
const named = (names) => (entry) => names.test(valueOf(entry));
/** @param {string} source @returns {KeyGroup["takes"]} */
const from = (source) => (entry) => entry.group === source;
const rest = () => true;
// A group with an order of its own, where the catalogue's reads wrong (Right
// before Left).
/** @param {string} name @param {string[]} values @returns {KeyGroup} */
const listed = (name, ...values) => ({name, takes: (entry) => values.includes(valueOf(entry)), order: values});
/** @type {KeyGroup["takes"]} */
const customKeyNamed = (entry, model) => Boolean(model?.customKeys?.some((key) => key.keycode === valueOf(entry) && key.name));

/** @returns {import("./types.js").PickerSection[]} */
export function pickerSections() {
    return [
        {id: "board", label: "Keyboard", kind: "board"},
        {id: "letters", label: "Letters and digits", kind: "catalogue", filter: isLetterOrDigit, groups: [group("Letters", named(/^KC_[A-Z]$/)), group("Digits", rest)]},
        {id: "symbols", label: "Symbols", kind: "catalogue", filter: isSymbol, groups: [group("Unshifted", from("basic")), group("Shifted", rest)]},
        {id: "numpad", label: "Numpad", kind: "catalogue", filter: isNumpad, groups: [group("Digits", named(/^KC_KP_\d$/)), group("Signs and lock", rest)]},
        {id: "common", label: "Common keys", kind: "catalogue", filter: isCommonKey, groups: [
            group("Typing", named(TYPING)),
            group("Modifiers", from("modifiers")),
            listed("Arrows", "KC_LEFT", "KC_RIGHT", "KC_UP", "KC_DOWN"),
            listed("Navigation", "KC_HOME", "KC_END", "KC_PAGE_UP", "KC_PAGE_DOWN", "KC_INSERT", "KC_DELETE"),
            group("System", isNavigation),
            group("Function", isFunction),
            group("No key", rest),
        ]},
        {id: "layers", label: "Layers", kind: "layers"},
        {id: "macros", label: "Macros", kind: "macros"},
        {id: "custom", label: "Custom keys", kind: "catalogue", filter: isCustom, groups: [group("Named", customKeyNamed), group("Unnamed", rest)]},
        {id: "modes", label: "Pointing modes", kind: "modes"},
        {id: "mouse", label: "Mouse", kind: "catalogue", filter: (entry) => entry.group === "mouse" || isKeyboardKey(entry), groups: [
            group("Cursor", named(/CURSOR/)), group("Wheel", named(/WHEEL/)), group("Buttons", named(/BUTTON/)), group("Acceleration", named(/ACCELERATION/)), group("DPI and sniping", rest),
        ]},
        {id: "media", label: "Media", kind: "catalogue", filter: inGroups("media", "audio"), groups: [
            group("Playback", named(/MEDIA_/)), group("Volume", named(/AUDIO/)), group("Screen", named(/BRIGHTNESS/)), group("Browser", named(/WWW/)), group("Apps", rest),
        ]},
        {id: "more", label: "More keys", kind: "catalogue", filter: isMoreKey, groups: [
            group("Editing", named(/^KC_(?:UNDO|CUT|COPY|PASTE|FIND|AGAIN)$/)),
            group("International", named(/INTERNATIONAL/)),
            group("Language", named(/LANGUAGE/)),
            group("System", named(/^KC_(?:APPLICATION|KB_POWER|EXECUTE|HELP|MENU|STOP|KB_MUTE|KB_VOLUME_)/)),
            group("Rarely used", rest),
        ]},
        {id: "lighting", label: "Lighting", kind: "catalogue", filter: inGroups("backlight", "led_matrix", "underglow", "rgb", "rgb_matrix"), groups: [
            group("Switch", named(/_(?:ON|OFF|TOGGLE)$/)), group("Effect", named(/MODE|FLAG/)), group("Colour", rest),
        ]},
        {id: "magic", label: "Magic", kind: "catalogue", filter: inGroups("magic", "swap_hands"), groups: [
            group("Swaps", named(/SWAP|TOGGLE_(?:CONTROL|BACKSLASH|ALT_GUI|CTL_GUI|ESCAPE)/)), group("Switches", rest),
        ]},
        {id: "other", label: "Other QMK", kind: "catalogue", filter: inGroups(
            "connection", "joystick", "midi", "programmable_button", "quantum", "sequencer", "steno", "system",
        ), groups: [
            group("System", from("system")), group("Firmware", named(/BOOTLOADER|REBOOT|DEBUG|EEPROM|MAKE/)), group("Space Cadet", named(/SPACE_CADET/)), group("Features", rest),
        ]},
        {id: "all", label: "All keycodes", kind: "all"},
    ];
}

/** @template {Entry} T @param {T[]} catalogue @param {import("./types.js").PickerSection | undefined} section */
export const entriesForPickerSection = (catalogue, section) =>
    section?.kind === "all" ? catalogue.filter(pickable)
    : section?.kind === "catalogue" ? catalogue.filter((entry) => pickable(entry) && section.filter(entry)) : [];

// A catalogue section's keys in its groups, the ones with any.
/** @template {Entry} T @param {Extract<import("./types.js").PickerSection, {kind: "catalogue"}>} section @param {T[]} entries @param {import("../../contracts/panel.js").PublishedModel | null} model @returns {{name: string, entries: T[]}[]} */
export function groupedEntries(section, entries, model) {
    const left = new Set(entries);
    return section.groups.map(({name, takes, order}) => {
        const taken = entries.filter((entry) => left.has(entry) && takes(entry, model));
        taken.forEach((entry) => left.delete(entry));
        if (order) taken.sort((a, b) => order.indexOf(valueOf(a)) - order.indexOf(valueOf(b)));
        return {name, entries: taken};
    }).filter((each) => each.entries.length);
}
