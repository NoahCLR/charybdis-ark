// @ts-check
// Keyboard shortcuts as the interface writes them on this computer: ⌘ on a
// Mac, Ctrl elsewhere, the way the shortcuts themselves are read (either
// modifier works; view/edits.mjs historyAction). One rule, so no screen
// writes ⌘ where the person presses Ctrl.

/** @param {string} [platform] */
const onMac = (platform = globalThis.navigator?.platform || "") => /Mac|iPhone|iPad/.test(platform);

// The modifier alone, for "⌘-click" or "Ctrl-click".
/** @param {string} [platform] */
export const modifierKey = (platform) => onMac(platform) ? "⌘" : "Ctrl";

// A shortcut: ⌘Z and ⇧⌘Z on a Mac, Ctrl+Z and Ctrl+Shift+Z elsewhere.
/** @param {string} key @param {{shift?: boolean, platform?: string}} [options] */
export function shortcut(key, {shift = false, platform} = {}) {
    return onMac(platform) ? `${shift ? "⇧" : ""}⌘${key}` : `Ctrl+${shift ? "Shift+" : ""}${key}`;
}

// The same shortcut for aria-keyshortcuts: Meta+Z or Control+Z.
/** @param {string} key @param {{shift?: boolean, platform?: string}} [options] */
export function ariaShortcut(key, {shift = false, platform} = {}) {
    return `${onMac(platform) ? "Meta" : "Control"}+${shift ? "Shift+" : ""}${key}`;
}
