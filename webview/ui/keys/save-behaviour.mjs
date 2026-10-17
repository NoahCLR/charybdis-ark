// @ts-check
/**
 * @typedef {NonNullable<ReturnType<typeof import("../../view/behavior-editor.mjs").behaviourEditorRow>>} EditorBehavior
 */

import {getModel, post} from "../../store.mjs";
import * as edits from "../../view/edits.mjs";

// One behaviour row, posted whole: the timing fields and the anchor switch
// as they are on screen, with one cell replaced. The fields are found by their
// identity, which names this behaviour, so a search from `document` never
// reads another behaviour's form.
/** @param {ParentNode} root @param {EditorBehavior} behaviour @param {NonNullable<Parameters<typeof edits.saveBehaviour>[1]>["change"]} [change] */
export function saveBehaviour(root, behaviour, change) {
    /** @param {string} identity */
    const field = (identity) => /** @type {HTMLInputElement | undefined} */ ([...root.querySelectorAll("[data-f]")]
        .find((node) => /** @type {HTMLElement} */ (node).dataset.f === `behaviour:${behaviour.keycode}:${identity}`));
    const terms = Object.fromEntries(["tapHoldTerm", "longerHoldTerm", "multiTapTerm"].flatMap((name) => {
        const input = field(`timing:${name}`);
        return input ? [[name, input.dataset.stored]] : [];
    }));
    const anchorField = field("anchor");
    const message = edits.saveBehaviour(behaviour, {terms, anchored: anchorField ? anchorField.checked : undefined, change}, getModel()?.profileIdentity);
    if (message) post(message);
}
