// Compile-time checks only; no extension or window is opened.
import {activate} from '../../tools/branch-window/extension.js';
import {parseWorktrees, sortCheckouts} from '../../tools/branch-window/checkouts.js';
import type {ExtensionContext} from 'vscode';
function branchTool(context: ExtensionContext) {
    activate(context);
    const checkouts = sortCheckouts(parseWorktrees('worktree /ark\nHEAD abc\nbranch refs/heads/dev\n'));
    const branches: string[] = checkouts.map(checkout => checkout.branch);
    // @ts-expect-error Activation needs a complete extension context.
    activate({subscriptions: []});
    // @ts-expect-error Git output is text, not a list of checkouts.
    parseWorktrees([]);
    // @ts-expect-error Checkout sorting needs branch and worktree facts.
    sortCheckouts([{path: '/ark', time: 1}]);
    void branches;
}
void branchTool;
