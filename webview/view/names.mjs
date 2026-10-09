// Names as the keyboard stores them (firmware D-F14): every layer, macro,
// custom-key and pointing-slot name is at most 32 bytes of UTF-8. Limits count
// bytes, not characters: an accented letter takes two, most symbols three,
// an emoji four. The host checks the rule; these let a field say where a name
// stands before it is posted.

export const NAME_MAX_BYTES = 32;

const encoder = new TextEncoder();
export const nameBytes = (text) => encoder.encode(String(text ?? "")).length;

// The counter under a name field, and whether the name is past the limit.
export function nameCount(text, max = NAME_MAX_BYTES) {
    const used = nameBytes(text);
    return {used, max, over: used > max, label: `${used} / ${max} bytes`};
}

export const NAME_TIP = `Up to ${NAME_MAX_BYTES} bytes of text: letters take one, accented letters two, most symbols three.`;
