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
function accepted({keycode='CUSTOM_KEY_0',tap='KC_A',hold=action('MO(2)'),long=action('KC_B','TAP_ON_RELEASE_AFTER_HOLD'),initial,layerValue=0,path="hold",eventConditions,probeTiming=3}={}) {
 const draft=new ProfileDraftSession(demoSnapshot(demoProfile()),'demo',DEMO_CAPABILITIES);
 const model=()=>buildSnapshotModel(draft.current,DEMO_CAPABILITIES,{editable:true});
 const stage=edit=>draft.stage({...edit,draftId:draft.id,draftRevision:draft.revision});
 const row=model().keyBehaviors.find(r=>r.keycode===keycode);
 stage(saveBehaviour({...row,tapHoldTerm:'317',longerHoldTerm:'913',multiTapTerm:'89',steps:[{tapCount:0,tap:action(tap,'TAP_SENDS'),hold,...long?{longHold:long}:{}}]}));
 const savedId=model().keyBehaviors.findIndex(r=>r.keycode===keycode);
 // Independent diagnostic rules run through the same guarded editor and codec.
 // Preview is white, held layer is black, behaviour Painting is white above it.
 for(const [kind,params,paint]of (eventConditions?[[null,[],1]]:[[null,[],1],[2,[2],2],[1,[2],1],[8,[savedId,4],2]])){stage(lightingRule(-1,'','add',{rule:{flags:0,brightness:255,parts:[...kind===null?[]:[{slot:0,kind,params}],{slot:2,kind:0,params:[]},{slot:3,kind:paint,params:paint===2?[0]:[]}]}}));if(paint===2||kind===1&&layerValue)stage(lightingRule(0,model().rgb.lighting.rules[0].identity,'colour',{colour:{h:0,s:0,v:kind===1?layerValue:200}}));}
 if(eventConditions){stage(lightingRule(-1,'','add',{rule:{flags:0,brightness:255,parts:[...eventConditions,{slot:2,kind:0,params:[]},{slot:3,kind:2,params:[0]},{slot:5,kind:probeTiming,params:[100,0]}]}}));stage(lightingRule(0,model().rgb.lighting.rules[0].identity,'colour',{colour:{h:0,s:0,v:200}}));}
 if(keycode!=='CUSTOM_KEY_0')stage(setKey('Layer 0',0,keycode));
 const m=model(),id=m.keyBehaviors.findIndex(r=>r.keycode===row.keycode),owner=Number(Object.entries(m.rgb.lighting.keymap[0]).find(([,k])=>k.code===row.code)[0]);
 assert.equal(m.keyBehaviors[id].tapHoldTerm,'317');
 const gesture=lightingGesture(m,row.keycode,0,owner,1,path,initial);
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
 const released=at(c,914);assert.equal(released.situation.layerOwners,undefined);assert.equal(released.situation.behaviour.keys[c.owner].state,'long');assert.equal(c.history.find(o=>o.situation.time===914&&o.event).event.kind,8);
 assert.equal(at(c,1113).situation.behaviour.keys[c.owner].state,'long');assert.equal(at(c,1114).situation.behaviour,undefined);
});
test('G3 delegated behaviour Painting remains visible across both feedback half-periods',()=>{
 const c=accepted();for(const time of [317,516,517,716,717,912]){const r=at(c,time);assert.equal(factSubjects(8,[c.id,4],r.situation).length,1,`raw hold at ${time}`);assert.equal(factSubjects(5,[4,0],r.situation).length,0,'Standard delegates');assert.deepEqual(r.frame[0],[200,200,200],`Painting pixel at ${time}`);assert.match(r.explanation.rules[0].status,/Contributes/);}
});

