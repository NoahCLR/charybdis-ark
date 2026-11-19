// @ts-check
// How wide a legend runs in the page's own sans face, so the board decides a
// line's fit by the text as it will be drawn (webview/view/geometry.mjs,
// keyLegends). The face is the system's (styles.css --sans), which differs
// from one computer to the next, so it is measured, never assumed. Null where
// the page has no canvas to measure with.

const BASE = 100;
/** @type {Map<string, number>} */
const measured = new Map();
/** @type {CanvasRenderingContext2D | null | undefined} */
let context;

/** @returns {import("../view/geometry.mjs").MeasureText | null} */
export function pageTextMeasure() {
    if (context === undefined) {
        try { context = globalThis.document?.createElement("canvas").getContext("2d") ?? null; } catch { context = null; }
    }
    const canvas = context;
    if (!canvas) return null;
    const face = getComputedStyle(document.documentElement).getPropertyValue("--sans").trim() || "sans-serif";
    return (text, size, weight) => {
        const key = `${weight} ${face}\n${text}`;
        let width = measured.get(key);
        if (width === undefined) {
            canvas.font = `${weight} ${BASE}px ${face}`;
            width = canvas.measureText(text).width;
            measured.set(key, width);
        }
        return width * size / BASE;
    };
}
