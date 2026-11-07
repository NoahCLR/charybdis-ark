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
import {GEO, estimateWidth, keyFaceRows, keyIconsX, keyLegends, keyVisual} from "../view/geometry.mjs";
import {boardKeys, boardTrackball} from "../view/board-keys.mjs";
import {layerCalled} from "../view/vocabulary.mjs";
import {REACH_ICONS} from "../view/screens.mjs";
import {el, esc} from "../lib/dom.mjs";
import {pageTextMeasure} from "../lib/measure-text.mjs";
import {hideHover} from "./hover.mjs";

// A key's icons stand in a centred row under the legend, above the line on a
// key with one (keyFaceRows, keyIconsX): one per kind of thing it reaches.
// Each is its screen's rail icon, in the legend's colour: it says what kind
// of thing the key reaches, not which, so a pointing mode's is not its mark
// and wears no slot's light.
/** @param {import("../view/board-keys.mjs").KeyIcon} kind @param {number} x @param {number} y @param {number} size @param {string} ink */
const reachIcon = (kind, x, y, size, ink) => `<svg class="kc-icon" data-kind="${esc(kind)}" x="${esc(x)}" y="${esc(y)}"
    width="${esc(size)}" height="${esc(size)}" viewBox="0 0 16 16" style="stroke:${ink};color:${ink}">${REACH_ICONS[kind]}</svg>`;

// Where the board shows LEDs (Lighting), each carries its number on a small
// label pinned over its cap's top-left corner, the trackball's in its middle,
// apart from the legends, which never move or shrink for it: a cap reads the
// same on every screen (D-L78). `x` and `y` are the corner it is pinned over;
// `ledLabelAt` centres one on a point instead. It reaches `height - over`
// (6.6) into the cap, above a combo badge row (keyFaceRows' comboY, 7.2), and
// its number is set at 8.4 (`.kc-led text`).
const LED_LABEL = Object.freeze({height: 11.8, digit: 5.4, pad: 5, over: 5.2});
/** @param {number} led */
const ledLabelWidth = (led) => String(led).length * LED_LABEL.digit + LED_LABEL.pad;
/** @param {number} x @param {number} y @param {number} led */
const ledLabel = (x, y, led) => {
    const width = ledLabelWidth(led), left = x - LED_LABEL.over, top = y - LED_LABEL.over;
    return `<g class="kc-led" aria-hidden="true"><rect x="${esc(left)}" y="${esc(top)}" width="${esc(width)}" height="${esc(LED_LABEL.height)}" rx="3"></rect>`
        + `<text x="${esc(left + width / 2)}" y="${esc(top + LED_LABEL.height / 2)}">${esc(led)}</text></g>`;
};
/** @param {number} cx @param {number} cy @param {number} led */
const ledLabelAt = (cx, cy, led) => ledLabel(cx - ledLabelWidth(led) / 2 + LED_LABEL.over, cy - LED_LABEL.height / 2 + LED_LABEL.over, led);

