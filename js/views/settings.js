window.Views = window.Views || {};

Views.settings = {
  title: 'Nastavení',
  render(el) {
    const { esc, icon, fmtDateTime } = UI;
    const s = Store.settings();
    const counts = ['contacts', 'deals', 'tasks', 'invoices'].map(c => Store.all(c).length);
    const metas = Store.all('invoices').flatMap(i => i.attachments || []);
    const filesSize = metas.reduce((a, m) => a + (m.size || 0), 0);

    const cloud = Sync.active();

    el.innerHTML = `<div class="settings">
      <section class="card" id="sync-box"></section>

      <section class="card">
        <h3>Firma</h3>
        <form id="biz" class="form-grid flat">
          <div class="field"><label for="s_name">Název (zobrazí se v menu)</label><input id="s_name" name="businessName" value="${esc(s.businessName)}"></div>
          <div class="field"><label for="s_cur">Měna</label><select id="s_cur" name="currency">${Schema.CURRENCIES.map(c => `<option${c === s.currency ? ' selected' : ''}>${c}</option>`).join('')}</select></div>
          <div class="field wide"><button class="btn primary" type="submit">Uložit</button></div>
        </form>
      </section>

      <section class="card">
        <h3>Záloha dat</h3>
        <p class="muted">${cloud
          ? 'Data jsou bezpečně v cloudu. Záloha do souboru je pojistka navíc – stáhněte si ji občas, třeba jednou za měsíc.'
          : 'Data jsou uložená <strong>jen v tomto prohlížeči na tomto zařízení</strong>. Pravidelně si stahujte zálohu. Stejným souborem data přenesete i na jiné zařízení (např. iPad).'}</p>
        ${metas.length ? `<p class="small">Záloha obsahuje i soubory faktur: <strong>${UI.plural(metas.length, 'soubor', 'soubory', 'souborů')}, ${Files.fmtSize(filesSize)}</strong>.</p>` : ''}
        <p class="small">Poslední záloha: <strong>${s.lastBackup ? esc(fmtDateTime(s.lastBackup)) : 'zatím žádná'}</strong></p>
        <div class="btn-row">
          <button class="btn primary" id="export">${icon('download')}<span>Stáhnout zálohu</span></button>
          <label class="btn">${icon('upload')}<span>Obnovit ze zálohy</span><input type="file" id="import" accept=".json,application/json" hidden></label>
        </div>
      </section>

      <section class="card">
        <h3>Ukázková data</h3>
        <p class="muted">Přidá několik vzorových kontaktů, obchodů, úkolů a faktur, ať si můžete aplikaci vyzkoušet.</p>
        <button class="btn" id="demo">Nahrát ukázková data</button>
      </section>

      <section class="card danger-zone">
        <h3>Smazat všechna data</h3>
        <p class="muted">${cloud
          ? 'Odstraní všechny kontakty, obchody, úkoly, faktury a jejich soubory <strong>v cloudu i na všech zařízeních</strong>.'
          : 'Odstraní všechny kontakty, obchody, úkoly a faktury z tohoto zařízení.'}</p>
        <button class="btn danger" id="wipe">${icon('trash')}<span>Smazat vše</span></button>
      </section>

      <p class="muted small">Uloženo: ${counts[0]} kontaktů · ${counts[1]} obchodů · ${counts[2]} úkolů · ${counts[3]} faktur</p>
    </div>`;

    Views.settings.drawSync(el.querySelector('#sync-box'));

    el.querySelector('#biz').addEventListener('submit', e => {
      e.preventDefault();
      const f = e.target.elements;
      Store.setSettings({ businessName: f.businessName.value.trim() || 'Moje CRM', currency: f.currency.value });
      UI.toast('Nastavení uloženo');
    });

    el.querySelector('#export').addEventListener('click', async e => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const obj = JSON.parse(Store.exportJSON());
        if (metas.length) obj.files = await Files.exportAll(metas); // soubory faktur jako base64
        const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `crm-zaloha-${UI.today()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        Store.markBackup();
        UI.toast('Záloha stažena');
      } catch (err) {
        alert('Zálohu se nepodařilo vytvořit: ' + err.message);
        btn.disabled = false;
      }
    });

    el.querySelector('#import').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      if (!confirm('Obnovení nahradí všechna současná data obsahem zálohy. Pokračovat?')) { e.target.value = ''; return; }
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const obj = JSON.parse(reader.result);
          const files = obj.files;
          delete obj.files;
          Store.importJSON(JSON.stringify(obj));
          await Files.clear().catch(() => {});
          if (files) await Files.importAll(files);
          UI.toast('Data obnovena');
        } catch (err) { alert('Zálohu se nepodařilo načíst: ' + err.message); }
      };
      reader.readAsText(file);
    });

    el.querySelector('#demo').addEventListener('click', () => {
      if (!Store.isEmpty() && !confirm('Ukázková data se přidají k vašim stávajícím datům. Pokračovat?')) return;
      Store.seedDemo();
      UI.toast('Ukázková data nahrána');
    });

    el.querySelector('#wipe').addEventListener('click', () => {
      if (!confirm('Opravdu smazat všechna data? Tuto akci nelze vrátit.')) return;
      if (!confirm('Máte stáhnutou zálohu? Po smazání už data nepůjde obnovit.')) return;
      Sync.queueDelete(metas.map(m => m.id)); // soubory i z cloudu
      Store.reset();
      Files.clear().catch(() => {});
      UI.toast('Data smazána');
    });
  },

  /** Sekce „Synchronizace“ – překresluje se i sama při změně stavu (app.js → renderSync). */
  drawSync(box) {
    const { esc, icon, fmtDateTime } = UI;
    if (!Sync.configured) {
      box.innerHTML = `<h3>Synchronizace mezi zařízeními</h3>
        <p class="muted">Zatím vypnutá – data jsou jen v tomto prohlížeči. Po propojení se Supabase se budou data sama synchronizovat mezi počítačem, iPadem i telefonem.</p>`;
      return;
    }
    const s = Sync.status();
    const user = Sync.user();
    const LABEL = {
      idle: ['Připojuji…', ''], syncing: ['Synchronizuji…', ''], ok: ['Vše je synchronizováno', 'green'],
      offline: ['Offline – změny se odešlou po připojení', 'amber'], error: ['Chyba synchronizace', 'red'],
    };
    const [label, color] = LABEL[s.status] || LABEL.idle;
    box.innerHTML = `<h3>Synchronizace mezi zařízeními</h3>
      <dl class="fields flat">
        <div><dt>Přihlášen</dt><dd>${esc(user ? user.email : '—')}</dd></div>
        <div><dt>Stav</dt><dd><span class="pill ${color || 'gray'}">${esc(label)}</span>${s.status === 'error' && s.message ? `<div class="small red">${esc(s.message)}</div>` : ''}</dd></div>
        <div><dt>Poslední synchronizace</dt><dd>${s.lastSync ? esc(fmtDateTime(s.lastSync)) : '—'}</dd></div>
        <div><dt>Čeká na odeslání</dt><dd>${s.pending ? UI.plural(s.pending, 'změna', 'změny', 'změn') : 'nic'}</dd></div>
      </dl>
      <div class="btn-row">
        <button class="btn" id="sync-now" ${s.status === 'syncing' ? 'disabled' : ''}>${icon('refresh')}<span>Synchronizovat teď</span></button>
        <button class="btn danger" id="sign-out">${icon('logout')}<span>Odhlásit</span></button>
      </div>`;
    box.querySelector('#sync-now').addEventListener('click', () => Sync.syncNow());
    box.querySelector('#sign-out').addEventListener('click', async () => {
      if (s.pending && !confirm('Některé změny ještě nejsou odeslané do cloudu. Po odhlášení se odešlou až při dalším přihlášení. Pokračovat?')) return;
      const wipe = confirm('Smazat data i z tohoto zařízení?\n\nOK = smazat (doporučeno na cizím nebo sdíleném zařízení, v cloudu data zůstanou)\nZrušit = ponechat je tady');
      await Sync.signOut(wipe);
      Sync.showLogin(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
    });
  },
};
