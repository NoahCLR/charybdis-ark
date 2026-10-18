// @ts-check
// The Keyboard screen: who the keyboard is. Its name is the title (click to
// rename), then what it is and runs (product, firmware against this Ark,
// Ark's own version, the two halves, a restart when one is needed), how full
// its memory is, and the diagnostics of what was read, folded.
//
// In the demo it says what stands in for a keyboard, and that it is not one;
// reading a keyboard from there leaves the demo, asking first.

// Selector assertions refer to elements created by this module's authored markup.
import * as controls from "../view/controls.mjs";
import * as edits from "../view/edits.mjs";
import {DISCLOSURE, el, esc} from "../lib/dom.mjs";
import {canEdit, getModel, post, postLeavingDemo, render, state} from "../store.mjs";
import {demoOf} from "../view/demo.mjs";
import {halvesWords, phaseWords} from "../view/vocabulary.mjs";
import {hostOf} from "../view/host.mjs";
import {profileUsageView} from "../view/profile-usage.mjs";
import {FIRMWARE_RELEASES, firmwareLine, halvesRows} from "../view/keyboard-view.mjs";
import {NAME_MAX_BYTES} from "../view/names.mjs";
import {draftDot, draftMarks} from "../view/review.mjs";
import {attachTitleName, titleName} from "./title-name.mjs";

/** @param {readonly (readonly [string, string])[]} rows each value already escaped markup */
const kv = (rows) => `<dl class="kv device-kv">${rows.map(([key, value]) => `<dt>${esc(key)}</dt><dd>${value || "—"}</dd>`).join("")}</dl>`;

const RENAME_NOTE = "Your computer and Chrome show this name after Apply; the keyboard reconnects for a moment to take it.";

