// @ts-check
import {el, esc} from "../lib/dom.mjs";
import {getModel, render, state, openComboBuilder} from "../store.mjs";
import {lightingLooks, replayLighting} from "../view/lighting-understanding.mjs";
import {lightingSelect} from "./lighting-fields.mjs";
import {lightingBoard} from "./lighting-board.mjs";
import {loadLightingHistory} from "./lighting-situation.mjs";
let layer = 0;
export function lightingOverview() {
    const model = getModel(), lighting = model?.rgb.lighting, node = el('<section class="card" aria-label="Lighting overview"><div class="card-h"><h3>Compare looks</h3></div><div class="card-b stack gap-12"></div></section>'), body = /** @type {HTMLElement} */ (node.querySelector(".card-b"));
    if (!model || !lighting) return node;
    body.append(el('<p class="note">Isolated local situations at 0 ms, before delayed rules mature. These are synthetic looks, not keyboard telemetry. Native queries use the named layer without resolving transparent keys. Held examples do not prove the gesture can occur.</p>'));
    body.append(lightingSelect("overview:layer", "Shown layer for modes and combos", model.layers.map(l => [l.index, l.displayName || l.name]), layer, true, n => {layer = n;render();}));
    const grid = el('<div class="lighting-overview-grid"></div>');body.append(grid);
    for (const look of lightingLooks(model, layer)) {
        const tile = el(`<article class="lighting-look" data-look="${look.kind}:${look.id}"><h4>${esc(look.title)}</h4><p class="note">${esc(look.note)}</p><div class="look-board"></div><div class="row"><button class="btn tiny" data-open-owner>Open editor</button><button class="btn tiny" data-inspect-look ${look.available ? "" : "disabled"}>Inspect look</button></div></article>`);
        if (look.available) {
            try {tile.querySelector(".look-board")?.append(lightingBoard(replayLighting(lighting.program, [{situation: look.situation}], model.behaviorEditing.maxTapStepsPerBehavior).frame, `look-${look.kind}-${look.id}`));}
            catch (e) {tile.querySelector(".look-board")?.append(el(`<p class="callout">Incomplete: ${esc(/** @type {Error} */ (e).message)}</p>`));}
        } else tile.querySelector(".look-board")?.append(el('<p class="note">No active look: empty, disabled or unsupported. No subject is invented.</p>'));
        tile.querySelector("[data-open-owner]")?.addEventListener("click", () => {
            state.screen = "keys";
            if (look.kind === 1) {state.layer = look.id;state.tab = "key";}
            else if (look.kind === 2) {state.screen = "pointing";state.layer = layer;state.pdSlot = look.id;state.pdKind = null;state.pdButtons = null;state.pdTaps = null;}
            else {state.layer = layer;state.tab = "combos";openComboBuilder(model.combos[look.id], model.comboReadback.defaultTermMs ?? 0);}
            render();
        });
        tile.querySelector("[data-inspect-look]")?.addEventListener("click", () => {loadLightingHistory([{situation: look.situation}]);render();document.querySelector(".lighting-inspector")?.scrollIntoView({block: "start"});});grid.append(tile);
    }
    return node;
}