/** @param {import("../view/keyface-types.js").LayerView} view @param {import("./surface-types.js").BoardOptions} [options] */
export function board(view, options = {}) {
    const {selected, holding = [], reach = [], pdActive = null, comboActive = null, drafted = null, faces = true, ledIndex = false, accent = null, card = true,
        onKey, onOpen, onSwap, onLed} = options;

    const measure = pageTextMeasure() ?? estimateWidth;
    let glow = "", keys = "";
    for (const key of boardKeys(view, {faces, pdActive, comboActive, accent})) {
        const {index, from, glass, tiers, badges, icons, sub, led, picked} = key;
        const visual = keyVisual(index);
        const cx = visual.x + GEO.keyW / 2, cy = visual.y + GEO.keyH / 2;
        const transform = visual.angle ? ` transform="rotate(${visual.angle} ${cx} ${cy})"` : "";
        const classes = ["kc",
            key.kind === "transparent" ? "kc-trns" : "",
            key.kind === "disabled" ? "kc-none" : "",
            from ? "kc-under" : "",
            options.picking ? "pickable" : ""].filter(Boolean).join(" ");

        const text = idealText(key.light);
        const paint = css(key.light);
        const fill = ` style="fill:${paint};stroke:${glass ? "none" : "var(--light-outline)"}"`;
        glow += `<rect class="kc-glow${glass ? " kc-glow-trns" : ""}" x="${visual.x}" y="${visual.y}" width="${GEO.keyW}" height="${GEO.keyH}" rx="${GEO.radius}" fill="${paint}"${transform}></rect>`;

        const rows = keyFaceRows(visual.y,
            {tiers: tiers.length > 0, combos: badges.length > 0, sub: Boolean(sub), icons: icons.length > 0});

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

        if (rows.iconY !== undefined && rows.iconSize !== undefined) {
            const {iconY, iconSize} = rows;
            marks += keyIconsX(cx, icons.length, iconSize)
                .map((x, order) => reachIcon(icons[order], x, iconY, iconSize, text || "var(--light-detail)")).join("");
        }

        // The selection and indication rings ride on top: the light owns the key
        // face, so state is never told by recolouring it.
        /** @param {string} name */
        const ring = (name) => `<rect class="${name}" x="${visual.x + 1.4}" y="${visual.y + 1.4}" width="${GEO.keyW - 2.8}" height="${GEO.keyH - 2.8}" rx="${GEO.radius - 1}"></rect>`;
        // The legends are set from one scale, a single character large and a
        // name at the word size, two lines when it has two words (keyLegends).
        const legend = keyLegends(rows, {main: key.main, sub}, measure);
        /** @param {{squeeze: number}} fit */
        const squeeze = (fit) => fit.squeeze ? ` textLength="${esc(fit.squeeze)}" lengthAdjust="spacingAndGlyphs"` : "";
        const fillText = text ? ` style="fill:${text}"` : "";
        const label = `<text class="kc-label" font-size="${esc(legend.size)}"${fillText}>${legend.lines.map((line) =>
            `<tspan x="${cx}" y="${esc(line.y)}"${squeeze(line)}>${esc(line.text)}</tspan>`).join("")}</text>`;

        // What the rings and dots say, said to a screen reader too: the
        // selected key is the current one, an LED picked for an accent is
        // pressed, and a key the draft changed says so after its name.
        const said = accent ? (picked ? ' aria-pressed="true"' : ' aria-pressed="false"') : selected === index ? ' aria-current="true"' : "";
        keys += `<g class="${classes}${selected === index ? " sel" : ""}" data-key="${esc(index)}"${card ? " data-card" : ""}${led === undefined ? "" : ` data-led="${esc(led)}"`} tabindex="0" role="button"${said}
            aria-label="${esc(key.name)}${ledIndex && led !== undefined ? `, LED ${esc(led)}` : ""}${from ? `, from ${esc(layerCalled(from))}` : ""}${drafted?.keys?.has(index) ? `, ${esc(drafted.after)}` : ""}"${transform}>
            <rect class="kc-rect" x="${visual.x}" y="${visual.y}" width="${GEO.keyW}" height="${GEO.keyH}" rx="${GEO.radius}"${fill}></rect>
            ${selected === index || holding.includes(index) ? ring("kc-ring") : ""}
            ${picked ? ring("kc-pick") : ""}
            ${reach.includes(index) ? `<rect class="kc-reach" x="${visual.x - 3}" y="${visual.y - 3}" width="${GEO.keyW + 6}" height="${GEO.keyH + 6}" rx="${GEO.radius + 2}"></rect>` : ""}
            ${ledIndex && led !== undefined ? ledLabel(visual.x, visual.y, led) : ""}
            ${marks}
            ${drafted?.keys?.has(index) ? `<circle class="kc-draft" cx="${visual.x + GEO.keyW - 5.5}" cy="${visual.y + 5.5}" r="2.6"></circle>` : ""}
            ${sub ? `<line class="kc-sep" x1="${visual.x + 8}" y1="${esc(rows.separatorY)}" x2="${visual.x + GEO.keyW - 8}" y2="${esc(rows.separatorY)}" stroke="${text || "var(--light-detail)"}" stroke-width="1"></line>` : ""}
            ${label}
            ${legend.sub ? `<text class="kc-sub" x="${cx}" y="${esc(legend.sub.y)}" font-size="${esc(legend.sub.size)}"${squeeze(legend.sub)}${fillText}>${esc(sub)}</text>` : ""}
        </g>`;
    }

    // The trackball LED is index 56 and belongs to no key, but it is lit like
    // every other LED, so it is drawn with the light it emits rather than as an
    // outline of where the ball sits.
    const ball = trackballGlyph(boardTrackball(view, {pdActive, comboActive, accent}), {ledIndex, picking: Boolean(accent), clickable: Boolean(onLed)});
    if (ball.glow) glow += ball.glow;
    const node = /** @type {import("./surface-types.js").BoardNode} */ (el(`<div class="board ${options.picking ? "picking" : ""}">
        <svg viewBox="${GEO.viewBox}" xmlns="http://www.w3.org/2000/svg">${glow}${ball.markup}${keys}</svg></div>`));

    /** @type {NodeListOf<SVGGElement>} */ (node.querySelectorAll("[data-key]")).forEach((group) => {
        const index = Number(group.dataset.key);
        if (onKey) group.addEventListener("click", () => { if (!node.justDragged) onKey(index); });
        if (onOpen) group.addEventListener("dblclick", () => onOpen(index));
        if (onSwap) dragToSwap(node, group, index, onSwap);
    });
    if (onLed) node.querySelectorAll("[data-led], [data-trackball]").forEach((group) => pickByDrag(/** @type {SVGGElement} */ (group), onLed));
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

// Picking an accent's LEDs: a press picks the LED under it, or takes it back,
// and dragging on across keys does the same to each, so one stroke picks a
// row. Enter or Space does it for the key with focus.
/** @param {SVGGElement} group @param {(led: number, starting: boolean) => void} onLed */
function pickByDrag(group, onLed) {
    const led = Number(group.dataset.led ?? group.dataset.trackball);
    group.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        onLed(led, true);
    });
    group.addEventListener("pointerenter", (event) => { if (event.buttons & 1) onLed(led, false); });
    group.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onLed(led, true);
    });
}