export function screenDevice() {
    const model = getModel();
    const device = model?.device, demo = demoOf(model).active;
    const health = device?.health;
    const keyboard = model?.keyboardName;
    const title = keyboard ? titleName({f: "keyboard:name", value: keyboard.name, placeholder: keyboard.builtIn || device?.label || "Charybdis",
        label: "Keyboard name", perName: keyboard.perName || NAME_MAX_BYTES, canEdit: canEdit("settings")})
        : `<h1>${esc(device?.label || "Keyboard")}</h1>`;
    const dirty = draftMarks(model?.draft?.changes).settings.has("keyboard");
    const sub = demo ? "The demo stands in for a keyboard running current firmware. Nothing here reaches a keyboard."
        : "Your Charybdis: its firmware, its two halves and how full it is.";
    const firmware = firmwareLine(model);
    const build = hostOf(model).build;
    const restart = !demo && health?.restartNeeded ? `<div class="callout danger-note" role="alert"><strong>Restart the keyboard.</strong>
        The left half did not confirm a cancelled save, so the keyboard refuses new saves until it restarts. Nothing was lost.
        <ol class="steps"><li>Unplug the USB cable from the right half (not the cable between the halves).</li><li>Wait a few seconds, then plug it back in.</li><li>Choose Read from keyboard below.</li></ol></div>` : "";
    const saving = !demo && health?.recoveryPending ? `<p class="note">A save is in progress on the keyboard: it keeps its previous profile until both halves confirm the new one.</p>` : "";
    const halves = halvesRows(model).map((half) => `<span class="half ${half.ok ? "ok" : "warn"}">${esc(half.side)} · ${esc(half.role)} ${half.ok ? "✓" : "!"}<span class="note"> ${esc(half.words)}</span></span>`).join("");
    const identity = kv([
        ["Product", esc(device?.label || "")],
        ["Firmware", demo ? "Current firmware (demo)" : `${esc(firmware.version)} · ${firmware.works ? `<span class="ok-words">${esc(firmware.words)}</span>`
            : `<span class="warn-words">${esc(firmware.words)}</span> <a class="btn text compact" href="${esc(FIRMWARE_RELEASES)}" target="_blank" rel="noopener">How to install →</a>`}`],
        ...(build?.version ? /** @type {const} */ ([["Ark", esc(`Ark ${build.version}`)]]) : []),
        ["Halves", demo ? "Demo · no keyboard" : `<span class="halves">${halves}</span>`],
    ]);
    const usage = model?.portable?.available ? profileUsageView(model.portable.usage, model?.macroBank) : null;
    const diagnosticsOpen = (state.settingsOpen || []).includes("diagnostics");
    const main = el(`<div class="main">
        <header class="topbar keyboard-topbar"><div class="keyboard-title">${title}${dirty ? draftDot() : ""}
            <p class="sub">${esc(sub)}</p><p class="note rename-note">${esc(RENAME_NOTE)}</p></div></header>
        <div class="content"><div class="pad stack device-pad">
            <section class="card"><div class="card-h"><h3>This keyboard</h3></div>
                <div class="card-b stack gap-12">${identity}${restart}${saving}</div></section>
            ${usage ? usageCard(usage) : ""}
            <details class="card settings-group" data-section="diagnostics" ${diagnosticsOpen ? "open" : ""}>
                <summary class="card-h">${DISCLOSURE}<h3>Diagnostics</h3>
                    <span class="right"><button class="btn compact" data-act="read" ${health?.busy ? "disabled" : ""}>Read from keyboard</button></span></summary>
                <div class="card-b stack gap-12">${kv([
                    ["Saved profile", esc(device?.summary || "")],
                    ["Halves", esc(halvesWords(model, health?.halves).label)],
                    ["Phase", esc(phaseWords(model, health?.phase)?.label || "")],
                    ["Firmware word", esc(model?.firmware?.versionWord || "")],
                    ["Built-in defaults", esc(model?.firmware?.defaultsDigest || "")],
                ])}</div>
                <div class="list">${(model?.diagnostics || []).map((note) =>
                    `<div class="list-row note-row"><span class="note">${esc(note)}</span></div>`).join("")
                    || `<div class="list-row"><span class="note">Nothing has been read yet.</span></div>`}</div>
            </details>
        </div></div></div>`);
    const fold = /** @type {HTMLDetailsElement} */ (main.querySelector('[data-section="diagnostics"]'));
    fold.addEventListener("toggle", () => {
        const others = (state.settingsOpen || []).filter((id) => id !== "diagnostics");
        state.settingsOpen = fold.open ? [...others, "diagnostics"] : others;
    });
    const read = /** @type {HTMLButtonElement} */ (main.querySelector('[data-act="read"]'));
    // The button sits in the fold's title; pressing it does not fold.
    read.addEventListener("click", (event) => {
        event.preventDefault();
        if (demo) postLeavingDemo(controls.control("refresh"));
        else post(controls.control("refresh"));
    });
    if (keyboard) attachTitleName(/** @type {HTMLElement} */ (main.querySelector(".keyboard-title")), {stored: keyboard.name, perName: keyboard.perName || NAME_MAX_BYTES,
        rename: (name) => { post(edits.keyboardNameMessage(name, keyboard.identity)); render(); }});
    return main;
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
                <span class="right note">${bytes(usage.used)} of ${bytes(usage.capacity)} bytes used · ${bytes(usage.free)} free</span></div>
                <div class="meter ${usage.nearlyFull ? "near" : ""}" data-tip="${Math.round(usage.share * 100)}% used"><i style="width:${usage.share * 100}%"></i></div></div>
            <p class="note">Behaviours, combos, lighting, pointing modes, custom keys, settings and names are stored together here${usage.nearlyFull ? ". It is nearly full: the next edit may not fit" : ""}.</p>
            ${usage.counts.length ? `<table class="t usage-counts"><thead><tr><th>In use</th><th class="count num"></th><th></th><th></th></tr></thead>
                <tbody>${usage.counts.map((count) => `<tr data-tip="${esc(count.tip)}"><td>${esc(count.label)}</td>
                    <td class="mono count num">${count.used} of ${count.limit}</td>
                    <td class="bar"><div class="meter"><i style="width:${count.share * 100}%"></i>${count.unavailable
                        ? `<span class="out" style="width:${count.unavailableShare * 100}%"></span>` : ""}</div></td>
                    <td class="note">${esc(count.note)}</td></tr>`).join("")}</tbody></table>` : ""}
            ${usage.macros ? `<div><div class="sect-h"><h4>Macro memory (separate)</h4>
                <span class="right note">${bytes(usage.macros.used)} of ${bytes(usage.macros.capacity)} bytes used</span></div>
                <div class="meter"><i style="width:${usage.macros.share * 100}%"></i></div>
                <p class="note meter-note">Macro steps are stored apart from the profile and counted slot by slot on Macros. Macro names count in the profile above.</p></div>` : ""}
        </div></div>`;
}
