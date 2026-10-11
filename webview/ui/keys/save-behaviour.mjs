// @ts-check
/**
 * @typedef {NonNullable<ReturnType<typeof import("../../view/behavior-editor.mjs").behaviourEditorRow>>} EditorBehavior
 */

import {getModel, post} from "../../store.mjs";
import * as edits from "../../view/edits.mjs";

// One behaviour row, posted whole: the timing fields and the anchor switch
// as they are on screen, with one cell replaced.
/** @param {ParentNode} root @param {EditorBehavior} behaviour @param {NonNullable<Parameters<typeof edits.saveBehaviour>[1]>["change"]} [change] */
export function saveBehaviour(root, behaviour, change) {
    const terms = Object.fromEntries(["tapHoldTerm", "longerHoldTerm", "multiTapTerm"].flatMap((name) => {
        const field = /** @type {HTMLInputElement | null} */ (root.querySelector(`[data-term="${name}"]`));
        return field ? [[name, field.dataset.stored]] : [];
    }));
    const anchorField = /** @type {HTMLInputElement | null} */ (root.querySelector("[data-anchor]"));
    const message = edits.saveBehaviour(behaviour, {terms, anchored: anchorField ? anchorField.checked : undefined, change}, getModel()?.profileIdentity);
    if (message) post(message);
}
