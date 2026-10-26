"use strict";
const {profileLayers, editLayers} = require("../fixtures/profile-document");
const test = require("node:test");
const assert = require("node:assert/strict");
const {layerReach, draftChecks, compareFindings, LEVELS} = require("../../core/model/layer-reach");
const {CHARYBDIS_4X6_LAYOUT_MATRIX} = require("../../core/data/charybdis-layout");
const {spawnSync} = require("node:child_process");
const {compiled, settings} = require("../fixtures/portable-profile");
const {validateSnapshot} = require("../../core/model/portable-profile");
const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {encodeKeyBehaviorDomain} = require("../../core/schema/key-behavior-domain-v1");

// A profile as validateSnapshot decodes one, holding only what the walk reads.
// Base answers every key with KC_A; the other layers start transparent.
const KC_A = 0x04, KC_B = 0x05, KC_ESC = 0x29, TRNS = 0x01, NO = 0x00;
const MO = (n) => 0x5220 | n, TG = (n) => 0x5260 | n, TO = (n) => 0x5200 | n, TT = (n) => 0x52c0 | n, DF = (n) => 0x5240 | n;
const LOCK_LAYER = (n) => 0x7ec0 + n;
const code = (operand) => ({kind: 1, flags: 0, operand});
function profile({keys = {}, fill = {}, rows = [], combos = [], settings = {}, pdModes = [], shortcuts = {}} = {}) {
    const layers = Array.from({length: 16}, (_, layer) => Array(60).fill(layer === 0 ? KC_A : (fill[layer] ?? TRNS)));
    for (const [at, value] of Object.entries(keys)) {
        const [layer, index] = at.split(":").map(Number);
        const [row, column] = CHARYBDIS_4X6_LAYOUT_MATRIX[index];
        layers[layer][row * 6 + column] = value;
    }
    // Behaviours and combos on everywhere; each layer's combos read itself
    // unless `references` says otherwise.
    const values = Array(31).fill(0);
    values[23] = 1; values[20] = 1; values[28] = 1; values[29] = 0xffff; values[30] = 0xffff;
    for (const [id, value] of Object.entries(settings)) if (id !== "references" && id !== "layers" && id !== "comboOutputBehaviors") values[id] = value;
    const records = Array.from({length: 16}, (_, layer) => ({reference: settings.references?.[layer] ?? layer, bypass: [], exclude: [], ...settings.layers?.[layer]}));
    // Each custom key's shortcut (firmware D-F26), none unless `shortcuts` gives one by slot.
    const customKeyShortcuts = Array.from({length: 128}, (_, slot) => ({mods: 0, key: 0, layers: 0, layerKind: 0, ...shortcuts[slot]}));
    return {layers, settings: {values, layers: records, comboOutputBehaviors: settings.comboOutputBehaviors, customKeyShortcuts, names: ["Base", "Numbers", "Symbols", "Navigation", "Pointer", "Extra 1", "Extra 2", "Extra 3", ...Array(8).fill("")]},
        behaviors: {rows}, combos: {version: 3, defaultTermMs: 50, holdTermMs: 200, rows: combos}, pdModes};
}
const traps = (value) => layerReach(value).filter((finding) => finding.level === LEVELS.TRAP);
const kinds = (value) => layerReach(value).map((finding) => finding.kind);

test("all sixteen layers retain their finding identities before and after a reorder", () => {
    const keyboard = profile({keys: {"15:0": KC_B, "8:0": KC_ESC}});
    const draft = profile({keys: {"8:0": KC_B, "15:0": KC_ESC}});
    const order = Array.from({length: 16}, (_, n) => n);
    [order[8], order[15]] = [order[15], order[8]];
    assert.deepEqual(draftChecks(keyboard, keyboard).map(f => [f.key, f.status]),
        [["unreachable:8", "existing"], ["unreachable:15", "existing"]]);
    assert.ok(draftChecks(keyboard, draft, order).every(f => f.status === "existing"));
});

test("a generated custom escape uses the last declared member's source layer", () => {
    const custom = {kind: 7, flags: 0, operand: 0};
    const row = {target: custom, enabled: true, allowedLayers: 1, steps: [{tapIndex: 0, tap: code(TO(0))}]};
    const p = profile({keys: {"0:0": TG(1), "1:1": KC_A, "1:2": KC_B}, fill: {1: NO}, rows: [row],
        combos: [{inputs: [code(KC_A), code(KC_B)], output: custom, allowedLayers: 2}]});
    assert.deepEqual(traps(p).map(f => f.layers), [[1]], "all owner presses come from forbidden layer 1");
    row.allowedLayers = 2;
    assert.deepEqual(traps(p), [], "a permitted generated output provides an escape");
    row.enabled = false;
    assert.equal(traps(p).length, 1);
    row.enabled = true; row.allowedLayers = 1;
    (layers => layers[1][2] = TRNS)(p.layers); (layers => layers[0][2] = KC_B)(p.layers);
    p.combos.rows[0].allowedLayers = 3;
    assert.deepEqual(traps(p), [], "the last declared member B inherits the permitted Base origin");
    p.combos.rows[0].inputs.reverse();
    assert.deepEqual(traps(p).map(f => f.layers), [[1]], "declaring A last gives the output the forbidden layer 1 origin");
});

for (const [name, output, target, tap, expected] of [
    ["cannot invent a custom escape", 0x7f00, {kind: 7, flags: 0, operand: 0}, TO(0), [[1]]],
    ["retain the native escape", TO(0), code(TO(0)), KC_ESC, []],
]) {
    test(`validated mixed-source combos ${name} through a non-owner's behaviour allowance`, () => {
        const policy = settings(); policy.values[4] = 0; policy.values[8] = 0;
        const document = compiled({policy, combos: [{inputs: [KC_A, KC_B], output, allowedLayers: 3, termMs: 50}]});
        profileLayers(document).forEach(layer => layer.fill(NO));
        editLayers(document, layers => layers[0][0] = TG(1)); editLayers(document, layers => layers[0][1] = KC_B);
        editLayers(document, layers => layers[1][0] = KC_A); editLayers(document, layers => layers[1][1] = TRNS);
        const blob = decodeProfileBlob(Buffer.from(document.profile, "base64"));
        blob.domains.find(domain => domain.id === 32).payload = encodeKeyBehaviorDomain({rows: [
            {target, allowedLayers: 2, steps: [{tapIndex: 0, tap: code(tap)}]},
        ]});
        document.profile = encodeProfileBlob(blob).toString("base64");
        const findings = layerReach(validateSnapshot(document));
        assert.ok(!findings.some(f => f.kind === "reachabilityIncomplete"));
        assert.deepEqual(findings.filter(f => f.kind === "trap").map(f => f.layers), expected,
            `output 0x${output.toString(16)} bypasses its layer-1-only row under owner B's Base origin`);
    });
}

test("duplicate owner placements retain only their own permitted behaviour and native alternatives", () => {
    const keys = {"0:0": TG(1), "0:1": KC_B, "1:0": KC_A, "1:1": TRNS, "1:2": KC_B};
    const row = {target: code(TO(0)), allowedLayers: 2, steps: [{tapIndex: 0, tap: code(KC_ESC)}]};
    const combo = {inputs: [code(KC_A), code(KC_B)], output: code(TO(0)), allowedLayers: 3};
    const p = profile({keys, fill: {1: NO}, rows: [row], combos: [combo]});
    assert.deepEqual(traps(p), [], "choosing only Base's B bypasses the row and retains native TO(0)");
    p.settings.layers[0].exclude = [1];
    assert.deepEqual(traps(p).map(f => f.layers), [[1]], "excluding Base's B leaves only the owner whose row replaces TO(0)");
    p.settings.layers[0].exclude = []; combo.allowedLayers = 2;
    assert.deepEqual(traps(p).map(f => f.layers), [[1]], "the combo allowance also removes the Base owner choice");

    combo.allowedLayers = 3;
    combo.output = row.target = {kind: 7, flags: 0, operand: 0}; row.steps[0].tap = code(TO(0));
    assert.deepEqual(traps(p), [], "the layer-1 B can own the custom escape");
    p.settings.layers[1].exclude = [2];
    assert.deepEqual(traps(p).map(f => f.layers), [[1]], "the remaining Base owner cannot borrow A's layer-1 allowance");
});

