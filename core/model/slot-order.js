// @ts-check
"use strict";

// Which keyboard macro, custom key and pointing mode each slot of its bank
// holds (D-L81). A macro, a custom key or a pointing mode is what it holds,
// not the slot it sits in: when two slots are swapped, each thing moves with
// everything that is its own, and every reference to it follows, as a layer
// key follows its layer in a reorder (portable-profile.js reorderLayers).
//
// What moves with its slot: a macro's steps and its name; a custom key's name,
// its shortcut and its own behaviour row; a pointing mode's whole record, its
// link included, and in Lighting its colour row and the accents that name it.
// What follows: the native keycodes on the keymap (MACRO_n, CUSTOM_KEY_n,
// PD_MODE_n and PD_MODE_n_LOCK), the actions in a behaviour's target and
// branches and in a combo's inputs and output, as kinds of their own or as
// those keycodes, and the macro a pointing mode's direction taps run. Nothing
// else names a slot: a macro's steps send only basic keys and modifiers, a
// shortcut holds no userspace key, and no setting names a slot.

const {editProfileDomains, validateSnapshot, walkActions} = require("./portable-profile");
const {PROFILE_FULL_WORDS} = require("./vocabulary");
const {PROFILE_ACTION_KINDS: ACTION} = require("../schema/profile-blob-v1");
const {MACRO_DOMAIN_V1} = require("../schema/macro-domain-v1");
const {RGB_DOMAIN_V1} = require("../schema/rgb-domain-v1");
const {DIRECTIONS, DIAGONALS, isPdMacro} = require("../schema/pd-mode-domain-v1");
const {CUSTOM_KEY_SLOTS, customKeyCode, customKeyOfCode} = require("../data/user-keycodes");
const {PD_MODE_KEYS, POINTING_SLOT_COUNT, pdModeKeyOfCode} = require("../data/pd-mode-keys");
const {QK, inBlock} = require("../../rules/qmk-keycodes.mjs");

/** @typedef {"macros" | "customKeys" | "pdModes"} SlotBank */
/** @typedef {readonly number[]} Permutation */
/** @typedef {{macros?: Permutation, customKeys?: Permutation, pdModes?: Permutation}} SlotStep */
/** @typedef {{kind: number, operand: number}} WalkAction */

// The three banks of slots, each a fixed set the keyboard always has.
/** @type {Readonly<Record<SlotBank, {count: number}>>} */
const SLOT_BANKS = Object.freeze({
    macros: Object.freeze({count: MACRO_DOMAIN_V1.SLOTS}),
    customKeys: Object.freeze({count: CUSTOM_KEY_SLOTS}),
    pdModes: Object.freeze({count: POINTING_SLOT_COUNT}),
});
/** @type {readonly SlotBank[]} */
const BANKS = Object.freeze(/** @type {SlotBank[]} */ (Object.keys(SLOT_BANKS)));

/** @param {string} text */
const fail = text => Object.assign(new Error(text), {code: "PROFILE_DRAFT_CONFLICT"});
/** @param {number} count */
const identityOf = count => Object.freeze(Array.from({length: count}, (_, slot) => slot));
/** @param {Permutation} order */
const isIdentity = order => order.every((held, slot) => held === slot);
/** @param {Permutation} order */
const inverse = order => {
    /** @type {number[]} */
    const result = [];
    order.forEach((held, slot) => {result[held] = slot;});
    return Object.freeze(result);
};
/** @param {SlotBank} bank @param {unknown} order @returns {order is Permutation} */
const isPermutation = (bank, order) => Array.isArray(order) && order.length === SLOT_BANKS[bank].count && new Set(order).size === order.length
    && order.every(slot => Number.isInteger(slot) && slot >= 0 && slot < SLOT_BANKS[bank].count);

// The step that swaps two slots of a bank: slot `a` takes what `b` held and
// `b` what `a` held, every other slot keeping its own.
/** @param {SlotBank} bank @param {number} a @param {number} b */
function swapStep(bank, a, b) {
    const {count} = SLOT_BANKS[bank];
    for (const slot of [a, b]) if (!Number.isInteger(slot) || slot < 0 || slot >= count) throw fail(`Choose a slot the keyboard has (0 to ${count - 1}).`);
    if (a === b) throw fail("Choose two different slots to swap.");
    const step = [...identityOf(count)];
    [step[a], step[b]] = [step[b], step[a]];
    return Object.freeze(step);
}

// The slots a step moves, by bank, as `slot → the slot whose contents it takes`.
/** @param {SlotStep | undefined} step @returns {{[K in SlotBank]: Permutation}} */
function completed(step = {}) {
    for (const bank of BANKS) {
        const order = step[bank];
        if (order !== undefined && !isPermutation(bank, order)) throw fail("Include every slot once.");
    }
    return {macros: step.macros ?? identityOf(SLOT_BANKS.macros.count), customKeys: step.customKeys ?? identityOf(SLOT_BANKS.customKeys.count), pdModes: step.pdModes ?? identityOf(SLOT_BANKS.pdModes.count)};
}

