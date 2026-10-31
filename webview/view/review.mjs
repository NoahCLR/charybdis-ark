// @ts-check
// The draft review: what it lists and how it hangs together.
//
// The core sends one item per thing that differs from the keyboard — a key,
// a behaviour, a pointing slot, a settings section — with whether it was
// added, changed or removed, the fields that differ, the group its edits tie
// it to, and where it is edited. These arrange that for reading: every item
// sits under its own area, groups become blocks with one Discard, and every
// item knows how to go to its editor.

import {screenOfSection} from "./settings-layout.mjs";
import {listed, stageOrder, vocabulary} from "./vocabulary.mjs";

// The review units read here by name: core's (core/model/review-units.js),
// copied since the interface may not import core and pinned by
// tests/view/enum-drift.test.mjs.
export const LAYER_ORDER_UNIT = "layerOrder", OTHER_KEY_OPTIONS_UNIT = "settings:otherKeyOptions";

// The order areas are read in, as the rail lists the screens they live on.
const AREAS = ["Keys", "Layers", "Behaviours", "Combos", "Custom keys", "Macros", "Mouse", "Pointing modes", "Lighting", "Settings", "Profile", "Recovery"];
// An area's place in that order; one the rail does not list comes last.
/** @param {string} area */
export const areaRank = (area) => (AREAS.indexOf(area) + 1 || AREAS.length + 1);

// Items by area, in rail order, and within an area as blocks in the order the
// core listed them. A group whose items span areas is shown in each area as
// the part of it that lives there: every part carries the group's size, for
// its Discard, and the other areas it reaches, so a swap of two layers reads
// as keys under Keys, behaviours under Behaviours, and so on.
/** @param {readonly import("../../contracts/model.js").ReviewChange[]} changes */
export function reviewBlocks(changes) {
    /** @type {Map<number | null | undefined, {size: number, areas: Set<string>}>} */
    const reach = new Map();
    for (const change of changes) {
        const group = reach.get(change.group) ?? {size: 0, areas: new Set()};
        group.size++;
        group.areas.add(change.area);
        reach.set(change.group, group);
    }
    /** @type {Map<string, Map<number | string, import("./types.js").ReviewBlock>>} */
    const sections = new Map();
    changes.forEach((change, index) => {
        if (!sections.has(change.area)) sections.set(change.area, new Map());
        const blocks = /** @type {Map<number | string, import("./types.js").ReviewBlock>} */ (sections.get(change.area)), key = change.group ?? `solo:${index}`;
        if (!blocks.has(key)) {
            const group = change.group === null || change.group === undefined ? {size: 1, areas: new Set([change.area])} : /** @type {{size: number, areas: Set<string>}} */ (reach.get(change.group));
            blocks.set(key, {group: change.group, title: change.groupTitle || null, area: change.area, size: group.size,
                elsewhere: [...group.areas].filter((area) => area !== change.area).sort((left, right) => areaRank(left) - areaRank(right)), items: []});
        }
        blocks.get(key)?.items.push(change);
    });
    return [...sections.keys()].sort((left, right) => areaRank(left) - areaRank(right)).map((area) => {
        const blocks = [.../** @type {Map<number | string, import("./types.js").ReviewBlock>} */ (sections.get(area)).values()];
        return {area, blocks, count: blocks.reduce((total, block) => total + block.items.length, 0)};
    });
}

// "3 added · 4 changed · 1 removed", leaving out a status nothing has.
/** @param {readonly Pick<import("../../contracts/model.js").ReviewChange, "status">[]} changes */
export function statusSummary(changes) {
    const counts = {added: 0, changed: 0, removed: 0};
    for (const change of changes) if (change.status in counts) counts[change.status]++;
    return Object.entries(counts).filter(([, count]) => count).map(([status, count]) => `${count} ${status}`).join(" · ");
}

