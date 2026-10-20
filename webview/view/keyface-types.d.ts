import type {BehaviorView, Branch, ComboView, Layer, Position, PublishedModel} from '../../contracts/panel.js';

export type ViewModel = Partial<PublishedModel> | null | undefined;
export type PointingSlot = PublishedModel['pdModes'][number];
export type BehaviorStep = BehaviorView['steps'][number];
export type Tier = 'tap' | 'hold' | 'long';
export type BehaviorRoute = 'view' | 'here' | 'through' | 'combos' | 'belowCombos';
export interface ResolvedKey {position: Position; layer: Layer; fellThrough: boolean; whileHeld: boolean; reference?: boolean}
export interface ComboRoute {combo: ComboView; keys: ResolvedKey[]}
export interface ReachedBehavior {keycode: string; action: string; layer: Layer | null; whileHeld: boolean}
export interface ReachedCombo extends ComboRoute {via: string | null; action: string}
export interface ReachEntry {name: string; keys: ResolvedKey[]; behaviours: ReachedBehavior[]; combos: ReachedCombo[]}
export interface ReachGroup {onKeys: ReachEntry[]; fromBranches: ReachEntry[]; fromCombos: ReachEntry[]; throughKeys: ReachEntry[]; fromBranchesBelow: ReachEntry[]; fromCombosBelow: ReachEntry[]; elsewhere: string[]}
export interface SortableReach {layer?: Layer | null; keys?: ResolvedKey[]; behaviours?: ReachedBehavior[]; combos?: ComboRoute[]}
export interface BehaviorCombo {row: BehaviorView; combos: ComboRoute[]}
export interface ComboGroupEntry extends ComboRoute {inputs: number; covered: number; held: Layer[]}
export interface ComboGroups {onKeys: ComboGroupEntry[]; throughKeys: ComboGroupEntry[]; fromBranches: never[]; fromBranchesBelow: never[]; elsewhere: ComboGroupEntry[]}
export interface ReachRecord {directKeys: ResolvedKey[]; fellKeys: ResolvedKey[]; directRows: ReachedBehavior[]; belowRows: ReachedBehavior[]; directCombos: ReachedCombo[]; belowCombos: ReachedCombo[]}
export type ReachOf = (model: ViewModel, stack: Layer[], at: number) => ReachGroup;
export type NamesOf = (keycode: string | undefined) => string[];
// `times`: sent once per press of that many; `first`: the row's own first tap, not the key's.
export type InheritedBranch = Branch & {times?: number; first?: boolean};
export type ImpliedBranch = {meaning: 'continues'; hold: InheritedBranch} | {meaning: 'tapsBeforeLong'; tap: InheritedBranch};

export interface KeyFace {main: string; sub: string; kind: 'none' | 'transparent' | 'disabled' | 'layer' | 'key'}
export type NamedAction =
    | {kind: 'pointing'; word: 'pointing mode'; name: string; slot: PointingSlot; tags: string[]}
    | {kind: 'macro'; word: 'macro'; name: string; slot: PublishedModel['viaMacros'][number] | undefined; tags: string[]};
