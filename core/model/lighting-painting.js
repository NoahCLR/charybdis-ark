// @ts-check
"use strict";
const {decodeLightingDomain, encodeLightingDomain} = require("../schema/lighting-domain-v1");
const {LIGHTING_KINDS} = require("../schema/lighting-kinds-v1");
const {knownRule, knownMap, ruleIdentity, ruleBand} = require("./lighting-editor");
/** @typedef {import('../schema/lighting-types.js').LightingProfile} Program */
/** @typedef {import('../schema/lighting-types.js').LightingOptions} Options */
/** @param {string} message @returns {never} */
function fail(message) {throw Object.assign(new Error(message), {code: "INVALID_EDIT"});}
/** @param {Options} options @param {import('../schema/lighting-types.js').LightingRegistry} registry @param {number} kind */
function supported(options, registry, kind) {
    if (!options.capabilities?.registries[registry].includes(kind)) fail("This keyboard does not offer that lighting option.");
}
/** @param {Program} program */
function opaque(program) {
    return program.rules.some(r => !knownRule(r)) || !program.maps.every(knownMap) || program.extensions.some(e => !LIGHTING_KINDS.domainExtensions[e.kind]);
}
// Never renumber the palette: opaque parts might hold references Ark cannot see.
// Unreferenced slots can be reused only when every reference is understood.
/** @param {Program} program @param {import('../../contracts/lighting.js').PaintColour} colour @param {Options} options */
function paletteColour(program, colour, options) {
    if ([colour.h, colour.s, colour.v].some(n => !Number.isInteger(n) || n < 0 || n > 255) || colour.v > (options.maximumBrightness ?? 255)) fail("Choose a colour within this keyboard's brightness limit.");
    let index = program.palette.findIndex(c => c.h === colour.h && c.s === colour.s && c.v === colour.v);
    if (index >= 0) return index;
    const references = new Set(program.things.flatMap(t => [t.default, ...t.records].flatMap(r => r.slice(1))));
    for (const map of program.maps) for (const cell of map) if (cell < 128) references.add(cell);
    for (const rule of program.rules) for (const p of rule.parts) if ((p.slot === 3 || p.slot === 4) && (p.kind === 2 || p.kind === 6)) references.add(p.params[0]);
    for (const e of program.extensions) if (e.kind === 1) references.add(e.params[2]);
    index = opaque(program) ? -1 : program.palette.findIndex((_, i) => !references.has(i));
    if (index < 0) index = program.palette.length;
    if (index >= (options.capabilities?.paletteMaximum ?? 128)) fail("The lighting palette is full. Reuse an existing colour.");
    program.palette[index] = {...colour};return index;
}
/** @param {Program} program @param {number} kind @param {number} id @param {Options} options */
function thingRecord(program, kind, id, options) {
    supported(options, "things", kind);
    const count = kind === 1 ? options.logicalLayers ?? 16 : kind === 2 ? 32 : 128;
    if (!Number.isInteger(id) || id < 0 || id >= count) fail("Choose a stored lighting identity.");
    let table = program.things.find(t => t.kind === kind);
    if (!table) {
        const slots = kind === 4 ? 3 + (options.tapDepth ?? 5) - 1 : 1;
        table = {kind, default: [kind === 1 ? 6 : 5, ...Array(slots).fill(255)], records: []};
        supported(options, "targets", table.default[0]);
        program.things.push(table);program.things.sort((a, b) => a.kind - b.kind);
    }
    while (table.records.length <= id) table.records.push(table.default.map(() => 254));
    return table.records[id];
}
/** @param {Uint8Array} bytes @param {import('../../contracts/edits.js').EditOf<'editLightingIdentity'>} edit @param {Options} options */
function editLightingIdentity(bytes, edit, options) {
    if (!["colour", "place", "outcome"].includes(edit.field)) fail("Choose an identity field.");
    const program = decodeLightingDomain(bytes, options), record = thingRecord(program, edit.kind, edit.id, options);
    if (edit.field === "outcome") {
        if (typeof edit.outcome !== "boolean") fail("Choose whether to colour by outcome.");
        if (edit.kind !== 4) fail("Colour by outcome belongs to behaviour feedback.");
        supported(options, "paints", 8);
        const condition = subjectCondition(program, edit.kind, edit.id, options);
        condition.params[1] = 12;
        const existing = program.rules.find(r => knownRule(r) && r.parts.some(p => p.slot === 3 && (p.kind === 8 || p.kind === 3)) && r.parts.some(p => p.slot === 0 && p.kind === condition.kind && p.params[0] === edit.id && p.params[1] === 12));
        if (existing) {const paint = existing.parts.find(p => p.slot === 3);if (paint) {paint.kind = edit.outcome ? 8 : 3;paint.params = [];}}
        else if (edit.outcome) {
            supported(options, "targets", 7);
            program.rules.unshift({flags: 0, brightness: 255, parts: [condition, {slot: 2, kind: 7, params: []}, {slot: 3, kind: 8, params: []}]});
        }
    } else if (edit.field === "place") {
        if (edit.place !== 254 && !LIGHTING_KINDS.targets[edit.place ?? -1]?.place) fail("Choose where this thing lights up.");
        if (edit.place !== 254) supported(options, "targets", /** @type {number} */ (edit.place));
        record[0] = /** @type {number} */ (edit.place);
    } else {
        if (!Number.isInteger(edit.slot) || edit.slot === undefined || edit.slot < 1 || edit.slot >= record.length) fail("Choose an identity colour slot.");
        const slot = /** @type {number} */ (edit.slot);
        // Detach this field first so its abandoned colour is eligible for reuse.
        record[slot] = 254;
        if (edit.colour !== "inherit" && edit.colour !== "clear") {
            if (!edit.colour) fail("Choose an identity colour.");
            record[slot] = paletteColour(program, edit.colour, options);
        } else record[slot] = edit.colour === "inherit" ? 254 : 255;
    }
    // The original parity facts use aggregate defaults. A named identity
    // needs a named subject rule to be visible on the keyboard.
    if (edit.kind === 3 || edit.kind === 4) {
        const condition = subjectCondition(program, edit.kind, edit.id, options);
        if (!program.rules.some(r => knownRule(r) && r.parts.some(p => JSON.stringify(p) === JSON.stringify(condition)) && r.parts.some(p => p.slot === 3 && p.kind === 3))) {
            supported(options, "targets", 7);supported(options, "paints", 3);
            const rule = {flags: 0, brightness: 255, parts: [condition, {slot: 2, kind: 7, params: []}, {slot: 3, kind: 3, params: []}]};
            let at = program.rules.findIndex(r => ruleBand(r) === (edit.kind === 3 ? "combos" : "feedback"));
            const own = program.rules.map((r, index) => r.parts.some(p => p.slot === 0 && p.kind === condition.kind && p.params[0] === edit.id) ? index : -1).filter(index => index >= 0);
            if (own.length) at = Math.max(...own) + 1;
            program.rules.splice(at < 0 ? 0 : at, 0, rule);
        }
    }
    return encodeLightingDomain(program, options);
}
/** @param {Program} program @param {number} kind @param {number} id @param {Options} options */
function subjectCondition(program, kind, id, options) {
    thingRecord(program, kind, id, options);
    // Named selectors for combo/behaviour are adopted with the phase 2 firmware.
    const fact = kind === 1 ? 1 : kind === 2 ? 3 : kind === 3 ? 7 : 8;
    supported(options, "facts", fact);
    return {slot: 0, kind: fact, params: kind === 4 ? [id, 15] : kind === 3 ? [id, 255] : [id]};
}
/** @param {Uint8Array} bytes @param {import('../../contracts/edits.js').EditOf<'paintLightingMap'>} edit @param {Options} options */
function paintLightingMap(bytes, edit, options) {
    const program = decodeLightingDomain(bytes, options);
    supported(options, "paints", 4);
    let index = edit.index, rule;
    if (index !== undefined) {
        rule = program.rules[index];
        if (!rule || edit.expectedRule !== ruleIdentity(rule)) fail("This lighting rule changed. Open its current paint before editing.");
        if (!knownRule(rule)) fail("This rule needs a newer Ark and is read-only.");
    } else {
        if (!edit.subject) fail("Choose a lighting rule or a thing to customise.");
        const condition = subjectCondition(program, edit.subject.kind, edit.subject.id, options);
        supported(options, "targets", 0);
        rule = {flags: 0, brightness: 255, parts: [condition, {slot: 2, kind: 0, params: []}, {slot: 3, kind: 0, params: []}]};
        const band = ruleBand(rule), bands = ["feedback", "combos", "modes", "preview", "layers", "base"];
        index = program.rules.findIndex(r => bands.indexOf(ruleBand(r)) >= bands.indexOf(band));
        if (index < 0) index = program.rules.length;
        program.rules.splice(index, 0, rule);
    }
    if (edit.target !== undefined) {
        supported(options, "targets", edit.target);
        if (LIGHTING_KINDS.targets[edit.target]?.parameters.length !== 0) fail("Choose a lighting area without parameters.");
        const target = rule.parts.find(p => p.slot === 2);if (target) {target.kind = edit.target;target.params = [];}
    }
    const paint = rule.parts.find(p => p.slot === 3);
    if (!paint) fail("This rule has no paint.");
    let cells = paint.kind === 4 ? [...program.maps[paint.params[0]]] : Array(58).fill(paint.kind === 2 ? paint.params[0] : [0, 1, 3, 8].includes(paint.kind) ? 128 + paint.kind : 128);
    if (edit.cells) {
        if (edit.cells.length !== 58) fail("A painted map must describe the whole board.");
        cells = [...edit.cells];
    }
    // Reuse the old map only if no other rule or opaque part can refer to it.
    const old = paint.kind === 4 ? paint.params[0] : -1;
    const shared = opaque(program) || program.rules.some(r => r !== rule && r.parts.some(p => (p.slot === 3 || p.slot === 4) && p.kind === 4 && p.params[0] === old)) || rule.parts.some(p => p !== paint && (p.slot === 3 || p.slot === 4) && p.kind === 4 && p.params[0] === old);
    if (old >= 0 && !shared) program.maps[old] = Array(58).fill(128);
    // Keep colours of unchanged cells alive during palette allocation.
    const changed = new Set(edit.leds ?? []);
    for (const led of changed) if (!Number.isInteger(led) || led < 0 || led >= 58) fail("Choose keys on this keyboard.");
    const at = old >= 0 && !shared ? old : program.maps.length;
    program.maps[at] = cells.map((c, led) => changed.has(led) ? 128 : c);
    if (changed.size) {
        if (edit.paint === undefined) fail("Choose a brush paint.");
        let value;
        if (typeof edit.paint === "number") {supported(options, "paints", edit.paint - 128);value = edit.paint;}
        else {supported(options, "paints", 2);value = paletteColour(program, edit.paint, options);}
        for (const led of changed) cells[led] = value;
    }
    const twin = program.maps.findIndex((m, i) => i !== at && m.every((c, led) => c === cells[led]));
    if (twin >= 0 && at === program.maps.length - 1 && at !== old) {program.maps.pop();paint.params = [twin];}
    else {program.maps[at] = cells;paint.params = [at];}
    paint.kind = 4;
    return encodeLightingDomain(program, options);
}
module.exports = {editLightingIdentity, paintLightingMap, paletteColour, subjectCondition};
