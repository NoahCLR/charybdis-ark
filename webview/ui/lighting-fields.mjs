// @ts-check
import {el, esc} from "../lib/dom.mjs";
import {lightingParameterChoices} from "../view/lighting-rules.mjs";
import {vocabulary} from "../view/vocabulary.mjs";
/** @typedef {import('../../contracts/panel.js').PublishedModel} Model */
/** @param {string} identity @param {string} title @param {[number, string][]} options @param {number} value @param {boolean} editable @param {(n: number) => void} change */
export function lightingSelect(identity, title, options, value, editable, change) {
    const choices = options.some(([n]) => n === value) ? options : [...options, [value, `Stored value ${value}`]];
    const field = el(`<label class="field"><span>${esc(title)}</span><select class="input" data-f="${esc(identity)}" ${editable ? "" : "disabled"}>${choices.map(([n, label]) => `<option value="${n}" ${n === value ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>`);
    field.querySelector("select")?.addEventListener("change", e => change(Number(/** @type {HTMLSelectElement} */ (e.target).value)));return field;
}
/** @param {Model} model @param {string} identity @param {string} registry @param {import('../../contracts/lighting.js').LightingPart} part @param {boolean} editable @param {(params: number[]) => void} change @param {boolean} [specific] */
export function lightingParams(model, identity, registry, part, editable, change, specific = false) {
    const node = el('<div class="lighting-parameters"></div>'), descriptor = model.rgb.lighting?.descriptors[registry]?.[part.kind], words = vocabulary(model).lighting;
    descriptor?.parameters.forEach((type, index) => {
        let thing = descriptor.thing;
        if (part.slot === 2 && part.kind === 8 && type === "thing") thing = ({10: 1, 11: 2, 12: 5, 14: 4, 15: 3})[part.params[0]];
        const effectiveType = type === "thing" && thing === 1 ? "layer" : type === "thing" && thing === 2 ? "mode" : type;
        node.append(lightingSelect(`${identity}:${index}`, type === "thing" && thing ? words.things[thing] : words.parameters[type] || type, lightingParameterChoices(model, effectiveType, thing).filter(([n]) => !specific || n !== 255), part.params[index], editable, n => {const p = [...part.params];p[index] = n;change(p);}));
    });return node;
}
