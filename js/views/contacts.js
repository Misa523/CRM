window.Views = window.Views || {};

(function () {
  const { esc, icon, money, fmtDateTime, norm } = UI;
  const state = { q: '', tag: '' };

  function contactCard(c) {
    const openDeals = Store.all('deals').filter(d => d.contactId === c.id && d.stage !== 'won' && d.stage !== 'lost');
    const tasks = Store.all('tasks').filter(t => t.contactId === c.id && !t.done).length;
    const meta = [c.email, c.phone].filter(Boolean).map(esc).join(' · ');
    return `<a class="card contact-card" href="#/contact/${encodeURIComponent(c.id)}">
      ${C.avatar(c.name)}
      <span class="contact-info">
        <span class="card-title">${esc(c.name)}</span>
        ${c.company ? `<span class="muted">${esc(c.company)}</span>` : ''}
        ${meta ? `<span class="muted small ellipsis">${meta}</span>` : ''}
        ${(c.tags || []).length ? `<span class="tags">${c.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</span>` : ''}
      </span>
      <span class="contact-stats">
        ${openDeals.length ? `<span>${money(UI.sum(openDeals, 'value'))}</span>` : ''}
        ${tasks ? `<span class="muted small">${tasks} úkol${tasks === 1 ? '' : tasks < 5 ? 'y' : 'ů'}</span>` : ''}
      </span>
    </a>`;
  }

  Views.contacts = {
    title: 'Kontakty',
    actions: () => C.newBtn('contacts', 'Kontakt'),
    render(el) {
      const all = Store.all('contacts');
      const tags = [...new Set(all.flatMap(c => c.tags || []))].sort((a, b) => a.localeCompare(b, 'cs'));
      if (state.tag && !tags.includes(state.tag)) state.tag = '';

      el.innerHTML = `
        <div class="toolbar">
          <label class="search">${icon('search')}<input type="search" id="q" placeholder="Hledat jméno, firmu, e-mail, telefon…" value="${esc(state.q)}" autocomplete="off"></label>
        </div>
        ${tags.length ? `<div class="chips">${['', ...tags].map(t =>
          `<button class="chip${state.tag === t ? ' on' : ''}" data-tag="${esc(t)}">${t ? esc(t) : 'Vše'}</button>`).join('')}</div>` : ''}
        <div id="list"></div>`;

      const list = el.querySelector('#list');
      const draw = () => {
        const q = norm(state.q);
        const items = all
          .filter(c => !state.tag || (c.tags || []).includes(state.tag))
          .filter(c => !q || norm([c.name, c.company, c.email, c.phone, c.ico, (c.tags || []).join(' ')].join(' ')).includes(q))
          .sort((a, b) => a.name.localeCompare(b.name, 'cs'));
        list.innerHTML = items.length
          ? `<p class="muted small count-line">${items.length} z ${all.length}</p><div class="cards">${items.map(contactCard).join('')}</div>`
          : all.length
            ? C.emptyState('Nic nenalezeno', 'Zkuste jiný hledaný výraz nebo štítek.')
            : C.emptyState('Zatím žádné kontakty', 'Přidejte prvního klienta.', C.newBtn('contacts', 'Přidat kontakt'));
      };
      el.querySelector('#q').addEventListener('input', e => { state.q = e.target.value; draw(); });
      el.querySelectorAll('[data-tag]').forEach(b => b.addEventListener('click', () => { state.tag = b.dataset.tag; Views.contacts.render(el); }));
      draw();
    },
  };

  Views.contact = {
    nav: 'contacts',
    back: '#/contacts',
    title: id => { const c = Store.get('contacts', id); return c ? c.name : 'Kontakt'; },
    actions: id => Store.get('contacts', id)
      ? `<button class="btn" data-edit="contacts" data-id="${esc(id)}">${icon('edit')}<span class="hide-sm">Upravit</span></button>` : '',
    render(el, id) {
      const c = Store.get('contacts', id);
      if (!c) { el.innerHTML = C.emptyState('Kontakt nenalezen', 'Možná byl smazán.', '<a class="btn" href="#/contacts">Zpět na kontakty</a>'); return; }

      const deals = Store.all('deals').filter(d => d.contactId === id);
      const tasks = Store.all('tasks').filter(t => t.contactId === id).sort((a, b) => (a.done - b.done) || (a.due || '9').localeCompare(b.due || '9'));
      const invoices = Store.all('invoices').filter(i => i.contactId === id).sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''));
      const paid = UI.sum(invoices.filter(i => i.status === 'paid'), 'amount');
      const preset = esc(JSON.stringify({ contactId: id }));
      const section = (title, col, label, body) => `<section class="card">
        <div class="card-head"><h3>${title}</h3><button class="btn sm" data-new="${col}" data-preset="${preset}">${icon('plus')}<span>${label}</span></button></div>
        <div class="rows">${body}</div></section>`;

      el.innerHTML = `<div class="detail-grid">
        <section class="card profile">
          <div class="profile-head">${C.avatar(c.name, 'lg')}<div><h2>${esc(c.name)}</h2>${c.company ? `<div class="muted">${esc(c.company)}</div>` : ''}</div></div>
          <div class="quick-actions">
            ${c.email ? `<a class="btn sm" href="mailto:${esc(c.email)}">${icon('mail')}<span>E-mail</span></a>` : ''}
            ${c.phone ? `<a class="btn sm" href="tel:${esc(c.phone.replace(/\s/g, ''))}">${icon('phone')}<span>Zavolat</span></a>` : ''}
          </div>
          <dl class="props">
            ${c.email ? `<dt>E-mail</dt><dd>${esc(c.email)}</dd>` : ''}
            ${c.phone ? `<dt>Telefon</dt><dd>${esc(c.phone)}</dd>` : ''}
            ${c.ico ? `<dt>IČO</dt><dd>${esc(c.ico)}</dd>` : ''}
            ${c.address ? `<dt>Adresa</dt><dd>${esc(c.address)}</dd>` : ''}
            <dt>Zaplaceno celkem</dt><dd>${money(paid)}</dd>
          </dl>
          ${(c.tags || []).length ? `<div class="tags">${c.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
          ${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}
        </section>

        <section class="card activity">
          <div class="card-head"><h3>Aktivita a poznámky</h3></div>
          <form class="activity-form" id="act-form">
            <textarea name="text" rows="2" placeholder="Co se stalo? Telefonát, schůzka, domluva…" required></textarea>
            <button class="btn primary" type="submit">Přidat</button>
          </form>
          <ol class="timeline">${(c.activities || []).map(a => `<li>
            <div class="tl-date">${esc(fmtDateTime(a.date))}</div>
            <div class="tl-text">${esc(a.text)}</div>
            <button class="icon-btn sm" data-del-activity="${esc(a.id)}" aria-label="Smazat záznam">${icon('x')}</button>
          </li>`).join('') || '<li class="muted small">Zatím žádné záznamy.</li>'}</ol>
        </section>

        ${section('Obchody', 'deals', 'Obchod', deals.map(C.dealRow).join('') || '<p class="muted small">Žádné obchody.</p>')}
        ${section('Úkoly', 'tasks', 'Úkol', tasks.map(t => C.taskRow(t, { contact: false })).join('') || '<p class="muted small">Žádné úkoly.</p>')}
        ${section('Faktury', 'invoices', 'Faktura', invoices.map(i => C.invoiceRow(i, { contact: false })).join('') || '<p class="muted small">Žádné faktury.</p>')}
      </div>`;

      el.querySelector('#act-form').addEventListener('submit', e => {
        e.preventDefault();
        const text = e.target.elements.text.value.trim();
        if (!text) return;
        Store.update('contacts', id, { activities: [{ id: Store.uid(), date: new Date().toISOString(), text }, ...(c.activities || [])] });
      });
      el.querySelectorAll('[data-del-activity]').forEach(b => b.addEventListener('click', () => {
        if (!confirm('Smazat tento záznam?')) return;
        Store.update('contacts', id, { activities: c.activities.filter(a => a.id !== b.dataset.delActivity) });
      }));
    },
  };
})();
