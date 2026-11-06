import type {PublishedModel} from '../../contracts/panel.js';
import type {PdForm, Scalar} from '../../contracts/edits.js';
import type {LightOptions} from '../view/types.js';

export interface BoardOptions {
    selected?: number;
    /** Keys held on the board (a combo previewed held on Combo feedback): ringed as the selected key is. */
    holding?: readonly number[];
    reach?: number[];
    pdActive?: LightOptions['pdActive'] | null;
    comboActive?: LightOptions['comboActive'] | null;
    /** The keys the draft changed, and what a screen reader hears after such a key's name (view/edit-mode.mjs editWords `after`). */
    drafted?: {keys: ReadonlySet<number | undefined> | undefined; after: string} | null;
    faces?: boolean;
    /** Number each key, and the trackball, with its LED's index (Lighting, D-L77). */
    ledIndex?: boolean;
    /** The LEDs picked for the accent being edited and the colour it lights them (view/board-keys.mjs). */
    accent?: import('../view/board-keys.mjs').AccentPicks | null;
    picking?: boolean;
    onKey?: (index: number) => void;
    onOpen?: (index: number) => void;
    onSwap?: (from: number, to: number) => void;
    /** Picks or takes back an LED for the accent being edited: `starting` on a press, false as a drag goes on across keys. */
    onLed?: (led: number, starting: boolean) => void;
}
export type BoardNode = HTMLElement & {justDragged?: boolean};
export interface KeyDrag {x: number; y: number; moved: boolean; target: SVGGElement | null}
export interface TrackballOptions {ledIndex: boolean; picking: boolean; clickable: boolean}
export type PresentedSlot = PublishedModel['pdModes'][number];
export interface FieldOptions {unit?: string; wide?: boolean; tip?: string}
export type FormReaders = PdForm & Record<string, () => Scalar>;
export type LayerStack = NonNullable<PublishedModel['portable']['layers']>;
