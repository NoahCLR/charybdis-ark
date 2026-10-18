// The stylesheet speaks in tokens (docs/architecture/interface-contracts.md,
// "Design tokens"): every type size, weight, radius and control height names
// one from the block at the top of webview/styles.css, and text is never
// dimmed with opacity. A literal that slips in fails here rather than drifting
// the scale one rule at a time.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync(new URL("../../webview/styles.css", import.meta.url), "utf8");

// Every rule, with its selector and declarations, from inside @media and
// @container blocks too. The :root token block itself is where literals live.
function rules(source) {
    const text = source.replace(/\/\*[\s\S]*?\*\//g, "");
    const found = [];
    for (const match of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = match[1].trim().replace(/^@[^{]*$/, "").trim();
        const declarations = match[2].split(";").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
            const at = entry.indexOf(":");
            return {property: entry.slice(0, at).trim(), value: entry.slice(at + 1).trim()};
        });
        found.push({selector, declarations});
    }
    return found.filter((rule) => !/^:root\b/.test(rule.selector));
}
const RULES = rules(css);

// Drawn in the board's own SVG units, or on the phone page outside Ark, or a
// glyph sized to its box: these keep literal sizes, listed here by selector.
const SIZE_EXCEPTIONS = [
    /\.kc-/, /\.pkb-/, /\.phone-/,
    /\.macro-token-mark\b/, /\.step-chip-mark\b/, /\.macro-empty-mark\b/,
];
const exempt = (selector, list) => list.some((pattern) => pattern.test(selector));

/** @param {string} property @param {(value: string) => boolean} allowed @param {RegExp[]} exceptions */
function offending(property, allowed, exceptions = SIZE_EXCEPTIONS) {
    return RULES.flatMap((rule) => rule.declarations
        .filter((entry) => entry.property === property && !allowed(entry.value) && !exempt(rule.selector, exceptions))
        .map((entry) => `${rule.selector} { ${entry.property}: ${entry.value} }`));
}

test("every font size is a type-scale token", () => {
    assert.deepEqual(offending("font-size", (value) => /^var\(--fs-[a-z]+\)$/.test(value) || value === "inherit"), []);
});

test("every font weight is one of the three weight tokens", () => {
    assert.deepEqual(offending("font-weight", (value) => /^var\(--fw-(regular|medium|strong)\)$/.test(value) || value === "inherit"), []);
});

test("shorthand font declarations carry no literal size or weight", () => {
    assert.deepEqual(offending("font", (value) => value === "inherit"), []);
});

test("every corner radius is a radius token, a circle or square", () => {
    const part = (value) => value === "0" || value === "50%" || /^var\(--r-(chip|control|card|sheet)\)$/.test(value);
    assert.deepEqual(offending("border-radius", (value) => value.split(/\s+/).every(part)), []);
});

// The controls' heights: 24 chips, 28 compact, 32 default, 36 tabs.
const CONTROL = /\.btn\b|\.input\b|\bbutton\b|\binput\b|\bselect\b|\[role="tab"\]|\.chip\b|\.layer-tab\b|\.layer-edit\b|\.pk-mod\b|\.slotchip\b|\.value-btn\b|\.tok\b|\.act\b/;
// The macro recorder's Record button is the one control drawn larger, on
// purpose (decisions R: macro design A stands).
const HEIGHT_EXCEPTIONS = [/\[data-act="record"\]/];
// Whether a rule sizes a control itself, not something inside one: the
// subject of one of its selectors (its last compound) is a control.
const sizesControl = (selector) => selector.split(",").some((part) => CONTROL.test(part.trim().split(/\s*[\s>+~]\s*/).pop() || ""));
test("every control height is a height token", () => {
    const found = RULES.filter((rule) => sizesControl(rule.selector) && !exempt(rule.selector, HEIGHT_EXCEPTIONS))
        .flatMap((rule) => rule.declarations
            .filter((entry) => entry.property === "height" && !/^var\(--h-(chip|compact|control|tab)\)$/.test(entry.value) && !["auto", "100%"].includes(entry.value))
            .map((entry) => `${rule.selector} { height: ${entry.value} }`));
    assert.deepEqual(found, []);
});

// Opacity never dims text: a rule that sets a text colour sets it fully, and
// quiet or disabled text uses --text-2, --text-3 or --text-disabled. Fully
// hidden (0) is not dimming; an element being dragged fades as a whole.
const OPACITY_EXCEPTIONS = [/\.dragging\b/, /\.kc-/];
test("no rule dims text with opacity", () => {
    const found = RULES.filter((rule) => !exempt(rule.selector, OPACITY_EXCEPTIONS)
        && rule.declarations.some((entry) => entry.property === "color")
        && rule.declarations.some((entry) => entry.property === "opacity" && Number(entry.value) > 0 && Number(entry.value) < 1))
        .map((rule) => rule.selector);
    assert.deepEqual(found, []);
});

test("padding stays on a small set of steps", () => {
    const literals = new Set();
    for (const rule of RULES) {
        for (const entry of rule.declarations) {
            if (!/^padding(-|$)/.test(entry.property)) continue;
            for (const px of entry.value.matchAll(/(\d+(?:\.\d+)?)px/g)) literals.add(Number(px[1]));
        }
    }
    assert.ok(literals.size <= 24, `${literals.size} distinct padding literals: ${[...literals].sort((a, b) => a - b).join(", ")}`);
});

test("the token block declares every token the rules name", () => {
    const declared = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]));
    const used = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]));
    const set = ["--tab-tint", "--tint", "--combo", "--share", "--hc-tint", "--board-top"];
    assert.deepEqual([...used].filter((name) => !declared.has(name) && !set.includes(name)), []);
});
