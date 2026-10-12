import type {RgbProfile, RgbOptions, BehaviorOptions, BehaviorRow, SettingsDomain, PdSlot, SemanticAction} from './types.js';

export interface DomainOptions {rgb?: RgbOptions; behaviors?: BehaviorOptions}
export interface DomainModels {
    rgb: RgbProfile;
    behaviors: {rows: (BehaviorRow & {target: SemanticAction & {flags: 0}})[]; rowCount: number; populatedStepCount: number; byteLength: number};
    combos: {version: typeof import('./profile-domains.js').PROFILE_DOMAIN_VERSIONS[typeof import('./profile-domains.js').PROFILE_DOMAIN_IDS.COMBOS]; defaultTermMs: number; holdTermMs: number; rows: {id: number; inputs: (SemanticAction & {flags: 0})[]; output: SemanticAction & {flags: 0}; termMs: number | null; mustHold: boolean; mustTap: boolean; ordered: boolean; enabled: boolean; allowedLayers: number}[]};
    settings: SettingsDomain & {formatVersion: typeof import('./profile-domains.js').PROFILE_DOMAIN_VERSIONS[typeof import('./profile-domains.js').PROFILE_DOMAIN_IDS.SETTINGS]};
    pdModes: PdSlot[];
}
export type DomainKey = keyof DomainModels;
export interface DomainCodec<K extends DomainKey> {
    id: number;
    key: K;
    version: number;
    wireBit: number;
    decode(bytes: Buffer, options?: DomainOptions): DomainModels[K];
    encode(value: DomainModels[K], options?: DomainOptions): Buffer;
}
