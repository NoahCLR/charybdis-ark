import {el, esc} from "../lib/dom.mjs";

// Definition switches preserve all actions and timing while disabled.
export function definitionControls(layers, definition, editable, changed) {
    const node = el(`<div class="stack" style="gap:10px">
        <label class="sw"><input type="checkbox" data-definition-enabled ${definition.enabled !== false ? "checked" : ""} ${editable ? "" : "disabled"}>
            <span class="track"></span><span class="txt">Definition enabled</span></label>
        <details><summary class="note">Allowed source layers</summary><div class="row" style="gap:12px;flex-wrap:wrap;margin-top:10px">
            ${layers.map(layer => `<label class="sw"><input type="checkbox" data-allowed-layer="${layer.index}" ${(definition.allowedLayers ?? 0xffff) & 2 ** layer.index ? "checked" : ""} ${editable ? "" : "disabled"}>
                <span class="track"></span><span class="txt">${esc(layer.label || layer.name)}</span></label>`).join("")}
        </div></details>
        <p class="note">Every applicable switch must be on. Master and source-layer switches are in Settings. Disabling keeps the definition and its timing.</p>
    </div>`);
    node.querySelectorAll("input").forEach(input => input.addEventListener("change", () => changed({
        enabled: node.querySelector("[data-definition-enabled]").checked,
        allowedLayers: [...node.querySelectorAll("[data-allowed-layer]")].reduce((mask, field) => mask + (field.checked ? 2 ** Number(field.dataset.allowedLayer) : 0), 0),
    })));
    return node;
}
