// @ts-check
import {keyFace} from "./keyface.mjs";
import {keyIdentity} from "./key-identity.mjs";
import {downTheStack} from "./layer-resolution.mjs";
import {comboJoins} from "./participation.mjs";
import {layerCalled, listed} from "./vocabulary.mjs";
import {comboInputIsKey as inputIsKey, comboKeysAmong, comboTouches, inputOn, inputPressed} from "../../rules/combo-inputs.mjs";
/** @typedef {import("../../contracts/panel.js").ComboView} ComboView */
/** @typedef {import("../../contracts/panel.js").Layer} Layer */
/** @typedef {import("../../contracts/panel.js").Position} Position */
/** @typedef {import("./keyface-types.js").ComboGroupEntry} ComboGroupEntry */
/** @typedef {import("./keyface-types.js").ComboGroups} ComboGroups */
/** @typedef {import("./keyface-types.js").ComboMarks} ComboMarks */
/** @typedef {import("./keyface-types.js").ComboUse} ComboUse */
/** @typedef {import("./keyface-types.js").LayerView} LayerView */
/** @typedef {import("./keyface-types.js").ResolvedKey} ResolvedKey */
/** @typedef {import("./keyface-types.js").ViewModel} ViewModel */
// What a view asks of combos, each worked out once per view: screens read it
// through the view (view.combos, layer-view.mjs), never from here.
//
// The view is one actual activation: the selected layer plus the layers the
// user has previewed under it, with base only in a preview (view.shown).
// Keep it separate from the layer reach lists, which deliberately include
// every *possible* activation of that layer. Picking on the board asks the
// keyboard instead: a transparent key picks what it falls through to, base
// included (view.answers).
/** @param {LayerView} view @param {ResolvedKey[]} keys */
function comboAnswerEntries({model, stack, at}, keys) {
    const reference = comboReferenceLayer(model, at);
    const referenced = reference !== at && stack[reference];
    return referenced
        ? (referenced.positions || []).map((position) =>
            ({position, layer: referenced, fellThrough: false, whileHeld: false, reference: true}))
        : keys;
}

/** @param {LayerView} view */
export function combosInView(view) {
    const {model} = view;
    const resolved = comboAnswerEntries(view, view.shown);
    // comboKeysAmong returns positions from these exact entries, so every lookup exists.
    const answering = new Map(resolved.map((entry) => [entry.position, entry]));
    return (model?.combos || []).flatMap((combo) => {
        const found = comboKeysAmong(resolved.map((entry) => entry.position), combo);
        return found.forms ? [{combo, keys: found.keys.map((position) => /** @type {ResolvedKey} */ (answering.get(position)))}] : [];
    });
}

// Which keys press a combo's inputs, and whether they form its chord, is the
// shared rule in rules/combo-inputs.mjs: everything that answers "is this combo
// on this layer" goes through it, or the board's badges and the combo table
// disagree.

// Whether a combo's input number `at` is the key at this position
// (rules/combo-inputs.mjs).
/** @param {ComboView} combo @param {number} at @param {Position | null | undefined} position */
export const comboInputIsKey = (combo, at, position) => Boolean(position) && inputIsKey(combo, at, /** @type {Position} */ (position));

// The behaviours these combos run when they fire: one per key they send, in
// combo order, with the badges of the combos that send it. A combo runs the
// behaviour of the key it sends on the layers core publishes for it
// (outputBehaviorLayers): its own output behaviour, the keyboard's behaviours,
// "combo outputs use behaviours" and the behaviour's own switches decide them.
// `layer`, when given, is the combo's source layer.
/** @param {ViewModel} model @param {ComboView[]} combos @param {number} [layer] */
export function comboBehaviours(model, combos, layer) {
    /** @type {Map<string, {keycode: string, output: string, shown: string, badges: string[]}>} */
    const found = new Map();
    for (const combo of combos) {
        const layers = combo.outputBehaviorLayers ?? 0;
        if (!layers || (layer !== undefined && !(layers & (1 << layer)))) continue;
        const keycode = comboOutput(model, combo);
        if (!keyIdentity(model, keycode).behaviour) continue;
        const entry = found.get(keycode) ?? {keycode, output: combo.output, shown: combo.outputDisplay || combo.output, badges: []};
        entry.badges.push(combo.badge);
        found.set(keycode, entry);
    }
    return [...found.values()];
}

