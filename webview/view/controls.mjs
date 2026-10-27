// @ts-check
// Commands without an edit payload still cross the same panel boundary.
// Keep their authored shapes here, beside the edit builders.

/** @typedef {'ready' | 'refresh' | 'reviewProfileDraft' | 'closeProfileDraftReview' | 'undoProfileDraft' | 'redoProfileDraft' | 'discardProfileDraft' | 'rebaseProfileDraft' | 'openProfileDraftHistory' | 'closeProfileDraftHistory' | 'exportPortableProfile' | 'choosePortableProfile' | 'restorePortableProfile' | 'managePortableLayers' | 'cancelPortableReview'} SimpleControl */

/** @template {SimpleControl} T @param {T} type @returns {{type: T}} */
export const control = (type) => ({type});
/** @param {boolean} [confirmChecks] @returns {import("../../contracts/messages.js").DraftControl} */
export const applyDraft = (confirmChecks) => ({type: 'applyProfileDraft', ...(confirmChecks === undefined ? {} : {confirmChecks})});
/** @param {number} group @returns {import("../../contracts/messages.js").DraftControl} */
export const discardChanges = (group) => ({type: 'discardProfileDraftChanges', group});
/** @param {number} step @returns {import("../../contracts/messages.js").DraftControl} */
export const jumpDraft = (step) => ({type: 'jumpProfileDraft', step});
// Read keyboard; from an open Diagnostics, each half's flash pauses after it.
/** @param {boolean} [flashPauses] @returns {{type: 'refresh', flashPauses?: true}} */
export const readKeyboard = (flashPauses) => ({type: 'refresh', ...(flashPauses ? {flashPauses: true} : {})});
// Diagnostics opened: read each half's flash pauses.
/** @returns {{type: 'readFlashPauses'}} */
export const readFlashPauses = () => ({type: 'readFlashPauses'});
/** @param {string} deviceId @returns {{type: 'selectDevice', deviceId: string}} */
export const selectDevice = (deviceId) => ({type: 'selectDevice', deviceId});
/** @param {string[]} names @returns {import("../../contracts/messages.js").LayerSaveControl} */
export const saveLayers = (names) => ({type: 'savePortableLayers', names});
/** @param {boolean} keysFollow @param {string[]} names @returns {import("../../contracts/messages.js").LayerEditControl} */
export const layersFollow = (keysFollow, names) => ({type: 'editPortableLayer', keysFollow, names});
/** One move of a layer: to a slot, one step up or down, or swapped with the base. @typedef {{to: number} | {direction: 1 | -1} | {makeBase: true}} LayerMove */
/** @param {number} id @param {LayerMove} change @param {string[]} names @returns {import("../../contracts/messages.js").LayerEditControl} */
export const moveLayer = (id, change, names) => ({type: 'editPortableLayer', id, ...change, names});

// Live preview + save (firmware D-F32): the keyboard's Save and Revert, the
// answer to a live edit's trap check, and how edits reach the keyboard.
/** @param {boolean} [confirmChecks] @returns {import("../../contracts/messages.js").DraftControl} */
export const saveDraft = (confirmChecks) => ({type: 'saveProfileDraft', ...(confirmChecks === undefined ? {} : {confirmChecks})});
/** @returns {import("../../contracts/messages.js").DraftControl} */
export const revertDraft = () => ({type: 'revertProfileDraft'});
/** @param {number} proposal @returns {import("../../contracts/messages.js").DraftControl} */
export const confirmLiveEdit = (proposal) => ({type: 'confirmLiveEdit', proposal});
/** @param {number} proposal @returns {import("../../contracts/messages.js").DraftControl} */
export const cancelLiveEdit = (proposal) => ({type: 'cancelLiveEdit', proposal});
// Cancel edit: the keyboard holds the edit until no key is held, and drops it.
/** @returns {import("../../contracts/messages.js").DraftControl} */
export const abortLiveEdit = () => ({type: 'abortLiveEdit'});
// A keyboard that stopped saving (firmware D-F34): restart both halves.
/** @returns {import("../../contracts/messages.js").DraftControl} */
export const restartKeyboard = () => ({type: 'restartKeyboard'});
/** @param {0 | 1 | 2} mode @param {'save' | 'revert' | 'send' | 'discard'} [pending] @param {boolean} [confirmChecks] @returns {import("../../contracts/messages.js").DraftControl} */
export const setEditMode = (mode, pending, confirmChecks) => ({type: 'setEditMode', mode, ...(pending ? {pending} : {}), ...(confirmChecks ? {confirmChecks} : {})});
