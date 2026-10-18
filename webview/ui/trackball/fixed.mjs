// @ts-check
// The Trackball screen's three fixed entries: Pointer, Sniping and Mouse
// layer. Each is one card of Settings' rows (settingRows), so a change saves
// its whole section as Settings does, with the facts a person meets on the
// first day said beside them: which modes follow the pointer speed, how
// sniping is switched on, and that typing ends the mouse layer.

// Selector assertions refer to elements created by this module's authored markup.
import {DISCLOSURE, el, esc} from "../../lib/dom.mjs";
import {actionLabel} from "../../view/keyface.mjs";
import {countsToMm, followsNormal, keycodePlacements, normalDpi, reachLine, settingValue} from "../../view/trackball.mjs";
import {render, state, canEdit as canEditArea} from "../../store.mjs";
import {unavailable} from "../shell.mjs";
import {settingRows} from "../settings.mjs";
import {keycodeMark} from "../marks.mjs";

/** @typedef {import("../../../contracts/panel.js").PublishedModel} Model */
/** @typedef {"pointer" | "sniping" | "mouseLayer"} FixedId */

/** @type {readonly {id: FixedId, label: string, sections: string[]}[]} */
export const FIXED_ENTRIES = Object.freeze([
    {id: "pointer", label: "Pointer", sections: ["normalPointerSpeed"]},
    {id: "sniping", label: "Sniping", sections: ["normalPointerSpeed", "sniping"]},
    {id: "mouseLayer", label: "Mouse layer", sections: ["autoMouse"]},
]);

/** @param {Model | null} model @param {string} id */
const sectionOf = (model, id) => (model?.configDefaults || []).find((section) => section.id === id);

/** @param {Model} model @param {FixedId} id @param {import("../surface-types.js").PresentedSlot[]} slots */
export function fixedEntry(model, id, slots) {
    const canEdit = canEditArea("settings");
    const wrap = el(`<div class="tb-editor stack"></div>`);
    const missing = FIXED_ENTRIES.find((entry) => entry.id === id)?.sections.filter((section) => !sectionOf(model, section)) || [];
    if (missing.length) {
        wrap.append(el(`<div class="screen-stub"><h3>Not read from this keyboard</h3>
            <p class="note">${esc(unavailable(model) || "Choose Read keyboard to load this keyboard's trackball settings.")}</p></div>`));
        return wrap;
    }
    if (!canEdit) wrap.append(el(`<div class="unavailable">${esc(unavailable(model) || "These settings cannot be edited right now.")}</div>`));
    /** @param {string} section @param {string[]} macros */
    const rows = (section, macros) => settingRows(model, /** @type {import("../../../contracts/panel.js").PresentedSection} */ (sectionOf(model, section)), macros, canEdit);
    if (id === "pointer") wrap.append(pointer(model, slots, rows));
    else if (id === "sniping") wrap.append(sniping(model, rows, canEdit));
    else wrap.append(mouseLayer(model, rows));
    return wrap;
}

/** @param {string} title @param {string} section @param {string} intro */
const card = (title, section, intro) => el(`<section class="card settings-group tb-panel" data-section="${esc(section)}">
    <div class="card-h"><h3>${esc(title)}</h3></div>
    <div class="card-b"><p class="note tb-intro">${esc(intro)}</p></div></section>`);

/** @param {Model} model @param {import("../surface-types.js").PresentedSlot[]} slots @param {(section: string, macros: string[]) => HTMLElement} rows */
function pointer(model, slots, rows) {
    const node = card("Pointer", "normalPointerSpeed", "How far the cursor moves for each turn of the ball. Higher DPI moves it farther.");
    node.append(rows("normalPointerSpeed", ["normalDpi"]));
    const following = followsNormal(slots);
    const keys = keycodePlacements(model, ["DPI_MOD", "DPI_RMOD"]);
    node.append(el(`<div class="card-b tb-facts">
        <p class="note">${following.length
            ? `Modes at Normal speed follow it: ${following.map((slot) => esc(slot.name)).join(", ")}.`
            : "Every mode sets its own speed, so none follows it."}</p>
        <p class="note">↺ DPI keys on the keyboard change this too${keys.keys.length ? ` (${esc(reachLine(keys))})` : ""}; Ark shows the speed the keyboard reports.</p>
    </div>`));
    return node;
}

