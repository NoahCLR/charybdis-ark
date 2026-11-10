import type {PanelEdit, DraftIdentity} from './edits.js';
import type {ApplyView, CountedProgress, EditMode, MacroInspection, PhaseId} from './model.js';

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
        /** Live preview + save: the keyboard writes what it runs as its saved profile. */
        saveProfileDraft: {confirmChecks?: boolean};
        /** Live preview + save: the keyboard runs its saved profile again. */
        revertProfileDraft: Record<never, never>;
        /** Send the edit waiting on its trap check, or drop it. */
        confirmLiveEdit: {proposal: number};
        cancelLiveEdit: {proposal: number};
        /** Cancel edit: abort the live edit the keyboard holds until no key is held. */
        abortLiveEdit: Record<never, never>;
        /** How edits reach the keyboard; `pending` says what happens to work in progress first. */
        setEditMode: {mode: EditMode; pending?: 'save' | 'revert' | 'send' | 'discard'; /** The question showed the draft's traps and warnings and the person went ahead. */ confirmChecks?: boolean};
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
        /** Save the draft's autocorrect list as a file in one of the three formats (D-L85). */
        exportAutocorrect: {format: AutocorrectFileFormat};
    };
    demo: {
        openDemo: {discardDemo?: boolean};
        openDemoProfile: {discardDemo?: boolean};
        leaveDemo: {discardDemo?: boolean};
    };
    read: {
        ready: {discardDemo?: boolean};
        /** `flashPauses`: the Keyboard screen's Diagnostics is open, so each half's flash pauses are read after the keyboard. */
        refresh: {discardDemo?: boolean; flashPauses?: boolean};
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
        validateAutocorrect: Omit<Extract<PanelEdit, {type: 'validateAutocorrect'}>, 'type'>;
        /** Try it: what the keyboard would leave on screen for `typed` (the characters a computer would show, `\b` for Backspace) after `before`, text already there; answered with `autocorrectTry`. */
        tryAutocorrect: {requestId: number; before: string; typed: string; capsLock: boolean};
        /** What a list file, dropped (`text`, `name`) or the starter list (`starter`), would do to the draft's list; answered with `autocorrectImportPreview`. */
        previewAutocorrectImport: {requestId: number} & ({text: string; name: string; starter?: undefined} | {starter: true; text?: undefined; name?: undefined});
        /** The same for a file the shell's chooser picks. */
        chooseAutocorrectFile: {requestId: number};
    };
    diagnose: {
        /** Read each half's flash pauses (GET 0x0D) for the Keyboard screen's Diagnostics. */
        readFlashPauses: Record<never, never>;
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
/** What an autocorrect edit would be refused for (`error`, '' when it would be taken) and what it would newly warn about. For an edit that names a replacement to add to or to change to: the id that replacement's entry has in the list once the edit is kept (`entry`), what it is called there (`label`, as an entry's is), and whether the list already has it (`listed`): an add then adds to that entry, which `listedSaid` says in a sentence for a replacement being made, and a change joins it, which a warning says. A refused edit says these too, where its replacement can be one. */
export interface AutocorrectValidation {error: string; code: string; warnings: string[]; entry?: string; label?: string; listed?: boolean; listedSaid?: string}
/** What the keyboard would leave on screen for a try: the text, the replacements that fired and still stand, in order (each its entry's id, its text or '' with the macro slot it played, and the input's stored letters), where each of those stands in the text (`marks`, by its offsets; a part deleted since is no longer marked), and whether the last key undid one. */
export interface AutocorrectTryResult {text: string; fired: {entry: string; correction: string; typo: string; macro?: number}[]; marks: {entry: string; correction: string; typo: string; macro?: number; start: number; end: number}[]; undone: boolean}
export type AutocorrectFileFormat = 'txt' | 'csv' | 'json';
/** A line a list file or the list refused, and why; `line` is the file's line, row or entry number. */
export interface AutocorrectImportRefused {line: number | null; text: string; reason: string}
/** What importing a file one way would do: the list's size after it, the replacements it makes and the inputs it adds to replacements the list has (each by its label, as an entry's is, with its inputs as written), how many inputs it skips as already there, what it refuses, in the file's order, how many inputs do not fit what the keyboard holds and what stopped the first of them (`unfitWhy`, the end of a sentence), and how many entries replacing takes away. */
export interface AutocorrectImportOutcome {
    replacements: number; inputs: number;
    newReplacements: {label: string; inputs: string[]}[];
    addedInputs: {label: string; inputs: string[]}[];
    duplicates: number; refused: AutocorrectImportRefused[]; unfit: number; unfitWhy: string; removed: number;
}
/** A list file read and judged both ways (core/model/autocorrect-import.js): what it holds, and what Add and Replace would each do. */
export interface AutocorrectImportPreview {
    format: AutocorrectFileFormat | 'starter';
    entries: import('./edits.js').AutocorrectEntryEdit[];
    add: AutocorrectImportOutcome; replace: AutocorrectImportOutcome;
}
/** What the shell posts to the panel. The catalog comes before the first model, and again after each `ready`; a model leaves out what it holds. */
export type PanelResponse<M = import('./panel.js').PostedModel> =
    | {type: 'catalog'; catalog: import('./panel.js').PanelCatalog}
    | {type: 'model'; model: M; notice?: string; failed?: boolean; resetDraftForms?: boolean; acceptedEdit?: {message: {type: string}; previousFingerprint: string; fingerprint: string}}
    | ({type: 'applyProgress'; apply: ApplyView} & Partial<DraftIdentity>)
    | ({type: 'readProgress'; read: ReadProgress} & Partial<DraftIdentity>)
    | ({type: 'macroValidation'; keycode: string; payload: string; requestId: number; validation: MacroValidation} & Partial<DraftIdentity>)
    | ({type: 'autocorrectValidation'; requestId: number; validation: AutocorrectValidation} & Partial<DraftIdentity>)
    /** `result` is absent with `error`, why the text could not be tried. */
    | ({type: 'autocorrectTry'; requestId: number; result?: AutocorrectTryResult; error?: string} & Partial<DraftIdentity>)
    /** `preview` is absent when no file was chosen, or with `error`, why the file could not be read. */
    | ({type: 'autocorrectImportPreview'; requestId: number; name: string; preview?: AutocorrectImportPreview; error?: string} & Partial<DraftIdentity>);
/** A file a shell saves: `mime` is its media type when it is not JSON. */
export interface ExportedProfile {fileName: string; text: string; mime?: string}
