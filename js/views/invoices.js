window.Views = window.Views || {};

(function () {
  const { money, sum, norm } = UI;
  const state = { filter: 'all', q: '', sort: { key: 'issueDate', dir: -1 } };
  const FILTERS = [['all', 'Všechny faktury'], ['draft', 'Koncepty'], ['sent', 'Odeslané'], ['overdue', 'Po splatnosti'], ['paid', 'Zaplacené']];

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
      const n = list => UI.plural(list.length, 'faktura', 'faktury', 'faktur');

      const test = {
        all: () => true,
        draft: i => i.status === 'draft',
        sent: i => i.status === 'sent',
        overdue: i => C.invoiceState(i).key === 'overdue',
        paid: i => i.status === 'paid',
      };

      el.innerHTML = `
        <div class="kpis">
          <div class="kpi"><span class="kpi-label">Vystaveno ${year}</span><span class="kpi-value">${money(sum(thisYear, 'amount'))}</span><span class="kpi-sub">${n(thisYear)}</span></div>
          <div class="kpi"><span class="kpi-label">Zaplaceno ${year}</span><span class="kpi-value">${money(sum(paidYear, 'amount'))}</span><span class="kpi-sub">${n(paidYear)}</span></div>
          <div class="kpi"><span class="kpi-label">Čeká na úhradu</span><span class="kpi-value">${money(sum(unpaid, 'amount'))}</span><span class="kpi-sub">${n(unpaid)}</span></div>
          <div class="kpi"><span class="kpi-label">Po splatnosti</span><span class="kpi-value ${overdue.length ? 'red' : ''}">${money(sum(overdue, 'amount'))}</span><span class="kpi-sub">${n(overdue)}</span></div>
        </div>
        ${C.listShell(
          C.filterPanel('Zobrazit', FILTERS.map(([k, label]) => ({ key: k, label, count: all.filter(test[k]).length })), state.filter),
          C.search('Hledat číslo, odběratele…', state.q) + '<span class="total" id="total"></span>')}`;

      const list = el.querySelector('#list');
      const draw = () => {
        const q = norm(state.q);
        const rows = all.filter(test[state.filter] || test.all)
          .filter(i => !q || norm([i.number, C.contactName(i.contactId), i.note].join(' ')).includes(q));
        el.querySelector('#total').textContent = `Celkem záznamů: ${rows.length}`;
        list.innerHTML = C.table({
          cols: C.cols.invoices(), rows, sort: state.sort, rowAttrs: C.editAttrs('invoices'),
          empty: `<div class="card">${all.length ? C.emptyState('Nic nenalezeno', 'Zkuste jiný filtr.') : C.emptyState('Zatím žádné faktury', 'Přidejte první fakturu.', C.newBtn('invoices', 'Přidat fakturu'))}</div>`,
        });
        C.wireSort(list, state, draw);
      };
      el.querySelector('#q').addEventListener('input', e => { state.q = e.target.value; draw(); });
      C.wireFilters(el, state, () => Views.invoices.render(el));
      draw();
    },
  };
})();
