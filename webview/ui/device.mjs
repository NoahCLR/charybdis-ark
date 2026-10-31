// @ts-check
// The Keyboard screen: who the keyboard is. Its name is the title (click to
// rename), then what it is and runs (product, firmware against this Ark,
// Ark's own version, the two halves, a restart when one is needed), how full
// its memory is, then folded, what its firmware was built with and the
// diagnostics of what was read, with each half's flash pauses: read when
// the fold opens and by its Read keyboard, and only then.
//
// In the demo it says what stands in for a keyboard, and that it is not one;
// reading a keyboard from there leaves the demo, asking first.

// Selector assertions refer to elements created by this module's authored markup.
import * as controls from "../view/controls.mjs";
import * as edits from "../view/edits.mjs";
import {DISCLOSURE, el, esc} from "../lib/dom.mjs";
import {getModel, post, postLeavingDemo, render, state} from "../store.mjs";
import {editGate} from "../view/edit-gate.mjs";
import {demoOf} from "../view/demo.mjs";
import {halvesWords, phaseWords} from "../view/vocabulary.mjs";
import {shellOf} from "../view/shell-panel.mjs";
import {profileUsageView} from "../view/profile-usage.mjs";
import {flashPausesView} from "../view/flash-pauses.mjs";
import {FIRMWARE_RELEASES, RESTART_NEEDED, SAVE_IN_PROGRESS, firmwareLine, halvesRows, productName} from "../view/keyboard-view.mjs";
import {NAME_MAX_BYTES} from "../view/names.mjs";
import {draftDot, draftMarks} from "../view/review.mjs";
import {firmwareFacts} from "../view/firmware-facts.mjs";
import {attachTitleName, titleName} from "./title-name.mjs";
import {themeToggle} from "./frame.mjs";
import {renameNote} from "../view/edit-mode.mjs";

/** @param {readonly (readonly [string, string])[]} rows each value already escaped markup */
const kv = (rows) => `<dl class="kv device-kv">${rows.map(([key, value]) => `<dt>${esc(key)}</dt><dd>${value || "—"}</dd>`).join("")}</dl>`;

