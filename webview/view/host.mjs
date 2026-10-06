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

// The build's commit on GitHub, when it is one: a build with uncommitted
// changes ("-dirty") or no commit at all has nothing there to show.
export const ARK_REPOSITORY = "https://github.com/NoahCLR/charybdis-ark";
export const commitUrl = (build) => (/^[0-9a-f]{7,40}$/.test(build?.commit || "") ? `${ARK_REPOSITORY}/commit/${build.commit}` : null);

// GitHub's mark, from GitHub's own icon set (primer/octicons, mark-github-16,
// MIT licence), on a 16 by 16 box.
export const GITHUB_MARK = "M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656";
export const githubMark = (className) => `<svg class="${className}" viewBox="0 0 16 16" aria-hidden="true"><path d="${GITHUB_MARK}"/></svg>`;

// When a recovery copy was saved, in this browser's words for it.
export function savedWhen(savedAt) {
    const date = new Date(savedAt);
    return Number.isNaN(date.getTime()) ? String(savedAt ?? "") : date.toLocaleString();
}
