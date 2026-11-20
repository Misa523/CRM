window.Views = window.Views || {};

Views.dashboard = {
  title: 'Přehled',
  actions: () => `<button class="btn" data-new="contacts">${UI.icon('plus')}<span class="hide-sm">Kontakt</span></button>${C.newBtn('tasks', 'Úkol')}`,
  render(el) {
    const { esc, icon, money, sum, today, localISO } = UI;

    if (Store.isEmpty()) {
      el.innerHTML = `<div class="welcome card">
        <h2>Vítejte ve svém CRM 👋</h2>
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
    const hot = open.slice().sort((a, b) => (+b.value || 0) - (+a.value || 0)).slice(0, 5);

    const s = Store.settings();
    const lastBackup = s.lastBackup ? new Date(s.lastBackup) : null;
    const needBackup = !lastBackup || (Date.now() - lastBackup) / 864e5 > 14;

    el.innerHTML = `
      ${needBackup ? `<a class="notice" href="#/settings">${icon('alert')}<span>${lastBackup ? 'Poslední záloha je starší než 14 dní.' : 'Zatím nemáte zálohu dat.'} Data jsou jen v tomto prohlížeči, <u>stáhněte si zálohu</u>.</span></a>` : ''}
      <div class="kpis">
        <a class="kpi" href="#/deals"><span class="kpi-label">Otevřené obchody</span><span class="kpi-value">${money(sum(open, 'value'))}</span><span class="kpi-sub">${open.length} v pipeline</span></a>
        <a class="kpi" href="#/invoices"><span class="kpi-label">Příjmy tento měsíc</span><span class="kpi-value">${money(sum(paidIn(ym), 'amount'))}</span><span class="kpi-sub">${UI.plural(paidIn(ym).length, "zaplacená faktura", "zaplacené faktury", "zaplacených faktur")}</span></a>
        <a class="kpi" href="#/invoices"><span class="kpi-label">Čeká na úhradu</span><span class="kpi-value">${money(sum(unpaid, 'amount'))}</span><span class="kpi-sub ${overdue.length ? 'red' : ''}">${overdue.length ? overdue.length + ' po splatnosti' : 'nic po splatnosti'}</span></a>
        <a class="kpi" href="#/tasks"><span class="kpi-label">Úkoly na dnes</span><span class="kpi-value">${dueNow.length}</span><span class="kpi-sub">${UI.plural(openTasks.length, "otevřený", "otevřené", "otevřených")} celkem</span></a>
      </div>

      <div class="dash-grid">
        <section class="card">
          <div class="card-head"><h3>Nejbližší úkoly</h3><a class="link" href="#/tasks">Vše</a></div>
          <div class="rows">${upcoming.map(x => C.taskRow(x)).join('') || C.emptyState('Hotovo!', 'Nemáte žádné otevřené úkoly.')}</div>
        </section>

        <section class="card">
          <div class="card-head"><h3>Příjmy za 6 měsíců</h3></div>
          <div class="chart" role="img" aria-label="Sloupcový graf příjmů">
            ${months.map(m => `<div class="bar-wrap" title="${esc(m.label)}: ${esc(money(m.value))}">
              <span class="bar-val">${m.value ? esc(money(m.value).replace(/\s?Kč|\s?€|\s?US\$|\$/, '')) : ''}</span>
              <span class="bar${m.key === ym ? ' current' : ''}" style="height:${Math.max(2, (m.value / max) * 100)}%"></span>
              <span class="bar-label">${esc(m.label)}</span></div>`).join('')}
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h3>Největší otevřené obchody</h3><a class="link" href="#/deals">Pipeline</a></div>
          <div class="rows">${hot.map(C.dealRow).join('') || C.emptyState('Žádné obchody', 'Přidejte první obchod do pipeline.')}</div>
        </section>

        <section class="card">
          <div class="card-head"><h3>Faktury po splatnosti</h3><a class="link" href="#/invoices">Faktury</a></div>
          <div class="rows">${overdue.map(i => C.invoiceRow(i)).join('') || C.emptyState('Vše v pořádku', 'Žádná faktura není po splatnosti.')}</div>
        </section>
      </div>`;
  },
};
