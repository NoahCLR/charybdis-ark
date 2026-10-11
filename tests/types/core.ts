// Compile-time acceptance checks. The body is never run or connected to HID.
import {FakeDeviceAdapter} from '../../core/transport/fake-device-adapter.js';
import {NodeHidDeviceAdapter} from '../../core/transport/node-hid-adapter.js';
import {WebHidDeviceAdapter} from '../../core/transport/webhid-adapter.js';
import {DeviceRequestCoordinator} from '../../core/transport/request-coordinator.js';
import type {DeviceAdapter, RequestOptions} from '../../core/transport/types.js';
import {decodeSemanticAction, encodeSemanticAction} from '../../core/schema/profile-blob-v1.js';
import {encodeKeyBehaviorDomain} from '../../core/schema/key-behavior-domain-v1.js';
import {encodeComboDomain} from '../../core/schema/combo-domain-v1.js';
import {encodeSettings} from '../../core/schema/settings-domain-v1.js';
import {validateSnapshot, decodedOf} from '../../core/model/portable-profile.js';
import {editMacro} from '../../core/model/macro-editor.js';
import {analyzeLayerStates} from '../../core/model/layer-state-graph.js';
import {profileReview} from '../../core/model/profile-review.js';
import {revertUnits} from '../../core/model/profile-revert.js';
import {translateBackup} from '../../core/model/backup-translation.js';
import {ProfileDraftSession} from '../../core/session/profile-draft-session.js';
import {editDeviceProfile} from '../../core/session/device-profile-edits.js';
import {ApplyProgress} from '../../core/session/apply-progress.js';
import {ProfilePayloadReader} from '../../core/session/profile-payload-reader.js';
import {candidateMetadataForBlob} from '../../core/protocol/profile-candidate-v1.js';
import {readViaLayout} from '../../core/protocol/via-layout-v1.js';
import {LogicalViaStageCoordinator} from '../../core/session/logical-via-stage-coordinator.js';
import type {PortableDocument, CompleteSnapshot, IncompleteSnapshot} from '../../core/model/types.js';
import {CandidateUploadCoordinator} from '../../core/session/candidate-upload-coordinator.js';
import {ProfileDeviceService} from '../../core/session/profile-device-service.js';
import {openPanelLoop} from '../../core/session/panel-loop.js';
import type {ControlService} from '../../core/session/types.js';
import type {PanelRequest, PanelResponse} from '../../contracts/messages.js';
import {buildDeviceModel} from '../../core/session/device-model.js';
import {buildPanelModel, startLayerEdit} from '../../core/session/panel-session.js';
import {demoExport, demoState} from '../../core/session/demo-session.js';
import {captureProfile, restoreProfile} from '../../core/session/portable-profile-session.js';
import type {CapturedProfile, DeviceCapabilities, PanelSession, PanelDeviceState, CaptureIdentity} from '../../core/session/types.js';
import type {StatusModel} from '../../contracts/model.js';
import type {SemanticAction} from '../../core/schema/types.js';

async function contracts() {
    const adapters: DeviceAdapter[] = [new FakeDeviceAdapter(), new NodeHidDeviceAdapter(), new WebHidDeviceAdapter()];
    const coordinator = new DeviceRequestCoordinator(adapters[0]);
    const connection = await coordinator.connect('test');
    const options: RequestOptions = {matchResponse: (response, request) => response[0] === request[0]};
    const response: Buffer = await connection.request(Buffer.alloc(32), options);
    const action: SemanticAction = decodeSemanticAction(encodeSemanticAction({kind: 1, operand: 4}));
    encodeKeyBehaviorDomain({rows: [{target: action, steps: [{tapIndex: 0, tap: action}]}]});
    encodeComboDomain({defaultTermMs: 50, holdTermMs: 0, rows: [{inputs: [action, action], output: action, termMs: null}]});
    void response;

    // @ts-expect-error Transport writes bytes, never a keycode name.
    connection.request('KC_A');
    // @ts-expect-error A response matcher must make a synchronous boolean decision.
    connection.request(Buffer.alloc(32), {matchResponse: async () => true});
    // @ts-expect-error Cancellation takes a signal, not its controller.
    connection.request(Buffer.alloc(32), {signal: new AbortController()});
    // @ts-expect-error An adapter needs both enumeration and connection.
    const incomplete: DeviceAdapter = {listDevices: () => []};
    // @ts-expect-error Schema operands are numeric; editor text must be converted first.
    encodeSemanticAction({kind: 1, operand: '4'});
    // @ts-expect-error A behavior's hold branch includes a mode and an action.
    encodeKeyBehaviorDomain({rows: [{target: action, steps: [{tapIndex: 0, hold: action}]}]});
    // @ts-expect-error A default combo window must be provided, independently of each row's window.
    encodeComboDomain({holdTermMs: 0, rows: []});
    // @ts-expect-error A complete settings domain carries placement records and both name banks.
    encodeSettings({values: [], names: []});
    void incomplete;
}

