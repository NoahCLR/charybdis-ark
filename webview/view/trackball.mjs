// @ts-check
// The Trackball screen's rules: what a mode reads as in the list, where a key
// is placed, how far the ball turns per step, which tuning the keyboard would
// refuse and why, and the templates an empty slot starts from.
//
// Pure, so every rule is tested (tests/view/trackball.test.mjs) and every
// template is staged against a real draft.

/**
 * @typedef {import("../../contracts/edits.js").PdConfig} PdConfig
 * @typedef {import("../../contracts/edits.js").PdSlot} PdSlot
 * @typedef {import("../../contracts/edits.js").Scalar} Scalar
 * @typedef {Partial<import("../../contracts/panel.js").PublishedModel> | null | undefined} Model
 */

import {AXIS, BUTTON, KIND, MODIFIER_POLICY, SCROLL_FIELDS, SHIPPED_SCROLL, axisReads, readConfig} from "./pointing-config.mjs";
import {keyName} from "./keyvalues.mjs";
import {actionLabel} from "./keyface.mjs";

// ── distance ────────────────────────────────────────────────────────────

const MM_PER_INCH = 25.4;
// How far the ball turns, in millimetres, for a number of sensor counts at a
// DPI, to one decimal; null when either is unknown.
/** @param {Scalar | null | undefined} counts @param {Scalar | null | undefined} dpi */
export function countsToMm(counts, dpi) {
    const value = Number(counts), speed = Number(dpi);
    if (!value || !speed) return null;
    return Math.round(value / speed * MM_PER_INCH * 10) / 10;
}
// The sensor counts nearest a distance in millimetres at a DPI: at least one,
// at most what the keyboard stores (16 bits). null for anything that is not a
// positive number, or with no DPI to convert at.
/** @param {Scalar | null | undefined} mm @param {Scalar | null | undefined} dpi */
export function mmToCounts(mm, dpi) {
    const text = String(mm ?? "").trim().replace(",", ".");
    const value = Number(text), speed = Number(dpi);
    if (!text || !Number.isFinite(value) || value <= 0 || !speed) return null;
    return Math.min(65535, Math.max(1, Math.round(value * speed / MM_PER_INCH)));
}

// The DPI a mode turns counts at: its own, or the normal speed when it keeps
// that. While sniping is on, a directional mode runs at the sniping speed
// instead; scrolling ignores sniping (pd_mode_lifecycle.c).
/** @param {{dpi?: Scalar}} slot @param {number} normal */
export const runningDpi = (slot, normal) => Number(slot.dpi) || normal || 0;

// The words beside a step's counts: "60 counts at 400 DPI", and for a
// directional mode what sniping does to it. Sniping lowers the DPI, so the
// same counts take more ball movement: the step is longer.
/** @param {Scalar} counts @param {number} dpi @param {{directional: boolean, sniping?: number}} options */
export function stepAside(counts, dpi, {directional, sniping = 0}) {
    const parts = [`${Number(counts) || 0} counts at ${dpi || "?"} DPI`];
    if (directional && sniping && sniping !== dpi) {
        const mm = countsToMm(counts, sniping);
        parts.push(`longer while sniping${mm ? ` (≈ ${mm} mm at ${sniping} DPI)` : ""}`);
    }
    return parts.join(" · ");
}

// ── the stored settings the fixed entries show ───────────────────────────

/** @param {Model} model @param {string} macro */
export function settingValue(model, macro) {
    for (const section of model?.configDefaults || []) {
        const field = section.fields?.find((entry) => entry.macro === macro);
        if (field) return field.kind === "toggle" ? Boolean(/** @type {{enabled?: boolean}} */ (field).enabled) : field.value;
    }
    return undefined;
}
/** @param {Model} model */
export const normalDpi = (model) => Number(settingValue(model, "normalDpi")) || 0;
/** @param {Model} model */
export const snipingDpi = (model) => Number(settingValue(model, "snipingDpi")) || 0;

// A layer reference ("Layer 3") as its name.
/** @param {Model} model @param {unknown} value */
export function layerWord(model, value) {
    const at = Number(String(value ?? "").replace(/^Layer\s+/, ""));
    const layer = (model?.layers || []).find((entry) => entry.index === at);
    return layer ? layer.displayName || layer.name : String(value ?? "");
}

