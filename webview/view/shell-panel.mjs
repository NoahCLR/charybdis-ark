// @ts-check
// What the panel's shell offers and says, as the model carries it
// (`model.shell`, core/session/panel-session.js): whether Choose keyboard is
// offered, the theme, the recovery copies, the build, and the page's words.
// Core owns the defaults; before the first model the panel offers no picker,
// since the tab may turn out to be blocked.

/** @type {import("../../contracts/model.js").ShellPanel} */
const BEFORE_FIRST_MODEL = {chooseKeyboard: false, blocked: null, theme: "dark", recoveries: [], build: null, progress: null, words: {}};

/** @param {{shell?: Partial<import("../../contracts/model.js").ShellPanel>} | null | undefined} model */
export const shellOf = (model) => ({...BEFORE_FIRST_MODEL, ...model?.shell, words: {...model?.shell?.words}});

// The messages these controls post. They are for the shell, not the draft.
/** @returns {{type: "chooseKeyboard"}} */
export const chooseKeyboard = () => ({type: "chooseKeyboard"});
/** @returns {{type: "forgetKeyboard"}} */
export const forgetKeyboard = () => ({type: "forgetKeyboard"});
/** @param {'light' | 'dark'} theme @returns {{type: 'setTheme', theme: 'light' | 'dark'}} */
export const setTheme = (theme) => ({type: "setTheme", theme});
/** @param {string | number} id @returns {{type: 'downloadRecovery', id: string | number}} */
export const downloadRecovery = (id) => ({type: "downloadRecovery", id});

// The theme the toggle switches to, and what it says it does.
/** @param {string | null | undefined} theme */
export const otherTheme = (theme) => (theme === "light" ? "dark" : "light");
/** @param {string | null | undefined} theme */
export const themeLabel = (theme) => `Switch to ${otherTheme(theme)} theme`;

// "Ark 2026.10.5+1 · 47eae26".
/** @param {import("../../contracts/model.js").BuildInfo | null | undefined} build */
export const buildLine = (build) => (build ? `Ark ${build.version}${build.commit ? ` · ${build.commit}` : ""}` : "");

// The build's commit on GitHub, when it is one: a build with uncommitted
// changes ("-dirty") or no commit at all has nothing there to show.
export const ARK_REPOSITORY = "https://github.com/NoahCLR/charybdis-ark";
/** @param {import("../../contracts/model.js").BuildInfo | null | undefined} build */
export const commitUrl = (build) => (/^[0-9a-f]{7,40}$/.test(build?.commit || "") ? `${ARK_REPOSITORY}/commit/${build?.commit}` : null);

// GitHub's mark, from GitHub's own icon set (primer/octicons, mark-github-16,
// MIT licence), on a 16 by 16 box.
export const GITHUB_MARK = "M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656";
/** @param {string} className */
export const githubMark = (className) => `<svg class="${className}" viewBox="0 0 16 16" aria-hidden="true"><path d="${GITHUB_MARK}"/></svg>`;

// When a recovery copy was saved, in this browser's words for it.
/** @param {string | number} savedAt */
export function savedWhen(savedAt) {
    const date = new Date(savedAt);
    return Number.isNaN(date.getTime()) ? String(savedAt ?? "") : date.toLocaleString("en-GB", {day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"});
}

// What made a recovery copy, as its title says it. Both keyboard saves read
// as Save (D-L72), so the title tells them apart by what was saved: a whole
// draft (the keyboard's Apply) or the live modes' unsaved edits.
/** @type {Readonly<Record<import("../../contracts/model.js").RecoveryCause, string>>} */
const MADE_BY = Object.freeze({apply: "Before saving a draft", restore: "Before restoring a backup", save: "Before saving live edits", restart: "Before Restart", "leave-live": "Before leaving Live edit"});

// A recovery copy named by what made it, the keyboard it came from and when.
// A copy stored before those were recorded is named only by when, rather
// than by a guessed cause or the keyboard selected now.
/** @param {Pick<import("../../contracts/model.js").RecoveryCopy, "cause" | "keyboard" | "savedAt">} copy */
export function copyTitle({cause, keyboard, savedAt}) {
    const made = cause && Object.hasOwn(MADE_BY, cause) ? MADE_BY[cause] : "";
    return (made ? [made, keyboard, savedWhen(savedAt)] : ["Recovery copy", savedWhen(savedAt)]).filter(Boolean).join(" · ");
}

/** @param {string | number} id @returns {{type: 'useRecovery', id: string | number}} */
export const useRecovery = (id) => ({type: "useRecovery", id});
/** @param {string | number} id @returns {{type: 'deleteRecovery', id: string | number}} */
export const deleteRecovery = (id) => ({type: "deleteRecovery", id});
