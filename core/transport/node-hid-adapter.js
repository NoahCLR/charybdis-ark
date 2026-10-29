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
const NODE_HID_REPORT_ID = 0;
const NODE_HID_REPORT_SIZE = RAW_HID_REPORT_SIZE + 1;

class NodeHidDeviceAdapter {
    /** @param {{hidModule?: import("./types.js").NativeHidModule, loadHid?: () => import("./types.js").MaybePromise<import("./types.js").NativeHidModule>, platform?: string}} [options] */
    constructor(options = {}) {
        this.hidModule = options.hidModule;
        this.loadHid = options.loadHid || loadNodeHid;
        this.platform = options.platform || process.platform;
        /** @type {Promise<import("./types.js").NativeHidModule> | undefined} */
        this.hidModulePromise = undefined;
        /** @type {Map<string, ReturnType<typeof deviceDescriptor>>} */
        this.knownDevices = new Map();
    }

    async listDevices() {
        const hid = await this.getHidModule();
        let devices;
        try {
            devices = await hid.devicesAsync(CHARYBDIS_VENDOR_ID, CHARYBDIS_PRODUCT_ID);
        } catch (cause) {
            throw liveLinkError(
                LIVE_LINK_ERROR_CODES.ENUMERATION_FAILED,
                "Ark could not list the connected keyboards.",
                {cause}
            );
        }

        if (!Array.isArray(devices)) {
            throw liveLinkError(
                LIVE_LINK_ERROR_CODES.ENUMERATION_FAILED,
                "node-hid devicesAsync() did not return an array.",
                {fault: "ark"}
            );
        }

        this.knownDevices.clear();
        const matches = [];
        for (const device of devices) {
            if (!isCharybdisRawHidDevice(device)) {
                continue;
            }
            const path = typeof device.path === "string" ? device.path : "";
            if (!path || this.knownDevices.has(path)) {
                continue;
            }
            const descriptor = deviceDescriptor(device, path);
            this.knownDevices.set(descriptor.id, descriptor);
            matches.push(descriptor);
        }
        return matches;
    }

    /** @param {string} deviceId */
    async connect(deviceId) {
        const id = normalizeDeviceId(deviceId);
        let descriptor = this.knownDevices.get(id);
        if (!descriptor) {
            await this.listDevices();
            descriptor = this.knownDevices.get(id);
        }
        if (!descriptor) {
            throw liveLinkError(
                LIVE_LINK_ERROR_CODES.DEVICE_NOT_FOUND,
                "Ark cannot find that keyboard now. Check that it is plugged in, then choose it again.",
                {deviceId: id}
            );
        }

        const hid = await this.getHidModule();
        let nativeDevice;
        try {
            nativeDevice = this.platform === "darwin"
                ? await hid.HIDAsync.open(descriptor.path, {nonExclusive: true})
                : await hid.HIDAsync.open(descriptor.path);
        } catch (cause) {
            throw liveLinkError(
                LIVE_LINK_ERROR_CODES.CONNECT_FAILED,
                "Ark could not open the keyboard. Close any other program using it, then try again.",
                {cause, deviceId: id}
            );
        }

        try {
            return new NodeHidConnectedDevice(nativeDevice, id);
        } catch (cause) {
            await closeNativeDevice(nativeDevice);
            if (cause instanceof LiveLinkTransportError) {
                throw cause;
            }
            throw liveLinkError(
                LIVE_LINK_ERROR_CODES.CONNECT_FAILED,
                "Ark could not start talking to the keyboard. Unplug it, plug it back in and try again.",
                {cause, deviceId: id}
            );
        }
    }

