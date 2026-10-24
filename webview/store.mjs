// @ts-check
// The webview's whole state: what the keyboard said, and where the person is
// standing in the app. Edits never change the model here — they are posted to
// the core, which answers with a new model. The draft lives on that side too,
// so what is drawn is always what would be applied.

import {behaviourKeyAt, behaviourRowAfterPreview} from "./view/behavior-editor.mjs";
import {layersOn, toggleLayer} from "./view/layer-set.mjs";
import {initialReachGroups} from "./view/reach-groups.mjs";
import {leaving} from "./view/demo.mjs";
import {afterDraftChange, initialState, kept, resets, resetsTo} from "./view/state-fields.mjs";

const panelApi = acquirePanelApi();

/** @typedef {import("./state.js").PanelState} PanelState */

// Every field of the state, with its starting value and what a draft change
// does to it (view/state-fields.mjs). When the core replaces the draft under
// the forms (undo, redo, a jump, discard, rebase, Apply, an import, another
// keyboard or the demo), `resets` and `resetsTo` start a form again from the
// model; `kept` survives. This preserves the existing reset policy, including
// pending hold-style choices for empty cells and the LED group builder. A new
// field takes one of the three here rather than joining a separate reset list.
/** @type {import("./view/state-fields.mjs").StateFields<PanelState>} */
export const STATE_FIELDS = {
    screen: kept("keys"),
    layer: kept(0),
    layersOn: kept([]),       // layers previewed on with `layer`, which is the highest of them (view/layer-set.mjs)
    layerGripFocus: kept(undefined), // the layer grip a reorder refocuses after the next render
    selected: kept(0),
    tab: kept("key"),
    behaviourRow: kept(null),
    behaviourRowShown: kept(null),
    behaviourRoute: kept(null), // {row, group}: the group the picked behaviour was picked in, so the board rings that route only
    // A route has one open state across the Keys tabs that show it.
    reachGroups: kept(initialReachGroups()),
    resetBenchHeight: kept(false), // an explicit reach-section toggle lets the workbench shrink
    // The row picked in each tab. The board rings the keys that reach it, so
    // a row in a table can answer "where do I press for this".
    reachRow: kept({macros: null, combos: null, pointing: null}),
    cell: kept(null),
    // The behaviour whose grid `cell` is open in. The Keys screen and the
    // Custom keys screen each show one behaviour editor, and a cell opened in
    // one behaviour never opens in another's grid or takes its shortcuts.
    cellRow: kept(null),
    reveal: kept(null),        // a selector the next render scrolls into view and marks, then forgets
    pickCombo: kept(null),     // a combo id to pick in the Combos tab, wherever this layer lists it
    settingsOpen: kept([]),    // settings sections opened by hand or by a Show, so a render keeps them open
    keyDetailsOpen: kept(false), // the Key tab's folded position details, open on every key once opened
    stackOpen: kept(false),    // the Key tab's runs of transparent layers, shown in full once asked
    settingsDurationUnits: kept({}), // display preferences; stored settings remain milliseconds
    // {cell, keycode, style, repeatHz}: how the open empty cell runs, chosen
    // before it sends anything. Historically kept across draft replacement;
    // it shows only while the matching behaviour cell is empty.
    cellHow: kept(null),
    // The combo builder, opened and closed as one (openComboBuilder):
    //   inputs      the input names the combo stores, in stored order — never
    //               board positions, which mean another key on every layer
    //               (view/combo-reach.mjs: toggleComboInput)
    //               Labels are resolved from the current model on every render.
    //   form        the builder's fields, kept across renders; followsDefault
    //               says the window is the keyboard's default, not the combo's own
    //   awaiting    a Keep or Delete posted; the builder closes when the core accepts it
    //   madeKey     the custom key the output picker offered for a shortcut no
    //               keycode holds: made only with the combo, on Keep (D-L63)
    // A draft change closes it, as Close does.
    combo: resetsTo({open: false, picking: false, inputs: [],
        form: {output: "", termMs: "", followsDefault: false, mustHold: false, mustTap: false, ordered: false}, awaiting: false, editId: null, madeKey: null},
    () => closedComboBuilder()),
    placement: kept(null),     // {keycode}: next board click places it on the current layer
    retarget: resets(null),    // {from, to, existing}: a behaviour move waiting on overwrite / swap / cancel
    macroClipboard: kept(null), // copied macro steps, shared between slots in this Ark window
    keyClipboard: kept(null),  // {keycode, label}: the key ⌘C copied, for ⌘V onto the selected key
    stage: kept("layers"),
    layersOpen: kept(false),  // the layer-stack panel on the layer row
    layersAsked: kept(false), // its stack is requested once per opening
    pdSlot: kept(0),
    pdKind: resets(null),      // movement selection while the rebuilt form catches up: {slot, kind}
    pdButtons: resets(null),   // {slot, rows: {index: override}}: button overrides whose kind is chosen but not yet its shortcut or modifiers
    pdTaps: resets(null),      // {slot, rows: {"dir:up": tap}}: direction shortcuts set to ignore modifiers before any is chosen
    pdAdvanced: kept(false),  // Advanced open on the pointing editor, whichever slot is shown
    applyDismissed: kept(0),  // the failed Apply (by id) the person closed, so it stays closed
    pdPreview: kept(false),
    feedbackRow: kept("hold"),
    macroSlot: kept(null),
    macroSearch: kept(""),
    customKey: kept(null),
    customKeySearch: kept(""),
    // keycode → one macro slot's local steps, raw input and validation. A take
    // being recorded is typing in progress, not a stale form: its slot keeps
    // the text it is building on.
    macroForms: resetsTo(/** @type {PanelState["macroForms"]} */ ({}), (forms, before) => {
        const take = before.recording?.slot;
        return take && forms[take] ? {[take]: {draft: forms[take].draft}} : {};
    }),
    recording: kept(null),     // {slot, before} only while a take is being captured; a draft change does not stop it
    lastTake: resets(null),    // {slot, before, after}: the finished take Clear take can undo, until its macro changes
    recordDelays: kept(true),
    recordPreserveHoldTiming: kept(false),
    recordDelayThreshold: kept(30),
    recordDelayRound: kept(10),
    // The LED group row being built on LED groups: the LEDs picked on the
    // board, the trackball LED, the row's colour, and its table, owner and
    // source. Historically kept across draft replacement despite holding
    // unstaged choices. Drawing drops a missing source group and repairs the
    // owner; changing the reset policy is a separate behavior decision.
    ledPicks: kept([]),
    trackball: kept(false),
    rowColour: kept({h: "0", s: "0", v: "0"}),
    ledRow: kept({target: "layer", owner: "", source: ""}),
    settingsSearch: kept(""),
    overlay: kept(null),
    leaveDemo: kept(null),     // {ask, message}: leaving the demo (or replacing its file) waiting on its question
    modeAsk: kept(null),       // {mode, question}: a switch of edit mode waiting on Save/Revert or Send/Discard
    confirmChecks: kept(null), // the draft revision whose checks Apply is asking about
    picker: kept(null),
    notice: kept(""),
    error: kept(""),
};

