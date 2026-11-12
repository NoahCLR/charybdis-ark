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
    railMenu: boolean; stage: string; layersOpen: boolean; layersAsked: boolean; layerGripFocus?: number; pointingSlot: number; pointingSearch: string; pdKind: {slot: number; kind: number} | null;
    pdTaps: {slot: number; rows: Record<string, PdTap>} | null;
    pdAdvanced: boolean; applyDismissed: number; recoveryAsk: string | null; feedbackRow: string | undefined; replacementRow: string | undefined; comboPreview: {id: number; keys: number[]} | null; lightingGroupsShut: string[];
    /** The Text replacement screen's search, and the entry open in its editor, by its id (null: the first shown). */
    autocorrectSearch: string; autocorrectEntry: string | null;
    /** A replacement being made, or null: its kind, its text or macro slot, and its first input as typed so far. It joins the list with that input; `sent` once that is posted, the list it was posted against, and `made`, the id core's check said its entry would have. `label` is what core's check calls it, and `joins` the entry the list already has for it, as the check said, with core's sentence for it. `shown` while its editor is the one open. */
    autocorrectNew: {kind: 'text' | 'macro'; text: string; macro: number | null; input?: string; fires?: import('../contracts/edits.js').AutocorrectTrigger; label?: string; joins?: {entry: string; said: string} | null; shown: boolean; sent?: string; made?: string; emptied?: {entry: string; sent?: string}} | null;
    /** What is open in the editor of the entry with this id: Text or Macro picked there and not yet kept (`kind`), the field that adds inputs (`more`, `left` once it was left with an input on its way), or one input being written anew (`input`, with `typo`, its stored letters); `sent` once an edit from it is posted, the list it was posted against, and `follow`, the id core's check said the entry would then have. */
    autocorrectEdit: {entry: string; part: 'kind' | 'more' | 'input'; typo?: string; kind?: 'text' | 'macro'; left?: boolean; sent?: string; follow?: string} | null;
    /** Whether the Export menu is open. */
    autocorrectExport: boolean;
    /** The core's answer to the text replacement edit being typed, for the field it is in (a replacement's text, an input, or a new replacement): the edit asked about (`asked`), whether the answer is still on its way (`pending`), its refusal or what it would newly warn about, and the entry its replacement is in the list (contracts/messages.d.ts AutocorrectValidation). */
    autocorrectCheck: {form: 'replacement' | 'input' | 'new'; requestId: number; asked: string; pending: boolean; error: string; warnings: string[]; entry?: string; label?: string; listed?: boolean; listedSaid?: string} | null;
    /** A list file being read, or read and waiting on Add or Replace: the request it answers, whether the shell's chooser is asking for it (`choosing`), the file's name ('' until the chooser names it), and core's preview or why it could not be read. */
    autocorrectImport: {requestId: number; pending: boolean; choosing?: boolean; name: string; preview?: import('../contracts/messages.js').AutocorrectImportPreview; error?: string} | null;
    /** Try it: what its box holds (`text`, never changed by Ark), read as the text that was there (`before`) and the keys typed since (`typed`, `\b` for Backspace), the Caps Lock the preview is made under, and the core's last answer: the text the keyboard would leave (`shown`), what fired, where each replacement stands in it (`marks`), whether the last key undid one, the draft it was tried against and why it could not be. */
    autocorrectTry: {before: string; typed: string; capsLock: boolean; text: string; shown: string; fired: import('../contracts/messages.js').AutocorrectTryResult['fired']; marks: import('../contracts/messages.js').AutocorrectTryResult['marks']; undone: boolean; error: string; requestId: number; draft: string; leader: string; leaderResult: import('../contracts/messages.js').AutocorrectLeaderTry | null};
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
