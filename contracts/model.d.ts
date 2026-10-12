import type {Scalar} from './edits.js';

/** Device operation identity is stable when presentation words change. */
export type PhaseId = 'idle' | 'available' | 'empty' | 'connected' | 'demo' | 'enumerate' | 'connect' | 'refresh' | 'read-layout' | 'read-profile' | 'read-complete' | 'restore-complete' | 'disconnect' | 'read-combos' | 'read-base-rgb';
export interface PhaseWords {label: string; read?: string; busy?: string; writes: boolean}

export interface CountedProgress {done: number; total: number}
export interface BuildInfo {version: string; commit: string}
export interface RecoveryCopy {id: string | number; name: string; savedAt: string}
export interface HostPanel {
    chooseKeyboard: boolean;
    blocked: {title: string; detail: string; demo?: boolean} | null;
    theme: 'light' | 'dark' | null;
    recoveries: RecoveryCopy[] | null;
    build: BuildInfo | null;
    progress: string | null;
    words: Record<string, string>;
}
export interface DemoView {
    active: boolean;
    offered: boolean;
    name: string | null;
    fileName: string | null;
    unsaved: boolean;
    applyNeedsKeyboard: string;
}
export interface LoadView {
    state: 'loading' | 'ready' | 'unavailable';
    phase: PhaseId;
    operationId?: number;
    operationBusy?: boolean;
    connectionToken?: number | string | null;
    progress?: CountedProgress | string | null;
}
export interface StatusModel {
    vocabulary?: Pick<Vocabulary, 'phases'>;
    load?: LoadView;
    device?: {connected?: boolean; health?: {error?: string; phase?: PhaseId}};
    host?: HostPanel;
    demo?: DemoView;
    portable?: {available?: boolean; progress?: CountedProgress | string | null};
    draft?: {changes?: readonly unknown[]};
}

export type ApplyStep = 'check' | 'backup' | 'upload' | 'validate' | 'stage' | 'peer' | 'commit' | 'converge' | 'local' | 'verify';
export interface ApplyFailure {step: ApplyStep; label: string; reason: string; saved: string}
export interface ApplyView {
    id: number;
    state: 'failed' | 'done' | 'applying';
    steps: {id: ApplyStep; label: string; state: 'failed' | 'done' | 'active' | 'pending'}[];
    current: ApplyStep;
    detail: string;
    bytes: {completed: number; total: number} | null;
    failure: ApplyFailure | null;
}

export type WordList<T = Scalar> = readonly (readonly [T, string])[];
export interface Vocabulary {
    phases: Readonly<Record<PhaseId, Readonly<PhaseWords>>>;
    pickerModifiers?: {bit: number; value: string; label: string}[];
    hostOs: WordList<number>;
    macroPlayback?: Readonly<Record<string, string>>;
    macroProtection: WordList<'auto' | 'on' | 'off'>;
    hostLayouts: WordList<number>;
    holdHelpers: {hold: WordList<string>; long: WordList<string>};
    holdWithoutLongHold: WordList<string>;
    tapSends: string;
    tiers: Readonly<Record<string, string>>;
    branches: readonly string[];
    localities: WordList<string>;
    paintModes: WordList<string>;
    fadeModes: WordList<string>;
    tapCommit: WordList<string>;
    feedbackOwners: WordList<string>;
    stages: readonly {id: string; label: string; bit?: number}[];
    pointing: {
        kinds: WordList<number>;
        axes: WordList<number>;
        invert: WordList<number>;
        scrollAxes: WordList<number>;
        pointerLayer: WordList<number>;
        buttons: WordList<number>;
        emptyDirection: WordList<number>;
        directionOutput: WordList<number>;
        modifierPolicy: WordList<number>;
        scrollFields: WordList<string>;
        heldModifiers: string;
    };
    modifiers: WordList<number>;
    comboOptions: Readonly<Record<string, string>>;
}

export type MacroTypingRoute =
    | {character: string; method: 'layout'; strokes: string[]}
    | {character: string; method: 'unicode' | 'unavailable'; mode: number};
export interface MacroInspection {
    bytes: number | null;
    program: number | null;
    programMax: number | null;
    availableBytes: number;
    error: string;
    code: string;
    typing: MacroTypingRoute[];
}

export type FindingLevel = 'blocker' | 'trap' | 'warning' | 'notice';
export type FindingPlace =
    | {kind: 'key'; layer: number; layoutIndex?: number}
    | {kind: 'behaviour'; keycode: string}
    | {kind: 'combo'; index: number}
    | {kind: 'pointing'; slot: number}
    | {kind: 'macro'; index: number}
    | {kind: 'settings'; area?: string; section?: string; stage?: string};