export function screenDevice() {
    const model = getModel();
    const device = model?.device, demo = demoOf(model).active;
    const health = device?.health;
    const keyboard = model?.keyboardName;
    const title = keyboard ? titleName({f: "keyboard:name", value: keyboard.name, placeholder: keyboard.builtIn || device?.label || "Charybdis",
        label: "Keyboard name", perName: keyboard.perName || NAME_MAX_BYTES, canEdit: editGate(model, "settings").editable})
        : `<h1>${esc(device?.label || "Keyboard")}</h1>`;
    const dirty = draftMarks(model?.draft?.changes).settings.has("keyboard");
    const sub = demo ? "The demo stands in for a keyboard running current firmware. Nothing here reaches a keyboard."
        : "Your Charybdis: its firmware, its two halves and how full it is.";
    const firmware = firmwareLine(model);
    const build = shellOf(model).build;
    const restart = !demo && health?.restartNeeded ? `<div class="callout danger-note" role="alert"><strong>${esc(RESTART_NEEDED.label)}.</strong>
        ${esc(RESTART_NEEDED.detail)}
        <ol class="steps">${RESTART_NEEDED.steps.map((step) => `<li>${esc(step)}</li>`).join("")}</ol></div>` : "";
    const earlier = !demo && health?.earlierFormat ? `<p class="note">A saved profile uses an earlier format or test layout that this firmware does not read, so the keyboard runs its compiled defaults. Save keeps your profile on the keyboard in the current format.</p>` : "";
    const saving = !demo && health?.recoveryPending ? `<p class="note">${esc(SAVE_IN_PROGRESS.detail)}</p>` : "";
    const halves = halvesRows(model).map((half) => `<span class="half ${half.ok ? "ok" : "warn"}">${esc(half.half)} (${esc(half.side)}) ${half.ok ? "✓" : "!"}<span class="note"> ${esc(half.words)}</span></span>`).join("");
    const product = productName(model);
    const identity = kv([
        ...(product ? /** @type {const} */ ([["Product", esc(product)]]) : []),
        ["Firmware", demo ? "Current firmware (demo)" : `${esc(firmware.version)} · ${firmware.works ? `<span class="ok-words">${esc(firmware.words)}</span>`
            : `<span class="warn-words">${esc(firmware.words)}</span> <a class="btn text compact" href="${esc(FIRMWARE_RELEASES)}" target="_blank" rel="noopener">How to install →</a>`}`],
        ...(build?.version ? /** @type {const} */ ([["Ark", esc(`Ark ${build.version}`)]]) : []),
        ["Halves", demo ? "Demo · no keyboard" : `<span class="halves">${halves}</span>`],
    ]);
    const usage = model?.portable?.available ? profileUsageView(model, model.portable.usage, model?.macroBank) : null;
    const diagnosticsOpen = (state.settingsOpen || []).includes("diagnostics");
    // Diagnostics reads each half's flash pauses when it opens, and once for
    // each connection while it stays open: a keyboard reconnected or chosen
    // meanwhile is read too, when nothing else holds it.
    const connection = model?.load?.connectionToken ?? null;
    const askFlashPauses = () => {state.flashPausesAsked = connection; post(controls.readFlashPauses());};
    const unread = diagnosticsOpen && !demo && device?.connected && !device.flashPauses && !health?.busy && connection !== null && state.flashPausesAsked !== connection;
    const facts = firmwareFacts(model);
    const main = el(`<div class="main">
        <header class="topbar keyboard-topbar"><div class="keyboard-title">${title}${dirty ? draftDot() : ""}
            <p class="sub">${esc(sub)}</p><p class="note rename-note">${esc(renameNote(model?.draft))}</p></div>
            <div class="topbar-actions">${themeToggle()}</div></header>
        <div class="content"><div class="pad stack device-pad">
            <section class="card"><div class="card-h"><h3>This keyboard</h3></div>
                <div class="card-b stack gap-12">${identity}${restart}${earlier}${saving}</div></section>
            ${usage ? usageCard(usage) : ""}
            ${facts.length ? builtInCard(facts) : ""}
            <details class="card settings-group" data-section="diagnostics" ${diagnosticsOpen ? "open" : ""}>
                <summary class="card-h">${DISCLOSURE}<h3>Diagnostics</h3>
                    <span class="right"><button class="btn compact" data-act="read" ${health?.busy ? "disabled" : ""}>Read keyboard</button></span></summary>
                <div class="card-b stack gap-12">${kv([
                    ["Saved profile", esc(device?.summary || "")],
                    ["Halves", esc(halvesWords(model, health?.halves).label)],
                    ["Phase", esc(phaseWords(model, health?.phase)?.label || "")],
                    ["Firmware word", esc(model?.firmware?.versionWord || "")],
                    ["Compiled defaults", esc(model?.firmware?.defaultsDigest || "")],
                ])}${demo || device?.connected ? flashPausesSection(flashPausesView(model), demo) : ""}</div>
                <div class="list">${(model?.diagnostics || []).map((note) =>
                    `<div class="list-row note-row"><span class="note">${esc(note)}</span></div>`).join("")
                    || `<div class="list-row"><span class="note">Nothing has been read yet.</span></div>`}</div>
            </details>
        </div></div></div>`);
    /** @type {NodeListOf<HTMLDetailsElement>} */ (main.querySelectorAll("details[data-section]")).forEach((fold) => fold.addEventListener("toggle", () => {
        const id = /** @type {string} */ (fold.dataset.section);
        const others = (state.settingsOpen || []).filter((entry) => entry !== id);
        // Drawn open again, it was already open: only opening it reads.
        const opened = fold.open && others.length === (state.settingsOpen || []).length;
        state.settingsOpen = fold.open ? [...others, id] : others;
        if (opened && id === "diagnostics" && !demo) askFlashPauses();
    }));
    if (unread) askFlashPauses();
    const read = /** @type {HTMLButtonElement} */ (main.querySelector('[data-act="read"]'));
    // The button sits in the fold's title; pressing it does not fold.
    read.addEventListener("click", (event) => {
        event.preventDefault();
        const message = controls.readKeyboard(/** @type {HTMLDetailsElement} */ (read.closest("details")).open);
        if (demo) postLeavingDemo(message);
        else post(message);
    });
    if (keyboard) attachTitleName(/** @type {HTMLElement} */ (main.querySelector(".keyboard-title")), {stored: keyboard.name, perName: keyboard.perName || NAME_MAX_BYTES,
        rename: (name) => { post(edits.keyboardNameMessage(name, keyboard.identity)); render(); }});
    return main;
}

