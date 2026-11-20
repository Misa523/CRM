/* Router, navigace, menu „Vytvořit“ a globální obsluha kliknutí. */
(function () {
  const NAV = [
    ['dashboard', 'Domů', 'home'],
    ['contacts', 'Kontakty', 'users'],
    ['deals', 'Obchody', 'kanban'],
    ['tasks', 'Úkoly', 'check'],
    ['invoices', 'Faktury', 'file'],
  ];
  const CREATE = [
    ['contacts', 'Kontakt', 'users'],
    ['deals', 'Obchod', 'kanban'],
    ['tasks', 'Úkol', 'check'],
    ['invoices', 'Faktura', 'file'],
  ];
  const $ = id => document.getElementById(id);

  $('quick-create').innerHTML = UI.icon('plus');
  $('settings-link').innerHTML = UI.icon('sliders');
  $('create-menu').innerHTML = '<div class="menu-title">Vytvořit</div>' + CREATE.map(([col, label, ic]) =>
    `<button data-new="${col}">${UI.icon(ic)}<span>${label}</span></button>`).join('');

  function renderNav(active) {
    $('nav-top').innerHTML = NAV.map(([id, label]) =>
      `<a href="#/${id}" class="module${active === id ? ' on' : ''}"${active === id ? ' aria-current="page"' : ''}>${label}</a>`).join('');
    $('nav-tab').innerHTML = NAV.map(([id, label, ic]) =>
      `<a href="#/${id}" class="nav-item${active === id ? ' active' : ''}"${active === id ? ' aria-current="page"' : ''}>${UI.icon(ic)}<span>${label}</span></a>`).join('');
    $('settings-link').classList.toggle('on', active === 'settings');
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
    $('pagehead').hidden = !!view.hideHead;
    $('page-title').textContent = title;
    $('page-sub').textContent = view.subtitle ? view.subtitle(id) : '';
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

  // Menu „Vytvořit“
  const menu = $('create-menu');
  $('quick-create').addEventListener('click', e => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  document.addEventListener('click', e => { if (!menu.hidden && !e.target.closest('#create-menu')) menu.hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') menu.hidden = true; });

  document.addEventListener('click', e => {
    // Klik na řádek tabulky, který vede na detail (odkazy a tlačítka v řádku mají přednost).
    const row = e.target.closest('[data-href]');
    if (row && !e.target.closest('a, button, input, label, select, textarea')) {
      location.hash = row.dataset.href;
      return;
    }
    const jump = e.target.closest('[data-jump]');
    if (jump) {
      const target = $(jump.dataset.jump);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const t = e.target.closest('[data-new], [data-edit], [data-toggle-task], [data-move], [data-mark-paid]');
    if (!t) return;
    e.preventDefault();
    if (t.dataset.new) {
      menu.hidden = true;
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

  window.addEventListener('hashchange', () => { UI.closeModal(); menu.hidden = true; render(); window.scrollTo(0, 0); });
  Store.onChange(render);
  render();
})();
