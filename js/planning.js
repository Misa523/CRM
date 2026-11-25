/* Průběh vyhrané zakázky (progress), termíny, upozornění a události pro kalendář.
 * Pole progress platí jen pro zakázky ve fázi „Vyhráno“; kdo ho nemá, je „Naplánováno“. */
(function () {
  const { fmtDate, today, addDays, money } = UI;
  const PROGRESS = [
    { id: 'planned', label: 'Naplánováno', color: 'blue' },
    { id: 'active', label: 'Probíhá', color: 'amber' },
    { id: 'done', label: 'Hotovo', color: 'violet' },
    { id: 'invoiced', label: 'Vyfakturováno', color: 'green' },
  ];
  const get = id => PROGRESS.find(p => p.id === id) || PROGRESS[0];
  const of = d => get(d.progress).id;
  const label = id => get(id).label;
  /** Štítek zakázky: u vyhrané průběh, jinak obchodní fáze. */
  const pill = d => (d.stage === 'won' ? C.pill(get(d.progress).label, get(d.progress).color) : C.stagePill(d.stage));

  const start = d => d.dateFrom || d.dateTo || '';
  const end = d => d.dateTo || d.dateFrom || '';
  const term = d => {
    const a = start(d), b = end(d);
    return !a ? '' : a === b ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b)}`;
  };

  function set(id, progress) {
    const d = Store.get('deals', id);
    if (!d || of(d) === progress) return;
    Store.update('deals', id, { progress });
    UI.toast('Průběh: ' + label(progress));
  }
  /** Po vystavení faktury k hotové zakázce ji posune do „Vyfakturováno“. */
  function afterInvoice(inv) {
    const d = inv && inv.status !== 'draft' && inv.dealId && Store.get('deals', inv.dealId);
    if (d && d.stage === 'won' && of(d) === 'done') set(d.id, 'invoiced');
  }

  /** Zakázky, se kterými je potřeba něco udělat: [{ deal, text, color, action? }] */
  function issues() {
    const t = today(), out = [];
    Store.all('deals').filter(d => d.stage === 'won').forEach(d => {
      const p = of(d);
      if (p === 'done') out.push({ deal: d, rank: 0, text: 'Hotovo, chybí faktura', color: 'violet', action: 'invoice' });
      else if (p === 'active' && end(d) && end(d) < t) out.push({ deal: d, rank: 1, text: `Měla skončit ${fmtDate(end(d))}`, color: 'red', action: 'done' });
      else if (p === 'planned' && start(d) && start(d) <= t) out.push({ deal: d, rank: 2, text: start(d) === t ? 'Dnes začíná' : `Měla začít ${fmtDate(start(d))}`, color: 'amber', action: 'active' });
      else if (p === 'planned' && !start(d)) out.push({ deal: d, rank: 3, text: 'Chybí termín', color: 'gray', action: 'edit' });
    });
    return out.sort((a, b) => a.rank - b.rank || start(a.deal).localeCompare(start(b.deal)));
  }

  /** Předvyplnění faktury k zakázce: zbývající částka z ceny. */
  function invoicePreset(d) {
    const done = UI.sum(Store.all('invoices').filter(i => i.dealId === d.id), 'amount');
    return { dealId: d.id, contactId: d.contactId || '', amount: Math.max(0, (+d.value || 0) - done) || '' };
  }

  /** Události v období (včetně krajů): [{ kind, id, title, sub, from, to, color, cls }] */
  function events(from, to, show = { deals: true, tasks: true, invoices: true }) {
    const out = [], t = today();
    const inRange = (a, b) => a && a <= to && b >= from;
    if (show.deals) Store.all('deals').filter(d => d.stage !== 'lost' && inRange(start(d), end(d))).forEach(d => out.push({
      kind: 'deal', id: d.id, title: d.title, from: start(d), to: end(d), color: d.stage === 'won' ? get(d.progress).color : 'gray',
      cls: d.stage === 'won' ? '' : 'tentative', sub: [C.contactName(d.contactId), d.stage === 'won' ? label(of(d)) : 'předběžně'].filter(Boolean).join(' · '),
    }));
    if (show.tasks) Store.all('tasks').filter(x => inRange(x.due, x.due)).forEach(x => out.push({
      kind: 'task', id: x.id, title: x.title, from: x.due, to: x.due, color: x.done ? 'gray' : x.due < t ? 'red' : 'gray',
      cls: x.done ? 'finished' : '', sub: ['Úkol', C.contactName(x.contactId)].filter(Boolean).join(' · '),
    }));
    if (show.invoices) Store.all('invoices').filter(i => i.status === 'sent' && inRange(i.dueDate, i.dueDate)).forEach(i => out.push({
      kind: 'invoice', id: i.id, title: 'Faktura ' + i.number, from: i.dueDate, to: i.dueDate, color: i.dueDate < t ? 'red' : 'blue', cls: '',
      sub: ['Splatnost ' + money(i.amount), C.contactName(i.contactId)].filter(Boolean).join(' · '),
    }));
    const order = { deal: 0, task: 1, invoice: 2 };
    return out.sort((a, b) => order[a.kind] - order[b.kind] || a.from.localeCompare(b.from) || b.to.localeCompare(a.to) || a.title.localeCompare(b.title, 'cs'));
  }

  /* ---------- HTML ---------- */
  const ICON = { deal: 'kanban', task: 'check', invoice: 'file' };
  const attrs = e => (e.kind === 'deal' ? `href="${C.dealHref(e.id)}"` : `href="#" data-edit="${e.kind === 'task' ? 'tasks' : 'invoices'}" data-id="${e.id}"`);
  /** Řádek události v seznamu dne. */
  const row = (e, extra = '') => `<a class="ag-row ev-${e.color} ${e.cls}" ${attrs(e)}>${UI.icon(ICON[e.kind])}
    <span class="ag-text"><b>${UI.esc(e.title)}</b><small>${UI.esc(e.sub)}${e.from !== e.to ? ` · ${fmtDate(e.from)} – ${fmtDate(e.to)}` : ''}</small></span>${extra}</a>`;

  window.Planning = { PROGRESS, of, label, pill, start, end, term, set, afterInvoice, issues, invoicePreset, events, row, attrs, ICON, addDays };
})();
