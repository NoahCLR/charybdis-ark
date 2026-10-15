// @ts-check
"use strict";
const {test,expect}=require('@playwright/test');
const {openControls,clearPosts,posted,publishAccepted,change}=require('./control-preview');
const {decodeLightingDomain,encodeLightingDomain}=require('../core/schema/lighting-domain-v1');
const {lightingCapabilities}=require('../tests/fixtures/lighting-capabilities');
const {editLightingRule,ruleIdentity}=require('../core/model/lighting-editor');
const vectors=require('../upstream/firmware/tests/fixtures/lighting_vectors_v1.json');
const field=(page,suffix)=>page.locator(`.lighting-configuration [data-f$="${suffix}"]`);
const save=page=>page.locator('[data-save-rule]').click();
for(const theme of ['vscode-dark','vscode-light']) {
 test(`every advertised fact and parameter posts through the guarded codec (${theme})`,async({page})=>{
  await openControls(page,'lighting',{},theme);
  const kinds=await field(page,':condition:0:kind').locator('option').evaluateAll(nodes=>nodes.map(n=>n.value));
  for(const kind of kinds){
   await field(page,':condition:0:kind').selectOption(kind);
   const params=await page.locator('.lighting-configuration [data-f*="condition:0:parameter"]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-f')));
   for(const identity of params){const control=page.locator(`[data-f="${identity}"]`);const opts=await control.locator('option').evaluateAll(nodes=>nodes.map(n=>n.value));if(opts.length>1)await control.selectOption(opts[1]);}
   await change(field(page,':brightness'),177);
   for(const timing of await page.locator('.lighting-configuration [data-f*="timing:"]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-f'))))await change(page.locator(`[data-f="${timing}"]`),777);
   await clearPosts(page);await save(page);
   const posts=await posted(page);expect(posts).toHaveLength(1);const message=posts[0];expect(message).toMatchObject({type:'editLightingRule',action:'configure',rule:{brightness:177}});
   expect(message.rule.parts[0].kind).toBe(Number(kind));expect(message.rule.parts.some(p=>p.slot===5&&p.params[0]===9&&p.params[1]===3)).toBe(true);
   const source=decodeLightingDomain(Buffer.from(vectors.codec.valid.find(v=>v.name==='standard').hex,'hex'));
   // Match the preview's selected stored identity, then exercise the exact
   // browser-built message through the app's authoritative core editor.
   const stored=JSON.parse(message.expectedRule);source.rules[0]={flags:stored[0],brightness:stored[1],parts:stored[2]};
   const bytes=encodeLightingDomain(source);const actual=decodeLightingDomain(editLightingRule(bytes,{...message,index:0,expectedRule:ruleIdentity(source.rules[0])},{capabilities:lightingCapabilities()}));
   expect(actual.rules[0].parts).toEqual(message.rule.parts);
  }
 });
 test(`filters, negation, target queries, paint, background and timing really post (${theme})`,async({page})=>{
  await openControls(page,'lighting',{},theme);
  await field(page,':condition:0:kind').selectOption('13');await field(page,':condition:0:parameter:0').selectOption('127');
  await page.getByRole('button',{name:'Add a filter',exact:true}).click();
  await field(page,':condition:1:kind').selectOption('16');await field(page,':condition:1:parameter:0').selectOption('2');
  await page.locator('.lighting-configuration [data-f$=":condition:1:not"]').locator("..").click();
  await field(page,':slot:2:kind').selectOption('8');await field(page,':slot:2:parameter:0').selectOption('12');await field(page,':slot:2:parameter:1').selectOption('127');
  await field(page,':slot:3:kind').selectOption('9');await field(page,':slot:4:kind').selectOption('5');await field(page,':slot:4:parameter:0').selectOption('177');
  await change(field(page,':timing:1'),777);await change(field(page,':timing:2'),999);
  await clearPosts(page);await save(page);
  const message=(await posted(page))[0];expect(message.rule.parts).toEqual(expect.arrayContaining([{slot:0,kind:13,params:[127]},{slot:1,kind:16,params:[2]},{slot:2,kind:8,params:[12,127]},{slot:3,kind:9,params:[]},{slot:4,kind:5,params:[177]},{slot:5,kind:1,params:[9,3]},{slot:5,kind:2,params:[231,3]}]));
  await page.locator('.lighting-condition').filter({has:page.locator('[data-f$=":condition:1:kind"]')}).getByRole('button',{name:'Remove condition'}).click();await clearPosts(page);await save(page);expect((await posted(page))[0].rule.parts.filter(p=>p.slot<2)).toHaveLength(1);
  await clearPosts(page);await page.getByRole('button',{name:'Add rule',exact:true}).click();expect((await posted(page))[0]).toMatchObject({type:'editLightingRule',action:'add'});
 });
}

