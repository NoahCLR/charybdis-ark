// @ts-check
/** @typedef {import("../../contracts/model.js").StatusModel & {diagnostics?: unknown, apply?: unknown, postApplyRead?: unknown}} ComparedModel */
// Status belongs to the rail and commit bar. Everything else, including new
// model fields, invalidates the editor unless explicitly excluded here.
/** @param {ComparedModel} model */
const editorContent = (model) => {
    const {diagnostics, apply, postApplyRead, load, device, shell, portable, ...content} = model;
    return {...content, load: load && {...load, phase: undefined, operationId: undefined, operationBusy: undefined, progress: undefined},
        device: device && {...device, health: {...device.health, phase: undefined}},
        shell: shell && {...shell, progress: undefined},
        portable: portable && {...portable, progress: undefined}};
};

// The same content is what would serialise to the same JSON, keys in the
// same order, since a record is drawn in its order; but compared in place,
// stopping at the first difference, and an object both models share (the
// catalog's, laid under each) is the same without a look inside.
/** @param {(ComparedModel) | null | undefined} before @param {(ComparedModel) | null | undefined} after */
export function sameEditorContent(before, after) {
    return Boolean(before && after && sameJson(editorContent(before), editorContent(after)));
}

// A value as JSON writes it: undefined when it leaves it out, null for a
// number it cannot write, and what an object's toJSON says.
/** @param {unknown} value @returns {unknown} */
const asJson = (value) => {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (value === undefined || typeof value === "function" || typeof value === "symbol") return undefined;
    const toJSON = value && typeof value === "object" && /** @type {{toJSON?: unknown}} */ (value).toJSON;
    return typeof toJSON === "function" ? asJson(toJSON.call(value)) : value;
};

/** @param {unknown} left @param {unknown} right @returns {boolean} */
function sameJson(left, right) {
    if (left === right) return true;
    const a = asJson(left), b = asJson(right);
    if (a === b) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
        const other = /** @type {unknown[]} */ (b);
        if (a.length !== other.length) return false;
        for (let index = 0; index < a.length; index++) if (!sameJson(asJson(a[index]) ?? null, asJson(other[index]) ?? null)) return false;
        return true;
    }
    // The keys JSON writes, side by side in their order, each with its value.
    const x = /** @type {Record<string, unknown>} */ (a), y = /** @type {Record<string, unknown>} */ (b);
    const keys = Object.keys(x), others = Object.keys(y);
    let at = 0;
    for (const key of keys) {
        const value = asJson(x[key]);
        if (value === undefined) continue;
        while (at < others.length && asJson(y[others[at]]) === undefined) at++;
        if (others[at] !== key || !sameJson(value, y[key])) return false;
        at++;
    }
    while (at < others.length && asJson(y[others[at]]) === undefined) at++;
    return at === others.length;
}