// The trackball's own LED shows what it emits, by the rule the keys follow:
// solid when its light is the viewed layer's own — an all-keys colour or one
// of its accents, a previewed pointing mode, or anything at all on base,
// which nothing lies under — and frosted when it is seen through the viewed
// layer from underneath (view/board-keys.mjs). A mapped-keys-only layer never
// reaches it, since no key maps to it. Like a key, it carries its LED's number
// on Lighting, in its middle since it has no corner, and a ring while it is
// picked for an accent.
/** @param {ReturnType<typeof boardTrackball>} ball @param {import("./surface-types.js").TrackballOptions} options */
function trackballGlyph({led, light, glass, picked}, {ledIndex, picking, clickable}) {
    const {x, y, r} = GEO.trackball;
    const paint = css(light);
    const lit = ` style="fill:${paint};stroke:${glass ? "none" : "var(--light-outline)"}"`;
    const markup = `<g class="kc kc-ball${glass ? " glass" : ""}${picked ? " picked" : ""}"${led === undefined ? "" : ` data-led="${esc(led)}"`}${clickable ? ` data-trackball="${esc(led)}" tabindex="0" role="button"` : ""}
        ${picking ? (picked ? 'aria-pressed="true"' : 'aria-pressed="false"') : ""} aria-label="Trackball LED ${esc(led)}">
        <circle cx="${esc(x)}" cy="${y}" r="${r}"${lit}></circle>
        ${picked ? `<circle class="kc-pick" cx="${esc(x)}" cy="${y}" r="${r - 3}"></circle>` : ""}
        ${ledIndex && led !== undefined ? ledLabelAt(x, y, led) : ""}</g>`;
    return {
        markup,
        glow: `<circle class="kc-glow${glass ? " kc-glow-trns" : ""}" cx="${esc(x)}" cy="${y}" r="${r}" fill="${paint}"></circle>`,
    };
}