// One line under each fixed entry in the list.
/** @param {Model} model */
export function fixedSummaries(model) {
    const normal = normalDpi(model), sniping = snipingDpi(model);
    const autoSniping = settingValue(model, "autoSniping"), mouse = settingValue(model, "autoMouse");
    const timeout = Number(settingValue(model, "mouseTimeout"));
    const seconds = Number.isFinite(timeout) ? `${Math.round(timeout / 100) / 10} s` : "";
    return {
        pointer: normal ? `${normal} DPI` : "Not read",
        sniping: [sniping ? `${sniping} DPI` : "Not read", autoSniping ? `auto on ${layerWord(model, settingValue(model, "snipingLayer"))}` : ""].filter(Boolean).join(" · "),
        mouseLayer: mouse === false ? "Off" : [layerWord(model, settingValue(model, "mouseLayer")), seconds].filter(Boolean).join(" · "),
    };
}

// The configured modes that keep the normal pointer speed, so changing it
// changes them too.
/** @param {readonly PdSlot[] | null | undefined} slots */
export const followsNormal = (slots) => (slots || []).filter((slot) => slot.kind && !Number(slot.dpi));

// ── where a key is placed ────────────────────────────────────────────────

/** @typedef {{keys: {layer: any, position: any}[], behaviours: any[], combos: any[], layers: string[]}} Placements */
// Everywhere a set of keycodes is reached: on a layer, as a behaviour's
// action, or as a combo's output. A name is matched by the value the keyboard
// stores too, as a position keeps whatever the keyboard calls the keycode.
/** @param {Model} model @param {readonly string[]} names @returns {Placements} */
export function keycodePlacements(model, names) {
    const wanted = new Set(names);
    const values = new Set((model?.qmkKeycodes || []).filter((entry) => wanted.has(entry.value)).map((entry) => entry.keycode));
    for (const entry of model?.qmkKeycodes || []) if (values.has(entry.keycode)) wanted.add(entry.value);
    const keys = [];
    /** @type {Set<string>} */
    const layers = new Set();
    for (const layer of model?.layers || []) {
        for (const position of layer.positions || []) {
            if (!wanted.has(position.keycode) && !wanted.has(position.semantic ?? "") && !(position.value !== undefined && values.has(position.value))) continue;
            keys.push({layer, position});
            layers.add(layer.displayName || layer.name);
        }
    }
    const behaviours = (model?.keyBehaviors || []).filter((row) => (row.steps || []).some((step) =>
        [step.tap, step.hold, step.longHold].some((tier) => tier?.action !== undefined && wanted.has(String(tier.action)))));
    const combos = (model?.combos || []).filter((row) => wanted.has(String(row.output)));
    return {keys, behaviours, combos, layers: [...layers]};
}

/** @param {number} count @param {string} one */
const plural = (count, one) => `${count} ${one}${count === 1 ? "" : "s"}`;
// Everything that reaches a mode or a key, in one line: the layers its keys
// are on and how many, then the behaviours and combos that send it. Nothing
// at all reads as "Not placed".
/** @param {Placements} placements */
export function reachLine({keys, behaviours, combos}) {
    /** @type {Map<string, number>} */
    const counts = new Map();
    for (const {layer} of keys) {
        const name = layer.displayName || layer.name;
        counts.set(name, (counts.get(name) || 0) + 1);
    }
    const parts = [...counts].map(([name, count]) => `${name} · ${plural(count, "key")}`);
    if (behaviours.length) parts.push(`${plural(behaviours.length, "behaviour")}`);
    if (combos.length) parts.push(`${plural(combos.length, "combo")}`);
    return parts.length ? parts.join(", ") : "Not placed";
}
/** @param {Placements} placements */
export const reachCount = ({keys, behaviours, combos}) => keys.length + behaviours.length + combos.length;

// ── what a mode sends ────────────────────────────────────────────────────

