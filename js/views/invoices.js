window.Views = window.Views || {};

(function () {
  const { esc, money, sum, norm, icon } = UI;
  const state = { filter: 'all', q: '' };
  const FILTERS = [['all', 'Vše'], ['draft', 'Koncepty'], ['sent', 'Odeslané'], ['overdue', 'Po splatnosti'], ['paid', 'Zaplacené']];

  Views.invoices = {
    title: 'Faktury',
    actions: () => C.newBtn('invoices', 'Faktura'),
    render(el) {
      const all = Store.all('invoices');
      const year = String(new Date().getFullYear());
      const thisYear = all.filter(i => (i.issueDate || '').startsWith(year));
      const paidYear = all.filter(i => i.status === 'paid' && (i.paidDate || i.issueDate || '').startsWith(year));
      const unpaid = all.filter(i => i.status === 'sent');
      const overdue = all.filter(i => C.invoiceState(i).key === 'overdue');

      const match = i => {
        const st = C.invoiceState(i).key;
        if (state.filter === 'sent' && i.status !== 'sent') return false;
        if (state.filter !== 'all' && state.filter !== 'sent' && st !== state.filter) return false;
        const q = norm(state.q);
        return !q || norm([i.number, C.contactName(i.contactId), i.note].join(' ')).includes(q);
      };

      el.innerHTML = `
        <div class="kpis">
          <div class="kpi"><span class="kpi-label">Vystaveno ${year}</span><span class="kpi-value">${money(sum(thisYear, 'amount'))}</span><span class="kpi-sub">${thisYear.length} faktur</span></div>
          <div class="kpi"><span class="kpi-label">Zaplaceno ${year}</span><span class="kpi-value">${money(sum(paidYear, 'amount'))}</span><span class="kpi-sub">${paidYear.length} faktur</span></div>
          <div class="kpi"><span class="kpi-label">Čeká na úhradu</span><span class="kpi-value">${money(sum(unpaid, 'amount'))}</span><span class="kpi-sub">${unpaid.length} faktur</span></div>
          <div class="kpi"><span class="kpi-label">Po splatnosti</span><span class="kpi-value ${overdue.length ? 'red' : ''}">${money(sum(overdue, 'amount'))}</span><span class="kpi-sub">${overdue.length} faktur</span></div>
        </div>
        <div class="toolbar">
          <label class="search">${icon('search')}<input type="search" id="q" placeholder="Hledat číslo, odběratele…" value="${esc(state.q)}" autocomplete="off"></label>
        </div>
        <div class="segmented">${FILTERS.map(([k, l]) => `<button class="${state.filter === k ? 'on' : ''}" data-filter="${k}">${esc(l)}</button>`).join('')}</div>
        <div class="card list-card"><div class="rows" id="list"></div></div>`;

      const list = el.querySelector('#list');
      const draw = () => {
        const items = all.filter(match).sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || '') || String(b.number).localeCompare(String(a.number)));
        list.innerHTML = items.map(i => C.invoiceRow(i)).join('') ||
          (all.length ? C.emptyState('Nic nenalezeno', 'Zkuste jiný filtr.') : C.emptyState('Zatím žádné faktury', 'Přidejte první fakturu.', C.newBtn('invoices', 'Přidat fakturu')));
      };
      el.querySelector('#q').addEventListener('input', e => { state.q = e.target.value; draw(); });
      el.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => { state.filter = b.dataset.filter; Views.invoices.render(el); }));
      draw();
    },
  };
})();
