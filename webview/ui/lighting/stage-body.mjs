// @ts-check
import {el} from "../../lib/dom.mjs";
import {getModel, state} from "../../store.mjs";
import {stageBase} from "./base.mjs";
import {stageLayers} from "./layers.mjs";
import {stageAuto} from "./auto.mjs";
import {stagePointing} from "./pd.mjs";
import {stageCombo} from "./combo.mjs";
import {stageKey} from "./key.mjs";
import {stageGroups} from "./groups.mjs";

// The bench chooses one surface; each stage owns its controls and listeners.
/** @type {Readonly<Record<string, (model: import("../../../contracts/panel.js").PublishedModel) => HTMLElement>>} */
const STAGES = Object.freeze({base: stageBase, layers: stageLayers, auto: stageAuto, pd: stagePointing, combo: stageCombo, key: stageKey, groups: stageGroups});

/** @param {HTMLElement} body */
export function stageBody(body) {
    const model = getModel();
    if (!model) return;
    const surface = Object.hasOwn(STAGES, state.stage) ? STAGES[state.stage] : undefined;
    body.replaceChildren(surface?.(model) ?? el(`<div></div>`));
}
