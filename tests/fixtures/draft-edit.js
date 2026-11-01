// @ts-check
"use strict";
// A draft edit made as the panel's are: through applyDraftEdit
// (core/model/draft-editor.js), which sends the message to its editor by its
// type and checks the form was drawn from the draft before the editor runs.
const {applyDraftEdit} = require("../../core/model/draft-editor");

/** @typedef {Parameters<typeof applyDraftEdit>} Args */
/** @param {Args[0]} snapshot @param {Args[1]} message @param {NonNullable<Args[2]>["capabilities"]} [capabilities] */
const draftEdit = (snapshot, message, capabilities) => applyDraftEdit(snapshot, message, {capabilities});

module.exports = {draftEdit};
