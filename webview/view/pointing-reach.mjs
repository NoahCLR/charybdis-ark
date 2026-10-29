// @ts-check
// The pointing modes a layer reaches, by their keys or by turning on a layer
// that starts them (firmware D-F62), and the slot a keycode belongs to.
import {keyMeaning, spellingsOf} from "./keyface.mjs";
import {viewLayers} from "./layer-resolution.mjs";
import {reachGroups, reachInView} from "./reach.mjs";
import {comboOutput} from "./combo-reach.mjs";
import {layerCalled} from "./vocabulary.mjs";
import {linkStartHolds} from "../../rules/pointing-link-starts.mjs";
/** @typedef {import("../../contracts/panel.js").Layer} Layer */
/** @typedef {import("./keyface-types.js").PointingSlot} PointingSlot */
/** @typedef {import("./keyface-types.js").ReachEntry} ReachEntry */
/** @typedef {import("./keyface-types.js").ViewModel} ViewModel */

/**
 * Pointing modes, grouped the same four ways. A mode is reached by the key that
 * holds or locks it, by a transparent key letting a lower one do so, or by a
 * behaviour branch or combo that sends its keycode. A layer that starts it
 * (its link, firmware D-F62) reaches it by turning on: On this layer, with no
 * key at all, and wherever a route turns that layer on (startedRoutes).
 */
/** @param {ViewModel} model @param {Layer[]} stack @param {number} at @returns {import("./keyface-types.js").ReachGroup} */
export const pointingReach = (model, stack, at) => {
    // A slot with no movement cannot be activated, so it is not a mode this
    // layer is missing either.
    const all = (model?.pdModes || []).filter((slot) => slot.kind).map((slot) => String(slot.id));
    const reach = reachGroups(model, stack, at, pointingNamesOf(model), all);
    const layer = stack[at]?.index ?? at, on = 2 ** layer;
    /** @param {ReachEntry[]} entries */
    const kept = (entries) => startedRoutes(model, entries, on);
    const groups = {onKeys: withLinkStarts(model, stack, [layer], kept(reach.onKeys)), fromBranches: kept(reach.fromBranches), fromCombos: kept(reach.fromCombos),
        throughKeys: kept(reach.throughKeys), fromBranchesBelow: kept(reach.fromBranchesBelow), fromCombosBelow: kept(reach.fromCombosBelow)};
    const reached = new Set(Object.values(groups).flat().map((entry) => entry.name));
    return {...groups, elsewhere: all.filter((name) => !reached.has(name))};
};

/**
 * The pointing modes reached by the layers on in the view the board shows:
 * the routes reachInView finds that reach a mode with those layers on, and
 * every mode a layer in view starts. A layer shown alone is the view by
 * itself; the layers always on join once layers are held, as in viewPositions.
 */
/** @param {ViewModel} model @param {Layer[]} stack @param {number} at @param {number[]} held */
export function pointingReachInView(model, stack, at, held) {
    const view = viewLayers(stack, at, held);
    const on = view.reduce((mask, layer) => mask | 2 ** layer, 0);
    return withLinkStarts(model, stack, view, startedRoutes(model, reachInView(model, stack, at, held, pointingNamesOf(model)), on));
}

// What may reach a pointing mode: its own keycodes, and any keycode that turns
// on a layer starting it. Whether that start happens where the keycode is
// pressed is startedRoutes', which knows the layers on there.
/** @param {ViewModel} model @returns {import("./keyface-types.js").NamesOf} */
const pointingNamesOf = (model) => (keycode) => {
    const slot = pointingSlotFor(model, keycode);
    const turnsOn = layersTurnedOn(model, keycode);
    const started = turnsOn ? (model?.pdModes || []).filter((entry) => entry !== slot
        && (entry.linkStarts || []).some((start) => turnsOn & 2 ** start.layer)) : [];
    return [...(slot ? [slot] : []), ...started].map((entry) => String(entry.id));
};

