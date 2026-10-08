// Profile & backups: the whole keyboard as one file.
//
// Layer names and priority are edited beside the board, in Keys → Layers, where
// what a layer holds is visible while it is named.
//
// A complete profile is layers, behaviours, combos, macros, pointing modes,
// lighting and settings. Restoring one replaces all of that, so the card counts, area
// by area, what the file changes on the keyboard before anything is written.

import {el, esc} from "../lib/dom.mjs";
import {getModel, post, canEdit as canEditArea} from "../store.mjs";
import {topbar} from "./shell.mjs";
import {categorySummary, statusSummary} from "../view/review.mjs";
import {stageOrder} from "../view/vocabulary.mjs";
import {profileUsageView} from "../view/profile-usage.mjs";
import {downloadRecovery, hostOf, savedWhen} from "../view/host.mjs";
import {DEMO_WORDS, demoOf} from "../view/demo.mjs";
import {reviewPortableProfile} from "../view/edits.mjs";

export function screenProfile() {
    const model = getModel();
    const portable = model?.portable || {};
    const health = model?.device?.health || {};
    const busy = Boolean(portable.busy);
    const canExport = canEditArea("export");
    const canImport = canEditArea("import");
    // In the demo there is no keyboard: Export saves the demo's draft, Import
    // reviews a file against the demo setup, and nothing is recovered.
    const demo = demoOf(model).active;

    const main = el(`<div class="main">${topbar(
        "Profile & backups",
        "A complete backup is everything the keyboard stores: layers, behaviours, combos, macros, pointing modes, lighting and settings.",
    )}</div>`);

    const content = el(`<div class="content"><div class="pad" style="max-width:960px;display:grid;gap:14px"></div></div>`);
    const pad = content.firstElementChild;

    if (portable.progress) pad.appendChild(el(`<div class="profile-progress"><span class="spin"></span><span>${esc(portable.progress)}</span></div>`));
    if (!portable.available) {
        pad.appendChild(el(`<div class="unavailable">${esc("Connect a keyboard with complete-profile firmware to manage its backups and layers.")}</div>`));
    }
    if (portable.review) pad.appendChild(reviewCard(model, portable, busy));

    const actions = el(`<div class="profile-actions">
        <div class="card profile-action" data-profile-drop aria-disabled="${!canImport}">
            <div class="card-b">
                <span class="profile-action-mark"><svg viewBox="0 0 24 24"><path d="M12 21V9M7.5 13.5 12 9l4.5 4.5M4 5h16"/></svg></span>
                <h3>Import profile</h3>
                <p class="note">${demo ? "Choose or drop a complete backup here and review its differences from the demo setup first. Import replaces the demo's draft; Undo brings it back."
                    : "Choose or drop a complete backup here and review its differences first. Import replaces the local draft; nothing is written to the keyboard until you review and apply it."}</p>
                <p class="note profile-drop-status" role="status" hidden></p>
                <button class="btn" data-act="import" ${canImport ? "" : "disabled"}>Choose profile…</button>
            </div>
        </div>
        <div class="card profile-action">
            <div class="card-b">
                <span class="profile-action-mark"><svg viewBox="0 0 24 24"><path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4 19h16"/></svg></span>
                <h3>Export profile</h3>
                <p class="note">${demo ? esc(DEMO_WORDS.exportNote)
                    : "Save a complete, portable backup of the profile currently running on the keyboard. Keep it somewhere safe before experimenting or updating firmware."}</p>
                <button class="btn primary" data-act="export" ${canExport ? "" : "disabled"}>Export profile…</button>
            </div>
        </div>
    </div>`);
    actions.querySelector('[data-act="export"]').addEventListener("click", () => post({type: "exportPortableProfile"}));
    actions.querySelector('[data-act="import"]').addEventListener("click", () => post({type: "choosePortableProfile"}));
    wireProfileDrop(actions.querySelector("[data-profile-drop]"));
    pad.appendChild(actions);

    const usage = portable.available ? profileUsageView(portable.usage, model?.macroBank) : null;
    if (usage) pad.appendChild(usageCard(usage));

    if (!demo) pad.appendChild(el(`<div class="profile-recovery">
        <i class="dot ${health.recoveryPending ? "draft" : "on"}" style="margin-top:6px"></i>
        <div class="copy"><b>Automatic recovery</b><p class="note">${health.recoveryPending
            ? "An apply was interrupted. The keyboard is still running its last complete profile; the recovery copy restores it, and Apply retries from there."
            : "A recovery copy is written before every apply and released once both halves confirm. Nothing is outstanding."}</p></div>
        <span class="chip state">${health.recoveryPending ? "pending" : "clear"}</span>
    </div>`));

    const recoveries = hostOf(model).recoveries;
    if (recoveries) pad.appendChild(recoveriesCard(recoveries));

    main.appendChild(content);
    return main;
}

