// @ts-check
import {keyFace, keyMeaning} from "./keyface.mjs";
import {comboActivations, downTheStack, resolvedPositions} from "./layer-resolution.mjs";
/** @typedef {import("../../contracts/panel.js").ComboView} ComboView */
/** @typedef {import("../../contracts/panel.js").Layer} Layer */
/** @typedef {import("../../contracts/panel.js").Position} Position */
/** @typedef {import("./keyface-types.js").ComboGroupEntry} ComboGroupEntry */
/** @typedef {import("./keyface-types.js").ComboGroups} ComboGroups */
/** @typedef {import("./keyface-types.js").ResolvedKey} ResolvedKey */
/** @typedef {import("./keyface-types.js").ViewModel} ViewModel */
// The view is one actual activation: the selected layer plus the layers the
// user has previewed under it. Keep it separate from the layer reach lists,
// which deliberately include every *possible* activation of that layer.
/** @param {ViewModel} model @param {Layer[]} stack @param {number} at @param {number[]} held */
function comboAnswerEntries(model, stack, at, held) {
    const reference = comboReferenceLayer(model, at);
    const referenced = reference !== at && stack[reference];
    return referenced
        ? (referenced.positions || []).map((position) =>
            ({position, layer: referenced, fellThrough: false, whileHeld: false, reference: true}))
        : resolvedPositions(stack, at, held);
}

/** @param {ViewModel} model @param {Layer[]} stack @param {number} at @param {number[]} [held] */
export function combosInView(model, stack, at, held = []) {
    const resolved = comboAnswerEntries(model, stack, at, held);
    // comboKeysAmong returns positions from these exact entries, so every lookup exists.
    const answering = new Map(resolved.map((entry) => [entry.position, entry]));
    return (model?.combos || []).flatMap((combo) => {
        const found = comboKeysAmong(resolved.map((entry) => entry.position), combo);
        return (combo.inputs || []).length && found.covered >= combo.inputs.length
            ? [{combo, keys: found.keys.map((position) => /** @type {ResolvedKey} */ (answering.get(position)))}] : [];
    });
}

// Whether this key is one of a combo's inputs. The keyboard reports per-layer
// input references only when its firmware tracks them, so this falls back to
// the keycodes themselves — and everything that answers "is this combo on this
// layer" goes through here, or the board's badges and the combo table disagree.
/** @param {ComboView} combo @param {Position} position */
const comboTouches = (combo, position) => Array.isArray(combo?.inputPositions) && combo.inputPositions.length
    ? combo.inputPositions.includes(position.layoutIndex)
    : (combo?.inputs || []).some((input) => inputOn(input, position));
// Whether a key presses the input a combo stores by this name: by the keycode
// it stores, or by what that keycode means.
/** @param {string} name @param {Position} position */
const inputOn = (name, position) => name === position.keycode || name === keyMeaning(position);

// The matching rule alone, for one key, with no layer in view. Screens ask
// combosAt(), which applies it the way the keyboard does on the layer shown.
/** @param {ViewModel} model @param {Position | null | undefined} position */
export function combosForKey(model, position) {
    if (!position) return [];
    return (model?.combos || []).filter((combo) => comboTouches(combo, position));
}

// Every position among these that carries one of a combo's inputs, and how
// many distinct inputs they cover. A combo fires from the keycodes the active
// layer produces, so all of its inputs have to be covered; an input placed on
// two keys can be pressed on either, so both are its keys.
/** @param {Position[]} positions @param {ComboView} combo */
function comboKeysAmong(positions, combo) {
    const inputs = combo?.inputs || [];
    const keys = [];
    /** @type {Set<string>} */
    const covered = new Set();
    for (const position of positions) {
        if (!comboTouches(combo, position)) continue;
        keys.push(position);
        covered.add(inputs.find((name) => inputOn(name, position)) ?? position.keycode);
    }
    return {keys, covered: covered.size};
}

