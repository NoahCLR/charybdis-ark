// @ts-check
/**
 * @typedef {NonNullable<ReturnType<typeof import("../../view/behavior-editor.mjs").behaviourEditorRow>>} EditorBehavior
 * @typedef {Partial<import("../../../contracts/edits.js").BaseIdentity> | null | undefined} Identity
 */

import {post} from "../../store.mjs";
import * as edits from "../../view/edits.mjs";

// One behaviour row, posted whole: the timing fields and the anchor switch
// as they are on screen, with one cell replaced. The fields are found by their
// identity, which names this behaviour, so a search from `document` never
// reads another behaviour's form. `identity` is the profile identity of the
// model the row was drawn from, so a row drawn before a newer edit is refused
// rather than overwriting it.
/** @param {ParentNode} root @param {EditorBehavior} behaviour @param {Identity} identity @param {NonNullable<Parameters<typeof edits.saveBehaviour>[1]>["change"]} [change] */
export function saveBehaviour(root, behaviour, identity, change) {
    const message = behaviourMessage(root, behaviour, identity, change);
    if (message) post(message);
}

// The message saveBehaviour posts, for an edit that carries it (a custom key
// made for a cell's shortcut, D-L63).
/** @param {ParentNode} root @param {EditorBehavior} behaviour @param {Identity} identity @param {NonNullable<Parameters<typeof edits.saveBehaviour>[1]>["change"]} [change] */
export function behaviourMessage(root, behaviour, identity, change) {
    /** @param {string} part */
    const field = (part) => /** @type {HTMLInputElement | undefined} */ ([...root.querySelectorAll("[data-f]")]
        .find((node) => /** @type {HTMLElement} */ (node).dataset.f === `behaviour:${behaviour.keycode}:${part}`));
    const terms = Object.fromEntries(["tapHoldTerm", "longHoldTerm", "multiTapTerm"].flatMap((name) => {
        const input = field(`timing:${name}`);
        return input ? [[name, input.dataset.stored]] : [];
    }));
    const anchorField = field("anchor");
    return edits.saveBehaviour(behaviour, {terms, anchored: anchorField ? anchorField.checked : undefined, change}, identity);
}
