import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {isRightHalf} from "../../webview/view/geometry.mjs";
import {POINTING_MODE_IDS, keyLight, pdColourRow, trackballLight} from "../../webview/view/lighting.mjs";

// The Lighting board draws what the keyboard draws (D-L99): the firmware's
// drawing cases (upstream/firmware/tests/fixtures/rgb_render_v1.json; firmware
// RGB domain, "The drawing cases"), each held there against its real render
// path, run here through the preview, LED by LED. Each case's lighting
// profile goes into a profile document that core publishes, as the app's
// model is published, and the case's state becomes the preview's inputs in
// the one adapter below.

const require = createRequire(import.meta.url);
const fixture = require("../../upstream/firmware/tests/fixtures/rgb_render_v1.json");
const {CHARYBDIS_4X6_LAYOUT_MATRIX, KEY_LEDS, LAYERS, TRACKBALL_LED} = require("../../core/data/charybdis-layout");
const {SETTING} = require("../../core/schema/settings-domain-v1");
const {RGB_KEY_SEMANTICS, RGB_TAP_BRANCH_SEMANTICS, RGB_AUTOCORRECT_SEMANTICS, decodeRgbDomainV1} = require("../../core/schema/rgb-domain-v1");
const {profileDocument, publishedModel} = require("../fixtures/published-model.js");
const {withPayload} = require("../fixtures/profile-document.js");

// ── The LED tables ─────────────────────────────────────────────────────────
//
// What each LED is to the fixture (the keyboard's keyboard.json) and to Ark
// (KEY_LEDS, TRACKBALL_LED): the layout key that carries it, "keyless" for an
// LED no key carries (the trackball path in Ark), or undefined where Ark
// knows no such LED.
const fixtureOwner = (/** @type {number} */ led) => {
    const key = fixture.board.keys.find((/** @type {{leds: number[]}} */ row) => row.leds.includes(led));
    return key ? key.layout : "keyless";
};
const arkOwner = (/** @type {number} */ led) => {
    const key = KEY_LEDS.indexOf(led);
    return key >= 0 ? key : led === TRACKBALL_LED ? "keyless" : undefined;
};
// The LEDs whose owner the two tables disagree on, which the cases cannot be
// compared at: only LED 57, which the keyboard's table lists and the board
// does not have (the test below holds that).
const incomparable = fixture.cases[0].leds.map((/** @type {unknown} */ _, /** @type {number} */ led) => led)
    .filter((/** @type {number} */ led) => fixtureOwner(led) !== arkOwner(led));

test("the drawing cases' board is Ark's, key for key", () => {
    assert.deepEqual(fixture.board.keys.map((/** @type {{matrix: number[]}} */ key) => key.matrix), CHARYBDIS_4X6_LAYOUT_MATRIX.map((/** @type {number[]} */ at) => [...at]),
        "the layout keys are Ark's, in Ark's layout order");
    assert.deepEqual(fixture.board.keys.map((/** @type {{half: string}} */ key) => key.half === "right"), fixture.board.keys.map((/** @type {{layout: number}} */ key) => isRightHalf(key.layout)),
        "each key's half is Ark's");
    // Every key carries the LED Ark gives it. The keyboard's table once filed
    // LED 55 under matrix [9, 2], which no key uses, leaving the lower right
    // thumb key (layout 55, matrix [9, 5]) without one; an accent on LED 55
    // lit that key on the keyboard, so Ark's table was the true one and the
    // keyboard's was corrected (D-L99).
    const differs = fixture.board.keys.filter((/** @type {{layout: number, leds: number[]}} */ key) => JSON.stringify(key.leds) !== JSON.stringify([KEY_LEDS[key.layout]]))
        .map((/** @type {{layout: number, leds: number[]}} */ key) => ({key: key.layout, keyboard: key.leds, ark: KEY_LEDS[key.layout]}));
    assert.deepEqual(differs, [], "every key carries the LED Ark gives it");
    // The keyboard's table lists two keyless LEDs. 56 is the trackball's. 57
    // is the last in the right half's chain and is not populated on the
    // board, so Ark knows no such LED: nothing can name it and nothing shows
    // what the firmware would send it.
    const unknown = fixture.board.leds.map((/** @type {{led: number}} */ row) => row.led).filter((/** @type {number} */ led) => arkOwner(led) === undefined);
    assert.deepEqual(unknown, [57], "only LED 57, unpopulated on the board, is unknown to Ark");
    assert.equal(fixtureOwner(TRACKBALL_LED), "keyless", "Ark's trackball LED is keyless on the keyboard too");
    assert.deepEqual(incomparable, [57], "the cases leave out only the LED the board does not have");
});

