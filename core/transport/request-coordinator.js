// @ts-check
"use strict";

const {
    LIVE_LINK_ERROR_CODES,
    LiveLinkTransportError,
    assertConnectedDevice,
    assertDeviceAdapter,
    liveLinkError,
    normalizeDeviceDescriptors,
    normalizeRawHidReport,
} = require("./device-adapter");

const DEFAULT_REQUEST_TIMEOUT_MS = 1000;
// A request that timed out softly keeps the connection; its reply, if it
// comes, is the next one the keyboard sends (it answers in order), and is set
// aside for this long rather than taken as another request's.
const LATE_REPLY_MS = 10000;

class DeviceRequestCoordinator {
    /** @param {import("./types.js").DeviceAdapter} adapter @param {import("./types.js").CoordinatorOptions} [options] */
    constructor(adapter, options = {}) {
        this.adapter = assertDeviceAdapter(adapter);
        this.defaultTimeoutMs = normalizeTimeout(
            options.defaultTimeoutMs === undefined ? DEFAULT_REQUEST_TIMEOUT_MS : options.defaultTimeoutMs
        );
        this.onUnexpectedReport = typeof options.onUnexpectedReport === "function"
            ? options.onUnexpectedReport
            : undefined;
        /** @type {Map<string, CoordinatedDeviceConnection>} */
        this.connections = new Map();
        this.connecting = new Set();
    }

    async listDevices() {
        return normalizeDeviceDescriptors(await this.adapter.listDevices());
    }

    /** @param {string} deviceId */
    async connect(deviceId) {
        const normalizedDeviceId = normalizeDeviceId(deviceId);
        if (this.connections.has(normalizedDeviceId) || this.connecting.has(normalizedDeviceId)) {
            throw liveLinkError(
                LIVE_LINK_ERROR_CODES.ALREADY_CONNECTED,
                `Device ${normalizedDeviceId} already has a live-link connection.`,
                {deviceId: normalizedDeviceId}
            );
        }

        this.connecting.add(normalizedDeviceId);
        let device;
        try {
            device = await this.adapter.connect(normalizedDeviceId);
            assertConnectedDevice(device, normalizedDeviceId);
        } catch (error) {
            if (error instanceof LiveLinkTransportError) {
                throw error;
            }
            throw liveLinkError(
                LIVE_LINK_ERROR_CODES.CONNECT_FAILED,
                `Could not connect to ${normalizedDeviceId}.`,
                {cause: error, deviceId: normalizedDeviceId}
            );
        } finally {
            this.connecting.delete(normalizedDeviceId);
        }

        const connection = new CoordinatedDeviceConnection(device, normalizedDeviceId, {
            defaultTimeoutMs: this.defaultTimeoutMs,
            onUnexpectedReport: this.onUnexpectedReport,
            onClosed: () => {
                if (this.connections.get(normalizedDeviceId) === connection) {
                    this.connections.delete(normalizedDeviceId);
                }
            },
        });
        this.connections.set(normalizedDeviceId, connection);
        connection.start();
        return connection;
    }

    /** @param {string} deviceId */
    getConnection(deviceId) {
        return this.connections.get(normalizeDeviceId(deviceId));
    }

    /** @param {string} deviceId */
    async disconnect(deviceId) {
        const connection = this.getConnection(deviceId);
        if (connection) {
            await connection.disconnect();
        }
    }

    async close() {
        const connections = Array.from(this.connections.values());
        await Promise.all(connections.map((connection) => connection.disconnect()));
    }
}

class CoordinatedDeviceConnection {
    /** @param {import("./types.js").ConnectedDevice} device @param {string} deviceId @param {import("./types.js").CoordinatedConnectionOptions} options */
    constructor(device, deviceId, options) {
        this.device = device;
        this.deviceId = deviceId;
        this.defaultTimeoutMs = options.defaultTimeoutMs;
        this.onUnexpectedReport = options.onUnexpectedReport;
        this.onClosed = options.onClosed;
        this.state = "created";
        /** @type {import("./types.js").RequestOperation[]} */
        this.queue = [];
        /** @type {import("./types.js").RequestOperation | undefined} */
        this.active = undefined;
        /** @type {Set<import("./types.js").DisconnectListener>} */
        this.disconnectListeners = new Set();
        /** @type {import("./types.js").Disposer | undefined} */
        this.disposeReportListener = undefined;
        /** @type {import("./types.js").Disposer | undefined} */
        this.disposeDisconnectListener = undefined;
        /** @type {Promise<unknown> | undefined} */
        this.closePromise = undefined;
        /** @type {{matchResponse: (response: Buffer, request: Buffer) => boolean, report: Buffer, until: number}[]} */
        this.late = [];
    }

