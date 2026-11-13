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

// Each colour choice is a radio group of its own: copies of a stage laid out
// unseen to measure it (ui/lighting/stage-body.mjs) share an editor's
// identity, and a shared group name would let one take another's pick.
let groups = 0;

// What a colour is, and the choice that sets it, drawn the same on every
// stage (D-L94): a colour an owner has (a layer's, a pointing slot's, combo
// feedback's or a feedback case's) comes with `ledsOffTip` and is one of
// Colour, Off (brightness 0 with saturation: its LEDs go dark) and
// Passthrough (`offWord`; saturation and brightness 0 at any
// hue, firmware D-F74: it paints nothing). A colour with only `offTip` (the
// auto-mouse fade's end) is Colour or Off (`offAction`), off being HSV(0, 0, 0); one with
// neither (the background effect, an accent's own) is a colour alone. A
// colour that paints nothing keeps its square, hue strip and fields, dimmed
// under a note saying what that means here, so the editor is the same size
// whatever the colour is; choosing Colour again brings them back. An owned
// colour that is off stays editable, as the black it is (its hue and
// saturation kept for when its brightness rises). `title`
// names the colour to a screen reader; the item it belongs to heads the
// editor on screen. `unused` draws it dimmed under that note with no choice,
// for a colour its stage keeps but does not paint as set (the fade's end
// colour in a mode that takes none).
/** @param {{identity: string, colour: import("../../contracts/edits.js").Colour | null | undefined, title: string, canEdit?: boolean, onChange?: (colour: import("../../contracts/edits.js").Colour) => void, offNote?: string, offTip?: string, offAction?: string, offWord?: string, ledsOffTip?: string, ledsOffNote?: string, unused?: string, maximumBrightness?: number}} options */
export function colourEditor({identity, colour, title, canEdit = true, onChange, offNote, offTip, offAction = "Off", offWord = "Off", ledsOffTip, ledsOffNote, unused, maximumBrightness}) {
    const [h, s, v] = hsv(colour);
    const maximum = brightnessLimit(maximumBrightness);
    const node = el(`<div class="stack gap-12 colour-editor"></div>`);
    /** @param {number[]} next */
    const commit = (next) => onChange?.(clampHsv(next, maximum));
    const owned = Boolean(ledsOffTip);
    const passthrough = owned && isPassthrough(colour);
    const dark = !passthrough && (owned || offTip ? v === 0 : inheritsStageColour(colour));
    // An owned colour that is off is still a colour, black: its hue and
    // saturation stay editable, and raising its brightness brings it back.
    // One that paints nothing, or a literal 0, 0, 0, has nothing to edit.
    const idle = passthrough || (dark && !owned) || Boolean(unused);
    const state = passthrough ? "passthrough" : dark ? "off" : "colour";
    const bright = Math.min(200, maximum);
    // Colour brings back the hue and saturation an Off colour kept, and a
    // fresh one where nothing was kept; Off keeps the hue and saturation
    // where the colour is owned, and is HSV(0, 0, 0) where it is literal.
    /** @type {Record<string, () => number[]>} */
    const to = {
        colour: () => passthrough || (h === 0 && s === 0) ? [140, 255, bright] : [h, s, bright],
        off: () => owned ? [h, s || 255, 0] : [0, 0, 0],
        passthrough: () => [0, 0, 0],
    };
    /** @type {[string, string, string][]} */
    const choices = unused ? [] : owned ? [["colour", "Colour", ""], ["off", "Off", ledsOffTip || ""], ["passthrough", offWord, offTip || ""]]
        : offTip ? [["colour", "Colour", ""], ["off", offAction, offTip]] : [];
    const group = `${identity}:state:${++groups}`;
    const head = el(`<div class="row colour-head"${dark && owned && ledsOffNote ? ` data-tip="${esc(ledsOffNote)}"` : ""}>
        <span class="swatch-lg ${passthrough ? "swatch-off" : dark ? "swatch-dark" : ""}${unused ? " unused" : ""}" style="${passthrough || dark ? "" : `background:${css(colour)}`}"></span>
        <div class="colour-readout"><div class="note${idle && !unused ? "" : " mono"}">${idle && !unused ? esc(passthrough ? offWord : "Off") : `${esc(hsvLabel(colour))} · rgb(${esc(rgb(colour).join(", "))})`}</div></div>
        ${choices.length ? `<div class="seg colour-state" role="radiogroup" aria-label="${esc(title)}">${choices.map(([value, words, tip]) =>
            `<label ${tip ? `data-tip="${esc(tip)}"` : ""}><input type="radio" name="${esc(group)}" value="${esc(value)}" data-f="${esc(identity)}:state:${esc(value)}" ${value === state ? "checked" : ""} ${canEdit ? "" : "disabled"}><span>${esc(words)}</span></label>`).join("")}</div>` : ""}</div>`);
    node.append(head);
    head.querySelectorAll(".colour-state input").forEach((input) => input.addEventListener("change", () => {
        const value = /** @type {HTMLInputElement} */ (input).value;
        if (value !== state) commit(to[value]());
    }));
    // A colour that paints nothing says what that means here, over the
    // controls it leaves dimmed. One with no choice to bring it back (the
    // background effect at 0, 0, 0) offers a colour there.
    const body = el(`<div class="colour-body"${idle ? " data-idle" : ""}></div>`);
    node.append(body);
    if (idle) {
        const words = unused || offNote;
        const over = el(`<div class="callout colour-idle">${esc(words || "This colour has zero brightness.")}</div>`);
        if (canEdit && !choices.length && !unused) {
            const give = el(`<button class="btn tiny self-start">Give it a colour</button>`);
            give.addEventListener("click", () => commit(to.colour()));
            over.append(give);
        }
        body.append(over);
    }
    const live = canEdit && !idle;

    const topWhite = css({h: "0", s: "0", v: String(maximum)});
    const topHue = css({h: String(h), s: "255", v: String(maximum)});
    const field = el(`<div class="sv-field" data-tip="Brightness is limited to ${maximum}, as reported by this keyboard."
        style="background:linear-gradient(to top, ${css({h: "0", s: "0", v: "0"})}, transparent), linear-gradient(to right, ${topWhite}, ${topHue})">
        <span class="thumb" style="left:${(s / 255) * 100}%;top:${100 - valuePercent(v, maximum)}%"></span></div>`);
    body.append(field);

    const ramp = el(`<div class="swatch-pick"><span class="label">Hue</span>
        <span class="hue-ramp"><span class="thumb" style="left:${(h / 255) * 100}%"></span></span></div>`);
    body.append(ramp);

    // Three number fields as wide as their three digits, each named with its
    // range, as every other number in the app is.
    const fields = el(`<div class="colour-fields">
        ${[["Hue", h, 255], ["Saturation", s, 255], ["Brightness", v, maximum]].map(([name, value, max], index) =>
            `<label class="field"><span>${esc(name)} 0–${esc(max)}</span><input type="number" min="0" max="${esc(max)}" step="1" class="input mono num" value="${esc(value)}" data-f="${esc(identity)}:colour:${index}" data-channel="${index}" ${live ? "" : "disabled"}></label>`).join("")}</div>`);
    /** @type {NodeListOf<HTMLInputElement>} */ (fields.querySelectorAll("[data-channel]")).forEach((input) => input.addEventListener("change", () => {
        const next = [h, s, v];
        next[Number(input.dataset.channel)] = Number(input.value) || 0;
        commit(next);
    }));
    body.append(fields);

    // Dragging previews locally and commits once on release: every commit
    // round-trips through the model and redraws this control, which would
    // drop the pointer mid-drag.
    if (live) {
        const hueRamp = /** @type {HTMLElement} */ (ramp.querySelector(".hue-ramp"));
        let draft = [h, s, v];
        /** @param {number[]} next */
        const preview = (next) => {
            draft = next.map(Math.round);
            const [dh, ds, dv] = draft;
            const shown = {h: String(dh), s: String(ds), v: String(dv)};
            /** @type {HTMLElement} */ (head.querySelector(".swatch-lg")).style.background = css(shown);
            /** @type {HTMLElement} */ (head.querySelector(".colour-readout .note")).textContent = `${hsvLabel(shown)} · rgb(${rgb(shown).join(", ")})`;
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
