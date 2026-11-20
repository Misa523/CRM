window.Views = window.Views || {};

(function () {
  const { esc, icon, money, fmtDate, sum, norm } = UI;
  const state = { mode: 'kanban', filter: 'open', q: '', sort: { key: 'expectedDate', dir: 1 } };

  function dealCard(d, idx, last) {
    const contact = C.contactName(d.contactId);
    return `<article class="deal" draggable="true" data-deal="${d.id}">
      <button class="deal-main" data-edit="deals" data-id="${d.id}">
        <span class="deal-title">${esc(d.title)}</span>
        ${contact ? `<span class="muted small">${esc(contact)}</span>` : ''}
        <span class="deal-meta"><strong>${money(d.value)}</strong>${d.expectedDate ? `<span class="muted small">${fmtDate(d.expectedDate)}</span>` : ''}</span>
      </button>
      <div class="deal-move">
        <button class="icon-btn sm" data-move="${d.id}" data-dir="-1" ${idx === 0 ? 'disabled' : ''} aria-label="Posunout do předchozí fáze">${icon('left')}</button>
        <button class="icon-btn sm" data-move="${d.id}" data-dir="1" ${idx === last ? 'disabled' : ''} aria-label="Posunout do další fáze">${icon('right')}</button>
      </div>
    </article>`;
  }

  function renderKanban(el, deals) {
    const stages = Schema.STAGES;
    el.querySelector('#board').innerHTML = `<div class="kanban" data-keep-scroll="kanban">
      ${stages.map((s, i) => {
        const items = deals.filter(d => d.stage === s.id).sort((a, b) => (a.expectedDate || '9').localeCompare(b.expectedDate || '9'));
        return `<section class="col stage-${s.id}" data-stage="${s.id}">
          <header class="col-head"><div class="col-title"><h3>${esc(s.label)}</h3><span class="count">${items.length}</span></div><span class="col-sum">${money(sum(items, 'value'))}</span></header>
          <div class="col-body">${items.map(d => dealCard(d, i, stages.length - 1)).join('') || '<div class="col-empty">Žádné obchody</div>'}</div>
          <button class="col-add" data-new="deals" data-preset="${esc(JSON.stringify({ stage: s.id }))}">${icon('plus')} Přidat</button>
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
        if (d && d.stage !== col.dataset.stage) Views.deals.moveTo(id, col.dataset.stage);
      });
    });
  }

  function renderList(el, deals) {
    const test = f => f === 'all' ? () => true : f === 'open' ? d => d.stage !== 'won' && d.stage !== 'lost' : d => d.stage === f;
    const items = [
      { key: 'open', label: 'Otevřené obchody', count: deals.filter(test('open')).length },
      { key: 'all', label: 'Všechny obchody', count: deals.length },
      { group: 'Fáze' },
      ...Schema.STAGES.map(s => ({ key: s.id, label: s.label, count: deals.filter(test(s.id)).length })),
    ];
    const board = el.querySelector('#board');
    board.innerHTML = C.listShell(C.filterPanel('Zobrazit', items, state.filter),
      C.search('Hledat obchody…', state.q) + '<span class="total" id="total"></span>');
    const list = board.querySelector('#list');
    const draw = () => {
      const q = norm(state.q);
      const rows = deals.filter(test(state.filter)).filter(d => !q || norm([d.title, C.contactName(d.contactId), d.note].join(' ')).includes(q));
      board.querySelector('#total').textContent = `Celkem: ${rows.length} · ${money(sum(rows, 'value'))}`;
      list.innerHTML = C.table({
        cols: C.cols.deals(), rows, sort: state.sort, rowAttrs: C.editAttrs('deals'),
        empty: `<div class="card">${C.emptyState('Žádné obchody', 'V tomto filtru nic není.')}</div>`,
      });
      C.wireSort(list, state, draw);
    };
    board.querySelector('#q').addEventListener('input', e => { state.q = e.target.value; draw(); });
    C.wireFilters(board, state, () => Views.deals.render(el));
    draw();
  }

  Views.deals = {
    title: 'Obchody',
    actions: () => C.newBtn('deals', 'Obchod'),
    render(el) {
      const deals = Store.all('deals');
      const open = deals.filter(d => d.stage !== 'won' && d.stage !== 'lost');
      const won = deals.filter(d => d.stage === 'won').length;
      const lost = deals.filter(d => d.stage === 'lost').length;
      const rate = won + lost ? Math.round((won / (won + lost)) * 100) : null;

      el.innerHTML = `
        <div class="view-bar">
          <div class="segmented" role="tablist" aria-label="Zobrazení">
            <button role="tab" class="${state.mode === 'kanban' ? 'on' : ''}" data-mode="kanban">${icon('kanban')}<span>Kanban</span></button>
            <button role="tab" class="${state.mode === 'list' ? 'on' : ''}" data-mode="list">${icon('file')}<span>Seznam</span></button>
          </div>
          <span class="summary"><strong>${money(sum(open, 'value'))}</strong> · ${UI.plural(open.length, 'otevřený obchod', 'otevřené obchody', 'otevřených obchodů')}${rate != null ? ` · úspěšnost ${rate} %` : ''}</span>
        </div>
        <div id="board"></div>`;
      el.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { state.mode = b.dataset.mode; Views.deals.render(el); }));
      if (state.mode === 'list') renderList(el, deals); else renderKanban(el, deals);
    },
    moveTo(id, stage) {
      const d = Store.get('deals', id);
      Store.update('deals', id, Schema.derive('deals', { stage }, d));
      UI.toast(stage === 'won' ? '🎉 Obchod vyhrán!' : 'Přesunuto: ' + C.stageLabel(stage));
    },
    move(id, dir) {
      const d = Store.get('deals', id);
      const idx = Schema.STAGES.findIndex(s => s.id === d.stage);
      const next = Schema.STAGES[idx + dir];
      if (next) Views.deals.moveTo(id, next.id);
    },
  };
})();
