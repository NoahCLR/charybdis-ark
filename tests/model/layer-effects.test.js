"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {actionEffects, bit, codeName, comboHeldShows, keyEffects, layerEffects, linkFacts, keycodeLayersOn, pressesModeKey} = require("../../core/model/layer-effects");
const {PD_LINK_ENDS} = require("../../core/schema/pd-mode-domain-v1");
const {SETTING, SHORTCUT_LAYER_KINDS} = require("../../core/schema/settings-domain-v1");
const {LAYERS} = require("../../core/data/charybdis-layout");
const {settings} = require("../fixtures/portable-profile");
const {PD_MODE_KEYS} = require("../../core/data/pd-mode-keys");
const {customKeyCode, layerLockCode} = require("../../core/data/user-keycodes");

const MO = (n) => 0x5220 | n, TT = (n) => 0x52c0 | n, DF = (n) => 0x5240 | n;
const code = (operand) => ({kind: 1, flags: 0, operand});

test("a layer keycode holds, locks, moves or leaves its layer to QMK", () => {
    assert.deepEqual(layerEffects(MO(3)), [{kind: "hold", layer: 3}]);
    assert.deepEqual(layerEffects(TT(2)), [{kind: "hold", layer: 2}, {kind: "lock", layer: 2, taps: 5}], "TT() locks on its TAPPING_TOGGLE-th tap");
    assert.deepEqual(layerEffects(DF(1)), [{kind: "unowned", layer: 1}]);
    assert.deepEqual(layerEffects(MO(20)), [{kind: "unowned", layer: 20}], "a layer past the bank is QMK's");
    assert.deepEqual(layerEffects(0x0004), []);
    assert.deepEqual(actionEffects(code(MO(3))), [{kind: "hold", layer: 3}], "a stored keycode action does what its keycode does");
    assert.deepEqual(actionEffects(undefined), []);
});

test("a key's effects are told by the taps and holds that reach them, and a row with steps replaces TT()'s taps", () => {
    assert.deepEqual(keyEffects(TT(2), undefined).map(effect => [effect.kind, effect.how]), [["hold", "Hold TT(2)"], ["lock", "Tap TT(2) 5 times"]]);
    const row = {target: code(TT(2)), steps: [{tapIndex: 1, tap: code(MO(4))}]};
    assert.deepEqual(keyEffects(TT(2),row).map(effect => [effect.kind, effect.layer]), [["hold", 2]], "a tap that sends MO() sends it once, holding nothing");
});

test("a native keycode is named as the profile stores it", () => {
    assert.equal(codeName(0x0004), "KC_A");
    assert.equal(codeName(MO(3)), "MO(3)");
    assert.equal(codeName(layerLockCode(2)), "LOCK_LAYER(2)");
    assert.equal(codeName(customKeyCode(3)), "CUSTOM_KEY_3");
    assert.equal(codeName(PD_MODE_KEYS[5].lockCode), PD_MODE_KEYS[5].lock);
});

test("the layers a keycode turns on, as the keyboard runs it", () => {
    // A layer key's layer, a pointing-mode key's linked layers and a custom
    // key's shortcut layers; DF and PDF only make a layer the default, which
    // the keyboard leaves to QMK, so they turn none on.
    const decoded = {settings: settings(), pdModes: [{id: 5, kind: 1, name: "Zoom", linkedLayers: 0, linkTurnsOn: (1 << 3) | (1 << 4), linkEnds: 0}]};
    decoded.settings.customKeyShortcuts = Array.from({length: 128}, (_, slot) => (slot === 2 ? {mods: 0, keys: [], layers: (1 << 3) | (1 << 6), layerKind: 1} : {mods: 0, keys: [], layers: 0, layerKind: 0}));
    const turnsOn = keycodeLayersOn(decoded);
    assert.equal(turnsOn(0x5223), 1 << 3, "MO(3)");
    assert.equal(turnsOn(0x5263), 1 << 3, "TG(3)");
    assert.equal(turnsOn(0x5203), 1 << 3, "TO(3)");
    assert.equal(turnsOn(0x5283), 1 << 3, "OSL(3)");
    assert.equal(turnsOn(0x52c3), 1 << 3, "TT(3)");
    assert.equal(turnsOn(0x4338), 1 << 3, "LT(3,KC_SLASH)");
    assert.equal(turnsOn(0x5243), 0, "DF(3)");
    assert.equal(turnsOn(0x52e3), 0, "PDF(3)");
    assert.equal(turnsOn(0x0004), 0, "KC_A");
    assert.equal(turnsOn(PD_MODE_KEYS[5].holdCode), 1 << 3, "a pointing-mode key: its linked layers, less the pointer layer the keyboard ignores");
    assert.equal(turnsOn(PD_MODE_KEYS[5].lockCode), 1 << 3);
    assert.equal(turnsOn(customKeyCode(2)), (1 << 3) | (1 << 6), "a custom key's shortcut layers");
    assert.equal(turnsOn(customKeyCode(3)), 0);
});