test('G1 preview qualification retains compatible layer-lock/goto paths and rejects mismatches and LT taps',()=>{
 for(const options of [
  {tap:'LOCK_LAYER(2)',long:null},
  {tap:'TG(2)',hold:action('TT(2)'),long:null},
  {tap:'TG(2)',long:action('TG(2)','TAP_AT_HOLD_THRESHOLD')},
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

test('G4 accepted press-only goto and both layer toggles never fabricate momentary ownership and persist after release',()=>{
 for(const expression of ['TO(2)','TG(2)','LOCK_LAYER(2)']){
  const c=accepted({hold:action(expression),long:null,layerValue:80});
  assert.equal(factSubjects(1,[2],at(c,316).situation).length,0);
  for(const time of [317,318,518]){const r=at(c,time);assert.equal(factSubjects(9,[2,1],r.situation).length,0,`${expression} no held fact at ${time}`);assert.equal(factSubjects(9,[2,2],r.situation).length,1,`${expression} locked at ${time}`);assert.deepEqual(r.frame[0],time===317?[200,200,200]:[80,80,80],`${expression} scene at ${time}`);}
  const release=at(c,318);assert.match(release.explanation.rules[1].status,/Contributes/);assert.equal(factSubjects(8,[c.id,12],release.situation).length,0,'persistent active layer does not retain behaviour feedback');assert.equal(c.history.filter(o=>o.event?.kind===7).length,1,'only one threshold commit fires');
 }
});
test('G4 toggles inspect lock state, not active bits, and repeated press-only toggles have no release effect',()=>{
 for(const expression of ['TG(2)','LOCK_LAYER(2)'])for(const initiallyLocked of [false,true]){
  const c=accepted({hold:action(expression),long:action(expression),initial:{layers:initiallyLocked?[2]:[],lockedLayers:initiallyLocked?[2]:[]}});
  for(const time of [317,912])assert.equal(factSubjects(9,[2,2],at(c,time).situation).length,Number(!initiallyLocked));
  for(const time of [913,914,1114]){const r=at(c,time);assert.equal(factSubjects(9,[2,2],r.situation).length,Number(initiallyLocked));assert.equal(factSubjects(9,[2,1],r.situation).length,0);}
 }
 const heldByOther=accepted({hold:action('TG(2)'),long:null,initial:{layers:[2],layerOwners:{0:2}}});
 const r=at(heldByOther,318).situation;assert.equal(factSubjects(9,[2,2],r).length,1);assert.deepEqual(factSubjects(9,[2,1],r)[0].keys,[0]);
});
test('G4 goto replaces only locks and one-shot state, preserving other true owners and base semantics',()=>{
 const initial={layers:[1,3,4],lockedLayers:[1],layerOwners:{0:3},oneshotLayer:4};
 for(const target of [0,2]){
  const c=accepted({hold:action(`TO(${target})`),long:null,initial}),r=at(c,318).situation;
  assert.deepEqual(r.lockedLayers,target?[2]:[]);assert.equal(r.oneshotLayer,undefined);assert.equal(factSubjects(1,[1],r).length,0);assert.equal(factSubjects(1,[4],r).length,0);assert.equal(factSubjects(1,[3],r).length,1);assert.deepEqual(factSubjects(9,[3,1],r)[0].keys,[0]);assert.equal(factSubjects(1,[0],r).length,1);
 }
});
test('G4 earlier persistent state survives pending or replacement actions without becoming a fake held fact',()=>{
 for(const hold of ['TO(2)','TG(2)','LOCK_LAYER(2)']){
  const pending=accepted({hold:action(hold)});for(const time of [317,913,914,1114]){const r=at(pending,time).situation;assert.equal(factSubjects(9,[2,2],r).length,1);assert.equal(factSubjects(9,[2,1],r).length,0);}
  const replaced=accepted({hold:action(hold),long:action('MO(3)')});const r=at(replaced,913).situation;assert.equal(factSubjects(9,[2,2],r).length,1);assert.deepEqual(factSubjects(9,[3,1],r)[0].keys,[replaced.owner]);assert.equal(factSubjects(9,[2,2],at(replaced,914).situation).length,1);assert.equal(factSubjects(1,[3],at(replaced,914).situation).length,0);
 }
});
test('G4 mode lock persists with its real display owner, toggles off and never becomes an unlocked held mode',()=>{
 const basis=buildSnapshotModel(demoSnapshot(demoProfile()),DEMO_CAPABILITIES,{editable:true}),lock=basis.pdModes[0].binding.lock;
 for(const initiallyLocked of [false,true]){
  const initial=initiallyLocked?{mode:{id:0,locked:true,keys:[0],halves:['left']},modeStatus:{id:0,locked:true,keys:[0],halves:['left']}}:{};
  const c=accepted({hold:action(lock),long:null,initial});
  for(const time of [317,318,518]){const r=at(c,time).situation;assert.equal(factSubjects(10,[0,1],r).length,Number(!initiallyLocked));assert.equal(factSubjects(10,[0,0],r).length,0);if(!initiallyLocked)assert.deepEqual(r.mode.keys,[c.owner]);}
  assert.equal(c.history.filter(o=>o.event?.kind===3).length,Number(!initiallyLocked));assert.equal(c.history.filter(o=>o.event?.kind===4).length,Number(initiallyLocked));assert.equal(at(c,318).situation.behaviour,undefined);
 }
 const twice=accepted({hold:action(lock),long:action(lock)});assert.equal(at(twice,317).situation.modeStatus.locked,true);assert.equal(at(twice,913).situation.mode,undefined);assert.equal(at(twice,914).situation.mode,undefined);
 const pending=accepted({hold:action(lock)});assert.equal(at(pending,913).situation.modeStatus.locked,true);assert.equal(at(pending,914).situation.modeStatus.locked,true);
 const replaced=accepted({hold:action(lock),long:action(modeHold)});assert.equal(at(replaced,913).situation.modeStatus.locked,true);assert.deepEqual(at(replaced,914).situation.mode.keys,[replaced.owner],'releasing same-slot hold does not end the lock');
 const other=basis.pdModes.find(m=>m.kind&&m.id!==0);
 assert.ok(other,'real second configured mode');const switched=accepted({hold:action(lock),long:action(other.binding.hold)});assert.equal(at(switched,913).situation.mode.id,other.id);assert.equal(at(switched,913).situation.modeStatus.locked,false);assert.equal(at(switched,914).situation.mode,undefined);
});
test('G4 layer toggles preserve other locks and true owners; momentary TT releases while lock events fire only on changes',()=>{
 const c=accepted({hold:action('TG(2)'),long:action('TG(2)'),initial:{layers:[1,2],lockedLayers:[1],layerOwners:{0:2}}});
 assert.deepEqual(at(c,913).situation.lockedLayers,[1]);assert.deepEqual(at(c,914).situation.layerOwners,{0:2});assert.equal(factSubjects(1,[2],at(c,914).situation).length,1);
 assert.deepEqual(c.history.filter(o=>o.event?.kind===0||o.event?.kind===1).map(o=>[o.situation.time,o.event.kind,o.event.thing]),[[317,0,2],[913,1,2]]);
 const noop=accepted({hold:action('TO(2)'),long:null,initial:{layers:[2],lockedLayers:[2]}});assert.equal(noop.history.filter(o=>o.event?.kind===0||o.event?.kind===1).length,0,'retained lock does not refire');
 const tt=accepted({hold:action('TT(2)'),long:null});assert.equal(factSubjects(9,[2,1],at(tt,317).situation).length,1);assert.equal(factSubjects(9,[2,2],at(tt,317).situation).length,0);assert.equal(factSubjects(1,[2],at(tt,318).situation).length,0);
 const lockByOther=accepted({hold:action('MO(2)'),long:null,initial:{layers:[2],lockedLayers:[2],layerOwners:{0:2}}});assert.deepEqual(at(lockByOther,318).situation.layerOwners,{0:2});assert.deepEqual(at(lockByOther,318).situation.lockedLayers,[2]);
});
test('G4 mode holds preserve another real owner, and tapping the hold binding does not invent mode activation',()=>{
 const initial={mode:{id:0,keys:[0],halves:['left']},modeStatus:{id:0,locked:false,keys:[0],halves:['left']}};
 const c=accepted({hold:action(modeHold),long:null,initial});assert.deepEqual(at(c,317).situation.mode.keys,[0,c.owner]);assert.deepEqual(at(c,318).situation.mode.keys,[0]);assert.equal(c.history.filter(o=>o.event?.kind===3||o.event?.kind===4).length,0,'unchanged active mode never restarts');
 const tap=accepted({hold:action(modeHold,'TAP_AT_HOLD_THRESHOLD'),long:null});for(const time of [317,318,517,518])assert.equal(at(tap,time).situation.mode,undefined);
});
test('G4 unavailable one-shot policy and state-changing repeats are explicit conditional paths, not invented state',()=>{
 const once=accepted({tap:'OSL(2)',hold:null,long:null,path:'tap'});assert.deepEqual(once.history,[]);assert.match(once.gesture.notes.join(' '),/One-shot enabled state and prior arming time/);
 const repeated=accepted({hold:{...action('TG(2)','REPEAT_WHILE_HELD'),repeatHz:'10'},long:null});assert.deepEqual(repeated.history,[]);assert.match(repeated.gesture.notes.join(' '),/Repeated state-changing/);
});

const g5=(options={})=>accepted({hold:action('TG(2)'),long:action('TO(3)'),eventConditions:[{slot:0,kind:19,params:[3]},{slot:0,kind:1,params:[2]}],...options});
test('G5 target-lock flash qualifies at its synchronous occurrence before goto clears the old lock',()=>{
 const c=g5();for(const time of [912,913,914,1012,1013,1114]){const r=at(c,time);assert.deepEqual(r.frame[0],time>=913&&time<1013?[200,200,200]:[0,0,0],`occurrence flash at ${time}`);if(time===914){assert.deepEqual(r.situation.layers,[3]);assert.match(r.explanation.rules[0].status,/Contributes/);const cleared=replayLighting(c.m.rgb.lighting.program,c.history.filter(o=>o.situation.time<=time),5,0);assert.deepEqual(cleared.frame[0],[0,0,0]);}}
 const occurrences=c.history.filter(o=>o.situation.time===913&&o.event);assert.deepEqual(occurrences.map(o=>[o.event.kind,o.event.thing]),[[0,3],[1,2],[8,c.id]]);
 assert.deepEqual(occurrences[0].situation.layers,[2,3]);assert.deepEqual(occurrences[0].situation.lockedLayers,[2,3]);assert.deepEqual(occurrences[1].situation.layers,[3]);
});
test('G5 filters qualify at occurrence, not a later matching final state, and keep original flash expiry',()=>{
 for(const [options,visible]of [
  [{eventConditions:[{slot:0,kind:19,params:[3]},{slot:1,kind:1,params:[2]}]},false],
  [{hold:action('KC_C')},false],
  [{hold:action('TO(3)')},false], // no second lock occurrence at913
  [{eventConditions:[{slot:0,kind:19,params:[3]},{slot:0,kind:9,params:[2,2]}]},true],
 ]){const c=g5(options),r=at(c,914);assert.deepEqual(r.frame[0],visible?[200,200,200]:[0,0,0]);if(!visible)assert.match(r.explanation.rules[0].status,/No qualifying event|Flash expired/);assert.deepEqual(at(c,1013).frame[0],[0,0,0]);}
});
test('G5 goto captures target lock, ordered old unlocks and later one-shot consumption with actual owners',()=>{
 const initial={layers:[1,2,4,5],lockedLayers:[5,2,1],layerOwners:{0:2},oneshotLayer:4};
 const c=g5({hold:action('TO(3)'),long:null,initial}),native=c.history.filter(o=>o.situation.time===317&&o.event?.kind<6);
 assert.deepEqual(native.map(o=>[o.event.kind,o.event.thing,o.situation.layers,o.situation.lockedLayers,o.situation.oneshotLayer,o.event.owners]),[
  [0,3,[1,2,3,4,5],[1,2,3,5],4,[]],
  [1,1,[2,3,4,5],[2,3,5],4,[]],
  [1,2,[2,3,4,5],[3,5],4,[0]],
  [1,5,[2,3,4],[3],4,[]],
 ]);
 const consumed=c.gesture.steps.find(s=>s.observation.situation.time===317).effects.at(-1);assert.equal(consumed.event,undefined);assert.deepEqual(consumed.situation.layers,[2,3]);assert.equal(consumed.situation.oneshotLayer,undefined);
 for(const o of native){assert.deepEqual(o.situation.pressedKeys,[c.owner]);assert.deepEqual(o.situation.layerOwners,{0:2});assert.deepEqual(o.situation.behaviourPhases[c.owner].phases,[3]);assert.equal(factSubjects(9,[3,1],o.situation).length,0);}
});
test('G5 occurrence snapshots own their nested state, native/commit metadata and owners across later mutations',()=>{
 const c=g5(),native=c.history.filter(o=>o.situation.time===913&&o.event),lock=native[0],unlock=native[1],commit=native[2];
 assert.deepEqual(lock.situation.pressedKeys,[c.owner]);assert.deepEqual(lock.situation.behaviourPhases[c.owner],{id:c.id,phases:[4],branch:1});assert.deepEqual(lock.situation.behaviour.keys[c.owner],{id:c.id,state:'long',branch:1,outcome:4,flashing:false,lit:true});assert.deepEqual(lock.situation.behaviour.standardKeys,{});
 assert.deepEqual(commit.event,{kind:8,thing:c.id,owners:[c.owner],slot:1,outcome:4});assert.deepEqual(unlock.situation.lockedLayers,[3]);assert.notEqual(lock.situation,unlock.situation);assert.notEqual(lock.situation.behaviour,commit.situation.behaviour);
 const before=structuredClone(lock),final=c.history.at(-1).situation;final.layers.push(9);final.lockedLayers.push(10);commit.situation.behaviour.keys[c.owner].outcome=99;unlock.situation.keymap[0][c.owner].code=0;assert.deepEqual(lock,before);
});
test('G5 mode command observers see post-command mode with borrowed old owners copied before the start event',()=>{
 const basis=buildSnapshotModel(demoSnapshot(demoProfile()),DEMO_CAPABILITIES,{editable:true}),other=basis.pdModes.find(m=>m.kind&&m.id!==0);
 const initial={mode:{id:0,locked:true,keys:[0],halves:['left']},modeStatus:{id:0,locked:true,keys:[0],halves:['left']}};
 const c=g5({hold:action(other.binding.lock),long:null,initial}),native=c.history.filter(o=>o.situation.time===317&&[3,4].includes(o.event?.kind));
 assert.deepEqual(native.map(o=>[o.event.kind,o.event.thing,o.event.owners,o.situation.mode.id,o.situation.modeStatus.locked]),[[4,0,[0],other.id,true],[3,other.id,[c.owner],other.id,true]]);
 assert.notEqual(native[0].situation,native[1].situation);native[1].event.owners.push(1);native[1].situation.mode.keys.push(2);assert.deepEqual(native[0].event.owners,[0]);assert.deepEqual(native[0].situation.mode.keys,[c.owner]);assert.deepEqual(at(c,318).situation.mode.keys,[c.owner]);
});
test('G5 registered mode release precedes replacement and release-fired feedback, with truthful physical boundaries',()=>{
 const basis=buildSnapshotModel(demoSnapshot(demoProfile()),DEMO_CAPABILITIES,{editable:true}),other=basis.pdModes.find(m=>m.kind&&m.id!==0);
 const replacement=g5({hold:action(modeHold),long:action(other.binding.hold)}),events=replacement.history.filter(o=>o.situation.time===913&&[3,4].includes(o.event?.kind));
 assert.deepEqual(events.map(o=>[o.event.kind,o.event.thing,o.situation.mode?.id]),[[4,0,undefined],[3,other.id,other.id]]);for(const o of events){assert.deepEqual(o.event.owners,[replacement.owner]);assert.deepEqual(o.situation.pressedKeys,[replacement.owner]);assert.deepEqual(o.situation.behaviourPhases[replacement.owner].phases,[4]);}
 const release=replacement.history.find(o=>o.situation.time===914&&o.event?.kind===4);assert.equal(release.situation.mode,undefined);assert.deepEqual(release.situation.pressedKeys,[]);assert.equal(release.situation.behaviour,undefined);assert.equal(release.situation.behaviourPhases,undefined);
 const pulse=g5({hold:action(modeHold),long:action('KC_B','TAP_ON_RELEASE_AFTER_HOLD')}),end=pulse.history.filter(o=>o.situation.time===914);assert.equal(end[0].event.kind,4);assert.equal(end[0].situation.behaviour,undefined);assert.deepEqual(end[0].situation.pressedKeys,[]);assert.equal(end.at(-1).event.kind,8);assert.equal(end.at(-1).situation.behaviour.keys[pulse.owner].state,'long');assert.equal(at(pulse,1114).situation.behaviour,undefined);
});

test('G5 synchronous event captures do not invent continuous state observations between native effects',()=>{
 // Firmware occurrence observers qualify events; the runtime samples continuous
 // state after the synchronous action sequence, when layer2 is already gone.
 const c=g5({eventConditions:[{slot:0,kind:1,params:[2]},{slot:0,kind:1,params:[3]}],probeTiming:2});
 for(const time of [913,914,1012]){const r=at(c,time);assert.deepEqual(r.frame[0],[0,0,0],`no fabricated state linger at ${time}`);assert.equal(r.explanation.rules[0].visits.length,0);}
});
