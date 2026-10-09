"use strict";
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
function profile({keys = {}, fill = {}, rows = [], combos = [], settings = {}} = {}) {
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
    for (const [id, value] of Object.entries(settings)) if (id !== "references" && id !== "layers") values[id] = value;
    const records = Array.from({length: 16}, (_, layer) => ({reference: settings.references?.[layer] ?? layer, bypass: [], exclude: [], ...settings.layers?.[layer]}));
    return {document: {layers}, settings: {values, layers: records, names: ["Base", "Numbers", "Symbols", "Navigation", "Pointer", "Extra 1", "Extra 2", "Extra 3", ...Array(8).fill("")]},
        behaviors: {rows}, combos: {version: 3, defaultTermMs: 50, holdTermMs: 200, rows: combos}};
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
    p.document.layers[1][2] = TRNS; p.document.layers[0][2] = KC_B;
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
        document.layers.forEach(layer => layer.fill(NO));
        document.layers[0][0] = TG(1); document.layers[0][1] = KC_B;
        document.layers[1][0] = KC_A; document.layers[1][1] = TRNS;
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

test("TT locks on its fifth tap, unless a behaviour row on it replaces that", () => {
    const [trap] = traps(profile({keys: {"0:0": TT(1), "1:0": KC_B}}));
    assert.deepEqual(trap.path, ["Tap TT(1) 5 times on Base"]);
    const row = {target: code(TT(1)), steps: [{tapIndex: 0, tap: code(KC_B)}]};
    assert.deepEqual(traps(profile({keys: {"0:0": TT(1), "1:0": KC_B}, rows: [row]})), []);
});

test("behaviour branches lock and release like keys, told by the taps that reach them", () => {
    const lock = {target: code(KC_ESC), steps: [{tapIndex: 1, tap: {kind: 3, flags: 0, operand: 2}}]};
    const [trap] = traps(profile({keys: {"0:0": KC_ESC, "2:0": KC_B}, rows: [lock]}));
    assert.deepEqual(trap.path, ["Double-tap KC_ESCAPE on Base (its behaviour sends LOCK_LAYER(2))"]);
    const release = {target: code(KC_B), steps: [{tapIndex: 0, hold: {mode: 2, repeatHz: 0, action: code(TO(0))}}]};
    assert.deepEqual(traps(profile({keys: {"0:0": KC_ESC, "2:0": KC_B}, rows: [lock, release]})), []);
    // A layer hold only holds from a "Press and hold until release" branch.
    const held = {target: code(KC_B), steps: [{tapIndex: 0, hold: {mode: 1, repeatHz: 0, action: {kind: 2, flags: 0, operand: 3}}}]};
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
    locked.document.layers[0].fill(NO);
    for (const [index, value] of [[0, MO(1)], [2, KC_B]]) {
        const [row, column] = CHARYBDIS_4X6_LAYOUT_MATRIX[index];
        locked.document.layers[0][row * 6 + column] = value;
    }
    assert.deepEqual(traps(locked).map(row => row.layers), [[2]], "the inherited input can also enter a trap");
});

test("a combo using another reference layer reads that layer's raw keys", () => {
    const combo = {inputs: [code(KC_A), code(KC_B)], output: code(TO(0))};
    const keys = {"0:0": TG(1), "1:0": NO, "2:1": KC_A, "2:2": KC_B};
    const source = profile({keys, combos: [combo]});
    source.document.layers[0].fill(NO);
    const [row, column] = CHARYBDIS_4X6_LAYOUT_MATRIX[0];
    source.document.layers[0][row * 6 + column] = TG(1);
    assert.deepEqual(traps(source).map(row => row.layers), [[1]], "resolved keys on layer 1 cannot supply the combo");
    source.settings.layers[1].reference = 2;
    assert.deepEqual(traps(source), [], "layer 1 can instead match the inactive layer 2's raw assignments");
});

test("a combo whose inputs never occur together is a warning", () => {
    const combo = {inputs: [code(KC_A), code(KC_B)], output: code(KC_ESC)};
    const source = profile({combos: [combo]});
    source.document.layers[0].fill(NO);
    assert.equal(layerReach(source).find(row => row.kind === "unreachableCombo")?.title, "Combo 0 cannot fire");
});

test("the trackball wakes the pointer layer, which can carry the way out unless sniping keeps it off", () => {
    const keys = {"0:0": TG(1), "1:0": KC_B, "4:3": TO(0)};
    assert.equal(traps(profile({keys})).length, 1, "auto-mouse is off");
    assert.deepEqual(traps(profile({keys, settings: {4: 1, 5: 4}})), []);
    assert.equal(traps(profile({keys: {...keys, "0:0": TG(3), "3:0": KC_B}, settings: {4: 1, 5: 4, 8: 1, 9: 3}})).length, 1);
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

test("legacy timing findings follow reachable physical combo members and effective defaults", () => {
    const row = {target: code(0xd3), tapHoldTerm: 100, multiTapTerm: 0,
        steps: [{tapIndex: 1, hold: {mode: 1, action: code(0xd7)}}]};
    const combo = {inputs: [code(0xd3), code(KC_B)], output: code(KC_A), termMs: null};
    const p = profile({keys: {"0:0": 0xd3, "0:1": KC_B}, rows: [row], combos: [combo], settings: {3: 150}});
    const timing = value => layerReach(value, {legacyGestureTiming: true}).filter(x => x.kind === "gestureTiming");
    assert.equal(timing(p).length, 1);
    assert.match(timing(p)[0].detail, /combo 0 \(50 ms\)/);
    assert.match(timing(p)[0].detail, /hold: 100 ms; repeated taps: 150 ms/);
    assert.equal(timing(p)[0].level, "warning");
    assert.equal(layerReach(p).some(x => x.kind === "gestureTiming"), false, "fixed firmware has no legacy warning");
    p.settings.values[20] = 0;
    assert.equal(timing(p).length, 0, "disabled combos do not buffer");
    p.settings.values[20] = 1;
    p.settings.layers[0].reference = 1; // base uses raw layer 1 as combo reference
    assert.equal(timing(p).length, 0, "reference lookup no longer matches this member");
    p.settings.layers[0].reference = 0;
    p.document.layers[0].fill(KC_A);
    assert.equal(timing(p).length, 0, "an unplaced behavior has no physical member");
});

test("legacy authored LT warning does not require combo membership", () => {
    const key = 0x432f;
    const p = profile({keys: {"0:0": key}, rows: [{target: code(key), steps: [{tapIndex: 1, tap: code(KC_B)}]}], settings: {0: 200, 3: 150}});
    const checks = layerReach(p, {legacyGestureTiming: true});
    const finding = checks.find(x => x.kind === "gestureTiming");
    assert.match(finding.detail, /QMK also decides tap or hold/);
    assert.match(finding.detail, /hold: 200 ms/);
});

test("an impossible release hold cannot invent a layer entrance or escape", () => {
    const row = {target: code(KC_ESC), tapHoldTerm: 100, longerHoldTerm: 100,
        steps: [{tapIndex: 0, hold: {mode: 4, action: code(TG(2))}, longHold: {mode: 4, action: code(KC_A)}}]};
    const p = profile({keys: {"0:0": KC_ESC, "2:1": KC_B}, rows: [row]});
    assert.ok(layerReach(p).some(f => f.kind === "unreachable" && f.layers.includes(2)));
    row.longerHoldTerm = 101;
    assert.ok(!layerReach(p).some(f => f.kind === "unreachable" && f.layers.includes(2)));
});

test("native tapping warnings distinguish the original timing fix from owned tapping", () => {
    for (const target of [0x2104, 0x5281, 0x52a1, 0x52c1]) {
        const p = profile({keys: {"0:0": target}, rows: [{target: code(target), steps: [{tapIndex: 0, tap: code(KC_A)}]}]});
        assert.ok(layerReach(p, {legacyGestureTiming: false, legacyOwnedTapping: true}).some(f => f.kind === "gestureTiming"));
        assert.ok(!layerReach(p, {legacyGestureTiming: false, legacyOwnedTapping: false}).some(f => f.kind === "gestureTiming"));
    }
});

test("combo-output behaviours use the same timing reachability as physical keys", () => {
    const row = {target: code(KC_ESC), tapHoldTerm: 100, longerHoldTerm: 100,
        steps: [{tapIndex: 0, hold: {mode: 4, action: code(TG(2))}, longHold: {mode: 4, action: code(KC_A)}}]};
    const p = profile({keys: {"0:1": KC_B, "2:2": KC_B}, rows: [row],
        combos: [{inputs: [code(KC_A), code(KC_B)], output: code(KC_ESC)}]});
    assert.ok(layerReach(p).some(f => f.kind === "unreachable" && f.layers.includes(2)));
    row.longerHoldTerm = 200;
    assert.ok(!layerReach(p).some(f => f.kind === "unreachable" && f.layers.includes(2)));
});

test("an impossible release action cannot conceal a trapped layer", () => {
    const row = {target: code(KC_ESC), tapHoldTerm: 100, longerHoldTerm: 100,
        steps: [{tapIndex: 0, hold: {mode: 4, action: code(TO(0))}, longHold: {mode: 4, action: code(KC_A)}}]};
    const p = profile({keys: {"0:0": TG(2), "2:0": KC_B, "2:1": KC_ESC}, rows: [row]});
    assert.deepEqual(traps(p).map(f => f.layers), [[2]]);
    row.longerHoldTerm = 200;
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
            p.document.layers.forEach((layer, index) => layer.fill(index === 0 ? NO : TRNS));
            p.document.layers[1].fill(NO);
            p.document.layers[0][0] = TG(1); p.document.layers[0][1] = KC_ESC;
            p.document.layers[1][0] = KC_B; p.document.layers[1][1] = TRNS;
            if (example % 2) p.document.layers[1][2] = KC_ESC;
            p.settings.values[23] = 1; p.settings.values[28] = 1; p.settings.values[29] = 0xffff; p.settings.values[30] = 0xffff;
            p.settings.layers.forEach((record, layer) => {record.reference = layer; record.bypass = []; record.exclude = [];});
            if (example % 4 === 0) {
                p.settings.layers[1].reference = 2;
                p.document.layers[2][0] = KC_B; p.document.layers[2][1] = KC_ESC;
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
                for (let layer = 15; layer >= 0; layer--) if ((mask & (1 << layer)) && p.document.layers[layer][r * 6 + c] !== TRNS)
                    return {layer, position, code: p.document.layers[layer][r * 6 + c]};
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
                code: reference === top ? key.code : p.document.layers[reference][CHARYBDIS_4X6_LAYOUT_MATRIX[key.position][0] * 6 + CHARYBDIS_4X6_LAYOUT_MATRIX[key.position][1]]}));
            p.combos.rows.forEach((combo, index) => {
                if (combo.inputs.every(input => members.some(key => key.code === input.operand && (combo.allowedLayers & (1 << key.layer))))) {
                    comboReached.add(index);
                    // Choose one physical placement of the final declared
                    // member; each choice independently owns its generated row.
                    for (const owner of members.filter(key => key.code === combo.inputs[combo.inputs.length - 1].operand
                        && (combo.allowedLayers & (1 << key.layer)))) {
                        const usesRow = p.behaviors.rows.length && p.settings.values[28] && row.enabled && (row.allowedLayers & (1 << owner.layer));
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
            && p.document.layers[layer].some(code => code !== TRNS && code !== NO));
        assert.deepEqual(findings.filter(f => f.kind === "unreachable").flatMap(f => f.layers), unreachable);
        assert.equal(findings.some(f => f.kind === "unreachableCombo"), !comboReached.has(0));
    }
});
