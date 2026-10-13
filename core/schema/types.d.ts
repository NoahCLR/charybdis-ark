export type ActionKind = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface SemanticAction {
    kind: ActionKind;
    operand: number;
    flags?: 0;
}

/** Inputs are validated and canonicalized by the schema, including omitted operands. */
export interface ActionInput {
    kind: number;
    operand?: number;
    flags?: number;
}

export interface ActionLimits {
    maxLogicalLayers: number;
    maxPdModes: number;
    maxViaMacroSlots: number;
    maxCustomKeys: number;
}

export type ActionOptions = Partial<ActionLimits> & {actionLimits?: Partial<ActionLimits>};
export type DomainVersions = Map<number | string, number | Set<number> | number[]> | Record<string, number | Set<number> | number[]>;
export interface BlobOptions {domainVersions?: DomainVersions}
export interface DomainInput {id: number; version: number; payload?: Uint8Array}
export interface ProfileDomain {id: number; version: number; payload: Buffer}
export interface BlobInput {
    schema?: {major: number; minor: number};
    domains?: DomainInput[];
}

export interface BehaviorLimits {
    maxRows: number;
    maxPopulatedSteps: number;
    maxTapStepsPerBehavior: number;
    maxLayers: number;
    maxRepeatHz: number;
    maxPayloadSize: number;
}
export type BehaviorOptions = Partial<BehaviorLimits> & {
    limits?: Partial<BehaviorLimits>;
    actionLimits?: Partial<ActionLimits>;
};

export interface HoldInput {mode: number; repeatHz?: number; action: ActionInput}
export interface BehaviorStepInput {
    tapIndex: number;
    tap?: ActionInput;
    hold?: HoldInput;
    longHold?: HoldInput;
}
export interface BehaviorRowInput {
    target: ActionInput;
    steps: BehaviorStepInput[];
    tapHoldTerm?: number;
    longerHoldTerm?: number;
    multiTapTerm?: number;
    keepsAutoMouseAnchored?: boolean;
    enabled?: boolean;
    allowedLayers?: number;
}
export interface HoldBranch {mode: number; repeatHz: number; action: SemanticAction}
export interface BehaviorStep {
    tapIndex: number;
    tap?: SemanticAction;
    hold?: HoldBranch;
    longHold?: HoldBranch;
}
export interface BehaviorRow {
    target: SemanticAction;
    steps: BehaviorStep[];
    tapHoldTerm: number;
    longerHoldTerm: number;
    multiTapTerm: number;
    keepsAutoMouseAnchored: boolean;
    enabled: boolean;
    allowedLayers: number;
}

export interface ComboRowInput {
    useOutputBehavior?: boolean;
    inputs: ActionInput[];
    output: ActionInput;
    termMs: number | null;
    mustHold?: boolean;
    mustTap?: boolean;
    ordered?: boolean;
    enabled?: boolean;
    allowedLayers?: number;
}
export interface ComboInput {
    version?: number;
    defaultTermMs: number;
    holdTermMs: number;
    rows: ComboRowInput[];
}
export interface LayerRecord {reference: number; bypass: number[]; exclude: number[]}
// What the firmware accepts for one stored settings value; a plain range
// also carries its bounds.
export interface SettingRule {valid(v: number, layers: number): boolean; min?: number; max?: number; step?: number; layerReference?: 'layer' | 'mask'; layerReorder?: 'storage' | 'reach'}
export interface SettingField<Name extends string = string> extends SettingRule {id: number; name: Name}
export interface SettingsDomain {
    comboOutputBehaviors?: boolean;
    formatVersion?: number;
    values: number[];
    names: string[];
    layers: LayerRecord[];
    macroNames: string[];
    customKeyNames: string[];
    /** The keyboard's own name, its USB product string; empty for the firmware's built-in name. */
    keyboardName: string;
}

export type MacroStep =
    | {kind: 'text'; text: string}
    | {kind: 'delay'; delay: number}
    | {kind: 'tap' | 'down' | 'up'; keys: number[]};
export interface MacroOptions {
    unicode?: boolean;
    textEntry?: boolean;
    layout?: number;
    protection?: 'auto' | 'on' | 'off';
    protectionSupported?: boolean;
}

export interface PdTap {keycode: number; modifierPolicy: number; mask: number}
export interface PdButton {kind: number; modifiers: number; tap: PdTap}
export interface PdSlot {
    id: number;
    kind: number;
    pointerLayer: number;
    axis: number;
    dpi: number;
    heldModifiers: number;
    name: string;
    thresholdX: number;
    thresholdY: number;
    directions: Record<string, PdTap>;
    buttons: PdButton[];
    scroll: Record<string, number>;
    diagonals: Record<string, PdTap>;
    emptyDirection: number;
    directionOutput: number;
}
export type PdSlotInput = Partial<Omit<PdSlot, 'buttons' | 'directions' | 'diagonals'>> & {
    id: number;
    name: string;
    directions?: Record<string, Partial<PdTap>>;
    diagonals?: Record<string, Partial<PdTap>>;
    buttons?: {kind?: number; modifiers?: number; tap?: Partial<PdTap>}[];
};

export interface Hsv {h: number; s: number; v: number}
export type RgbGroupRow<K extends 'selector' | 'semantic' = 'selector'> = Record<K, number> & {color: Hsv; groupId: number};
export interface RgbKeyFeedback {
    tapBranchColors: Hsv[];
    tapCommittedColor: Hsv;
    holdActiveColor: Hsv;
    longHoldActiveColor: Hsv;
    tapCommitMode: number;
    locality: number;
}
export interface RgbProfile {
    formatVersion: number;
    stageEnableMask: number;
    groups: {id: number; leds: number[]}[];
    layerColors: {layerId: number; color: Hsv; mode: number}[];
    layerGroupRows: RgbGroupRow[];
    automouseFade: {mode: number; endColor: Hsv};
    pdModeColors: {pdModeId: number; color: Hsv; locality: number}[];
    pdModeGroupRows: RgbGroupRow[];
    comboFeedback: {color: Hsv; locality: number};
    comboGroupRows: {color: Hsv; groupId: number}[];
    keyFeedback: RgbKeyFeedback;
    keyGroupRows: RgbGroupRow<'semantic'>[];
}
export type RgbInput = Partial<Omit<RgbProfile, 'keyFeedback'>> & {keyFeedback?: Partial<RgbKeyFeedback>};
export interface RgbOptions {
    maxLogicalLayers?: number;
    logicalLayerCount?: number;
    supportedPdModeIds?: Iterable<number>;
    compiledStageMask?: number;
    maximumBrightness?: number;
    tapBranchColorCount?: number;
}
