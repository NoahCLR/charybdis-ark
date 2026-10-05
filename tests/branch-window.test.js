"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {parseWorktrees, sortCheckouts} = require("../tools/branch-window/checkouts");

const LIST = `worktree /work/charybdis-ark
HEAD 934388bf9a2d8498ae521fb57f774d44f1c3e116
branch refs/heads/dev

worktree /work/charybdis-ark/.git/charybdis-pins/00d06b8f307c59817718cae9c339aca50a28e89b
HEAD 00d06b8f307c59817718cae9c339aca50a28e89b
detached

worktree /work/worktrees/charybdis-ark-older
HEAD 1111111111111111111111111111111111111111
branch refs/heads/feat/older

worktree /work/worktrees/charybdis-ark-newer
HEAD 2222222222222222222222222222222222222222
branch refs/heads/fix/newer

worktree /work/worktrees/charybdis-ark-gone
HEAD 3333333333333333333333333333333333333333
branch refs/heads/fix/gone
prunable gitdir file points to non-existent location
`;

test("the branch picker lists every checkout on a branch, the main checkout first, then the newest", () => {
    const parsed = parseWorktrees(LIST);
    assert.equal(parsed.length, 5);
    assert.deepEqual(parsed[1], {path: "/work/charybdis-ark/.git/charybdis-pins/00d06b8f307c59817718cae9c339aca50a28e89b",
        head: "00d06b8f307c59817718cae9c339aca50a28e89b", branch: null, main: false, missing: false});
    const times = {"feat/older": 100, "fix/newer": 200, "fix/gone": 300, dev: 50};
    const listed = sortCheckouts(parsed.map((checkout) => ({...checkout, time: times[checkout.branch]})));
    assert.deepEqual(listed.map((checkout) => checkout.branch), ["dev", "fix/newer", "feat/older"],
        "cached pin checkouts are detached and a removed worktree is gone");
    assert.equal(listed[0].path, "/work/charybdis-ark");
    assert.equal(listed[0].main, true);
});
