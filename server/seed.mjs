export const defaultQueues = [
  { id: 'new', name: 'New leads', color: 'blue', include: 'Interested in a procedure, no completed consult, and needs a response or consult booking.', exclude: 'Do-not-contact, spam, completed consults, and booked surgery.', action: 'Call', owner: 'Original owner', builtin: true },
  { id: 'post', name: 'Post-consult', color: 'amber', include: 'Completed consult, surgery not booked, and follow-up is due.', exclude: 'Booked surgery, do-not-contact, or follow-up scheduled for a future date.', action: 'Call', owner: 'Original owner', builtin: true },
  { id: 'collect', name: 'Collect', color: 'green', include: 'An outstanding invoice with a payment due now, or a failed transaction requiring follow-up.', exclude: 'Paid, void, future-due invoices, refunds, and no verified outstanding balance.', action: 'Payment link', owner: 'Original owner', builtin: true },
  { id: 'pre-consult-vetting', name: 'Pre-consult: Needs vetting', color: 'purple', include: '', exclude: '', action: 'Call', owner: 'Original owner', builtin: false, routingEnabled: false },
  { id: 'clearances', name: 'Clearances', color: 'blue', include: '', exclude: '', action: 'Call', owner: 'Original owner', builtin: false, routingEnabled: false },
  { id: 'cups', name: 'Cups', color: 'amber', include: '', exclude: '', action: 'Call', owner: 'Original owner', builtin: false, routingEnabled: false },
];
const newNames = ['Emily Carter','Marcus Reed','Hannah Okafor','Diego Ramos','Rachel Kim','Priya Desai','Leo Martinez','Sofia Alvarez','Noah Fischer','Olivia Chen','James Thornton','Maya Gupta'];
const procedures = ['Rhinoplasty','Lipo 360','Rhinoplasty','Tummy tuck','Facelift','Blepharoplasty','Breast augmentation','BBL'];
const sources = ['Instagram','Website','Instagram','Website','RealSelf','Google Ads','Referral'];
export function seedContacts(now = new Date()) {
  const date = (days) => new Date(now.getTime() + days * 86400000).toISOString();
  const make = (name, i, kind) => ({ id: `${kind}-${i+1}`, name, phone: `+1555014${String(2200+i).padStart(4,'0')}`, email: name.toLowerCase().replaceAll(' ','.')+'@example.com', procedure: procedures[i%8], source: sources[i%7], owner: ['Sarah Wilson','Daniel Ross','Anna Miller'][i%3], avatar: i%8, lastTouch: new Date(now.getTime() - (i*11+4)*60000).toISOString(), status: kind==='new'?'new_lead':kind==='post'?'consult_completed':kind==='collect'?'surgery_booked':'no_action', doNotContact: false, consultDate: kind==='post'?date(-(i+2)):null, followUpAt: kind==='post'?date(i<3?-(10-i):i<5?0:i-4):null, surgeryDate: kind==='collect'?date(10+i*7):null, opportunityValue: kind==='post'? [8900,12400,22300,14750][i%4]:0, messages: [], notes: [], invoices: [], transactions: [], updatedAt: date(0) });
  const contacts = newNames.map((name,i)=>{
    const c=make(name,i,'new');
    c.messages=[{id:`${c.id}-m1`,direction:'inbound',at:c.lastTouch,text: i===2?'Hi! Can you share the cost for a rhinoplasty? And how long is the recovery — specifically, how soon can I go back to work?':`Hi! I’m interested in ${c.procedure.toLowerCase()}. Can you share pricing and consultation availability?`},{id:`${c.id}-m2`,direction:'outbound',at:date(0),text:`Hi ${name.split(' ')[0]}! A consultation is the best next step. Our coordinator can help find a time that works for you.`},{id:`${c.id}-m3`,direction:'inbound',at:date(0),text:'That sounds good. What’s the earliest consult you have available?'}];
    c.notes=[{id:`${c.id}-n1`,text:i===2?'Sent 2 photos. No consult booked.':'New inquiry; requested a consultation.'}];return c;
  });
  const objections=['price','recovery time','spouse','comparing surgeons','financing','nervous','price','recovery time'];
  const quotes=['It’s a bit more than I was expecting.','I can’t take two weeks off until after the holidays.','I need to run it by my husband first.','I’m also meeting with one other surgeon.','Do you have any financing options?','I’m just feeling a little nervous about the recovery.','If we could get a bit closer to $8K.','I’m worried about the downtime.'];
  ['Amanda Reyes','Jessica Miller','Lauren Kim','Emily Brooks','Daniel Park','Sofia Martinez','Tyler Walsh','Rachel Nguyen'].forEach((name,i)=>{const c=make(name,i,'post');c.objection=objections[i];c.surgeon=['Dr. Patel','Dr. Morales','Dr. Chen'][i%3];c.messages=[{id:`${c.id}-m1`,direction:'inbound',at:c.lastTouch,text:quotes[i]}];c.notes=[{id:`${c.id}-n1`,text:`Consult completed with ${c.surgeon}. Quote: $${c.opportunityValue}. Follow up on ${c.followUpAt.slice(0,10)}.`}];contacts.push(c);});
  ['Darren Walsh','Hannah Brooks','Ethan Park','Caleb Morris','Isabella Torres'].forEach((name,i)=>{const c=make(name,i,'collect');c.opportunityValue=[11800,14750,7400,12400,8900][i];c.invoices=[{id:`${c.id}-inv1`,description:i===0?'Deposit to hold date':'Surgery balance',amountDue:[1000,11400,7400,12400,8900][i],currency:'USD',status:'open',dueAt:date(i%2===0?-3:0),paymentUrl:null}];c.transactions=i===2?[{id:`${c.id}-t1`,status:'failed',amount:7400}]:[];c.messages=[{id:`${c.id}-m1`,direction:'inbound',at:c.lastTouch,text:i===0?'Let’s book December. Please send the deposit link.':'Confirmed the plan and ready to pay the balance.'}];c.notes=[{id:`${c.id}-n1`,text:'Surgery date held; outstanding payment verified against invoice.'}];contacts.push(c);});
  const excluded = [
    ['Alyssa Carter','surgery_booked','Surgery already booked','Confirming pre-op appointment details.'],
    ['Michael Rivera','clinical_question','Clinical team review','How long do I need to keep the drains in?'],
    ['Lauren Mills','not_candidate','Documented not a candidate','Thank you for following up.'],
    ['Samantha Lee','outside_service','Outside service area','Do you have an office in Phoenix?'],
    ['Brian Thomas','unsupported_procedure','Procedure not offered','Do you do hair transplants?'],
    ['Natalie Kim','clinical_question','Clinical team review','Is this swelling normal at one week post-op?'],
    ['Eric Gomez','surgery_booked','Surgery already booked','Checking the time for my surgery.'],
    ['Rachel Adams','spam','Spam or wrong number','You’ve won a gift card!'],
    ['Justin White','no_action','No action needed','Thanks for the info!'],
    ['Megan Scott','surgery_booked','Surgery already booked','Can you resend my pre-op instructions?'],
    ['Kevin Brooks','spam','Spam or wrong number','This is a recorded message about your account.'],
    ['Isabella Cruz','not_candidate','Documented not a candidate','Thanks for clarifying.'],
    ['Tyler Nguyen','clinical_question','Clinical team review','When can I go back to the gym?'],
    ['Morgan Davis','do_not_contact','Do not contact','Please remove me from your list.'],
  ];
  excluded.forEach(([name,status,reason,message],i)=>{const c=make(name,i,'filtered');c.status=status;c.filterReason=reason;c.doNotContact=status==='do_not_contact';c.messages=[{id:`${c.id}-m1`,direction:'inbound',at:c.lastTouch,text:message}];c.notes=[{id:`${c.id}-n1`,text:reason}];contacts.push(c);});
  return contacts;
}
