// @ts-check
/**
 * @typedef {import("../../../contracts/panel.js").PublishedModel | null} Model
 */
// What this layer reaches: the keys the board rings for the picked row, the
// tab counts, and the "Reached by" words every reach table shares.

import {esc} from "../../lib/dom.mjs";
import {actionLabel, behaviourRouteKeys, comboGroups, combosInView, macroKeycodes, macroReach, pointingReach, pointingSlotFor, reachInView, reachKeys, resolvedPositions} from "../../view/keyface.mjs";
import {heldLayers, layerName, layers, state} from "../../store.mjs";
import {reachEntries} from "../../view/reach-groups.mjs";
import {comboBadge} from "../marks.mjs";
import {behaviourRoute} from "./behaviour-selection.mjs";

// The keys the board rings: the ones that reach whatever row is picked in the
// open tab. A behaviour is found on the keys carrying it; anything a branch
// sends is found on the same keys, which is the whole point of saying so.
/** @param {Model} model */
export function reachHighlight(model) {
    const stack = layers(), at = state.layer;
    /** @param {Partial<ReturnType<typeof macroReach>> & {inView?: ReturnType<typeof reachInView>}} groups @param {string} picked */
    const found = (groups, picked) => {
        const [group, ...rest] = String(picked).split(":");
        const name = rest.join(":");
        return reachEntries(groups, group).find((entry) => String(entry.name) === name);
    };
    if (state.tab === "behaviours") return behaviourRouteKeys(model, stack, at, state.behaviourRow || "", behaviourRoute(), heldLayers());
    const picked = state.reachRow[/** @type {keyof typeof state.reachRow} */ (state.tab)];
    if (!picked) return [];
    if (state.tab === "combos") {
        if (picked.startsWith("view:")) {
            const entry = combosInView(model, stack, at, heldLayers()).find((row) => picked === `view:${row.combo.id}`);
            return entry?.keys.map((key) => key.position.layoutIndex) || [];
        }
        const groups = comboGroups(model, stack, at);
        const entry = [groups.onKeys, groups.throughKeys, groups.elsewhere].flat()
            .find((row) => picked.endsWith(`:${row.combo.id}`));
        return reachKeys(stack, at, entry);
    }
    if (state.tab === "macros") return reachKeys(stack, at, found(picked.startsWith("view:") ? {inView: macroView(model)} : macroReach(model, stack, at), picked),
        picked.startsWith("view:") ? heldLayers() : null);
    if (state.tab === "pointing") return reachKeys(stack, at, found(picked.startsWith("view:") ? {inView: pointingView(model)} : pointingReach(model, stack, at), picked),
        picked.startsWith("view:") ? heldLayers() : null);
    return [];
}

// A tab's number counts what the selected layer stores, not the selected key
// position or actions reached only through transparent keys on lower layers.
/** @param {ReturnType<typeof macroReach>} reach */
export const storedCount = (reach) =>
    new Set([...reach.onKeys, ...reach.fromBranches, ...reach.fromCombos].map((entry) => entry.name)).size;
/** @param {Model} model */
export const macroView = (model) => reachInView(model, layers(), state.layer, heldLayers(), macroKeycodes);
/** @param {Model} model */
export const pointingView = (model) => reachInView(model, layers(), state.layer, heldLayers(),
    (/** @type {string | undefined} */ keycode) => { const slot = pointingSlotFor(model, keycode); return slot ? [String(slot.id)] : []; });

// Where a reach came from, in the words of the thing that reaches it. A
// transparent key can be answered by more than one layer, so each is named —
// the default layer always answers, any other only while it is held too.
/** @param {{layer: import("../../../contracts/panel.js").Layer | null, whileHeld?: boolean}} entry */
export const sourceLabel = (entry) =>
    esc(layerName(entry.layer)) + (entry.whileHeld ? " when held" : "");

/** @param {(ReturnType<typeof resolvedPositions>[number] & {reference?: boolean})[]} keys */
export const keysReach = (keys) => {
    const indexes = [...new Set(keys.map((entry) => entry.position.layoutIndex))];
    const sources = [...new Set(keys.filter((entry) => entry.fellThrough).map(sourceLabel))];
    const matched = [...new Set(keys.filter((entry) => entry.reference).map((entry) => esc(layerName(entry.layer))))];
    return `index ${indexes.join(", ")}${sources.length ? ` · on ${sources.join(", ")}` : ""}${matched.length ? ` · matched on ${matched.join(", ")}` : ""}`;
};
// A behaviour that only answers through a transparent key still fires its
// branches, so it belongs here — named with the layer that holds it, because
// that is the part this layer does not store.
// A branch names both what it sends and the behaviour it comes from — but only
// when those differ from what the row is already titled with. A macro row is
// its own macro, so repeating it would be noise; a pointing mode is a slot, and
// which of its two keycodes a branch sends is the whole point.
// A key named in a reach reads as it does in the table's first column: its
// name, with the keycode beside it when the two differ.
/** @param {Model} model @param {string} keycode */
const namedKey = (model, keycode) => {
    const label = actionLabel(model, keycode);
    return label === String(keycode) ? esc(label) : `${esc(label)} <code class="dim">${esc(keycode)}</code>`;
};
/** @param {Model} model @param {ReturnType<typeof reachInView>[number]} entry */
export const branchReach = (model, entry, showSends = true) => entry.behaviours.map((row) => {
    const from = `from ${namedKey(model, row.keycode)}`
        + (row.layer ? ` · on ${sourceLabel(row)}` : "");
    return showSends && row.action && String(entry.name) !== String(row.action)
        ? `sends ${namedKey(model, row.action)} · ${from}` : from;
}).join(", ");

// A combo is named by its badge and the keys chorded to fire it; one that
// fires a behaviour says so, since its branch is what sends the thing, and one
// that needs a transparent key names the layer answering for it.
/** @param {Model} model @param {ReturnType<typeof reachInView>[number]} entry */
export const comboReach = (model, entry, showSends = true) => entry.combos.map(({combo, via, action, keys}) => {
    const inputs = (combo.inputDisplays || combo.inputs || []).join(" + ");
    const sources = [...new Set(keys.filter((key) => key.fellThrough).map(sourceLabel))];
    return `${comboBadge(model, combo.badge)} ${esc(inputs)}`
        + (via ? ` · through ${namedKey(model, via)}` : "")
        + (showSends && action && String(entry.name) !== String(action) ? ` · sends ${namedKey(model, action)}` : "")
        + (sources.length ? ` · on ${sources.join(", ")}` : "");
}).join(", ");

// Every way this layer reaches one thing, not only the way it was grouped by.
// A macro can sit on a key here *and* be fired from a behaviour's branch; the
// board rings both sets of keys, so the row has to name both or the two
// disagree about the same entry.
/** @param {Model} model @param {ReturnType<typeof reachInView>[number]} entry */
export const reachLabel = (model, entry) => [
    entry.keys?.length ? keysReach(entry.keys) : "",
    entry.behaviours?.length ? branchReach(model, entry) : "",
    entry.combos?.length ? comboReach(model, entry) : "",
].filter(Boolean).join(" · ");
