import type {PanelEdit, DraftIdentity} from './edits.js';
import type {ApplyView, CountedProgress, MacroInspection} from './model.js';

export type DraftControl = {type: 'reviewProfileDraft' | 'closeProfileDraftReview' | 'undoProfileDraft' | 'redoProfileDraft' | 'discardProfileDraft' | 'rebaseProfileDraft' | 'applyProfileDraft'; confirmChecks?: boolean}
    | {type: 'jumpProfileDraft'; step: number}
    | {type: 'discardProfileDraftChanges'; group: number};
/** Every field a layer-editor message may carry; a shape leaves the ones it does not name absent. */
type LayerFields = {keysFollow?: never; names?: never; id?: never; name?: never; makeBase?: never; to?: never; direction?: never};
type LayerShape<T> = Omit<LayerFields, keyof T> & T;
/** The Rename & Reorder panel's edits. Names typed so far ride along with a toggle or a move. */
export type LayerEditControl = {type: 'editPortableLayer'} & (
    | LayerShape<{keysFollow: boolean; names?: string[]}>
    | LayerShape<{id: number; name: string}>
    | LayerShape<{id: number; to: number; names?: string[]}>
    | LayerShape<{id: number; direction: 1 | -1; names?: string[]}>
    | LayerShape<{id: number; makeBase: true; names?: string[]}>);
export type LayerSaveControl = {type: 'savePortableLayers'} & LayerShape<{names?: string[]; keysFollow?: boolean}>;
export type PortableControl = {type: 'exportPortableProfile' | 'choosePortableProfile' | 'restorePortableProfile' | 'managePortableLayers' | 'cancelPortableReview'}
    | LayerEditControl
    | LayerSaveControl
    | Extract<PanelEdit, {type: 'reviewPortableProfile'}>;
export type DemoControl = {type: 'openDemo' | 'openDemoProfile' | 'leaveDemo'; discardDemo?: boolean};
export type HostControl = {type: 'chooseKeyboard'; discardDemo?: boolean} | {type: 'setTheme'; theme: 'light' | 'dark'} | {type: 'downloadRecovery'; id: string | number};
/** The store attaches the current draft identity to edits and controls. */
export type PanelCommand = PanelEdit | DraftControl | PortableControl | DemoControl | HostControl
    | {type: 'ready' | 'refresh' | 'openProfileDraftHistory' | 'closeProfileDraftHistory'; discardDemo?: boolean}
    | {type: 'selectDevice'; deviceId: string; discardDemo?: boolean};
export type PanelRequest = PanelCommand & Partial<DraftIdentity>;
export type ReadStep = 'layout' | 'profile' | 'combos' | 'baseRgb';
export type ReadProgress = ({source: 'layout' | 'profile'; progress: CountedProgress} | {source: 'portable'; progress: string}) & {operationId: number; phase: string; selectedDeviceId: string; connectionToken: number | string | null};
export type MacroValidation = MacroInspection | {error: string; code: string};
export type PanelResponse<M = import('./panel.js').PublishedModel> =
    | {type: 'model'; model: M; notice?: string; resetDraftForms?: boolean; acceptedEdit?: {message: {type: string}; previousFingerprint: string; fingerprint: string}}
    | ({type: 'applyProgress'; apply: ApplyView} & Partial<DraftIdentity>)
    | ({type: 'readProgress'; read: ReadProgress} & Partial<DraftIdentity>)
    | ({type: 'macroValidation'; keycode: string; payload: string; requestId: number; validation: MacroValidation} & Partial<DraftIdentity>);
export interface ExportedProfile {fileName: string; text: string}