function profileContracts(document: PortableDocument, snapshot: CompleteSnapshot, connection: Awaited<ReturnType<InstanceType<typeof DeviceRequestCoordinator>['connect']>>) {
    const draft = new ProfileDraftSession(snapshot, 'board', {compiledLayerCount: 16, actionAbiDigest: document.actionAbiDigest});
    draft.stage({type: 'updateLayoutKeys', layer: 'Layer 0', changes: [{layoutIndex: 0, keycode: 'KC_A'}], draftRevision: draft.revision});
    // @ts-expect-error A staged edit must identify the revision the editor saw.
    draft.stage({type: 'updateViaMacro', keycode: 'VIA_MACRO_0', payload: 'hello'});
    // @ts-expect-error Layout edits use Layer n references rather than bare indices.
    draft.stage({type: 'updateLayoutKeys', layer: 0, changes: [], draftRevision: draft.revision});
    // @ts-expect-error Host profile-domain edits cannot write the separate VIA macro bank.
    editDeviceProfile(Buffer.alloc(32), {type: 'updateViaMacro', keycode: 'VIA_MACRO_0', payload: 'hello'});
    const validated = validateSnapshot(document);
    const same: PortableDocument = decodedOf({document, decoded: validated}).document;
    const reader = new ProfilePayloadReader(connection);
    const apply = new ApplyProgress(view => {const progress: number | undefined = view.bytes?.completed; void progress;});
    apply.report('upload', {completed: 1, total: 2});
    editMacro(snapshot, {keycode: 'VIA_MACRO_0', payload: 'hello', expectedFingerprint: snapshot.fingerprint});
    void same;

    // @ts-expect-error Decoding needs a complete document, not partial profile fields.
    decodedOf({document: {profile: ''}});
    // @ts-expect-error Only verified connection reads can populate the payload reader's cache.
    reader.readCompiled({previous: {metadata: {}, bytes: Buffer.alloc(32)}});
    // @ts-expect-error Progress uses the established Apply steps.
    apply.report('writing random bytes');
    // @ts-expect-error A direct macro edit needs the fingerprint it was built from.
    editMacro(snapshot, {keycode: 'VIA_MACRO_0', payload: 'hello'});
    // @ts-expect-error Portable documents store encoded macro streams, not numeric keycodes.
    document.macros = [4];
    // @ts-expect-error A candidate must identify the VIA store it publishes alongside.
    candidateMetadataForBlob(Buffer.alloc(32), {actionAbiDigest: 1});
    // @ts-expect-error The layer count comes from numeric device readback.
    readViaLayout(connection, {layerCount: '16'});
    const stage = new LogicalViaStageCoordinator(connection, {requestIds: {next: () => 1}});
    // @ts-expect-error Staging needs both current and target bytes to find changed ranges.
    stage.stage({transactionId: 1, generation: 1, digest: 1, target: {layout: Buffer.alloc(1920), macros: Buffer.alloc(129)}});
}

function recoveryContracts(snapshot: IncompleteSnapshot) {
    if (!snapshot.document) return;
    const rawBank: string = snapshot.document.macros;
    void rawBank;
    // @ts-expect-error Recovery captures retain interrupted bank bytes, not an importable portable document.
    decodedOf({document: snapshot.document});
}

function analysisContracts(snapshot: CompleteSnapshot) {
    const analysis = analyzeLayerStates({transitions: [{kind: 'lock', layer: 1, when: {on: 1}, source: 'key'}]});
    if (analysis.complete) {
        const source: string = analysis.effects[0].source;
        const traps: number = analysis.trapCount;
        void source; void traps;
    } else {
        // @ts-expect-error A budget-limited analysis has not proved a trap count.
        const traps: number = analysis.trapCount;
        void traps;
    }
    const reviewed = profileReview(snapshot, snapshot);
    if (reviewed[0].place?.kind === 'behaviour') {
        const target: SemanticAction = reviewed[0].place.target;
        // @ts-expect-error The internal review retains the semantic target until publication.
        const keycode: string = reviewed[0].place.keycode;
        void target; void keycode;
    }
    const restored: PortableDocument = revertUnits(snapshot, snapshot, new Set(['macro:0']));
    const imported: unknown = translateBackup('untrusted file');
    // @ts-expect-error A translated import still needs portable-profile validation.
    const portable: PortableDocument = imported;
    void restored; void portable;
}

