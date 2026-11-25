/* Fotky a videa zakázek a kontaktů (před, po, škoda…) a podklady pro pojišťovnu.
 * Vlastník = zakázka (dealId) nebo kontakt (contactId); funkce berou jeho id, id se mezi kolekcemi neopakují.
 * Záznam je v kolekci „media“ (každá fotka zvlášť, aby se při synchronizaci nepřepsaly fotky z jiného zařízení).
 * Soubor je v IndexedDB a v cloudu pod id záznamu, zmenšený náhled pod <id>-t. Originály se nemění (důkaz). */
(function () {
  const { esc, icon, fmtDate, fmtDateTime, plural } = UI;
  const MAX = 50 * 1024 * 1024;
  const PHASES = [
    { id: 'before', label: 'Před', hint: 'Stav před začátkem práce', dir: 'pred' },
    { id: 'after', label: 'Po', hint: 'Hotová práce', dir: 'po' },
    { id: 'damage', label: 'Škoda / událost', hint: 'Když se něco stane – pro pojišťovnu', dir: 'skoda' },
    { id: 'other', label: 'Průběh a ostatní', hint: 'Postup práce, detaily', dir: 'ostatni' },
  ];
  const phaseOf = id => PHASES.find(p => p.id === id) || PHASES[3];
  const thumbId = id => id + '-t';
  const when = m => m.takenAt || m.createdAt || '';

  /** Zakázka nebo kontakt podle id: { col, key, rec, title }. */
  function ownerOf(id) {
    const deal = Store.get('deals', id);
    if (deal) return { col: 'deals', key: 'dealId', rec: deal, title: deal.title };
    const contact = Store.get('contacts', id);
    return contact ? { col: 'contacts', key: 'contactId', rec: contact, title: contact.name } : null;
  }
  const owns = (id, m) => !!id && (m.dealId === id || m.contactId === id);
  const ofOwner = id => Store.all('media').filter(m => owns(id, m)).sort((a, b) => when(a).localeCompare(when(b)));
  const count = id => Store.all('media').reduce((n, m) => n + (owns(id, m) ? 1 : 0), 0);

  /* ---------- Zpracování obrázku a videa ---------- */
  const toBlob = (canvas, q) => new Promise(r => canvas.toBlob(r, 'image/jpeg', q));
  function scaled(src, w, h, max) {
    const k = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }
  /** Zmenšená kopie fotky (JPEG). Když prohlížeč formát neumí (např. HEIC na PC), vrátí null. */
  async function shrink(blob, max, q = 0.82) {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return await toBlob(scaled(img, img.naturalWidth, img.naturalHeight, max), q);
    } catch (e) { return null; } finally { URL.revokeObjectURL(url); }
  }
  /** Náhledový snímek videa a jeho délka. */
  function videoInfo(blob) {
    return new Promise(resolve => {
      const url = URL.createObjectURL(blob);
      const v = document.createElement('video');
      const done = async canvas => {
        clearTimeout(timer);
        v.onseeked = v.onloadeddata = v.onerror = null;
        const duration = isFinite(v.duration) ? Math.round(v.duration) : 0;
        const thumb = canvas ? await toBlob(canvas, 0.8) : null;
        v.removeAttribute('src');
        URL.revokeObjectURL(url);
        resolve({ thumb, duration });
      };
      const timer = setTimeout(() => done(null), 8000);
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      v.onerror = () => done(null);
      v.onloadeddata = () => { v.currentTime = Math.min(0.2, (v.duration || 1) / 2); };
      v.onseeked = () => { try { done(v.videoWidth ? scaled(v, v.videoWidth, v.videoHeight, 480) : null); } catch (e) { done(null); } };
      v.src = url;
      v.load();
    });
  }
  /** Datum pořízení zapsané ve fotce (EXIF DateTimeOriginal), místní čas „YYYY-MM-DDTHH:MM:SS“. */
  async function exifDate(file) {
    try {
      const dv = new DataView(await file.slice(0, 262144).arrayBuffer());
      if (dv.getUint16(0) !== 0xFFD8) return null;
      let off = 2;
      while (off + 4 < dv.byteLength) {
        const marker = dv.getUint16(off);
        if (marker === 0xFFE1 && dv.getUint32(off + 4) === 0x45786966) {
          const tiff = off + 10;
          const le = dv.getUint16(tiff) === 0x4949;
          const find = (ifd, tag) => {
            const n = dv.getUint16(ifd, le);
            for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (dv.getUint16(e, le) === tag) return e; }
            return 0;
          };
          const sub = find(tiff + dv.getUint32(tiff + 4, le), 0x8769);
          if (!sub) return null;
          const ent = find(tiff + dv.getUint32(sub + 8, le), 0x9003);
          if (!ent) return null;
          const p = tiff + dv.getUint32(ent + 8, le);
          let s = '';
          for (let i = 0; i < 19; i++) s += String.fromCharCode(dv.getUint8(p + i));
          const m = s.match(/^(\d{4}):(\d\d):(\d\d) (\d\d:\d\d:\d\d)$/);
          const out = m && `${m[1]}-${m[2]}-${m[3]}T${m[4]}`;
          return out && !isNaN(new Date(out)) ? out : null;
        }
        if ((marker & 0xFF00) !== 0xFF00 || marker === 0xFFDA) return null;
        off += 2 + dv.getUint16(off + 2);
      }
    } catch (e) { /* poškozený nebo jiný formát */ }
    return null;
  }

  /* ---------- Přidání ---------- */
  const kindOf = f => {
    if (/^video\//.test(f.type) || /\.(mov|mp4|m4v|webm|3gp|avi|mkv)$/i.test(f.name)) return 'video';
    if (/^image\//.test(f.type) || /\.(jpe?g|png|heic|heif|webp|gif)$/i.test(f.name)) return 'photo';
    return null;
  };
  let busy = 0;
  async function addFiles(ownerId, phase, fileList, camera) {
    const files = [...fileList], problems = [], records = [];
    if (!files.length) return;
    busy++;
    await Files.persist();
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      progress(`Ukládám ${i + 1} z ${files.length}…`);
      const kind = kindOf(f);
      if (!kind) { problems.push(`${f.name}: není to fotka ani video.`); continue; }
      if (f.size > MAX) { problems.push(`${f.name}: ${Files.fmtSize(f.size)} je víc než 50 MB. Natočte kratší video nebo nižší kvalitu.`); continue; }
      try {
        const id = Store.uid();
        const info = kind === 'video' ? await videoInfo(f) : { thumb: await shrink(f, 480), duration: 0 };
        const takenAt = (kind === 'photo' && await exifDate(f)) || null;
        await Files.put(id, f);
        if (info.thumb) await Files.put(thumbId(id), info.thumb);
        records.push({
          id, dealId: '', contactId: '', phase, kind, name: f.name || (kind === 'video' ? 'video' : 'fotka'), type: f.type, size: f.size,
          takenAt, camera: !!camera, duration: info.duration, thumb: !!info.thumb, note: '',
        });
      } catch (e) { problems.push(`${f.name}: ${e && e.message ? e.message : 'nepodařilo se uložit.'}`); }
    }
    progress('');
    busy--;
    if (records.length) {
      const owner = ownerOf(ownerId); // mohl být mezitím smazaný
      if (!owner) { await Files.remove(records.flatMap(r => [r.id, thumbId(r.id)])); return; }
      records.forEach(r => { r[owner.key] = ownerId; });
      Store.addMany('media', records);
      records.forEach(r => { if (r.thumb) Sync.queueUpload(thumbId(r.id)); });
      records.forEach(r => Sync.queueUpload(r.id));
      UI.toast(`Přidáno: ${plural(records.length, 'soubor', 'soubory', 'souborů')} (${phaseOf(phase).label})`);
    }
    if (problems.length) alert('Některé soubory se nepřidaly:\n\n' + problems.join('\n'));
  }
  function progress(text) {
    let el = document.getElementById('media-progress');
    if (!el) { el = document.createElement('div'); el.id = 'media-progress'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = text;
    el.hidden = !text;
  }

  // Jeden stálý skrytý výběr souborů – překreslení stránky během focení ho nesmí zrušit.
  let picker = null;
  function pick(ownerId, phase, camera) {
    if (!picker) {
      picker = document.createElement('input');
      picker.type = 'file';
      picker.hidden = true;
      picker.id = 'media-picker';
      document.body.appendChild(picker);
    }
    picker.value = '';
    picker.multiple = !camera;
    picker.accept = camera ? 'image/*' : 'image/*,video/*';
    if (camera) picker.setAttribute('capture', 'environment'); else picker.removeAttribute('capture');
    picker.onchange = () => addFiles(ownerId, phase, picker.files, camera);
    picker.click();
  }

  /* ---------- Mazání ---------- */
  function removeFiles(list) {
    if (list.length) Files.remove(list.flatMap(m => (m.thumb ? [m.id, thumbId(m.id)] : [m.id]))).catch(() => {});
  }
  function remove(m) {
    removeFiles([m]);
    Store.remove('media', m.id);
  }
  /** Smaže zakázku nebo kontakt i s fotkami a videi. */
  function removeOwner(id) {
    const owner = ownerOf(id);
    if (!owner) return;
    removeFiles(ofOwner(id));
    if (owner.col === 'deals') Store.removeDeal(id); else Store.removeContact(id);
  }

  /* ---------- Náhledy ---------- */
  const thumbs = new Map();  // id → blob URL (náhledy jsou malé, nechávají se v paměti)
  const failed = new Map();  // id → čas posledního neúspěchu
  const loading = new Map();
  function loadThumb(m) {
    if (!m.thumb) return Promise.resolve(null);
    if (thumbs.has(m.id)) return Promise.resolve(thumbs.get(m.id));
    if (Date.now() - (failed.get(m.id) || 0) < 10000) return Promise.resolve(null);
    if (!loading.has(m.id)) {
      loading.set(m.id, Files.load({ id: thumbId(m.id), name: m.name, type: 'image/jpeg' })
        .then(b => { const u = URL.createObjectURL(b); thumbs.set(m.id, u); return u; })
        .catch(() => { failed.set(m.id, Date.now()); return null; })
        .finally(() => loading.delete(m.id)));
    }
    return loading.get(m.id);
  }
  /** Doplní náhledy do [data-thumb] uvnitř root, nejvýš 4 stahování najednou. */
  async function fillThumbs(root, list) {
    const queue = list.filter(m => m.thumb && !thumbs.has(m.id));
    const worker = async () => {
      for (let m; (m = queue.shift());) {
        const url = await loadThumb(m);
        if (!url) continue;
        root.querySelectorAll(`[data-thumb="${CSS.escape(m.id)}"]`).forEach(el => { el.style.backgroundImage = `url("${url}")`; el.classList.add('ready'); });
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  }
  const fmtDur = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  function thumbHtml(m, inner = '') {
    const url = thumbs.get(m.id);
    return `<span class="thumb${url ? ' ready' : ''}" data-thumb="${esc(m.id)}"${url ? ` style="background-image:url('${esc(url)}')"` : ''}>
      <span class="thumb-ph">${icon(m.kind === 'video' ? 'play' : 'image')}</span>
      ${m.kind === 'video' ? `<span class="thumb-video">${icon('play')}${m.duration ? fmtDur(m.duration) : ''}</span>` : ''}
      ${m.note ? `<span class="thumb-note">${esc(m.note)}</span>` : ''}${inner}</span>`;
  }
  /** Kdy fotka vznikla – poctivě podle toho, co opravdu víme. */
  const takenText = m => (m.takenAt ? `pořízeno ${fmtDateTime(m.takenAt)} (údaj z fotky)`
    : m.camera ? `vyfoceno v CRM ${fmtDateTime(m.createdAt)}` : `přidáno do CRM ${fmtDateTime(m.createdAt)}`);

  /* ---------- Sekce v detailu zakázky a kontaktu ---------- */
  function section(ownerId) {
    const all = ofOwner(ownerId);
    return `<div class="media-grid">${PHASES.map(p => {
      const list = all.filter(m => phaseOf(m.phase).id === p.id);
      return `<section class="media-phase ph-${p.id}" data-phase="${p.id}">
        <header><div><h4>${p.label} <span class="count">${list.length}</span></h4><small>${p.hint}</small></div>
          <div class="media-add">
            <button type="button" class="btn xs only-touch" data-media-cam="${p.id}" aria-label="Vyfotit – ${p.label}">${icon('camera')}<span>Vyfotit</span></button>
            <button type="button" class="btn xs" data-media-add="${p.id}" aria-label="Přidat fotky a videa – ${p.label}">${icon('plus')}<span>Přidat</span></button>
          </div></header>
        ${list.length ? `<div class="thumbs">${list.map(m =>
          `<button type="button" class="thumb-btn" data-media-open="${esc(m.id)}" aria-label="${m.kind === 'video' ? 'Video' : 'Fotka'} ${esc(m.name)}">${thumbHtml(m)}</button>`).join('')}</div>`
          : '<p class="muted small media-empty">Zatím nic.<span class="hide-touch"> Fotky sem můžete i přetáhnout.</span></p>'}
      </section>`;
    }).join('')}</div>`;
  }
  function mount(root, ownerId) {
    root.querySelectorAll('[data-media-add]').forEach(b => b.addEventListener('click', () => pick(ownerId, b.dataset.mediaAdd, false)));
    root.querySelectorAll('[data-media-cam]').forEach(b => b.addEventListener('click', () => pick(ownerId, b.dataset.mediaCam, true)));
    root.querySelectorAll('[data-media-open]').forEach(b => b.addEventListener('click', () => lightbox(ownerId, b.dataset.mediaOpen)));
    root.querySelectorAll('[data-phase]').forEach(el => {
      el.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); el.classList.add('over'); } });
      el.addEventListener('dragleave', e => { if (!el.contains(e.relatedTarget)) el.classList.remove('over'); });
      el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('over'); addFiles(ownerId, el.dataset.phase, e.dataTransfer.files, false); });
    });
    fillThumbs(root, ofOwner(ownerId));
  }

  /* ---------- Prohlížeč ---------- */
  function lightbox(ownerId, id) {
    const order = PHASES.flatMap(p => ofOwner(ownerId).filter(m => phaseOf(m.phase).id === p.id)).map(m => m.id);
    let idx = Math.max(0, order.indexOf(id));
    let url = null, token = 0;
    const free = () => { if (url) URL.revokeObjectURL(url); url = null; };

    UI.openModal(`<div class="modal-body lb">
      <div class="modal-head"><h2 data-lb-title></h2><button type="button" class="icon-btn" data-close aria-label="Zavřít">${icon('x')}</button></div>
      <div class="lb-stage" data-lb-stage></div>
      <button type="button" class="lb-nav prev" data-lb-go="-1" aria-label="Předchozí">${icon('left')}</button>
      <button type="button" class="lb-nav next" data-lb-go="1" aria-label="Další">${icon('right')}</button>
      <div class="lb-info">
        <div class="small muted" data-lb-meta></div>
        <div class="lb-edit">
          <div class="field"><label for="lb_phase">Zařazení</label><select id="lb_phase">${PHASES.map(p => `<option value="${p.id}">${p.label}</option>`).join('')}</select></div>
          <div class="field"><label for="lb_note">Popis</label><input id="lb_note" placeholder="co je na snímku" autocomplete="off"></div>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn ghost danger" data-lb-del>${icon('trash')}<span>Smazat</span></button><span class="spacer"></span>
        <button type="button" class="btn" data-lb-save>${icon('download')}<span>Stáhnout originál</span></button>
      </div></div>`, m => {
      const $ = s => m.querySelector(s);
      const cur = () => Store.get('media', order[idx]);
      const saveEdits = () => {
        const it = cur();
        if (!it || !$('#lb_note')) return;
        const note = $('#lb_note').value.trim(), phase = $('#lb_phase').value;
        if (note !== (it.note || '') || phase !== phaseOf(it.phase).id) Store.update('media', it.id, { note, phase });
      };
      async function show() {
        const it = cur();
        if (!it) { UI.closeModal(); return; }
        const my = ++token;
        free();
        $('[data-lb-title]').textContent = `${phaseOf(it.phase).label} · ${idx + 1} / ${order.length}`;
        $('[data-lb-meta]').textContent = `${takenText(it)} · ${Files.fmtSize(it.size || 0)} · ${it.name}`;
        $('#lb_phase').value = phaseOf(it.phase).id;
        $('#lb_note').value = it.note || '';
        m.querySelectorAll('[data-lb-go]').forEach(b => { b.hidden = order.length < 2; });
        const stage = $('[data-lb-stage]');
        stage.innerHTML = `<span class="lb-load">Načítám…</span>`;
        try {
          const blob = await Files.load(it);
          if (my !== token) return;
          url = URL.createObjectURL(blob);
          const el = document.createElement(it.kind === 'video' ? 'video' : 'img');
          if (it.kind === 'video') { el.controls = true; el.playsInline = true; } else el.alt = it.note || it.name;
          el.onerror = () => { if (my === token) stage.innerHTML = '<span class="lb-load">Tento formát prohlížeč neumí zobrazit. Originál si můžete stáhnout.</span>'; };
          el.src = url;
          stage.replaceChildren(el);
        } catch (e) { if (my === token) stage.innerHTML = `<span class="lb-load">${esc(e.message)}</span>`; }
      }
      const go = d => { saveEdits(); idx = (idx + d + order.length) % order.length; show(); };
      m.querySelectorAll('[data-lb-go]').forEach(b => b.addEventListener('click', () => go(+b.dataset.lbGo)));
      const keys = e => {
        if (/^(INPUT|SELECT|VIDEO)$/.test(e.target.tagName)) return;
        if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1);
      };
      m.addEventListener('keydown', keys);
      $('#lb_phase').addEventListener('change', saveEdits);
      $('[data-lb-save]').addEventListener('click', async () => {
        const it = cur();
        try { Files.download(await Files.load(it), it.name); } catch (e) { alert(e.message); }
      });
      $('[data-lb-del]').addEventListener('click', () => {
        const it = cur();
        if (!confirm(`Smazat ${it.kind === 'video' ? 'video' : 'fotku'} „${it.name}“? Smaže se i v cloudu a nepůjde obnovit.`)) return;
        token++;
        free();
        order.splice(idx, 1);
        remove(it);
        if (!order.length) { UI.closeModal(); return; }
        idx %= order.length;
        show();
      });
      m.addEventListener('close', () => { saveEdits(); token++; free(); m.removeEventListener('keydown', keys); }, { once: true });
      show();
    }, 'lightbox');
  }

  /* ---------- Podklady pro pojišťovnu ---------- */
  const safe = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'soubor';

  function protocol({ owner, claim, list, src }) {
    const isDeal = owner.col === 'deals';
    const contact = isDeal ? owner.rec.contactId && Store.get('contacts', owner.rec.contactId) : owner.rec;
    const row = (k, v) => (v ? `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>` : '');
    let n = 0;
    return `<article class="protocol">
      <h1>${isDeal ? 'Fotodokumentace zakázky' : 'Fotodokumentace'}</h1>
      <table>
        ${row('Zpracoval', Store.settings().businessName)}
        ${row('Zakázka', isDeal ? owner.title : '')}
        ${row('Klient', contact ? [contact.name, contact.company].filter(Boolean).join(', ') : '')}
        ${row('Adresa', contact ? contact.address : '')}
        ${row('Datum události', claim.date ? fmtDate(claim.date) : '')}
        ${row('Číslo pojistné události', claim.number)}
        ${row('Vytvořeno', fmtDateTime(new Date().toISOString()))}
      </table>
      ${claim.text ? `<h2>Popis události</h2><p class="pre">${esc(claim.text)}</p>` : ''}
      ${PHASES.map(p => {
        const items = list.filter(m => phaseOf(m.phase).id === p.id);
        if (!items.length) return '';
        return `<h2>${esc(p.label)}</h2><div class="shots">${items.map(m => {
          const s = src(m);
          return `<figure>${s ? `<img src="${esc(s)}" alt="">` : `<div class="noimg">${m.kind === 'video' ? 'Video' : 'Fotka'} – ${esc(m.name)}</div>`}
            <figcaption><b>${++n}. ${esc(p.label)}${m.kind === 'video' ? ' (video)' : ''}</b>${m.note ? ' – ' + esc(m.note) : ''}<br><small>${esc(takenText(m))} · ${esc(m.name)}</small></figcaption></figure>`;
        }).join('')}</div>`;
      }).join('')}
      <p class="foot">Čas „údaj z fotky“ je převzatý z údajů uložených ve snímku. U ostatních souborů je uveden čas přidání do CRM.</p>
    </article>`;
  }
  const PROTOCOL_CSS = `body{font:14px/1.45 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#111;background:#fff;margin:24px auto;max-width:900px;padding:0 16px}
    h1{font-size:22px}h2{font-size:16px;margin:22px 0 8px}table{border-collapse:collapse}th{text-align:left;padding:3px 18px 3px 0;color:#555;font-weight:600;vertical-align:top}
    .pre{white-space:pre-wrap}.shots{display:grid;grid-template-columns:1fr 1fr;gap:14px}figure{margin:0;break-inside:avoid}img{width:100%;max-height:420px;object-fit:contain;background:#f2f2f2}
    .noimg{padding:40px 10px;text-align:center;background:#f2f2f2}.foot,small{color:#666}.foot{margin-top:24px;font-size:12px}`;

  function claimModal(ownerId) {
    const owner = ownerOf(ownerId);
    if (!owner) return;
    const all = PHASES.flatMap(p => ofOwner(ownerId).filter(m => phaseOf(m.phase).id === p.id));
    const claim = Object.assign({ date: '', number: '', text: '' }, owner.rec.claim);
    const sel = new Set(all.map(m => m.id));
    let urls = [];
    const dropUrls = () => { urls.forEach(u => URL.revokeObjectURL(u)); urls = []; };

    UI.openModal(`<div class="modal-body">
      <div class="modal-head"><h2>Podklady pro pojišťovnu</h2><button type="button" class="icon-btn" data-close aria-label="Zavřít">${icon('x')}</button></div>
      <div class="form-grid">
        <div class="field"><label for="cl_date">Datum události</label><input id="cl_date" type="date" value="${esc(claim.date)}"></div>
        <div class="field"><label for="cl_num">Číslo pojistné události</label><input id="cl_num" value="${esc(claim.number)}" autocomplete="off" placeholder="pokud ho už máte"></div>
        <div class="field wide"><label for="cl_text">Co se stalo</label><textarea id="cl_text" rows="3">${esc(claim.text)}</textarea></div>
        <div class="field wide">
          <div class="claim-head"><label>Fotky a videa k odeslání</label><span class="muted small" data-cl-count></span></div>
          <div class="claim-chips">${PHASES.filter(p => all.some(m => phaseOf(m.phase).id === p.id)).map(p => `<button type="button" class="filter" data-cl-phase="${p.id}"><span>${p.label}</span></button>`).join('')}</div>
          <div class="thumbs claim">${all.map(m => `<button type="button" class="thumb-btn" data-cl-item="${esc(m.id)}" aria-pressed="true" aria-label="${esc(phaseOf(m.phase).label + ' ' + m.name)}">${thumbHtml(m, `<span class="thumb-tick">${icon('tick')}</span><span class="thumb-tag">${phaseOf(m.phase).label}</span>`)}</button>`).join('')}</div>
        </div>
        <label class="field wide check-row"><input type="checkbox" id="cl_small"><span>Zmenšit fotky, aby se vešly do e-mailu <small class="muted">(bez zaškrtnutí se posílají originály, ty jsou jako důkaz lepší)</small></span></label>
        <p class="field wide claim-msg" data-cl-msg hidden></p>
      </div>
      <div class="modal-foot claim-foot">
        <button type="button" class="btn primary" data-cl-prep>${icon('shield')}<span>Připravit</span></button>
        <button type="button" class="btn primary" data-cl-share hidden>${icon('share')}<span>Sdílet</span></button>
        <button type="button" class="btn" data-cl-zip hidden>${icon('download')}<span>Stáhnout ZIP</span></button>
        <button type="button" class="btn" data-cl-print hidden>${icon('printer')}<span>Protokol / PDF</span></button>
      </div></div>`, m => {
      const $ = s => m.querySelector(s);
      let pack = null, run = 0;
      const chosen = () => all.filter(x => sel.has(x.id));
      const say = (t, err) => { const el = $('[data-cl-msg]'); el.hidden = !t; el.textContent = t || ''; el.classList.toggle('red', !!err); };
      const reset = () => {
        run++; pack = null;
        ['share', 'zip', 'print'].forEach(k => { $(`[data-cl-${k}]`).hidden = true; });
        $('[data-cl-prep]').hidden = false;
        $('[data-cl-prep]').disabled = !sel.size;
        say('');
        draw();
      };
      const draw = () => {
        m.querySelectorAll('[data-cl-item]').forEach(b => { const on = sel.has(b.dataset.clItem); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
        m.querySelectorAll('[data-cl-phase]').forEach(b => b.classList.toggle('on', all.filter(x => phaseOf(x.phase).id === b.dataset.clPhase).every(x => sel.has(x.id))));
        const list = chosen();
        $('[data-cl-count]').textContent = `${list.length} z ${all.length} · ${Files.fmtSize(UI.sum(list, 'size'))}`;
      };
      m.querySelectorAll('[data-cl-item]').forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.clItem;
        if (sel.has(id)) sel.delete(id); else sel.add(id);
        reset();
      }));
      m.querySelectorAll('[data-cl-phase]').forEach(b => b.addEventListener('click', () => {
        const ids = all.filter(x => phaseOf(x.phase).id === b.dataset.clPhase).map(x => x.id);
        const on = ids.every(id => sel.has(id));
        ids.forEach(id => { if (on) sel.delete(id); else sel.add(id); });
        reset();
      }));
      $('#cl_small').addEventListener('change', reset);
      ['#cl_date', '#cl_num', '#cl_text'].forEach(s => $(s).addEventListener('input', () => { if (pack) reset(); }));
      const form = () => ({ date: $('#cl_date').value, number: $('#cl_num').value.trim(), text: $('#cl_text').value.trim() });
      const saveClaim = () => {
        if (!$('#cl_date')) return;
        const v = form(), d = Store.get(owner.col, ownerId);
        if (d && JSON.stringify(v) !== JSON.stringify(Object.assign({ date: '', number: '', text: '' }, d.claim))) Store.update(owner.col, ownerId, { claim: v });
      };

      // Nejdřív se soubory načtou (třeba z cloudu), sdílení a tisk pak musí proběhnout hned po klepnutí (iOS).
      $('[data-cl-prep]').addEventListener('click', async () => {
        const my = ++run;
        const small = $('#cl_small').checked;
        const list = chosen();
        saveClaim();
        $('[data-cl-prep]').disabled = true;
        const files = [], prints = new Map();
        dropUrls();
        try {
          for (let i = 0; i < list.length; i++) {
            const it = list[i];
            say(`Připravuji ${i + 1} z ${list.length}…`);
            const orig = await Files.load(it);
            if (my !== run) return;
            let blob = orig, name = it.name || 'soubor', type = it.type || orig.type;
            const view = it.kind === 'photo' ? await shrink(orig, 1600) : await Files.load({ id: thumbId(it.id), name, type: 'image/jpeg' }).catch(() => null);
            if (my !== run) return;
            if (small && it.kind === 'photo' && view && view.size < orig.size) { blob = view; type = 'image/jpeg'; name = name.replace(/\.[^.]+$/, '') + '.jpg'; }
            const p = phaseOf(it.phase);
            const ext = (name.match(/\.[A-Za-z0-9]{1,5}$/) || [it.kind === 'video' ? '.mp4' : '.jpg'])[0];
            const base = safe(name.replace(/\.[^.]+$/, ''));
            files.push({ it, dir: p.dir, file: new File([blob], `${String(i + 1).padStart(2, '0')}-${p.dir}-${base}${ext}`, { type: type || 'application/octet-stream' }) });
            if (view) { const u = URL.createObjectURL(view); urls.push(u); prints.set(it.id, { url: u, blob: view }); }
          }
        } catch (e) {
          if (my !== run) return;
          $('[data-cl-prep]').disabled = false;
          say(e.message, true);
          return;
        }
        pack = { files, prints, claim: form(), list };
        const shareFiles = files.map(f => f.file);
        let canShare = false;
        try { canShare = !!(navigator.canShare && navigator.canShare({ files: shareFiles })); } catch (e) { /* neumí */ }
        $('[data-cl-prep]').hidden = true;
        $('[data-cl-share]').hidden = !canShare;
        $('[data-cl-zip]').hidden = $('[data-cl-print]').hidden = false;
        preparePrint();
        say(`Připraveno: ${plural(files.length, 'soubor', 'soubory', 'souborů')}, ${Files.fmtSize(shareFiles.reduce((a, f) => a + f.size, 0))}. ` +
          'ZIP obsahuje soubory i protokol. Protokol si uložíte jako PDF přes tisk.');
      });

      $('[data-cl-share]').addEventListener('click', async () => {
        try {
          await navigator.share({
            files: pack.files.map(f => f.file),
            title: 'Fotodokumentace – ' + owner.title,
            text: [(owner.col === 'deals' ? 'Fotodokumentace zakázky: ' : 'Fotodokumentace: ') + owner.title, pack.claim.number && 'Číslo pojistné události: ' + pack.claim.number,
              pack.claim.date && 'Datum události: ' + fmtDate(pack.claim.date), pack.claim.text].filter(Boolean).join('\n'),
          });
        } catch (e) { if (e.name !== 'AbortError') say('Sdílení se nepovedlo. Zkuste méně souborů nebo stažení ZIPu.', true); }
      });

      $('[data-cl-zip]').addEventListener('click', async e => {
        const btn = e.currentTarget, p = pack;
        btn.disabled = true;
        try {
          const entries = p.files.map(f => ({ name: `${f.dir}/${f.file.name}`, blob: f.file, date: new Date(when(f.it)) }));
          const imgs = new Map();
          p.prints.forEach((v, id) => {
            const f = p.files.find(x => x.it.id === id);
            const path = `nahledy/${f.file.name.replace(/\.[^.]+$/, '')}.jpg`;
            imgs.set(id, path);
            entries.push({ name: path, blob: v.blob });
          });
          const html = `<!doctype html><html lang="cs"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fotodokumentace</title><style>${PROTOCOL_CSS}</style><body>` +
            protocol({ owner, claim: p.claim, list: p.list, src: x => imgs.get(x.id) }) + '</body></html>';
          entries.unshift({ name: 'protokol.html', blob: new Blob([html], { type: 'text/html' }) });
          Files.download(await Zip.create(entries), `fotodokumentace-${safe(owner.title)}-${UI.today()}.zip`);
        } catch (err) { say('ZIP se nepodařilo vytvořit: ' + err.message, true); }
        btn.disabled = false;
      });

      $('[data-cl-print]').addEventListener('click', () => window.print());
      async function preparePrint() {
        let box = document.getElementById('print');
        if (!box) { box = document.createElement('div'); box.id = 'print'; document.body.appendChild(box); }
        const p = pack;
        box.innerHTML = protocol({ owner, claim: p.claim, list: p.list, src: x => (p.prints.get(x.id) || {}).url });
        document.body.classList.add('printing');
        // Tisk musí jít spustit hned po klepnutí, proto se obrázky načtou dopředu.
        $('[data-cl-print]').disabled = true;
        await Promise.all([...box.querySelectorAll('img')].map(i => i.decode().catch(() => {})));
        if (pack === p && $('[data-cl-print]')) $('[data-cl-print]').disabled = false;
      }
      m.addEventListener('close', () => {
        run++;
        saveClaim();
        document.body.classList.remove('printing');
        const box = document.getElementById('print');
        if (box) box.remove();
        dropUrls();
      }, { once: true });

      reset();
      fillThumbs(m, all);
    }, 'claim-modal');
  }

  window.addEventListener('beforeunload', e => { if (busy) { e.preventDefault(); e.returnValue = ''; } });
  window.Media = { PHASES, ofOwner, count, section, mount, addFiles, removeOwner, claimModal };
})();
