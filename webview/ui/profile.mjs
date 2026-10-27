// @ts-check
// Backups: the whole keyboard as one file.
//
// Layer names and priority are edited beside the board, in Keymap → Layers, where
// what a layer holds is visible while it is named.
//
// A complete profile is layers, behaviours, combos, custom keys, macros,
// pointing modes, lighting and settings. Restoring one replaces all of that, so the card counts, area
// by area, what the file changes on the keyboard before anything is written.

// Selector assertions refer to elements created by this module's authored markup.
import * as controls from "../view/controls.mjs";
import {el, esc} from "../lib/dom.mjs";
import {getModel, post, canEdit as canEditArea} from "../store.mjs";
import {topbar} from "./frame.mjs";
import {categorySummary, statusBesideCount} from "../view/review.mjs";
import {stageOrder} from "../view/vocabulary.mjs";
import {copyTitle, deleteRecovery, downloadRecovery, shellOf, useRecovery} from "../view/shell-panel.mjs";
import {DEMO_WORDS, demoOf} from "../view/demo.mjs";
import {reviewPortableProfile} from "../view/edits.mjs";
import {fitsLine} from "../view/backups.mjs";
import {importCallout, importNote} from "../view/edit-mode.mjs";

export function screenProfile() {
    const model = getModel();
    /** @type {Partial<import("../../contracts/panel.js").PublishedModel["portable"]>} */
    const portable = model?.portable || {};
    const busy = Boolean(portable.busy);
    const canExport = canEditArea("export");
    const canImport = canEditArea("import");
    // In the demo there is no keyboard: Export saves the demo's draft,
    // Import reviews a file against the demo setup, and nothing is recovered.
    const demo = demoOf(model).active;

    const main = el(`<div class="main">${topbar(
        "Backups",
        "Everything the keyboard stores, as one file: keys, layers, behaviours, combos, macros, custom keys, pointing modes, lighting and settings.",
    )}</div>`);

    const content = el(`<div class="content"><div class="pad stack profile-pad"></div></div>`);
    const pad = /** @type {HTMLElement} */ (content.firstElementChild);

    pad.appendChild(el(`<div class="profile-progress" ${portable.progress ? "" : "hidden"}><span class="spin"></span><span>${esc(portable.progress)}</span></div>`));
    if (!portable.available) {
        pad.appendChild(el(`<div class="unavailable">${esc("Connect a keyboard with complete-profile firmware to manage its backups.")}</div>`));
    }

    // Import first, as a drop zone; the arrow points in. Export's points out.
    const actions = el(`<div class="profile-actions">
        <div class="card profile-action" data-profile-drop aria-disabled="${!canImport}">
            <div class="card-b">
                <span class="profile-action-mark"><svg viewBox="0 0 24 24"><path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4 19h16"/></svg></span>
                <h3>Import profile</h3>
                <p class="note">${esc(demo ? "Choose or drop a complete backup here and review its differences from the demo setup first. Import replaces the demo's draft; Undo brings it back."
                    : importNote(model?.draft))}</p>
                <p class="note profile-drop-status" role="status" hidden></p>
                <button class="btn" data-act="import" ${canImport ? "" : "disabled"}>Choose profile…</button>
            </div>
        </div>
        <div class="card profile-action">
            <div class="card-b">
                <span class="profile-action-mark"><svg viewBox="0 0 24 24"><path d="M12 21V9M7.5 13.5 12 9l4.5 4.5M4 5h16"/></svg></span>
                <h3>Export profile</h3>
                <p class="note">${demo ? esc(DEMO_WORDS.exportNote)
                    : `Save a complete backup of the profile currently running on the keyboard. Keep it somewhere safe before experimenting. ${esc(FIRMWARE_LINE)}`}</p>
                <button class="btn primary" data-act="export" ${canExport ? "" : "disabled"}>Export profile…</button>
            </div>
        </div>
    </div>`);
    /** @type {HTMLButtonElement} */ (actions.querySelector('[data-act="export"]')).addEventListener("click", () => post(controls.control("exportPortableProfile")));
    /** @type {HTMLButtonElement} */ (actions.querySelector('[data-act="import"]')).addEventListener("click", () => post(controls.control("choosePortableProfile")));
    wireProfileDrop(/** @type {HTMLElement} */ (actions.querySelector("[data-profile-drop]")));
    pad.appendChild(actions);

    const recoveries = shellOf(model).recoveries;
    if (!demo) pad.appendChild(recoveriesCard(recoveries));
    pad.appendChild(defaultsCard());

    main.appendChild(content);
    // The comparison is a sheet over the screen: decide, then it closes.
    if (portable.review) main.appendChild(reviewSheet(model, {...portable, review: portable.review}, busy));
    return main;
}

