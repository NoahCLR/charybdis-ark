// @ts-check
// What the Profile memory card says: how much of the profile's storage is
// used, how many of each thing are set up against what the keyboard holds,
// and the separate macro bank. Pure, so the words and the warning threshold
// are tested without a screen.

// Each count in the words of the screen that edits it, and what it counts. A
// fixed set of slots is always all there; any other count is a limit the
// keyboard refuses an edit past.
/** @type {Readonly<Record<string, {label: string, what: string, fixed?: boolean}>>} */
const COUNT_WORDS = {
    behaviours: {label: "Behaviours", what: "Keys with a behaviour."},
    behaviourSteps: {label: "Behaviour tap counts", what: "Each behaviour's tap counts, up to the deepest one it sets, added up across all behaviours."},
    combos: {label: "Combos", what: "Combos on any layer."},
    lightingGroups: {label: "LED groups", what: "Named LED groups on Lighting."},
    lightingGroupRows: {label: "LED overrides", what: "LED override rows on layers, pointing modes, combo feedback and key feedback."},
    macros: {label: "Macros", what: "Macro slots with steps.", fixed: true},
    customKeys: {label: "Custom keys", what: "Custom keys with a name, a shortcut or a behaviour.", fixed: true},
    pointingModes: {label: "Pointing modes", what: "Slots that hold a pointing mode.", fixed: true},
};
/** @param {{id: string, limit: number, unavailable?: number}} count @param {number} [reserveTaps] */
const countTip = (count, reserveTaps) => {
    const words = COUNT_WORDS[count.id];
    if (!words) return "";
    // Macro slots share one macro memory: an empty slot stays open only while
    // that memory keeps room for it.
    if (count.id === "macros") return `${words.what} Every empty slot keeps room in macro memory for ${reserveTaps ?? "a few"} key taps; `
        + `when it cannot, the highest empty slots are unavailable until a macro is shortened or cleared${count.unavailable ? `. ${count.unavailable} are unavailable now, in red` : ""}.`;
    return `${words.what} ${words.fixed ? `The keyboard always has all ${count.limit}.` : `The keyboard holds up to ${count.limit} and refuses one more.`}`;
};

// From this share on, the bar is tinted: the next edit may not fit. Nothing is
// refused here; the edit itself is refused at the limit.
export const NEARLY_FULL = 0.9;

/** @param {number} used @param {number} capacity */
const share = (used, capacity) => (capacity > 0 ? Math.min(1, used / capacity) : 0);

// The card's figures, or null when the host sent none (no keyboard, or
// firmware that does not advertise its profile size).
/** @param {import("../../contracts/model.js").ProfileUsage | null | undefined} usage @param {{stored: number, capacity: number, reserveTaps?: number} | null} [macroBank] */
export function profileUsageView(usage, macroBank) {
    if (!usage) return null;
    const fraction = share(usage.used, usage.capacity);
    return {
        source: usage.source === "draft" ? "Your draft" : usage.source === "demo" ? "The demo setup" : "What the keyboard runs",
        used: usage.used,
        capacity: usage.capacity,
        free: Math.max(0, usage.capacity - usage.used),
        share: fraction,
        nearlyFull: fraction >= NEARLY_FULL,
        // A bar is the slots in use against the free ones; free slots the
        // keyboard cannot use now (unavailable) fill its end.
        counts: usage.counts.map((count) => {
            const unavailable = count.unavailable || 0;
            return {
                id: count.id, label: COUNT_WORDS[count.id]?.label || count.id, tip: countTip(count, macroBank?.reserveTaps),
                used: count.used, limit: count.limit, share: share(count.used, count.limit), unavailable, unavailableShare: share(unavailable, count.limit),
                full: count.used + unavailable >= count.limit,
                note: unavailable ? `${unavailable} unavailable` : count.used >= count.limit ? "full" : "",
            };
        }),
        macros: macroBank ? {used: macroBank.stored, capacity: macroBank.capacity, share: share(macroBank.stored, macroBank.capacity)} : null,
    };
}
