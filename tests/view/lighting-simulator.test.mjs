import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {LightingSimulator, frameText, KEY_LEDS} from '../../webview/view/lighting-simulator.mjs';
import {emptyLifetime, observeLifetime, lifetimeStatus, freshnessInterval, subjectPriority} from '../../webview/view/lighting-lifetime.mjs';
const require=createRequire(import.meta.url), vectors=require('../../upstream/firmware/tests/fixtures/lighting_vectors_v1.json');
const {decodeLightingDomain}=require('../../core/schema/lighting-domain-v1');
const decode=hex=>decodeLightingDomain(Buffer.from(hex,'hex'),vectors.limits);
test('simulator geometry uses actual pinned matrix LEDs',()=>assert.deepEqual(KEY_LEDS.map(x=>x??null),vectors.geometry.keyLeds));
for(const v of vectors.render)test(`render contract: ${v.name}`,()=>{
 const sim=new LightingSimulator(decode(v.hex),vectors.limits.tapDepth);
 for(const step of v.steps)assert.deepEqual(frameText(sim.render(step.situation)),step.expect);
});
for(const v of vectors.lifetimes)test(`lifetime contract: ${v.name}`,()=>{
 let c=emptyLifetime();
 for(const step of v.steps){c=observeLifetime(c,v.parameters,step.elapsed,step.observation,step.batch||null);assert.deepEqual(lifetimeStatus(c,v.parameters),step.expect);}
});
for(const v of vectors.historyObservations)test(`whole owner batch: ${v.name}`,()=>{
 const sim=new LightingSimulator(decode(v.hex));let time=0;
 for(const step of v.steps){time+=step.elapsed;const frame=sim.render({...step.situation,time},null,BigInt(step.order));assert.deepEqual(frameText(frame),step.pixels);const histories=[...sim.histories.values()].sort((a,b)=>a.rule-b.rule||a.thing-b.thing).map(h=>({rule:h.rule,thing:h.thing,entry:String(h.cell.entry),...lifetimeStatus(h.cell,h.timing),batch:(lifetimeStatus(h.cell,h.timing).batch??[]).map(({natural,authored,...s})=>s)}));assert.deepEqual(histories,step.expect);}
});
for(const v of vectors.historyEvents)test(`qualified event: ${v.name}`,()=>{
 const sim=new LightingSimulator(decode(v.hex));let time=0;
 for(const step of v.steps){time+=step.elapsed;assert.deepEqual(frameText(sim.render({...step.situation,time},step.event,BigInt(step.order))),step.pixels);}
});
for(const v of vectors.freshness)test(`conservative freshness: ${v.name}`,()=>{
 const b=freshnessInterval(v.capture,v.before,v.remote,v.after,v.now);assert.deepEqual(b,v.bounds);assert.equal(Boolean(b&&b[0]>=v.show&&b[1]<v.flash),v.visible);
});

for(const v of vectors.retainedOrdering)test(`retained priority: ${v.name}`,()=>{
 let cells=v.cells.map(()=>emptyLifetime());
 for(const step of v.steps){
  cells=cells.map((c,i)=>observeLifetime(c,v.cells[i].parameters,step.elapsed,step.matching[i].length?'match':'absent',step.matching[i],BigInt(step.order)));
  const members=[];
  cells.forEach((c,i)=>{if(lifetimeStatus(c,v.cells[i].parameters).visible)for(const [at,key] of (c.batch??[]).entries())members.push({index:i,key,kind:v.cells[i].kind,thing:v.cells[i].thing,entry:c.entry,natural:v.cells[i].natural==='layer-desc'?255-v.cells[i].thing:v.cells[i].natural==='matrix'?key:0,authored:at});});
  members.sort(subjectPriority);assert.deepEqual(members.map(m=>[m.index,m.authored]),step.expect.members);assert.deepEqual(cells.map(c=>String(c.entry)),step.expect.entries);assert.equal(members.length?v.cells[members[0].index].colour:'-',step.expect.pixel);
 }
});

test('fixed LED55 remains distinct from key-relative matrix56 and59 without rewriting bytes',()=>{
 const rule=(kind,params,target,targetParams=[])=>({flags:0,brightness:255,parts:[{slot:0,kind,params},{slot:2,kind:target,params:targetParams},{slot:3,kind:2,params:[0]}]});
 const p={formatVersion:5,palette:[{h:0,s:255,v:200}],things:[],keySets:[[55]],maps:[],rules:[rule(14,[59],4)],extensions:[]};
 const before=JSON.stringify(p),sim=new LightingSimulator(p);
 assert.equal(sim.render({pressedKeys:[59]})[55],null);assert.equal(JSON.stringify(p),before);
 p.rules=[rule(14,[56],4)];assert.deepEqual(new LightingSimulator(p).render({pressedKeys:[56]})[55],[200,0,0]);
 p.rules=[rule(14,[59],3,[0])];assert.deepEqual(new LightingSimulator(p).render({pressedKeys:[59]})[55],[200,0,0]);
 p.rules=[rule(1,[0],8,[0,255])];assert.equal(new LightingSimulator(p).render({keymap:{0:{59:{code:4}}}})[55],null);
 assert.deepEqual(new LightingSimulator(p).render({keymap:{0:{56:{code:4}}}})[55],[200,0,0]);
});

for(const v of vectors.occurrences)test(`coherent occurrence qualification: ${v.name}`,()=>{
 for(const step of v.steps){
  const sim=new LightingSimulator(decode(v.hex));sim.observe(step.situation,step.event);
  const actual=[...sim.histories.values()].filter(h=>h.cell.phase==='flash'),mask=Buffer.alloc(32);
  if(step.expect===null){assert.equal(actual.length,0);continue;}
  const wire=Buffer.from(step.expect,'hex');for(const h of actual){mask[h.rule>>3]|=1<<(h.rule&7);const s=h.cell.batch[0];assert.equal(s.kind,wire[8]);assert.equal(s.thing,wire[9]);assert.equal(s.slot,wire[10]);assert.equal(s.outcome,wire[11]);const owners=Buffer.alloc(8);for(const k of s.keys)owners[k>>3]|=1<<(k&7);assert.equal(owners.toString('hex'),wire.subarray(14,22).toString('hex'));assert.equal((s.halves.includes('left')?1:0)|(s.halves.includes('right')?2:0),wire[12]);assert.equal(Number(s.keys.length>0),wire[13]);}
  assert.equal(mask.toString('hex'),wire.subarray(22).toString('hex'));
 }
});
