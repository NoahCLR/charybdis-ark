"use strict";

// A browser has no native HID module. The web build puts this file in place of
// core/transport/node-hid-adapter.js, so node-hid never reaches the bundle, and
// a host that forgets to pass its own adapter fails with the code a missing
// node-hid gives rather than with a bundling accident.

const {LIVE_LINK_ERROR_CODES, liveLinkError} = require("../core/transport/device-adapter");

class NodeHidDeviceAdapter {
    constructor() {
        throw liveLinkError(
            LIVE_LINK_ERROR_CODES.NATIVE_MODULE_UNAVAILABLE,
            "The browser has no native HID module; pass the browser's device adapter."
        );
    }
}

module.exports = {NodeHidDeviceAdapter};
