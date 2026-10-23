// @ts-check
/**
 * @typedef {NonNullable<ReturnType<typeof import("../../view/behavior-editor.mjs").behaviourEditorRow>>} EditorBehavior
 */

import {el, esc} from "../../lib/dom.mjs";
import {behaviourListeningTo, canonicalKeycode} from "../../view/keyface.mjs";
import {getModel, post, render, state} from "../../store.mjs";
import * as edits from "../../view/edits.mjs";
import {openPicker} from "../picker.mjs";
import {actionMarked} from "../marks.mjs";
import {shortcut} from "../../view/shortcuts.mjs";

// A behaviour belongs to the key it listens to, so changing that key moves the
// whole row. A key that already has a row is never replaced silently: the
// person chooses to overwrite it, swap the two, or leave both alone.
/** @param {EditorBehavior} behaviour */
export function pickBehaviourKey(behaviour) {
    openPicker({
        title: "Key this behaviour listens to",
        contextKeycode: behaviour.keycode,
        seed: [behaviour.keycode],
        onPick: (expression) => {
            const model = getModel();
            const to = canonicalKeycode(model, expression);
            if (!to || to === canonicalKeycode(model, behaviour.keycode)) { render(); return; }
            const existing = behaviourListeningTo(model, expression);
            if (existing) { state.retarget = {from: behaviour.keycode, to: expression, existing: existing.keycode}; render(); return; }
            retargetBehaviour(behaviour.keycode, expression);
        },
    });
}

/** @param {string} from @param {string} to @param {"swap" | "overwrite"} [conflict] */
function retargetBehaviour(from, to, conflict) {
    const model = getModel();
    state.retarget = null;
    const row = conflict === "swap" || conflict === "overwrite"
        ? behaviourListeningTo(model, to)?.keycode || canonicalKeycode(model, to) : canonicalKeycode(model, to);
    // The editor that moved it follows it to its new key: the Keys screen's
    // open row, or on Custom keys the key now holding it if that is one. Moved
    // from Custom keys to any other key, it opens on the Keys screen, where
    // that key's behaviours are, rather than leaving an empty editor here.
    const toCustomKey = (model?.customKeys || []).some((key) => key.keycode === row);
    if (state.screen === "customKeys" && !toCustomKey) Object.assign(state, {screen: "keys", tab: "behaviours", behaviourRoute: null});
    if (state.screen === "keys" || state.behaviourRow === from) {
        state.behaviourRow = row;
        state.behaviourRowShown = null;
    }
    if (state.screen === "customKeys") state.customKey = row;
    state.cell = null;
    post(edits.retargetBehaviour(from, to, model?.profileIdentity, conflict));
    render();
}

/** @param {EditorBehavior} behaviour */
export function retargetPrompt(behaviour) {
    const model = getModel();
    const {to, existing} = /** @type {NonNullable<typeof state.retarget>} */ (state.retarget);
    /** @param {string} keycode */
    const name = (keycode) => `<b>${actionMarked(model, keycode)}</b> <code class="dim">${esc(keycode)}</code>`;
    const node = el(`<div class="scrim"><div class="sheet retarget" role="alertdialog" aria-modal="true" aria-label="Key already has a behaviour">
        <div class="sheet-h"><h2>${actionMarked(model, existing)} already has a behaviour</h2></div>
        <div class="sheet-b"><p>
            You are moving the behaviour on ${name(behaviour.keycode)} to ${name(existing)}, which has its own.</p>
            <ul class="note">
                <li><b>Overwrite</b> replaces it; ${actionMarked(model, behaviour.keycode)} then sends its plain keycode.</li>
                <li><b>Swap</b> gives each key the other's behaviour.</li></ul></div>
        <div class="sheet-f"><span class="note">Both are one step in the draft, so ${shortcut("Z")} takes them back.</span>
            <span class="right"><button class="btn" data-act="cancel">Cancel</button>
                <button class="btn" data-act="swap">Swap</button>
                <button class="btn primary" data-act="overwrite">Overwrite</button></span></div>
    </div></div>`);
    node.addEventListener("click", (event) => {
        const act = event.target === node ? "cancel" : /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest("[data-act]"))?.dataset.act;
        if (act === "cancel") { state.retarget = null; render(); }
        if (act === "swap" || act === "overwrite") retargetBehaviour(behaviour.keycode, to, act);
    });
    queueMicrotask(() => /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="cancel"]'))?.focus());
    return node;
}
