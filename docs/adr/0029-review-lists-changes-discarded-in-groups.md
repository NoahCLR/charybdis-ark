# The review lists changes, discarded in the groups their edits made

Cited as D-L29.

The review lists one change per thing that differs from the keyboard, as the keyboard stores it, and a change is also what **Discard** puts back, as one more undoable step; changes one edit made together, such as a key swap, are discarded together. Layers are compared by identity, kept beside each history entry from what Rename & Reorder saved rather than inferred from names or contents, so a reorder is one change and every other change stays with its layer. This keeps the review's count, its Show and its Discard about the same things the person edited. The rules live in `core/model/profile-review.js`, `core/model/profile-revert.js` and `core/model/layer-order.js`, and the units they share in `core/model/review-units.js`.
