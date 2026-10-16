import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {saveBehaviour, lightingRule, setKey} from '../../webview/view/edits.mjs';
import {lightingGesture, gestureHistory} from '../../webview/view/lighting-gesture.mjs';
import {factSubjects} from '../../webview/view/lighting-facts.mjs';
import {replayLighting} from '../../webview/view/lighting-understanding.mjs';
const require=createRequire(import.meta.url);
const {ProfileDraftSession}=require('../../core/session/profile-draft-session');
const {buildSnapshotModel}=require('../../core/session/device-model');
const {demoProfile,demoSnapshot,DEMO_CAPABILITIES}=require('../../core/session/demo-session');
const modeHold=buildSnapshotModel(demoSnapshot(demoProfile()),DEMO_CAPABILITIES,{editable:true}).pdModes[0].binding.hold;
const action=(action,helper='PRESS_AND_HOLD_UNTIL_RELEASE')=>({action,helper});
function accepted({keycode='CUSTOM_KEY_0',tap='KC_A',hold=action('MO(2)'),long=action('KC_B','TAP_ON_RELEASE_AFTER_HOLD')}={}) {
 const draft=new ProfileDraftSession(demoSnapshot(demoProfile()),'demo',DEMO_CAPABILITIES);
 const model=()=>buildSnapshotModel(draft.current,DEMO_CAPABILITIES,{editable:true});
 const stage=edit=>draft.stage({...edit,draftId:draft.id,draftRevision:draft.revision});
 const row=model().keyBehaviors.find(r=>r.keycode===keycode);
 stage(saveBehaviour({...row,tapHoldTerm:'317',longerHoldTerm:'913',multiTapTerm:'89',steps:[{tapCount:0,tap:action(tap,'TAP_SENDS'),hold,...long?{longHold:long}:{}}]}));
 const savedId=model().keyBehaviors.findIndex(r=>r.keycode===keycode);
 // Independent diagnostic rules run through the same guarded editor and codec.
 // Preview is white, held layer is black, behaviour Painting is white above it.
 for(const [kind,params,paint]of [[null,[],1],[2,[2],2],[1,[2],1],[8,[savedId,4],2]]){stage(lightingRule(-1,'','add',{rule:{flags:0,brightness:255,parts:[...kind===null?[]:[{slot:0,kind,params}],{slot:2,kind:0,params:[]},{slot:3,kind:paint,params:paint===2?[0]:[]}]}}));if(paint===2)stage(lightingRule(0,model().rgb.lighting.rules[0].identity,'colour',{colour:{h:0,s:0,v:200}}));}
 if(keycode!=='CUSTOM_KEY_0')stage(setKey('Layer 0',0,keycode));
 const m=model(),id=m.keyBehaviors.findIndex(r=>r.keycode===row.keycode),owner=Number(Object.entries(m.rgb.lighting.keymap[0]).find(([,k])=>k.code===row.code)[0]);
 assert.equal(m.keyBehaviors[id].tapHoldTerm,'317');
 const gesture=lightingGesture(m,row.keycode,0,owner);
 return {m,id,owner,gesture,history:gestureHistory(gesture.steps,gesture.flash)};
}
const at=(c,time)=>{
 const history=c.history.filter(o=>o.situation.time<=time);
 if(history.at(-1).situation.time<time)history.push({situation:{...structuredClone(history.at(-1).situation),time}});
 const result=replayLighting(c.m.rgb.lighting.program,history,5);
 return {...result,situation:history.at(-1).situation,explanation:result.simulator.explain(history.at(-1).situation,0)};
};
test('G1 accepted plain tap and mismatched longer action never announce a layer preview',()=>{
 const c=accepted();for(const time of [0,316]){const r=at(c,time);assert.equal(r.situation.preview,undefined);assert.equal(factSubjects(2,[2],r.situation).length,0);assert.equal(r.explanation.rules[2].visits.length,0);}
});
test('G2 registered layer output survives a release-pending longer action independently of its feedback',()=>{
 const c=accepted();for(const time of [317,912,913]){const r=at(c,time);assert.equal(r.situation.layerOwners?.[c.owner],2);assert.equal(factSubjects(9,[2,1],r.situation).length,1);}
 const pending=at(c,913);assert.equal(factSubjects(8,[c.id,12],pending.situation).length,0,'no old hold or invented long Painting feedback');assert.deepEqual(pending.frame[0],[0,0,0],'held layer still paints');
 const released=at(c,914);assert.equal(released.situation.layerOwners,undefined);assert.equal(released.situation.behaviour.keys[c.owner].state,'long');assert.equal(c.history.find(o=>o.situation.time===914).event.kind,8);
 assert.equal(at(c,1113).situation.behaviour.keys[c.owner].state,'long');assert.equal(at(c,1114).situation.behaviour,undefined);
});
test('G3 delegated behaviour Painting remains visible across both feedback half-periods',()=>{
 const c=accepted();for(const time of [317,516,517,716,717,912]){const r=at(c,time);assert.equal(factSubjects(8,[c.id,4],r.situation).length,1,`raw hold at ${time}`);assert.equal(factSubjects(5,[4,0],r.situation).length,0,'Standard delegates');assert.deepEqual(r.frame[0],[200,200,200],`Painting pixel at ${time}`);assert.match(r.explanation.rules[0].status,/Contributes/);}
});

