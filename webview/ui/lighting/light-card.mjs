// @ts-check
// The hover card on Lighting's board: what paints this LED now, rather than
// what the key does. It reads the same answer the board drew
// (view/lighting.mjs keyLight), so the two cannot disagree.

import {css, isOff, label as hsvLabel} from "../../lib/colour.mjs";
import {esc} from "../../lib/dom.mjs";
import {LED_INDEX} from "../../view/geometry.mjs";
import {allLightingOn, baseEffectName, keyLight, layerColourRow, ownLight, pdColourRow, pdTrigger, stageEnabled} from "../../view/lighting.mjs";
import {keyMeaning, keyName} from "../../view/keyface.mjs";
import {slotCalled, vocabulary, word} from "../../view/vocabulary.mjs";
import {currentLayer, getModel, heldLayers, layerName, layers, positionAt, state} from "../../store.mjs";
import {keyNameMarked, marked} from "../marks.mjs";

/** @param {number} index */
export function lightCard(index) {
    const model = getModel();
    const layer = currentLayer();
    const position = positionAt(layer, index);
    if (!model || !position) return "";
    const row = state.stage === "pd" && state.pdPreview && stageEnabled(model, "pd") ? pdColourRow(model, state.pdSlot) : null;
    const trigger = row ? pdTrigger(model, layer, state.pdSlot) : null;
    const preview = row ? {mode: row.pointingMode, color: row.color, locality: row.locality, triggerIndex: trigger?.layoutIndex} : null;
    const stack = layers();
    const held = heldLayers().map((at) => stack[at]?.index).filter((id) => id !== undefined);
    const light = keyLight(model, layer, position, {pdActive: preview, held});
    const swatch = isOff(light.colour) ? `<i class="mk-swatch swatch-off"></i>` : `<i class="mk-swatch" style="background:${css(light.colour)}"></i>`;
    const named = (/** @type {number | null | undefined} */ id) => {
        const at = stack.findIndex((entry) => entry.index === id);
        return at < 0 ? `Layer ${id}` : layerName(stack[at]);
    };
    /** @type {string[]} */
    const lines = [];
    if (allLightingOn(model) === false) lines.push("All lighting is off, so this LED is dark.");
    else if (light.source === "off") lines.push("Nothing paints this LED: no layer colour reaches it and the base effect leaves it dark.");
    else if (light.source === "base") lines.push(`The base effect: ${esc(baseEffectName(model) || "Solid colour")}.`);
    else if (light.source === "animated") lines.push(`The base effect, ${esc(baseEffectName(model) || "an animated effect")}: it animates, so the board draws a soft glow.`);
    else if (light.source === "pointing") lines.push(`${esc(slotCalled(model, state.pdSlot))} while it runs${light.row !== undefined && light.row !== null ? `, its LED row ${light.row + 1}` : ""}.`);
    else if (light.source === "layer") {
        const painter = light.layer ?? 0;
        const mode = layerColourRow(model, painter)?.mode;
        const name = marked(model, {kind: "layer", layer: painter}, named(painter));
        lines.push(light.row !== undefined && light.row !== null
            ? `${name}: a key with its own colour (row ${light.row + 1} of Keys with their own colour).`
            : `${name}'s colour, on ${esc(word(vocabulary(model).paintModes, mode).toLowerCase() || "its keys")}.`);
        if (!ownLight(light, layer?.index ?? 0)) lines.push(`Seen through from ${esc(named(painter))}: ${esc(layerName(layer))} paints nothing here.`);
    }
    return `<div class="hc-head"><div class="hc-title"><span class="t">${keyNameMarked(model, keyName(position), keyMeaning(position))}</span>
        <span class="hc-pill">LED ${esc(LED_INDEX[index] ?? "—")}</span></div></div>
        <div class="hc-sect"><div class="hc-sub">${swatch} <span class="mono">${esc(hsvLabel(light.colour))}</span></div>
        ${lines.map((line) => `<p class="hc-sub">${line}</p>`).join("")}</div>`;
}
