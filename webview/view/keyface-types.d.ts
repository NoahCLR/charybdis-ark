import type {BehaviorView, Branch, ComboView, Layer, Position, PublishedModel} from '../../contracts/panel.js';

export type ViewModel = Partial<PublishedModel> | null | undefined;
export type PointingSlot = PublishedModel['pdModes'][number];
export type BehaviorStep = BehaviorView['steps'][number];
import type {Tier} from '../../contracts/edits.js';
export type {Tier};
export type BehaviorRoute = 'view' | 'here' | 'through' | 'combos' | 'belowCombos';
export interface ResolvedKey {position: Position; layer: Layer; fellThrough: boolean; whileHeld: boolean; reference?: boolean}
export interface ComboRoute {combo: ComboView; keys: ResolvedKey[]}
// The cell of a behaviour's grid a branch sits in: its tap count, from 1, and its tier.
export interface BranchCell {branch: number; tier: Tier}
export interface ReachedBehavior {keycode: string; action: string; layer: Layer | null; whileHeld: boolean; cells: BranchCell[]}
export interface ReachedCombo extends ComboRoute {via: string | null; action: string; cells: BranchCell[]}
// For a pointing reach only: `starts`, the layers that start the mode by turning on (its link); `startVia`, by
// keycode, the layers through which the entry's routes start it (view/pointing-reach.mjs startedRoutes).
export interface ReachEntry {name: string; keys: ResolvedKey[]; behaviours: ReachedBehavior[]; combos: ReachedCombo[]; starts?: Layer[]; startVia?: Record<string, number>}
export interface ReachGroup {onKeys: ReachEntry[]; fromBranches: ReachEntry[]; fromCombos: ReachEntry[]; throughKeys: ReachEntry[]; fromBranchesBelow: ReachEntry[]; fromCombosBelow: ReachEntry[]; elsewhere: string[]}
export interface SortableReach {layer?: Layer | null; keys?: ResolvedKey[]; behaviours?: ReachedBehavior[]; combos?: ComboRoute[]}
export interface BehaviorCombo {row: BehaviorView; combos: ComboRoute[]}
export interface ComboGroupEntry extends ComboRoute {inputs: number; covered: number; held: Layer[]}
export interface ComboGroups {onKeys: ComboGroupEntry[]; throughKeys: ComboGroupEntry[]; fromBranches: never[]; fromBranchesBelow: never[]; elsewhere: ComboGroupEntry[]}
export interface ReachRecord {directKeys: ResolvedKey[]; fellKeys: ResolvedKey[]; directRows: ReachedBehavior[]; belowRows: ReachedBehavior[]; directCombos: ReachedCombo[]; belowCombos: ReachedCombo[]}
// Whether a combo fires from a key in one view, and the words for why not.
export interface ComboUse {fires: boolean; reasons: string[]}
// The combos the board marks on each key in one view, by layout index, and whether each fires from it there.
export interface ComboMarks {keys: Map<number, ComboView[]>; uses: Map<number, Map<ComboView, ComboUse>>}
export interface BehaviourGroups {here: BehaviorView[]; through: {row: BehaviorView; layer: Layer; whileHeld: boolean}[]; combos: BehaviorCombo[]; combosBelow: BehaviorCombo[]; elsewhere: BehaviorView[]}
export interface BehaviourInView {row: BehaviorView; keys: ResolvedKey[]; combos: ComboRoute[]}
// What one layer view reaches, as a Keymap tab lists it (view/tab-reach.mjs). A behaviour's row: the keys in view
// carrying it and the combos sending it, or the layer below a transparent key answers from, as its group says.
export interface BehaviourReachEntry {name: string; row: BehaviorView; keys: ResolvedKey[]; combos: ComboRoute[]; layer: Layer | null; whileHeld: boolean}
export type ComboReachEntry = ComboRoute & Partial<Pick<ComboGroupEntry, 'inputs' | 'covered' | 'held'>> & {name: string};
export interface ReachRows {macros: ReachEntry; customKeys: ReachEntry; pointing: ReachEntry; behaviours: BehaviourReachEntry; combos: ComboReachEntry}
export type ReachTab = keyof ReachRows;
export interface TabReachGroup<E> {readonly id: string; readonly empty: string; readonly entries: E[]}
export interface TabReach<E> {
    readonly groups: TabReachGroup<E>[];
    readonly count: number;
    keysFor(rowId: string | null | undefined): number[];
    groupOf(name: string | number): string | undefined;
}
// The key whose behaviour a pick on the board opens, and the layer below that answers with it, if one does.
export interface BehaviourKey {keycode: string; from: Layer | null}
// One view of the layer stack (view/layer-view.mjs): `at` on top, by its place in the stack, with `held` previewed on under it.
export interface LayerView {
    readonly model: ViewModel;
    readonly stack: Layer[];
    readonly at: number;
    readonly held: number[];
    readonly layer: Layer | undefined;
    readonly previewing: boolean;
    readonly alone: LayerView;
    under(held: readonly number[] | null | undefined): LayerView;
    readonly answers: ResolvedKey[];
    readonly shown: ResolvedKey[];
    readonly reachable: ResolvedKey[];
    answerAt(layoutIndex: number | undefined): ResolvedKey | undefined;
    shownAt(layoutIndex: number | undefined): ResolvedKey | undefined;
    readonly combos: {
        readonly groups: ComboGroups;
        readonly inView: ComboRoute[];
        readonly answers: Map<number, Position>;
        readonly marks: ComboMarks;
        shownAt(layoutIndex: number): ComboView[];
        useAt(layoutIndex: number, combo: ComboView): ComboUse;
        badgesAt(layoutIndex: number): ComboView[];
        onKey(layoutIndex: number): {position: Position | null; combos: ComboView[]};
        inputKeys(inputs: string[]): number[];
        inputShown(name: string): boolean;
    };
    readonly behaviours: {
        readonly groups: BehaviourGroups;
        readonly inView: BehaviourInView[];
        routeKeys(keycode: string, route?: BehaviorRoute | null): number[];
        keyAt(layoutIndex: number | undefined): BehaviourKey;
    };
}
// Which key a spelling is (view/key-identity.mjs): `name`, the name the profile knows it by (QK_USER_16 → PD_MODE_0);
// `canonical`, one spelling per key, however an expression is spelled; `spellings`, the names core may publish a fact
// under; `macro` and `customKey`, the name the profile lists it by when core says it is one, or ''; `behaviour`, the row
// keyed exactly by this spelling; `listening`, the row keyed by this key however either is spelled; `pointing`, the slot
// it holds or locks, and `variant`, which of the two.
export interface KeyIdentity {
    readonly spelling: string;
    readonly name: string;
    readonly canonical: string;
    readonly spellings: string[];
    readonly kind: import('../../contracts/model.js').KeyKind | undefined;
    readonly value: number | undefined;
    readonly entry: import('../../contracts/panel.js').CatalogEntry | undefined;
    readonly macro: string;
    readonly customKey: string;
    readonly behaviour: BehaviorView | undefined;
    readonly listening: BehaviorView | undefined;
    readonly pointing: PointingSlot | undefined;
    readonly variant: 'hold' | 'lock';
}
export type NamesOf = (keycode: string | undefined) => string[];
// `times`: sent once per press of that many; `first`: the row's own first tap, not the key's.
export type InheritedBranch = Branch & {times?: number; first?: boolean};
export type ImpliedBranch = {meaning: 'continues'; hold: InheritedBranch} | {meaning: 'tapsBeforeLong'; tap: InheritedBranch};

export interface KeyFace {main: string; sub: string; kind: 'none' | 'transparent' | 'disabled' | 'layer' | 'key'}
export type NamedAction =
    | {kind: 'layer'; word: 'layer'; name: string; layer: number; tags: string[]}
    | {kind: 'pointing'; word: 'pointing mode'; name: string; slot: PointingSlot; tags: string[]}
    | {kind: 'macro'; word: 'macro'; name: string; slot: PublishedModel['macros'][number] | undefined; tags: string[]};
