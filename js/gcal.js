/* Propojení s Google kalendářem. Samotný zápis do Googlu dělá serverová funkce „gcal“ v Supabase
 * (supabase/functions/gcal), takže upomínky chodí i se zavřenou aplikací. Tady je jen:
 * - přihlášení ke Googlu (přesměrování na Google a zpět s ?code=…),
 * - nastavení upomínek a stav v Nastavení,
 * - pobídka k odeslání hned po změně dat (jinak to server udělá sám do 10 minut). */
(function () {
  const LS = 'crm-gcal';
  const SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
  const load = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } };
  const save = o => { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) { /* plné úložiště */ } };
  const redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, '');
  const REMINDERS = [
    ['week', 'Týden předem v 7:00', 'jen u zakázek'],
    ['daybefore', 'Den předem v 7:00', ''],
    ['eve', 'Den předem v 18:00', ''],
    ['morning', 'V den termínu v 7:00', ''],
  ];

  let info = null;        // stav ze serveru: { ready, clientId, linked, lastSync, lastError, needsRelink, reminders, email, count }
  let problem = '';       // proč stav nejde načíst
  let busy = '';          // probíhající akce (text)
  let loading = false;
  let returned = null;    // návrat z Googlu { code } / { error }
  const listeners = [];
  const notify = () => listeners.forEach(fn => fn());

  /* ---- Návrat z Googlu: …/CRM/?state=…&code=… → uklidit adresu ještě před prvním vykreslením ---- */
  const q = new URLSearchParams(location.search);
  if (q.get('state') && (q.get('code') || q.get('error'))) {
    const saved = load();
    if (saved.state && saved.state === q.get('state')) returned = q.get('code') ? { code: q.get('code') } : { error: q.get('error') };
    history.replaceState(null, '', location.pathname + (saved.back || '#/settings'));
    delete saved.state; delete saved.back;
    save(saved);
  }

  const call = (action, extra) => Sync.fn('gcal', Object.assign({ action }, extra || {}));
  function explain(e) {
    if (e.status === 404) return 'NOFN';
    if (e.offline) return 'Jste offline.';
    return e.message || String(e);
  }
  async function run(label, action, extra) {
    busy = label; loading = true; notify();
    try { info = await call(action, extra); problem = ''; const s = load(); s.linked = !!info.linked; save(s); return info; }
    catch (e) { problem = explain(e); throw e; }
    finally { busy = ''; loading = false; notify(); }
  }
  const refresh = () => run('', 'status').catch(() => {});

  function prefs(extra) {
    return Object.assign({
      timeZone: (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'Europe/Prague',
      appUrl: redirectUri(),
      currency: Store.settings().currency || 'CZK',
    }, extra || {});
  }

  function connect(choice) {
    if (!info || !info.clientId) return;
    const s = load();
    s.state = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
    s.back = location.hash || '#/settings';
    s.choice = choice; // upomínky zvolené před propojením
    save(s);
    location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      client_id: info.clientId, redirect_uri: redirectUri(), response_type: 'code', scope: SCOPE,
      access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state: s.state,
    });
  }

  async function finishConnect() {
    const r = returned; returned = null;
    if (r.error) { UI.toast(r.error === 'access_denied' ? 'Propojení s Googlem jste zrušil' : 'Google propojení odmítl (' + r.error + ')'); return; }
    const s = load();
    try {
      await run('Propojuji s Googlem…', 'connect', prefs(Object.assign({ code: r.code, redirectUri: redirectUri() }, s.choice || {})));
      UI.toast(info.lastError ? 'Propojeno, ale: ' + info.lastError : 'Google kalendář je propojený');
    } catch (e) { alert('Propojení s Google kalendářem se nepodařilo: ' + (problem === 'NOFN' ? 'v Supabase chybí funkce gcal.' : problem)); }
    const after = load(); delete after.choice; save(after);
  }

  /* ---- Po změně dat: jakmile jsou změny v cloudu, požádat server o odeslání do Googlu ---- */
  let dirty = false, timer = null, inFlight = false;
  Store.onChange(() => { dirty = true; });
  function maybeSync() {
    const s = Sync.status();
    if (!dirty || inFlight || !load().linked || s.status !== 'ok' || s.pending) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (inFlight) return;
      dirty = false; inFlight = true;
      try { info = await call('sync'); problem = ''; notify(); } catch (e) { /* zkusí to plánovač na serveru */ }
      inFlight = false;
    }, 3000);
  }

  let started = false;
  Sync.onStatus(() => {
    if (!Sync.active() || Sync.status().status !== 'ok') return;
    if (!started) { started = true; if (returned) finishConnect(); else if (load().linked) refresh(); }
    maybeSync();
  });

  /* ---- Sekce v Nastavení ---- */
  function draw(box) {
    if (!box) return;
    const { esc, icon, fmtDateTime } = UI;
    const head = '<h3>Google kalendář</h3>';
    if (!Sync.configured || !Sync.active()) {
      box.innerHTML = head + '<p class="muted">Propojení s Google kalendářem funguje po přihlášení do cloudu.</p>';
      return;
    }
    if (!info && !problem) {
      box.innerHTML = head + '<p class="muted">Načítám…</p>';
      if (!loading) refresh();
      return;
    }
    if (problem === 'NOFN' || (info && !info.ready)) {
      box.innerHTML = head + `<p class="muted">Ještě není nastavené v Supabase${problem === 'NOFN' ? ' (chybí funkce „gcal“)' : ' (chybí GOOGLE_CLIENT_ID a GOOGLE_CLIENT_SECRET)'}. Postup je v souboru GOOGLE-KALENDAR.md.</p>
        <div class="btn-row"><button class="btn" id="gc-retry">${icon('refresh')}<span>Zkusit znovu</span></button></div>`;
      box.querySelector('#gc-retry').addEventListener('click', refresh);
      return;
    }
    if (!info) {
      box.innerHTML = head + `<p class="small red">${esc(problem)}</p><div class="btn-row"><button class="btn" id="gc-retry">${icon('refresh')}<span>Zkusit znovu</span></button></div>`;
      box.querySelector('#gc-retry').addEventListener('click', refresh);
      return;
    }

    const choice = info.linked ? { reminders: info.reminders || [], email: !!info.email } : Object.assign({ reminders: ['week', 'eve', 'morning'], email: true }, load().choice);
    const checks = REMINDERS.map(([k, l, note]) => `<label class="field check-row"><input type="checkbox" name="rem" value="${k}"${choice.reminders.includes(k) ? ' checked' : ''}><span>${l}${note ? ` <span class="muted">(${note})</span>` : ''}</span></label>`).join('')
      + `<label class="field check-row"><input type="checkbox" name="email"${choice.email ? ' checked' : ''}><span>Poslat upomínku i e-mailem <span class="muted">(den předem, případně ráno)</span></span></label>`;
    const what = '<p class="muted">Do kalendáře „CRM“ v Googlu se samy zapisují vyhrané zakázky s termínem, nesplněné úkoly s termínem a splatnosti odeslaných faktur. Upomínky posílá Google – v telefonu mějte aplikaci Google Kalendář s povolenými oznámeními.</p>';
    const cls = info.needsRelink ? 'red' : info.lastError ? 'amber' : 'green';
    const label = info.needsRelink ? 'Propojení vypršelo' : info.lastError ? 'Propojeno, s chybou' : 'Propojeno';

    box.innerHTML = head + (info.linked ? `
      <dl class="fields flat">
        <div><dt>Stav</dt><dd><span class="pill ${cls}">${label}</span>${info.lastError ? `<div class="small red">${esc(info.lastError)}</div>` : ''}</dd></div>
        <div><dt>Naposledy odesláno</dt><dd>${info.lastSync ? esc(fmtDateTime(info.lastSync)) : '—'}</dd></div>
        <div><dt>V kalendáři</dt><dd>${UI.plural(info.count || 0, 'položka', 'položky', 'položek')}</dd></div>
      </dl>` : what) + `
      <div class="sec-sub">Upomínky</div>
      <form id="gc-form" class="gc-checks">${checks}</form>
      ${busy ? `<p class="muted small">${esc(busy)}</p>` : ''}
      <div class="btn-row">${info.linked && !info.needsRelink ? `
        <button class="btn" id="gc-sync" ${busy ? 'disabled' : ''}>${icon('refresh')}<span>Odeslat teď</span></button>
        <button class="btn danger" id="gc-off" ${busy ? 'disabled' : ''}>${icon('logout')}<span>Odpojit</span></button>` : `
        <button class="btn primary" id="gc-on" ${busy ? 'disabled' : ''}>${icon('calendar')}<span>${info.needsRelink ? 'Propojit znovu' : 'Propojit s Google kalendářem'}</span></button>
        ${info.needsRelink ? `<button class="btn danger" id="gc-off" ${busy ? 'disabled' : ''}>${icon('logout')}<span>Odpojit</span></button>` : ''}`}
      </div>
      ${info.linked ? '' : '<p class="muted small">Google se zeptá na povolení spravovat kalendáře vytvořené touto aplikací. Vaše ostatní kalendáře aplikace nevidí. Na iPhonu doporučujeme propojit na počítači – stačí jednou, upomínky pak chodí na všechna zařízení.</p>'}`;

    const form = box.querySelector('#gc-form');
    const read = () => ({ reminders: [...form.querySelectorAll('[name=rem]:checked')].map(i => i.value), email: form.querySelector('[name=email]').checked });
    form.addEventListener('change', () => {
      if (!info.linked) { const s = load(); s.choice = read(); save(s); return; }
      run('Ukládám…', 'settings', prefs(read())).then(() => UI.toast('Upomínky uloženy, kalendář se aktualizuje'), () => alert('Nepodařilo se uložit: ' + problem));
    });
    const on = box.querySelector('#gc-on');
    if (on) on.addEventListener('click', () => connect(read()));
    const sync = box.querySelector('#gc-sync');
    if (sync) sync.addEventListener('click', () => run('Odesílám…', 'sync').then(() => UI.toast(info.lastError ? info.lastError : 'Google kalendář je aktuální'), () => alert('Nepodařilo se: ' + problem)));
    const off = box.querySelector('#gc-off');
    if (off) off.addEventListener('click', () => {
      if (!confirm('Odpojit Google kalendář?\n\nKalendář „CRM“ se v Googlu smaže i s upomínkami. Data v CRM zůstanou beze změny a propojit jde kdykoli znovu.')) return;
      run('Odpojuji…', 'disconnect').then(() => UI.toast('Google kalendář odpojen'), () => alert('Nepodařilo se: ' + problem));
    });
  }

  window.Gcal = { draw, onChange: fn => listeners.push(fn) };
})();
