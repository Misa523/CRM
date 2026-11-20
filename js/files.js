/* Přílohy faktur (PDF, obrázky…).
 * Soubory se ukládají do IndexedDB (localStorage by na ně byl malý). U faktury je jen seznam
 * attachments: [{ id, name, type, size, addedAt }]; id je klíč souboru v IndexedDB. */
(function () {
  const { esc, icon } = UI;
  const DB = 'crm-files', STORE = 'files';
  const MAX = 25 * 1024 * 1024;
  const ACCEPT = '.pdf,image/*,.isdoc,.isdocx,.xml,.doc,.docx,.xls,.xlsx,.odt,.ods';

  /* ---------- IndexedDB ---------- */
  let dbp;
  function db() {
    if (!dbp) {
      dbp = new Promise((resolve, reject) => {
        if (!window.indexedDB) { reject(new Error('Tento prohlížeč neumí ukládat soubory.')); return; }
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      dbp.catch(() => { dbp = null; });
    }
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(d => new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Nedostatek místa pro uložení souboru.'));
    }));
  }
  const put = (id, file) => tx('readwrite', s => s.put(file, id));
  const get = id => tx('readonly', s => s.get(id));
  const removeLocal = ids => tx('readwrite', s => { ids.forEach(id => s.delete(id)); });
  /** Smaže soubory v tomto zařízení i v cloudu. */
  const remove = ids => { if (window.Sync) Sync.queueDelete(ids); return removeLocal(ids); };
  const clear = () => tx('readwrite', s => s.clear());

  async function persist() {
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* nevadí */ }
  }

  const fmtSize = b => (b < 1024 ? b + ' B' : b < 1048576 ? Math.round(b / 1024) + ' kB' : (b / 1048576).toFixed(1).replace('.', ',') + ' MB');

  /* ---------- Otevření / stažení ---------- */
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name || 'soubor';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function openBlob(blob, name, win) {
    const url = URL.createObjectURL(blob);
    const w = win || window.open(url, '_blank');
    if (win) win.location.href = url;
    if (!w) download(blob, name); // vyskakovací okna zablokovaná → stáhnout
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  /** Otevře uloženou přílohu v nové kartě (PDF a obrázky se zobrazí, ostatní se stáhnou). */
  async function open(att) {
    const win = window.open('', '_blank'); // otevřít hned při kliknutí, jinak ho prohlížeč zablokuje
    try {
      let blob = await get(att.id).catch(() => null);
      if (!blob && window.Sync && Sync.active()) {
        // Soubor je zatím jen v cloudu (přidaný na jiném zařízení) → stáhnout a uložit sem.
        try { blob = await Sync.downloadFile(att); }
        catch (e) { throw new Error(e.offline ? 'Soubor je v cloudu a jste offline. Zkuste to po připojení.' : `Soubor „${att.name}“ se nepodařilo stáhnout: ${e.message}`); }
        put(att.id, blob).catch(() => {});
      }
      if (!blob) throw new Error(`Soubor „${att.name}“ v tomto zařízení není. Pokud jste ho přidali na jiném zařízení, přeneste ho zálohou.`);
      openBlob(blob, att.name, win);
    } catch (e) {
      if (win) win.close();
      alert(e.message);
    }
  }

  /* ---------- Záloha ---------- */
  const toDataURL = blob => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  function fromDataURL(dataUrl, name, type) {
    const [head, b64] = String(dataUrl).split(',');
    const bin = atob(b64 || '');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const mime = type || (head.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
    return new File([bytes], name || 'soubor', { type: mime });
  }
  async function exportAll(metas) {
    const out = {};
    for (const m of metas) {
      const blob = await get(m.id);
      if (blob) out[m.id] = { name: m.name, type: m.type || blob.type, data: await toDataURL(blob) };
    }
    return out;
  }
  async function importAll(files) {
    const entries = Object.entries(files || {});
    if (entries.length) await persist();
    for (const [id, f] of entries) {
      await put(id, fromDataURL(f.data, f.name, f.type));
      if (window.Sync) Sync.queueUpload(id);
    }
  }

  /* ---------- Editor příloh ve formuláři ----------
   * Změny se uloží až po kliknutí na „Uložit“ (commit). „Zrušit“ nic nemění. */
  function editor(existing) {
    const keep = existing.slice();
    const added = [];   // { file, meta }
    const removed = []; // id souborů ke smazání
    let listEl;

    const html = `<div class="field wide attach-field">
      <label>Soubory faktury</label>
      <div class="attach-list" data-att-list></div>
      <label class="dropzone" data-att-drop>
        <input type="file" multiple hidden accept="${ACCEPT}" data-att-input>
        ${icon('clip')}
        <span><b>Připojit soubor</b><span class="hide-touch"> nebo ho sem přetáhněte</span></span>
        <small>PDF, obrázek, ISDOC… do 25 MB</small>
      </label>
    </div>`;

    function draw() {
      const rows = keep.map(a => ({ a, isNew: false })).concat(added.map(x => ({ a: x.meta, isNew: true, file: x.file })));
      listEl.hidden = !rows.length;
      listEl.innerHTML = rows.map((r, i) => `<div class="attach-item">
        ${icon('file')}
        <button type="button" class="attach-name" data-att-open="${i}" title="Otevřít">${esc(r.a.name)}</button>
        <span class="attach-meta">${fmtSize(r.a.size || 0)}${r.isNew ? ' · <b>nový</b>' : ''}</span>
        <button type="button" class="icon-btn sm" data-att-remove="${i}" aria-label="Odebrat soubor ${esc(r.a.name)}">${icon('x')}</button>
      </div>`).join('');
      listEl.querySelectorAll('[data-att-open]').forEach(b => b.addEventListener('click', () => {
        const r = rows[+b.dataset.attOpen];
        if (r.isNew) openBlob(r.file, r.a.name); else open(r.a);
      }));
      listEl.querySelectorAll('[data-att-remove]').forEach(b => b.addEventListener('click', () => {
        const r = rows[+b.dataset.attRemove];
        if (r.isNew) added.splice(added.findIndex(x => x.meta === r.a), 1);
        else { keep.splice(keep.indexOf(r.a), 1); removed.push(r.a.id); }
        draw();
      }));
    }

    function addFiles(list) {
      for (const f of list) {
        if (f.size > MAX) { alert(`Soubor „${f.name}“ je větší než 25 MB.`); continue; }
        added.push({ file: f, meta: { name: f.name, type: f.type, size: f.size } });
      }
      draw();
    }

    function mount(m) {
      listEl = m.querySelector('[data-att-list]');
      const input = m.querySelector('[data-att-input]');
      const drop = m.querySelector('[data-att-drop]');
      input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
      drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); });
      draw();
    }

    async function commit() {
      const out = keep.slice();
      if (added.length) await persist();
      for (const x of added) {
        const id = Store.uid();
        await put(id, x.file);
        if (window.Sync) Sync.queueUpload(id);
        out.push({ id, name: x.file.name, type: x.file.type, size: x.file.size, addedAt: new Date().toISOString() });
      }
      if (removed.length) await remove(removed); // smaže i z cloudu
      return out;
    }

    return { html, mount, commit };
  }

  window.Files = { editor, open, remove, clear, exportAll, importAll, fmtSize, getLocal: get };
})();