void analysisContracts;
void contracts;
void profileContracts;
void recoveryContracts;

async function sessionContracts(session: PanelSession, state: PanelDeviceState, capabilities: DeviceCapabilities, connection: Awaited<ReturnType<InstanceType<typeof DeviceRequestCoordinator>['connect']>>, captured: CapturedProfile) {
    const published: import('../../contracts/panel.js').PublishedModel = buildPanelModel(session, state);
    const source: PanelDeviceState = demoState();
    const report = buildDeviceModel({layout: {state: 'reading', progress: {done: 1, total: 16}}});
    const read = await captureProfile(connection, {next: () => 1}, capabilities);
    if (read.incomplete) {
        const bank: string = read.document.macros;
        // @ts-expect-error An interrupted read is diagnostic recovery data, not a portable profile.
        const document: PortableDocument = read.document;
        void bank; void document;
    } else {
        const document: PortableDocument = read.document;
        void document;
    }
    const restored = await restoreProfile(connection, {next: () => 1}, capabilities, 'untrusted file', {
        baseSnapshot: captured,
        saveRecovery: async document => document.format === 'charybdis-profile' ? 'backup.json' : 'recovery.json',
        onApplyProgress: view => {const step: string = view.current; void step;},
    });
    const complete: PortableDocument = restored.document;
    // @ts-expect-error A pending layout has no decoded keys to render.
    buildDeviceModel({layout: {state: 'reading', layers: [{layer: 0, keys: []}]}});
    // @ts-expect-error Published timing values retain numeric/editor text types, never arbitrary objects.
    report.behaviorEditing.keyDefaults.KC_A.timing.tapHoldTerm = {milliseconds: 200};
    // @ts-expect-error Restore identity binds the profile, VIA store and settings, not only a digest.
    const identity: CaptureIdentity = {profile: 'one digest'};
    // @ts-expect-error A demo export needs an open demo and its draft.
    demoExport(session);
    if (captured.incomplete) {
        // @ts-expect-error Rename/reorder requires a complete portable read.
        startLayerEdit(captured, 0);
    }
    // @ts-expect-error Recovery persistence reports a saved path, never a success boolean.
    restoreProfile(connection, {next: () => 1}, capabilities, 'untrusted file', {saveRecovery: async () => true});
    void published; void source; void report; void complete; void identity;
}
void sessionContracts;

function orchestrationContracts(connection: Awaited<ReturnType<InstanceType<typeof DeviceRequestCoordinator>['connect']>>) {
    const service: ControlService = new ProfileDeviceService({adapter: new FakeDeviceAdapter()});
    const loop = openPanelLoop({post: message => {const reply: PanelResponse = message; void reply;}, saveExport: async () => undefined}, {service});
    loop.handleMessage({type: 'jumpProfileDraft', step: 1, draftRevision: 0});
    const upload = new CandidateUploadCoordinator(connection);
    upload.upload(Buffer.alloc(32), {actionAbiDigest: 1, viaGeneration: 1, viaDigest: 1});
    upload.commit(1, {afterDecision: async decision => {const digest: number = decision.digest; void digest;}});
    // @ts-expect-error An authored upload needs its metadata or a complete VIA identity.
    upload.upload(Buffer.alloc(32), {actionAbiDigest: 1});
    // The loop takes posted data unchecked and narrows it itself.
    loop.handleMessage(JSON.parse('"untrusted"') as unknown);
    // @ts-expect-error A history jump identifies the chosen step.
    const jump: PanelRequest = {type: 'jumpProfileDraft', draftRevision: 0};
    // @ts-expect-error Hosts save a recovery path, not a success flag.
    openPanelLoop({post: () => {}, saveExport: async () => undefined, saveRecovery: async () => true});
    // @ts-expect-error Read counters and portable read text use different payloads.
    new ProfileDeviceService().reportReadProgress('layout', 'Loading');
    // @ts-expect-error Theme choices are shared across the renderer and host.
    const request: PanelRequest = {type: 'setTheme', theme: 'blue'};
    void request; void jump;
}
void orchestrationContracts;
