// @ts-check
/**
 * @typedef {import("../../contracts/panel.js").PublishedModel | null} Model
 * @typedef {import("../../contracts/panel.js").MacroSlot} MacroSlot
 */
// Selector assertions describe the authored sheet; click targets can be SVG
// board keys, whose nearest data-bearing ancestor supplies the same dataset.
// The keycode picker: a real keyboard first, then the sections this keyboard
// actually has — its layers, its pointing slots, its macro banks — and the
// vendored QMK catalogue behind a search.

import {el, esc} from "../lib/dom.mjs";
import {getModel, layers, render, state} from "../store.mjs";
import {actionMarked} from "./marks.mjs";
import {PICKER_BOARD, legendFits, pickerBoardKey} from "../view/picker-board.mjs";
import {comboOutputProblem, keyProblem} from "../view/keycode-expression.mjs";
import {foldedPick, isLayerKeyPicked, isPicked, offeredEntries, offeredMacros, offeredSections, pickAllowed, pickProblem, pickValue, pickedExpression, pickerMatches, shownSection} from "../view/picker.mjs";
import {customKeyChoice, offeredName, shortcutLayerKinds, shortcutLayerRows, shortcutOffer, shortcutPick, shortcutPickLabel, shortcutPickMods, shortcutPickDrop, shortcutPickKey, shortcutPickModifier, shortcutLimitWords} from "../view/custom-key.mjs";
import {layerSwitchTable, switchedLayers} from "./layer-switches.mjs";
import {vocabulary, word, layerCalled, slotNamed} from "../view/vocabulary.mjs";
import {macroShortName} from "../view/macro.mjs";
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
export function openPicker({title, context, contextKeycode, seed = [], mode = "single", allowedKeys = null, modifiable = null, shortcut = null, maxKeys = Infinity, onPick, onShortcut, onCustomKey, customKeyRuns = "behaviour", layoutKey = false, comboOutput = false}) {
    const keys = allowedKeys ? seed.map(key => keyIdentity(getModel(), key).name) : seed.slice();
    const mods = shortcut ? shortcutPickMods(getModel(), shortcut.mods) : [];
    state.picker = {title, context, contextKeycode, mode, allowedKeys, modifiable, shortcut: Boolean(shortcut), own: mods.slice(), symbols: {}, layers: shortcut?.layers || 0, layerKind: shortcut?.layers ? shortcut.layerKind || 0 : 0, maxKeys, section: "board", search: "", mods, keys, layerTap: null, onPick, onShortcut, onCustomKey, customKeyRuns, layoutKey, comboOutput};
    render();
}

// Layer keycodes are posted by index — MO(1), LOCK_LAYER(1), LT(1, KC_A) —
// the form the keyboard reports and the draft encodes; the name is display.
/** @param {string | number} index */
const layerTapName = (index) => layerCalled(layers()[Number(index)]);

const closePicker = () => { state.picker = null; render(); };

const expression = () => pickedExpression(getModel(), state.picker);

/** @template T @param {T[]} values @param {number} size */
const chunk = (values, size) => values.reduce((rows, value, index) =>
    (index % size ? rows[rows.length - 1].push(value) : rows.push([value]), rows), /** @type {T[][]} */ ([]));

/** @param {Pick<import("../../contracts/panel.js").CatalogEntry, "value" | "label" | "tip">} entry @param {boolean} picked */
function keyButton(entry, picked) {
    return `<button class="pk ${picked ? "on" : ""}" data-pick="${esc(entry.value)}"${entry.tip ? ` data-tip="${esc(entry.tip)}"` : ""}>
        <span class="l">${esc(entry.label || entry.value)}</span><span class="c">${esc(entry.value)}</span></button>`;
}

