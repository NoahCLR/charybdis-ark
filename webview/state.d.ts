import type {BranchStyle, Combo, PdTap, Scalar} from '../contracts/edits.js';
import type {PanelCommand, PanelResponse} from '../contracts/messages.js';
import type {MacroStep} from './view/types.js';
import type {ScreenId} from './view/screens.mjs';
/** A macro slot's name and playback protection, which Clear macro empties with its steps. */
export interface MacroSlotFields {name: string; protection: 'auto' | 'on' | 'off'}
/** `emptied`: this entry is Clear macro's, and undoing it puts back the name and protection the slot had. */
export interface MacroHistoryEntry {payload: string; steps?: MacroStep[]; selectedStep: string | null; selectedSteps: string[]; emptied?: MacroSlotFields}
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
    /** The name and protection the next staged steps carry: an empty slot's after Clear macro, the old ones when it is undone. */
    stageFields?: MacroSlotFields;
}
export interface PickerState {title: string; context?: string; contextKeycode?: string; onLayer?: number; mode: 'single' | 'list'; allowedKeys: string[] | null; modifiable?: string[] | null; shortcut?: boolean; maxKeys: number; section: string; search: string; mods: string[]; keys: string[]; own?: string[]; symbols?: Record<string, string[]>; layerTap: string | null; onPick?: (expression: string) => void; layers?: number; layerKind?: number; onShortcut?: (shortcut: import('../contracts/panel.js').CustomKeyShortcut) => void; onCustomKey?: (keycode: string, shortcut: import('../contracts/panel.js').CustomKeyShortcut, name: string) => void; customKeyRuns?: 'behaviour' | 'shortcut'; layoutKey?: boolean; comboOutput?: boolean}
export interface PanelState {
    screen: ScreenId; layer: number; layersOn: number[]; selected: number; tab: string;
    behaviourRow: string | null; behaviourRowShown: string | null; behaviourRoute: {row: string; group: string} | null;
    reachGroups: Record<string, boolean>; resetBenchHeight: boolean; reachRow: {macros: string | null; customKeys: string | null; combos: string | null; pointing: string | null};
    cell: string | null; cellRow: string | null; reveal: string | null; pickCombo: number | null; settingsOpen: string[]; flashPausesAsked: number | string | null; foldsOpen: string[]; emptyLayersShown: string[]; allSlotsShown: string[]; checkGroupsOpen: {revision: number; open: Record<string, boolean>} | null;
    cellHow: {cell: string; keycode: string; style?: BranchStyle; repeatHz?: Scalar} | null;
    timingRefusal: {keycode: string; term: import('../contracts/edits.js').TimingTerm; terms: Partial<Record<import('../contracts/edits.js').TimingTerm, string>>; problem: string} | null;
    combo: {open: boolean; picking: boolean; inputs: string[]; form: Omit<Combo, 'inputs'> & {output: string; termMs: string}; awaiting: boolean; editId: number | null;
        madeKey: {keycode: string; shortcut: import('../contracts/panel.js').CustomKeyShortcut; name: string} | null};
    placement: {keycode: string} | null; retarget: {from: string; to: string; existing: string} | null; keyClipboard: {keycode: string; label: string} | null;
    railMenu: boolean; boardShortcuts: boolean; stage: string; layersOpen: boolean; layersAsked: boolean; layerGripFocus?: number; pointingSlot: number; pointingSearch: string; pdKind: {slot: number; kind: number} | null;
    pdTaps: {slot: number; rows: Record<string, PdTap>} | null;
    pdAdvanced: boolean; applyDismissed: number; recoveryAsk: string | null; feedbackRow: string | undefined; comboPreview: {id: number; keys: number[]} | null; lightingGroupsShut: string[];
    macroSlot: string | null; macroSearch: string; customKey: string | null; customKeySearch: string; macroForms: Record<string, MacroForm>;
    /** The slot tile held for a keyboard swap (D-L81): its bank and the key its screen picks it by. */
    heldSlot: {bank: string; key: string} | null;
    macroClipboard: MacroStep[] | null;
    recording: {slot: string; before: string} | null; lastTake: {slot: string; before: string; after: string} | null;
    recordDelays: boolean; recordPreserveHoldTiming: boolean; recordDelayThreshold: number; recordDelayRound: number;
    /** The accent being added or changed (D-L77): its stage and table, whether it lights for all of the table's owners (else for the one the tab has picked), its place in its table (null for a new one), the LEDs picked, whether a drag on the board adds them or takes them back, its colour and whether it takes its stage's instead. */
    accent: {stage: string; target: import('../contracts/model.js').AccentTable; every: boolean; index: number | null; leds: number[]; adding: boolean; colour: {h: number; s: number; v: number}; stageColour: boolean} | null;
    /** The accent clicked in a Lighting list, glowing on the board until clicked again: the stage it was clicked on, and its key, `table:place` on a stage's tab or `table:owner` on All accents. */
    accentShown: {stage: string; key: string} | null;

    overlay: string | null;
    settingsDurationUnits: Record<string, 'seconds' | 'minutes'>;
    leaveDemo: {ask: {title: string; detail: string; confirm: string}; message: PanelCommand} | null;
    modeAsk: {mode: number; question: 'saveOrRevert' | 'sendOrDiscard'} | null;
    confirmChecks: number | null; picker: PickerState | null; notice: string; error: string;
}
