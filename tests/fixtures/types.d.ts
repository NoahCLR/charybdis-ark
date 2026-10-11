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
    streaming?: boolean;
    macroReadMap?: boolean;
    compiledOnly?: boolean;
    generation?: number;
    firmwareVersion?: number;
    brightnessMax?: number;
    options?: ReturnType<typeof import('./keyboard-options.js').wire>;
}
export interface FakeKeyboard {
    requests: Buffer[];
    mutations: Buffer[];
    unhandled: Buffer[];
    answer(report: Uint8Array): Buffer[];
}
export type FakeKeyboardAdapterOptions = FakeKeyboardOptions & {keyboard?: FakeKeyboard} | {keyboard: FakeKeyboard};
export type FakeKeyboardAdapter = InstanceType<typeof import('../../core/transport/fake-device-adapter.js').FakeDeviceAdapter> & {keyboard: FakeKeyboard};

/** Deliberately partial protocol results supplied by restore tests. */
export interface RestoreFixtureOperations {
    capture(): Promise<CompleteSnapshot & {identity: import('../../core/session/types.js').CaptureIdentity; storage: import('../../core/session/types.js').HeldStorage}>;
    readIdentity: NonNullable<import('../../core/session/types.js').RestoreOperations['readIdentity']>;
    readCandidate(): Promise<{state: number}>;
    createCoordinator(): {
        upload(bytes: Uint8Array, options: import('../../core/session/candidate-upload-types.js').UploadCallOptions & {verifyBase(): Promise<void>}): Promise<{transactionId: number; metadata: {digest: number}}>;
        commit(id: number, options: {afterDecision(): Promise<void>}): Promise<void>;
    };
    createViaCoordinator(): {
        stage(options: Parameters<InstanceType<typeof import('../../core/session/logical-via-stage-coordinator.js').LogicalViaStageCoordinator>['stage']>[0]): Promise<void>;
        waitUntilAccepted(): Promise<void>;
        abort(): Promise<void>;
    };
    rollForwardLocal: NonNullable<import('../../core/session/types.js').RestoreOperations['rollForwardLocal']>;
    waitStorage(): Promise<{ready: boolean; generation: number; digest: number}>;
    readStorage(): Promise<{ready: boolean; generation: number; digest: number}>;
    readStored(...args: Parameters<NonNullable<import('../../core/session/types.js').RestoreOperations['readStored']>>): Promise<Buffer>;
    readProfile(): Promise<{activeKind: number; activeDigest: number; committedDigest: number; stateFlags: number; conflictCount: number}>;
}
