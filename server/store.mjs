import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { seedContacts, defaultQueues } from './seed.mjs';
mkdirSync('data',{recursive:true,mode:0o700});
export const db=new DatabaseSync(process.env.RELAY_DB||'data/relay.sqlite');
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
export const get=(key,fallback=null)=>{const row=db.prepare('SELECT value FROM kv WHERE key=?').get(key);return row?JSON.parse(row.value):fallback;};
export const put=(key,value)=>db.prepare('INSERT INTO kv (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));
if(!get('contacts')) {put('contacts',seedContacts());put('queues',defaultQueues);put('mode','demo');put('overrides',{});put('cache',{});put('audit',[]);}
// Add newly requested queues to existing workspaces without replacing custom queues or memberships.
const savedQueues=get('queues',[]);
const missingQueues=defaultQueues.filter(q=>!savedQueues.some(saved=>saved.id===q.id));
if(missingQueues.length) put('queues',[...savedQueues,...missingQueues]);
export function audit(action,contactId,details) {const entries=get('audit',[]);entries.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),actor:'Local coordinator',action,contactId,details});put('audit',entries.slice(0,1000));}
