// @ts-check
// The board: the one constant surface. It paints the light the keyboard would
// show for this layer, draws the legend on top in whichever of black or white
// stays readable, and marks what each key reaches.
//
// It draws one view of the stack (view/layer-view.mjs) as view/board-keys.mjs
// says each key shows it: with layers previewed under the viewed layer, a key
// answered from below is frosted like any transparent key, keeps its legend
// sharp and shows the answering layer's light, its dots and its badges; dots
// and badges mark only what runs. Selection and edits still name this layer's
// own position.

// Selector assertions refer to elements created by this module's authored markup.
import {css, idealText} from "../lib/colour.mjs";
import {GEO, fitText, keyFaceRows, keyVisual} from "../view/geometry.mjs";
import {boardKeys, boardTrackball} from "../view/board-keys.mjs";
import {layerCalled} from "../view/vocabulary.mjs";
import {el, esc} from "../lib/dom.mjs";
import {hideHover} from "./hover.mjs";

/** @param {import("../view/keyface-types.js").LayerView} view @param {import("./surface-types.js").BoardOptions} [options] */
export function board(view, options = {}) {
    const {selected, mode = "light", picks = [], reach = [], pdActive = null, drafted = null,
        faces = true, trackball = false, onKey, onOpen, onSwap, onTrackball} = options;

    let glow = "", keys = "";
    for (const key of boardKeys(view, {mode, faces, pdActive})) {
        const {index, from, glass, tiers, badges, sub} = key;
        const visual = keyVisual(index);
        const cx = visual.x + GEO.keyW / 2, cy = visual.y + GEO.keyH / 2;
        const transform = visual.angle ? ` transform="rotate(${visual.angle} ${cx} ${cy})"` : "";
        const classes = ["kc",
            key.kind === "transparent" ? "kc-trns" : "",
            key.kind === "disabled" ? "kc-none" : "",
            from ? "kc-under" : "",
            options.picking ? "pickable" : ""].filter(Boolean).join(" ");

        let fill = "", text = "", picked = "";
        if (mode === "leds") {
            picked = picks.includes(index) ? " picked" : "";
        } else {
            text = idealText(key.light);
            const paint = css(key.light);
            fill = ` style="fill:${paint};stroke:${glass ? "none" : "var(--light-outline)"}"`;
            glow += `<rect class="kc-glow${glass ? " kc-glow-trns" : ""}" x="${visual.x}" y="${visual.y}" width="${GEO.keyW}" height="${GEO.keyH}" rx="${GEO.radius}" fill="${paint}"${transform}></rect>`;
        }

        const rows = keyFaceRows(visual.y,
            {tiers: tiers.length > 0, combos: badges.length > 0, sub: Boolean(sub)});

        let marks = "";
        const step = 9.6, startX = cx - ((tiers.length - 1) * step) / 2;
        marks += tiers.map((tier, order) => {
            const x = startX + order * step;
            if (!tier.colour) {
                return `<circle cx="${esc(x)}" cy="${esc(rows.tierY)}" r="3.9" fill="none" stroke="${text || "var(--light-detail)"}" stroke-width="1.1" stroke-dasharray="2 1.6"></circle>`;
            }
            return `<circle cx="${esc(x)}" cy="${esc(rows.tierY)}" r="3.9" fill="${css(tier.colour)}" stroke="${text || "var(--light-detail)"}" stroke-width="1.1"></circle>`
                + (tier.count > 1 ? `<text x="${esc(x)}" y="${esc(/** @type {number} */ (rows.tierY) + 0.5)}" class="kc-dotn" fill="${idealText(tier.colour)}">${esc(tier.count)}</text>` : "");
        }).join("");

        if (badges.length) {
            // Each badge is as wide as its own text, and the row scales down
            // together when it would overrun the cap — three badges never reach
            // the edges the way a fixed width makes them.
            const gap = 1.5;
            const natural = badges.map((badge) => Math.max(11.5, 5 + String(badge.text).length * 3.2));
            const room = GEO.keyW - 8, between = gap * (badges.length - 1);
            const total = natural.reduce((sum, width) => sum + width, 0);
            const scale = total + between > room ? Math.max(0.68, (room - between) / total) : 1;
            const widths = natural.map((width) => width * scale);
            const fontSize = Math.max(4.9, 5.8 * scale);
            let x = cx - (widths.reduce((sum, width) => sum + width, 0) + between) / 2;
            marks += badges.map((badge, order) => {
                const width = widths[order];
                const drawn = `<rect x="${esc(x)}" y="${esc(rows.comboY)}" width="${esc(width)}" height="${esc(rows.comboHeight)}" rx="${rows.comboHeight * 0.22}" fill="var(--badge-ink)" stroke="${badge.lit ? css(badge.lit) : "var(--badge-outline)"}" stroke-width="${rows.comboHeight * 0.08}"></rect>`
                    + `<text x="${x + width / 2}" y="${/** @type {number} */ (rows.comboY) + rows.comboHeight / 2 + 0.1}" class="kc-badgetext" font-size="${fontSize}">${esc(badge.text)}</text>`;
                x += width + gap;
                return drawn;
            }).join("");
        }

        // The selection and indication rings ride on top: the light owns the key
        // face, so state is never told by recolouring it.
        /** @param {string} name */
        const ring = (name) => `<rect class="${name}" x="${visual.x + 1.4}" y="${visual.y + 1.4}" width="${GEO.keyW - 2.8}" height="${GEO.keyH - 2.8}" rx="${GEO.radius - 1}"></rect>`;
        const {main} = key;
        const above = (tiers.length ? 1 : 0) + (badges.length ? 1 : 0);
        // A legend is sized to the room its row leaves, so one typeface at one
        // weight carries every cap instead of stepping between faces by length.
        const mainFit = fitText(main, sub
            ? (above ? {max: 9.1, min: 6.4, width: GEO.keyW - 12} : {max: 12, min: 7, width: GEO.keyW - 12})
            : {max: 12, min: 7, width: GEO.keyW - 10});
        const subFit = sub ? fitText(sub, above
            ? {max: 6.4, min: 5.2, width: GEO.keyW - 12}
            : {max: 8, min: 6.2, width: GEO.keyW - 12}) : null;
        /** @param {ReturnType<typeof fitText>} fit */
        const squeeze = (fit) => fit.squeeze ? ` textLength="${esc(fit.squeeze)}" lengthAdjust="spacingAndGlyphs"` : "";

        keys += `<g class="${classes}${selected === index ? " sel" : ""}" data-key="${esc(index)}" tabindex="0" role="button"
            aria-label="${esc(key.meaning)} at index ${esc(index)}${from ? `, from ${esc(layerCalled(from))}` : ""}"${transform}>
            <rect class="kc-rect${picked}" x="${visual.x}" y="${visual.y}" width="${GEO.keyW}" height="${GEO.keyH}" rx="${GEO.radius}"${fill}></rect>
            ${selected === index ? ring("kc-ring") : ""}
            ${reach.includes(index) ? `<rect class="kc-reach" x="${visual.x - 3}" y="${visual.y - 3}" width="${GEO.keyW + 6}" height="${GEO.keyH + 6}" rx="${GEO.radius + 2}"></rect>` : ""}
            ${marks}
            ${drafted?.has(index) ? `<circle class="kc-draft" cx="${visual.x + GEO.keyW - 5.5}" cy="${visual.y + 5.5}" r="2.6"></circle>` : ""}
            ${sub ? `<line class="kc-sep" x1="${visual.x + 8}" y1="${esc(rows.separatorY)}" x2="${visual.x + GEO.keyW - 8}" y2="${esc(rows.separatorY)}" stroke="${text || "var(--light-detail)"}" stroke-width="1"></line>` : ""}
            <text class="kc-label" x="${cx}" y="${esc(rows.mainY)}" font-size="${mainFit.size}"${squeeze(mainFit)}${text ? ` style="fill:${text}"` : ""}>${esc(main)}</text>
            ${subFit ? `<text class="kc-sub" x="${cx}" y="${esc(rows.subY)}" font-size="${subFit.size}"${squeeze(subFit)}${text ? ` style="fill:${text}"` : ""}>${esc(sub)}</text>` : ""}
        </g>`;
    }

    // The trackball LED is index 56 and belongs to no key, but it is lit like
    // every other LED, so it is drawn with the light it emits rather than as an
    // outline of where the ball sits.
    const ball = trackballGlyph(boardTrackball(view, {mode, pdActive}), {mode, trackball, clickable: Boolean(onTrackball)});
    if (ball.glow) glow += ball.glow;
    const node = /** @type {import("./surface-types.js").BoardNode} */ (el(`<div class="board ${options.picking ? "picking" : ""}">
        <svg viewBox="${GEO.viewBox}" xmlns="http://www.w3.org/2000/svg">${glow}${ball.markup}${keys}</svg></div>`));

    /** @type {NodeListOf<SVGGElement>} */ (node.querySelectorAll("[data-key]")).forEach((group) => {
        const index = Number(group.dataset.key);
        if (onKey) group.addEventListener("click", () => { if (!node.justDragged) onKey(index); });
        if (onOpen) group.addEventListener("dblclick", () => onOpen(index));
        if (onSwap) dragToSwap(node, group, index, onSwap);
    });
    /** @type {SVGGElement | null} */ (node.querySelector("[data-trackball]"))?.addEventListener("click", () => onTrackball?.());
    return node;
}

