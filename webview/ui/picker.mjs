// @ts-check
/**
 * @typedef {import("../../contracts/panel.js").PublishedModel | null} Model
 * @typedef {import("../state.js").PickerState} Picker
 */
// Selector assertions describe the authored sheet; click targets can be SVG
// board keys, whose nearest data-bearing ancestor supplies the same dataset.
// The keycode picker: a real keyboard first, then the sections this keyboard
// actually has — its layers, its pointing slots, its macro banks — and the
// vendored QMK catalogue behind a search.

import {el, esc} from "../lib/dom.mjs";
import {getModel, layers, render, state} from "../store.mjs";
import {actionMarked, keyNameMarked, keyNameText, layerMarked, layerMarkedAt, marked} from "./marks.mjs";
import {PICKER_BOARD, legendFits, pickerBoardKey} from "../view/picker-board.mjs";
import {comboOutputProblem, keyProblem} from "../view/keycode-expression.mjs";
import {dropKey, foldedPick, isLayerKeyPicked, isPicked, offeredMacros, offeredSections, openingPick, pickAllowed, pickKey, pickModifier, pickProblem, pickValue, pickedExpression, shownSection} from "../view/picker.mjs";
import {foundGroups, layerKeys, listedSections, sectionGroups, tileSpan} from "../view/picker-tiles.mjs";
import {customKeyChoice, offeredName, shortcutLayerKinds, shortcutLayerRows, shortcutOffer, shortcutPick, shortcutPickLabel, shortcutPickMods, shortcutLimitWords} from "../view/custom-key.mjs";
import {layerSwitchTable, switchedLayers} from "./layer-switches.mjs";
import {vocabulary, word, layerCalled, slotNamed} from "../view/vocabulary.mjs";
import {keyIdentity} from "../view/key-identity.mjs";

/** @param {Model} model */
const modifierControls = model => vocabulary(model).pickerModifiers || [];

/** @param {import("./editor-types.js").PickerOptions} options */
// `shortcut` picks a custom key's shortcut (firmware D-F26): the same board and
// modifier row, but any of the eight modifiers mix, sides included, keys are
// optional and picked in press order, its Layers section switches on any
// number of layers and how it turns them on (hold, lock, move to, tap-toggle
// or one-shot, all alike), and the choice goes to `onShortcut` as a mask, its
// keys, a layer mask and a kind.
// `onCustomKey` lets a keycode field take modifiers no keycode can hold — both
// sides at once, or no key — through a custom key with that shortcut (D-L63):
// one that already has it is picked as any key is, otherwise an unused one is
// made it. The picker names the key either way. `customKeyRuns` says what the
// field does with a custom key: runs its behaviour too (a layout key, a combo
// output), or sends only its shortcut (a behaviour step). `comboOutput` holds
// the pick to what a combo can send: no Tap-hold, which needs a key of its own.
export function openPicker({title, context, contextKeycode, onLayer, seed = [], mode = "single", allowedKeys = null, modifiable = null, shortcut = null, maxKeys = Infinity, onPick, onShortcut, onCustomKey, customKeyRuns = "behaviour", layoutKey = false, comboOutput = false}) {
    const named = allowedKeys ? seed.map(key => keyIdentity(getModel(), key).name) : seed.slice();
    const opening = openingPick(getModel(), {mode, shortcut: Boolean(shortcut)}, named);
    const keys = opening.keys;
    const mods = shortcut ? shortcutPickMods(getModel(), shortcut.mods) : opening.mods;
    state.picker = {title, context, contextKeycode, onLayer, mode, allowedKeys, modifiable, shortcut: Boolean(shortcut), own: mods.slice(), symbols: {}, layers: shortcut?.layers || 0, layerKind: shortcut?.layers ? shortcut.layerKind || 0 : 0, maxKeys, section: "board", search: "", mods, keys, layerTap: null, onPick, onShortcut, onCustomKey, customKeyRuns, layoutKey, comboOutput};
    render();
}