/** @type {PanelState} */
export const state = initialState(STATE_FIELDS);

// The combo builder, opened for a combo (or none, for a new one) and closed
// again. Its fields live here rather than in the DOM, because a board click
// while picking inputs redraws the whole screen. A new combo starts on the
// keyboard's default window, shown as a placeholder; on a keyboard without
// one it starts empty.
/** @param {import("../contracts/panel.js").ComboView | null} [combo] @param {import("../contracts/edits.js").Scalar} [defaultTermMs] @returns {PanelState["combo"]} */
function comboBuilder(combo = null, defaultTermMs = "") {
    const follows = combo ? Boolean(combo.followsDefault) : defaultTermMs !== "";
    return {
        open: true, picking: false, awaiting: false, editId: combo?.id ?? null, madeKey: null,
        form: {output: combo?.output || "", termMs: String(combo?.termMs ?? defaultTermMs), followsDefault: follows,
            useOutputBehavior: combo?.useOutputBehavior ?? true, enabled: combo?.enabled ?? true, allowedLayers: combo?.allowedLayers ?? (2 ** layers().length - 1),
            mustHold: Boolean(combo?.mustHold), mustTap: Boolean(combo?.mustTap), ordered: Boolean(combo?.ordered)},
        inputs: (combo?.inputs || []).slice(),
    };
}
const closedComboBuilder = () => ({...comboBuilder(), open: false});
/** @param {import("../contracts/panel.js").ComboView | null} [combo] @param {import("../contracts/edits.js").Scalar} [defaultTermMs] */
export function openComboBuilder(combo = null, defaultTermMs = "") {
    state.combo = comboBuilder(combo, defaultTermMs);
}
export function closeComboBuilder() {
    state.combo = closedComboBuilder();
}

// One macro slot's editor state, and a change to part of it.
export const macroForm = (/** @type {string} */ keycode) => state.macroForms[keycode] || {};
/** @param {string} keycode @param {import("./state.js").MacroForm} fields */
export function setMacroForm(keycode, fields) {
    state.macroForms = {...state.macroForms, [keycode]: {...state.macroForms[keycode], ...fields}};
}