test('G1 preview qualification retains compatible layer-lock/goto paths and rejects mismatches and LT taps',()=>{
 for(const options of [
  {tap:'LOCK_LAYER(2)',long:null},
  {tap:'TO(2)',long:action('MO(2)')},
  {tap:'LOCK_LAYER(2)',long:action('TO(2)','TAP_AT_HOLD_THRESHOLD')},
 ]){const c=accepted(options);for(const time of [0,316])assert.equal(at(c,time).situation.preview,2);}
 for(const options of [
  {tap:'LOCK_LAYER(2)'},
  {tap:'LOCK_LAYER(3)',long:null},
  {tap:'TO(2)',long:action('MO(3)')},
  {keycode:'LT(3,KC_SLASH)',tap:'KC_SLASH',hold:action('MO(3)'),long:null},
 ]){const c=accepted(options);assert.ok(c.gesture.steps.length,'known configured path remains simulated');for(const time of [0,316])assert.equal(at(c,time).situation.preview,undefined);}
});
test('G2 registered mode owns its inputs until release; pending feedback is not inferred from that ownership',()=>{
 const c=accepted({hold:action(modeHold)});
 assert.equal(at(c,316).situation.mode,undefined);
 for(const time of [317,516,517,912,913]){const r=at(c,time);assert.equal(r.situation.mode.id,0);assert.deepEqual(r.situation.mode.keys,[c.owner]);assert.equal(factSubjects(3,[0],r.situation).length,1);if(time<913){assert.equal(factSubjects(8,[c.id,4],r.situation).length,1);assert.equal(factSubjects(5,[4,0],r.situation).length,0);assert.deepEqual(r.frame[0],[200,200,200]);}}
 assert.equal(factSubjects(8,[c.id,12],at(c,913).situation).length,0);
 assert.equal(at(c,914).situation.mode,undefined);assert.equal(at(c,914).situation.behaviour.keys[c.owner].state,'long');
 assert.deepEqual(at(c,913).situation.behaviourPhases[c.owner].phases,[4],'actual hold-tier phase advances independently of the empty visible slot');
});
test('G2 a new registered action or threshold dispatch replaces previous layer/mode ownership',()=>{
 for(const hold of [action('MO(2)'),action(modeHold)]){
  const replacement=accepted({hold,long:action('MO(3)')}),r=at(replacement,913).situation;
  assert.equal(r.layerOwners[replacement.owner],3);assert.equal(r.mode,undefined);assert.equal(factSubjects(9,[2,1],r).length,0);assert.equal(at(replacement,914).situation.layerOwners,undefined);
  const dispatch=accepted({hold,long:action('TO(3)','TAP_AT_HOLD_THRESHOLD')}),d=at(dispatch,913).situation;
  assert.equal(d.layerOwners,undefined);assert.equal(d.mode,undefined);assert.deepEqual(d.layers,[3]);assert.deepEqual(at(dispatch,914).situation.layers,[3]);
 }
});
test('G3 ordinary registered keys and repeats still blink in the real fact query and painter',()=>{
 for(const hold of [action('KC_C'),{...action('KC_C','REPEAT_WHILE_HELD'),repeatHz:'10'}]){
  const c=accepted({hold});
  for(const [time,visible]of [[317,true],[516,true],[517,false],[716,false],[717,true],[912,true]]){const r=at(c,time);assert.equal(factSubjects(8,[c.id,4],r.situation).length,Number(visible),`named fact at ${time}`);assert.equal(factSubjects(5,[4,0],r.situation).length,Number(visible),`Standard at ${time}`);assert.deepEqual(r.frame[0],visible?[200,200,200]:[0,0,0],`pixel at ${time}`);}
 }
});