    async getHidModule() {
        if (!this.hidModulePromise) {
            this.hidModulePromise = Promise.resolve()
                .then(() => this.hidModule || this.loadHid())
                .then(validateHidModule)
                .catch((cause) => {
                    this.hidModulePromise = undefined;
                    if (cause instanceof LiveLinkTransportError) {
                        throw cause;
                    }
                    throw liveLinkError(
                        LIVE_LINK_ERROR_CODES.NATIVE_MODULE_UNAVAILABLE,
                        "The node-hid native module is unavailable.",
                        {cause}
                    );
                });
        }
        return this.hidModulePromise;
    }
}

class NodeHidConnectedDevice {
    /** @param {import("./types.js").NativeHidDevice} nativeDevice @param {string} deviceId */
    constructor(nativeDevice, deviceId) {
        if (!nativeDevice || typeof nativeDevice.write !== "function" ||
            typeof nativeDevice.close !== "function" || typeof nativeDevice.on !== "function") {
            throw liveLinkError(
                LIVE_LINK_ERROR_CODES.INVALID_ADAPTER,
                "node-hid returned an invalid connected device handle.",
                {deviceId, fault: "ark"}
            );
        }
        this.nativeDevice = nativeDevice;
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
        /** @param {unknown} data */
        this.handleData = (data) => this.receiveNativeReport(data);
        /** @param {unknown} cause */
        this.handleError = (cause) => this.fail(liveLinkError(
            LIVE_LINK_ERROR_CODES.DISCONNECTED,
            "The keyboard was disconnected.",
            {cause: cause instanceof Error ? cause : undefined, deviceId: this.deviceId}
        ));
        this.nativeDevice.on("data", this.handleData);
        this.nativeDevice.on("error", this.handleError);
    }

