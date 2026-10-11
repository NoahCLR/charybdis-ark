// @ts-check
"use strict";

// The Ark checkouts a window can run: every worktree of the repository that is
// on a branch, the main checkout first, then the most recently committed.
// Detached worktrees (the tools' cached pin checkouts) are not anyone's branch.

const {execFileSync} = require("node:child_process");

// `git worktree list --porcelain`: one block per worktree, blank-line separated.
/** @param {string} text @returns {import("./types.js").Checkout[]} */
function parseWorktrees(text) {
    return text.split(/\n\n+/).map((block) => {
        /** @type {Partial<Record<string, string | true>>} */
        const fields = {};
        for (const line of block.split("\n")) {
            const space = line.indexOf(" ");
            fields[space < 0 ? line : line.slice(0, space)] = space < 0 ? true : line.slice(space + 1);
        }
        return fields;
    }).filter((fields) => typeof fields.worktree === "string")
        .map((fields, index) => ({
            path: /** @type {string} */ (fields.worktree),
            head: typeof fields.HEAD === "string" ? fields.HEAD : "",
            branch: typeof fields.branch === "string" ? fields.branch.replace(/^refs\/heads\//, "") : null,
            main: index === 0,
            missing: Boolean(fields.prunable),
        }));
}

/** @template {import("./types.js").Checkout} T @param {T[]} checkouts @returns {(T & import("./types.js").RunnableCheckout)[]} */
function sortCheckouts(checkouts) {
    return checkouts.filter(/** @returns {checkout is T & import("./types.js").RunnableCheckout} */ (checkout) => Boolean(checkout.branch) && !checkout.missing)
        .sort((a, b) => Number(b.main) - Number(a.main) || (b.time || 0) - (a.time || 0));
}

/** @param {string} repository */
function listCheckouts(repository) {
    /** @param {string[]} args */
    const git = (...args) => execFileSync("git", ["-C", repository, ...args], {encoding: "utf8"});
    return sortCheckouts(parseWorktrees(git("worktree", "list", "--porcelain")).map((checkout) => {
        if (!checkout.branch || checkout.missing) return checkout;
        const [time, subject] = git("log", "-1", "--format=%ct%x00%s", checkout.head).trim().split("\0");
        return {...checkout, time: Number(time), subject};
    }));
}

module.exports = {listCheckouts, parseWorktrees, sortCheckouts};
