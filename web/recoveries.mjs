// @ts-check
// Recovery copies in this browser's storage (IndexedDB), where the extension
// keeps them as files. Apply and Import save one before they write anything to
// the keyboard; if saving fails they write nothing. They stay until the site's
// data is cleared, which deletes them too.

const DATABASE = "charybdis-ark";
const STORE = "recoveries";

/** @template T @param {IDBRequest<T>} operation @returns {Promise<T>} */
const request = (operation) => new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error);
});

// The file name a copy downloads as, the extension's name for it.
/** @param {{format?: string} | null | undefined} document @param {Date} savedAt */
export function recoveryName(document, savedAt) {
    const suffix = document?.format === "charybdis-profile" ? ".charybdis.json" : ".diagnostic.json";
    return "recovery-" + savedAt.toISOString().replace(/[:.]/g, "-") + suffix;
}

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
        // Resolves to the copy's name once it is stored.
        /** @param {Parameters<NonNullable<import("../core/session/types.js").LoopHost["saveRecovery"]>>[0]} document */
        async save(document, now = new Date()) {
            const name = recoveryName(document, now);
            const text = JSON.stringify(document, null, 2) + "\n";
            // Stored means committed, not just accepted by the transaction.
            const transaction = (await database()).transaction(STORE, "readwrite");
            /** @type {Promise<void>} */
            const committed = new Promise((resolve, reject) => {
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
                transaction.onabort = () => reject(transaction.error || new Error("The recovery copy was not stored."));
            });
            transaction.objectStore(STORE).add({name, savedAt: now.toISOString(), text});
            await committed;
            return name;
        },
        // Every copy, newest first, without its text.
        async list() {
            const all = await request(/** @type {IDBRequest<import("./types.js").StoredRecovery[]>} */ ((await store()).getAll()));
            return all.map(({id, name, savedAt}) => ({id, name, savedAt})).reverse();
        },
        /** @param {number | string} id */
        async get(id) {
            return request(/** @type {IDBRequest<import("./types.js").StoredRecovery | undefined>} */ ((await store()).get(id)));
        },
    };
}
