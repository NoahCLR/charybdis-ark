import type {BranchHelper, Combo, PdButton, PdTap, Scalar} from '../contracts/edits.js';
import type {PanelCommand, PanelResponse} from '../contracts/messages.js';
import type {MacroStep} from './view/types.js';
import type {ScreenId} from './view/screens.mjs';
export interface MacroHistoryEntry {payload: string; steps?: MacroStep[]; selectedStep: string | null; selectedSteps: string[]}
export interface MacroHistory {past: MacroHistoryEntry[]; present: MacroHistoryEntry; future: MacroHistoryEntry[]; group: string | null}
export interface MacroForm {
    draft?: string; steps?: MacroStep[]; stepError?: string; cancelBlur?: boolean; wantsStage?: boolean; requestId?: number;
    validation?: Extract<PanelResponse, {type: 'macroValidation'}> & {context: string};
    view?: string; rawOpen?: boolean; guidanceOpen?: boolean;
    /** Focus metadata only; untouched steps still come from the core's payload. */
    stepFocus?: MacroStep[];
    selectedStep?: string | null;
    moveNotice?: string;
    selectionAnchor?: string | null; selectedSteps?: string[]; stepHistory?: MacroHistory;
}
export interface PickerState {title: string; context?: string; contextKeycode?: string; mode: 'single' | 'list'; allowedKeys: string[] | null; modifiable?: string[] | null; shortcut?: boolean; maxKeys: number; section: string; search: string; mods: string[]; keys: string[]; layerTap: string | null; onPick?: (expression: string) => void; onShortcut?: (shortcut: {mods: number; key: number}) => void; onCustomKey?: (keycode: string, shortcut: {mods: number; key: number}, name: string) => void; customKeyRuns?: 'behaviour' | 'shortcut'; layoutKey?: boolean; comboOutput?: boolean}
export interface PanelState {
    screen: ScreenId; layer: number; layersOn: number[]; selected: number; tab: string;
    behaviourRow: string | null; behaviourRowShown: string | null; behaviourRoute: {row: string; group: string} | null;
    reachGroups: Record<string, boolean>; resetBenchHeight: boolean; reachRow: {macros: string | null; combos: string | null; pointing: string | null};
    cell: string | null; cellRow: string | null; reveal: string | null; pickCombo: number | null; settingsOpen: string[]; keyDetailsOpen: boolean; stackOpen: boolean;
    cellHow: {cell: string; keycode: string; helper?: BranchHelper; repeatHz?: Scalar} | null;
    combo: {open: boolean; picking: boolean; inputs: string[]; form: Omit<Combo, 'inputs'> & {output: string; termMs: string}; awaiting: boolean; editId: number | null;
        madeKey: {keycode: string; shortcut: {mods: number; key: number}; name: string} | null};
    placement: {keycode: string} | null; retarget: {from: string; to: string; existing: string} | null; keyClipboard: {keycode: string; label: string} | null;
    stage: string; layersOpen: boolean; layersAsked: boolean; layerGripFocus?: number; pdSlot: number; pdKind: {slot: number; kind: number} | null;
    pdButtons: {slot: number; rows: Record<number, PdButton>} | null; pdTaps: {slot: number; rows: Record<string, PdTap>} | null;
    pdAdvanced: boolean; applyDismissed: number; pdPreview: boolean; feedbackRow: string | undefined;
    macroSlot: string | null; macroSearch: string; customKey: string | null; customKeySearch: string; macroForms: Record<string, MacroForm>;
    macroClipboard: MacroStep[] | null;
    recording: {slot: string; before: string} | null; lastTake: {slot: string; before: string; after: string} | null;
    recordDelays: boolean; recordPreserveHoldTiming: boolean; recordDelayThreshold: number; recordDelayRound: number;
    ledPicks: number[]; trackball: boolean; rowColour: {h: string; s: string; v: string}; ledRow: {target: string; owner: string; source: string};
    settingsSearch: string; overlay: string | null;
    settingsDurationUnits: Record<string, 'seconds' | 'minutes'>;
    leaveDemo: {ask: {title: string; detail: string; confirm: string}; message: PanelCommand} | null;
    modeAsk: {mode: number; question: 'saveOrRevert' | 'sendOrDiscard'} | null;
    confirmChecks: number | null; picker: PickerState | null; notice: string; error: string;
}
