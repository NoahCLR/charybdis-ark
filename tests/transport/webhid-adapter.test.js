"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
    CHARYBDIS_PRODUCT_ID,
    CHARYBDIS_VENDOR_ID,
    LIVE_LINK_ERROR_CODES,
    QMK_RAW_HID_USAGE,
    QMK_RAW_HID_USAGE_PAGE,
    RAW_HID_REPORT_SIZE,
} = require("../../core/transport/device-adapter");
const nodeHidAdapter = require("../../core/transport/node-hid-adapter");
const {DeviceRequestCoordinator} = require("../../core/transport/request-coordinator");
const {
    WebHidDeviceAdapter,
    normalizeWebHidInputReport,
} = require("../../core/transport/webhid-adapter");

// A stand-in for Chrome's HIDDevice: an EventTarget that records what it is
// sent and lets a test raise inputreport events the way the browser does.
class FakeHidDevice extends EventTarget {
    constructor(overrides = {}) {
        super();
        this.vendorId = CHARYBDIS_VENDOR_ID;
        this.productId = CHARYBDIS_PRODUCT_ID;
        this.productName = "Charybdis 4x6";
        this.collections = [{usagePage: QMK_RAW_HID_USAGE_PAGE, usage: QMK_RAW_HID_USAGE}];
        this.opened = false;
        this.openCalls = 0;
        this.closeCalls = 0;
        this.sent = [];
        this.respond = undefined;
        this.failOpen = undefined;
        this.failSend = undefined;
        Object.assign(this, overrides);
    }

    async open() {
        this.openCalls += 1;
        if (this.failOpen) {
            throw this.failOpen;
        }
        this.opened = true;
    }

    async close() {
        this.closeCalls += 1;
        this.opened = false;
    }

    async sendReport(reportId, data) {
        if (this.failSend) {
            throw this.failSend;
        }
        this.sent.push({reportId, data: Buffer.from(data)});
        if (this.respond) {
            const response = this.respond(Buffer.from(data));
            setImmediate(() => this.emitInput(response));
        }
    }

    emitInput(bytes, reportId = 0) {
        const event = new Event("inputreport");
        const copy = Uint8Array.from(bytes);
        event.device = this;
        event.reportId = reportId;
        event.data = new DataView(copy.buffer);
        this.dispatchEvent(event);
    }
}

// Chrome's navigator.hid: the allowed devices, the picker, and the
// disconnect event every page hears for every device.
class FakeHid extends EventTarget {
    constructor(devices = [new FakeHidDevice()]) {
        super();
        this.allowed = devices;
        this.pick = devices;
        this.requests = [];
        this.failRequest = undefined;
        this.listeners = new Map();
    }

    async getDevices() {
        return [...this.allowed];
    }

    async requestDevice(options) {
        this.requests.push(options);
        if (this.failRequest) {
            throw this.failRequest;
        }
        return [...this.pick];
    }

    addEventListener(type, listener) {
        this.listeners.set(type, (this.listeners.get(type) || 0) + 1);
        super.addEventListener(type, listener);
    }

    removeEventListener(type, listener) {
        this.listeners.set(type, (this.listeners.get(type) || 0) - 1);
        super.removeEventListener(type, listener);
    }

    unplug(device) {
        const event = new Event("disconnect");
        event.device = device;
        this.dispatchEvent(event);
    }
}

function frame(command, marker = 0) {
    const value = Buffer.alloc(RAW_HID_REPORT_SIZE);
    value[0] = command;
    value[RAW_HID_REPORT_SIZE - 1] = marker;
    return value;
}

function domError(name) {
    const error = new Error(name);
    error.name = name;
    return error;
}

async function rejectsWithCode(promise, code) {
    await assert.rejects(promise, (error) => {
        assert.equal(error.code, code);
        return true;
    });
}

async function connectFirst(hid) {
    const adapter = new WebHidDeviceAdapter({hid});
    const [descriptor] = await adapter.listDevices();
    return {adapter, descriptor, connected: await adapter.connect(descriptor.id)};
}

test("both adapters match the same four Raw HID identifiers", () => {
    assert.equal(nodeHidAdapter.CHARYBDIS_VENDOR_ID, CHARYBDIS_VENDOR_ID);
    assert.equal(nodeHidAdapter.CHARYBDIS_PRODUCT_ID, CHARYBDIS_PRODUCT_ID);
    assert.equal(nodeHidAdapter.QMK_RAW_HID_USAGE_PAGE, QMK_RAW_HID_USAGE_PAGE);
    assert.equal(nodeHidAdapter.QMK_RAW_HID_USAGE, QMK_RAW_HID_USAGE);
});

test("without WebHID every call fails as unavailable", async () => {
    for (const hid of [undefined, {}, {getDevices() {}}]) {
        const adapter = new WebHidDeviceAdapter({hid});
        await rejectsWithCode(adapter.listDevices(), LIVE_LINK_ERROR_CODES.NATIVE_MODULE_UNAVAILABLE);
        await rejectsWithCode(adapter.requestDevice(), LIVE_LINK_ERROR_CODES.NATIVE_MODULE_UNAVAILABLE);
        await rejectsWithCode(adapter.connect("webhid:1"), LIVE_LINK_ERROR_CODES.NATIVE_MODULE_UNAVAILABLE);
    }
});

