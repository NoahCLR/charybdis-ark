// @ts-check
// Reading a macro payload for display.
//
// The keyboard stores a macro as text: literal characters, {KC_X} to tap,
// {+KC_X} to press, {-KC_X} to release and {120} to wait. This parses it for
// the preview and checks it by the same rules the host enforces on save
// (core/schema/macro-payload.js), so the preview never calls valid what the
// host would refuse. `options.keys` is the host's list of key names a macro
// may send; without it, key names are not checked. A key still held at the end
// is not an error here — the step builder passes through that state — and
// unreleased() reports it.

/** @typedef {import("./types.js").MacroStep} MacroStep */

// Each kind of macro step by its one name (glossary "Macro step"): the add
// buttons, the step editor and the picker it opens all say it this way.
/** @type {[MacroStep["kind"], string][]} */
export const STEP_KINDS = [
    ["text", "Text"], ["tap", "Key or chord"], ["delay", "Delay"],
    ["press", "Press"], ["release", "Release"],
];
/** @param {string} kind */
export const stepKindName = (kind) => STEP_KINDS.find(([value]) => value === kind)?.[1] || kind;
// The button that adds a step of this kind.
/** @param {string} kind */
export const addStepLabel = (kind) => `+ ${stepKindName(kind)}`;

const MAX_DELAY = 65535, MAX_KEYS = 16;
/** @param {string} character */
const printable = (character) => {
    const code = character.codePointAt(0);
    if (code === undefined) return false;
    return code === 9 || code === 10 || (code >= 32 && code <= 126) || (code >= 0xA0 && code <= 0x10FFFF && !(code >= 0xD800 && code <= 0xDFFF));
};

/** @param {unknown} payload @param {import("./types.js").MacroOptions} [options] */
export function parseMacro(payload, options = {}) {
    /** @type {MacroStep[]} */
    const steps = [];
    /** @type {Set<string>} */
    const held = new Set();
    /** @param {string} key */
    const keyId = key => options.aliases?.[key] || key;
    let text = "";
    let textHoldError = false;
    // Text the host layout cannot type needs Unicode entry, which a held
    // ordinary key would corrupt; without a layout, that is any non-ASCII text.
    /** @param {string} character */
    const needsEntry = character => options.layoutChars ? !options.layoutChars.includes(character) : /[^\x00-\x7F]/u.test(character);
    const flush = () => { if (options.textEntry && [...text].some(needsEntry) && [...held].some(key => options.modifierKeys ? !options.modifierKeys.includes(key) : !/KC_(?:LCTL|LSFT|LALT|LGUI|RCTL|RSFT|RALT|RGUI|LEFT_CTRL|LEFT_SHIFT|LEFT_ALT|LEFT_GUI|RIGHT_CTRL|RIGHT_SHIFT|RIGHT_ALT|RIGHT_GUI)$/.test(key))) textHoldError = true; if (text) steps.push({kind: "text", text}); text = ""; };
    const source = String(payload ?? "");
    const allowed = options.keys?.length ? new Set(options.keys) : null;

    for (let index = 0; index < source.length;) {
        // The loop bounds guarantee a code point at this index.
        const character = String.fromCodePoint(/** @type {number} */ (source.codePointAt(index)));
        index += character.length;
        if ((character === "{" || character === "}") && source[index] === character) { text += character; index++; continue; }
        if (character === "}") return fail(steps, "Unexpected } — use }} for a literal closing brace.");
        if (character !== "{") {
            if (!printable(character)) return fail(steps, "Use valid Unicode text, tabs or newlines; control characters and unpaired surrogates are unsupported.");
            text += character; continue;
        }
        flush();
        const end = source.indexOf("}", index);
        if (end < 0) return fail(steps, "A macro command is missing its }.");
        const command = source.slice(index, end).trim();
        index = end + 1;
        if (/^\d+$/.test(command)) {
            if (Number(command) > MAX_DELAY) return fail(steps, "A macro delay must be between 0 and 65,535 milliseconds.");
            steps.push({kind: "delay", delay: Number(command)}); continue;
        }
        if (!command) return fail(steps, "An empty {} is not a macro command.");
        const kind = command[0] === "+" ? "press" : command[0] === "-" ? "release" : "tap";
        const keys = (kind === "tap" ? command : command.slice(1)).split(",").map((name) => name.trim()).filter(Boolean);
        if (!keys.length) return fail(steps, "A macro command needs at least one key.");
        if (kind !== "tap" && keys.length !== 1) return fail(steps, "A press or release names one key; use a tap for a chord.");
        const identities = keys.map(keyId);
        if (keys.length > MAX_KEYS || new Set(identities).size !== keys.length) return fail(steps, "A chord is up to 16 distinct keys.");
        const unknown = allowed && keys.find((key) => !allowed.has(key));
        if (unknown) return fail(steps, `${unknown} is not a key a macro can send.`);
        if (kind === "release") {
            if (!held.delete(identities[0])) return fail(steps, `${keys[0]} is released but was never pressed.`);
        } else {
            if (identities.some((key) => held.has(key))) return fail(steps, "A macro presses a key that is already held.");
            if (held.size + keys.length > MAX_KEYS) return fail(steps, "A macro holds at most 16 keys at once.");
            if (kind === "press") held.add(identities[0]);
        }
        steps.push({kind, keys});
    }
    flush();
    return textHoldError ? fail(steps, "Release ordinary keys before text your keyboard layout cannot type, which needs Unicode entry; modifier holds are supported.") : {steps, error: ""};
}