// A macro slot shows by its name when it has one, with its slot and size
// underneath, so a named macro is recognisable wherever it is offered. An
// unnamed slot's face is its slot tag ("M3"), as the Slots list and the
// macro editor's tag show it: a key-sized tile, where core's longer name
// ("Macro 3", macroNamed) would need a wide one.
/** @param {MacroSlot} slot @param {boolean} picked */
function macroButton(slot, picked) {
    return `<button class="pk ${slot.name ? "wide" : ""} ${picked ? "on" : ""}" data-pick="${esc(slot.keycode)}" data-tip="${esc(slot.keycode)}">
        <span class="l">${esc(slot.name || macroShortName(slot))}</span>
        <span class="c">${slot.name ? `${esc(macroShortName(slot))} · ` : ""}${slot.empty ? "empty" : `${esc(slot.bytes)} B`}</span></button>`;
}

/** @param {Model} model */
function sectionBody(model) {
    const picker = state.picker;
    if (!picker) return "";
    /** @param {string} value */
    const picked = (value) => isPicked(model, picker, value);

    if (picker.search) {
        const {macros, keycodes: matches} = pickerMatches(model, picker);
        if (!matches.length && !macros.length) return `<p class="note pk-empty">Nothing in the keyboard's catalogue or macros matches “${esc(picker.search)}”.</p>`;
        const count = matches.length + macros.length;
        return `<div class="pk-body"><p class="note pk-count">${count} match${count === 1 ? "" : "es"}</p>
            ${macros.length ? `<div class="label pk-label">Macros</div>
                <div class="pk-rows pk-macros">${chunk(macros, 8).map((row) => `<div class="pk-row">${row.map((slot) => macroButton(slot, picked(slot.keycode))).join("")}</div>`).join("")}</div>` : ""}
            ${matches.length ? `${macros.length ? `<div class="label pk-label">Keycodes</div>` : ""}
                <div class="pk-rows">${chunk(matches, 8).map((row) => `<div class="pk-row">${row.map((entry) => keyButton(entry, picked(entry.value))).join("")}</div>`).join("")}</div>` : ""}</div>`;
    }

    const section = shownSection(model, picker);
    if (section.kind === "board") {
        const keys = PICKER_BOARD.keys.filter(source => pickAllowed(model, picker, source.value)).map((source) => {
            const spoken = model?.qmkKeyLabels?.[source.value];
            // The host layout's legends replace the ANSI board's, so a German
            // board reads Z where QMK says KC_Y; the key it stores is unchanged.
            const key = pickerBoardKey(source, model);
            const on = picked(key.value);
            const shifted = key.labels[1] && key.labels[1].length <= 3;
            const extra = key.labels[2] || key.labels[3];
            return `<g class="pkb-key ${on ? "on" : ""}" data-pick="${esc(key.value)}" tabindex="0" role="button" aria-label="${esc(spoken || key.value)}">
                <rect x="${esc(key.x)}" y="${esc(key.y)}" width="${esc(key.w)}" height="${esc(key.h)}" rx="8"></rect>
                ${extra
                    ? key.labels.map((label, index) => label ? `<text class="${index === 0 ? `pkb-main ${label.length > 1 ? "sm" : ""}` : "pkb-alt"}" x="${key.x + key.w * (index < 2 ? 0.26 : 0.74)}" y="${key.y + key.h * (index % 2 ? 0.36 : 0.74)}">${esc(label)}</text>` : "").join("")
                    : shifted
                    ? `<text class="pkb-alt" x="${key.x + key.w / 2}" y="${key.y + key.h * 0.36}">${esc(key.labels[1])}</text>
                       <text class="pkb-main" x="${key.x + key.w / 2}" y="${key.y + key.h * 0.74}">${esc(key.labels[0])}</text>`
                    : `<text class="pkb-main ${legendFits(key.labels[0], key.w) ? "" : "sm"}" x="${key.x + key.w / 2}" y="${key.y + key.h / 2 + 5}">${esc(key.labels[0])}</text>`}
            </g>`;
        }).join("");
        return `<div class="pk-body"><div class="pkb"><svg viewBox="0 0 ${PICKER_BOARD.width} ${PICKER_BOARD.height}" xmlns="http://www.w3.org/2000/svg">${keys}</svg></div>
            ${model?.hostLayoutLegends ? `<p class="note pk-note">Shift above; ${esc(vocabulary(model).thirdLevel)} on the right. ◌ marks a dead key: press it, then a letter.</p>` : ""}
            <p class="note pk-note">${picker.shortcut ? `Click the keys to hold together, in the order they go down, and the modifiers held with them, left and right mixed; click a key again to take it out. A symbol's modifiers are held for the whole shortcut. ${shortcutLimitWords(model) ? `${esc(shortcutLimitWords(model, true))}. ` : ""}Layers adds the layers it turns on, and how. Modifiers alone, a key alone or layers alone are a shortcut too.` : picker.mode === "list" ? picker.maxKeys === 1 ? "Choose the key to press or release." : "Choose the keys to send together." : `Click a key. Modifiers above wrap it, so <code>${esc(modifierControls(model).find(({value}) => value === "G")?.label || "G")}</code> + <code>C</code> stores <code>G(KC_C)</code> — identical to <code>LGUI(KC_C)</code>.`}</p></div>`;
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
        <p class="note pk-note">Each layer switched on is turned on as the choice above says, as that layer key would turn it on: held while the shortcut is, locked, locked alone, tap-toggled or one-shot. Held, it goes off when the shortcut lets go unless something else keeps it on, and a tap turns it on only for the tap. The base layer and the default layers are always on.</p></div>`;
    }
    if (section.kind === "layers") {
        // A key storing another form of the same act lights its button
        // (isLayerKeyPicked: TG(n) lights Lock); each button reads as core
        // words its form (vocabulary.layerKeyVerbs).
        const verbs = vocabulary(model).layerKeyVerbs;
        /** @param {string} value @param {string} label @param {string} tip */
        const button = (value, label, tip, on = isLayerKeyPicked(model, picker, value)) =>
            `<button class="pk wide ${on ? "on" : ""}" data-pick="${esc(value)}" data-tip="${esc(tip)}"><span class="l">${esc(label)}</span><span class="c">${esc(value)}</span></button>`;
        return `<div class="pk-body"><div class="pk-layers">${layers().map((layer) => `
            <div class="pk-layer">
                <span class="ix">${esc(layer.index)}</span><span class="nm">${esc(layerCalled(layer))}</span>
                ${button(`MO(${layer.index})`, verbs.MO ?? "", "On while the key is down.")}
                ${button(`LOCK_LAYER(${layer.index})`, verbs.LOCK_LAYER ?? "", "Turns the layer on until pressed again. QMK's TG() is the same lock.")}
                ${picker.comboOutput ? "" : `<button class="pk wide ${picker.layerTap === String(layer.index) ? "on" : ""}" data-lt="${esc(layer.index)}" data-tip="A tap sends a key, a hold holds the layer. Pick the tap key next."><span class="l">Tap-hold</span><span class="c">LT(${esc(layer.index)}, …)</span></button>`}
                ${button(`TT(${layer.index})`, verbs.TT ?? "", "Holds the layer like Hold; repeated taps lock it.")}
                ${button(`OSL(${layer.index})`, verbs.OSL ?? "", "Holds the layer like Hold; a tap turns it on for the next key only.")}
                ${button(`TO(${layer.index})`, verbs.TO ?? "", "Locks this layer alone and releases every other lock. TO(0) returns to the base layer.")}
            </div>`).join("")}</div>
            <p class="note pk-note">${picker.layerTap
                ? `Tap-hold on <b>${esc(layerTapName(picker.layerTap))}</b> is armed — now pick the tap key from any section.`
                : `Hold reaches the layer while the key is down. Lock toggles it. ${picker.comboOutput ? "" : "Tap-hold asks for a tap key next. "}Tap-toggle and One-shot hold like Hold; Move to switches to the layer alone.${picker.comboOutput ? " A combo can't send Tap-hold, which needs a key of its own." : ""}`}</p></div>`;
    }
    if (section.kind === "modes") {
        // One row per slot, laid out like the layers: the slot, what it does,
        // then its two keycodes. An empty slot is still offered, since its
        // keycodes are fixed; the row says it does nothing until configured.
        // Past eight slots the rows run down two columns, slot order first.
        const slots = model?.pdModes || [];
        const many = slots.length > 8;
        const rows = many ? ` style="grid-template-rows:repeat(${Math.ceil(slots.length / 2)}, auto)"` : "";
        if (!slots.length) return `<p class="note pk-empty">This keyboard has not reported its pointing modes.</p>`;
        const kinds = vocabulary(model).pointing.kinds;
        /** @param {string} value @param {string} label @param {string} tip */
        const button = (value, label, tip) =>
            `<button class="pk wide ${picked(value) ? "on" : ""}" data-pick="${esc(value)}" data-tip="${esc(tip)}"><span class="l">${esc(label)}</span><span class="c">${esc(value)}</span></button>`;
        return `<div class="pk-body"><div class="pk-layers modes ${many ? "many" : ""}"${rows}>${slots.map((slot) => `
            <div class="pk-layer ${slot.kind ? "" : "empty"}">
                <span class="ix">${esc(slot.id)}</span>
                <span class="nm"><span>${esc(slotNamed(slot))}</span><span class="sub">${esc(slot.kind ? word(kinds, slot.kind) : "Empty — does nothing yet")}</span></span>
                ${button(slot.keys.hold, "Hold", "On while the key is down.")}
                ${button(slot.keys.lock, "Lock", "Turns the mode on until pressed again.")}
            </div>`).join("")}</div>
            <p class="note pk-note">Hold re-reads the trackball while the key is down. Lock keeps the mode on until the key is pressed again. A key for an empty slot does nothing until the slot is configured.</p></div>`;
    }
    if (section.kind === "macros") {
        const slots = offeredMacros(model, picker);
        if (!slots.length) return `<p class="note pk-empty">This keyboard has not reported its macros.</p>`;
        return `<div class="pk-body"><div class="pk-rows">${chunk(slots, 8).map((row) => `<div class="pk-row">${row.map((slot) =>
            macroButton(slot, picked(slot.keycode))).join("")}</div>`).join("")}</div></div>`;
    }
    const entries = offeredEntries(model, picker, section);
    if (!entries.length) return `<p class="note pk-empty">The keyboard's catalogue has nothing in this section.</p>`;
    return `<div class="pk-body"><div class="pk-rows">${chunk(entries, 8).map((row) =>
        `<div class="pk-row">${row.map((entry) => keyButton(entry, picked(entry.value))).join("")}</div>`).join("")}</div></div>`;
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
    const node = el(`<div class="scrim"><div class="sheet picker" role="dialog" aria-modal="true" aria-label="Pick a keycode">
        <div class="sheet-h">
            <div><h2>Pick a keycode</h2>
                <p class="note">${picker.shortcut ? `For <b>${esc(picker.title)}</b> · ${esc(picker.context || "")}${shortcutLimitWords(model) ? ` · ${esc(shortcutLimitWords(model))}` : ""}` : picker.mode === "list" ? picker.maxKeys === 1 ? "Choose one key." : Number.isFinite(picker.maxKeys) ? `Choose up to ${esc(picker.maxKeys)} keys to send together.` : "Choose one or more keys." : `For <b>${esc(picker.title)}</b> · ${[picker.contextKeycode ? actionMarked(model, picker.contextKeycode) : "", esc(picker.context || "")].filter(Boolean).join(" · ")}`}</p></div>
            <input class="input pk-search" id="pickerSearch" data-f="picker:search" placeholder="Search every section" value="${esc(picker.search)}">
            <span class="right"><button class="btn ghost" data-act="cancel">Close</button></span>
        </div>
        ${picker.mode === "list" ? "" : `<div class="pk-mods"><span class="label">Modifiers</span>
            ${modifierControls(model).map(({value: wrap, label}) => `<button class="pk-mod ${picker.mods.includes(wrap) ? "on" : ""}" data-mod="${esc(wrap)}"
                data-tip="${picker.shortcut ? "Held with the key." : `Wraps the picked key as ${esc(wrap)}(key).`}">${esc(label)}</button>`).join("")}
            <span class="note">held together with the key</span></div>`}
        <div class="sheet-b">
            <div class="picker-side">${offeredSections(model, picker).map((section) =>
                `<button data-sec="${esc(section.id)}" aria-current="${picker.section === section.id && !picker.search}">${esc(section.label)}</button>`).join("")}</div>
            <div>${sectionBody(model)}</div>
        </div>
        <div class="sheet-f">
            <span class="label">Selected</span>
            ${picker.layerTap ? `<button class="chip" data-act="clearlt">LT ${esc(layerTapName(picker.layerTap))} ✕</button>` : ""}
            ${picker.keys.length ? picker.keys.map((key, index) => `<button class="chip" data-remove="${esc(index)}">${esc(key)} ✕</button>`).join("")
                : picker.mods.length ? modifierControls(model).filter(({value: wrap}) => picker.mods.includes(wrap)).map(({value: wrap, label}) =>
                    `<button class="chip" data-unmod="${esc(wrap)}">${esc(label)} ✕</button>`).join("")
                : picker.layers ? "" : `<span class="note">nothing picked yet</span>`}
            ${picker.shortcut ? layers().filter((layer) => (picker.layers || 0) & 2 ** layer.index).map((layer) =>
                `<button class="chip" data-unlayer="${esc(layer.index)}">${esc(layerCalled(layer))} ✕</button>`).join("") : ""}
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
            Object.assign(picker, shortcutPickModifier(picker, modifier.dataset.mod || ""));
            return render();
        }
        const layerTap = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest("[data-lt]"));
        if (layerTap) { picker.layerTap = picker.layerTap === layerTap.dataset.lt ? null : layerTap.dataset.lt || null; return render(); }
        if (/** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest('[data-act="clearlt"]'))) { picker.layerTap = null; return render(); }
        if (/** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest('[data-act="clear"]'))) { picker.keys = []; picker.mods = []; picker.own = []; picker.symbols = {}; picker.layers = 0; picker.layerKind = 0; picker.layerTap = null; return render(); }
        const unlayer = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest("[data-unlayer]"));
        if (unlayer) { setLayers((picker.layers || 0) & ~(2 ** Number(unlayer.dataset.unlayer))); return render(); }
        const remove = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest("[data-remove]"));
        if (remove) {
            const key = picker.keys[Number(remove.dataset.remove)];
            if (picker.shortcut) Object.assign(picker, shortcutPickDrop(picker, key));
            else picker.keys.splice(Number(remove.dataset.remove), 1);
            return render();
        }
        const unmod = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest("[data-unmod]"));
        if (unmod) { Object.assign(picker, shortcutPickModifier(picker, unmod.dataset.unmod || "")); return render(); }
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
            // A shortcut's keys are a list in press order: a click adds a key
            // or takes it out, a symbol with its modifiers, which stay while
            // another symbol needs them or the person turned them on. One too
            // many shows why, and Use waits.
            if (picker.shortcut) {
                Object.assign(picker, shortcutPickKey(getModel(), picker, chosen));
                return render();
            }
            if (picker.mode === "list" && !picker.keys.includes(chosen) && picker.keys.length >= picker.maxKeys && picker.maxKeys !== 1) return;
            picker.keys = picker.mode === "list"
                ? (picker.keys.includes(chosen) ? picker.keys.filter((key) => key !== chosen) : picker.maxKeys === 1 ? [chosen] : [...picker.keys, chosen])
                : [chosen];
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