// Layer keycodes are posted by index — MO(1), LOCK_LAYER(1), LT(1, KC_A) —
// the form the keyboard reports and the draft encodes; the name is display.
/** @param {string | number} index */
const layerTapName = (index) => layerCalled(layers()[Number(index)]);

const closePicker = () => { state.picker = null; render(); };

const expression = () => pickedExpression(getModel(), state.picker);

// A key's tile, named as every surface names a key: a layer key, a pointing
// mode or a custom key by its mark, as a macro's tile is. Its accessible name
// keeps the words a mark and tag draw apart. A Tap-hold tile arms its layer,
// and is lit while armed; any other picks its key.
/** @param {Model} model @param {Picker} picker @param {import("../view/picker-tiles.mjs").Tile} tile @param {number} span */
function keyTile(model, picker, tile, span) {
    const on = tile.tapHold ? picker.layerTap === String(tile.layer)
        : tile.layer !== undefined ? isLayerKeyPicked(model, picker, tile.value) : isPicked(model, picker, tile.value);
    return `<button class="pk s${esc(span)} ${on ? "on" : ""}" ${tile.tapHold ? `data-lt="${esc(tile.layer)}"` : `data-pick="${esc(tile.value)}"`} aria-label="${esc(`${tile.words} ${tile.value}`)}" data-tip="${esc(tile.tip)}">
        <span class="l">${tile.macro ? marked(model, {kind: "macro"}, tile.words)
            : tile.tapHold ? `${esc(tile.verb)} ${layerMarkedAt(model, tile.layer ?? 0)}`
            : keyNameMarked(model, tile.words, tile.value)}</span><span class="c">${esc(tile.sub)}</span></button>`;
}

// A key's button in a layer's or a pointing slot's row: its form over its
// keycode. `arms` is the layer a Tap-hold arms, instead of picking a key.
/** @param {string} value @param {string} label @param {string} tip @param {boolean} on @param {number} [arms] */
const rowButton = (value, label, tip, on, arms) =>
    `<button class="pk wide ${on ? "on" : ""}" ${arms === undefined ? `data-pick="${esc(value)}"` : `data-lt="${esc(arms)}"`} data-tip="${esc(tip)}"><span class="l">${esc(label)}</span><span class="c">${esc(value)}</span></button>`;

// One row per layer: its name and a button for each of its keys (layerKeys). A
// key storing another form of the same act lights its button (isLayerKeyPicked:
// TG(n) lights Lock).
/** @param {Model} model @param {Picker} picker */
function layerRows(model, picker) {
    return `<div class="pk-layers">${layers().map((layer) => `
        <div class="pk-layer">
            <span class="ix">${esc(layer.index)}</span><span class="nm">${layerMarked(model, layer)}</span>
            ${layerKeys(model, layer.index, picker).map(({value, verb, tip, tapHold}) => tapHold
                ? rowButton(value, verb, tip, picker.layerTap === String(layer.index), layer.index)
                : rowButton(value, verb, tip, isLayerKeyPicked(model, picker, value))).join("")}
        </div>`).join("")}</div>`;
}

// One row per pointing slot, laid out like the layers: the slot, what it does,
// then its two keycodes. An empty slot is still offered, since its keycodes are
// fixed; the row says it does nothing until configured. Past eight slots the
// rows run down two columns, slot order first.
/** @param {Model} model @param {Picker} picker */
function modeRows(model, picker) {
    const slots = model?.pdModes || [];
    const many = slots.length > 8;
    const rows = many ? ` style="grid-template-rows:repeat(${Math.ceil(slots.length / 2)}, auto)"` : "";
    const kinds = vocabulary(model).pointing.kinds;
    return `<div class="pk-layers modes ${many ? "many" : ""}"${rows}>${slots.map((slot) => `
        <div class="pk-layer ${slot.kind ? "" : "empty"}">
            <span class="ix">${esc(slot.id)}</span>
            <span class="nm">${marked(model, {kind: "pointing", slot: slot.id}, slotNamed(slot))}<span class="sub">${esc(slot.kind ? word(kinds, slot.kind) : "Empty — does nothing yet")}</span></span>
            ${rowButton(slot.keys.hold, "Hold", "On while the key is down.", isPicked(model, picker, slot.keys.hold))}
            ${rowButton(slot.keys.lock, "Lock", "Turns the mode on until pressed again.", isPicked(model, picker, slot.keys.lock))}
        </div>`).join("")}</div>`;
}