test("what holding a combo shows instead of its combo feedback: the layers its output holds, or the pointing mode it runs", () => {
    // The firmware's owned momentary layers (MO, TT, OSL, LM, a custom key's
    // holding shortcut) and LT's hold, whose layer light shows the hold; a
    // pointing-mode key, held or locked, runs its mode over the combo.
    const decoded = {settings: settings(), pdModes: [{id: 5, kind: 1, name: "Zoom", linkedLayers: 0, linkTurnsOn: 1 << 3, linkEnds: 0}]};
    decoded.settings.customKeyShortcuts = Array.from({length: 128}, (_, slot) =>
        (slot === 2 ? {mods: 0, keys: [], layers: (1 << 3) | (1 << 6), layerKind: 0} : slot === 4 ? {mods: 0, keys: [], layers: 1 << 3, layerKind: 1} : {mods: 0, keys: [], layers: 0, layerKind: 0}));
    const shows = comboHeldShows(decoded);
    const none = {holdsLayers: [], runsPointing: null};
    assert.deepEqual(shows(MO(3)), {holdsLayers: [3], runsPointing: null});
    assert.deepEqual(shows(TT(2)), {holdsLayers: [2], runsPointing: null});
    assert.deepEqual(shows(0x5283), {holdsLayers: [3], runsPointing: null}, "OSL(3)");
    assert.deepEqual(shows(0x4338), {holdsLayers: [3], runsPointing: null}, "LT(3,KC_SLASH)");
    assert.deepEqual(shows(customKeyCode(2)), {holdsLayers: [3, 6], runsPointing: null}, "a custom key holding its shortcut's layers");
    assert.deepEqual(shows(customKeyCode(4)), none, "one locking them holds none");
    assert.deepEqual(shows(0x5263), none, "TG(3) locks, holding nothing");
    assert.deepEqual(shows(DF(1)), none);
    assert.deepEqual(shows(0x0004), none);
    assert.deepEqual(shows(PD_MODE_KEYS[5].holdCode), {holdsLayers: [], runsPointing: 5}, "a pointing-mode key runs its mode");
    assert.deepEqual(shows(PD_MODE_KEYS[5].lockCode), {holdsLayers: [], runsPointing: 5});
});

test("a layer's bit is its place in a layer mask", () => {
    assert.equal(bit(0), 1);
    assert.equal(bit(3), 0b1000);
    assert.equal(bit(LAYERS - 1) >>> 0, 2 ** (LAYERS - 1), "the last layer of the bank");
    assert.equal([1, 3].reduce((mask, layer) => mask | bit(layer), 0), 0b1010);
});

