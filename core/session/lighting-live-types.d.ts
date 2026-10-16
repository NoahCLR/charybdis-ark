import type {RequestConnection} from '../transport/types.js';
import type {LightingLiveCapability, LightingLiveProfile, LightingLiveSupport} from '../../contracts/lighting-live.js';
export interface LiveContext {
    key: string; factKinds: number[]; storage: {generation: number; digest: number}; connection: RequestConnection; support: LightingLiveSupport; profile: LightingLiveProfile;
    nextRequestId(): number;
}
export interface LiveOptions {context(): LiveContext | null; changed(): void; now?: () => number; nonce?: () => number[]}
export interface PreviewIdentity {owner: number[]; token: number; revision: number; digest: number; crc32: number; capability: LightingLiveCapability}