/**
 * Combos, grouped the way everything else is — but a combo is the one thing a
 * union cannot answer.
 *
 * A combo needs every input present at the same time, under one activation. Its
 * inputs could each be reachable under some hold and still never be reachable
 * together: one answered only while Numbers is held, another only while it is
 * not. So every activation this layer can top is tried, and the combo fires if
 * any single one carries all of its inputs — preferring the one that holds the
 * fewest extra layers, because that is the easiest way to press it.
 *
 * It has no branch case either: a behaviour fires a keycode, never a chord.
 */
// Which layer's key assignments combos are matched against while `at` is the
// top layer — the keyboard's Combo Layer Matching setting. The draft's settings
// section is read first, so an edit there shows here before it is applied;
// the combo readback is the keyboard's own answer when settings are absent.
/** @param {ViewModel} model @param {number} at */
export function comboReferenceLayer(model, at) {
    const section = (model?.configDefaults || []).find((row) => row.id === "comboReferences");
    const field = section?.fields?.find((row) => row.macro === `comboReference${at}`);
    const written = /^Layer (\d+)$/.exec(String(field?.value ?? ""));
    if (written) return Number(written[1]);
    const read = model?.comboReadback?.layerReferences?.[at];
    return typeof read === "number" && Number.isInteger(read) ? read : at;
}

// Every reach list asks for the combos — the Combos tab, the board's badges,
// and the macros and pointing modes a combo sends — and the Macros screen asks
// for every layer at once. Enumerating activations is the costly part, so each
// (model, stack, layer) is grouped once. The model is replaced, never mutated.
/** @type {WeakMap<Partial<import("../../contracts/panel.js").PublishedModel>, Map<number, {stack: Layer[]; groups: ComboGroups}>>} */
const comboGroupsByModel = new WeakMap();
/** @param {ViewModel} model @param {Layer[]} stack @param {number} at @returns {ComboGroups} */
export function comboGroups(model, stack, at) {
    if (!model) return groupCombos(model, stack, at);
    let perLayer = comboGroupsByModel.get(model);
    if (!perLayer) comboGroupsByModel.set(model, perLayer = new Map());
    const cached = perLayer.get(at);
    if (cached?.stack === stack) return cached.groups;
    const groups = groupCombos(model, stack, at);
    perLayer.set(at, {stack, groups});
    return groups;
}

/** @param {ViewModel} model @param {Layer[]} stack @param {number} at @returns {ComboGroups} */
function groupCombos(model, stack, at) {
    if (!model?.combos?.length) return {onKeys: [], throughKeys: [], fromBranches: [], fromBranchesBelow: [], elsewhere: []};
    // QMK matches combos against the reference layer's raw keycodes whenever
    // that layer is not the top one (process_combo.c: keymap_key_to_keycode on
    // ref_layer, no transparency). Then there is exactly one way to press the
    // combo, whatever else is held.
    const reference = comboReferenceLayer(model, at);
    const referenced = reference !== at && stack[reference] ? stack[reference] : null;
    // The activations do not depend on the combo, so each is resolved once and
    // every combo is tried against it. Resolving per combo instead re-walks the
    // whole board 64 times over, on every render.
    const tries = referenced
        ? [(() => {
            const resolved = (referenced.positions || []).map((position) =>
                ({position, layer: referenced, fellThrough: false, whileHeld: false, reference: true}));
            return {held: [], resolved, answering: new Map(resolved.map((entry) => [entry.position, entry]))};
        })()]
        : comboActivations(stack, at).map((held) => {
            const resolved = resolvedPositions(stack, at, held);
            return {held, resolved, answering: new Map(resolved.map((entry) => [entry.position, entry]))};
        });

    /** @type {ComboGroupEntry[]} */
    const onKeys = [];
    /** @type {ComboGroupEntry[]} */
    const throughKeys = [];
    /** @type {ComboGroupEntry[]} */
    const elsewhere = [];
    for (const combo of model?.combos || []) {
        const inputs = (combo.inputs || []).length;
        let fires = null, most = null;
        for (const {held, resolved, answering} of tries) {
            const found = comboKeysAmong(resolved.map((entry) => entry.position), combo);
            // Every found position belongs to resolved, which built answering.
            const keys = found.keys.map((position) => /** @type {ResolvedKey} */ (answering.get(position)));
            if (!most || found.covered > most.covered) most = {keys, held, covered: found.covered};
            if (inputs && found.covered >= inputs && (!fires || held.length < fires.held.length)) fires = {keys, held, covered: found.covered};
        }
        if (!fires) { elsewhere.push({combo, inputs, covered: most?.covered || 0, keys: most?.keys || [], held: []}); continue; }
        const entry = {combo, inputs, covered: fires.covered, keys: fires.keys, held: fires.held.map((index) => stack[index])};
        (entry.keys.every((key) => !key.fellThrough) ? onKeys : throughKeys).push(entry);
    }
    return {onKeys, throughKeys: downTheStack(throughKeys), fromBranches: [], fromBranchesBelow: [], elsewhere};
}

