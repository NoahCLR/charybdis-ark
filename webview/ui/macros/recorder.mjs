// @ts-check
/** @typedef {import("../../../contracts/panel.js").PublishedModel | null} Model */
/** @typedef {import("../../../contracts/panel.js").MacroSlot} MacroSlot */
/** @typedef {import("../../view/types.js").MacroStep} MacroStep */
import {el, esc} from "../../lib/dom.mjs";
import {getModel, macroForm, render, setMacroForm, state} from "../../store.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import {capturedKey, finishedPart, recordedKeycode, recordedTakePayload, takeStands} from "../../view/macro-recording.mjs";
import {onMac} from "../../view/shortcuts.mjs";
import {rememberMacroEdit} from "./history.mjs";
import {stageMacro} from "./validation.mjs";
/* ── the recorder ──────────────────────────────────────────────────────── */
// Keys pressed during a take that a macro cannot send: named in the recorder,
// never silently turned into a pause.
/** @type {string[]} */
let skippedKeys = [];
/** @type {import('../../view/macro-recording.mjs').RecordedKey[]} */
let recordedEvents = [];
// Escape is a key a macro can send, so a tap records it; holding it this long
// finishes the take, the way a browser leaves a full screen that keeps keys.
const ESCAPE_HOLD_MS = 1000;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let escapeHold;

const recordingOptions = () => ({explicit: state.recordPreserveHoldTiming,
    delays: state.recordPreserveHoldTiming || state.recordDelays !== false,
    threshold: state.recordDelayThreshold, round: state.recordDelayRound});

/** @param {Model} model @param {MacroSlot} slot @param {boolean} canEdit */
export function recorder(model, slot, canEdit) {
    const recording = state.recording?.slot === slot.keycode;
    const delays = state.recordPreserveHoldTiming || state.recordDelays !== false;
    const node = el(`<div class="card" data-recorder="${esc(slot.keycode)}">
        <div class="card-h"><h3>Record</h3>${recording ? `<span class="tag">recording</span>` : state.lastTake?.slot === slot.keycode ? `<span class="tag">recorded</span>` : ""}
            <button class="btn right" data-act="record" ${canEdit ? "" : "disabled"}>${recording ? "Stop" : "● Record"}</button></div>
        <div class="card-b stack">
            ${skippedKeys.length && (recording || state.lastTake?.slot === slot.keycode) ? `<p class="note warn" data-skipped-keys>Not recorded: ${esc(skippedKeys.join(", "))}. A macro cannot send ${skippedKeys.length === 1 ? "this key" : "these keys"}.</p>` : ""}
            <div class="row record-opts">
                <label class="sw"><input type="checkbox" data-f="macro:${esc(slot.keycode)}:record-delays" data-delays ${delays ? "checked" : ""} ${state.recordPreserveHoldTiming ? "disabled" : ""}>
                    <span class="track"></span><span class="txt">Record delays</span></label>
                <label class="ms-field"><span class="affix unit"><input class="input mono num" aria-label="Delay after each step" data-f="macro:${esc(slot.keycode)}:record-threshold" data-threshold inputmode="numeric" value="${esc(state.recordDelayThreshold)}" ${delays ? "" : "disabled"}><i>ms</i></span><span>after each step,</span></label>
                <label class="ms-field"><span>rounded to</span><span class="affix unit"><input class="input mono num" aria-label="Round delays to" data-f="macro:${esc(slot.keycode)}:record-round" data-round inputmode="numeric" value="${esc(state.recordDelayRound)}" ${delays ? "" : "disabled"}><i>ms</i></span></label>
                <label class="sw" data-tip="Keeps individual presses and releases with their timing. Record delays stays on; its two times set the precision."><input type="checkbox" data-f="macro:${esc(slot.keycode)}:record-preserve-hold-timing" data-preserve-hold-timing ${state.recordPreserveHoldTiming ? "checked" : ""} ${recording ? "disabled" : ""}>
                    <span class="track"></span><span class="txt">Preserve hold timing</span></label>
            </div>
            <p class="note">${state.recordPreserveHoldTiming ? "Preserving hold timing: keeps every press and release, with recorded delays." : "Overlapping keys become one chord; held modifiers join each shortcut."}</p>
            <div class="row gap-8">
                <span class="note">${recording ? "Typing is captured for this slot, Escape included. Holding Escape, Stop or clicking outside this recorder finishes the take." : "Appends key steps. Leaving this recorder finishes the take."}</span>
                <button class="btn tiny ghost destructive right" data-act="clear-take" ${recording || state.lastTake?.slot === slot.keycode ? "" : "disabled"}>Clear take</button>
            </div>
        </div></div>`);

    /** @type {HTMLInputElement} */ (node.querySelector("[data-preserve-hold-timing]")).addEventListener("change", event => {
        state.recordPreserveHoldTiming = /** @type {HTMLInputElement} */ (event.target).checked;
        render();
    });
    /** @type {HTMLInputElement} */ (node.querySelector("[data-delays]")).addEventListener("change", (event) => { state.recordDelays = /** @type {HTMLInputElement} */ (event.target).checked; render(); });
    /** @type {HTMLInputElement} */ (node.querySelector("[data-threshold]")).addEventListener("change", (event) => {
        state.recordDelayThreshold = Math.max(0, Number(/** @type {HTMLInputElement} */ (event.target).value) || 0);
    });
    /** @type {HTMLInputElement} */ (node.querySelector("[data-round]")).addEventListener("change", (event) => {
        state.recordDelayRound = Math.max(1, Number(/** @type {HTMLInputElement} */ (event.target).value) || 1);
    });
    // Clear take puts the payload back to what it was before Record. A take
    // still in progress was never staged; a finished one was, so its restore
    // is staged too, rather than only rewriting the text on screen. A finished
    // take is offered only until its macro changes (reconcileRecording).
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="clear-take"]')).addEventListener("click", () => {
        const take = state.recording?.slot === slot.keycode ? state.recording
            : state.lastTake?.slot === slot.keycode ? state.lastTake : null;
        if (!take) return;
        const staged = !state.recording;
        if (!staged) cancelRecording(slot.keycode);
        state.lastTake = null;
        if (staged) rememberMacroEdit(slot, take.before);
        setMacroForm(slot.keycode, {draft: take.before, steps: undefined, stepError: ""});
        if (staged) stageMacro(model, slot, take.before);
        render();
    });
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="record"]')).addEventListener("click", () => {
        if (recording) { stopRecording(model, slot); return; }
        startRecording(slot, macroForm(slot.keycode).draft ?? slot.payload ?? "");
    });
    return node;
}