    start() {
        if (this.state !== "created") {
            return;
        }
        this.state = "connected";
        try {
            this.disposeReportListener = normalizeDisposer(
                this.device.onReport((report) => this.handleReport(report))
            );
            this.disposeDisconnectListener = normalizeDisposer(
                this.device.onDisconnect((reason) => this.handleDeviceDisconnect(reason))
            );
        } catch (cause) {
            const error = liveLinkError(
                LIVE_LINK_ERROR_CODES.CONNECT_FAILED,
                "Ark could not listen to the keyboard.",
                {cause, deviceId: this.deviceId}
            );
            void this.terminate(error, {activeError: error, closeDevice: true});
            throw error;
        }
    }

    get connected() {
        return this.state === "connected";
    }

    /** @param {Uint8Array} report @param {import("./types.js").RequestOptions} [options] @returns {Promise<Buffer>} */
    request(report, options = {}) {
        let normalizedReport;
        try {
            normalizedReport = Buffer.from(normalizeRawHidReport(report, "Request report"));
        } catch (error) {
            return Promise.reject(error);
        }

        if (!this.connected) {
            return Promise.reject(liveLinkError(
                LIVE_LINK_ERROR_CODES.NOT_CONNECTED,
                "The keyboard is not connected.",
                {deviceId: this.deviceId}
            ));
        }

        let timeoutMs;
        try {
            timeoutMs = normalizeTimeout(
                options.timeoutMs === undefined ? this.defaultTimeoutMs : options.timeoutMs
            );
        } catch (error) {
            return Promise.reject(error);
        }

        const signal = options.signal;
        if (signal !== undefined && !isAbortSignal(signal)) {
            return Promise.reject(new TypeError("request signal must be an AbortSignal."));
        }
        if (signal?.aborted) {
            return Promise.reject(cancelledError(this.deviceId));
        }

        const matchResponse = options.matchResponse === undefined
            ? defaultResponseMatcher
            : options.matchResponse;
        if (typeof matchResponse !== "function") {
            return Promise.reject(new TypeError("matchResponse must be a function."));
        }

        return new Promise((resolve, reject) => {
            /** @type {import("./types.js").RequestOperation} */
            const operation = {
                matchResponse,
                reject,
                report: normalizedReport,
                resolve,
                settled: false,
                signal,
                softTimeout: options.softTimeout === true,
                status: "queued",
                timeoutId: undefined,
                timeoutMs,
            };
            if (signal) {
                operation.abortListener = () => this.cancelOperation(operation);
                signal.addEventListener("abort", operation.abortListener, {once: true});
            }
            this.queue.push(operation);
            this.pump();
        });
    }

    /** @param {import("./types.js").DisconnectListener} listener */
    onDisconnect(listener) {
        if (typeof listener !== "function") {
            throw new TypeError("disconnect listener must be a function.");
        }
        this.disconnectListeners.add(listener);
        return () => this.disconnectListeners.delete(listener);
    }

    // Ends the connection as a failure, with `reason` as what its disconnect
    // listeners hear: a keyboard that stopped answering background reads.
    /** @param {unknown} reason */
    abandon(reason) {
        return this.terminate(reason, {activeError: reason, closeDevice: true, queuedError: reason});
    }

    async disconnect() {
        const reason = liveLinkError(
            LIVE_LINK_ERROR_CODES.DISCONNECTED,
            "Ark disconnected the keyboard.",
            {deviceId: this.deviceId}
        );
        await this.terminate(reason, {activeError: reason, closeDevice: true});
    }

    pump() {
        if (!this.connected || this.active) {
            return;
        }

        while (this.queue.length && !this.active) {
            const operation = this.queue.shift();
            if (!operation || operation.settled) {
                continue;
            }
            if (operation.signal?.aborted) {
                this.settle(operation, "reject", cancelledError(this.deviceId));
                continue;
            }

            operation.status = "active";
            this.active = operation;
            operation.timeoutId = setTimeout(() => this.timeoutOperation(operation), operation.timeoutMs);

            let writeResult;
            try {
                writeResult = this.device.write(Buffer.from(operation.report));
            } catch (error) {
                this.failWrite(operation, error);
                return;
            }
            Promise.resolve(writeResult).catch((error) => this.failWrite(operation, error));
        }
    }

