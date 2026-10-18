// @ts-check
// Where a mode is reached and how it lights. Reached counts every way the
// keyboard runs the mode: its keys on layers, behaviours that hold or tap
// it, and combos that send it (view/reach.mjs, bindingsForSlot), so a mode
// reached only through a behaviour never reads as not placed.
import {el, esc} from "../../lib/dom.mjs";
import {bindingsForSlot} from "../../view/reach.mjs";
import {reachLine} from "../../view/trackball.mjs";
import {stageEnabled} from "../../view/lighting.mjs";
import {vocabulary, word} from "../../view/vocabulary.mjs";
import {render, state} from "../../store.mjs";
import {slotLight} from "../marks.mjs";
import {bindingName} from "./common.mjs";
import {keycodeAside} from "../../view/show-keycodes.mjs";

/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../surface-types.js").PresentedSlot} slot @param {boolean} canEdit */
export function slotReach(model, slot, canEdit) {
    const light = slotLight(model, slot);
    const disabled = canEdit ? "" : "disabled";
    const {row} = light;
    // The swatch shows the colour; the words say where it paints.
    const lightText = row
        ? `${esc(light.lit || !stageEnabled(model, "pd") ? word(vocabulary(model).localities, row.locality) : "No colour")}${stageEnabled(model, "pd") ? "" : " · stage off"}`
        : "No colour reported";
    const bindings = bindingsForSlot(model, slot);
    const codes = [bindingName(slot), slot.binding?.lock || ""].map((code) => keycodeAside(state, "reachRow", code)).filter(Boolean);
    const reach = el(`<div class="card">
        <div class="card-h"><h3>Where it is reached</h3></div>
        <div class="card-b pd-lines">
            <span class="lbl">Reached</span>
            <div class="val"><span>${esc(reachLine(bindings))}</span>
                ${codes.length ? `<code class="dim kc-aside">${esc(codes.join(" · "))}</code>` : ""}
                <span class="note">Hold its key to run it, or lock it on.</span></div>
            <button class="btn compact" data-act="place" ${disabled}>Place on a key…</button>
            <span class="lbl">Light</span>
            <div class="val">${light.swatch()}<span class="note">${lightText}</span></div>
            <button class="btn text" data-act="lighting">Edit in Lighting →</button>
        </div></div>`);
    /** @type {HTMLButtonElement} */ (reach.querySelector('[data-act="lighting"]')).addEventListener("click", () => {
        state.screen = "lighting"; state.stage = "pd"; render();
    });
    /** @type {HTMLButtonElement} */ (reach.querySelector('[data-act="place"]')).addEventListener("click", () => {
        state.placement = {keycode: bindingName(slot)};
        state.screen = "keys";
        state.tab = "key";
        render();
    });
    return reach;
}
