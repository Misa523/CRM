/* Datová vrstva. Vše se ukládá do localStorage pod jedním klíčem.
 * Pokud se mění tvar dat, zvyšte SCHEMA_VERSION a doplňte migraci v migrate(). */
(function () {
  const KEY = 'crm-data-v1';
  const SCHEMA_VERSION = 3; // 2: faktury mají attachments[], 3: kolekce transactions a media, faktury mají dealId
  const COLLECTIONS = ['contacts', 'deals', 'tasks', 'invoices', 'transactions', 'media'];

  const empty = () => ({
    version: SCHEMA_VERSION,
    contacts: [], deals: [], tasks: [], invoices: [], transactions: [], media: [],
    settings: { businessName: 'Moje CRM', currency: 'CZK', lastBackup: null },
  });

  function migrate(d) {
    const base = empty();
    const out = Object.assign(base, d || {});
    out.settings = Object.assign(empty().settings, (d && d.settings) || {});
    COLLECTIONS.forEach(c => { if (!Array.isArray(out[c])) out[c] = []; });
    out.contacts.forEach(c => { c.tags = c.tags || []; c.activities = c.activities || []; });
    out.invoices.forEach(i => { i.attachments = i.attachments || []; });
    out.transactions.forEach(t => { t.attachments = t.attachments || []; });
    delete out.files; // soubory ze zálohy patří do IndexedDB, ne do localStorage
    out.version = SCHEMA_VERSION;
    return out;
  }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const iso = d => {
    const z = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  };

  let data;
  const listeners = [];

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      data = migrate(raw ? JSON.parse(raw) : null);
    } catch (e) {
      console.error(e);
      data = empty();
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      alert('Data se nepodařilo uložit: ' + e.message);
    }
    listeners.forEach(fn => fn());
  }

  const Store = {
    uid,
    all: col => data[col],
    get: (col, id) => data[col].find(x => x.id === id),
    add(col, obj) {
      const item = Object.assign({ id: uid(), createdAt: new Date().toISOString() }, obj);
      data[col].push(item);
      save();
      return item;
    },
    /** Přidá víc záznamů najednou (jedno uložení a překreslení). */
    addMany(col, list) {
      list.forEach(o => data[col].push(Object.assign({ id: uid(), createdAt: new Date().toISOString() }, o)));
      save();
    },
    update(col, id, patch) {
      const item = Store.get(col, id);
      if (!item) return null;
      Object.assign(item, patch, { updatedAt: new Date().toISOString() });
      save();
      return item;
    },
    remove(col, id) {
      data[col] = data[col].filter(x => x.id !== id);
      save();
    },
    /** Smaže kontakt a odpojí ho od obchodů, úkolů a faktur (ty zůstanou). */
    removeContact(id) {
      ['deals', 'tasks', 'invoices'].forEach(c =>
        data[c].forEach(x => { if (x.contactId === id) x.contactId = ''; }));
      Store.remove('contacts', id);
    },
    /** Smaže zakázku a záznamy jejích fotek; faktury a pohyby zůstanou, jen se odpojí. Soubory maže Media.removeDeal. */
    removeDeal(id) {
      const now = new Date().toISOString();
      ['invoices', 'transactions'].forEach(c =>
        data[c].forEach(x => { if (x.dealId === id) { x.dealId = ''; x.updatedAt = now; } }));
      data.media = data.media.filter(m => m.dealId !== id);
      Store.remove('deals', id);
    },
    /** Doklady (přílohy faktur a pohybů): [{ id, name, type, size }]. */
    docMetas: () => data.invoices.concat(data.transactions).flatMap(x => x.attachments || []),
    /** Id všech souborů v úložišti, včetně fotek, videí a jejich náhledů (<id>-t). */
    fileIds: () => Store.docMetas().map(a => a.id).concat(data.media.flatMap(m => (m.thumb ? [m.id + '-t', m.id] : [m.id]))),
    /** Celý datový objekt (jen pro čtení – používá synchronizace pro porovnání změn). */
    raw: () => data,
    /** Změny stažené z cloudu: [{ col, id, data | null }]. Přepíše/smaže záznamy a uloží jednou. */
    applyRemote(changes) {
      changes.forEach(({ col, id, data: d }) => {
        if (col === 'settings') { if (d) data.settings = Object.assign(empty().settings, d); return; }
        if (!COLLECTIONS.includes(col)) return;
        const idx = data[col].findIndex(x => x.id === id);
        if (d) { if (idx >= 0) data[col][idx] = d; else data[col].push(d); }
        else if (idx >= 0) data[col].splice(idx, 1);
      });
      data = migrate(data);
      save();
    },
    settings: () => data.settings,
    setSettings(patch) { Object.assign(data.settings, patch); save(); },
    isEmpty: () => COLLECTIONS.every(c => data[c].length === 0),
    onChange(fn) { listeners.push(fn); },

    nextInvoiceNumber() {
      const y = String(new Date().getFullYear());
      const nums = data.invoices.map(i => String(i.number || ''))
        .filter(n => n.startsWith(y)).map(n => parseInt(n.slice(4), 10) || 0);
      return y + String(Math.max(0, ...nums) + 1).padStart(3, '0');
    },

    exportJSON: () => JSON.stringify(data, null, 2),
    markBackup() { data.settings.lastBackup = new Date().toISOString(); save(); },
    importJSON(text) {
      const obj = JSON.parse(text);
      if (!obj || !Array.isArray(obj.contacts)) throw new Error('Soubor nevypadá jako záloha CRM.');
      const media = data.media;
      data = migrate(obj);
      // Fotky a videa se obnovením nemažou (v záloze nejsou jejich soubory), pokud jejich zakázka dál existuje.
      const have = new Set(data.media.map(m => m.id)), deals = new Set(data.deals.map(d => d.id));
      data.media = data.media.concat(media.filter(m => !have.has(m.id) && deals.has(m.dealId)));
      save();
    },
    reset() {
      const s = data.settings;
      data = empty();
      data.settings = Object.assign(data.settings, { businessName: s.businessName, currency: s.currency });
      save();
    },

    seedDemo() {
      const now = new Date();
      const d = n => { const x = new Date(now); x.setDate(x.getDate() + n); return iso(x); };
      const ts = n => { const x = new Date(now); x.setDate(x.getDate() + n); return x.toISOString(); };
      const push = (col, o) => { const it = Object.assign({ id: uid(), createdAt: new Date().toISOString() }, o); data[col].push(it); return it.id; };
      const contact = o => push('contacts', Object.assign({ tags: [], activities: [] }, o));

      const jana = contact({ name: 'Jana Nováková', company: 'Kavárna U Lípy', email: 'jana@example.com', phone: '+420 777 123 456', tags: ['VIP', 'Praha'], note: 'Preferuje komunikaci e-mailem.',
        activities: [{ id: uid(), date: ts(-2), text: 'Telefonát: chce rozšířit spolupráci i na druhou pobočku.' }, { id: uid(), date: ts(-40), text: 'Úvodní schůzka, zájem o pravidelnou spolupráci.' }] });
      const petr = contact({ name: 'Petr Svoboda', company: 'Svoboda Stavby s.r.o.', email: 'petr@example.com', phone: '+420 603 987 654', ico: '12345678', tags: ['Brno'] });
      const lucie = contact({ name: 'Lucie Dvořáková', company: 'Studio Lumen', email: 'lucie@example.com', tags: ['Nový'] });
      const martin = contact({ name: 'Martin Černý', phone: '+420 728 555 010', tags: ['Praha'] });

      const y = String(now.getFullYear());
      const deal = o => push('deals', o);
      const branding = deal({ title: 'Branding pobočky 2', contactId: jana, value: 45000, stage: 'offer', expectedDate: d(14) });
      const web = deal({ title: 'Web pro stavební firmu', contactId: petr, value: 80000, stage: 'negotiation', expectedDate: d(7) });
      deal({ title: 'Fotografie produktů', contactId: lucie, value: 12000, stage: 'lead', expectedDate: d(30) });
      deal({ title: 'Konzultace marketingu', contactId: martin, value: 6000, stage: 'contacted' });
      const listky = deal({ title: 'Jídelní lístky', contactId: jana, value: 9000, stage: 'won', wonDate: d(-20) });

      const task = o => push('tasks', Object.assign({ done: false, priority: 'normal' }, o));
      task({ title: 'Poslat nabídku na branding', contactId: jana, due: d(0), priority: 'high' });
      task({ title: 'Zavolat kvůli termínu schůzky', contactId: petr, due: d(-1) });
      task({ title: 'Připravit portfolio fotek', contactId: lucie, due: d(3) });
      task({ title: 'Objednat vizitky', due: d(5), priority: 'low' });
      task({ title: 'Odeslat fakturu za jídelní lístky', contactId: jana, due: d(-18), done: true, doneAt: d(-18) });

      const inv = (n, o) => push('invoices', Object.assign({ number: y + String(n).padStart(3, '0') }, o));
      inv(901, { contactId: jana, amount: 18000, issueDate: d(-150), dueDate: d(-136), status: 'paid', paidDate: d(-140) });
      inv(902, { contactId: petr, amount: 24000, issueDate: d(-110), dueDate: d(-96), status: 'paid', paidDate: d(-100) });
      inv(903, { contactId: martin, amount: 6000, issueDate: d(-75), dueDate: d(-61), status: 'paid', paidDate: d(-65) });
      inv(904, { contactId: lucie, amount: 15000, issueDate: d(-45), dueDate: d(-31), status: 'paid', paidDate: d(-33) });
      inv(905, { contactId: jana, dealId: listky, amount: 9000, issueDate: d(-18), dueDate: d(-4), status: 'paid', paidDate: d(-3) });
      inv(906, { contactId: petr, dealId: web, amount: 32000, issueDate: d(-20), dueDate: d(-6), status: 'sent' });
      inv(907, { contactId: lucie, amount: 7500, issueDate: d(-2), dueDate: d(12), status: 'sent' });
      const tr = o => push('transactions', Object.assign({ type: 'expense', attachments: [] }, o));
      tr({ title: 'Tisk jídelních lístků', amount: 3200, date: d(-19), category: 'subcontract', vendor: 'Tiskárna', dealId: listky });
      tr({ title: 'Papír a vazba', amount: 900, date: d(-21), category: 'material', dealId: listky });
      tr({ title: 'Záloha na branding', type: 'income', amount: 15000, date: d(-5), dealId: branding });
      tr({ title: 'Fotobanka', amount: 1800, date: d(-4), category: 'services', dealId: branding });
      tr({ title: 'Doména a hosting', amount: 2400, date: d(-12), category: 'services', dealId: web });
      tr({ title: 'Nájem kanceláře', amount: 6500, date: d(-35), category: 'rent' });
      tr({ title: 'Pohonné hmoty', amount: 1700, date: d(-70), category: 'transport' });
      inv(908, { contactId: martin, amount: 4500, issueDate: d(0), dueDate: d(14), status: 'draft' });
      save();
    },
  };

  load();
  // Změna v jiné kartě prohlížeče → převzít ji.
  window.addEventListener('storage', e => { if (e.key === KEY) { load(); listeners.forEach(fn => fn()); } });
  window.Store = Store;
})();