// The same, beside a count that already says how many: only when it tells
// more than that count, so "1 change" is never followed by "1 changed".
/** @param {readonly Pick<import("../../contracts/model.js").ReviewChange, "status">[]} changes */
export const statusBesideCount = (changes) => changes.every((change) => change.status === "changed") ? "" : statusSummary(changes);

// A profile file's differences as counts, by what they configure rather than
// by which screen stores them: the categories of the rail, each split the way
// its screen is, and the Settings sections filed with what they tune (Key
// Timing with keys, Lighting Feedback with lighting). A section edited on a
// lighting stage counts with that stage. `names` are the file's layer names;
// the lighting stages, in paint order, and the settings sections are named as
// the vocabulary words them (`stages`, `fileSections`). Core words an
// unnamed layer's name (ProfileSummary.names).
const CATEGORIES = ["Keys", "Lighting", "Macros", "Mouse", "Pointing modes", "Other"];
// A custom key's name is counted with the keys, where its behaviour is too.
// Each settings section's category and its row's place there; its words are
// the vocabulary's (tests/view/review.test.mjs holds the two to one set).
/** @type {Readonly<Record<string, [string, number]>>} */
export const SECTION_ROWS = {
    keyTiming: ["Keys", 31], startupLayers: ["Keys", 22], behaviorSettings: ["Keys", 32], comboSettings: ["Keys", 40], comboReferences: ["Keys", 41],
    keyboardOptions: ["Keys", 50], lightingPower: ["Lighting", -1], rgbAppearance: ["Lighting", 1], lightingFeedback: ["Lighting", 15],
    normalPointerSpeed: ["Mouse", 1], sniping: ["Mouse", 2], autoMouse: ["Mouse", 3],
};
/** @param {string} id @param {Readonly<Record<string, string>>} sections @returns {[string, string, number] | undefined} */
function sectionRow(id, sections) {
    const row = Object.hasOwn(SECTION_ROWS, id) ? SECTION_ROWS[id] : undefined;
    return row && [row[0], sections[id] || id, row[1]];
}
// Where one difference is counted: its category, its row's words, and the
// row's place within the category.
/** @param {import("../../contracts/model.js").ReviewSummary} item @param {readonly string[]} names @param {readonly {id: string, label: string}[]} stages @param {Readonly<Record<string, string>>} sections @returns {[string, string, number]} */
function categoryOf(item, names, stages, sections) {
    const place = item.place;
    switch (place?.kind) {
        case "key": return ["Keys", `Keys on ${names[place.layer] ?? ""}`, place.layer];
        case "layers": return item.unit === LAYER_ORDER_UNIT ? ["Keys", "Layer priority", 20] : ["Keys", "Layer names", 21];
        case "behaviour": return ["Keys", "Behaviours", 30];
        case "combo": return ["Keys", "Combos", 40];
        case "macro": return ["Macros", "Macros", 0];
        case "customKey": return ["Keys", "Custom keys", 35];
        case "pointing": return ["Pointing modes", "Pointing modes", 0];
        case "lighting": {
            if (!place.stage) return ["Lighting", "Stages on or off", 0];
            if (place.stage === "groups") return ["Lighting", "LED groups", 20];
            return stageRow(place.stage, stages);
        }
        case "settings": return place.stage ? stageRow(place.stage, stages) : sectionRow(place.section || "", sections)
            || (item.unit === OTHER_KEY_OPTIONS_UNIT ? sectionRow("keyboardOptions", sections) : undefined) || ["Other", item.title, 0];
        default: return ["Other", item.title, 0];
    }
}
/** @param {string} id @param {readonly {id: string, label: string}[]} stages @returns {[string, string, number]} */
function stageRow(id, stages) {
    const index = stages.findIndex((stage) => stage.id === id);
    return ["Lighting", stages[index]?.label || id, 10 + Math.max(index, 0)];
}
/** @param {import("./vocabulary.mjs").VocabularyModel | null | undefined} model @param {readonly import("../../contracts/model.js").ReviewSummary[]} items @param {{names?: readonly string[]}} [options] */
export function categorySummary(model, items, {names = []} = {}) {
    const stages = stageOrder(model), sections = vocabulary(model).fileSections;
    /** @type {Map<string, {items: import("../../contracts/model.js").ReviewSummary[], rows: Map<string, {label: string, order: number, count: number}>}>} */
    const categories = new Map();
    for (const item of items) {
        const [category, label, order] = categoryOf(item, names, stages, sections);
        if (!categories.has(category)) categories.set(category, {items: [], rows: new Map()});
        const entry = /** @type {NonNullable<ReturnType<typeof categories.get>>} */ (categories.get(category));
        entry.items.push(item);
        if (!entry.rows.has(label)) entry.rows.set(label, {label, order, count: 0});
        const row = entry.rows.get(label);
        if (row) row.count++;
    }
    /** @param {string} category */
    const rank = (category) => CATEGORIES.indexOf(category);
    // A category whose one row is itself, as Macros is, has no rows to show.
    return [...categories].sort(([left], [right]) => rank(left) - rank(right)).map(([category, entry]) => {
        const rows = [...entry.rows.values()].sort((left, right) => left.order - right.order).map(({label, count}) => ({label, count}));
        return {category, count: entry.items.length, status: statusSummary(entry.items), rows: rows.length === 1 && rows[0].label === category ? [] : rows};
    });
}

