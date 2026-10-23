import type {PanelRequest} from '../contracts/messages.js';
export interface PanelApi {
    postMessage(message: PanelRequest): void;
    getState(): unknown;
    setState(next: unknown): unknown;
}
declare global {function acquireVsCodeApi(): PanelApi}