// Honest about what a backup is for: it restores onto the same firmware
// release, which a firmware update may not keep.
const FIRMWARE_LINE = "A backup restores onto the same firmware release; check the release notes before updating firmware.";

// What every recovery copy is, before where the shell keeps it.
const RECOVERY_NOTE = "Before every save and restart, and before leaving Live edit or restoring a backup, Ark keeps a copy of what that could lose,";

// Not built yet, and said so rather than half-built: Ark reads the
// firmware’s complete defaults, but has no whole-defaults draft control yet.
function defaultsCard() {
    return el(`<div class="card profile-defaults">
        <div class="card-h"><h3>Start from the compiled defaults</h3><span class="right"><span class="chip">Not yet available</span></span></div>
        <div class="card-b"><p class="note">A draft of the setup the firmware was built with. The firmware reports its complete defaults, but Ark does not yet offer them as a whole draft. Until then, restore a backup made before your changes.</p></div>
    </div>`);
}

/** @param {HTMLElement} card */
function wireProfileDrop(card) {
    const status = /** @type {HTMLElement} */ (card.querySelector(".profile-drop-status"));
    const choose = /** @type {HTMLButtonElement} */ (card.querySelector('[data-act="import"]'));
    let reading = false;
    const available = () => !reading && canEditArea("import");
    /** @param {string} text */
    const tell = (text) => {status.textContent = text; status.hidden = !text;};
    /** @param {DragEvent} event */
    const files = (event) => Array.from(event.dataTransfer?.types || []).includes("Files");
    for (const type of /** @type {const} */ (["dragenter", "dragover"])) card.addEventListener(type, (event) => {
        if (!files(event)) return;
        event.preventDefault();
        /** @type {DataTransfer} */ (event.dataTransfer).dropEffect = available() ? "copy" : "none";
        card.classList.toggle("drag-over", available());
    });
    card.addEventListener("dragleave", (event) => {
        if (!card.contains(/** @type {Node | null} */ (event.relatedTarget))) card.classList.remove("drag-over");
    });
    card.addEventListener("drop", async (event) => {
        if (!files(event)) return;
        event.preventDefault();
        card.classList.remove("drag-over");
        if (!available()) return;
        const dropped = Array.from(/** @type {DataTransfer} */ (event.dataTransfer).files);
        if (dropped.length !== 1) {tell("Drop one profile file at a time."); return;}
        const file = dropped[0];
        if (file.size > 196608) {tell("This profile file is too large."); return;}
        const draft = getModel()?.draft;
        if (!draft) return;
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
            tell("This profile file could not be read. Try Choose profile… instead.");
        } finally {
            reading = false;
            choose.disabled = !canEditArea("import");
        }
    });
}

// The recovery copies Ark keeps before an Apply, a Save, a restart, leaving
// Live edit or restoring a backup, each named by what made it and its keyboard.
// The browser keeps them in its storage, each usable as a draft (through the
// same comparison as a backup file), downloadable as a file, or deletable.
/** @param {import("../../contracts/model.js").RecoveryCopy[]} recoveries */
function recoveriesCard(recoveries) {
    const canImport = canEditArea("import");
    const node = el(`<div class="card recoveries">
        <div class="card-h"><h3>Recovery copies</h3><span class="right note">${recoveries.length} in this browser</span></div>
        ${recoveries.length ? `<div class="list">${recoveries.map((copy) => `<div class="list-row recovery-row">
            <span class="recovery-name" title="${esc(copy.name)}">${esc(copyTitle(copy))}</span>
            <span class="right row gap-4">
                <button class="btn compact" data-use="${esc(copy.id)}" ${canImport ? "" : "disabled"}>Use as draft</button>
                <button class="btn text" data-recovery="${esc(copy.id)}">Download</button>
                <button class="btn text destructive" data-delete="${esc(copy.id)}">Delete</button></span></div>`).join("")}</div>` : ""}
        <div class="card-b"><p class="note">${recoveries.length ? "" : "None yet. "}${RECOVERY_NOTE} here. They stay in this browser until you delete them or clear the site's data, so download any you want to keep.</p></div>
    </div>`);
    /** @param {string} attribute @param {(id: string | number) => Parameters<typeof post>[0]} message */
    const wire = (attribute, message) => /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll(`[${attribute}]`)).forEach((button) => button.addEventListener("click", () => {
        const copy = recoveries.find((entry) => String(entry.id) === button.getAttribute(attribute));
        if (copy) post(message(copy.id));
    }));
    wire("data-use", useRecovery);
    wire("data-recovery", downloadRecovery);
    wire("data-delete", deleteRecovery);
    return node;
}

