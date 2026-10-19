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