// The layers a keycode turns on, as the core publishes them (qmkKeyTurnsOn,
// core/model/layer-effects.js keycodeLayersOn), read under the stored name, the
// name the core knows it by, or however the expression is spelled.
/** @param {ViewModel} model @param {string | undefined} keycode */
function layersTurnedOn(model, keycode) {
    const table = model?.qmkKeyTurnsOn || {};
    for (const key of spellingsOf(model, String(keycode ?? ""))) {
        if (Number.isInteger(table[key])) return table[key] >>> 0;
    }
    return 0;
}

// The layers by which `keycode` starts a slot's mode, as a mask: the layers it
// turns on that start the mode (slot.linkStarts, core/model/pointing-links.js),
// each only while no layer ending a start from it is on, with `on` (the layers
// on where it is pressed) and the layers it turns on. Zero for none.
/** @param {ViewModel} model @param {PointingSlot} slot @param {string | undefined} keycode @param {number} on */
function pointingStartsVia(model, slot, keycode, on) {
    const turnsOn = layersTurnedOn(model, keycode), active = on | turnsOn;
    return (slot.linkStarts || []).reduce((mask, start) =>
        turnsOn & 2 ** start.layer && linkStartHolds(start, active) ? mask | 2 ** start.layer : mask, 0) >>> 0;
}

// Of each entry, the routes that reach its mode as the keyboard runs it: those
// sending one of its own keycodes, and those that start it by turning on one
// of its layers as they act, with the layer they are pressed on still on
// (`on`), and, for a key or a behaviour a transparent key answers from a layer
// held below, that layer too. An entry left with no route is dropped. Each
// entry records, by keycode, the layers its routes start it through
// (`startVia`), so the tab says so without working it out again.
/** @param {ViewModel} model @param {ReachEntry[]} entries @param {number} on @returns {ReachEntry[]} */
function startedRoutes(model, entries, on) {
    /** @param {Layer | null | undefined} layer @param {boolean | undefined} whileHeld */
    const heldBelow = (layer, whileHeld) => (whileHeld && layer ? 2 ** layer.index : 0);
    return entries.flatMap((entry) => {
        const slot = (model?.pdModes || []).find((item) => String(item.id) === entry.name);
        if (!slot) return [entry];
        /** @type {Record<string, number>} */
        const startVia = {};
        /** @param {string} keycode @param {number} held */
        const reaches = (keycode, held) => {
            if (pointingSlotFor(model, keycode) === slot) return true;
            const mask = pointingStartsVia(model, slot, keycode, on | held);
            if (mask) startVia[keycode] = (startVia[keycode] ?? 0) | mask;
            return mask !== 0;
        };
        const keys = entry.keys.filter((key) => reaches(keyMeaning(key.position), heldBelow(key.layer, key.whileHeld)));
        const behaviours = entry.behaviours.filter((row) => reaches(row.action, heldBelow(row.layer, row.whileHeld)));
        const combos = entry.combos.filter((route) => reaches(route.action, route.keys.reduce((mask, key) => mask | heldBelow(key.layer, key.whileHeld), 0)));
        if (!keys.length && !behaviours.length && !combos.length) return [];
        return [{...entry, keys, behaviours, combos, ...(Object.keys(startVia).length ? {startVia} : {})}];
    });
}

// The layers of `on` that start each mode with all of them on, added to the
// entries a layer's keys reach: on the mode's entry if it has one, or as an
// entry of their own after the rest (slot.linkStarts, which leaves out the
// layers the keyboard ignores in a link).
/** @param {ViewModel} model @param {Layer[]} stack @param {number[]} on @param {ReachEntry[]} entries @returns {ReachEntry[]} */
function withLinkStarts(model, stack, on, entries) {
    const active = on.reduce((mask, layer) => mask | 2 ** layer, 0);
    const result = entries.map((entry) => ({...entry}));
    for (const slot of model?.pdModes || []) {
        const starts = (slot.linkStarts || []).filter((start) => linkStartHolds(start, active))
            .map((start) => stack.find((layer) => layer.index === start.layer)).filter((layer) => layer !== undefined);
        if (!starts.length) continue;
        const entry = result.find((item) => item.name === String(slot.id));
        if (entry) entry.starts = starts;
        else result.push({name: String(slot.id), keys: [], behaviours: [], combos: [], starts});
    }
    return result;
}

