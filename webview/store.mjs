// @ts-check
// The webview's whole state: what the keyboard said, and where the person is
// standing in the app. Edits never change the model here — they are posted to
// the host, which answers with a new model. The draft lives on that side too,
// so what is drawn is always what would be applied.

import {behaviourKeyAt, behaviourRowAfterPreview} from "./view/behavior-editor.mjs";
import {layersOn, toggleLayer} from "./view/layer-set.mjs";
import {initialReachGroups} from "./view/reach-groups.mjs";
import {leaving} from "./view/demo.mjs";

const vscode = acquireVsCodeApi();

/** @type {import("./state.js").PanelState} */
export const state = {
    screen: "keys",
    layer: 0,
    layersOn: [],       // layers previewed on with `layer`, which is the highest of them (view/layer-set.mjs)
    selected: 0,
    tab: "key",
    behaviourRow: null,
    behaviourRowShown: null,
    behaviourRoute: null, // {row, group}: the group the picked behaviour was picked in, so the board rings that route only
    // A route has one open state across the Keys tabs that show it.
    reachGroups: initialReachGroups(),
    resetBenchHeight: false, // an explicit reach-section toggle lets the workbench shrink
    // The row picked in each tab. The board rings the keys that reach it, so
    // a row in a table can answer "where do I press for this".
    reachRow: {macros: null, combos: null, pointing: null},
    cell: null,
    reveal: null,        // a selector the next render scrolls into view and marks, then forgets
    pickCombo: null,     // a combo id to pick in the Combos tab, wherever this layer lists it
    settingsOpen: [],    // settings sections opened by hand or by a Show, so a render keeps them open
    cellHow: null,       // {cell, keycode, helper, repeatHz}: how the open empty cell runs, chosen before it sends anything
    // The combo builder, opened and closed as one (openComboBuilder):
    //   inputs      the input names the combo stores, in stored order — never
    //               board positions, which mean another key on every layer
    //               (view/keyface.mjs: toggleComboInput)
    //               Labels are resolved from the current model on every render.
    //   form        the builder's fields, kept across renders; followsDefault
    //               says the window is the keyboard's default, not the combo's own
    //   awaiting    a Keep or Delete posted; the builder closes when the host accepts it
    combo: {open: false, picking: false, inputs: [],
        form: {output: "", termMs: "", followsDefault: false, mustHold: false, mustTap: false, ordered: false}, awaiting: false, editId: null},
    placement: null,     // {keycode}: next board click places it on the current layer
    retarget: null,      // {from, to, existing}: a behaviour move waiting on overwrite / swap / cancel
    keyClipboard: null,  // {keycode, label}: the key ⌘C copied, for ⌘V onto the selected key
    stage: "layers",
    layersOpen: false,  // the layer-stack panel on the layer row
    layersAsked: false, // its stack is requested once per opening
    pdSlot: 0,
    pdKind: null,      // movement selection while the rebuilt form catches up: {slot, kind}
    pdButtons: null,   // {slot, rows: {index: override}}: button overrides whose kind is chosen but not yet its shortcut or modifiers
    pdTaps: null,      // {slot, rows: {"dir:up": tap}}: direction shortcuts set to ignore modifiers before any is chosen
    pdAdvanced: false,  // Advanced open on the pointing editor, whichever slot is shown
    applyDismissed: 0,  // the failed Apply (by id) the person closed, so it stays closed
    pdPreview: false,
    feedbackRow: "hold",
    macroSlot: null,
    macroSearch: "",
    customKey: null,
    customKeySearch: "",
    macroForms: {},       // keycode → one macro slot's local steps, raw input and validation
    recording: null,     // {slot, before, last, captured} only while a take is being captured
    lastTake: null,      // {slot, before}: the finished take Clear take can undo
    recordDelays: true,
    recordMode: "compact",
    recordDelayThreshold: 30,
    recordDelayRound: 10,
    ledPicks: [],
    trackball: false,
    rowColour: {h: "0", s: "0", v: "0"},
    ledRow: {target: "layer", owner: "", source: ""}, // the LED group row being built, kept across renders
    settingsSearch: "",
    overlay: null,
    leaveDemo: null,     // {ask, message}: leaving the demo (or replacing its file) waiting on its question
    confirmChecks: null, // the draft revision whose checks Apply is asking about
    picker: null,
    notice: "",
    error: "",
};

// The combo builder, opened for a combo (or none, for a new one) and closed
// again. Its fields live here rather than in the DOM, because a board click
// while picking inputs redraws the whole screen. A new combo starts on the
// keyboard's default window, shown as a placeholder; on a keyboard without
// one it starts empty.
/** @param {import("../contracts/panel.js").ComboView | null} [combo] @param {import("../contracts/edits.js").Scalar} [defaultTermMs] */
export function openComboBuilder(combo = null, defaultTermMs = "") {
    const follows = combo ? Boolean(combo.followsDefault) : defaultTermMs !== "";
    state.combo = {
        open: true, picking: false, awaiting: false, editId: combo?.id ?? null,
        form: {output: combo?.output || "", termMs: String(combo?.termMs ?? defaultTermMs), followsDefault: follows,
            enabled: combo?.enabled ?? true, allowedLayers: combo?.allowedLayers ?? (2 ** layers().length - 1),
            mustHold: Boolean(combo?.mustHold), mustTap: Boolean(combo?.mustTap), ordered: Boolean(combo?.ordered)},
        inputs: (combo?.inputs || []).slice(),
    };
}
export function closeComboBuilder() {
    openComboBuilder();
    state.combo.open = false;
}

// Undo, redo, discard and rebase replace the draft under the forms. Every form
// that holds its own unstaged text starts again from the model, so nothing on
// screen shows an edit the draft no longer has.
// One macro slot's editor state, and a change to part of it.
export const macroForm = (/** @type {string} */ keycode) => state.macroForms[keycode] || {};
/** @param {string} keycode @param {import("./state.js").MacroForm} fields */
export function setMacroForm(keycode, fields) {
    state.macroForms = {...state.macroForms, [keycode]: {...state.macroForms[keycode], ...fields}};
}

export function resetDraftForms() {
    // A take being recorded is typing in progress, not a stale form: its
    // slot keeps the text it is building on.
    const take = state.recording?.slot;
    state.macroForms = take && state.macroForms[take] ? {[take]: {draft: state.macroForms[take].draft}} : {};
    state.lastTake = null;
    state.pdKind = null;
    state.pdButtons = null;
    state.pdTaps = null;
    state.retarget = null;
    closeComboBuilder();
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
    vscode.postMessage(draft ? {draftId: draft.id, draftRevision: draft.revision, ...message} : message);
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
// is what the host accepts; the demo's draft, with no keyboard, takes them too.
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
