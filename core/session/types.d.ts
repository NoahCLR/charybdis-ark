/** Observable read states retain error details for the published model. */
export interface PublicError {code: string; message: string}
export type PendingRead = {state?: 'unread' | 'reading' | 'unavailable'; error?: PublicError; progress?: import('../../contracts/model.js').CountedProgress | null; layers?: []; readAt?: string};
export type BaseRgbRead = PendingRead | ({effectId: number; brightness: number; hue: number; saturation: number; speed: number} & {state: 'read'; readAt?: string; error?: undefined});
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
    /** How edits reach the keyboard (firmware D-F32); null when it does not say. */
    editMode?: (import('../protocol/types.js').EditModeRead & {notStored?: boolean}) | null;
    /** The toggles' stored masters and runtime overrides. */
    runtime?: import('../protocol/types.js').RuntimeRead | null;
}

export type CandidateStatus = Awaited<ReturnType<typeof import('../protocol/profile-candidate-v1.js').readCandidateStatus>>;
export type CandidatePeer = NonNullable<Awaited<ReturnType<typeof import('../protocol/profile-candidate-v1.js').readCandidatePeerStatus>>>;
export interface CandidateProgress {
    adjustmentPending?: boolean;
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
    upload(bytes: Buffer, options: {metadata: import('../protocol/types.js').CandidateMetadata; baseSource?: CandidateBaseSource; verifyBase?: () => Promise<void>}): Promise<PreparedCandidate>;
    commit(transactionId: number, options: {digest: number; afterDecision: () => Promise<void>}): Promise<unknown>;
    abort(transactionId: number): Promise<unknown>;
}
export interface CandidateDriverOptions {
    readEditProgress?: () => Promise<import('../protocol/types.js').EditProgress>;
    chunkSize?: number;
    requestIds?: import('../protocol/types.js').RequestIds;
    sleep?: (ms: number) => Promise<void>;
    readPeerStatus?: typeof import('../protocol/profile-candidate-v1.js').readCandidatePeerStatus | null;
    onProgress?: (progress: CandidateProgress) => void;
}
export interface CaptureIdentity {profile: string; settingsCrc: number; settingsDigest: number}
export interface HeldStorage {profile: Buffer}
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
export interface OperationFailure extends Error {code?: string; cause?: OperationFailure; progress?: CandidateProgress; deviceError?: CandidateStatus["error"]}

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
    /** A live edit waiting on its trap check (plan answer 2): sent on confirmLiveEdit, dropped on cancelLiveEdit. */
    /** What the live watch last saw of a keyboard under an Apply draft (live-watch.js). */
    liveReadRetry?: {draftId: string; attempts: number};
    applyWatch?: {draftId: string; session: number; revision: number; savedGeneration: number};
    liveProposal?: {id: number; draftId: string; revision: number; target: import('./profile-draft-session.js').LiveTarget;
        checks: import('../../contracts/model.js').Check[]; accepted?: ReturnType<NonNullable<DemoSession['draft']>['stage']>; replaceWhenLarge?: boolean};
    applyRunning?: boolean;
    postApplyReadStep?: import('../../contracts/messages.js').ReadStep;
    reconnect?: ExpectedReconnect;
    /** When Ark last connected a lost keyboard again by itself (keyboard-reconnect.js). */
    lostAt?: number;
    /** What the keyboard held before the last successful Apply, for "Put back what it had". */
    beforeApply?: {document: import('../model/types.js').PortableDocument; deviceId: string | null | undefined; savedAt: string};
    /** A restart Ark asked for (keyboard-restart.js): the unsaved edits it keeps to send back once the keyboard is read again, and their recovery copy. */
    restart?: {deviceId: string | null | undefined; serialNumber: string; kept?: import('../model/types.js').PortableDocument; recovery?: string; peerAcknowledged: boolean};
    service: DemoSession['service'] & {portable?: import('../model/types.js').ProfileSnapshot | null};
}
/** Model publication reads portable data without invoking device operations. */
export type PanelModelSession = Omit<PanelSession, 'service'> & {service: Pick<PanelSession['service'], 'portable'>};
/** The router only consumes the envelope; draft validators check each payload. */
export interface PanelEnvelope {type: string; draftId?: string; draftRevision?: number; deviceId?: string}
export type PanelMessage = PanelEnvelope | (DraftEdit & {draftId?: string});
export type PanelDraftView = ReturnType<NonNullable<DemoSession['draft']>['view']> & {busy: boolean; editable: boolean; reason: DraftBlock; steps?: import('../../contracts/model.js').HistoryStep[]};
/** What the panel adds to the device model; the posted shape is the contract's. */
export type PanelModelExtras = Pick<import('../../contracts/panel.js').PublishedModel, 'devices' | 'selectedDeviceId' | 'demo' | 'apply' | 'postApplyRead' | 'portable' | 'host' | 'load' | 'reconnecting' | 'firmware' | 'editMode' | 'liveProposal' | 'runtime'> & {draft?: PanelDraftView};

