/* Router, navigace a globální obsluha kliknutí. */
(function () {
  const NAV = [
    ['dashboard', 'Přehled', 'home'],
    ['contacts', 'Kontakty', 'users'],
    ['deals', 'Obchody', 'kanban'],
    ['tasks', 'Úkoly', 'check'],
    ['invoices', 'Faktury', 'file'],
    ['settings', 'Nastavení', 'sliders'],
  ];
  const $ = id => document.getElementById(id);

  function renderNav(active) {
    const html = NAV.map(([id, label, ic]) =>
      `<a href="#/${id}" class="nav-item${active === id ? ' active' : ''}"${active === id ? ' aria-current="page"' : ''}>${UI.icon(ic)}<span>${label}</span></a>`).join('');
    $('nav-side').innerHTML = html;
    $('nav-tab').innerHTML = html;
  }

  function parse() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    return { page: parts[0] || 'dashboard', id: parts[1] ? decodeURIComponent(parts[1]) : null };
  }

  function render() {
    const { page, id } = parse();
    const view = Views[page] || Views.dashboard;
    const el = $('view');

    // Zachová vodorovné posunutí (např. kanban) při překreslení.
    const keep = {};
    el.querySelectorAll('[data-keep-scroll]').forEach(n => { keep[n.dataset.keepScroll] = n.scrollLeft; });

    renderNav(view.nav || (Views[page] ? page : 'dashboard'));
    const title = typeof view.title === 'function' ? view.title(id) : view.title;
    $('page-title').textContent = title;
    $('page-actions').innerHTML = view.actions ? view.actions(id) : '';
    const back = $('back');
    back.hidden = !view.back;
    if (view.back) { back.href = view.back; back.innerHTML = UI.icon('left'); }
    const biz = Store.settings().businessName || 'Moje CRM';
    $('brand-name').textContent = biz;
    document.title = `${title} · ${biz}`;

    view.render(el, id);
    el.querySelectorAll('[data-keep-scroll]').forEach(n => { if (keep[n.dataset.keepScroll] != null) n.scrollLeft = keep[n.dataset.keepScroll]; });
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-new], [data-edit], [data-toggle-task], [data-move], [data-mark-paid]');
    if (!t) return;
    e.preventDefault();
    if (t.dataset.new) {
      Schema.edit(t.dataset.new, null, t.dataset.preset ? JSON.parse(t.dataset.preset) : {});
    } else if (t.dataset.edit) {
      Schema.edit(t.dataset.edit, t.dataset.id);
    } else if (t.dataset.toggleTask) {
      const task = Store.get('tasks', t.dataset.toggleTask);
      Store.update('tasks', task.id, { done: !task.done, doneAt: task.done ? null : UI.today() });
      UI.toast(task.done ? 'Úkol dokončen ✓' : 'Úkol znovu otevřen');
    } else if (t.dataset.move) {
      Views.deals.move(t.dataset.move, +t.dataset.dir);
    } else if (t.dataset.markPaid) {
      const inv = Store.get('invoices', t.dataset.markPaid);
      Store.update('invoices', inv.id, Schema.derive('invoices', { status: 'paid' }, inv));
      UI.toast('Faktura označena jako zaplacená');
    }
  });

  window.addEventListener('hashchange', () => { UI.closeModal(); render(); window.scrollTo(0, 0); });
  Store.onChange(render);
  render();
})();
