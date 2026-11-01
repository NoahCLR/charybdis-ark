// @ts-check
/** @typedef {import("../../contracts/panel.js").BehaviorView} BehaviorView */
/** @typedef {import("../../contracts/panel.js").Position} Position */
/** @typedef {import("./keyface-types.js").ViewModel} ViewModel */
// What a key shows: its legend, and the marks for everything it reaches.
//
// The model already resolved each position to a display label; this adds the
// layer-tap hint, the behaviour tiers and the combo badges, and nothing else.

import {keyMeaning} from "../../rules/combo-inputs.mjs";
import {vocabulary} from "./vocabulary.mjs";
import {keyIdentity} from "./key-identity.mjs";

// A layer key's second line is in the vocabulary's words (keyCapLayerVerbs),
// and which keys act on a layer, and how, is core's (keyIdentity's
// layerForm), as is which key is transparent or disabled (its kind), so every
// caller passes the model it has.
/** @param {ViewModel} model @returns {import("./keyface-types.js").KeyFace} */
export function keyFace(/** @type {import("../../contracts/panel.js").Position | null | undefined} */ position, model) {
    if (!position) return {main: "", sub: "", kind: "none"};
    const keycode = position.keycode || "";
    const key = keyIdentity(model, keycode);
    const kind = key.kind;
    if (kind === "transparent") return {main: "▽", sub: "", kind};
    if (kind === "disabled") return {main: "", sub: "", kind};
    const form = key.layerForm;
    const layerTap = form === "LT";
    const verb = form && form !== "LT" ? vocabulary(model).keyCapLayerVerbs[form] : undefined;
    // The line across a cap marks a dual-role key: what it taps above, what
    // it holds below. A layer-tap's second line names its layer; a mod-tap's
    // the modifier its hold sends (modifierLabel); a dual-role layer key's
    // (OSL(), TT()) what it does to the layer the cap names, in the
    // vocabulary's words. Any other key reads on one line by core's name for
    // it: a single-role layer key ("Hold Navigation"), and a pointing key for
    // a slot that holds nothing ("Slot 6 · hold (empty)"). Otherwise
    // MT(Shift, A) and a plain A would be indistinguishable on the board.
    return {
        main: position.display || keycode,
        sub: layerTap ? position.layerLabel || "" : verb ?? position.modifierLabel ?? "",
        kind: form ? "layer" : "key",
    };
}

// A dual-role key's two halves: what a tap sends, and what a hold does — hold
// a layer on, or a modifier. Null for any other key.
/** @param {ViewModel} model @param {Position | null | undefined} position @returns {{tap: string, hold: {layer: number, name: string} | {modifier: string}} | null} */
export function dualRole(model, position) {
    if (!position) return null;
    const key = keyIdentity(model, position.keycode);
    const layer = key.layerForm === "LT" ? key.layer : undefined;
    if (layer !== undefined) return {tap: position.display || "", hold: {layer, name: position.layerLabel || ""}};
    return position.modifierLabel ? {tap: position.display || "", hold: {modifier: position.modifierLabel}} : null;
}

// A key by its whole name, for anything that is not a key cap. A cap shows what
// fits — "F" over "Navigation" — and the name is the core's for the keycode,
// "F / Navigation" (core/model/key-names.js).
/** @param {Position | null | undefined} position @param {ViewModel} model */
export function keyName(position, model) {
    const face = keyFace(position, model);
    if (face.kind === "transparent") return "Transparent";
    if (face.kind === "disabled" || face.kind === "none") return "Unmapped";
    return position?.editLabel || face.main || position?.keycode || "";
}


// A position carries two names: the one the keyboard stores (`QK_USER_16`, or
// bare hex for a value the shipped vocabulary never named) and the one the rest
// of the profile uses (`PD_MODE_0`, `MACRO_0`, `LEFT_THUMB`). Behaviour
// rows, macro slots and pointing slots are all keyed by the second, so every
// lookup from a key to what it reaches goes through this, the rule combos
// match their inputs by (rules/combo-inputs.mjs).
export {keyMeaning};

