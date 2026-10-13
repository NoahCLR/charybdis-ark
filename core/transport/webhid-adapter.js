// @ts-check
"use strict";

const {
    CHARYBDIS_PRODUCT_ID,
    CHARYBDIS_VENDOR_ID,
    LIVE_LINK_ERROR_CODES,
    LiveLinkTransportError,
    QMK_RAW_HID_USAGE,
    QMK_RAW_HID_USAGE_PAGE,
    RAW_HID_REPORT_SIZE,
    liveLinkError,
    normalizeRawHidReport,
} = require("./device-adapter");

// QMK's Raw HID interface declares no report ids, which WebHID spells as 0.
const WEBHID_REPORT_ID = 0;
const WEBHID_DEVICE_FILTERS = Object.freeze([Object.freeze({
    vendorId: CHARYBDIS_VENDOR_ID,
    productId: CHARYBDIS_PRODUCT_ID,
    usagePage: QMK_RAW_HID_USAGE_PAGE,
    usage: QMK_RAW_HID_USAGE,
})]);

// The keyboard last picked in Chrome's list comes first, so a read after
// Choose keyboard opens that one rather than whichever Chrome lists first.
//
// A WebHID device has no path. Chrome hands back the same HIDDevice object for
// an interface for as long as it stays plugged in, so each object gets an id
// the first time it is seen and keeps it; a replugged keyboard is a new object
// and so a new id, as a new node-hid path would be.
class WebHidDeviceAdapter {
    /** @param {{hid?: import("./types.js").WebHid}} [options] */
    constructor(options = {}) {
        this.hid = options.hid;
        /** @type {WeakMap<import("./types.js").WebHidDevice, string>} */
        this.idsByDevice = new WeakMap();
        /** @type {Map<string, import("./types.js").WebHidDevice>} */
        this.knownDevices = new Map();
        this.nextDeviceId = 1;
        /** @type {import("./types.js").WebHidDevice | undefined} */
        this.chosen = undefined;
        /** @type {import("./types.js").WebHidDevice | undefined} */
        this.opened = undefined;
    }

    // The interfaces this page has already been allowed to open. Chrome lists
    // nothing else until the user picks one in requestDevice().
    async listDevices() {
        const hid = this.getHid();
        let devices;
        try {
            devices = await hid.getDevices();
        } catch (cause) {
            throw liveLinkError(
                LIVE_LINK_ERROR_CODES.ENUMERATION_FAILED,
                "Could not list the Charybdis Raw HID interfaces this page may open.",
                {cause}
            );
        }
        if (!Array.isArray(devices)) {
            throw liveLinkError(
                LIVE_LINK_ERROR_CODES.ENUMERATION_FAILED,
                "WebHID getDevices() did not return an array."
            );
        }
        this.knownDevices.clear();
        const listed = this.remember(devices);
        const chosen = this.chosen && this.idsByDevice.get(this.chosen);
        if (!chosen || !listed.some((descriptor) => descriptor.id === chosen)) {
            this.chosen = undefined;
            return listed;
        }
        return [...listed.filter((descriptor) => descriptor.id === chosen), ...listed.filter((descriptor) => descriptor.id !== chosen)];
    }

    // Opens Chrome's picker, filtered to the Charybdis Raw HID interface. It
    // must run from a user gesture; Chrome refuses it otherwise.
    async requestDevice() {
        const hid = this.getHid();
        let devices;
        try {
            devices = await hid.requestDevice({filters: WEBHID_DEVICE_FILTERS.map((filter) => ({...filter}))});
        } catch (cause) {
            // A browser rejection may be an Error or a plain object with a name.
            const name = /** @type {{name?: unknown} | null | undefined} */ (cause)?.name;
            if (name === "NotFoundError" || name === "AbortError") {
                throw liveLinkError(
                    LIVE_LINK_ERROR_CODES.CANCELLED,
                    "No Charybdis was chosen.",
                    {cause}
                );
            }
            throw liveLinkError(
                LIVE_LINK_ERROR_CODES.ENUMERATION_FAILED,
                "The browser refused to show the keyboard picker.",
                {cause}
            );
        }
        const chosen = this.remember(Array.isArray(devices) ? devices : []).slice(0, 1);
        if (!chosen.length) {
            throw liveLinkError(LIVE_LINK_ERROR_CODES.CANCELLED, "No Charybdis was chosen.");
        }
        this.chosen = this.knownDevices.get(chosen[0].id);
        return chosen;
    }

