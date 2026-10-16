import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {sampledSituation,liveConditions,completeLocalFrame} from '../../webview/view/lighting-live.mjs';
import {factSubjects} from '../../webview/view/lighting-facts.mjs';
const require=createRequire(import.meta.url),{buildPanelModel}=require('../../core/session/panel-session');
const {openPanelLoop}=require('../../core/session/panel-loop'),{fakeKeyboardAdapter}=require('../fixtures/fake-keyboard'),{lightingLiveKeyboard}=require('../fixtures/lighting-live-keyboard'),{document}=require('../fixtures/portable-profile');
async function model(t){const loop=openPanelLoop({post:()=>{},saveRecovery:async()=>{},saveExport:async()=>{},chooseProfile:async()=>{}},{adapter:fakeKeyboardAdapter({keyboard:lightingLiveKeyboard(document())})});t.after(()=>loop.close());await loop.handleMessage({type:'ready'});return buildPanelModel(loop.session,loop.session.service.snapshot());}
function sample(){return {id:1,captured:100,generation:1,keymapGeneration:1,profile:{},source:'master-main',ledCount:58,leftCount:29,matrixKeys:60,slices:{}};}
test('sample projections preserve raw matrix owners, exact feedback slots, phases and missing knowledge',async t=>{
 const m=await model(t),s=sample();s.slices[1]=[9,0];s.slices[9]=Array(64).fill(0);s.slices[9][56]=4;s.slices[9][60]=8;s.slices[9][62]=255;s.slices[9][63]=3;
 s.slices[8]=Array(180).fill(0);s.slices[8].splice(56*3,3,5,6,34);s.slices[12]=Array(180).fill(0);s.slices[12].splice(56*3,3,5,9,3);
 s.slices[3]=[2,2,1,1,0,0,0,0,0,0,0];s.slices[14]=[0,0,0,0,0,0,0,1];s.slices[15]=[18,4];s.slices[16]=[1];s.slices[17]=[8];s.slices[18]=[0];
 const situation=sampledSituation(m,s);assert.deepEqual(situation.mode,{id:2,keys:[0],halves:["right"]});assert.deepEqual(situation.layers,[0,3]);assert.deepEqual(situation.layerOwners,{56:3});assert.deepEqual(situation.pressedKeys,[56]);
 assert.deepEqual(factSubjects(8,[4,1],situation).map(s=>[s.thing,s.slot,s.keys,s.outcome]),[[4,5,[56],34]]);
 assert.equal(factSubjects(12,[4,3,3],situation).length,1);assert.equal(factSubjects(12,[4,2,3],situation).length,0);assert.equal(situation.preview,undefined);assert.equal(situation.idle,false);
 const local=JSON.stringify(m.rgb.lighting.program);liveConditions(m,s);assert.equal(JSON.stringify(m.rgb.lighting.program),local);
});
test('sample v1 refuses unknown slice layouts and geometry instead of guessing',async t=>{
 const m=await model(t),s=sample();s.slices[99]=[1];assert.throws(()=>sampledSituation(m,s),/unknown/);s.slices={14:[0]};assert.throws(()=>sampledSituation(m,s),/layout/);s.matrixKeys=61;assert.throws(()=>sampledSituation(m,s),/geometry/);
});
test('temporary frame completeness preserves black and refuses unknown base effects',async t=>{
 const m=await model(t),black=Array.from({length:58},()=>[0,0,0]);assert.equal(completeLocalFrame(black,m).bytes.length,174);
 assert.equal(completeLocalFrame(Array(57).fill(null),m).bytes,null);m.rgb.baseEffect.previewColor=null;assert.equal(completeLocalFrame(Array(58).fill(null),m).bytes,null);
 m.rgb.lighting.unknownRules=1;assert.equal(completeLocalFrame(black,m).bytes,null);
});
test('current conditions never invent timed maturity, events or absent module facts',async t=>{
 const m=await model(t),s=sample();s.slices[1]=[1,0];m.rgb.lighting.program.rules=[{flags:0,brightness:255,parts:[{slot:0,kind:1,params:[0]}]},{flags:0,brightness:255,parts:[{slot:0,kind:1,params:[0]},{slot:5,kind:1,params:[1,0]}]},{flags:0,brightness:255,parts:[{slot:1,kind:18,params:[]}]}];
 assert.deepEqual(liveConditions(m,s).map(r=>r.state),['Sampled conditions match','Indeterminate · events, timing or unavailable facts','Indeterminate · events, timing or unavailable facts']);
});
