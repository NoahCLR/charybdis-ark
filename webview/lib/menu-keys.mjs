// @ts-check
// A menu's keys, the same in every menu (the rail's keyboard menu, the Text
// replacement screen's Export): the arrows move among its items and wrap,
// Home and End go to its ends, Escape and Tab close it. True when the key was
// the menu's, which then goes no further.
/** @param {KeyboardEvent} event @param {readonly HTMLElement[]} items the menu's items, in order @param {() => void} close */
export function menuKey(event, items, close) {
    const at = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    const step = /** @type {Record<string, number>} */ ({ArrowDown: 1, ArrowUp: -1})[event.key];
    if (step) items[(at + step + items.length) % items.length]?.focus();
    else if (event.key === "Home") items[0]?.focus();
    else if (event.key === "End") items[items.length - 1]?.focus();
    else if (event.key === "Escape" || event.key === "Tab") close();
    else return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
}
