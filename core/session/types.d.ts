/** Observable read states retain error details for the published model. */
export interface PublicError {code: string; message: string}
export type PendingRead = {state?: 'unread' | 'reading' | 'unavailable'; error?: PublicError; progress?: import('../../contracts/model.js').CountedProgress | null; layers?: []; readAt?: string};
export type BaseRgbRead = PendingRead | (Awaited<ReturnType<typeof import('../protocol/via-rgb-matrix-v1.js').readViaRgbMatrix>> & {state: 'read'; readAt?: string; error?: undefined});
export type ComboRead = PendingRead | (Omit<ReturnType<typeof import('../protocol/combo-readback-v1.js').decodeComboPages>, 'digest' | 'noTimer' | 'strictTimer' | 'customTrigger' | 'customRelease' | 'customRepress' | 'fixedReference'> & {digest?: number; noTimer?: boolean; strictTimer?: boolean; customTrigger?: boolean; customRelease?: boolean; customRepress?: boolean; fixedReference?: boolean} & {state: 'read'; readAt?: string; error?: undefined});

export type ConnectionToken = number | string | null;
export type SaveRecovery = (document: import('../model/types.js').PortableDocument | import('../model/types.js').RecoveryCaptureDocument) => Promise<string | undefined>;
export interface DraftDeviceContext {
    connected: boolean;
    selectedDeviceId?: string | null;
    connectionToken?: ConnectionToken;
    busy?: boolean;
    baseRgb?: BaseRgbRead | null;
    committed?: object | null;
}
export interface DraftApplyService {
    snapshot(): DraftDeviceContext;
    restorePortableProfile(document: import('../model/types.js').PortableDocument, options: {expectedFingerprint?: string; saveRecovery: SaveRecovery}): Promise<import('../model/types.js').CompleteSnapshot & {peerUnseen?: boolean}>;
}
export type DraftEdit = Extract<import('../../contracts/edits.js').PanelEdit, {type: import('../../contracts/edits.js').DraftEditType}> & {draftRevision: number; expectedBase?: Partial<import('../../contracts/edits.js').BaseIdentity>};

export type DeviceCapabilities = ReturnType<typeof import('../protocol/profile-wire-v1.js').decodeCapabilityPages>;
export type ProfileStatus = ReturnType<typeof import('../protocol/profile-wire-v1.js').decodeStatusPages>;
export interface ReadDomains {
    rgb?: import('../schema/types.js').RgbProfile;
    keyBehaviors?: {rows: import('../schema/types.js').BehaviorRow[]};
    settings?: import('../schema/types.js').SettingsDomain;
    pdModes?: import('../schema/types.js').PdSlot[];
    combos?: ReturnType<typeof import('../schema/combo-domain-v1.js').decodeComboDomain>;
}
export interface CommittedRead {
    state?: 'unread' | 'reading' | 'unavailable' | 'read';
    source?: string;
    generation?: number;
    digest?: number;
    originHalf?: number;
    byteLength?: number;
    domains?: ReadDomains;
    failures?: {domainId: number; message: string}[];
    progress?: import('../../contracts/model.js').CountedProgress | null;
    readAt?: string;
    schema?: {major: number; minor: number};
    domainIds?: number[];
}
export interface LayoutKey {layoutIndex: number; row: number; column: number; keycode: number; resolved: import('../data/types.js').ResolvedKeycode}
export type LayoutRead = PendingRead | {state: 'read'; progress?: import('../../contracts/model.js').CountedProgress | null; readAt?: string; catalog?: ReturnType<typeof import('../data/keycode-catalog.js').metadata>; layers: {layer: number; keys: LayoutKey[]}[]};
/** Readback facts consumed by presentation, including partially loaded devices. */
export interface DeviceModelInput {
    capabilities?: Partial<DeviceCapabilities> | null;
    status?: Partial<ProfileStatus> | null;
    committed?: CommittedRead | null;
    layout?: LayoutRead | null;
    combos?: ComboRead | null;
    baseRgb?: BaseRgbRead | null;
    settingsView?: null | ReturnType<typeof import('../model/settings-editor.js').settingsEditorView>;
    macroView?: null | ReturnType<typeof import('../model/macro-editor.js').macroEditorView>;
    customKeyView?: null | ReturnType<typeof import('../model/custom-key-editor.js').customKeyEditorView>;
    device?: import('../transport/types.js').DeviceDescriptor;
    /** The keyboard's name as the connected keyboard stores it, '' for its built-in name; undefined until its profile is read. */
    storedKeyboardName?: string;
    phase?: import('../../contracts/model.js').PhaseId;
    busy?: boolean;
    error?: {message: string} | null;
    mutationCompatibility?: {recoveryPending?: boolean} | null;
    liveApply?: import('../../contracts/model.js').ApplyView | {state: 'idle'; failure?: undefined} | null;
}