test("reference remapping changes the declared owner code without changing its physical source policy", () => {
    const custom = {kind: 7, flags: 0, operand: 0};
    const row = {target: custom, allowedLayers: 2, steps: [{tapIndex: 0, tap: code(TO(0))}]};
    const combo = {inputs: [code(KC_A), code(KC_B)], output: custom, allowedLayers: 3};
    const p = profile({keys: {"0:0": TG(1), "0:1": KC_ESC, "1:0": KC_ESC, "1:1": TRNS, "2:0": KC_A, "2:1": KC_B},
        fill: {1: NO, 2: NO}, rows: [row], combos: [combo], settings: {references: {1: 2}}});
    assert.deepEqual(traps(p).map(f => f.layers), [[1]], "raw reference B is still owned by Base's physical ESC placement");
    row.allowedLayers = 1;
    assert.deepEqual(traps(p), [], "Base's allowance admits the generated row");
    p.settings.values[29] = 0; p.settings.layers[0].bypass = [1];
    assert.deepEqual(traps(p), [], "generated outputs ignore physical behaviour switches and bypass bits");
    p.settings.layers[0].exclude = [1];
    assert.deepEqual(traps(p).map(f => f.layers), [[1]], "physical combo exclusion still removes the remapped owner");
    assert.ok(kinds(p).includes("unreachableCombo"));
});

test("fifteen independent tap-toggle layers are fully checked within a bounded heap", () => {
    const p = profile({keys: Object.fromEntries(Array.from({length: 15}, (_, i) => [`0:${i}`, TT(i + 1)]))});
    const result = spawnSync(process.execPath, ["--max-old-space-size=128", "-e",
        "let input='';process.stdin.on('data',s=>input+=s);process.stdin.on('end',()=>process.stdout.write(JSON.stringify(require('./core/model/layer-reach').layerReach(JSON.parse(input)))));"],
    {cwd: require("node:path").resolve(__dirname, "../.."), input: JSON.stringify(p), encoding: "utf8", timeout: 5000});
    assert.equal(result.status, 0, result.error?.message || result.stderr);
    const found = JSON.parse(result.stdout);
    assert.ok(!found.some(f => f.kind === "reachabilityIncomplete"));
    assert.ok(!found.some(f => ["trap", "trapOverflow", "unreachable", "unreachableCombo"].includes(f.kind)),
        "independent inherited toggles can all be reached and undone");
});

test("a large independent bank still checks unreachable layers and simultaneous combo inputs", () => {
    const keys = Object.fromEntries(Array.from({length: 14}, (_, i) => [`0:${i}`, TT(i + 1)]));
    Object.assign(keys, {"15:20": KC_ESC, "13:21": KC_B, "14:21": KC_ESC});
    const p = profile({keys, combos: [
        {inputs: [code(KC_A), code(KC_B)], output: code(KC_A)},
        {inputs: [code(KC_B), code(KC_ESC)], output: code(KC_A)},
    ]});
    const findings = layerReach(p);
    assert.ok(!findings.some(f => f.kind === "reachabilityIncomplete"));
    assert.deepEqual(findings.filter(f => f.kind === "unreachable").map(f => f.layers), [[15]]);
    assert.deepEqual(findings.filter(f => f.kind === "unreachableCombo").map(f => f.place.index), [1],
        "two codes at the same position cannot coexist even with both overlays on");
});

test("a permanent reset proves escape without claiming that unplaced combo inputs can fire", () => {
    const keys = Object.fromEntries(Array.from({length: 15}, (_, i) => [`0:${i}`, TT(i + 1)]));
    keys["0:20"] = TO(0);
    const p = profile({keys, combos: [{inputs: [code(KC_B), code(KC_ESC)], output: code(TO(0))}]});
    const found = layerReach(p);
    assert.ok(!found.some(f => ["trap", "reachabilityIncomplete"].includes(f.kind)));
    assert.equal(found.filter(f => f.kind === "unreachableCombo").length, 1);
});

test("Review identifies a newly covered escape and its repair beside independent overlays", () => {
    const keys = Object.fromEntries(Array.from({length: 13}, (_, i) => [`0:${i}`, TT(i + 3)]));
    Object.assign(keys, {"0:20": TG(1), "0:21": TG(2), "1:20": TRNS, "2:21": TRNS});
    const before = profile({keys}), after = profile({keys: {...keys, "2:20": KC_B, "1:21": KC_B, "1:22": TG(2), "2:22": KC_B}});
    const changed = draftChecks(before, after).filter(f => f.kind === "trap");
    assert.ok(changed.some(f => f.status === "new" && f.layers.join() === "1,2"));
    assert.ok(!draftChecks(before, after).some(f => f.kind === "reachabilityIncomplete"));
    assert.ok(draftChecks(after, before).some(f => f.kind === "trap" && f.status === "fixed" && f.layers.join() === "1,2"));
});

test("a lock whose layer covers its own key, with nothing else to release it, is a trap", () => {
    const [trap, ...rest] = traps(profile({keys: {"0:0": TG(1), "1:0": KC_B}}));
    assert.equal(rest.length, 0);
    assert.deepEqual(trap.layers, [1]);
    assert.equal(trap.title, "Numbers can lock with no way back to Base");
    assert.deepEqual(trap.path, ["Tap TG(1) on Base"]);
    assert.deepEqual(trap.place, {kind: "key", layer: 0, layoutIndex: 0});
    assert.match(trap.fix, /TO\(0\) or TG\(1\) on Numbers/);
});

test("a lock is no trap when its key falls through, or the layer has TO(0), TG or LOCK_LAYER of itself", () => {
    assert.deepEqual(traps(profile({keys: {"0:0": TG(1)}})), [], "the lock key is transparent on its layer");
    assert.deepEqual(traps(profile({keys: {"0:0": TG(1), "1:0": KC_B, "1:5": TO(0)}})), []);
    assert.deepEqual(traps(profile({keys: {"0:0": TG(1), "1:0": KC_B, "1:5": LOCK_LAYER(1)}})), []);
    assert.deepEqual(traps(profile({keys: {"0:0": LOCK_LAYER(1), "1:0": KC_B, "1:5": TG(1)}})), []);
});

test("a layer of KC_NO covers everything under it, so locking it with no exit is a trap", () => {
    assert.equal(traps(profile({keys: {"0:0": TG(1)}, fill: {1: NO}})).length, 1);
});

test("a layer held on top of the lock can carry the way out", () => {
    assert.deepEqual(traps(profile({keys: {"0:0": TG(1), "1:0": KC_B, "1:5": MO(3), "3:6": TG(1)}})), []);
    assert.deepEqual(traps(profile({keys: {"0:0": TG(1), "1:0": KC_B, "1:5": MO(3), "3:6": KC_B}})).map((trap) => trap.layers), [[1]]);
});

test("a chain of locks is followed: the second lock can hide the first layer's way out", () => {
    const [trap] = traps(profile({keys: {"0:0": TG(1), "1:0": KC_B, "1:5": TO(0), "1:6": TG(2), "2:5": KC_B, "2:6": KC_B}}));
    assert.deepEqual(trap.layers, [1, 2]);
    assert.deepEqual(trap.path, ["Tap TG(1) on Base", "Tap TG(2) on Numbers"]);
    assert.equal(trap.title, "Numbers and Symbols can lock with no way back to Base");
});

