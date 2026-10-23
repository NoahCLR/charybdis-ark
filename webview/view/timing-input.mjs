// @ts-check
// Default-looking timings are placeholders, not entered values. Keep the
// stored value separately so rendering never changes inheritance or overrides.
// The placeholder names the setting the default comes from, in the
// vocabulary's timingSources words ("200 · dual-role").
/** @param {unknown} value @param {unknown} fallback @param {boolean} [followsDefault] @param {string} [source] */
export function timingInput(value, fallback, followsDefault = false, source = "") {
    const entered = String(value ?? "");
    const defaultValue = String(fallback ?? "");
    const matches = defaultValue !== "" && entered.trim() !== ""
        && Number.isFinite(Number(entered)) && Number(entered) === Number(defaultValue);
    return {
        value: followsDefault || matches ? "" : entered,
        placeholder: defaultValue === "" ? "ms" : `${defaultValue} · ${source || "default"}`,
    };
}
