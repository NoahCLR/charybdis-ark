"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const {connectedService}=require('../fixtures/connected-service');
const {lightingLiveKeyboard}=require('../fixtures/lighting-live-keyboard');
const {document}=require('../fixtures/portable-profile');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<150;i++){if(fn())return;await pause(10);}assert.fail('bounded fake-device condition not reached');}
async function setup(t){const keyboard=lightingLiveKeyboard(document());const {service,adapter}=await connectedService(t,{keyboard});await service.readKeyboardProfile();await service.lightingLive.surface(true);return{keyboard,service,adapter,live:service.lightingLive};}
test('explicit coherent reads use only live capture/read commands, preserve the profile, and pause',async t=>{
 const{keyboard:k,service,live}=await setup(t),before=JSON.stringify(service.portable.document);assert.equal(k.liveRequests.length,0);
 live.startLive();await until(()=>live.snapshot().state==='current');const v=live.snapshot();assert.equal(v.sample.id,1);assert.equal(v.sample.matrixKeys,60);assert.equal(k.liveRequests.filter(r=>r[2]===14).length,36);
 assert.ok(k.liveRequests.every(r=>r[0]===8&&[14,15].includes(r[2])||r[0]===7&&r[2]===29&&r[4]===1));assert.ok(k.liveRequests.every(r=>r[3]));
 live.pauseLive();await live.stop();assert.equal(live.snapshot().state,'stale');assert.equal(JSON.stringify(service.portable.document),before);assert.equal(k.mutations.length,0);
});
test('complete frame uploads sequentially, confirms identity, renews, and END never writes storage',async t=>{
 const{k,live}=await setup(t).then(({keyboard:k,live})=>({k,live}));const bytes=Buffer.from(Array.from({length:174},(_,i)=>i));
 live.startPreview(bytes);await until(()=>live.snapshot().preview.state==='live');assert.deepEqual(k.displayed,bytes);
 await until(()=>k.liveRequests.some(r=>r[4]===5&&r[0]===7));await until(()=>live.snapshot().preview.status.renewal===1);
 const chunks=k.liveRequests.filter(r=>r[0]===7&&r[4]===3);assert.equal(new Set(chunks.map(r=>r.readUInt16LE(21))).size,22);
 for(let i=0;i<chunks.length;i+=2)assert.deepEqual(chunks[i],chunks[i+1]);
 await live.surface(false);assert.equal(k.displayed,null);assert.equal(live.snapshot().preview.state,'off');assert.ok(k.liveRequests.some(r=>r[0]===7&&r[4]===6));assert.equal(k.mutations.length,0);
});
for(const op of [2,3,4])test(`Stop racing mailbox op ${op} drains it then END; no late re-enable`,async t=>{
 const{keyboard:k,live}=await setup(t);let stopped;
 k.before=r=>{if(r[0]===7&&r[4]===op&&!stopped)stopped=live.stopPreview('Cancelled while pending.');};
 live.startPreview(Buffer.alloc(174,77));await until(()=>stopped);await stopped;await until(()=>!live.running);assert.equal(k.displayed,null);assert.equal(live.snapshot().preview.state,'off');
 assert.ok(k.liveRequests.some(r=>r[0]===7&&r[4]===6));const count=k.liveRequests.length;await pause(30);assert.equal(k.liveRequests.length,count);
});
for(const fault of ['mixed','format','role','guard','peer','status'])test(`bounded ${fault} failure is visible and stops traffic`,async t=>{
 const{keyboard:k,live}=await setup(t);
 if(fault==='mixed')k.badPage=10;if(fault==='format')k.unknownFormat=true;if(fault==='role')k.role=0;if(fault==='guard')k.guard=2;if(fault==='peer')k.peerResult=10;if(fault==='status')k.staleStatus=20;
 if(fault==='peer')live.startPreview(Buffer.alloc(174,88));else live.startLive();
 await until(()=>live.snapshot().state==='unavailable');await until(()=>!live.running);assert.ok(live.snapshot().reason);assert.equal(live.snapshot().active,false);assert.equal(k.displayed,null);const count=k.liveRequests.length;await pause(50);assert.equal(k.liveRequests.length,count);
});
test('a remap invalidates the capture; page sample is never renamed',async t=>{
 const{keyboard:k,live}=await setup(t);k.before=r=>{if(r[2]===14&&r[4]===12)k.keymap++;};live.startLive();await until(()=>live.snapshot().state==='unavailable');assert.equal(live.snapshot().sample,null);await live.stop();
});
test('paged reads yield to preview renewals even during a 35-page transfer',async t=>{
 const{keyboard:k,live}=await setup(t);let clock=0;live.now=()=>clock;
 live.startPreview(Buffer.alloc(174,12));await until(()=>live.snapshot().preview.state==='live');
 k.before=r=>{clock+=25;k.now+=25;};live.startLive();await until(()=>live.snapshot().state==='current');
 const pages=k.liveRequests.filter(r=>r[2]===14);assert.equal(pages.length,36);const first=k.liveRequests.indexOf(pages[0]),last=k.liveRequests.indexOf(pages.at(-1));assert.ok(k.liveRequests.slice(first,last).some(r=>r[0]===7&&r[4]===5));
 assert.equal(live.snapshot().preview.state,'live');await live.stop();
});
test('context replacement cannot send an old END against a new session; no automatic restart',async t=>{
 const{keyboard:k,service,live}=await setup(t);live.startPreview(Buffer.alloc(174,22));await until(()=>live.snapshot().preview.state==='live');
 await service.disconnect();assert.equal(k.displayed,null);const n=k.liveRequests.length;await service.connect(service.devices[0].id);await service.readKeyboardProfile();assert.equal(k.liveRequests.length,n);assert.equal(live.snapshot().active,false);await live.surface(false);
});
test('capability absence refuses both controls, and zero/partial frames never post',async t=>{
 const{service}=await connectedService(t);await service.readKeyboardProfile();await service.lightingLive.surface(true);assert.throws(()=>service.lightingLive.startLive(),/does not offer/);assert.throws(()=>service.lightingLive.startPreview(Buffer.alloc(174)),/does not offer/);
 const{live,keyboard:k}=await setup(t);assert.throws(()=>live.startPreview(Buffer.alloc(173)),/complete/);assert.equal(k.liveRequests.length,0);
});
test('unknown command completion stops without a new mailbox command or unbounded retry',async t=>{
 const{live,keyboard:k}=await setup(t);k.pendingForever=true;live.startPreview(Buffer.alloc(174,12));await until(()=>!live.running&&live.snapshot().preview.state==='failed');assert.equal(k.liveRequests.length,12);assert.ok(k.liveRequests.every(r=>r.equals(k.liveRequests[0])));assert.throws(()=>live.startPreview(Buffer.alloc(174)),/Reconnect/);
});
test('pausing at the final page cannot republish a sample as current or stop a separate preview',async t=>{
 const{keyboard:k,live}=await setup(t);live.startPreview(Buffer.alloc(174,18));await until(()=>live.snapshot().preview.state==='live');
 k.before=r=>{if(r[2]===14&&r[4]===34)live.pauseLive();};live.startLive();await until(()=>!live.live&&k.liveRequests.some(r=>r[2]===14&&r[4]===34));await pause(30);assert.equal(live.snapshot().sample,null);assert.equal(live.snapshot().preview.state,'live');await live.stop();
});
test('missing feature31 cannot gain Live permission from old reserved feature7',async t=>{
 const {fakeKeyboard}=require('../fixtures/fake-keyboard'),base=fakeKeyboard({document:document()});const keyboard={...base,answer:r=>base.answer(r).map(reply=>{if(r[0]===8&&r[2]===1&&r[4]===0){reply.writeUInt32LE((reply.readUInt32LE(16)&0x7fffffff|128)>>>0,16);}return reply;})};
 const{service}=await connectedService(t,{keyboard});assert.ok(!base.requests.some(r=>r[2]===13));assert.equal(service.lightingSupport.available,false);
});
test('a host renewal deadline lapse stops without attempting late revival',async t=>{
 const{keyboard:k,live}=await setup(t);let now=0;live.now=()=>now;live.startPreview(Buffer.alloc(174,61));await until(()=>live.snapshot().preview.state==='live');now=1600;
 live.startLive();await until(()=>live.snapshot().preview.state==='failed');await until(()=>!live.running);assert.ok(!k.liveRequests.some(r=>r[0]===7&&r[4]===5));assert.equal(k.displayed,null);assert.match(live.snapshot().preview.reason,/renewed safely/);
});
test('a changed storage generation refuses interpretation before a capture or frame begins',async t=>{
 const{keyboard:k,live}=await setup(t),answer=k.answer;k.answer=r=>answer(r).map(reply=>{if(r[0]===8&&r[2]===8&&r[4]===0)reply[9]^=1;return reply;});live.startLive();await until(()=>live.snapshot().state==='unavailable');assert.equal(k.liveRequests.length,0);assert.equal(live.snapshot().sample,null);
});
