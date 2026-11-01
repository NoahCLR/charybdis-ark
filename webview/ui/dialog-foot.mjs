// @ts-check
// A question's foot, the same in every dialog that asks one (switching edit
// mode, a live edit's trap, moving a behaviour onto a key that has one, using
// a backup, leaving the demo, Review's Save anyway, deleting a recovery copy,
// asked in its row): a note at the left if it
// has one, and its buttons at the right, other choices first, then the way
// back, a ghost button, immediately before the primary action. A destructive
// choice that is not the primary goes last, as everywhere a row holds one.

import {esc} from "../lib/dom.mjs";

/**
 * @param {string} primary the primary action's button, markup
 * @param {{back?: string, act?: string, disabled?: boolean, tiny?: boolean, id?: string}} [way] the way back: its words (Cancel), its data-act (cancel),
 *     tiny in a row's question, and the id it takes over from the button that asked (so the focus lands on it)
 * @param {string} [before] other choices' buttons, markup
 * @param {string} [after] a destructive choice's button, markup
 * @param {string} [note] markup at the left
 */
export function dialogFoot(primary, {back = "Cancel", act = "cancel", disabled = false, tiny = false, id = ""} = {}, before = "", after = "", note = "") {
    return `${note}<span class="right">${before}<button class="btn ghost${tiny ? " tiny" : ""}" data-act="${esc(act)}"${id ? ` id="${esc(id)}"` : ""} ${disabled ? "disabled" : ""}>${esc(back)}</button>${primary}${after}</span>`;
}
