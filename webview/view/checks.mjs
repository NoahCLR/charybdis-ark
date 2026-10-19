// @ts-check
// The review's checks: what the host's layer walk (core/model/layer-reach.js)
// found in the draft, arranged for reading, and whether Apply has to be
// confirmed.
//
// Each check arrives with a level (a trap, a warning or a notice), a status
// (new in the draft, already on the keyboard, or fixed by the draft), what it
// is about in words, the steps into it and where it is edited. Traps and
// warnings ask for confirmation whether the draft made them or the keyboard
// already has them.

const LEVEL_RANK = {blocker: 0, trap: 1, warning: 2, notice: 3};
export const LEVEL_WORD = {blocker: "Blocker", trap: "Trap", warning: "Warning", notice: "Notice"};
export const STATUS_WORD = {new: "new", existing: "on the keyboard", fixed: "fixed"};

/** @param {import("../../contracts/model.js").Check} a @param {import("../../contracts/model.js").Check} b */
const byLevel = (a, b) => (LEVEL_RANK[a.level] ?? 3) - (LEVEL_RANK[b.level] ?? 3);

// The groups the review lists, in reading order, leaving out empty ones. A
// group opens by default when it has something to act on: what the draft adds,
// and anything on the keyboard that is a trap.
/** @param {readonly import("../../contracts/model.js").Check[]} [checks] */
export function checkGroups(checks = []) {
    /** @param {import("../../contracts/model.js").Check["status"]} status */
    const of = (status) => checks.filter((check) => check.status === status).sort(byLevel);
    return [
        {id: "new", title: "New in this draft", items: of("new"), open: true},
        {id: "existing", title: "Already on the keyboard", items: of("existing"), open: of("existing").some((check) => ["trap", "blocker"].includes(check.level))},
        {id: "fixed", title: "Fixed by this draft", items: of("fixed"), open: false},
    ].filter((group) => group.items.length);
}

// Checks that Apply asks about. Fixed findings and notices need no decision.
/** @param {readonly import("../../contracts/model.js").Check[]} [checks] */
export const checksToConfirm = (checks = []) => checks.filter((check) => check.status !== "fixed" && ["trap", "warning"].includes(check.level));

// Point a new actionable finding at a draft group only when the source is
// unambiguous. One group explains a new finding relative to the keyboard;
// with several groups, only an unowned layer key changed at that exact key
// position is specific enough to name. A check's place normally says where
// to fix it, which need not be where the problem was introduced.
/** @param {import("../../contracts/model.js").Check} check @param {readonly import("../../contracts/model.js").ReviewChange[]} [changes] */
export function checkSourceGroup(check, changes = []) {
    if (check.status !== "new" || !["trap", "warning"].includes(check.level)) return null;
    const groups = [...new Set(changes.map((change) => change.group))];
    if (groups.length === 1 && Number.isInteger(groups[0])) return groups[0];
    if (check.kind !== "unowned" || check.place?.kind !== "key" || !Number.isInteger(check.place.layoutIndex)) return null;
    const place = check.place;
    const matches = changes.filter((change) => change.place?.kind === "key" && change.place.layer === place.layer
        && change.place.layoutIndex === place.layoutIndex);
    return matches.length === 1 && Number.isInteger(matches[0].group) ? matches[0].group : null;
}

// What the confirmation says before Apply (or Save, or a live edit) goes ahead.
/** @param {readonly import("../../contracts/model.js").Check[]} checks @param {'apply' | 'save' | 'send'} [action] */
export function confirmText(checks, action = "apply") {
    if (!checks.length) return "";
    const traps = checks.filter((check) => check.level === "trap");
    const warnings = checks.filter((check) => check.level === "warning");
    /** @param {number} number @param {string} word */
    const count = (number, word) => `${number} ${word}${number === 1 ? "" : "s"}`;
    const trapCount = traps.reduce((total, check) => total + (check.kind === "trapOverflow" ? /** @type {number} */ (check.count) : 1), 0);
    const lead = checks.length === 1 ? checks[0].title : [traps.length && count(trapCount, "trap"), warnings.length && count(warnings.length, "warning")].filter(Boolean).join(" and ");
    const ask = {apply: "Apply this profile", save: "Save these edits", send: "Send this edit"}[action];
    return traps.length ? `${lead}. A trapped layer can leave no way back to Base until you unplug the keyboard. ${ask} anyway?`
        : `${lead}. ${ask} with ${warnings.length === 1 ? "this warning" : "these warnings"}?`;
}

// The line a check's header shows beside its title: its level, and where it
// comes from unless it is new.
/** @param {import("../../contracts/model.js").Check} check */
export function checkTags(check) {
    return [LEVEL_WORD[check.level] || check.level, ...(check.status === "new" ? [] : [STATUS_WORD[check.status] || check.status])];
}

// Findings already use the behaviour's semantic keycode in their edit target.
/** @param {{draft?: {checks?: readonly import("../../contracts/model.js").Check[]}} | null | undefined} model @param {string} keycode */
export function behaviourTimingChecks(model, keycode) {
    return (model?.draft?.checks || []).filter(check => check.kind === "gestureTiming"
        && check.status !== "fixed" && check.place && "keycode" in check.place && check.place.keycode === keycode);
}