    /** @param {unknown} report */
    handleReport(report) {
        if (!this.connected) {
            return;
        }

        let normalizedReport;
        try {
            normalizedReport = Buffer.from(normalizeRawHidReport(report, "Response report"));
        } catch (cause) {
            const invalidReport = liveLinkError(
                LIVE_LINK_ERROR_CODES.INVALID_REPORT,
                "The keyboard sent a report Ark could not read.",
                {cause, deviceId: this.deviceId}
            );
            void this.terminate(invalidReport, {
                activeError: invalidReport,
                closeDevice: true,
                queuedError: disconnectedAfter(this.deviceId, invalidReport),
            });
            return;
        }

        // The keyboard answers in order, so a reply to a request that timed
        // out softly comes before the active request's own.
        const now = Date.now();
        this.late = this.late.filter((entry) => entry.until > now);
        const late = this.late.findIndex((entry) => {
            try {return Boolean(entry.matchResponse(normalizedReport, Buffer.from(entry.report)));} catch {return false;}
        });
        if (late !== -1) {
            this.late.splice(late, 1);
            this.reportUnexpected(normalizedReport, "it answers a request that timed out");
            return;
        }

        const operation = this.active;
        if (!operation) {
            this.reportUnexpected(normalizedReport, "no request is active");
            return;
        }

        let matches;
        try {
            matches = Boolean(operation.matchResponse(normalizedReport, Buffer.from(operation.report)));
        } catch (error) {
            const matchError = liveLinkError(
                LIVE_LINK_ERROR_CODES.RESPONSE_MATCH_FAILED,
                "Ark could not match the keyboard's answer to its request.",
                {cause: error, deviceId: this.deviceId}
            );
            void this.terminate(matchError, {
                activeError: matchError,
                closeDevice: true,
                queuedError: disconnectedAfter(this.deviceId, matchError),
            });
            return;
        }

        if (!matches) {
            this.reportUnexpected(normalizedReport, "the response did not match the active request");
            return;
        }

        this.active = undefined;
        this.settle(operation, "resolve", normalizedReport);
        queueMicrotask(() => this.pump());
    }

    /** @param {Buffer} report @param {string} reason */
    reportUnexpected(report, reason) {
        if (!this.onUnexpectedReport) {
            return;
        }
        try {
            this.onUnexpectedReport({
                deviceId: this.deviceId,
                reason,
                report: Buffer.from(report),
            });
        } catch {
            // Diagnostics must never break the request lifecycle.
        }
    }

    /** @param {unknown} reason */
    handleDeviceDisconnect(reason) {
        const error = liveLinkError(
            LIVE_LINK_ERROR_CODES.DISCONNECTED,
            "The keyboard was disconnected.",
            {cause: reason instanceof Error ? reason : undefined, deviceId: this.deviceId}
        );
        void this.terminate(error, {activeError: error, closeDevice: false, queuedError: error});
    }

    /** @param {import("./types.js").RequestOperation} operation */
    timeoutOperation(operation) {
        if (!this.connected || this.active !== operation || operation.settled) {
            return;
        }
        const error = liveLinkError(
            LIVE_LINK_ERROR_CODES.TIMEOUT,
            `The keyboard did not answer within ${operation.timeoutMs} ms.`,
            // Which request went unanswered, for the diagnostics.
            {deviceId: this.deviceId, timeoutMs: operation.timeoutMs, request: operation.report.subarray(0, 5).toString("hex")}
        );
        // A background read the caller can miss: only it fails, and its late
        // reply is set aside. The keyboard is still the one connected.
        if (operation.softTimeout) {
            this.late.push({matchResponse: operation.matchResponse, report: operation.report, until: Date.now() + LATE_REPLY_MS});
            this.active = undefined;
            this.settle(operation, "reject", Object.assign(error, {soft: true}));
            queueMicrotask(() => this.pump());
            return;
        }
        void this.terminate(error, {
            activeError: error,
            closeDevice: true,
            queuedError: disconnectedAfter(this.deviceId, error),
        });
    }

    /** @param {import("./types.js").RequestOperation} operation */
    cancelOperation(operation) {
        if (operation.settled) {
            return;
        }
        const error = cancelledError(this.deviceId);
        if (this.active === operation) {
            void this.terminate(error, {
                activeError: error,
                closeDevice: true,
                queuedError: disconnectedAfter(this.deviceId, error),
            });
            return;
        }

        const index = this.queue.indexOf(operation);
        if (index !== -1) {
            this.queue.splice(index, 1);
        }
        this.settle(operation, "reject", error);
    }

