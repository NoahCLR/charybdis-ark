// @ts-check
/** @typedef {import("../../contracts/panel.js").BehaviorView} BehaviorView */
/** @typedef {import("../../contracts/panel.js").Position} Position */
/** @typedef {import("./keyface-types.js").ViewModel} ViewModel */
// What a key shows: its legend, and the marks for everything it reaches.
//
// The model already resolved each position to a display label; this adds the
// layer-tap hint, the behaviour tiers and the combo badges, and nothing else.

const TRANSPARENT = new Set(["KC_TRANSPARENT", "KC_TRNS", "_______"]);
const DISABLED = new Set(["KC_NO", "XXXXXXX"]);

/** @returns {import("./keyface-types.js").KeyFace} */
export function keyFace(/** @type {import("../../contracts/panel.js").Position | null | undefined} */ position) {
    if (!position) return {main: "", sub: "", kind: "none"};
    const keycode = position.keycode || "";
    if (TRANSPARENT.has(keycode)) return {main: "▽", sub: "", kind: "transparent"};
    if (DISABLED.has(keycode)) return {main: "", sub: "", kind: "disabled"};
    const layerTap = /^LT\(\s*([A-Z0-9_]+)\s*,/.exec(keycode);
    const layerKey = /^(MO|TO|TG|OSL|DF|PDF|TT)\(\s*([A-Z0-9_]+)\s*\)$/.exec(keycode);
    const modTap = /^MT\(([^,]+),/.exec(keycode);
    // A pointing key for a slot that holds nothing keeps its own name on the
    // cap; that it is inert belongs on the second line, where a key cap says
    // what is true of the key rather than of its label.
    const emptySlot = /^(.+) \(empty\)$/.exec(position.display || "");
    if (emptySlot) return {main: emptySlot[1], sub: "empty", kind: "key"};
    // A layer keycode's cap names its layer, so the second line says what it
    // does to that layer; a layer-tap's second line names its layer; a mod-tap reads as its tap key, so the second
    // line names the modifier its hold sends — otherwise MT(Shift, A) and a
    // plain A, or MO(1) and TG(1), would be indistinguishable on the board.
    return {
        main: position.display || keycode,
        sub: layerTap ? position.layerLabel || shortLayer(layerTap[1]) : layerKey ? LAYER_VERBS[layerKey[1]] : modTap ? position.modifierLabel || modTap[1] : "",
        kind: layerTap || layerKey ? "layer" : "key",
    };
}

// The layer a keycode acts on, as its place in the stack: MO(3), LOCK_LAYER(3)
// and LT(3,KC_F) all name layer 3. A stored name the host knows by a semantic
// one (QK_USER_31 → LOCK_LAYER(3)) is read by that. Null for any other key.
const LAYER_KEYCODE = /^(?:MO|TG|TT|OSL|TO|DF|PDF|LOCK_LAYER)\(\s*(\d+)\s*\)$|^LT\(\s*(\d+)\s*,/;
/** @param {ViewModel} model @param {string} keycode */
export function layerOfKeycode(model, keycode) {
    const name = model?.qmkKeycodeAliases?.[keycode ?? ""] ?? keycode;
    const match = LAYER_KEYCODE.exec(String(name ?? ""));
    return match ? Number(match[1] ?? match[2]) : null;
}

// A dual-role key's two halves: what a tap sends, and what a hold does — hold
// a layer on, or a modifier. Null for any other key.
/** @param {ViewModel} model @param {Position | null | undefined} position @returns {{tap: string, hold: {layer: number, name: string} | {modifier: string}} | null} */
export function dualRole(model, position) {
    if (!position) return null;
    const layer = /^LT\(/.test(position.keycode) ? layerOfKeycode(model, position.keycode) : null;
    if (layer !== null) return {tap: position.display || "", hold: {layer, name: position.layerLabel || `Layer ${layer}`}};
    return position.modifierLabel ? {tap: position.display || "", hold: {modifier: position.modifierLabel}} : null;
}

// A key by its whole name, for anything that is not a key cap. A cap shows what
// fits — "F" over "Navigation" — and the name is the host's for the keycode,
// "F / Navigation" (core/model/key-names.js).
/** @param {Position | null | undefined} position */
export function keyName(position) {
    const face = keyFace(position);
    if (face.kind === "transparent") return "Transparent";
    if (face.kind === "disabled" || face.kind === "none") return "Unmapped";
    return position?.editLabel || face.main || position?.keycode || "";
}

/** @type {Record<string, string>} */
const LAYER_VERBS = {MO: "momentary", TO: "move", TG: "toggle", OSL: "one-shot", DF: "default", PDF: "default", TT: "tap-toggle"};
// Only for a position the host has not named: the layer the keycode holds.
/** @param {string} name */
const shortLayer = (name) => name.replace(/^LAYER_/, "").toLowerCase();

// A position carries two names: the one the keyboard stores (`QK_USER_16`, or
// bare hex for a value the shipped vocabulary never named) and the one the rest
// of the profile uses (`PD_SLOT_0`, `VIA_MACRO_0`, `LEFT_THUMB`). Behaviour
// rows, macro slots and pointing slots are all keyed by the second, so every
// lookup from a key to what it reaches goes through this.
export const keyMeaning = (/** @type {import("../../contracts/panel.js").Position | null | undefined} */ position) => position?.semantic || position?.keycode || "";

// Macro slots have one profile name across all 64 slots, even though QMK's
// catalogue names only the first 32 native values. A bare value the keyboard
// names — a custom key, a pointing slot — reads by that name too, since the
// number says nothing to a person. Keep position.keycode for round-trip edits;
// use this when a screen prints that keycode to a person.
/** @param {ViewModel} model @param {string} name */
export const visibleKeycode = (model, name) => {
    const semantic = model?.qmkKeycodeAliases?.[name] || "";
    if (/^VIA_MACRO_(?:[0-9]|[1-5][0-9]|6[0-3])$/.test(semantic)) return semantic;
    return semantic && /^0x[0-9a-f]+$/i.test(name) ? semantic : name || "";
};

// An action as the hover card names it: its words, and the keycode it stores
// where that says something the words do not.
/** @param {ViewModel} model @param {string} name */
export function actionNaming(model, name) {
    const words = actionLabel(model, name), stored = visibleKeycode(model, name);
    return {words, stored: stored && stored !== words ? stored : ""};
}

// How a keycode name is spoken in prose: the label the keyboard's own
// vocabulary gives it, so a behaviour row, a reach line and the key cap all
// call one key the same thing. Names the vocabulary does not cover — a device
// action outside the advertised ABI — keep their numeric identity.
/** @param {ViewModel} model @param {string} name */
export const actionLabel = (model, name) => model?.qmkKeyLabels?.[name]
    || model?.qmkKeyLabels?.[model?.qmkKeycodeAliases?.[name] ?? ""]
    || String(name ?? "");

// What a behaviour cell reads as in the grid: the name a person knows the key
// by, so it says "#", "Shift+Enter" and "Hold Numbers" where the keyboard
// stores KC_HASH, LSFT(KC_ENTER) and MO(1). Every name comes from the host
// (core/model/key-names.js); with none, the keycode is the label. The cell
// editor keeps the keycode. A custom key's own tap and hold read as the
// shortcut they send (firmware D-F26), which the host labels them with.
/** @param {ViewModel} model @param {import("../../contracts/panel.js").Branch | null | undefined} branch */
export function cellLabel(model, branch) {
    const action = String(branch?.action ?? "");
    if (/^CUSTOM_KEY_\d+$/.test(action) && branch?.label) return branch.label;
    const named = actionLabel(model, action);
    return named !== action ? named : branch?.label || action;
}

/** @param {ViewModel} model @param {string} keycode */
export const behaviourFor = (model, keycode) =>
    (model?.keyBehaviors || []).find((row) => row.keycode === keycode);

// One spelling per key: the picker says KC_ENT and G(KC_C) where a behaviour
// row says KC_ENTER and LGUI(KC_C), and an expression may or may not space its
// arguments or nest two modifiers either way round. Every name goes through the
// keyboard's alias table, and every modifier wrapper becomes one ordered set.
/** @type {Record<string, string[]>} */
const WRAPPER_MODS = {
    C: ["LCTL"], LCTL: ["LCTL"], S: ["LSFT"], LSFT: ["LSFT"], A: ["LALT"], LALT: ["LALT"], LOPT: ["LALT"],
    G: ["LGUI"], LGUI: ["LGUI"], LCMD: ["LGUI"], LWIN: ["LGUI"],
    RCTL: ["RCTL"], RSFT: ["RSFT"], RALT: ["RALT"], ROPT: ["RALT"], ALGR: ["RALT"], RGUI: ["RGUI"], RCMD: ["RGUI"], RWIN: ["RGUI"],
    LCS: ["LCTL", "LSFT"], LCA: ["LCTL", "LALT"], LCG: ["LCTL", "LGUI"], LSA: ["LSFT", "LALT"], LSG: ["LSFT", "LGUI"],
    LAG: ["LALT", "LGUI"], LCAG: ["LCTL", "LALT", "LGUI"], MEH: ["LCTL", "LSFT", "LALT"], HYPR: ["LCTL", "LSFT", "LALT", "LGUI"],
};
const MOD_ORDER = ["LCTL", "LSFT", "LALT", "LGUI", "RCTL", "RSFT", "RALT", "RGUI"];
export function canonicalKeycode(/** @type {Partial<import("../../contracts/panel.js").PublishedModel> | null | undefined} */ model, /** @type {string} */ expression) {
    let text = String(expression ?? "").replace(/\s+/g, "");
    /** @type {Set<string>} */
    const mods = new Set();
    for (let match; (match = /^([A-Z]+)\((.*)\)$/.exec(text)) && WRAPPER_MODS[match[1]];) {
        WRAPPER_MODS[match[1]].forEach((mod) => mods.add(mod));
        text = match[2];
    }
    const inner = text.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (name) => model?.qmkKeycodeAliases?.[name] ?? name);
    return MOD_ORDER.filter((mod) => mods.has(mod)).reduceRight((wrapped, mod) => `${mod}(${wrapped})`, inner);
}

// The behaviour row a picked expression would land on, however it is spelled.
export const behaviourListeningTo = (/** @type {Partial<import("../../contracts/panel.js").PublishedModel> | null | undefined} */ model, /** @type {string} */ expression) => {
    const wanted = canonicalKeycode(model, expression);
    return (model?.keyBehaviors || []).find((row) => canonicalKeycode(model, row.keycode) === wanted);
};


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

// What the keyboard does for a tier the row leaves empty (core/model/
// built-in-behavior.js). The key's own tap fills an empty tap at every tap count
// the row reaches, its deepest authored count, and is sent once per press, so
// it carries `times` past a single tap. Past that depth the presses are
// separate, shorter gestures, so those cells stay empty. The built-in hold
// belongs to the first press, and a fallback hold also gives way to an authored
// long hold there. An authored cell and a key with nothing built in inherit nothing.
/** @param {BehaviorView | null | undefined} behaviour @param {import("./keyface-types.js").BehaviorStep | null | undefined} step @param {import("./keyface-types.js").Tier} kind @returns {import("./keyface-types.js").InheritedBranch | null} */
export function inheritedBranch(behaviour, step, kind) {
    const builtIn = behaviour?.builtIn || {};
    if (!step || !Number.isInteger(step.tapCount)) return null;
    if (kind === "tap") {
        if (!builtIn.tap || step.tap) return null;
        const authored = (behaviour?.steps || []).filter((entry) => entry.tap || entry.hold || entry.longHold);
        const depth = Math.max(1, ...authored.map((entry) => entry.tapCount + 1));
        if (step.tapCount >= depth) return null;
        return step.tapCount ? {...builtIn.tap, times: step.tapCount + 1} : builtIn.tap;
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