// Macro slots have one profile name across all 64 slots, even though QMK's
// catalogue names only the first 32 native values. A bare value the keyboard
// names — a custom key, a pointing slot — reads by that name too, since the
// number says nothing to a person. Keep position.keycode for round-trip edits;
// use this when a screen prints that keycode to a person.
/** @param {ViewModel} model @param {string} name */
export const visibleKeycode = (model, name) => {
    const identity = keyIdentity(model, name);
    return identity.kind === "macro" || /^0x[0-9a-f]+$/i.test(name) ? identity.name : name || "";
};

// An action as the hover card names it: its words, and the keycode it stores
// where that says something the words do not.
/** @param {ViewModel} model @param {string} name */
export function actionNaming(model, name) {
    const words = keyIdentity(model, name).label, stored = visibleKeycode(model, name);
    return {words, stored: stored && stored !== words ? stored : ""};
}

// What a behaviour cell reads as in the grid: the name a person knows the key
// by, so it says "#", "Shift+Enter" and "Hold Numbers" where the keyboard
// stores KC_HASH, LSFT(KC_ENTER) and MO(1). Every name comes from the core
// (core/model/key-names.js); with none, the keycode is the label. The cell
// editor keeps the keycode. A custom key's own tap and hold read as the
// shortcut they send (firmware D-F26), which the core labels them with.
/** @param {ViewModel} model @param {import("../../contracts/panel.js").Branch | null | undefined} branch */
export function cellLabel(model, branch) {
    const action = String(branch?.action ?? "");
    const key = keyIdentity(model, action);
    if (key.kind === "customKey" && branch?.label) return branch.label;
    const named = key.label;
    return named !== action ? named : branch?.label || action;
}


// One dot per tier the behaviour uses anywhere, carrying how many branches use
// it — the same shape the feedback stage flashes.
/** @param {BehaviorView | null | undefined} behaviour */
export function behaviourTiers(behaviour) {
    if (!behaviour) return [];
    /** @param {"tap" | "hold" | "longHold"} pick */
    const count = (pick) => (behaviour?.steps || []).filter((step) => step[pick]).length;
    /** @type {{kind: import("./keyface-types.js").Tier; count: number}[]} */
    const tiers = [
        {kind: "tap", count: count("tap")},
        {kind: "hold", count: count("hold")},
        {kind: "long", count: count("longHold")},
    ];
    return tiers.filter((tier) => tier.count > 0);
}

// The device stores only populated tap steps, but the editor is a matrix of
// every step the firmware supports. Keep empty columns visible so a one-step
// behaviour can grow without first inventing data for the other columns.
/** @param {BehaviorView | null | undefined} behaviour @param {number} [advertisedMaximum] */
export function behaviourGridSteps(behaviour, advertisedMaximum = 5) {
    const requested = Number(advertisedMaximum);
    const maximum = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 5) : 5;
    const populated = new Map((behaviour?.steps || []).map((step) => [step.tapCount, step]));
    return Array.from({length: maximum}, (_, tapCount) => populated.get(tapCount) || {tapCount});
}

// How deep a behaviour's tap counts go: its deepest tap count with an action
// set, or 0 with none. A quick run past it types (firmware D-F33): the taps so
// far are sent as the first tap and every further press is a single tap of its
// own, so deeper rows are never reached.
/** @param {BehaviorView | null | undefined} behaviour */
export const behaviourDepth = (behaviour) => Math.max(0, ...(behaviour?.steps || [])
    .filter((step) => step.tap || step.hold || step.longHold).map((step) => step.tapCount + 1));