test('capability absence and unknown model give no invented controls or capacity',async({page})=>{
 await openControls(page,'lighting');await publishAccepted(page,['rgb','lighting','supportedFacts'],[1]);
 await publishAccepted(page,['rgb','lighting','supportedTimings'],[]);
 await expect(page.locator('.lighting-configuration [data-f*="timing:"]')).toHaveCount(0);
 await expect(field(page,':condition:0:kind').locator('option[value="28"]')).toHaveCount(0);
 await publishAccepted(page,['rgb','lighting','working'],{required:null,bank:null,maximum:null,admitted:false,reason:'The keyboard has not reported a supported working-memory model for flashes and linger.',contributors:[]});
 await expect(page.locator('.lighting-working-memory')).toContainText('has not reported');await expect(page.locator('.lighting-working-memory')).not.toContainText('8,220');
});

test('situation controls drive local event windows and never post edits',async({page})=>{
 await openControls(page,'lighting');await page.locator('.situation-controls summary').click();
 const program={formatVersion:5,palette:[{h:0,s:255,v:200}],things:[],keySets:[],maps:[],extensions:[],rules:[{flags:0,brightness:255,parts:[{slot:0,kind:28,params:[127]},{slot:1,kind:16,params:[0]},{slot:2,kind:4,params:[]},{slot:3,kind:2,params:[0]},{slot:5,kind:1,params:[200,0]},{slot:5,kind:3,params:[244,1]}]}]};
 await publishAccepted(page,['rgb','lighting','program'],program);
 await page.locator('[data-f="situation:event:kind"]').selectOption('28');await page.locator('[data-f="situation:event:parameter:0"]').selectOption('127');
 await change(page.locator('[data-f="situation:event:owners"]'),'0,56,59');await clearPosts(page);await page.locator('[data-fire-event]').click();
 await expect(page.locator('[data-sim-led="0"]')).toHaveAttribute('data-colour','-');
 await change(page.locator('[data-f="situation:advance"]'),200);await page.locator('[data-advance]').click();
 await expect(page.locator('[data-sim-led="0"]')).toHaveAttribute('data-colour','c80000');await expect(page.locator('[data-sim-led="55"]')).toHaveAttribute('data-colour','c80000');
 await page.locator('[data-f="situation:add-kind"]').selectOption('16');await page.locator('[data-add-state]').click();await page.locator('[data-show-situation]').click();
 // Filter changes after occurrence do not erase a qualified flash.
 await expect(page.locator('[data-sim-led="0"]')).toHaveAttribute('data-colour','c80000');await page.locator('[data-fire-event]').click();
 await change(page.locator('[data-f="situation:advance"]'),300);await page.locator('[data-advance]').click();await expect(page.locator('[data-sim-led="0"]')).toHaveAttribute('data-colour','-');
 await page.locator('[data-reset]').click();await expect(page.locator('.lighting-situation')).toContainText('0 ms');
 await page.locator('.lighting-chips [data-remove]').click();expect(await posted(page)).toEqual([]);
 await expect(page.locator('.lighting-situation')).toContainText('no LED association for matrix key 59');
});

for(const theme of ['vscode-dark','vscode-light'])test(`actual demo draft accepts event edits, Undo, Review and backup (${theme})`,async({page})=>{
 await page.goto('/dist/web/index.html');await page.locator('[data-act="explore-demo"]').click();await expect(page.locator('.bench-tablist')).toBeVisible();
 const fs=require('node:fs'),html=fs.readFileSync(`preview/${theme}.html`,'utf8'),style=html.match(/<style>([\s\S]*?)<\/style>/)?.[1];if(style){await page.route('**/facts-host.css',route=>route.fulfill({contentType:'text/css',body:style}));await page.addStyleTag({url:'/preview/facts-host.css'});}
 const wanted=theme==='vscode-dark'?'dark':'light';if(await page.locator('[data-act="theme"]').getAttribute('data-theme-now')!==wanted)await page.locator('[data-act="theme"]').click();
 await page.locator('[data-screen="lighting"]').click();await page.getByRole('button',{name:'Add rule',exact:true}).click();await expect(field(page,':brightness')).toHaveValue('255');
 await page.getByRole('button',{name:'Add a condition',exact:true}).click();await field(page,':condition:0:kind').selectOption('28');await field(page,':condition:0:parameter:0').selectOption('127');await field(page,':slot:3:kind').selectOption('9');await change(field(page,':timing:3'),777);await save(page);
 await expect(page.locator('.lighting-rule-list')).toContainText('Macro played');await expect(field(page,':timing:3')).toHaveValue('777');
 await page.locator('[data-act="undo"]').click();await expect(page.locator('.lighting-rule-list')).not.toContainText('Macro played');await page.locator('[data-act="redo"]').click();await expect(page.locator('.lighting-rule-list')).toContainText('Macro played');
 await page.locator('.commit [data-act="review"]').click();await expect(page.locator('.sheet')).toContainText('Macro played');
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('.sheet [data-act="export"]').click()]);const chunks=await (await download.createReadStream()).toArray(),file=JSON.parse(Buffer.concat(chunks).toString('utf8'));const p=require('../core/model/portable-profile').validateSnapshot(file).rgb;
 expect(p.rules[0].parts).toEqual(expect.arrayContaining([{slot:0,kind:28,params:[127]},{slot:3,kind:9,params:[]},{slot:5,kind:3,params:[9,3]}]));
});
