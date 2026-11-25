window.Views = window.Views || {};

/* Detail zakázky: údaje, finance, fotky a videa, faktury. */
(function () {
  const { esc, icon, money, fmtDate } = UI;

  Views.deal = {
    nav: 'deals',
    hideHead: true,
    title: id => C.dealTitle(id) || 'Zakázka',
    render(el, id) {
      const d = Store.get('deals', id);
      if (!d) { el.innerHTML = `<div class="card" style="margin-top:18px">${C.emptyState('Zakázka nenalezena', 'Možná byla smazána.', '<a class="btn" href="#/deals">Zpět na zakázky</a>')}</div>`; return; }

      const contact = d.contactId && Store.get('contacts', d.contactId);
      const f = Finance.deal(id);
      const invoices = Store.all('invoices').filter(i => i.dealId === id).sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''));
      const moves = f.list.slice().sort((a, b) => b.date.localeCompare(a.date));
      const media = Media.count(id);
      const price = +d.value || 0;
      const expected = price - f.expense;
      const stepIdx = Planning.PROGRESS.findIndex(p => p.id === Planning.of(d));
      const preset = o => esc(JSON.stringify(o));

      const field = (label, value) => `<div><dt>${label}</dt><dd>${value || '<span class="muted">—</span>'}</dd></div>`;
      const noRows = text => `<p class="muted small sec-empty">${text}</p>`;
      const kpi = (label, value, sub, cls = '') => `<div class="kpi"><span class="kpi-label">${label}</span><span class="kpi-value ${cls}">${value}</span><span class="kpi-sub">${sub}</span></div>`;

      el.innerHTML = `
        <div class="record-head card">
          <a class="icon-btn" href="#/deals" aria-label="Zpět na zakázky">${icon('left')}</a>
          <div class="record-title">
            <h1>${esc(d.title)}</h1>
            <div class="muted">${contact ? `<a class="cell-link" href="#/contact/${encodeURIComponent(contact.id)}">${esc(contact.name)}</a>${contact.company ? ' · ' + esc(contact.company) : ''}` : 'bez kontaktu'}</div>
            <div class="tags">${Planning.pill(d)}${Planning.term(d) ? `<span class="tag">${icon('calendar')} ${Planning.term(d)}</span>` : ''}</div>
          </div>
          <div class="record-actions">
            <button class="btn" id="claim" ${media ? '' : 'disabled title="Nejdřív přidejte fotky nebo videa"'}>${icon('shield')}<span>Pro pojišťovnu</span></button>
            <button class="btn primary" data-edit="deals" data-id="${esc(id)}">${icon('edit')}<span>Upravit</span></button>
          </div>
        </div>

        <div class="record-body">
          <nav class="record-nav filters" aria-label="Části zakázky">
            <div class="filters-title">Zakázka</div>
            <div class="filters-list">
              ${[['sec-media', 'Fotky a videa', media], ['sec-money', 'Finance', f.list.length], ['sec-inv', 'Faktury', invoices.length], ['sec-info', 'Informace', null]]
                .map(([sid, l, n]) => `<button class="filter" data-jump="${sid}"><span>${l}</span>${n != null ? `<span class="filter-count">${n}</span>` : ''}</button>`).join('')}
            </div>
          </nav>

          <div class="record-main">
            ${d.stage === 'won' ? `<section class="card progress-card">
              <div class="steps" role="group" aria-label="Průběh zakázky">${Planning.PROGRESS.map((p, i) =>
                `<button class="step s-${p.color}${i < stepIdx ? ' past' : ''}${i === stepIdx ? ' on' : ''}" data-progress="${p.id}" data-id="${esc(id)}" aria-pressed="${i === stepIdx}"><i>${i < stepIdx ? icon('tick') : i + 1}</i><span>${p.label}</span></button>`).join('')}</div>
              ${Planning.of(d) === 'done' ? `<div class="progress-hint"><span>Zakázka je hotová, zbývá vystavit fakturu.</span><button class="btn xs primary" data-new="invoices" data-preset="${preset(Planning.invoicePreset(d))}">${icon('plus')}<span>Faktura</span></button></div>`
                : !Planning.term(d) && Planning.of(d) === 'planned' ? `<div class="progress-hint"><span>Zakázka nemá termín, v kalendáři proto není.</span><button class="btn xs" data-edit="deals" data-id="${esc(id)}">${icon('calendar')}<span>Doplnit termín</span></button></div>` : ''}
            </section>` : ''}
            <div class="kpis deal-kpis">
              ${kpi('Příjmy', money(f.income), f.unpaid ? `čeká ${money(f.unpaid)}` : 'zaplaceno')}
              ${kpi('Výdaje', money(f.expense), UI.plural(f.list.filter(m => m.type === 'expense').length, 'položka', 'položky', 'položek'))}
              ${kpi('Zisk', money(f.profit), 'příjmy − výdaje', f.profit < 0 ? 'red' : '')}
              ${kpi('Marže', Finance.fmtMargin(f.margin), price ? `po doplacení ${money(expected)} (${Finance.fmtMargin((expected / price) * 100)})` : 'zisk z příjmů', f.margin != null && f.margin < 0 ? 'red' : '')}
            </div>

            <section class="card flush" id="sec-media">
              <div class="sec-head"><h3>Fotky a videa</h3><span class="muted small">do 50 MB na soubor</span></div>
              <div class="sec-body">${Media.section(id)}</div>
            </section>

            <section class="card flush" id="sec-money">
              <div class="sec-head"><h3>Příjmy a výdaje</h3><div class="sec-actions">
                <button class="btn xs" data-new="transactions" data-preset="${preset({ type: 'expense', dealId: id })}">${icon('plus')}<span>Výdaj</span></button>
                <button class="btn xs" data-new="transactions" data-preset="${preset({ type: 'income', dealId: id })}">${icon('plus')}<span>Příjem</span></button>
              </div></div>
              ${C.table({ cols: C.cols.movements({ deal: false }), rows: moves, rowAttrs: m => `data-edit="${m.col}" data-id="${m.id}"`,
                empty: noRows('Zatím žádné příjmy ani výdaje. Zaplacené faktury se sem doplní samy.') })}
            </section>

            <section class="card flush" id="sec-inv">
              <div class="sec-head"><h3>Faktury</h3><button class="btn xs" data-new="invoices" data-preset="${preset(Planning.invoicePreset(d))}">${icon('plus')}<span>Faktura</span></button></div>
              ${C.table({ cols: C.cols.invoices({ contact: false }), rows: invoices, rowAttrs: C.editAttrs('invoices'), empty: noRows('Žádné faktury k této zakázce.') })}
            </section>

            <section class="card flush" id="sec-info">
              <div class="sec-head"><h3>Informace o zakázce</h3></div>
              <dl class="fields">
                ${field('Cena zakázky', price ? money(price) : '')}
                ${field('Fáze', C.stagePill(d.stage))}
                ${field('Termín práce', Planning.term(d))}
                ${field('Kontakt', contact ? esc(contact.name) : '')}
                ${field('Adresa', contact ? esc(contact.address) : '')}
                ${field('Očekávané uzavření', d.expectedDate ? fmtDate(d.expectedDate) : '')}
                ${field('Vytvořeno', d.createdAt ? fmtDate(d.createdAt) : '')}
              </dl>
              ${d.note ? `<div class="sec-sub">Popis</div><p class="note">${esc(d.note)}</p>` : ''}
            </section>
          </div>
        </div>`;

      Media.mount(el.querySelector('#sec-media'), id);
      el.querySelector('#claim').addEventListener('click', () => Media.claimModal(id));
    },
  };
})();
