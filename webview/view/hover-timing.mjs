// @ts-check
// When the board's hover card opens. The first card waits, so sweeping the
// pointer across a cold board does not flash a card on every key it crosses;
// once one is open, moving to another key swaps it at once; and for a moment
// after the card closes (leaving the board, a redraw) the board stays warm,
// so coming straight back is instant too.

export const HOVER_DELAY_MS = 300;
export const HOVER_COOL_MS = 300;

/** @typedef {{open: boolean, warmUntil: number}} HoverClock */

/** @returns {HoverClock} */
export const coldHover = () => ({open: false, warmUntil: 0});

// How long to wait before showing a card at `now`.
/** @param {HoverClock} clock @param {number} now */
export const hoverWait = (clock, now) => (clock.open || now < clock.warmUntil ? 0 : HOVER_DELAY_MS);

// The clock once a card is shown.
/** @param {HoverClock} clock @returns {HoverClock} */
export const hoverShown = (clock) => ({...clock, open: true});

// The clock once the card closes at `now`: warm for the cool-down if it was open.
/** @param {HoverClock} clock @param {number} now @returns {HoverClock} */
export const hoverClosed = (clock, now) => (clock.open ? {open: false, warmUntil: now + HOVER_COOL_MS} : clock);
