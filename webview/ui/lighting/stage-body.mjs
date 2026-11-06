// @ts-check
import {el} from "../../lib/dom.mjs";
import {getModel, state} from "../../store.mjs";
import {benchHeightWith} from "../../lib/scroll.mjs";
import {stageBase} from "./base.mjs";
import {stageLayers} from "./layers.mjs";
import {stageAuto} from "./auto.mjs";
import {stagePointing} from "./pd.mjs";
import {stageCombo} from "./combo.mjs";
import {stageKey} from "./key.mjs";
import {accentsOverview} from "./accents.mjs";

// The bench chooses one surface; each stage owns its controls and listeners.
/** @type {Readonly<Record<string, (model: import("../../../contracts/panel.js").PublishedModel) => HTMLElement>>} */
const STAGES = Object.freeze({base: stageBase, layers: stageLayers, auto: stageAuto, pd: stagePointing, combo: stageCombo, key: stageKey, accents: accentsOverview});

// The tallest stage with a list beside its editor sets Lighting's workbench
// height for every tab, so switching stages never changes how tall the list
// is, as the Keys workbench takes the Behaviours tab's (ui/keys/bench.mjs):
// once the screen is on the page, the workbench takes its height with each
// such stage in turn (benchHeightWith) and keeps the tallest. A stage's
// height holds until the model, the width or what the stages show from the
// panel's state changes, so a render that changes none of them lays out no
// stage unseen.
const LISTED = Object.freeze(["layers", "pd", "combo", "key"]);
/** @param {HTMLElement} surface */
const holding = (surface) => { const box = el(`<div></div>`); box.appendChild(surface); return box; };
/** @type {{model: object | null, key: string, heights: Map<string, number>}} */
let measured = {model: null, key: "", heights: new Map()};
/** @param {ParentNode} root */
export function matchTallestStageHeight(root) {
    const bench = /** @type {HTMLElement | null} */ (root.querySelector(".lighting-bench"));
    const model = getModel();
    if (!bench || !model) return;
    const {accent, allSlotsShown, comboPreview, emptyLayersShown, feedbackRow, layer, layersOn, lightingGroupsShut, pointingSlot} = state;
    const key = JSON.stringify([bench.clientWidth, accent, allSlotsShown, comboPreview, emptyLayersShown, feedbackRow, layer, layersOn, lightingGroupsShut, pointingSlot]);
    if (measured.model !== model || measured.key !== key) measured = {model, key, heights: new Map()};
    let tallest = bench.getBoundingClientRect().height;
    for (const stage of LISTED) {
        if (stage === state.stage) continue;
        const height = measured.heights.get(stage) ?? benchHeightWith(bench, holding(STAGES[stage](model)));
        measured.heights.set(stage, height);
        tallest = Math.max(tallest, height);
    }
    bench.style.minHeight = `${tallest}px`;
}

/** @param {HTMLElement} body */
export function stageBody(body) {
    const model = getModel();
    if (!model) return;
    const surface = Object.hasOwn(STAGES, state.stage) ? STAGES[state.stage] : undefined;
    body.replaceChildren(surface?.(model) ?? el(`<div></div>`));
}
