// @ts-check
// Selector assertions refer to elements created by this module's authored markup.
import {DISCLOSURE, el, esc} from "../lib/dom.mjs";
import {foldOpen, panelDisclosure} from "./disclosure.mjs";
import {getModel, render, state} from "../store.mjs";
import {layerSwitchGrid, switchedLayers} from "./layer-switches.mjs";
import {ALL_LAYERS} from "../view/layout.mjs";
import {layerOff, masterOff} from "../view/participation.mjs";
import {screenOfSection} from "../view/settings-layout.mjs";
import {phraseSentence, said, vocabulary} from "../view/vocabulary.mjs";
/** @typedef {import("../../contracts/model.js").SettingOffSwitch} SettingOffSwitch */

// Definition switches preserve all actions and timing while disabled. A
// behaviour or a combo is named as itself, and the layers its keys may come
// from open in a panel under Layers it runs on, drawn as Settings draws its
// layer switches: each layer by its name and mark (layer-switches.mjs). The
// panel opens and closes as every panel disclosure does (panelDisclosure),
// staying open across renders, so switching a layer, which redraws the
// editor, keeps it open; the grid is built either way, so the mask reads the
// same closed. A layer Settings keeps this kind off says so in its row, and its
// switch stays live: it holds what this definition does once Settings allows it,
// and a behaviour's counts at once for a combo's output, which does not follow
// that layer's switch (firmware's participation policy).
// The master switch is no layer's, so its banner heads the tab instead
// (masterOffBanner).
const PLACE = "definition:layers";
/** @param {"behaviour" | "combo"} noun */
const kindOf = (noun) => noun === "combo" ? "combo" : "behavior";
// A global switch a banner names: the Settings section it is in, and its field.
/** @type {Readonly<Record<SettingOffSwitch, {section: string, macro: string}>>} */
const SWITCHES = {behaviour: {section: "behaviorSettings", macro: "behaviorsEnabled"}, combo: {section: "comboSettings", macro: "combosEnabled"},
    autoMouse: {section: "autoMouse", macro: "autoMouse"}, autocorrect: {section: "autocorrect", macro: "autocorrect"}};
// Whether a global switch is off in the profile, as its Settings section
// publishes it: the one answer for a switch that has no participation of its
// own to read.
/** @param {{configDefaults?: readonly {id: string, fields: readonly {macro: string, enabled?: boolean}[]}[]} | null | undefined} model @param {SettingOffSwitch} name */
export const settingSwitchedOff = (model, name) => (model?.configDefaults || []).some((section) => section.id === SWITCHES[name].section
    && section.fields.some((field) => field.macro === SWITCHES[name].macro && field.enabled === false));
// A banner that says a global switch is off, and goes to it, marking its row.
// `detail` is what that means where the banner is: the vocabulary's own for
// the switch, unless the place has its own to say.
/** @param {SettingOffSwitch} name @param {string} [detail] @returns {HTMLElement} */
export function settingOffBanner(name, detail = vocabulary(getModel()).settingOff.switches[name].detail || "") {
    const words = vocabulary(getModel()).settingOff.switches[name];
    const {section, macro} = SWITCHES[name];
    const banner = el(`<button type="button" class="callout master-off" data-master-off><strong>${esc(words.off)}</strong> ${detail ? `${esc(detail)} ` : ""}${esc(words.fix)}</button>`);
    banner.addEventListener("click", () => {
        Object.assign(state, {screen: screenOfSection(section), reveal: `.setrow:has([data-macro="${macro}"])`});
        render();
    });
    return banner;
}
// That banner for behaviours or combos while their master switch is off; null
// while it is on.
/** @param {"behaviour" | "combo"} noun @returns {HTMLElement | null} */
export const masterOffBanner = (noun) => masterOff(getModel(), kindOf(noun)) ? settingOffBanner(noun) : null;
// A workbench tab with its banner across the top, if it has one. Both take the
// one cell a workbench gives its tab, so the tab fills what the banner leaves.
/** @param {HTMLElement | null} banner @param {HTMLElement} surface @returns {HTMLElement} */
export function underBanner(banner, surface) {
    if (!banner) return surface;
    const box = el(`<div class="banner-over"></div>`);
    box.append(banner, surface);
    return box;
}
/** @param {{index: number, label?: string, name: string}[]} layers @param {{enabled?: boolean, allowedLayers?: number}} definition @param {boolean} editable @param {(patch: {enabled: boolean, allowedLayers: number}) => void} changed @param {string} identity @param {"behaviour" | "combo"} noun */
export function definitionControls(layers, definition, editable, changed, identity, noun) {
    const words = vocabulary(getModel()).definitionFields;
    const open = foldOpen(PLACE);
    // Two controls, no box of their own: they sit in the row their editor
    // lays them in (display: contents). The combo builder, a grid of fields,
    // gives them a row of their own instead (styles.css, .combo-builder).
    const node = el(`<div class="def-controls">
        <label class="sw" data-tip="Off, this ${noun} keeps its actions and timing but does nothing until it is on again."><input type="checkbox" data-f="${esc(identity)}:enabled" data-definition-enabled ${definition.enabled !== false ? "checked" : ""} ${editable ? "" : "disabled"}>
            <span class="track"></span><span class="txt">${esc(words.use[noun])}</span></label>
        <div class="def-layers">
            <button type="button" class="disclose" data-act="definition-layers" aria-haspopup="dialog" aria-expanded="${open}"
                data-tip="The layers a key can come from for this ${noun} to run. It runs only where Settings and the key's own switch allow it too.">${DISCLOSURE}<span>${esc(words.allowedLayers)}</span></button>
            ${open ? `<div class="def-pop" role="dialog" aria-label="${esc(words.allowedLayers)}"></div>` : ""}
        </div>
    </div>`);
    const allowed = definition.allowedLayers ?? ALL_LAYERS;
    const grid = layerSwitchGrid(getModel(), words.allowedLayers, layers.map(layer => {
        const off = layerOff(getModel(), layer.index, kindOf(noun));
        return {layer: layer.index, label: layer.label || layer.name,
            f: `${identity}:allowed-layer:${layer.index}`, checked: Boolean(allowed & 2 ** layer.index), disabled: !editable,
            ...(off ? {why: words.offInSettings[noun], tip: `${said(phraseSentence(off))}. ${words.onceOn[noun]}`} : {})};
    }),
    // An empty layer it does not run on differs from how it came, so shows.
    {place: `runs-on:${noun}`, keep: (layer) => !(allowed & 2 ** layer)});
    /** @type {HTMLElement | null} */ (node.querySelector(".def-pop"))?.appendChild(grid);
    panelDisclosure(node, {place: PLACE, act: "definition-layers", within: ".def-layers"});
    const use = /** @type {HTMLInputElement} */ (node.querySelector("[data-definition-enabled]"));
    const report = () => changed({enabled: use.checked, allowedLayers: switchedLayers(grid)});
    use.addEventListener("change", report);
    /** @type {NodeListOf<HTMLInputElement>} */ (grid.querySelectorAll("input")).forEach(input => input.addEventListener("change", report));
    return node;
}