export type CandidateStatus = Awaited<ReturnType<typeof import('../protocol/profile-candidate-v1.js').readCandidateStatus>>;
export type CandidatePeer = NonNullable<Awaited<ReturnType<typeof import('../protocol/profile-candidate-v1.js').readCandidatePeerStatus>>>;
export interface CandidateProgress {
    phase: string;
    transactionId?: number;
    operation?: number;
    bytesSent: number;
    bytesPrepared: number;
    bytesUploaded: number;
    bytesReused: number;
    totalBytes: number;
    chunkIndex: number;
    chunkCount: number;
    status: CandidateStatus | null;
    peer: CandidatePeer | null;
}
export type CandidateBaseSource = import('../protocol/types.js').ReuseSource & {bytes: Buffer};
export interface PreparedCandidate {transactionId: number; metadata: import('../protocol/types.js').CandidateMetadata; status: CandidateStatus; progress: CandidateProgress}
export interface CandidateDriver {
    upload(bytes: Buffer, options: {metadata: import('../protocol/types.js').CandidateMetadata; baseSource?: CandidateBaseSource; streamChunks?: boolean; verifyBase?: () => Promise<void>}): Promise<PreparedCandidate>;
    commit(transactionId: number, options: {digest: number; afterDecision: () => Promise<void>}): Promise<unknown>;
    abort(transactionId: number): Promise<unknown>;
}
export interface CandidateDriverOptions {
    chunkSize?: number;
    requestIds?: import('../protocol/types.js').RequestIds;
    sleep?: (ms: number) => Promise<void>;
    readPeerStatus?: typeof import('../protocol/profile-candidate-v1.js').readCandidatePeerStatus | null;
    onProgress?: (progress: CandidateProgress) => void;
}
export interface CaptureIdentity {profile: string; storageGeneration: number; storageDigest: number; settingsCrc: number; settingsDigest: number}
export interface HeldStorage {layout: Buffer; macros: Buffer; profile?: Buffer}
export interface CaptureFacts {
    status: ProfileStatus;
    identity?: CaptureIdentity;
    storage?: HeldStorage;
    readback?: {active: import('../protocol/types.js').PayloadRead; source: string; combos: Awaited<ReturnType<typeof import('../protocol/combo-readback-v1.js').readDeviceCombos>>};
}
export type CapturedProfile = (import('../model/types.js').CompleteSnapshot & CaptureFacts) | (import('../model/types.js').IncompleteSnapshot & CaptureFacts & {document: import('../model/types.js').RecoveryCaptureDocument; fingerprint: string});
export interface CaptureOptions {sleep?: (ms: number) => Promise<void>; payloadReader?: InstanceType<typeof import('./profile-payload-reader.js').ProfilePayloadReader>; reuseReadback?: boolean}
export interface RestoreOptions {
    expectedFingerprint?: string;
    saveRecovery?: SaveRecovery;
    baseSnapshot?: CapturedProfile;
    onProgress?: (text: string) => void;
    onApplyProgress?: (view: import('../../contracts/model.js').ApplyView) => void;
    sleep?: (ms: number) => Promise<void>;
}
export interface OperationFailure extends Error {code?: string; cause?: OperationFailure; progress?: CandidateProgress}

