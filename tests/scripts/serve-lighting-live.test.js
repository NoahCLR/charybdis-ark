"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {liveBench}=require('../../scripts/serve-lighting-live'),{serve}=require('../../scripts/serve');
const {buildProfileGetRequest}=require('../../core/protocol/profile-wire-v1');
test('explicit fake bench bounds reports and runs without native HID or built product artifacts',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ark-live-bench-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const dir of ['dist/web','preview','browser-tests'])fs.mkdirSync(path.join(root,dir),{recursive:true});
 fs.writeFileSync(path.join(root,'dist/web/index.html'),'<html><head><link rel="stylesheet" href="./styles.css"></head><body><div id="root"></div></body></html>');
 for(const theme of ['dark','light'])fs.writeFileSync(path.join(root,`preview/vscode-${theme}.html`),'<style>@layer host {body{padding:0 20px}}</style>');
 fs.copyFileSync(path.join(__dirname,'../../browser-tests/fake-hid.js'),path.join(root,'browser-tests/fake-hid.js'));
 const server=await serve(root,0,{handle:liveBench(root)});t.after(()=>new Promise(r=>server.close(r)));const url=`http://127.0.0.1:${server.address().port}`;
 const html=await fetch(url+'/__lighting-live/bench.html?theme=light').then(r=>r.text());assert.match(html,/vscode-light/);assert.match(html,/\/dist\/web\/styles.css/);assert.match(html,/boot.js/);
 const post=body=>fetch(url+'/__lighting-live/report',{method:'POST',body:JSON.stringify(body)});
 for(const input of [[],Array(33).fill(0),Array(32).fill(256),{}])assert.equal((await post(input)).status,400);
 const reports=await post([...buildProfileGetRequest(13,16,1)]).then(r=>r.json());assert.equal(reports[0][6],25);assert.equal(reports[0][7],1);
 const status=await fetch(url+'/__lighting-live/status').then(r=>r.json());assert.equal(status.mutations,0);assert.equal(status.displayed,null);
});