test("TO(n) locks n alone, so TO() onto a layer with no exit is a trap and TO(0) always gets home", () => {
    assert.deepEqual(traps(profile({keys: {"0:0": TO(2), "2:0": KC_B}})).map((trap) => trap.layers), [[2]]);
    assert.deepEqual(traps(profile({keys: {"0:0": TG(1), "0:1": TG(2), "1:0": KC_B, "2:1": KC_B, "1:9": TO(0), "2:9": TO(0)}})), []);
});

test("TT locks on its fifth tap, unless a behaviour row with steps on it replaces that", () => {
    const [trap] = traps(profile({keys: {"0:0": TT(1), "1:0": KC_B}}));
    assert.deepEqual(trap.path, ["Tap TT(1) 5 times on Base"]);
    const row = {target: code(TT(1)), steps: [{tapIndex: 0, tap: code(KC_B)}]};
    assert.deepEqual(traps(profile({keys: {"0:0": TT(1), "1:0": KC_B}, rows: [row]})), []);
    // A row without steps is no row: TT() keeps its own taps (firmware D-F27).
    const [kept] = traps(profile({keys: {"0:0": TT(1), "1:0": KC_B}, rows: [{target: code(TT(1)), tapHoldTerm: 180, steps: []}]}));
    assert.deepEqual(kept?.path, ["Tap TT(1) 5 times on Base"]);
});

test("behaviour branches lock and release like keys, told by the taps that reach them", () => {
    const lock = {target: code(KC_ESC), steps: [{tapIndex: 1, tap: {kind: 3, flags: 0, operand: 2}}]};
    const [trap] = traps(profile({keys: {"0:0": KC_ESC, "2:0": KC_B}, rows: [lock]}));
    assert.deepEqual(trap.path, ["Double-tap KC_ESCAPE on Base (its behaviour sends LOCK_LAYER(2))"]);
    const release = {target: code(KC_B), steps: [{tapIndex: 0, hold: {style: 2, repeatHz: 0, action: code(TO(0))}}]};
    assert.deepEqual(traps(profile({keys: {"0:0": KC_ESC, "2:0": KC_B}, rows: [lock, release]})), []);
    // A layer hold only holds from a "Press and hold until release" branch.
    const held = {target: code(KC_B), steps: [{tapIndex: 0, hold: {style: 1, repeatHz: 0, action: {kind: 2, flags: 0, operand: 3}}}]};
    assert.deepEqual(traps(profile({keys: {"0:0": KC_ESC, "2:0": KC_B, "3:0": TO(0)}, rows: [lock, held]})), []);
});

test("a combo on the highest layer can release a lock, while combos are switched on", () => {
    const combo = {inputs: [code(KC_A), code(KC_B)], output: code(TO(0))};
    const keys = {"0:0": TG(1), "1:0": KC_B, "1:1": KC_A, "1:2": KC_B};
    assert.deepEqual(traps(profile({keys, combos: [combo]})), []);
    assert.equal(traps(profile({keys, combos: [combo], settings: {20: 0}})).length, 1);
});

test("a combo on the top layer uses keys inherited through transparency", () => {
    const escape = {inputs: [code(KC_A), code(KC_B)], output: code(TO(0))};
    const keys = {"0:0": TG(1), "0:2": KC_B, "1:0": NO, "1:1": KC_A};
    assert.deepEqual(traps(profile({keys, combos: [escape]})), [], "the inherited KC_B lets the combo escape");
    assert.deepEqual(traps(profile({keys, combos: [escape], settings: {20: 0}})).map(row => row.layers), [[1]]);

    const entrance = {inputs: [code(KC_A), code(KC_B)], output: code(TG(2))};
    const locked = profile({keys: {"0:0": MO(1), "0:2": KC_B, "1:1": KC_A, "2:0": NO}, combos: [entrance]});
    (layers => layers[0].fill(NO))(locked.layers);
    for (const [index, value] of [[0, MO(1)], [2, KC_B]]) {
        const [row, column] = CHARYBDIS_4X6_LAYOUT_MATRIX[index];
        (layers => layers[0][row * 6 + column] = value)(locked.layers);
    }
    assert.deepEqual(traps(locked).map(row => row.layers), [[2]], "the inherited input can also enter a trap");
});

test("a combo using another reference layer reads that layer's raw keys", () => {
    const combo = {inputs: [code(KC_A), code(KC_B)], output: code(TO(0))};
    const keys = {"0:0": TG(1), "1:0": NO, "2:1": KC_A, "2:2": KC_B};
    const source = profile({keys, combos: [combo]});
    (layers => layers[0].fill(NO))(source.layers);
    const [row, column] = CHARYBDIS_4X6_LAYOUT_MATRIX[0];
    (layers => layers[0][row * 6 + column] = TG(1))(source.layers);
    assert.deepEqual(traps(source).map(row => row.layers), [[1]], "resolved keys on layer 1 cannot supply the combo");
    source.settings.layers[1].reference = 2;
    assert.deepEqual(traps(source), [], "layer 1 can instead match the inactive layer 2's raw assignments");
});

test("a combo whose inputs never occur together is a warning", () => {
    const combo = {inputs: [code(KC_A), code(KC_B)], output: code(KC_ESC)};
    const source = profile({combos: [combo]});
    (layers => layers[0].fill(NO))(source.layers);
    assert.equal(layerReach(source).find(row => row.kind === "unreachableCombo")?.title, "Combo 0 cannot fire");
});

test("the trackball wakes the pointer layer, which can carry the way out unless sniping keeps it off", () => {
    const keys = {"0:0": TG(1), "1:0": KC_B, "4:3": TO(0)};
    assert.equal(traps(profile({keys})).length, 1, "auto-mouse is off");
    assert.deepEqual(traps(profile({keys, settings: {4: 1, 5: 4}})), []);
    assert.equal(traps(profile({keys: {...keys, "0:0": TG(3), "3:0": KC_B}, settings: {4: 1, 5: 4, 8: 1, 9: 1 << 3}})).length, 1);
});

// Settings v9: auto-sniping follows a set of layers, and each of them that is
// on keeps a separate pointer layer off (pointer_layer_policy_apply).
test("every auto-sniping layer keeps the pointer layer off, and a switched-off set none", () => {
    const keys = {"0:0": TG(1), "1:0": KC_B, "4:3": TO(0)}, mouse = {4: 1, 5: 4};
    assert.deepEqual(traps(profile({keys, settings: {...mouse, 8: 1, 9: 1 << 3}})), [], "Numbers is no sniping layer");
    assert.equal(traps(profile({keys, settings: {...mouse, 8: 1, 9: (1 << 1) | (1 << 3)}})).length, 1, "Numbers is one of two");
    assert.deepEqual(traps(profile({keys, settings: {...mouse, 8: 0, 9: (1 << 1) | (1 << 3)}})), [], "the master switch off keeps the layers and strips nothing");
    assert.deepEqual(traps(profile({keys, settings: {...mouse, 8: 1, 9: 0}})), [], "no layers");
});

test("a layer with keys that nothing reaches is a warning, an empty one is not", () => {
    const findings = layerReach(profile({keys: {"5:0": KC_B}}));
    assert.deepEqual(findings.map((finding) => [finding.kind, finding.level, finding.layers]), [["unreachable", "warning", [5]]]);
    assert.equal(findings[0].title, "Nothing reaches Extra 1");
    assert.deepEqual(kinds(profile({keys: {"0:0": MO(5), "5:0": KC_B}})), []);
    assert.deepEqual(kinds(profile({keys: {"0:0": TG(5), "5:3": KC_B}})), [], "reached through a lock");
});

