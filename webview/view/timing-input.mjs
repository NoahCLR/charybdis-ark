// Default-looking timings are placeholders, not entered values. Keep the
// stored value separately so rendering never changes inheritance or overrides.
export function timingInput(value, fallback, followsDefault = false) {
    const entered = String(value ?? "");
    const defaultValue = String(fallback ?? "");
    const matches = defaultValue !== "" && entered.trim() !== ""
        && Number.isFinite(Number(entered)) && Number(entered) === Number(defaultValue);
    return {
        value: followsDefault || matches ? "" : entered,
        placeholder: defaultValue === "" ? "ms" : `${defaultValue} · default`,
    };
}
