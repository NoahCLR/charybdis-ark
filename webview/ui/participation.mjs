// @ts-check
// Selector assertions refer to elements created by this module's authored markup.
import {DISCLOSURE, el, esc} from "../lib/dom.mjs";

// Definition switches preserve all actions and timing while disabled. A
// behaviour or a combo is named as itself, and the layers it may run on are
// the layers its keys come from.
/** @param {{index: number, label?: string, name: string}[]} layers @param {{enabled?: boolean, allowedLayers?: number}} definition @param {boolean} editable @param {(patch: {enabled: boolean, allowedLayers: number}) => void} changed @param {string} identity @param {"behaviour" | "combo"} noun */
export function definitionControls(layers, definition, editable, changed, identity, noun) {
    const node = el(`<div class="stack gap-10">
        <label class="sw" data-tip="Off, this ${noun} keeps its actions and timing but does nothing until it is on again."><input type="checkbox" data-f="${esc(identity)}:enabled" data-definition-enabled ${definition.enabled !== false ? "checked" : ""} ${editable ? "" : "disabled"}>
            <span class="track"></span><span class="txt">Use this ${noun}</span></label>
        <details class="def-layers"><summary class="note" data-tip="The layers a key can come from for this ${noun} to run.">${DISCLOSURE}Layers it runs on</summary><div class="row sw-group">
            ${layers.map(layer => `<label class="sw"><input type="checkbox" data-f="${esc(identity)}:allowed-layer:${layer.index}" data-allowed-layer="${layer.index}" ${(definition.allowedLayers ?? 0xffff) & 2 ** layer.index ? "checked" : ""} ${editable ? "" : "disabled"}>
                <span class="track"></span><span class="txt">${esc(layer.label || layer.name)}</span></label>`).join("")}
        </div></details>
        <p class="note">It runs only where Settings and the key's own switch allow it too.</p>
    </div>`);
    /** @type {NodeListOf<HTMLInputElement>} */ (node.querySelectorAll("input")).forEach(input => input.addEventListener("change", () => changed({
        enabled: /** @type {HTMLInputElement} */ (node.querySelector("[data-definition-enabled]")).checked,
        allowedLayers: [.../** @type {NodeListOf<HTMLInputElement>} */ (node.querySelectorAll("[data-allowed-layer]"))].reduce((mask, field) => mask + (field.checked ? 2 ** Number(field.dataset.allowedLayer) : 0), 0),
    })));
    return node;
}
