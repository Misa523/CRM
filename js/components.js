/* Sdílené kousky UI: tabulky, filtry, sloupce entit, štítky, avatar. */
(function () {
  const { esc, icon, money, fmtDate, relDue, today } = UI;

  const contactName = id => { const c = id && Store.get('contacts', id); return c ? c.name : ''; };

  function hue(str) {
    let h = 0;
    for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
  }
  const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const avatar = (name, size = '') => `<span class="avatar ${size}" style="--h:${hue(name)}">${esc(initials(name))}</span>`;

  const pill = (label, color = 'gray') => label ? `<span class="pill ${color}">${esc(label)}</span>` : '';
  const tags = list => (list || []).map(t => `<span class="tag">${esc(t)}</span>`).join('');

  const emptyState = (title, text, action = '') =>
    `<div class="empty"><strong>${esc(title)}</strong><p>${esc(text)}</p>${action}</div>`;

  const newBtn = (col, label, preset) =>
    `<button class="btn primary" data-new="${col}"${preset ? ` data-preset="${esc(JSON.stringify(preset))}"` : ''}>${icon('plus')}<span>${esc(label)}</span></button>`;

  const search = (placeholder, value) =>
    `<label class="search">${icon('search')}<input type="search" id="q" placeholder="${esc(placeholder)}" value="${esc(value)}" autocomplete="off"></label>`;

  const STAGE_COLOR = { lead: 'gray', contacted: 'blue', offer: 'violet', negotiation: 'amber', won: 'green', lost: 'red' };
  const stageLabel = id => (Schema.STAGES.find(s => s.id === id) || {}).label || id;
  const stagePill = id => pill(stageLabel(id), STAGE_COLOR[id]);

  function invoiceState(i) {
    if (i.status === 'paid') return { key: 'paid', label: 'Zaplacená', color: 'green' };
    if (i.status === 'sent' && i.dueDate && i.dueDate < today()) return { key: 'overdue', label: 'Po splatnosti', color: 'red' };
    if (i.status === 'sent') return { key: 'sent', label: 'Odeslaná', color: 'blue' };
    return { key: 'draft', label: 'Koncept', color: 'gray' };
  }

  const checkBtn = t =>
    `<button class="check${t.done ? ' on' : ''}" data-toggle-task="${t.id}" aria-label="${t.done ? 'Označit jako nehotové' : 'Označit jako hotové'}">${t.done ? icon('tick') : ''}</button>`;

  function due(dateStr, { done = false } = {}) {
    if (!dateStr) return '';
    const td = today();
    const cls = done ? '' : dateStr < td ? 'red' : dateStr === td ? 'amber' : '';
    return `<span class="due ${cls}">${fmtDate(dateStr)}${done ? '' : `<small>${esc(relDue(dateStr))}</small>`}</span>`;
  }

  /* ---------- Tabulka ----------
   * cols: [{ key, label, cls, sort?: row => hodnota, render: row => html }]
   * cls: 'primary' (hlavní sloupec), 'num' (číslo vpravo), 'c-check', 'c-act'
   * Na telefonu se tabulka sama přeskládá do karet. */
  function cmp(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), 'cs', { numeric: true });
  }
  function table({ cols, rows, sort, rowAttrs = () => '', empty = '' }) {
    if (!rows.length) return empty;
    let list = rows;
    const sc = sort && cols.find(c => c.key === sort.key && c.sort);
    if (sc) {
      list = rows.slice().sort((x, y) => {
        const a = sc.sort(x), b = sc.sort(y);
        const ea = a == null || a === '', eb = b == null || b === '';
        if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1; // prázdné vždy na konec
        return cmp(a, b) * sort.dir;
      });
    }
    const th = c => {
      const cls = c.cls ? ` class="${c.cls}"` : '';
      if (!c.sort || !sort) return `<th${cls}>${esc(c.label || '')}</th>`;
      const on = sort.key === c.key;
      return `<th${cls}><button class="th-sort${on ? ' on' : ''}" data-sort="${c.key}">${esc(c.label)}<span class="arrow">${on ? (sort.dir > 0 ? '▲' : '▼') : ''}</span></button></th>`;
    };
    return `<div class="table-wrap"><table class="dtable">
      <thead><tr>${cols.map(th).join('')}</tr></thead>
      <tbody>${list.map(r => `<tr ${rowAttrs(r)}>${cols.map(c =>
        `<td${c.cls ? ` class="${c.cls}"` : ''}${c.label ? ` data-label="${esc(c.label)}"` : ''}>${c.render(r)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  }
  function wireSort(root, state, redraw) {
    root.querySelectorAll('[data-sort]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.sort;
      state.sort = state.sort && state.sort.key === k ? { key: k, dir: -state.sort.dir } : { key: k, dir: 1 };
      redraw();
    }));
  }

  /* ---------- Filtrační panel vlevo (na menších displejích jako řada štítků) ----------
   * items: [{ key, label, count }] nebo { group: 'Nadpis skupiny' } */
  function filterPanel(title, items, active) {
    return `<aside class="filters" aria-label="${esc(title)}">
      <div class="filters-title">${esc(title)}</div>
      <div class="filters-list">${items.map(i => i.group
        ? `<div class="filters-group">${esc(i.group)}</div>`
        : `<button class="filter${i.key === active ? ' on' : ''}" data-filter="${esc(i.key)}"><span>${esc(i.label)}</span>${i.count != null ? `<span class="filter-count">${i.count}</span>` : ''}</button>`).join('')}</div>
    </aside>`;
  }
  function wireFilters(root, state, redraw) {
    root.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => { state.filter = b.dataset.filter; redraw(); }));
  }
  const listShell = (filters, toolbar) =>
    `<div class="list-layout">${filters}<section class="list-main"><div class="list-toolbar">${toolbar}</div><div id="list"></div></section></div>`;

  /* ---------- Sloupce pro jednotlivé entity ---------- */
  const PRIO_ORDER = { high: 0, normal: 1, low: 2 };
  const cols = {
    tasks: ({ contact = true } = {}) => [
      { key: 'check', cls: 'c-check', render: checkBtn },
      { key: 'title', label: 'Úkol', cls: 'primary', sort: t => t.title, render: t => `<span class="${t.done ? 'done-text' : ''}">${esc(t.title)}</span>` },
      contact && { key: 'contact', label: 'Kontakt', sort: t => contactName(t.contactId), render: t => esc(contactName(t.contactId)) },
      { key: 'due', label: 'Termín', sort: t => t.due, render: t => due(t.due, { done: t.done }) },
      { key: 'priority', label: 'Priorita', sort: t => PRIO_ORDER[t.priority], render: t =>
        t.priority === 'high' ? pill('Vysoká', 'red') : t.priority === 'low' ? pill('Nízká', 'gray') : '' },
    ].filter(Boolean),

    invoices: ({ contact = true } = {}) => [
      { key: 'number', label: 'Číslo faktury', cls: 'primary', sort: i => i.number, render: i => esc(i.number) },
      contact && { key: 'contact', label: 'Odběratel', sort: i => contactName(i.contactId), render: i => esc(contactName(i.contactId)) },
      { key: 'issueDate', label: 'Vystaveno', sort: i => i.issueDate, render: i => i.issueDate ? fmtDate(i.issueDate) : '' },
      { key: 'dueDate', label: 'Splatnost', sort: i => i.dueDate, render: i => due(i.dueDate, { done: i.status !== 'sent' }) },
      { key: 'amount', label: 'Částka', cls: 'num', sort: i => +i.amount || 0, render: i => `<strong>${money(i.amount)}</strong>` },
      { key: 'files', label: 'Soubor', cls: 'c-files', sort: i => (i.attachments || []).length || null, render: i => {
        const n = (i.attachments || []).length;
        if (!n) return '';
        const title = n === 1 ? `Otevřít ${i.attachments[0].name}` : `${n} soubory – otevřít fakturu`;
        return `<button class="clip" data-open-attach="${i.id}" title="${esc(title)}" aria-label="${esc(title)}">${icon('clip')}<span>${n === 1 ? esc((i.attachments[0].name.split('.').pop() || 'soubor').slice(0, 5).toUpperCase()) : n}</span></button>`;
      } },
      { key: 'status', label: 'Stav', sort: i => invoiceState(i).label, render: i => { const s = invoiceState(i); return pill(s.label, s.color); } },
      { key: 'pay', cls: 'c-act', render: i => i.status !== 'paid'
        ? `<button class="btn xs" data-mark-paid="${i.id}" title="Označit jako zaplacenou">${icon('tick')}<span>Zaplaceno</span></button>` : '' },
    ].filter(Boolean),

    deals: ({ contact = true } = {}) => [
      { key: 'title', label: 'Název obchodu', cls: 'primary', sort: d => d.title, render: d => esc(d.title) },
      contact && { key: 'contact', label: 'Kontakt', sort: d => contactName(d.contactId), render: d => esc(contactName(d.contactId)) },
      { key: 'stage', label: 'Fáze', sort: d => Schema.STAGES.findIndex(s => s.id === d.stage), render: d => stagePill(d.stage) },
      { key: 'value', label: 'Hodnota', cls: 'num', sort: d => +d.value || 0, render: d => `<strong>${money(d.value)}</strong>` },
      { key: 'expectedDate', label: 'Očekávané uzavření', sort: d => d.expectedDate, render: d => d.expectedDate ? fmtDate(d.expectedDate) : '' },
    ].filter(Boolean),
  };
  const editAttrs = col => r => `data-edit="${col}" data-id="${r.id}"`;

  window.C = {
    contactName, avatar, pill, tags, emptyState, newBtn, search, stagePill, stageLabel, invoiceState,
    checkBtn, due, table, wireSort, filterPanel, wireFilters, listShell, cols, editAttrs,
  };
})();
