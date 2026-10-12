import type {BaseIdentity, Behavior, BehaviorBranch, Combo, Colour, KeyFeedback, LayerReference, PdSlot, Scalar} from './edits.js';
import type {ApplyView, Check, DemoView, HistoryStep, HostPanel, LoadView, Participation, PhaseId, ProfileUsage, ReviewChange, SettingField, SettingsSection, Vocabulary} from './model.js';

export interface Position {
    layoutIndex: number;
    keycode: string;
    semantic?: string;
    display?: string;
    editLabel?: string;
    modifierLabel?: string;
    layerLabel?: string;
    row?: number;
    column?: number;
    value?: number;
}
export interface Layer {name: LayerReference; index: number; positions: Position[]; displayName?: string}
export interface Branch extends BehaviorBranch { label?: string; fallback?: boolean}
export interface BuiltIn {tap?: Branch; hold?: Branch; releaseTaps?: boolean}
export interface BehaviorView extends Omit<Behavior, 'steps'> {
    builtIn?: BuiltIn;
    steps: {tapCount: number; tapCountName?: string; tap?: Branch; hold?: Branch; longHold?: Branch}[];
    timingDefaults?: Record<string, Scalar | undefined>;
}
export interface ComboView extends Combo {inputPositions?: number[]; id: number; badge: string; inputDisplays: string[]; outputDisplay: string}
export interface CatalogEntry {value: string; key: string; label: string; group: string; aliases: string[]; keycode: number; searchTerms: string[]; search: string; searchCompact: string; name?: string}
export interface MacroSlot {kind: string; keycode: string; name: string; payload: string; protection: 'auto' | 'on' | 'off'; uninterruptible: boolean; needsUnicodeEntry: boolean; needsUnicodeSetup: boolean; playbackError: string; playbackCode: string; empty: boolean; bytes: number; program: number; playable: boolean; available: boolean; roomTaps: number}
export interface CustomKey {slot: number; keycode: string; code: number; name: string; hasBehavior: boolean}
export type PresentedField = SettingField & {value: string; enabled?: boolean; ms?: string; whole?: string};
export interface PresentedSection extends Omit<SettingsSection, 'fields'> {fields: PresentedField[]}
export interface ProfileSummary {layers: number; behaviors: number; combos: number; macros: number; names: string[]}
/**
 * Why the open draft takes no edit now, or '' when it does, first match in this order: no draft; another
 * keyboard is selected; its keyboard is disconnected; it is connected over a new connection; the firmware
 * cannot hold a complete profile; the draft is stale; an operation is running.
 */