test("listDevices returns only allowed Raw HID interfaces, with stable ids", async () => {
    const raw = new FakeHidDevice();
    const hid = new FakeHid([
        new FakeHidDevice({collections: [{usagePage: 0x0001, usage: 0x0006}]}),
        raw,
        new FakeHidDevice({vendorId: 0x1234}),
        new FakeHidDevice({productId: 0x5678}),
        new FakeHidDevice({collections: [{usagePage: QMK_RAW_HID_USAGE_PAGE, usage: 0x0062}]}),
        new FakeHidDevice({collections: undefined}),
    ]);
    const adapter = new WebHidDeviceAdapter({hid});

    const devices = await adapter.listDevices();
    assert.deepEqual(devices, [{
        id: "webhid:1",
        path: undefined,
        vendorId: CHARYBDIS_VENDOR_ID,
        productId: CHARYBDIS_PRODUCT_ID,
        usagePage: QMK_RAW_HID_USAGE_PAGE,
        usage: QMK_RAW_HID_USAGE,
        serialNumber: undefined,
        manufacturer: undefined,
        product: "Charybdis 4x6",
        release: undefined,
        interface: undefined,
    }]);
    assert.equal(hid.requests.length, 0, "listing never opens the picker");

    // Chrome returns the same HIDDevice while it stays plugged in; so does the id.
    const second = new FakeHidDevice();
    hid.allowed = [second, raw];
    assert.deepEqual((await adapter.listDevices()).map((device) => device.id), ["webhid:2", "webhid:1"]);

    hid.getDevices = async () => {
        throw new Error("denied");
    };
    await rejectsWithCode(adapter.listDevices(), LIVE_LINK_ERROR_CODES.ENUMERATION_FAILED);
});

test("requestDevice opens a picker filtered to the Charybdis Raw HID interface", async () => {
    const hid = new FakeHid([]);
    const picked = new FakeHidDevice();
    hid.pick = [picked];
    const adapter = new WebHidDeviceAdapter({hid});

    const chosen = await adapter.requestDevice();
    assert.deepEqual(hid.requests, [{filters: [{
        vendorId: CHARYBDIS_VENDOR_ID,
        productId: CHARYBDIS_PRODUCT_ID,
        usagePage: QMK_RAW_HID_USAGE_PAGE,
        usage: QMK_RAW_HID_USAGE,
    }]}]);
    assert.equal(chosen.length, 1);

    // The chosen interface can be opened at once, before Chrome lists it.
    const connected = await adapter.connect(chosen[0].id);
    assert.equal(picked.openCalls, 1);
    await connected.close();
});

test("a dismissed picker is a cancellation; any other refusal is not", async () => {
    const hid = new FakeHid();
    const adapter = new WebHidDeviceAdapter({hid});

    hid.pick = [];
    await rejectsWithCode(adapter.requestDevice(), LIVE_LINK_ERROR_CODES.CANCELLED);
    hid.pick = [new FakeHidDevice({vendorId: 0x1234})];
    await rejectsWithCode(adapter.requestDevice(), LIVE_LINK_ERROR_CODES.CANCELLED);

    hid.failRequest = domError("NotFoundError");
    await rejectsWithCode(adapter.requestDevice(), LIVE_LINK_ERROR_CODES.CANCELLED);
    hid.failRequest = domError("SecurityError");
    await rejectsWithCode(adapter.requestDevice(), LIVE_LINK_ERROR_CODES.ENUMERATION_FAILED);
});

test("connect opens only a listed interface and maps open failures", async () => {
    const device = new FakeHidDevice();
    const hid = new FakeHid([device]);
    const adapter = new WebHidDeviceAdapter({hid});

    await rejectsWithCode(adapter.connect("webhid:99"), LIVE_LINK_ERROR_CODES.DEVICE_NOT_FOUND);
    assert.equal(device.openCalls, 0);

    // An id not yet listed is found by listing again, as node-hid's is.
    const connected = await adapter.connect("webhid:1");
    assert.equal(device.openCalls, 1);
    await connected.close();

    const broken = new FakeHidDevice({failOpen: domError("InvalidStateError")});
    const brokenAdapter = new WebHidDeviceAdapter({hid: new FakeHid([broken])});
    const [descriptor] = await brokenAdapter.listDevices();
    await rejectsWithCode(brokenAdapter.connect(descriptor.id), LIVE_LINK_ERROR_CODES.CONNECT_FAILED);
});

