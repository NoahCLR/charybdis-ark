"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const {openPanelLoop}=require('../../core/session/panel-loop');
const {lightingLiveKeyboard}=require('../fixtures/lighting-live-keyboard');
const {fakeKeyboardAdapter}=require('../fixtures/fake-keyboard');
const {document}=require('../fixtures/portable-profile');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await pause(10);}assert.fail('fake panel did not settle');}
async function panel(t){const keyboard=lightingLiveKeyboard(document()),models=[];const loop=openPanelLoop({post:m=>{if(m.type==='model')models.push(m.model);},saveRecovery:async()=>{throw Error('no recovery write permitted');},chooseProfile:async()=>undefined,saveExport:async()=>undefined},{adapter:fakeKeyboardAdapter({keyboard})});t.after(()=>loop.close());await loop.handleMessage({type:'ready'});const identity=()=>({draftId:loop.session.draft.id,draftRevision:loop.session.draft.revision});await loop.handleMessage({type:'lightingSurface',visible:true});return{loop,keyboard,models,identity};}
test('real guarded panel loop keeps Live and Try out of draft/history/review/export bytes',async t=>{
 const{loop,keyboard:k,models,identity}=await panel(t);const original=loop.session.draft.current.document,revision=loop.session.draft.revision;
 await loop.handleMessage({type:'startLightingLive',...identity()});await until(()=>models.at(-1).lightingLive?.state==='current');
 await loop.handleMessage({type:'tryLightingFrame',frame:Array(174).fill(42),...identity()});await until(()=>models.at(-1).lightingLive?.preview.state==='live');
 assert.equal(loop.session.draft.revision,revision);assert.deepEqual(loop.session.draft.current.document,original);assert.equal(loop.session.draft.dirty,false);assert.equal(k.mutations.length,0);
 await loop.handleMessage({type:'stopLightingFrame',...identity()});assert.equal(k.displayed,null);
 await loop.handleMessage({type:'pauseLightingLive',...identity()});assert.equal(models.at(-1).lightingLive.active,false);
 await loop.handleMessage({type:'reviewProfileDraft',...identity()});assert.equal(loop.session.draft.revision,revision);assert.deepEqual(loop.session.draft.current.document,original);
});
test('wrong draft revision, malformed frame, and hidden surface refuse output',async t=>{
 const{loop,keyboard:k,models,identity}=await panel(t);
 for(const request of [{type:'tryLightingFrame',frame:Array(174).fill(9),...identity(),draftRevision:999},{type:'tryLightingFrame',frame:Array(174).fill(256),...identity()},{type:'tryLightingFrame',frame:[1],...identity()}]){await loop.handleMessage(request);assert.equal(k.liveRequests.length,0);}
 await loop.setLightingVisible(false);await loop.handleMessage({type:'tryLightingFrame',frame:Array(174).fill(9),...identity()});assert.equal(k.liveRequests.length,0);assert.equal(models.at(-1).lightingLive.preview.state,'off');
});
for(const exit of ['screen','hide','close'])test(`panel ${exit} during pending PUBLISH stops before late response can re-enable`,async t=>{
 const{loop,keyboard:k,identity}=await panel(t);let exitWork;
 k.before=r=>{if(!exitWork&&r[0]===7&&r[4]===4)exitWork=exit==='screen'?loop.handleMessage({type:'lightingSurface',visible:false}):exit==='hide'?loop.setLightingVisible(false):loop.close();};
 await loop.handleMessage({type:'tryLightingFrame',frame:Array(174).fill(19),...identity()});await until(()=>exitWork);await exitWork;assert.equal(k.displayed,null);assert.ok(k.liveRequests.some(r=>r[0]===7&&r[4]===6));assert.equal(k.mutations.length,0);
});
