import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { z } from 'zod';
import { db,get,put,audit } from './store.mjs';
import { classify,fingerprint,hardExclusion,localDecision,outstanding } from './classifier.mjs';
import { pullContacts } from './crm.mjs';
import { coordinatorTeam,detectCoordinator } from './coordinator.mjs';
import { pullHighLevel } from './highlevel.mjs';

const app=express();app.disable('x-powered-by');app.use(express.json({limit:'2mb'}));
app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');const host=(req.get('host')||'').split(':')[0];if(!['localhost','127.0.0.1'].includes(host))return res.status(403).json({error:'This local workspace only accepts localhost requests'});const origin=req.get('origin');if(origin&&new URL(origin).host!==req.get('host'))return res.status(403).json({error:'Cross-origin requests are not allowed'});next();});
const settings=()=>get('settings',{model:process.env.OPENAI_MODEL||'gpt-6-luna',reviewModel:process.env.OPENAI_REVIEW_MODEL||'gpt-6.1-sol',threshold:Number(process.env.AI_CONFIDENCE_THRESHOLD)||0.8});
let job={running:false,done:0,total:0,error:null,finishedAt:null};
function enriched() { const queues=get('queues');const cache=get('cache',{});const overrides=get('overrides',{});const contacts=get('contacts');const team=coordinatorTeam(contacts);const coordinatorOverrides=get('coordinatorOverrides',{});return contacts.map(c=>{
  const cached=cache[c.id];const analysis=cached?.fingerprint===fingerprint(c,queues,settings())?cached.decision:localDecision(c,queues);
  const primaryCoordinator=detectCoordinator(c,team,coordinatorOverrides[c.id]);
  const override=overrides[c.id];const queueIds=hardExclusion(c)?[]:override?override.queueIds:analysis.needsReview?[]:analysis.queueIds;
  return {...c,primaryCoordinator,owner:primaryCoordinator.name,analysis,queueIds,override:override||null,outstanding:outstanding(c).reduce((sum,i)=>sum+i.amountDue,0)};
}); }
const crmConfigured=()=>!!((process.env.GHL_API_KEY&&process.env.GHL_LOCATION_ID)||(process.env.CRM_API_KEY&&process.env.CRM_BASE_URL));
app.get('/api/state',(req,res)=>res.json({contacts:enriched(),team:coordinatorTeam(get('contacts')),queues:get('queues'),settings:settings(),mode:get('mode'),aiConfigured:!!process.env.OPENAI_API_KEY,crmConfigured:crmConfigured(),job,audit:get('audit',[]).slice(0,50),lastSync:get('lastSync')}));
async function analyzeAll(contacts,queues) {const cache={...get('cache',{})};job.total=contacts.length;
  // Bounded concurrency avoids bursts against provider rate limits.
  let idx=0;const errors=[];
  await Promise.all(Array.from({length:3},async()=>{while(idx<contacts.length){const c=contacts[idx++];try{const key=fingerprint(c,queues,settings());if(cache[c.id]?.fingerprint!==key) cache[c.id]={fingerprint:key,decision:await classify(c,queues,settings(),process.env.OPENAI_API_KEY)};}catch(e){errors.push(`${c.name}: ${e.message}`);cache[c.id]={fingerprint:fingerprint(c,queues,settings()),decision:{queueIds:[],reason:'Analysis needs review',evidence:[],confidence:0,needsReview:true,method:'error'}};}job.done++;}}));
  put('cache',cache);if(errors.length)job.error=`${errors.length} records need review. ${errors[0]}`;
}
app.post('/api/sync',async(req,res,next)=>{if(job.running)return res.status(409).json({error:'A sync is already running'});const {source}=z.object({source:z.enum(['demo','crm'])}).parse(req.body);if(source==='crm'&&!crmConfigured())return res.status(400).json({error:'Add the GoHighLevel connection details to .env first'});
  if(source==='demo'&&get('mode')!=='demo')return res.status(400).json({error:'Demo sync cannot replace CRM records'});
  job={running:true,done:0,total:0,error:null,finishedAt:null};res.status(202).json({started:true});
  try {const contacts=source==='crm'?(process.env.GHL_API_KEY?await pullHighLevel({token:process.env.GHL_API_KEY,locationId:process.env.GHL_LOCATION_ID,fieldMap:JSON.parse(process.env.GHL_FIELD_MAP||'{}'),onProgress:(done,total)=>{job.done=done;job.total=total;}}):await pullContacts(process.env.CRM_BASE_URL,process.env.CRM_API_KEY)):get('contacts');
    job.done=0;
    await analyzeAll(contacts,get('queues'));
    db.exec('BEGIN');try {put('contacts',contacts);put('mode',source);put('lastSync',new Date().toISOString());audit('sync',null,`${contacts.length} ${source} records reviewed`);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  }catch(e){job.error=e.message;}finally{job.running=false;job.finishedAt=new Date().toISOString();}
});
const queueSchema=z.object({name:z.string().trim().min(2).max(70),include:z.string().trim().min(10).max(2000),exclude:z.string().max(2000),action:z.enum(['Call','Review','Text','Payment link','Booking link']),owner:z.enum(['Original owner','Round robin','Sarah Wilson','Daniel Ross','Anna Miller'])});
async function previewQueue(q) {const contacts=get('contacts');const queues=[...get('queues'),{...q,id:'preview',color:'purple'}];const matches=[];
  if(process.env.OPENAI_API_KEY) {for(const c of contacts){const result=await classify(c,queues,settings(),process.env.OPENAI_API_KEY);if(result.queueIds.includes('preview'))matches.push({id:c.id,name:c.name,avatar:c.avatar,reason:result.reason,needsReview:result.needsReview});}}
  else {const keywords=q.include.toLowerCase().match(/botox|filler|touch.up|injectable|financing|rhinoplasty|facelift|tummy tuck|breast|lipo|bbl/g)||[];
    for(const c of contacts){if(hardExclusion(c))continue;const text=JSON.stringify([c.procedure,c.messages,c.notes]).toLowerCase();if(keywords.some(k=>text.includes(k)))matches.push({id:c.id,name:c.name,avatar:c.avatar,reason:`Sample keyword match in ${c.procedure.toLowerCase()} or conversation`,needsReview:false});}
  }return {matches,method:process.env.OPENAI_API_KEY?'AI preview':'Sample keyword preview',warning:process.env.OPENAI_API_KEY?null:'Demo preview matches selected procedure words only. Natural-language inclusion and exclusion rules require an AI key.'};
}
app.post('/api/queues/preview',async(req,res)=>{if(job.running)return res.status(409).json({error:'Wait for the current sync to finish'});const q=queueSchema.parse(req.body);const result=await previewQueue(q);const token=crypto.randomUUID();put('preview',{token,queue:q,matches:result.matches,at:Date.now()});res.json({...result,token});});
app.post('/api/queues',(req,res)=>{if(job.running)return res.status(409).json({error:'Wait for the current sync to finish'});const body=z.object({token:z.string(),acceptedIds:z.array(z.string())}).parse(req.body);const preview=get('preview');if(!preview||preview.token!==body.token||Date.now()-preview.at>1800000)return res.status(409).json({error:'Preview the rules again before creating the queue'});
  const allowed=new Set(preview.matches.map(m=>m.id));if(body.acceptedIds.some(id=>!allowed.has(id)))return res.status(400).json({error:'Invalid preview selection'});
  const q={...preview.queue,id:crypto.randomUUID(),color:'purple',builtin:false};put('queues',[...get('queues'),q]);const overrides=get('overrides',{});const team=[...new Set(get('contacts').map(c=>c.owner).filter(o=>o!=='Unassigned'))];let assigned=0;for(const c of enriched()){if(body.acceptedIds.includes(c.id))overrides[c.id]={queueIds:[...c.queueIds,q.id],owner:q.owner==='Round robin'?(team[assigned++%team.length]||c.owner):q.owner==='Original owner'?c.owner:q.owner,reason:'Confirmed during queue preview',at:new Date().toISOString()};}put('overrides',overrides);audit('queue_created',null,q.name);res.status(201).json(q);
});
app.post('/api/contacts/:id/move',(req,res)=>{if(job.running)return res.status(409).json({error:'Wait for the current sync to finish'});const c=get('contacts').find(c=>c.id===req.params.id);if(!c)return res.status(404).json({error:'Contact not found'});const {queueId,reason}=z.object({queueId:z.string().nullable(),reason:z.string().trim().min(3).max(500)}).parse(req.body);if(queueId&&!get('queues').some(q=>q.id===queueId))return res.status(400).json({error:'Queue does not exist'});if(queueId&&hardExclusion(c))return res.status(400).json({error:'Resolve the CRM contact restriction before adding this contact to a sales queue'});if(queueId==='collect'&&!outstanding(c).length)return res.status(400).json({error:'A verified due invoice is required for the Collect queue'});const overrides=get('overrides',{});overrides[c.id]={queueIds:queueId?[queueId]:[],reason,at:new Date().toISOString()};put('overrides',overrides);audit('queue_override',c.id,{queueId,reason});res.json({ok:true});});
app.delete('/api/contacts/:id/override',(req,res)=>{const overrides=get('overrides',{});delete overrides[req.params.id];put('overrides',overrides);audit('override_cleared',req.params.id,null);res.json({ok:true});});
app.put('/api/contacts/:id/coordinator',(req,res)=>{
  if(!get('contacts').some(c=>c.id===req.params.id))return res.status(404).json({error:'Contact not found'});
  const {personId,reason}=z.object({personId:z.string().min(1),reason:z.string().trim().min(3).max(500)}).parse(req.body);
  if(!coordinatorTeam(get('contacts')).some(p=>p.id===personId))return res.status(400).json({error:'Select a known staff member'});
  const overrides=get('coordinatorOverrides',{});overrides[req.params.id]={personId,reason,at:new Date().toISOString()};put('coordinatorOverrides',overrides);audit('coordinator_confirmed',req.params.id,{personId,reason});res.json({ok:true});
});
app.delete('/api/contacts/:id/coordinator',(req,res)=>{const overrides=get('coordinatorOverrides',{});delete overrides[req.params.id];put('coordinatorOverrides',overrides);audit('coordinator_detection_restored',req.params.id,null);res.json({ok:true});});
app.put('/api/settings',(req,res)=>{if(job.running)return res.status(409).json({error:'Wait for the current sync to finish'});const s=z.object({model:z.string().regex(/^[a-zA-Z0-9.\-_]+$/),reviewModel:z.string().regex(/^[a-zA-Z0-9.\-_]+$/),threshold:z.number().min(0.5).max(1)}).parse(req.body);put('settings',s);audit('settings_updated',null,s);res.json({ok:true});});
app.use('/api',(req,res)=>res.status(404).json({error:'Endpoint not found'}));
app.use((err,req,res,next)=>res.status(err instanceof z.ZodError?400:500).json({error:err instanceof z.ZodError?'Invalid request. Check the required fields.':err.message}));
if(process.env.NODE_ENV==='production'){app.use(express.static('dist/client'));app.get('/{*path}',(req,res)=>res.sendFile('index.html',{root:'dist/client'}));}
else {const vite=await createViteServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);}
const port=Number(process.env.PORT)||4180;app.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Relay is ready at http://localhost:${port}`));
