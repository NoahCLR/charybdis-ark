// @ts-check
// A posted model with the catalog laid back under it. The core posts what
// every model of a build starts from once, as the catalog, and each model
// without those fields, saying instead what it lays over them
// (`catalogOverlay`; core/session/panel-loop.js postedModel): an array's
// entries by index, a record's keys. Laying them back gives the model the
// core built, so every reader sees the whole of it.

/**
 * @typedef {import("../contracts/panel.js").PublishedModel} PublishedModel
 * @typedef {import("../contracts/panel.js").PanelCatalog} PanelCatalog
 */

// The whole model: a field the posted model carries is its own, any other
// the catalog's with what the model lays over it. A model with no overlay
// is whole already, as the preview posts it; one that needs a catalog with
// none to take it from is null.
/** @param {import("../contracts/panel.js").PostedModel} posted @param {PanelCatalog | null} catalog @returns {PublishedModel | null} */
export function withCatalog(posted, catalog) {
    if (!("catalogOverlay" in posted)) return posted;
    if (!catalog) return null;
    const {catalogOverlay: overlay, ...model} = posted;
    /** @type {Record<string, unknown>} */
    const whole = {...model};
    for (const field of /** @type {import("../contracts/panel.js").CatalogField[]} */ (Object.keys(catalog))) {
        if (field in model) continue;
        const base = catalog[field], laid = overlay[field];
        if (!laid) whole[field] = base;
        else if (Array.isArray(base)) {
            /** @type {unknown[]} */
            const entries = base.slice();
            for (const [index, entry] of /** @type {[number, unknown][]} */ (laid)) entries[index] = entry;
            whole[field] = entries;
        } else whole[field] = {.../** @type {object} */ (base), ...laid};
    }
    return /** @type {PublishedModel} */ (/** @type {unknown} */ (whole));
}