test("a layer key onto a layer with no keys of its own is a notice", () => {
    const [finding] = layerReach(profile({keys: {"0:0": MO(2)}}));
    assert.equal(finding.kind, "emptyTarget");
    assert.equal(finding.level, "notice");
    assert.match(finding.detail, /^Hold MO\(2\) on Base: Symbols holds only transparent keys and KC_NO/);
});

test("transparent and KC_NO base keys have separate notices and counts", () => {
    const findings = layerReach(profile({keys: {"0:3": TRNS, "0:4": TRNS, "0:5": NO}}));
    const transparent = findings.find(check => check.kind === "deadBase");
    const no = findings.find(check => check.kind === "noBase");
    assert.equal(transparent.count, 2);
    assert.equal(transparent.title, "2 transparent keys on the base layer (Base) do nothing");
    assert.match(transparent.detail, /^A transparent key on the base layer \(Base\)/);
    assert.deepEqual(transparent.place, {kind: "key", layer: 0, layoutIndex: 3});
    assert.equal(no.count, 1);
    assert.equal(no.title, "1 KC_NO key on the base layer (Base) does nothing");
    assert.match(no.detail, /^KC_NO on the base layer \(Base\) explicitly sends nothing/);
    assert.deepEqual(no.place, {kind: "key", layer: 0, layoutIndex: 5});
    const named = profile({keys: {"0:3": TRNS}});
    named.settings.names[0] = "Symbol";
    assert.equal(layerReach(named).find((check) => check.kind === "deadBase").title, "1 transparent key on the base layer (Symbol) does nothing");
});

test("a pointer layer that is always on, or empty, cannot work", () => {
    assert.deepEqual(layerReach(profile({settings: {4: 1, 5: 0}})).map((finding) => [finding.kind, finding.level]), [["pointerLayer", "warning"]]);
    assert.deepEqual(layerReach(profile({settings: {4: 1, 5: 4}})).map((finding) => [finding.kind, finding.level]), [["pointerLayer", "notice"]]);
    assert.deepEqual(kinds(profile({keys: {"4:0": KC_B}, settings: {4: 1, 5: 4}})), []);
});

test("layer keys the keyboard leaves to QMK are named where they sit", () => {
    const [finding] = layerReach(profile({keys: {"0:7": DF(1)}}));
    assert.equal(finding.kind, "unowned");
    assert.equal(finding.title, "DF(1) on Base bypasses layer tracking");
    assert.deepEqual(finding.place, {kind: "key", layer: 0, layoutIndex: 7});
});

test("a draft's findings are new, already on the keyboard, or fixed by the draft", () => {
    const keyboard = profile({keys: {"0:0": TG(1), "1:0": KC_B, "5:0": KC_B}});
    const draft = profile({keys: {"0:0": TG(1), "1:0": KC_B, "1:5": TO(0), "6:0": KC_B}});
    const checks = draftChecks(keyboard, draft);
    assert.deepEqual(checks.map((check) => [check.key, check.status]), [["unreachable:6", "new"], ["trap:1", "fixed"], ["unreachable:5", "fixed"]]);
    assert.deepEqual(draftChecks(keyboard, keyboard).map((check) => check.status), ["existing", "existing"]);
    assert.deepEqual(draftChecks(undefined, draft).map((check) => check.status), ["new"]);
});

test("a different unowned key on the same layer is new, and the old one is fixed", () => {
    const before = profile({keys: {"0:0": DF(1)}});
    const after = profile({keys: {"0:1": 0x52e2}});
    assert.deepEqual(draftChecks(before, after).filter(row => row.kind === "unowned").map(row => row.status), ["new", "fixed"]);
});

test("the review discloses trapped states beyond the four named paths", () => {
    const keys = {};
    for (let layer = 1; layer <= 5; layer++) {
        keys[`0:${layer - 1}`] = TG(layer);
        keys[`${layer}:${layer - 1}`] = KC_B;
    }
    const found = traps(profile({keys}));
    assert.equal(found.filter(row => row.kind === "trap").length, 4);
    assert.equal(found.find(row => row.kind === "trapOverflow")?.count, 1);
});

test("a profile without the eight-layer bank is not walked", () => {
    assert.deepEqual(layerReach({document: {layers: [[]]}}), []);
});

