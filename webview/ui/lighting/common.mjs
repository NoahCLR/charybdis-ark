// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {currentLayer, getModel, render, state} from "../../store.mjs";
import {vocabulary, word} from "../../view/vocabulary.mjs";
import {colourEditor} from "../colour-editor.mjs";

/** @param {string} title @param {string} [extra] */
export const section = (title, extra = "") => el(`<section><div class="sect-h"><h4>${esc(title)}</h4>${extra}</div></section>`);

// A group of a Lighting list folds as the Keymap's groups do, its open state
// kept by "stage:group" across renders (state.lightingGroupsShut).
/** @param {string} id @returns {{open: boolean, toggle: () => void}} */
export function lightingGroup(id) {
    const open = !state.lightingGroupsShut.includes(id);
    return {open, toggle: () => {
        state.lightingGroupsShut = open ? [...state.lightingGroupsShut, id] : state.lightingGroupsShut.filter((each) => each !== id);
        render();
    }};
}

// What a stage does, said the same way on every stage's tab: under its
// editors, across them, before its accents.
/** @param {string} text @param {...Node} more */
export function aboutStage(text, ...more) {
    const node = section("What this stage does");
    node.className = "span";
    node.append(el(`<p class="note stage-about">${esc(text)}</p>`), ...more);
    return node;
}

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
    return colourEditor({identity: `lighting:${state.stage}:${state.stage === "layers" ? currentLayer()?.index : state.stage === "pd" ? state.pointingSlot : state.stage === "key" ? state.feedbackRow : "stage"}`, maximumBrightness: model.rgb.maximumBrightness, ...options});
}
