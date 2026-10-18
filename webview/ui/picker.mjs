// @ts-check
/**
 * @typedef {import("../../contracts/panel.js").PublishedModel | null} Model
 * @typedef {import("../../contracts/panel.js").MacroSlot} MacroSlot
 * @typedef {import("../view/picker-choice.mjs").Hold} Hold
 */
// Selector assertions describe the authored sheet; click targets can be SVG
// board keys, whose nearest data-bearing ancestor supplies the same dataset.
// The keycode picker: a real keyboard first, then the sections this keyboard
// actually has — its layers, its pointing slots, its macro banks — and the
// vendored QMK catalogue behind a search. On a layout key it also builds a
// tap with a hold (decisions R7): the footer's Tap and Hold slots.

import {el, esc} from "../lib/dom.mjs";
import {getModel, layerName, layers, render, state} from "../store.mjs";
import {actionMarked, keyNameMarked, layerNameMarked, slotLight} from "./marks.mjs";
import {PICKER_BOARD, legendFits, pickerBoardKey} from "../view/picker-board.mjs";
import {pickerExpression} from "../view/edits.mjs";
import {modifierPick, pickerModifierProblem} from "../view/keyvalues.mjs";
import {entriesForPickerSection, pickable, pickerSections} from "../view/picker-sections.mjs";
import {macroMatches} from "../view/macro.mjs";
import {customKeyChoice, hasShortcut, offeredName, shortcutOffer, shortcutPick, shortcutPickLabel, shortcutPickMods, shortcutModifiers, unusedCustomKey} from "../view/custom-key.mjs";
import {vocabulary, word} from "../view/vocabulary.mjs";
import {keycodeAside} from "../view/show-keycodes.mjs";
import {HOLD_MODS, dangerOf, entryMatches, holdEdit, keycodeScope, layerChoices, layerResults, modifierBlock, pickerChoice, rememberLayerKey, seedPick, tapShortcut, typedExpression} from "../view/picker-choice.mjs";

/** @param {Model} model */
const modifierControls = model => vocabulary(model).pickerModifiers || [];

// Layer keys picked lately, newest first, offered in the Basics strip.
/** @type {string[]} */
let recentLayerKeys = [];

/** @param {import("./editor-types.js").PickerOptions} options */
// `shortcut` picks a custom key's shortcut (firmware D-F26): the same board and
// modifier row, but any of the eight modifiers mix, sides included, a key is
// optional, and the choice goes to `onShortcut` as a mask and a key.
// `onCustomKey` lets a keycode field take modifiers no keycode can hold — both
// sides at once, or no key — through a custom key with that shortcut (D-L63):
// one that already has it is picked as any key is, otherwise an unused one is
// made it. The picker names the key either way. `customKeyRuns` says what the
// field does with a custom key: runs its behaviour too (a layout key, a combo
// output), or sends only its shortcut (a behaviour step).
// `target` is the layout key being changed: the picker then offers the Hold
// slot and Transparent, checks layer keys as the keyboard does, and posts a
// hold through `onEdit`. `hold` opens it with the Hold slot's menu open.
export function openPicker({title, heading, context, contextKeycode, seed = [], mode = "single", allowedKeys = null, modifiable = null, shortcut = null, maxKeys = Infinity, target = null, hold = false, onPick, onEdit, onShortcut, onCustomKey, customKeyRuns = "behaviour"}) {
    const model = getModel();
    const seeded = mode === "single" && !shortcut && !allowedKeys && seed[0] ? seedPick(model, seed[0]) : null;
    const keys = seeded ? seeded.keys : allowedKeys ? seed.map(key => model?.qmkKeycodeAliases?.[key] || key) : seed.slice();
    const mods = shortcut ? shortcutPickMods(model, shortcut.mods) : seeded?.mods || [];
    state.picker = {title, heading, context, contextKeycode, mode, allowedKeys, modifiable, shortcut: Boolean(shortcut), maxKeys,
        section: sectionFor(model, keys[0] || ""), search: "", mods, keys, hold: target ? seeded?.hold || null : null,
        holdMenu: target && hold ? "root" : null, focusHold: Boolean(target && hold), holdScope: null, showEmpty: [], cursor: 0,
        target, onPick, onEdit, onShortcut, onCustomKey, customKeyRuns};
    render();
}