// Groups of keys on one twelve-column grid, a group's tiles all of one span, so
// edges line up from group to group.
/** @param {Model} model @param {Picker} picker @param {import("../view/picker-tiles.mjs").TileGroup[]} groups */
const keyGroups = (model, picker, groups) => groups.map((group) => `<section class="pk-group">${group.name ? `<div class="label pk-label">${esc(group.name)}</div>` : ""}
    <div class="pk-grid">${group.tiles.map((tile) => keyTile(model, picker, tile, tileSpan(group.tiles))).join("")}</div></section>`).join("");

// All keycodes: every section under its name, in its groups or its rows.
/** @param {Model} model @param {Picker} picker @param {import("../view/picker-tiles.mjs").ListedSection[]} sections */
const allKeycodes = (model, picker, sections) => sections.map((section) => `<section class="pk-section"><h3 class="pk-section-head">${esc(section.name)}</h3>
    ${section.rows === "layers" ? layerRows(model, picker) : section.rows === "modes" ? modeRows(model, picker)
        : keyGroups(model, picker, section.groups)}</section>`).join("");

// Said wherever a Tap-hold can be armed.
/** @param {Model} model @param {Picker} picker */
const armedWords = (model, picker) => `Tap-hold on <b>${layerMarkedAt(model, Number(picker.layerTap))}</b> is armed — now pick the tap key from any section.`;

