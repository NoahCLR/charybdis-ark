// @ts-check
// Selector assertions refer to elements created by this module's authored markup.
import {DISCLOSURE, el, esc} from "../lib/dom.mjs";
import {foldOpen, panelDisclosure} from "./disclosure.mjs";
import {getModel} from "../store.mjs";
import {layerSwitchGrid, switchedLayers} from "./layer-switches.mjs";
import {ALL_LAYERS} from "../view/layout.mjs";
import {vocabulary} from "../view/vocabulary.mjs";

// Definition switches preserve all actions and timing while disabled. A
// behaviour or a combo is named as itself, and the layers its keys may come
// from open in a panel under Layers it runs on, drawn as Settings draws its
// layer switches: each layer by its name and mark (layer-switches.mjs). The
// panel opens and closes as every panel disclosure does (panelDisclosure),
// staying open across renders, so switching a layer, which redraws the
// editor, keeps it open; the grid is built either way, so the mask reads the
// same closed.
const PLACE = "definition:layers";
/** @param {{index: number, label?: string, name: string}[]} layers @param {{enabled?: boolean, allowedLayers?: number}} definition @param {boolean} editable @param {(patch: {enabled: boolean, allowedLayers: number}) => void} changed @param {string} identity @param {"behaviour" | "combo"} noun */
export function definitionControls(layers, definition, editable, changed, identity, noun) {
    const words = vocabulary(getModel()).definitionFields;
    const open = foldOpen(PLACE);
    // Two controls, no box of their own: they sit in the row their editor
    // lays them in (display: contents).
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
    const grid = layerSwitchGrid(getModel(), words.allowedLayers, layers.map(layer => ({layer: layer.index, label: layer.label || layer.name,
        f: `${identity}:allowed-layer:${layer.index}`, checked: Boolean(allowed & 2 ** layer.index), disabled: !editable})),
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
