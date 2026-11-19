import type {PublishedModel} from '../../contracts/panel.js';
import type {PdForm, Scalar} from '../../contracts/edits.js';
import type {LightOptions} from '../view/types.js';

export interface BoardOptions {
    selected?: number;
    /** Keys held on the board (a combo previewed held on Combo feedback, the key a behaviour feedback case or a replacement flash follows on its tab): ringed as the selected key is. */
    holding?: readonly number[];
    reach?: number[];
    pdActive?: LightOptions['pdActive'] | null;
    comboActive?: LightOptions['comboActive'] | null;
    behaviourActive?: LightOptions['behaviourActive'] | null;
    replacementActive?: LightOptions['replacementActive'] | null;
    /** The keys the draft changed, and what a screen reader hears after such a key's name (view/edit-mode.mjs editWords `after`). */
    drafted?: {keys: ReadonlySet<number | undefined> | undefined; after: string} | null;
    faces?: boolean;
    /** Open the hover card on a key the pointer rests on (data-card, webview/ui/hover.mjs); Lighting's board, which is about light, opens none. */
    card?: boolean;
    /** Number each key, and the trackball, with its LED's index (Lighting, D-L77). */
    ledIndex?: boolean;
    /** The LEDs picked for the accent being edited and the colour it lights them (view/board-keys.mjs). */
    accent?: import('../view/board-keys.mjs').AccentPicks | null;
    /** Frost a transparent key, a key answered from below and a trackball lit from below (Keymap, the default); false draws them solid, as the keyboard shows their light (Lighting). */
    glass?: boolean;
    picking?: boolean;
    onKey?: (index: number) => void;
    onOpen?: (index: number) => void;
    /** A key dragged onto another: `from` on `fromLayer`, where the drag started, and `to` on the layer shown, which a held layer tab may have switched to. */
    onSwap?: (from: number, to: number, fromLayer: number) => void;
    /** Picks or takes back an LED for the accent being edited: `starting` on a press, false as a drag goes on across keys. */
    onLed?: (led: number, starting: boolean) => void;
}
export type BoardNode = HTMLElement & {justDragged?: boolean};
/** What a board that takes swaps gives each key's drag: the layer it shows, its swap, and a key's picture as that layer stores it. */
export interface BoardSwap {layer: number; onSwap: NonNullable<BoardOptions['onSwap']>; picture: (index: number) => SVGGElement | null}
/** The press that started a drag: the layer and key it came from, the board it started on, the key's picture, its resting transform, and where it was pressed, in the drawing's units. */
export interface KeyPress {layer: number; index: number; node: BoardNode; picture: SVGGElement; resting: string; at: {x: number; y: number}; pointerId: number}
/** The board on screen while a key is carried, replaced with each board drawn: its drawing and swap, and the key's own cap, hidden while it is away, on the layer it came from. */
export interface CarryingBoard {node: BoardNode; svg: SVGSVGElement; onSwap: BoardSwap['onSwap']; away: SVGGElement | null}
/** The key being dragged (webview/ui/board-drag.mjs): its press, the board it is carried over, the layer over the page its picture is drawn on and that picture, how far it has moved, the key it would land on, and the layer tab held under it with the timer that switches to that layer. */
export interface CarriedKey {
    press: KeyPress; board: CarryingBoard; overlay: SVGSVGElement; ghost: SVGGElement; shift: {x: number; y: number};
    target: SVGGElement | null; tab: {layer: number; element: HTMLElement; since: number} | null; spring: ReturnType<typeof setTimeout> | undefined;
}
export interface TrackballOptions {ledIndex: boolean; picking: boolean; clickable: boolean}
export type PresentedSlot = PublishedModel['pdModes'][number];
export interface FieldOptions {unit?: string; wide?: boolean; tip?: string; help?: string}
export type FormReaders = PdForm & Record<string, () => Scalar>;
export type LayerStack = NonNullable<PublishedModel['portable']['layers']>;
