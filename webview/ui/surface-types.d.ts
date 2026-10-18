import type {PublishedModel} from '../../contracts/panel.js';
import type {PdForm, Scalar} from '../../contracts/edits.js';
import type {LightOptions} from '../view/types.js';

export interface BoardOptions {
    selected?: number;
    mode?: 'light' | 'leds';
    picks?: number[];
    reach?: number[];
    pdActive?: LightOptions['pdActive'] | null;
    drafted?: ReadonlySet<number | undefined> | null;
    faces?: boolean;
    dots?: boolean;
    badges?: boolean;
    trackball?: boolean;
    held?: number[];
    picking?: boolean;
    onKey?: (index: number) => void;
    onOpen?: (index: number) => void;
    onSwap?: (from: number, to: number) => void;
    onTrackball?: () => void;
    /** Drawn in the board's empty centre, between the halves and above the thumbs (Keys' layer plate). */
    centre?: HTMLElement | null;
}
export type BoardNode = HTMLElement & {justDragged?: boolean};
export interface KeyDrag {x: number; y: number; moved: boolean; target: SVGGElement | null}
export interface TrackballOptions {mode: string; pdActive: LightOptions['pdActive'] | null; held: number[]; trackball: boolean; clickable: boolean}
export type PresentedSlot = PublishedModel['pdModes'][number];
export interface FieldOptions {unit?: string; wide?: boolean; tip?: string; hint?: string}
export interface SelectOptions {inline?: boolean; tip?: string; hint?: string; onChange?: (event: Event) => void}
export interface ShortcutOptions {name?: string; klass?: string; labelHtml?: string}
export type FormReaders = PdForm & Record<string, () => Scalar>;
export type LayerStack = NonNullable<PublishedModel['portable']['layers']>;
