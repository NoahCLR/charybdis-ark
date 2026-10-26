// @ts-check
// A pointing slot as a record the keyboard stores, built from its form.
//
// Pure, so the posted record is testable: tests/view/edits.test.mjs stages what
// readConfig() returns against a real draft.

/**
 * @typedef {import("../../contracts/edits.js").PdConfig} PdConfig
 * @typedef {import("../../contracts/edits.js").PdSlot} PdSlot
 * @typedef {import("../../contracts/edits.js").PdTap} PdTap
 * @typedef {import("../../contracts/edits.js").Scalar} Scalar
 */

import {macroIndex} from "./keyvalues.mjs";

export const KIND = {DIRECTIONAL: 1, SCROLLING: 2};
// A slot's link (firmware D-F62): two layer masks, the layers that start the
// mode and the layers its key turns on, and what ends a mode its layers
// started: a higher layer, or any layer outside both sets. Every link field
// zero is no link.
export const LINK_ENDS = {NOTHING: 0, HIGHER_LAYER: 1, OTHER_LAYER: 2};
// What a direction's shortcut does with modifiers held while it sends: they
// apply, the chosen ones are left out, or the shortcut is sent exactly.
export const MODIFIER_POLICY = {INHERIT: 0, MASK: 1, EXACT: 2};
export const DIRECTIONS = [["up", "Up"], ["left", "Left"], ["right", "Right"], ["down", "Down"]];
export const AXIS = {VERTICAL: 0, HORIZONTAL: 1, DOMINANT: 2, EIGHT: 3};
// A scrolling mode keeps which axes it scrolls in the same stored byte.
export const SCROLL_AXES = {BOTH: 0, HORIZONTAL: 1, VERTICAL: 2};
// The axes a slot scrolls; a slot only just switched to scrolling still holds
// its directional axis, which means nothing here, so it starts on both.
/** @param {{kind: number, axis?: number}} slot */
export const scrollAxesOf = (slot) => slot.kind === KIND.SCROLLING ? slot.axis ?? SCROLL_AXES.BOTH : SCROLL_AXES.BOTH;
// Eight directions add the diagonals, stored beside the straight directions.
export const DIAGONALS = [["upLeft", "Up-left"], ["upRight", "Up-right"], ["downLeft", "Down-left"], ["downRight", "Down-right"]];
// The directions each axis setting reads. The keyboard refuses a mode that
// keeps a shortcut or a threshold on an axis it does not read, so the form
// draws only these and the record carries the others as zero.
/** @type {Record<number, string[]>} */
export const AXIS_DIRECTIONS = {
    [AXIS.VERTICAL]: ["up", "down"],
    [AXIS.HORIZONTAL]: ["left", "right"],
    [AXIS.DOMINANT]: ["up", "left", "right", "down"],
    [AXIS.EIGHT]: ["up", "left", "right", "down"],
};
/** @param {number} axis */
export const axisReads = (axis) => AXIS_DIRECTIONS[axis] || AXIS_DIRECTIONS[AXIS.DOMINANT];
/** @param {number} axis */
export const readsHorizontal = (axis) => axisReads(axis).includes("left");
/** @param {number} axis */
export const readsVertical = (axis) => axisReads(axis).includes("up");
// Every scroll field the record holds, in its stored order; the words for
// them come with the model (vocabulary.pointing.scrollFields).
export const SCROLL_FIELDS = [["thresholdH"], ["thresholdV"], ["divisorH"], ["divisorV"], ["intervalMs"], ["expireMs"], ["lockMs"],
    ["startNumerator"], ["startDenominator"], ["sustainNumerator"], ["sustainDenominator"], ["decayDivisor"]];

// A pointing mode's pointer speed, as select options. The list is the app's
// one DPI list, which arrives with the model (core/model/pointer-dpi.js); a
// stored value outside it is shown in its place as stored, never replaced,
// because the firmware accepts it.
/** @param {{value: number, label: string}[] | null | undefined} choices @param {Scalar | null | undefined} current */
export function dpiOptions(choices, current) {
    /** @type {[number, string][]} */
    const options = (choices || []).map(({value, label}) => [value, label]);
    const value = Number(current ?? 0);
    if (Number.isInteger(value) && !options.some(([choice]) => choice === value)) {
        const at = options.findIndex(([choice]) => choice > value);
        options.splice(at < 0 ? options.length : at, 0, [value, `${value} DPI · as stored`]);
    }
    return options;
}

