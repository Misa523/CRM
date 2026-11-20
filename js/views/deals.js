window.Views = window.Views || {};

(function () {
  const { esc, icon, money, fmtDate, sum } = UI;

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

  Views.deals = {
    title: 'Obchody',
    actions: () => C.newBtn('deals', 'Obchod'),
    render(el) {
      const deals = Store.all('deals');
      const stages = Schema.STAGES;
      const open = deals.filter(d => d.stage !== 'won' && d.stage !== 'lost');
      const won = deals.filter(d => d.stage === 'won').length;
      const lost = deals.filter(d => d.stage === 'lost').length;
      const rate = won + lost ? Math.round((won / (won + lost)) * 100) : null;

      el.innerHTML = `
        <div class="summary-line">
          <span><strong>${money(sum(open, "value"))}</strong> · ${UI.plural(open.length, "otevřený obchod", "otevřené obchody", "otevřených obchodů")}</span>
          ${rate != null ? `<span class="muted">Úspěšnost ${rate} %</span>` : ''}
          <span class="muted small hide-touch">Karty můžete přetahovat myší mezi sloupci.</span>
        </div>
        <div class="kanban" data-keep-scroll="kanban">
          ${stages.map((s, i) => {
            const items = deals.filter(d => d.stage === s.id).sort((a, b) => (a.expectedDate || '9').localeCompare(b.expectedDate || '9'));
            return `<section class="col stage-${s.id}" data-stage="${s.id}">
              <header class="col-head"><span class="dot"></span><h3>${esc(s.label)}</h3><span class="count">${items.length}</span><span class="col-sum">${money(sum(items, 'value'))}</span></header>
              <div class="col-body">${items.map(d => dealCard(d, i, stages.length - 1)).join('') || '<div class="col-empty">Žádné obchody</div>'}</div>
              <button class="col-add" data-new="deals" data-preset="${esc(JSON.stringify({ stage: s.id }))}">${icon('plus')} Přidat</button>
            </section>`;
          }).join('')}
        </div>`;

      // Přetahování na počítači (na dotykových zařízeních slouží šipky na kartě).
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