/** @param {MacroStep[]} steps @param {string} error */
const fail = (steps, error) => ({steps, error});

/** @param {MacroStep} step @param {(name: string) => string} [label] */
export const describeStep = (step, label = (name) => name) => step.kind === "text" ? step.text
    : step.kind === "delay" ? `${step.delay} ms`
    : step.keys.map(label).join(" + ");

/** @param {MacroStep} step */
export function serializeMacroStep(step) {
    if (step.kind === "text") return String(step.text ?? "").replaceAll("{", "{{").replaceAll("}", "}}");
    if (step.kind === "delay") return `{${Math.max(0, Number(step.delay) || 0)}}`;
    const keys = (step.keys || []).join(",");
    if (!keys) return "";
    return step.kind === "press" ? `{+${keys}}` : step.kind === "release" ? `{-${keys}}` : `{${keys}}`;
}

/** @param {readonly MacroStep[]} steps */
export const serializeMacro = (steps) => steps.map(serializeMacroStep).join("");

// Editable steps retain incomplete fields locally. The raw view must reflect
// them verbatim, while incomplete commands are never posted for staging.
/** @param {readonly MacroStep[]} steps */
export function macroStepsInput(steps) {
    let error = "";
    const payload = steps.map(step => {
        if (step.kind === "text") return serializeMacroStep(step);
        if (step.kind === "delay") {
            if (!/^\d+$/.test(String(step.delay)) || Number(step.delay) > MAX_DELAY) error ||= "Enter a delay between 0 and 65,535 milliseconds.";
            return `{${step.delay}}`;
        }
        if (!step.keys?.length) error ||= "Choose a key for each key step.";
        return `{${step.kind === "press" ? "+" : step.kind === "release" ? "-" : ""}${(step.keys || []).join(",")}}`;
    }).join("");
    return {payload, error};
}

// What a slot shows on its cell. Every macro on a real keyboard tends to open
// with the same modifier press, so the head of the payload makes them all look
// identical; what tells them apart is the key they actually send.
/** @param {unknown} payload @param {(name: string) => string} [label] */
export function macroPeek(payload, label = (name) => name) {
    const {steps} = parseMacro(payload);
    return macroPeekSteps(steps, label);
}

/** @param {MacroStep[]} steps @param {(name: string) => string} [label] */
export function macroPeekSteps(steps, label = (name) => name) {
    const text = steps.filter((step) => step.kind === "text").map((step) => step.text).join("").trim();
    if (text) return text;
    const taps = steps.filter((step) => step.kind === "tap").flatMap((step) => step.keys);
    if (taps.length) return taps.map(label).join(" ");
    const held = steps.filter((step) => step.kind === "press").flatMap((step) => step.keys);
    if (held.length) return held.map(label).join(" + ");
    return steps[0] ? describeStep(steps[0], label) : "";
}

