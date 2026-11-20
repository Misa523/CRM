window.Views = window.Views || {};

(function () {
  const { esc, today } = UI;
  const state = { filter: 'open' };
  const FILTERS = [
    ['open', 'Otevřené'], ['today', 'Dnes a dříve'], ['overdue', 'Po termínu'], ['done', 'Hotové'], ['all', 'Vše'],
  ];

  Views.tasks = {
    title: 'Úkoly',
    actions: () => C.newBtn('tasks', 'Úkol'),
    render(el) {
      const t = today();
      const all = Store.all('tasks');
      const test = {
        open: x => !x.done,
        today: x => !x.done && x.due && x.due <= t,
        overdue: x => !x.done && x.due && x.due < t,
        done: x => x.done,
        all: () => true,
      };
      const counts = Object.fromEntries(FILTERS.map(([k]) => [k, all.filter(test[k]).length]));
      const items = all.filter(test[state.filter]).sort((a, b) =>
        state.filter === 'done'
          ? (b.doneAt || '').localeCompare(a.doneAt || '')
          : (a.done - b.done) || (a.due || '9999').localeCompare(b.due || '9999') || (a.priority === 'high' ? -1 : 0));

      el.innerHTML = `
        <form class="quick-add card" id="quick">
          <input name="title" placeholder="Rychle přidat úkol na dnes… (Enter)" autocomplete="off" required>
          <button class="btn primary" type="submit">Přidat</button>
        </form>
        <div class="segmented" role="tablist">${FILTERS.map(([k, label]) =>
          `<button role="tab" class="${state.filter === k ? 'on' : ''}" data-filter="${k}">${esc(label)} <span class="count">${counts[k]}</span></button>`).join('')}</div>
        <div class="card list-card"><div class="rows">${items.map(x => C.taskRow(x)).join('') ||
          C.emptyState(state.filter === 'done' ? 'Zatím nic hotového' : 'Žádné úkoly', state.filter === 'done' ? 'Dokončené úkoly se zobrazí tady.' : 'Tady je čisto. 🎉')}</div></div>`;

      el.querySelector('#quick').addEventListener('submit', e => {
        e.preventDefault();
        const title = e.target.elements.title.value.trim();
        if (!title) return;
        Store.add('tasks', { title, due: t, priority: 'normal', done: false });
        UI.toast('Úkol přidán');
        const input = el.querySelector('#quick input');
        if (input) input.focus();
      });
      el.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => { state.filter = b.dataset.filter; Views.tasks.render(el); }));
    },
  };
})();
