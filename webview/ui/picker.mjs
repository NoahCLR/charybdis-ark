// The keycode picker: a real keyboard first, then the sections this keyboard
// actually has — its layers, its pointing slots, its macro banks — and the
// vendored QMK catalogue behind a search.

import {el, esc} from "../lib/dom.mjs";
import {getModel, layerName, layers, post, render, state} from "../store.mjs";
import {actionLabel} from "../view/keyface.mjs";
import {PICKER_BOARD, pickerBoardKey} from "../view/picker-board.mjs";
import {pickerExpression} from "../view/edits.mjs";
import {entriesForPickerSection, pickable, pickerSections} from "../view/picker-sections.mjs";
import {macroMatches} from "../view/macro.mjs";
import {vocabulary, word} from "../view/vocabulary.mjs";

const modifierControls = model => vocabulary(model).pickerModifiers || [];

export function openPicker({title, context, contextKeycode, seed = [], mode = "single", allowedKeys = null, maxKeys = Infinity, onPick}) {
    const keys = allowedKeys ? seed.map(key => getModel()?.qmkKeycodeAliases?.[key] || key) : seed.slice();
    state.picker = {title, context, contextKeycode, mode, allowedKeys, maxKeys, section: "board", search: "", mods: [], keys, layerTap: null, onPick};
    render();
}

// Layer keycodes are posted by index — MO(1), LOCK_LAYER(1), LT(1, KC_A) —
// the form the keyboard reports and the draft encodes; the name is display.
const layerTapName = (index) => layerName(layers()[Number(index)]) || `Layer ${index}`;

export const closePicker = () => { state.picker = null; render(); };

const pickValue = (value) => state.picker.allowedKeys ? getModel()?.qmkKeycodeAliases?.[value] || value : value;
const allowed = (value) => !state.picker.allowedKeys || state.picker.allowedKeys.includes(value);
const sections = (model) => pickerSections().filter(section => !state.picker.allowedKeys || section.kind === "board"
    || entriesForPickerSection(model?.qmkKeycodes || [], section).some(entry => allowed(entry.value)));

const expression = () => state.picker ? pickerExpression(state.picker) : "";

const chunk = (values, size) => values.reduce((rows, value, index) =>
    (index % size ? rows[rows.length - 1].push(value) : rows.push([value]), rows), []);

function keyButton(entry, picked) {
    return `<button class="pk ${picked ? "on" : ""}" data-pick="${esc(entry.value)}">
        <span class="l">${esc(entry.label || entry.value)}</span><span class="c">${esc(entry.value)}</span></button>`;
}

// A macro slot shows by its name when it has one, with its slot and size
// underneath, so a named macro is recognisable wherever it is offered.
function macroButton(slot, picked) {
    return `<button class="pk ${slot.name ? "wide" : ""} ${picked ? "on" : ""}" data-pick="${esc(slot.keycode)}" data-tip="${esc(slot.keycode)}">
        <span class="l">${esc(slot.name || slot.keycode.replace(/^VIA_MACRO_/, "M"))}</span>
        <span class="c">${slot.name ? `M${esc(slot.keycode.split("_").at(-1))} · ` : ""}${slot.empty ? "empty" : `${slot.bytes} B`}</span></button>`;
}

