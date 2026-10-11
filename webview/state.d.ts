import type {BranchHelper, Combo, PdButton, PdTap, Scalar} from '../contracts/edits.js';
import type {PanelCommand, PanelResponse} from '../contracts/messages.js';
import type {MacroStep} from './view/types.js';
export interface MacroForm {
    draft?: string; steps?: MacroStep[]; stepError?: string; cancelBlur?: boolean; wantsStage?: boolean; requestId?: number;
    validation?: Extract<PanelResponse, {type: 'macroValidation'}> & {context: string};
    view?: string; newKind?: MacroStep['kind']; rawOpen?: boolean;
}
export interface PickerState {title: string; context?: string; contextKeycode?: string; mode: 'single' | 'list'; allowedKeys: string[] | null; maxKeys: number; section: string; search: string; mods: string[]; keys: string[]; layerTap: string | null; onPick?: (expression: string) => void}
export interface PanelState {
    screen: string; layer: number; layersOn: number[]; selected: number; tab: string;
    behaviourRow: string | null; behaviourRowShown: string | null; behaviourRoute: {row: string; group: string} | null;
    reachGroups: Record<string, boolean>; resetBenchHeight: boolean; reachRow: {macros: string | null; combos: string | null; pointing: string | null};
    cell: string | null; reveal: string | null; pickCombo: number | null; settingsOpen: string[];
    cellHow: {cell: string; keycode: string; helper?: BranchHelper; repeatHz?: Scalar} | null;
    combo: {open: boolean; picking: boolean; inputs: string[]; form: Omit<Combo, 'inputs'> & {output: string; termMs: string}; awaiting: boolean; editId: number | null};
    placement: {keycode: string} | null; retarget: {from: string; to: string; existing: string} | null; keyClipboard: {keycode: string; label: string} | null;
    stage: string; layersOpen: boolean; layersAsked: boolean; layerGripFocus?: number; pdSlot: number; pdKind: {slot: number; kind: number} | null;
    pdButtons: {slot: number; rows: Record<number, PdButton>} | null; pdTaps: {slot: number; rows: Record<string, PdTap>} | null;
    pdAdvanced: boolean; applyDismissed: number; pdPreview: boolean; feedbackRow: string | undefined;
    macroSlot: string | null; macroSearch: string; customKey: string | null; customKeySearch: string; macroForms: Record<string, MacroForm>;
    recording: {slot: string; before: string; last: number; captured: boolean} | null; lastTake: {slot: string; before: string} | null;
    recordDelays: boolean; recordMode: string; recordDelayThreshold: number; recordDelayRound: number;
    ledPicks: number[]; trackball: boolean; rowColour: {h: string; s: string; v: string}; ledRow: {target: string; owner: string; source: string};
    settingsSearch: string; overlay: string | null;
    leaveDemo: {ask: {title: string; detail: string; confirm: string}; message: PanelCommand} | null;
    confirmChecks: number | null; picker: PickerState | null; notice: string; error: string;
}
