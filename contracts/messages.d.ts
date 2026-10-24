import type {PanelEdit, DraftIdentity} from './edits.js';
import type {ApplyView, CountedProgress, MacroInspection, PhaseId} from './model.js';

/** Every field a layer-editor message may carry; a shape leaves the ones it does not name absent. */
type LayerFields = {keysFollow?: never; names?: never; id?: never; name?: never; makeBase?: never; to?: never; direction?: never};
type LayerShape<T> = Omit<LayerFields, keyof T> & T;
/** The Rename & Reorder panel's edits. Names typed so far ride along with a toggle or a move. */
type LayerEditPayload = (
    | LayerShape<{keysFollow: boolean; names?: string[]}>
    | LayerShape<{id: number; name: string}>
    | LayerShape<{id: number; to: number; names?: string[]}>
    | LayerShape<{id: number; direction: 1 | -1; names?: string[]}>
    | LayerShape<{id: number; makeBase: true; names?: string[]}>);
type LayerSavePayload = LayerShape<{names?: string[]; keysFollow?: boolean}>;
/** Payloads grouped by their controller; no runtime or core import belongs here. */
export interface ControlPayloads {
    draft: {
        reviewProfileDraft: {confirmChecks?: boolean};
        closeProfileDraftReview: {confirmChecks?: boolean};
        undoProfileDraft: {confirmChecks?: boolean};
        redoProfileDraft: {confirmChecks?: boolean};
        discardProfileDraft: {confirmChecks?: boolean};
        rebaseProfileDraft: {confirmChecks?: boolean};
        applyProfileDraft: {confirmChecks?: boolean};
        jumpProfileDraft: {step: number};
        discardProfileDraftChanges: {group: number};
        /** Replace the draft with what the keyboard held before the last Apply. */
        putBackProfile: Record<never, never>;
        /** Live + review: the keyboard writes what it runs as its saved profile. */
        saveProfileDraft: {confirmChecks?: boolean};
        /** Live + review: the keyboard runs its saved profile again. */
        revertProfileDraft: Record<never, never>;
        /** Send the edit waiting on its trap check, or drop it. */
        confirmLiveEdit: {proposal: number};
        cancelLiveEdit: {proposal: number};
        /** Cancel edit: abort the live edit the keyboard holds until no key is held. */
        abortLiveEdit: Record<never, never>;
        /** How edits reach the keyboard; `pending` says what happens to work in progress first. */
        setEditMode: {mode: 0 | 1 | 2; pending?: 'save' | 'revert' | 'send' | 'discard'; /** The question showed the draft's traps and warnings and the person went ahead. */ confirmChecks?: boolean};
        /** Restart both halves (firmware D-F34), keeping unsaved edits to put back. */
        restartKeyboard: Record<never, never>;
    };
    portable: {
        exportPortableProfile: {};
        choosePortableProfile: {};
        restorePortableProfile: {};
        managePortableLayers: {};
        cancelPortableReview: {};
        editPortableLayer: LayerEditPayload;
        savePortableLayers: LayerSavePayload;
        reviewPortableProfile: Omit<Extract<PanelEdit, {type: 'reviewPortableProfile'}>, 'type'>;
    };
    demo: {
        openDemo: {discardDemo?: boolean};
        openDemoProfile: {discardDemo?: boolean};
        leaveDemo: {discardDemo?: boolean};
    };
    read: {
        ready: {discardDemo?: boolean};
        refresh: {discardDemo?: boolean};
        selectDevice: {deviceId: string; discardDemo?: boolean};
    };
    view: {
        openProfileDraftHistory: {discardDemo?: boolean};
        closeProfileDraftHistory: {discardDemo?: boolean};
    };
    shell: {
        chooseKeyboard: {discardDemo?: boolean};
        forgetKeyboard: Record<never, never>;
        setTheme: {theme: 'light' | 'dark'};
        downloadRecovery: {id: string | number};
        useRecovery: {id: string | number};
        deleteRecovery: {id: string | number};
    };
    inspect: {
        validateMacro: Omit<Extract<PanelEdit, {type: 'validateMacro'}>, 'type'>;
    };
}
export type ControlsOn<R extends keyof ControlPayloads> = {[T in keyof ControlPayloads[R]]: {type: T} & ControlPayloads[R][T]}[keyof ControlPayloads[R]];
export type PanelControl = {[R in keyof ControlPayloads]: ControlsOn<R>}[keyof ControlPayloads];
export type ControlType = PanelControl['type'];
export type DraftControl = ControlsOn<'draft'>;
export type PortableControl = ControlsOn<'portable'>;
export type DemoControl = ControlsOn<'demo'>;
export type ShellControl = ControlsOn<'shell'>;
export type LayerEditControl = Extract<PortableControl, {type: 'editPortableLayer'}>;
export type LayerSaveControl = Extract<PortableControl, {type: 'savePortableLayers'}>;
/** The store attaches the current draft identity to edits and controls. */
export type PanelCommand = PanelEdit | PanelControl;
export type PanelRequest = PanelCommand & Partial<DraftIdentity>;
export type ReadStep = 'layout' | 'profile' | 'combos' | 'baseRgb';
export type ReadProgress = ({source: 'layout' | 'profile'; progress: CountedProgress} | {source: 'portable'; progress: string}) & {operationId: number; phase: PhaseId; selectedDeviceId: string; connectionToken: number | string | null};
export type MacroValidation = MacroInspection | {error: string; code: string};
export type PanelResponse<M = import('./panel.js').PublishedModel> =
    | {type: 'model'; model: M; notice?: string; failed?: boolean; resetDraftForms?: boolean; acceptedEdit?: {message: {type: string}; previousFingerprint: string; fingerprint: string}}
    | ({type: 'applyProgress'; apply: ApplyView} & Partial<DraftIdentity>)
    | ({type: 'readProgress'; read: ReadProgress} & Partial<DraftIdentity>)
    | ({type: 'macroValidation'; keycode: string; payload: string; requestId: number; validation: MacroValidation} & Partial<DraftIdentity>);
export interface ExportedProfile {fileName: string; text: string}
