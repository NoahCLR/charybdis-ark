// @ts-check
"use strict";

// Every pointer speed the app offers, in one list. The Charybdis sensor
// (PMW3360) takes CPI in steps of 100 up to 12000 and rounds anything else
// down. A pointing mode's speed is stored as any 16-bit number, so a mode
// offers the sensor's whole range; a field the keyboard limits further (the
// normal and sniping ladders) offers the part of this list the keyboard
// accepts, never a list of its own.
const DPI_STEP = 100;
const DPI_MAX_CHOICE = 12000;
const POINTER_DPI = Object.freeze(Array.from({length: DPI_MAX_CHOICE / DPI_STEP}, (_, i) => (i + 1) * DPI_STEP));
// 0 is not a speed: a pointing mode stored with 0 keeps the normal pointer DPI.
const NORMAL_SPEED = Object.freeze({value: 0, label: "Normal pointer speed"});

/** @param {{accepts?: (dpi: number) => boolean, normalSpeed?: boolean}} [options] */
function dpiChoices({accepts = () => true, normalSpeed = false} = {}) {
    return [...(normalSpeed ? [NORMAL_SPEED] : []), ...POINTER_DPI.filter(accepts).map(value => ({value, label: `${value} DPI`}))];
}

module.exports = {DPI_STEP, DPI_MAX_CHOICE, POINTER_DPI, dpiChoices};
