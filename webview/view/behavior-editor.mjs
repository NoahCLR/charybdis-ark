// @ts-check
/** @typedef {Partial<import("../../contracts/panel.js").PublishedModel> | null | undefined} Model */
import {behaviourListeningTo, canonicalKeycode, keyFace, keyMeaning} from "./keyface.mjs";
import {resolvedPositions} from "./layer-resolution.mjs";
import {timingInput} from "./timing-input.mjs";

export function canHaveBehaviour(/** @type {Model} */ model, /** @type {string} */ keycode) {
    const key = canonicalKeycode(model, keycode);
    return Boolean(key) && !["KC_NO", "XXXXXXX", "KC_TRANSPARENT", "KC_TRNS", "_______"].includes(key)
        && !/^0x0*[01]$/i.test(key);
}

// The key a board position opens in Behaviours. Rows are keyed by keycode, so
// in a layer preview a transparent position follows the key the board shows
// there, answered from below, and names the layer that supplies it. Outside a
// preview, or with nothing mapped below, it stays the stored key.
export function behaviourKeyAt(/** @type {import("../../contracts/panel.js").Layer[]} */ stack, /** @type {number} */ at, /** @type {number[]} */ held, /** @type {number | undefined} */ index) {
    const own = (stack[at]?.positions || []).find((position) => position.layoutIndex === index);
    if (!held?.length || keyFace(own).kind !== "transparent") return {keycode: keyMeaning(own), from: null};
    const answer = resolvedPositions(stack, at, held).find((entry) => entry.position.layoutIndex === index);
    return answer ? {keycode: keyMeaning(answer.position), from: answer.layer} : {keycode: keyMeaning(own), from: null};
}

// The row Behaviours shows once the previewed layers change. A row opened from
// the selected key follows what that key answers with now; one picked from the
// list stays.
export function behaviourRowAfterPreview(/** @type {string | null} */ row, /** @type {string} */ before, /** @type {string} */ after) {
    return row === before ? after : row;
}

// A preview is never inserted into model.keyBehaviors: counts, reach markers
// and the board continue to describe only the host's stored draft.
export function behaviourEditorRow(/** @type {Model} */ model, /** @type {string} */ keycode) {
    if (!canHaveBehaviour(model, keycode)) return undefined;
    const existing = behaviourListeningTo(model, keycode);
    const key = existing?.keycode || canonicalKeycode(model, keycode);
    const defaults = model?.behaviorEditing?.keyDefaults?.[key];
    // A key with no row runs on the Tap / hold default it follows today, which
    // for QMK's own MT and OSM keys is the dual-role one (B5).
    const unstored = !existing && defaults?.withoutRow;
    const timing = defaults?.timing || model?.behaviorTimingDefaults || {};
    return {...(existing || {keycode: key, steps: [], tapHoldTerm: "0", longerHoldTerm: "0", multiTapTerm: "0",
        keepsAutoMouseAnchored: false, builtIn: defaults?.builtIn || {}}),
        stored: Boolean(existing),
        timingDefaults: unstored ? {...timing, tapHoldTerm: unstored.tapHoldTerm} : timing,
        timingSources: /** @type {Record<string, import("../../contracts/panel.js").TimingSource>} */ ({...(defaults?.timingSources || {}),
            ...(unstored ? {tapHoldTerm: unstored.tapHoldSource} : {})})};
}

// A timing field's placeholder: the default it follows and where that comes
// from, "200 · dual-role" (vocabulary timingSources).
/** @param {Model} model @param {ReturnType<typeof behaviourEditorRow>} behaviour @param {"tapHoldTerm" | "longerHoldTerm" | "multiTapTerm"} name */
export function timingPlaceholder(model, behaviour, name) {
    const fallback = behaviour?.timingDefaults?.[name];
    if (fallback === undefined || String(fallback) === "") return "default unavailable";
    const source = behaviour?.timingSources?.[name];
    const words = (source && model?.vocabulary?.timingSources?.[source]) || "default";
    return `${fallback} · ${words}`;
}

