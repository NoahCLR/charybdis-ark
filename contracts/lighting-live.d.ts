/** Volatile Lighting Live data. None of this belongs to a portable document. */
export interface LightingLiveCapability {
    facts: boolean; frame: boolean; ledCount: number; leftCount: number; frameBytes: number;
    chunkMax: number; leaseMs: number; stagingLeaseMs: number; renewMs: number; factsBytes: number; metadataBytes: number;
}
export interface LightingLiveSupport {available: boolean; reason: string; capability?: LightingLiveCapability}
export interface LightingLiveProfile {generation: number; crc32: number; digest: number; compiledDigest: number; actionAbi: number; kind: number; origin: number}
export interface LightingLiveSample {
    id: number; captured: number; generation: number; keymapGeneration: number; profile: LightingLiveProfile;
    source: 'master-main'; ledCount: number; leftCount: number; matrixKeys: number; slices: Record<number, number[]>;
}
export interface LightingLiveStatus {
    revision: number; operation: number; requestId: number; result: number; state: number; rpc: number; flags: number;
    token: number; frameRevision: number; offset: number; frameBytes: number; peerResult: number; guard: number;
    owner: number[]; started: number; renewal: number; crc32: number; role: number;
    snapshotId: number; snapshotReady: boolean; profileDigest: number; generation: number; captured: number; peerEpoch: number;
}
export interface LightingLiveView {
    support: LightingLiveSupport; active: boolean; state: 'paused' | 'sampling' | 'current' | 'stale' | 'unavailable';
    reason: string; sample: LightingLiveSample | null; ageMs: number | null;
    preview: {state: 'off' | 'uploading' | 'live' | 'stopping' | 'failed'; reason: string; status: LightingLiveStatus | null};
}