// Drag one key onto another to swap what they store. The key follows the
// pointer and the key under it is marked, so the swap is visible before it
// lands; a press that never moves stays a click.
const DRAG_THRESHOLD = 4;

/** @param {import("./surface-types.js").BoardNode} node @param {SVGGElement} group @param {number} index @param {(from: number, to: number) => void} onSwap */
function dragToSwap(node, group, index, onSwap) {
    const svg = /** @type {SVGSVGElement} */ (node.querySelector("svg"));
    const resting = group.getAttribute("transform") || "";
    /** @type {import("./surface-types.js").KeyDrag | null} */
    let drag = null;

    /** @param {PointerEvent} event @returns {SVGGElement | null} */
    const targetAt = (event) => document.elementsFromPoint(event.clientX, event.clientY)
        .map((hit) => /** @type {SVGGElement | null} */ (hit.closest("[data-key]")))
        .find((hit) => hit && hit !== group) || null;
    /** @param {SVGGElement | null} target */
    const mark = (target) => {
        if (!drag || drag.target === target) return;
        drag.target?.classList.remove("drop-target");
        target?.classList.add("drop-target");
        drag.target = target;
    };
    const reset = () => {
        group.classList.remove("dragging");
        if (resting) group.setAttribute("transform", resting); else group.removeAttribute("transform");
        drag?.target?.classList.remove("drop-target");
        drag = null;
    };

    group.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        drag = {x: event.clientX, y: event.clientY, moved: false, target: null};
        group.setPointerCapture?.(event.pointerId);
    });
    group.addEventListener("pointermove", (event) => {
        if (!drag) return;
        const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
        if (!drag.moved) {
            if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
            drag.moved = true;
            group.classList.add("dragging");
            hideHover();
            // Raise it above its neighbours; moving the node drops capture, so re-arm it.
            svg.appendChild(group);
            group.setPointerCapture?.(event.pointerId);
        }
        const scale = svg.viewBox.baseVal.width / svg.getBoundingClientRect().width;
        group.setAttribute("transform", `translate(${dx * scale} ${dy * scale}) ${resting}`.trim());
        mark(targetAt(event));
    });
    group.addEventListener("pointerup", (event) => {
        if (!drag) return;
        const moved = drag.moved || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) >= DRAG_THRESHOLD;
        const target = moved ? targetAt(event) : null;
        reset();
        if (!moved) return;
        // The click that follows this release belongs to the drag, not a selection.
        node.justDragged = true;
        setTimeout(() => { node.justDragged = false; });
        if (target) onSwap(index, Number(target.dataset.key));
    });
    group.addEventListener("pointercancel", reset);
}

