window.Views = window.Views || {};

/* Kalendář: zakázky (termín práce), úkoly a splatnosti faktur. Klepnutí na událost ji otevře k úpravě v okně. */
(function () {
  const { esc, icon, today, addDays, localISO } = UI;
  const LANES = 3; // kolik řádků událostí se vejde do dne, zbytek je „+N“
  const DAYS = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'];
  const KINDS = [['deals', 'Zakázky'], ['tasks', 'Úkoly'], ['invoices', 'Splatnosti faktur']];
  const state = { month: today().slice(0, 7), day: today(), show: { deals: true, tasks: true, invoices: true } };

  const weekday = s => (new Date(s + 'T00:00').getDay() + 6) % 7; // pondělí = 0
  const longDate = s => new Date(s + 'T00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
  const shift = n => { const d = new Date(state.month + '-01T00:00'); d.setMonth(d.getMonth() + n); return localISO(d).slice(0, 7); };
  const rerender = () => Views.calendar.render(document.getElementById('view'));

  /** Rozmístí události týdne do řádků tak, aby vícedenní zakázka tvořila souvislý pruh. */
  function layout(events, first, last) {
    const lanes = [];
    return events.filter(e => e.from <= last && e.to >= first).map(e => {
      const a = e.from < first ? 0 : weekday(e.from), b = e.to > last ? 6 : weekday(e.to);
      let lane = 0;
      while (lanes[lane] && lanes[lane].some(x => x.a <= b && x.b >= a)) lane++;
      (lanes[lane] = lanes[lane] || []).push({ a, b });
      return { e, a, b, lane, cutL: e.from < first, cutR: e.to > last };
    });
  }

  function weekHtml(first, events) {
    const last = addDays(first, 6), t = today();
    const items = layout(events, first, last);
    const days = DAYS.map((_, i) => {
      const day = addDays(first, i);
      const list = items.filter(x => x.a <= i && x.b >= i);
      const more = list.filter(x => x.lane >= LANES).length;
      const cls = [day.slice(0, 7) !== state.month ? 'out' : '', day === t ? 'today' : '', day === state.day ? 'sel' : '', i > 4 ? 'weekend' : ''].filter(Boolean).join(' ');
      return `<button class="cal-day ${cls}" data-day="${day}" style="grid-column:${i + 1}" aria-pressed="${day === state.day}" aria-label="${esc(longDate(day))}, ${UI.plural(list.length, 'událost', 'události', 'událostí')}">
        <span class="cal-num">${+day.slice(8)}</span>
        <span class="cal-dots">${list.slice(0, 4).map(x => `<i class="ev-${x.e.color}"></i>`).join('')}</span>
        ${more ? `<span class="cal-more">+${more}</span>` : ''}</button>`;
    }).join('');
    const bars = items.filter(x => x.lane < LANES).map(x => `<a class="cal-ev ev-${x.e.color} ${x.e.cls}${x.cutL ? ' cut-l' : ''}${x.cutR ? ' cut-r' : ''}" ${Planning.attrs(x.e, true)}
      style="grid-column:${x.a + 1} / ${x.b + 2};grid-row:${x.lane + 2}" title="${esc(x.e.title + ' – ' + x.e.sub)}">${x.e.kind === 'deal' ? '' : icon(Planning.ICON[x.e.kind])}<span>${esc(x.e.title)}</span></a>`).join('');
    return `<div class="cal-week">${days}${bars}</div>`;
  }

  Views.calendar = {
    title: 'Kalendář',
    actions: () => C.newBtn('deals', 'Zakázka', { stage: 'won', progress: 'planned', dateFrom: state.day, dateTo: state.day }),
    render(el) {
      const first = state.month + '-01';
      const gridStart = addDays(first, -weekday(first));
      const monthEnd = addDays(shift(1) + '-01', -1);
      const weeks = [];
      for (let d = gridStart; d <= monthEnd; d = addDays(d, 7)) weeks.push(d);
      const gridEnd = addDays(weeks[weeks.length - 1], 6);
      const events = Planning.events(gridStart, gridEnd, state.show);
      const dayEvents = Planning.events(state.day, state.day, state.show);
      const p = o => esc(JSON.stringify(o));

      el.innerHTML = `
        <div class="view-bar cal-bar">
          <div class="cal-nav">
            <button class="icon-btn" data-cal="-1" aria-label="Předchozí měsíc">${icon('left')}</button>
            <h2>${esc(new Date(first + 'T00:00').toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' }))}</h2>
            <button class="icon-btn" data-cal="1" aria-label="Další měsíc">${icon('right')}</button>
            <button class="btn xs" data-cal="0">Dnes</button>
          </div>
          <div class="cal-show">${KINDS.map(([k, l]) => `<button class="filter${state.show[k] ? ' on' : ''}" data-show="${k}" aria-pressed="${state.show[k]}"><span>${l}</span></button>`).join('')}</div>
        </div>
        <div class="cal-layout">
          <section class="card flush cal">
            <div class="cal-head">${DAYS.map(d => `<span>${d}</span>`).join('')}</div>
            ${weeks.map(w => weekHtml(w, events)).join('')}
          </section>
          <section class="card flush cal-agenda">
            <div class="sec-head"><h3>${esc(longDate(state.day))}</h3></div>
            <div class="ag-list">${dayEvents.map(e => Planning.row(e, '', true)).join('') || '<p class="muted small sec-empty">Na tento den nic není.</p>'}</div>
            <div class="ag-add">
              <button class="btn xs" data-new="deals" data-preset="${p({ stage: 'won', progress: 'planned', dateFrom: state.day, dateTo: state.day })}">${icon('plus')}<span>Zakázka</span></button>
              <button class="btn xs" data-new="tasks" data-preset="${p({ due: state.day })}">${icon('plus')}<span>Úkol</span></button>
            </div>
          </section>
        </div>
        <div class="cal-legend">${Planning.PROGRESS.map(x => `<span><i class="ev-${x.color}"></i>${x.label}</span>`).join('')}<span><i class="ev-gray tentative"></i>Předběžně</span></div>`;

      el.querySelectorAll('[data-cal]').forEach(b => b.addEventListener('click', () => {
        const n = +b.dataset.cal;
        if (n) { state.month = shift(n); state.day = today().startsWith(state.month) ? today() : state.month + '-01'; }
        else { state.day = today(); state.month = state.day.slice(0, 7); }
        rerender();
        document.getElementById('page-actions').innerHTML = Views.calendar.actions();
      }));
      el.querySelectorAll('[data-show]').forEach(b => b.addEventListener('click', () => { state.show[b.dataset.show] = !state.show[b.dataset.show]; rerender(); }));
      el.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => {
        state.day = b.dataset.day;
        state.month = state.day.slice(0, 7);
        rerender();
        document.getElementById('page-actions').innerHTML = Views.calendar.actions(); // nová zakázka s vybraným dnem
        const again = el.querySelector(`[data-day="${state.day}"]`);
        if (again) again.focus({ preventScroll: true });
      }));
    },
  };
})();
