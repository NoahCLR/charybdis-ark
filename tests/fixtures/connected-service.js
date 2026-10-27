// @ts-check
"use strict";

// A ProfileDeviceService connected the way the panel connects one: a scan,
// then a connection to a fake keyboard, which reads its capabilities and
// status. Tests start from this state instead of assigning the service's
// connection, request IDs, capabilities or status by hand.
const {ProfileDeviceService} = require("../../core/session/profile-device-service");
const {fakeKeyboardAdapter} = require("./fake-keyboard");
const {document} = require("./portable-profile");

/**
 * @param {{after: (fn: () => unknown) => void}} t
 * @param {Partial<import("./types.js").FakeKeyboardOptions> & {keyboard?: import("./types.js").FakeKeyboard}} [keyboard]
 * @param {import("../../core/session/types.js").DeviceServiceSettings} [options]
 */
async function connectedService(t, keyboard = {}, options = {}) {
    const adapter = fakeKeyboardAdapter(keyboard.keyboard ? {keyboard: keyboard.keyboard} : {document: document(), ...keyboard});
    const service = new ProfileDeviceService({adapter, defaultTimeoutMs: 200, ...options});
    t.after(() => service.close());
    const {devices} = await service.enumerate();
    await service.connect(devices[0].id);
    return {service, adapter, keyboard: adapter.keyboard, id: devices[0].id};
}

module.exports = {connectedService};
