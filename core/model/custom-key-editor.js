// @ts-check
"use strict";
const {PROFILE_DOMAIN_IDS, replaceDomain} = require("../schema/profile-domains");

// The 128 custom keys: named keys that do only what their behaviour says. A key
// has an identity (CUSTOM_KEY_n, keycode 0x7f00 + n) and a name; what it does
// is its behaviour row, edited like any other. Without a row it does nothing,
// and a behaviour step cannot send one: it is placed on a layer or emitted by
// a combo.

const {decodedOf, encodeNamedProfile, validateSnapshot} = require("./portable-profile");
const {PROFILE_ACTION_KINDS: ACTION} = require("../schema/profile-blob-v1");
const {SETTINGS, validName, encodeSettings} = require("../schema/settings-domain-v1");
const {knownActionAbi} = require("../schema/actions");
const {CUSTOM_KEY_SLOTS, customKeyCode} = require("../data/user-keycodes");
/** @param {string} message @param {string} [code] */
const fail = (message, code = "CUSTOM_KEY_EDIT_CONFLICT") => Object.assign(new Error(message), {code});

// A keyboard with the userspace keycode blocks has custom keys: its action ABI
// is the one the app knows.
/** @param {import("./types.js").PortableDocument | null | undefined} document @param {import("./types.js").ProfileDestination} [capabilities] */
const customKeysSupported = (document, capabilities) => Boolean(document && knownActionAbi(capabilities?.actionAbiDigest ?? document.actionAbiDigest));

/** @param {import("./types.js").ProfileSnapshot | null | undefined} snapshot @param {import("./types.js").ProfileDestination} [capabilities] */
function customKeyEditorView(snapshot, capabilities) {
    if (!snapshot?.document || snapshot.incomplete || !customKeysSupported(snapshot.document, capabilities)) return null;
    const {settings, behaviors} = decodedOf(snapshot);
    const names = settings.customKeyNames;
    const behaved = new Set(behaviors.rows.filter(row => row.target.kind === ACTION.CUSTOM_KEY).map(row => row.target.operand));
    return {identity: snapshot.fingerprint,
        keys: names.map((name, slot) => ({slot, keycode: `CUSTOM_KEY_${slot}`, code: customKeyCode(slot), name, hasBehavior: behaved.has(slot)})),
        // Each name may be 32 bytes of text; the profile as a whole has a ceiling.
        names: {perName: SETTINGS.NAME_MAX_BYTES}};
}

// A custom key's name. Names live in the profile's settings domain.
/** @param {import("./types.js").CompleteSnapshot} snapshot @param {import("../../contracts/edits.js").EditPayloads['updateCustomKey'] & {expectedFingerprint: string}} message @param {import("./types.js").ProfileDestination} [capabilities] */
function editCustomKey(snapshot, message, capabilities) {
    if (!snapshot?.document || !message.expectedFingerprint || message.expectedFingerprint !== snapshot.fingerprint) throw fail("The keyboard changed since this draft was opened. Read the keyboard and review the draft before saving again.");
    const match = /^CUSTOM_KEY_(\d+)$/.exec(message.keycode || "");
    const slot = match ? Number(match[1]) : -1;
    if (!match || slot >= CUSTOM_KEY_SLOTS || String(slot) !== match[1]) throw fail("Choose a custom key the keyboard has.");
    if (typeof message.name !== "string") throw fail("A custom key name must be text.");
    if (!customKeysSupported(snapshot.document, capabilities)) throw fail("Custom keys need firmware with the userspace keycode blocks.", "CUSTOM_KEYS_UNSUPPORTED");
    const value = validateSnapshot(snapshot.document, capabilities);
    const name = message.name.trim();
    if (!validName(name)) throw fail(`A custom key name is up to ${SETTINGS.NAME_MAX_BYTES} bytes of text, with no control characters. Accented letters and symbols take two to four bytes each.`, "CUSTOM_KEY_NAME_INVALID");
    if (name === value.settings.customKeyNames[slot]) return value.document;
    /** @type {import("./types.js").PortableDocument} */
    const document = JSON.parse(JSON.stringify(value.document));
    const settings = structuredClone(value.settings);
    settings.customKeyNames[slot] = name;
    document.profile = replaceDomain(value.profile, PROFILE_DOMAIN_IDS.SETTINGS, () => encodeSettings(settings), encodeNamedProfile).toString("base64");
    validateSnapshot(document, capabilities);
    return document;
}

module.exports = {customKeyEditorView, editCustomKey, customKeysSupported};
