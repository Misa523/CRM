window.Views = window.Views || {};

/* Finance: příjmy, výdaje, zisk a marže – celkem i po zakázkách. */
(function () {
  const { esc, icon, money, norm, localISO, plural } = UI;
  const state = { period: 'year', filter: 'all', q: '', sort: { key: 'date', dir: -1 }, dealSort: { key: 'profit', dir: -1 } };
  const PERIODS = [['month', 'Měsíc'], ['year', 'Letos'], ['last', 'Loni'], ['12', '12 měsíců'], ['all', 'Vše']];
  const COLORS = ['s-primary', 's-amber', 's-violet', 's-green', 's-red', 's-gray'];

  const monthName = (key, opt) => new Date(key + '-01T00:00').toLocaleDateString('cs-CZ', opt);
  /** Období: od–do (YYYY-MM-DD včetně, prázdné = bez omezení) a popis. */
  function range() {
    const now = new Date(), y = now.getFullYear();
    switch (state.period) {
      case 'month': return { from: localISO(new Date(y, now.getMonth(), 1)), to: localISO(new Date(y, now.getMonth() + 1, 0)), text: now.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' }) };
      case 'last': return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, text: `rok ${y - 1}` };
      case '12': return { from: localISO(new Date(y, now.getMonth() - 11, 1)), to: localISO(new Date(y, now.getMonth() + 1, 0)), text: 'posledních 12 měsíců' };
      case 'all': return { from: '', to: '', text: 'celé období' };
      default: return { from: `${y}-01-01`, to: `${y}-12-31`, text: `rok ${y}` };
    }
  }
  /** Sloupce grafu: dny (měsíc), měsíce, nebo roky (dlouhé období). */
  function buckets(list, r) {
    const dates = list.map(m => m.date).filter(Boolean).sort();
    const from = r.from || dates[0] || localISO(), to = r.to || [dates[dates.length - 1] || '', localISO()].sort().pop();
    if (state.period === 'month') {
      const days = +to.slice(8);
      return { len: 10, items: Array.from({ length: days }, (_, i) => { const key = from.slice(0, 8) + String(i + 1).padStart(2, '0'); return { key, label: String(i + 1), long: UI.fmtDate(key) }; }) };
    }
    const months = [];
    for (let d = new Date(+from.slice(0, 4), +from.slice(5, 7) - 1, 1); localISO(d).slice(0, 7) <= to.slice(0, 7) && months.length < 600; d.setMonth(d.getMonth() + 1)) months.push(localISO(d).slice(0, 7));
    if (months.length > 24) {
      const years = [...new Set(months.map(m => m.slice(0, 4)))];
      return { len: 4, items: years.map(k => ({ key: k, label: k, long: 'Rok ' + k })) };
    }
    return { len: 7, items: months.map(k => ({ key: k, label: monthName(k, { month: 'short' }), long: monthName(k, { month: 'long', year: 'numeric' }) })) };
  }

  const widget = (title, extra, body, cls = '') => `<section class="card widget ${cls}">
    <div class="widget-head"><h3>${title}</h3>${extra || ''}</div><div class="widget-body">${body}</div></section>`;

  const DEAL_COLS = [
    { key: 'title', label: 'Zakázka', cls: 'primary', sort: r => r.title, render: r => r.id ? `<a class="cell-link" href="${C.dealHref(r.id)}">${esc(r.title)}</a>` : `<span class="muted">${esc(r.title)}</span>` },
    { key: 'client', label: 'Klient', cls: 'hide-md', sort: r => r.client, render: r => esc(r.client) },
    { key: 'income', label: 'Příjmy', cls: 'num', sort: r => r.income, render: r => money(r.income) },
    { key: 'expense', label: 'Výdaje', cls: 'num', sort: r => r.expense, render: r => money(r.expense) },
    { key: 'profit', label: 'Zisk', cls: 'num', sort: r => r.profit, render: r => `<strong class="${r.profit < 0 ? 'red' : ''}">${money(r.profit)}</strong>` },
    { key: 'margin', label: 'Marže', sort: r => r.margin, render: r => Finance.marginPill(r.margin) },
  ];

  function exportCsv(rows, text) {
    const cell = v => { let s = String(v == null ? '' : v); if (/^[=+@-]/.test(s) && isNaN(s.replace(',', '.'))) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const head = ['Datum', 'Typ', 'Popis', 'Kategorie', 'Zakázka', 'Klient / dodavatel', 'Částka', 'Měna', 'Poznámka'];
    const body = rows.slice().sort((a, b) => a.date.localeCompare(b.date)).map(m => [
      m.date, m.type === 'income' ? 'Příjem' : 'Výdaj', m.title, C.movementKind(m), C.dealTitle(m.dealId), m.vendor || C.contactName(m.contactId),
      String(m.type === 'income' ? m.amount : -m.amount).replace('.', ','), Store.settings().currency, m.note,
    ]);
    const csv = '﻿' + [head, ...body].map(r => r.map(cell).join(';')).join('\r\n');
    Files.download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `finance-${norm(text).replace(/[^a-z0-9]+/g, '-')}.csv`);
  }

  Views.finance = {
    title: 'Finance',
    subtitle: () => range().text,
    actions: () => `<button class="btn" data-new="transactions" data-preset="${esc(JSON.stringify({ type: 'income' }))}">${icon('plus')}<span>Příjem</span></button>` + C.newBtn('transactions', 'Výdaj', { type: 'expense' }),
    render(el) {
      Charts.reset();
      const r = range();
      const everything = Finance.movements();
      const all = everything.filter(m => state.period === 'all' || (m.date >= r.from && m.date <= r.to));
      const t = Finance.totals(all);
      const unpaid = Store.all('invoices').filter(i => i.status === 'sent');

      /* Po zakázkách */
      const groups = {};
      all.forEach(m => { (groups[m.dealId] = groups[m.dealId] || []).push(m); });
      const dealRows = Object.entries(groups).map(([id, list]) => {
        const d = id && Store.get('deals', id);
        return Object.assign(Finance.totals(list), { id, title: d ? d.title : 'Bez zakázky', client: d ? C.contactName(d.contactId) : '' });
      });

      /* Kategorie výdajů: největších 5 + zbytek */
      const cats = {};
      all.filter(m => m.type === 'expense').forEach(m => { const k = C.movementKind(m); cats[k] = (cats[k] || 0) + m.amount; });
      const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);
      const shown = sorted.length > 6 ? sorted.slice(0, 5).concat([['Další kategorie', sorted.slice(5).reduce((a, x) => a + x[1], 0)]]) : sorted;
      const catItems = shown.map(([label, value], i) => ({ label, value, cls: COLORS[i] }));

      const b = buckets(all, r);
      const pick = type => b.items.map(x => all.reduce((a, m) => a + (m.type === type && m.date.slice(0, b.len) === x.key ? m.amount : 0), 0));
      const series = [{ name: 'Příjmy', cls: 's-green', values: pick('income') }, { name: 'Výdaje', cls: 's-red', values: pick('expense') }];

      /* Filtr pohybů */
      const test = {
        all: () => true,
        income: m => m.type === 'income',
        expense: m => m.type === 'expense',
        noDeal: m => !m.dealId,
        noFile: m => m.type === 'expense' && !m.attachments.length,
      };
      const isCat = state.filter.startsWith('cat:');
      if (isCat && !all.some(m => m.type === 'expense' && C.movementKind(m) === state.filter.slice(4))) state.filter = 'all';
      const pred = state.filter.startsWith('cat:') ? m => m.type === 'expense' && C.movementKind(m) === state.filter.slice(4) : test[state.filter] || test.all;
      const n = k => all.filter(test[k]).length;
      const items = [
        { key: 'all', label: 'Všechny pohyby', count: all.length },
        { key: 'income', label: 'Příjmy', count: n('income') },
        { key: 'expense', label: 'Výdaje', count: n('expense') },
        { key: 'noDeal', label: 'Bez zakázky', count: n('noDeal') },
        { key: 'noFile', label: 'Výdaje bez dokladu', count: n('noFile') },
        ...(sorted.length ? [{ group: 'Kategorie výdajů' }, ...sorted.map(([l]) => ({ key: 'cat:' + l, label: l, count: all.filter(m => m.type === 'expense' && C.movementKind(m) === l).length }))] : []),
      ];

      const kpi = (label, value, sub, cls = '') => `<div class="kpi"><span class="kpi-label">${label}</span><span class="kpi-value ${cls}">${value}</span><span class="kpi-sub">${sub}</span></div>`;
      el.innerHTML = `
        <div class="view-bar">
          <div class="segmented wrap-scroll" role="tablist" aria-label="Období">${PERIODS.map(([k, l]) => `<button role="tab" class="${state.period === k ? 'on' : ''}" data-period="${k}">${l}</button>`).join('')}</div>
        </div>
        <div class="kpis">
          ${kpi('Příjmy', money(t.income), unpaid.length ? `čeká ještě ${money(UI.sum(unpaid, 'amount'))}` : 'vše zaplaceno')}
          ${kpi('Výdaje', money(t.expense), plural(n('expense'), 'položka', 'položky', 'položek'))}
          ${kpi('Zisk', money(t.profit), 'příjmy − výdaje', t.profit < 0 ? 'red' : '')}
          ${kpi('Marže', Finance.fmtMargin(t.margin), t.margin == null ? 'zatím bez příjmů' : 'zisk z příjmů', t.margin != null && t.margin < 0 ? 'red' : '')}
        </div>
        <div class="ov-grid fin-ov">
          ${widget('Příjmy a výdaje', Charts.legend(series), '<div class="chart-box" id="ch-fin"></div>', 'span-2')}
          ${widget('Výdaje podle kategorie', '', catItems.length
            ? Charts.donutBlock({ items: catItems, center: money(t.expense), centerLabel: 'celkem' })
            : C.emptyState('Žádné výdaje', 'V tomto období nejsou zapsané výdaje.'))}
        </div>
        <section class="card flush fin-deals">
          <div class="sec-head"><h3>Zisk a marže po zakázkách</h3><span class="muted small">${plural(dealRows.filter(x => x.id).length, 'zakázka', 'zakázky', 'zakázek')}</span></div>
          <div id="deal-table"></div>
        </section>
        <div class="fin-title"><h2>Pohyby</h2><button class="btn xs" id="csv" ${all.length ? '' : 'disabled'}>${icon('download')}<span>Export pro účetní (CSV)</span></button></div>
        ${C.listShell(C.filterPanel('Zobrazit', items, state.filter), C.search('Hledat pohyb, zakázku, dodavatele…', state.q) + '<span class="total" id="total"></span>')}`;

      const dealEl = el.querySelector('#deal-table');
      const drawDeals = () => {
        dealEl.innerHTML = C.table({
          cols: DEAL_COLS, rows: dealRows, sort: state.dealSort, rowAttrs: x => (x.id ? `data-href="${C.dealHref(x.id)}"` : ''),
          empty: `<p class="muted small sec-empty">V tomto období nejsou žádné pohyby.</p>`,
        });
        dealEl.querySelectorAll('[data-sort]').forEach(btn => btn.addEventListener('click', () => {
          const k = btn.dataset.sort;
          state.dealSort = { key: k, dir: state.dealSort.key === k ? -state.dealSort.dir : 1 };
          drawDeals();
        }));
      };
      drawDeals();

      const list = el.querySelector('#list');
      const draw = () => {
        const q = norm(state.q);
        const rows = all.filter(pred).filter(m => !q || norm([m.title, m.vendor, m.note, C.movementKind(m), C.dealTitle(m.dealId), C.contactName(m.contactId)].join(' ')).includes(q));
        const s = Finance.totals(rows);
        el.querySelector('#total').textContent = `${plural(rows.length, 'pohyb', 'pohyby', 'pohybů')} · ${money(s.profit)}`;
        list.innerHTML = C.table({
          cols: C.cols.movements(), rows, sort: state.sort, rowAttrs: m => `data-edit="${m.col}" data-id="${m.id}"`,
          empty: `<div class="card">${all.length ? C.emptyState('Nic nenalezeno', 'Zkuste jiný filtr.') : C.emptyState('Zatím žádné pohyby', 'Zapište výdaj. Příjmy se doplní samy ze zaplacených faktur.', C.newBtn('transactions', 'Přidat výdaj', { type: 'expense' }))}</div>`,
        });
        C.wireSort(list, state, draw);
      };
      el.querySelector('#q').addEventListener('input', e => { state.q = e.target.value; draw(); });
      C.wireFilters(el, state, () => Views.finance.render(el));
      draw();

      el.querySelector('#csv').addEventListener('click', () => exportCsv(all, r.text));
      Charts.mount(el.querySelector('#ch-fin'), w => Charts.bars({
        width: w, height: w < 420 ? 190 : 240, labels: b.items.map(x => x.label), tipLabels: b.items.map(x => x.long), series, format: money, integer: false,
        tipNote: i => { const p = series[0].values[i] - series[1].values[i]; return `<div>Zisk: <b>${esc(money(p))}</b></div>`; },
      }));
      el.querySelectorAll('[data-period]').forEach(btn => btn.addEventListener('click', () => {
        state.period = btn.dataset.period;
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }));
    },
  };
})();