// A group's Discard names how much it takes back, counting the parts shown
// under other areas too; an item on its own says Discard.
/** @param {Pick<import("./types.js").ReviewBlock, "size">} block */
export const discardLabel = (block) => block.size === 1 ? "Discard" : block.size === 2 ? "Discard both" : `Discard all ${block.size}`;

// What a group's header says about its size: all of it, or the part here and
// where the rest is.
/** @param {Pick<import("./types.js").ReviewBlock, "size" | "items" | "elsewhere">} block */
export const groupNote = (block) => block.items.length === block.size
    ? `${block.size} changes, discarded together`
    : `${block.items.length} of ${block.size} here, the rest in ${listed(block.elsewhere)} · discarded together`;

// Where an item is edited, as the state that shows it. Nothing for an item
// with no editor of its own. `reveal` names the element the next render
// scrolls to and marks, for an editor that lists many things at once.
/** @param {import("../../contracts/model.js").ReviewPlace | null | undefined} place @param {readonly {index: number}[]} [layers] */
export function placeState(place, layers = []) {
    if (!place) return null;
    switch (place.kind) {
        case "key": {
            const layer = layers.findIndex((entry) => entry.index === place.layer);
            return {screen: "keys", tab: "key", layer: layer < 0 ? place.layer : layer, selected: place.layoutIndex};
        }
        case "behaviour": return {screen: "keys", tab: "behaviours", behaviourRow: place.keycode, behaviourRowShown: null, cell: null,
            reveal: 'tr[data-row][data-picked="true"]'};
        // Which group lists a combo depends on the layer shown, so the combo is
        // asked for by id and the tab picks it where it finds it.
        case "combo": return {screen: "keys", tab: "combos", pickCombo: place.index, reveal: '[data-reach][data-picked="true"]'};
        case "macro": return {screen: "macros", macroSlot: place.keycode};
        case "customKey": return {screen: "customKeys", customKey: place.keycode};
        case "pointing": return {screen: "pointing", pointingSlot: place.slot, pdKind: null, pdTaps: null};
        case "lighting": return place.stage ? {screen: "lighting", stage: place.stage} : {screen: "lighting"};
        // A section is edited on the screen that draws it: a lighting stage
        // for a Lighting one, the top of Lighting for one above every stage,
        // or the Settings screen that holds it. Default layers has no editor.
        case "settings": {
            if (place.stage) return {screen: "lighting", stage: place.stage};
            if (place.area === "Lighting") return {screen: "lighting", reveal: place.section ? `.settings-group[data-section="${place.section}"]` : null};
            // The keyboard's name is the Keyboard screen's title.
            if (place.section === "keyboard") return {screen: "device"};
            const screen = screenOfSection(place.section);
            return screen ? {screen, reveal: `.settings-group[data-section="${place.section}"]`} : null;
        }
        case "layers": return {screen: "keys", layersOpen: true};
        default: return null;
    }
}