const MOD_KEYS = [[1, "KC_LCTL", "KC_RCTL"], [2, "KC_LSFT", "KC_RSFT"], [4, "KC_LALT", "KC_RALT"], [8, "KC_LGUI", "KC_RGUI"]];
// A shortcut a mode sends, in words as the computer's keys read: "Command + =",
// "Shift + Command + Z", "Volume Up". A left-hand modifier drops its side,
// as people say it; a right-hand one keeps it.
/** @param {Model} model @param {Scalar | null | undefined} code */
export function tapWords(model, code) {
    if (typeof code === "string") return code === "0" ? "" : actionLabel(model, code);
    const value = Number(code || 0);
    if (!value) return "";
    if (value >= 0x0100 && value <= 0x1fff) {
        const bits = (value >> 8) & 0x1f, right = Boolean(bits & 0x10);
        const base = keyName(model, value & 0xff);
        const mods = MOD_KEYS.filter(([bit]) => bits & /** @type {number} */ (bit)).map(([, left, rightKey]) => {
            const label = actionLabel(model, String(right ? rightKey : left));
            return right ? label : label.replace(/^Left\s+/, "");
        });
        if (base && !base.startsWith("0x")) return [...mods, actionLabel(model, base)].join(" + ");
    }
    return actionLabel(model, keyName(model, value));
}

const ARROW = /** @type {Record<string, string>} */ ({up: "↑", left: "←", right: "→", down: "↓"});
// A mode as one line in the list: a directional mode's directions in words,
// a scrolling mode's axes.
/** @param {Model} model @param {PdSlot} slot */
export function sendsLine(model, slot) {
    if (slot.kind === KIND.SCROLLING) {
        const axes = /** @type {Record<number, string>} */ ({0: "Scrolls both ways", 1: "Scrolls sideways", 2: "Scrolls up and down"});
        return axes[slot.axis ?? 0] || axes[0];
    }
    if (slot.kind !== KIND.DIRECTIONAL) return "Empty";
    const parts = [];
    for (const direction of axisReads(slot.axis)) {
        const words = tapWords(model, slot.directions?.[direction]?.keycode);
        if (words) parts.push(`${ARROW[direction]} ${words}`);
    }
    if (slot.axis === AXIS.EIGHT) parts.push("+ diagonals");
    return parts.length ? parts.join("  ") : "No shortcuts yet";
}

// ── the tuning the keyboard refuses ──────────────────────────────────────

// Each rule the firmware checks before it stores a mode (pd-mode-domain-v1.js,
// validatePdRecord), said for the field that breaks it, so a refusal names
// the field instead of the whole record.
/** @param {PdConfig} config @returns {Record<string, string>} */
export function modeProblems(config) {
    /** @type {Record<string, string>} */
    const problems = {};
    if (config.kind === KIND.DIRECTIONAL) {
        const reads = axisReads(config.axis ?? AXIS.DOMINANT);
        if (reads.includes("left") && !Number(config.thresholdX)) problems.thresholdX = "Sideways step must be more than 0.";
        if (reads.includes("up") && !Number(config.thresholdY)) problems.thresholdY = "Up and down step must be more than 0.";
        if (config.axis === AXIS.EIGHT && (!Number(config.thresholdX) || !Number(config.thresholdY))) {
            problems[Number(config.thresholdX) ? "thresholdY" : "thresholdX"] = "Eight directions needs a step on both axes.";
        }
        return problems;
    }
    if (config.kind !== KIND.SCROLLING) return problems;
    const s = /** @type {Record<string, number>} */ (config.scroll || {});
    /** @type {[string, string][]} */
    const positive = [["thresholdH", "Sideways activation"], ["thresholdV", "Up and down activation"],
        ["divisorH", "Sideways counts per wheel step"], ["divisorV", "Up and down counts per wheel step"], ["lockMs", "Axis lock timeout"]];
    for (const [key, label] of positive) if (!(s[key] > 0)) problems[key] = `${label} must be more than 0.`;
    if (s.lockMs > 0 && s.expireMs < s.lockMs) problems.expireMs = `Gesture expiry must be at least the axis lock timeout (${s.lockMs} ms).`;
    /** @param {string} top @param {string} bottom @param {string} label */
    const ratio = (top, bottom, label) => {
        if (!(s[top] > 0) || !(s[bottom] > 0)) problems[top] = `${label}: both numbers must be more than 0.`;
        else if (s[top] > 255 || s[bottom] > 255) problems[top] = `${label}: each number is at most 255.`;
        else if (s[top] < s[bottom]) problems[top] = `${label} must be at least 1:1.`;
    };
    ratio("startNumerator", "startDenominator", "Axis selection ratio");
    ratio("sustainNumerator", "sustainDenominator", "Axis retention ratio");
    if (!problems.startNumerator && !problems.sustainNumerator && s.sustainNumerator * s.startDenominator > s.startNumerator * s.sustainDenominator) {
        problems.sustainNumerator = `Axis retention ratio must not be more than the selection ratio (${s.startNumerator}:${s.startDenominator}).`;
    }
    if (!(s.decayDivisor >= 2)) problems.decayDivisor = "Cross-axis decay divisor must be at least 2.";
    else if (s.decayDivisor > 255) problems.decayDivisor = "Cross-axis decay divisor is at most 255.";
    return problems;
}

