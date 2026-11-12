// @ts-check
// The words for keyboard values and operations, as the core sends them.
//
// `model.vocabulary` is core/model/vocabulary.js: the one table the review is
// written from. Every editor names things from here too, so a dropdown, a
// hover card and the review never call one value two things. A value the
// table does not know reads as itself rather than disappearing.

/** @typedef {import("../../contracts/model.js").Vocabulary} Vocabulary */
/** @typedef {{vocabulary?: Vocabulary, pdModes?: {id: number, displayName: string, name?: string}[]}} VocabularyModel */

/** @type {Vocabulary} */
const NONE = {phases: /** @type {Vocabulary["phases"]} */ ({}), readSteps: /** @type {Vocabulary["readSteps"]} */ ({}), editModes: /** @type {Vocabulary["editModes"]} */ ({}), halves: /** @type {Vocabulary["halves"]} */ ({}), firmwareUpdate: "", draftBlocks: {}, hostOs: [], physicalHalves: [], macroProtection: [], macroUninterruptible: {label: "", automatic: {on: "", off: ""}}, macroSteps: [], replacementKinds: [], inputModes: [], leaderKey: "", listFileFormats: [], macroStepTiles: {text: "", key: "", chord: "", delay: "", press: "", release: ""}, macroProblems: {}, hostLayouts: [], unicodeEntry: [], unicodeEntryOff: [], tapSends: "", holdFromPress: "", timingSources: {tappingTerm: "", tapHoldTerm: "", longHoldTerm: "", multiTapTerm: ""}, thresholds: {tapHoldTerm: "", longHoldTerm: "", multiTapTerm: ""}, thresholdNames: {tapHoldTerm: "", longHoldTerm: "", multiTapTerm: ""}, thresholdTips: {tapHoldTerm: "", longHoldTerm: "", multiTapTerm: ""}, holdStyles: {hold: [], long: []}, holdWithoutLongHold: [], tiers: /** @type {Vocabulary["tiers"]} */ ({}), tierTips: /** @type {Vocabulary["tierTips"]} */ ({}), branches: [], localities: [], paintModes: [], paintModesBrief: [], fadeModes: [], tapCommit: [],
    lightingFields: {colour: "", locality: "", paintMode: "", fadeMode: "", endColour: "", tapBranchCommit: ""},
    colourOff: {}, feedbackOwners: [], feedbackTiers: {}, replacementOwners: [], replacementWhen: {}, replacementColourOwners: /** @type {Vocabulary["replacementColourOwners"]} */ ({}), accents: /** @type {Vocabulary["accents"]} */ ({}),
    accentFields: {lightsFor: "", ownColour: ""}, feedbackColourOwners: /** @type {Vocabulary["feedbackColourOwners"]} */ ({}),
    lightingLists: {inUse: "", tiers: {title: "", tip: ""}, tapBranches: {title: "", tip: ""}, replacements: {title: "", tip: ""}, comboFeedback: {title: "", empty: ""}, holdLayer: {title: "", empty: ""}}, stages: [], customKeys: {alwaysOn: {base: "", default: ""}, layerKinds: []},
    keyCapLayerVerbs: {}, layerKeyVerbs: {}, switchKeys: {}, checkLevels: /** @type {Vocabulary["checkLevels"]} */ ({}), checkStatuses: /** @type {Vocabulary["checkStatuses"]} */ ({}), recoveryCauses: /** @type {Vocabulary["recoveryCauses"]} */ ({}), settingsSections: {}, fileSections: {}, usageCounts: /** @type {Vocabulary["usageCounts"]} */ ({}), participationReasons: /** @type {Vocabulary["participationReasons"]} */ ({}), participationPlaces: {key: "", layer: "", keyOn: ""}, settingsScreens: {behaviours: "", combos: "", pointer: "", host: ""},
    pointing: {kinds: [], directions: [], diagonals: [], axes: [], invert: [], pointerLayer: [], linkLabels: {startsOther: "", linkedLayers: "", linkTurnsOn: "", linkEnds: "", startedBy: "", endsWhen: "", keyTurnsOnShort: "", ignored: "", started: ""}, linkEnds: [], linkInert: {default: "", pointer: ""},
        emptyDirection: [], directionOutput: [], directionStep: [], scrollAxes: [], modifierPolicy: [], kindsDo: [], movementLabel: "", scrollFields: [], heldModifiers: "", tips: {}, pointerLayerLabel: "",
        fieldLabels: {name: "", dpi: "", axis: "", emptyDirection: "", directionOutput: "", scrollAxes: "", invert: "", horizontal: "", vertical: ""}},
    modifiers: [], comboOptions: {}, definitionFields: {use: {behaviour: "", combo: ""}, allowedLayers: "", offInSettings: {behaviour: "", combo: ""}, onceOn: {behaviour: "", combo: ""}}, settingOff: {switches: {behaviour: {off: "", fix: ""}, combo: {off: "", fix: ""}, autoMouse: {off: "", fix: ""}, autocorrect: {off: "", fix: ""}}, stage: "", leading: {list: "", stage: ""}}, behaviourFields: {anchor: "", timings: ""},
    comboFields: {inputs: "", sends: "", window: "", conditions: ""}};

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

