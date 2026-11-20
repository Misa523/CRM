/* Sdílené kousky UI, které používá víc obrazovek. */
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

  const pill = (label, color = 'gray') => `<span class="pill ${color}">${esc(label)}</span>`;

  const emptyState = (title, text, action = '') =>
    `<div class="empty"><strong>${esc(title)}</strong><p>${esc(text)}</p>${action}</div>`;

  const newBtn = (col, label, preset) =>
    `<button class="btn primary" data-new="${col}"${preset ? ` data-preset="${esc(JSON.stringify(preset))}"` : ''}>${icon('plus')}<span>${esc(label)}</span></button>`;

  const STAGE_COLOR = { lead: 'gray', contacted: 'blue', offer: 'violet', negotiation: 'amber', won: 'green', lost: 'red' };
  const stageLabel = id => (Schema.STAGES.find(s => s.id === id) || {}).label || id;
  const stagePill = id => pill(stageLabel(id), STAGE_COLOR[id]);

  function invoiceState(i) {
    if (i.status === 'paid') return { key: 'paid', label: 'Zaplacená', color: 'green' };
    if (i.status === 'sent' && i.dueDate && i.dueDate < today()) return { key: 'overdue', label: 'Po splatnosti', color: 'red' };
    if (i.status === 'sent') return { key: 'sent', label: 'Odeslaná', color: 'blue' };
    return { key: 'draft', label: 'Koncept', color: 'gray' };
  }

  function taskRow(t, { contact = true } = {}) {
    const td = today();
    const overdue = !t.done && t.due && t.due < td;
    const badge = t.due
      ? `<span class="badge ${t.done ? '' : overdue ? 'red' : t.due === td ? 'amber' : ''}">${t.done ? fmtDate(t.due) : esc(relDue(t.due))}</span>` : '';
    const sub = [contact ? esc(contactName(t.contactId)) : '', t.priority === 'high' && !t.done ? '<span class="prio">Vysoká priorita</span>' : '']
      .filter(Boolean).join(' · ');
    return `<div class="row task${t.done ? ' done' : ''}">
      <button class="check${t.done ? ' on' : ''}" data-toggle-task="${t.id}" aria-label="${t.done ? 'Označit jako nehotové' : 'Označit jako hotové'}">${t.done ? icon('tick') : ''}</button>
      <button class="row-main" data-edit="tasks" data-id="${t.id}">
        <span class="row-title">${esc(t.title)}</span>
        ${sub ? `<span class="row-sub">${sub}</span>` : ''}
      </button>
      ${badge}
    </div>`;
  }

  function invoiceRow(i, { contact = true } = {}) {
    const st = invoiceState(i);
    const canPay = i.status !== 'paid';
    return `<div class="row invoice">
      <button class="row-main" data-edit="invoices" data-id="${i.id}">
        <span class="row-title">${esc(i.number)}${contact && i.contactId ? ` · ${esc(contactName(i.contactId))}` : ''}</span>
        <span class="row-sub">Vystaveno ${fmtDate(i.issueDate)} · splatnost ${fmtDate(i.dueDate)}</span>
      </button>
      <span class="row-end">
        <strong class="amount">${money(i.amount)}</strong>
        ${pill(st.label, st.color)}
      </span>
      ${canPay ? `<button class="btn sm" data-mark-paid="${i.id}" title="Označit jako zaplacenou">${icon('tick')}<span class="hide-sm">Zaplaceno</span></button>` : '<span class="btn-placeholder"></span>'}
    </div>`;
  }

  function dealRow(d) {
    return `<div class="row">
      <button class="row-main" data-edit="deals" data-id="${d.id}">
        <span class="row-title">${esc(d.title)}</span>
        <span class="row-sub">${d.expectedDate ? 'Uzavření ' + fmtDate(d.expectedDate) : 'Bez termínu'}</span>
      </button>
      <span class="row-end"><strong class="amount">${money(d.value)}</strong>${stagePill(d.stage)}</span>
    </div>`;
  }

  window.C = { contactName, avatar, pill, emptyState, newBtn, stagePill, stageLabel, invoiceState, taskRow, invoiceRow, dealRow };
})();