export type DraftBlock = '' | 'no-draft' | 'other-keyboard' | 'disconnected' | 'connection-changed' | 'unsupported' | 'stale' | 'busy';
export interface DraftView {
    id: string; revision: number; dirty: boolean; stale: boolean; connectionChanged: boolean; connected: boolean; matching: boolean; busy: boolean;
    /** Whether core takes an edit to this draft now (core/session/panel-session-state.js draftBinding); the interface's canEdit reads it. */
    editable: boolean;
    /** Why it does not, or '' when it does. */
    reason: DraftBlock;
    canUndo: boolean; canRedo: boolean; undoLabel: string | null; redoLabel: string | null; historyLength: number; reviewed: boolean;
    changes: ReviewChange[]; checks: Check[]; steps?: HistoryStep[];
}
export interface LedGroup {name: string; id: number; ledIndices: number[]; expression: string; usageCount: number; usages: {target: string; owner: string}[]}
export interface LedRow {index: number; owner: string; color: Colour; ledGroup: string; ledGroupKind: string; ledIndices: number[]}
export interface RgbView {
    stageEnableMask: number;
    stages: {id: string; label: string; bit?: number; enabled: boolean}[];
    ledGroups: LedGroup[];
    layerColors: {layer: LayerReference; layerId: number; color: Colour; mode: string}[];
    layerLedGroups: LedRow[];
    automouseFade: {mode: string; end_color: Colour};
    pdModeColors: {pointingMode: string; color: Colour; locality: string}[];
    pdModeLedGroups: LedRow[];
    comboFeedback: {color: Colour; locality: string};
    comboFeedbackLedGroups: LedRow[];
    keyBehaviorFeedback: KeyFeedback<Colour>;
    keyBehaviorFeedbackLedGroups: LedRow[];
}
export interface BaseRgbView {state: string; message?: string; enabled?: boolean; effectId?: number; hue?: number; saturation?: number; brightness?: number; speed?: number; readAt?: string; effectName?: string; brightnessPercent?: number; previewColor?: Colour}
export interface PublishedModel {
    vocabulary: Vocabulary & {pickerModifiers: {bit: number; value: string; label: string}[]};
    layers: Layer[];
    hostLayoutLegends: Record<string, string[]> | null;
    pdModes: (PdSlot & {displayName: string; binding: {slot: number; hold: string; lock: string; holdCode: number; lockCode: number}})[];
    pdModeEditing: {writable: boolean; dpiChoices: {value: number; label: string}[]};
    keyBehaviors: BehaviorView[];
    behaviorEditing: {busy: boolean; writable: boolean; maxTapStepsPerBehavior: number; keyDefaults: Record<string, {builtIn: BuiltIn; timing: Record<string, Scalar | undefined>}>};
    profileIdentity: Partial<BaseIdentity> | null;
    rgb: Partial<RgbView> & {maximumBrightness?: number; baseEffect: BaseRgbView};
    combos: ComboView[];
    comboReadback: {layerReferences?: number[]; version?: number; state?: string; writable?: boolean; defaultTermMs?: number; holdTermMs?: number; enabled?: boolean; error?: {message?: string}};
    viaMacros: MacroSlot[];
    macroNameSpace: {perName: number} | null;
    macroBank: {capacity: number; stored: number; free: number; available: number; slots: number; reserveTaps: number; programMax: number | null} | null;
    hostSettings: {selected: number; detected: number; effective: number; unicodeEnabled: boolean; unicodeMode: number; layout: number; layoutFits: boolean; macosIso: boolean; supported: boolean} | null;
    macroUnicode: {supported: boolean; mode: number; enabled?: boolean; os?: number; layouts?: boolean; layout?: number; layoutFits?: boolean; layoutName?: string; layoutChars?: string};
    macroProtectionSupported: boolean;
    macroOutputIsolationSupported: boolean;
    macroProtectionChoices: {value: 'auto' | 'on' | 'off'; label: string}[];
    macroEditing: {identity: string; writable: boolean};
    behaviorTimingDefaults: Record<string, string>;
    configDefaults: PresentedSection[];
    participation: Participation | null;
    settingsEditing: {identity: string; writable: boolean};
    macroPayloadKeycodes: string[];
    macroPayloadModifierKeycodes: string[];
    customKeys: CustomKey[];
    customKeyNameSpace: {perName: number} | null;
    customKeyEditing: {identity: string; writable: boolean};
    ownsLayerKeys: boolean;
    qmkKeycodes: CatalogEntry[];
    qmkKeyLabels: Record<string, string>;
    qmkKeycodeAliases: Record<string, string>;
    qmkKeycodeSource: string;
    diagnostics: string[];
    device: {connected: boolean; label: string; summary: string; subtitle: string; health: {profile: string; converged: boolean; recoveryPending: boolean; restartNeeded: boolean; busy: boolean; phase: PhaseId; error: string}};
    devices: {id: string; label: string}[];
    selectedDeviceId: string;
    draft?: DraftView;
    demo: DemoView;
    apply: ApplyView | null;
    /** Core always sets `progress`, possibly undefined, which a JSON transport drops. */
    postApplyRead: {step: import('./messages.js').ReadStep; progress?: import('./model.js').CountedProgress | null} | null;
    portable: {available: boolean; busy: boolean; progress?: string; review: {incoming: ProfileSummary; current?: ProfileSummary | null; fileName: string | null; differences: import('./model.js').ReviewSummary[] | null} | null; layers: {key: string; order: number[]; names: string[]; keysFollow: boolean} | null; usage: ProfileUsage | null};
    host: HostPanel;
    load: LoadView;
}