// The combos a key carries on this layer, keyed by layout index. The board
// marks what the layer stores, the same rule as behaviour dots: a transparent
// key shows nothing of the layer below it, and what it inherits is listed in
// the Combos tab under "through a transparent key". Of the rest, only combos
// the table says fire from this layer count — so a key sharing one input of a
// combo that can never fire here is not marked — and under Combo Layer
// Matching the keys whose position the reference layer supplies are. The
// board asks once per key, so each (model, layer) is grouped once.
/** @type {WeakMap<Partial<import("../../contracts/panel.js").PublishedModel>, Map<number, {stack: Layer[]; keys: Map<number, ComboView[]>}>>} */
const combosByModel = new WeakMap();
/** @param {ViewModel} model @param {Layer[]} stack @param {number} at @returns {Map<number, ComboView[]>} */
export function combosOnLayer(model, stack, at) {
    if (!model) return new Map();
    let perLayer = combosByModel.get(model);
    if (!perLayer) combosByModel.set(model, perLayer = new Map());
    const cached = perLayer.get(at);
    if (cached?.stack === stack) return cached.keys;
    const {onKeys, throughKeys} = comboGroups(model, stack, at);
    const order = new Map((model.combos || []).map((combo, index) => [combo, index]));
    /** @type {Map<number, ComboView[]>} */
    const keys = new Map();
    for (const entry of [...onKeys, ...throughKeys]) {
        for (const key of entry.keys) {
            if (key.fellThrough) continue;
            const combos = keys.get(key.position.layoutIndex) || [];
            if (!combos.includes(entry.combo)) combos.push(entry.combo);
            keys.set(key.position.layoutIndex, combos);
        }
    }
    for (const combos of keys.values()) combos.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    perLayer.set(at, {stack, keys});
    return keys;
}
/** @param {ViewModel} model @param {Layer[]} stack @param {number} at @param {number} layoutIndex */
export const combosAt = (model, stack, at, layoutIndex) => combosOnLayer(model, stack, at).get(layoutIndex) || [];

// The combos the board marks while `held` are previewed on under `at`. A key
// the layer stores keeps its own marks (combosOnLayer). A transparent key shows
// the key answering from below, and wears that key's marks as it wears its
// behaviour dots: the combos **On this view** fires (combosInView) that take
// that key as an input. Under Combo Layer Matching the keyboard matches the
// reference layer's raw keycodes, never an answer from below, so the layer's
// own marks already say it all. Each (model, layer, preview) is grouped once.
/** @type {WeakMap<Partial<import("../../contracts/panel.js").PublishedModel>, Map<string, {stack: Layer[]; keys: Map<number, ComboView[]>}>>} */
const previewCombosByModel = new WeakMap();
/** @param {ViewModel} model @param {Layer[]} stack @param {number} at @param {number[]} held */
export function combosInPreview(model, stack, at, held) {
    const own = combosOnLayer(model, stack, at);
    if (!model || !held?.length || comboReferenceLayer(model, at) !== at) return own;
    let perView = previewCombosByModel.get(model);
    if (!perView) previewCombosByModel.set(model, perView = new Map());
    const view = `${at}:${held.join(",")}`;
    const cached = perView.get(view);
    if (cached?.stack === stack) return cached.keys;
    const keys = new Map([...own].map(([layoutIndex, combos]) => [layoutIndex, [...combos]]));
    for (const {combo, keys: pressed} of combosInView(model, stack, at, held)) {
        for (const key of pressed) {
            if (!key.fellThrough) continue;
            const combos = keys.get(key.position.layoutIndex) || [];
            if (!combos.includes(combo)) combos.push(combo);
            keys.set(key.position.layoutIndex, combos);
        }
    }
    const order = new Map((model.combos || []).map((combo, index) => [combo, index]));
    for (const combos of keys.values()) combos.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    perView.set(view, {stack, keys});
    return keys;
}
/** @param {ViewModel} model @param {Layer[]} stack @param {number} at @param {number[]} held @param {number} layoutIndex */
export const combosShownAt = (model, stack, at, held, layoutIndex) =>
    combosInPreview(model, stack, at, held).get(layoutIndex) || [];

