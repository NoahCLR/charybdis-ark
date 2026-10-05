// What the Profile memory card says: the profile's bytes by area, the counted
// limits beside them, and the separate macro bank. Pure, so the words and the
// warning threshold are tested without a screen.

const AREA_WORDS = {
    behaviours: "Behaviours",
    combos: "Combos",
    names: "Names (layers, macros, custom keys)",
    lighting: "Lighting",
    pointing: "Pointing modes",
    settings: "Settings and headers",
};
const COUNT_WORDS = {
    behaviours: "Behaviours",
    behaviourSteps: "Behaviour steps",
    combos: "Combos",
    lightingGroups: "Lighting groups",
    lightingGroupRows: "Lighting group rows",
};

// From this share on, the bar is tinted: the next edit may not fit. Nothing is
// refused here; the edit itself is refused at the limit.
export const NEARLY_FULL = 0.9;

const share = (used, capacity) => (capacity > 0 ? Math.min(1, used / capacity) : 0);
const percent = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

// The card's figures, or null when the host sent none (no keyboard, or
// firmware that does not advertise its profile size).
export function profileUsageView(usage, macroBank) {
    if (!usage) return null;
    const fraction = share(usage.used, usage.capacity);
    return {
        source: usage.source === "draft" ? "Your draft" : "What the keyboard runs",
        used: usage.used,
        capacity: usage.capacity,
        free: Math.max(0, usage.capacity - usage.used),
        share: fraction,
        nearlyFull: fraction >= NEARLY_FULL,
        // An area the profile does not carry (pointing modes on older
        // firmware) is left out rather than listed as empty.
        areas: usage.areas.filter((area) => area.bytes > 0).map((area) => ({
            id: area.id, label: AREA_WORDS[area.id] || area.id, bytes: area.bytes, percent: percent(area.bytes, usage.used),
        })),
        counts: usage.counts.map((count) => ({
            id: count.id, label: COUNT_WORDS[count.id] || count.id, used: count.used, limit: count.limit, full: count.used >= count.limit,
        })),
        macros: macroBank ? {used: macroBank.stored, capacity: macroBank.capacity, share: share(macroBank.stored, macroBank.capacity)} : null,
    };
}
