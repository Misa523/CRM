/* Obecné pomocné funkce: ikony, formátování, modální okno, formuláře, toast. */
(function () {
  const ICONS = {
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    kanban: '<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="7" y="7" width="3" height="9"/><rect x="14" y="7" width="3" height="5"/>',
    check: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    left: '<polyline points="15 18 9 12 15 6"/>',
    right: '<polyline points="9 18 15 12 9 6"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    tick: '<polyline points="20 6 9 17 4 12"/>',
    mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
    phone: '<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  };
  const icon = (name, cls = '') =>
    `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);

  const localISO = (d = new Date()) => {
    const z = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  };
  const today = () => localISO();
  const parseDate = s => new Date(s.length === 10 ? s + 'T00:00' : s);
  const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return localISO(d); };
  const fmtDate = s => {
    if (!s) return '—';
    const d = parseDate(s);
    return isNaN(d) ? '—' : d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
  };
  const fmtDateTime = s => {
    const d = new Date(s);
    return isNaN(d) ? '' : d.toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const daysWord = n => (n === 1 ? 'den' : n >= 2 && n <= 4 ? 'dny' : 'dní');
  const relDue = s => {
    if (!s) return '';
    const diff = Math.round((parseDate(s) - parseDate(today())) / 864e5);
    if (diff === 0) return 'dnes';
    if (diff === 1) return 'zítra';
    if (diff === -1) return 'včera';
    if (diff < 0) return `před ${-diff} dny`;
    return `za ${diff} ${daysWord(diff)}`;
  };

  const money = n => {
    const cur = (window.Store && Store.settings().currency) || 'CZK';
    try {
      return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(+n || 0);
    } catch (e) { return (+n || 0) + ' ' + cur; }
  };
  const sum = (arr, key) => arr.reduce((a, x) => a + (+x[key] || 0), 0);
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ---------- Modální okno ---------- */
  const modalEl = () => document.getElementById('modal');
  function openModal(html, onMount) {
    const m = modalEl();
    m.innerHTML = html;
    if (!m.open) m.showModal();
    m.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModal));
    if (onMount) onMount(m);
  }
  function closeModal() { const m = modalEl(); if (m.open) m.close(); }
  document.addEventListener('click', e => { if (e.target === modalEl()) closeModal(); });

  /* ---------- Formuláře ----------
   * Pole: { name, label, type: text|email|tel|date|number|select|textarea|tags, options, required, wide } */
  function field(f, val) {
    const id = 'f_' + f.name;
    const req = f.required ? 'required' : '';
    let input;
    switch (f.type) {
      case 'textarea':
        input = `<textarea id="${id}" name="${f.name}" rows="3">${esc(val)}</textarea>`; break;
      case 'select':
        input = `<select id="${id}" name="${f.name}" ${req}>${f.options.map(o =>
          `<option value="${esc(o.value)}"${String(o.value) === String(val == null ? '' : val) ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
        break;
      case 'tags':
        input = `<input id="${id}" name="${f.name}" value="${esc((val || []).join(', '))}" placeholder="např. VIP, Praha">`; break;
      case 'number':
        input = `<input id="${id}" name="${f.name}" type="text" inputmode="decimal" value="${esc(val == null || val === 0 ? '' : val)}" placeholder="0" ${req}>`; break;
      default:
        input = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(val)}" ${req}>`;
    }
    const wide = f.wide || f.type === 'textarea' ? ' wide' : '';
    return `<div class="field${wide}"><label for="${id}">${esc(f.label)}${f.required ? ' *' : ''}</label>${input}</div>`;
  }

  function formModal({ title, fields, values = {}, onSubmit, onDelete }) {
    openModal(`
      <form class="modal-body" novalidate>
        <div class="modal-head">
          <h2>${esc(title)}</h2>
          <button type="button" class="icon-btn" data-close aria-label="Zavřít">${icon('x')}</button>
        </div>
        <div class="form-grid">${fields.map(f => field(f, values[f.name])).join('')}</div>
        <div class="modal-foot">
          ${onDelete ? `<button type="button" class="btn ghost danger" data-del>${icon('trash')}<span>Smazat</span></button>` : ''}
          <span class="spacer"></span>
          <button type="button" class="btn ghost" data-close>Zrušit</button>
          <button type="submit" class="btn primary">Uložit</button>
        </div>
      </form>`, m => {
      const form = m.querySelector('form');
      form.addEventListener('submit', e => {
        e.preventDefault();
        if (!form.reportValidity()) return;
        const out = {};
        fields.forEach(f => {
          let v = form.elements[f.name].value;
          if (f.type === 'number') { v = parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); v = isNaN(v) ? 0 : v; }
          else if (f.type === 'tags') v = v.split(',').map(s => s.trim()).filter(Boolean);
          else v = v.trim();
          out[f.name] = v;
        });
        closeModal();
        onSubmit(out);
      });
      if (onDelete) m.querySelector('[data-del]').addEventListener('click', () => {
        if (confirm('Opravdu smazat? Tuto akci nelze vrátit.')) { closeModal(); onDelete(); }
      });
      const first = form.querySelector('input, select, textarea');
      if (first && matchMedia('(pointer: fine)').matches) first.focus();
    });
  }

  window.UI = {
    icon, esc, localISO, today, addDays, fmtDate, fmtDateTime, relDue, money, sum, norm,
    toast, openModal, closeModal, formModal,
  };
})();
