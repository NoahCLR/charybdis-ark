"use strict";

// A fake navigator.hid for the web page, installed before the page loads
// (page.addInitScript). It is Chrome's WebHID as far as the page can tell — a
// picker that needs a click, permissions that outlive a reload, one Charybdis
// Raw HID interface — and every output report goes to the Node test through
// the exposed binding `bridge`, where tests/fixtures/fake-keyboard.js answers
// it byte for byte. The function runs in the page, so it uses nothing from here.

function installFakeHid({vendorId, productId, usagePage, usage, bridge}) {
    const granted = "fake-hid-granted";
    const log = (globalThis.__fakeHid = {requested: 0, refusedWithoutClick: 0, opened: 0});
    class FakeHidDevice extends EventTarget {
        constructor() {
            super();
            Object.assign(this, {vendorId, productId, productName: "Charybdis 4x6", opened: false, collections: [{usagePage, usage}]});
        }
        async open() {this.opened = true; log.opened += 1;}
        async close() {this.opened = false;}
        async sendReport(reportId, data) {
            if (!this.opened) throw new DOMException("The device must be opened first.", "InvalidStateError");
            const bytes = Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
            const replies = await globalThis[bridge](reportId, bytes);
            for (const reply of replies) {
                this.dispatchEvent(Object.assign(new Event("inputreport"), {device: this, reportId: 0, data: new DataView(Uint8Array.from(reply).buffer)}));
            }
        }
    }
    const device = new FakeHidDevice();
    class FakeHid extends EventTarget {
        async getDevices() {return localStorage.getItem(granted) ? [device] : [];}
        async requestDevice({filters}) {
            log.requested += 1;
            // Chrome shows its picker only while a click is being handled.
            if (!navigator.userActivation.isActive) {
                log.refusedWithoutClick += 1;
                throw new DOMException("Must be handling a user gesture to show a permission request.", "SecurityError");
            }
            if (!filters.some((filter) => filter.vendorId === vendorId && filter.productId === productId)) return [];
            localStorage.setItem(granted, "1");
            return [device];
        }
    }
    Object.defineProperty(Navigator.prototype, "hid", {configurable: true, get: () => hid});
    const hid = new FakeHid();
}

module.exports = {installFakeHid};
