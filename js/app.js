/* Router, navigace, menu „Vytvořit“ a globální obsluha kliknutí. */
window.APP_VERSION = '27/11/2026 d'; // zvyš při každé úpravě – ukazuje se v Nastavení
(function () {
  const NAV = [
    ['dashboard', 'Domů', 'home'],
    ['contacts', 'Kontakty', 'users'],
    ['deals', 'Zakázky', 'kanban'],
    ['calendar', 'Kalendář', 'calendar'],
    ['tasks', 'Úkoly', 'check'],
    ['invoices', 'Faktury', 'file'],
    ['finance', 'Finance', 'finance'],
  ];
  const CREATE = [
    ['contacts', 'Kontakt', 'users'],
    ['deals', 'Zakázka', 'kanban'],
    ['tasks', 'Úkol', 'check'],
    ['invoices', 'Faktura', 'file'],
    ['transactions', 'Výdaj', 'finance', { type: 'expense' }],
    ['transactions', 'Příjem mimo faktury', 'finance', { type: 'income' }],
  ];
  const $ = id => document.getElementById(id);

  $('quick-create').innerHTML = UI.icon('plus');
  $('settings-link').innerHTML = UI.icon('sliders');
  $('create-menu').innerHTML = '<div class="menu-title">Vytvořit</div>' + CREATE.map(([col, label, ic, preset]) =>
    `<button data-new="${col}"${preset ? ` data-preset="${UI.esc(JSON.stringify(preset))}"` : ''}>${UI.icon(ic)}<span>${label}</span></button>`).join('');

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

    const t = e.target.closest('[data-new], [data-edit], [data-toggle-task], [data-move], [data-progress], [data-move-progress], [data-mark-paid], [data-open-attach]');
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
    } else if (t.dataset.progress) {
      Planning.set(t.dataset.id, t.dataset.progress);
    } else if (t.dataset.moveProgress) {
      Views.deals.moveProgress(t.dataset.moveProgress, +t.dataset.dir);
    } else if (t.dataset.openAttach) {
      // Jedna příloha → rovnou otevřít, víc příloh → otevřít záznam se seznamem.
      const col = t.dataset.col || 'invoices';
      const rec = Store.get(col, t.dataset.openAttach);
      const list = (rec && rec.attachments) || [];
      if (list.length === 1) Files.open(list[0]); else if (rec) Schema.edit(col, rec.id);
    } else if (t.dataset.markPaid) {
      const inv = Store.get('invoices', t.dataset.markPaid);
      Store.update('invoices', inv.id, Schema.derive('invoices', { status: 'paid' }, inv));
      UI.toast('Faktura označena jako zaplacená');
      Planning.afterInvoice(Store.get('invoices', inv.id));
    }
  });

  /* ---------- Stav synchronizace (ikona v horní liště) ---------- */
  const SYNC_UI = {
    idle: ['cloud', 'Připojuji ke cloudu…'],
    syncing: ['refresh', 'Synchronizuji…'],
    ok: ['cloud', 'Vše je synchronizováno'],
    offline: ['cloudOff', 'Offline – změny se odešlou po připojení'],
    error: ['alert', 'Chyba synchronizace'],
  };
  function renderSync() {
    const btn = $('sync-status');
    if (!Sync.configured) { btn.hidden = true; return; }
    if (Sync.needsLogin()) {
      if (!document.getElementById('login')) Sync.showLogin(render);
      return;
    }
    const s = Sync.status();
    const [ic, label] = SYNC_UI[s.status] || SYNC_UI.idle;
    const title = s.status === 'error' && s.message ? `${label}: ${s.message}` : label;
    btn.hidden = false;
    btn.className = `appbar-btn sync ${s.status}`;
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.innerHTML = UI.icon(ic);
    const box = document.getElementById('sync-box');
    if (box && Views.settings.drawSync) Views.settings.drawSync(box);
  }

  /* ---------- Světlý / tmavý vzhled ---------- */
  function renderTheme() {
    const dark = Theme.resolved() === 'dark';
    const label = dark ? 'Přepnout na světlý vzhled' : 'Přepnout na tmavý vzhled';
    $('theme-toggle').innerHTML = UI.icon(dark ? 'sun' : 'moon');
    $('theme-toggle').title = label;
    $('theme-toggle').setAttribute('aria-label', label);
    document.querySelectorAll('[data-theme-set]').forEach(b => b.classList.toggle('on', b.dataset.themeSet === Theme.get()));
  }
  $('theme-toggle').addEventListener('click', Theme.toggle);
  Theme.onChange(renderTheme);
  renderTheme();

  window.addEventListener('hashchange', () => { UI.closeModal('změna stránky'); menu.hidden = true; render(); window.scrollTo(0, 0); });
  Store.onChange(render);
  Sync.onStatus(renderSync);
  Gcal.onChange(() => Gcal.draw(document.getElementById('gcal-box')));

  if (Sync.needsLogin()) {
    Sync.showLogin(render);
  } else {
    render();
    renderSync();
    Sync.start();
  }

  // Offline režim a „aplikace na ploše“ (jen na https, ne při otevření souboru dvojklikem).
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
