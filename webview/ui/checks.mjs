// @ts-check
// The Checks section at the top of the review (view/checks.mjs): profiles
// that cannot apply, actions that cannot run, and layer reachability.

import {DISCLOSURE, esc} from "../lib/dom.mjs";
import {checkGroups, checkTags} from "../view/checks.mjs";

// One check: its level and title, what it means, the steps into it, and the
// way out. `show(check)` returns the Show button for one that has a place.
/** @param {import("../../contracts/model.js").Check} check @param {(check: import("../../contracts/model.js").Check) => string} show @param {(check: import("../../contracts/model.js").Check) => string} source @param {boolean} demo */
function checkItem(check, show, source, demo) {
    const path = check.path?.length
        ? `<ol class="ck-path">${check.path.map((step) => `<li>${esc(step)}</li>`).join("")}</ol>` : "";
    return `<div class="ck-item ${esc(check.level)}${check.status === "fixed" ? " fixed" : ""}">
        <div class="ck-h"><span class="ck-level">${checkTags(check, {demo}).map((tag, index) => `<span>${index === 0 && ["trap", "blocker"].includes(check.level) ? '<i class="dot err"></i>' : ""}${esc(tag)}</span>`).join("")}</span>
            <span class="ck-t">${esc(check.title)}</span><span class="ck-act">${show(check)}</span></div>
        ${check.status === "fixed" ? "" : `<div class="ck-b"><p>${esc(check.detail)}</p>${path}<p class="ck-fix">${esc(check.fix)}</p>${source(check)}</div>`}
    </div>`;
}

// The section, or nothing when the walk found nothing. Saving is what makes
// the edits permanent, in every edit mode (D-L72).
/** @param {readonly import("../../contracts/model.js").Check[]} checks @param {(check: import("../../contracts/model.js").Check) => string} show @param {(check: import("../../contracts/model.js").Check) => string} [source] @param {boolean} [demo] in the demo, what the draft started from is the demo setup */
export function checksSection(checks, show, source = () => "", demo = false) {
    const groups = checkGroups(checks, {demo});
    if (!groups.length) return "";
    return `<section class="rv-sect ck">
        <div class="sect-h"><h4>Checks</h4><span class="note">what can run, what layers you can reach, and what must be fixed before saving</span></div>
        ${groups.map((group) => `<details class="ck-group" ${group.open ? "open" : ""}>
            <summary>${DISCLOSURE}${esc(group.title)} <span class="tag">${group.items.length}</span></summary>
            ${group.items.map((check) => checkItem(check, show, source, demo)).join("")}</details>`).join("")}
    </section>`;
}
