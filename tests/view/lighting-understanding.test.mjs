import test from 'node:test';
import assert from 'node:assert/strict';
import {LightingSimulator} from '../../webview/view/lighting-simulator.mjs';
import {replayLighting, lightingLooks} from '../../webview/view/lighting-understanding.mjs';
const part=(slot,kind,params=[])=>({slot,kind,params}), rule=(parts)=>({flags:0,brightness:255,parts});
const program=rules=>({formatVersion:5,palette:[{h:0,s:0,v:100},{h:0,s:0,v:200}],things:[],keySets:[],maps:[],rules,extensions:[]});
test('Inspector trace shares pixel walk: clear, off, dim, tint and background retain actual contributors',()=>{
 const p=program([rule([part(2,0),part(3,0)]),rule([part(2,0),part(3,5,[128])]),rule([part(2,0),part(3,2,[0])]),rule([part(2,0),part(3,2,[1])])]);
 const s={time:0}, sim=new LightingSimulator(p);assert.deepEqual(sim.render(s)[0],[50,50,50]);
 const e=sim.explain(s,0);assert.deepEqual(e.frame[0],[50,50,50]);assert.match(e.rules[0].status,/Clear/);assert.match(e.rules[1].status,/with light below/);assert.match(e.rules[2].status,/opaque/);assert.match(e.rules[3].status,/Covered/);
 p.rules[1].parts[1]=part(3,6,[1,128]);const tint=new LightingSimulator(p);assert.deepEqual(tint.render(s)[0],[150,150,150]);assert.equal(tint.explain(s,0).rules[1].visits[0].readsBelow,true);
 p.rules[0]=rule([part(2,1),part(3,0),part(4,1)]);const black=new LightingSimulator(p);assert.deepEqual(black.render(s)[50],[0,0,0]);assert.equal(black.explain(s,50).rules[0].visits[0].source,'background');
});
test('first negation keeps board subject; a later positive condition is only a filter',()=>{
 const p=program([rule([part(1,16,[0]),part(0,1,[3]),part(2,0),part(3,3)])]);p.things=[{kind:1,default:[0,0],records:[]}];
 const sim=new LightingSimulator(p);assert.equal(sim.render({layers:[3]})[0],null);assert.match(sim.explain({layers:[3]},0).rules[0].subject,/Board subject/);
});
test('counterfactual clears whole rule including its background and replays event show/expiry at original times',()=>{
 const p=program([rule([part(0,24,[0]),part(2,0),part(3,2,[1]),part(4,1),part(5,1,[200,0]),part(5,3,[244,1])]),rule([part(2,0),part(3,2,[0])])]);
 const history=[{situation:{time:0}},{situation:{time:100},event:{kind:5,thing:0}},{situation:{time:300}}];
 const a=replayLighting(p,history,5);assert.deepEqual(a.frame[0],[200,200,200]);assert.deepEqual(replayLighting(p,history,5,0).frame[0],[100,100,100]);
 assert.deepEqual(replayLighting(p,[...history,{situation:{time:600}}],5).frame[0],[100,100,100]);assert.equal(p.rules[0].flags,0);
 assert.match(replayLighting(p,history.slice(0,2),5).simulator.explain({time:100},0).rules[0].status,/Waiting/);
 assert.match(replayLighting(p,[...history,{situation:{time:600}}],5).simulator.explain({time:600},0).rules[0].status,/expired/);
});
test('unknown enabled paint or any unknown map/extension is incomplete, never rendered as clear',()=>{
 for(const change of [p=>p.rules[0].known=false,p=>p.maps.push([140]),p=>p.extensions.push({kind:55,params:[]})]) {const p=program([rule([part(2,0),part(3,2,[0])])]);change(p);assert.throws(()=>replayLighting(p,[{situation:{time:0}}],5),/interpret|incomplete/);}
});
test('replay ticks a matured show-after before departure, but equality departure has no eligible tail',()=>{
 const p=program([rule([part(0,16,[0]),part(2,0),part(3,2,[0]),part(5,1,[100,0]),part(5,2,[200,0])])]);
 const history=[{situation:{time:100,hostLocks:1}},{situation:{time:250,hostLocks:0}},{situation:{time:449,hostLocks:0}}];
 assert.deepEqual(replayLighting(p,history,5).frame[0],[100,100,100]);assert.equal(replayLighting(p,[...history,{situation:{time:450,hostLocks:0}}],5).frame[0],null);
 assert.equal(replayLighting(p,[{situation:{time:100,hostLocks:1}},{situation:{time:200,hostLocks:0}}],5).frame[0],null);
});
test('fade endpoint and dim-zero traces do not claim lower colours contribute',()=>{
 const p=program([rule([part(2,0),part(3,5,[0])]),rule([part(2,0),part(3,2,[0])])]);const sim=new LightingSimulator(p);sim.render({time:0});const a=sim.explain({time:0},0);assert.equal(a.rules[1].visits[0].weight,0);assert.match(a.rules[1].status,/Covered/);
 const f=program([rule([part(0,1,[1]),part(2,0),part(3,2,[1])]),rule([part(0,1,[0]),part(2,0),part(3,2,[0])])]);f.extensions=[{kind:1,params:[1,0,0,2]}];
 const s={time:0,layers:[1],fade:{autoMouseLayer:1,progress:100,timeout:100,deadTime:0}}, fade=new LightingSimulator(f);fade.render(s);const e=fade.explain(s,0);assert.deepEqual(e.frame[0],[100,100,100]);assert.equal(e.rules[0].visits[0].weight,0);assert.match(e.rules[0].status,/Covered/);assert.equal(e.rules[1].visits[0].scene,'fade to');
});
test('overview builds isolated, named native-layer situations and marks empty/disabled/capability cases',()=>{
 const m={layers:[{index:0,name:'Base'},{index:1,name:'Nav'}],pdModes:[{id:0,name:'Scroll',kind:1,binding:{holdCode:0x7e80}},{id:1,name:'Empty',kind:0}],combos:[{badge:'C0',enabled:false,allowedLayers:65535}],comboReadback:{enabled:true},rgb:{baseEffect:{},lighting:{supportedFacts:[1,3,7],keymap:{0:{0:{code:4}},1:{0:{code:0x7e80}}},queryCombos:{0:{enabled:false,layers:[1],inputs:[0x7e80]}}}}};
 const looks=lightingLooks(m,1),mode=looks.find(l=>l.kind===2&&l.id===0);assert.deepEqual(mode.situation.mode.keys,[0]);assert.deepEqual(mode.situation.layers,[1]);assert.equal(looks.find(l=>l.kind===2&&l.id===1).available,false);assert.equal(looks.find(l=>l.kind===3).available,false);
 mode.situation.layers.push(8);assert.deepEqual(looks[1].situation.layers,[1]);assert.deepEqual(lightingLooks(m,1).find(l=>l.kind===2&&l.id===0).situation.layers,[1]);m.rgb.lighting.supportedFacts=[];assert.ok(lightingLooks(m,1).every(l=>!l.available));
});
test('occurrence-only filters cannot end or renew a continuous entry and retain its original show boundary',()=>{
 const p=program([rule([part(0,16,[0]),part(2,0),part(3,2,[0]),part(5,1,[100,0]),part(5,2,[200,0])])]);
 const history=[{situation:{time:100,hostLocks:1}},{situation:{time:150,hostLocks:0},event:{kind:0,thing:3},occurrenceOnly:true},{situation:{time:200,hostLocks:1}}];
 const result=replayLighting(p,history,5);assert.deepEqual(result.frame[0],[100,100,100]);assert.equal([...result.simulator.histories.values()][0].cell.entry,1n,'the initial continuous entry survives the event-only sample');
 const equality=replayLighting(p,[...history.slice(0,2),{situation:{time:200,hostLocks:0}}],5);assert.equal(equality.frame[0],null,'occurrence does not manufacture show eligibility before equality departure');
});