    /** @param {string} deviceId */
    async connect(deviceId) {
        const id = normalizeDeviceId(deviceId);
        let device = this.knownDevices.get(id);
        if (!device) {
            await this.listDevices();
            device = this.knownDevices.get(id);
        }
        if (!device) {
            throw liveLinkError(
                LIVE_LINK_ERROR_CODES.DEVICE_NOT_FOUND,
                `No matching Charybdis Raw HID interface was found for ${id}.`,
                {deviceId: id}
            );
        }

        const hid = this.getHid();
        try {
            if (!device.opened) {
                await device.open();
            }
            this.opened = device;
        } catch (cause) {
            throw liveLinkError(
                LIVE_LINK_ERROR_CODES.CONNECT_FAILED,
                `Could not open Charybdis Raw HID interface ${id}.`,
                {cause, deviceId: id}
            );
        }

        try {
            return new WebHidConnectedDevice(hid, device, id);
        } catch (cause) {
            await closeWebHidDevice(device);
            if (cause instanceof LiveLinkTransportError) {
                throw cause;
            }
            throw liveLinkError(
                LIVE_LINK_ERROR_CODES.CONNECT_FAILED,
                `Could not initialize Charybdis Raw HID interface ${id}.`,
                {cause, deviceId: id}
            );
        }
    }

    // Lets go of the keyboard last opened, and takes back the page's
    // permission to open it, so the page stops reconnecting to it. Choosing it
    // in Chrome's list again restores both. Close the connection first.
    async forget() {
        const device = this.opened;
        this.opened = undefined;
        if (this.chosen === device) this.chosen = undefined;
        if (!device) return;
        await closeWebHidDevice(device);
        await device.forget?.().catch(() => {});
    }

    getHid() {
        const hid = this.hid;
        if (!hid || typeof hid.getDevices !== "function" || typeof hid.requestDevice !== "function" ||
            typeof hid.addEventListener !== "function" || typeof hid.removeEventListener !== "function") {
            throw liveLinkError(
                LIVE_LINK_ERROR_CODES.NATIVE_MODULE_UNAVAILABLE,
                "WebHID is unavailable in this browser."
            );
        }
        return hid;
    }

    /** @param {import("./types.js").WebHidDevice[]} devices */
    remember(devices) {
        /** @type {import("./types.js").DeviceDescriptor[]} */
        const descriptors = [];
        for (const device of devices) {
            if (!isCharybdisWebHidDevice(device)) {
                continue;
            }
            let id = this.idsByDevice.get(device);
            if (!id) {
                id = `webhid:${this.nextDeviceId++}`;
                this.idsByDevice.set(device, id);
            }
            if (descriptors.some((descriptor) => descriptor.id === id)) {
                continue;
            }
            this.knownDevices.set(id, device);
            descriptors.push(deviceDescriptor(device, id));
        }
        return descriptors;
    }
}

