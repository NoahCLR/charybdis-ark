// @ts-check
// The board: the one constant surface. It paints the light the keyboard would
// show for this layer, draws the legend on top in whichever of black or white
// stays readable, and marks what each key reaches.
//
// With layers previewed on under it (`held`, positions in the stack), each key
// shows what the keyboard would answer with instead of what this layer stores:
// a transparent key shows the key of the highest layer below that is on. Its
// cap is frosted like any transparent key's, since this layer is glass there
// and the key is seen through it; its legend stays sharp, and the light it
// shows is the answering layer's, so its colour names that layer. It wears the
// answering key's behaviour dots and the badges of the combos it fires in this
// preview (combosInPreview). Selection and
// edits still name this layer's own position.

// Selector assertions refer to elements created by this module's authored markup.
import {css, idealText, isOff} from "../lib/colour.mjs";
import {GEO, LED_INDEX, TRACKBALL_LED, keyFaceRows, keyVisual, legendFit, textUnits} from "../view/geometry.mjs";
import {behaviourFor, behaviourTiers, keyFace, keyMeaning} from "../view/keyface.mjs";
import {combosShownAt} from "../view/combo-reach.mjs";
import {unbuiltKeycode} from "../view/picker-sections.mjs";
import {dangerOf} from "../view/picker-choice.mjs";
import {resolvedPositions} from "../view/layer-resolution.mjs";
import {keyLight, ownLight, stageEnabled, tierColour, trackballLight} from "../view/lighting.mjs";
import {el, esc} from "../lib/dom.mjs";
import {hideHover} from "./hover.mjs";
import {render} from "../store.mjs";

// How wide a key is drawn on screen, in px. Legends are sized from it
// (view/geometry.mjs legendFit), so the board measures itself once drawn and
// draws again when the size it drew at was off by a pixel or more.
let drawnKey = 48;
/** @type {ResizeObserver | null} */
let measuring = null;
const [, , VIEW_W, VIEW_H] = GEO.viewBox.split(" ").map(Number);
// The empty centre of the board in its own units: between the inner columns,
// above the thumb cluster. The layer plate sits there.
const CENTRE = {x: 434, y: 108, w: 254, h: 286};
const [VIEW_X, VIEW_Y] = GEO.viewBox.split(" ").map(Number);
// Lays the centre's content over that area of the drawn board, wherever the
// board's box puts the scaled drawing.
/** @param {SVGSVGElement} svg @param {HTMLElement | null} centre */
function placeCentre(svg, centre) {
    if (!centre || !centre.isConnected) return;
    const box = svg.getBoundingClientRect(), host = /** @type {HTMLElement} */ (centre.offsetParent || svg.parentElement).getBoundingClientRect();
    if (!box.width || !box.height) return;
    const scale = Math.min(box.width / VIEW_W, box.height / VIEW_H);
    const left = box.left - host.left + (box.width - VIEW_W * scale) / 2, top = box.top - host.top + (box.height - VIEW_H * scale) / 2;
    Object.assign(centre.style, {left: `${left + (CENTRE.x - VIEW_X) * scale}px`, top: `${top + (CENTRE.y - VIEW_Y) * scale}px`,
        width: `${CENTRE.w * scale}px`, height: `${CENTRE.h * scale}px`});
    centre.hidden = false;
}
/** @param {SVGSVGElement} svg @param {HTMLElement | null} [centre] */
function measureKeys(svg, centre = null) {
    measuring?.disconnect();
    if (typeof ResizeObserver !== "function") return;
    measuring = new ResizeObserver(([entry]) => {
        const {width, height} = entry.contentRect;
        if (!width || !height) return;
        placeCentre(svg, centre);
        const key = GEO.keyW * Math.min(width / VIEW_W, height / VIEW_H);
        if (Math.abs(key - drawnKey) < 1) return;
        drawnKey = key;
        requestAnimationFrame(() => render());
    });
    measuring.observe(svg);
}

