// @ts-check
// Recovery copies in this browser's storage (IndexedDB), where the extension
// keeps them as files. Apply, Import, Save and a restart save one before they
// write anything to the keyboard; if saving fails they write nothing. Each
// records what made it and the keyboard it came from; copies stored before
// that was recorded have neither. They stay until the site's data is
// cleared, which deletes them too.

import {recoveryFileName} from "./core.mjs";

const DATABASE = "charybdis-ark";
const STORE = "recoveries";

/** @template T @param {IDBRequest<T>} operation @returns {Promise<T>} */
const request = (operation) => new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error);
});

// A stored copy as the panel lists it, without its text; an older copy lists
// without the cause and keyboard it never recorded.
/** @param {import("./types.js").StoredRecovery} copy @returns {import("../contracts/model.js").RecoveryCopy} */
export const listed = ({id, name, savedAt, cause, keyboard}) => ({id, name, savedAt, ...(cause ? {cause} : {}), ...(typeof keyboard === "string" ? {keyboard} : {})});

/** @param {IDBFactory | undefined} indexedDB */
export function openRecoveries(indexedDB) {
    /** @type {Promise<IDBDatabase> | undefined} */
    let opened;
    const database = () => opened ||= new Promise((resolve, reject) => {
        if (!indexedDB) {
            reject(new Error("This browser cannot store recovery copies."));
            return;
        }
        const open = indexedDB.open(DATABASE, 1);
        open.onupgradeneeded = () => open.result.createObjectStore(STORE, {keyPath: "id", autoIncrement: true});
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
    });
    const store = async () => (await database()).transaction(STORE, "readonly").objectStore(STORE);
    return {
        // Resolves to the copy's name once it is stored: the file name it
        // downloads as, the extension's name for it.
        /** @param {Parameters<import("../core/session/types.js").ShellSaveRecovery>[0]} document @param {import("../core/session/types.js").RecoveryAbout} about */
        async save(document, {cause, keyboard}, now = new Date()) {
            const name = recoveryFileName(document, {cause, keyboard}, now);
            const text = JSON.stringify(document, null, 2) + "\n";
            // Stored means committed, not just accepted by the transaction.
            const transaction = (await database()).transaction(STORE, "readwrite");
            /** @type {Promise<void>} */
            const committed = new Promise((resolve, reject) => {
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
                transaction.onabort = () => reject(transaction.error || new Error("The recovery copy was not stored."));
            });
            transaction.objectStore(STORE).add({name, savedAt: now.toISOString(), cause, keyboard, text});
            await committed;
            return name;
        },
        // Every copy, newest first, without its text.
        async list() {
            const all = await request(/** @type {IDBRequest<import("./types.js").StoredRecovery[]>} */ ((await store()).getAll()));
            return all.map(listed).reverse();
        },
        /** @param {number | string} id */
        async delete(id) {
            const transaction = (await database()).transaction(STORE, "readwrite");
            /** @type {Promise<void>} */
            const done = new Promise((resolve, reject) => {
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
                transaction.onabort = () => reject(transaction.error || new Error("The copy was not deleted."));
            });
            transaction.objectStore(STORE).delete(id);
            await done;
        },
        /** @param {number | string} id */
        async get(id) {
            return request(/** @type {IDBRequest<import("./types.js").StoredRecovery | undefined>} */ ((await store()).get(id)));
        },
    };
}