// A renumbering of every reference to a slot, by one map per bank
// (`slot → slot`): an action of any kind, and a native keycode.
/** @param {{[K in SlotBank]: Permutation}} map */
function renumbering(map) {
    /** @param {number} code */
    const native = code => {
        if (inBlock(code, QK.MACRO)) {
            const slot = code - QK.MACRO.first;
            return slot < SLOT_BANKS.macros.count ? QK.MACRO.first + map.macros[slot] : code;
        }
        const customKey = customKeyOfCode(code);
        if (customKey !== undefined) return customKeyCode(map.customKeys[customKey]);
        const pointing = pdModeKeyOfCode(code);
        if (pointing !== undefined) return pointing.locked ? PD_MODE_KEYS[map.pdModes[pointing.slot]].lockCode : PD_MODE_KEYS[map.pdModes[pointing.slot]].holdCode;
        return code;
    };
    /** @template {WalkAction} A @param {A} action @returns {A} */
    const action = action => {
        switch (action.kind) {
            case ACTION.MACRO: return {...action, operand: map.macros[action.operand] ?? action.operand};
            case ACTION.CUSTOM_KEY: return {...action, operand: map.customKeys[action.operand] ?? action.operand};
            case ACTION.POINTING_MODE_MOMENTARY: case ACTION.POINTING_MODE_LOCK: return {...action, operand: map.pdModes[action.operand] ?? action.operand};
            case ACTION.QMK_KEYCODE: return {...action, operand: native(action.operand)};
            default: return action;
        }
    };
    return {native, action};
}

// An action named by the keyboard's macro, custom key or pointing mode it
// reaches rather than the slot that holds it, given which keyboard thing each
// slot holds (`order[bank][slot]`, draft-order.js).
/** @template {WalkAction} A @param {A} action @param {{[K in SlotBank]: Permutation}} order @returns {A} */
const actionByIdentity = (action, order) => renumbering(order).action(action);

// A document rearranged by `step`: slot n of each bank takes what slot
// step[bank][n] held, with everything that is its own, and every reference
// follows. Only the domains a moved bank touches are rewritten; a swap of
// custom keys or pointing modes leaves the macro streams and their unused
// tail as they are.
/** @param {import("./types.js").PortableDocument} document @param {SlotStep} step */
function reorderSlots(document, step) {
    validateSnapshot(document);
    const orders = completed(step), moved = {macros: !isIdentity(orders.macros), customKeys: !isIdentity(orders.customKeys), pdModes: !isIdentity(orders.pdModes)};
    if (!moved.macros && !moved.customKeys && !moved.pdModes) return document;
    const remap = renumbering({macros: inverse(orders.macros), customKeys: inverse(orders.customKeys), pdModes: inverse(orders.pdModes)});
    /** @param {WalkAction} action */
    const follow = action => {Object.assign(action, remap.action(action));};
    return editProfileDomains(document, {full: PROFILE_FULL_WORDS.profile}, open => {
        const keymap = open("keymap");
        keymap.splice(0, keymap.length, ...keymap.map(layer => layer.map(remap.native)));
        walkActions(open("behaviors"), follow);
        walkActions(open("combos"), follow);
        if (moved.macros || moved.customKeys) {
            const settings = open("settings");
            if (moved.macros) settings.macroNames = orders.macros.map(old => settings.macroNames[old]);
            if (moved.customKeys) {
                settings.customKeyNames = orders.customKeys.map(old => settings.customKeyNames[old]);
                settings.customKeyShortcuts = orders.customKeys.map(old => settings.customKeyShortcuts[old]);
            }
        }
        if (moved.macros) {
            const macros = open("macros");
            macros.splice(0, macros.length, ...orders.macros.map(old => macros[old]));
        }
        if (moved.macros || moved.pdModes) {
            const slots = open("pdModes");
            if (moved.pdModes) slots.splice(0, slots.length, ...orders.pdModes.map((old, next) => ({...slots[old], id: next})));
            // A direction tap that runs a macro runs the same macro.
            for (const slot of slots) for (const taps of [slot.directions, slot.diagonals]) for (const name of [...DIRECTIONS, ...DIAGONALS]) {
                const tap = taps?.[name];
                if (tap && isPdMacro(tap.keycode)) tap.keycode = remap.native(tap.keycode);
            }
        }
        if (moved.pdModes) {
            const rgb = open("rgb");
            // A mode's colour row goes with it; a row is one per slot, by id.
            const colours = new Map(rgb.pdModeColors.map(row => [row.pdModeId, row]));
            rgb.pdModeColors = orders.pdModes.flatMap((old, next) => {
                const row = colours.get(old);
                return row ? [{...row, pdModeId: next}] : [];
            }).sort((a, b) => a.pdModeId - b.pdModeId);
            const next = inverse(orders.pdModes);
            rgb.pdModeGroupRows.forEach(row => {if (row.selector !== RGB_DOMAIN_V1.SELECTOR_ALL) row.selector = next[row.selector];});
        }
    });
}

module.exports = {SLOT_BANKS, BANKS, swapStep, reorderSlots, actionByIdentity, identityOf, isPermutation};
