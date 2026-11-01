"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {encode} = require("../../core/schema/keycodes");
const {MOD_TAP_SHORTHANDS, WRAPPER_ALIASES, NAMES} = require("../../core/data/keycode-legacy");

test("every legacy name, shorthand and wrapper alias encodes", () => {
    for (const [name, target] of Object.entries(NAMES)) assert.notEqual(encode(name), undefined, `${name} → ${target}`);
    for (const [name, mods] of Object.entries(MOD_TAP_SHORTHANDS)) assert.equal(encode(`${name}(KC_A)`), encode(`MT(${mods}, KC_A)`), name);
    for (const [name, wrapper] of Object.entries(WRAPPER_ALIASES)) assert.equal(encode(`${name}(KC_A)`), encode(`${wrapper}(KC_A)`), name);
});

test("legacy tables are frozen data", () => {
    for (const table of [MOD_TAP_SHORTHANDS, WRAPPER_ALIASES, NAMES]) assert.ok(Object.isFrozen(table));
});
