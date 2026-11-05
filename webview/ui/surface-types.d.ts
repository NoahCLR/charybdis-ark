import type {PublishedModel} from '../../contracts/panel.js';
import type {PdForm, Scalar} from '../../contracts/edits.js';
import type {LightOptions} from '../view/types.js';

export interface BoardOptions {
    selected?: number;
    mode?: 'light' | 'leds';
    picks?: number[];
    reach?: number[];
    pdActive?: LightOptions['pdActive'] | null;
    /** The keys the draft changed, and what a screen reader hears after such a key's name (view/edit-mode.mjs editWords `after`). */
    drafted?: {keys: ReadonlySet<number | undefined> | undefined; after: string} | null;
    faces?: boolean;
    trackball?: boolean;
    picking?: boolean;
    onKey?: (index: number) => void;
    onOpen?: (index: number) => void;
    onSwap?: (from: number, to: number) => void;
    onTrackball?: () => void;
}
export type BoardNode = HTMLElement & {justDragged?: boolean};
export interface KeyDrag {x: number; y: number; moved: boolean; target: SVGGElement | null}
export interface TrackballOptions {mode: string; trackball: boolean; clickable: boolean}
export type PresentedSlot = PublishedModel['pdModes'][number];
export interface FieldOptions {unit?: string; wide?: boolean; tip?: string}
export type FormReaders = PdForm & Record<string, () => Scalar>;
export type LayerStack = NonNullable<PublishedModel['portable']['layers']>;