test("findings are matched layer with layer through the draft's order, so a reorder can make or mend one", () => {
    // The keyboard has nothing reaching Extra 1 (5). The draft swaps 5 into slot 2.
    const keyboard = profile({keys: {"5:0": KC_B}});
    const draft = profile({keys: {"2:0": KC_B}});
    const order = [0, 1, 5, 3, 4, 2, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    assert.deepEqual(draftChecks(keyboard, draft, order).map((check) => [check.key, check.status]), [["unreachable:5", "existing"]]);
    // Made the base, a layer leaves the old base with nothing reaching it: new.
    const based = profile({keys: {"3:0": KC_B}});
    assert.deepEqual(draftChecks(profile(), based, [3, 1, 2, 0, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]).map((check) => [check.key, check.status]), [["unreachable:0", "new"]]);
});

test("layer keys that hold or toggle Base do nothing, and are counted wherever they sit; TO(0) is not one", () => {
    const toggle = {target: code(KC_ESC), steps: [{tapIndex: 1, tap: {kind: 3, flags: 0, operand: 0}}]};
    const combo = {inputs: [code(KC_A), code(KC_B)], output: code(MO(0))};
    const [finding, ...rest] = layerReach(profile({keys: {"0:0": MO(0), "0:1": TO(0), "0:2": KC_ESC, "3:4": TG(0), "0:3": KC_B}, rows: [toggle], combos: [combo]}))
        .filter((entry) => entry.kind === "idleLayerKey");
    assert.equal(rest.length, 0);
    assert.equal(finding.level, "notice");
    assert.equal(finding.count, 4);
    assert.equal(finding.title, "4 layer keys hold or toggle Base, which is always on");
    assert.match(finding.detail, /^MO\(0\), TG\(0\), LOCK_LAYER\(0\) in the behaviour on KC_ESCAPE and 1 more: Base is always on/);
    assert.deepEqual(finding.place, {kind: "key", layer: 0, layoutIndex: 0});
    assert.deepEqual(kinds(profile({keys: {"0:0": TO(0)}})), []);
});

test("an impossible release hold cannot invent a layer entrance or escape", () => {
    const row = {target: code(KC_ESC), tapHoldTerm: 100, longHoldTerm: 100,
        steps: [{tapIndex: 0, hold: {style: 4, action: code(TG(2))}, longHold: {style: 4, action: code(KC_A)}}]};
    const p = profile({keys: {"0:0": KC_ESC, "2:1": KC_B}, rows: [row]});
    assert.ok(layerReach(p).some(f => f.kind === "unreachable" && f.layers.includes(2)));
    row.longHoldTerm = 101;
    assert.ok(!layerReach(p).some(f => f.kind === "unreachable" && f.layers.includes(2)));
});

test("combo-output behaviours use the same timing reachability as physical keys", () => {
    const row = {target: code(KC_ESC), tapHoldTerm: 100, longHoldTerm: 100,
        steps: [{tapIndex: 0, hold: {style: 4, action: code(TG(2))}, longHold: {style: 4, action: code(KC_A)}}]};
    const p = profile({keys: {"0:1": KC_B, "2:2": KC_B}, rows: [row],
        combos: [{inputs: [code(KC_A), code(KC_B)], output: code(KC_ESC)}]});
    assert.ok(layerReach(p).some(f => f.kind === "unreachable" && f.layers.includes(2)));
    row.longHoldTerm = 200;
    assert.ok(!layerReach(p).some(f => f.kind === "unreachable" && f.layers.includes(2)));
});

test("an impossible release action cannot conceal a trapped layer", () => {
    const row = {target: code(KC_ESC), tapHoldTerm: 100, longHoldTerm: 100,
        steps: [{tapIndex: 0, hold: {style: 4, action: code(TO(0))}, longHold: {style: 4, action: code(KC_A)}}]};
    const p = profile({keys: {"0:0": TG(2), "2:0": KC_B, "2:1": KC_ESC}, rows: [row]});
    assert.deepEqual(traps(p).map(f => f.layers), [[2]]);
    row.longHoldTerm = 200;
    assert.deepEqual(traps(p), []);
});

test("an incomplete draft graph never marks an earlier graph finding fixed", () => {
    const before = [{kind: "trap", layers: [15]}, {kind: "unreachable", layers: [14]}, {kind: "baseNo", layers: [0]}];
    const after = [{kind: "reachabilityIncomplete", layers: []}];
    const compared = compareFindings(before, after);
    assert.deepEqual(compared.filter(f => f.status === "fixed").map(f => f.kind), ["baseNo"]);
});

test("uncertainty about escapes does not hide a proved reachability repair", () => {
    const before = [{kind: "trap", layers: [15]}, {kind: "unreachable", layers: [14]}];
    const after = [{kind: "reachabilityIncomplete", scope: "escapes", layers: [15]}];
    assert.deepEqual(compareFindings(before, after).filter(f => f.status === "fixed").map(f => f.kind), ["unreachable"]);
});

test("compiled source and declared-owner conditions agree with an exhaustive profile oracle", () => {
    let seed = 0xade329;
    const random = max => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed >>> 8) % max;};
    const codes = [KC_A, KC_B, KC_ESC, TRNS, NO, TG(1), TG(2), TG(3), MO(1), MO(2), TO(0), TO(2), TT(1)];
    for (let example = 0; example < 150; example++) {
        const keys = {};
        for (let layer = 0; layer < 4; layer++) for (let pos = 0; pos < 5; pos++) keys[`${layer}:${pos}`] = codes[random(codes.length)];
        const output = example % 3 === 1 ? {kind: 7, flags: 0, operand: 0} : code(TO(0));
        const row = {target: output, allowedLayers: random(16), enabled: random(4) !== 0,
            steps: [{tapIndex: 0, tap: code([KC_ESC, TO(0), TG(2)][random(3)])}]};
        const p = profile({keys, rows: example % 3 ? [row] : [],
            combos: [{inputs: [code(KC_B), code(KC_ESC)], output, allowedLayers: random(16)}],
            settings: {23: random(4) === 0 ? 9 : 1, 28: random(4) ? 1 : 0, 29: random(16), 30: random(16),
                layers: Object.fromEntries(Array.from({length: 4}, (_, layer) => [layer, {bypass: [random(5)], exclude: [random(5)]}])),
                references: {1: random(4), 2: random(4), 3: random(4)}}});
        // Seed mixed origins deliberately as well as sampling arbitrary
        // profiles: sparse random chords alone seldom exercise generated rows.
        if (example >= 100) {
            p.layers.forEach((layer, index) => layer.fill(index === 0 ? NO : TRNS));
            (layers => layers[1].fill(NO))(p.layers);
            (layers => layers[0][0] = TG(1))(p.layers); (layers => layers[0][1] = KC_ESC)(p.layers);
            (layers => layers[1][0] = KC_B)(p.layers); (layers => layers[1][1] = TRNS)(p.layers);
            if (example % 2) (layers => layers[1][2] = KC_ESC)(p.layers);
            p.settings.values[23] = 1; p.settings.values[28] = 1; p.settings.values[29] = 0xffff; p.settings.values[30] = 0xffff;
            p.settings.layers.forEach((record, layer) => {record.reference = layer; record.bypass = []; record.exclude = [];});
            if (example % 4 === 0) {
                p.settings.layers[1].reference = 2;
                (layers => layers[2][0] = KC_B)(p.layers); (layers => layers[2][1] = KC_ESC)(p.layers);
            }
            row.allowedLayers = 2; row.enabled = true;
            row.steps[0].tap = code(output.kind === 7 ? TO(0) : KC_ESC);
            p.combos.rows[0].allowedLayers = 3;
        }
        const states = [0], seen = new Set(states), edges = new Map(), comboReached = new Set();
        let reached = p.settings.values[23] | 1;
        const nativeEffects = code => {
            const layer = code & 31;
            if (code === TO(0) || code === TO(2)) return [{kind: "move", layer}];
            if ((code & ~31) === 0x5260) return [{kind: "lock", layer}];
            if ((code & ~31) === 0x5220) return [{kind: "hold", layer}];
            if ((code & ~31) === 0x52c0) return [{kind: "hold", layer}, {kind: "lock", layer}];
            return [];
        };
        for (const state of states) {
            const locks = state & 65535, held = state >>> 16, mask = locks | held | p.settings.values[23] | 1;
            reached |= mask;
            const resolved = CHARYBDIS_4X6_LAYOUT_MATRIX.map(([r, c], position) => {
                for (let layer = 15; layer >= 0; layer--) if ((mask & (1 << layer)) && p.layers[layer][r * 6 + c] !== TRNS)
                    return {layer, position, code: p.layers[layer][r * 6 + c]};
                return null;
            });
            const effects = resolved.flatMap(key => {
                if (!key) return [];
                const [r, c] = CHARYBDIS_4X6_LAYOUT_MATRIX[key.position];
                const usesRow = p.behaviors.rows.length && key.code === row.target.operand && row.target.kind === 1
                    && p.settings.values[28] && row.enabled && (p.settings.values[29] & (1 << key.layer))
                    && (row.allowedLayers & (1 << key.layer)) && !p.settings.layers[key.layer].bypass.includes(r * 6 + c);
                return nativeEffects(usesRow ? row.steps[0].tap.operand : key.code);
            });
            const top = 31 - Math.clz32(mask), reference = p.settings.layers[top].reference;
            const members = resolved.filter(key => {
                if (!key || !(p.settings.values[30] & (1 << key.layer))) return false;
                const [r, c] = CHARYBDIS_4X6_LAYOUT_MATRIX[key.position];
                return !p.settings.layers[key.layer].exclude.includes(r * 6 + c);
            }).map(key => ({layer: key.layer,
                code: reference === top ? key.code : p.layers[reference][CHARYBDIS_4X6_LAYOUT_MATRIX[key.position][0] * 6 + CHARYBDIS_4X6_LAYOUT_MATRIX[key.position][1]]}));
            p.combos.rows.forEach((combo, index) => {
                if (combo.inputs.every(input => members.some(key => key.code === input.operand && (combo.allowedLayers & (1 << key.layer))))) {
                    comboReached.add(index);
                    // Choose one physical placement of the final declared
                    // member; each choice independently owns its generated row.
                    for (const owner of members.filter(key => key.code === combo.inputs[combo.inputs.length - 1].operand
                        && (combo.allowedLayers & (1 << key.layer)))) {
                        const usesRow = p.combos.rows[0].useOutputBehavior !== false && p.settings.comboOutputBehaviors !== false && p.behaviors.rows.length && p.settings.values[28] && row.enabled && (row.allowedLayers & (1 << owner.layer));
                        effects.push(...nativeEffects(usesRow ? row.steps[0].tap.operand : combo.output.kind === 1 ? combo.output.operand : NO));
                    }
                }
            });
            for (let layer = 0; layer < 4; layer++) if (held & (1 << layer)) effects.push({kind: "release", layer});
            const next = effects.map(effect => {
                if (effect.kind === "hold") return (locks | (held | (1 << effect.layer)) << 16) >>> 0;
                if (effect.kind === "release") return (locks | (held & ~(1 << effect.layer)) << 16) >>> 0;
                if (effect.kind === "lock") return ((locks ^ (1 << effect.layer)) | held << 16) >>> 0;
                return ((effect.layer ? 1 << effect.layer : 0) | held << 16) >>> 0;
            });
            edges.set(state, next);
            for (const to of next) if (!seen.has(to)) {seen.add(to); states.push(to);}
        }
        const home = new Set([0]); let changed;
        do {changed = false; for (const [from, next] of edges) if (!home.has(from) && next.some(to => home.has(to))) {home.add(from); changed = true;}} while (changed);
        const trapped = mask => seen.has(mask) && !home.has(mask), entries = new Set();
        for (const [from, next] of edges) if (!trapped(from & 65535)) for (const to of next) if (trapped(to & 65535)) entries.add(to & 65535);
        const minimal = [...entries].filter(mask => ![...entries].some(other => other !== mask && (mask & other) === other));
        const findings = layerReach(p), trapCount = findings.filter(f => f.kind === "trap").length + (findings.find(f => f.kind === "trapOverflow")?.count || 0);
        assert.ok(!findings.some(f => f.kind === "reachabilityIncomplete"));
        assert.equal(trapCount, minimal.length, `traps in example ${example}`);
        const unreachable = Array.from({length: 3}, (_, i) => i + 1).filter(layer => !(reached & (1 << layer))
            && p.layers[layer].some(code => code !== TRNS && code !== NO));
        assert.deepEqual(findings.filter(f => f.kind === "unreachable").flatMap(f => f.layers), unreachable);
        assert.equal(findings.some(f => f.kind === "unreachableCombo"), !comboReached.has(0));
    }
});

