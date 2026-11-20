/* Jednoduché SVG grafy bez knihoven (funguje i offline).
 * Čárový a sloupcový graf se překreslí podle šířky kontejneru (ResizeObserver), takže jsou ostré na každém displeji.
 * Barvy řad: třídy s-primary, s-green, s-red, s-amber, s-blue, s-violet, s-gray, s-stage (+ stage-xxx).
 * Bublina s hodnotou: libovolný prvek s atributem data-tip (HTML, už escapované). */
(function () {
  const { esc } = UI;
  const compact = n => new Intl.NumberFormat('cs-CZ', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  const f1 = n => n.toFixed(1);

  function niceStep(raw, integer) {
    if (!(raw > 0)) return 1;
    const exp = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / exp;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
    return integer ? Math.max(1, Math.ceil(step)) : step;
  }

  /* ---------- Překreslování podle šířky ---------- */
  const observers = [];
  function mount(el, draw) {
    if (!el) return;
    let last = 0;
    const render = () => {
      const w = Math.floor(el.clientWidth);
      if (w > 0 && w !== last) { last = w; el.innerHTML = draw(w); }
    };
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(render);
      ro.observe(el);
      observers.push(ro);
    }
    render();
  }
  function reset() { while (observers.length) observers.pop().disconnect(); hideTip(); }

  /* ---------- Společné osy ---------- */
  function frame({ w, h, n, maxV, integer, labels }) {
    const padL = 44, padR = 14, padT = 10, padB = 26;
    const iw = Math.max(20, w - padL - padR), ih = h - padT - padB;
    const step = niceStep(maxV / 4, integer), max = step * 4;
    const y = v => padT + ih - (v / max) * ih;
    let grid = '';
    for (let k = 0; k <= 4; k++) {
      const yy = f1(y(k * step));
      grid += `<line class="grid" x1="${padL}" x2="${w - padR}" y1="${yy}" y2="${yy}"/>` +
        `<text class="ylab" x="${padL - 8}" y="${yy}" dy="0.32em" text-anchor="end">${esc(compact(k * step))}</text>`;
    }
    // Popisky osy X: když se nevejdou, ukáže se jen každý n-tý (zarovnáno od konce).
    const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / 44))));
    return { padL, padR, padT, padB, iw, ih, y, base: padT + ih, grid, showLabel: i => (n - 1 - i) % every === 0, labels };
  }
  const svg = (w, h, inner) => `<svg class="chart-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${inner}</svg>`;
  const tipHtml = (title, series, i, format) => `<b>${esc(title)}</b>` +
    series.map(s => `<div><i class="tip-dot ${s.cls}"></i>${esc(s.name)}: <b>${esc(format(s.values[i]))}</b></div>`).join('');

  /* ---------- Čárový / plošný graf ----------
   * series: [{ name, cls, values[], area?, dashed? }] */
  function line({ width: w, height: h = 220, labels, tipLabels = labels, series, format = UI.money, integer = false }) {
    const n = labels.length;
    const fr = frame({ w, h, n, maxV: Math.max(0, ...series.flatMap(s => s.values)), integer });
    const x = i => fr.padL + (n === 1 ? fr.iw / 2 : (i * fr.iw) / (n - 1));
    const half = n > 1 ? fr.iw / (n - 1) / 2 : fr.iw / 2;
    let out = fr.grid;
    labels.forEach((l, i) => {
      if (fr.showLabel(i)) {
        const anchor = n > 1 && i === n - 1 ? 'end' : n > 1 && i === 0 ? 'start' : 'middle';
        out += `<text class="xlab" x="${f1(x(i))}" y="${h - 6}" text-anchor="${anchor}">${esc(l)}</text>`;
      }
      const x0 = Math.max(fr.padL, x(i) - half), x1 = Math.min(w - fr.padR, x(i) + half);
      out += `<rect class="hz" x="${f1(x0)}" y="${fr.padT}" width="${f1(x1 - x0)}" height="${fr.ih}" data-tip="${esc(tipHtml(tipLabels[i], series, i, format))}"/>`;
    });
    series.forEach(s => {
      const pts = s.values.map((v, i) => `${f1(x(i))},${f1(fr.y(v))}`).join('L');
      if (s.area) out += `<path class="area ${s.cls}" d="M${pts}L${f1(x(n - 1))},${fr.base}L${f1(x(0))},${fr.base}Z"/>`;
      out += `<path class="ln ${s.cls}${s.dashed ? ' dashed' : ''}" d="M${pts}"/>`;
      if (n <= 14 && !s.dashed) out += s.values.map((v, i) => `<circle class="dot ${s.cls}" cx="${f1(x(i))}" cy="${f1(fr.y(v))}" r="3.5"/>`).join('');
    });
    return svg(w, h, out);
  }

  /* ---------- Sloupcový graf (seskupené sloupce) ---------- */
  function bars({ width: w, height: h = 220, labels, tipLabels = labels, series, format = String, integer = true }) {
    const n = labels.length;
    const fr = frame({ w, h, n, maxV: Math.max(0, ...series.flatMap(s => s.values)), integer });
    const gw = fr.iw / n;
    const inner = Math.min(gw * 0.72, series.length * 22);
    const bw = inner / series.length;
    let out = fr.grid;
    labels.forEach((l, i) => {
      const gx = fr.padL + gw * i;
      out += `<rect class="hz" x="${f1(gx)}" y="${fr.padT}" width="${f1(gw)}" height="${fr.ih}" data-tip="${esc(tipHtml(tipLabels[i], series, i, format))}"/>`;
      if (fr.showLabel(i)) out += `<text class="xlab" x="${f1(gx + gw / 2)}" y="${h - 6}" text-anchor="middle">${esc(l)}</text>`;
      series.forEach((s, j) => {
        const v = s.values[i] || 0;
        const bh = fr.base - fr.y(v);
        if (bh <= 0) return;
        out += `<rect class="bar ${s.cls}" x="${f1(gx + (gw - inner) / 2 + j * bw + 1)}" y="${f1(fr.base - bh)}" width="${f1(Math.max(1, bw - 2))}" height="${f1(bh)}" rx="2"/>`;
      });
    });
    return svg(w, h, out);
  }

  /* ---------- Prstencový graf + legenda ----------
   * items: [{ label, sub?, value, cls }] */
  function donut({ items, size = 170, thickness = 24, format = UI.money }) {
    const total = items.reduce((a, b) => a + (b.value || 0), 0);
    const r = (size - thickness) / 2, c = size / 2, C = 2 * Math.PI * r;
    let out = `<circle class="donut-track" cx="${c}" cy="${c}" r="${r}" stroke-width="${thickness}"/>`;
    if (total > 0) {
      const gap = items.filter(i => i.value > 0).length > 1 ? 2 : 0;
      let off = 0;
      items.forEach(it => {
        if (!(it.value > 0)) return;
        const len = (it.value / total) * C;
        const pct = Math.round((it.value / total) * 100);
        const tip = `<div><i class="tip-dot ${it.cls}"></i>${esc(it.label)}: <b>${esc(format(it.value))}</b> (${pct} %)</div>`;
        out += `<circle class="seg ${it.cls}" cx="${c}" cy="${c}" r="${r}" stroke-width="${thickness}" stroke-dasharray="${f1(Math.max(0.5, len - gap))} ${f1(C)}" stroke-dashoffset="${f1(-off)}" transform="rotate(-90 ${c} ${c})" data-tip="${esc(tip)}"/>`;
        off += len;
      });
    }
    return `<svg class="donut-svg" viewBox="0 0 ${size} ${size}" aria-hidden="true">${out}</svg>`;
  }
  function donutBlock({ items, center, centerLabel, format = UI.money }) {
    const total = items.reduce((a, b) => a + (b.value || 0), 0);
    return `<div class="donut-wrap">
      <div class="donut">${donut({ items, format })}<div class="donut-center"><strong>${esc(center)}</strong><span>${esc(centerLabel)}</span></div></div>
      <ul class="legend">${items.map(it => `<li>
        <i class="legend-dot ${it.cls}"></i>
        <span class="legend-label">${esc(it.label)}${it.sub ? ` <span class="muted">${esc(it.sub)}</span>` : ''}</span>
        <span class="legend-val">${esc(format(it.value))}<small>${total ? Math.round((it.value / total) * 100) : 0} %</small></span>
      </li>`).join('')}</ul>
    </div>`;
  }

  /* ---------- Vodorovné pruhy (žebříček) ----------
   * items: [{ label, value, href?, cls? }] */
  function hbars(items, format = UI.money) {
    const max = Math.max(1, ...items.map(i => i.value));
    return `<div class="hbars">${items.map(it => {
      const tag = it.href ? 'a' : 'div';
      return `<${tag} class="hbar"${it.href ? ` href="${esc(it.href)}"` : ''}>
        <span class="hbar-label">${esc(it.label)}</span>
        <span class="hbar-track"><span class="${it.cls || 's-primary'}" style="width:${f1((it.value / max) * 100)}%"></span></span>
        <span class="hbar-val">${esc(format(it.value))}</span>
      </${tag}>`;
    }).join('')}</div>`;
  }

  const legend = series => `<div class="chart-legend">${series.map(s =>
    `<span><i class="legend-dot ${s.cls}${s.dashed ? ' dashed' : ''}"></i>${esc(s.name)}</span>`).join('')}</div>`;

  /* ---------- Bublina s hodnotou (myš: najetí, dotyk: klepnutí) ---------- */
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  document.body.appendChild(tip);
  let active = null;
  function showTip(el, x, y) {
    if (active && active !== el) active.classList.remove('on');
    active = el;
    el.classList.add('on');
    tip.innerHTML = el.dataset.tip;
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    const left = Math.min(window.innerWidth - r.width / 2 - 8, Math.max(r.width / 2 + 8, x));
    const top = Math.max(r.height + 16, y);
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  function hideTip() {
    tip.hidden = true;
    if (active) active.classList.remove('on');
    active = null;
  }
  document.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el) showTip(el, e.clientX, e.clientY); else if (active) hideTip();
  });
  document.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el) showTip(el, e.clientX, e.clientY); else hideTip();
  });
  window.addEventListener('scroll', () => { if (active) hideTip(); }, { passive: true });

  window.Charts = { mount, reset, line, bars, donut, donutBlock, hbars, legend, compact };
})();
