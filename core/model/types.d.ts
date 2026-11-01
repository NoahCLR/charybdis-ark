import type {ActionLimits} from '../schema/types.js';

/** A complete portable document, after validation at the model seam. */
export interface PortableDocument {
    format: 'charybdis-profile';
    version: number;
    keyboard: 'charybdis-4x6';
    actionAbiDigest: number;
    profile: string;
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
    macroBytes?: number;
    macroSlots?: number;
    brightnessMax?: number;
    effects?: {id: number; name: string}[];
    detectedHostOs?: number;
}

/** What a document's domains are read and written against: the keyboard's capabilities and limits, when it has them. */
export interface DomainsContext {
    capabilities?: ProfileDestination;
    limits?: SnapshotFacts['limits'];
    /** A document's decoded form the caller already has; editProfileDomains reads it only for that very document. */
    decoded?: DecodedProfile;
}
/** A document's domain, read as its model; the same model each time it is read. */
export type ReadDomain = <K extends import('../schema/profile-domains-types.js').DomainKey>(key: K) => import('../schema/profile-domains-types.js').DomainModels[K];
/** A document's domain, opened as its model to be encoded again; the same model each time it is opened. */
export interface OpenDomain extends ReadDomain {
    /** Whether the domain has been opened, so will be encoded again. */
    isOpen(key: import('../schema/profile-domains-types.js').DomainKey): boolean;
}
/** A draft edit's draft as it stands, besides the document it edits (model/draft-editor.js): the keyboard's facts, the revision a form names, and its decoded form, which only editProfileDomains reads. */
export interface Draft extends DomainsContext, SnapshotFacts {
    fingerprint?: string;
    identity?: import('../../contracts/edits.js').BaseIdentity;
}
export interface DecodedProfile {
    document: PortableDocument;
    profile: Buffer;
    /** The whole profile a save uploads: the profile's domains, the keymap and the macros. */
    candidate: Buffer;
    layers: number[][];
    macroSlots: Buffer[];
    settings: ReturnType<typeof import('../schema/settings-domain-v1.js').decodeSettings>;
    rgb: ReturnType<typeof import('../schema/rgb-domain-v1.js').decodeRgbDomainV1>;
    behaviors: ReturnType<typeof import('../schema/key-behavior-domain-v1.js').decodeKeyBehaviorDomain>;
    combos: ReturnType<typeof import('../schema/combo-domain-v1.js').decodeComboDomain>;
    pdModes: ReturnType<typeof import('../schema/pd-mode-domain-v1.js').decodePdDomain>;
    codecOptions: ReturnType<typeof import('../schema/profile-depth.js').profileDepthOptions>;
    danglingPointingKeys: Record<string, number>;
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
export interface LayerTransition {kind: string; layer: number; layers?: number; when: LayerCondition}
export interface LayerAnalysisLimits {nodes?: number; work?: number}
/** An owner the state bits do not hold (layer-state-graph.js): entered by one of `entries`, it keeps `always` on, `never` off and `unless.layer` on while none of `unless.layers` is, until `ends` holds, under its own `transitions`. */
export interface LayerAnchor<T extends LayerTransition> {
    entries: T[];
    transitions: T[];
    ends: LayerCondition;
    always?: number;
    never?: number;
    unless?: {layer: number; layers: number};
}
/** Whether an anchor can be entered with locks from which `ends` is out of reach: the smallest such lock set, the entry that gets into it and the steps from rest. */
export type LayerAnchorResult<T extends LayerTransition> = {trapped: false} | {trapped: true; locks: number; effect: T; path: LayerPathEffect<T>[]};
export interface LayerAnalysisInput<T extends LayerTransition> {
    always?: number;
    transitions: T[];
    queries?: LayerCondition[];
    anchors?: LayerAnchor<T>[];
    trapLimit?: number;
    limits?: LayerAnalysisLimits;
}
export interface LayerReachProof<T extends LayerTransition> {
    reachedLayers: number;
    queries: boolean[];
    effects: T[];
    witnesses: Set<number>;
}
export type LayerPathEffect<T extends LayerTransition> = T | {kind: 'release'; layer: number; layers?: number; when: true; from?: undefined; how?: undefined};
export type LayerAnalysisResult<T extends LayerTransition> =
    | (LayerReachProof<T> & {
        complete: true;
        reachabilityComplete?: undefined;
        traps: {locks: number; effect: LayerPathEffect<T>; path: LayerPathEffect<T>[]}[];
        trapCount: number;
        anchors: LayerAnchorResult<T>[];
    })
    | (LayerReachProof<T> & {
        complete: false;
        reachabilityComplete: true;
        phase: string;
        affectedLayers: number;
        traps?: undefined;
        trapCount?: undefined;
        anchors?: undefined;
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
        anchors?: undefined;
    };

export interface LayerEffect {
    /** `modeLock`: a pointing mode's lock key, which locks the mode (`slot`) and with it the layers its key turns on, if any (firmware D-F62). */
    kind: 'hold' | 'lock' | 'move' | 'unowned' | 'modeLock';
    /** The layer it acts on, or the lowest of `layers`. */
    layer: number;
    /** Every layer it acts on at once, for a key that turns several on (firmware D-F26, D-F62); `layer` alone without it. */
    layers?: number;
    taps?: number;
    oneShot?: boolean;
    /** The pointing mode whose key turns the layers on, by its name (firmware D-F62). */
    mode?: string;
    /** The pointing slot a `modeLock` locks. */
    slot?: number;
    /** A custom key's shortcut turns the layers on (firmware D-F26). */
    shortcut?: boolean;
    /** On from every press of its own key, whatever the key's row: a tap-toggle or one-shot shortcut, as TT() and OSL() are. */
    fromPress?: boolean;
}
export interface LayerEffectSource {layer?: number; layoutIndex?: number; code?: number; combo?: number; trackball?: boolean}
export interface OfferedLayerEffect extends LayerEffect {how: string; note?: string; from: LayerEffectSource}
export type WalkLayerEffect = OfferedLayerEffect | {kind: 'release'; layer: number; layers?: number; from?: undefined; how?: undefined};
/** The bounded walk's explicit states: a state is its locks with the held layers above them. */
export interface LayerStateGraph {
    complete: boolean;
    cache: Map<number, OfferedLayerEffect[]>;
    edges: Map<number, {to: number; effect: WalkLayerEffect}[]>;
    parent: Map<number, {from: number; effect: WalkLayerEffect} | null>;
    home: Set<number>;
}
/** A set of locks with no way back to Base, the lock that gets into it and the steps from rest. */
export interface LayerTrap {locks: number; effect: WalkLayerEffect; path: WalkLayerEffect[]}
/** A pointing mode that can lock, with `locks` locked, where nothing turns it off: the lock key that gets into it and the steps from rest. */
export interface ModeTrap {slot: number; locks: number; effect: OfferedLayerEffect; path: WalkLayerEffect[]}
/** What the walk over a profile's layer states found, whichever walk ran (layer-walk.js). */
export interface LayerWalk {
    /** Which layers and combos can be reached is established; the reach findings rest on it. */
    reachabilityComplete: boolean;
    /** Whether every set of locks has a way back to Base is established; `traps` are then every one there is, up to the named few. */
    escapeComplete: boolean;
    /** The layers an unfinished check involves, none once both are established. */
    affectedLayers: number;
    reachedLayers: number;
    /** The combos that can fire; meaningful only once reachability is established. */
    reachableCombos: Set<number>;
    /** What reachable states offer the layers, each with where it comes from. */
    effects: OfferedLayerEffect[];
    /** The smallest traps, at most MAX_TRAPS, and how many smallest traps there are. */
    traps: LayerTrap[];
    trapCount: number;
    /** The pointing modes that can lock with no way to turn them off, each once. */
    modeTraps: ModeTrap[];
}

/** Reviews retain semantic targets until the panel model resolves key names. */
export type ModelReviewPlace = Exclude<import('../../contracts/model.js').ReviewPlace, {kind: 'behaviour'}> | {kind: 'behaviour'; target: import('../schema/types.js').SemanticAction};
export interface ModelReviewChange extends Omit<import('../../contracts/model.js').ReviewChange, 'place' | 'unit'> {unit: string; place?: ModelReviewPlace | null}

/** Presentation/edit inputs describe received facts without importing session or wire modules. */
/** A profile's domains as read, decoded by the schema. */
export interface ReadDomains {
    rgb?: import('../schema/types.js').RgbProfile;
    keyBehaviors?: {rows: import('../schema/types.js').BehaviorRow[]};
    settings?: import('../schema/types.js').SettingsDomain;
    pdModes?: import('../schema/types.js').PointingSlot[];
    combos?: ReturnType<typeof import('../schema/combo-domain-v1.js').decodeComboDomain>;
}
/** A key of a layer as read: where it sits, its keycode and what that resolves to. */
export interface LayoutKey {layoutIndex: number; row: number; column: number; keycode: number; resolved: import('../data/types.js').ResolvedKeycode}
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