// Each half's flash pauses: a column per half, a row per figure, each with
// what it measures and the exact microseconds in its tip.
/** @param {ReturnType<typeof flashPausesView>} view @param {boolean} demo */
function flashPausesSection(view, demo) {
    const about = demo ? "Sample figures: the demo has no flash to measure." : "How long each half stopped to work on its flash since it started, read while Diagnostics is open.";
    const body = !view ? `<p class="note">Not read yet.</p>`
        : "failed" in view ? `<p class="note warn-words">${esc(view.failed)}</p>`
        : `<table class="t flash-pauses"><thead><tr><th></th>${view.halves.map((half) => `<th class="num">${esc(half)}</th>`).join("")}</tr></thead>
            <tbody>${view.rows.map((row) => `<tr><td data-tip="${esc(row.hint)}">${esc(row.label)}</td>${row.values.map((value) =>
                `<td class="mono num"${value.tip ? ` data-tip="${esc(value.tip)}"` : ""}>${esc(value.text)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    return `<div class="flash-pauses-section"><div class="sect-h"><h4>Flash pauses</h4></div><p class="note">${esc(about)}</p>${body}</div>`;
}

// What this firmware was built with, read-only, folded beside the memory its
// numbers bound: each fact needs a firmware build to change.
/** @param {ReturnType<typeof firmwareFacts>} facts */
function builtInCard(facts) {
    const open = (state.settingsOpen || []).includes("builtIn");
    return `<details class="card settings-group" data-section="builtIn" ${open ? "open" : ""}>
        <summary class="card-h">${DISCLOSURE}<h3>Built into this firmware</h3>
            <span class="right fold-summary">${facts.length} facts</span></summary>
        <div class="card-b settings-intro"><p class="note">Set when the firmware was built, not stored in the profile: changing any of these needs a new firmware build on both halves.</p></div>
        <div class="rows">${facts.map((fact) => `<div class="setrow ro" data-tip="${esc(fact.hint)}">
            <div><div class="nm">${esc(fact.label)}</div><div class="hint">${esc(fact.hint)}</div></div>
            <div class="control"><span class="fact-value">${esc(fact.value)}</span></div></div>`).join("")}</div>
    </details>`;
}

// How full the profile is, and how many of each thing are set up against what
// the keyboard holds: the counts are what an edit runs into first.
/** @param {NonNullable<ReturnType<typeof profileUsageView>>} usage */
function usageCard(usage) {
    /** @param {number} value */
    const bytes = (value) => value.toLocaleString("en-GB");
    return `<div class="card usage">
        <div class="card-h"><h3>Memory</h3><span class="right note">${esc(usage.source)}</span></div>
        <div class="card-b stack gap-12">
            <div><div class="sect-h"><h4>Profile</h4>
                <span class="right note">${esc(bytes(usage.used))} of ${esc(bytes(usage.capacity))} bytes used · ${esc(bytes(usage.free))} free</span></div>
                <div class="meter ${usage.nearlyFull ? "near" : ""}" data-tip="${Math.round(usage.share * 100)}% used"><i style="width:${usage.share * 100}%"></i></div></div>
            <p class="note">Behaviours, combos, lighting, pointing modes, custom keys, settings and names are stored together here${usage.nearlyFull ? ". It is nearly full: the next edit may not fit" : ""}.</p>
            ${usage.counts.length ? `<table class="t usage-counts"><thead><tr><th>In use</th><th class="count num"></th><th></th><th></th></tr></thead>
                <tbody>${usage.counts.map((count) => `<tr data-tip="${esc(count.tip)}"><td>${esc(count.label)}</td>
                    <td class="mono count num">${esc(count.used)} of ${esc(count.limit)}</td>
                    <td class="bar"><div class="meter"><i style="width:${count.share * 100}%"></i>${count.unavailable
                        ? `<span class="out" style="width:${count.unavailableShare * 100}%"></span>` : ""}</div></td>
                    <td class="note">${esc(count.note)}</td></tr>`).join("")}</tbody></table>` : ""}
            ${usage.macros ? `<div><div class="sect-h"><h4>Macro memory</h4>
                <span class="right note">${esc(bytes(usage.macros.used))} of ${esc(bytes(usage.macros.capacity))} bytes used</span></div>
                <div class="meter"><i style="width:${usage.macros.share * 100}%"></i></div>
                <p class="note meter-note">Macro steps are part of the profile above, within their own limit, and counted slot by slot on Macros.</p></div>` : ""}
        </div></div>`;
}
