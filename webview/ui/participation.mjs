// @ts-check
// Selector assertions refer to elements created by this module's authored markup.
import {el, esc} from "../lib/dom.mjs";

// Definition switches preserve all actions and timing while disabled.
/** @param {{index: number, label?: string, name: string}[]} layers @param {{enabled?: boolean, allowedLayers?: number}} definition @param {boolean} editable @param {(patch: {enabled: boolean, allowedLayers: number}) => void} changed */
export function definitionControls(layers, definition, editable, changed) {
    const node = el(`<div class="stack gap-10">
        <label class="sw"><input type="checkbox" data-definition-enabled ${definition.enabled !== false ? "checked" : ""} ${editable ? "" : "disabled"}>
            <span class="track"></span><span class="txt">Definition enabled</span></label>
        <details><summary class="note">Allowed source layers</summary><div class="row sw-group">
            ${layers.map(layer => `<label class="sw"><input type="checkbox" data-allowed-layer="${layer.index}" ${(definition.allowedLayers ?? 0xffff) & 2 ** layer.index ? "checked" : ""} ${editable ? "" : "disabled"}>
                <span class="track"></span><span class="txt">${esc(layer.label || layer.name)}</span></label>`).join("")}
        </div></details>
        <p class="note">Every applicable switch must be on. Master and source-layer switches are in Settings. Disabling keeps the definition and its timing.</p>
    </div>`);
    /** @type {NodeListOf<HTMLInputElement>} */ (node.querySelectorAll("input")).forEach(input => input.addEventListener("change", () => changed({
        enabled: /** @type {HTMLInputElement} */ (node.querySelector("[data-definition-enabled]")).checked,
        allowedLayers: [.../** @type {NodeListOf<HTMLInputElement>} */ (node.querySelectorAll("[data-allowed-layer]"))].reduce((mask, field) => mask + (field.checked ? 2 ** Number(field.dataset.allowedLayer) : 0), 0),
    })));
    return node;
}
