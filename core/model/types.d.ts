import type {ActionLimits} from '../schema/types.js';

/** A complete portable document, after validation at the model seam. */
export interface PortableDocument {
    format: 'charybdis-profile';
    version: number;
    keyboard: 'charybdis-4x6';
    actionAbiDigest: number;
    layers: number[][];
    profile: string;
    macros: string[];
}

/** Destination facts used by portable documents and editors, not a wire response. */
export interface ProfileDestination extends Partial<ActionLimits> {
    featureFlags?: number;
    actionAbiDigest?: number;
    compiledLayerCount?: number;
    supportedDomainMask?: number;
    maxProfilePayload?: number;
    maxTapStepsPerBehavior?: number;
    maxBehaviorRows?: number;
    maxPopulatedBehaviorSteps?: number;
    maxCombos?: number;
    maxKeysPerCombo?: number;
    customKeySlots?: number;
    maxReusableRgbGroups?: number;
    maxRgbStageGroupRows?: number;
    viaMacroBytes?: number;
    viaMacroSlots?: number;
    brightnessMax?: number;
    effects?: {id: number; name: string}[];
    physicalGestureTiming?: boolean;
    ownedTapping?: boolean;
    ownedLayerToggles?: boolean;
    behaviorQmkFunctions?: boolean;
    detectedHostOs?: number;
}

export interface DecodedProfile {
    document: PortableDocument;
    profile: Buffer;
    layout: Buffer;
    macros: Buffer;
    settings: ReturnType<typeof import('../schema/settings-domain-v1.js').decodeSettings>;
    rgb: ReturnType<typeof import('../schema/rgb-domain-v1.js').decodeRgbDomainV1>;
    behaviors: ReturnType<typeof import('../schema/key-behavior-domain-v1.js').decodeKeyBehaviorDomain>;
    combos: ReturnType<typeof import('../schema/combo-domain-v1.js').decodeComboDomain>;
    pdModes: ReturnType<typeof import('../schema/pd-mode-domain-v1.js').decodePdDomain>;
    codecOptions: ReturnType<typeof import('../schema/profile-depth.js').profileDepthOptions>;
    danglingPdBindings: Record<string, number>;
}
export interface ProfileSummary {layers: number; behaviors: number; combos: number; macros: number; names: string[]}
export interface SnapshotFacts {
    hostOs?: {detected: number} | null;
    limits?: {brightnessMax?: number} | null;
    options?: {effects: {id: number; name: string}[]; supportedKeymapOptions: number; keymapMasks: readonly number[]; ledFlags: number} | null;
}
export interface CompleteSnapshot extends SnapshotFacts {
    document: PortableDocument;
    fingerprint: string;
    summary: ProfileSummary;
    incomplete?: false;
    decoded?: DecodedProfile;
}
/** An interrupted macro write retains raw bank bytes for recovery diagnostics. */
export interface RecoveryCaptureDocument {
    format: 'charybdis-recovery-capture';
    version: 1;
    keyboard: 'charybdis-4x6';
    actionAbiDigest: number;
    profile: string;
    layout: string;
    macros: string;
}
export interface IncompleteSnapshot extends SnapshotFacts {
    incomplete: true;
    document?: RecoveryCaptureDocument;
    fingerprint?: string;
    summary?: null;
    decoded?: undefined;
}
export type ProfileSnapshot = CompleteSnapshot | IncompleteSnapshot;

/** Live VIA definitions use native keycodes, unlike the portable combo domain. */
export interface NativeComboTable {
    defaultTermMs: number;
    holdTermMs: number;
    rows: {
        inputs: number[];
        output: number;
        termMs: number;
        followsDefault?: boolean;
        useOutputBehavior?: boolean;
        mustHold?: boolean;
        mustTap?: boolean;
        ordered?: boolean;
        enabled?: boolean;
        allowedLayers?: number;
    }[];
    noTimer?: boolean;
    customTrigger?: boolean;
    customRelease?: boolean;
    customRepress?: boolean;
    strictTimer?: boolean;
    fixedReference?: boolean;
}