// The Layers button's words for an allowed-layers mask: All, None, one or two
// names, or a count.
/** @param {{index: number, label: string}[]} layers @param {number | undefined} mask */
export function layersSummary(layers, mask) {
    const allowed = mask ?? 0xffff;
    const on = layers.filter((layer) => allowed & 2 ** layer.index);
    if (on.length === layers.length) return "All";
    if (!on.length) return "None";
    if (on.length <= 2) return on.map((layer) => layer.label).join(", ");
    return `${on.length} of ${layers.length}`;
}

// The timing checks drawn on the grid: each on the cell it condemns, or the
// timing field it questions, with one line in the grid's own words. The
// check's identity names the problem and its tap count (core/model/
// gesture-timing.js).
/** @param {Model} model @param {readonly import("../../contracts/model.js").Check[]} checks @param {{hold: string, long: string, repeat: string}} terms @returns {{level: "notice" | "warning", cell: string | null, term: "tapHoldTerm" | "longerHoldTerm" | "multiTapTerm" | null, line: string}[]} */
export function timingMarks(model, checks, terms) {
    /** @param {number} at */
    const row = (at) => model?.vocabulary?.branches?.[at] || `${at + 1} taps`;
    /** @typedef {{level: "notice" | "warning", cell: string | null, term: "tapHoldTerm" | "longerHoldTerm" | "multiTapTerm" | null, line: string}} Mark */
    return checks.flatMap((check) => /** @type {Mark[]} */ (markOf(check)));
    /** @param {import("../../contracts/model.js").Check} check @returns {Mark[]} */
    function markOf(check) {
        const id = String(check.identity ?? "").split(":").slice(1).join(":");
        const [problem, which] = id.split(":");
        const level = /** @type {"notice" | "warning"} */ (check.level === "notice" ? "notice" : "warning");
        const at = Number(which);
        if (problem === "release") return [{level, cell: `${at}-hold`, term: null,
            line: `${row(at)} Hold never sends: Long hold takes over at ${terms.long} ms, at or before Hold's ${terms.hold} ms.`}];
        if (problem === "order") return [{level, cell: `${at}-long`, term: "longerHoldTerm",
            line: `${row(at)} Long hold starts at ${terms.long} ms, not after Hold at ${terms.hold} ms.`}];
        if (problem === "narrow") return [{level, cell: `${at}-hold`, term: null,
            line: `${row(at)} Hold has ${Number(terms.long) - Number(terms.hold)} ms before Long hold takes over.`}];
        if (problem === "short") return [{level, cell: null, term: which === "first-press tap" ? "tapHoldTerm" : "multiTapTerm",
            line: which === "first-press tap" ? `Hold after ${terms.hold} ms is quick to tap under.` : `Taps within ${terms.repeat} ms is quick to tap again in.`}];
        return [];
    }
}