    /** @param {Uint8Array} report */
    async write(report) {
        if (this.disconnected) {
            throw liveLinkError(
                LIVE_LINK_ERROR_CODES.DISCONNECTED,
                "The keyboard is not connected.",
                {deviceId: this.deviceId}
            );
        }
        const nativeReport = addNodeHidReportId(report);
        try {
            await this.nativeDevice.write(nativeReport);
        } catch (cause) {
            throw liveLinkError(
                LIVE_LINK_ERROR_CODES.WRITE_FAILED,
                "Ark could not send a report to the keyboard.",
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
        this.detachNativeListeners();
        this.reportListeners.clear();
        this.disconnectListeners.clear();
        this.closePromise = Promise.resolve().then(() => this.nativeDevice.close());
        return this.closePromise;
    }

    /** @param {unknown} data */
    receiveNativeReport(data) {
        if (this.disconnected) {
            return;
        }
        let report;
        try {
            report = normalizeNodeHidInputReport(data);
        } catch (cause) {
            this.fail(liveLinkError(
                LIVE_LINK_ERROR_CODES.INVALID_REPORT,
                "The keyboard sent a report Ark could not read.",
                {cause, deviceId: this.deviceId}
            ));
            return;
        }
        for (const listener of Array.from(this.reportListeners)) {
            try {
                listener(Buffer.from(report));
            } catch {
                // Observers must not interrupt the native read loop.
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
        this.detachNativeListeners();
        this.reportListeners.clear();
        for (const listener of Array.from(this.disconnectListeners)) {
            try {
                listener(reason);
            } catch {
                // Observers must not interrupt native cleanup.
            }
        }
        this.disconnectListeners.clear();
        this.closePromise = closeNativeDevice(this.nativeDevice);
    }

    detachNativeListeners() {
        removeNativeListener(this.nativeDevice, "data", this.handleData);
        removeNativeListener(this.nativeDevice, "error", this.handleError);
    }
}

function loadNodeHid() {
    return require("node-hid");
}

/** @param {import("./types.js").NativeHidModule} hid */
function validateHidModule(hid) {
    if (!hid || typeof hid.devicesAsync !== "function" || typeof hid.HIDAsync?.open !== "function") {
        throw liveLinkError(
            LIVE_LINK_ERROR_CODES.NATIVE_MODULE_UNAVAILABLE,
            "node-hid must provide devicesAsync() and HIDAsync.open().",
            {fault: "ark"}
        );
    }
    return hid;
}

/** @param {Partial<import("node-hid").Device> | null | undefined} device */
function isCharybdisRawHidDevice(device) {
    return Number(device?.vendorId) === CHARYBDIS_VENDOR_ID &&
        Number(device?.productId) === CHARYBDIS_PRODUCT_ID &&
        Number(device?.usagePage) === QMK_RAW_HID_USAGE_PAGE &&
        Number(device?.usage) === QMK_RAW_HID_USAGE;
}

/** @param {import("node-hid").Device} device @param {string} path */
function deviceDescriptor(device, path) {
    return {
        id: path,
        path,
        vendorId: CHARYBDIS_VENDOR_ID,
        productId: CHARYBDIS_PRODUCT_ID,
        usagePage: QMK_RAW_HID_USAGE_PAGE,
        usage: QMK_RAW_HID_USAGE,
        serialNumber: optionalString(device.serialNumber),
        manufacturer: optionalString(device.manufacturer),
        product: optionalString(device.product),
        release: optionalNumber(device.release),
        interface: optionalNumber(device.interface),
    };
}

/** @param {unknown} value */
function optionalString(value) {
    return typeof value === "string" ? value : undefined;
}

/** @param {number | undefined} value */
function optionalNumber(value) {
    return Number.isInteger(value) ? value : undefined;
}

/** @param {unknown} deviceId */
function normalizeDeviceId(deviceId) {
    const id = typeof deviceId === "string" ? deviceId.trim() : "";
    if (!id) {
        throw new TypeError("deviceId must be a non-empty string.");
    }
    return id;
}

/** @param {Uint8Array} report */
function addNodeHidReportId(report) {
    const frame = normalizeRawHidReport(report, "Raw HID output report");
    const nativeReport = Buffer.alloc(NODE_HID_REPORT_SIZE);
    nativeReport[NODE_HID_REPORT_ID] = NODE_HID_REPORT_ID;
    frame.copy(nativeReport, 1);
    return nativeReport;
}

/** @param {unknown} report */
function normalizeNodeHidInputReport(report) {
    if (!(report instanceof Uint8Array)) {
        throw liveLinkError(
            LIVE_LINK_ERROR_CODES.INVALID_REPORT,
            "node-hid input report must be a Buffer or Uint8Array."
        );
    }
    if (report.byteLength === RAW_HID_REPORT_SIZE) {
        return Buffer.from(report.buffer, report.byteOffset, report.byteLength);
    }
    if (report.byteLength === NODE_HID_REPORT_SIZE && report[0] === NODE_HID_REPORT_ID) {
        return Buffer.from(report.buffer, report.byteOffset + 1, RAW_HID_REPORT_SIZE);
    }
    throw liveLinkError(
        LIVE_LINK_ERROR_CODES.INVALID_REPORT,
        `node-hid input report must be ${RAW_HID_REPORT_SIZE} protocol bytes or ` +
            `${NODE_HID_REPORT_SIZE} bytes beginning with report id ${NODE_HID_REPORT_ID}.`
    );
}

/** @param {import("./types.js").NativeHidDevice} device @param {string} eventName @param {(value: unknown) => void} listener */
function removeNativeListener(device, eventName, listener) {
    if (typeof device.off === "function") {
        device.off(eventName, listener);
    } else if (typeof device.removeListener === "function") {
        device.removeListener(eventName, listener);
    }
}

/** @param {import("./types.js").NativeHidDevice} device */
function closeNativeDevice(device) {
    if (!device || typeof device.close !== "function") {
        return Promise.resolve();
    }
    return Promise.resolve().then(() => device.close()).catch(() => undefined);
}

module.exports = {
    NODE_HID_REPORT_SIZE,
    NodeHidDeviceAdapter,
    addNodeHidReportId,
    normalizeNodeHidInputReport,
};