class WebHidConnectedDevice {
    /** @param {import("./types.js").WebHid} hid @param {import("./types.js").WebHidDevice} device @param {string} deviceId */
    constructor(hid, device, deviceId) {
        if (!device || typeof device.sendReport !== "function" || typeof device.close !== "function" ||
            typeof device.addEventListener !== "function" || typeof device.removeEventListener !== "function") {
            throw liveLinkError(
                LIVE_LINK_ERROR_CODES.INVALID_ADAPTER,
                "WebHID returned an invalid device handle.",
                {deviceId}
            );
        }
        this.hid = hid;
        this.device = device;
        this.deviceId = deviceId;
        /** @type {Set<import("./types.js").ReportListener>} */
        this.reportListeners = new Set();
        /** @type {Set<import("./types.js").DisconnectListener>} */
        this.disconnectListeners = new Set();
        this.disconnected = false;
        /** @type {InstanceType<typeof LiveLinkTransportError> | undefined} */
        this.disconnectReason = undefined;
        /** @type {Promise<unknown> | undefined} */
        this.closePromise = undefined;
        /** @param {import("./types.js").WebHidInputReport} event */
        this.handleInputReport = (event) => this.receiveInputReport(event);
        // Chrome announces a removal on navigator.hid, for every device, so
        // only this one's departure ends the connection.
        /** @param {{device: import("./types.js").WebHidDevice}} event */
        this.handleDisconnect = (event) => {
            if (event?.device === this.device) {
                this.fail(liveLinkError(
                    LIVE_LINK_ERROR_CODES.DISCONNECTED,
                    `Charybdis Raw HID interface ${this.deviceId} disconnected.`,
                    {deviceId: this.deviceId}
                ));
            }
        };
        this.device.addEventListener("inputreport", this.handleInputReport);
        this.hid.addEventListener("disconnect", this.handleDisconnect);
    }

    /** @param {Uint8Array} report */
    async write(report) {
        if (this.disconnected) {
            throw liveLinkError(
                LIVE_LINK_ERROR_CODES.DISCONNECTED,
                `Charybdis Raw HID interface ${this.deviceId} is disconnected.`,
                {deviceId: this.deviceId}
            );
        }
        const frame = Uint8Array.from(normalizeRawHidReport(report, "Raw HID output report"));
        try {
            await this.device.sendReport(WEBHID_REPORT_ID, frame);
        } catch (cause) {
            throw liveLinkError(
                LIVE_LINK_ERROR_CODES.WRITE_FAILED,
                `Could not write to Charybdis Raw HID interface ${this.deviceId}.`,
                {cause, deviceId: this.deviceId}
            );
        }
    }

    /** @param {import("./types.js").ReportListener} listener */
    onReport(listener) {
        if (typeof listener !== "function") {
            throw new TypeError("report listener must be a function.");
        }
        if (!this.disconnected) {
            this.reportListeners.add(listener);
        }
        return () => this.reportListeners.delete(listener);
    }

    /** @param {import("./types.js").DisconnectListener} listener */
    onDisconnect(listener) {
        if (typeof listener !== "function") {
            throw new TypeError("disconnect listener must be a function.");
        }
        if (this.disconnectReason) {
            const reason = this.disconnectReason;
            queueMicrotask(() => listener(reason));
            return () => undefined;
        }
        if (!this.disconnected) {
            this.disconnectListeners.add(listener);
        }
        return () => this.disconnectListeners.delete(listener);
    }

    async close() {
        if (this.closePromise) {
            return this.closePromise;
        }
        this.disconnected = true;
        this.detachListeners();
        this.reportListeners.clear();
        this.disconnectListeners.clear();
        this.closePromise = Promise.resolve().then(() => this.device.close());
        return this.closePromise;
    }

    /** @param {import("./types.js").WebHidInputReport} event */
    receiveInputReport(event) {
        if (this.disconnected) {
            return;
        }
        let report;
        try {
            report = normalizeWebHidInputReport(event);
        } catch (cause) {
            this.fail(liveLinkError(
                LIVE_LINK_ERROR_CODES.INVALID_REPORT,
                `Charybdis Raw HID interface ${this.deviceId} returned an invalid input report.`,
                {cause, deviceId: this.deviceId}
            ));
            return;
        }
        for (const listener of Array.from(this.reportListeners)) {
            try {
                listener(Buffer.from(report));
            } catch {
                // Observers must not interrupt the browser's report dispatch.
            }
        }
    }