// A layout position carries the keyboard's own name for its keycode, which for
// a pointing mode is a bare user keycode (`QK_USER_16`) or, for a slot the
// vocabulary does not name at all, its hex. So resolve the alias the model
// published first, then fall back to the number: an empty slot has no name to
// match on, and its keycodes exist regardless.
/** @param {ViewModel} model @param {string | number | undefined} keycode */
export function pointingSlotFor(model, keycode) {
    const slots = model?.pdModes || [];
    const alias = model?.qmkKeycodeAliases?.[keycode ?? ""] ?? keycode;
    const named = slots.find((slot) => slot.keys && [slot.keys.hold, slot.keys.lock].includes(String(alias || "")));
    if (named) return named;
    const value = typeof keycode === "number" ? keycode : /^0x[0-9a-f]+$/i.test(String(keycode)) ? Number(keycode) : NaN;
    return Number.isInteger(value) ? slots.find((slot) => slotKeycodes(slot).includes(value)) : undefined;
}

// Which of a slot's two keycodes this is. Everything else about the mode is the
// same either way, so holding it or locking it on is the only thing a route
// has to carry beyond the slot itself.
/** @param {ViewModel} model @param {string | number | undefined} keycode */
export function pointingVariant(model, keycode) {
    const alias = model?.qmkKeycodeAliases?.[keycode ?? ""] ?? keycode;
    if (/_LOCK$/.test(String(alias))) return "lock";
    const slot = pointingSlotFor(model, keycode);
    const value = typeof keycode === "number" ? keycode
        : /^0x[0-9a-f]+$/i.test(String(keycode)) ? Number(keycode) : NaN;
    if (slot && Number.isInteger(value) && slotKeycodes(slot)[1] === value) return "lock";
    return "hold";
}

// The two values a slot answers to: hold and lock, as the core's key table
// (data/pd-mode-keys.js) gives them. Matching on the numbers rather than on names matters
// for an empty slot, whose record carries no name for the model to resolve —
// the keycode exists on the keyboard either way.
/** @param {PointingSlot} slot */
export const slotKeycodes = (slot) => slot.keys ? [slot.keys.holdCode, slot.keys.lockCode] : [];
// The same two keycodes by the names the model knows them by: hold, then lock.
/** @param {PointingSlot} slot */
export const slotKeycodeNames = (slot) => slot.keys ? [slot.keys.hold, slot.keys.lock] : [];

// What still reaches a pointing slot. The keyboard keeps its mode keycodes
// whatever a slot holds, so a key bound to an empty slot is inert rather than
// invalid — and the interface has to say which keys those are. Its keycodes
// go by every name the catalogue gives them: core names a combo's output by
// the keyboard's name for its value, which for a mode key is its hex, and
// what that output means is comboOutput's.
/** @param {ViewModel} model @param {PointingSlot | null | undefined} slot */
export function whatReachesSlot(model, slot) {
    if (!slot) return {keys: [], behaviours: [], combos: [], layers: []};
    const values = new Set(slotKeycodes(slot));
    const names = new Set(slotKeycodeNames(slot));
    for (const entry of model?.qmkKeycodes || []) {
        if (values.has(entry.keycode)) [entry.value, ...(entry.aliases || [])].forEach((name) => names.add(name));
    }
    const keys = [];
    /** @type {Set<string>} */
    const layers = new Set();
    for (const layer of model?.layers || []) {
        for (const position of layer.positions || []) {
            if (!names.has(position.keycode) && !(position.value !== undefined && values.has(position.value))) continue;
            keys.push({layer, position});
            layers.add(layerCalled(layer));
        }
    }
    const behaviours = (model?.keyBehaviors || []).filter((row) => (row.steps || []).some((step) =>
        [step.tap, step.hold, step.longHold].some((tier) => (tier?.action !== undefined && names.has(tier.action)))));
    const combos = (model?.combos || []).filter((row) => names.has(comboOutput(model, row)));
    return {keys, behaviours, combos, layers: [...layers]};
}

// The keycode name that holds a slot's mode.
/** @param {PointingSlot} slot */
export const holdKeyName = (slot) => slot.keys?.hold || "";
