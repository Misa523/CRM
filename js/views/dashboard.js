window.Views = window.Views || {};

(function () {
  const { esc, icon, money, sum, today, localISO, plural } = UI;
  const state = { period: '6' };
  const PERIODS = [['6', '6 měsíců'], ['12', '12 měsíců'], ['year', 'Letos']];

  const monthKey = d => localISO(d).slice(0, 7);
  /** Měsíc ze data 'YYYY-MM-DD' nebo z ISO časové značky (createdAt) v místním čase. */
  const mk = s => (!s ? '' : s.length > 10 ? monthKey(new Date(s)) : String(s).slice(0, 7));

  /** n měsíců končících aktuálním měsícem (offset posune okno do minulosti). */
  function monthsBack(n, offset = 0) {
    const out = [];
    for (let k = n - 1 + offset; k >= offset; k--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - k);
      out.push({
        key: monthKey(d),
        label: d.toLocaleDateString('cs-CZ', { month: 'short' }),
        long: d.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' }),
      });
    }
    return out;
  }

  const widget = (title, extra, body, cls = '') => `<section class="card widget ${cls}">
    <div class="widget-head"><h3>${title}</h3>${extra || ''}</div>
    <div class="widget-body">${body}</div></section>`;
  const link = (href, text) => `<a class="link" href="${href}">${text}</a>`;

  Views.dashboard = {
    title: () => {
      const h = new Date().getHours();
      return h < 10 ? 'Dobré ráno' : h < 18 ? 'Dobrý den' : 'Dobrý večer';
    },
    subtitle: () => new Date().toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' }),
    actions: () => C.newBtn('tasks', 'Úkol'),
    render(el) {
      Charts.reset();

      if (Store.isEmpty()) {
        el.innerHTML = `<div class="welcome card">
          <h2>Vítejte ve svém CRM</h2>
          <p>Tady budete mít přehled o klientech, zakázkách, úkolech a fakturách. Začněte prvním kontaktem, nebo si nahrajte ukázková data a aplikaci si vyzkoušejte.</p>
          <div class="btn-row">
            ${C.newBtn('contacts', 'Přidat první kontakt')}
            <button class="btn" id="demo">Nahrát ukázková data</button>
          </div>
          ${Sync.active() ? '' : '<p class="muted small">Data se ukládají jen v tomto prohlížeči. Zálohu stáhnete v Nastavení.</p>'}
        </div>`;
        el.querySelector('#demo').onclick = () => { Store.seedDemo(); UI.toast('Ukázková data nahrána'); };
        return;
      }

      /* ---------- Období ---------- */
      const t = today();
      const len = state.period === 'year' ? new Date().getMonth() + 1 : +state.period;
      const months = monthsBack(len);
      const keys = new Set(months.map(m => m.key));
      const prevKeys = new Set(monthsBack(len, len).map(m => m.key));
      const periodText = state.period === 'year' ? 'od začátku roku' : `za posledních ${len} měsíců`;

      /* ---------- Data ---------- */
      const contacts = Store.all('contacts');
      const deals = Store.all('deals');
      const invoices = Store.all('invoices');
      const moves = Finance.movements(); // stejné příjmy a výdaje jako na stránce Finance
      const incomes = moves.filter(m => m.type === 'income'), expenses = moves.filter(m => m.type === 'expense');
      const revenue = sum(incomes.filter(m => keys.has(mk(m.date))), 'amount');
      const revenuePrev = sum(incomes.filter(m => prevKeys.has(mk(m.date))), 'amount');
      const delta = revenuePrev ? Math.round(((revenue - revenuePrev) / revenuePrev) * 100) : null;

      const open = deals.filter(d => d.stage !== 'won' && d.stage !== 'lost');
      const won = deals.filter(d => d.stage === 'won');
      const lost = deals.filter(d => d.stage === 'lost');
      const rate = won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : null;
      const wonInPeriod = won.filter(d => keys.has(mk(d.wonDate)));

      const unpaid = invoices.filter(i => i.status === 'sent');
      const overdue = unpaid.filter(i => i.dueDate && i.dueDate < t);
      const openTasks = Store.all('tasks').filter(x => !x.done);
      const upcoming = openTasks.slice().sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')).slice(0, 6);

      const revSeries = [
        { name: 'Příjmy', cls: 's-primary', area: true, values: months.map(m => sum(incomes.filter(i => mk(i.date) === m.key), 'amount')) },
        { name: 'Výdaje', cls: 's-red', values: months.map(m => sum(expenses.filter(i => mk(i.date) === m.key), 'amount')) },
        { name: 'Vystaveno', cls: 's-gray', dashed: true, values: months.map(m => sum(invoices.filter(i => i.status !== 'draft' && mk(i.issueDate) === m.key), 'amount')) },
      ];
      const actSeries = [
        { name: 'Noví klienti', cls: 's-violet', values: months.map(m => contacts.filter(c => mk(c.createdAt) === m.key).length) },
        { name: 'Vyhrané zakázky', cls: 's-green', values: months.map(m => won.filter(d => mk(d.wonDate) === m.key).length) },
      ];

      const pipeline = Schema.STAGES.filter(s => s.id !== 'won' && s.id !== 'lost').map(s => {
        const list = open.filter(d => d.stage === s.id);
        return { label: s.label, sub: `(${list.length})`, value: sum(list, 'value'), cls: `s-stage stage-${s.id}` };
      });
      const periodInv = invoices.filter(i => keys.has(mk(i.issueDate)));
      const invStates = [['paid', 'Zaplacené', 's-green'], ['sent', 'Odeslané', 's-blue'], ['overdue', 'Po splatnosti', 's-red'], ['draft', 'Koncepty', 's-gray']]
        .map(([k, label, cls]) => {
          const list = periodInv.filter(i => C.invoiceState(i).key === k);
          return { label, sub: `(${list.length})`, value: sum(list, 'amount'), cls };
        });

      const byClient = {};
      incomes.filter(i => i.contactId && keys.has(mk(i.date)))
        .forEach(i => { byClient[i.contactId] = (byClient[i.contactId] || 0) + (+i.amount || 0); });
      const top = Object.entries(byClient).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([id, value]) => ({ label: C.contactName(id) || '—', href: `#/contact/${encodeURIComponent(id)}`, value }));

      const s = Store.settings();
      const lastBackup = s.lastBackup ? new Date(s.lastBackup) : null;
      const needBackup = !Sync.active() && (!lastBackup || (Date.now() - lastBackup) / 864e5 > 14);

      const deltaHtml = delta == null
        ? `<span class="kpi-sub">${periodText}</span>`
        : `<span class="kpi-sub"><span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} %</span> oproti předchozímu období</span>`;

      /* ---------- HTML ---------- */
      el.innerHTML = `
        ${needBackup ? `<a class="notice" href="#/settings">${icon('alert')}<span>${lastBackup ? 'Poslední záloha je starší než 14 dní.' : 'Zatím nemáte zálohu dat.'} Data jsou jen v tomto prohlížeči, <u>stáhněte si zálohu</u>.</span></a>` : ''}

        <div class="ov-head">
          <div><h2>Přehled</h2><span class="muted small">${esc(periodText)}</span></div>
          <div class="segmented" role="tablist" aria-label="Období">${PERIODS.map(([k, l]) =>
            `<button role="tab" class="${state.period === k ? 'on' : ''}" data-period="${k}">${l}</button>`).join('')}</div>
        </div>

        <div class="kpis">
          <a class="kpi" href="#/finance"><span class="kpi-label">Příjmy</span><span class="kpi-value">${money(revenue)}</span>${deltaHtml}</a>
          <a class="kpi" href="#/deals"><span class="kpi-label">Otevřené zakázky</span><span class="kpi-value">${money(sum(open, 'value'))}</span><span class="kpi-sub">${plural(open.length, 'zakázka', 'zakázky', 'zakázek')} v pipeline</span></a>
          <a class="kpi" href="#/invoices"><span class="kpi-label">Čeká na úhradu</span><span class="kpi-value">${money(sum(unpaid, 'amount'))}</span><span class="kpi-sub ${overdue.length ? 'red' : ''}">${overdue.length ? plural(overdue.length, 'faktura', 'faktury', 'faktur') + ' po splatnosti' : 'nic po splatnosti'}</span></a>
          <a class="kpi" href="#/deals"><span class="kpi-label">Úspěšnost zakázek</span><span class="kpi-value">${rate == null ? '—' : rate + ' %'}</span><span class="kpi-sub">${plural(wonInPeriod.length, 'vyhraná zakázka', 'vyhrané zakázky', 'vyhraných zakázek')} za období</span></a>
        </div>

        <div class="ov-grid">
          ${widget('Příjmy a výdaje', Charts.legend(revSeries), '<div class="chart-box" id="ch-rev"></div>', 'span-2')}
          ${widget('Pipeline podle fáze', link('#/deals', 'Zakázky'),
            Charts.donutBlock({ items: pipeline, center: money(sum(open, 'value')), centerLabel: 'otevřeno' }))}
          ${widget('Faktury podle stavu', link('#/invoices', 'Faktury'),
            Charts.donutBlock({ items: invStates, center: money(sum(periodInv, 'amount')), centerLabel: 'vystaveno' }))}
          ${widget('Noví klienti a vyhrané zakázky', Charts.legend(actSeries), '<div class="chart-box" id="ch-act"></div>')}
          ${widget('Nejlepší klienti', link('#/contacts', 'Kontakty'),
            top.length ? Charts.hbars(top) : C.emptyState('Zatím bez plateb', 'V tomto období nikdo nezaplatil.'))}
        </div>

        <div class="dash-grid">
          ${widget('Moje otevřené úkoly', link('#/tasks', 'Zobrazit vše'),
            C.table({ cols: C.cols.tasks(), rows: upcoming, rowAttrs: C.editAttrs('tasks'), empty: C.emptyState('Hotovo!', 'Nemáte žádné otevřené úkoly.') }), 'flush')}
          ${widget('Faktury po splatnosti', link('#/invoices', 'Faktury'),
            C.table({ cols: C.cols.invoices().filter(c => c.key !== 'issueDate'), rows: overdue, rowAttrs: C.editAttrs('invoices'), empty: C.emptyState('Vše v pořádku', 'Žádná faktura není po splatnosti.') }), 'flush')}
        </div>`;

      /* ---------- Grafy (překreslí se podle šířky) ---------- */
      const labels = months.map(m => m.label);
      const tipLabels = months.map(m => m.long);
      Charts.mount(el.querySelector('#ch-rev'), w => Charts.line({ width: w, height: w < 420 ? 190 : 240, labels, tipLabels, series: revSeries }));
      Charts.mount(el.querySelector('#ch-act'), w => Charts.bars({ width: w, height: w < 420 ? 180 : 200, labels, tipLabels, series: actSeries }));

      el.querySelectorAll('[data-period]').forEach(b => b.addEventListener('click', () => {
        state.period = b.dataset.period;
        Views.dashboard.render(el);
      }));
    },
  };
})();