// A pointing slot's name as the core gives it: its own, or core's words for
// one that holds nothing ("Slot 6"), which core publishes on every slot as
// its displayName. A slot published without one reads by the name it
// stores, the one place a name is made up for it here.
/** @param {{displayName?: string, name?: string} | null | undefined} slot */
export const slotNamed = (slot) => slot?.displayName || slot?.name || "";
// The same for the slot with this id.
/** @param {VocabularyModel | null | undefined} model @param {number} id */
export const slotCalled = (model, id) => slotNamed((model?.pdModes || []).find((slot) => slot.id === id));

// A macro slot's name as the core gives it: its own, or core's words for one
// with none ("Macro 3"), which core publishes on every slot as its
// defaultName. A slot the keyboard did not report reads by its keycode.
/** @param {{name?: string, defaultName?: string, keycode?: string} | null | undefined} slot @param {string} [keycode] */
export const macroNamed = (slot, keycode = "") => slot?.name || slot?.defaultName || slot?.keycode || keycode;

// A layer's name as the core gives it: its own, or core's words for one with
// none ("Base", "Layer 3"), which core publishes on every layer as its
// displayName. A layer published without one reads by the name it stores,
// the one place a name is made up for it here.
/** @param {{displayName?: string, name?: string} | null | undefined} layer */
export const layerCalled = (layer) => layer?.displayName || layer?.name || "";
/** @typedef {{index: number, displayName?: string, name?: string}} NamedLayer */
// The layer with this index, or undefined.
/** @template {NamedLayer} L @param {{layers?: readonly L[]} | null | undefined} model @param {number} index @returns {L | undefined} */
export const layerAt = (model, index) => (model?.layers || []).find((layer) => layer.index === index);
// The same layer's name.
/** @param {{layers?: readonly NamedLayer[]} | null | undefined} model @param {number} index */
export const layerCalledAt = (model, index) => layerCalled(layerAt(model, index));

// Words that name layers: text, with each layer kept in its place, so a screen
// draws each by its mark (ui/marks.mjs, phraseMarked) while a tip, a cached
// word or a test reads the phrase as plain words (said). Marks are the
// interface's, so the view writes phrases and never markup.
/** @typedef {(string | {layer: NamedLayer | null | undefined})[]} Phrase */
// How a phrase is said: its layers and its other words.
/** @typedef {{layer: (layer: NamedLayer | null | undefined) => string, text: (words: string) => string}} Saying */
/** @type {Saying} */
export const PLAIN = {layer: layerCalled, text: (words) => words};
/** @param {Phrase} phrase @param {Saying} [say] */
export const said = (phrase, say = PLAIN) => phrase.map((part) => typeof part === "string" ? say.text(part) : say.layer(part.layer)).join("");
// Phrases one after another, `between` each.
/** @param {readonly Phrase[]} phrases @param {string} between @returns {Phrase} */
export const phrasesJoined = (phrases, between) => phrases.flatMap((phrase, at) => at ? [between, ...phrase] : phrase);
// Phrases in a run of prose, as listed() runs names: "A, B and C".
/** @param {readonly Phrase[]} phrases @returns {Phrase} */
export const phrasesListed = (phrases) => phrases.flatMap((phrase, at) => at ? [at === phrases.length - 1 ? " and " : ", ", ...phrase] : phrase);
// A phrase starting a sentence: its first word capitalised.
/** @param {Phrase} phrase @returns {Phrase} */
export const phraseSentence = (phrase) => typeof phrase[0] === "string" ? [sentence(phrase[0]), ...phrase.slice(1)] : phrase;