    /** @param {import("./types.js").RequestOperation} operation @param {unknown} cause */
    failWrite(operation, cause) {
        if (!this.connected || this.active !== operation || operation.settled) {
            return;
        }
        const error = liveLinkError(
            LIVE_LINK_ERROR_CODES.WRITE_FAILED,
            "Ark could not send a report to the keyboard.",
            {cause, deviceId: this.deviceId}
        );
        void this.terminate(error, {
            activeError: error,
            closeDevice: true,
            queuedError: disconnectedAfter(this.deviceId, error),
        });
    }

    /** @overload @param {import("./types.js").RequestOperation | undefined} operation @param {'resolve'} method @param {Buffer} value @returns {void} */
    /** @overload @param {import("./types.js").RequestOperation | undefined} operation @param {'reject'} method @param {unknown} value @returns {void} */
    /** @param {import("./types.js").RequestOperation | undefined} operation @param {'resolve' | 'reject'} method @param {unknown} value */
    settle(operation, method, value) {
        if (!operation || operation.settled) {
            return;
        }
        operation.settled = true;
        operation.status = "settled";
        if (operation.timeoutId !== undefined) {
            clearTimeout(operation.timeoutId);
        }
        if (operation.signal && operation.abortListener) {
            operation.signal.removeEventListener("abort", operation.abortListener);
        }
        // The overloads require a report for resolve; reject accepts any cause.
        operation[method](/** @type {Buffer} */ (value));
    }

    /** @param {unknown} reason @param {import("./types.js").TerminationOptions} [options] */
    terminate(reason, options = {}) {
        if (this.state === "disconnected") {
            return this.closePromise || Promise.resolve();
        }

        this.state = "disconnected";
        this.disposeReportListener?.();
        this.disposeDisconnectListener?.();
        this.disposeReportListener = undefined;
        this.disposeDisconnectListener = undefined;

        const active = this.active;
        this.active = undefined;
        if (active) {
            this.settle(active, "reject", options.activeError || reason);
        }

        const queuedError = options.queuedError || reason;
        for (const operation of this.queue.splice(0)) {
            this.settle(operation, "reject", queuedError);
        }

        this.onClosed?.();
        for (const listener of Array.from(this.disconnectListeners)) {
            try {
                listener(reason);
            } catch {
                // A UI observer must not break transport cleanup.
            }
        }
        this.disconnectListeners.clear();

        this.closePromise = options.closeDevice === false
            ? Promise.resolve()
            : Promise.resolve().then(() => this.device.close()).catch(() => undefined);
        return this.closePromise;
    }
}

/** @param {unknown} deviceId */
function normalizeDeviceId(deviceId) {
    const value = typeof deviceId === "string" ? deviceId.trim() : "";
    if (!value) {
        throw new TypeError("deviceId must be a non-empty string.");
    }
    return value;
}

/** @param {unknown} value */
function normalizeTimeout(value) {
    const timeout = Number(value);
    if (!Number.isInteger(timeout) || timeout <= 0) {
        throw new TypeError("request timeout must be a positive integer number of milliseconds.");
    }
    return timeout;
}

/** @param {AbortSignal | null | undefined} value */
function isAbortSignal(value) {
    return value && typeof value.aborted === "boolean" &&
        typeof value.addEventListener === "function" &&
        typeof value.removeEventListener === "function";
}

/** @param {import("./types.js").Subscription} value @returns {import("./types.js").Disposer} */
function normalizeDisposer(value) {
    if (typeof value === "function") {
        return value;
    }
    if (value && typeof value.dispose === "function") {
        return () => value.dispose();
    }
    return () => undefined;
}

/** @param {Uint8Array} response @param {Uint8Array} request */
function defaultResponseMatcher(response, request) {
    return response[0] === request[0];
}

/** @param {string} deviceId */
function cancelledError(deviceId) {
    return liveLinkError(
        LIVE_LINK_ERROR_CODES.CANCELLED,
        "A request to the keyboard was cancelled.",
        {deviceId}
    );
}

/** @param {string} deviceId @param {InstanceType<typeof LiveLinkTransportError>} cause */
function disconnectedAfter(deviceId, cause) {
    return liveLinkError(
        LIVE_LINK_ERROR_CODES.DISCONNECTED,
        "Ark closed the connection to the keyboard after a request to it failed.",
        {cause, deviceId}
    );
}

module.exports = {
    DEFAULT_REQUEST_TIMEOUT_MS,
    LATE_REPLY_MS,
    CoordinatedDeviceConnection,
    DeviceRequestCoordinator,
    defaultResponseMatcher,
};
