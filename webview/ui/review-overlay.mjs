// @ts-check
import * as controls from "../view/controls.mjs";
import {el, esc} from "../lib/dom.mjs";
import {scrollMotion} from "../lib/scroll.mjs";
import {getModel, post, render as rerender, state} from "../store.mjs";
import {editGate} from "../view/edit-gate.mjs";
import {DEMO_WORDS, demoOf} from "../view/demo.mjs";
import {discardLabel, groupNote, placeState, reviewBlocks, saveOffReason, statusBesideCount, stillShown} from "../view/review.mjs";
import {reviewColumns, reviewItem} from "./review-items.mjs";
import {checksSection} from "./checks.mjs";
import {checkSources, checksToConfirm, confirmText, levelCountWords} from "../view/checks.mjs";
import {shortcut} from "../view/shortcuts.mjs";
import {LIVE, quietWords} from "../view/edit-mode.mjs";
import {dialogFoot} from "./dialog-foot.mjs";

export function reviewOverlay() {
    const model = getModel();
    const draft = model?.draft;
    if (!model || state.overlay !== "review" || !draft?.dirty) return null;
    // Discarding goes back to the keyboard's value; it waits while the draft
    // is out of step with the keyboard or busy, as editing does.
    const canDiscard = editGate(model, "discard").editable;
    const {groupOf: sourceByCheck, counts: sourceCounts} = checkSources(draft.checks, draft.changes);
    /** @param {number | null | undefined} group */
    const sourceLabel = (group) => {
        const count = sourceCounts.get(group);
        return count ? `Source of ${levelCountWords(count)}` : "";
    };
    /** @param {import("../../contracts/model.js").ReviewChange} entry @param {number} index @param {string} discard @param {boolean} titleSlot @param {string} source */
    const item = (entry, index, discard, titleSlot, source) => reviewItem(model, entry, {discard, titleSlot, sourceLabel: source,
        show: stillShown(entry) && placeState(entry.place, model.layers) ? `<button class="btn tiny ghost" data-show="${index}"
            data-tip="Close the review and open this where it is edited.">Show</button>` : ""});
    const demo = demoOf(model);
    // Live preview + save compares the keyboard's saved profile with what it
    // runs now; Save makes that permanent (firmware D-F32).
    const live = Boolean(draft.live);
    // In Live edit the keyboard saves by itself: the review only shows what is
    // not saved yet, with Revert, and Save again only once its own save failed.
    const keyboardSaves = draft.live?.mode === LIVE;
    const columns = live ? reviewColumns("What changes", "Saved", "Running now")
        : reviewColumns("What changes", demo.active ? "In the demo profile" : "On the keyboard", "In your draft");
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
    const checks = checksSection(model, draft.checks, (check) => check.status !== "fixed" && placeState(check.place, model.layers)
        ? `<button class="btn tiny ghost" data-show-check="${checked.push(check) - 1}" data-tip="Close the review and open this where it is edited.">Show</button>` : "",
    (check) => {
        const group = sourceByCheck.get(check);
        if (group === undefined) return "";
        const change = draft.changes.find((entry) => entry.group === group);
        if (!change) return "";
        return `<button class="ck-source" data-check-source="${esc(group)}" type="button">From draft: ${esc(change.groupTitle || change.title)} ↑</button>`;
    }, demo.active, checkGroupsOpened(draft.revision));
    // Ask about active warnings and traps for this revision before writing.
    const confirmChecks = checksToConfirm(draft.checks);
    const confirming = confirmChecks.length && state.confirmChecks === draft.revision;
    const hasTrap = confirmChecks.some((check) => check.level === "trap");
    // A Save that is off says why beside it (and to a screen reader through
    // aria-describedby), never only in a tip.
    const why = saveOffReason(model, draft);
    const canApply = !why;
    const againWhy = saveOffReason(model, {...draft, checks: [], reviewed: true});
    /** @param {string} reason */
    const whyNote = (reason) => reason ? `<span class="note save-why" id="review-save-why">${esc(reason)}</span>` : "";
    const describedBy = (/** @type {string} */ reason) => reason ? ' aria-describedby="review-save-why"' : "";
    const node = el(`<div class="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-label="Review changes">
        <div class="sheet-h"><h2>Review ${draft.changes.length} change${draft.changes.length === 1 ? "" : "s"}</h2>
            ${summary ? `<span class="note">${esc(summary)}</span>` : ""}
            <span class="right"><button class="btn ghost" data-act="close">Close</button></span></div>
        <div class="sheet-b rv">
            ${sections}
            ${checks}
            <div class="rv-apply-note"><div class="callout warn">${demo.active ? esc(demo.applyNeedsKeyboard)
                : keyboardSaves ? `The keyboard already runs these changes and saves them by itself after ${esc(quietWords(draft.live?.keyboard))} without typing. Revert puts back what is saved.`
                : live ? "The keyboard already runs these changes. Save keeps a recovery copy of what is saved now, then makes them its saved profile on both halves. Revert, or unplugging the keyboard, puts back what is saved."
                : "Save keeps a recovery copy, sends the changes to both halves, then switches both to them at once. Until then the keyboard keeps running its saved profile; if anything interrupts the save, the recovery copy keeps what it held."}</div></div>
        </div>
        ${demo.active ? `<div class="sheet-f demo-apply"><span class="note"><i class="dot demo"></i> ${esc(DEMO_WORDS.status)}</span>
            <span class="right"><button class="btn primary" data-act="export">Export profile…</button></span></div>`
        : confirming ? `<div class="sheet-f ck-confirm ${hasTrap ? "trap" : "warning"}" role="alertdialog" aria-label="Confirm profile checks">
            <span class="ck-confirm-t"><i class="dot ${hasTrap ? "err" : "warn"}"></i>${esc(confirmText(confirmChecks, live ? "save" : "apply"))}</span>
            ${dialogFoot(`<button class="btn primary" data-act="apply-anyway" ${canApply ? "" : "disabled"}${describedBy(why)}>Save anyway</button>`, {back: "Go back", act: "unconfirm"}, whyNote(why))}</div>`
        : `<div class="sheet-f"><span class="note" data-tip="${esc(model?.device?.summary || "")}">${esc(model?.device?.label || "")} · ${esc(model?.device?.savedProfile || "")}</span>
            <span class="right">${whyNote(keyboardSaves ? draft.live?.keyboard?.saveFailed ? againWhy : "" : why)}${live ? `<button class="btn ghost" data-act="revert" data-tip="${esc(`Put back what is saved. The saved profile stays as it is; Undo (${shortcut("Z")}) sends the edits again.`)}">Revert</button>` : ""}
                ${keyboardSaves ? draft.live?.keyboard?.saveFailed ? `<button class="btn primary" data-act="save-again" ${againWhy ? `disabled${describedBy(againWhy)}` : ""}
                    data-tip="${esc("The keyboard's own save failed. Ask it to save these edits again, after a recovery copy of what is saved now.")}">Save again</button>` : ""
                : `<button class="btn primary" data-act="apply" ${canApply ? "" : `disabled${describedBy(why)}`}
                    ${!canApply ? "" : confirmChecks.length ? `data-tip="${esc("Warnings and traps will be asked about before anything is saved.")}"` : ""}>Save to keyboard</button>`}</span></div>`}
    </div></div>`);
    // A check group opened or folded by hand stays so while the review shows
    // this revision of the draft, whatever renders it again.
    /** @type {NodeListOf<HTMLDetailsElement>} */ (node.querySelectorAll("details[data-check-group]")).forEach((group) => group.addEventListener("toggle", () => {
        if (!group.isConnected) return;
        state.checkGroupsOpen = {revision: draft.revision, open: {...checkGroupsOpened(draft.revision), [group.dataset.checkGroup || ""]: group.open}};
    }));
    // Pointing at a group's Discard, or reaching it with the keyboard, lights
    // what it takes back, in every area the group reaches.
    /** @type {NodeListOf<HTMLButtonElement>} */ (node.querySelectorAll(".rv-block.grouped [data-discard]")).forEach((button) => {
        const parts = node.querySelectorAll(`.rv-block.grouped[data-group="${button.dataset.discard}"]`);
        const light = () => parts.forEach((part) => part.classList.add("lit"));
        const unlight = () => parts.forEach((part) => part.classList.remove("lit"));
        button.addEventListener("mouseenter", light);
        button.addEventListener("mouseleave", () => {if (document.activeElement !== button) unlight();});
        button.addEventListener("focus", light);
        button.addEventListener("blur", () => {if (!button.matches(":hover")) unlight();});
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
            parts[0]?.scrollIntoView({behavior: scrollMotion(), block: "center"});
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

// The check groups opened or folded by hand for `revision`; a new revision
// starts from each group's own default again.
/** @param {number} revision @returns {Readonly<Record<string, boolean>>} */
const checkGroupsOpened = (revision) => (state.checkGroupsOpen?.revision === revision ? state.checkGroupsOpen.open : {});
