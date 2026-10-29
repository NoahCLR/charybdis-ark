// @ts-check
import {DISCLOSURE, el, esc} from "../../lib/dom.mjs";
import {AXIS, MODIFIER_POLICY, SCROLL_FIELDS, TAP_ROWS, axisReads, modeDpi, modifierPolicyTip, readsHorizontal, readsVertical, tapPlaceWord, thresholdDistance} from "../../view/pointing-config.mjs";
import {modifierNames, pointingMacro} from "../../view/keyvalues.mjs";
import {word} from "../../view/vocabulary.mjs";
import {state} from "../../store.mjs";
import {ARROWS, SCROLL_LEAD, SCROLL_RATIOS, SCROLL_SINGLES, scrollLabel, words} from "./common.mjs";

/** @typedef {ReturnType<typeof import("./form-controls.mjs").formControls>} FormControls */
/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../surface-types.js").PresentedSlot} slot @param {boolean} scrolling @param {FormControls} controls */
export function advancedControls(model, slot, scrolling, {form, disabled, field, select, modifiers}) {
    // ── advanced ──────────────────────────────────────────────────────────
    const advanced = /** @type {HTMLDetailsElement} */ (el(`<details class="card pd-advanced" ${state.pdAdvanced ? "open" : ""}><summary class="card-h">
        ${DISCLOSURE}<h3>Advanced</h3><span class="right note">thresholds, ratios, held modifiers</span></summary>
        <div class="card-b stack"></div></details>`));
    const advancedBody = /** @type {HTMLElement} */ (advanced.querySelector(".card-b"));
    /** @param {string} title */
    const section = (title) => {
        const node = el(`<section class="pd-sect"><div class="sect-h"><h4>${esc(title)}</h4></div></section>`);
        advancedBody.append(node);
        return node;
    };

    const behaviour = el(`<div class="pd-grid3"></div>`);
    behaviour.append(select("After this mode ends", words(model).pointerLayer, slot.pointerLayer, "pointerLayer"));
    if (!scrolling) {
        // An axis the mode does not read has no threshold to set. Sending
        // once per movement, the threshold is how far a movement has to go.
        const per = word(words(model).directionStep, slot.directionOutput);
        const dpi = modeDpi(slot, model.configDefaults);
        /** @param {number} counts */
        const distance = (counts) => {
            const shown = thresholdDistance(counts, dpi);
            return shown ? {unit: shown.short, wide: true, tip: shown.long} : {tip: "Sensor counts at this mode's pointer speed."};
        };
        if (readsHorizontal(slot.axis)) behaviour.append(field(`Horizontal ${per}`, slot.thresholdX, "thresholdX", distance(slot.thresholdX)));
        if (readsVertical(slot.axis)) behaviour.append(field(`Vertical ${per}`, slot.thresholdY, "thresholdY", distance(slot.thresholdY)));
    }
    section("Behaviour").append(behaviour);

    if (!scrolling) {
        // Each shortcut's own handling of modifiers held while it sends. A
        // direction with no shortcut stores none, so only those with one
        // are listed; an "Ignore" still being set up is drawn as chosen.
        const mods = section("Held modifiers");
        const unfinished = state.pdTaps?.slot === slot.id ? state.pdTaps.rows : {};
        const rows = TAP_ROWS.filter(({group, name}) => (group === "diagonals" ? slot.axis === AXIS.EIGHT : axisReads(slot.axis).includes(name))
            && Number(slot[group]?.[name]?.keycode));
        if (rows.length) {
            const table = el(`<div class="pd-taps"><span class="h">Direction</span><span class="h">While modifiers are held</span><span class="h">Left out</span></div>`);
            for (const {key, group, name} of rows) {
                const label = tapPlaceWord(model, group, name);
                const tap = unfinished[key] || /** @type {import("../../../contracts/edits.js").PdTap} */ (slot[group]?.[name]);
                const prefix = group === "diagonals" ? "diag" : "dir";
                const macro = pointingMacro(model, tap.keycode);
                if (macro) {
                    table.append(el(`<span class="n">${ARROWS[name]} ${esc(label)}</span>`),
                        el(`<span class="note">${esc(word(words(model).modifierPolicy, MODIFIER_POLICY.INHERIT))}</span>`), el(`<span class="note">The macro continues after its trigger.</span>`));
                    continue;
                }
                const policy = select(`${label} with held modifiers`, words(model).modifierPolicy, tap.modifierPolicy ?? 0, `${prefix}Policy:${name}`,
                    {tip: modifierPolicyTip(model)});
                /** @type {HTMLElement} */ (policy.querySelector("span")).classList.add("sr");
                const masking = tap.modifierPolicy === MODIFIER_POLICY.MASK;
                const left = masking ? modifierNames(model, tap.mask).join(", ") || "choose at least one below" : "—";
                table.append(el(`<span class="n">${ARROWS[name]} ${esc(label)}</span>`), policy, el(`<span class="note">${esc(left)}</span>`));
                if (masking) {
                    const grid = modifiers(`${label} leaves out`, tap.mask ?? 0, `${prefix}Mask:${name}`);
                    grid.classList.add("mods");
                    table.append(grid);
                }
            }
            mods.append(table);
        } else {
            mods.append(el(`<p class="note">Give a direction a shortcut to choose what held modifiers do to it.</p>`));
        }
    }

    if (scrolling) {
        const tuning = el(`<div class="pd-grid3"></div>`);
        const drawn = new Set(SCROLL_LEAD.map(([key]) => key));
        for (const [key, unit] of SCROLL_SINGLES) {
            tuning.append(field(scrollLabel(model, key, unit), slot.scroll?.[key], `scroll:${key}`, {unit}));
            drawn.add(key);
        }
        for (const [top, bottom] of SCROLL_RATIOS) {
            const label = scrollLabel(model, top).replace(/\s*·\s*numerator$/, "");
            const pair = el(`<div class="field"><span>${esc(label)}</span><div class="pd-ratio"></div></div>`);
            const inputs = /** @type {HTMLElement} */ (pair.querySelector(".pd-ratio"));
            for (const [index, key] of [top, bottom].entries()) {
                const input = /** @type {HTMLInputElement} */ (el(`<input data-f="pointing:${esc(slot.id)}:scroll:${esc(key)}" class="input mono" value="${esc(slot.scroll?.[key] ?? "")}" inputmode="numeric"
                    aria-label="${esc(`${label} ${index ? "denominator" : "numerator"}`)}" ${esc(disabled)}>`));
                form[`scroll:${key}`] = () => input.value;
                if (index) inputs.append(el(`<i>:</i>`));
                inputs.append(input);
                drawn.add(key);
            }
            tuning.append(pair);
        }
        // Anything the record gains later is still drawn, once.
        for (const [key] of SCROLL_FIELDS) {
            const label = scrollLabel(model, key);
            if (!drawn.has(key)) tuning.append(field(label, slot.scroll?.[key], `scroll:${key}`));
        }
        section("Scroll tuning").append(tuning);
    }

    // Open stays open from slot to slot, so two modes' tuning can be compared.
    advanced.addEventListener("toggle", () => {
        state.pdAdvanced = advanced.open;
    });

    return advanced;
}