/** @param {Model} model */
function sectionBody(model) {
    const picker = state.picker;
    if (!picker) return "";

    if (picker.search) {
        const groups = foundGroups(model, picker);
        const count = groups.reduce((sum, group) => sum + group.tiles.length, 0);
        if (!count) return `<p class="note pk-empty">No key matches “${esc(picker.search)}”.</p>`;
        return `<div class="pk-body"><p class="note pk-count">${esc(count)} match${count === 1 ? "" : "es"}</p>
            ${picker.layerTap ? `<p class="note pk-count">${armedWords(model, picker)}</p>` : ""}
            ${keyGroups(model, picker, groups)}</div>`;
    }

    const section = shownSection(model, picker);
    if (section.kind === "board") {
        const keys = PICKER_BOARD.keys.filter(source => pickAllowed(model, picker, source.value)).map((source) => {
            const spoken = keyIdentity(model, source.value).label;
            // The host layout's legends replace the ANSI board's, so a German
            // board reads Z where QMK says KC_Y; the key it stores is unchanged.
            const key = pickerBoardKey(source, model);
            const on = isPicked(model, picker, key.value);
            const shifted = key.labels[1] && key.labels[1].length <= 3;
            const extra = key.labels[2] || key.labels[3];
            return `<g class="pkb-key ${on ? "on" : ""}" data-pick="${esc(key.value)}" tabindex="0" role="button" aria-label="${esc(spoken)}">
                <rect x="${esc(key.x)}" y="${esc(key.y)}" width="${esc(key.w)}" height="${esc(key.h)}" rx="8"></rect>
                ${extra
                    ? key.labels.map((label, index) => label ? `<text class="${index === 0 ? `pkb-main ${label.length > 1 ? "sm" : ""}` : "pkb-alt"}" x="${key.x + key.w * (index < 2 ? 0.26 : 0.74)}" y="${key.y + key.h * (index % 2 ? 0.36 : 0.74)}">${esc(label)}</text>` : "").join("")
                    : shifted
                    ? `<text class="pkb-alt" x="${key.x + key.w / 2}" y="${key.y + key.h * 0.36}">${esc(key.labels[1])}</text>
                       <text class="pkb-main" x="${key.x + key.w / 2}" y="${key.y + key.h * 0.74}">${esc(key.labels[0])}</text>`
                    : `<text class="pkb-main ${legendFits(key.labels[0], key.w) ? "" : "sm"}" x="${key.x + key.w / 2}" y="${key.y + key.h / 2 + 5}">${esc(key.labels[0])}</text>`}
            </g>`;
        }).join("");
        // The host's name for GUI (Command on a Mac), as the modifier row says it.
        const gui = modifierControls(model).find(({value}) => value === "G")?.label || "GUI";
        return `<div class="pk-body"><div class="pkb"><svg viewBox="0 0 ${PICKER_BOARD.width} ${PICKER_BOARD.height}" xmlns="http://www.w3.org/2000/svg">${keys}</svg></div>
            ${model?.hostLayoutLegends ? `<p class="note pk-note">Shift above; ${esc(vocabulary(model).thirdLevel)} on the right. ◌ marks a dead key: press it, then a letter.</p>` : ""}
            <p class="note pk-note">${picker.shortcut ? `Click the keys to hold together, in the order they go down, and the modifiers held with them, left and right mixed; click a key again to take it out. A symbol's modifiers are held for the whole shortcut. ${shortcutLimitWords(model) ? `${esc(shortcutLimitWords(model, true))}. ` : ""}Layers adds the layers it turns on, and how. Modifiers alone, a key alone or layers alone are a shortcut too.` : picker.mode === "list" ? picker.maxKeys === 1 ? "Choose the key to press or release." : "Choose the keys to send together." : `Click a key. A modifier, picked above or on the board, is held down with it: <code>${esc(gui)}</code> and <code>C</code> make one key that sends ${esc(gui)}+C.`}</p></div>`;
    }
    // A shortcut's layers are switches (shortcutLayerTable), placed once the
    // sheet is built.
    if (section.kind === "layers" && picker.shortcut) {
        // How it turns them on, all alike, as one layer key does; nothing to
        // choose until a layer is switched on.
        const none = !picker.layers;
        return `<div class="pk-body"><div class="field pk-layer-kind"><span>Turns them on as</span>
            <div class="seg" role="radiogroup" aria-label="How the shortcut turns its layers on" data-tip="${none ? "Switch a layer on first." : ""}">
                ${shortcutLayerKinds(model).map(({kind, label, tip}) => `<label data-tip="${esc(tip)}"><input type="radio" name="picker:shortcut-layer-kind" value="${esc(kind)}" data-f="picker:shortcut-layer-kind:${esc(kind)}" ${kind === (picker.layerKind || 0) ? "checked" : ""} ${none ? "disabled" : ""}><span>${esc(label)}</span></label>`).join("")}
            </div></div><div data-shortcut-layers></div>
        <p class="note pk-note">Each layer switched on turns on as the choice above says, as that layer key would. The base and default layers are always on.</p></div>`;
    }
    if (section.kind === "layers") {
        return `<div class="pk-body">${layerRows(model, picker)}
            <p class="note pk-note">${picker.layerTap
                ? armedWords(model, picker)
                : `Hold reaches the layer while the key is down. Lock toggles it. ${picker.comboOutput ? "" : "Tap-hold asks for a tap key next. "}Tap-toggle and One-shot hold like Hold; Move to switches to the layer alone.${picker.comboOutput ? " A combo can't send Tap-hold, which needs a key of its own." : ""}`}</p></div>`;
    }
    if (section.kind === "modes") {
        if (!(model?.pdModes || []).length) return `<p class="note pk-empty">This keyboard has not reported its pointing modes.</p>`;
        return `<div class="pk-body">${modeRows(model, picker)}
            <p class="note pk-note">Hold runs the mode while the key is down; Lock keeps the mode on until it is pressed again. An empty slot's key does nothing.</p></div>`;
    }
    if (section.kind === "macros") {
        if (!offeredMacros(model, picker).length) return `<p class="note pk-empty">This keyboard has not reported its macros.</p>`;
        return `<div class="pk-body">${keyGroups(model, picker, sectionGroups(model, picker, section))}</div>`;
    }
    if (section.kind === "all") {
        return `<div class="pk-body">${picker.layerTap ? `<p class="note pk-count">${armedWords(model, picker)}</p>` : ""}${allKeycodes(model, picker, listedSections(model, picker))}</div>`;
    }
    const groups = sectionGroups(model, picker, section);
    if (!groups.length) return `<p class="note pk-empty">The keyboard's catalogue has nothing in this section.</p>`;
    return `<div class="pk-body">${keyGroups(model, picker, groups)}</div>`;
}

