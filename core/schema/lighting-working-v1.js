// @ts-check
"use strict";
const {LIGHTING_KINDS} = require("./lighting-kinds-v1");
// Admission is separate from decoding: an imported over-budget program remains
// a complete, byte-preserved draft that can be repaired before activation.
/** @param {import('./lighting-types.js').LightingProfile} program @param {import('./lighting-types.js').LightingWorkingCapabilities} [working] @returns {import('../../contracts/lighting.js').LightingWorkingCost} */
function lightingWorkingCost(program, working) {
    const unknown = (/** @type {string} */ reason) => ({required: null, bank: null, maximum: null, admitted: false, contributors: [], capacity: working?.capacity, reason});
    // An open timing registry may contain a future allocator. Classify every
    // enabled timing before the zero-cost shortcut, without decoding its bytes.
    if (program.rules.some(r => !(r.flags & 1) && r.parts.some(p => p.slot === 5 && !["any", "stateTail", "eventWindow"].includes(LIGHTING_KINDS.timings[p.kind]?.construction ?? "")))) return unknown("An enabled rule has timing that needs a newer Ark. Its working-memory cost is unknown; keep the backup and use a newer Ark before activating it.");
    const rows = program.rules.flatMap((r, index) => !(r.flags & 1) && r.parts.some(p => p.slot === 5 && ["stateTail", "eventWindow"].includes(LIGHTING_KINDS.timings[p.kind]?.construction ?? "")) ? [{rule: r, index}] : []);
    if (!rows.length) return {required: 0, bank: 0, maximum: 0, admitted: true, contributors: [], capacity: working?.capacity};
    if (!working || working.model !== 1) return unknown("The keyboard has not reported a supported working-memory model for flashes and linger.");
    if (working.descriptorBytes !== 12 || working.slotHeaderBytes !== 12 || working.memberBase !== 5 || working.alignment !== 4 || !Number.isInteger(working.ownerBytes) || working.ownerBytes < 1 || working.ownerBytes > 32 || !Number.isInteger(working.capacity) || working.capacity < 0 || working.capacity > 65535) return unknown("The keyboard's working-memory layout is not supported.");
    let bank = 0, maximum = 0;
    const contributors = [];
    // Match firmware checked u32 arithmetic, including direct callers passing
    // malformed metadata. No occupancy, duration, filter or sharing discount.
    const checked = (/** @type {number} */ n) => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff;
    for (const {rule, index} of rows) {
        const first = rule.parts[0];let identities = 1, members = 1;
        if (first.slot === 0) {
            const m = working.modules[first.kind];
            if (!m || ![m.domain, m.maximumMembers].every(n => Number.isInteger(n) && n >= 1 && n <= 255) || m.selectorParameter !== 255 && (!Number.isInteger(m.selectorParameter) || m.selectorParameter < 0 || m.selectorParameter >= first.params.length)) return unknown(`Working-memory bounds are unavailable for rule ${index + 1}.`);
            identities = m.selectorParameter !== 255 && first.params[m.selectorParameter] !== 255 ? 1 : m.domain;
            members = m.maximumMembers;
        }
        const raw = 12 + members * (5 + working.ownerBytes), slot = Math.ceil(raw / 4) * 4;
        const bytes = 12 + identities * slot;
        if (![raw, slot, bytes, bank + bytes, 2 * (bank + bytes) + Math.max(maximum, slot)].every(checked)) return unknown("Lighting working-memory arithmetic overflowed.");
        bank += bytes;maximum = Math.max(maximum, slot);contributors.push({index, identities, members, slot, bank: bytes});
    }
    const required = 2 * bank + maximum;
    return {required, bank, maximum, capacity: working.capacity, admitted: required <= working.capacity, contributors};
}
module.exports = {lightingWorkingCost};
