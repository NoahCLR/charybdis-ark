"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {DeviceListing} = require("../../core/session/device-listing");

test("a keyboard keeps its public id across scans, and only the last scan's can be connected", () => {
    const listing = new DeviceListing();
    const [first] = listing.list([{id: "hid-1", product: " Charybdis ", serialNumber: " E4 "}]);
    assert.deepEqual(first, {id: "charybdis-1", label: "Charybdis", product: "Charybdis", serialNumber: "E4", manufacturer: "", number: 1});
    assert.equal(listing.adapterId("charybdis-1"), "hid-1");
    const [unnamed] = listing.list([{id: "hid-2"}]);
    assert.equal(unnamed.id, "charybdis-2");
    assert.equal(unnamed.product, "Charybdis 4x6", "a keyboard that names no product");
    assert.equal(listing.adapterId("charybdis-1"), undefined, "gone from the last scan");
    assert.equal(listing.list([{id: "hid-1", serialNumber: "E4"}])[0].id, "charybdis-1", "the same device and serial number, the same id");
});

// The labels as the service publishes them, after each scan.
test("keyboards without a serial number are numbered by their id, the number first", async () => {
    const {ProfileDeviceService: Service} = require("../../core/session/profile-device-service");
    const {FakeDeviceAdapter: Fake} = require("../../core/transport/fake-device-adapter");
    const one = new Service({adapter: new Fake({devices: [{id: "a", product: "Charybdis (4x6) Splinky"}]})});
    await one.enumerate();
    assert.deepEqual(one.snapshot().devices.map((device) => device.label), ["Charybdis (4x6) Splinky"], "alone, no number");
    const two = new Service({adapter: new Fake({devices: [{id: "a", product: "Charybdis (4x6) Splinky"}, {id: "b", product: "Charybdis (4x6) Splinky"}]})});
    await two.enumerate();
    assert.deepEqual(two.snapshot().devices.map((device) => device.label), ["Keyboard 1 · Charybdis (4x6) Splinky", "Keyboard 2 · Charybdis (4x6) Splinky"]);
    const serial = new Service({adapter: new Fake({devices: [{id: "a", product: "Charybdis", serialNumber: "E4"}, {id: "b", product: "Charybdis", serialNumber: "DE"}]})});
    await serial.enumerate();
    assert.deepEqual(serial.snapshot().devices.map((device) => device.label), ["Charybdis · E4", "Charybdis · DE"]);
    const alone = new Service({adapter: new Fake({devices: [{id: "a", product: "Charybdis", serialNumber: "E4"}]})});
    await alone.enumerate();
    assert.deepEqual(alone.snapshot().devices.map((device) => device.label), ["Charybdis"], "a serial number only tells two of the same name apart");
});

test("keyboards with names of their own are listed by them, numbered only where two read alike", async () => {
    const {ProfileDeviceService: Service} = require("../../core/session/profile-device-service");
    const {FakeDeviceAdapter: Fake} = require("../../core/transport/fake-device-adapter");
    const adapter = new Fake({devices: [{id: "a", product: "Work board"}, {id: "b", product: "Charybdis (4x6) Splinky"}, {id: "c", product: "Charybdis (4x6) Splinky"}]});
    const service = new Service({adapter});
    await service.enumerate();
    assert.deepEqual(service.snapshot().devices.map((device) => device.label), ["Work board", "Keyboard 2 · Charybdis (4x6) Splinky", "Keyboard 3 · Charybdis (4x6) Splinky"]);
    // One reconnects under a new name: nothing reads alike any more.
    adapter.devices = [{id: "a", product: "Work board"}, {id: "b", product: "Charybdis (4x6) Splinky"}, {id: "d", product: "Home board"}];
    await service.enumerate();
    assert.deepEqual(service.snapshot().devices.map((device) => device.label), ["Work board", "Charybdis (4x6) Splinky", "Home board"]);
});

test("a replugged keyboard takes back the number that came free, so two keyboards are always 1 and 2", async () => {
    const {ProfileDeviceService: Service} = require("../../core/session/profile-device-service");
    const {FakeDeviceAdapter: Fake} = require("../../core/transport/fake-device-adapter");
    const adapter = new Fake({devices: [{id: "a", product: "Charybdis"}, {id: "b", product: "Charybdis"}]});
    const service = new Service({adapter});
    const labels = async () => {await service.enumerate(); return service.snapshot().devices.map((device) => device.label);};
    assert.deepEqual(await labels(), ["Keyboard 1 · Charybdis", "Keyboard 2 · Charybdis"]);
    adapter.devices = [{id: "b", product: "Charybdis"}];
    assert.deepEqual(await labels(), ["Charybdis"], "alone, no number");
    // Replugged, a keyboard is a new device to the browser.
    adapter.devices = [{id: "b", product: "Charybdis"}, {id: "c", product: "Charybdis"}];
    assert.deepEqual(await labels(), ["Keyboard 2 · Charybdis", "Keyboard 1 · Charybdis"], "the one still listed keeps its number");
});