// The draft was replaced under the forms: each field does what STATE_FIELDS
// declares, every rule reading the state as it was before the change.
export function resetDraftForms() {
    Object.assign(state, afterDraftChange(STATE_FIELDS, state));
}

/** @type {import("../contracts/panel.js").PublishedModel | null} */
let model = null;
let renderer = () => {};

export const getModel = () => model;
export const setModel = (/** @type {import("../contracts/panel.js").PublishedModel} */ next) => { model = next; };
export const setRenderer = (/** @type {() => void} */ fn) => { renderer = fn; };
export const render = () => renderer();

/** @param {import("../contracts/messages.js").PanelCommand} message */
export function post(message) {
    const draft = model?.draft;
    panelApi.postMessage(draft ? {draftId: draft.id, draftRevision: draft.revision, ...message} : message);
}

export const layers = () => getModel()?.layers || [];
export const currentLayer = () => layers()[state.layer] || layers()[0];
// The layers previewed on under the current one, and whether any are: the board
// then shows what the keyboard answers with, not what the layer stores.
export const heldLayers = () => layersOn(state.layer, state.layersOn, layers().length);
export const previewing = () => heldLayers().length > 0;
// A plain pick shows one layer; ⌘-click adds or removes one from the preview.
/** @param {number} index */
export function showLayer(index) {
    state.layer = index;
    state.layersOn = [];
}
/** @param {number} index */
export function toggleLayerOn(index) {
    const selectedKey = () => behaviourKeyAt(layers(), state.layer, heldLayers(), selectedPosition()?.layoutIndex).keycode;
    const before = selectedKey();
    const next = toggleLayer(state.layer, heldLayers(), index);
    state.layer = next.top;
    state.layersOn = next.on;
    const row = behaviourRowAfterPreview(state.behaviourRow, before, selectedKey());
    if (row === state.behaviourRow) return;
    Object.assign(state, {behaviourRow: row, behaviourRoute: {row, group: "view"}, cell: null, cellHow: null});
}
export const layerName = (/** @type {Partial<Pick<import("../contracts/panel.js").Layer, "name" | "displayName">> | null | undefined} */ layer) => layer?.displayName || layer?.name || "";
/** @param {import("../contracts/panel.js").Layer | null | undefined} layer @param {number | undefined} index */
export const positionAt = (layer, index) =>
    (layer?.positions || []).find((position) => position.layoutIndex === index);
export const selectedPosition = () => positionAt(currentLayer(), state.selected)
    || (currentLayer()?.positions || [])[0];

// Editing is only offered where the keyboard says it is possible; everywhere
// else the control stays visible and disabled, with the reason. Whether the
// draft takes an edit is core's to say (`draft.editable`), so what is offered
// is what the core accepts; the demo's draft, with no keyboard, takes them too.
export const writable = () => Boolean(getModel()?.draft?.editable);

// Posts a message that leaves the demo (or replaces its file), asking first
// when that would lose edits not exported (view/demo.mjs leaving()).
/** @param {import("../contracts/messages.js").PanelCommand} message */
export function postLeavingDemo(message) {
    const leave = leaving(getModel(), message);
    if (!leave.ask) {
        post(leave.message);
        return;
    }
    state.leaveDemo = leave;
    state.overlay = "leaveDemo";
    render();
}

// Whether an area can be edited now, decided in one place: every edit goes
// into the draft, so the draft must be this keyboard's, current and idle, and
// the area's own capability must hold. Exporting only reads the keyboard.
/** @type {Record<string, (model: import("../contracts/panel.js").PublishedModel | null) => boolean>} */
const AREA_CAPABILITY = {
    behaviours: (model) => Boolean(model?.behaviorEditing?.writable),
    settings: (model) => Boolean(model?.settingsEditing?.writable),
    macros: (model) => Boolean(model?.macroEditing?.writable),
    customKeys: (model) => Boolean(model?.customKeyEditing?.writable),
    pointing: (model) => Boolean(model?.pdModeEditing?.writable),
    combos: (model) => model?.comboReadback?.writable !== false,
    layers: (model) => Boolean(model?.portable?.available && !model.portable.busy),
    import: (model) => Boolean(model?.portable?.available && !model.portable.busy),
};
/** @param {string} area */
export function canEdit(area) {
    const model = getModel();
    if (area === "export") return Boolean(model?.portable?.available && !model.portable.busy);
    return writable() && (AREA_CAPABILITY[area] ? AREA_CAPABILITY[area](model) : true);
}