// A take appends to what the payload held when Record was pressed. The
// recording state exists only while keys are being captured, so everything
// that pauses for a recording — undo, the key shortcuts — resumes on Stop.
/** @param {MacroSlot} slot @param {string} before */
function startRecording(slot, before) {
    recordedEvents = [];
    skippedKeys = [];
    state.lastTake = null;
    setMacroForm(slot.keycode, {draft: before, steps: undefined, stepError: ""});
    state.recording = {slot: slot.keycode, before};
    document.addEventListener("keydown", onRecordKey, true);
    document.addEventListener("keyup", onRecordKey, true);
    document.addEventListener("click", onRecordClick);
    addEventListener("blur", onRecordBlur);
    render();
}

function detachCapture() {
    recordedEvents = [];
    clearTimeout(escapeHold);
    document.removeEventListener("keydown", onRecordKey, true);
    document.removeEventListener("keyup", onRecordKey, true);
    document.removeEventListener("click", onRecordClick);
    removeEventListener("blur", onRecordBlur);
}

// Discard cancels its active take before resetting the form. The outside-click
// listener must not turn that cancelled capture into a staged edit afterward.
/** @param {string} keycode */
export function cancelRecording(keycode) {
    if (state.recording?.slot !== keycode) return;
    detachCapture();
    state.recording = null;
    state.lastTake = null;
}