// A slot switched to another kind of movement starts from the firmware's own
// shipped tuning for that kind — Dragscroll's scroll record, speed and
// reversal, and Volume's vertical threshold — wherever the stored record is
// still empty, so the first field changed posts a valid mode instead of an
// all-zero one. Dragscroll reverses vertical scrolling and runs at 100 DPI
// (pd_config.c, NOAH_DRAGSCROLL_REVERSE_Y); a scrolling mode started at 0 and
// unreversed would scroll the other way, four or more times as fast.
export const SCROLL_STARTER = {thresholdH: 2, thresholdV: 3, divisorH: 6, divisorV: 8, intervalMs: 8, expireMs: 80, lockMs: 55,
    startNumerator: 7, startDenominator: 4, sustainNumerator: 5, sustainDenominator: 4, decayDivisor: 4, invert: 2};
export const SCROLL_STARTER_DPI = 100;
/** @typedef {{dpi: number, scroll: Record<string, number>}} ScrollStarter */
/** @type {ScrollStarter} */
export const SHIPPED_SCROLL = Object.freeze({dpi: SCROLL_STARTER_DPI, scroll: Object.freeze({...SCROLL_STARTER})});
// What a new scrolling mode copies: this keyboard's own Dragscroll (slot 0
// when it scrolls, else its first scrolling mode), so a new mode scrolls
// the way the one already in use does; the shipped tuning when there is none.
/** @param {readonly PdSlot[] | null | undefined} slots @returns {ScrollStarter} */
export function scrollStarter(slots) {
    const list = slots || [];
    const source = [list[0], ...list].find((slot) => slot?.kind === KIND.SCROLLING && SCROLL_FIELDS.some(([key]) => Number(slot.scroll?.[key])));
    if (!source) return SHIPPED_SCROLL;
    return {dpi: Number(source.dpi) || 0, scroll: {...Object.fromEntries(SCROLL_FIELDS.map(([key]) => [key, Number(source.scroll?.[key] ?? 0)])), invert: Number(source.scroll?.invert ?? 0)}};
}
/** @param {PdSlot} slot @param {number} kind @param {ScrollStarter} [starter] */
export function startingRecord(slot, kind, starter = SHIPPED_SCROLL) {
    if (kind === KIND.SCROLLING && !SCROLL_FIELDS.some(([key]) => Number(slot.scroll?.[key]))) return {...slot, dpi: starter.dpi, scroll: {...starter.scroll}};
    if (kind === KIND.DIRECTIONAL && !Number(slot.thresholdX) && !Number(slot.thresholdY)) return {...slot, axis: AXIS.VERTICAL, thresholdX: 0, thresholdY: DIRECTIONAL_STARTER_THRESHOLD};
    return slot;
}
// A new mode for an empty slot, from the firmware's shipped tuning: a
// directional mode reads the dominant axis at Volume's threshold with no
// shortcuts yet, a scrolling mode copies Dragscroll's record and speed. It is
// named after its slot and posted like any edit, so the keyboard stores a
// valid mode straight away and every field can then be changed.
/** @param {PdSlot} slot @param {number} kind @param {ScrollStarter} [starter] */
export function newMode(slot, kind, starter = SHIPPED_SCROLL) {
    const scrolling = kind === KIND.SCROLLING;
    const starting = scrolling
        ? {...slot, kind, axis: 0, thresholdX: 0, thresholdY: 0, heldModifiers: 0, scroll: {...starter.scroll}}
        : {...slot, kind, axis: AXIS.DOMINANT, thresholdX: DIRECTIONAL_STARTER_THRESHOLD, thresholdY: DIRECTIONAL_STARTER_THRESHOLD, emptyDirection: 0, directionOutput: 0};
    return readConfig(starting, {kind: () => kind, name: () => `Mode ${slot.id}`, dpi: () => String(scrolling ? starter.dpi : 0)});
}
// Volume's vertical threshold, the firmware's shipped tuning for a directional
// axis. An axis the stored record did not read has a zero threshold, which the
// keyboard refuses once the axis is read, so switching it on starts here.
export const DIRECTIONAL_STARTER_THRESHOLD = 60;
// The record posted for a slot. The slot is posted whole, with the fields the
// form owns replaced — the firmware stores one record, so half a record is
// never sent. `form` maps each drawn field to a reader; a field that is not
// drawn keeps the value the slot was read with.
/** @param {PdSlot} slot @param {import("../../contracts/edits.js").PdForm} form @returns {PdConfig} */
export function readConfig(slot, form) {
    /** @param {Scalar | null | undefined} value @param {number} fallback */
    const number = (value, fallback) => {
        const text = String(value ?? "").trim();
        return /^\d+$/.test(text) ? Number(text) : fallback;
    };
    const kind = form.kind();
    /** @type {PdConfig} */
    const config = {
        id: slot.id,
        kind,
        name: form.name(),
        dpi: number(form.dpi(), slot.dpi),
        pointerLayer: form.pointerLayer ? form.pointerLayer() : slot.pointerLayer,
        ...linkRecord(slot, form),
    };
    if (kind === KIND.DIRECTIONAL) {
        const axis = form.axis ? form.axis() : slot.axis;
        // A threshold is zero on an axis that is not read, and starts from the
        // shipped tuning on one that has just been switched on. A zero typed
        // into an axis that was already read is posted as typed.
        /** @param {boolean} reads @param {boolean} wasRead @param {number} value */
        const threshold = (reads, wasRead, value) => {
            if (!reads) return 0;
            return !value && !wasRead ? DIRECTIONAL_STARTER_THRESHOLD : value;
        };
        config.axis = axis;
        config.thresholdX = threshold(readsHorizontal(axis), readsHorizontal(slot.axis), number(form.thresholdX?.(), slot.thresholdX));
        config.thresholdY = threshold(readsVertical(axis), readsVertical(slot.axis), number(form.thresholdY?.(), slot.thresholdY));
        const reads = axisReads(axis);
        config.directions = Object.fromEntries(DIRECTIONS.map(([direction]) => [direction, reads.includes(direction) ? tapRecord({
            keycode: (form[`dir:${direction}`]?.() ?? String(slot.directions?.[direction]?.keycode ?? 0)) || "0",
            modifierPolicy: form[`dirPolicy:${direction}`]?.() ?? slot.directions?.[direction]?.modifierPolicy ?? 0,
            mask: form[`dirMask:${direction}`]?.() ?? slot.directions?.[direction]?.mask ?? 0,
        }) : tapRecord({})]));
        // Diagonals exist only in eight-direction mode; any other axis
        // carries them as zero, which the keyboard requires.
        const eight = axis === AXIS.EIGHT;
        config.diagonals = Object.fromEntries(DIAGONALS.map(([diagonal]) => [diagonal, eight ? tapRecord({
            keycode: (form[`diag:${diagonal}`]?.() ?? String(slot.diagonals?.[diagonal]?.keycode ?? 0)) || "0",
            modifierPolicy: form[`diagPolicy:${diagonal}`]?.() ?? slot.diagonals?.[diagonal]?.modifierPolicy ?? 0,
            mask: form[`diagMask:${diagonal}`]?.() ?? slot.diagonals?.[diagonal]?.mask ?? 0,
        }) : tapRecord({})]));
        config.emptyDirection = form.emptyDirection ? form.emptyDirection() : slot.emptyDirection ?? 0;
        config.directionOutput = form.directionOutput ? form.directionOutput() : slot.directionOutput ?? 0;
    } else {
        config.axis = form.scrollAxes ? form.scrollAxes() : scrollAxesOf(slot);
        config.heldModifiers = form.heldModifiers ? form.heldModifiers() : slot.heldModifiers;
        config.scroll = Object.fromEntries(SCROLL_FIELDS.map(([key]) => [key,
            number(form[`scroll:${key}`]?.(), slot.scroll?.[key] ?? 0)]));
        config.scroll.invert = form.invert ? form.invert() : slot.scroll?.invert ?? 0;
    }
    return config;
}

