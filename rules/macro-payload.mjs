// @ts-check

// A macro as Ark writes it: text, {key} or {key,key} to tap a key or chord,
// {+key} and {-key} to press and release one, {milliseconds} to wait, and
// doubled braces for a literal brace. One grammar (D-L73), read by core when a
// macro is stored (core/schema/macro-payload.js) and by the interface's step
// editor as a person types (webview/view/macro.mjs). Each says what went wrong
// in its own words, from the reason code here, and passes in what it knows of
// keys.
//
// The keyboard types text through the host layout and the rest by host
// Unicode entry, which an ordinary key held across it would corrupt.

// What one macro may ask of the keyboard: keys held at once, a chord's keys
// included, and a delay in milliseconds.
export const MACRO_LIMITS = Object.freeze({maxHeldKeys: 16, maxDelayMs: 65535});

// Why a macro does not read, as a reason code; each reader words it.
export const MACRO_PROBLEM_CODES = Object.freeze(/** @type {const} */ (["unexpectedClose", "unprintable", "missingClose", "delay", "empty", "noKeys", "pressOne", "chord",
    "unknown", "notHeld", "heldAgain", "tooManyHeld", "textHold", "stillHeld"]));
/**
 * @typedef {(typeof MACRO_PROBLEM_CODES)[number]} MacroProblem
 * @typedef {{code: MacroProblem, key?: string}} MacroError
 * @typedef {{kind: "text", text: string} | {kind: "delay", delay: number} | {kind: "tap" | "press" | "release", keys: string[], ids: unknown[]}} MacroToken
 * @typedef {object} MacroReading
 * @property {(name: string) => unknown} identity What a key name is, to tell two keys apart.
 * @property {(name: string) => boolean} sendable Whether a macro can send this key.
 * @property {boolean} [textEntry] Whether text the host layout cannot type goes by Unicode entry.
 * @property {(character: string) => boolean} [needsEntry] Whether the host layout cannot type this character.
 * @property {(id: unknown) => boolean} [ordinary] Whether a held key is an ordinary key, not a modifier.
 * @property {boolean} [skipEmptyNames] Whether an empty name between commas is skipped, as the step editor does, rather than refused.
 * @property {boolean} [stopAtTextHold] Whether text a held ordinary key would corrupt stops the reading there, as core does, or is said only once the rest reads.
 * @property {boolean} [releaseAll] Whether every held key must be released by the end, as the keyboard needs of a stored macro.
 */

/**
 * Why a macro does not read, in a reader's words for each reason (core's
 * vocabulary.macroProblems): a key the reason names leads them, and a reason
 * with no words reads as its code.
 * @param {{readonly code: string, readonly key?: string}} problem @param {Readonly<Record<string, string>> | undefined} words
 */
export const macroProblemWords = ({code, key}, words) => {
    const said = words?.[code] ?? code;
    return key === undefined ? said : `${key} ${said}`;
};

// Tab, newline, printable ASCII and every Unicode scalar from U+00A0 up.
/** @param {number} code */
const printable = (code) => code === 9 || code === 10 || (code >= 32 && code <= 126) || (code >= 0xA0 && code <= 0x10FFFF && !(code >= 0xD800 && code <= 0xDFFF));

/**
 * A macro's steps, as far as they read, and what stopped it, if anything.
 * @param {string} source @param {MacroReading} reading @returns {{steps: MacroToken[], error: MacroError | null}}
 */
export function readMacroPayload(source, reading) {
    /** @type {MacroToken[]} */
    const steps = [];
    /** @type {Set<unknown>} */
    const held = new Set();
    let text = "", textHold = false;
    // Text the host layout cannot type, with an ordinary key held across it.
    const flush = () => {
        const blocked = Boolean(reading.textEntry) && [...text].some((character) => reading.needsEntry?.(character)) && [...held].some((id) => reading.ordinary?.(id));
        if (text) steps.push({kind: "text", text});
        text = "";
        if (blocked) textHold = true;
        return blocked && reading.stopAtTextHold;
    };
    /** @param {MacroProblem} code @param {string} [key] */
    const fail = (code, key) => ({steps, error: key === undefined ? {code} : {code, key}});
    for (let index = 0; index < source.length;) {
        const code = /** @type {number} */ (source.codePointAt(index));
        const character = String.fromCodePoint(code);
        index += character.length;
        if ((character === "{" || character === "}") && source[index] === character) { text += character; index++; continue; }
        if (character === "}") return fail("unexpectedClose");
        if (character !== "{") {
            if (!printable(code)) return fail("unprintable");
            text += character;
            continue;
        }
        if (flush()) return fail("textHold");
        const end = source.indexOf("}", index);
        if (end < 0) return fail("missingClose");
        const command = source.slice(index, end).trim();
        index = end + 1;
        if (/^\d+$/.test(command)) {
            if (Number(command) > MACRO_LIMITS.maxDelayMs) return fail("delay");
            steps.push({kind: "delay", delay: Number(command)});
            continue;
        }
        if (!command) return fail("empty");
        const kind = command[0] === "+" ? "press" : command[0] === "-" ? "release" : "tap";
        const keys = (kind === "tap" ? command : command.slice(1)).split(",").map((name) => name.trim()).filter((name) => !reading.skipEmptyNames || name);
        if (!keys.length) return fail("noKeys");
        if (kind !== "tap" && keys.length !== 1) return fail("pressOne");
        const ids = keys.map(reading.identity);
        if (keys.length > MACRO_LIMITS.maxHeldKeys || new Set(ids).size !== keys.length) return fail("chord");
        const unknown = keys.find((name) => !reading.sendable(name));
        if (unknown !== undefined) return fail("unknown", unknown);
        if (kind === "release") {
            if (!held.delete(ids[0])) return fail("notHeld", keys[0]);
        } else {
            if (ids.some((id) => held.has(id))) return fail("heldAgain");
            if (held.size + keys.length > MACRO_LIMITS.maxHeldKeys) return fail("tooManyHeld");
            if (kind === "press") held.add(ids[0]);
        }
        steps.push({kind, keys, ids});
    }
    if (flush() || textHold) return {steps, error: {code: "textHold"}};
    if (reading.releaseAll && held.size) return {steps, error: {code: "stillHeld"}};
    return {steps, error: null};
}
