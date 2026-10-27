import type {WebHid} from '../core/transport/types.js';
import type {RecoveryCopy, BuildInfo} from '../contracts/model.js';
export interface StoredRecovery extends RecoveryCopy {text: string}
export interface WebEnvironment {
    hid?: WebHid;
    locks?: LockManager;
    storage?: Pick<StorageManager, 'persist'>;
    indexedDB?: IDBFactory;
    localStorage?: Pick<Storage, 'getItem' | 'setItem'>;
    matchMedia?: (query: string) => Pick<MediaQueryList, 'matches'>;
    document: Document;
    window: Window & Pick<typeof globalThis, 'URL' | 'Blob'>;
    worker?: Pick<Worker, 'onmessage' | 'postMessage'>;
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
