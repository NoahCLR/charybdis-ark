// @ts-check
"use strict";
// A union a contract declares, read from its .d.ts. contracts/ is inert and
// cannot name a runtime value, so a runtime list that must hold exactly a
// union's members is compared with the union here.
const fs = require("node:fs"), path = require("node:path");

/** @param {string} file the .d.ts under contracts/ @param {string} name @returns {(string | number)[]} */
function contractUnion(file, name) {
    const text = fs.readFileSync(path.join(__dirname, "../../contracts", file), "utf8");
    const declaration = new RegExp(`export type ${name} = ([^;]+);`).exec(text);
    if (!declaration) throw new Error(`contracts/${file} declares no ${name}`);
    return declaration[1].split("|").map((member) => member.trim()).map((member) => {
        const quoted = /^'([^']*)'$/.exec(member);
        if (quoted) return quoted[1];
        if (/^\d+$/.test(member)) return Number(member);
        throw new Error(`${name} has a member that is not a literal: ${member}`);
    });
}

module.exports = {contractUnion};
