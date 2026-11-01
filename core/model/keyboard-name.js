// @ts-check
"use strict";

// The keyboard's own name (firmware D-F14): the USB product string the
// computer, Chrome's keyboard chooser and Ark's keyboard menu show. It is one
// more counted name in the settings domain, so it is edited in the draft,
// reviewed, applied and backed up like any other. Empty means the
// firmware's built-in name; the keyboard then reports that as its product.

const {decodedOf, editProfileDomains} = require("./portable-profile");
const {PROFILE_FULL_WORDS} = require("./vocabulary");
const {SETTINGS} = require("../schema/settings-domain-v1");
const {validName} = require("../schema/profile-name");

/** @param {string} message @param {string} [code] */
const fail = (message, code = "KEYBOARD_NAME_EDIT_CONFLICT") => Object.assign(new Error(message), {code});

// The name a complete snapshot stores, or undefined when it has none to give.
/** @param {import("./types.js").ProfileSnapshot | null | undefined} snapshot @returns {string | undefined} */
function storedKeyboardName(snapshot) {
    if (!snapshot?.document || snapshot.incomplete) return undefined;
    try {return decodedOf(snapshot).settings.keyboardName;} catch {return undefined;}
}

// What the Keyboard screen's title shows. `builtIn` is the firmware's built-in
// name when the shell knows it: the USB product of a keyboard that enumerated
// with no stored name.
/** @param {import("./types.js").ProfileSnapshot | null | undefined} snapshot @param {string} [builtIn] */
function keyboardNameView(snapshot, builtIn = "") {
    const name = storedKeyboardName(snapshot);
    if (name === undefined) return null;
    return {name, builtIn, identity: snapshot?.fingerprint || "", perName: SETTINGS.NAME_MAX_BYTES};
}

// Renames the keyboard in a copy of `document`. An empty name gives the
// keyboard back its built-in name.
/** @param {import("./types.js").PortableDocument} document @param {import("../../contracts/edits.js").EditPayloads['renameKeyboard']} message @param {import("./types.js").Draft} draft */
function editKeyboardName(document, message, draft) {
    if (typeof message.name !== "string") throw fail("A keyboard name must be text.", "KEYBOARD_NAME_INVALID");
    const name = message.name.trim();
    if (!validName(name)) throw fail(`A keyboard name is up to ${SETTINGS.NAME_MAX_BYTES} bytes of text, with no control characters. Accented letters and symbols take two to four bytes each.`, "KEYBOARD_NAME_INVALID");
    return editProfileDomains(document, {...draft, full: PROFILE_FULL_WORDS.name}, (open, read) => {
        if (name !== read().settings.keyboardName) open("settings").keyboardName = name;
    });
}

module.exports = {storedKeyboardName, keyboardNameView, editKeyboardName};
