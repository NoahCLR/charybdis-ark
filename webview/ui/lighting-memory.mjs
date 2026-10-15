// @ts-check
import {el, esc} from "../lib/dom.mjs";
import {lightingMemory} from "../view/lighting.mjs";
/** @param {import('../../contracts/panel.js').PublishedModel} model */
export function lightingMemoryCard(model) {
    const memory = lightingMemory(model);
    if (!memory) return null;
    const working = model.rgb.lighting?.working;
    return el(`<section class="lighting-memory" aria-label="Lighting memory">
        <div class="sect-h"><h4>Lighting memory</h4><span class="right note">${esc(memory.used.toLocaleString())} of ${esc(memory.capacity.toLocaleString())} bytes · 8 KiB</span></div>
        <div class="meter ${memory.near ? "near" : ""}" role="meter" aria-label="Lighting memory used" aria-valuenow="${memory.used}" aria-valuemin="0" aria-valuemax="${memory.capacity}"><i style="width:${memory.percent}%"></i></div>
        <p class="note meter-note">${esc(memory.near ? "Lighting memory is nearly full. New colours and rules may not fit; remove unused rules to make room." : `${memory.free.toLocaleString()} bytes free. Colours, identities, key sets, maps and rules share this budget.`)}</p>
        ${working && (working.required === null || working.required > 0) ? `<div class="lighting-working-memory"><h4>Working memory for flashes and linger</h4><p class="${working.admitted ? "note" : "callout"}">${esc(working.reason || `${working.required?.toLocaleString()} bytes needed · ${working.capacity?.toLocaleString()} available.${working.admitted ? "" : " These rules cannot run yet. Turn off a timed rule or choose a named thing instead of Any."}`)}</p><p class="note">This is separate from saved lighting. Each enabled flash or linger reserves space for all of its possible matches.</p>${working.contributors.length ? `<details><summary>What uses this memory</summary>${working.contributors.map(c => `<p class="note">Rule ${c.index + 1}: ${c.identities} possible things · ${c.members} keys per thing · ${c.bank} bytes in each copy.</p>`).join("")}</details>` : ""}</div>` : ""}
        ${memory.unknown ? `<p class="note">${memory.unknown} rule${memory.unknown === 1 ? " needs" : "s need"} a newer Ark. Kept unchanged in Apply and backups.</p>` : ""}
    </section>`);
}