test("global and per-combo bypass remove generated custom escapes while preserving physical behaviours", () => {
    const custom = {kind: 7, flags: 0, operand: 0};
    const row = {target: custom, enabled: true, allowedLayers: 2, steps: [{tapIndex: 0, tap: code(TO(0))}]};
    const combo = {inputs: [code(KC_A), code(KC_B)], output: custom, allowedLayers: 2};
    const p = profile({keys: {"0:0": TG(1), "1:1": KC_A, "1:2": KC_B}, fill: {1: NO}, rows: [row], combos: [combo]});
    p.settings.values[29] = 0;
    p.settings.layers[1].bypass = [1, 2];
    assert.deepEqual(traps(p), [], "physical-layer and placement switches do not veto a generated output");
    combo.useOutputBehavior = false;
    assert.deepEqual(traps(p).map(f => f.layers), [[1]]);
    combo.useOutputBehavior = true; p.settings.comboOutputBehaviors = false;
    assert.deepEqual(traps(p).map(f => f.layers), [[1]]);
    p.settings.values[29] = 0xffff;
    (layers => layers[1][3] = 0x7f00)(p.layers);
    assert.deepEqual(traps(p), [], "the global switch leaves a physical custom-key escape eligible");
});

test("bypassed normal combo outputs retain their native layer escape", () => {
    const output = code(TO(0));
    const row = {target: output, enabled: true, allowedLayers: 2, steps: [{tapIndex: 0, tap: code(KC_ESC)}]};
    const combo = {inputs: [code(KC_A), code(KC_B)], output, allowedLayers: 2};
    const p = profile({keys: {"0:0": TG(1), "1:1": KC_A, "1:2": KC_B}, fill: {1: NO}, rows: [row], combos: [combo]});
    assert.deepEqual(traps(p).map(f => f.layers), [[1]], "the eligible behaviour replaces native TO(0)");
    combo.useOutputBehavior = false;
    assert.deepEqual(traps(p), []);
    combo.useOutputBehavior = true; p.settings.comboOutputBehaviors = false;
    assert.deepEqual(traps(p), []);
});

// Pointing links (firmware D-F62). PD_SLOT_n holds slot n's mode, and
// PD_SLOT_n_LOCK toggles its lock; a mode its key runs turns on the layers its
// link names for its key, and a layer that starts its mode keeps a separate
// pointer layer off unless what ends the mode is on.
const PD_SLOT = (n) => 0x7e80 + n, PD_SLOT_LOCK = (n) => 0x7ea0 + n;
const linked = (extra = {}) => ({id: 1, kind: 1, name: "Volume", linkedLayers: 0, linkTurnsOn: 0, linkEnds: 0, ...extra});
const mask = (layers) => layers.reduce((bits, layer) => bits | (1 << layer), 0);
// The key turns layers on; the layers start the mode; the same layers both ways.
const turnsOn = (layer, extra = {}) => linked({linkTurnsOn: 1 << layer, ...extra});
const startedBy = (layers, extra = {}) => linked({linkedLayers: mask(layers), ...extra});
const bothWays = (layers, extra = {}) => startedBy(layers, {linkTurnsOn: mask(layers), ...extra});

test("a mode whose key turns layers on reaches them through its hold and lock keys", () => {
    const keys = {"0:0": PD_SLOT(1), "5:3": KC_B};
    assert.deepEqual(kinds(profile({keys})), ["unreachable"], "a mode key alone reaches nothing");
    assert.deepEqual(kinds(profile({keys, pdModes: [turnsOn(5)]})), [], "the key turns Extra 1 on");
    assert.deepEqual(kinds(profile({keys, pdModes: [bothWays([5])]})), [], "every linked layer");
    assert.deepEqual(kinds(profile({keys: {...keys, "6:3": KC_A}, pdModes: [bothWays([5, 6])]})), [], "several, each reached");
    assert.deepEqual(kinds(profile({keys: {...keys, "6:3": KC_A}, pdModes: [startedBy([5, 6], {linkTurnsOn: 1 << 6})]})), ["unreachable"], "only the ones its key turns on");
    assert.deepEqual(kinds(profile({keys, pdModes: [startedBy([5])]})), ["unreachable"], "the layer turns the mode on, not the other way");
    assert.deepEqual(kinds(profile({keys, pdModes: [turnsOn(5, {kind: 0})]})), ["unreachable"], "an empty slot runs nothing");
    assert.deepEqual(kinds(profile({keys, pdModes: [turnsOn(5)], settings: {5: 5}})), ["unreachable"], "the keyboard never turns on the pointer layer for a link");
    assert.deepEqual(kinds(profile({keys, pdModes: [turnsOn(5)], settings: {23: 1 | (1 << 5)}})).includes("unreachable"), false,
        "a default layer is always on, so it is reached without the link");
    assert.deepEqual(kinds(profile({keys: {"0:0": PD_SLOT_LOCK(1), "5:3": KC_B}, pdModes: [turnsOn(5)]})), [], "the lock key too");
    // A behaviour branch held until release, or a combo output, that runs the
    // mode reaches it as well.
    const row = {target: code(KC_ESC), allowedLayers: 1, steps: [{tapIndex: 0, hold: {action: {kind: 4, flags: 0, operand: 1}, style: 1}}]};
    assert.deepEqual(kinds(profile({keys: {"0:0": KC_ESC, "5:3": KC_B}, rows: [row], pdModes: [turnsOn(5)]})), []);
    const combo = {inputs: [code(KC_A), code(KC_A)], output: {kind: 5, flags: 0, operand: 1}, allowedLayers: 0xffff};
    assert.deepEqual(kinds(profile({keys: {"5:3": KC_B}, combos: [combo], pdModes: [turnsOn(5)]})).includes("unreachable"), false);
});

test("a locked mode keeps its layer on like a layer lock, and is a trap when the layer covers its lock key", () => {
    const pdModes = [turnsOn(5)];
    assert.deepEqual(traps(profile({keys: {"0:0": PD_SLOT_LOCK(1), "5:3": KC_B}, pdModes})), [], "the lock key still answers on Extra 1");
    const [trap] = traps(profile({keys: {"0:0": PD_SLOT_LOCK(1), "5:0": KC_B}, pdModes}));
    assert.deepEqual(trap.layers, [5]);
    assert.deepEqual(trap.path, ["Tap PD_SLOT_1_LOCK on Base (which runs Volume, whose key turns layers on)"]);
    assert.deepEqual(traps(profile({keys: {"0:0": PD_SLOT_LOCK(1), "5:0": KC_B, "5:1": TO(0)}, pdModes})), [], "with a way home on it");
});

