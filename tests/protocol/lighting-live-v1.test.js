"use strict";
const {test} = require("node:test"), assert = require("node:assert/strict");
const wire = require("../../core/protocol/lighting-live-v1"), golden = require("../../upstream/firmware/tests/fixtures/lighting_live_v1.json");
const cap = () => wire.decodeLiveCapability(Buffer.from(golden.capability, "hex"));
test("exact firmware Lighting Live reports, metadata and full-session control goldens", () => {
    const c = cap();assert.equal(c.factsBytes, 671);assert.equal(c.frameBytes, 174);
    const sample = wire.decodeLiveFacts(Buffer.from(golden.facts, "hex"), c, 1);assert.equal(sample.source, "master-main");assert.equal(Object.values(sample.slices).reduce((n,p)=>n+p.length,0),620);
    for (const test of golden.reports) {const q=Buffer.from(test.request,"hex"),r=Buffer.from(test.response,"hex");assert.equal(wire.decodeLiveResponse(r,q).status,r[5]);if(q[0]===8&&!q.subarray(9).some(Boolean))assert.deepEqual(wire.buildLiveRead(q[2],q[4],q.readUInt32LE(5),q[3]),q);}
    for (const test of golden.lifecycle) {
        const q=Buffer.from(test.request,"hex"),op=q[4],fields={owner:[...q.subarray(5,13)],revision:q.readUInt32LE(op===2?13:17),token:q.readUInt32LE(13),digest:q.readUInt32LE(17),frameBytes:q.readUInt16LE(21),crc32:q.readUInt32LE(23),offset:q.readUInt16LE(21),bytes:q.subarray(24,24+q[23]),renewal:q.readUInt32LE(21)};
        assert.deepEqual(wire.buildLiveControl(op,q[3],fields),q);
        for(const name of ['admission','completion'])assert.equal(wire.decodeLiveResponse(Buffer.from(test[name],'hex'),q).status,Buffer.from(test[name],'hex')[5]);
    }
    const pages=golden.reports.slice(35,38).map(c=>Buffer.from(c.response,'hex').subarray(7));assert.equal(wire.decodeLiveStatus(pages).snapshotId,1);
});
test("malformed and unknown Live capabilities are disabled without granting feature7", async()=>{
    for(const at of [0,2,3,4,5,6,7,8,9,10,12,16,17,18,20,24]){const p=Buffer.from(golden.capability,'hex');p[at]^=128;assert.throws(()=>wire.decodeLiveCapability(p));}
    const {response}=require('../fixtures/lighting-live-keyboard');
    for (const bytes of [Buffer.alloc(0),Buffer.from([2])]) {const s=await wire.readLiveCapability({request:async r=>response(r,0,bytes)});assert.equal(s.available,false);assert.ok(s.reason);}
    const s=await wire.readLiveCapability({request:async r=>response(r,2)});assert.equal(s.available,false);
});
test("strict response correlation, canonical zeros, status and TLV bounds",()=>{
    const q=Buffer.from(golden.reports[34].request,'hex'),r=Buffer.from(golden.reports[34].response,'hex');
    for(const at of [0,1,2,3,4,5,6,31]){const bad=Buffer.from(r);bad[at]^=128;assert.throws(()=>wire.decodeLiveResponse(bad,q));}
    for(const at of [0,1,2,3,4,42,44,45,46,47,48,49]){const p=Buffer.from(golden.facts,'hex');p[at]^=128;assert.throws(()=>wire.decodeLiveFacts(p,cap(),1));}
    const p=Buffer.from(golden.facts,'hex');p[48]=250;assert.throws(()=>wire.decodeLiveFacts(p,cap(),1));
    assert.throws(()=>wire.buildLiveRead(14,0,0,1));assert.throws(()=>wire.buildLiveRead(15,1,0,1));assert.throws(()=>wire.buildLiveControl(2,0));
    assert.throws(()=>wire.buildLiveControl(2,1,{owner:Array(8).fill(0)}));
});
