// @ts-check
import {DISCLOSURE, el, esc} from "../../lib/dom.mjs";
import {AXIS, BUTTON, MODIFIER_POLICY, TAP_ROWS, axisReads} from "../../view/pointing-config.mjs";
import {SCROLL_HELP} from "../../view/trackball.mjs";
import {modifierNames, pointingMacro} from "../../view/keyvalues.mjs";
import {word} from "../../view/vocabulary.mjs";
import {state} from "../../store.mjs";
import {ARROWS, SCROLL_RATIOS, SCROLL_SINGLES, scrollLabel, words} from "./common.mjs";

// Buttons 1–3 by what they usually do, as the keyboard numbers them.
const BUTTON_NAMES = ["1 · left click", "2 · right click", "3 · middle click"];

/** @typedef {ReturnType<typeof import("./form-controls.mjs").formControls>} FormControls */
/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../surface-types.js").PresentedSlot} slot @param {boolean} scrolling @param {FormControls} controls */
export function advancedControls(model, slot, scrolling, {form, disabled, field, select, shortcut, modifiers}) {
    // ── advanced ──────────────────────────────────────────────────────────
    const advanced = /** @type {HTMLDetailsElement} */ (el(`<details class="card pd-advanced" ${state.pdAdvanced ? "open" : ""}><summary class="card-h">
        ${DISCLOSURE}<h3>Advanced</h3><span class="right note">${scrolling ? "scroll tuning, " : "held modifiers, "}mouse buttons</span></summary>
        <div class="card-b stack"></div></details>`));
    const advancedBody = /** @type {HTMLElement} */ (advanced.querySelector(".card-b"));
    /** @param {string} title */
    const section = (title) => {
        const node = el(`<section class="pd-sect"><div class="sect-h"><h4>${esc(title)}</h4></div></section>`);
        advancedBody.append(node);
        return node;
    };

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
            for (const {key, group, name, label} of rows) {
                const tap = unfinished[key] || /** @type {import("../../../contracts/edits.js").PdTap} */ (slot[group]?.[name]);
                const prefix = group === "diagonals" ? "diag" : "dir";
                const macro = pointingMacro(model, tap.keycode);
                if (macro) {
                    table.append(el(`<span class="n">${ARROWS[name]} ${esc(label)}</span>`),
                        el(`<span class="note">${esc(word(words(model).modifierPolicy, MODIFIER_POLICY.INHERIT))}</span>`), el(`<span class="note">The macro continues after its trigger.</span>`));
                    continue;
                }
                const policy = select(`${label} with held modifiers`, words(model).modifierPolicy, tap.modifierPolicy ?? 0, `${prefix}Policy:${name}`,
                    {tip: "Inherit: modifiers you hold apply to the shortcut, so Shift with an arrow selects. Ignore: the modifiers chosen below are left out while it sends. Exact: it sends exactly its shortcut, whatever you hold."});
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
        // Every scroll field but the two per-wheel-step distances drawn above,
        // each with what it does, what it accepts, and room for the reason
        // the keyboard would refuse it.
        const tuning = el(`<div class="pd-grid3"></div>`);
        /** @param {string} key @param {string} [unit] */
        const single = (key, unit) => {
            const help = SCROLL_HELP[key];
            tuning.append(field(scrollLabel(model, key, unit), slot.scroll?.[key], `scroll:${key}`, {unit, tip: help?.help, hint: help?.range}));
        };
        for (const [key, unit] of SCROLL_SINGLES) single(key, unit);
        for (const [top, bottom] of SCROLL_RATIOS) {
            const label = scrollLabel(model, top).replace(/\s*·\s*numerator$/, "");
            const help = SCROLL_HELP[top];
            const pair = el(`<div class="field" data-problem-for="scroll:${esc(top)}"><span>${esc(label)}</span><div class="pd-ratio" data-tip="${esc(help?.help || "")}"></div>
                <span class="note">${esc(help?.range || "")}</span><span class="note pd-problem" data-problem role="alert" hidden></span></div>`);
            const inputs = /** @type {HTMLElement} */ (pair.querySelector(".pd-ratio"));
            for (const [index, key] of [top, bottom].entries()) {
                const input = /** @type {HTMLInputElement} */ (el(`<input data-f="pointing:${slot.id}:scroll:${esc(key)}" class="input mono" value="${esc(slot.scroll?.[key] ?? "")}" inputmode="numeric"
                    aria-label="${esc(`${label} ${index ? "denominator" : "numerator"}`)}" ${disabled}>`));
                form[`scroll:${key}`] = () => input.value;
                if (index) inputs.append(el(`<i>:</i>`));
                inputs.append(input);
            }
            tuning.append(pair);
        }
        section("Scroll tuning").append(tuning);
    }

    const buttons = section("Mouse button overrides");
    if ((slot.buttons || []).length) {
        // An override still being set up is drawn as chosen, not as stored.
        const unfinished = state.pdButtons?.slot === slot.id ? state.pdButtons.rows : {};
        const table = el(`<div class="pd-buttons"><span class="h">Button</span><span class="h">While this mode runs</span>
            <span class="h">Shortcut</span><span class="h">Held modifiers</span></div>`);
        (slot.buttons || []).forEach((stored, index) => {
            const button = unfinished[index] || stored;
            const name = BUTTON_NAMES[index] || `${index + 1}`;
            const kindSelect = select(`Button ${index + 1}`, words(model).buttons, button.kind, `button:${index}:kind`,
                {tip: "Pass through: the click works as usual. Block the click: it does nothing while this mode runs. Tap a shortcut or hold modifiers instead of clicking."});
            /** @type {HTMLElement} */ (kindSelect.querySelector("span")).classList.add("sr");
            const tapping = button.kind === BUTTON.TAP, holding = button.kind === BUTTON.HOLD_MODIFIERS;
            const tap = tapping
                ? shortcut(`Button ${index + 1} shortcut`, button.tap?.keycode, `button:${index}:tap`,
                    typeof button.tap?.keycode === "string" ? {name: button.tap.keycode === "0" ? "" : button.tap.keycode} : {})
                : el(`<span class="note blank">—</span>`);
            tap.querySelector?.(":scope > span")?.classList.add("sr");
            const macro = tapping ? pointingMacro(model, button.tap?.keycode) : null;
            // A tapped shortcut keeps its own handling of held modifiers, as a
            // direction's does: Inherit, Ignore the chosen ones, or Exact.
            let held;
            if (tapping && !macro) {
                held = select(`Button ${index + 1} with held modifiers`, words(model).modifierPolicy, button.tap?.modifierPolicy ?? 0, `button:${index}:policy`,
                    {tip: "Inherit: modifiers you hold apply to the shortcut. Ignore: the modifiers chosen below are left out. Exact: it sends exactly its shortcut, whatever you hold."});
                /** @type {HTMLElement} */ (held.querySelector("span")).classList.add("sr");
            } else {
                const text = macro ? `${word(words(model).modifierPolicy, MODIFIER_POLICY.INHERIT)} · the macro continues after its trigger` : holding ? modifierNames(model, button.modifiers).join(", ") || "choose at least one below" : "—";
                held = el(`<span class="note"><span class="narrow">Held modifiers: </span>${esc(text)}</span>`);
            }
            table.append(el(`<span class="n">${esc(name)}</span>`), kindSelect, tap, held);
            if (holding) {
                const mods = modifiers(`Button ${index + 1} holds`, button.modifiers ?? 0, `button:${index}:modifiers`);
                mods.classList.add("mods");
                table.append(mods);
            }
            if (tapping && !macro && button.tap?.modifierPolicy === MODIFIER_POLICY.MASK) {
                const mods = modifiers(`Button ${index + 1} leaves out`, button.tap?.mask ?? 0, `button:${index}:mask`);
                mods.classList.add("mods");
                table.append(mods);
            }
        });
        buttons.append(table);
    } else {
        buttons.append(el(`<p class="note">This slot stores no button overrides.</p>`));
    }

    // Open stays open from slot to slot, so two modes' tuning can be compared.
    advanced.addEventListener("toggle", () => {
        state.pdAdvanced = advanced.open;
    });

    return advanced;
}