/** State presented to the panel, including a disconnected or demo source. */
export interface PanelDeviceState extends DeviceModelInput, Omit<DraftDeviceContext, "committed"> {
    connected: boolean;
    devices?: (import('../transport/types.js').DeviceDescriptor & {label: string; number?: number})[];
    portableSummary?: Pick<import('../model/types.js').ProfileSummary, 'names'> | null;
    portableProgress?: string;
    operationId?: number;
    diagnostics?: string[];
}
/** Why the open draft takes no edit now, or '' when it does (panel-session-state.js draftBinding). */
export type DraftBlock = import('../../contracts/panel.js').DraftBlock;
export interface DemoMetadata {name: string; fileName: string | null; exported: string | null}
/** The demo owns these fields; the panel owns the review and layer-editor values. */
export interface DemoSession {
    demo?: DemoMetadata;
    draft?: InstanceType<typeof import('./profile-draft-session.js').ProfileDraftSession>;
    readBusy?: boolean;
    readReady?: boolean;
    resetDraftForms?: boolean;
    historyOpen?: boolean;
    notice?: string;
    portableReview?: unknown;
    portableLayers?: unknown;
    observedPortable?: import('../model/types.js').ProfileSnapshot;
    service: {capabilities?: Partial<DeviceCapabilities> | null; snapshot(): PanelDeviceState};
}
export type ActiveDemoSession = DemoSession & {demo: DemoMetadata; draft: NonNullable<DemoSession['draft']>};
export interface ProfileChooser {chooseProfile?: () => string | {text: string; name?: string} | undefined | Promise<string | {text: string; name?: string} | undefined>}

export interface LayerEditState {before: import('../model/types.js').CompleteSnapshot; revision?: number; order: number[]; names: string[]; keysFollow: boolean; deviceId?: string | null; draftId?: string}
/** Posted layer-editor data; applyLayerEdit still checks each field it reads. */
export type LayerEditMessage = import('../../contracts/messages.js').LayerEditControl | import('../../contracts/messages.js').LayerSaveControl;
export interface ImportDifferences {against: string; items: (import('../../contracts/model.js').ReviewSummary & {unit: string})[]}
export interface PortableReview {document: import('../model/types.js').PortableDocument; before: import('../model/types.js').ProfileSnapshot; fileName?: string | null; differences?: ImportDifferences; revision?: number; deviceId?: string | null; draftId?: string}
export interface PanelHost extends ProfileChooser {words?: Record<string, string>; panel?: () => Partial<import('../../contracts/model.js').HostPanel>}
export interface PanelSession extends DemoSession {
    host?: PanelHost;
    portableBusy?: boolean;
    portableReview?: PortableReview;
    portableLayers?: LayerEditState;
    acceptedEdit?: ReturnType<NonNullable<DemoSession['draft']>['stage']>;
    applyRunning?: boolean;
    postApplyReadStep?: import('../../contracts/messages.js').ReadStep;
    reconnect?: ExpectedReconnect;
    service: DemoSession['service'] & {portable?: import('../model/types.js').ProfileSnapshot | null};
}
/** Model publication reads portable data without invoking device operations. */
export type PanelModelSession = Omit<PanelSession, 'service'> & {service: Pick<PanelSession['service'], 'portable'>};
/** The router only consumes the envelope; draft validators check each payload. */
export interface PanelEnvelope {type: string; draftId?: string; draftRevision?: number; deviceId?: string}
export type PanelMessage = PanelEnvelope | (DraftEdit & {draftId?: string});
export type PanelDraftView = ReturnType<NonNullable<DemoSession['draft']>['view']> & {busy: boolean; editable: boolean; reason: DraftBlock; steps?: import('../../contracts/model.js').HistoryStep[]};
/** What the panel adds to the device model; the posted shape is the contract's. */
export type PanelModelExtras = Pick<import('../../contracts/panel.js').PublishedModel, 'devices' | 'selectedDeviceId' | 'demo' | 'apply' | 'postApplyRead' | 'portable' | 'host' | 'load' | 'reconnecting'> & {draft?: PanelDraftView};

export type CompleteCapture = Extract<CapturedProfile, import('../model/types.js').CompleteSnapshot>;
export type RestoredProfile = Awaited<ReturnType<typeof import('./portable-profile-session.js').restoreProfile>> & import('../model/types.js').SnapshotFacts;
/**
 * The device service as the panel's controls use it. A failed operation
 * rejects (and leaves its error in `snapshot().error`); `readCombos` and
 * `readBaseRgb` are optional reads that never reject.
 */
