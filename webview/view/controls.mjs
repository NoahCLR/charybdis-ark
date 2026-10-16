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
/** @param {string} deviceId @returns {{type: 'selectDevice', deviceId: string}} */
export const selectDevice = (deviceId) => ({type: 'selectDevice', deviceId});
/** @param {string[]} names @returns {import("../../contracts/messages.js").LayerSaveControl} */
export const saveLayers = (names) => ({type: 'savePortableLayers', names});
/** @param {boolean} keysFollow @param {string[]} names @returns {import("../../contracts/messages.js").LayerEditControl} */
export const layersFollow = (keysFollow, names) => ({type: 'editPortableLayer', keysFollow, names});
/** One move of a layer: to a slot, one step up or down, or swapped with the base. @typedef {{to: number} | {direction: 1 | -1} | {makeBase: true}} LayerMove */
/** @param {number} id @param {LayerMove} change @param {string[]} names @returns {import("../../contracts/messages.js").LayerEditControl} */
export const moveLayer = (id, change, names) => ({type: 'editPortableLayer', id, ...change, names});

/** @param {boolean} visible @returns {import('../../contracts/messages.js').ControlsOn<'lighting'>} */
export const lightingSurface = visible => ({type: 'lightingSurface', visible});
/** @param {'startLightingLive' | 'pauseLightingLive' | 'stopLightingFrame'} type @returns {import('../../contracts/messages.js').ControlsOn<'lighting'>} */
export const lightingControl = type => ({type});
/** @param {number[]} frame @returns {import('../../contracts/messages.js').ControlsOn<'lighting'>} */
export const tryLightingFrame = frame => ({type: 'tryLightingFrame', frame: [...frame]});
