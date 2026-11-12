// @ts-check
// One colour control, used by every stage that stores a colour.
//
// It never mutates anything: it reports the HSV the person chose, and the
// screen posts the edit the keyboard understands. What is drawn is whatever
// came back in the model, so the board and this control cannot disagree.

// Selector assertions refer to elements created by this module's authored markup.
import {brightnessLimit, clampHsv, css, hsv, label as hsvLabel, rgb, valuePercent} from "../lib/colour.mjs";
import {inheritsStageColour, isPassthrough} from "../view/lighting.mjs";
import {el, esc} from "../lib/dom.mjs";

// `offTip` offers Turn off, storing HSV(0, 0, 0), and says what that does in
// this stage (`offWording` in view/lighting.mjs); without it there is no Turn
// off, as for the background effect. A colour turned off reads "Off", never
// its stored numbers; the callout says what off means here. A colour an
// owner has (a layer's, a pointing slot's, combo feedback's or a feedback
// case's, D-L94) comes with `ledsOffTip`: there off is passthrough, at any hue
// with no saturation or brightness (firmware D-F74), `offAction` and
// `offWord` say so (Make passthrough, Passthrough), and an Off choice beside
// it stores brightness 0 with saturation, which `ledsOffNote` explains once
// stored. Otherwise the colour is off as HSV(0, 0, 0).
/** @param {{identity: string, colour: import("../../contracts/edits.js").Colour | null | undefined, title: string, canEdit?: boolean, onChange?: (colour: import("../../contracts/edits.js").Colour) => void, offNote?: string, offTip?: string, offAction?: string, offWord?: string, ledsOffTip?: string, ledsOffNote?: string, off?: boolean, maximumBrightness?: number}} options */
export function colourEditor({identity, colour, title, canEdit = true, onChange, offNote, offTip, offAction = "Turn off", offWord = "Off", ledsOffTip, ledsOffNote,
    off = ledsOffTip ? isPassthrough(colour) : inheritsStageColour(colour), maximumBrightness}) {
    const [h, s, v] = hsv(colour);
    const maximum = brightnessLimit(maximumBrightness);
    const node = el(`<div class="stack gap-12"></div>`);
    /** @param {number[]} next */
    const commit = (next) => onChange?.(clampHsv(next, maximum));
    // Off keeps the hue, and the saturation when there is one.
    const ledsOffChoice = () => el(`<button class="btn tiny ghost" data-leds-off data-tip="${esc(ledsOffTip || "")}">Off</button>`);
    /** @param {HTMLElement} button */
    const onLedsOff = (button) => button.addEventListener("click", () => commit([h, s || 255, 0]));

    if (off) {
        node.append(el(`<div class="row colour-head"><span class="swatch-lg swatch-off"></span>
            <div><div class="colour-title">${esc(title)}</div><div class="note">${esc(offWord)}</div></div></div>`));
        node.append(el(`<div class="callout">${esc(offNote || "This colour has zero brightness.")}</div>`));
        if (canEdit) {
            const give = el(`<button class="btn self-start">Give it a colour</button>`);
            give.addEventListener("click", () => commit([140, 255, Math.min(200, maximum)]));
            if (ledsOffTip) {
                const row = el(`<div class="row gap-8"></div>`), choice = ledsOffChoice();
                onLedsOff(choice);
                row.append(give, choice);
                node.append(row);
            } else node.append(give);
        }
        return node;
    }

    const head = el(`<div class="row colour-head">
        <span class="swatch-lg" style="background:${css(colour)}"></span>
        <div><div class="colour-title">${esc(title)}</div>
            <div class="note mono">${esc(hsvLabel(colour))} · rgb(${esc(rgb(colour).join(", "))})</div></div>
        ${canEdit && offTip && !ledsOffTip ? `<button class="btn tiny ghost" data-off data-tip="${esc(offTip)}">${esc(offAction)}</button>` : ""}</div>`);
    node.append(head);
    // An owner's colour offers its two choices on a row of their own under
    // its name: Make passthrough, and Off while it is not already off.
    if (canEdit && ledsOffTip) {
        const actions = el(`<div class="row gap-8">${offTip ? `<button class="btn tiny ghost" data-off data-tip="${esc(offTip)}">${esc(offAction)}</button>` : ""}</div>`);
        if (v !== 0) { const choice = ledsOffChoice(); onLedsOff(choice); actions.append(choice); }
        node.append(actions);
    }
    if (v === 0) node.append(el(`<p class="note">${esc(ledsOffTip && ledsOffNote ? ledsOffNote : "Brightness is zero. Hue and saturation are retained; raise brightness to use this colour again.")}</p>`));
    /** @type {HTMLElement | null} */ (node.querySelector("[data-off]"))?.addEventListener("click", () => commit([0, 0, 0]));

    const topWhite = css({h: "0", s: "0", v: String(maximum)});
    const topHue = css({h: String(h), s: "255", v: String(maximum)});
    const field = el(`<div class="sv-field" data-tip="Brightness is limited to ${maximum}, as reported by this keyboard."
        style="background:linear-gradient(to top, ${css({h: "0", s: "0", v: "0"})}, transparent), linear-gradient(to right, ${topWhite}, ${topHue})">
        <span class="thumb" style="left:${(s / 255) * 100}%;top:${100 - valuePercent(v, maximum)}%"></span></div>`);
    node.append(field);

    const ramp = el(`<div class="swatch-pick"><span class="label">Hue</span>
        <span class="hue-ramp"><span class="thumb" style="left:${(h / 255) * 100}%"></span></span></div>`);
    node.append(ramp);

    // Three number fields as wide as their three digits, each named with its
    // range, as every other number in the app is.
    const fields = el(`<div class="colour-fields">
        ${[["Hue", h, 255], ["Saturation", s, 255], ["Brightness", v, maximum]].map(([name, value, max], index) =>
            `<label class="field"><span>${esc(name)} 0–${esc(max)}</span><input type="number" min="0" max="${esc(max)}" step="1" class="input mono num" value="${esc(value)}" data-f="${esc(identity)}:colour:${index}" data-channel="${index}" ${canEdit ? "" : "disabled"}></label>`).join("")}</div>`);
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