// What each scroll field does and what it accepts, for its hover help and
// the range shown beside it (from pd_mode_dragscroll.c).
/** @type {Readonly<Record<string, {help: string, range: string}>>} */
export const SCROLL_HELP = Object.freeze({
    thresholdH: {help: "Sensor counts the ball must move sideways before horizontal scrolling may start.", range: "1–65535 counts"},
    thresholdV: {help: "Sensor counts the ball must move up or down before vertical scrolling may start.", range: "1–65535 counts"},
    divisorH: {help: "Sensor counts for each sideways wheel step. Higher scrolls slower.", range: "1–65535 counts"},
    divisorV: {help: "Sensor counts for each up-and-down wheel step. Higher scrolls slower.", range: "1–65535 counts"},
    intervalMs: {help: "The shortest gap between two scroll reports. 0 sends as often as the ball moves.", range: "0–65535 ms"},
    expireMs: {help: "A pause this long ends the gesture and drops movement left over from it.", range: "at least the axis lock timeout"},
    lockMs: {help: "A pause this long frees the chosen axis, so the next movement can choose again.", range: "1–65535 ms"},
    startNumerator: {help: "To start scrolling one way, that axis must move this many times as far as the other: 7:4 is 1.75 times.", range: "at least 1:1"},
    sustainNumerator: {help: "The chosen axis keeps scrolling while it moves this many times as far as the other.", range: "1:1 up to the selection ratio"},
    decayDivisor: {help: "On each step, the other axis's leftover movement is divided by this, so a slight drift never scrolls.", range: "2–255"},
});

// ── templates ────────────────────────────────────────────────────────────

