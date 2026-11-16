// Attribution uses CRM identities, not names mentioned in patient messages.
export function coordinatorTeam(contacts) {
  const team=new Map();
  for(const c of contacts) {
    for(const person of c.staff||[]) if(person.id&&person.name)team.set(person.id,person);
    if(!c.ownerId&&c.owner&&c.owner!=='Unassigned')team.set(c.owner,{id:c.owner,name:c.owner});
  }
  return [...team.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
export function detectCoordinator(c,team,override,now=new Date()) {
  const people=new Map(team.map(p=>[p.id,p]));
  const result=(personId,method,confidence,reason,evidence,needsReview=false,candidates=[])=>({personId,name:people.get(personId)?.name||personId||'Unassigned',method,confidence,reason,evidence,needsReview,candidates});
  if(override) return result(override.personId,'manual',1,override.reason,[{sourceId:'coordinator-override',detail:`Confirmed by coordinator on ${override.at}`}]);
  const assigned=c.ownerId||(c.owner!=='Unassigned'?c.owner:null);
  const scores=new Map(), evidence=new Map(),seen=new Set();
  function add(personId,sourceId,at,weight,detail) {
    if(!people.has(personId)||seen.has(sourceId))return;
    const age=at?(now-new Date(at))/86400000:null;
    if(age!==null&&(!Number.isFinite(age)||age<0||age>90))return;
    seen.add(sourceId);scores.set(personId,(scores.get(personId)||0)+weight*(age===null?.4:age<=14?1:age<=30?.6:.25));
    evidence.set(personId,[...(evidence.get(personId)||[]),{sourceId,detail,at:at||null}]);
  }
  for(const m of c.messages)if(m.direction==='outbound'&&m.source==='app')add(m.userId,m.id,m.at,3,'Manually sent outbound message');
  for(const n of c.notes)if(n.userId)add(n.userId,n.id,n.at,1,'Authored a CRM note');
  const ranked=[...scores].sort((a,b)=>b[1]-a[1]);
  const candidates=ranked.map(([id,score])=>({personId:id,name:people.get(id).name,score:Math.round(score*10)/10}));
  if(assigned) {
    const conflict=ranked.length&&ranked[0][0]!==assigned&&ranked[0][1]>=6;
    return result(assigned,'crm',people.has(assigned)?1:.5,conflict?'CRM owner differs from the staff member doing most recent follow-up. Review the assignment.':'Assigned owner in the CRM.',[{sourceId:'crm-owner',detail:`CRM assigned user: ${assigned}`},...(evidence.get(assigned)||[]).slice(-3)],!!conflict||!people.has(assigned),candidates);
  }
  if(!ranked.length)return result(null,'unknown',0,'No assigned owner or identifiable recent staff activity.',[],true);
  const [id,score]=ranked[0];const next=ranked[1]?.[1]||0;
  const clear=score>=6&&score>=next*1.5;
  if(!clear)return result(null,'unknown',0,'Recent activity is limited or shared between staff. Choose a primary coordinator.',ranked.slice(0,2).flatMap(([id])=>(evidence.get(id)||[]).slice(-2)),true,candidates);
  return result(id,'detected',.85,'Most consistent identifiable staff follow-up in the last 90 days.',(evidence.get(id)||[]).slice(-5),false,candidates);
}
