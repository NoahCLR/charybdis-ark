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
import {getModel, canEdit as canEditArea} from "../store.mjs";
import {topbar, unavailable} from "./shell.mjs";
import {sectionCard, sectionsIn} from "./settings.mjs";

export function screenMouse() {
    const model = getModel();
    const sections = sectionsIn(model, "Trackball");
    const canEdit = canEditArea("settings");
    const main = el(`<div class="main">${topbar(
        "Trackball",
        "How the trackball moves the pointer: its speed, sniping (a slower speed for precise work), and the mouse layer that moving the ball turns on."
    )}</div>`);

    const content = el(`<div class="content"><div class="pad settings-pad"></div></div>`);
    const pad = /** @type {HTMLElement} */ (content.firstElementChild);
    if (!sections.length) {
        pad.appendChild(el(`<div class="screen-stub"><h3>No trackball settings read</h3>
            <p class="note">${esc(unavailable(model) || "Choose Read keyboard to load this keyboard's pointer settings.")}</p></div>`));
    } else if (!canEdit) {
        pad.appendChild(el(`<div class="unavailable">${esc(unavailable(model)
            || "These settings cannot be edited right now.")}</div>`));
    }
    for (const section of sections) if (section.fields.length) pad.appendChild(sectionCard(model, section, section.fields, canEdit));
    main.appendChild(content);
    return main;
}
