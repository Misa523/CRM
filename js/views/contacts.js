window.Views = window.Views || {};

(function () {
  const { esc, icon, money, fmtDate, fmtDateTime, norm, sum } = UI;
  const state = { q: '', filter: 'all', sort: { key: 'name', dir: 1 } };

  const openDealsOf = id => Store.all('deals').filter(d => d.contactId === id && d.stage !== 'won' && d.stage !== 'lost');

  const COLS = [
    { key: 'name', label: 'Jméno', cls: 'primary', sort: c => c.name, render: c =>
      `<span class="cell-person">${C.avatar(c.name, 'sm')}<a class="cell-link" href="#/contact/${encodeURIComponent(c.id)}">${esc(c.name)}</a></span>` },
    { key: 'company', label: 'Firma', sort: c => c.company, render: c => esc(c.company) },
    { key: 'email', label: 'E-mail', cls: 'hide-md', sort: c => c.email, render: c => c.email ? `<a class="cell-link" href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '' },
    { key: 'phone', label: 'Telefon', render: c => c.phone ? `<a class="cell-link" href="tel:${esc(c.phone.replace(/\s/g, ''))}">${esc(c.phone)}</a>` : '' },
    { key: 'tags', label: 'Štítky', cls: 'hide-md', render: c => C.tags(c.tags) },
    { key: 'deals', label: 'Otevřené zakázky', cls: 'num', sort: c => sum(openDealsOf(c.id), 'value') || null, render: c => {
      const v = sum(openDealsOf(c.id), 'value');
      return v ? `<strong>${money(v)}</strong>` : '';
    } },
  ];

  Views.contacts = {
    title: 'Kontakty',
    actions: () => C.newBtn('contacts', 'Kontakt'),
    render(el) {
      const all = Store.all('contacts');
      if (!all.length) {
        el.innerHTML = `<div class="card">${C.emptyState('Zatím žádné kontakty', 'Přidejte prvního klienta.', C.newBtn('contacts', 'Přidat kontakt'))}</div>`;
        return;
      }
      const tags = [...new Set(all.flatMap(c => c.tags || []))].sort((a, b) => a.localeCompare(b, 'cs'));
      const preds = {
        all: () => true,
        deals: c => openDealsOf(c.id).length > 0,
        recent: c => (Date.now() - new Date(c.createdAt)) / 864e5 <= 30,
      };
      if (state.filter.startsWith('tag:') && !tags.includes(state.filter.slice(4))) state.filter = 'all';
      const test = f => (f.startsWith('tag:') ? (c => (c.tags || []).includes(f.slice(4))) : preds[f] || preds.all);
      const count = f => all.filter(test(f)).length;

      const items = [
        { key: 'all', label: 'Všechny kontakty', count: all.length },
        { key: 'deals', label: 'S otevřenou zakázkou', count: count('deals') },
        { key: 'recent', label: 'Přidané za 30 dní', count: count('recent') },
        ...(tags.length ? [{ group: 'Štítky' }, ...tags.map(t => ({ key: 'tag:' + t, label: t, count: count('tag:' + t) }))] : []),
      ];

      el.innerHTML = C.listShell(
        C.filterPanel('Zobrazit', items, state.filter),
        C.search('Hledat jméno, firmu, e-mail, telefon…', state.q) + '<span class="total" id="total"></span>');

      const list = el.querySelector('#list');
      const draw = () => {
        const q = norm(state.q);
        const rows = all.filter(test(state.filter))
          .filter(c => !q || norm([c.name, c.company, c.email, c.phone, c.ico, (c.tags || []).join(' ')].join(' ')).includes(q));
        el.querySelector('#total').textContent = `Celkem záznamů: ${rows.length}`;
        list.innerHTML = C.table({
          cols: COLS, rows, sort: state.sort,
          rowAttrs: c => `data-href="#/contact/${encodeURIComponent(c.id)}"`,
          empty: `<div class="card">${C.emptyState('Nic nenalezeno', 'Zkuste jiný hledaný výraz nebo filtr.')}</div>`,
        });
        C.wireSort(list, state, draw);
      };
      el.querySelector('#q').addEventListener('input', e => { state.q = e.target.value; draw(); });
      C.wireFilters(el, state, () => Views.contacts.render(el));
      draw();
    },
  };

  /* ---------- Detail kontaktu (karta záznamu) ---------- */
  Views.contact = {
    nav: 'contacts',
    hideHead: true,
    title: id => { const c = Store.get('contacts', id); return c ? c.name : 'Kontakt'; },
    render(el, id) {
      const c = Store.get('contacts', id);
      if (!c) { el.innerHTML = `<div class="card" style="margin-top:18px">${C.emptyState('Kontakt nenalezen', 'Možná byl smazán.', '<a class="btn" href="#/contacts">Zpět na kontakty</a>')}</div>`; return; }

      const deals = Store.all('deals').filter(d => d.contactId === id);
      const tasks = Store.all('tasks').filter(t => t.contactId === id).sort((a, b) => (a.done - b.done) || (a.due || '9').localeCompare(b.due || '9'));
      const invoices = Store.all('invoices').filter(i => i.contactId === id).sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''));
      const acts = c.activities || [];
      const paid = sum(invoices.filter(i => i.status === 'paid'), 'amount');
      const openSum = sum(openDealsOf(id), 'value');
      const preset = esc(JSON.stringify({ contactId: id }));

      const field = (label, value) => `<div><dt>${label}</dt><dd>${value || '<span class="muted">—</span>'}</dd></div>`;
      const related = (secId, title, col, label, body) => `<section class="card flush" id="${secId}">
        <div class="sec-head"><h3>${title}</h3><button class="btn xs" data-new="${col}" data-preset="${preset}">${icon('plus')}<span>${label}</span></button></div>
        ${body}</section>`;
      const noRows = text => `<p class="muted small sec-empty">${text}</p>`;

      el.innerHTML = `
        <div class="record-head card">
          <a class="icon-btn" href="#/contacts" aria-label="Zpět na kontakty">${icon('left')}</a>
          ${C.avatar(c.name, 'lg')}
          <div class="record-title">
            <h1>${esc(c.name)}</h1>
            <div class="muted">${[c.company, c.email].filter(Boolean).map(esc).join(' · ')}</div>
            ${(c.tags || []).length ? `<div class="tags">${C.tags(c.tags)}</div>` : ''}
          </div>
          <div class="record-actions">
            ${c.email ? `<a class="btn" href="mailto:${esc(c.email)}">${icon('mail')}<span>E-mail</span></a>` : ''}
            ${c.phone ? `<a class="btn" href="tel:${esc(c.phone.replace(/\s/g, ''))}">${icon('phone')}<span>Zavolat</span></a>` : ''}
            <button class="btn primary" data-edit="contacts" data-id="${esc(id)}">${icon('edit')}<span>Upravit</span></button>
          </div>
        </div>

        <div class="record-body">
          <nav class="record-nav filters" aria-label="Související seznamy">
            <div class="filters-title">Související seznamy</div>
            <div class="filters-list">
              ${[['sec-info', 'Informace', null], ['sec-activity', 'Aktivita', acts.length], ['sec-deals', 'Zakázky', deals.length], ['sec-tasks', 'Úkoly', tasks.length], ['sec-invoices', 'Faktury', invoices.length]]
                .map(([sid, l, n]) => `<button class="filter" data-jump="${sid}"><span>${l}</span>${n != null ? `<span class="filter-count">${n}</span>` : ''}</button>`).join('')}
            </div>
          </nav>

          <div class="record-main">
            <section class="card flush" id="sec-info">
              <div class="sec-head"><h3>Informace o kontaktu</h3></div>
              <dl class="fields">
                ${field('Jméno', esc(c.name))}
                ${field('Firma', esc(c.company))}
                ${field('E-mail', c.email ? `<a class="cell-link" href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '')}
                ${field('Telefon', c.phone ? `<a class="cell-link" href="tel:${esc(c.phone.replace(/\s/g, ''))}">${esc(c.phone)}</a>` : '')}
                ${field('IČO', esc(c.ico))}
                ${field('Adresa', esc(c.address))}
                ${field('Otevřené zakázky', openSum ? money(openSum) : '')}
                ${field('Zaplaceno celkem', money(paid))}
                ${field('Štítky', C.tags(c.tags))}
                ${field('Vytvořeno', c.createdAt ? fmtDate(c.createdAt) : '')}
              </dl>
              ${c.note ? `<div class="sec-sub">Popis</div><p class="note">${esc(c.note)}</p>` : ''}
            </section>

            <section class="card flush" id="sec-activity">
              <div class="sec-head"><h3>Aktivita a poznámky</h3></div>
              <div class="sec-body">
                <form class="activity-form" id="act-form">
                  <textarea name="text" rows="2" placeholder="Co se stalo? Telefonát, schůzka, domluva…" required></textarea>
                  <button class="btn primary" type="submit">Přidat</button>
                </form>
                <ol class="timeline">${acts.map(a => `<li>
                  <div class="tl-date">${esc(fmtDateTime(a.date))}</div>
                  <div class="tl-text">${esc(a.text)}</div>
                  <button class="icon-btn sm" data-del-activity="${esc(a.id)}" aria-label="Smazat záznam">${icon('x')}</button>
                </li>`).join('') || '<li class="muted small">Zatím žádné záznamy.</li>'}</ol>
              </div>
            </section>

            ${related('sec-deals', 'Zakázky', 'deals', 'Zakázka',
              C.table({ cols: C.cols.deals({ contact: false }), rows: deals, rowAttrs: C.hrefAttrs(C.dealHref), empty: noRows('Žádné zakázky.') }))}
            ${related('sec-tasks', 'Úkoly', 'tasks', 'Úkol',
              C.table({ cols: C.cols.tasks({ contact: false }), rows: tasks, rowAttrs: C.editAttrs('tasks'), empty: noRows('Žádné úkoly.') }))}
            ${related('sec-invoices', 'Faktury', 'invoices', 'Faktura',
              C.table({ cols: C.cols.invoices({ contact: false }), rows: invoices, rowAttrs: C.editAttrs('invoices'), empty: noRows('Žádné faktury.') }))}
          </div>
        </div>`;

      el.querySelector('#act-form').addEventListener('submit', e => {
        e.preventDefault();
        const text = e.target.elements.text.value.trim();
        if (!text) return;
        Store.update('contacts', id, { activities: [{ id: Store.uid(), date: new Date().toISOString(), text }, ...acts] });
      });
      el.querySelectorAll('[data-del-activity]').forEach(b => b.addEventListener('click', () => {
        if (!confirm('Smazat tento záznam?')) return;
        Store.update('contacts', id, { activities: acts.filter(a => a.id !== b.dataset.delActivity) });
      }));
    },
  };
})();