/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {import("../../contracts/panel.js").Layer | undefined} layer @param {import("./surface-types.js").BoardOptions} [options] */
export function board(model, layer, options = {}) {
    const {selected, mode = "light", picks = [], reach = [], pdActive = null, drafted = null,
        faces = true, trackball = false, held = [], onKey, onOpen, onSwap, onTrackball} = options;
    // Lighting shows behaviour dots only on Key feedback and combo badges only
    // on Combos; elsewhere both follow `faces`.
    const {dots = faces, badges = faces} = options;
    const positions = layer?.positions || [];
    const stack = model?.layers || [];
    const heldIds = held.map((at) => stack[at]?.index).filter((id) => id !== undefined);
    const answering = layer && held.length && mode !== "leds"
        ? new Map(resolvedPositions(stack, stack.indexOf(layer), held).map((entry) => [entry.position.layoutIndex, entry]))
        : null;
    const feedbackOn = stageEnabled(model, "key");
    const comboColour = model?.rgb?.comboFeedback?.color;
    const comboLit = stageEnabled(model, "combo") && comboColour && !isOff(comboColour);

    // One Tab stop for the whole board: the picked key (roving tabindex);
    // the arrow keys move from there (ui/keys.mjs).
    const stop = positions.some((position) => position.layoutIndex === selected) ? selected : positions[0]?.layoutIndex;
    let glow = "", keys = "";
    for (const position of positions) {
        const index = position.layoutIndex;
        const visual = keyVisual(index);
        const answer = answering?.get(index);
        const shown = answer?.position || position;
        const from = answer?.fellThrough ? answer.layer : null;
        const face = keyFace(shown);
        const glass = face.kind === "transparent" || Boolean(from);
        const cx = visual.x + GEO.keyW / 2, cy = visual.y + GEO.keyH / 2;
        const transform = visual.angle ? ` transform="rotate(${visual.angle} ${cx} ${cy})"` : "";
        const classes = ["kc",
            face.kind === "transparent" ? "kc-trns" : "",
            face.kind === "disabled" ? "kc-none" : "",
            from ? "kc-under" : "",
            options.picking ? "pickable" : ""].filter(Boolean).join(" ");

        let fill = "", text = "", picked = "";
        if (mode === "leds") {
            picked = picks.includes(index) ? " picked" : "";
        } else {
            const light = keyLight(model, layer, position, {pdActive, held: heldIds});
            text = idealText(light.colour);
            const paint = css(light.colour);
            fill = ` style="fill:${paint};stroke:${glass ? "none" : "var(--light-outline)"}"`;
            glow += `<rect class="kc-glow${glass ? " kc-glow-trns" : ""}" x="${visual.x}" y="${visual.y}" width="${GEO.keyW}" height="${GEO.keyH}" rx="${GEO.radius}" fill="${paint}"${transform}></rect>`;
        }

        const tiers = dots && mode !== "leds" ? behaviourTiers(behaviourFor(model, keyMeaning(shown))) : [];
        const combos = badges && mode !== "leds" ? combosShownAt(model, stack, layer?.index ?? 0, held, index) : [];
        // A key this firmware does not build does nothing: its cap says so
        // on its second line. A key that stops or erases the keyboard is
        // marked ⚠ (view/picker-choice.mjs dangerOf).
        const inert = mode !== "leds" && face.kind === "key" && unbuiltKeycode(model, shown.keycode);
        const sub = mode === "leds" ? "" : inert ? "not in this firmware" : face.sub;
        const rows = keyFaceRows(visual.y,
            {tiers: tiers.length > 0, combos: combos.length > 0, sub: Boolean(sub)});

        let marks = "";
        const step = 9.6, startX = cx - ((tiers.length - 1) * step) / 2;
        marks += tiers.map((tier, order) => {
            const x = startX + order * step;
            const colour = tierColour(model, tier.kind);
            if (!feedbackOn || isOff(colour)) {
                return `<circle cx="${x}" cy="${rows.tierY}" r="3.9" fill="none" stroke="${text || "var(--light-detail)"}" stroke-width="1.1" stroke-dasharray="2 1.6"></circle>`;
            }
            // A dot per tier, without a count: how many actions use it is
            // the hover card's and the Behaviours tab's to say.
            return `<circle cx="${x}" cy="${rows.tierY}" r="3.9" fill="${css(colour)}" stroke="${text || "var(--light-detail)"}" stroke-width="1.1"></circle>`;
        }).join("");

        if (combos.length) {
            // One combo mark per key, with how many combos it starts when
            // more than one: combo numbers are no identity (they renumber when
            // one is deleted), so the hover card and Combos tab name them.
            const label = combos.length > 1 ? String(combos.length) : "";
            const width = label ? 15 : 11;
            const x = cx - width / 2;
            marks += `<rect class="kc-combo" x="${x}" y="${rows.comboY}" width="${width}" height="${rows.comboHeight}" rx="${rows.comboHeight / 2}" fill="var(--badge-ink)" stroke="${comboLit ? css(comboColour) : "var(--badge-outline)"}" stroke-width="${rows.comboHeight * 0.12}"></rect>`
                + (label ? `<text x="${cx}" y="${/** @type {number} */ (rows.comboY) + rows.comboHeight / 2 + 0.1}" class="kc-badgetext" font-size="6.4">${label}</text>` : "");
        }

        // The selection and indication rings ride on top: the light owns the key
        // face, so state is never told by recolouring it.
        /** @param {string} name */
        const ring = (name) => `<rect class="${name}" x="${visual.x + 1.4}" y="${visual.y + 1.4}" width="${GEO.keyW - 2.8}" height="${GEO.keyH - 2.8}" rx="${GEO.radius - 1}"></rect>`;
        const main = mode === "leds" ? String(LED_INDEX[index] ?? index) : dangerOf(model, shown.keycode) ? `⚠ ${face.main}` : face.main;
        // A legend is sized from the key's drawn size and the room its row
        // leaves (view/geometry.mjs legendFit), so one typeface at one weight
        // carries every cap: a long one shrinks to its floor, then a main
        // legend with nothing under it wraps onto two lines, and only then
        // are its glyphs squeezed.
        const marksBottom = rows.comboY !== undefined ? rows.comboY + rows.comboHeight
            : rows.tierY !== undefined ? rows.tierY + 4 : visual.y;
        const roomOf = (/** @type {number} */ height) => Math.max(0, height) * 1.7;
        const separatorY = rows.separatorY ?? 0, subY = rows.subY ?? 0;
        const mainFit = legendFit(main, sub
            ? {k: drawnKey, line: "main", width: GEO.keyW - 12, room: roomOf(Math.min(separatorY - rows.mainY, rows.mainY - marksBottom))}
            : {k: drawnKey, line: "main", width: GEO.keyW - 10, room: roomOf((rows.mainY - marksBottom) * 2), wrap: true});
        const subFit = sub ? legendFit(sub, {k: drawnKey, line: "sub", width: GEO.keyW - 12,
            room: roomOf(Math.min(visual.y + GEO.keyH - subY, subY - separatorY))}) : null;
        /** @param {string} part */
        const squeeze = (part) => textUnits(part) * mainFit.size > (GEO.keyW - 10) + 0.01
            ? ` textLength="${GEO.keyW - 10}" lengthAdjust="spacingAndGlyphs"` : "";
        // A wrapped legend's two lines sit either side of where one would.
        const lines = mainFit.lines.length === 2
            ? mainFit.lines.map((part, row) => `<tspan x="${cx}" y="${rows.mainY + (row ? 0.56 : -0.56) * mainFit.size}"${squeeze(part)}>${esc(part)}</tspan>`).join("")
            : esc(main);

        keys += `<g class="${classes}${selected === index ? " sel" : ""}" data-key="${index}" tabindex="${index === stop ? 0 : -1}" role="button"
            aria-label="${esc(keyMeaning(shown))} at index ${index}${from ? `, from ${esc(from.displayName || from.name || `layer ${from.index}`)}` : ""}"${transform}>
            <rect class="kc-rect${picked}" x="${visual.x}" y="${visual.y}" width="${GEO.keyW}" height="${GEO.keyH}" rx="${GEO.radius}"${fill}></rect>
            ${selected === index || (mode !== "leds" && picks.includes(index)) ? ring("kc-ring") : ""}
            ${reach.includes(index) ? `<rect class="kc-reach" x="${visual.x - 3}" y="${visual.y - 3}" width="${GEO.keyW + 6}" height="${GEO.keyH + 6}" rx="${GEO.radius + 2}"></rect>` : ""}
            ${marks}
            ${drafted?.has(index) ? `<circle class="kc-draft" cx="${visual.x + GEO.keyW - 5.5}" cy="${visual.y + 5.5}" r="2.6"></circle>` : ""}
            ${sub ? `<line class="kc-sep" x1="${visual.x + 8}" y1="${rows.separatorY}" x2="${visual.x + GEO.keyW - 8}" y2="${rows.separatorY}" stroke="${text || "var(--light-detail)"}" stroke-width="1"></line>` : ""}
            <text class="kc-label" x="${cx}" y="${rows.mainY}" font-size="${mainFit.size}"${mainFit.lines.length === 1 && mainFit.squeeze ? ` textLength="${mainFit.squeeze}" lengthAdjust="spacingAndGlyphs"` : ""}${text ? ` style="fill:${text}"` : ""}>${lines}</text>
            ${subFit ? `<text class="kc-sub" x="${cx}" y="${rows.subY}" font-size="${subFit.size}"${subFit.squeeze ? ` textLength="${subFit.squeeze}" lengthAdjust="spacingAndGlyphs"` : ""}${text ? ` style="fill:${text}"` : ""}>${esc(sub)}</text>` : ""}
        </g>`;
    }

    // The trackball LED is index 56 and belongs to no key, but it is lit like
    // every other LED, so it is drawn with the light it emits rather than as an
    // outline of where the ball sits.
    const ball = trackballGlyph(model, layer, {mode, pdActive, held: heldIds, trackball, clickable: Boolean(onTrackball)});
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
    const svg = /** @type {SVGSVGElement} */ (node.querySelector("svg"));
    const centre = options.centre || null;
    if (centre) {
        centre.classList.add("board-centre");
        centre.hidden = true;
        node.append(centre);
        requestAnimationFrame(() => placeCentre(svg, centre));
    }
    measureKeys(svg, centre);
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
// seen through the viewed layer from underneath (view/lighting.mjs ownLight).
// A mapped-keys-only layer never reaches it, since no key maps to it. In the LED
// selector it shows its index and whether the pending group has picked it, the
// same two things every key shows there.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {import("../../contracts/panel.js").Layer | undefined} layer @param {import("./surface-types.js").TrackballOptions} options */
function trackballGlyph(model, layer, {mode, pdActive, held, trackball, clickable}) {
    const {x, y, r} = GEO.trackball;
    const light = trackballLight(model, layer, {pdActive, held});
    const paint = css(light.colour);
    const glass = mode !== "leds" && !ownLight(light, layer?.index ?? 0);
    // Picking LEDs, the ball is drawn like a key (.kc-ball.leds); otherwise in its light.
    const lit = mode === "leds" ? "" : ` style="fill:${paint};stroke:${glass ? "none" : "var(--light-outline)"}"`;
    const markup = `<g class="kc kc-ball${glass ? " glass" : ""}${trackball ? " sel" : ""}${mode === "leds" ? " leds" : ""}"${clickable ? ' data-trackball="1" tabindex="0" role="button"' : ""}
        aria-label="Trackball LED ${TRACKBALL_LED}">
        <circle cx="${x}" cy="${y}" r="${r}"${lit}></circle>
        ${mode === "leds" ? `<text class="kc-label sm" x="${x}" y="${y}">${TRACKBALL_LED}</text>` : ""}</g>`;
    return {
        markup,
        glow: mode === "leds" ? "" : `<circle class="kc-glow${glass ? " kc-glow-trns" : ""}" cx="${x}" cy="${y}" r="${r}" fill="${paint}"></circle>`,
    };
}
