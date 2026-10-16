import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {lightingGesture} from '../../webview/view/lighting-gesture.mjs';
const require=createRequire(import.meta.url),{buildSnapshotModel}=require('../../core/session/device-model'),{demoProfile,demoSnapshot,DEMO_CAPABILITIES}=require('../../core/session/demo-session');
function model(){const m=buildSnapshotModel(demoSnapshot(demoProfile()),DEMO_CAPABILITIES,{editable:true});const r=m.keyBehaviors.find(r=>r.steps.some(s=>s.hold&&s.longHold));return {m,r};}
function located(m,r){const native=m.qmkKeycodes.find(k=>k.key===r.keycode)?.keycode;for(const [layer,keys]of Object.entries(m.rgb.lighting.keymap))for(const [owner,value]of Object.entries(keys))if(value.code===native&&(!m.participation||m.participation.layers[layer]))return {layer:Number(layer),owner:Number(owner)};throw new Error('no native owner');}
test('gesture uses current row overrides, configured branch depth, physical origin and current-press thresholds',()=>{
 const {m,r}=model();const {layer,owner}=located(m,r);m.participation=null;r.enabled=true;r.allowedLayers=65535;r.tapHoldTerm='317';r.longerHoldTerm='913';r.multiTapTerm='89';
 const a=lightingGesture(m,r.keycode,layer,owner,1);assert.equal(a.terms.hold,317);assert.equal(a.terms.long,913);assert.equal(a.terms.multi,89);
 const times=a.steps.map(s=>s.observation.situation.time);assert.deepEqual(times,[...times].sort((a,b)=>a-b));assert.ok(times.includes(316));assert.ok(times.includes(317));assert.ok(times.includes(912));assert.ok(times.includes(913));
 assert.equal(a.steps[0].observation.event,null);assert.ok(a.steps.filter(s=>s.observation.event).every(s=>s.observation.event.owners[0]===owner));
 const branch2=r.steps.find(s=>s.tapCount>0);if(branch2){const b=lightingGesture(m,r.keycode,layer,owner,branch2.tapCount+1);const press=b.steps.find(s=>s.label.startsWith(`Press ${branch2.tapCount+1}`));assert.equal(press.observation.situation.time,2*branch2.tapCount);}
});
test('missing tiers invent no hold boundary; unknown timing and disabled/foreign origins are explicit',()=>{
 const {m,r}=model();const {layer,owner}=located(m,r);m.participation=null;r.enabled=true;r.allowedLayers=65535;r.steps=[{tapCount:0,longHold:{helper:'TAP_ON_RELEASE_AFTER_HOLD',action:'KC_A',code:4}}];r.tapHoldTerm='317';r.longerHoldTerm='913';
 const a=lightingGesture(m,r.keycode,layer,owner);assert.ok(!a.steps.some(s=>s.observation.situation.time===317));assert.ok(a.steps.some(s=>s.observation.situation.time===913));
 assert.ok(!a.steps.find(s=>s.observation.situation.time===913).observation.event);assert.ok(a.steps.find(s=>s.label==='Release').observation.event);
 assert.equal(lightingGesture(m,r.keycode,layer,59).steps.length,0);
 r.longerHoldTerm='0';r.timingDefaults={};delete m.behaviorEditing.keyDefaults[r.keycode];m.behaviorTimingDefaults={};assert.equal(lightingGesture(m,r.keycode,layer,owner).steps.length,0);
});
test('gesture history includes configured feedback blink edges without repeating fired events',async()=>{
 const {gestureHistory}=await import('../../webview/view/lighting-gesture.mjs');
 const keys={0:{id:0,state:'hold',flashing:true,lit:true}};
 const history=gestureHistory([{blinkAt:100,observation:{situation:{time:100,behaviour:{keys}},event:{kind:7,thing:0}}},{blinkAt:100,observation:{situation:{time:701}}}],200);
 assert.deepEqual(history.map(s=>s.situation.time),[100,300,500,700,701]);assert.deepEqual(history.slice(1,4).map(s=>s.situation.behaviour.keys[0].lit),[false,true,false]);assert.equal(history.filter(s=>s.event).length,1);
});
test('gapped branches are silent; omitted taps retain known fallback events, and 1 ms thresholds do not receive invented quick taps',()=>{
 const {m,r}=model(),{layer,owner}=located(m,r);m.participation=null;r.tapHoldTerm='1';r.longerHoldTerm='100';r.multiTapTerm='77';
 r.steps=[{tapCount:0,hold:{helper:'TAP_AT_HOLD_THRESHOLD',action:'KC_A',code:4}},{tapCount:2,longHold:{helper:'TAP_ON_RELEASE_AFTER_HOLD',action:'KC_B',code:5}}];
 const a=lightingGesture(m,r.keycode,layer,owner,2,'tap');assert.equal(a.steps[0].observation.situation.time,0);assert.equal(a.steps[1].observation.situation.time,0);
 const selected=a.steps.find(s=>s.label.startsWith('Press 2'));assert.equal(selected.observation.situation.behaviour,undefined,'gap has no authored branch colour');
 assert.ok(a.steps.find(s=>s.label==='Tap emitted').observation.event,'known built-in fallback still sends a tap event');
});
test('unresolved transparent actions are conditional and never create a fired event',()=>{
 const {m,r}=model(),{layer,owner}=located(m,r);m.participation=null;r.steps=[{tapCount:0,tap:{helper:'TAP_SENDS',action:'KC_TRNS',code:1}}];
 const a=lightingGesture(m,r.keycode,layer,owner,1,'tap');assert.deepEqual(a.steps,[]);assert.match(a.notes.join(' '),/conditional/);
});
test('qualified direct held layers preview then own their target; direct TO dispatch persists after release',()=>{
 const {m,r}=model(),{layer,owner}=located(m,r);m.participation=null;r.tapHoldTerm='317';r.longerHoldTerm='913';r.multiTapTerm='89';
 r.steps=[{tapCount:0,tap:{helper:'TAP_SENDS',action:'LOCK_LAYER(2)',code:0x7ec2},hold:{helper:'PRESS_AND_HOLD_UNTIL_RELEASE',action:'MO(2)',code:0x5222}}];
 const a=lightingGesture(m,r.keycode,layer,owner);assert.equal(a.steps[0].observation.situation.preview,2);
 const held=a.steps.find(s=>s.label==='Hold · 317 ms').observation.situation;assert.equal(held.layerOwners[owner],2);assert.deepEqual(held.behaviour.standardKeys,{});assert.equal(held.behaviour.keys[owner].outcome,3);
 assert.equal(a.steps.find(s=>s.label==='Release').observation.situation.layerOwners,undefined);
 r.steps=[{tapCount:0,longHold:{helper:'TAP_AT_HOLD_THRESHOLD',action:'TO(2)',code:0x5202}}];const b=lightingGesture(m,r.keycode,layer,owner);
 assert.deepEqual(b.steps.find(s=>s.label==='Long hold · 913 ms').observation.situation.layers,[2]);assert.deepEqual(b.steps.find(s=>s.label==='Release').observation.situation.layers,[2]);
});
test('release-fired hold pulse survives with released physical key until the exact configured boundary',()=>{
 const {m,r}=model(),{layer,owner}=located(m,r);m.participation=null;r.tapHoldTerm='317';r.steps=[{tapCount:0,hold:{helper:'TAP_ON_RELEASE_AFTER_HOLD',action:'KC_A',code:4}}];
 const a=lightingGesture(m,r.keycode,layer,owner),released=a.steps.find(s=>s.label==='Release'),before=a.steps.find(s=>s.label==='Before feedback ends'),off=a.steps.find(s=>s.label==='Feedback interval');
 assert.equal(released.observation.event.kind,7);assert.deepEqual(released.observation.situation.pressedKeys,[]);assert.equal(released.observation.situation.behaviour.keys[owner].state,'hold');
 assert.equal(before.observation.situation.time,released.observation.situation.time+a.flash-1);assert.deepEqual(before.observation.situation.pressedKeys,[]);assert.equal(before.observation.situation.behaviour.keys[owner].state,'hold');
 assert.equal(off.observation.situation.time,released.observation.situation.time+a.flash);assert.deepEqual(off.observation.situation.pressedKeys,[]);assert.equal(off.observation.situation.behaviour,undefined);assert.equal(before.observation.event,null);
});
