import type {RequestOptions} from '../transport/types.js';

export interface ReadOptions extends Pick<RequestOptions, 'signal' | 'timeoutMs'> {
    requestId?: number;
    nextRequestId?: () => number;
}

export interface RequestIds {next(): number}

export type PayloadMetadata = ReturnType<typeof import('./profile-payload-v1.js').decodePayloadMetadata>;
export interface PayloadRead {metadata: PayloadMetadata; bytes: Buffer}
export interface PayloadReadOptions extends ReadOptions {
    generationRetries?: number;
    onProgress?: (progress: import('../../contracts/model.js').CountedProgress) => void;
    previous?: PayloadRead;
    /** Bytes read from the keyboard moments ago that may be this payload: used, without downloading it, only if they have its length, CRC and digest. */
    sameAs?: Uint8Array;
}

export type CandidateTransferRange =
    | {kind: 'write'; offset: number; length: number}
    | {kind: 'reuse'; offset: number; length: number; sourceOffset: number};

export interface StorageCapabilities {compiledLayerCount?: number; macroSlots?: number; macroBytes?: number}
export interface StorageIdentity {generation: number; digest: number}
export interface StorageRange {offset: number; bytes: Buffer}
export interface ReadRegionOptions extends Pick<RequestOptions, 'signal' | 'timeoutMs'> {
    startOffset?: number;
    capacity?: number;
    onProgress?: (progress: import('../../contracts/model.js').CountedProgress) => void;
}
export interface WriteRegionOptions {
    startOffset?: number;
    capacity?: number;
    onProgress?: (progress: {completed: number; total: number}) => void;
}
export interface StorageReadOptions {
    capabilities?: StorageCapabilities;
    matrixRows?: number;
    matrixColumns?: number;
    allowIncomplete?: boolean;
    onProgress?: (progress: import('../../contracts/model.js').CountedProgress & {region: 'layout' | 'macros'}) => void;
    nextRequestId?: () => number;
    storageIdentity?: StorageIdentity;
}
export interface ViaPosition {layer: number; row: number; column: number; keycode?: number}
export interface LayoutReadOptions extends ReadOptions {
    layerCount: number;
    onProgress?: (progress: import('../../contracts/model.js').CountedProgress & {layer: number}) => void;
}

export interface CandidateMetadata {
    schemaMajor: number;
    schemaMinor: number;
    requestedDomains: number;
    flags: number;
    payloadLength: number;
    crc32: number;
    digest: number;
    actionAbiDigest: number;
    /** Store format 6, implied by Profile Wire 2 and not on the wire. */
    storeFormatVersion: number;
}
export type CandidateMetadataInput = Omit<CandidateMetadata, 'flags' | 'storeFormatVersion'> & {flags?: number; storeFormatVersion?: number};
export interface CandidateBlobOptions {
    actionAbiDigest: number;
    requestedDomains?: number;
    storeFormatVersion?: number;
    capabilities?: {maxProfilePayload?: number};
}
export interface ReuseSource {kind: number; origin: number; generation: number; digest: number; crc32: number}

// Live edits (profile-edit-v1.js, firmware D-F32).
export interface EditSplice {domainId: number; offset: number; remove: number; insert: number; create?: boolean; drop?: boolean}
export interface EditReply {result: number; resultName: string; phase: number; session: number; revision: number; flags: number}
export interface EditStatusFlags {
    unsaved: boolean; peerRequired: boolean; peerConverged: boolean; peerKnown: boolean; editsBlocked: boolean;
    savedCompiled: boolean; saving: boolean; modeConflict: boolean; waitingSafe: boolean; storagePaused: boolean;
    peerStoragePaused: boolean; peerRefused: boolean; modeNotStored: boolean; adjustmentPending: boolean;
}
export interface EditProgress extends EditStatusFlags {
    phase: number; flags: number; session: number; revision: number; savedGeneration: number; savedOrigin: number;
    lastResult: number; lastTransactionId: number; transactionId: number; mode: number; splicesReceived: number;
}
export interface EditStatus extends EditProgress {
    peer: {phase: number; lastResult: number; transactionId: number; session: number; revision: number; unsaved: boolean; savedCompiled: boolean; mode: number};
    save: {phase: number; lastResult: number; lastError: number; transactionId: number; lastTransactionId: number};
    insertedReceived: number;
    refusal: {validatorResult: number; domainId: number; tableId: number; row: number; step: number; field: number; byteOffset: number; detailKind: number; detailCode: number};
    safeBoundaryReasons: number; activeLength: number;
    autoSave: AutoSaveStatus;
}
/** The keyboard's own saves since its USB half booted (edit status page 3). */
export interface AutoSaveStatus {inProgress: boolean; lastWasAutomatic: boolean; count: number; revision: number; generation: number; quietMs: number}
export interface EditModeRead {mode: number; counter: number; peerMode: number; peerCounter: number; peerKnown: boolean; conflict: boolean; agreed: boolean}
export interface RuntimeToggle {master: boolean; override: boolean}
export interface RuntimeRead {
    combos: RuntimeToggle; behaviours: RuntimeToggle;
    live: {defaultDpi: number; snipingDpi: number; rgbMode: number; rgbColor: number; defaultLayers: number; keymapOptions: number};
}
export interface ActiveProfileMetadata {length: number; session: number; revision: number; savedGeneration: number; savedOrigin: number; domainMask: number; unsaved: boolean}
