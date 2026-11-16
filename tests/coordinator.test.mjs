import {test} from 'node:test';
import assert from 'node:assert/strict';
import {detectCoordinator} from '../server/coordinator.mjs';
const now=new Date('2026-11-16T17:00:00Z');
const team=[{id:'s',name:'Sarah Wilson'},{id:'a',name:'Anna Miller'}];
const message=(id,userId='s',source='app',at=now.toISOString())=>({id,userId,source,at,direction:'outbound',text:'Follow-up'});
const contact={owner:'Unassigned',ownerId:null,messages:[],notes:[]};
test('CRM owner is authoritative with resolved staff identity',()=>{
 const d=detectCoordinator({...contact,ownerId:'s'},team,null,now);assert.equal(d.name,'Sarah Wilson');assert.equal(d.method,'crm');assert.equal(d.needsReview,false);
});
test('consistent manual activity detects a primary coordinator',()=>{
 const d=detectCoordinator({...contact,messages:[message('1'),message('2'),message('3','a')]},team,null,now);assert.equal(d.personId,'s');assert.equal(d.method,'detected');assert.equal(d.evidence.length,2);
});
test('automation, unknown users, stale activity and inbound mentions are not attribution',()=>{
 const d=detectCoordinator({...contact,messages:[message('1','s','workflow'),message('2','unknown'),message('3','s','app','2025-01-01T00:00:00Z'),{...message('4'),direction:'inbound',text:'Sarah is my coordinator'}]},team,null,now);assert.equal(d.personId,null);assert.equal(d.needsReview,true);
});
test('ties and sparse activity require review',()=>{
 for(const messages of [[message('1')],[message('1'),message('2'),message('3','a'),message('4','a')]])assert.equal(detectCoordinator({...contact,messages},team,null,now).personId,null);
});
test('conflicting activity flags CRM owner without silently reassigning',()=>{
 const d=detectCoordinator({...contact,ownerId:'a',messages:[message('1'),message('2')]},team,null,now);assert.equal(d.personId,'a');assert.equal(d.needsReview,true);
});
test('manual confirmation persists over CRM and activity changes',()=>{
 const d=detectCoordinator({...contact,ownerId:'s'},team,{personId:'a',reason:'Confirmed handoff',at:now.toISOString()},now);assert.equal(d.personId,'a');assert.equal(d.method,'manual');
});
