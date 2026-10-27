// @ts-check
// A pointing slot's link, as the How it starts card offers it: a row per layer with
// whether it starts this pointing mode and whether this pointing mode's key
// turns it on, and why
// a switch cannot be used. The core publishes the rule
// (model.pdModeEditing.linkTargets, core/model/pointing-links.js); this only
// turns it into rows for one slot.

/**
 * @typedef {import("../../contracts/panel.js").PublishedModel} Model
 * @typedef {import("../../contracts/edits.js").PointingSlot} PointingSlot
 * @typedef {{layer: number, name: string, starts: boolean, key: boolean, unusable: boolean, why: string, tip: string,
 *   startLocked: boolean, keyLocked: boolean, startsOther: string, startTip: string}} LinkRow
 */

/** @param {Model | null} model @param {number} index */
const nameOf = (model, index) => {
    const layer = (model?.layers || []).find((entry) => entry.index === index);
    return layer ? layer.displayName || layer.name : `Layer ${index}`;
};

// Every layer the board has, in the tab order. A layer the keyboard ignores in
// a link (a default layer, the pointer layer) is unusable: it says why in its
// row, and neither switch can be turned on. A layer that starts another mode
// cannot start this one and names that mode, while its key switch stays
// usable. A switch that is on stays usable, so a layer stored before it became
// unusable can still be switched off (linkIgnored says it is ignored).
/** @param {Model | null} model @param {PointingSlot} slot @returns {LinkRow[]} */
export function linkRows(model, slot) {
    const targets = model?.pdModeEditing?.linkTargets || [];
    const words = model?.vocabulary?.pointing?.linkInert, already = model?.vocabulary?.pointing?.linkLabels?.startsOther || "";
    return (model?.layers || []).map((layer) => {
        const target = targets.find((entry) => entry.layer === layer.index);
        const name = layer.displayName || layer.name;
        const starts = Boolean(slot.linkedLayers & 2 ** layer.index), key = Boolean(slot.linkTurnsOn & 2 ** layer.index);
        const unusable = Boolean(target?.refusal);
        const other = target && target.linkedBy !== null && target.linkedBy !== slot.id ? target.linkedByName : "";
        return {layer: layer.index, name, starts, key, unusable, why: unusable && target?.inert && words ? words[target.inert] : "", tip: target?.refusal || "",
            startLocked: !starts && (unusable || Boolean(other)), keyLocked: !key && unusable,
            startsOther: other ? `${already} ${other}` : "", startTip: other ? `${name} ${already} ${other}: a layer starts one pointing mode. It can still be turned on by this pointing mode's key.` : ""};
    });
}

// Why the keyboard ignores layers the slot's link stores ("" when it ignores
// none): the pointer or default layers can move under a link after it was made.
/** @param {Model | null} model @param {PointingSlot} slot */
export function linkIgnored(model, slot) {
    const named = slot.linkedLayers | slot.linkTurnsOn;
    return (model?.pdModeEditing?.linkTargets || []).filter((entry) => named & 2 ** entry.layer && entry.refusal).map((entry) => entry.refusal).join(" ");
}

// The pointer layer's name and the names of the layers it covers among those
// the mode's key turns on, as the core publishes them (slot.pointerCovers,
// core/model/pointing-links.js); null when it covers none.
/** @param {Model | null} model @param {{pointerCovers?: number}} slot @returns {{pointer: string, covered: string[]} | null} */
export function pointerLayerCovers(model, slot) {
    const pointer = model?.pdModeEditing?.pointerLayer, covers = slot.pointerCovers ?? 0;
    if (pointer === null || pointer === undefined || !covers) return null;
    const covered = Array.from({length: pointer}, (_, index) => index).filter((index) => covers & 2 ** index).map((index) => nameOf(model, index));
    return {pointer: nameOf(model, pointer), covered};
}
