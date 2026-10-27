/** The same adapter interface is implemented by native HID, WebHID and fixtures. */
export type MaybePromise<T> = T | PromiseLike<T>;
export type Disposer = () => unknown;
export type Subscription = Disposer | {dispose(): unknown} | void;
export type ReportListener = (report: Uint8Array) => void;
export type DisconnectListener = (reason: unknown) => void;

export interface DeviceDescriptor {
    id: string;
    path?: string;
    vendorId?: number;
    productId?: number;
    usagePage?: number;
    usage?: number;
    serialNumber?: string;
    manufacturer?: string;
    product?: string;
    release?: number;
    interface?: number;
}

export interface ConnectedDevice {
    write(report: Uint8Array): MaybePromise<unknown>;
    onReport(listener: ReportListener): Subscription;
    onDisconnect(listener: DisconnectListener): Subscription;
    close(): MaybePromise<unknown>;
}

export interface DeviceAdapter {
    listDevices(): MaybePromise<DeviceDescriptor[]>;
    connect(deviceId: string): MaybePromise<ConnectedDevice>;
}

export type TransportErrorCode =
    | "ALREADY_CONNECTED" | "CANCELLED" | "CONNECT_FAILED" | "DEVICE_NOT_FOUND"
    | "DISCONNECTED" | "ENUMERATION_FAILED" | "INVALID_ADAPTER" | "INVALID_REPORT"
    | "NATIVE_MODULE_UNAVAILABLE" | "NOT_CONNECTED" | "RESPONSE_MATCH_FAILED"
    | "TIMEOUT" | "WRITE_FAILED";

export interface TransportErrorOptions {
    cause?: unknown;
    deviceId?: string;
    /** A timeout: how long the request waited, and its first bytes in hex. */
    timeoutMs?: number;
    request?: string;
}

export interface RequestOptions {
    timeoutMs?: number;
    signal?: AbortSignal;
    matchResponse?: (response: Buffer, request: Buffer) => boolean;
    /** A background read that may be missed: its timeout rejects it alone and keeps the connection. */
    softTimeout?: boolean;
}

/** Protocols need a serialized request channel, not a native device handle. */
export interface RequestConnection {
    request(report: Uint8Array, options?: RequestOptions): Promise<Buffer>;
}

export interface UnexpectedReport {
    deviceId: string;
    reason: string;
    report: Buffer;
}

export interface CoordinatorOptions {
    defaultTimeoutMs?: number;
    onUnexpectedReport?: (report: UnexpectedReport) => void;
}

export interface CoordinatedConnectionOptions {
    defaultTimeoutMs: number;
    onUnexpectedReport?: (report: UnexpectedReport) => void;
    onClosed?: () => void;
}

export interface RequestOperation {
    matchResponse: (response: Buffer, request: Buffer) => boolean;
    reject: (reason: unknown) => void;
    report: Buffer;
    resolve: (report: Buffer) => void;
    settled: boolean;
    signal?: AbortSignal;
    status: "queued" | "active" | "settled";
    timeoutId?: ReturnType<typeof setTimeout>;
    timeoutMs: number;
    softTimeout: boolean;
    abortListener?: () => void;
}

export interface TerminationOptions {
    activeError?: unknown;
    queuedError?: unknown;
    closeDevice?: boolean;
}

/** Only the native module operations Ark uses, so injected adapters need no native handle. */
export interface NativeHidDevice {
    write(report: Buffer): MaybePromise<unknown>;
    close(): MaybePromise<unknown>;
    on(event: string, listener: (value: unknown) => void): unknown;
    off?(event: string, listener: (value: unknown) => void): unknown;
    removeListener?(event: string, listener: (value: unknown) => void): unknown;
}

/**
 * node-hid's device listing entry, declared here so this file needs no Node
 * types: the web page's type check reads it too. Loading node-hid as a
 * NativeHidModule (node-hid-adapter.js) checks that node-hid still matches it.
 */
export interface NativeHidDeviceInfo {
    vendorId: number;
    productId: number;
    path?: string | undefined;
    serialNumber?: string | undefined;
    manufacturer?: string | undefined;
    product?: string | undefined;
    release: number;
    interface: number;
    usagePage?: number | undefined;
    usage?: number | undefined;
}

export interface NativeHidModule {
    devicesAsync(vendorId: number, productId: number): MaybePromise<NativeHidDeviceInfo[]>;
    HIDAsync: {open(path: string, options?: {nonExclusive?: boolean}): MaybePromise<NativeHidDevice>};
}

/** WebHID's required surface, independent of any DOM library. */
export interface WebHidInputReport {
    reportId: number;
    data: ArrayBufferView;
}

export interface WebHidDevice {
    vendorId: number;
    productId: number;
    productName: string;
    collections: {usagePage: number; usage: number}[];
    opened: boolean;
    open(): Promise<void>;
    close(): Promise<void>;
    forget?(): Promise<void>;
    sendReport(reportId: number, data: Uint8Array<ArrayBuffer>): Promise<void>;
    addEventListener(type: 'inputreport', listener: (event: WebHidInputReport) => void): void;
    removeEventListener(type: 'inputreport', listener: (event: WebHidInputReport) => void): void;
}

export interface WebHid {
    getDevices(): Promise<WebHidDevice[]>;
    requestDevice(options: {filters: {vendorId: number; productId: number; usagePage: number; usage: number}[]}): Promise<WebHidDevice[]>;
    addEventListener(type: 'connect' | 'disconnect', listener: (event: {device: WebHidDevice}) => void): void;
    removeEventListener(type: 'connect' | 'disconnect', listener: (event: {device: WebHidDevice}) => void): void;
}
