// @ts-check
"use strict";

// The Profile Wire request ids of one connection (profile-device-service.js):
// 1 to 255, then 1 again, never 0.
class ProfileRequestIdSequence {
    constructor(start = 1) {
        this.value = normalizeRequestId(start);
    }

    next() {
        const current = this.value;
        this.value = current === 0xff ? 1 : current + 1;
        return current;
    }
}

/** @param {unknown} value */
function normalizeRequestId(value) {
    const requestId = Number(value);
    if (!Number.isInteger(requestId) || requestId < 1 || requestId > 0xff) {
        throw new RangeError("Profile Wire request id must be an integer from 1 through 255.");
    }
    return requestId;
}

module.exports = {ProfileRequestIdSequence, normalizeRequestId};
