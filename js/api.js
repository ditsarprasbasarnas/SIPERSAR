/* ============================================================
   SIPERSAR — api.js  (fetch ke Google Apps Script REST API)
   POST wajib Content-Type text/plain agar tidak memicu CORS preflight.
   ============================================================ */
(function (global) {
  'use strict';
  const KEY = 'sipersar_token';
  let pending = 0;
  function bar(on) {
    const el = document.getElementById('topProgress'); if (!el) return;
    pending += on ? 1 : -1;
    if (pending > 0) el.classList.add('on'); else { el.classList.remove('on'); el.style.width = '100%'; setTimeout(() => { el.style.width = ''; }, 300); }
  }
  const API = {
    getToken() { return localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || ''; },
    setToken(t, ingat) { this.clearToken(); (ingat ? localStorage : sessionStorage).setItem(KEY, t); },
    clearToken() { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); },
    configured() { const u = (global.SIPERSAR_CONFIG || {}).GAS_URL || ''; return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(u) && u.indexOf('GANTI_DENGAN') < 0; },
    /** Panggil aksi API. Mengembalikan objek {success, data, message, code, detail}. Tidak melempar error. */
    async call(action, data, opts) {
      opts = opts || {};
      if (!this.configured()) return { success: false, code: 'BELUM_KONFIGURASI', message: 'URL backend (GAS_URL) di js/config.js belum diisi.' };
      bar(true);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeout || 90000);
      try {
        const res = await fetch(global.SIPERSAR_CONFIG.GAS_URL, {
          method: 'POST', redirect: 'follow', signal: ctrl.signal,
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action, token: this.getToken(), data: data || {} })
        });
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); } catch (e) {
          return { success: false, code: 'RESPON_INVALID', message: 'Respon server tidak valid. Pastikan Web App di-deploy dengan akses "Anyone" dan URL /exec benar.' };
        }
        if (json.success && /Simpan|Kirim|SetReview|SetStatus|Salin|Impor/.test(action) && global.Laporan) global.Laporan.clear();
        if (!json.success && (json.code === 'SESI_HABIS') && !opts.noAuthRedirect && global.App) global.App.sessionExpired(json.message);
        if (!json.success && json.code === 'WAJIB_GANTI_PASSWORD' && global.App) global.App.go('#/ganti-password');
        return json;
      } catch (err) {
        return { success: false, code: 'JARINGAN', message: err.name === 'AbortError' ? 'Permintaan terlalu lama. Periksa koneksi lalu coba lagi.' : 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.' };
      } finally { clearTimeout(timer); bar(false); }
    }
  };

  /** Cache template di localStorage (template per id tidak pernah berubah). */
  const TEMPLATE_MEM = {};
  API.template = async function (idTemplate) {
    if (TEMPLATE_MEM[idTemplate]) return TEMPLATE_MEM[idTemplate];
    const k = 'sipersar_tpl_v2_' + idTemplate;
    try { const c = localStorage.getItem(k); if (c) { TEMPLATE_MEM[idTemplate] = JSON.parse(c); return TEMPLATE_MEM[idTemplate]; } } catch (e) { /* abaikan */ }
    const r = await API.call('templateGet', { id_template: idTemplate });
    if (!r.success) throw new Error(r.message);
    const t = Template.index(r.data);
    TEMPLATE_MEM[idTemplate] = t;
    try { localStorage.setItem(k, JSON.stringify(r.data)); } catch (e) { /* kuota penuh: abaikan */ }
    return t;
  };

  /** Utilitas struktur template */
  const Template = {
    index(raw) {
      if (raw._indexed) return raw;
      const t = { _indexed: true, template: raw.template, items: raw.items, kategori: raw.kategori, byKode: {}, children: {} };
      raw.items.forEach(it => { t.byKode[it.kode_item] = it; (t.children[it.kode_induk] = t.children[it.kode_induk] || []).push(it); });
      t.kategori.forEach(k => {
        k.rows = raw.items.filter(it => it.kode_kategori === k.kode_kategori && it.kode_item !== k.kode_kategori ||
          (it.kode_item === k.kode_kategori && it.jenis_baris === 'ITEM'));
        k.itemKodes = k.rows.filter(r => r.dapat_diisi).map(r => r.kode_item);
        const baris = raw.items.find(it => it.kode_item === k.kode_kategori);
        k.baris = baris;
      });
      return t;
    },
    /** label nomor sesuai master: penanda kolom B/C, atau prefix kolom D */
    nomor(it) { return it.penanda ? String(it.penanda).trim() : ''; },
    pathOf(t, it) { const out = []; let p = t.byKode[it.kode_induk]; while (p) { out.unshift(p); p = t.byKode[p.kode_induk]; } return out; }
  };
  // jika JSON dari localStorage (belum diindeks)
  const _orig = API.template;
  API.template = async function (id) { const t = await _orig(id); if (!t._indexed) { TEMPLATE_MEM[id] = Template.index(t); return TEMPLATE_MEM[id]; } return t; };

  global.API = API;
  global.Template = Template;
})(window);
