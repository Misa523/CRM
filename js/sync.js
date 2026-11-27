/* Synchronizace se Supabase (bez knihoven, přes REST API).
 *
 * Princip:
 * - Data se dál ukládají lokálně (Store / localStorage), takže aplikace funguje i offline.
 * - st.synced si pamatuje, jak vypadal každý záznam při poslední shodě s cloudem.
 *   Co se od té doby lokálně změnilo, se odešle (push). Novinky z cloudu se stáhnou (pull)
 *   podle času změny (updated_at nastavuje server).
 * - Nejdřív se stahuje, pak odesílá. Konflikt (změna tady i v cloudu): vyhraje novější podle updatedAt.
 *   Smazání proti úpravě: vyhraje úprava (raději záznam zachovat).
 * - Smazání se posílá jako záznam s deleted = true, aby se o něm dozvěděla i ostatní zařízení.
 * - Soubory (doklady, fotky, videa) se nahrávají do Storage (bucket „invoices“, složka <user_id>/) nezávisle na datech.
 */
(function () {
  const cfg = window.CRM_CONFIG || {};
  const BASE = String(cfg.supabaseUrl || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const KEY = String(cfg.supabaseAnonKey || '').trim();
  const configured = !!(BASE && KEY);
  const AUTH_KEY = 'crm-auth-v1';
  const STATE_KEY = 'crm-sync-v1';
  const COLS = ['contacts', 'deals', 'tasks', 'invoices', 'transactions', 'media'];
  // Kolekce přidané později. Starší verze aplikace (zapomenutá na jiném zařízení) je nezná a omylem by je v cloudu
  // označila za smazané. Skutečné smazání proto nese data.v; smazání bez něj se u těchto kolekcí ignoruje a vrátí zpět.
  const NEW_COLS = ['transactions', 'media'];
  const STATE_VER = 3;
  const BUCKET = 'invoices';
  const POLL_MS = 15000;

  const load = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  let session = configured ? load(AUTH_KEY) : null; // { access_token, refresh_token, expires_at, user: { id, email } }
  let st = load(STATE_KEY) || {};                   // { userId, initialized, cursor, synced, uploads, fileDeletes, lastSync }
  let status = configured ? 'idle' : 'off';         // off | idle | syncing | ok | offline | error
  let statusMsg = '';
  const listeners = [];

  const saveState = () => localStorage.setItem(STATE_KEY, JSON.stringify(st));
  const saveSession = () => (session ? localStorage.setItem(AUTH_KEY, JSON.stringify(session)) : localStorage.removeItem(AUTH_KEY));
  function setStatus(s, msg = '') { status = s; statusMsg = msg; listeners.forEach(fn => fn()); }

  /** JSON s seřazenými klíči – aby stejná data vždy dala stejný řetězec. */
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    }
    return v === undefined ? 'null' : JSON.stringify(v);
  }

  /* ---------------- Chyby ---------------- */
  const offlineError = () => Object.assign(new Error('Jste offline.'), { offline: true });
  const AUTH_MSG = {
    'Invalid login credentials': 'Nesprávný e-mail nebo heslo.',
    'Email not confirmed': 'E-mail ještě není potvrzený.',
    'Signups not allowed for this instance': 'Registrace nových účtů je vypnutá.',
  };

  const API_MSG = (msg, status) => {
    if (/permission denied for table/i.test(msg)) return 'V Supabase chybí práva k tabulce. Spusťte soubor supabase/schema.sql.';
    if (status === 413 || /exceeded the maximum allowed size|too large/i.test(msg)) return 'Soubor je pro cloud moc velký. Spusťte v Supabase aktuální supabase/schema.sql (limit 50 MB).';
    return msg;
  };

  /* ---------------- Přihlášení ---------------- */
  async function authCall(path, body) {
    let r;
    try {
      r = await fetch(`${BASE}/auth/v1/${path}`, {
        method: 'POST',
        headers: { apikey: KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) { throw offlineError(); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const raw = j.error_description || j.msg || j.message || j.error || r.statusText;
      throw Object.assign(new Error(AUTH_MSG[raw] || raw), { status: r.status });
    }
    return j;
  }
  function setSession(j) {
    session = {
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      expires_at: Date.now() + (j.expires_in || 3600) * 1000,
      user: { id: j.user.id, email: j.user.email },
    };
    saveSession();
  }
  async function accessToken(force) {
    if (!session) throw Object.assign(new Error('Nejste přihlášen.'), { auth: true });
    if (force || Date.now() > session.expires_at - 60000) {
      try {
        setSession(await authCall('token?grant_type=refresh_token', { refresh_token: session.refresh_token }));
      } catch (e) {
        // Výpadek sítě nebo serveru není důvod k odhlášení.
        if (e.offline || ![400, 401, 403].includes(e.status)) throw e;
        // Přihlášení vypršelo (např. odhlášení na jiném zařízení) → znovu přihlásit.
        session = null; saveSession();
        listeners.forEach(fn => fn());
        throw Object.assign(new Error('Přihlášení vypršelo, přihlaste se znovu.'), { auth: true });
      }
    }
    return session.access_token;
  }

  async function api(path, opts = {}, retried) {
    const token = await accessToken();
    let r;
    try {
      r = await fetch(BASE + path, Object.assign({}, opts, {
        headers: Object.assign({ apikey: KEY, Authorization: 'Bearer ' + token }, opts.headers || {}),
      }));
    } catch (e) { throw offlineError(); }
    if (r.status === 401 && !retried) { await accessToken(true); return api(path, opts, true); }
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      let msg = txt;
      try { const j = JSON.parse(txt); msg = j.message || j.error || txt; } catch (e) { /* text */ }
      throw Object.assign(new Error(API_MSG(msg, r.status) || r.statusText), { status: r.status });
    }
    return r;
  }

  /* ---------------- Porovnání a odeslání změn ---------------- */
  function localMap() {
    const d = Store.raw();
    const m = {};
    COLS.forEach(c => d[c].forEach(x => { m[`${c}:${x.id}`] = x; }));
    m['settings:main'] = d.settings;
    return m;
  }
  const splitKey = k => { const i = k.indexOf(':'); return [k.slice(0, i), k.slice(i + 1)]; };

  async function push() {
    const m = localMap();
    const synced = st.synced || (st.synced = {});
    const up = [], del = [];
    for (const k in m) { const j = stable(m[k]); if (synced[k] !== j) up.push({ k, j, data: m[k] }); }
    for (const k in synced) if (!(k in m)) del.push(k);
    if (!up.length && !del.length) return;

    const uid = session.user.id;
    const rows = up.map(x => { const [collection, id] = splitKey(x.k); return { user_id: uid, collection, id, data: x.data, deleted: false }; })
      .concat(del.map(k => { const [collection, id] = splitKey(k); return { user_id: uid, collection, id, data: { v: STATE_VER }, deleted: true }; }));
    for (let i = 0; i < rows.length; i += 500) {
      await api('/rest/v1/records?on_conflict=user_id,collection,id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows.slice(i, i + 500)),
      });
    }
    up.forEach(x => { synced[x.k] = x.j; });
    del.forEach(k => { delete synced[k]; });
    saveState();
  }

  /* ---------------- Stažení novinek ---------------- */
  async function fetchRows(since) {
    const out = [];
    for (let offset = 0; ; offset += 1000) {
      let q = `/rest/v1/records?select=collection,id,data,deleted,updated_at&order=updated_at.asc,collection.asc,id.asc&limit=1000&offset=${offset}`;
      if (since) q += `&updated_at=gt.${encodeURIComponent(since)}`;
      const rows = await (await api(q)).json();
      out.push(...rows);
      if (rows.length < 1000) return out;
    }
  }

  async function pull() {
    // Malý přesah zpět (1 min), aby se neztratila změna uložená těsně souběžně.
    const since = st.cursor ? new Date(new Date(st.cursor).getTime() - 60000).toISOString() : null;
    const rows = await fetchRows(since);
    if (!rows.length) return;
    const m = localMap();
    const synced = st.synced || (st.synced = {});
    const changes = [];
    let cursor = st.cursor ? new Date(st.cursor).getTime() : 0;
    for (const r of rows) {
      cursor = Math.max(cursor, new Date(r.updated_at).getTime());
      if (r.collection !== 'settings' && !COLS.includes(r.collection)) continue; // novější verze aplikace: nesahat
      const k = `${r.collection}:${r.id}`;
      const local = m[k];
      if (r.deleted && NEW_COLS.includes(r.collection) && !(r.data && r.data.v)) { // smazala omylem stará verze
        if (local !== undefined) delete synced[k]; // → znovu se odešle
        continue;
      }
      const localJ = local !== undefined ? stable(local) : undefined;
      const remoteJ = r.deleted ? undefined : stable(r.data);
      if (remoteJ === synced[k]) continue;                       // v cloudu nic nového
      if (remoteJ === localJ) { if (remoteJ === undefined) delete synced[k]; else synced[k] = remoteJ; continue; }
      if (localJ !== synced[k]) {                                // změna tady i v cloudu
        if (r.deleted) { delete synced[k]; continue; }           // smazáno jinde, upraveno tady → zachovat
        if (local !== undefined && !(String(r.data.updatedAt || '') > String(local.updatedAt || ''))) continue; // tady je novější
      }
      if (r.deleted) {
        if (local !== undefined) changes.push({ col: r.collection, id: r.id, data: null });
        delete synced[k];
      } else {
        changes.push({ col: r.collection, id: r.id, data: r.data });
        synced[k] = remoteJ;
      }
    }
    st.cursor = new Date(cursor).toISOString();
    if (changes.length) Store.applyRemote(changes); // nejdřív data, až pak stav synchronizace
    saveState();
  }

  /* ---------------- Soubory (doklady, fotky, videa) ---------------- */
  const objectPath = id => `${BUCKET}/${session.user.id}/${encodeURIComponent(id)}`;

  let filesRunning = false;
  const rejected = new Map(); // id → { e, at }: soubor odmítnutý cloudem, znovu až za 30 minut nebo ručně
  /** Nahraje a smaže čekající soubory. Běží vedle synchronizace dat, aby ji velké video nebrzdilo. */
  async function processFiles() {
    if (filesRunning || !active() || !((st.uploads || []).length || (st.fileDeletes || []).length)) return;
    filesRunning = true;
    let problem = null;
    try {
      const tried = new Set();
      for (;;) {
        const id = (st.uploads || []).find(x => !tried.has(x));
        if (!id) break;
        tried.add(id);
        const no = rejected.get(id);
        if (no && Date.now() - no.at < 1800000) { problem = no.e; continue; }
        setStatus('syncing');
        const file = await Files.getLocal(id);
        try {
          if (file) {
            await api(`/storage/v1/object/${objectPath(id)}`, {
              method: 'POST',
              headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' },
              body: file,
            });
          }
        } catch (e) {
          if (e.offline || e.auth || !(e.status >= 400 && e.status < 500)) throw e;
          rejected.set(id, { e, at: Date.now() });
          problem = e; // odmítnutý soubor (např. moc velký) nesmí zastavit ostatní
          continue;
        }
        if (!active()) return;
        st.uploads = st.uploads.filter(x => x !== id);
        saveState();
      }
      const del = (st.fileDeletes || []).slice();
      if (del.length) {
        await api(`/storage/v1/object/${BUCKET}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefixes: del.map(id => `${session.user.id}/${id}`) }),
        });
        st.fileDeletes = (st.fileDeletes || []).filter(x => !del.includes(x));
        saveState();
      }
      if (problem) throw problem;
      if (!running) setStatus('ok');
    } catch (e) { fail(e); } finally { filesRunning = false; }
  }
  function queueUpload(id) {
    if (!active()) return;
    st.uploads = (st.uploads || []).filter(x => x !== id).concat(id);
    saveState();
    schedule();
  }
  function queueDelete(ids) {
    if (!active() || !ids.length) return;
    st.uploads = (st.uploads || []).filter(x => !ids.includes(x));
    st.fileDeletes = (st.fileDeletes || []).concat(ids);
    saveState();
    schedule();
  }
  async function downloadFile(att) {
    const r = await api(`/storage/v1/object/authenticated/${objectPath(att.id)}`);
    const blob = await r.blob();
    return new File([blob], att.name || 'soubor', { type: att.type || blob.type });
  }

  /* ---------------- Hlavní smyčka ---------------- */
  let running = false, again = false, timer = null;
  async function syncNow() {
    if (!active()) return;
    if (running) { again = true; return; }
    running = true;
    upgradeState();
    setStatus('syncing');
    try {
      await pull();
      await push();
      st.lastSync = new Date().toISOString();
      saveState();
      const files = (st.uploads || []).length || (st.fileDeletes || []).length;
      if (!files) setStatus('ok');
      else if (filesRunning) setStatus('syncing');
      else processFiles();
    } catch (e) { fail(e); } finally {
      running = false;
      if (again) { again = false; syncNow(); }
    }
  }
  function fail(e) {
    if (e.offline) setStatus('offline', 'Jste offline. Změny se odešlou po připojení.');
    else if (e.auth) setStatus('error', e.message);
    else { console.error('Synchronizace:', e); setStatus('error', e.message); }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(syncNow, 700); }

  const active = () => configured && !!session && !!st.initialized && st.userId === (session && session.user.id);

  /* ---------------- První přihlášení na zařízení ---------------- */
  function choose(title, text, options) {
    return new Promise(resolve => {
      UI.openModal(`<div class="modal-body">
        <div class="modal-head"><h2>${UI.esc(title)}</h2></div>
        <div class="sec-body choice-body"><p>${text}</p>
          <div class="choice-list">${options.map((o, i) => `<button type="button" class="choice${i === 0 ? ' primary' : ''}" data-choice="${o.value}">
            <strong>${UI.esc(o.label)}</strong><span>${UI.esc(o.desc)}</span></button>`).join('')}</div>
        </div></div>`, m => {
        m.dataset.locked = '1'; // volba je povinná: nejde zavřít klikem vedle ani Escapem
        const noEsc = e => e.preventDefault();
        m.addEventListener('cancel', noEsc); // (náhradní okno Esc u zamčené volby ignoruje samo)
        m.addEventListener('close', () => m.removeEventListener('cancel', noEsc), { once: true });
        m.querySelectorAll('[data-choice]').forEach(b => b.addEventListener('click', () => { UI.closeModal(); resolve(b.dataset.choice); }));
      });
    });
  }

  async function firstSync() {
    const remote = await (await api('/rest/v1/records?select=id&deleted=is.false&collection=neq.settings&limit=1')).json();
    const localHas = !Store.isEmpty();
    let mode = 'download';
    if (!remote.length && localHas) {
      mode = await choose('Nahrát data do cloudu?',
        'Cloud je zatím prázdný. Na tomto zařízení máte data – co s nimi?',
        [{ value: 'upload', label: 'Nahrát data z tohoto zařízení', desc: 'Budou pak k dispozici na všech zařízeních.' },
         { value: 'fresh', label: 'Začít s prázdným CRM', desc: 'Data na tomto zařízení se smažou (např. ukázková data).' }]);
    } else if (remote.length && localHas) {
      mode = await choose('Na tomto zařízení už jsou data',
        'V cloudu jsou data z jiného zařízení. Jak je spojit s daty na tomto zařízení?',
        [{ value: 'download', label: 'Použít data z cloudu', desc: 'Data na tomto zařízení se nahradí daty z cloudu. (Doporučeno)' },
         { value: 'merge', label: 'Sloučit obojí', desc: 'Záznamy z tohoto zařízení se přidají k datům v cloudu.' }]);
    } else if (!remote.length) {
      mode = 'upload';
    }

    st.synced = {};
    st.cursor = null;
    if (mode === 'download' || mode === 'fresh') {
      if (localHas) { Store.reset(); Files.clear().catch(() => {}); }
      // Lokální nastavení bereme jako „beze změny“, aby se převzalo to z cloudu.
      if (mode === 'download') st.synced['settings:main'] = stable(Store.raw().settings);
    } else {
      // Nahrát i soubory z tohoto zařízení (doklady, fotky, videa).
      st.uploads = Store.fileIds();
    }
    st.initialized = true;
    st.ver = STATE_VER;
    saveState();
  }

  /** Po aktualizaci ze starší verze: nové kolekce stáhnout celé (stará verze je při stahování přeskočila). */
  function upgradeState() {
    if ((st.ver || 0) >= STATE_VER) return;
    Object.keys(st.synced || {}).forEach(k => { if (NEW_COLS.includes(splitKey(k)[0])) delete st.synced[k]; });
    st.cursor = null;
    st.ver = STATE_VER;
    saveState();
  }

  let starting = false;
  /** První synchronizace; při chybě ji další kontrola zkusí znovu. */
  async function start() {
    if (!configured || !session || starting) return;
    starting = true;
    try { await afterLogin(); }
    catch (e) { setStatus(e.offline ? 'offline' : 'error', e.message); }
    finally { starting = false; }
  }
  const tick = () => { if (session && !active()) start(); else syncNow(); };
  const typing = () => { const a = document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !!a.value; };

  async function afterLogin() {
    if (st.userId !== session.user.id) {
      st = { userId: session.user.id, initialized: false, synced: {}, cursor: null, uploads: [], fileDeletes: [], ver: STATE_VER };
      saveState();
    }
    if (!st.initialized) await firstSync();
    upgradeState();
    setStatus('idle');
    await syncNow();
  }

  /* ---------------- Přihlašovací obrazovka ---------------- */
  function showLogin(onDone) {
    let box = document.getElementById('login');
    if (!box) { box = document.createElement('div'); box.id = 'login'; document.body.appendChild(box); }
    document.body.classList.add('locked');
    box.innerHTML = `<form class="login-card card" novalidate>
      <div class="login-brand"><span class="brand-mark">C</span><strong>${UI.esc(Store.settings().businessName || 'Moje CRM')}</strong></div>
      <h1>Přihlášení</h1>
      <p class="muted">Data se synchronizují mezi všemi vašimi zařízeními.</p>
      <div class="field"><label for="l_email">E-mail</label><input id="l_email" name="email" type="email" autocomplete="username" required></div>
      <div class="field"><label for="l_pass">Heslo</label><input id="l_pass" name="password" type="password" autocomplete="current-password" required></div>
      <p class="login-error" hidden></p>
      <button class="btn primary login-btn" type="submit">Přihlásit</button>
    </form>`;
    const form = box.querySelector('form');
    const err = box.querySelector('.login-error');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const btn = form.querySelector('button');
      btn.disabled = true; btn.textContent = 'Přihlašuji…'; err.hidden = true;
      try {
        setSession(await authCall('token?grant_type=password', { email: form.email.value.trim(), password: form.password.value }));
        box.remove();
        document.body.classList.remove('locked');
        onDone();
        start();
      } catch (ex) {
        err.textContent = ex.offline ? 'Nelze se připojit. Zkontrolujte internet.' : ex.message;
        err.hidden = false;
        btn.disabled = false; btn.textContent = 'Přihlásit';
      }
    });
    setTimeout(() => form.email.focus(), 50);
  }

  async function signOut(wipeLocal) {
    clearTimeout(timer);
    try { if (session) await fetch(`${BASE}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + session.access_token } }); } catch (e) { /* offline – nevadí */ }
    session = null;
    saveSession();
    if (wipeLocal) {
      st = {};
      localStorage.removeItem(STATE_KEY);
      Store.reset();
      Files.clear().catch(() => {});
    }
    setStatus('idle');
  }

  /* ---------------- Spouštěče ---------------- */
  if (configured) {
    Store.onChange(() => { if (active()) schedule(); });
    setInterval(() => { if (document.visibilityState === 'visible' && !typing()) tick(); }, POLL_MS); // nepřekreslovat pod rukama
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
    window.addEventListener('online', tick);
    // Aplikace otevřená ve dvou kartách: převzít stav z té druhé, aby se data navzájem nepřepsala.
    window.addEventListener('storage', e => {
      if (e.key === STATE_KEY) st = load(STATE_KEY) || {};
      if (e.key === AUTH_KEY) { session = load(AUTH_KEY); listeners.forEach(fn => fn()); }
    });
  }

  window.Sync = {
    configured,
    active,
    needsLogin: () => configured && !session,
    /** Spustí se při startu aplikace (po přihlášení). */
    start: tick,
    syncNow: () => { rejected.clear(); return session && !active() ? start() : syncNow(); },
    showLogin, signOut, queueUpload, queueDelete, downloadFile,
    /** Zavolá serverovou funkci Supabase (Edge Function) jako přihlášený uživatel. */
    fn: async (name, body) => (await api('/functions/v1/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })).json(),
    user: () => session && session.user,
    status: () => ({ status, message: statusMsg, lastSync: st.lastSync || null, pending: pendingCount() }),
    onStatus: fn => listeners.push(fn),
  };

  function pendingCount() {
    if (!active()) return 0;
    const m = localMap(), s = st.synced || {};
    let n = 0;
    for (const k in m) if (s[k] !== stable(m[k])) n++;
    for (const k in s) if (!(k in m)) n++;
    return n + (st.uploads || []).length + (st.fileDeletes || []).length;
  }
})();
