// @ts-check
"use strict";

// A fake navigator.hid for the web page, installed before the page loads
// (page.addInitScript). It is Chrome's WebHID as far as the page can tell — a
// picker that needs a click, permissions that outlive a reload, one Charybdis
// Raw HID interface — and every output report goes to the Node test through
// the exposed binding `bridge`, where tests/fixtures/fake-keyboard.js answers
// it byte for byte. The function runs in the page, so it uses nothing from here.

// `keyboards` plugs in that many identical keyboards (one by default), all
// answered by the same fake. The picker returns `window.__fakeHidPick` (the
// first by default), and `window.__fakeHidPlug(index, plugged)` plugs one in or
// out, with Chrome's connect or disconnect event for an allowed one.
// `window.__fakeHidReenumerate(index, productName)` restarts one's USB as a
// renamed keyboard does: the old device leaves, and a new device object with
// the new product name arrives, still allowed (Chrome keys its permission to
// the serial number, which does not change).
function installFakeHid({vendorId, productId, usagePage, usage, bridge, keyboards = 1}) {
    const granted = "fake-hid-granted";
    /** @returns {number[]} */
    const allowed = () => {
        const value = localStorage.getItem(granted);
        return value === "1" ? [0] : value ? JSON.parse(value) : [];
    };
    const allow = (list) => list.length ? localStorage.setItem(granted, JSON.stringify(list)) : localStorage.removeItem(granted);
    const log = (globalThis.__fakeHid = {requested: 0, refusedWithoutClick: 0, opened: 0});
    class FakeHidDevice extends EventTarget {
        constructor(productName = "Charybdis 4x6") {
            super();
            Object.assign(this, {vendorId, productId, productName, opened: false, collections: [{usagePage, usage}]});
        }
        async open() {this.opened = true; log.opened += 1;}
        async close() {this.opened = false;}
        // Chrome's forget(): closes the device and takes back the permission.
        async forget() {
            this.opened = false;
            allow(allowed().filter((index) => index !== devices.indexOf(this)));
            log.forgotten = (log.forgotten || 0) + 1;
        }
        async sendReport(reportId, data) {
            if (!this.opened) throw new DOMException("The device must be opened first.", "InvalidStateError");
            const bytes = Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
            const replies = await globalThis[bridge](reportId, bytes);
            for (const reply of replies) {
                this.dispatchEvent(Object.assign(new Event("inputreport"), {device: this, reportId: 0, data: new DataView(Uint8Array.from(reply).buffer)}));
            }
        }
    }
    const devices = Array.from({length: keyboards}, () => new FakeHidDevice());
    const plugged = new Set(devices.keys());
    class FakeHid extends EventTarget {
        async getDevices() {return allowed().filter((index) => plugged.has(index)).map((index) => devices[index]);}
        async requestDevice({filters}) {
            log.requested += 1;
            // Chrome shows its picker only while a click is being handled.
            if (!navigator.userActivation.isActive) {
                log.refusedWithoutClick += 1;
                throw new DOMException("Must be handling a user gesture to show a permission request.", "SecurityError");
            }
            if (!filters.some((filter) => filter.vendorId === vendorId && filter.productId === productId)) return [];
            const index = globalThis.__fakeHidPick ?? 0;
            if (!plugged.has(index)) return [];
            allow([...new Set([...allowed(), index])]);
            return [devices[index]];
        }
    }
    Object.defineProperty(Navigator.prototype, "hid", {configurable: true, get: () => hid});
    const hid = new FakeHid();
    globalThis.__fakeHidPlug = (index, on) => {
        const device = devices[index];
        if (on) plugged.add(index); else {plugged.delete(index); device.opened = false;}
        if (allowed().includes(index)) hid.dispatchEvent(Object.assign(new Event(on ? "connect" : "disconnect"), {device}));
    };
    globalThis.__fakeHidReenumerate = (index, productName) => {
        globalThis.__fakeHidPlug(index, false);
        devices[index] = new FakeHidDevice(productName);
        globalThis.__fakeHidPlug(index, true);
    };
}

module.exports = {installFakeHid};