// The grid's rows. Compact, it shows the tap counts in use and the next one,
// to add (`add`); all, every tap count the keyboard allows. A row past the
// next one is never reached, because the run types by then, so it says which
// tap count answers instead (`like`, 0-based): the first. `typing` is how many
// quick taps type the first tap once each, when the row is deeper than one.
/** @param {BehaviorView | null | undefined} behaviour @param {number} [advertisedMaximum] @param {boolean} [all] */
export function behaviourGridLayout(behaviour, advertisedMaximum = 5, all = false) {
    const steps = behaviourGridSteps(behaviour, advertisedMaximum);
    const depth = behaviourDepth(behaviour);
    const shown = all ? steps.length : Math.min(steps.length, Math.max(depth, 1) + 1);
    const rows = steps.slice(0, shown).map((step) => ({step,
        add: step.tapCount >= Math.max(depth, 1),
        like: depth > 1 && step.tapCount > depth ? 0 : null}));
    return {rows, depth, typing: depth > 1 ? {taps: depth + 1} : null};
}

// What the keyboard does for a tier the row leaves empty (core/model/
// built-in-behavior.js). An empty first tap is the key's own. An empty later
// tap repeats the first tap, the row's own (`first`) or else the key's, once
// per press, so it carries `times` (firmware D-F33). It fills every tap count
// the row reaches, its deepest authored count; past that depth the keyboard
// starts again at a single tap (behaviourDepth), so those cells stay empty.
// The built-in hold belongs to the first press (`fromPress` when it
// starts as the key goes down, as core judges it for the row), and a
// fallback hold also gives way to an authored long hold there. An authored cell and a key with nothing built in
// inherit nothing.
/** @param {BehaviorView | null | undefined} behaviour @param {import("./keyface-types.js").BehaviorStep | null | undefined} step @param {import("./keyface-types.js").Tier} kind @returns {import("./keyface-types.js").InheritedBranch | null} */
export function inheritedBranch(behaviour, step, kind) {
    const builtIn = behaviour?.builtIn || {};
    if (!step || !Number.isInteger(step.tapCount)) return null;
    if (kind === "tap") {
        if (step.tap) return null;
        if (!step.tapCount) return builtIn.tap || null;
        const own = (behaviour?.steps || []).find((entry) => entry.tapCount === 0)?.tap;
        const first = own ? {...own, first: true} : builtIn.tap;
        if (!first) return null;
        if (step.tapCount >= Math.max(1, behaviourDepth(behaviour))) return null;
        return {...first, times: step.tapCount + 1};
    }
    if (kind === "hold") {
        if (!builtIn.hold || step.tapCount !== 0 || step.hold || (builtIn.hold.fallback && step.longHold)) return null;
        return builtIn.hold;
    }
    return null;
}

// What an empty Hold or Long hold does because of the other hold tier
// (core/model/built-in-behavior.js). With no Long hold, nothing takes over at
// its threshold, so the press's Hold, set or built in, carries on the way it
// runs: `continues`. With a Long hold and no Hold of any kind, the press stays
// in its tap window until Long hold, so a release in between sends the tap
// that count would send, set or built in, on keys whose tap survives a hold
// (`releaseTaps`): `tapsBeforeLong`. Otherwise the cell is simply empty.
/** @param {BehaviorView | null | undefined} behaviour @param {import("./keyface-types.js").BehaviorStep | null | undefined} step @param {import("./keyface-types.js").Tier} kind @returns {import("./keyface-types.js").ImpliedBranch | null} */
export function impliedBranch(behaviour, step, kind) {
    if (!step || !Number.isInteger(step.tapCount)) return null;
    if (kind === "long") {
        if (step.longHold) return null;
        const hold = step.hold || inheritedBranch(behaviour, step, "hold");
        return hold ? {meaning: "continues", hold} : null;
    }
    if (kind === "hold") {
        if (step.hold || !step.longHold || !behaviour?.builtIn?.releaseTaps || inheritedBranch(behaviour, step, "hold")) return null;
        const tap = step.tap || inheritedBranch(behaviour, step, "tap");
        return tap ? {meaning: "tapsBeforeLong", tap} : null;
    }
    return null;
}
