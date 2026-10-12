// @ts-check
import * as controls from "../view/controls.mjs";
import {el, esc} from "../lib/dom.mjs";
import {post, render as rerender, state} from "../store.mjs";

// Leaving the demo, or replacing its file, with edits not exported: asked
// once, with Export offered first.
export function leaveDemoOverlay() {
    const leave = state.leaveDemo;
    if (state.overlay !== "leaveDemo" || !leave) return null;
    const node = el(`<div class="scrim"><div class="sheet leave-demo" role="alertdialog" aria-modal="true" aria-label="${esc(leave.ask.title)}">
        <div class="sheet-h"><h2>${esc(leave.ask.title)}</h2></div>
        <div class="sheet-b"><p>${esc(leave.ask.detail)}</p></div>
        <div class="sheet-f"><button class="btn ghost" data-act="stay">Stay in the demo</button>
            <span class="right"><button class="btn" data-act="confirm-leave">${esc(leave.ask.confirm)}</button>
                <button class="btn primary" data-act="export">Export…</button></span></div>
    </div></div>`);
    const close = () => {state.overlay = null; state.leaveDemo = null; rerender();};
    node.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (event.target === node || target.closest('[data-act="stay"]')) close();
        else if (target.closest('[data-act="export"]')) {
            close();
            post(controls.control("exportPortableProfile"));
        } else if (target.closest('[data-act="confirm-leave"]')) {
            // Posted from this click, so a host that opens a picker or a file
            // chooser for it still can.
            post(leave.message);
            close();
        }
    });
    return node;
}
