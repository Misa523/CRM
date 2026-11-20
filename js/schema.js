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
  const CURRENCIES = ['CZK', 'EUR', 'USD'];

  const opts = obj => Object.entries(obj).map(([value, label]) => ({ value, label }));
  const contactOptions = () => [{ value: '', label: '— bez kontaktu —' }].concat(
    Store.all('contacts').slice().sort((a, b) => a.name.localeCompare(b.name, 'cs'))
      .map(c => ({ value: c.id, label: c.name + (c.company ? ` (${c.company})` : '') })));

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
      newTitle: 'Nový obchod', editTitle: 'Upravit obchod',
      fields: () => [
        { name: 'title', label: 'Název', required: true, wide: true },
        { name: 'contactId', label: 'Kontakt', type: 'select', options: contactOptions() },
        { name: 'value', label: 'Hodnota', type: 'number' },
        { name: 'stage', label: 'Fáze', type: 'select', options: STAGES.map(s => ({ value: s.id, label: s.label })) },
        { name: 'expectedDate', label: 'Očekávané uzavření', type: 'date' },
        { name: 'note', label: 'Poznámka', type: 'textarea' },
      ],
      defaults: () => ({ stage: 'lead' }),
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
        { name: 'amount', label: 'Částka', type: 'number', required: true },
        { name: 'status', label: 'Stav', type: 'select', options: opts(INVOICE_STATUS) },
        { name: 'issueDate', label: 'Datum vystavení', type: 'date' },
        { name: 'dueDate', label: 'Datum splatnosti', type: 'date' },
        { name: 'note', label: 'Poznámka / předmět', type: 'textarea' },
      ],
      defaults: () => ({ number: Store.nextInvoiceNumber(), issueDate: UI.today(), dueDate: UI.addDays(UI.today(), 14), status: 'draft', attachments: [] }),
    },
  };

  /** Doplní odvozená pole při změně stavu (datum zaplacení, výhry, dokončení). */
  function derive(col, values, prev) {
    if (col === 'invoices') {
      if (values.status === 'paid' && !(prev && prev.paidDate)) values.paidDate = UI.today();
      if (values.status !== 'paid') values.paidDate = null;
    }
    if (col === 'deals') {
      if (values.stage === 'won' && !(prev && prev.wonDate)) values.wonDate = UI.today();
      if (values.stage !== 'won') values.wonDate = null;
    }
    return values;
  }

  /** Otevře formulář pro vytvoření (id = null) nebo úpravu záznamu. */
  function edit(col, id, preset = {}) {
    const ent = ENTITIES[col];
    const item = id ? Store.get(col, id) : null;
    const attach = col === 'invoices' ? Files.editor((item && item.attachments) || []) : null;
    UI.formModal({
      title: item ? ent.editTitle : ent.newTitle,
      fields: ent.fields(),
      values: item || Object.assign(ent.defaults(), preset),
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
      },
      onDelete: item ? () => {
        if (col === 'contacts') {
          if (location.hash.includes(id)) location.hash = '#/contacts';
          Store.removeContact(id);
        } else {
          if (col === 'invoices' && (item.attachments || []).length) Files.remove(item.attachments.map(a => a.id)).catch(() => {});
          Store.remove(col, id);
        }
        UI.toast('Smazáno');
      } : null,
    });
  }

  window.Schema = { STAGES, INVOICE_STATUS, PRIORITY, CURRENCIES, ENTITIES, edit, derive };
})();
