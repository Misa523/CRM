/* Definice entit: popisky, číselníky a pole formulářů.
 * Nové pole přidáte sem do fields() – formulář se vygeneruje sám. */
(function () {
  const STAGES = [
    { id: 'lead', label: 'Nový lead' },
    { id: 'contacted', label: 'Kontaktován' },
    { id: 'offer', label: 'Nabídka' },
    { id: 'negotiation', label: 'Jednání' },
    { id: 'won', label: 'Vyhráno' },
    { id: 'lost', label: 'Prohráno' },
  ];
  const INVOICE_STATUS = { draft: 'Koncept', sent: 'Odeslaná', paid: 'Zaplacená' };
  const PRIORITY = { high: 'Vysoká', normal: 'Normální', low: 'Nízká' };
  const CATEGORIES = {
    material: 'Materiál', subcontract: 'Subdodávky', wages: 'Mzdy a pomocníci', transport: 'Doprava a pohonné hmoty',
    tools: 'Nářadí a vybavení', rent: 'Nájem a energie', services: 'Služby a software', marketing: 'Reklama',
    taxes: 'Daně a pojištění', other: 'Ostatní',
  };
  const CURRENCIES = ['CZK', 'EUR', 'USD'];

  const opts = obj => Object.entries(obj).map(([value, label]) => ({ value, label }));
  const contactOptions = () => [{ value: '', label: '— bez kontaktu —' }].concat(
    Store.all('contacts').slice().sort((a, b) => a.name.localeCompare(b.name, 'cs'))
      .map(c => ({ value: c.id, label: c.name + (c.company ? ` (${c.company})` : '') })));

  const CLOSED = { won: 1, lost: 2 };
  const dealOptions = () => [{ value: '', label: '— bez zakázky —' }].concat(
    Store.all('deals').slice()
      .sort((a, b) => (CLOSED[a.stage] || 0) - (CLOSED[b.stage] || 0) || a.title.localeCompare(b.title, 'cs'))
      .map(d => { const c = d.contactId && Store.get('contacts', d.contactId); return { value: d.id, label: d.title + (c ? ` (${c.name})` : '') }; }));

  const ENTITIES = {
    contacts: {
      newTitle: 'Nový kontakt', editTitle: 'Upravit kontakt',
      fields: () => [
        { name: 'name', label: 'Jméno', required: true },
        { name: 'company', label: 'Firma' },
        { name: 'email', label: 'E-mail', type: 'email' },
        { name: 'phone', label: 'Telefon', type: 'tel' },
        { name: 'ico', label: 'IČO' },
        { name: 'address', label: 'Adresa' },
        { name: 'tags', label: 'Štítky (oddělte čárkou)', type: 'tags', wide: true },
        { name: 'note', label: 'Poznámka', type: 'textarea' },
      ],
      defaults: () => ({}),
    },
    deals: {
      newTitle: 'Nová zakázka', editTitle: 'Upravit zakázku',
      fields: () => [
        { name: 'title', label: 'Název', required: true, wide: true },
        { name: 'contactId', label: 'Kontakt', type: 'select', options: contactOptions() },
        { name: 'value', label: 'Cena zakázky', type: 'number' },
        { name: 'stage', label: 'Fáze', type: 'select', options: STAGES.map(s => ({ value: s.id, label: s.label })) },
        { name: 'expectedDate', label: 'Očekávané uzavření', type: 'date' },
        { name: 'dateFrom', label: 'Práce od', type: 'date' },
        { name: 'dateTo', label: 'Práce do', type: 'date' },
        { name: 'progress', label: 'Průběh (u vyhrané zakázky)', type: 'select', options: Planning.PROGRESS.map(p => ({ value: p.id, label: p.label })) },
        { name: 'note', label: 'Poznámka', type: 'textarea' },
      ],
      defaults: () => ({ stage: 'lead', progress: 'planned' }),
    },
    tasks: {
      newTitle: 'Nový úkol', editTitle: 'Upravit úkol',
      fields: () => [
        { name: 'title', label: 'Co je potřeba udělat', required: true, wide: true },
        { name: 'contactId', label: 'Kontakt', type: 'select', options: contactOptions() },
        { name: 'due', label: 'Termín', type: 'date' },
        { name: 'priority', label: 'Priorita', type: 'select', options: opts(PRIORITY) },
        { name: 'note', label: 'Poznámka', type: 'textarea' },
      ],
      defaults: () => ({ due: UI.today(), priority: 'normal', done: false }),
    },
    invoices: {
      newTitle: 'Nová faktura', editTitle: 'Upravit fakturu',
      fields: () => [
        { name: 'number', label: 'Číslo faktury', required: true },
        { name: 'contactId', label: 'Odběratel', type: 'select', options: contactOptions() },
        { name: 'dealId', label: 'Zakázka', type: 'select', options: dealOptions() },
        { name: 'amount', label: 'Částka', type: 'number', required: true },
        { name: 'status', label: 'Stav', type: 'select', options: opts(INVOICE_STATUS) },
        { name: 'issueDate', label: 'Datum vystavení', type: 'date' },
        { name: 'dueDate', label: 'Datum splatnosti', type: 'date' },
        { name: 'note', label: 'Poznámka / předmět', type: 'textarea' },
      ],
      defaults: () => ({ number: Store.nextInvoiceNumber(), issueDate: UI.today(), dueDate: UI.addDays(UI.today(), 14), status: 'draft', attachments: [] }),
    },
    // Příjem / výdaj ve financích. Typ (type) se volí tlačítkem a ve formuláři se nemění.
    transactions: {
      newTitle: v => (v.type === 'income' ? 'Nový příjem (mimo faktury)' : 'Nový výdaj'),
      editTitle: v => (v.type === 'income' ? 'Upravit příjem' : 'Upravit výdaj'),
      fields: v => [
        { name: 'title', label: v.type === 'income' ? 'Za co' : 'Co jste zaplatili', required: true, wide: true },
        { name: 'amount', label: 'Částka', type: 'number', required: true },
        { name: 'date', label: 'Datum', type: 'date', required: true },
        { name: 'dealId', label: 'Zakázka', type: 'select', options: dealOptions() },
        ...(v.type === 'income' ? [] : [
          { name: 'category', label: 'Kategorie', type: 'select', options: opts(CATEGORIES) },
          { name: 'vendor', label: 'Dodavatel' },
        ]),
        { name: 'note', label: v.type === 'income' ? 'Poznámka (faktury sem nepište, započítají se samy po zaplacení)' : 'Poznámka', type: 'textarea' },
      ],
      defaults: () => ({ type: 'expense', date: UI.today(), category: 'material', attachments: [] }),
    },
  };

  /** Doplní odvozená pole při změně stavu (datum zaplacení, výhry, dokončení). */
  function derive(col, values, prev) {
    if (col === 'invoices') {
      if (values.status === 'paid' && !(prev && prev.paidDate)) values.paidDate = UI.today();
      if (values.status !== 'paid') values.paidDate = null;
      const deal = values.dealId && !values.contactId && Store.get('deals', values.dealId);
      if (deal && deal.contactId) values.contactId = deal.contactId; // odběratel podle zakázky
    }
    if (col === 'deals') {
      if (values.dateFrom && values.dateTo && values.dateTo < values.dateFrom) [values.dateFrom, values.dateTo] = [values.dateTo, values.dateFrom];
      if (values.stage === 'won' && !(prev && prev.wonDate)) values.wonDate = UI.today();
      if (values.stage !== 'won') values.wonDate = null;
    }
    return values;
  }

  /** Otevře formulář pro vytvoření (id = null) nebo úpravu záznamu. */
  function edit(col, id, preset = {}) {
    const ent = ENTITIES[col];
    const item = id ? Store.get(col, id) : null;
    const start = item || Object.assign(ent.defaults(), preset);
    const text = t => (typeof t === 'function' ? t(start) : t);
    const ATTACH = { invoices: 'Soubory faktury', transactions: 'Účtenka / doklad' };
    const attach = ATTACH[col] ? Files.editor((item && item.attachments) || [], ATTACH[col]) : null;
    UI.formModal({
      title: text(item ? ent.editTitle : ent.newTitle),
      fields: ent.fields(start),
      values: start,
      extra: attach,
      async onSubmit(values) {
        if (attach) {
          try { values.attachments = await attach.commit(); }
          catch (e) {
            alert('Soubor se nepodařilo uložit: ' + e.message);
            values.attachments = (item && item.attachments) || [];
          }
        }
        if (item) { Store.update(col, id, derive(col, values, item)); UI.toast('Uloženo'); }
        else { Store.add(col, derive(col, Object.assign(ent.defaults(), preset, values), null)); UI.toast('Přidáno'); }
        if (col === 'invoices') Planning.afterInvoice(values);
      },
      onDelete: item ? () => {
        if (col === 'contacts') {
          const n = Media.count(id);
          if (n && !confirm(`S kontaktem se smažou i jeho fotky a videa (${n}), i v cloudu. Opravdu pokračovat?`)) return;
          if (location.hash.includes(id)) location.hash = '#/contacts';
          Media.removeOwner(id);
        } else if (col === 'deals') {
          const n = Media.count(id);
          if (n && !confirm(`Se zakázkou se smažou i její fotky a videa (${n}), i v cloudu. Opravdu pokračovat?`)) return;
          if (location.hash.includes(id)) location.hash = '#/deals';
          Media.removeOwner(id);
        } else {
          if ((item.attachments || []).length) Files.remove(item.attachments.map(a => a.id)).catch(() => {});
          Store.remove(col, id);
        }
        UI.toast('Smazáno');
      } : null,
    });
  }

  window.Schema = { STAGES, INVOICE_STATUS, PRIORITY, CATEGORIES, CURRENCIES, ENTITIES, edit, derive };
})();
