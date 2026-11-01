import type {WebHid} from '../core/transport/types.js';
import type {RecoveryCopy, BuildInfo} from '../contracts/model.js';
export interface StoredRecovery extends RecoveryCopy {text: string}
/** The page's sleep worker (web/sleep.mjs): it answers each wait, and, when it fails, its error ends the waits on the page's timer. None when it could not start (web/page.mjs). */
export type SleepWorker = Pick<Worker, 'onmessage' | 'postMessage'> & Partial<Pick<Worker, 'onerror' | 'onmessageerror'>>;
export interface WebEnvironment {
    hid?: WebHid;
    locks?: LockManager;
    storage?: Pick<StorageManager, 'persist'>;
    indexedDB?: IDBFactory;
    localStorage?: Pick<Storage, 'getItem' | 'setItem'>;
    matchMedia?: (query: string) => Pick<MediaQueryList, 'matches'>;
    document: Document;
    window: Window & Pick<typeof globalThis, 'URL' | 'Blob'>;
    worker?: SleepWorker;
    build: BuildInfo;
}
declare global {
    const __ARK_VERSION__: string;
    const __ARK_COMMIT__: string;
    const __ARK_SLEEP_WORKER__: string;
    const __ARK_PANEL__: string;
    interface Navigator {hid?: WebHid}
    interface Window {acquirePanelApi: () => ReturnType<typeof import('./panel-channel.mjs').connectPanel>['api']}
}