test("a layer that starts its mode keeps the pointer layer off, so a way back only there does not count", () => {
    const keys = {"0:0": TG(1), "1:0": KC_B, "4:3": TO(0)}, mouse = {4: 1, 5: 4};
    assert.deepEqual(traps(profile({keys, settings: mouse})), [], "the trackball brings the pointer layer and its TO(0)");
    assert.equal(traps(profile({keys, settings: mouse, pdModes: [startedBy([1])]})).length, 1, "Numbers starts Volume");
    assert.equal(traps(profile({keys, settings: mouse, pdModes: [startedBy([3, 1])]})).length, 1, "one of several linked layers");
    assert.equal(traps(profile({keys, settings: mouse, pdModes: [bothWays([1])]})).length, 1, "both ways");
    assert.deepEqual(traps(profile({keys, settings: mouse, pdModes: [turnsOn(1)]})), [], "a key that only turns Numbers on leaves the pointer layer");
    assert.deepEqual(traps(profile({keys, settings: {...mouse, 23: 1 | (1 << 1)}, pdModes: [startedBy([1])]})), [], "a default layer in a link does nothing");
});

test("a link a higher layer ends keeps the pointer layer off only while its layer is on top", () => {
    // Numbers locks with no way home of its own, MO(2) on it holds Symbols, and
    // the pointer layer's TO(0) is the way back.
    const keys = {"0:0": TG(1), "1:0": KC_B, "1:1": MO(2), "4:3": TO(0)}, mouse = {4: 1, 5: 4};
    assert.equal(traps(profile({keys, settings: mouse, pdModes: [startedBy([1])]})).length, 1, "Numbers starts Volume whatever is above it");
    assert.deepEqual(traps(profile({keys, settings: mouse, pdModes: [startedBy([1], {linkEnds: 1})]})), [],
        "holding Symbols over Numbers ends the mode, so the trackball brings the pointer layer back");
    assert.equal(traps(profile({keys, settings: mouse, pdModes: [startedBy([1, 2], {linkEnds: 1})]})).length, 1,
        "Symbols in the set starts the mode itself, on top");
    assert.equal(traps(profile({keys: {"0:0": TG(1), "1:0": KC_B, "4:3": TO(0)}, settings: mouse, pdModes: [startedBy([1], {linkEnds: 1})]})).length, 1,
        "with nothing above Numbers, its mode runs and keeps the pointer layer off");
});

test("a link any other layer ends keeps the pointer layer off only while no layer outside the link is on", () => {
    // Symbols locks with no way home of its own, MO(1) on it holds Numbers,
    // below it, and the pointer layer's TO(0) is the way back.
    const keys = {"0:0": TG(2), "2:0": KC_B, "2:1": MO(1), "4:3": TO(0)}, mouse = {4: 1, 5: 4};
    assert.equal(traps(profile({keys, settings: mouse, pdModes: [startedBy([2], {linkEnds: 1})]})).length, 1, "a lower layer does not end a link a higher layer ends");
    assert.deepEqual(traps(profile({keys, settings: mouse, pdModes: [startedBy([2], {linkEnds: 2})]})), [], "a lower layer ends a link any other layer ends");
    assert.equal(traps(profile({keys, settings: mouse, pdModes: [startedBy([2], {linkEnds: 2, linkTurnsOn: 1 << 1})]})).length, 1,
        "the layer its key turns on is in the link, so it does not end it");
    assert.equal(traps(profile({keys: {"0:0": TG(2), "2:0": KC_B, "4:3": TO(0)}, settings: mouse, pdModes: [startedBy([2], {linkEnds: 2})]})).length, 1,
        "Base, always on, does not end it");
});

// A key that turns several layers on at once turns them all on, and its
// release lets them all go (firmware D-F26, D-F62): the walk never reaches a
// state where only some of them are on. Here Extra 2 (6) covers Extra 1's (5)
// B with KC_NO, so the combo of A on Base and B needs Extra 1 on without
// Extra 2, which no key gives, until an MO(5) does.
const CUSTOM_KEY = (n) => 0x7f00 + n;
for (const [name, key, extra] of [
    ["a custom key whose shortcut turns on", CUSTOM_KEY(9), {shortcuts: {9: {layers: (1 << 5) | (1 << 6)}}}],
    ["a pointing mode whose key turns on", PD_SLOT(1), {pdModes: [linked({linkTurnsOn: (1 << 5) | (1 << 6)})]}],
]) {
    test(`${name} several layers reaches them only together`, () => {
        const combo = {inputs: [code(KC_A), code(KC_B)], output: code(KC_ESC), allowedLayers: 0xffff};
        const keys = {"0:3": key, "5:1": KC_B, "6:1": NO, "6:2": KC_ESC, "5:2": KC_ESC};
        assert.deepEqual(kinds(profile({keys, combos: [combo], ...extra})), ["unreachableCombo"], "never Extra 1 alone");
        assert.deepEqual(kinds(profile({keys: {...keys, "0:4": MO(5)}, combos: [combo], ...extra})), [], "an MO(5) gives Extra 1 alone");
        assert.deepEqual(kinds(profile({keys: {"0:3": key, "5:1": KC_B, "6:2": KC_ESC}, ...extra})), [], "both layers are reached");
    });
}

test("a custom key's shortcut holds its layers like MO(), from the key, its empty hold tier, a hold step or a combo", () => {
    const shortcuts = {9: {layers: 1 << 5}};
    const keys = {"5:3": KC_B};
    assert.deepEqual(kinds(profile({keys: {...keys, "0:0": CUSTOM_KEY(9)}})), ["unreachable"], "no shortcut, no layer");
    assert.deepEqual(kinds(profile({keys: {...keys, "0:0": CUSTOM_KEY(9)}, shortcuts})), [], "the key holds Extra 1");
    const custom = {kind: 7, flags: 0, operand: 9};
    const tapOnly = {target: custom, allowedLayers: 0xffff, steps: [{tapIndex: 0, tap: code(KC_ESC)}]};
    assert.deepEqual(kinds(profile({keys: {...keys, "0:0": CUSTOM_KEY(9)}, rows: [tapOnly], shortcuts})), [], "an empty hold tier sends the shortcut");
    const held = {...tapOnly, steps: [{tapIndex: 0, tap: code(KC_ESC), hold: {action: code(KC_B), style: 1}}]};
    assert.deepEqual(kinds(profile({keys: {...keys, "0:0": CUSTOM_KEY(9)}, rows: [held], shortcuts})), ["unreachable"], "a hold of its own replaces it");
    const step = {target: code(KC_ESC), allowedLayers: 0xffff, steps: [{tapIndex: 0, hold: {action: custom, style: 1}}]};
    assert.deepEqual(kinds(profile({keys: {...keys, "0:0": KC_ESC}, rows: [step], shortcuts})), [], "another key's hold step");
    const tapped = {...step, steps: [{tapIndex: 0, tap: custom}]};
    assert.deepEqual(kinds(profile({keys: {...keys, "0:0": KC_ESC}, rows: [tapped], shortcuts})), ["unreachable"], "a tap turns them on only for the tap");
    const combo = {inputs: [code(KC_A), code(KC_A)], output: custom, allowedLayers: 0xffff};
    assert.deepEqual(kinds(profile({keys, combos: [combo], shortcuts})), [], "a combo whose output it is");
});

// A shortcut turns its layers on as its layer key does (firmware D-F26):
// hold (0), lock (1), move to (2), tap-toggle (3), one-shot (4).
const HOLD = 0, LOCK = 1, MOVE = 2, TAP_TOGGLE = 3, ONESHOT = 4;

