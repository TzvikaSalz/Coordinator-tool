import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('local API persists corrections, verifies queue previews, and protects collection and DND',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'relay-test-'));const port=24180;
  const proc=spawn(process.execPath,['--experimental-sqlite','server/index.mjs'],{env:{...process.env,PORT:String(port),RELAY_DB:join(dir,'test.sqlite'),OPENAI_API_KEY:'',GHL_API_KEY:'',GHL_LOCATION_ID:'',CRM_API_KEY:'',CRM_BASE_URL:''},stdio:'ignore'});
  const request=async(path,body,method)=>{const r=await fetch(`http://127.0.0.1:${port}/api${path}`,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};};
  try{
    let ready=false;for(let i=0;i<80;i++){try{if((await request('/state')).status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.equal(ready,true);
    let s=(await request('/state')).body;assert.equal(s.contacts.length,39);assert.equal(s.crmConfigured,false);assert.equal(s.aiConfigured,false);assert.ok(!JSON.stringify(s).includes('GHL_API_KEY'));
    assert.equal((await request('/contacts/new-1/move',{queueId:'collect',reason:'No verified invoice'})).status,400);
    assert.equal((await request('/contacts/filtered-14/move',{queueId:'new',reason:'Should stay excluded'})).status,400);
    assert.equal((await request('/contacts/new-1/move',{queueId:null,reason:'Coordinator reviewed this contact'})).status,200);
    s=(await request('/state')).body;assert.deepEqual(s.contacts.find(c=>c.id==='new-1').queueIds,[]);
    await request('/contacts/new-1/override',null,'DELETE');s=(await request('/state')).body;assert.deepEqual(s.contacts.find(c=>c.id==='new-1').queueIds,['new']);
    const p=(await request('/queues/preview',{name:'Rhinoplasty follow-up',include:'People interested in rhinoplasty',exclude:'Do not contact',action:'Call',owner:'Original owner'})).body;assert.ok(p.matches.length>0);assert.ok(p.warning);
    assert.equal((await request('/queues',{token:p.token,acceptedIds:['fabricated']})).status,400);
    const q=await request('/queues',{token:p.token,acceptedIds:[p.matches[0].id]});assert.equal(q.status,201);s=(await request('/state')).body;assert.ok(s.queues.some(x=>x.id===q.body.id));assert.ok(s.contacts.find(c=>c.id===p.matches[0].id).queueIds.includes(q.body.id));
    const cross=await fetch(`http://127.0.0.1:${port}/api/state`,{headers:{Origin:'https://example.com'}});assert.equal(cross.status,403);
    assert.equal((await request('/sync',{source:'crm'})).status,400);
    assert.equal((await request('/contacts/new-1/coordinator',{personId:'invented',reason:'Invalid person'},'PUT')).status,400);
    assert.equal((await request('/contacts/new-1/coordinator',{personId:'Anna Miller',reason:'Confirmed handoff'},'PUT')).status,200);
    s=(await request('/state')).body;assert.equal(s.contacts.find(c=>c.id==='new-1').primaryCoordinator.name,'Anna Miller');
    await request('/contacts/new-1/coordinator',null,'DELETE');
    assert.equal((await request('/state')).body.contacts.find(c=>c.id==='new-1').primaryCoordinator.name,'Sarah Wilson');

    assert.equal((await request('/settings',{model:'gpt-6-luna',reviewModel:'gpt-6.1-sol',threshold:.9},'PUT')).status,200);
    assert.equal((await request('/state')).body.settings.threshold,.9);
  } finally{proc.kill('SIGTERM');await new Promise(r=>proc.on('exit',r));await rm(dir,{recursive:true,force:true});}
});