// ── The adapter: a case's profile and state as the preview's inputs ───────

// Solid colour (effect 1), on, on every LED class: the background every lit
// case starts from. RGB_MODE holds enabled, effect, speed and LED flags by
// byte; RGB_COLOR hue, saturation and value.
const [bh, bs, bv] = fixture.background.hsv;
/** @param {boolean} on */
const backgroundSettings = (on) => (/** @type {{values: number[]}} */ settings) => {
    settings.values[SETTING.RGB_MODE] = ((on ? 1 : 0) | 1 << 8 | 255 << 24) >>> 0;
    settings.values[SETTING.RGB_COLOR] = bh | bs << 8 | bv << 16;
};
// Every key is KC_TRNS on every layer but those keymap.mapped names.
/** @type {Record<number, Record<number, string>>} */
const keys = Object.fromEntries(Array.from({length: LAYERS}, (_, layer) => [layer, Object.fromEntries(CHARYBDIS_4X6_LAYOUT_MATRIX.map((/** @type {unknown} */ _at, /** @type {number} */ key) =>
    [key, (fixture.keymap.mapped[layer] || []).includes(key) ? "KC_A" : "KC_TRNS"]))]));

const decodeLimits = {compiledStageMask: fixture.limits.compiledStageMask, logicalLayerCount: fixture.limits.logicalLayerCount,
    maximumBrightness: fixture.limits.maximumBrightness, tapBranchColorCount: fixture.limits.tapBranchColorCount};

// What core publishes for a document holding the case's lighting payload,
// byte for byte, after Ark's codec has read it.
/** @param {any} drawing */
function modelOf(drawing) {
    const bytes = Buffer.from(fixture.profiles[drawing.profile].hex, "hex");
    decodeRgbDomainV1(bytes, decodeLimits);
    const doc = profileDocument({keys, settings: backgroundSettings(drawing.state.lightingOn)});
    doc.profile = withPayload(Buffer.from(doc.profile, "base64"), "rgb", () => bytes).toString("base64");
    return publishedModel(doc);
}

const semanticName = (/** @type {Record<string, number>} */ table, /** @type {number} */ value) => /** @type {string} */ (Object.keys(table).find((name) => table[name] === value));
// A behaviour case's stored colour and locality, and the semantic its accents
// name: a tap branch by its tap count, the last for every deeper count.
const BEHAVIOUR = {
    tapCommitted: {color: "tapCommittedColor", locality: "tapCommittedLocality", owner: "KEY_FEEDBACK_GROUP_TAP_COMMITTED"},
    hold: {color: "holdActiveColor", locality: "holdActiveLocality", owner: "KEY_FEEDBACK_GROUP_HOLD_ACTIVE"},
    longHold: {color: "longHoldActiveColor", locality: "longHoldActiveLocality", owner: "KEY_FEEDBACK_GROUP_LONG_HOLD_ACTIVE"},
};
/** @param {any} model @param {{key: number, case: string, tapCount?: number}} shown */
function behaviourActive(model, shown) {
    const feedback = model.rgb.keyBehaviorFeedback;
    if (shown.case === "tapBranch") {
        const branch = Math.min(/** @type {number} */ (shown.tapCount) - 2, feedback.tapBranches.length - 1);
        return {owner: semanticName(RGB_KEY_SEMANTICS, RGB_TAP_BRANCH_SEMANTICS[branch]), ...pick(feedback.tapBranches[branch]), triggerIndex: shown.key};
    }
    const fields = BEHAVIOUR[/** @type {keyof typeof BEHAVIOUR} */ (shown.case)];
    assert.ok(RGB_KEY_SEMANTICS[fields.owner] !== undefined);
    return {owner: fields.owner, color: feedback[fields.color], locality: feedback[fields.locality], triggerIndex: shown.key};
}
const pick = (/** @type {{color: any, locality: string}} */ row) => ({color: row.color, locality: row.locality});
const REPLACEMENT = {
    textReplaced: {field: "text", owner: "AUTOCORRECT_FEEDBACK_GROUP_TEXT"},
    macroReplaced: {field: "macro", owner: "AUTOCORRECT_FEEDBACK_GROUP_MACRO"},
    undone: {field: "undo", owner: "AUTOCORRECT_FEEDBACK_GROUP_UNDO"},
    leading: {field: "leading", owner: "AUTOCORRECT_FEEDBACK_GROUP_LEADING"},
};
/** @param {any} model @param {{case: string, keys: number[]}} shown */
function replacementActive(model, shown) {
    const {field, owner} = REPLACEMENT[/** @type {keyof typeof REPLACEMENT} */ (shown.case)];
    assert.ok(RGB_AUTOCORRECT_SEMANTICS[owner] !== undefined);
    assert.ok(shown.keys.length <= 1, "the preview follows one key");
    const feedback = model.rgb.autocorrectFeedback;
    return {owner, color: feedback[`${field}Color`], locality: feedback[`${field}Locality`], triggerIndex: shown.keys[0]};
}