function sectionBody(model) {
    const picker = state.picker;
    const catalogue = model?.qmkKeycodes || [];
    const picked = (value) => picker.keys.includes(pickValue(value));

    if (picker.search) {
        const query = picker.search.toLowerCase();
        const macros = (model?.viaMacros || []).filter((slot) => allowed(slot.keycode) && macroMatches(slot, query));
        const matches = catalogue.filter((entry) => allowed(entry.value) && pickable(entry)
            && (entry.search?.includes(query) || entry.value.toLowerCase().includes(query))).slice(0, 64);
        if (!matches.length && !macros.length) return `<p class="note" style="padding:18px">Nothing in the keyboard's catalogue or macros matches “${esc(picker.search)}”.</p>`;
        const count = matches.length + macros.length;
        return `<div class="pk-body"><p class="note" style="margin-bottom:10px">${count} match${count === 1 ? "" : "es"}</p>
            ${macros.length ? `<div class="label" style="margin-bottom:6px">Macros</div>
                <div class="pk-rows" style="margin-bottom:12px">${chunk(macros, 8).map((row) => `<div class="pk-row">${row.map((slot) => macroButton(slot, picked(slot.keycode))).join("")}</div>`).join("")}</div>` : ""}
            ${matches.length ? `${macros.length ? `<div class="label" style="margin-bottom:6px">Keycodes</div>` : ""}
                <div class="pk-rows">${chunk(matches, 8).map((row) => `<div class="pk-row">${row.map((entry) => keyButton(entry, picked(entry.value))).join("")}</div>`).join("")}</div>` : ""}</div>`;
    }

    const section = sections(model).find((entry) => entry.id === picker.section) || sections(model)[0];
    if (section.kind === "board") {
        const keys = PICKER_BOARD.keys.filter(source => allowed(source.value)).map((source) => {
            const spoken = model?.qmkKeyLabels?.[source.value];
            // The host layout's legends replace the ANSI board's, so a German
            // board reads Z where QMK says KC_Y; the key it stores is unchanged.
            const key = pickerBoardKey(source, model);
            const on = picked(key.value);
            const shifted = key.labels[1] && key.labels[1].length <= 3;
            const extra = key.labels[2] || key.labels[3];
            return `<g class="pkb-key ${on ? "on" : ""}" data-pick="${esc(key.value)}" tabindex="0" role="button" aria-label="${esc(spoken || key.value)}">
                <rect x="${key.x}" y="${key.y}" width="${key.w}" height="${key.h}" rx="8"></rect>
                ${extra
                    ? key.labels.map((label, index) => label ? `<text class="${index === 0 ? `pkb-main ${label.length > 1 ? "sm" : ""}` : "pkb-alt"}" x="${key.x + key.w * (index < 2 ? 0.26 : 0.74)}" y="${key.y + key.h * (index % 2 ? 0.36 : 0.74)}">${esc(label)}</text>` : "").join("")
                    : shifted
                    ? `<text class="pkb-alt" x="${key.x + key.w / 2}" y="${key.y + key.h * 0.36}">${esc(key.labels[1])}</text>
                       <text class="pkb-main" x="${key.x + key.w / 2}" y="${key.y + key.h * 0.74}">${esc(key.labels[0])}</text>`
                    : `<text class="pkb-main ${key.labels[0].length > 4 ? "sm" : ""}" x="${key.x + key.w / 2}" y="${key.y + key.h / 2 + 5}">${esc(key.labels[0])}</text>`}
            </g>`;
        }).join("");
        return `<div class="pk-body"><div class="pkb"><svg viewBox="0 0 ${PICKER_BOARD.width} ${PICKER_BOARD.height}" xmlns="http://www.w3.org/2000/svg">${keys}</svg></div>
            ${model?.hostLayoutLegends ? `<p class="note" style="margin-top:12px">Shift above; ${modifierControls(model).find(({value}) => value === "A")?.label === "Option" ? "Option" : "AltGr"} on the right. ◌ marks a dead key: press it, then a letter.</p>` : ""}
            <p class="note" style="margin-top:12px">${picker.mode === "list" ? picker.maxKeys === 1 ? "Choose the key to press or release." : "Choose the keys to send together." : `Click a key. Modifiers above wrap it, so <code>${esc(modifierControls(model).find(({value}) => value === "G")?.label || "G")}</code> + <code>C</code> stores <code>G(KC_C)</code> — identical to <code>LGUI(KC_C)</code>.`}</p></div>`;
    }
    if (section.kind === "layers") {
        // TG(n) is the same lock as LOCK_LAYER(n), so a key storing it lights
        // Lock rather than getting a button of its own.
        const owned = Boolean(model?.ownsLayerKeys);
        const button = (value, label, tip, on = picked(value)) =>
            `<button class="pk wide ${on ? "on" : ""}" data-pick="${value}" data-tip="${esc(tip)}"><span class="l">${label}</span><span class="c">${value}</span></button>`;
        return `<div class="pk-body"><div class="pk-layers ${owned ? "owned" : ""}">${layers().map((layer) => `
            <div class="pk-layer">
                <span class="ix">${layer.index}</span><span class="nm">${esc(layerName(layer))}</span>
                ${button(`MO(${layer.index})`, "Hold", "On while the key is down.")}
                ${button(`LOCK_LAYER(${layer.index})`, "Lock", "Turns the layer on until pressed again. QMK's TG() is the same lock.", picked(`LOCK_LAYER(${layer.index})`) || picked(`TG(${layer.index})`))}
                <button class="pk wide ${picker.layerTap === String(layer.index) ? "on" : ""}" data-lt="${layer.index}" data-tip="A tap sends a key, a hold holds the layer. Pick the tap key next."><span class="l">Tap-hold</span><span class="c">LT(${layer.index}, …)</span></button>
                ${owned ? `${button(`TT(${layer.index})`, "Tap-toggle", "Holds the layer like Hold; repeated taps lock it.")}
                ${button(`OSL(${layer.index})`, "One-shot", "Holds the layer like Hold; a tap turns it on for the next key only.")}
                ${button(`TO(${layer.index})`, "Move", "Locks this layer alone and releases every other lock. TO(0) returns to the base layer.")}` : ""}
            </div>`).join("")}</div>
            <p class="note" style="margin-top:12px">${picker.layerTap
                ? `Tap-hold on <b>${esc(layerTapName(picker.layerTap))}</b> is armed — now pick the tap key from any section.`
                : `Hold reaches the layer while the key is down. Lock toggles it. Tap-hold asks for a tap key next.${owned ? " Tap-toggle and One-shot hold like Hold; Move switches to the layer alone." : ""}`}</p></div>`;
    }
    if (section.kind === "modes") {
        // One row per slot, laid out like the layers: the slot, what it does,
        // then its two keycodes. An empty slot is still offered, since its
        // keycodes are fixed; the row says it does nothing until configured.
        // Past eight slots the rows run down two columns, slot order first.
        const slots = model?.pdModes || [];
        const many = slots.length > 8;
        const rows = many ? ` style="grid-template-rows:repeat(${Math.ceil(slots.length / 2)}, auto)"` : "";
        if (!slots.length) return `<p class="note" style="padding:18px">This keyboard has not reported its pointing modes.</p>`;
        const kinds = vocabulary(model).pointing.kinds;
        const button = (value, label, tip) =>
            `<button class="pk wide ${picked(value) ? "on" : ""}" data-pick="${esc(value)}" data-tip="${esc(tip)}"><span class="l">${label}</span><span class="c">${esc(value)}</span></button>`;
        return `<div class="pk-body"><div class="pk-layers modes ${many ? "many" : ""}"${rows}>${slots.map((slot) => `
            <div class="pk-layer ${slot.kind ? "" : "empty"}">
                <span class="ix">${slot.id}</span>
                <span class="nm"><span>${esc(slot.displayName)}</span><span class="sub">${esc(slot.kind ? word(kinds, slot.kind) : "Empty — does nothing yet")}</span></span>
                ${button(slot.binding.hold, "Hold", "On while the key is down.")}
                ${button(slot.binding.lock, "Toggle", "Turns the mode on until pressed again.")}
            </div>`).join("")}</div>
            <p class="note" style="margin-top:12px">Hold re-reads the trackball while the key is down. Toggle keeps the mode on until the key is pressed again. A key for an empty slot does nothing until the slot is configured.</p></div>`;
    }
    if (section.kind === "macros") {
        const slots = model?.viaMacros || [];
        if (!slots.length) return `<p class="note" style="padding:18px">This keyboard has not reported its macros.</p>`;
        return `<div class="pk-body"><div class="pk-rows">${chunk(slots, 8).map((row) => `<div class="pk-row">${row.map((slot) =>
            macroButton(slot, picked(slot.keycode))).join("")}</div>`).join("")}</div></div>`;
    }
    const entries = entriesForPickerSection(catalogue, section).filter(entry => allowed(entry.value));
    if (!entries.length) return `<p class="note" style="padding:18px">The keyboard's catalogue has nothing in this section.</p>`;
    return `<div class="pk-body"><div class="pk-rows">${chunk(entries, 8).map((row) =>
        `<div class="pk-row">${row.map((entry) => keyButton(entry, picked(entry.value))).join("")}</div>`).join("")}</div></div>`;
}

