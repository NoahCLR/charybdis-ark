// @ts-check
// The workbench under the board: a tab for the key, its behaviour, its combos,
// and the macros and pointing modes this layer reaches.

import {el, esc} from "../../lib/dom.mjs";
import {behaviourGroups, macroReach, pointingReach} from "../../view/reach.mjs";
import {comboGroups} from "../../view/combo-reach.mjs";
import {mappedKeyCount} from "../../view/lighting.mjs";
import {currentLayer, getModel, layers, render, selectedPosition, state} from "../../store.mjs";
import {draftDot, draftMarks} from "../../view/review.mjs";
import {keepInView} from "../layerbar.mjs";
import {behaviourKey, selectBehaviourKey} from "./behaviour-selection.mjs";
import {tabBehaviours} from "./behaviours-tab.mjs";
import {tabCombos} from "./combos-tab.mjs";
import {tabKey} from "./key-tab.mjs";
import {tabMacros} from "./macros-tab.mjs";
import {tabPointing} from "./pointing-tab.mjs";
import {storedCount} from "./reach.mjs";

/** @type {{id: "key" | "behaviours" | "combos" | "macros" | "pointing", label: string}[]} */
const TABS = [
    {id: "key", label: "Key"},
    {id: "behaviours", label: "Behaviours"},
    {id: "combos", label: "Combos"},
    {id: "macros", label: "Macros"},
    {id: "pointing", label: "Trackball modes"},
];

export function bench() {
    const model = getModel();
    const layer = currentLayer();
    /** @type {Record<string, string>} */
    const counts = {
        key: String(mappedKeyCount(layer)),
        behaviours: String((({here, combos}) => new Set([...here, ...combos.map((entry) => entry.row)]).size)(behaviourGroups(model, layers(), state.layer))),
        combos: String(comboGroups(model, layers(), state.layer).onKeys.length),
        macros: String(storedCount(macroReach(model, layers(), state.layer))),
        pointing: String(storedCount(pointingReach(model, layers(), state.layer))),
    };
    // A tab whose list holds something the draft changed says so.
    const marks = draftMarks(model?.draft?.changes);
    /** @type {Record<string, boolean>} */
    const drafted = {key: Boolean(marks.keys.get(currentLayer()?.index)?.has(state.selected)), behaviours: marks.behaviours.size > 0,
        combos: marks.combos.size > 0, macros: marks.macros.size > 0, pointing: marks.pointing.size > 0};
    const node = el(`<div class="card bench">
        <div class="bench-tabs"><div class="bench-tablist" role="tablist">
            ${TABS.map((tab) => `<button role="tab" data-tab="${tab.id}" aria-selected="${state.tab === tab.id}">
                <span class="tab-label">${tab.label}</span><span class="c">${esc(counts[tab.id])}</span>${drafted[tab.id] ? draftDot() : ""}</button>`).join("")}</div>
            <span class="bench-right" id="benchRight"></span>
        </div>
        <div class="bench-body" id="benchBody"></div>
    </div>`);
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-tab]")).forEach((button) => button.addEventListener("click", () => {
        state.tab = button.dataset.tab || "key";
        if (state.tab === "behaviours") selectBehaviourKey(behaviourKey(selectedPosition()?.layoutIndex).keycode);
        state.cell = null;
        render();
    }));
    keepInView(/** @type {HTMLElement} */ (node.querySelector(".bench-tablist")));
    const body = /** @type {HTMLElement} */ (node.querySelector("#benchBody")), right = /** @type {HTMLElement} */ (node.querySelector("#benchRight"));
    const tabs = /** @type {Record<string, (body: HTMLElement, right: HTMLElement) => void>} */ ({key: tabKey, behaviours: tabBehaviours, combos: tabCombos, macros: tabMacros, pointing: tabPointing});
    (tabs[state.tab] || tabKey)(body, right);
    return node;
}