export type CompleteCapture = Extract<CapturedProfile, import('../model/types.js').CompleteSnapshot>;
/** Where the keyboard's working copy is (firmware D-F32), with the exact bytes a live edit is made against. */
export interface LiveState {
    mode: number;
    modeConflict?: boolean;
    session: number;
    revision: number;
    savedGeneration: number;
    savedOrigin: number;
    /** The keyboard runs unsaved edits (its working copy is active). */
    unsaved: boolean;
    /** Both halves hold this session and revision. */
    converged: boolean;
    /** The other half refused this working copy: the halves run different profiles until a Revert. */
    apart?: boolean;
    working: Buffer;
    saved: Buffer;
    defaults: Buffer;
    /** The keyboard's own saving and its halves, as last read (live-profile-session.js). */
    keyboard?: LiveKeyboardStatus;
    /** The save transaction last seen when the working copy last changed; a failed save after it failed these edits (-1: any). */
    saveMark?: number;
}
export interface LiveKeyboardStatus {
    adjustmentPending: boolean;
    /** A save runs, Ark's or the keyboard's own. */
    saving: boolean;
    autoSaving: boolean;
    /** Nothing unsaved, and the keyboard saved this revision by itself (Live). */
    savedByKeyboard: boolean;
    /** The last save of these edits failed; they are still unsaved. */
    saveFailed: boolean;
    saveError: number;
    lastSaveTransaction: number;
    storagePaused: boolean;
    peerStoragePaused: boolean;
    /** The other half refused this working copy: the halves differ until Revert or an Apply; Save is refused. */
    peerRefused: boolean;
    /** Storing the edit mode failed; the keyboard keeps trying. */
    modeNotStored: boolean;
    /** The master half's profile storage stopped, or the slave half says its did: only a restart clears it (firmware D-F34). */
    stopped: boolean;
    peerStopped: boolean;
    quietMs: number;
}
/** A Live + review read: the working copy as the snapshot, the saved profile beside it. */
export type LiveCapture = import('../model/types.js').CompleteSnapshot & import('../model/types.js').SnapshotFacts & {
    status: ProfileStatus;
    saved: import('../model/types.js').CompleteSnapshot & import('../model/types.js').SnapshotFacts;
    live: LiveState;
    runtime: import('../protocol/types.js').RuntimeRead | null;
    combosReadback?: Awaited<ReturnType<typeof import('../protocol/combo-readback-v1.js').readDeviceCombos>>;
};
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
    readCommittedProfile(options?: {reuse?: boolean}): Promise<unknown>;
    readCombos(): Promise<unknown>;
    readBaseRgb(): Promise<unknown>;
    readKeyboardProfile(): Promise<CompleteCapture>;
    readPortableProfile(options?: {forRestore?: false; reuseReadback?: boolean}): Promise<CompleteCapture>;
    readPortableProfile(options: {forRestore: true; reuseReadback?: boolean}): Promise<CapturedProfile>;
    restorePortableProfile(document: import('../model/types.js').PortableDocument, options: RestoreOptions): Promise<RestoredProfile>;
    postLiveEdit(edit: {from: Buffer; to: Buffer; defaults: Buffer; identity: {session: number; revision: number}; replaceWhenLarge?: boolean}): Promise<{bytes: Buffer; session: number; revision: number; converged: boolean; apart: boolean; sent: number}>;
    saveWorkingCopy(identity: {session: number; revision: number}): Promise<import('../protocol/types.js').EditStatus & {saved: boolean}>;
    revertWorkingCopy(identity: {session: number; revision: number}): Promise<import('../protocol/types.js').EditProgress & {converged: boolean; apart: boolean}>;
    setEditMode(mode: number): Promise<import('../protocol/types.js').EditModeRead | undefined>;
    /** An operation holds the keyboard. */
    readonly busy?: boolean;
    flushWorkingCopy(saveRecovery: (document: import('../model/types.js').PortableDocument) => Promise<string | undefined>): Promise<import('../protocol/types.js').EditStatus & {saved: boolean}>;
    readLiveStatus(): Promise<import('../protocol/types.js').EditStatus | undefined>;
    close(): Promise<void>;
    emitChange?(): void;
    /** A save renamed the keyboard, or Ark restarted it: its coming disconnect is expected (keyboard-reconnect.js). */
    expectReconnect?(expected: boolean, reason?: string): void;
    /** What the keyboard runs now, read as one revision (GET 0x21). */
    readWorkingCopy(): Promise<{metadata: import('../protocol/types.js').ActiveProfileMetadata; bytes: Buffer}>;
    /** Restart both halves (firmware D-F34); whether the slave half acknowledged. */
    restartKeyboard(): Promise<{peerAcknowledged: boolean}>;
    /** The keyboard the connection was last lost to unexpectedly, once (keyboard-reconnect.js). */
    takeLost?(): LostKeyboard | undefined;
}
/** A keyboard whose connection was lost unexpectedly: what it was, and what happened. */
export interface LostKeyboard {deviceId: string; serialNumber: string; product: string; otherDevices: readonly {id: string; product?: string}[]; what: string; /** It left a request unanswered: Ark closed the connection, the keyboard stayed. */ unanswered: boolean}
/** A renamed keyboard the panel waits to see again (keyboard-reconnect.js). */
export interface ExpectedReconnect {deviceId: string; serialNumber: string; name: string; otherDevices: readonly {id: string; product?: string}[]; startedAt: number; dropped: boolean; saved?: string; /** Lost unexpectedly rather than renamed: what happened. */ lost?: string; /** Restarted because Ark asked, rather than renamed. */ restart?: boolean; /** Said after how the wait ended: what followed the read. */ after?: string}
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
    /** How long each request of a background look waits (profile-device-service.js). */
    watchTimeoutMs?: number;
    requestIdStart?: number;
    sleep?: (ms: number) => Promise<void>;
    readCandidateStatus?: typeof import('../protocol/profile-candidate-v1.js').readCandidateStatus;
    onChange?: (state?: PanelDeviceState) => void;
    onApplyProgress?: (view: import('../../contracts/model.js').ApplyView) => void;
    onReadProgress?: (view: import('../../contracts/messages.js').ReadProgress) => void;
    /** Where the host keeps the last verified compiled defaults between runs, as text (profile-payload-reader.js). */
    compiledDefaults?: {get(): unknown; set(value: string): unknown};
}

export type DeviceConnection = Awaited<ReturnType<InstanceType<typeof import('../transport/request-coordinator.js').DeviceRequestCoordinator>['connect']>>;
export interface ServiceSnapshot extends PanelDeviceState {
    devices: (import('../transport/types.js').DeviceDescriptor & {label: string; number?: number})[];
    scanned: boolean;
    candidateStatus: (Omit<CandidateStatus, 'error'> & {stateName: string; error: CandidateStatus['error'] | null}) | null;
    compatibility: ReturnType<typeof import('./firmware-support.js').evaluateProfileCompatibility> | null;
    mutationCompatibility: ReturnType<typeof import('./firmware-support.js').evaluateLiveMutationCompatibility>;
    lastRefreshedAt: string;
}

export type VerifiedCapture = (CompleteCapture & {identity: CaptureIdentity; storage: HeldStorage; readback: NonNullable<CaptureFacts['readback']>}) | (Extract<CapturedProfile, {incomplete: true}> & {identity: CaptureIdentity});