test("writes send 32 bytes with report id 0 and map send failures", async () => {
    const hid = new FakeHid();
    const {connected} = await connectFirst(hid);
    const device = hid.allowed[0];

    await connected.write(frame(0x12, 7));
    assert.equal(device.sent.length, 1);
    assert.equal(device.sent[0].reportId, 0);
    assert.deepEqual(device.sent[0].data, frame(0x12, 7));

    await rejectsWithCode(connected.write(Buffer.alloc(31)), LIVE_LINK_ERROR_CODES.INVALID_REPORT);
    await rejectsWithCode(connected.write(Buffer.alloc(33)), LIVE_LINK_ERROR_CODES.INVALID_REPORT);
    assert.equal(device.sent.length, 1);

    device.failSend = domError("NotAllowedError");
    await rejectsWithCode(connected.write(frame(0x12)), LIVE_LINK_ERROR_CODES.WRITE_FAILED);
    await connected.close();
    await rejectsWithCode(connected.write(frame(0x12)), LIVE_LINK_ERROR_CODES.DISCONNECTED);
});

test("input reports arrive as 32-byte Buffers; anything else ends the connection", async () => {
    const hid = new FakeHid();
    const {connected} = await connectFirst(hid);
    const device = hid.allowed[0];
    const reports = [];
    const reasons = [];
    connected.onReport((report) => reports.push(report));
    connected.onDisconnect((reason) => reasons.push(reason));

    device.emitInput(frame(0x11, 3));
    assert.equal(reports.length, 1);
    assert.ok(Buffer.isBuffer(reports[0]));
    assert.deepEqual(reports[0], frame(0x11, 3));

    device.emitInput(Buffer.alloc(31));
    await Promise.resolve();
    assert.equal(reasons.length, 1);
    assert.equal(reasons[0].code, LIVE_LINK_ERROR_CODES.INVALID_REPORT);
    assert.equal(device.closeCalls, 1);

    device.emitInput(frame(0x11));
    assert.equal(reports.length, 1, "a failed connection hears nothing more");
});

test("input report normalization checks the report id and length", () => {
    const view = (bytes) => new DataView(Uint8Array.from(bytes).buffer);
    assert.deepEqual(normalizeWebHidInputReport({reportId: 0, data: view(frame(0x5A))}), frame(0x5A));
    for (const event of [
        {reportId: 1, data: view(frame(0x5A))},
        {reportId: 0, data: view(Buffer.alloc(33))},
        {reportId: 0, data: frame(0x5A).buffer},
        undefined,
    ]) {
        assert.throws(() => normalizeWebHidInputReport(event), (error) => {
            assert.equal(error.code, LIVE_LINK_ERROR_CODES.INVALID_REPORT);
            return true;
        });
    }
});

test("Chrome's disconnect for the open device, and only that one, reaches onDisconnect", async () => {
    const other = new FakeHidDevice();
    const hid = new FakeHid([new FakeHidDevice(), other]);
    const {connected} = await connectFirst(hid);
    const device = hid.allowed[0];
    const reasons = [];
    connected.onDisconnect((reason) => reasons.push(reason));

    hid.unplug(other);
    assert.equal(reasons.length, 0);

    hid.unplug(device);
    hid.unplug(device);
    await Promise.resolve();
    assert.equal(reasons.length, 1);
    assert.equal(reasons[0].code, LIVE_LINK_ERROR_CODES.DISCONNECTED);
    assert.equal(hid.listeners.get("disconnect"), 0);

    // A late subscriber still learns why the connection ended.
    const late = await new Promise((resolve) => connected.onDisconnect(resolve));
    assert.equal(late, reasons[0]);
});

test("close closes the device once, removes its listeners and is safe twice", async () => {
    const hid = new FakeHid();
    const {connected} = await connectFirst(hid);
    const device = hid.allowed[0];
    const reports = [];
    const reasons = [];
    connected.onReport((report) => reports.push(report));
    connected.onDisconnect((reason) => reasons.push(reason));
    assert.equal(hid.listeners.get("disconnect"), 1);

    await connected.close();
    await connected.close();
    assert.equal(device.closeCalls, 1);
    assert.equal(hid.listeners.get("disconnect"), 0);

    device.emitInput(frame(0x11));
    hid.unplug(device);
    await Promise.resolve();
    assert.deepEqual(reports, []);
    assert.deepEqual(reasons, []);
});

test("the request coordinator runs a full request and response over WebHID", async () => {
    const device = new FakeHidDevice({
        respond(request) {
            const response = Buffer.from(request);
            response[RAW_HID_REPORT_SIZE - 1] = 0x42;
            return response;
        },
    });
    const hid = new FakeHid([device]);
    const coordinator = new DeviceRequestCoordinator(new WebHidDeviceAdapter({hid}));
    const [descriptor] = await coordinator.listDevices();
    const connection = await coordinator.connect(descriptor.id);

    const response = await connection.request(frame(0x07, 1));
    assert.equal(device.sent[0].reportId, 0);
    assert.deepEqual(device.sent[0].data, frame(0x07, 1));
    assert.equal(response[0], 0x07);
    assert.equal(response[RAW_HID_REPORT_SIZE - 1], 0x42);

    await coordinator.close();
    assert.equal(device.closeCalls, 1);
    assert.equal(hid.listeners.get("disconnect"), 0);
});
