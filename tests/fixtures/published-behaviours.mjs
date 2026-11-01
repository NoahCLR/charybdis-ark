// @ts-check
// What core publishes for a profile with only these behaviours, posted as the
// behaviour editor posts them, for the interface's tests: the profile has
// these keys, combos, settings and pointing slots (profileDocument), its own
// rows are deleted, and whatever else `edits` stages comes after. A row that
// changes nothing is posted as nothing, as the editor does.
import {createRequire} from "node:module";
import {deleteBehaviour, saveBehaviour} from "../../webview/view/edits.mjs";

const {profileDocument, publishedModel} = createRequire(import.meta.url)("./published-model.js");

/**
 * @param {Parameters<typeof profileDocument>[0] & {behaviours?: any[], edits?: object[]}} [described]
 * @returns {any}
 */
export function published({behaviours = [], edits = [], ...described} = {}) {
    const doc = profileDocument(described);
    const stored = publishedModel(doc).keyBehaviors.map((/** @type {{keycode: string}} */ row) => deleteBehaviour(row.keycode));
    return publishedModel(doc, {edits: [...stored, ...behaviours.map((row) => saveBehaviour(row)).filter(Boolean), ...edits]});
}
