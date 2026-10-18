// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {currentLayer, getModel, state} from "../../store.mjs";
import {vocabulary, word} from "../../view/vocabulary.mjs";
import {colourEditor} from "../colour-editor.mjs";
import {colourPresets} from "../../view/lighting.mjs";

/** @param {string} title @param {string} [extra] */
export const section = (title, extra = "") => el(`<section><div class="sect-h"><h4>${esc(title)}</h4>${extra}</div></section>`);

/** @param {...Node} nodes */
export function stack(...nodes) {
    const box = el(`<div class="stack gap-12"></div>`);
    box.append(...nodes);
    return box;
}

/** @param {string | undefined} value */
export const localityLabel = value => word(vocabulary(getModel()).localities, value);

// Keep each colour editor's identity tied to the same stored owner as before.
/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {Omit<Parameters<typeof colourEditor>[0], "identity">} options */
export function colourControl(model, options) {
    return colourEditor({identity: `lighting:${state.stage}:${state.stage === "layers" ? currentLayer()?.index : state.stage === "pd" ? state.pdSlot : state.stage === "key" ? state.feedbackRow : "stage"}`,
        maximumBrightness: model.rgb.maximumBrightness, presets: colourPresets(model), ...options});
}
