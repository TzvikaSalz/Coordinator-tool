import { z } from 'zod';
const date=z.string().datetime({offset:true});
export const contactSchema=z.object({
  id:z.string().min(1),name:z.string().min(1),phone:z.string().default(''),email:z.string().default(''),procedure:z.string().default('Not specified'),source:z.string().default('CRM'),owner:z.string().default('Unassigned'),ownerId:z.string().nullable().optional(),staff:z.array(z.object({id:z.string(),name:z.string()})).default([]),avatar:z.number().int().min(0).max(7).default(0),lastTouch:date,status:z.string(),doNotContact:z.boolean().default(false),consultDate:date.nullable().default(null),followUpAt:date.nullable().default(null),surgeryDate:date.nullable().default(null),opportunityValue:z.number().nonnegative().default(0),updatedAt:date,objection:z.string().optional(),surgeon:z.string().optional(),filterReason:z.string().optional(),
  messages:z.array(z.object({id:z.string(),direction:z.enum(['inbound','outbound']),at:date,text:z.string(),userId:z.string().optional(),source:z.string().optional()})),notes:z.array(z.object({id:z.string(),text:z.string(),userId:z.string().optional(),at:date.optional()})),invoices:z.array(z.object({id:z.string(),description:z.string(),amountDue:z.number().nonnegative(),currency:z.string().length(3),status:z.enum(['open','overdue','paid','void']),dueAt:date,paymentUrl:z.string().url().nullable().default(null)})),transactions:z.array(z.object({id:z.string(),status:z.enum(['succeeded','failed','pending','refunded']),amount:z.number().nonnegative()}))
});
export async function pullContacts(baseUrl,key) {
  if(!baseUrl||!key) throw new Error('CRM connection needs both CRM_BASE_URL and CRM_API_KEY in .env.');
  const url=new URL(baseUrl);if(!['https:','http:'].includes(url.protocol)) throw new Error('Unsupported CRM URL');
  if(url.protocol==='http:'&&!['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('CRM connections require HTTPS');
  let cursor;const contacts=[];const seen=new Set();
  for(let page=0;page<1000;page++) {
    const endpoint=new URL(url.toString().replace(/\/$/,'')+'/contacts');endpoint.searchParams.set('limit','100');if(cursor)endpoint.searchParams.set('cursor',cursor);
    const res=await fetch(endpoint,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(30000),redirect:'error'});
    if(!res.ok) throw new Error(`CRM returned ${res.status}; existing records were preserved.`);
    const result=z.object({contacts:z.array(contactSchema),nextCursor:z.string().nullable().optional()}).parse(await res.json());
    contacts.push(...result.contacts);if(!result.nextCursor) {
      if(new Set(contacts.map(c=>c.id)).size!==contacts.length) throw new Error('CRM returned duplicate contact IDs');
      return contacts;
    }
    if(seen.has(result.nextCursor))throw new Error('CRM pagination repeated a cursor');seen.add(result.nextCursor);cursor=result.nextCursor;
  }
  throw new Error('CRM sync exceeded the pagination limit');
}
