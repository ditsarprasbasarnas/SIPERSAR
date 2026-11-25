/* ============================================================
   SIPERSAR — ui.js  (utilitas tampilan, ikon, modal, toast, format)
   ============================================================ */
(function (global) {
  'use strict';
  const ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/>',
    send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    usercircle: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M6.2 18.5a7 7 0 0 1 11.6 0"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    chart: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
    down: '<path d="m6 9 6 6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>', left: '<path d="m15 18-6-6 6-6"/>', up: '<path d="m18 15-6-6-6 6"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M9.9 4.2A10 10 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.5 8 10 8a10 10 0 0 0 5.4-1.6"/><path d="m2 2 20 20"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checkc: '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
    circle: '<circle cx="12" cy="12" r="9"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    shieldok: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    refresh: '<path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    sheet: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8M12 11v8"/>',
    arrowr: '<path d="M5 12h14M12 5l7 7-7 7"/>', arrowl: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    trash: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4h6v2"/>',
    package: '<path d="M16.5 9.4 7.5 4.2M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>',
    filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
    toggle: '<rect x="1" y="5" width="22" height="14" rx="7"/><circle cx="16" cy="12" r="3"/>',
    power: '<path d="M18.4 6.6a9 9 0 1 1-12.8 0M12 2v10"/>',
    truck: '<path d="M1 3h15v13H1zM16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    ship: '<path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M19.4 19 21 13l-9-4-9 4 1.6 6M12 9V2M8 5h8"/>',
    plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
    backpack: '<path d="M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M9 6V4a3 3 0 0 1 6 0v2M8 21v-5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v5"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1zM12 15l-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>'
  };
  function icon(name, cls) { return '<svg class="svg-i ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || ICONS.info) + '</svg>'; }
  const brandMark = '<svg class="svg-i" viewBox="0 0 24 24" style="width:20px;height:20px"><path d="M12 2.5l8 3v6.2c0 5.1-3.4 9-8 10.8-4.6-1.8-8-5.7-8-10.8V5.5z" stroke-width="2.2"/><path d="M12 8v7M8.5 11.5h7" stroke-width="2.2"/></svg>';

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const BULAN_P = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  function parseDate(iso) { if (!iso) return null; const d = new Date(iso); return isNaN(d) ? null : d; }
  function wib(d) { return new Date(d.getTime() + (d.getTimezoneOffset() + 420) * 60000); }
  const fmt = {
    num(n) { if (n === '' || n === null || n === undefined || isNaN(n)) return '–'; return Number(n).toLocaleString('id-ID'); },
    date(iso, panjang) { const d0 = parseDate(iso); if (!d0) return '–'; const d = wib(d0); return d.getDate() + ' ' + (panjang ? BULAN_P : BULAN)[d.getMonth()] + ' ' + d.getFullYear(); },
    dateOnly(s) { if (!s) return '–'; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (!m) return s; return Number(m[3]) + ' ' + BULAN_P[Number(m[2]) - 1] + ' ' + m[1]; },
    dt(iso) {
      const d0 = parseDate(iso); if (!d0) return '–'; const d = wib(d0);
      const hhmm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      const now = wib(new Date());
      if (d.toDateString() === now.toDateString()) return 'Hari ini, ' + hhmm + ' WIB';
      return d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear() + ', ' + hhmm + ' WIB';
    },
    sisaHari(ymd) {
      if (!ymd) return null; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd); if (!m) return null;
      const target = Date.UTC(+m[1], +m[2] - 1, +m[3]); const n = wib(new Date());
      const today = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
      return Math.round((target - today) / 86400000);
    },
    initials(n) { return String(n || '?').replace(/[,.].*$/, '').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase() || '?'; }
  };

  const STATUS = {
    DRAFT: ['b-draft', 'Draft'], DIKIRIM: ['b-kirim', 'Dikirim'], BELUM: ['b-belum', 'Belum Mengisi'],
    DIBUKA: ['b-buka', 'Dibuka'], DITUTUP: ['b-tutup', 'Ditutup'], REVIEW: ['b-review', 'Belum Ditinjau'], SELESAI: ['b-kirim', 'Selesai Ditinjau'],
    AKTIF: ['b-kirim', 'Aktif'], NONAKTIF: ['b-tutup', 'Nonaktif'], BELUMBUKA: ['b-belum', 'Belum Dibuka']
  };
  function badge(status, label) { const s = STATUS[status] || ['b-belum', status]; return '<span class="badge ' + s[0] + '">' + esc(label || s[1]) + '</span>'; }
  function progress(pct, cls) { pct = Math.max(0, Math.min(100, pct || 0)); return '<div class="progress ' + (cls || '') + '"><i style="width:' + pct + '%"></i></div>'; }

  function toast(msg, type, ms) {
    const box = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + (type || 'success');
    const ic = { success: 'checkc', error: 'alert', warn: 'alert', info: 'info' }[type || 'success'];
    el.innerHTML = icon(ic) + '<div style="flex:1">' + esc(msg) + '</div><button class="t-x" aria-label="Tutup">' + icon('x', 'sm') + '</button>';
    el.querySelector('.t-x').onclick = () => el.remove();
    box.appendChild(el);
    setTimeout(() => el.remove(), ms || (type === 'error' ? 8000 : 4500));
  }

  /** Modal generik. opts: {title, sub, icon, iconCls, body, size, buttons:[{label, cls, onClick, close, id}], onOpen, dismiss} */
  function modal(opts) {
    const root = document.getElementById('modalRoot');
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = '<div class="modal ' + (opts.size || '') + '" role="dialog" aria-modal="true">' +
      '<div class="modal-head">' + (opts.icon ? '<div class="ico-box ' + (opts.iconCls || 'orange') + '">' + icon(opts.icon) + '</div>' : '') +
      '<div style="min-width:0"><h3>' + esc(opts.title) + '</h3>' + (opts.sub ? '<p>' + esc(opts.sub) + '</p>' : '') + '</div>' +
      '<button class="btn btn-text btn-icon close" aria-label="Tutup">' + icon('x') + '</button></div>' +
      '<div class="modal-body">' + (opts.body || '') + '</div>' +
      (opts.buttons && opts.buttons.length ? '<div class="modal-foot"></div>' : '') + '</div>';
    const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); if (opts.onClose) opts.onClose(); };
    const onKey = e => { if (e.key === 'Escape' && opts.dismiss !== false) close(); };
    document.addEventListener('keydown', onKey);
    bg.querySelector('.close').onclick = close;
    if (opts.dismiss !== false) bg.addEventListener('mousedown', e => { if (e.target === bg) close(); });
    const foot = bg.querySelector('.modal-foot');
    (opts.buttons || []).forEach(b => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (b.cls || 'btn-ghost');
      btn.innerHTML = (b.icon ? icon(b.icon, 'sm') : '') + esc(b.label);
      if (b.id) btn.id = b.id;
      btn.onclick = async () => {
        if (b.onClick) { const r = await b.onClick(btn, close); if (r === false) return; }
        if (b.close !== false) close();
      };
      foot.appendChild(btn);
    });
    root.appendChild(bg);
    const first = bg.querySelector('input,select,textarea');
    if (first) setTimeout(() => first.focus(), 50);
    if (opts.onOpen) opts.onOpen(bg.querySelector('.modal'), close);
    return { el: bg.querySelector('.modal'), close };
  }

  function confirmDialog(opts) {
    return new Promise(resolve => {
      let done = false;
      modal({
        title: opts.title, sub: opts.sub, icon: opts.icon || 'alert', iconCls: opts.iconCls || 'orange', body: opts.body || '', size: opts.size,
        onClose: () => { if (!done) resolve(false); },
        buttons: [{ label: opts.cancel || 'Batal' }, { label: opts.ok || 'Ya, Lanjutkan', cls: opts.okCls || 'btn-primary', icon: opts.okIcon, onClick: () => { done = true; resolve(true); } }]
      });
    });
  }

  function busy(btn, on, text) {
    if (!btn) return;
    if (on) { btn.dataset.html = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner sm"></span>' + esc(text || 'Memproses…'); }
    else { btn.disabled = false; if (btn.dataset.html) btn.innerHTML = btn.dataset.html; }
  }
  function debounce(fn, ms) { let t; return function () { clearTimeout(t); const a = arguments; t = setTimeout(() => fn.apply(this, a), ms || 250); }; }
  /** Kerangka (skeleton) — hanya muncul saat data belum pernah dimuat sama sekali. */
  function loading(text) {
    return '<div class="skel-page" aria-busy="true"><div class="skeleton" style="height:14px;width:180px"></div><div class="skeleton" style="height:30px;width:min(520px,80%);margin:10px 0 22px"></div>' +
      '<div class="grid g3" style="margin-bottom:16px"><div class="skeleton" style="height:110px"></div><div class="skeleton" style="height:110px"></div><div class="skeleton" style="height:110px"></div></div>' +
      '<div class="skeleton" style="height:320px"></div><div class="small muted" style="margin-top:10px;display:flex;gap:8px;align-items:center"><span class="spinner sm"></span>' + esc(text || 'Memuat data…') + '</div></div>';
  }
  function emptyState(text, ic) { return '<div class="empty">' + icon(ic || 'package') + '<div>' + esc(text) + '</div></div>'; }
  function fieldErrors(form, detail) {
    $$('.field-err', form).forEach(e => e.textContent = '');
    $$('.invalid', form).forEach(e => e.classList.remove('invalid'));
    if (!detail) return;
    Object.keys(detail).forEach(k => {
      const inp = form.querySelector('[name="' + k + '"]'); if (!inp) return;
      inp.classList.add('invalid');
      const err = inp.closest('.field') && inp.closest('.field').querySelector('.field-err');
      if (err) err.textContent = Array.isArray(detail[k]) ? detail[k].join(' ') : detail[k];
    });
  }
  function formData(form) { const o = {}; new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; }); return o; }
  function pwToggle(root) {
    $$('[data-pw]', root).forEach(b => b.onclick = () => {
      const inp = b.parentElement.querySelector('input'); const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password'; b.innerHTML = icon(show ? 'eyeoff' : 'eye');
    });
  }
  function pwStrength(pw) {
    const r = { len: pw.length >= 8, case: /[a-z]/.test(pw) && /[A-Z]/.test(pw), digit: /\d/.test(pw), sym: /[^A-Za-z0-9]/.test(pw) };
    return { rules: r, score: Object.values(r).filter(Boolean).length };
  }
  function copyText(t) { if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast('Disalin ke papan klip.', 'info')); }

  global.UI = { icon, brandMark, esc, $, $$, fmt, badge, progress, toast, modal, confirmDialog, busy, debounce, loading, emptyState, fieldErrors, formData, pwToggle, pwStrength, copyText };
})(window);