// A macro as its chips read it: each step in order with its kind (a tap of
// several keys marked as a chord), its short label and its full words, up to `limit` steps and how many more follow.
// Typed text is cut to `TEXT_CHIP` characters on the chip and `TEXT_TIP` in its
// tooltip, so a long string cannot swamp the row or the hover card.
export const TEXT_CHIP = 24, TEXT_TIP = 200;
/** @param {string} text @param {number} max */
const clip = (text, max) => [...text].length > max ? `${[...text].slice(0, max - 1).join("").trimEnd()}…` : text;
/** @param {unknown} payload @param {(step: MacroStep) => {label: string, full: string}} [face] @param {number} [limit] */
export function macroChips(payload, face = (step) => ({label: describeStep(step), full: describeStep(step)}), limit = 12) {
    const {steps} = parseMacro(payload);
    const chips = steps.slice(0, limit).map((step) => {
        const {label, full} = face(step);
        if (step.kind === "text") return {kind: step.kind, label: clip(label, TEXT_CHIP), full: clip(full, TEXT_TIP)};
        return step.kind === "tap" && step.keys.length > 1 ? {kind: step.kind, label, full, chord: true} : {kind: step.kind, label, full};
    });
    return {chips, more: Math.max(0, steps.length - limit)};
}

// Held keys that are never released leave the keyboard holding them, so the
// preview says so rather than letting it through quietly.
/** @param {readonly MacroStep[]} steps @param {Readonly<Record<string, string>>} [aliases] */
export function unreleased(steps, aliases = {}) {
    /** @type {string[]} */
    const held = [];
    for (const step of steps) {
        const keys = step.kind === "text" || step.kind === "delay" ? [] : step.keys.map(key => aliases[key] || key);
        if (step.kind === "press") held.push(...keys);
        if (step.kind === "release") for (const key of keys) {
            const at = held.indexOf(key);
            if (at >= 0) held.splice(at, 1);
        }
    }
    return held;
}

// Whether a slot answers a search. A macro is found by the name it was given,
// and by the slot it sits in as the screens label it — "M3", "Macro 3" or its
// keycode — so an unnamed macro can still be found. Case is ignored.
/** @param {{keycode?: string, name?: string} | null | undefined} slot @param {unknown} query */
export function macroMatches(slot, query) {
    const needle = String(query ?? "").trim().toLowerCase();
    if (!needle) return true;
    const number = String(slot?.keycode ?? "").split("_").at(-1);
    return [slot?.name, `M${number}`, `Macro ${number}`, slot?.keycode]
        .some((text) => String(text ?? "").toLowerCase().includes(needle));
}

// Whether two payloads are the same macro: the same steps once every key name
// is read through the catalogue's aliases (KC_LGUI is KC_LEFT_GUI). The draft
// holds the keyboard's canonical names, so an edit typed with an alias is not
// "local" once the draft has it. Unparseable text compares as written.
/** @param {unknown} a @param {unknown} b @param {Readonly<Record<string, string>>} [aliases] */
export function samePayload(a, b, aliases = {}) {
    const left = String(a ?? ""), right = String(b ?? "");
    if (left === right) return true;
    const one = parseMacro(left), two = parseMacro(right);
    if (one.error || two.error) return false;
    /** @param {MacroStep} step @returns {MacroStep} */
    const canonical = step => step.kind === "text" || step.kind === "delay" ? step : {...step, keys: step.keys.map(key => aliases[key] || key)};
    return serializeMacro(one.steps.map(canonical)) === serializeMacro(two.steps.map(canonical));
}

// What a macro card's chip says its editor holds, against the draft and the
// keyboard: an edit not kept in the draft yet, a macro the draft changed
// (Review lists it), or the macro as read (in the demo, as the demo setup has
// it). A playback change caused by Your computer is not a change to the macro.
/** @param {readonly Pick<import("../../contracts/model.js").ReviewChange, "unit">[] | undefined} changes @param {string} keycode @param {boolean} local @returns {{state: "local" | "draft" | "read", dot: string, text: string}} */
export function macroLocalState(changes, keycode, local) {
    if (local) return {state: "local", dot: "draft", text: "edited here"};
    const unit = `macro:${keycode.replace(/^VIA_MACRO_/, "")}`;
    return (changes || []).some((change) => change.unit === unit)
        ? {state: "draft", dot: "draft", text: "changed in draft"}
        : {state: "read", dot: "on", text: "as read"};
}