/** @param {Model} model @param {(section: string, macros: string[]) => HTMLElement} rows @param {boolean} canEdit */
function sniping(model, rows, canEdit) {
    const node = card("Sniping (precision speed)", "sniping",
        "A slower ball speed for precise work. It is on while a sniping key is held or toggled, and while the auto-sniping layer is on.");
    node.append(rows("normalPointerSpeed", ["snipingDpi"]), rows("sniping", ["autoSniping", "snipingLayer"]));
    const keys = el(`<div class="card-b tb-keys"><div class="eyebrow">Sniping keys</div></div>`);
    for (const keycode of ["SNIPING", "SNP_TOG"]) {
        const words = actionLabel(model, keycode);
        const placed = reachLine(keycodePlacements(model, [keycode]));
        const row = el(`<div class="tb-key">
            <span class="tb-keyname">${esc(words)}${keycodeMark("reachRow", keycode, words)}</span>
            <span class="note">${esc(placed)}</span>
            <button class="btn compact" data-place="${esc(keycode)}" ${canEdit ? "" : "disabled"}>Place on a key…</button></div>`);
        /** @type {HTMLButtonElement} */ (row.querySelector("[data-place]")).addEventListener("click", () => {
            state.placement = {keycode};
            state.screen = "keys";
            state.tab = "key";
            render();
        });
        keys.append(row);
    }
    node.append(keys, el(`<div class="card-b tb-facts">
        <p class="note">Also slows directional modes; scrolling ignores it.</p>
        <p class="note">↺ Sniping DPI keys on the keyboard change its speed too.</p></div>`));
    return node;
}

/** @param {Model} model @param {(section: string, macros: string[]) => HTMLElement} rows */
function mouseLayer(model, rows) {
    const node = card("Mouse layer", "autoMouse", "Moving the ball turns a layer on, so its mouse buttons are under your fingers.");
    const on = settingValue(model, "autoMouse") !== false;
    const main = rows("autoMouse", ["autoMouse", "mouseLayer", "mouseTimeout"]);
    node.append(main, el(`<div class="card-b tb-facts">
        <p class="note">Turns off as soon as you type a key that is not a mouse key.</p>
        <p class="note">The auto-sniping layer keeps it off while that layer is on.</p></div>`));
    const fine = /** @type {HTMLDetailsElement} */ (el(`<details class="tb-fold" ${state.tbFineTuning ? "open" : ""}>
        <summary class="card-h">${DISCLOSURE}<h3>Fine-tuning</h3><span class="right note">debounce, delay after typing, threshold</span></summary></details>`));
    const tuning = rows("autoMouse", ["mouseDebounce", "mouseDelay", "mouseThreshold"]);
    // The threshold is counts at the current speed; say what that is in mm.
    const counts = settingValue(model, "mouseThreshold"), dpi = normalDpi(model), mm = countsToMm(Number(counts), dpi);
    const thresholdHint = tuning.querySelector('[data-macro="mouseThreshold"]')?.closest(".setrow")?.querySelector(".hint");
    if (thresholdHint && mm) thresholdHint.append(` ${counts} counts ≈ ${mm} mm at ${dpi} DPI.`);
    fine.append(tuning);
    fine.addEventListener("toggle", () => { state.tbFineTuning = fine.open; });
    node.append(fine);
    // Every field but the switch does nothing while the mouse layer is off.
    if (!on) {
        for (const row of [...main.querySelectorAll(".setrow"), ...tuning.querySelectorAll(".setrow")]) {
            if (row.querySelector('[data-macro="autoMouse"]')) continue;
            row.classList.add("inert");
            row.querySelector(".nm")?.append(el(`<span class="tb-off"> · off</span>`));
        }
    }
    const fade = el(`<div class="card-b"><button class="btn text" data-act="fade">Edit the fade in Lighting →</button></div>`);
    /** @type {HTMLButtonElement} */ (fade.querySelector("button")).addEventListener("click", () => { state.screen = "lighting"; state.stage = "auto"; render(); });
    node.append(fade);
    return node;
}