// The case's state as the preview's options. The base is viewed and every
// layer the case has on is held, so the preview has on exactly those (base
// always). A running mode's link is the mask of its linked layers and those
// its key turns on; a combo's partition is given, as the combo runtime gives
// it on the keyboard.
/** @param {any} model @param {any} state */
function optionsOf(model, state) {
    const {pointing, combo, behaviour, replacement} = state;
    const slot = pointing ? pdColourRow(model, pointing.slot) : null;
    return {
        held: state.layersOn,
        pdActive: pointing && slot ? {mode: POINTING_MODE_IDS[pointing.slot], color: slot.color, locality: slot.locality, triggerIndex: pointing.key ?? undefined,
            link: [...pointing.link.linked, ...pointing.link.turnsOn].reduce((mask, layer) => mask | 2 ** layer, 0)} : null,
        comboActive: combo ? {...model.rgb.comboFeedback, inputs: combo.keys, beneath: combo.runsPointingMode} : null,
        behaviourActive: behaviour ? behaviourActive(model, behaviour) : null,
        replacementActive: replacement ? replacementActive(model, replacement) : null,
    };
}

// The HSV the preview picks for LED n, or null where it turns the LED off.
/** @param {any} model @param {any} options @param {number} led */
function previewed(model, options, led) {
    const base = model.layers[0], owner = arkOwner(led);
    const light = owner === "keyless" ? trackballLight(model, base, options)
        : keyLight(model, base, base.positions.find((/** @type {{layoutIndex: number}} */ position) => position.layoutIndex === owner), options);
    return light.source === "off" ? null : [Number(light.colour.h), Number(light.colour.s), Number(light.colour.v)];
}

// ── The cases ──────────────────────────────────────────────────────────────

// Cases the preview has no way to express, by name, and why.
/** @type {Record<string, string>} */
const SKIPPED = {
    "idle-timeout": "the preview does not model the lighting idle timeout: it draws the board as the keyboard draws it while in use",
};
const STATE_FIELDS = ["behaviour", "combo", "idle", "layersOn", "lightingOn", "pointing", "replacement"];

test("every drawing case is one the adapter knows", () => {
    assert.equal(fixture.version, 1);
    assert.equal(fixture.background.hsv.length, 3);
    for (const drawing of fixture.cases) {
        assert.deepEqual(Object.keys(drawing.state).sort(), STATE_FIELDS, `${drawing.name}: a state field the adapter does not map`);
        assert.ok(Object.hasOwn(fixture.profiles, drawing.profile), `${drawing.name}: its profile`);
        assert.ok(SKIPPED[drawing.name] || !drawing.state.idle, `${drawing.name}: an idle case the adapter cannot express and does not skip`);
        if (drawing.state.behaviour) assert.ok(drawing.state.behaviour.case === "tapBranch" || Object.hasOwn(BEHAVIOUR, drawing.state.behaviour.case), `${drawing.name}: behaviour case ${drawing.state.behaviour.case}`);
        if (drawing.state.replacement) assert.ok(Object.hasOwn(REPLACEMENT, drawing.state.replacement.case), `${drawing.name}: replacement case ${drawing.state.replacement.case}`);
    }
    for (const name of Object.keys(SKIPPED)) assert.ok(fixture.cases.some((/** @type {{name: string}} */ drawing) => drawing.name === name), `${name} is skipped but no longer a case`);
});

for (const drawing of fixture.cases) {
    test(drawing.name, {skip: SKIPPED[drawing.name]}, () => {
        const model = modelOf(drawing);
        const options = optionsOf(model, drawing.state);
        const wrong = drawing.leds.map((/** @type {{hsv: number[] | null, by: string}} */ expected, /** @type {number} */ led) => ({led, expected}))
            .filter(({led}) => !incomparable.includes(led))
            .map(({led, expected}) => ({led, by: expected.by, keyboard: expected.hsv, ark: previewed(model, options, led)}))
            .filter((row) => JSON.stringify(row.keyboard) !== JSON.stringify(row.ark));
        assert.deepEqual(wrong, [], `${drawing.description}`);
    });
}