test("a profile's links: the layers a mode's key turns on, the layers that start a mode, and the layers a custom key's shortcut turns on", () => {
    const policy = settings();
    const pointer = policy.values[SETTING.AUTO_MOUSE_LAYER];
    // Slot 1 turns on no kind of its own: a hold. Slot 2 turns on nothing.
    policy.customKeyShortcuts = Array.from({length: 128}, (_, slot) => (slot === 1 ? {mods: 0, keys: [], layers: 1 << 7}
        : slot === 3 ? {mods: 0, keys: [], layers: (1 << 8) | (1 << 9), layerKind: SHORTCUT_LAYER_KINDS.MOVE} : {mods: 0, keys: [], layers: 0, layerKind: 0}));
    const facts = linkFacts({settings: policy, pdModes: [
        // Its key turns on layer 5 and the pointer layer, which the keyboard ignores in a link.
        {id: 2, kind: 1, name: "Scroll", linkedLayers: 1 << 3, linkTurnsOn: (1 << 5) | (1 << pointer), linkEnds: PD_LINK_ENDS.NOTHING},
        {id: 3, kind: 1, name: "Arrow", linkedLayers: 1 << 2, linkTurnsOn: 0, linkEnds: PD_LINK_ENDS.HIGHER_LAYER},
        // A slot with no mode links nothing.
        {id: 6, kind: 0, name: "", linkedLayers: 1 << 6, linkTurnsOn: 1 << 6, linkEnds: PD_LINK_ENDS.NOTHING},
    ]});
    assert.deepEqual([...facts.modeLinks.modes], [[2, {layers: 1 << 5, name: "Scroll", keepsPointer: false}], [3, {layers: 0, name: "Arrow", keepsPointer: false}]],
        "every slot that holds a mode, with the layers its key turns on, none for Arrow");
    assert.equal(facts.layerStarted, 1 << 3, "Scroll's start from layer 3 never ends");
    assert.equal(facts.endedStarts.length, 1);
    const [{layer, ends}] = facts.endedStarts;
    assert.equal(layer, 2, "Arrow starts from layer 2 while no higher layer is on");
    assert.ok(ends & (1 << 3) && !(ends & (1 << 2)), "a higher layer ends it, its own does not");
    assert.equal(ends & (1 << pointer), 0, "the pointer layer never ends it");
    assert.deepEqual([...facts.modeLinks.shortcuts], [[1, {layers: 1 << 7, layerKind: SHORTCUT_LAYER_KINDS.HOLD}], [3, {layers: (1 << 8) | (1 << 9), layerKind: SHORTCUT_LAYER_KINDS.MOVE}]]);
    assert.deepEqual(linkFacts({settings: settings()}), {modeLinks: {modes: new Map(), shortcuts: new Map()}, layerStarted: 0, endedStarts: []}, "no slots, no shortcuts: no links");
});

// Past a counting row's deepest tap count, and at a later count it leaves
// empty, every press is the standard key (firmware D-F64): N quick presses
// tap it N times, and a held press after N-1 taps it then holds it.
const TG = (n) => 0x5260 | n, TO = (n) => 0x5200 | n, KC_B = 0x05, KC_C = 0x06, TRNS = 0x01;
const tapStep = (tapIndex, extra = {}) => ({tapIndex, tap: code(KC_B), ...extra});
const holdStep = {style: 1, repeatHz: 0, action: code(KC_C)};
const rowOf = (target, steps) => ({target: code(target), allowedLayers: 0xffff, steps});
const hows = (effects) => effects.map((effect) => [effect.kind, effect.how]);

test("a custom key whose first press sets both tiers locks or moves with its shortcut past the depth", () => {
    const custom = {kind: 7, flags: 0, operand: 9};
    /** @param {number} layerKind */
    const links = (layerKind) => ({modes: new Map(), shortcuts: new Map([[9, {layers: 1 << 5, layerKind}]])});
    const row = {target: custom, allowedLayers: 0xffff, steps: [tapStep(0, {hold: holdStep}), tapStep(1)]};
    assert.deepEqual(hows(keyEffects(customKeyCode(9), row, undefined, links(SHORTCUT_LAYER_KINDS.LOCK))), [["lock", "Triple-tap CUSTOM_KEY_9"]],
        "three quick presses tap the shortcut three times: locked");
    assert.equal(keyEffects(customKeyCode(9), row, undefined, links(SHORTCUT_LAYER_KINDS.LOCK))[0].note, "whose shortcut turns layers on");
    const holdLater = {...row, steps: [tapStep(0, {hold: holdStep}), {tapIndex: 1, hold: holdStep}]};
    assert.deepEqual(hows(keyEffects(customKeyCode(9), holdLater, undefined, links(SHORTCUT_LAYER_KINDS.LOCK))), [["lock", "Triple-tap CUSTOM_KEY_9"]],
        "a double tap with no Tap of its own locks and unlocks: still three");
    assert.deepEqual(hows(keyEffects(customKeyCode(9), holdLater, undefined, links(SHORTCUT_LAYER_KINDS.MOVE))), [["move", "Double-tap CUSTOM_KEY_9"]],
        "a move needs no odd count, so the empty double tap moves");
    assert.deepEqual(hows(keyEffects(customKeyCode(9), row, undefined, links(SHORTCUT_LAYER_KINDS.HOLD))), [["hold", "Tap CUSTOM_KEY_9 2 times, then hold it"]],
        "a held shortcut is held past the depth");
});

