// @ts-check
"use strict";
const {deviceLabels} = require("./device-model");
const {cleanText} = require("./operation-failure");

// The keyboards a scan found, as the panel lists them. Each keeps its public
// id across scans (by the adapter's id and its serial number), and the number
// it shows while it is listed: the smallest free one when it appears, so two
// keyboards are always 1 and 2, and a replugged one takes back a number that
// came free.
class DeviceListing {
    constructor() {
        /** @type {Map<string, string>} */
        this.adapterIdsByPublicId = new Map();
        /** @type {Map<string, string>} */
        this.publicIdsByAdapterIdentity = new Map();
        this.nextPublicDeviceId = 1;
        /** @type {Map<string, number>} */
        this.numbersByPublicId = new Map();
    }

    // The keyboards of one scan, labelled; the adapter ids of the last scan
    // alone can be connected.
    /** @param {readonly import("../transport/types.js").DeviceDescriptor[]} descriptors */
    list(descriptors) {
        this.adapterIdsByPublicId.clear();
        const ids = descriptors.map((descriptor) => {
            const identity = JSON.stringify([descriptor.id, cleanText(descriptor.serialNumber)]);
            let id = this.publicIdsByAdapterIdentity.get(identity);
            if (!id) {
                id = `charybdis-${this.nextPublicDeviceId++}`;
                this.publicIdsByAdapterIdentity.set(identity, id);
            }
            this.adapterIdsByPublicId.set(id, descriptor.id);
            return id;
        });
        for (const id of [...this.numbersByPublicId.keys()]) if (!ids.includes(id)) this.numbersByPublicId.delete(id);
        for (const id of ids) {
            if (this.numbersByPublicId.has(id)) continue;
            const taken = new Set(this.numbersByPublicId.values());
            let number = 1;
            while (taken.has(number)) number += 1;
            this.numbersByPublicId.set(id, number);
        }
        const devices = descriptors.map((descriptor, index) =>
            publicDeviceDescriptor(ids[index], descriptor, /** @type {number} */ (this.numbersByPublicId.get(ids[index]))));
        const labels = deviceLabels(devices);
        return devices.map((device, index) => ({...device, label: labels[index]}));
    }

    // The adapter's id for a keyboard of the last scan.
    /** @param {string} publicDeviceId */
    adapterId(publicDeviceId) {
        return this.adapterIdsByPublicId.get(publicDeviceId);
    }
}

// A listed keyboard as the panel sees it. Its label is the product name it
// reports, told apart from another of the same name by its serial number or,
// where there is none (a browser shows none), its number (deviceLabels).
/** @param {string} id @param {import("../transport/types.js").DeviceDescriptor} descriptor @param {number} number */
function publicDeviceDescriptor(id, descriptor, number) {
    return {
        id,
        label: "",
        product: cleanText(descriptor.product) || "Charybdis 4x6",
        serialNumber: cleanText(descriptor.serialNumber),
        manufacturer: cleanText(descriptor.manufacturer),
        number,
    };
}

module.exports = {DeviceListing};
