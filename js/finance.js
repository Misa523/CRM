/* Výpočty pro finance.
 * Příjem = zaplacená faktura (ke dni zaplacení) nebo ručně zadaný příjem, výdaj = ručně zadaný výdaj.
 * Zisk = příjmy − výdaje, marže = zisk / příjmy. Částky se berou tak, jak jsou zadané (DPH se nepočítá). */
(function () {
  const num = v => +v || 0;

  /** Všechny pohyby: [{ col, id, type, title, amount, date, dealId, contactId, category, vendor, note, attachments }] */
  function movements() {
    const dealIds = new Map(Store.all('deals').map(d => [d.id, d]));
    const inv = Store.all('invoices').filter(i => i.status === 'paid').map(i => ({
      col: 'invoices', id: i.id, type: 'income', title: 'Faktura ' + i.number, amount: num(i.amount),
      date: i.paidDate || i.issueDate || '', dealId: dealIds.has(i.dealId) ? i.dealId : '', contactId: i.contactId || '',
      category: '', vendor: '', note: i.note || '', attachments: i.attachments || [],
    }));
    const tr = Store.all('transactions').map(t => {
      const deal = dealIds.get(t.dealId);
      return {
        col: 'transactions', id: t.id, type: t.type === 'income' ? 'income' : 'expense', title: t.title || '', amount: num(t.amount),
        date: t.date || '', dealId: deal ? deal.id : '', contactId: deal ? deal.contactId || '' : '',
        category: t.category || '', vendor: t.vendor || '', note: t.note || '', attachments: t.attachments || [],
      };
    });
    return inv.concat(tr);
  }

  function totals(list) {
    let income = 0, expense = 0;
    list.forEach(m => { if (m.type === 'income') income += m.amount; else expense += m.amount; });
    const profit = income - expense;
    return { income, expense, profit, margin: income > 0 ? (profit / income) * 100 : null };
  }

  /** Finance jedné zakázky. */
  function deal(id) {
    const list = movements().filter(m => m.dealId === id);
    const inv = Store.all('invoices').filter(i => i.dealId === id);
    return Object.assign(totals(list), { list, unpaid: UI.sum(inv.filter(i => i.status === 'sent'), 'amount') });
  }

  const fmtMargin = m => (m == null ? '—' : m.toLocaleString('cs-CZ', { maximumFractionDigits: 1 }) + ' %');
  const marginPill = m => (m == null ? '' : C.pill(fmtMargin(m), m < 0 ? 'red' : m < 15 ? 'amber' : 'green'));

  window.Finance = { movements, totals, deal, fmtMargin, marginPill };
})();