// How many fields an item shows before the rest fold away behind "Show all".
export const FIELDS_SHOWN = 4;

// ── marks in the editors ────────────────────────────────────────────────

// A removed behaviour or combo is gone from its list; a cleared pointing slot
// or emptied macro slot is still on screen, so it keeps its mark and its Show.
/** @param {Pick<import("../../contracts/model.js").ReviewChange, "status" | "place">} change */
export const stillShown = (change) => change.status !== "removed" || ["pointing", "macro"].includes(change.place?.kind || "");

// What the draft changed, by where it is edited, so every editor can mark its
// own changed things the way the review lists them.
// Every screen asks for these on every render; the answer is kept with the
// changes list, which only changes when a new model arrives.
/** @type {WeakMap<readonly import("../../contracts/model.js").ReviewChange[], import("./types.js").DraftMarks>} */
const marksCache = new WeakMap();
/** @param {readonly import("../../contracts/model.js").ReviewChange[]} [changes] @returns {import("./types.js").DraftMarks} */
export function draftMarks(changes = []) {
    const cached = marksCache.get(changes);
    if (cached) return cached;
    const marks = computeMarks(changes);
    marksCache.set(changes, marks);
    return marks;
}
/** @param {readonly import("../../contracts/model.js").ReviewChange[]} changes @returns {import("./types.js").DraftMarks} */
function computeMarks(changes) {
    /** @type {import("./types.js").DraftMarks} */
    const marks = {keys: new Map(), layers: new Set(), behaviours: new Set(), combos: new Set(), macros: new Set(), customKeys: new Set(),
        pointing: new Set(), lighting: new Set(), lightingLayers: new Set(), lightingSlots: new Set(), settings: new Set(), layerNames: false};
    for (const change of changes) {
        const {place} = change;
        if (!place || !stillShown(change)) continue;
        if (place.kind === "key") {
            if (!marks.keys.has(place.layer)) marks.keys.set(place.layer, new Set());
            marks.keys.get(place.layer)?.add(place.layoutIndex);
            marks.layers.add(place.layer);
        } else if (place.kind === "behaviour") marks.behaviours.add(place.keycode);
        else if (place.kind === "combo") marks.combos.add(place.index);
        else if (place.kind === "macro") marks.macros.add(place.keycode);
        else if (place.kind === "customKey") marks.customKeys.add(place.keycode);
        else if (place.kind === "pointing") marks.pointing.add(place.slot);
        else if (place.kind === "lighting") {
            if (place.stage) marks.lighting.add(place.stage);
            if (place.layer !== undefined) { marks.lightingLayers.add(place.layer); marks.layers.add(place.layer); }
            if (place.slot !== undefined) marks.lightingSlots.add(place.slot);
        } else if (place.kind === "settings" && place.section) {
            marks.settings.add(place.section);
            if (place.stage) marks.lighting.add(place.stage);
        }
        else if (place.kind === "layers") {
            // A reorder marks the layers it moved, not every key they hold.
            marks.layerNames = true;
            for (const layer of place.layers || []) marks.layers.add(layer);
        }
    }
    return marks;
}

// The mark itself, one look everywhere: the draft's dot, and a tip that says
// it. In a row it follows the label; on a tile (a key, a macro slot, a
// pointing slot card) it sits in the tile's top-right corner, as on the board.
/** @param {string} [tip] @param {string} [place] */
export const draftDot = (tip = "Changed in your draft", place = "") => `<i class="draft-dot ${place}" data-tip="${tip}" aria-label="${tip}"></i>`;

// What a stale draft's bar says it keeps: "your 1 change is kept".
/** @param {number} count */
export const changesKept = (count) => `your ${count} change${count === 1 ? " is" : "s are"} kept`;
