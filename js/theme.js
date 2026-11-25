/* Vzhled: světlý, tmavý nebo podle zařízení. Volba platí jen pro toto zařízení (neukládá se do cloudu).
 * Načítá se v <head>, aby stránka při startu neblikla. Barvy jsou v css/styles.css (:root[data-theme="dark"]). */
(function () {
  const KEY = 'crm-theme';
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const listeners = [];
  let choice = read();

  function read() {
    try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'auto'; } catch (e) { return 'auto'; }
  }
  const resolved = () => (choice === 'auto' ? (mq.matches ? 'dark' : 'light') : choice);
  function apply() {
    document.documentElement.dataset.theme = resolved();
    listeners.forEach(fn => fn());
  }
  function set(v) {
    choice = v;
    try { if (v === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, v); } catch (e) { /* platí do zavření */ }
    apply();
  }
  if (mq.addEventListener) mq.addEventListener('change', apply); else mq.addListener(apply);
  window.addEventListener('storage', e => { if (e.key === KEY) { choice = read(); apply(); } });
  apply();

  window.Theme = { get: () => choice, set, resolved, toggle: () => set(resolved() === 'dark' ? 'light' : 'dark'), onChange: fn => listeners.push(fn) };
})();
