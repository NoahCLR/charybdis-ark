// @ts-check
// The words for keyboard values and operations, as the host sends them.
//
// `model.vocabulary` is core/model/vocabulary.js: the one table the review is
// written from. Every editor names things from here too, so a dropdown, a
// hover card and the review never call one value two things. A value the
// table does not know reads as itself rather than disappearing.

/** @typedef {{vocabulary?: import("../../contracts/model.js").Vocabulary, pdModes?: {id: number, displayName: string}[]}} VocabularyModel */

/** @type {import("../../contracts/model.js").Vocabulary} */
const NONE = {lighting: {bands: {}, targets: [], paints: [], states: [], scopes: []}, phases: /** @type {import("../../contracts/model.js").Vocabulary["phases"]} */ ({}), halves: /** @type {import("../../contracts/model.js").Vocabulary["halves"]} */ ({}), hostOs: [], macroProtection: [], hostLayouts: [], tapSends: "", holdHelpers: {hold: [], long: []}, holdWithoutLongHold: [], tiers: {}, branches: [], localities: [], paintModes: [], fadeModes: [], tapCommit: [],
    feedbackOwners: [], stages: [], pointing: {kinds: [], axes: [], invert: [], pointerLayer: [], buttons: [],
        emptyDirection: [], directionOutput: [], scrollAxes: [], modifierPolicy: [], scrollFields: [], heldModifiers: ""}, modifiers: [], comboOptions: {}};

/** @param {VocabularyModel | null | undefined} model */
export const vocabulary = (model) => model?.vocabulary || NONE;

/** @param {import("../../contracts/model.js").WordList<unknown> | null | undefined} list @param {unknown} key @returns {string} */
export const word = (list, key) => ((list || []).find(([id]) => id === key)?.[1] ?? String(key ?? ""));

// A branch by how many taps start it: "Double tap".
/** @param {VocabularyModel | null | undefined} model @param {number} count */
export const branchName = (model, count) => vocabulary(model).branches[count - 1] || `${count} taps`;

// The lighting stages in paint order, each with its id, words and bit.
/** @param {VocabularyModel | null | undefined} model */
export const stageOrder = (model) => vocabulary(model).stages;

// A pointing slot's name as the host gives it.
/** @param {VocabularyModel | null | undefined} model @param {number} id */
export const slotCalled = (model, id) => (model?.pdModes || []).find((slot) => slot.id === id)?.displayName || `Slot ${id}`;

// How a tier runs, in the editor's words: a tap tier only sends, and a hold
// helper names its own tier's threshold.
/** @param {VocabularyModel | null | undefined} model @param {import("../../contracts/edits.js").Tier} kind */
export const holdHelpers = (model, kind) => kind === "tap" ? [] : vocabulary(model).holdHelpers?.[kind] || [];
/** @param {VocabularyModel | null | undefined} model @param {import("../../contracts/edits.js").Tier} kind @param {string} helper */
export const helperWord = (model, kind, helper) => kind === "tap"
    ? vocabulary(model).tapSends || "tap sends" : word(holdHelpers(model, kind), helper);

// A tier's name: Tap, Hold, Long hold.
/** @param {VocabularyModel | null | undefined} model @param {import("../../contracts/edits.js").Tier} kind */
export const tierName = (model, kind) => vocabulary(model).tiers[kind] || kind;

// Device progress is matched by id. Labels and write facts come from core.
/** @param {{vocabulary?: Pick<import('../../contracts/model.js').Vocabulary, 'phases'>} | null | undefined} model @param {import("../../contracts/model.js").PhaseId | undefined} phase */
export const phaseWords = (model, phase) => phase ? model?.vocabulary?.phases?.[/** @type {import('../../contracts/model.js').PhaseId} */ (phase)] : undefined;

// Whether the two halves agree, in the words core chose. A state the table
// does not know reads as itself.
/** @param {{vocabulary?: Partial<Pick<import('../../contracts/model.js').Vocabulary, 'halves'>>} | null | undefined} model @param {import("../../contracts/model.js").HalvesId | undefined} halves @returns {{label: string, detail: string}} */
export const halvesWords = (model, halves) => (halves && model?.vocabulary?.halves?.[halves]) || {label: String(halves ?? ""), detail: ""};
