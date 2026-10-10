"use strict";
const HOST_SETTING = 27, UNICODE_ENABLED = 0x100;
function hostSettings(values, detected = 0) {
    const word = values?.[HOST_SETTING] || 0, selected = word & 3;
    const effective = selected || (Number.isInteger(detected) && detected >= 0 && detected <= 3 ? detected : 0);
    return {selected, detected, effective, unicodeEnabled: Boolean(word & UNICODE_ENABLED), unicodeMode: word & UNICODE_ENABLED ? effective : 0};
}
module.exports = {HOST_SETTING, UNICODE_ENABLED, hostSettings};