// A slot's link as the keyboard stores it, from the How it starts card. What ends
// the mode goes back to Never with the last layer that starts it, which it
// needs.
/** @param {PdSlot} slot @param {import("../../contracts/edits.js").PdForm} form @returns {Pick<PdConfig, "linkedLayers" | "linkTurnsOn" | "linkEnds">} */
function linkRecord(slot, form) {
    const layers = form.linkedLayers ? form.linkedLayers() : slot.linkedLayers;
    const turnsOn = form.linkTurnsOn ? form.linkTurnsOn() : slot.linkTurnsOn;
    const ends = layers ? (form.linkEnds ? form.linkEnds() : slot.linkEnds) : LINK_ENDS.NOTHING;
    return {linkedLayers: layers, linkTurnsOn: turnsOn, linkEnds: ends};
}

// One direction's shortcut as the keyboard stores it: no shortcut stores
// nothing at all, and a modifier mask goes only with "Ignore", which needs
// one. Clearing a shortcut that left out modifiers therefore posts an empty
// direction rather than a mask the keyboard refuses.
/** @param {Partial<PdTap>} tap */
export function tapRecord({keycode, modifierPolicy, mask}) {
    const code = String(keycode ?? "").trim() || "0";
    if (macroIndex(code) !== null) return {keycode: code, modifierPolicy: MODIFIER_POLICY.INHERIT, mask: 0};
    if (code === "0") return {keycode: "0", modifierPolicy: MODIFIER_POLICY.INHERIT, mask: 0};
    const policy = Number(modifierPolicy) || MODIFIER_POLICY.INHERIT;
    return {keycode: code, modifierPolicy: policy, mask: policy === MODIFIER_POLICY.MASK ? Number(mask) || 0 : 0};
}
// Every direction and diagonal shortcut of a directional record, by its form
// key's suffix and where it sits in the record.
/** @type {{key: string, group: 'directions' | 'diagonals', name: string, label: string}[]} */
export const TAP_ROWS = [...DIRECTIONS.map(([name, label]) => ({key: `dir:${name}`, group: /** @type {const} */ ("directions"), name, label})),
    ...DIAGONALS.map(([name, label]) => ({key: `diag:${name}`, group: /** @type {const} */ ("diagonals"), name, label}))];
