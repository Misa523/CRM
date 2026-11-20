window.Views = window.Views || {};

Views.settings = {
  title: 'Nastavení',
  render(el) {
    const { esc, icon, fmtDateTime } = UI;
    const s = Store.settings();
    const counts = ['contacts', 'deals', 'tasks', 'invoices'].map(c => Store.all(c).length);

    el.innerHTML = `<div class="settings">
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
        <p class="muted">Data jsou uložená <strong>jen v tomto prohlížeči na tomto zařízení</strong>. Pravidelně si stahujte zálohu. Stejným souborem data přenesete i na jiné zařízení (např. iPad).</p>
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
        <p class="muted">Odstraní všechny kontakty, obchody, úkoly a faktury z tohoto zařízení.</p>
        <button class="btn danger" id="wipe">${icon('trash')}<span>Smazat vše</span></button>
      </section>

      <p class="muted small">Uloženo: ${counts[0]} kontaktů · ${counts[1]} obchodů · ${counts[2]} úkolů · ${counts[3]} faktur</p>
    </div>`;

    el.querySelector('#biz').addEventListener('submit', e => {
      e.preventDefault();
      const f = e.target.elements;
      Store.setSettings({ businessName: f.businessName.value.trim() || 'Moje CRM', currency: f.currency.value });
      UI.toast('Nastavení uloženo');
    });

    el.querySelector('#export').addEventListener('click', () => {
      const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `crm-zaloha-${UI.today()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      Store.markBackup();
      UI.toast('Záloha stažena');
    });

    el.querySelector('#import').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      if (!confirm('Obnovení nahradí všechna současná data obsahem zálohy. Pokračovat?')) { e.target.value = ''; return; }
      const reader = new FileReader();
      reader.onload = () => {
        try { Store.importJSON(reader.result); UI.toast('Data obnovena'); }
        catch (err) { alert('Zálohu se nepodařilo načíst: ' + err.message); }
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
      Store.reset();
      UI.toast('Data smazána');
    });
  },
};
