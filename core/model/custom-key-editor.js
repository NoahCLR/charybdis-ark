// @ts-check
"use strict";
const {PROFILE_DOMAIN_IDS, replaceDomain} = require("../schema/profile-domains");

// The 128 custom keys. A key has an identity (CUSTOM_KEY_n, keycode
// 0x7f00 + n), a name and a shortcut: modifiers from either side, up to six
// keys held together and any layers it holds on, the base and the default layers aside (firmware
// D-F26; shortcut-layers.js). The shortcut is the key's own action, the way an ordinary
// key's keycode is: held while the key is held, tapped when it is tapped, and
// what its behaviour row falls back to. A behaviour row, edited like any other,
// works on top of it. Without either, the key does nothing. A behaviour step on
// another key that sends a custom key sends only its shortcut.

const {decodedOf, encodeNamedProfile, validateSnapshot} = require("./portable-profile");
const {PROFILE_ACTION_KINDS: ACTION} = require("../schema/profile-blob-v1");
const {SETTINGS, SHORTCUT_KEY_LIMITS, validName, validShortcutKey, shortcutStoreRefusal, shortcutIdentity, encodeSettings} = require("../schema/settings-domain-v1");
const {shortcutLayerTargets, shortcutRefusal} = require("./shortcut-layers");
const keycodes = require("../data/keycode-catalog");
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
        keys: names.map((name, slot) => ({slot, keycode: `CUSTOM_KEY_${slot}`, code: customKeyCode(slot), name, hasBehavior: behaved.has(slot),
            shortcut: {...settings.customKeyShortcuts[slot], keys: [...settings.customKeyShortcuts[slot].keys]}})),
        // Each name may be 32 bytes of text; the profile as a whole has a ceiling.
        names: {perName: SETTINGS.NAME_MAX_BYTES},
        // The keys a shortcut may hold, by catalogue name, for the picker, the
        // caps on them, and every layer with why a shortcut cannot turn it on.
        shortcutKeys: SHORTCUT_KEY_NAMES, shortcutKeyLimits: SHORTCUT_KEY_LIMITS, shortcutLayers: shortcutLayerTargets(settings)};
}

// Every key a shortcut may hold, by its catalogue name: the keyboard, media,
// system and mouse keys the firmware accepts (validShortcutKey).
const SHORTCUT_KEY_NAMES = Object.freeze(keycodes.entries()
    .filter(entry => validShortcutKey(entry.value))
    .flatMap(entry => [entry.name, ...entry.aliases]));

// A custom key's name, or its shortcut. Both live in the profile's settings
// domain; a message carries one or the other.
/** @param {import("./types.js").CompleteSnapshot} snapshot @param {(import("../../contracts/edits.js").EditPayloads['updateCustomKey'] | import("../../contracts/edits.js").EditPayloads['updateCustomKeyShortcut']) & {expectedFingerprint: string}} message @param {import("./types.js").ProfileDestination} [capabilities] */
function editCustomKey(snapshot, message, capabilities) {
    if (!snapshot?.document || !message.expectedFingerprint || message.expectedFingerprint !== snapshot.fingerprint) throw fail("The keyboard changed since this draft was opened. Read the keyboard and review the draft before saving again.");
    const match = /^CUSTOM_KEY_(\d+)$/.exec(message.keycode || "");
    const slot = match ? Number(match[1]) : -1;
    if (!match || slot >= CUSTOM_KEY_SLOTS || String(slot) !== match[1]) throw fail("Choose a custom key the keyboard has.");
    // A message renames the key, sets its shortcut, or both at once (a key
    // made for a shortcut the picker could not store as a keycode).
    const renaming = "name" in message && message.name !== undefined;
    if (renaming && typeof message.name !== "string") throw fail("A custom key name must be text.");
    const shortcut = "shortcut" in message ? message.shortcut : undefined;
    if (!customKeysSupported(snapshot.document, capabilities)) throw fail("Custom keys need firmware with the userspace keycode blocks.", "CUSTOM_KEYS_UNSUPPORTED");
    const value = validateSnapshot(snapshot.document, capabilities);
    // A layer that is always on is refused in words before the bare shape check.
    const layers = /** @type {{layers?: unknown} | undefined} */ (shortcut)?.layers;
    const refusal = Number.isInteger(layers) ? shortcutRefusal(value.settings, {layers: /** @type {number} */ (layers)}) : "";
    if (refusal) throw fail(refusal, "CUSTOM_KEY_SHORTCUT_INVALID");
    // So is any other shortcut it cannot store: its keys' refusal (too many,
    // twice, a second media or system key, a byte that is no such key), or
    // the shape it has.
    const storeRefusal = !renaming || shortcut !== undefined ? shortcutStoreRefusal(shortcut) : "";
    if (storeRefusal) throw fail(storeRefusal, "CUSTOM_KEY_SHORTCUT_INVALID");
    const settings = structuredClone(value.settings);
    if (renaming) {
        const name = /** @type {string} */ (message.name).trim();
        if (!validName(name)) throw fail(`A custom key name is up to ${SETTINGS.NAME_MAX_BYTES} bytes of text, with no control characters. Accented letters and symbols take two to four bytes each.`, "CUSTOM_KEY_NAME_INVALID");
        settings.customKeyNames[slot] = name;
    }
    if (shortcut !== undefined) {
        const {mods, keys, layers, layerKind} = /** @type {import("../schema/types.js").CustomKeyShortcut} */ (shortcut);
        settings.customKeyShortcuts[slot] = {mods, keys: [...keys], layers, layerKind};
    }
    const was = value.settings.customKeyShortcuts[slot], now = settings.customKeyShortcuts[slot];
    if (settings.customKeyNames[slot] === value.settings.customKeyNames[slot] && shortcutIdentity(now) === shortcutIdentity(was)) return value.document;
    /** @type {import("./types.js").PortableDocument} */
    const document = JSON.parse(JSON.stringify(value.document));
    document.profile = replaceDomain(value.profile, PROFILE_DOMAIN_IDS.SETTINGS, () => encodeSettings(settings), encodeNamedProfile).toString("base64");
    validateSnapshot(document, capabilities);
    return document;
}

module.exports = {customKeyEditorView, editCustomKey, customKeysSupported};
