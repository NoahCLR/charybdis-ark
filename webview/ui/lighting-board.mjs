// @ts-check
import {el, esc} from "../lib/dom.mjs";
import {simulationLegend} from "../view/lighting.mjs";
import {frameText} from "../view/lighting-simulator.mjs";
import {GEO, keyVisual, LED_INDEX} from "../view/geometry.mjs";
/** One geometry and label path for local results. No identity-board remapping.
 * @param {(number[] | null)[]} frame @param {string} [prefix] @param {((led: number) => void) | null} [select] */
export function lightingBoard(frame, prefix = "sim", select = null) {
    const colours = frameText(frame);
    /** @param {number} led */
    const attrs = led => `data-${esc(prefix)}-led="${led}" data-colour="${esc(colours[led])}"${select ? ` role="button" tabindex="0" aria-label="Inspect LED ${led}"` : ""}`;
    /** @param {number} led */
    const fill = led => colours[led] === "-" ? "var(--bg)" : `#${colours[led]}`;
    const keys = Object.entries(LED_INDEX).map(([layout, led]) => {
        const v = keyVisual(Number(layout)), turn = v.angle ? ` transform="rotate(${v.angle} ${v.x + 29} ${v.y + 29})"` : "";
        return `<g${turn}><rect x="${v.x}" y="${v.y}" width="58" height="58" rx="7" fill="${fill(led)}" stroke="var(--line)" ${attrs(led)}/><text x="${v.x + 29}" y="${v.y + 33}" text-anchor="middle" fill="${simulationLegend(frame[led])}" data-${esc(prefix)}-label="${led}" pointer-events="none">LED ${led}</text></g>`;
    }).join("");
    const node = el(`<svg class="lighting-simulation-board" viewBox="${GEO.viewBox}" role="img" aria-label="Simulated lighting by LED number">${keys}<circle cx="${GEO.trackball.x}" cy="${GEO.trackball.y}" r="${GEO.trackball.r}" fill="${fill(56)}" ${attrs(56)}/><text x="${GEO.trackball.x}" y="${GEO.trackball.y}" text-anchor="middle" fill="${simulationLegend(frame[56])}" data-${esc(prefix)}-label="56" pointer-events="none">LED 56</text><rect x="1031" y="491" width="58" height="58" rx="7" fill="${fill(57)}" ${attrs(57)}/><text x="1060" y="525" text-anchor="middle" fill="${simulationLegend(frame[57])}" data-${esc(prefix)}-label="57" pointer-events="none">LED 57</text></svg>`);
    if (select) node.querySelectorAll(`[data-${prefix}-led]`).forEach(n => {
        const choose = () => select(Number(n.getAttribute(`data-${prefix}-led`)));
        n.addEventListener("click", choose);n.addEventListener("keydown", e => {const key = /** @type {KeyboardEvent} */ (e).key;if (["Enter", " "].includes(key)) {e.preventDefault();choose();}});
    });
    return node;
}
