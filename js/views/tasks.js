window.Views = window.Views || {};

(function () {
  const { today, norm } = UI;
  const state = { filter: 'open', q: '', sort: { key: 'due', dir: 1 } };
  const FILTERS = [
    ['open', 'Otevřené úkoly'], ['today', 'Dnes a dříve'], ['overdue', 'Po termínu'], ['high', 'Vysoká priorita'], ['done', 'Dokončené'], ['all', 'Všechny úkoly'],
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
        high: x => !x.done && x.priority === 'high',
        done: x => x.done,
        all: () => true,
      };

      el.innerHTML = C.listShell(
        C.filterPanel('Zobrazit', FILTERS.map(([k, label]) => ({ key: k, label, count: all.filter(test[k]).length })), state.filter),
        `<form class="quick-add" id="quick">
           <input name="title" placeholder="Rychle přidat úkol na dnes… (Enter)" autocomplete="off" required>
           <button class="btn primary" type="submit">Přidat</button>
         </form>
         ${C.search('Hledat v úkolech…', state.q)}
         <span class="total" id="total"></span>`);

      const list = el.querySelector('#list');
      const draw = () => {
        const q = norm(state.q);
        const rows = all.filter(test[state.filter])
          .filter(x => !q || norm([x.title, C.contactName(x.contactId), x.note].join(' ')).includes(q));
        el.querySelector('#total').textContent = `Celkem záznamů: ${rows.length}`;
        list.innerHTML = C.table({
          cols: C.cols.tasks(), rows, sort: state.sort, rowAttrs: C.editAttrs('tasks'),
          empty: `<div class="card">${C.emptyState(state.filter === 'done' ? 'Zatím nic hotového' : 'Žádné úkoly', state.filter === 'done' ? 'Dokončené úkoly se zobrazí tady.' : 'Tady je čisto.')}</div>`,
        });
        C.wireSort(list, state, draw);
      };

      el.querySelector('#quick').addEventListener('submit', e => {
        e.preventDefault();
        const title = e.target.elements.title.value.trim();
        if (!title) return;
        Store.add('tasks', { title, due: t, priority: 'normal', done: false });
        UI.toast('Úkol přidán');
        const input = el.querySelector('#quick input');
        if (input) input.focus();
      });
      el.querySelector('#q').addEventListener('input', e => { state.q = e.target.value; draw(); });
      C.wireFilters(el, state, () => Views.tasks.render(el));
      draw();
    },
  };
})();
