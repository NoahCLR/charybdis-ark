# The draft shows itself where it is edited

Cited as D-L30.

Every editor marks what the draft changed with the draft's dot, and the marks come from the review's own changes (`draftMarks` in `webview/view/review.mjs`), so the editors and the review never disagree. **Discard all** is one more undoable draft step rather than a fresh read, unless the draft is stale, bound to another keyboard or a recovery, and **Draft history** shows each step against the step before it. The person can see and take back any change where they made it, without opening the review.
