import type {PortableDocument, NativeComboTable, CompleteSnapshot} from '../../core/model/types.js';
import type {SettingsDomain} from '../../core/schema/types.js';

export interface CompiledOptions {
    combos?: (NativeComboTable['rows'][number] & {id?: number})[];
    layout?: Buffer;
    policy?: SettingsDomain;
}
export interface PayloadState {
    bytes: Buffer;
    generation: number;
    layoutVersion?: number;
    chunkSize?: number;
    payloadLength?: number;
    digest?: number;
    crc?: number;
    schemaMajor?: number;
    schemaMinor?: number;
    domainMask?: number;
    originHalf?: number;
    flags?: number;
}
export interface FakeKeyboardOptions {
    document: PortableDocument;
    compiled?: Buffer;
    compiledOnly?: boolean;
    peerKnown?: boolean;
    generation?: number;
    firmwareVersion?: number;
    brightnessMax?: number;
    options?: ReturnType<typeof import('./keyboard-options.js').wire>;
    /** The version its settings readback reports; any but 8 is firmware Ark does not read. */
    settingsVersion?: number;
}
export interface FakeKeyboard {
    requests: Buffer[];
    mutations: Buffer[];
    unhandled: Buffer[];
    answer(report: Uint8Array): Buffer[];
}
export type FakeKeyboardAdapterOptions = FakeKeyboardOptions & {keyboard?: FakeKeyboard} | {keyboard: FakeKeyboard};
export type FakeKeyboardAdapter = InstanceType<typeof import('../../core/transport/fake-device-adapter.js').FakeDeviceAdapter> & {keyboard: FakeKeyboard};

export interface WritableKeyboardFaults {
    busy?: number;
    loseReply?: number;
    stallCommit?: boolean;
    stageError?: boolean;
    abortRejected?: boolean;
    cleanupPending?: boolean;
    peerUnseen?: boolean;
    disconnectAfterDecision?: boolean;
    disconnected?: boolean;
    beforeRequest?: (request: Buffer, keyboard: ReturnType<typeof import('./writable-keyboard.js').writableKeyboard>) => void;
    afterRequest?: (request: Buffer, response: Buffer, keyboard: ReturnType<typeof import('./writable-keyboard.js').writableKeyboard>) => void;
}
