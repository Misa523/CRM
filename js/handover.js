/* Předávací protokol: popis práce, fotky před a po, podpis klienta prstem → PDF uložené u zakázky.
 * PDF se skládá bez knihoven: každá stránka se nakreslí do canvasu (čeština i fotky bez problémů)
 * a vloží se jako obrázek. Záznam je v deal.handovers[{ id (= id souboru), name, type, size, addedAt, date, signer }]. */
(function () {
  const { esc, icon, fmtDate, fmtDateTime, today, plural } = UI;
  const FONT = '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  /* ---------- Podpis prstem / myší ---------- */
  function signaturePad(canvas) {
    const strokes = []; // tahy v souřadnicích 0–1 (nezávislé na velikosti)
    let cur = null;
    const ctx = canvas.getContext('2d');
    function size() {
      const r = canvas.getBoundingClientRect(), k = window.devicePixelRatio || 1;
      if (!r.width) return;
      canvas.width = Math.round(r.width * k);
      canvas.height = Math.round(r.height * k);
      draw();
    }
    function line(g, pts, w, h, width) {
      g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#111';
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(p[0] * w, p[1] * h) : g.moveTo(p[0] * w, p[1] * h)));
      if (pts.length === 1) g.lineTo(pts[0][0] * w + 0.1, pts[0][1] * h);
      g.stroke();
    }
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      strokes.forEach(s => line(ctx, s, canvas.width, canvas.height, 2.6 * (window.devicePixelRatio || 1)));
    }
    const pos = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
    canvas.addEventListener('pointerdown', e => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      cur = [pos(e)];
      strokes.push(cur);
      draw();
    });
    canvas.addEventListener('pointermove', e => { if (!cur) return; cur.push(pos(e)); draw(); });
    const end = () => { if (cur) { cur = null; canvas.dispatchEvent(new Event('signed', { bubbles: true })); } };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    const ro = window.ResizeObserver ? new ResizeObserver(size) : null;
    if (ro) ro.observe(canvas);
    size();
    return {
      empty: () => !strokes.length,
      clear() { strokes.length = 0; draw(); canvas.dispatchEvent(new Event('signed', { bubbles: true })); },
      /** Nakreslí podpis do obdélníku v jiném canvasu (do PDF). */
      drawInto(g, x, y, w, h) { g.save(); g.translate(x, y); strokes.forEach(s => line(g, s, w, h, 3.2)); g.restore(); },
      stop() { if (ro) ro.disconnect(); },
    };
  }

  /* ---------- PDF ze stránek (JPEG) ---------- */
  async function pdfFromCanvases(pages) {
    const enc = s => new TextEncoder().encode(s);
    const parts = [], offsets = [];
    let pos = 0;
    const add = p => { parts.push(p); pos += p.length !== undefined ? p.length : p.size; };
    const W = 595.28, H = 841.89, n = pages.length;
    add(enc('%PDF-1.4\n%âãÏÓ\n'));
    const obj = (num, body) => { offsets[num] = pos; add(enc(`${num} 0 obj\n`)); body(); add(enc('\nendobj\n')); };
    obj(1, () => add(enc('<< /Type /Catalog /Pages 2 0 R >>')));
    obj(2, () => add(enc(`<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`)));
    for (let i = 0; i < n; i++) {
      const c = pages[i], base = 3 + i * 3;
      const jpg = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86))).arrayBuffer());
      const draw = enc(`q ${W} 0 0 ${H} 0 0 cm /Im${i} Do Q`);
      obj(base, () => add(enc(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im${i} ${base + 2} 0 R >> >> /Contents ${base + 1} 0 R >>`)));
      obj(base + 1, () => { add(enc(`<< /Length ${draw.length} >>\nstream\n`)); add(draw); add(enc('\nendstream')); });
      obj(base + 2, () => {
        add(enc(`<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`));
        add(jpg); add(enc('\nendstream'));
      });
    }
    const count = 3 + n * 3, xref = pos;
    let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
    for (let i = 1; i < count; i++) table += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    add(enc(table + `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
    return new Blob(parts, { type: 'application/pdf' });
  }

  /* ---------- Sazba stránek A4 (150 dpi) ---------- */
  const PW = 1240, PH = 1754, M = 96, CW = PW - 2 * M;
  function layout() {
    const pages = [];
    let g, y;
    const page = () => {
      const c = document.createElement('canvas');
      c.width = PW; c.height = PH;
      g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, PW, PH);
      g.textBaseline = 'top';
      pages.push(c);
      y = M;
    };
    const room = h => { if (y + h > PH - M - 40) page(); };
    const font = (size, weight = 400) => { g.font = `${weight} ${size}px ${FONT}`; };
    function lines(text, width) {
      const out = [];
      String(text || '').split('\n').forEach(par => {
        let line = '';
        par.split(/\s+/).forEach(w => {
          const t = line ? line + ' ' + w : w;
          if (g.measureText(t).width <= width || !line) line = t; else { out.push(line); line = w; }
        });
        out.push(line);
      });
      return out;
    }
    const api = {
      pages, get y() { return y; }, set y(v) { y = v; }, get g() { return g; }, room, font, lines,
      text(t, { size = 22, weight = 400, color = '#111', gap = 8, x = M, width = CW } = {}) {
        font(size, weight);
        g.fillStyle = color;
        lines(t, width).forEach(l => { room(size * 1.4); g.fillText(l, x, y); y += size * 1.4; });
        y += gap;
      },
      rule() { room(20); g.fillStyle = '#d5dae3'; g.fillRect(M, y + 6, CW, 2); y += 22; },
    };
    page();
    return api;
  }
  /** Obrázek do rámečku se zachováním poměru stran. */
  function fit(g, img, x, y, w, h) {
    g.fillStyle = '#f1f3f6'; g.fillRect(x, y, w, h);
    const k = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    const iw = img.naturalWidth * k, ih = img.naturalHeight * k;
    g.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  }

  async function buildPdf({ deal, data, photos, pad, signedAt }) {
    const contact = deal.contactId && Store.get('contacts', deal.contactId);
    const L = layout();
    L.text(Store.settings().businessName || '', { size: 22, weight: 600, color: '#556', gap: 4 });
    L.text('Předávací protokol', { size: 48, weight: 700, gap: 14 });
    const row = (k, v) => {
      if (!v) return;
      L.font(22, 600); L.g.fillStyle = '#556';
      L.room(32); L.g.fillText(k, M, L.y);
      const y0 = L.y;
      L.text(v, { x: M + 300, width: CW - 300, gap: 4 });
      if (L.y < y0 + 34) L.y = y0 + 34;
    };
    row('Zakázka', deal.title);
    row('Objednatel', contact ? [contact.name, contact.company].filter(Boolean).join(', ') : '');
    row('Adresa', contact ? contact.address : '');
    row('Termín práce', Planning.term(deal));
    row('Datum předání', fmtDate(data.date));
    L.rule();
    L.text('Provedené práce', { size: 28, weight: 700 });
    L.text(data.work || '—', { gap: 18 });
    L.text('Výhrady objednatele', { size: 28, weight: 700 });
    L.text(data.notes || 'Bez výhrad.', { gap: 18 });

    if (photos.length) {
      L.text('Fotodokumentace', { size: 28, weight: 700, gap: 12 });
      const colW = (CW - 30) / 2, boxH = Math.round(colW * 0.75), capH = 64;
      for (let i = 0; i < photos.length; i += 2) {
        L.room(boxH + capH);
        const y0 = L.y;
        for (let j = 0; j < 2 && i + j < photos.length; j++) {
          const p = photos[i + j], x = M + j * (colW + 30);
          if (p.img) fit(L.g, p.img, x, y0, colW, boxH);
          else { L.g.fillStyle = '#f1f3f6'; L.g.fillRect(x, y0, colW, boxH); }
          L.font(20, 700); L.g.fillStyle = '#111';
          L.g.fillText(`${i + j + 1}. ${p.label}${p.m.kind === 'video' ? ' (video)' : ''}${p.m.note ? ' – ' + p.m.note : ''}`.slice(0, 60), x, y0 + boxH + 8);
          L.font(17); L.g.fillStyle = '#667';
          L.g.fillText(Media.takenText(p.m).slice(0, 70), x, y0 + boxH + 34);
        }
        L.y = y0 + boxH + capH + 14;
      }
    }

    // Podpis vždy celý na jedné stránce
    L.room(420);
    L.rule();
    L.text('Objednatel potvrzuje, že dílo převzal ve výše uvedeném stavu.', { gap: 16 });
    const sy = L.y;
    L.g.strokeStyle = '#c9ced8'; L.g.lineWidth = 2;
    L.g.strokeRect(M, sy, 620, 220);
    pad.drawInto(L.g, M, sy, 620, 220);
    L.font(20); L.g.fillStyle = '#556';
    L.g.fillText('Podpis objednatele', M, sy + 230);
    L.font(24, 600); L.g.fillStyle = '#111';
    L.g.fillText(data.signer, M + 660, sy + 40);
    L.font(20); L.g.fillStyle = '#556';
    L.g.fillText(`Podepsáno ${fmtDateTime(signedAt)}`, M + 660, sy + 80);
    L.g.fillText('na zařízení dodavatele', M + 660, sy + 110);

    L.pages.forEach((c, i) => {
      const g = c.getContext('2d');
      g.font = `18px ${FONT}`; g.fillStyle = '#889'; g.textBaseline = 'alphabetic';
      g.fillText(`${deal.title} · předávací protokol`.slice(0, 80), M, PH - 50);
      const t = `Strana ${i + 1} z ${L.pages.length}`;
      g.fillText(t, PW - M - g.measureText(t).width, PH - 50);
    });
    return pdfFromCanvases(L.pages);
  }

  /** Obrázek pro protokol: fotka (zmenšená při kreslení), u videa a neznámého formátu náhled. */
  async function imageFor(m) {
    const load = async att => {
      const url = URL.createObjectURL(await Files.load(att));
      try { const img = new Image(); img.src = url; await img.decode(); return img; }
      catch (e) { return null; }
      finally { setTimeout(() => URL.revokeObjectURL(url), 60000); }
    };
    if (m.kind === 'photo') { const img = await load(m).catch(() => null); if (img) return img; }
    return m.thumb ? load({ id: m.id + '-t', name: m.name, type: 'image/jpeg' }).catch(() => null) : null;
  }

  const list = deal => (deal.handovers || []).slice().sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
  const safe = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'zakazka';

  async function share(att) {
    try {
      const blob = await Files.load(att);
      const file = new File([blob], att.name, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: att.name });
      else Files.download(file, att.name);
    } catch (e) { if (e.name !== 'AbortError') alert(e.message); }
  }

  /* ---------- Okno protokolu ---------- */
  function open(dealId) {
    const deal = Store.get('deals', dealId);
    if (!deal) return;
    const contact = deal.contactId && Store.get('contacts', deal.contactId);
    const all = Media.PHASES.flatMap(p => Media.ofOwner(dealId).filter(m => m.phase === p.id || (p.id === 'other' && !Media.PHASES.some(x => x.id === m.phase))));
    const sel = new Set(all.filter(m => m.phase === 'before' || m.phase === 'after').map(m => m.id));
    const label = m => (Media.PHASES.find(p => p.id === m.phase) || Media.PHASES[3]).label;
    let pad;

    UI.openModal(`<form class="modal-body" novalidate>
      <div class="modal-head"><h2>Předávací protokol</h2><button type="button" class="icon-btn" data-close aria-label="Zavřít">${icon('x')}</button></div>
      <div class="form-grid">
        <div class="field"><label for="ho_date">Datum předání *</label>${UI.dateInput({ id: 'ho_date', name: 'ho_date', value: today(), required: true })}</div>
        <div class="field"><label for="ho_signer">Za objednatele převzal(a) *</label><input id="ho_signer" required autocomplete="off" value="${esc(contact ? contact.name : '')}"></div>
        <div class="field wide"><label for="ho_work">Provedené práce</label><textarea id="ho_work" rows="3" placeholder="Co bylo uděláno">${esc(deal.note || '')}</textarea></div>
        <div class="field wide"><label for="ho_notes">Výhrady objednatele</label><textarea id="ho_notes" rows="2" placeholder="Nechte prázdné, pokud žádné nejsou (v protokolu bude „Bez výhrad“)"></textarea></div>
        ${all.length ? `<div class="field wide">
          <div class="claim-head"><label>Fotky do protokolu</label><span class="muted small" data-ho-count></span></div>
          <div class="thumbs claim">${all.map(m => `<button type="button" class="thumb-btn" data-ho-item="${esc(m.id)}">${Media.thumbHtml(m, `<span class="thumb-tick">${icon('tick')}</span><span class="thumb-tag">${esc(label(m))}</span>`)}</button>`).join('')}</div>
        </div>` : '<p class="field wide muted small">Zakázka nemá fotky. Protokol půjde vytvořit i bez nich.</p>'}
        <div class="field wide">
          <div class="claim-head"><label>Podpis objednatele *</label><button type="button" class="btn xs ghost" data-ho-clear>${icon('x')}<span>Smazat podpis</span></button></div>
          <div class="sign-box"><canvas class="sign-pad" aria-label="Místo pro podpis prstem nebo myší"></canvas><span class="sign-hint">Podepište se prstem nebo myší</span></div>
        </div>
        <p class="field wide claim-msg" data-ho-msg hidden></p>
      </div>
      <div class="modal-foot">
        <span class="spacer"></span>
        <button type="button" class="btn ghost" data-close>Zrušit</button>
        <button type="submit" class="btn primary" data-ho-save>${icon('tick')}<span>Uložit protokol</span></button>
      </div></form>`, m => {
      const $ = s => m.querySelector(s);
      const say = (t, err) => { const el = $('[data-ho-msg]'); el.hidden = !t; el.textContent = t || ''; el.classList.toggle('red', !!err); };
      const draw = () => {
        m.querySelectorAll('[data-ho-item]').forEach(b => { const on = sel.has(b.dataset.hoItem); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
        if ($('[data-ho-count]')) $('[data-ho-count]').textContent = `vybráno ${sel.size} z ${all.length}`;
      };
      m.querySelectorAll('[data-ho-item]').forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.hoItem;
        if (sel.has(id)) sel.delete(id); else sel.add(id);
        draw();
      }));
      pad = signaturePad($('.sign-pad'));
      m.addEventListener('signed', () => $('.sign-box').classList.toggle('has', !pad.empty()));
      $('[data-ho-clear]').addEventListener('click', () => pad.clear());
      m.addEventListener('close', () => pad.stop(), { once: true });
      draw();
      Media.fillThumbs(m, all);

      $('form').addEventListener('submit', async e => {
        e.preventDefault();
        const form = e.target;
        if (!form.reportValidity()) return;
        if (pad.empty()) { say('Chybí podpis objednatele.', true); $('.sign-box').scrollIntoView({ block: 'center' }); return; }
        const btn = $('[data-ho-save]');
        btn.disabled = true;
        try {
          const data = { date: $('[name="ho_date"]').value, signer: $('#ho_signer').value.trim(), work: $('#ho_work').value.trim(), notes: $('#ho_notes').value.trim() };
          const chosen = all.filter(x => sel.has(x.id));
          const photos = [];
          for (let i = 0; i < chosen.length; i++) {
            say(`Připravuji fotky ${i + 1} z ${chosen.length}…`);
            photos.push({ m: chosen[i], label: label(chosen[i]), img: await imageFor(chosen[i]) });
          }
          say('Vytvářím PDF…');
          const signedAt = new Date().toISOString();
          const blob = await buildPdf({ deal, data, photos, pad, signedAt });
          const id = Store.uid();
          const name = `predavaci-protokol-${safe(deal.title)}-${data.date}.pdf`;
          await Files.persist();
          await Files.put(id, new File([blob], name, { type: 'application/pdf' }));
          Sync.queueUpload(id);
          const meta = { id, name, type: 'application/pdf', size: blob.size, addedAt: signedAt, date: data.date, signer: data.signer };
          const d = Store.get('deals', dealId);
          if (!d) { await Files.remove([id]); UI.closeModal(); return; }
          const patch = { handovers: (d.handovers || []).concat(meta) };
          const moved = d.stage === 'won' && ['planned', 'active'].includes(Planning.of(d));
          if (moved) patch.progress = 'done';
          Store.update('deals', dealId, patch);
          done(meta, moved);
        } catch (err) {
          btn.disabled = false;
          say('Protokol se nepodařilo vytvořit: ' + err.message, true);
        }
      });
    }, 'claim-modal handover-modal');
  }

  /** Po uložení: sdílet, otevřít, nebo zavřít. */
  function done(meta, moved) {
    UI.openModal(`<div class="modal-body">
      <div class="modal-head"><h2>Protokol je uložený</h2><button type="button" class="icon-btn" data-close aria-label="Zavřít">${icon('x')}</button></div>
      <div class="sec-body choice-body">
        <p>Předávací protokol (${esc(Files.fmtSize(meta.size))}) je uložený u zakázky${moved ? ' a zakázka je teď ve stavu <strong>Hotovo</strong>' : ''}. Klientovi ho můžete rovnou poslat.</p>
        <div class="btn-row">
          <button type="button" class="btn primary" data-ho-share>${icon('share')}<span>Sdílet / poslat</span></button>
          <button type="button" class="btn" data-ho-open>${icon('file')}<span>Otevřít PDF</span></button>
        </div>
      </div>
      <div class="modal-foot"><span class="spacer"></span><button type="button" class="btn ghost" data-close>Hotovo</button></div></div>`, m => {
      m.querySelector('[data-ho-share]').addEventListener('click', () => share(meta));
      m.querySelector('[data-ho-open]').addEventListener('click', () => Files.open(meta));
    });
  }

  /** Sekce v detailu zakázky. */
  function section(deal) {
    const items = list(deal);
    return `<section class="card flush" id="sec-handover">
      <div class="sec-head"><h3>Předávací protokoly</h3><button class="btn xs" data-handover="${esc(deal.id)}">${icon('edit')}<span>Nový protokol</span></button></div>
      ${items.length ? items.map(h => `<div class="ag-item ho-row">
        <button type="button" class="ag-row" data-ho-open="${esc(h.id)}">${icon('file')}<span class="ag-text"><b>Protokol z ${esc(fmtDate(h.date))}</b><small>Podepsal(a) ${esc(h.signer)} · ${esc(Files.fmtSize(h.size || 0))}</small></span></button>
        <button type="button" class="icon-btn" data-ho-share="${esc(h.id)}" aria-label="Sdílet protokol" title="Sdílet">${icon('share')}</button>
        <button type="button" class="icon-btn" data-ho-del="${esc(h.id)}" aria-label="Smazat protokol" title="Smazat">${icon('trash')}</button>
      </div>`).join('') : `<p class="muted small sec-empty">Zatím žádný. Při předání hotové práce ho klient podepíše prstem na tomto zařízení.</p>`}
    </section>`;
  }
  function mount(root, dealId) {
    const find = id => (Store.get('deals', dealId).handovers || []).find(h => h.id === id);
    root.querySelectorAll('[data-handover]').forEach(b => b.addEventListener('click', () => open(dealId)));
    root.querySelectorAll('[data-ho-open]').forEach(b => b.addEventListener('click', () => Files.open(find(b.dataset.hoOpen))));
    root.querySelectorAll('[data-ho-share]').forEach(b => b.addEventListener('click', () => share(find(b.dataset.hoShare))));
    root.querySelectorAll('[data-ho-del]').forEach(b => b.addEventListener('click', () => {
      const h = find(b.dataset.hoDel);
      if (!confirm(`Smazat předávací protokol z ${fmtDate(h.date)}? Smaže se i v cloudu a nepůjde obnovit.`)) return;
      Files.remove([h.id]).catch(() => {});
      Store.update('deals', dealId, { handovers: Store.get('deals', dealId).handovers.filter(x => x.id !== h.id) });
      UI.toast('Protokol smazán');
    }));
  }

  window.Handover = { open, section, mount, list, buildPdf, pdfFromCanvases };
})();
