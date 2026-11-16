import test from 'node:test';
import assert from 'node:assert/strict';
import {daysUntil,followUpGroup,collectionStatus,matchesName} from '../src/ui-utils.mjs';
const now = new Date('2026-11-16T12:00:00');
test('name search trims whitespace and searches names only',()=>{
 assert.ok(matchesName('Emily Carter','  EMILY  '));
 assert.ok(!matchesName('Emily Carter','Rhinoplasty'));
});
test('follow-up labels handle missing dates and dates outside this week',()=>{
 assert.equal(daysUntil(null,now),null);
 assert.equal(followUpGroup('invalid',now),'No follow-up date');
 assert.equal(followUpGroup('2026-11-15T12:00:00',now),'Overdue');
 assert.equal(followUpGroup('2026-11-16T12:00:00',now),'Due today');
 assert.equal(followUpGroup('2026-11-20T12:00:00',now),'Next 7 days');
 assert.equal(followUpGroup('2026-12-01T12:00:00',now),'Later');
});
test('collection status does not call missing or future dates due today',()=>{
 const c={transactions:[],invoices:[]};
 assert.equal(collectionStatus(c,now).label,'Due date unavailable');
 c.invoices=[{status:'paid',amountDue:0,dueAt:'2026-11-10T12:00:00'},{status:'open',amountDue:100,dueAt:'2026-11-18T12:00:00'}];
 assert.equal(collectionStatus(c,now).label,'Due in 2d');
 c.invoices.push({status:'overdue',amountDue:100,dueAt:'2026-11-13T12:00:00'});
 assert.equal(collectionStatus(c,now).label,'Overdue 3d');
 c.transactions.push({status:'failed'});
 assert.equal(collectionStatus(c,now).label,'Card declined');
});
