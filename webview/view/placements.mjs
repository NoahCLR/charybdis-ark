// @ts-check
// Where a set of keycodes is reached: on a layer, as a behaviour's action, or
// as a combo's output, and that said in one line. Pure, from #156's Trackball
// rules; Pointer settings uses it for the sniping keys.

/** @typedef {Partial<import("../../contracts/panel.js").PublishedModel> | null | undefined} Model */
/** @typedef {import("../../contracts/panel.js").PublishedModel} PublishedModel */
/** @typedef {{keys: {layer: PublishedModel["layers"][number], position: import("../../contracts/panel.js").Position}[], behaviours: PublishedModel["keyBehaviors"], combos: PublishedModel["combos"], layers: string[]}} Placements */

// A name is matched by the value the keyboard stores too, as a position keeps
// whatever the keyboard calls the keycode.
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
// The layers its keys are on and how many, then the behaviours and combos
// that send it. Nothing at all reads as "Not placed".
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