// The matching rule alone, for one key, with no layer in view. Screens ask
// combosAt(), which applies it the way the keyboard does on the layer shown.
/** @param {ViewModel} model @param {Position | null | undefined} position */
function combosForKey(model, position) {
    if (!position) return [];
    return (model?.combos || []).filter((combo) => comboTouches(combo, position));
}

// Whether a combo fires from each of the keys that press it in one view, and
// why not: every key has to be allowed to join it on the layer that supplies
// it (firmware's combo decision), and the keys allowed must still cover every
// input, or the chord never forms; then each key says which others cannot.
// Under Combo Layer Matching the keycode is the reference layer's but the
// permissions stay the supplying layer's: the key that answers in `view`.
/** @param {LayerView} view @param {ComboView} combo @param {ResolvedKey[]} keys @returns {Map<number, ComboUse>} */
function comboUses(view, combo, keys) {
    const {model, stack, at} = view;
    /** @param {ResolvedKey} key */
    const source = (key) => {
        if (!key.reference) return key.layer?.index ?? at;
        return view.answerAt(key.position.layoutIndex)?.layer?.index ?? stack[at]?.index ?? at;
    };
    const judged = keys.map((key) => {
        const layer = source(key);
        return {key, layer, input: inputPressed(combo, key.position), ...comboJoins(model, layer, key.position, combo)};
    });
    const covered = new Set(judged.filter((row) => row.joins).map((row) => row.input));
    const chord = covered.size >= (combo.inputs || []).length;
    // Only keys whose input no other key covers keep the chord from forming.
    const blocking = judged.filter((row) => !row.joins && !covered.has(row.input));
    /** @param {typeof judged[number]} row */
    const keyOnLayer = ({input, layer}) => {
        const supplier = stack.find((candidate) => candidate.index === layer);
        return `${combo.inputDisplays?.[(combo.inputs || []).indexOf(input)] || input} on ${layerCalled(supplier)}`;
    };
    const blockedWords = `its other key${blocking.length === 1 ? "" : "s"} ${listed(blocking.map(keyOnLayer))} cannot join it, so it never forms`;
    return new Map(judged.map(({key, joins, reasons}) => [key.position.layoutIndex,
        joins && !chord ? {fires: false, reasons: [blockedWords]} : {fires: joins, reasons}]));
}
/** @param {Map<number, Map<ComboView, ComboUse>>} uses @param {ComboView} combo @param {Map<number, ComboUse>} byKey */
const recordUses = (uses, combo, byKey) => {
    for (const [layoutIndex, use] of byKey) {
        const here = uses.get(layoutIndex) || new Map();
        here.set(combo, use);
        uses.set(layoutIndex, here);
    }
};

// Which layer's key assignments combos are matched against while `at` is the
// top layer, the keyboard's Combo Layer Matching, as core publishes it
// (comboReferenceLayers); a layer matches itself without it.
/** @param {ViewModel} model @param {number} at */
const comboReferenceLayer = (model, at) => model?.comboReferenceLayers?.[at] ?? at;