/** Boolean conditions over active layers, independent of keyboard semantics. */
export type LayerCondition = boolean | {
    on?: number;
    off?: number;
    all?: LayerCondition[];
    any?: LayerCondition[];
    not?: LayerCondition;
};
export interface LayerTransition {kind: string; layer: number; when: LayerCondition}
export interface LayerAnalysisLimits {nodes?: number; work?: number}
export interface LayerAnalysisInput<T extends LayerTransition> {
    always?: number;
    transitions: T[];
    queries?: LayerCondition[];
    trapLimit?: number;
    limits?: LayerAnalysisLimits;
}
export interface LayerReachProof<T extends LayerTransition> {
    reachedLayers: number;
    queries: boolean[];
    effects: T[];
    witnesses: Set<number>;
}
export type LayerPathEffect<T extends LayerTransition> = T | {kind: 'release'; layer: number; when: true; from?: undefined; how?: undefined};
export type LayerAnalysisResult<T extends LayerTransition> =
    | (LayerReachProof<T> & {
        complete: true;
        reachabilityComplete?: undefined;
        traps: {locks: number; effect: LayerPathEffect<T>; path: LayerPathEffect<T>[]}[];
        trapCount: number;
    })
    | (LayerReachProof<T> & {
        complete: false;
        reachabilityComplete: true;
        phase: string;
        affectedLayers: number;
        traps?: undefined;
        trapCount?: undefined;
    })
    | {
        complete: false;
        reachabilityComplete?: undefined;
        phase: string;
        affectedLayers: number;
        reachedLayers?: undefined;
        queries?: undefined;
        effects?: undefined;
        witnesses?: undefined;
        traps?: undefined;
        trapCount?: undefined;
    };

export interface LayerEffect {
    kind: 'hold' | 'lock' | 'move' | 'unowned';
    layer: number;
    taps?: number;
    oneShot?: boolean;
}
export interface LayerEffectSource {layer?: number; layoutIndex?: number; code?: number; combo?: number; trackball?: boolean}
export interface OfferedLayerEffect extends LayerEffect {how: string; note?: string; from: LayerEffectSource}
export type WalkLayerEffect = OfferedLayerEffect | {kind: 'release'; layer: number; from?: undefined; how?: undefined};
export interface BoundedLayerWalk {
    complete: boolean;
    cache: Map<number, OfferedLayerEffect[]>;
    edges: Map<number, {to: number; effect: WalkLayerEffect}[]>;
    parent: Map<number, {from: number; effect: WalkLayerEffect} | null>;
    home: Set<number>;
    symbolic?: false;
    reachabilityComplete?: undefined;
    reachedLayers?: undefined;
    effects?: undefined;
    reachableCombos?: undefined;
    affectedLayers?: undefined;
    uncertainty?: {affectedLayers: number};
}

/** Reviews retain semantic targets until the panel model resolves key names. */
export type ModelReviewPlace = Exclude<import('../../contracts/model.js').ReviewPlace, {kind: 'behaviour'}> | {kind: 'behaviour'; target: import('../schema/types.js').SemanticAction};
export interface ModelReviewChange extends Omit<import('../../contracts/model.js').ReviewChange, 'place' | 'unit'> {unit: string; place?: ModelReviewPlace | null}

/** Presentation/edit inputs describe received facts without importing session or wire modules. */
export interface PendingProfileRead {
    state?: 'unread' | 'reading' | 'unavailable';
    error?: {message: string; code?: string};
}
export type BaseRgbRead = PendingProfileRead | {
    state: 'read'; effectId: number; hue: number; saturation: number; brightness: number; speed: number; readAt?: string;
};
export type ComboRead = PendingProfileRead | (Omit<NativeComboTable, 'rows'> & {
    state: 'read';
    layerReferences: number[];
    rows: (NativeComboTable['rows'][number] & {
        id: number; followsDefault: boolean; mustHold: boolean; mustTap: boolean; ordered: boolean;
        enabled: boolean; allowedLayers: number;
    })[];
});