// The combo builder holds its inputs by the names the combo stores, in stored
// order, never by board position: a combo fires on keycodes, and one position
// carries a different key on every layer. The board is only where they are
// picked and shown.
//
// What the combo engine sees at each position while `at` is on top and `held`
// are previewed on under it. Under Combo Layer Matching that is the reference
// layer's raw keycode, as groupCombos matches it; otherwise the key that
// answers — the highest active layer that is not transparent, which is the
// default layer when nothing else is previewed on. Keyed by layout index; a
// position nothing answers is absent.
/** @param {ViewModel} model @param {Layer[]} stack @param {number} at @param {number[]} [held] */
export function comboAnswers(model, stack, at, held = []) {
    return new Map(comboAnswerEntries(model, stack, at, held)
        .map(({position}) => [position.layoutIndex, position]));
}

// The board keys that press one of the builder's inputs from this view. An
// input placed on two keys rings both; one no key here presses rings nothing,
// and stays an input.
/** @param {ViewModel} model @param {Layer[]} stack @param {number} at @param {number[]} held @param {string[]} inputs */
export function comboInputKeys(model, stack, at, held, inputs) {
    return [...comboAnswers(model, stack, at, held)]
        .filter(([, position]) => inputs.some((name) => inputOn(name, position)))
        .map(([layoutIndex]) => layoutIndex);
}

// Whether a builder input is pressed by any key in this view.
/** @param {ViewModel} model @param {Layer[]} stack @param {number} at @param {number[]} held @param {string} name */
export const comboInputShown = (model, stack, at, held, name) =>
    [...comboAnswers(model, stack, at, held).values()].some((position) => inputOn(name, position));

// The combos that take the key at this position as an input, in the view the
// board shows: `at` on top with `held` previewed on under it, so a transparent
// key asks about what shows through it, as picking it would (comboAnswers).
// `position` is that key, or null where nothing answers.
/** @param {ViewModel} model @param {Layer[]} stack @param {number} at @param {number[]} held @param {number} layoutIndex */
export function combosOnKey(model, stack, at, held, layoutIndex) {
    const position = comboAnswers(model, stack, at, held).get(layoutIndex) || null;
    return {position, combos: combosForKey(model, position)};
}

// A board click while picking, given the key that answers there: the input it
// presses leaves the combo if the combo has it, and otherwise joins at the end
// under the keycode the keyboard stores for that key. One removed and picked
// again therefore counts as added. A position nothing answers, or a disabled
// key, is not an input.
/** @param {string[]} inputs @param {Position | null | undefined} position */
export function toggleComboInput(inputs, position) {
    if (!position || keyFace(position).kind === "disabled") return inputs;
    return inputs.some((name) => inputOn(name, position))
        ? inputs.filter((name) => !inputOn(name, position))
        : [...inputs, position.keycode];
}

// What a combo sends, by what it means: the combo reports the catalogue's name
// for its output (`QK_MACRO_0`, `QK_USER_16`), and every domain it could reach
// is keyed by the semantic one.
/** @param {ViewModel} model @param {ComboView} combo */
export const comboOutput = (model, combo) =>
    model?.qmkKeycodeAliases?.[combo?.output] ?? combo?.output ?? "";
