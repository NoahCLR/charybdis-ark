// @ts-check
/** @typedef {import("../../contracts/panel.js").PublishedModel | null} Model */
import {esc} from "../lib/dom.mjs";
import {infoMark} from "./info-mark.mjs";
import {render, state} from "../store.mjs";
import {sectionPath} from "../view/settings-layout.mjs";
import {vocabulary, word} from "../view/vocabulary.mjs";

// What an editor's text types through, said beside that text: the host layout
// named as a sentence with its info mark (D-L96), and **Change in Typing
// settings →** on the right, which lands on Your computer marked for a
// moment. A layout that is not one for the computer's system is a warning
// under it. The macro editor ends with it; a text replacement has it under
// its text. `what` names what may type wrong ("macros"); `more` is what the
// info mark adds after the layout, such as how Unicode entry works.
/** @param {Model} model @param {{id: string, label: string, what: string, more: string}} words */
export function hostTyping(model, {id, label, what, more}) {
    const {os, layout, layoutFits, layoutName} = model?.macroUnicode || {mode: 0};
    const warning = layoutFits === false
        ? `Text types through ${word(vocabulary(model).hostLayouts, layout)}, chosen in ${sectionPath(model, "host")}, which is not a ${word(vocabulary(model).hostOs, os)} layout: ${what} may type the wrong characters until the layout matches the computer.` : "";
    const typed = warning ? "" : `Text types through the ${layoutName} layout chosen in ${sectionPath(model, "host")}, accented letters included; keep that layout active on the computer. `;
    return `<div class="host-typing"><span class="host-typing-says" data-host-typing><span>${layoutName ? `Text types through the <strong>${esc(layoutName)}</strong> layout` : "Text types through your computer's layout"}</span>
                ${infoMark({id, label, heading: "How text types", lead: `${typed}${more}`.trim()})}</span>
            <button type="button" class="btn tiny link" data-host-settings>Change in ${esc(vocabulary(model).settingsScreens.host)} →</button></div>
        ${warning ? `<p class="note warn" data-layout-warning>${esc(warning)}</p>` : ""}`;
}

// Change in Typing settings: the host section, marked for a moment as it lands.
/** @param {HTMLElement} root */
export function attachHostTyping(root) {
    root.querySelectorAll("[data-host-settings]").forEach(button => button.addEventListener("click", () => {
        Object.assign(state, {screen: "host", reveal: '.settings-group[data-section="host"]'});
        render();
    }));
}