test("a custom key's lock, move and tap-toggle shortcuts can lock their layers, as TG(), TO() and TT() do", () => {
    // The key's own place on Extra 1 is covered by B, so a lock of it has no
    // way home; a hold or a one-shot lets go.
    const keys = {"0:0": CUSTOM_KEY(9), "5:0": KC_B};
    /** @param {number} layerKind */
    const trapped = (layerKind) => traps(profile({keys, shortcuts: {9: {layers: 1 << 5, layerKind}}})).length;
    assert.deepEqual([HOLD, LOCK, MOVE, TAP_TOGGLE, ONESHOT].map(trapped), [0, 1, 1, 1, 0]);
    // A row with steps replaces the tap-toggle's own taps, as it does TT()'s.
    const row = {target: {kind: 7, flags: 0, operand: 9}, allowedLayers: 0xffff, steps: [{tapIndex: 0, tap: code(KC_ESC)}]};
    assert.equal(traps(profile({keys, rows: [row], shortcuts: {9: {layers: 1 << 5, layerKind: TAP_TOGGLE}}})).length, 0);
});

test("a custom key's move shortcut locks its layers alone, letting the others go", () => {
    // Numbers locks, its own TG(1) covered by B. On it, the custom key turns
    // Extra 1 (5) on, where TG(5) lets Extra 1 go: moved, that is the way
    // home; locked beside Numbers, it is not.
    const keys = {"0:0": TG(1), "1:0": KC_B, "1:1": CUSTOM_KEY(9), "5:2": TG(5)};
    assert.equal(traps(profile({keys, shortcuts: {9: {layers: 1 << 5, layerKind: LOCK}}})).length, 1, "locked beside Numbers");
    assert.deepEqual(traps(profile({keys, shortcuts: {9: {layers: 1 << 5, layerKind: MOVE}}})), [], "moved: Numbers let go");
});

test("sent by a step or a combo, a shortcut's layers do what its kind does there", () => {
    // Another key's tap step sends the custom key: a held or tap-toggle
    // shortcut turns Extra 1 on only for the tap, a lock, a move or a one-shot
    // reaches it.
    const keys = {"0:0": KC_ESC, "5:3": KC_B};
    const custom = {kind: 7, flags: 0, operand: 9};
    const tapped = {target: code(KC_ESC), allowedLayers: 0xffff, steps: [{tapIndex: 0, tap: custom}]};
    /** @param {number} layerKind @param {object} extra */
    const reached = (layerKind, extra) => !kinds(profile({keys, ...extra, shortcuts: {9: {layers: 1 << 5, layerKind}}})).includes("unreachable");
    assert.deepEqual([HOLD, LOCK, MOVE, TAP_TOGGLE, ONESHOT].map((kind) => reached(kind, {rows: [tapped]})), [false, true, true, false, true], "a tap step");
    // Held by a step that presses and holds, every kind reaches it.
    const held = {...tapped, steps: [{tapIndex: 0, hold: {action: custom, style: 1}}]};
    assert.deepEqual([HOLD, LOCK, MOVE, TAP_TOGGLE, ONESHOT].map((kind) => reached(kind, {rows: [held]})), [true, true, true, true, true], "a hold step");
    // A combo whose output it is holds, locks or moves.
    const combo = {inputs: [code(KC_A), code(KC_A)], output: custom, allowedLayers: 0xffff};
    assert.deepEqual([HOLD, LOCK, MOVE, TAP_TOGGLE, ONESHOT].map((kind) => reached(kind, {keys: {"5:3": KC_B}, combos: [combo]})), [true, true, true, true, true], "a combo");
    // Sent, a tap-toggle shortcut never locks: its taps are its own key's.
    const lockFree = {"0:0": KC_ESC, "5:0": KC_B};
    assert.deepEqual(traps(profile({keys: lockFree, rows: [held], shortcuts: {9: {layers: 1 << 5, layerKind: TAP_TOGGLE}}})), []);
});

test("a custom key with its own row sends its shortcut where the row leaves a tier empty, and a tap-toggle or one-shot holds from every press", () => {
    const custom = {kind: 7, flags: 0, operand: 9};
    const tapOnly = {target: custom, allowedLayers: 0xffff, steps: [{tapIndex: 0, tap: code(KC_ESC)}]};
    const both = {target: custom, allowedLayers: 0xffff, steps: [{tapIndex: 0, tap: code(KC_ESC), hold: {action: code(KC_A), style: 1}}]};
    // A lock whose row authors the tap still locks, from the empty hold tier:
    // Extra 1 covers the key with B, so it is a trap.
    const covered = {"0:0": CUSTOM_KEY(9), "5:0": KC_B};
    const lockTrap = traps(profile({keys: covered, rows: [tapOnly], shortcuts: {9: {layers: 1 << 5, layerKind: LOCK}}}));
    assert.equal(lockTrap.length, 1, "locked from the empty hold tier");
    assert.match(JSON.stringify(lockTrap), /Hold CUSTOM_KEY_9/, "named by the hold that makes it");
    assert.equal(traps(profile({keys: covered, rows: [tapOnly], shortcuts: {9: {layers: 1 << 5, layerKind: MOVE}}})).length, 1, "moved from it too");
    // Both tiers authored at the first count: no way left but a later one.
    assert.deepEqual(traps(profile({keys: covered, rows: [both], shortcuts: {9: {layers: 1 << 5, layerKind: LOCK}}})), [], "both tiers its own");
    // The fallback hold belongs to the first press alone (firmware
    // handled_key_resolution_uses_fallback_hold_behavior): a later count's
    // empty hold holds nothing.
    const later = {...both, steps: [...both.steps, {tapIndex: 1, tap: code(KC_ESC)}]};
    assert.deepEqual(traps(profile({keys: covered, rows: [later], shortcuts: {9: {layers: 1 << 5, layerKind: LOCK}}})), [], "a later count's empty hold is no hold");
    // A first press with a long hold but no hold has no fallback hold either.
    const longOnly = {target: custom, allowedLayers: 0xffff, steps: [{tapIndex: 0, tap: code(KC_ESC), longHold: {action: code(KC_A), style: 1}}]};
    assert.deepEqual(traps(profile({keys: covered, rows: [longOnly], shortcuts: {9: {layers: 1 << 5, layerKind: LOCK}}})), [], "a long hold, no hold: no lock");
    // A held shortcut is held from the empty hold tier, and from nowhere when
    // the first press has a long hold: then its layer is unreachable.
    const holdKeys = {"0:0": CUSTOM_KEY(9), "5:3": KC_B};
    /** @param {object} row */
    const holdReached = (row) => !kinds(profile({keys: holdKeys, rows: [row], shortcuts: {9: {layers: 1 << 5, layerKind: HOLD}}})).includes("unreachable");
    assert.deepEqual([tapOnly, longOnly, later].map(holdReached), [true, false, false], "Hold: an empty first hold, a long hold, both tiers authored");
    // A tap-toggle or one-shot key holds its layers from every press, its
    // row's tiers authored or not; a held one does not.
    const keys = {"0:0": CUSTOM_KEY(9), "5:3": KC_B};
    /** @param {number} layerKind */
    const reached = (layerKind) => !kinds(profile({keys, rows: [both], shortcuts: {9: {layers: 1 << 5, layerKind}}})).includes("unreachable");
    assert.deepEqual([HOLD, TAP_TOGGLE, ONESHOT].map(reached), [false, true, true]);
    // A row with steps replaces the tap-toggle's own taps: no lock, no trap.
    assert.deepEqual(traps(profile({keys: covered, rows: [both], shortcuts: {9: {layers: 1 << 5, layerKind: TAP_TOGGLE}}})), []);
});