/** @param {Model} model @param {MacroSlot | null} slot @param {boolean} redraw */
function stopRecording(model = getModel(), slot = null, redraw = true) {
    if (!state.recording) return;
    const recordedSlot = state.recording?.slot;
    const payload = recordedTakePayload(state.recording.before, recordedEvents, {...recordingOptions(), finishedAt: Date.now()});
    detachCapture();
    state.lastTake = state.recording ? {slot: state.recording.slot, before: state.recording.before, after: payload} : null;
    state.recording = null;
    const target = slot || (model?.macros || [])
        .find((candidate) => candidate.keycode === recordedSlot);
    if (target) {rememberMacroEdit(target, payload); stageMacro(model, target, payload);}
    if (redraw) render();
}

// Every render checks the recorder's owner, so navigation through the rail,
// a placement jump or a model update follows the same stop policy. A finished
// take ends once its macro changes (takeStands), whatever changed it.
export function reconcileRecording() {
    const model = getModel(), bank = model?.macros || [];
    const selected = bank.find(slot => slot.keycode === state.macroSlot) || bank[0];
    if (state.recording && (state.screen !== "macros" || state.overlay || state.picker
        || selected?.keycode !== state.recording.slot || !editGate(model, "macros").editable || selected?.available === false)) {
        stopRecording(model, null, false);
    }
    const take = state.lastTake, taken = take && bank.find(slot => slot.keycode === take.slot);
    if (take && !(taken && takeStands(take, taken.keycode, macroForm(taken.keycode).draft ?? taken.payload ?? "", model))) {
        state.lastTake = null;
    }
}

/** @param {MouseEvent} event */
function onRecordClick(event) {
    if (!state.recording || !(event.target instanceof Element)) return;
    if (event.target.closest("[data-recorder]")?.getAttribute("data-recorder") === state.recording.slot) return;
    // Let native actions (especially details toggles and focus) finish before
    // rebuilding the editor. Navigation already stopped through reconcileRecording.
    const slot = state.recording.slot;
    const raw = /** @type {HTMLDetailsElement | null} */ (event.target.closest("[data-raw]"));
    stopRecording(getModel(), null, false);
    setTimeout(() => {
        if (raw?.isConnected) setMacroForm(slot, {rawOpen: raw.open});
        render();
    }, 0);
}

// Leaving the page (⌘Tab, Alt+Tab, another window) finishes the take: keys
// pressed elsewhere never arrive, nor do the releases of keys still down.
/** @param {FocusEvent} event */
function onRecordBlur(event) {
    if (event.target !== window || !state.recording) return;
    recordedEvents = finishedPart(recordedEvents);
    stopRecording();
}

/** @param {KeyboardEvent} event */
function onRecordKey(event) {
    const recording = state.recording;
    if (!recording?.slot || (event.type !== "keydown" && event.type !== "keyup")) return;
    // Every key is the take's while it records: nothing else on the page acts
    // on it, the page's own Escape and Enter included.
    event.preventDefault();
    event.stopPropagation();
    const keycode = recordedKeycode(event.code);
    if (!keycode) {
        // Named in the recorder rather than passing as a pause.
        if (event.type !== "keydown" || !event.code) return;
        const name = event.key && event.key !== "Unidentified" && event.key.length > 1 ? event.key : event.code;
        if (!skippedKeys.includes(name)) { skippedKeys = [...skippedKeys, name]; render(); }
        return;
    }
    if (event.repeat) return;
    recordedEvents = capturedKey(recordedEvents,
        {keycode, type: event.type, time: Date.now(), altGraph: event.getModifierState?.("AltGraph")}, {mac: onMac()});
    if (keycode === "KC_ESC") holdEscape(event.type === "keydown" ? recordedEvents.at(-1) : undefined);
    setMacroForm(recording.slot, {steps: undefined, stepError: "",
        draft: recordedTakePayload(recording.before, recordedEvents, {...recordingOptions(), finished: false})});
    render();
}

// An Escape press held to the end finishes the take and is not part of it.
/** @param {import('../../view/macro-recording.mjs').RecordedKey | undefined} press */
function holdEscape(press) {
    clearTimeout(escapeHold);
    if (!press) return;
    escapeHold = setTimeout(() => {
        recordedEvents = recordedEvents.filter(event => event !== press);
        stopRecording();
    }, ESCAPE_HOLD_MS);
}
