export function daysUntil(value, now = new Date()) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return null;
  const day = value => { const d = new Date(value); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); };
  return Math.round((day(value) - day(now)) / 86400000);
}
export function followUpGroup(value, now) {
  const days = daysUntil(value, now);
  return days === null ? 'No follow-up date' : days < 0 ? 'Overdue' : days === 0 ? 'Due today' : days <= 7 ? 'Next 7 days' : 'Later';
}
export function collectionStatus(contact, now) {
  if (contact.transactions.some(t => t.status === 'failed')) return {label:'Card declined', color:'red'};
  const invoices = contact.invoices.filter(i => ['open','overdue'].includes(i.status) && i.amountDue > 0);
  const dated = invoices.map(i => daysUntil(i.dueAt, now)).filter(d => d !== null);
  if (!dated.length) return {label:'Due date unavailable',color:'gray'};
  const days = Math.min(...dated);
  return days < 0 ? {label:`Overdue ${Math.abs(days)}d`,color:'red'} : days === 0 ? {label:'Due today',color:'amber'} : {label:`Due in ${days}d`,color:'gray'};
}
export const matchesName = (name, query) => name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());

export function attentionOverview(contact) {
  const reason = contact.override?.reason || contact.analysis?.reason;
  if (contact.analysis?.needsReview) return reason || 'The available information needs a coordinator’s review.';
  if (contact.queueIds.includes('collect')) {
    const format = amount => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',maximumFractionDigits:0}).format(amount);
    const invoices = contact.invoices.filter(i => ['open','overdue'].includes(i.status) && i.amountDue > 0);
    const failed = contact.transactions.find(t => t.status === 'failed');
    const balance = invoices.reduce((sum,i) => sum + i.amountDue, 0);
    const procedure = contact.procedure ? ` for ${contact.procedure.toLowerCase()}` : '';
    if (failed) return `A ${failed.amount > 0 ? `${format(failed.amount)} ` : ''}payment failed${balance ? `; ${format(balance)} remains due${procedure}` : ''}.`;
    if (invoices.length) return `${format(balance)} outstanding${procedure} — ${invoices.length === 1 ? invoices[0].description || 'unpaid invoice' : `${invoices.length} unpaid invoices`}.`;
  }
  if (contact.queueIds.includes('post')) return `${contact.procedure ? `${contact.procedure} consult completed` : 'Consult completed'}${contact.objection ? `; concern: ${contact.objection}` : ''}. ${reason || 'Follow-up needed.'}`;
  return reason || 'Review the contact’s latest conversation and notes.';
}