    /** @param {InstanceType<typeof LiveLinkTransportError>} reason */
    fail(reason) {
        if (this.disconnected) {
            return;
        }
        this.disconnected = true;
        this.disconnectReason = reason;
        this.detachListeners();
        this.reportListeners.clear();
        for (const listener of Array.from(this.disconnectListeners)) {
            try {
                listener(reason);
            } catch {
                // Observers must not interrupt cleanup.
            }
        }
        this.disconnectListeners.clear();
        this.closePromise = closeWebHidDevice(this.device);
    }

    detachListeners() {
        this.device.removeEventListener("inputreport", this.handleInputReport);
        this.hid.removeEventListener("disconnect", this.handleDisconnect);
    }
}

// A HIDDevice is one interface; its collections say which. The Raw HID
// interface is the one with QMK's usage page and usage among them.
/** @param {Partial<import("./types.js").WebHidDevice> | null | undefined} device */
function isCharybdisWebHidDevice(device) {
    return Number(device?.vendorId) === CHARYBDIS_VENDOR_ID &&
        Number(device?.productId) === CHARYBDIS_PRODUCT_ID &&
        Array.isArray(device?.collections) &&
        device.collections.some((collection) =>
            Number(collection?.usagePage) === QMK_RAW_HID_USAGE_PAGE &&
            Number(collection?.usage) === QMK_RAW_HID_USAGE);
}

// The same keys node-hid's descriptor carries. WebHID does not expose a path,
// serial number, manufacturer, release or interface number.
/** @param {import("./types.js").WebHidDevice} device @param {string} id */
function deviceDescriptor(device, id) {
    return {
        id,
        path: undefined,
        vendorId: CHARYBDIS_VENDOR_ID,
        productId: CHARYBDIS_PRODUCT_ID,
        usagePage: QMK_RAW_HID_USAGE_PAGE,
        usage: QMK_RAW_HID_USAGE,
        serialNumber: undefined,
        manufacturer: undefined,
        product: typeof device.productName === "string" ? device.productName : undefined,
        release: undefined,
        interface: undefined,
    };
}

/** @param {unknown} deviceId */
function normalizeDeviceId(deviceId) {
    const id = typeof deviceId === "string" ? deviceId.trim() : "";
    if (!id) {
        throw new TypeError("deviceId must be a non-empty string.");
    }
    return id;
}

// An inputreport event carries its report id apart from a DataView of the
// payload. Only report id 0 with exactly 32 bytes is a protocol frame.
/** @param {import("./types.js").WebHidInputReport} event */
function normalizeWebHidInputReport(event) {
    const data = event?.data;
    if (!ArrayBuffer.isView(data)) {
        throw liveLinkError(
            LIVE_LINK_ERROR_CODES.INVALID_REPORT,
            "WebHID input report must carry a DataView."
        );
    }
    if (event.reportId !== WEBHID_REPORT_ID || data.byteLength !== RAW_HID_REPORT_SIZE) {
        throw liveLinkError(
            LIVE_LINK_ERROR_CODES.INVALID_REPORT,
            `WebHID input report must be ${RAW_HID_REPORT_SIZE} bytes with report id ${WEBHID_REPORT_ID}; ` +
                `received ${data.byteLength} bytes with report id ${event.reportId}.`
        );
    }
    return Buffer.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
}

/** @param {import("./types.js").WebHidDevice} device */
function closeWebHidDevice(device) {
    if (!device || typeof device.close !== "function") {
        return Promise.resolve();
    }
    return Promise.resolve().then(() => device.close()).catch(() => undefined);
}

module.exports = {
    WEBHID_DEVICE_FILTERS,
    WEBHID_REPORT_ID,
    WebHidConnectedDevice,
    WebHidDeviceAdapter,
    isCharybdisWebHidDevice,
    normalizeWebHidInputReport,
};