// A shortcut's layers, one row per layer in the tab order: the base layer and
// the default layers dimmed, saying why in the row (firmware D-F26).
/** @param {Model} model @param {import("../state.js").PickerState} picker */
function shortcutLayerTable(model, picker) {
    const rows = shortcutLayerRows(model, picker.layers || 0);
    const kinds = shortcutLayerKinds(model), kind = kinds.find((entry) => entry.kind === (picker.layerKind || 0)) || kinds[0];
    const column = kind?.column || "Held on while the shortcut is";
    return layerSwitchTable(model, "Layers", [column], rows.map((row) => ({
        layer: row.layer, label: row.name, why: row.why, tip: row.tip, unusable: row.unusable,
        switches: [{f: `picker:shortcut-layer:${row.layer}`, label: `${row.name}: ${column.toLowerCase()}`, checked: row.on, disabled: row.unusable,
            tip: row.unusable ? row.tip : kind?.tip || ""}],
    })));
}

export function pickerOverlay() {
    const picker = state.picker;
    if (!picker) return null;
    // With no layer left, the kind they turn on as goes back to Hold, so it
    // does not come back with the next layer switched on.
    /** @param {number} mask */
    const setLayers = (mask) => { picker.layers = mask; if (!mask) picker.layerKind = 0; };
    const model = getModel();
    const value = expression();
    // A key the draft would refuse never enables Use: the dialog must not
    // close into an error. Shortcuts and holds keep their own checks.
    const plain = picker.shortcut || !value ? "" : picker.layoutKey ? keyProblem(model, value) : picker.comboOutput ? comboOutputProblem(model, value) : "";
    const problem = pickProblem(model, picker) || plain;
    // Modifiers no keycode can hold, offered as a custom key's shortcut.
    const fold = foldedPick(model, picker);
    const offer = !picker.onCustomKey || picker.mode !== "single" || picker.shortcut || picker.layerTap ? null
        : fold ? ("shortcut" in fold && (model?.customKeyShortcutKeys || []).length ? fold.shortcut : null) : shortcutOffer(model, picker);
    // A pick that cannot be stored shows no value: the problem line says why.
    const storable = problem || offer ? "" : value;
    const {existing, withBehaviour, spare} = offer ? customKeyChoice(model, offer, {runsBehaviour: picker.customKeyRuns !== "shortcut"})
        : {existing: undefined, withBehaviour: false, spare: undefined};
    /** @param {import("../../contracts/panel.js").CustomKey} key */
    const keyWords = (key) => `Custom key ${key.slot}${key.name ? ` · ${key.name}` : ""}`;
    // The footer names every part picked, in the order it is held (modifiers,
    // keys, layers), beside the pick in QMK's names (D-L83).
    const node = el(`<div class="scrim"><div class="sheet picker" role="dialog" aria-modal="true" aria-label="Pick a keycode">
        <div class="sheet-h">
            <div><h2>Pick a keycode</h2>
                <p class="note">${picker.shortcut ? `For <b>${esc(picker.title)}</b> · ${esc(picker.context || "")}${shortcutLimitWords(model) ? ` · ${esc(shortcutLimitWords(model))}` : ""}` : picker.mode === "list" ? picker.maxKeys === 1 ? "Choose one key." : Number.isFinite(picker.maxKeys) ? `Choose up to ${esc(picker.maxKeys)} keys to send together.` : "Choose one or more keys." : picker.onLayer !== undefined ? `For ${picker.contextKeycode ? actionMarked(model, picker.contextKeycode) : "a key"} on <b>${layerMarkedAt(model, picker.onLayer)}</b>`
                : `For <b>${esc(picker.title)}</b> · ${[picker.contextKeycode ? actionMarked(model, picker.contextKeycode) : "", esc(picker.context || "")].filter(Boolean).join(" · ")}`}</p></div>
            <input class="input pk-search" id="pickerSearch" data-f="picker:search" aria-label="Search keycodes" placeholder="Search every section" value="${esc(picker.search)}">
            <span class="right"><button class="btn ghost" data-act="cancel">Close</button></span>
        </div>
        ${picker.mode === "list" ? "" : `<div class="pk-mods"><span class="label">Modifiers</span>
            ${modifierControls(model).map(({value: wrap, label}) => `<button class="pk-mod ${picker.mods.includes(wrap) ? "on" : ""}" data-mod="${esc(wrap)}" aria-pressed="${picker.mods.includes(wrap)}"
                data-tip="Held down with the key.">${esc(label)}</button>`).join("")}
            <span class="note">held together with the key</span></div>`}
        <div class="sheet-b">
            <div class="picker-side">${offeredSections(model, picker).map((section) =>
                `<button data-sec="${esc(section.id)}" aria-current="${picker.section === section.id && !picker.search}">${esc(section.label)}</button>`).join("")}</div>
            <div class="picker-keys" data-picker-keys="${esc(picker.search ? `search:${picker.search}` : shownSection(model, picker).id)}">${sectionBody(model)}</div>
        </div>
        <div class="sheet-f">
            <span class="label">Selected</span>
            ${picker.layerTap ? `<button class="chip" data-act="clearlt" aria-label="${esc(`Remove the tap-hold on ${layerTapName(picker.layerTap)}`)}">LT ${esc(layerTapName(picker.layerTap))} ✕</button>` : ""}
            ${modifierControls(model).filter(({value: wrap}) => picker.mods.includes(wrap)).map(({value: wrap, label}) =>
                `<button class="chip" data-unmod="${esc(wrap)}" aria-label="${esc(`Remove ${label}`)}">${esc(label)} ✕</button>`).join("")}
            ${picker.keys.map((key, index) => `<button class="chip" data-remove="${esc(index)}" data-tip="${esc(key)}" aria-label="${esc(`Remove ${keyNameText(model, key)}`)}">${esc(keyNameText(model, key))} ✕</button>`).join("")}
            ${picker.keys.length || picker.mods.length || picker.layers || picker.layerTap ? "" : `<span class="note">nothing picked yet</span>`}
            ${picker.shortcut ? layers().filter((layer) => (picker.layers || 0) & 2 ** layer.index).map((layer) =>
                `<button class="chip" data-unlayer="${esc(layer.index)}" aria-label="${esc(`Remove ${layerCalled(layer)}`)}">${esc(layerCalled(layer))} ✕</button>`).join("") : ""}
            <code class="mono pk-value">${esc(storable || "—")}</code>
            <span class="right"><button class="btn ghost" data-act="clear">Clear</button>
                <button class="btn primary" data-act="use" ${value && !problem ? "" : "disabled"}>${picker.shortcut ? "Use shortcut" : "Use keycode"}</button></span>
        </div>
        ${problem && !offer ? `<div class="note pk-problem" role="status">${esc(problem)}</div>` : ""}
        ${offer ? `<div class="note pk-problem pk-offer" role="status">${existing && !withBehaviour
            ? `No keycode can hold ${esc(shortcutPickLabel(model, offer))}, but ${esc(keyWords(existing))} already sends it.
                <button class="btn" data-act="use-existing-key" data-tip="Uses ${esc(existing.keycode)}, which already has this shortcut.">Use ${esc(keyWords(existing))}</button>`
            : existing
            ? `No keycode can hold ${esc(shortcutPickLabel(model, offer))}. ${esc(keyWords(existing))} already sends it, with its behaviour on top, which runs here too.
                <button class="btn" data-act="use-existing-key" data-tip="Uses ${esc(existing.keycode)}: its shortcut and its behaviour.">Use ${esc(keyWords(existing))}</button>
                ${spare ? `<button class="btn" data-act="use-custom-key" data-tip="Gives ${esc(spare.keycode)} this shortcut alone and a name, and uses it here.">Make Custom key ${esc(spare.slot)}</button>`
                    : `<span>Every other custom key is in use.</span>`}`
            : spare
            ? `No keycode can hold ${esc(shortcutPickLabel(model, offer))}, but a custom key's shortcut can.
                <button class="btn" data-act="use-custom-key" data-tip="Gives ${esc(spare.keycode)} this shortcut and a name, and uses it here.">Use Custom key ${esc(spare.slot)}</button>`
            : `No keycode can hold ${esc(shortcutPickLabel(model, offer))}, and every custom key is in use. Free one on the Custom keys screen to hold it.`}</div>` : ""}
    </div></div>`);

    node.addEventListener("click", (event) => {
        if (event.target === node || /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest('[data-act="cancel"]'))) return closePicker();
        const section = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest("[data-sec]"));
        if (section) { picker.section = section.dataset.sec || "board"; picker.search = ""; return render(); }
        const modifier = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest("[data-mod]"));
        if (modifier) {
            Object.assign(picker, pickModifier(picker, modifier.dataset.mod || ""));
            return render();
        }
        const layerTap = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest("[data-lt]"));
        if (layerTap) { picker.layerTap = picker.layerTap === layerTap.dataset.lt ? null : layerTap.dataset.lt || null; return render(); }
        if (/** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest('[data-act="clearlt"]'))) { picker.layerTap = null; return render(); }
        if (/** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest('[data-act="clear"]'))) { picker.keys = []; picker.mods = []; picker.own = []; picker.symbols = {}; picker.layers = 0; picker.layerKind = 0; picker.layerTap = null; return render(); }
        const unlayer = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest("[data-unlayer]"));
        if (unlayer) { setLayers((picker.layers || 0) & ~(2 ** Number(unlayer.dataset.unlayer))); return render(); }
        const remove = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest("[data-remove]"));
        if (remove) { Object.assign(picker, dropKey(picker, Number(remove.dataset.remove))); return render(); }
        const unmod = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest("[data-unmod]"));
        if (unmod) { Object.assign(picker, pickModifier(picker, unmod.dataset.unmod || "")); return render(); }
        // The picker closes itself before handing the choice on, so every
        // caller only says what the choice does.
        if (existing && /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest('[data-act="use-existing-key"]'))) {
            state.picker = null;
            picker.onPick?.(existing.keycode);
            return render();
        }
        if (offer && spare && /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest('[data-act="use-custom-key"]'))) {
            state.picker = null;
            picker.onCustomKey?.(spare.keycode, offer, offeredName(model, offer));
            return render();
        }
        if (/** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest('[data-act="use"]'))) {
            const chosen = expression();
            if (!chosen || pickProblem(getModel(), picker)) return;
            state.picker = null;
            if (picker.shortcut) picker.onShortcut?.(shortcutPick(getModel(), picker));
            else picker.onPick?.(chosen);
            return render();
        }
        const pick = /** @type {HTMLElement | SVGElement | null} */ (/** @type {Element} */ (event.target).closest("[data-pick]"));
        if (pick) {
            const chosen = pickValue(getModel(), picker, pick.dataset.pick || "");
            if (!pickAllowed(getModel(), picker, chosen)) return;
            const next = pickKey(getModel(), picker, chosen);
            if (!next) return;
            Object.assign(picker, next);
            render();
        }
    });
    const slot = /** @type {HTMLElement | null} */ (node.querySelector("[data-shortcut-layers]"));
    if (slot) {
        const table = shortcutLayerTable(model, picker);
        slot.replaceWith(table);
        table.addEventListener("change", () => { setLayers(switchedLayers(table, 0)); render(); });
    }
    const kinds = /** @type {HTMLElement | null} */ (node.querySelector(".pk-layer-kind"));
    kinds?.addEventListener("change", (event) => { picker.layerKind = Number(/** @type {HTMLInputElement} */ (event.target).value) || 0; render(); });
    const search = /** @type {HTMLInputElement} */ (node.querySelector("#pickerSearch"));
    search.addEventListener("input", () => {
        picker.search = search.value;
        render();
        const again = /** @type {HTMLInputElement | null} */ (document.querySelector("#pickerSearch"));
        if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
    });
    return node;
}