export function pickerOverlay() {
    const picker = state.picker;
    if (!picker) return null;
    const model = getModel();
    const value = expression();
    const node = el(`<div class="scrim"><div class="sheet picker" role="dialog" aria-modal="true" aria-label="Pick a keycode" style="width:min(1180px,100%)">
        <div class="sheet-h">
            <div><h2>Pick a keycode</h2>
                <p class="note">${picker.mode === "list" ? picker.maxKeys === 1 ? "Choose one key." : Number.isFinite(picker.maxKeys) ? `Choose up to ${picker.maxKeys} keys to send together.` : "Choose one or more keys." : `For <b>${esc(picker.title)}</b> · ${esc([picker.contextKeycode ? actionLabel(model, picker.contextKeycode) : "", picker.context].filter(Boolean).join(" · "))}`}</p></div>
            <input class="input" id="pickerSearch" placeholder="Search every section" style="max-width:300px;margin-left:12px" value="${esc(picker.search)}">
            <span class="right" style="margin-left:auto"><button class="btn ghost" data-act="cancel">Cancel</button></span>
        </div>
        ${picker.mode === "list" ? "" : `<div class="pk-mods"><span class="label">Modifiers</span>
            ${modifierControls(model).map(({value: wrap, label}) => `<button class="pk-mod ${picker.mods.includes(wrap) ? "on" : ""}" data-mod="${wrap}"
                data-tip="Wraps the picked key as ${wrap}(key).">${esc(label)}</button>`).join("")}
            <span class="note" style="margin-left:auto">held together with the key</span></div>`}
        <div class="sheet-b" style="display:grid;grid-template-columns:186px minmax(0,1fr);align-items:start">
            <div class="picker-side">${sections(model).map((section) =>
                `<button data-sec="${esc(section.id)}" aria-current="${picker.section === section.id && !picker.search}">${esc(section.label)}</button>`).join("")}</div>
            <div>${sectionBody(model)}</div>
        </div>
        <div class="sheet-f">
            <span class="label">Selected</span>
            ${picker.layerTap ? `<button class="chip" data-act="clearlt">LT ${esc(layerTapName(picker.layerTap))} ✕</button>` : ""}
            ${picker.keys.length ? picker.keys.map((key, index) => `<button class="chip" data-remove="${index}">${esc(key)} ✕</button>`).join("")
                : `<span class="note">nothing picked yet</span>`}
            <code class="mono" style="margin-left:10px;color:var(--text)">${esc(value || "—")}</code>
            <span class="right"><button class="btn ghost" data-act="clear">Clear</button>
                <button class="btn ghost" data-act="cancel">Cancel</button>
                <button class="btn primary" data-act="use" ${value ? "" : "disabled"}>Use keycode</button></span>
        </div>
    </div></div>`);

    node.addEventListener("click", (event) => {
        if (event.target === node || event.target.closest('[data-act="cancel"]')) return closePicker();
        const section = event.target.closest("[data-sec]");
        if (section) { picker.section = section.dataset.sec; picker.search = ""; return render(); }
        const modifier = event.target.closest("[data-mod]");
        if (modifier) {
            const name = modifier.dataset.mod;
            picker.mods = picker.mods.includes(name) ? picker.mods.filter((value2) => value2 !== name) : [...picker.mods, name];
            return render();
        }
        const layerTap = event.target.closest("[data-lt]");
        if (layerTap) { picker.layerTap = picker.layerTap === layerTap.dataset.lt ? null : layerTap.dataset.lt; return render(); }
        if (event.target.closest('[data-act="clearlt"]')) { picker.layerTap = null; return render(); }
        if (event.target.closest('[data-act="clear"]')) { picker.keys = []; picker.mods = []; picker.layerTap = null; return render(); }
        const remove = event.target.closest("[data-remove]");
        if (remove) { picker.keys.splice(Number(remove.dataset.remove), 1); return render(); }
        // The picker closes itself before handing the choice on, so every
        // caller only says what the choice does.
        if (event.target.closest('[data-act="use"]')) {
            const chosen = expression();
            if (!chosen) return;
            state.picker = null;
            picker.onPick?.(chosen);
            return render();
        }
        const pick = event.target.closest("[data-pick]");
        if (pick) {
            const chosen = pickValue(pick.dataset.pick);
            if (!allowed(chosen)) return;
            if (picker.mode === "list" && !picker.keys.includes(chosen) && picker.keys.length >= picker.maxKeys && picker.maxKeys !== 1) return;
            picker.keys = picker.mode === "list"
                ? (picker.keys.includes(chosen) ? picker.keys.filter((key) => key !== chosen) : picker.maxKeys === 1 ? [chosen] : [...picker.keys, chosen])
                : [chosen];
            render();
        }
    });
    const search = node.querySelector("#pickerSearch");
    search.addEventListener("input", () => {
        picker.search = search.value;
        render();
        const again = document.querySelector("#pickerSearch");
        if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
    });
    return node;
}
