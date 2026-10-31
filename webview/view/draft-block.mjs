// @ts-check
// Why the open draft takes no edit (D-L60), in core's words for each reason
// it publishes (`DraftBlock`, model.vocabulary.draftBlocks): the sentence a
// control says where it is (edit-gate.mjs), and the title and detail a
// screen shows in place of the editor (readiness.mjs). A live draft is what
// the keyboard runs, so it is read again rather than reviewed.

/**
 * @typedef {import("../../contracts/panel.js").DraftBlock} DraftBlock
 * @typedef {{sentence: string, title: string, detail: string}} DraftBlockWords
 * @typedef {{vocabulary?: {draftBlocks?: import("../../contracts/model.js").Vocabulary["draftBlocks"]}} | null | undefined} WordsModel
 */

/** @param {WordsModel} model @param {DraftBlock | undefined} reason @param {boolean} [live] @returns {DraftBlockWords | null} */
export function draftBlockWords(model, reason, live = false) {
    const words = reason ? model?.vocabulary?.draftBlocks?.[reason] : undefined;
    return words ? {sentence: words.sentence, title: words.title, detail: (live && words.liveDetail) || words.detail} : null;
}