// The trackball's own LED. In light mode it shows what it emits, by the rule
// the keys follow: solid when its light is the viewed layer's own — an
// all-keys colour or one of its LED groups, a previewed pointing mode, or
// anything at all on base, which nothing lies under — and frosted when it is
// seen through the viewed layer from underneath (view/board-keys.mjs).
// A mapped-keys-only layer never reaches it, since no key maps to it. In the LED
// selector it shows its index and whether the pending group has picked it, the
// same two things every key shows there.
/** @param {ReturnType<typeof boardTrackball>} ball @param {import("./surface-types.js").TrackballOptions} options */
function trackballGlyph({led, light, glass}, {mode, trackball, clickable}) {
    const {x, y, r} = GEO.trackball;
    const paint = css(light);
    // Picking LEDs, the ball is drawn like a key (.kc-ball.leds); otherwise in its light.
    const lit = mode === "leds" ? "" : ` style="fill:${paint};stroke:${glass ? "none" : "var(--light-outline)"}"`;
    const markup = `<g class="kc kc-ball${glass ? " glass" : ""}${trackball ? " sel" : ""}${mode === "leds" ? " leds" : ""}"${clickable ? ' data-trackball="1" tabindex="0" role="button"' : ""}
        aria-label="Trackball LED ${esc(led)}">
        <circle cx="${esc(x)}" cy="${y}" r="${r}"${lit}></circle>
        ${mode === "leds" ? `<text class="kc-label sm" x="${esc(x)}" y="${y}">${esc(led)}</text>` : ""}</g>`;
    return {
        markup,
        glow: mode === "leds" ? "" : `<circle class="kc-glow${glass ? " kc-glow-trns" : ""}" cx="${esc(x)}" cy="${y}" r="${r}" fill="${paint}"></circle>`,
    };
}
