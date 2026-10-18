// @ts-check
// One colour control, used by every stage that stores a colour.
//
// It never mutates anything: it reports the HSV the person chose, and the
// screen posts the edit the keyboard understands. What is drawn is whatever
// came back in the model, so the board and this control cannot disagree.

// Selector assertions refer to elements created by this module's authored markup.
import {brightnessLimit, clampHsv, css, hsv, label as hsvLabel, rgb, valuePercent} from "../lib/colour.mjs";
import {inheritsStageColour} from "../view/lighting.mjs";
import {el, esc} from "../lib/dom.mjs";

// A layer colour of HSV(0, 0, 0) is off: the base effect shows through. On
// every other stage the same value paints black (B17), so there the button is
// Black and `black` says what goes dark.
/** @param {{identity: string, colour: import("../../contracts/edits.js").Colour | null | undefined, title: string, canEdit?: boolean, onChange?: (colour: import("../../contracts/edits.js").Colour) => void, offNote?: string, black?: string, maximumBrightness?: number}} options */
export function colourEditor({identity, colour, title, canEdit = true, onChange, offNote, black, maximumBrightness}) {
    const [h, s, v] = hsv(colour);
    const maximum = brightnessLimit(maximumBrightness);
    const node = el(`<div class="stack gap-12"></div>`);
    /** @param {number[]} next */
    const commit = (next) => onChange?.(clampHsv(next, maximum));

    if (inheritsStageColour(colour)) {
        node.append(el(`<div class="row colour-head"><span class="swatch-lg swatch-off"></span>
            <div><div class="colour-title">${esc(title)}</div><div class="note mono">${esc(hsvLabel(colour))}</div></div></div>`));
        node.append(el(`<div class="callout">${esc(black ? `Black. ${black}` : offNote || "This colour has zero brightness.")}</div>`));
        if (canEdit) {
            const give = el(`<button class="btn self-start">Give it a colour</button>`);
            give.addEventListener("click", () => commit([140, 255, Math.min(200, maximum)]));
            node.append(give);
        }
        return node;
    }

    const head = el(`<div class="row colour-head">
        <span class="swatch-lg" style="background:${css(colour)}"></span>
        <div><div class="colour-title">${esc(title)}</div>
            <div class="note mono">${esc(hsvLabel(colour))} · rgb(${rgb(colour).join(", ")})</div></div>
        ${canEdit ? `<button class="btn tiny ghost" data-off
            data-tip="${esc(black ? `Store black, HSV(0, 0, 0). ${black}` : "Store HSV(0, 0, 0) so this layer stops painting and lets what is underneath show.")}">${black ? "Black" : "Turn off"}</button>` : ""}</div>`);
    node.append(head);
    if (v === 0) node.append(el(`<p class="note">Brightness is zero. Hue and saturation are retained; raise brightness to use this colour again.</p>`));
    /** @type {HTMLElement | null} */ (head.querySelector("[data-off]"))?.addEventListener("click", () => commit([0, 0, 0]));

    const topWhite = css({h: "0", s: "0", v: String(maximum)});
    const topHue = css({h: String(h), s: "255", v: String(maximum)});
    const field = el(`<div class="sv-field" data-tip="Brightness is limited to ${maximum}, as reported by this keyboard."
        style="background:linear-gradient(to top, ${css({h: "0", s: "0", v: "0"})}, transparent), linear-gradient(to right, ${topWhite}, ${topHue})">
        <span class="thumb" style="left:${(s / 255) * 100}%;top:${100 - valuePercent(v, maximum)}%"></span></div>`);
    node.append(field);

    const ramp = el(`<div class="swatch-pick"><span class="label">Hue</span>
        <span class="hue-ramp"><span class="thumb" style="left:${(h / 255) * 100}%"></span></span></div>`);
    node.append(ramp);

    const fields = el(`<div class="grid3">
        ${[["H", h, 255], ["S", s, 255], [`V · max ${maximum}`, v, maximum]].map(([name, value, max], index) =>
            `<label class="field"><span>${name}</span><input type="number" min="0" max="${max}" step="1" class="input mono" value="${value}" data-f="${esc(identity)}:colour:${index}" data-channel="${index}" ${canEdit ? "" : "disabled"}></label>`).join("")}</div>`);
    /** @type {NodeListOf<HTMLInputElement>} */ (fields.querySelectorAll("[data-channel]")).forEach((input) => input.addEventListener("change", () => {
        const next = [h, s, v];
        next[Number(input.dataset.channel)] = Number(input.value) || 0;
        commit(next);
    }));
    node.append(fields);

    // Dragging previews locally and commits once on release: every commit
    // round-trips through the model and redraws this control, which would
    // drop the pointer mid-drag.
    if (canEdit) {
        const hueRamp = /** @type {HTMLElement} */ (ramp.querySelector(".hue-ramp"));
        let draft = [h, s, v];
        /** @param {number[]} next */
        const preview = (next) => {
            draft = next.map(Math.round);
            const [dh, ds, dv] = draft;
            const shown = {h: String(dh), s: String(ds), v: String(dv)};
            /** @type {HTMLElement} */ (head.querySelector(".swatch-lg")).style.background = css(shown);
            /** @type {HTMLElement} */ (head.querySelector(".note")).textContent = `${hsvLabel(shown)} · rgb(${rgb(shown).join(", ")})`;
            field.style.background = `linear-gradient(to top, ${css({h: "0", s: "0", v: "0"})}, transparent), linear-gradient(to right, ${topWhite}, ${css({h: String(dh), s: "255", v: String(maximum)})})`;
            /** @type {HTMLElement} */ (field.querySelector(".thumb")).style.left = `${(ds / 255) * 100}%`;
            /** @type {HTMLElement} */ (field.querySelector(".thumb")).style.top = `${100 - valuePercent(dv, maximum)}%`;
            /** @type {HTMLElement} */ (hueRamp.querySelector(".thumb")).style.left = `${(dh / 255) * 100}%`;
            /** @type {NodeListOf<HTMLInputElement>} */ (fields.querySelectorAll("[data-channel]")).forEach((input) => { input.value = String(draft[Number(input.dataset.channel)]); });
        };
        /** @param {number} value */
        const unit = (value) => Math.max(0, Math.min(1, value));
        dragSurface(field, (x, y) => preview([draft[0], x * 255, (1 - y) * maximum]), () => commit(draft));
        dragSurface(hueRamp, (x) => preview([x * 255, draft[1], draft[2]]), () => commit(draft));

        /** @param {HTMLElement} surface @param {(x: number, y: number) => void} move @param {() => void} done */
        function dragSurface(surface, move, done) {
            /** @param {PointerEvent} event */
            const at = (event) => {
                const rect = surface.getBoundingClientRect();
                move(unit((event.clientX - rect.left) / rect.width), unit((event.clientY - rect.top) / rect.height));
            };
            surface.addEventListener("pointerdown", (event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                surface.setPointerCapture?.(event.pointerId);
                surface.dataset.dragging = "1";
                at(event);
            });
            surface.addEventListener("pointermove", (event) => { if (surface.dataset.dragging) at(event); });
            /** @param {PointerEvent} event */
            const end = (event) => {
                if (!surface.dataset.dragging) return;
                delete surface.dataset.dragging;
                surface.releasePointerCapture?.(event.pointerId);
                done();
            };
            surface.addEventListener("pointerup", end);
            surface.addEventListener("pointercancel", end);
        }
    }
    return node;
}
