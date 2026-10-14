// @ts-check
"use strict";
const {knownRule, ruleIdentity} = require("./lighting-editor");
const {layerName} = require("./vocabulary");
/** @param {import('./types.js').DecodedProfile} decoded @param {import('./types.js').ProfileDestination} destination @param {import('../../contracts/model.js').Finding[]} [reach] @returns {import('../../contracts/model.js').Finding[]} */
function lightingFindings(decoded, destination, reach = []) {
    const program = decoded.rgb;
    /** @type {import('../../contracts/model.js').Finding[]} */ const findings = [];
    /** @param {string} kind @param {string} identity @param {string} title @param {string} detail @param {string} fix */
    const warn = (kind, identity, title, detail, fix) => findings.push({kind, level: "warning", layers: [], identity, title, detail, fix, place: {kind: "lighting"}});
    const budget = destination.lighting?.payloadBudget ?? 8192;
    if ((program.byteLength ?? 0) >= budget * .9) warn("lightingMemory", String(program.byteLength), "Lighting memory is nearly full", `${program.byteLength} of ${budget} bytes are used. Maps, colours and rules share this space.`, "Reuse a look or remove lighting you no longer need.");
    const unknown = program.rules.filter(r => !knownRule(r)).length;
    if (unknown) warn("unknownLighting", String(unknown), "Some lighting needs a newer Ark", `${unknown} rule${unknown === 1 ? " is" : "s are"} read-only and will stay unchanged in Apply and backups.`, "Use a newer Ark to edit those rules.");
    const max = destination.brightnessMax;
    if (max !== undefined && program.palette.some(c => c.v > max)) findings.push({kind: "lightingBrightness", level: "blocker", layers: [], identity: String(max), title: "A lighting colour exceeds the keyboard's brightness limit", detail: `The keyboard accepts a value of ${max} or less.`, fix: "Lower the colour's brightness.", place: {kind: "lighting"}});
    // Screen HSV distance is advice, never an assertion about measured LEDs.
    // Compare distinct customised identities and layers/modes, not every empty
    // slot inheriting an intentionally shared board feedback colour.
    /** @type {{name: string; ref: number; kind: number; id: number; slot: number}[]} */ const identities = [];
    for (const t of program.things) t.records.forEach((r, id) => {
        if ((t.kind === 3 || t.kind === 4) && r.slice(1).every(n => n === 254)) return;
        if (t.kind === 2 && !decoded.pdModes.some(m => m.id === id && m.kind)) return;
        const name = t.kind === 1 ? layerName(decoded.settings.names, id) : t.kind === 2 ? decoded.pdModes.find(m => m.id === id)?.name || `Pointing mode ${id + 1}` : t.kind === 3 ? `Combo ${id + 1}` : `Behaviour ${id + 1}`;
        for (let slot = 1; slot < r.length; slot++) {
            if (t.kind >= 3 && r[slot] === 254) continue;
            const ref = r[slot] === 254 ? t.default[slot] : r[slot];
            if (ref === 255 || !program.palette[ref]?.v) continue;
            const label = t.kind === 4 ? ` · ${["hold", "long hold", "tap", ...Array.from({length: r.length - 4}, (_, i) => `${i + 2} taps`)][slot - 1]}` : "";
            identities.push({name: name + label, ref, kind: t.kind, id, slot});
        }
    });
    for (let a = 0; a < identities.length; a++) for (let b = a + 1; b < identities.length; b++) {
        const left = identities[a], right = identities[b], c = program.palette[left.ref], d = program.palette[right.ref];
        const hue = Math.min(Math.abs(c.h - d.h), 256 - Math.abs(c.h - d.h));
        if ((hue <= 9 || Math.max(c.s, d.s) < 24) && Math.abs(c.s - d.s) <= 24 && Math.abs(c.v - d.v) <= 24) warn("similarLighting", `${left.kind}:${left.id}:${left.slot}:${right.kind}:${right.id}:${right.slot}:${left.ref}:${right.ref}`, `${left.name} and ${right.name} have similar colours`, "These identities may be hard to tell apart on the LEDs. This is colour advice; the screen cannot predict your LEDs exactly.", "Choose more distinct hues or brightnesses, or keep them if the shared colour is intentional.");
    }
    const unreachableLayers = new Set(reach.filter(f => f.kind === "unreachable").flatMap(f => f.layers));
    const unreachableCombos = new Set(reach.filter(f => f.kind === "unreachableCombo" && f.place?.kind === "combo").map(f => f.place && "index" in f.place ? f.place.index : -1));
    program.rules.forEach((rule, index) => {
        if (rule.flags & 1 || !knownRule(rule)) return;
        const condition = rule.parts.filter(p => p.slot < 2), target = rule.parts.find(p => p.slot === 2), paint = rule.parts.find(p => p.slot === 3);
        if (condition.some(p => (p.kind === 1 || p.kind === 2) && p.params[0] !== 255 && !decoded.document.layers[p.params[0]])) warn("unreachableLighting", ruleIdentity(rule), `Rule ${index + 1} names an unavailable layer`, "This condition cannot occur in the current profile.", "Choose an existing layer or remove the rule.");
        const never = condition.find(p => p.slot === 0 && ((p.kind === 1 || p.kind === 2) && unreachableLayers.has(p.params[0]) || p.kind === 7 && unreachableCombos.has(p.params[0])));
        if (never) warn("unreachableLighting", ruleIdentity(rule), `Rule ${index + 1} has a condition that cannot occur`, "The profile's reachability checks cannot reach the layer or fire the combo this rule needs.", "Fix its keys or participation, or remove this lighting rule.");
        // Prove only simple opaque coverage; maps, identities, relative
        // targets, timings and unknown kinds cannot establish total coverage.
        const hidden = program.rules.slice(0, index).find(above => {
            if (above.flags & 1 || !knownRule(above) || above.parts.some(p => p.slot >= 4)) return false;
            const conditions = above.parts.filter(p => p.slot < 2), area = above.parts.find(p => p.slot === 2), fill = above.parts.find(p => p.slot === 3);
            const covers = area?.kind === 0 || area && [1, 2, 3].includes(area.kind) && JSON.stringify(area) === JSON.stringify(target);
            return covers && (fill?.kind === 1 || fill?.kind === 2) && conditions.every(p => condition.some(c => JSON.stringify(c) === JSON.stringify(p)));
        });
        if (hidden && paint?.kind !== 0) warn("hiddenLighting", ruleIdentity(rule), `Rule ${index + 1} is covered by a higher rule`, "Whenever this rule could paint, a higher rule already covers its lighting area.", "Move this rule higher or narrow the rule that covers it.");
    });
    return findings;
}
module.exports = {lightingFindings};
