// @ts-check
// A number field shows only what it could store.
//
// Every number the keyboard stores is a whole number, so a text field marked
// inputmode="numeric" keeps only digits, and one marked inputmode="decimal" (a
// duration in seconds or minutes) also keeps its first point. Anything else
// typed, pasted or dropped into it never appears. A type="number" field cannot
// be read back while its text is not a number, so what it would refuse is
// stopped before it is inserted instead. The edit still validates the range.

const TEXT_FIELDS = 'input[inputmode="numeric"], input[inputmode="decimal"]';

/** @param {string} value @param {boolean} decimal @returns {string} */
export function numberText(value, decimal) {
    let point = !decimal;
    let kept = "";
    for (const character of value) {
        if (character >= "0" && character <= "9") kept += character;
        else if (character === "." && !point) { kept += character; point = true; }
    }
    return kept;
}

/** @param {HTMLInputElement} input */
function keepNumberText(input) {
    const decimal = input.inputMode === "decimal";
    const kept = numberText(input.value, decimal);
    if (kept === input.value) return;
    const at = (/** @type {number | null} */ caret) => caret === null ? null : numberText(input.value.slice(0, caret), decimal).length;
    const [start, end] = [at(input.selectionStart), at(input.selectionEnd)];
    input.value = kept;
    if (start !== null) input.setSelectionRange(start, end);
}

// Capturing on the root runs before the field's own input listeners, so they
// only ever see the kept text.
/** @param {HTMLElement} root */
export function mountNumberEntry(root) {
    root.addEventListener("beforeinput", (event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement && target.type === "number" && event.data && numberText(event.data, false) !== event.data) event.preventDefault();
    }, true);
    /** @param {Event} event */
    const keep = (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || !target.matches(TEXT_FIELDS)) return;
        // Rewriting the text mid-composition would break the input method;
        // what it composed is kept or dropped once it ends.
        if (event instanceof InputEvent && event.isComposing) return;
        keepNumberText(target);
    };
    root.addEventListener("input", keep, true);
    root.addEventListener("compositionend", keep, true);
}