// What a behaviour costs, said when true: single taps wait while a deeper tap
// count could follow, and what pressing another key does while the first
// press's hold is undecided (firmware INTERACTION_MODEL.md, "Keys pressed
// while a tap/hold key is undecided"). Today an LT, MT or OSM key, or one
// whose hold is a layer held until release, makes later keys wait; one that
// holds from the press uses its hold at once; any other hold lets later keys
// through at once.
/** @param {ReturnType<typeof behaviourEditorRow>} behaviour @param {number} depth @param {{hold: string, repeat: string}} terms @param {import("../../contracts/panel.js").Branch | null | undefined} hold */
export function behaviourCosts(behaviour, depth, terms, hold) {
    const single = depth > 1 ? `Single taps wait ${terms.repeat} ms to see if another tap follows.` : "";
    if (!hold) return {single, hold: ""};
    const dual = /^(LT|MT|OSM)\(/.test(String(behaviour?.keycode ?? ""));
    const layerHold = hold.helper === "PRESS_AND_HOLD_UNTIL_RELEASE" && /^MO\(/.test(String(hold.action));
    let line;
    if (hold.fromPress) line = "Its hold starts as the key goes down, so keys pressed meanwhile use it at once.";
    else if (dual || layerHold) line = `Keys pressed before ${terms.hold} ms wait until this key is a tap or a hold.`;
    else line = `Keys pressed before ${terms.hold} ms are sent at once, so a quick roll types them before this key's tap.`;
    return {single, hold: line};
}

export function behaviourTimingField(/** @type {import("../../contracts/panel.js").BehaviorView} */ behaviour, /** @type {"tapHoldTerm" | "longerHoldTerm" | "multiTapTerm"} */ name) {
    const stored = String(behaviour[name] ?? "0");
    const followsDefault = Number(stored) === 0;
    const fallback = behaviour.timingDefaults?.[name];
    return {stored, followsDefault, fallback: fallback === undefined ? "" : String(fallback),
        ...timingInput(stored, fallback, followsDefault)};
}

// A stored behaviour row that changes nothing: no branches, no timing of its
// own, on on every layer and not anchoring auto-mouse. The keyboard runs the
// key as if the row were not there.
export function behaviourIsEmpty(/** @type {import("../../contracts/panel.js").BehaviorView} */ behaviour, /** @type {number} */ layerCount) {
    const every = 2 ** layerCount - 1;
    return !(behaviour.steps || []).length && behaviour.enabled !== false && !behaviour.keepsAutoMouseAnchored
        && ((behaviour.allowedLayers ?? every) & every) === every
        && ["tapHoldTerm", "longerHoldTerm", "multiTapTerm"].every((name) => Number(behaviour[/** @type {"tapHoldTerm"} */ (name)] ?? 0) === 0);
}

// The thresholds a behaviour actually runs on, in ms — its own, or the
// keyboard's default where it follows that: tap / hold whenever a tier waits to be held, long
// hold when a branch has one, repeated taps when a branch starts on a later
// tap. A behaviour with no branches yet still carries its tap / hold term.
export function behaviourThresholds(/** @type {Model} */ model, /** @type {import("../../contracts/panel.js").BehaviorView} */ behaviour) {
    const row = behaviourEditorRow(model, behaviour.keycode) || {...behaviour, timingDefaults: model?.behaviorTimingDefaults || {}};
    const steps = behaviour.steps || [];
    /** @param {"tapHoldTerm" | "longerHoldTerm" | "multiTapTerm"} name */
    const term = (name) => {
        const field = behaviourTimingField(/** @type {any} */ (row), name);
        return {name, ms: field.followsDefault ? field.fallback : field.stored};
    };
    const used = {
        tapHoldTerm: !steps.length || steps.some((step) => step.hold || step.longHold),
        longerHoldTerm: steps.some((step) => step.longHold),
        multiTapTerm: steps.some((step) => step.tapCount > 0),
    };
    return {tapHoldTerm: term("tapHoldTerm"), longerHoldTerm: term("longerHoldTerm"), multiTapTerm: term("multiTapTerm"),
        used: /** @type {const} */ (["tapHoldTerm", "longerHoldTerm", "multiTapTerm"]).filter((name) => used[name])};
}

// The number a hold tier's helper turns on, as the card states it beside the
// helper: a Hold that taps at or after its threshold waits for tap / hold and a
// Long hold for long hold, while one that repeats runs at its own rate, given
// as stored. Empty when the helper turns on neither.
export function helperDetail(/** @type {import("../../contracts/edits.js").Tier} */ kind, /** @type {{helper?: string, repeatHz?: import("../../contracts/edits.js").Scalar}} */ branch, /** @type {ReturnType<typeof behaviourThresholds>} */ terms) {
    if (kind === "tap") return "";
    if (branch.helper === "REPEAT_WHILE_HELD") return `${String(branch.repeatHz ?? "0")} Hz`;
    if (branch.helper !== "TAP_AT_HOLD_THRESHOLD" && branch.helper !== "TAP_ON_RELEASE_AFTER_HOLD") return "";
    const term = terms[kind === "hold" ? "tapHoldTerm" : "longerHoldTerm"];
    return term.ms === "" ? "" : `${term.ms} ms`;
}

// Leaving a displayed default untouched must keep the stored inheritance zero.
export function behaviourTimingEdit(/** @type {string} */ value, /** @type {ReturnType<typeof behaviourTimingField>} */ field) {
    const written = String(value).trim();
    if (field.followsDefault && field.fallback !== "" && written === field.fallback) return field.stored;
    return written === field.value ? field.stored : written || "0";
}
