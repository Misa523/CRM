window.Views = window.Views || {};

(function () {
  const { esc, icon, money, fmtDate, sum, norm } = UI;
  const state = { mode: 'kanban', filter: 'open', q: '', sort: { key: 'expectedDate', dir: 1 } };

  function dealCard(d, idx, last, progress) {
    const mv = progress ? 'data-move-progress' : 'data-move';
    const contact = C.contactName(d.contactId);
    return `<article class="deal" draggable="true" data-deal="${d.id}">
      <a class="deal-main" href="${C.dealHref(d.id)}" draggable="false">
        <span class="deal-title">${esc(d.title)}</span>
        ${contact ? `<span class="muted small">${esc(contact)}</span>` : ''}
        <span class="deal-meta"><strong>${money(d.value)}</strong>${progress ? `<span class="muted small">${Planning.term(d) || 'bez termínu'}</span>` : d.expectedDate ? `<span class="muted small">${fmtDate(d.expectedDate)}</span>` : ''}</span>
        ${C.mediaBadge(d.id)}
      </a>
      <div class="deal-move">
        <button class="icon-btn sm" ${mv}="${d.id}" data-dir="-1" ${idx === 0 ? 'disabled' : ''} aria-label="Posunout do předchozí fáze">${icon('left')}</button>
        <button class="icon-btn sm" ${mv}="${d.id}" data-dir="1" ${idx === last ? 'disabled' : ''} aria-label="Posunout do další fáze">${icon('right')}</button>
      </div>
    </article>`;
  }

  const MAX_DONE = 20; // kolik vyfakturovaných zakázek ukázat v kanbanu (zbytek je v seznamu)
  /** Kanban podle obchodní fáze, nebo (progress) podle průběhu vyhraných zakázek. */
  function renderKanban(el, deals, progress) {
    const stages = progress ? Planning.PROGRESS : Schema.STAGES;
    const of = d => (progress ? Planning.of(d) : d.stage);
    const key = d => (progress ? Planning.start(d) : d.expectedDate) || '9';
    if (progress) deals = deals.filter(d => d.stage === 'won');
    el.querySelector('#board').innerHTML = `<div class="kanban" data-keep-scroll="kanban-${progress ? 'p' : 's'}">
      ${stages.map((s, i) => {
        const items = deals.filter(d => of(d) === s.id).sort((a, b) => key(a).localeCompare(key(b)) * (progress && s.id === 'invoiced' ? -1 : 1));
        const cards = progress && s.id === 'invoiced' ? items.slice(0, MAX_DONE) : items;
        return `<section class="col stage-${s.id}" data-stage="${s.id}">
          <header class="col-head"><div class="col-title"><h3>${esc(s.label)}</h3><span class="count">${items.length}</span></div><span class="col-sum">${money(sum(items, 'value'))}</span></header>
          <div class="col-body">${cards.map(d => dealCard(d, i, stages.length - 1, progress)).join('') || '<div class="col-empty">Žádné zakázky</div>'}${items.length > cards.length ? `<p class="muted small col-more">a další ${items.length - cards.length} v Seznamu</p>` : ''}</div>
          <button class="col-add" data-new="deals" data-preset="${esc(JSON.stringify(progress ? { stage: 'won', progress: s.id } : { stage: s.id }))}">${icon('plus')} Přidat</button>
        </section>`;
      }).join('')}
    </div>`;

    // Přetahování myší (na dotykových zařízeních slouží šipky na kartě).
    el.querySelectorAll('.deal').forEach(card => {
      card.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', card.dataset.deal); card.classList.add('dragging'); });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
    });
    el.querySelectorAll('.col').forEach(col => {
      col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drop'); });
      col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('drop'); });
      col.addEventListener('drop', e => {
        e.preventDefault();
        col.classList.remove('drop');
        const id = e.dataTransfer.getData('text/plain');
        const d = Store.get('deals', id);
        if (!d || of(d) === col.dataset.stage) return;
        if (progress) Planning.set(id, col.dataset.stage); else Views.deals.moveTo(id, col.dataset.stage);
      });
    });
  }

  function renderList(el, deals) {
    const test = f => f === 'all' ? () => true : f === 'open' ? d => d.stage !== 'won' && d.stage !== 'lost'
      : f.startsWith('p:') ? d => d.stage === 'won' && Planning.of(d) === f.slice(2) : d => d.stage === f;
    const items = [
      { key: 'open', label: 'Otevřené zakázky', count: deals.filter(test('open')).length },
      { key: 'all', label: 'Všechny zakázky', count: deals.length },
      { group: 'Průběh' },
      ...Planning.PROGRESS.map(p => ({ key: 'p:' + p.id, label: p.label, count: deals.filter(test('p:' + p.id)).length })),
      { group: 'Fáze' },
      ...Schema.STAGES.map(s => ({ key: s.id, label: s.label, count: deals.filter(test(s.id)).length })),
    ];
    const board = el.querySelector('#board');
    board.innerHTML = C.listShell(C.filterPanel('Zobrazit', items, state.filter),
      C.search('Hledat zakázky…', state.q) + '<span class="total" id="total"></span>');
    const list = board.querySelector('#list');
    const draw = () => {
      const q = norm(state.q);
      const rows = deals.filter(test(state.filter)).filter(d => !q || norm([d.title, C.contactName(d.contactId), d.note].join(' ')).includes(q));
      board.querySelector('#total').textContent = `Celkem: ${rows.length} · ${money(sum(rows, 'value'))}`;
      list.innerHTML = C.table({
        cols: C.cols.deals(), rows, sort: state.sort, rowAttrs: C.hrefAttrs(C.dealHref),
        empty: `<div class="card">${C.emptyState('Žádné zakázky', 'V tomto filtru nic není.')}</div>`,
      });
      C.wireSort(list, state, draw);
    };
    board.querySelector('#q').addEventListener('input', e => { state.q = e.target.value; draw(); });
    C.wireFilters(board, state, () => Views.deals.render(el));
    draw();
  }

  Views.deals = {
    title: 'Zakázky',
    actions: () => C.newBtn('deals', 'Zakázka'),
    render(el) {
      const deals = Store.all('deals');
      const open = deals.filter(d => d.stage !== 'won' && d.stage !== 'lost');
      const work = deals.filter(d => d.stage === 'won' && Planning.of(d) !== 'invoiced');
      const won = deals.filter(d => d.stage === 'won').length;
      const lost = deals.filter(d => d.stage === 'lost').length;
      const rate = won + lost ? Math.round((won / (won + lost)) * 100) : null;

      el.innerHTML = `
        <div class="view-bar">
          <div class="segmented" role="tablist" aria-label="Zobrazení">
            <button role="tab" class="${state.mode === 'kanban' ? 'on' : ''}" data-mode="kanban">${icon('kanban')}<span>Nabídky</span></button>
            <button role="tab" class="${state.mode === 'progress' ? 'on' : ''}" data-mode="progress">${icon('tick')}<span>Realizace</span></button>
            <button role="tab" class="${state.mode === 'list' ? 'on' : ''}" data-mode="list">${icon('file')}<span>Seznam</span></button>
          </div>
          <span class="summary">${state.mode === 'progress' ? `<strong>${money(sum(work, 'value'))}</strong> · ${UI.plural(work.length, 'rozpracovaná zakázka', 'rozpracované zakázky', 'rozpracovaných zakázek')}` : `<strong>${money(sum(open, 'value'))}</strong> · ${UI.plural(open.length, 'otevřená zakázka', 'otevřené zakázky', 'otevřených zakázek')}${rate != null ? ` · úspěšnost ${rate} %` : ''}`}</span>
        </div>
        <div id="board"></div>`;
      el.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { state.mode = b.dataset.mode; Views.deals.render(el); }));
      if (state.mode === 'list') renderList(el, deals); else renderKanban(el, deals, state.mode === 'progress');
    },
    moveTo(id, stage) {
      const d = Store.get('deals', id);
      Store.update('deals', id, Schema.derive('deals', { stage }, d));
      UI.toast(stage === 'won' ? '🎉 Zakázka vyhrána!' : 'Přesunuto: ' + C.stageLabel(stage));
    },
    moveProgress(id, dir) {
      const d = Store.get('deals', id);
      const next = Planning.PROGRESS[Planning.PROGRESS.findIndex(p => p.id === Planning.of(d)) + dir];
      if (next) Planning.set(id, next.id);
    },
    move(id, dir) {
      const d = Store.get('deals', id);
      const idx = Schema.STAGES.findIndex(s => s.id === d.stage);
      const next = Schema.STAGES[idx + dir];
      if (next) Views.deals.moveTo(id, next.id);
    },
  };
})();
