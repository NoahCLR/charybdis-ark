// @ts-check
// Mouse: how the trackball moves the pointer — its speed, sniping, and the
// layer movement turns on by itself.
//
// These are settings the keyboard stores with its global policy, so they are
// drawn by the Settings cards and saved a section at a time, exactly as
// Settings saves its own. The keyboard's model says which sections are Mouse
// ones; this screen adds none of its own. Pointing modes, which re-read the
// trackball as scrolling or keys, keep their own screen.

// Selector assertions refer to elements created by this module's authored markup.
import {el, esc} from "../lib/dom.mjs";
import {getModel, render, state, canEdit as canEditArea} from "../store.mjs";
import {actionLabel} from "../view/keyface.mjs";
import {keycodePlacements, reachLine} from "../view/placements.mjs";
import {topbar, unavailable} from "./shell.mjs";
import {sectionCard, sectionsIn} from "./settings.mjs";

export function screenMouse() {
    const model = getModel();
    const sections = sectionsIn(model, "Mouse");
    const canEdit = canEditArea("settings");
    const main = el(`<div class="main">${topbar(
        "Mouse",
        "How the trackball moves the pointer: its speed, sniping (a slower speed for precise work), and the mouse layer that moving the ball turns on."
    )}</div>`);

    const content = el(`<div class="content"><div class="pad settings-pad"></div></div>`);
    const pad = /** @type {HTMLElement} */ (content.firstElementChild);
    if (!sections.length) {
        pad.appendChild(el(`<div class="screen-stub"><h3>No mouse settings read</h3>
            <p class="note">${esc(unavailable(model) || "Choose Read keyboard to load this keyboard's pointer settings.")}</p></div>`));
    } else if (!canEdit && !model?.draft?.busy) {
        pad.appendChild(el(`<div class="unavailable">${esc(unavailable(model)
            || "These settings cannot be edited right now.")}</div>`));
    }
    for (const section of sections) {
        if (!section.fields.length) continue;
        const card = sectionCard(model, section, section.fields, canEdit);
        if (section.id === "sniping") card.appendChild(snipingKeys(model, canEdit));
        pad.appendChild(card);
    }
    main.appendChild(content);
    return main;
}

// Sniping is on while a sniping key is held or toggled, and while the
// auto-sniping layer is on; this says where those keys are, places one, and
// says what sniping slows.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {boolean} canEdit */
function snipingKeys(model, canEdit) {
    const node = el(`<div class="card-b sniping-keys">
        <div class="sect-h"><h4>Sniping keys</h4></div>
        <p class="note">Sniping is on while one of these keys is held or toggled, and while the auto-sniping layer is on.</p></div>`);
    for (const keycode of ["SNIPING", "SNP_TOG"]) {
        const words = actionLabel(model, keycode);
        const row = el(`<div class="row gap-10 sniping-key">
            <span class="sniping-name">${esc(words)}</span>
            <span class="note">${esc(reachLine(keycodePlacements(model, [keycode])))}</span>
            <button class="btn tiny right" data-place="${esc(keycode)}" ${canEdit ? "" : "disabled"}>Place on a key…</button></div>`);
        /** @type {HTMLButtonElement} */ (row.querySelector("[data-place]")).addEventListener("click", () => {
            state.placement = {keycode};
            state.screen = "keys";
            state.tab = "key";
            render();
        });
        node.appendChild(row);
    }
    node.appendChild(el(`<p class="note">Sniping also slows directional pointing modes; scrolling modes ignore it. Sniping DPI keys on the keyboard change its speed too.</p>`));
    return node;
}