// Which combos fire from this layer, and on which keys, as core publishes it
// (comboReach, core/model/combo-reach.js): turned back into the keys the board
// draws, grouped as everything else is. Every reach list asks for them — the
// Combos tab, the board's badges, and the macros and pointing modes a combo
// sends — and they do not change with the layers held (view.combos.groups).
/** @param {LayerView} view @returns {ComboGroups} */
export function comboGroups({model, stack, at}) {
    if (!model?.combos?.length) return {onKeys: [], throughKeys: [], fromBranches: [], fromBranchesBelow: [], elsewhere: []};
    const facts = model.comboReach?.[at] || [];
    /** @param {import("../../contracts/panel.js").ComboReachKey} key @returns {ResolvedKey} */
    const keyOf = (key) => ({position: /** @type {Position} */ ((stack[key.layer]?.positions || []).find((position) => position.layoutIndex === key.layoutIndex)),
        layer: stack[key.layer], fellThrough: key.fellThrough, whileHeld: key.whileHeld, ...(key.reference ? {reference: true} : {})});
    /** @type {ComboGroupEntry[]} */
    const onKeys = [];
    /** @type {ComboGroupEntry[]} */
    const throughKeys = [];
    /** @type {ComboGroupEntry[]} */
    const elsewhere = [];
    model.combos.forEach((combo, index) => {
        const fact = facts[index];
        const entry = {combo, inputs: (combo.inputs || []).length, covered: fact?.covered || 0, keys: (fact?.keys || []).map(keyOf), held: (fact?.held || []).map((layer) => stack[layer])};
        if (!fact?.fires) elsewhere.push(entry);
        else (entry.keys.every((key) => !key.fellThrough) ? onKeys : throughKeys).push(entry);
    });
    return {onKeys, throughKeys: downTheStack(throughKeys), fromBranches: [], fromBranchesBelow: [], elsewhere};
}

// The combos a key carries on this layer, keyed by layout index. The board
// marks what the layer stores, the same rule as behaviour dots: a transparent
// key shows nothing of the layer below it, and what it inherits is listed in
// the Combos tab under "through a transparent key". Of the rest, only combos
// the table says fire from this layer count — so a key sharing one input of a
// combo that can never fire here is not marked — and under Combo Layer
// Matching the keys whose position the reference layer supplies are.
/** @param {LayerView} view @returns {ComboMarks} */
function marksOnLayer(view) {
    const {model, stack} = view;
    if (!model) return {keys: new Map(), uses: new Map()};
    const {onKeys, throughKeys} = view.combos.groups;
    const order = new Map((model.combos || []).map((combo, index) => [combo, index]));
    /** @type {Map<number, ComboView[]>} */
    const keys = new Map();
    /** @type {Map<number, Map<ComboView, ComboUse>>} */
    const uses = new Map();
    for (const entry of [...onKeys, ...throughKeys]) {
        recordUses(uses, entry.combo, comboUses(view.under(entry.held.map((layer) => stack.indexOf(layer))), entry.combo, entry.keys));
        for (const key of entry.keys) {
            if (key.fellThrough) continue;
            const combos = keys.get(key.position.layoutIndex) || [];
            if (!combos.includes(entry.combo)) combos.push(entry.combo);
            keys.set(key.position.layoutIndex, combos);
        }
    }
    for (const combos of keys.values()) combos.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    return {keys, uses};
}

// The combos the board marks while `held` are previewed on under `at`. A key
// the layer stores keeps its own marks (the layer's alone). A transparent key
// shows the key answering from below, and wears that key's marks as it wears
// its behaviour dots: the combos **On this view** fires (view.combos.inView)
// that take that key as an input. Under Combo Layer Matching the keyboard
// matches the reference layer's raw keycodes, never an answer from below, so
// the layer's own marks already say it all (view.combos.marks).
/** @param {LayerView} view @returns {ComboMarks} */
export function comboMarks(view) {
    const {model, at} = view;
    if (!model || !view.previewing) return marksOnLayer(view);
    const own = view.alone.combos.marks;
    if (comboReferenceLayer(model, at) !== at) {
        // The reference layer's keycodes are matched whatever is held, so the
        // marks stay the layer's own; the layers held still supply each key,
        // and so decide its permissions.
        /** @type {Map<number, Map<ComboView, ComboUse>>} */
        const uses = new Map();
        const {onKeys, throughKeys} = view.combos.groups;
        for (const entry of [...onKeys, ...throughKeys]) recordUses(uses, entry.combo, comboUses(view, entry.combo, entry.keys));
        return {keys: own.keys, uses};
    }
    const keys = new Map([...own.keys].map(([layoutIndex, combos]) => [layoutIndex, [...combos]]));
    const uses = new Map([...own.uses].map(([layoutIndex, found]) => [layoutIndex, new Map(found)]));
    for (const {combo, keys: pressed} of view.combos.inView) {
        const found = comboUses(view, combo, pressed);
        for (const key of pressed) {
            if (!key.fellThrough) continue;
            const combos = keys.get(key.position.layoutIndex) || [];
            if (!combos.includes(combo)) combos.push(combo);
            keys.set(key.position.layoutIndex, combos);
            recordUses(uses, combo, new Map([[key.position.layoutIndex, /** @type {ComboUse} */ (found.get(key.position.layoutIndex))]]));
        }
    }
    const order = new Map((model.combos || []).map((combo, index) => [combo, index]));
    for (const combos of keys.values()) combos.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    return {keys, uses};
}
// The combos the board marks on the key at this position in this view.
/** @param {LayerView} view @param {number} layoutIndex */
export const combosShownAt = (view, layoutIndex) => view.combos.marks.keys.get(layoutIndex) || [];
// Whether a combo the key takes part in fires from it in this view, and why
// not (comboUses). A combo the key is not in fires from it nowhere, so it has
// nothing to say against it.
/** @param {LayerView} view @param {number} layoutIndex @param {ComboView} combo @returns {ComboUse} */
export const comboUseAt = (view, layoutIndex, combo) =>
    view.combos.marks.uses.get(layoutIndex)?.get(combo) ?? {fires: true, reasons: []};