// How a tier runs, in the editor's words: a tap tier only sends, and a hold
// style names its own tier's threshold.
/** @param {VocabularyModel | null | undefined} model @param {import("../../contracts/edits.js").Tier} kind */
export const holdStyles = (model, kind) => kind === "tap" ? [] : vocabulary(model).holdStyles?.[kind] || [];
/** @param {VocabularyModel | null | undefined} model @param {import("../../contracts/edits.js").Tier} kind @param {string} style */
export const styleWord = (model, kind, style) => kind === "tap"
    ? vocabulary(model).tapSends || "tap sends" : word(holdStyles(model, kind), style);

// A tier's name: Tap, Hold, Long hold.
/** @param {VocabularyModel | null | undefined} model @param {import("../../contracts/edits.js").Tier} kind */
export const tierName = (model, kind) => vocabulary(model).tiers[kind] || kind;

// What the bar says while a Save is read back, by read step, in core's words.
/** @param {{vocabulary?: Partial<Pick<Vocabulary, 'readSteps'>>} | null | undefined} model @param {string} step */
export const readStepWords = (model, step) => /** @type {Readonly<Record<string, string>> | undefined} */ (model?.vocabulary?.readSteps)?.[step];

// Device progress is matched by id. Labels and write facts come from core.
/** @param {{vocabulary?: Pick<import('../../contracts/model.js').Vocabulary, 'phases'>} | null | undefined} model @param {import("../../contracts/model.js").PhaseId | undefined} phase */
export const phaseWords = (model, phase) => phase ? model?.vocabulary?.phases?.[/** @type {import('../../contracts/model.js').PhaseId} */ (phase)] : undefined;

// Why the open draft takes no edit (D-L60), in core's words for each reason
// it publishes (`DraftBlock`, vocabulary.draftBlocks): the sentence a control
// says where it is (edit-gate.mjs), and the title and detail a screen shows in
// place of the editor (readiness.mjs). A live draft is what the keyboard
// runs, so it is read again rather than reviewed.
/** @param {{vocabulary?: Partial<Pick<Vocabulary, 'draftBlocks'>>} | null | undefined} model @param {import("../../contracts/panel.js").DraftBlock | undefined} reason @param {boolean} [live] @returns {{sentence: string, title: string, detail: string} | null} */
export function draftBlockWords(model, reason, live = false) {
    const words = reason ? model?.vocabulary?.draftBlocks?.[reason] : undefined;
    return words ? {sentence: words.sentence, title: words.title, detail: (live && words.liveDetail) || words.detail} : null;
}

// Whether the two halves agree, in the words core chose. A state the table
// does not know reads as itself.
/** @param {{vocabulary?: Partial<Pick<import('../../contracts/model.js').Vocabulary, 'halves'>>} | null | undefined} model @param {import("../../contracts/model.js").HalvesId | undefined} halves @returns {{label: string, detail: string}} */
export const halvesWords = (model, halves) => (halves && model?.vocabulary?.halves?.[halves]) || {label: String(halves ?? ""), detail: ""};

// How edits reach the keyboard, in the words core chose: 0 Review and save,
// 1 Live edit, 2 Live preview + save. A mode the table does not know (the
// keyboard may report one) reads as its number.
/** @param {VocabularyModel | null | undefined} model @param {number} mode @returns {{id: string, label: string, hint: string, detail: string}} */
export const editModeWords = (model, mode) => /** @type {Readonly<Partial<Record<number, Vocabulary["editModes"][import("../../contracts/model.js").EditMode]>>>} */ (vocabulary(model).editModes)?.[mode]
    || {id: String(mode), label: `Mode ${mode}`, hint: "", detail: ""};

// Names in a run of prose: "A", "A and B", "A, B and C".
/** @param {readonly string[]} names */
export const listed = (names) => names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

// The layers a board shows, top first, as Keymap and Lighting both caption
// them: the layer on top, then those previewed under it, down to the base:
// "Function on top of Pointing, Number and Base", or "Base" alone.
/** @param {Pick<import("./keyface-types.js").LayerView, "layer" | "held" | "stack">} view @returns {Phrase} */
export function layersOnTop({layer, held, stack}) {
    const base = stack[0];
    /** @type {Phrase[]} */
    const under = held.filter((at) => at > 0).reverse().map((at) => [{layer: stack[at]}]);
    if (base && layer !== base) under.push([{layer: base}]);
    return [{layer}, ...(under.length ? [" on top of ", ...phrasesListed(under)] : [])];
}

// Words written mid-sentence, starting one: the first letter capitalised.
/** @param {string} text */
export const sentence = (text) => text.charAt(0).toUpperCase() + text.slice(1);
