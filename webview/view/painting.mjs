// @ts-check
import {LED_INDEX} from "./geometry.mjs";
import {keyMeaning, keyFace} from "./keyface.mjs";
/** @typedef {import('../../contracts/lighting.js').LightingSubject} Subject */
/** @param {import('../../contracts/panel.js').PublishedModel | null | undefined} model @param {Subject} subject @param {number} [slot] */
export function identityValue(model, subject, slot = 1) {
    const p = model?.rgb?.lighting?.program, t = p?.things.find(t => t.kind === subject.kind);
    const r = t?.records[subject.id], stored = r?.[slot] ?? 254, index = stored === 254 ? t?.default[slot] : stored;
    const place = r?.[0] === 254 || r?.[0] === undefined ? t?.default[0] : r[0];
    return {colour: p?.palette[index ?? -1] ?? null, inherited: stored === 254, place, placeInherited: r?.[0] === undefined || r[0] === 254};
}
/** @param {import('../../contracts/panel.js').PublishedModel | null | undefined} model @param {Subject} subject */
export function subjectRules(model, subject) {
    return (model?.rgb?.lighting?.rules ?? []).flatMap(rule => {
        const parts = model?.rgb?.lighting?.program.rules[rule.index]?.parts ?? [];
        const first = parts.find(p => p.slot === 0);
        if (!first) return [];
        const fact = subject.kind === 1 ? [1, 2] : subject.kind === 2 ? [3] : subject.kind === 3 ? [4, 7] : [5, 8];
        if (!fact.includes(first.kind)) return [];
        const aggregate = first.kind === 4 || first.kind === 5;
        if (!aggregate && first.params[0] !== 255 && first.params[0] !== subject.id) return [];
        return [{...rule, inherited: aggregate || first.params[0] === 255}];
    });
}
/** @param {import('../../contracts/panel.js').PublishedModel | null | undefined} model @param {Subject} subject */
export function canPaintSubject(model, subject) {
    const lighting = model?.rgb?.lighting, fact = subject.kind === 1 ? 1 : subject.kind === 2 ? 3 : subject.kind === 3 ? 7 : 8;
    return Boolean(lighting?.supportedThings.includes(subject.kind) && lighting.supportedFacts.includes(fact) && lighting.supportedPaints.includes(4) && lighting.supportedTargets.includes(0));
}
/** @param {import('../../contracts/panel.js').PublishedModel | null | undefined} model @param {Subject} subject */
export function canCustomiseIdentity(model, subject) {
    const lighting = model?.rgb?.lighting;
    return Boolean(lighting?.supportedThings.includes(subject.kind) && (subject.kind < 3 ||
        lighting.supportedFacts.includes(subject.kind === 3 ? 7 : 8) && lighting.supportedPaints.includes(3) && lighting.supportedTargets.includes(7)));
}
/** @param {import('../../contracts/panel.js').Layer | undefined} layer @param {string} query @param {import("../../contracts/panel.js").PublishedModel | null} [model] */
export function selectPaintKeys(layer, query, model) {
    return (layer?.positions ?? []).filter(p => {
        const meaning = keyMeaning(p);
        if (query === "mapped") return !["disabled", "transparent"].includes(keyFace(p).kind);
        if (query === "transparent") return keyFace(p).kind === "transparent";
        if (query === "unused") return keyFace(p).kind === "disabled";
        if (query === "letters") return /^KC_[A-Z]$/.test(meaning);
        if (query === "numbers") return /^KC_[0-9]$/.test(meaning);
        if (query === "modifiers") return /^KC_((L|R)(CTL|SFT|ALT|GUI)|(LEFT|RIGHT)_(CTRL|SHIFT|ALT|GUI))$/.test(meaning);
        if (query === "symbols") return /^KC_(MINS|MINUS|EQL|EQUAL|LBRC|LEFT_BRACKET|RBRC|RIGHT_BRACKET|BSLS|BACKSLASH|SCLN|SEMICOLON|QUOT|QUOTE|GRV|GRAVE|COMM|COMMA|DOT|SLASH|SLSH)$/.test(meaning);
        if (query === "navigation") return /^KC_(LEFT|RIGHT|UP|DOWN|HOME|END|PGUP|PGDN|PAGE_UP|PAGE_DOWN|INS|INSERT|DEL|DELETE)$/.test(meaning);
        if (query === "media") return /^KC_(MUTE|VOLU|VOLD|AUDIO_|MEDIA_|MPLY|MNXT|MPRV)/.test(meaning);
        if (query === "mouse") return /^KC_(MS_|MOUSE_|WH_|BTN|BUTTON)/.test(meaning);
        if (query === "behaviours") return Boolean(model?.keyBehaviors.some(row => row.keycode === meaning));
        if (query === "combos") return Boolean(model?.combos.some(combo => combo.inputs.includes(meaning)));
        if (query === "layers") return /^(MO|TG|TO|LT|TT|OSL|DF)\(/.test(meaning);
        if (query === "pointing") return /^PD_SLOT_/.test(meaning);
        if (query === "macros") return /^VIA_MACRO_/.test(meaning);
        return false;
    }).map(p => LED_INDEX[p.layoutIndex]).filter(n => n !== undefined);
}
// LEDs follow a serpentine wiring order. Mirror by physical position, never
// by adding 29. The asymmetrical extra thumb and trackball keep their paint.
export const MIRROR_LEDS = (() => {
    /** @type {Record<number, number>} */ const pairs = {};
    for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) {
        const left = LED_INDEX[row * 12 + col], right = LED_INDEX[row * 12 + 11 - col];pairs[left] = right;pairs[right] = left;
    }
    for (const [left, right] of [[49, 52], [50, 51], [54, 55]]) {pairs[LED_INDEX[left]] = LED_INDEX[right];pairs[LED_INDEX[right]] = LED_INDEX[left];}
    return pairs;
})();
/** @param {number[]} cells @param {'left' | 'right'} from */
export function mirrorMap(cells, from) {
    const result = [...cells];
    for (const [led, other] of Object.entries(MIRROR_LEDS)) if (from === "left" ? Number(led) < 29 : Number(led) >= 29) result[other] = cells[Number(led)];
    return result;
}
/** @param {import('../../contracts/panel.js').PublishedModel | null | undefined} model @param {number | undefined} index */
export function paintedCells(model, index) {
    const program = model?.rgb?.lighting?.program, rule = index === undefined ? undefined : program?.rules[index];
    const paint = rule?.parts.find(p => p.slot === 3);
    if (paint?.kind === 4) return program?.maps[paint.params[0]] ?? Array(58).fill(128);
    const cell = paint?.kind === 2 ? paint.params[0] : paint && [0, 1, 3, 8].includes(paint.kind) ? 128 + paint.kind : 128;
    return Array(58).fill(cell);
}

/** @param {import('../../contracts/panel.js').PublishedModel | null} model @param {number} id */
export function copyLayerCells(model, id) {
    const lighting = model?.rgb?.lighting, program = lighting?.program;
    const colour = identityValue(model, {kind: 1, id}).colour;
    const ref = colour ? program?.palette.findIndex(c => c.h === colour.h && c.s === colour.s && c.v === colour.v) ?? -1 : -1;
    const index = program?.rules.findIndex((r, index) => !lighting?.rules[index]?.readOnly && r.parts.some(p => p.slot === 0 && p.kind === 1 && p.params[0] === id) && r.parts.some(p => p.slot === 3 && p.kind === 4));
    const paint = index === undefined || index < 0 ? undefined : program?.rules[index]?.parts.find(p => p.slot === 3);
    if (paint) return (program?.maps[paint.params[0]] ?? Array(58).fill(128)).map(c => c === 131 ? ref < 0 ? 128 : ref : c === 136 ? 128 : c);
    const selected = new Set(selectPaintKeys(model?.layers.find(l => l.index === id), "mapped", model));
    return Array.from({length: 58}, (_, led) => selected.has(led) && ref >= 0 ? ref : 128);
}