test("a toggle on a counting row toggles from an odd count of standard taps", () => {
    assert.deepEqual(hows(keyEffects(TG(3), rowOf(TG(3), [tapStep(0), tapStep(1)]))), [["lock", "Triple-tap TG(3)"]]);
    assert.deepEqual(hows(keyEffects(TG(3), rowOf(TG(3), [tapStep(0), tapStep(1), tapStep(2)]))), [["lock", "Tap TG(3) 5 times"]], "four toggles leave it off");
    assert.deepEqual(hows(keyEffects(TG(3), rowOf(TG(3), [tapStep(0), tapStep(1), tapStep(3)]))), [["lock", "Triple-tap TG(3)"]], "an empty triple tap inside the depth");
    assert.deepEqual(hows(keyEffects(TO(2), rowOf(TO(2), [tapStep(0), tapStep(2)]))), [["move", "Double-tap TO(2)"]], "an empty double tap moves");
});

test("a layer hold the first press replaces is held past the depth, or at an earlier count with nothing set", () => {
    assert.deepEqual(hows(keyEffects(MO(4), rowOf(MO(4), [tapStep(0, {hold: holdStep}), tapStep(1)]))), [["hold", "Tap MO(4) 2 times, then hold it"]]);
    assert.deepEqual(hows(keyEffects(MO(4), rowOf(MO(4), [tapStep(0, {hold: holdStep}), {tapIndex: 1, tap: undefined}, tapStep(2)]))), [["hold", "Tap MO(4), then hold it"]],
        "a double tap with nothing set taps once, then holds");
    assert.deepEqual(hows(keyEffects(MO(4), rowOf(MO(4), [tapStep(0, {hold: holdStep}), {tapIndex: 1, hold: holdStep}, tapStep(2)]))), [["hold", "Tap MO(4) 3 times, then hold it"]],
        "a count with a hold of its own is not the standard hold");
});

test("a row no deeper than its Single tap, or whose Single tap is Transparent, offers no later count", () => {
    assert.deepEqual(keyEffects(TG(3), rowOf(TG(3), [tapStep(0)])), [], "a depth-1 row counts no taps");
    assert.deepEqual(keyEffects(MO(4), rowOf(MO(4), [tapStep(0, {hold: holdStep})])), []);
    assert.deepEqual(keyEffects(TG(3), rowOf(TG(3), [{tapIndex: 0, tap: code(TRNS)}, tapStep(1)])), [], "the key below is the standard tap, left out");
});

test("a counting row presses its own pointing-mode key past the depth", () => {
    const owners = {modes: new Map([[5, {layers: 0, name: "Zoom", keepsPointer: false}]]), shortcuts: new Map()};
    const key = PD_MODE_KEYS[5].holdCode;
    const both = tapStep(0, {hold: holdStep});
    assert.equal(pressesModeKey(key, rowOf(key, [both]), owners), false, "both tiers replaced, no later count");
    assert.equal(pressesModeKey(key, rowOf(key, [both, tapStep(1)]), owners), true);
});

// A one-shot layer's second quick tap cancels it, so past the deepest tap
// count only an odd number of taps leaves it armed (firmware D-F64).
test("a one-shot layer past the deepest tap count is armed only by an odd number of taps", () => {
    const code = (operand) => ({kind: 1, flags: 0, operand});
    const OSL = (n) => 0x5280 | n, KC_B = 0x05;
    const row = (...steps) => ({target: code(OSL(2)), steps});
    const how = (steps) => keyEffects(OSL(2), row(...steps)).map((effect) => effect.how);
    assert.deepEqual(how([{tapIndex: 0, tap: code(KC_B)}, {tapIndex: 1, tap: code(KC_B)}]), ["Triple-tap OSL(2)"]);
    assert.deepEqual(how([{tapIndex: 0, tap: code(KC_B)}, {tapIndex: 2, tap: code(KC_B)}]), ["Tap OSL(2) 5 times"], "never the empty Double tap, which arms and cancels");
    assert.deepEqual(how([{tapIndex: 0, tap: code(KC_B)}, {tapIndex: 1, hold: {style: 1, repeatHz: 0, action: code(KC_B)}}]), ["Triple-tap OSL(2)"]);
});
