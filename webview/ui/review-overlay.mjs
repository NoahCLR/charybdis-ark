// @ts-check
import * as controls from "../view/controls.mjs";
import {el, esc} from "../lib/dom.mjs";
import {getModel, post, render as rerender, state, writable} from "../store.mjs";
import {DEMO_WORDS, demoOf} from "../view/demo.mjs";
import {discardLabel, groupNote, placeState, reviewBlocks, statusBesideCount, stillShown} from "../view/review.mjs";
import {reviewColumns, reviewItem} from "./review-items.mjs";
import {checksSection} from "./checks.mjs";
import {checkSourceGroup, checksToConfirm, confirmText} from "../view/checks.mjs";
import {shortcut} from "../view/shortcuts.mjs";
import {quietWords} from "../view/edit-mode.mjs";

export function reviewOverlay() {
    const model = getModel();
    const draft = model?.draft;
    if (!model || state.overlay !== "review" || !draft?.dirty) return null;
    // Discarding goes back to the keyboard's value; it waits while the draft
    // is out of step with the keyboard or busy, as editing does.
    const canDiscard = writable();
    /** @type {Map<import("../../contracts/model.js").Check, number | undefined>} */
    const sourceByCheck = new Map();
    /** @type {Map<number | null | undefined, {warning: number, trap: number}>} */
    const sourceCounts = new Map();
    for (const check of draft.checks) {
        const group = checkSourceGroup(check, draft.changes);
        if (group === null) continue;
        sourceByCheck.set(check, group);
        const count = sourceCounts.get(group) || {warning: 0, trap: 0};
        if (check.level === "warning" || check.level === "trap") count[check.level] += check.kind === "trapOverflow" ? (check.count ?? 1) : 1;
        sourceCounts.set(group, count);
    }
    /** @param {number | null | undefined} group */
    const sourceLabel = (group) => {
        const count = sourceCounts.get(group);
        if (!count) return "";
        return `Source of ${[count.trap && `${count.trap} trap${count.trap === 1 ? "" : "s"}`, count.warning && `${count.warning} warning${count.warning === 1 ? "" : "s"}`].filter(Boolean).join(" and ")}`;
    };
    /** @param {import("../../contracts/model.js").ReviewChange} entry @param {number} index @param {string} discard @param {boolean} titleSlot @param {string} source */
    const item = (entry, index, discard, titleSlot, source) => reviewItem(model, entry, {discard, titleSlot, sourceLabel: source,
        show: stillShown(entry) && placeState(entry.place, model.layers) ? `<button class="btn tiny ghost" data-show="${index}"
            data-tip="Close the review and open this where it is edited.">Show</button>` : ""});
    const demo = demoOf(model);
    // Live + review compares the keyboard's saved profile with what it runs
    // now; Save makes that permanent (firmware D-F32).
    const live = Boolean(draft.live);
    // In Live the keyboard saves by itself: the review only shows what is not
    // saved yet, with Revert, and Save again only once its own save failed.
    const keyboardSaves = draft.live?.mode === 1;
    const columns = live ? reviewColumns("What changes", "Saved", "Running now")
        : reviewColumns("What changes", demo.active ? "In the demo setup" : "On the keyboard", "In your draft");
    const discardable = draft.changes.every((change) => Number.isInteger(change.group));
    /** @type {import("../../contracts/model.js").ReviewChange[]} */
    const shown = [];
    const sections = reviewBlocks(draft.changes).map(({area, blocks, count}) => `<section class="rv-sect">
        <div class="sect-h"><h4>${esc(area)}</h4><span class="right tag">${esc(count)}</span></div>
        ${columns}
        ${((titleSlot) => blocks.map((block) => {
            const grouped = block.size > 1;
            const source = sourceCounts.get(block.group);
            const sourceClass = source ? ` source-${source.trap ? "trap" : "warning"}` : "";
            const discard = discardable ? `<button class="btn tiny ghost" data-discard="${esc(block.group)}" ${canDiscard ? "" : "disabled"}
                data-tip="${esc(live ? (grouped ? `Put these ${block.size} changes back to what is saved, on the keyboard at once. They were made together, so they go back together.` : "Put this change back to what is saved, on the keyboard at once.")
                    : grouped ? `Put these ${block.size} changes back to what the keyboard holds. They were made together, so they go back together.` : "Put this change back to what the keyboard holds.")}">${esc(discardLabel(block))}</button>` : "";
            const items = block.items.map((entry, index) => item(entry, shown.push(entry) - 1, grouped ? "" : discard, titleSlot, index === 0 ? sourceLabel(block.group) : "")).join("");
            return grouped
                ? `<div class="rv-block grouped${sourceClass}" data-group="${esc(block.group)}"><div class="rv-group-h"><span class="rv-group-t"><span>${esc(block.title || "Made together")}</span>
                    <span class="note">${esc(groupNote(block))}</span></span><span class="rv-act wide">${discard}</span></div>${items}</div>`
                : `<div class="rv-block${sourceClass}" data-group="${esc(block.group)}">${items}</div>`;
        }).join(""))(blocks.some((block) => block.items.some((entry) => entry.titleMark)))}</section>`).join("");
    const summary = statusBesideCount(draft.changes);
    // Checks that point at a key or a combo open it as review items do.
    /** @type {import("../../contracts/model.js").Check[]} */
    const checked = [];
    const checks = checksSection(draft.checks, (check) => check.status !== "fixed" && placeState(check.place, model.layers)
        ? `<button class="btn tiny ghost" data-show-check="${checked.push(check) - 1}" data-tip="Close the review and open this where it is edited.">Show</button>` : "",
    (check) => {
        const group = sourceByCheck.get(check);
        if (group === undefined) return "";
        const change = draft.changes.find((entry) => entry.group === group);
        if (!change) return "";
        return `<button class="ck-source" data-check-source="${esc(group)}" type="button">From draft: ${esc(change.groupTitle || change.title)} ↓</button>`;
    }, draft.live ? "Save" : "Apply", demo.active);
    // Ask about active warnings and traps for this revision before writing.
    const confirmChecks = checksToConfirm(draft.checks);
    const confirming = confirmChecks.length && state.confirmChecks === draft.revision;
    const hasTrap = confirmChecks.some((check) => check.level === "trap");
    const blockers = draft.checks.filter((check) => check.level === "blocker" && check.status !== "fixed");
    const canApply = draft.reviewed && draft.connected && !draft.stale && !blockers.length;
    const node = el(`<div class="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-label="Review changes">
        <div class="sheet-h"><h2>Review ${draft.changes.length} change${draft.changes.length === 1 ? "" : "s"}</h2>
            ${summary ? `<span class="note">${esc(summary)}</span>` : ""}
            <span class="right"><button class="btn ghost" data-act="close">Close</button></span></div>
        <div class="sheet-b rv">
            ${checks}
            ${sections}
            <div class="rv-apply-note"><div class="callout warn">${demo.active ? esc(demo.applyNeedsKeyboard)
                : keyboardSaves ? `The keyboard already runs these changes and saves them by itself after ${esc(quietWords(draft.live?.keyboard))} without typing. Revert puts back what is saved.`
                : live ? "The keyboard already runs these changes. Save keeps a recovery copy of what is saved now, then writes them as its saved profile on both halves. Revert, or unplugging the keyboard, puts back what is saved."
                : "Apply saves a recovery copy, writes the changes to both halves, then switches both to them at once. Until then the keyboard keeps running its saved profile; if anything interrupts Apply, the recovery copy restores it."}</div></div>
        </div>
        ${demo.active ? `<div class="sheet-f demo-apply"><span class="note"><i class="dot demo"></i> ${esc(DEMO_WORDS.status)}</span>
            <span class="right"><button class="btn primary" data-act="export">Export…</button></span></div>`
        : confirming ? `<div class="sheet-f ck-confirm ${hasTrap ? "trap" : "warning"}" role="alertdialog" aria-label="Confirm profile checks">
            <span class="ck-confirm-t"><i class="dot ${hasTrap ? "err" : "warn"}"></i>${esc(confirmText(confirmChecks, live ? "save" : "apply"))}</span>
            <span class="right"><button class="btn" data-act="unconfirm">Go back</button>
                <button class="btn primary" data-act="apply-anyway" ${canApply ? "" : "disabled"}>${live ? "Save anyway" : "Apply anyway"}</button></span></div>`
        : `<div class="sheet-f"><span class="note" data-tip="${esc(model?.device?.summary || "")}">${esc(model?.device?.label || "")} · ${esc(model?.device?.savedProfile || "")}</span>
            <span class="right">${live ? `<button class="btn ghost" data-act="revert" data-tip="${esc(`Put back what is saved. Nothing is written; Undo (${shortcut("Z")}) sends the edits again.`)}">Revert</button>` : ""}
                ${keyboardSaves ? draft.live?.keyboard?.saveFailed ? `<button class="btn primary" data-act="save-again" ${draft.connected && !draft.stale ? "" : "disabled"}
                    data-tip="${esc("The keyboard's own save failed. Ask it to save these edits again, after a recovery copy of what is saved now.")}">Save again</button>` : ""
                : `<button class="btn primary" data-act="apply" ${canApply ? "" : "disabled"}
                    ${blockers.length ? `data-tip="${esc(`Resolve the blockers in Checks before ${live ? "saving" : "applying"}.`)}"` : confirmChecks.length ? `data-tip="${esc("Warnings and traps will be asked about before anything is written.")}"` : ""}>${live ? "Save on keyboard" : "Apply to keyboard"}</button>`}</span></div>`}
    </div></div>`);
    // Pointing at a group's Discard lights what it takes back, in every area
    // the group reaches.
    /** @type {NodeListOf<HTMLButtonElement>} */ (node.querySelectorAll(".rv-block.grouped [data-discard]")).forEach((button) => {
        const parts = node.querySelectorAll(`.rv-block.grouped[data-group="${button.dataset.discard}"]`);
        button.addEventListener("mouseenter", () => parts.forEach((part) => part.classList.add("lit")));
        button.addEventListener("mouseleave", () => parts.forEach((part) => part.classList.remove("lit")));
    });
    node.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest('[data-act="export"]')) {
            post(controls.control("exportPortableProfile"));
            return;
        }
        const discard = /** @type {HTMLButtonElement | null} */ (target.closest("[data-discard]"));
        if (discard) {
            post(controls.discardChanges(Number(discard.dataset.discard)));
            return;
        }
        const showCheck = /** @type {HTMLButtonElement | null} */ (target.closest("[data-show-check]"));
        if (showCheck) {
            Object.assign(state, placeState(checked[Number(showCheck.dataset.showCheck)].place, model.layers), {overlay: null, confirmChecks: null});
            post(controls.control("closeProfileDraftReview"));
            rerender();
            return;
        }
        const source = /** @type {HTMLButtonElement | null} */ (target.closest("[data-check-source]"));
        if (source) {
            const parts = node.querySelectorAll(`.rv-block[data-group="${source.dataset.checkSource}"]`);
            parts[0]?.scrollIntoView({behavior: "smooth", block: "center"});
            parts.forEach((part) => part.classList.add("source-focus"));
            setTimeout(() => parts.forEach((part) => part.classList.remove("source-focus")), 2000);
            return;
        }
        if (target.closest('[data-act="unconfirm"]')) {
            state.confirmChecks = null;
            rerender();
            return;
        }
        if (target.closest('[data-act="apply-anyway"]')) {
            state.overlay = null;
            state.confirmChecks = null;
            post(live ? controls.saveDraft(true) : controls.applyDraft(true));
            rerender();
            return;
        }
        if (target.closest('[data-act="save-again"]')) {
            state.overlay = null;
            post(controls.saveDraft());
            rerender();
            return;
        }
        if (target.closest('[data-act="revert"]')) {
            state.overlay = null;
            post(controls.revertDraft());
            rerender();
            return;
        }
        const show = /** @type {HTMLButtonElement | null} */ (target.closest("[data-show]"));
        if (show) {
            Object.assign(state, placeState(shown[Number(show.dataset.show)].place, model.layers), {overlay: null});
            post(controls.control("closeProfileDraftReview"));
            rerender();
            return;
        }
        // The sheet closes at once; the core's answer only refreshes what it says.
        if (event.target === node || target.closest('[data-act="close"]')) {
            state.overlay = null;
            state.confirmChecks = null;
            post(controls.control("closeProfileDraftReview"));
            rerender();
        }
        if (target.closest('[data-act="apply"]')) {
            if (confirmChecks.length) {
                state.confirmChecks = draft.revision;
                rerender();
                return;
            }
            state.overlay = null;
            post(live ? controls.saveDraft() : controls.applyDraft());
            rerender();
        }
    });
    return node;
}