// The badges the board draws on a key: its combos that fire from it here.
// The Key tab and the hover card list the others too, saying why they do not.
/** @param {LayerView} view @param {number} layoutIndex */
export const comboBadgesAt = (view, layoutIndex) =>
    combosShownAt(view, layoutIndex).filter((combo) => comboUseAt(view, layoutIndex, combo).fires);

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
// position nothing answers is absent (view.combos.answers).
/** @param {LayerView} view @returns {Map<number, Position>} */
export function comboAnswers(view) {
    return new Map(comboAnswerEntries(view, view.answers)
        .map(({position}) => [position.layoutIndex, position]));
}

// The board keys that press one of the builder's inputs from this view. An
// input placed on two keys rings both; one no key here presses rings nothing,
// and stays an input.
/** @param {LayerView} view @param {string[]} inputs */
export function comboInputKeys(view, inputs) {
    return [...view.combos.answers]
        .filter(([, position]) => inputs.some((name) => inputOn(name, position)))
        .map(([layoutIndex]) => layoutIndex);
}

// Whether a builder input is pressed by any key in this view.
/** @param {LayerView} view @param {string} name */
export const comboInputShown = (view, name) =>
    [...view.combos.answers.values()].some((position) => inputOn(name, position));

// The combos that take the key at this position as an input, in the view the
// board shows: `at` on top with `held` previewed on under it, so a transparent
// key asks about what shows through it in that view. Shown alone, a layer's
// transparent key shows nothing through (view.shown). `position` is that
// key, or null where nothing answers.
/** @param {LayerView} view @param {number} layoutIndex */
export function combosOnKey(view, layoutIndex) {
    const position = comboAnswerEntries(view, view.shown)
        .find((entry) => entry.position.layoutIndex === layoutIndex)?.position || null;
    return {position, combos: combosForKey(view.model, position)};
}

// A board click while picking, given the key that answers there: the input it
// presses leaves the combo if the combo has it, and otherwise joins at the end
// under the keycode the keyboard stores for that key. One removed and picked
// again therefore counts as added. A position nothing answers, or a disabled
// key, is not an input, and none joins once the combo has `limit` inputs, the
// keyboard's combo input limit.
/** @param {ViewModel} model @param {string[]} inputs @param {Position | null | undefined} position @param {number | null} [limit] */
export function toggleComboInput(model, inputs, position, limit = null) {
    if (!position || keyFace(position, model).kind === "disabled") return inputs;
    if (inputs.some((name) => inputOn(name, position))) return inputs.filter((name) => !inputOn(name, position));
    return limit && inputs.length >= limit ? inputs : [...inputs, position.keycode];
}

// What a combo sends, by what it means: the combo reports the catalogue's name
// for its output (`QK_MACRO_0`, `QK_USER_16`), and every domain it could reach
// is keyed by the semantic one.
/** @param {ViewModel} model @param {ComboView} combo */
export const comboOutput = (model, combo) => keyIdentity(model, combo?.output).name;
