import { contactSchema } from './crm.mjs';

const ROOT='https://services.leadconnectorhq.com';
const iso=v=>v && !Number.isNaN(new Date(v).getTime())?new Date(v).toISOString():null;
const id=v=>encodeURIComponent(v);
export function normalizeHighLevelContact(raw,{notes=[],messages=[],opportunities=[],invoices=[],transactions=[],staff=[]},fields={},now=new Date()) {
  const cf=Object.fromEntries((raw.customFields||[]).map(f=>[f.id,f.value??f.fieldValue]));
  const field=name=>cf[fields[name]];
  const consultDate=iso(field('consultDate')),surgeryDate=iso(field('surgeryDate'));
  const restricted=raw.dnd||Object.values(raw.dndSettings||{}).some(d=>d?.status==='active');
  const status=restricted?'do_not_contact':String(field('status')||(surgeryDate?'surgery_booked':consultDate?'consult_completed':raw.type==='lead'?'new_lead':'unclassified'));
  const normalizedNotes=notes.map(n=>({id:String(n.id||n._id),text:String(n.bodyText||n.body||n.text||''),...(n.userId?{userId:n.userId}:{}),...(iso(n.dateAdded)?{at:iso(n.dateAdded)}:{})}));
  // Preserve opportunities and custom fields as evidence without guessing stage meanings.
  for(const o of opportunities)normalizedNotes.push({id:`opportunity:${o.id}`,text:JSON.stringify({name:o.name,status:o.status,pipelineId:o.pipelineId,pipelineStageId:o.pipelineStageId,monetaryValue:o.monetaryValue})});
  for(const f of raw.customFields||[])normalizedNotes.push({id:`field:${f.id}`,text:JSON.stringify({fieldId:f.id,value:f.value??f.fieldValue})});
  const normalizedMessages=messages.map(m=>({id:String(m.id),direction:m.direction==='outbound'?'outbound':'inbound',at:iso(m.dateAdded)||iso(raw.dateUpdated)||iso(raw.dateAdded)||now.toISOString(),text:String(m.body||m.transcript||''),...(m.userId?{userId:m.userId}:{}),...(m.source?{source:m.source}:{})})).filter(m=>m.text).sort((a,b)=>new Date(a.at)-new Date(b.at));
  const normalizedInvoices=invoices.filter(i=>['sent','partially_paid','paid','void'].includes(i.status)).map(i=>({id:String(i._id||i.id),description:i.name||i.title||'Invoice',amountDue:Number(i.amountDue),currency:String(i.currency||'').toUpperCase(),status:({sent:'open',partially_paid:'open',paid:'paid',void:'void'})[i.status],dueAt:iso(i.dueDate),paymentUrl:i.invoiceUrl||null}));
  // Missing amounts or due dates must fail validation, never become assumed debt.
  const normalizedTransactions=transactions.map(t=>({id:String(t._id||t.id),status:typeof t.status==='string'?t.status:(t.status?.status||t.status?.value),amount:Number(t.amount)})).filter(t=>['succeeded','failed','pending','refunded'].includes(t.status));
  return contactSchema.parse({id:raw.id,name:raw.name||[raw.firstName,raw.lastName].filter(Boolean).join(' ')||'Unnamed contact',phone:raw.phone||'',email:raw.email||'',procedure:String(field('procedure')||'Not specified'),source:raw.source||'GoHighLevel',owner:staff.find(p=>p.id===raw.assignedTo)?.name||raw.assignedTo||'Unassigned',ownerId:raw.assignedTo||null,staff,avatar:0,status,doNotContact:!!restricted,consultDate,followUpAt:iso(field('followUpAt')),surgeryDate,opportunityValue:opportunities.reduce((s,o)=>s+(Number(o.monetaryValue)||0),0),lastTouch:normalizedMessages.at(-1)?.at||iso(raw.lastActivity)||iso(raw.dateUpdated)||iso(raw.dateAdded)||now.toISOString(),updatedAt:iso(raw.dateUpdated)||iso(raw.dateAdded)||now.toISOString(),messages:normalizedMessages,notes:normalizedNotes,invoices:normalizedInvoices,transactions:normalizedTransactions});
}
export async function pullHighLevel({token,locationId,fieldMap={},onProgress=()=>{},request=fetch}) {
  if(!token||!locationId)throw new Error('Add GHL_API_KEY and GHL_LOCATION_ID to .env first.');
  async function call(path,params={},body){const url=new URL(ROOT+path);for(const [k,v] of Object.entries(params))if(v!==undefined)url.searchParams.set(k,String(v));
    for(let attempt=0;attempt<4;attempt++){
      const r=await request(url,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,Version:'v3','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000),redirect:'error'});
      if(r.status===429&&attempt<3){await new Promise(resolve=>setTimeout(resolve,Math.min(5000,Number(r.headers.get('retry-after')||1)*1000)*(attempt+1)));continue;}
      if(!r.ok)throw new Error(`GoHighLevel ${path} returned ${r.status}. Check token scopes; existing records were preserved.`);
      return r.json();
    }
  }
  const staffCache=new Map();
  function getStaff(userId){
    if(!staffCache.has(userId))staffCache.set(userId,(async()=>{
      try {const user=await call(`/users/${id(userId)}`);const name=user.name||[user.firstName,user.lastName].filter(Boolean).join(' ');return name?{id:userId,name}:null;}
      catch{return null;} // Missing users.readonly does not discard the entire CRM sync.
    })());
    return staffCache.get(userId);
  }
  async function offsetPages(path,key,params){const items=[];for(let offset=0;offset<100000;offset+=100){const r=await call(path,{...params,limit:100,offset});if(!Array.isArray(r[key]))throw new Error(`Unexpected GoHighLevel response for ${path}`);items.push(...r[key]);if(r[key].length<100)return items;}throw new Error(`Pagination limit reached: ${path}`);}
  const rawContacts=[];let searchAfter;const seen=new Set();
  for(let page=0;page<1000;page++){
    const result=await call('/contacts/search',{}, {locationId,pageLimit:100,fastPagination:true,...(searchAfter?{searchAfter}:{page:1})});
    if(!Array.isArray(result.contacts))throw new Error('Unexpected GoHighLevel contacts response');
    for(const c of result.contacts){if(seen.has(c.id))throw new Error('GoHighLevel returned repeated contacts');seen.add(c.id);rawContacts.push(c);}
    if(!result.contacts.length||result.hasMore===false||result.contacts.length<100)break;
    searchAfter=result.contacts.at(-1).searchAfter;if(!searchAfter)throw new Error('GoHighLevel omitted the pagination cursor');
    if(page===999)throw new Error('Contact pagination limit reached');
  }
  const [invoices,transactions]=await Promise.all([offsetPages('/invoices','invoices',{altId:locationId,altType:'location',paymentMode:'live'}),offsetPages('/payments/transactions','data',{altId:locationId,altType:'location',paymentMode:'live'})]);
  let index=0,done=0;const contacts=[];
  await Promise.all(Array.from({length:2},async()=>{while(index<rawContacts.length){const raw=rawContacts[index++];
    const [noteResult,convResult]=await Promise.all([call(`/contacts/${id(raw.id)}/notes`),call('/conversations/search',{locationId,contactId:raw.id,limit:100})]);
    if(!Array.isArray(noteResult.notes)||!Array.isArray(convResult.conversations))throw new Error('GoHighLevel omitted notes or conversations');
    if(convResult.conversations.length===100)throw new Error('A contact has over 100 conversations; extend conversation pagination before syncing.');
    const opportunities=[];for(let page=1;page<=100;page++){const o=await call('/opportunities/search',{locationId,contactId:raw.id,limit:100,page});if(!Array.isArray(o.opportunities))throw new Error('Missing opportunities');opportunities.push(...o.opportunities);if(o.opportunities.length<100)break;if(page===100)throw new Error('Opportunity pagination limit reached');}
    const messages=[];for(const conv of convResult.conversations){let lastMessageId;const cursors=new Set();for(let p=0;p<1000;p++){const m=await call(`/conversations/${id(conv.id)}/messages`,{limit:100,lastMessageId});if(!Array.isArray(m.messages?.messages))throw new Error('Missing message history');messages.push(...m.messages.messages);if(!m.messages.nextPage)break;lastMessageId=m.messages.lastMessageId;if(!lastMessageId||cursors.has(lastMessageId))throw new Error('Invalid message pagination cursor');cursors.add(lastMessageId);if(p===999)throw new Error('Message pagination limit reached');}}
    const staffIds=[...new Set([raw.assignedTo,...messages.map(m=>m.userId),...noteResult.notes.map(n=>n.userId)].filter(Boolean))];
    const staff=(await Promise.all(staffIds.map(getStaff))).filter(Boolean);
    contacts.push(normalizeHighLevelContact(raw,{staff,notes:noteResult.notes,messages,opportunities,invoices:invoices.filter(i=>i.contactDetails?.id===raw.id||i.contactDetails?.contactId===raw.id),transactions:transactions.filter(t=>t.contactId===raw.id)},fieldMap));onProgress(++done,rawContacts.length);
  }}));return contacts.sort((a,b)=>new Date(b.lastTouch)-new Date(a.lastTouch));
}