/** @typedef {{id: string, label: string, tip: string, shipped: boolean, record: (starter: import("./pointing-config.mjs").ScrollStarter) => Partial<PdConfig>}} Template */
/** @param {string} keycode @param {number} [modifierPolicy] @param {number} [mask] */
const tap = (keycode, modifierPolicy = MODIFIER_POLICY.INHERIT, mask = 0) => ({keycode, modifierPolicy, mask});
const NONE = tap("0");
/** @param {Partial<Record<"up" | "down" | "left" | "right", ReturnType<typeof tap>>>} set */
const directions = (set) => ({up: NONE, down: NONE, left: NONE, right: NONE, ...set});
const PASS = {kind: BUTTON.PASS_THROUGH, modifiers: 0, tap: NONE};
// The modes the firmware ships (keymaps/noah/pd_config.c), with their
// thresholds (pd_mode_defaults.h) and speeds (the keymap's settings), plus two Ark offers
// that it does not ship: Back / Forward (as Ark's demo has it) and Tabs.
/** @type {readonly Template[]} */
export const TEMPLATES = Object.freeze([
    {id: "volume", label: "Volume", shipped: true, tip: "Up and down change the volume, one step every 60 counts.",
        record: () => ({kind: KIND.DIRECTIONAL, axis: AXIS.VERTICAL, dpi: 0, thresholdY: 60, directions: directions({up: tap("KC_AUDIO_VOL_UP"), down: tap("KC_AUDIO_VOL_DOWN")})})},
    {id: "brightness", label: "Brightness", shipped: true, tip: "Up and down change the screen brightness.",
        record: () => ({kind: KIND.DIRECTIONAL, axis: AXIS.VERTICAL, dpi: 0, thresholdY: 60, directions: directions({up: tap("KC_BRIGHTNESS_UP"), down: tap("KC_BRIGHTNESS_DOWN")})})},
    {id: "zoom", label: "Zoom", shipped: true, tip: "Up zooms in (⌘ =), down zooms out (⌘ −), at 400 DPI.",
        record: () => ({kind: KIND.DIRECTIONAL, axis: AXIS.VERTICAL, dpi: 400, thresholdY: 80, directions: directions({up: tap("G(KC_EQL)"), down: tap("G(KC_MINS)")})})},
    {id: "scroll", label: "Scroll", shipped: true, tip: "Scrolling with this keyboard's Dragscroll tuning, speed and direction.",
        record: (/** @type {import("./pointing-config.mjs").ScrollStarter} */ starter) => ({kind: KIND.SCROLLING, axis: 0, dpi: starter.dpi, heldModifiers: 0, scroll: {...starter.scroll}})},
    {id: "arrows", label: "Arrows", shipped: true, tip: "The arrow keys on the stronger axis, back to the typing layer while it runs; buttons hold Shift, copy and paste.",
        record: () => ({kind: KIND.DIRECTIONAL, axis: AXIS.DOMINANT, dpi: 400, pointerLayer: 1, thresholdX: 40, thresholdY: 50,
            directions: directions({left: tap("KC_LEFT"), right: tap("KC_RIGHT"), up: tap("KC_UP", MODIFIER_POLICY.MASK, 0x44), down: tap("KC_DOWN", MODIFIER_POLICY.MASK, 0x44)}),
            buttons: [{kind: BUTTON.HOLD_MODIFIERS, modifiers: 0x20, tap: NONE},
                {kind: BUTTON.TAP, modifiers: 0, tap: tap("G(KC_C)", MODIFIER_POLICY.EXACT)},
                {kind: BUTTON.TAP, modifiers: 0, tap: tap("G(KC_V)", MODIFIER_POLICY.EXACT)}]})},
    {id: "undoRedo", label: "Undo / Redo", shipped: true, tip: "Left undoes (⌘ Z), right redoes (⇧ ⌘ Z), at 100 DPI.",
        record: () => ({kind: KIND.DIRECTIONAL, axis: AXIS.HORIZONTAL, dpi: 100, thresholdX: 40, directions: directions({left: tap("G(KC_Z)"), right: tap("S(G(KC_Z))")})})},
    {id: "backForward", label: "Back / Forward", shipped: false, tip: "Left and right click mouse buttons 4 and 5: back and forward in most browsers.",
        record: () => ({kind: KIND.DIRECTIONAL, axis: AXIS.HORIZONTAL, dpi: 0, thresholdX: 60, directions: directions({left: tap("MS_BTN4"), right: tap("MS_BTN5")})})},
    {id: "tabs", label: "Tabs", shipped: false, tip: "Left and right switch to the previous and next tab (Ctrl ⇧ Tab, Ctrl Tab).",
        record: () => ({kind: KIND.DIRECTIONAL, axis: AXIS.HORIZONTAL, dpi: 0, thresholdX: 60, directions: directions({left: tap("C(S(KC_TAB))"), right: tap("C(KC_TAB)")})})},
]);

// A template as the record posted for an empty slot: the slot's own id and
// the template's name, every field the template leaves out empty.
/** @param {PdSlot} slot @param {string} id @param {import("./pointing-config.mjs").ScrollStarter} [starter] @returns {PdConfig} */
export function templateMode(slot, id, starter = SHIPPED_SCROLL) {
    const template = TEMPLATES.find((entry) => entry.id === id);
    if (!template) throw new Error(`No trackball mode template named ${id}.`);
    const made = template.record(starter);
    /** @type {PdSlot} */
    const record = {
        ...slot, pointerLayer: 0, axis: 0, heldModifiers: 0, thresholdX: 0, thresholdY: 0, emptyDirection: 0, directionOutput: 0,
        directions: directions({}), diagonals: {upLeft: NONE, upRight: NONE, downLeft: NONE, downRight: NONE},
        buttons: [PASS, PASS, PASS],
        scroll: Object.fromEntries(SCROLL_FIELDS.map(([key]) => [key, 0])),
        ...made, id: slot.id, kind: Number(made.kind), name: template.label, dpi: Number(made.dpi) || 0,
    };
    return readConfig(record, {kind: () => record.kind, name: () => template.label, dpi: () => String(record.dpi)});
}