// "Ignore" is stored only with the modifiers it leaves out, and they are
// chosen after it, so until then the direction posts as the slot stored it
// and the editor holds the choice.
/** @param {PdSlot} slot @param {PdConfig} config */
export function settleTaps(slot, config) {
    /** @type {Record<string, PdTap>} */
    const pending = {};
    if (config.kind !== KIND.DIRECTIONAL) return {config, pending};
    const settled = {...config, directions: {...config.directions}, diagonals: {...config.diagonals}};
    for (const {key, group, name} of TAP_ROWS) {
        const tap = settled[group][name];
        if (tap.modifierPolicy !== MODIFIER_POLICY.MASK || tap.mask) continue;
        pending[key] = tap;
        /** @type {Partial<PdTap>} */
        const stored = slot[group]?.[name] || {};
        settled[group][name] = tapRecord({keycode: tap.keycode, modifierPolicy: stored.modifierPolicy, mask: stored.mask});
    }
    return {config: settled, pending};
}

// The DPI a mode runs at: its own, or the normal pointer DPI the keyboard
// reports when it keeps that.
/** @param {{dpi: number}} slot @param {{id: string, fields?: {macro: string, value?: Scalar}[]}[] | null | undefined} configDefaults */
export function modeDpi(slot, configDefaults) {
    if (Number(slot.dpi)) return Number(slot.dpi);
    const field = (configDefaults || []).find((section) => section.id === "normalPointerSpeed")?.fields?.find((entry) => entry.macro === "normalDpi");
    return Number(field?.value) || 0;
}
// About how far the ball turns before a threshold of sensor counts is
// reached at a DPI, short for beside the value and in full for its tip;
// null when either is unknown.
/** @param {Scalar} counts @param {Scalar} dpi */
export function thresholdDistance(counts, dpi) {
    const value = Number(counts), speed = Number(dpi);
    if (!value || !speed) return null;
    const mm = value / speed * 25.4, text = mm < 10 ? mm.toFixed(1) : String(Math.round(mm));
    return {short: `≈ ${text} mm`, long: `Sensor counts: about ${text} mm of ball movement at ${speed} DPI.`};
}