export interface ControlService extends DraftApplyService {
    capabilities?: Partial<DeviceCapabilities> | null;
    phase?: import('../../contracts/model.js').PhaseId;
    portable?: import('../model/types.js').ProfileSnapshot | null;
    snapshot(): PanelDeviceState & {devices: (import('../transport/types.js').DeviceDescriptor & {label: string; number?: number})[]};
    enumerate(): Promise<unknown>;
    connect(id: string): Promise<unknown>;
    disconnect(): Promise<unknown>;
    refresh(): Promise<unknown>;
    readLayout(): Promise<unknown>;
    readCommittedProfile(): Promise<unknown>;
    readCombos(): Promise<unknown>;
    readBaseRgb(): Promise<unknown>;
    readKeyboardProfile(): Promise<CompleteCapture>;
    readPortableProfile(options?: {forRestore?: false; reuseReadback?: boolean}): Promise<CompleteCapture>;
    readPortableProfile(options: {forRestore: true; reuseReadback?: boolean}): Promise<CapturedProfile>;
    restorePortableProfile(document: import('../model/types.js').PortableDocument, options: RestoreOptions): Promise<RestoredProfile>;
    close(): Promise<void>;
    emitChange?(): void;
    /** A save renamed the keyboard: its coming disconnect is expected (keyboard-reconnect.js). */
    expectReconnect?(expected: boolean): void;
}
/** A renamed keyboard the panel waits to see again (keyboard-reconnect.js). */
export interface ExpectedReconnect {deviceId: string; serialNumber: string; name: string; otherDevices: readonly {id: string; product?: string}[]; startedAt: number; dropped: boolean; saved?: string}
export interface ControlHost extends PanelHost {
    progress?: <T>(title: string, work: () => Promise<T>) => Promise<T>;
    saveRecovery?: SaveRecovery;
}
export interface LoopHost extends ControlHost {
    post(message: import('../../contracts/messages.js').PanelResponse): unknown;
    showError?: (text: string) => unknown;
    saveExport(file: import('../../contracts/messages.js').ExportedProfile): Promise<string | undefined>;
}
export type RunningPanelSession = Omit<PanelSession, 'service'> & {service: ControlService};

export interface DeviceServiceOptions {
    adapter?: import('../transport/types.js').DeviceAdapter;
    coordinator?: InstanceType<typeof import('../transport/request-coordinator.js').DeviceRequestCoordinator>;
    defaultTimeoutMs?: number;
    requestIdStart?: number;
    sleep?: (ms: number) => Promise<void>;
    readCandidateStatus?: typeof import('../protocol/profile-candidate-v1.js').readCandidateStatus;
    onChange?: (state?: PanelDeviceState) => void;
    onApplyProgress?: (view: import('../../contracts/model.js').ApplyView) => void;
    onReadProgress?: (view: import('../../contracts/messages.js').ReadProgress) => void;
}

export type DeviceConnection = Awaited<ReturnType<InstanceType<typeof import('../transport/request-coordinator.js').DeviceRequestCoordinator>['connect']>>;
export interface ServiceSnapshot extends PanelDeviceState {
    devices: (import('../transport/types.js').DeviceDescriptor & {label: string; number?: number})[];
    scanned: boolean;
    candidateStatus: (Omit<CandidateStatus, 'error'> & {stateName: string; error: CandidateStatus['error'] | null}) | null;
    viaIdentity: Awaited<ReturnType<typeof import('../protocol/profile-wire-v1.js').readViaIdentity>> | null;
    compatibility: ReturnType<typeof import('./firmware-support.js').evaluateProfileCompatibility> | null;
    mutationCompatibility: ReturnType<typeof import('./firmware-support.js').evaluateLiveMutationCompatibility>;
    lastRefreshedAt: string;
}

export type VerifiedCapture = (CompleteCapture & {identity: CaptureIdentity; storage: HeldStorage; readback: NonNullable<CaptureFacts['readback']>}) | (Extract<CapturedProfile, {incomplete: true}> & {identity: CaptureIdentity});
