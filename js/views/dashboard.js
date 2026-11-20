window.Views = window.Views || {};

Views.dashboard = {
  title: () => {
    const h = new Date().getHours();
    return h < 10 ? 'Dobré ráno' : h < 18 ? 'Dobrý den' : 'Dobrý večer';
  },
  subtitle: () => new Date().toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' }),
  actions: () => C.newBtn('tasks', 'Úkol'),
  render(el) {
    const { esc, icon, money, sum, today, localISO } = UI;

    if (Store.isEmpty()) {
      el.innerHTML = `<div class="welcome card">
        <h2>Vítejte ve svém CRM</h2>
        <p>Tady budete mít přehled o klientech, obchodech, úkolech a fakturách. Začněte prvním kontaktem, nebo si nahrajte ukázková data a aplikaci si vyzkoušejte.</p>
        <div class="btn-row">
          ${C.newBtn('contacts', 'Přidat první kontakt')}
          <button class="btn" id="demo">Nahrát ukázková data</button>
        </div>
        <p class="muted small">Data se ukládají jen v tomto prohlížeči. Zálohu stáhnete v Nastavení.</p>
      </div>`;
      el.querySelector('#demo').onclick = () => { Store.seedDemo(); UI.toast('Ukázková data nahrána'); };
      return;
    }

    const t = today();
    const ym = t.slice(0, 7);
    const deals = Store.all('deals');
    const open = deals.filter(d => d.stage !== 'won' && d.stage !== 'lost');
    const invoices = Store.all('invoices');
    const paidIn = key => invoices.filter(i => i.status === 'paid' && (i.paidDate || i.issueDate || '').startsWith(key));
    const unpaid = invoices.filter(i => i.status === 'sent');
    const overdue = unpaid.filter(i => i.dueDate && i.dueDate < t);
    const openTasks = Store.all('tasks').filter(x => !x.done);
    const dueNow = openTasks.filter(x => x.due && x.due <= t);

    const months = [];
    for (let k = 5; k >= 0; k--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - k);
      const key = localISO(d).slice(0, 7);
      months.push({ key, label: d.toLocaleDateString('cs-CZ', { month: 'short' }), value: sum(paidIn(key), 'amount') });
    }
    const max = Math.max(1, ...months.map(m => m.value));

    const upcoming = openTasks.slice().sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')).slice(0, 6);
    const stages = Schema.STAGES.filter(s => s.id !== 'won' && s.id !== 'lost').map(s => {
      const items = open.filter(d => d.stage === s.id);
      return { ...s, count: items.length, value: sum(items, 'value') };
    });
    const stageMax = Math.max(1, ...stages.map(s => s.value));

    const s = Store.settings();
    const lastBackup = s.lastBackup ? new Date(s.lastBackup) : null;
    const needBackup = !lastBackup || (Date.now() - lastBackup) / 864e5 > 14;

    const widget = (title, link, body, cls = '') => `<section class="card widget ${cls}">
      <div class="widget-head"><h3>${title}</h3>${link ? `<a class="link" href="${link[0]}">${link[1]}</a>` : ''}</div>
      <div class="widget-body">${body}</div></section>`;

    el.innerHTML = `
      ${needBackup ? `<a class="notice" href="#/settings">${icon('alert')}<span>${lastBackup ? 'Poslední záloha je starší než 14 dní.' : 'Zatím nemáte zálohu dat.'} Data jsou jen v tomto prohlížeči, <u>stáhněte si zálohu</u>.</span></a>` : ''}
      <div class="kpis">
        <a class="kpi" href="#/deals"><span class="kpi-label">Otevřené obchody</span><span class="kpi-value">${money(sum(open, 'value'))}</span><span class="kpi-sub">${UI.plural(open.length, 'obchod', 'obchody', 'obchodů')} v pipeline</span></a>
        <a class="kpi" href="#/invoices"><span class="kpi-label">Příjmy tento měsíc</span><span class="kpi-value">${money(sum(paidIn(ym), 'amount'))}</span><span class="kpi-sub">${UI.plural(paidIn(ym).length, 'zaplacená faktura', 'zaplacené faktury', 'zaplacených faktur')}</span></a>
        <a class="kpi" href="#/invoices"><span class="kpi-label">Čeká na úhradu</span><span class="kpi-value">${money(sum(unpaid, 'amount'))}</span><span class="kpi-sub ${overdue.length ? 'red' : ''}">${overdue.length ? overdue.length + ' po splatnosti' : 'nic po splatnosti'}</span></a>
        <a class="kpi" href="#/tasks"><span class="kpi-label">Úkoly na dnes</span><span class="kpi-value">${dueNow.length}</span><span class="kpi-sub">${UI.plural(openTasks.length, 'otevřený', 'otevřené', 'otevřených')} celkem</span></a>
      </div>

      <div class="dash-grid">
        ${widget('Moje otevřené úkoly', ['#/tasks', 'Zobrazit vše'],
          C.table({ cols: C.cols.tasks(), rows: upcoming, rowAttrs: C.editAttrs('tasks'), empty: C.emptyState('Hotovo!', 'Nemáte žádné otevřené úkoly.') }), 'flush')}

        ${widget('Příjmy za posledních 6 měsíců', null, `<div class="chart" role="img" aria-label="Sloupcový graf příjmů">
            ${months.map(m => `<div class="bar-wrap" title="${esc(m.label)}: ${esc(money(m.value))}">
              <span class="bar-val">${m.value ? esc(money(m.value).replace(/\s?Kč|\s?€|\s?US\$|\$/, '')) : ''}</span>
              <span class="bar${m.key === ym ? ' current' : ''}" style="height:${Math.max(2, (m.value / max) * 100)}%"></span>
              <span class="bar-label">${esc(m.label)}</span></div>`).join('')}
          </div>`)}

        ${widget('Pipeline podle fáze', ['#/deals', 'Obchody'], `<div class="stage-bars">${stages.map(st => `
            <div class="stage-bar stage-${st.id}">
              <span class="stage-bar-label">${esc(st.label)} <span class="muted">(${st.count})</span></span>
              <span class="stage-bar-track"><span style="width:${(st.value / stageMax) * 100}%"></span></span>
              <span class="stage-bar-value">${money(st.value)}</span>
            </div>`).join('')}</div>`)}

        ${widget('Faktury po splatnosti', ['#/invoices', 'Faktury'],
          C.table({ cols: C.cols.invoices().filter(c => c.key !== 'issueDate'), rows: overdue, rowAttrs: C.editAttrs('invoices'), empty: C.emptyState('Vše v pořádku', 'Žádná faktura není po splatnosti.') }), 'flush')}
      </div>`;
  },
};
