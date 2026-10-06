// What the panel's host offers and says, as the model carries it
// (`model.host`, core/session/panel-session.js). The panel never asks which
// host it runs in: Choose keyboard, the theme toggle and the recovery copies
// appear where the host says it has them, in the host's own words.

const NONE = {chooseKeyboard: false, blocked: null, theme: null, recoveries: null, build: null, progress: null, words: {}};

export const hostOf = (model) => ({...NONE, ...model?.host, words: {...model?.host?.words}});

// The messages these controls post. They are for the host, not the draft.
export const chooseKeyboard = () => ({type: "chooseKeyboard"});
export const setTheme = (theme) => ({type: "setTheme", theme});
export const downloadRecovery = (id) => ({type: "downloadRecovery", id});

// The theme the toggle switches to, and what it says it does.
export const otherTheme = (theme) => (theme === "light" ? "dark" : "light");
export const themeLabel = (theme) => `Switch to ${otherTheme(theme)} theme`;

// "Ark 2026.10.5+1 · 47eae26".
export const buildLine = (build) => (build ? `Ark ${build.version} · ${build.commit}` : "");

// When a recovery copy was saved, in this browser's words for it.
export function savedWhen(savedAt) {
    const date = new Date(savedAt);
    return Number.isNaN(date.getTime()) ? String(savedAt ?? "") : date.toLocaleString();
}