export interface Finding {
    kind: string;
    level: FindingLevel;
    layers: number[];
    identity?: string;
    title: string;
    detail: string;
    fix: string;
    place?: FindingPlace;
    count?: number;
    path?: string[];
    scope?: 'escapes' | 'reachability';
}
export interface Check extends Finding {key: string; status: 'new' | 'existing' | 'fixed'}
export interface ProfileUsage {
    used: number;
    capacity: number;
    areas: {id: string; bytes: number}[];
    counts: {id: string; used: number; limit: number}[];
    source?: 'draft' | 'keyboard' | 'demo';
}

/** Profile-specific names sent to every surface that displays a key. */
export interface ProfileKeyNames {
    labels: Record<string, string>;
    aliases: Record<string, string>;
    pointing: NamedKey[];
    custom: NamedKey[];
    hostOs: number;
    legends: Record<string, string[]> | null;
    layers: string[];
}
export interface NamedKey {name: string; native: string; code: number; label: string}

export type ReviewPlace = FindingPlace
    | {kind: 'layers'; layers?: number[]}
    | {kind: 'customKey'; index: number}
    | {kind: 'lighting'; stage?: string | null; layer?: number; slot?: number};
export interface ReviewChange {
    area: string;
    unit: string | null;
    title: string;
    status: 'added' | 'changed' | 'removed';
    note?: string;
    group?: number | null;
    groupTitle?: string | null;
    place?: ReviewPlace | null;
    titleMark?: ReviewMark;
    fields: ReviewField[];
}
/** Import review omits full field comparisons and behavior targets. */
export type ReviewSummaryPlace = Exclude<ReviewPlace, {kind: 'behaviour'}> | {kind: 'behaviour'};
export type ReviewSummary = Pick<ReviewChange, 'unit' | 'title' | 'status'> & {place?: ReviewSummaryPlace | null};

export type ReviewMark =
    | {kind: 'layer'; layer: number}
    | {kind: 'pointing'; slot: number}
    | {kind: 'tier'; tier: string; branch?: number}
    | {kind: 'branch'; count: number}
    | {kind: 'combo'; badge?: string}
    | {kind: 'stage'; on: boolean};
export interface ReviewField {
    label: string;
    status?: ReviewChange['status'];
    before: Scalar | null;
    after: Scalar | null;
    labelMark?: ReviewMark;
    beforeMark?: ReviewMark;
    afterMark?: ReviewMark;
    beforeColour?: import('./edits.js').Hsv;
    afterColour?: import('./edits.js').Hsv;
}
export interface HistoryStep {
    step: number;
    at: number;
    label: string;
    current: boolean;
    undone: boolean;
    changes: ReviewChange[] | null;
}
export interface Participation {
    behaviorsEnabled: boolean;
    combosEnabled: boolean;
    behaviorLayers: number;
    comboLayers: number;
    layers: {bypass: number[]; exclude: number[]}[];
}

export interface SettingBits {bitMask?: number; shift?: number; width?: number; kind?: string}
export interface SettingFieldBase extends SettingBits {
    macro: string;
    label: string;
    hint?: string;
    unit?: string;
    presentation?: 'duration';
    validate?: string;
    min?: number;
    max?: number;
    choices?: (number | {value: number; label?: string})[];
    readOnly?: boolean;
    governs?: {kind: 'tier'; tier: string} | {kind: 'branch'; count: number} | {kind: 'layer'; layer: number};
}
export interface StoredSettingField extends SettingFieldBase {
    id: number;
    kind: 'number' | 'toggle' | 'layer';
    record?: undefined;
    layer?: undefined;
    of?: undefined;
}
export interface ShareSettingField extends SettingFieldBase {
    id: number;
    kind: 'share';
    of: number;
    record?: undefined;
    layer?: undefined;
}
export interface LayerSettingField extends SettingFieldBase {
    id?: undefined;
    kind: 'layer';
    record: 'reference';
    layer: number;
    of?: undefined;
}
export type SettingField = StoredSettingField | ShareSettingField | LayerSettingField;
export interface ComboTimingField {id: 'default' | 'hold'; label: string; hint: string}
export interface SettingsSection {
    id: string;
    label: string;
    area?: string;
    stage?: string;
    expanded?: boolean;
    description?: string;
    warning?: string;
    githubLink?: {label: string; url: string};
    fields: SettingField[];
    comboTiming?: readonly ComboTimingField[];
}