function wireProfileDrop(card) {
    const status = card.querySelector(".profile-drop-status");
    const choose = card.querySelector('[data-act="import"]');
    let reading = false;
    const available = () => !reading && canEditArea("import");
    const tell = (text) => {status.textContent = text; status.hidden = !text;};
    const files = (event) => Array.from(event.dataTransfer?.types || []).includes("Files");
    for (const type of ["dragenter", "dragover"]) card.addEventListener(type, (event) => {
        if (!files(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = available() ? "copy" : "none";
        card.classList.toggle("drag-over", available());
    });
    card.addEventListener("dragleave", (event) => {
        if (!card.contains(event.relatedTarget)) card.classList.remove("drag-over");
    });
    card.addEventListener("drop", async (event) => {
        if (!files(event)) return;
        event.preventDefault();
        card.classList.remove("drag-over");
        if (!available()) return;
        const dropped = Array.from(event.dataTransfer.files);
        if (dropped.length !== 1) {tell("Drop one profile file at a time."); return;}
        const file = dropped[0];
        if (file.size > 100000) {tell("This profile file is too large."); return;}
        const draft = getModel()?.draft;
        const {id, revision} = draft;
        reading = true;
        choose.disabled = true;
        tell("Reading profile…");
        try {
            const text = await file.text();
            if (!card.isConnected) return;
            if (!canEditArea("import") || getModel()?.draft?.id !== id || getModel()?.draft?.revision !== revision) {
                tell("The draft changed while reading this file. Drop it again when ready.");
                return;
            }
            tell("");
            post(reviewPortableProfile(text, file.name));
        } catch {
            tell("This profile file could not be read. Try Choose profile instead.");
        } finally {
            reading = false;
            choose.disabled = !canEditArea("import");
        }
    });
}

// The recovery copies a host keeps where no file can be opened (a browser's
// storage), each downloadable as the file the extension would have written.
function recoveriesCard(recoveries) {
    const node = el(`<div class="card recoveries">
        <div class="card-h"><h3>Recovery copies</h3><span class="right note">${recoveries.length} in this browser</span></div>
        ${recoveries.length ? `<div class="list">${recoveries.map((copy) => `<div class="list-row recovery-row">
            <span class="mono">${esc(copy.name)}</span><span class="note">${esc(savedWhen(copy.savedAt))}</span>
            <button class="btn tiny" data-recovery="${esc(copy.id)}">Download</button></div>`).join("")}</div>` : ""}
        <div class="card-b"><p class="note">${recoveries.length ? "" : "None yet. "}Apply and Import save a copy of what the keyboard held here before they write anything. They stay in this browser until you clear the site's data, which deletes them too, so download any you want to keep.</p></div>
    </div>`);
    node.querySelectorAll("[data-recovery]").forEach((button) => button.addEventListener("click", () => {
        post(downloadRecovery(recoveries.find((copy) => String(copy.id) === button.dataset.recovery).id));
    }));
    return node;
}

// How full the profile is, area by area, with the counted limits beside it.
// Every area shares the one block, so the bar is what an edit can run into.
function usageCard(usage) {
    const bytes = (value) => value.toLocaleString("en-US");
    return el(`<div class="card usage">
        <div class="card-h"><h3>Profile memory</h3><span class="right note">${esc(usage.source)}</span></div>
        <div class="card-b" style="display:grid;gap:12px">
            <div><div class="sect-h"><h4>Profile</h4>
                <span class="right note">${bytes(usage.used)} of ${bytes(usage.capacity)} bytes used · ${bytes(usage.free)} free</span></div>
                <div class="meter ${usage.nearlyFull ? "near" : ""}" data-tip="${Math.round(usage.share * 100)}% used"><i style="width:${usage.share * 100}%"></i></div></div>
            <p class="note">Behaviours, combos, lighting, pointing modes, settings and names all share this one block, so a full profile can refuse an edit in any of them${usage.nearlyFull ? ". It is nearly full: the next edit may not fit" : ""}.</p>
            <div class="usage-tables">
                <table class="t"><thead><tr><th>Uses the block</th><th>Bytes</th><th></th></tr></thead>
                    <tbody>${usage.areas.map((area) => `<tr><td>${esc(area.label)}</td><td class="mono">${bytes(area.bytes)}</td><td class="note mono">${area.percent}%</td></tr>`).join("")}</tbody></table>
                ${usage.counts.length ? `<table class="t"><thead><tr><th>Counted limits</th><th>Used</th><th></th></tr></thead>
                    <tbody>${usage.counts.map((count) => `<tr><td>${esc(count.label)}</td><td class="mono">${count.used} of ${count.limit}</td><td class="note">${count.full ? "full" : ""}</td></tr>`).join("")}</tbody></table>` : ""}
            </div>
            ${usage.macros ? `<div><div class="sect-h"><h4>Macro memory (separate)</h4>
                <span class="right note">${bytes(usage.macros.used)} of ${bytes(usage.macros.capacity)} bytes used</span></div>
                <div class="meter"><i style="width:${usage.macros.share * 100}%"></i></div>
                <p class="note" style="margin-top:6px">Macro steps are stored apart from the profile and counted slot by slot on Macros. Macro names count in the profile above.</p></div>` : ""}
        </div></div>`);
}

// The file against the keyboard, counted area by area: enough to decide
// whether to take it. What each difference is waits for the draft's own
// review, which the file becomes.
function reviewCard(model, portable, busy) {
    const {incoming, current, fileName, differences} = portable.review;
    const draft = model?.draft;
    const pending = draft?.dirty ? draft.changes.length : 0;
    const same = differences && !differences.length;
    const summary = differences ? categorySummary(differences, {names: incoming.names, stages: stageOrder(model)}) : [];
    const counted = differences?.length
        ? `${differences.length} difference${differences.length === 1 ? "" : "s"} from ${demoOf(model).active ? "the demo setup" : "the keyboard"} · ${statusSummary(differences)}` : "";
    const callout = !current
        ? "An interrupted restore left an incomplete configuration, so this file cannot be compared with it. This profile replaces it; the interrupted data is kept as a diagnostic copy, so keep your original backup as well."
        : draft
            ? `${pending ? `This replaces your draft and its ${pending} change${pending === 1 ? "" : "s"}; Undo brings ${pending === 1 ? "it" : "them"} back. ` : ""}Nothing is written to the keyboard until you review and apply; the review shows every change field by field.`
            : "This replaces the keyboard's layout, behaviours, combos, macros, pointing modes, lighting and settings. A recovery copy is saved automatically before restoring, and both halves are verified afterwards.";
    const node = el(`<div class="card">
        <div class="card-h"><h3>${draft ? "Use this profile as your draft?" : "Restore this profile?"}</h3>
            ${fileName ? `<span class="right note mono">${esc(fileName)}</span>` : ""}</div>
        <div class="card-b" style="display:grid;gap:12px">
            ${counted ? `<p class="note">${esc(counted)}</p>` : ""}
            ${same ? `<div class="callout">This file holds exactly what ${demoOf(model).active ? "the demo setup holds" : "the keyboard runs"}. Using it changes nothing.</div>` : ""}
            ${summary.length ? `<table class="t import-diff"><thead><tr><th>What this file changes</th><th>Differences</th><th></th></tr></thead>
                <tbody>${summary.map((group) => `<tr class="cat"><td>${esc(group.category)}</td><td class="mono">${group.count}</td><td class="note">${esc(group.status)}</td></tr>
                    ${group.rows.map((row) => `<tr class="sub"><td>${esc(row.label)}</td><td class="mono">${row.count}</td><td></td></tr>`).join("")}`).join("")}</tbody></table>` : ""}
            ${same ? "" : `<div class="callout warn">${esc(callout)}</div>`}
            <div class="row" style="gap:8px">
                <button class="btn primary" data-act="restore" ${busy || same ? "disabled" : ""}>${draft ? "Use as draft" : "Restore profile"}</button>
                <button class="btn ghost" data-act="cancel" ${busy ? "disabled" : ""}>Cancel</button></div>
        </div></div>`);
    node.querySelector('[data-act="restore"]').addEventListener("click", () => post({type: "restorePortableProfile"}));
    node.querySelector('[data-act="cancel"]').addEventListener("click", () => post({type: "cancelPortableReview"}));
    return node;
}