// The section a key lives in, so the picker opens where the key is.
/** @param {Model} model @param {string} key */
function sectionFor(model, key) {
    if (!key) return "board";
    if (/^(?:MO|LOCK_LAYER|TG|TT|OSL|TO)\(/.test(key)) return "layers";
    if (/^PD_SLOT_\d+/.test(key)) return "modes";
    if (/^VIA_MACRO_\d+$/.test(key)) return "macros";
    if (/^CUSTOM_KEY_\d+$/.test(key)) return "custom";
    const canonical = model?.qmkKeycodeAliases?.[key] || key;
    if (PICKER_BOARD.keys.some((source) => (model?.qmkKeycodeAliases?.[source.value] || source.value) === canonical)) return "board";
    const entry = (model?.qmkKeycodes || []).find((row) => row.value === canonical);
    const section = entry && pickerSections().find((candidate) => candidate.kind === "catalogue" && entriesForPickerSection([entry], candidate).length);
    return section?.id || "board";
}

// Layer keycodes are posted by index — MO(1), LOCK_LAYER(1), LT(1, KC_A) —
// the form the keyboard reports and the draft encodes; the name is display.
/** @param {string | number} index */
const layerTapName = (index) => layerName(layers()[Number(index)]) || `Layer ${index}`;

export const closePicker = () => { state.picker = null; render(); };

/** @param {string} value */
const pickValue = (value) => state.picker?.allowedKeys ? getModel()?.qmkKeycodeAliases?.[value] || value : value;
// A shortcut also takes a key that is or carries modifiers: a modifier key
// is its button in the row, and a shifted symbol is its key with those
// modifiers lit.
/** @param {string} value */
const heldModifiers = (value) => state.picker?.shortcut ? shortcutModifiers(getModel(), value) : null;
/** @param {string} value */
const allowed = (value) => !state.picker?.allowedKeys || state.picker?.allowedKeys?.includes(value) || Boolean(heldModifiers(value));
/** @param {Model} model */
const sections = (model) => pickerSections().filter(section => !state.picker?.allowedKeys || section.kind === "board"
    || (section.kind === "macros" && (model?.viaMacros || []).some(slot => allowed(slot.keycode)))
    || entriesForPickerSection(model?.qmkKeycodes || [], section).some(entry => allowed(entry.value)));
// The Basics strip: Nothing everywhere a single key is chosen, and on a
// layout key Transparent and the layer keys used lately.
/** @param {import("../state.js").PickerState} picker */
const basics = (picker) => picker.mode === "single" && !picker.shortcut && !picker.allowedKeys;

// Modifiers alone, or with a modifier key, are one set of modifiers, stored as
// the simplest keycode that holds them (modifierPick): Command, Right Command
// and the Left Command key are RGUI(KC_LEFT_GUI). Any other selection is
// stored as picked.
/** @param {Model} model @param {import("../state.js").PickerState} picker */
const folded = (model, picker) => !picker.shortcut && picker.mode === "single" && !picker.hold ? modifierPick(model, picker) : null;
/** @param {Model} model @param {import("../state.js").PickerState} picker */
const stored = (model, picker) => {
    const fold = folded(model, picker);
    return fold && "keys" in fold ? {...picker, ...fold} : picker;
};

/** @param {Model} model @param {import("../state.js").PickerState} picker */
const choiceOf = (model, picker) => picker.shortcut
    ? {expression: shortcutPickLabel(model, shortcutPick(model, picker)), problem: "", behaviour: false, customKey: false}
    : pickerChoice(model, picker, {key: Boolean(picker.target), folded: picker.hold ? undefined : pickerExpression(stored(model, picker))});

/** @template T @param {T[]} values @param {number} size */
const chunk = (values, size) => values.reduce((rows, value, index) =>
    (index % size ? rows[rows.length - 1].push(value) : rows.push([value]), rows), /** @type {T[][]} */ ([]));

/** @param {Pick<import("../../contracts/panel.js").CatalogEntry, "value" | "label" | "tip">} entry @param {boolean} picked @param {string} [extra] */
function keyButton(entry, picked, extra = "") {
    const danger = dangerOf(getModel(), entry.value);
    const tip = [danger, entry.tip].filter(Boolean).join(" ");
    return `<button class="pk ${picked ? "on" : ""} ${danger ? "danger" : ""}" data-pick="${esc(entry.value)}"${tip ? ` data-tip="${esc(tip)}"` : ""}${extra}>
        <span class="l">${danger ? `<span class="pk-warn" aria-label="Warning">⚠</span> ` : ""}${esc(entry.label || entry.value)}</span><span class="c">${esc(keycodeAside(state, "pickerButton", entry.value, entry.label))}</span></button>`;
}

// A macro slot shows by its name when it has one, with its slot and size
// underneath, so a named macro is recognisable wherever it is offered.
/** @param {MacroSlot} slot @param {boolean} picked @param {string} [extra] */
function macroButton(slot, picked, extra = "") {
    const number = slot.keycode.split("_").at(-1), code = keycodeAside(state, "pickerButton", slot.keycode);
    return `<button class="pk ${slot.name ? "wide" : ""} ${picked ? "on" : ""}" data-pick="${esc(slot.keycode)}"${code ? ` data-tip="${esc(code)}"` : ""}${extra}>
        <span class="l">${esc(slot.name || `Macro ${number}`)}</span>
        <span class="c">M${esc(number)} · ${slot.empty ? "empty" : `${slot.bytes} B`}</span></button>`;
}

// Empty slots wait behind one button per section, so a bank of 128 macros
// shows the ones in use.
/** @param {import("../state.js").PickerState} picker @param {string} id @param {number} count */
const emptyFold = (picker, id, count) => !count ? "" : picker.showEmpty.includes(id)
    ? `<button class="btn text pk-fold" data-empty="${esc(id)}" aria-expanded="true">Hide ${count} empty</button>`
    : `<button class="btn text pk-fold" data-empty="${esc(id)}" aria-expanded="false">Show ${count} empty</button>`;

/**
 * Everything a search finds, in the order ↑ and ↓ walk it: a typed
 * expression first, then layer keys, macros and the catalogue.
 * @typedef {{kind: 'typed', expression: string, problem: string} | {kind: 'layer', value: string, verb: string, layer: number, name: string, tip: string, arms?: boolean} | {kind: 'macro', slot: MacroSlot} | {kind: 'entry', entry: import("../../contracts/panel.js").CatalogEntry}} Result
 */
/** @param {Model} model @param {import("../state.js").PickerState} picker @returns {Result[]} */
function searchResults(model, picker) {
    const query = picker.search.trim();
    if (!query) return [];
    const single = picker.mode === "single" && !picker.shortcut;
    const typed = single && !picker.allowedKeys ? typedExpression(model, query) : null;
    const layered = single && !picker.allowedKeys ? layerResults(layers(), query).filter((result) => !result.arms || picker.target) : [];
    const macros = (model?.viaMacros || []).filter((slot) => allowed(slot.keycode) && macroMatches(slot, query.toLowerCase()));
    const entries = (model?.qmkKeycodes || []).filter((entry) => allowed(entry.value) && pickable(entry) && entryMatches(model, entry, query)).slice(0, 64);
    return [
        ...(typed ? [{kind: /** @type {const} */ ("typed"), ...typed}] : []),
        ...layered.map((result) => ({...result})),
        ...macros.map((slot) => ({kind: /** @type {const} */ ("macro"), slot})),
        ...entries.map((entry) => ({kind: /** @type {const} */ ("entry"), entry})),
    ];
}

/** @param {Model} model @param {string} value */
const canonical = (model, value) => model?.qmkKeycodeAliases?.[value] || value;

/** @param {Model} model */
function sectionBody(model) {
    const picker = state.picker;
    if (!picker) return "";
    const catalogue = model?.qmkKeycodes || [];
    /** @param {string} value */
    const picked = (value) => {
        const held = heldModifiers(value);
        return held ? (!held.key || picker.keys[0] === held.key) && shortcutPickMods(model, held.mods).every((mod) => picker.mods.includes(mod))
            : picker.keys.some((key) => canonical(model, key) === canonical(model, pickValue(value)));
    };

    if (picker.search) {
        const results = searchResults(model, picker);
        if (!results.length) return `<p class="note pk-empty">Nothing in the keyboard's catalogue, layers or macros matches “${esc(picker.search)}”.</p>`;
        /** @param {Result} result @param {number} index */
        const cursor = (result, index) => ` data-result="${index}"${index === picker.cursor ? ` data-cursor="true"` : ""}`;
        const typed = results.filter((result) => result.kind === "typed");
        const layered = results.filter((result) => result.kind === "layer");
        const macros = results.filter((result) => result.kind === "macro");
        const entries = results.filter((result) => result.kind === "entry");
        const count = results.length - typed.length;
        return `<div class="pk-body">
            ${typed.map((result) => /** @type {Extract<Result, {kind: 'typed'}>} */ (result)).map((result) => `<button class="pk-typed ${results.indexOf(result) === picker.cursor ? "cursor" : ""}" data-typed="${esc(result.expression)}"${cursor(result, results.indexOf(result))}
                ${result.problem ? `aria-disabled="true" data-tip="${esc(result.problem)}"` : ""}>
                <span class="l">${result.problem ? "Can't use" : "Use"} <code class="mono">${esc(result.expression)}</code></span>
                <span class="d">${result.problem ? esc(result.problem) : typedWords(model, result.expression)}</span></button>`).join("")}
            ${count ? `<p class="note pk-count">${count} match${count === 1 ? "" : "es"}</p>` : ""}
            ${layered.length ? `<div class="eyebrow pk-label">Layer keys</div>
                <div class="pk-row pk-results">${layered.map((result) => /** @type {Extract<Result, {kind: 'layer'}>} */ (result)).map((result) => result.arms
                    ? `<button class="pk wide ${picker.hold?.kind === "layer" && picker.hold.layer === result.layer ? "on" : ""} ${results.indexOf(result) === picker.cursor ? "cursor" : ""}" data-lt="${result.layer}" data-tip="${esc(result.tip)}"${cursor(result, results.indexOf(result))}><span class="l">${layerNameMarked(model, result.layer, `${result.verb} ${result.name}`)}</span><span class="c">${esc(keycodeAside(state, "pickerButton", `LT(${result.layer}, …)`))}</span></button>`
                    : `<button class="pk wide ${picked(result.value) ? "on" : ""} ${results.indexOf(result) === picker.cursor ? "cursor" : ""}" data-pick="${esc(result.value)}" data-tip="${esc(result.tip)}"${cursor(result, results.indexOf(result))}><span class="l">${layerNameMarked(model, result.layer, `${result.verb} ${result.name}`)}</span><span class="c">${esc(keycodeAside(state, "pickerButton", result.value))}</span></button>`).join("")}</div>` : ""}
            ${macros.length ? `<div class="eyebrow pk-label">Macros</div>
                <div class="pk-row pk-results">${macros.map((result) => /** @type {Extract<Result, {kind: 'macro'}>} */ (result)).map((result) => macroButton(result.slot, picked(result.slot.keycode), cursor(result, results.indexOf(result)))).join("")}</div>` : ""}
            ${entries.length ? `${layered.length || macros.length ? `<div class="eyebrow pk-label">Keys</div>` : ""}
                <div class="pk-row pk-results">${entries.map((result) => /** @type {Extract<Result, {kind: 'entry'}>} */ (result)).map((result) => keyButton(result.entry, picked(result.entry.value), cursor(result, results.indexOf(result)))).join("")}</div>` : ""}</div>`;
    }

    const section = sections(model).find((entry) => entry.id === picker.section) || sections(model)[0];
    if (section.kind === "board") {
        const keys = PICKER_BOARD.keys.filter(source => allowed(source.value)).map((source) => {
            const spoken = model?.qmkKeyLabels?.[source.value];
            // The host layout's legends replace the ANSI board's, so a German
            // board reads Z where QMK says KC_Y; the key it stores is unchanged.
            const key = pickerBoardKey(source, model);
            const on = picked(key.value);
            const shifted = key.labels[1] && key.labels[1].length <= 3;
            const extra = key.labels[2] || key.labels[3];
            return `<g class="pkb-key ${on ? "on" : ""}" data-pick="${esc(key.value)}" tabindex="0" role="button" aria-label="${esc(spoken || key.value)}">
                <rect x="${key.x}" y="${key.y}" width="${key.w}" height="${key.h}" rx="8"></rect>
                ${extra
                    ? key.labels.map((label, index) => label ? `<text class="${index === 0 ? `pkb-main ${label.length > 1 ? "sm" : ""}` : "pkb-alt"}" x="${key.x + key.w * (index < 2 ? 0.26 : 0.74)}" y="${key.y + key.h * (index % 2 ? 0.36 : 0.74)}">${esc(label)}</text>` : "").join("")
                    : shifted
                    ? `<text class="pkb-alt" x="${key.x + key.w / 2}" y="${key.y + key.h * 0.36}">${esc(key.labels[1])}</text>
                       <text class="pkb-main" x="${key.x + key.w / 2}" y="${key.y + key.h * 0.74}">${esc(key.labels[0])}</text>`
                    : `<text class="pkb-main ${legendFits(key.labels[0], key.w) ? "" : "sm"}" x="${key.x + key.w / 2}" y="${key.y + key.h / 2 + 5}">${esc(key.labels[0])}</text>`}
            </g>`;
        }).join("");
        const note = picker.shortcut ? "Click a key and the modifiers held with it, left and right mixed. Modifiers alone, or a key alone, are a shortcut too."
            : picker.mode === "list" ? picker.maxKeys === 1 ? "Choose the key to press or release." : "Choose the keys to send together." : "";
        return `<div class="pk-body"><div class="pkb"><svg viewBox="0 0 ${PICKER_BOARD.width} ${PICKER_BOARD.height}" xmlns="http://www.w3.org/2000/svg">${keys}</svg></div>
            ${model?.hostLayoutLegends ? `<p class="note pk-note">Shift above; ${modifierControls(model).find(({value}) => value === "A")?.label === "Option" ? "Option" : "AltGr"} on the right. ◌ marks a dead key: press it, then a letter.</p>` : ""}
            ${note ? `<p class="note pk-note">${note}</p>` : ""}</div>`;
    }
    if (section.kind === "layers") {
        // TG(n) is the same lock as LOCK_LAYER(n), so a key storing it lights
        // Lock rather than getting a button of its own. Tap-hold is a layout
        // key's alone: LT() makes its own tap/hold decision.
        /** @param {import("../view/picker-choice.mjs").LayerChoice} choice @param {number} index */
        const button = (choice, index) => choice.arms
            ? `<button class="pk wide ${picker.hold?.kind === "layer" && picker.hold.layer === index ? "on" : ""}" data-lt="${index}" data-tip="${esc(choice.tip)}"><span class="l">${choice.verb}</span><span class="c">${esc(keycodeAside(state, "pickerButton", choice.value))}</span></button>`
            : `<button class="pk wide ${picked(choice.value) || (choice.verb === "Lock" && picked(`TG(${index})`)) ? "on" : ""}" data-pick="${esc(choice.value)}" data-tip="${esc(choice.tip)}"><span class="l">${choice.verb}</span><span class="c">${esc(keycodeAside(state, "pickerButton", choice.value))}</span></button>`;
        const verbs = ["Hold", "Lock", "Tap-hold", "Tap-toggle", "One-shot", "Move to"].filter((verb) => verb !== "Tap-hold" || picker.target);
        return `<div class="pk-body"><div class="pk-layers ${picker.target ? "" : "no-lt"}">${layers().map((layer) => {
            const choices = layerChoices(layer.index).filter((choice) => !choice.arms || picker.target);
            return `<div class="pk-layer">
                <span class="ix">${layer.index}</span><span class="nm">${layerNameMarked(model, layer.index, layerName(layer))}</span>
                ${verbs.map((verb) => { const choice = choices.find((entry) => entry.verb === verb); return choice ? button(choice, layer.index) : `<span class="pk-gap" aria-hidden="true"></span>`; }).join("")}
            </div>`;
        }).join("")}</div>
            <p class="note pk-note">${picker.hold?.kind === "layer"
                ? `Hold on <b>${esc(layerTapName(picker.hold.layer))}</b> is set: now choose the tap key from any section.`
                : `Hold reaches the layer while the key is down. Lock keeps it on until pressed again.${picker.target ? " Tap-hold sets the Hold slot and keeps the tap." : ""} Tap-toggle and One-shot hold like Hold; Move to switches to the layer alone. Base is always on, so it offers only ${picker.target ? "Tap-hold and " : ""}Move to.`}</p></div>`;
    }
    if (section.kind === "modes") {
        // One row per slot, laid out like the layers: the slot, what it does,
        // then its two keycodes. An empty slot is still offered behind the
        // fold, since its keycodes are fixed; the row says it does nothing
        // until configured.
        const all = model?.pdModes || [];
        if (!all.length) return `<p class="note pk-empty">This keyboard has not reported its trackball modes.</p>`;
        const empty = all.filter((slot) => !slot.kind);
        const slots = picker.showEmpty.includes("modes") ? all : all.filter((slot) => slot.kind || picked(slot.binding.hold) || picked(slot.binding.lock));
        const many = slots.length > 8;
        const rows = many ? ` style="grid-template-rows:repeat(${Math.ceil(slots.length / 2)}, auto)"` : "";
        const kinds = vocabulary(model).pointing.kinds;
        /** @param {string} value @param {string} label @param {string} tip */
        const button = (value, label, tip) =>
            `<button class="pk wide ${picked(value) ? "on" : ""}" data-pick="${esc(value)}" data-tip="${esc(tip)}"><span class="l">${label}</span><span class="c">${esc(keycodeAside(state, "pickerButton", value))}</span></button>`;
        return `<div class="pk-body"><div class="pk-layers modes ${many ? "many" : ""}"${rows}>${slots.map((slot) => `
            <div class="pk-layer ${slot.kind ? "" : "empty"}">
                <span class="ix">P${slot.id}</span>
                <span class="nm"><span>${esc(slot.displayName)}</span><span class="sub">${esc(slot.kind ? word(kinds, slot.kind) : "Empty — does nothing yet")}</span></span>
                ${button(slot.binding.hold, "Hold", "On while the key is down.")}
                ${button(slot.binding.lock, "Lock", "Keeps the mode on until pressed again.")}
            </div>`).join("")}</div>
            ${emptyFold(picker, "modes", empty.length)}
            <p class="note pk-note">Hold re-reads the trackball while the key is down. Lock keeps the mode on until the key is pressed again. A key for an empty slot does nothing until the slot is configured.</p></div>`;
    }
    if (section.kind === "macros") {
        const all = (model?.viaMacros || []).filter(slot => allowed(slot.keycode));
        if (!all.length) return `<p class="note pk-empty">This keyboard has not reported its macros.</p>`;
        const empty = all.filter((slot) => slot.empty);
        const slots = picker.showEmpty.includes("macros") ? all : all.filter((slot) => !slot.empty || picked(slot.keycode));
        return `<div class="pk-body">${slots.length ? `<div class="pk-rows">${chunk(slots, 8).map((row) => `<div class="pk-row">${row.map((slot) =>
            macroButton(slot, picked(slot.keycode))).join("")}</div>`).join("")}</div>` : `<p class="note">No macro has steps yet.</p>`}
            ${emptyFold(picker, "macros", empty.length)}</div>`;
    }
    let entries = entriesForPickerSection(catalogue, section).filter(entry => allowed(entry.value));
    if (!entries.length) return `<p class="note pk-empty">The keyboard's catalogue has nothing in this section.</p>`;
    let fold = "";
    if (section.id === "custom") {
        // A custom key with no name, shortcut or behaviour does nothing yet.
        /** @param {string} value */
        const unused = (value) => { const key = (model?.customKeys || []).find((row) => row.keycode === value); return Boolean(key && !key.name && !key.hasBehavior && !hasShortcut(key)); };
        const empty = entries.filter((entry) => unused(entry.value));
        fold = emptyFold(picker, "custom", empty.length);
        if (!picker.showEmpty.includes("custom")) entries = entries.filter((entry) => !unused(entry.value) || picked(entry.value));
    }
    return `<div class="pk-body"><div class="pk-rows">${chunk(entries, 8).map((row) =>
        `<div class="pk-row">${row.map((entry) => keyButton(entry, picked(entry.value))).join("")}</div>`).join("")}</div>${fold}</div>`;
}

// A typed expression in words: its tap and what holding it does.
/** @param {Model} model @param {string} expression */
function typedWords(model, expression) {
    const parts = seedPick(model, expression);
    const tap = actionMarked(model, pickerExpression({keys: parts.keys, mods: parts.mods}));
    return parts.hold ? `${tap}, hold ${holdWords(model, parts.hold)}` : tap;
}

// What the Hold slot holds, in words.
/** @param {Model} model @param {Hold | null | undefined} hold */
function holdWords(model, hold) {
    if (!hold) return "—";
    if (hold.kind === "layer") return layerNameMarked(model, hold.layer, layerTapName(hold.layer));
    if (hold.kind === "mode") {
        const slot = (model?.pdModes || []).find((entry) => entry.id === hold.slot);
        return `${slotLight(model, {id: hold.slot}).swatch("mk-swatch")}${esc(slot?.displayName || `Mode ${hold.slot}`)}`;
    }
    const value = Object.entries(HOLD_MODS).find(([, mod]) => mod === hold.mod)?.[0];
    return esc(modifierControls(model).find((entry) => entry.value === value)?.label || hold.mod);
}

// The Hold slot's menu: a modifier, a layer or a trackball mode held.
/** @param {Model} model @param {import("../state.js").PickerState} picker */
function holdMenu(model, picker) {
    if (!picker.holdMenu) return "";
    const controls = modifierControls(model);
    /** @param {string} value @param {string} label @param {boolean} on */
    const item = (value, label, on) => `<button class="pk-menu-item" role="menuitemradio" aria-checked="${on}" data-hold="${esc(value)}">${label}</button>`;
    /** @param {string} menu @param {string} label */
    const sub = (menu, label) => `<button class="pk-menu-item" role="menuitem" aria-haspopup="menu" data-holdnav="${menu}">${esc(label)} <span aria-hidden="true">▸</span></button>`;
    const back = `<button class="pk-menu-item pk-menu-back" role="menuitem" data-holdnav="root"><span aria-hidden="true">‹</span> Back</button>`;
    const hold = picker.hold;
    /** @param {string} wrapper */
    const modItem = (wrapper) => {
        const mod = HOLD_MODS[wrapper], label = controls.find((entry) => entry.value === wrapper)?.label || wrapper;
        return item(`mod:${mod}`, esc(label), hold?.kind === "mod" && hold.mod === mod);
    };
    let items = "";
    if (picker.holdMenu === "right") items = back + ["RCTL", "RSFT", "RALT", "RGUI"].map(modItem).join("");
    else if (picker.holdMenu === "layer") items = back + layers().filter((layer) => layer.index > 0).map((layer) =>
        item(`layer:${layer.index}`, layerNameMarked(model, layer.index, layerName(layer)), hold?.kind === "layer" && hold.layer === layer.index)).join("");
    else if (picker.holdMenu === "mode") {
        const slots = (model?.pdModes || []).filter((slot) => slot.kind);
        items = back + (slots.length ? slots.map((slot) => item(`mode:${slot.id}`, `${slotLight(model, {id: slot.id}).swatch("mk-swatch")}${esc(slot.displayName)}`, hold?.kind === "mode" && hold.slot === slot.id)).join("")
            : `<p class="note pk-menu-note">No trackball mode is set up yet.</p>`);
    } else items = item("none", "Nothing", !hold) + ["C", "S", "A", "G"].map(modItem).join("")
        + sub("right", "Right") + sub("layer", "Layer") + sub("mode", "Trackball mode");
    return `<div class="pk-menu" role="menu" aria-label="Hold">${items}</div>`;
}

// For a trackball-mode hold: who else gets it. A behaviour row belongs to a
// keycode, so every key sending the tap gets the hold; a custom key sending
// the tap gives it to this key only, and is the default when there is more
// than one.
/** @param {Model} model @param {import("../state.js").PickerState} picker @param {import("../view/picker-choice.mjs").Choice} choice */
function holdScopeView(model, picker, choice) {
    if (!picker.target || !choice.behaviour) return {html: "", onlyThisKey: false, spare: undefined};
    const tap = choice.expression;
    const scope = keycodeScope(model, tap);
    const here = picker.target.current !== undefined && scope.places.length && canonical(model, picker.target.current) === canonical(model, tap);
    const count = scope.total + (here ? 0 : 1);
    const spare = unusedCustomKey(model, layers());
    const shortcut = tapShortcut(model, picker);
    const canSplit = Boolean(spare && shortcut);
    const onlyThisKey = canSplit && (picker.holdScope ? picker.holdScope === "this" : count > 1);
    const words = actionMarked(model, tap);
    const places = scope.places.map((place) => `${esc(place.name)}${place.count > 1 ? ` (${place.count})` : ""}`).join(", ");
    const line = `Every ${words} key gets this hold${places ? `: ${places}${here ? "" : ", and this key"}` : ""}. So do combos sending it, where combo outputs run behaviours.`;
    if (!canSplit && count <= 1) return {html: `<div class="note pk-scope" role="status">${line}</div>`, onlyThisKey: false, spare: undefined};
    return {onlyThisKey, spare, html: `<div class="pk-scope" role="radiogroup" aria-label="Which keys get this hold">
        <label class="pk-choice"><input type="radio" name="pk-scope" data-f="picker:hold-scope:this" value="this" ${onlyThisKey ? "checked" : ""} ${canSplit ? "" : "disabled"}>
            <span>Only this key: make ${spare ? `Custom key ${esc(spare.slot)}` : "a custom key"} (sends ${words})${canSplit ? "" : spare ? ` — no custom key shortcut can send ${words}` : " — every custom key is in use"}</span></label>
        <label class="pk-choice"><input type="radio" name="pk-scope" data-f="picker:hold-scope:every" value="every" ${onlyThisKey ? "" : "checked"}>
            <span>${line}</span></label></div>`};
}

export function pickerOverlay() {
    const picker = state.picker;
    if (!picker) return null;
    const model = getModel();
    const choice = choiceOf(model, picker);
    const value = choice.expression;
    const modProblem = pickerModifierProblem(model, stored(model, picker));
    const problem = modProblem || choice.problem;
    const block = modifierBlock(model, picker);
    const single = picker.mode === "single" && !picker.shortcut;
    // Modifiers no keycode can hold, offered as a custom key's shortcut.
    const fold = folded(model, picker);
    const offer = !picker.onCustomKey || picker.mode !== "single" || picker.shortcut || picker.hold ? null
        : fold ? ("shortcut" in fold && (model?.customKeyShortcutKeys || []).length ? fold.shortcut : null) : shortcutOffer(model, picker);
    const {existing, withBehaviour, spare} = offer ? customKeyChoice(model, offer, layers(), {runsBehaviour: picker.customKeyRuns !== "shortcut"})
        : {existing: undefined, withBehaviour: false, spare: undefined};
    // A hold over a tap no mod-tap or layer-tap can send: a custom key sends it.
    const holdSpare = picker.target && picker.hold && choice.customKey ? unusedCustomKey(model, layers()) : undefined;
    const holdShortcut = holdSpare ? tapShortcut(model, picker) : null;
    const scope = holdScopeView(model, picker, choice);
    /** @param {import("../../contracts/panel.js").CustomKey} key */
    const keyWords = (key) => key.name ? `K${key.slot} · ${key.name}` : `Custom key ${key.slot}`;
    const tapExpression = picker.shortcut ? "" : pickerExpression({keys: stored(model, picker).keys || picker.keys, mods: stored(model, picker).mods || picker.mods});
    const danger = picker.keys[0] ? dangerOf(model, picker.keys[0]) : "";
    const heading = picker.heading || "Choose a key";
    const g = modifierControls(model).find(({value: wrap}) => wrap === "G")?.label || "G";
    // A trackball-mode hold is stored beside the key, as a behaviour row.
    const modeHold = picker.hold?.kind === "mode" ? picker.hold : null;
    const storedText = value && modeHold ? `${value} + hold ${(model?.pdModes || []).find((slot) => slot.id === modeHold.slot)?.binding?.hold || ""}` : value;
    const usable = Boolean(value) && !problem && (!picker.hold || Boolean(picker.onEdit));
    const node = el(`<div class="scrim"><div class="sheet picker" role="dialog" aria-modal="true" aria-label="Choose a key">
        <div class="sheet-h">
            <div><h2>${esc(heading)}</h2>
                <p class="note">${picker.mode === "list" ? picker.maxKeys === 1 ? "Choose one key." : Number.isFinite(picker.maxKeys) ? `Choose up to ${picker.maxKeys} keys to send together.` : "Choose one or more keys."
                    : picker.heading ? [picker.contextKeycode ? `Now ${actionMarked(model, picker.contextKeycode)}` : "", esc(picker.context || "")].filter(Boolean).join(" · ")
                    : `For <b>${esc(picker.title)}</b> · ${[picker.contextKeycode ? actionMarked(model, picker.contextKeycode) : "", esc(picker.context || "")].filter(Boolean).join(" · ")}`}</p></div>
            <input class="input pk-search" id="pickerSearch" data-f="picker:search" placeholder="Search keys, layers, or type LT(1, KC_A)" value="${esc(picker.search)}" aria-label="Search every section">
            <span class="right"><button class="btn ghost" data-act="cancel">Close</button></span>
        </div>
        ${basics(picker) ? `<div class="pk-basics"><span class="eyebrow">Basics</span>
            ${[["KC_NO", "Nothing", "Blocks lower layers: the key does nothing, even where a layer below has a key."],
                ...(picker.target ? [["KC_TRANSPARENT", "Transparent (falls through)", "Falls through: the key does what the layer below it does."]] : [])]
                .filter(([key]) => allowed(key)).map(([key, label, tip]) => `<button class="pk compact ${picker.keys.some((picked) => canonical(model, picked) === key) ? "on" : ""}" data-pick="${key}" data-tip="${esc(tip)}"><span class="l">${esc(label)}</span><span class="c">${esc(keycodeAside(state, "pickerButton", key))}</span></button>`).join("")}
            ${picker.target && recentLayerKeys.length ? `<span class="pk-basics-sep" aria-hidden="true"></span><span class="note">Recent</span>${recentLayerKeys.map((key) =>
                `<button class="pk compact ${picker.keys.includes(key) ? "on" : ""}" data-pick="${esc(key)}"><span class="l">${keyNameMarked(model, String(model?.qmkKeyLabels?.[key] || key), key)}</span><span class="c">${esc(keycodeAside(state, "pickerButton", key))}</span></button>`).join("")}` : ""}</div>` : ""}
        ${picker.mode === "list" ? "" : `<div class="pk-mods"><span class="eyebrow" data-tip="${picker.shortcut ? "Held with the key." : esc(`Held together with the key: ${g} + C stores G(KC_C), the same keycode as LGUI(KC_C).`)}">${picker.shortcut ? "Modifiers" : "Held with the key"}</span>
            ${modifierControls(model).map(({value: wrap, label}) => {
                const off = Boolean(block) && !picker.mods.includes(wrap);
                return `<button class="pk-mod ${picker.mods.includes(wrap) ? "on" : ""}" data-mod="${wrap}" aria-pressed="${picker.mods.includes(wrap)}"${off ? ` aria-disabled="true"` : ""}
                data-tip="${esc(off ? block : picker.shortcut ? "Held with the key." : `Held with the key: stores ${wrap}(key).`)}">${esc(label)}</button>`;
            }).join("")}</div>`}
        <div class="sheet-b">
            <div class="picker-side">${sections(model).map((section) =>
                `<button data-sec="${esc(section.id)}" aria-current="${picker.section === section.id && !picker.search}">${esc(section.label)}</button>`).join("")}</div>
            <div>${sectionBody(model)}</div>
        </div>
        ${single ? `<div class="sheet-f pk-foot">
            <span class="pk-slot"><span class="eyebrow">Tap</span>
                <button class="value-btn" data-act="tapslot" data-tip="Choose the key a tap sends from any section, or search.">${picker.keys.length ? actionMarked(model, tapExpression || picker.keys[0]) : "—"}</button>
                ${picker.keys.length ? `<button class="btn text icon" data-remove="0" aria-label="Remove the tap" data-tip="Remove the tap">✕</button>` : ""}</span>
            ${picker.target ? `<span class="pk-slot pk-hold"><span class="eyebrow">Hold</span>
                <button class="value-btn" data-act="holdmenu" aria-haspopup="menu" aria-expanded="${Boolean(picker.holdMenu)}">${holdWords(model, picker.hold)} <span aria-hidden="true">▾</span></button>
                ${holdMenu(model, picker)}</span>` : ""}
            <code class="mono pk-value" data-tip="What the keyboard stores">${esc(storedText || "—")}</code>
            <span class="right"><button class="btn text" data-act="clear">Clear</button>
                <button class="btn primary" data-act="use" ${usable ? "" : "disabled"}>Use key</button></span>
        </div>` : `<div class="sheet-f">
            <span class="eyebrow">Selected</span>
            ${picker.keys.length ? picker.keys.map((key, index) => `<button class="chip" data-remove="${index}">${esc(key)} ✕</button>`).join("")
                : `<span class="note">nothing picked yet</span>`}
            <code class="mono pk-value">${esc(value || "—")}</code>
            <span class="right"><button class="btn text" data-act="clear">Clear</button>
                <button class="btn primary" data-act="use" ${value && !problem ? "" : "disabled"}>${picker.shortcut ? "Use shortcut" : "Use key"}</button></span>
        </div>`}
        ${scope.html}
        ${danger && !problem ? `<div class="note warn pk-problem" role="status">⚠ ${esc(danger)}</div>` : ""}
        ${problem && !offer ? `<div class="note pk-problem" role="status">${esc(problem)}${holdSpare && holdShortcut
            ? ` <button class="btn compact" data-act="hold-custom" data-tip="Gives Custom key ${esc(holdSpare.slot)} this tap as its shortcut and the hold as its behaviour, and puts it on this key.">Make custom key K${esc(holdSpare.slot)}</button>` : ""}</div>` : ""}
        ${offer ? `<div class="note pk-problem pk-offer" role="status">${existing && !withBehaviour
            ? `No keycode can hold ${esc(shortcutPickLabel(model, offer))}, but ${esc(keyWords(existing))} already sends it.
                <button class="btn compact" data-act="use-existing-key" data-tip="Uses ${esc(keyWords(existing))}, which already has this shortcut.">Use ${esc(keyWords(existing))}</button>`
            : existing
            ? `No keycode can hold ${esc(shortcutPickLabel(model, offer))}. ${esc(keyWords(existing))} already sends it, with its behaviour on top, which runs here too.
                <button class="btn compact" data-act="use-existing-key" data-tip="Uses ${esc(keyWords(existing))}: its shortcut and its behaviour.">Use ${esc(keyWords(existing))}</button>
                ${spare ? `<button class="btn compact" data-act="use-custom-key" data-tip="Gives Custom key ${esc(spare.slot)} this shortcut alone and a name, and uses it here.">Make custom key K${esc(spare.slot)}</button>`
                    : `<span>Every other custom key is in use.</span>`}`
            : spare
            ? `No keycode can hold ${esc(shortcutPickLabel(model, offer))}, but a custom key's shortcut can.
                <button class="btn compact" data-act="use-custom-key" data-tip="Gives Custom key ${esc(spare.slot)} this shortcut and a name, and uses it here.">Use custom key K${esc(spare.slot)}</button>`
            : `No keycode can hold ${esc(shortcutPickLabel(model, offer))}, and every custom key is in use. Free one on the Custom keys screen to hold it.`}</div>` : ""}
    </div></div>`);

    /** @param {string} chosen */
    const select = (chosen) => {
        if (!allowed(chosen)) return false;
        const held = heldModifiers(chosen);
        if (held) {
            const mods = shortcutPickMods(getModel(), held.mods);
            // A modifier key toggles its button; a symbol takes its key.
            if (!held.key && mods.every((mod) => picker.mods.includes(mod))) picker.mods = picker.mods.filter((mod) => !mods.includes(mod));
            else picker.mods = [...new Set([...picker.mods, ...mods])];
            if (held.key) picker.keys = [held.key];
            return true;
        }
        if (picker.mode === "list" && !picker.keys.includes(chosen) && picker.keys.length >= picker.maxKeys && picker.maxKeys !== 1) return false;
        if (picker.mode === "list") picker.keys = picker.keys.includes(chosen) ? picker.keys.filter((key) => key !== chosen) : picker.maxKeys === 1 ? [chosen] : [...picker.keys, chosen];
        else {
            // A layer key is a whole key: it has no tap to hold over.
            if (/^(?:MO|LOCK_LAYER|TG|TT|OSL|TO)\(/.test(chosen) && picker.hold?.kind !== "mode") picker.hold = null;
            picker.keys = [chosen];
        }
        return true;
    };
    // Use key: what the picker chose, handed to whoever opened it. The picker
    // closes itself first, so every caller only says what the choice does.
    const use = () => {
        const now = choiceOf(getModel(), picker);
        if (!now.expression || pickerModifierProblem(getModel(), stored(getModel(), picker)) || now.problem) return;
        if (picker.hold && picker.target) {
            const view = holdScopeView(getModel(), picker, now);
            const message = holdEdit(getModel(), picker.target, picker, now, {onlyThisKey: view.onlyThisKey, spare: view.spare,
                name: view.spare ? offeredName(getModel(), tapShortcut(getModel(), picker) || {mods: 0, key: 0}) : ""});
            if (!message || !picker.onEdit) return;
            state.picker = null;
            picker.onEdit(message);
            return render();
        }
        state.picker = null;
        recentLayerKeys = rememberLayerKey(recentLayerKeys, now.expression);
        if (picker.shortcut) picker.onShortcut?.(shortcutPick(getModel(), picker));
        else picker.onPick?.(now.expression);
        render();
    };
    /** @param {Result} result */
    const takeResult = (result) => {
        if (result.kind === "typed") {
            if (result.problem) return false;
            const parts = seedPick(getModel(), result.expression);
            if (parts.hold && !picker.target) { picker.keys = [result.expression]; picker.mods = []; picker.hold = null; }
            else { picker.keys = parts.keys; picker.mods = parts.mods; picker.hold = parts.hold; }
            return true;
        }
        if (result.kind === "layer") {
            if (result.arms) { picker.hold = {kind: "layer", layer: result.layer}; return true; }
            return select(result.value);
        }
        return select(result.kind === "macro" ? result.slot.keycode : result.entry.value);
    };

    node.addEventListener("click", (event) => {
        const target = /** @type {Element} */ (event.target);
        /** @param {string} selector */
        const hit = (selector) => /** @type {HTMLElement | null} */ (target.closest(selector));
        if (event.target === node || hit('[data-act="cancel"]')) return closePicker();
        // The Hold slot's menu, and choosing from it.
        if (hit('[data-act="holdmenu"]')) { picker.holdMenu = picker.holdMenu ? null : "root"; return render(); }
        const nav = hit("[data-holdnav]");
        if (nav) { picker.holdMenu = /** @type {import("../state.js").PickerState["holdMenu"]} */ (nav.dataset.holdnav || "root"); return render(); }
        const holdItem = hit("[data-hold]");
        if (holdItem) {
            const [kind, arg] = String(holdItem.dataset.hold).split(":");
            picker.hold = kind === "mod" ? {kind: "mod", mod: arg} : kind === "layer" ? {kind: "layer", layer: Number(arg)} : kind === "mode" ? {kind: "mode", slot: Number(arg)} : null;
            if (picker.hold && picker.hold.kind !== "mode") picker.mods = [];
            picker.holdMenu = null; picker.holdScope = null;
            return render();
        }
        // A click anywhere else closes the menu, and does what it does.
        const closing = Boolean(picker.holdMenu) && !hit(".pk-menu");
        if (closing) picker.holdMenu = null;
        if (hit('[data-act="tapslot"]')) { /** @type {HTMLInputElement | null} */ (document.querySelector("#pickerSearch"))?.focus(); return; }
        const fold = hit("[data-empty]");
        if (fold) {
            const id = fold.dataset.empty || "";
            picker.showEmpty = picker.showEmpty.includes(id) ? picker.showEmpty.filter((entry) => entry !== id) : [...picker.showEmpty, id];
            return render();
        }
        const section = hit("[data-sec]");
        if (section) { picker.section = section.dataset.sec || "board"; picker.search = ""; picker.cursor = 0; return render(); }
        const modifier = hit("[data-mod]");
        if (modifier) {
            if (modifier.getAttribute("aria-disabled") === "true") return;
            const name = modifier.dataset.mod || "";
            picker.mods = picker.mods.includes(name) ? picker.mods.filter((value2) => value2 !== name) : [...picker.mods, name];
            return render();
        }
        const layerTap = hit("[data-lt]");
        if (layerTap) {
            const layer = Number(layerTap.dataset.lt);
            picker.hold = picker.hold?.kind === "layer" && picker.hold.layer === layer ? null : {kind: "layer", layer};
            // The tap a layer-tap keeps is a key, never a layer key.
            if (picker.hold && /^(?:MO|LOCK_LAYER|TG|TT|OSL|TO)\(/.test(picker.keys[0] || "")) picker.keys = [];
            picker.mods = [];
            return render();
        }
        if (hit('[data-act="clear"]')) { picker.keys = []; picker.mods = []; picker.hold = null; picker.holdScope = null; return render(); }
        const remove = hit("[data-remove]");
        if (remove) { picker.keys.splice(Number(remove.dataset.remove), 1); return render(); }
        const scopeChoice = hit('input[name="pk-scope"]');
        if (scopeChoice) { picker.holdScope = /** @type {HTMLInputElement} */ (scopeChoice).value === "this" ? "this" : "every"; return render(); }
        if (existing && hit('[data-act="use-existing-key"]')) {
            state.picker = null;
            picker.onPick?.(existing.keycode);
            return render();
        }
        if (offer && spare && hit('[data-act="use-custom-key"]')) {
            state.picker = null;
            picker.onCustomKey?.(spare.keycode, offer, offeredName(model, offer));
            return render();
        }
        if (holdSpare && holdShortcut && hit('[data-act="hold-custom"]') && picker.target && picker.onEdit) {
            const message = holdEdit(getModel(), picker.target, picker, choiceOf(getModel(), picker), {spare: holdSpare, name: offeredName(getModel(), holdShortcut)});
            if (!message) return;
            state.picker = null;
            picker.onEdit(message);
            return render();
        }
        if (hit('[data-act="use"]')) return use();
        const typed = hit("[data-typed]");
        if (typed) {
            const result = searchResults(getModel(), picker).find((entry) => entry.kind === "typed");
            if (result && takeResult(result)) render();
            return;
        }
        const pick = /** @type {HTMLElement | SVGElement | null} */ (target.closest("[data-pick]"));
        if ((pick && select(pickValue(pick.dataset.pick || ""))) || closing) render();
    });
    // Double-click, or Enter on a key, uses it at once.
    node.addEventListener("dblclick", (event) => {
        const pick = /** @type {HTMLElement | SVGElement | null} */ (/** @type {Element} */ (event.target).closest("[data-pick], [data-typed]"));
        if (!pick || !single) return;
        if (pick.dataset.typed) {
            const result = searchResults(getModel(), picker).find((entry) => entry.kind === "typed");
            if (result && takeResult(result)) use();
            return;
        }
        if (select(pickValue(pick.dataset.pick || ""))) use();
    });
    node.addEventListener("keydown", (event) => {
        const target = /** @type {Element} */ (event.target);
        if (event.key === "Escape" && picker.holdMenu) {
            event.stopPropagation(); event.preventDefault();
            picker.holdMenu = null; render();
            /** @type {HTMLElement | null} */ (document.querySelector('[data-act="holdmenu"]'))?.focus();
            return;
        }
        if (event.key !== "Enter" || !single) return;
        const pick = /** @type {HTMLElement | SVGElement | null} */ (target.closest("[data-pick]"));
        if (!pick) return;
        event.preventDefault(); event.stopPropagation();
        if (select(pickValue(pick.dataset.pick || ""))) use();
    });
    const search = /** @type {HTMLInputElement} */ (node.querySelector("#pickerSearch"));
    search.addEventListener("input", () => {
        picker.search = search.value;
        picker.cursor = 0;
        render();
        const again = /** @type {HTMLInputElement | null} */ (document.querySelector("#pickerSearch"));
        if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
    });
    // ↑ and ↓ walk the results, choosing each; Enter uses the one chosen.
    search.addEventListener("keydown", (event) => {
        const results = searchResults(getModel(), picker);
        if (!results.length) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            picker.cursor = Math.max(0, Math.min(results.length - 1, picker.cursor + (event.key === "ArrowDown" ? 1 : -1)));
            takeResult(results[picker.cursor]);
            render();
            /** @type {HTMLInputElement | null} */ (document.querySelector("#pickerSearch"))?.focus();
            return;
        }
        if (event.key === "Enter") {
            event.preventDefault(); event.stopPropagation();
            const result = results[Math.min(picker.cursor, results.length - 1)];
            if (takeResult(result)) {
                // A Tap-hold result sets the Hold slot and waits for the tap.
                if (result.kind === "layer" && result.arms) return render();
                use();
                if (state.picker) render();
            }
        }
    });
    if (picker.focusHold) {
        picker.focusHold = false;
        queueMicrotask(() => /** @type {HTMLElement | null} */ (document.querySelector('[data-act="holdmenu"]'))?.focus());
    }
    return node;
}