// The file against the keyboard, counted area by area: enough to decide
// whether to take it. What each difference is waits for the draft's own
// review, which the file becomes.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {Partial<import("../../contracts/panel.js").PublishedModel["portable"]> & {review: NonNullable<import("../../contracts/panel.js").PublishedModel["portable"]["review"]>}} portable @param {boolean} busy */
function reviewSheet(model, portable, busy) {
    const {incoming, current, fileName, differences, fits} = portable.review;
    const draft = model?.draft;
    const pending = draft?.dirty ? draft.changes.length : 0;
    const same = differences && !differences.length;
    // A file that matches the keyboard still replaces a draft's edits.
    const changesNothing = same && !pending;
    const holds = demoOf(model).active ? "the demo setup holds" : "the keyboard runs";
    const summary = differences ? categorySummary(differences, {names: incoming.names, stages: stageOrder(model)}) : [];
    const counted = differences?.length
        ? `${differences.length} difference${differences.length === 1 ? "" : "s"} from ${demoOf(model).active ? "the demo setup" : "the keyboard"}${statusBesideCount(differences) ? ` · ${statusBesideCount(differences)}` : ""}` : "";
    const callout = !current
        ? "An interrupted restore left an incomplete configuration, so this file cannot be compared with it. This profile replaces it; the interrupted data is kept as a diagnostic copy, so keep your original backup as well."
        : draft
            ? `${pending ? `This replaces your draft and its ${pending} change${pending === 1 ? "" : "s"}; Undo brings ${pending === 1 ? "it" : "them"} back. ` : ""}${importCallout(draft)}`
            : "This replaces the keyboard's layout, behaviours, combos, custom keys, macros, trackball modes, lighting and settings. The previous profile is saved automatically before restoring, and both halves are verified afterwards.";
    const size = fits ? fitsLine(fits) : null;
    const node = el(`<div class="scrim import-scrim"><div class="sheet import-sheet" role="dialog" aria-modal="true" aria-label="${draft ? "Use this backup as your draft?" : "Restore this backup?"}">
        <div class="sheet-h"><h2>${draft ? "Use this backup as your draft?" : "Restore this backup?"}</h2>
            ${fileName ? `<span class="right note mono">${esc(fileName)}</span>` : ""}</div>
        <div class="sheet-b stack gap-12">
            ${size ? `<p class="note import-fits${size.warn ? " warn" : ""}">${esc(size.text)}</p>` : ""}
            ${counted ? `<p class="note">${esc(counted)}</p>` : ""}
            ${same ? `<div class="callout">This file holds exactly what ${holds}. ${changesNothing ? "Using it changes nothing."
                : `Using it puts your draft back to that, as Discard all does; Undo brings your ${pending} change${pending === 1 ? "" : "s"} back.`}</div>` : ""}
            ${summary.length ? `<table class="t import-diff"><thead><tr><th>What this file changes</th><th>Differences</th><th></th></tr></thead>
                <tbody>${summary.map((group) => `<tr class="cat"><td>${esc(group.category)}</td><td class="mono">${esc(group.count)}</td><td class="note">${esc(group.status)}</td></tr>
                    ${group.rows.map((row) => `<tr class="sub"><td>${esc(row.label)}</td><td class="mono">${esc(row.count)}</td><td></td></tr>`).join("")}`).join("")}</tbody></table>` : ""}
            ${same ? "" : `<div class="callout">${esc(callout)}</div>`}
        </div>
        <div class="sheet-f"><span class="right row gap-8">
            <button class="btn ghost" data-act="cancel" ${busy ? "disabled" : ""}>Cancel</button>
            <button class="btn primary" data-act="restore" ${busy || changesNothing ? "disabled" : ""}>${draft ? "Use as draft" : "Restore backup"}</button></span></div>
    </div></div>`);
    node.addEventListener("click", (event) => { if (event.target === node && !busy) post(controls.control("cancelPortableReview")); });
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="restore"]')).addEventListener("click", () => post(controls.control("restorePortableProfile")));
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="cancel"]')).addEventListener("click", () => post(controls.control("cancelPortableReview")));
    return node;
}
