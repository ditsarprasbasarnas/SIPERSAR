/* ============================================================
   SIPERSAR — api.js  (fetch ke Google Apps Script REST API)
   POST wajib Content-Type text/plain agar tidak memicu CORS preflight.

   Optimasi UX instan (gas-instant-ux):
   - API.read   : stale-while-revalidate — data dari cache tampil 0 ms,
                  diperbarui diam-diam di latar belakang.
   - API.prefetch: banyak data dalam SATU permintaan (aksi "batch").
   - API.sync   : antrean penulisan latar belakang (optimistic UI).
   ============================================================ */
(function (global) {
  'use strict';
  const KEY = 'sipersar_token', UKEY = 'sipersar_user', CPFX = 'sipersar_c:';
  let pending = 0;
  function bar(on) {
    const el = document.getElementById('topProgress'); if (!el) return;
    pending += on ? 1 : -1;
    if (pending > 0) el.classList.add('on'); else { el.classList.remove('on'); el.style.width = '100%'; setTimeout(() => { el.style.width = ''; }, 300); }
  }

  /** Aksi baca yang hasilnya perlu diperbarui setelah aksi tulis tertentu berhasil. */
  const P = ['pendataanGet', 'dashboardOperator', 'pendataanRiwayat', 'dashboardAdmin', 'laporanData', 'riwayatList'];
  const AFFECT = {
    pendataanSimpanKategori: P, pendataanSetReview: P, pendataanSimpanKepala: P, pendataanKirim: P, pendataanSalin: P,
    kantorSimpan: ['kantorList', 'dashboardAdmin', 'laporanData', 'operatorList', 'riwayatList'],
    kantorImpor: ['kantorList', 'dashboardAdmin', 'laporanData', 'operatorList', 'riwayatList'],
    operatorSetAktif: ['operatorList', 'kantorList', 'riwayatList'], operatorResetPassword: ['operatorList', 'riwayatList'],
    templateSimpan: ['templateList', 'riwayatList'],
    periodeSimpan: ['periodeList', 'dashboardAdmin', 'dashboardOperator', 'pendataanGet', 'laporanData', 'pendataanRiwayat', 'riwayatList', 'me'],
    periodeSetStatus: ['periodeList', 'dashboardAdmin', 'dashboardOperator', 'pendataanGet', 'laporanData', 'pendataanRiwayat', 'riwayatList', 'me'],
    updateProfile: ['me', 'dashboardOperator'], changePassword: ['me']
  };

  const API = {
    getToken() { return localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || ''; },
    setToken(t, ingat) { this.clearToken(); (ingat ? localStorage : sessionStorage).setItem(KEY, t); },
    clearToken() { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); localStorage.removeItem(UKEY); sessionStorage.removeItem(UKEY); this.clearCache(); },
    configured() { const u = (global.SIPERSAR_CONFIG || {}).GAS_URL || ''; return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(u) && u.indexOf('GANTI_DENGAN') < 0; },

    /** Simpan identitas pengguna agar aplikasi bisa tampil instan saat dibuka ulang. */
    saveUser(u, periode) {
      const store = localStorage.getItem(KEY) ? localStorage : sessionStorage;
      try { store.setItem(UKEY, JSON.stringify({ user: u, periode, t: Date.now() })); } catch (e) { /* abaikan */ }
    },
    loadUser() { try { return JSON.parse(localStorage.getItem(UKEY) || sessionStorage.getItem(UKEY) || 'null'); } catch (e) { return null; } },

    /** Panggil aksi API. Mengembalikan objek {success, data, message, code, detail}. Tidak melempar error. */
    async call(action, data, opts) {
      opts = opts || {};
      if (!this.configured()) return { success: false, code: 'BELUM_KONFIGURASI', message: 'URL backend (GAS_URL) di js/config.js belum diisi.' };
      if (!opts.silent) bar(true);
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
        if (json.success && json.data && typeof RESP !== 'undefined') RESP.forEach(fn => { try { fn(action, json.data); } catch (e) { /* abaikan */ } });
        if (json.success && AFFECT[action]) setTimeout(() => API.refreshAffected(action), 0);
        if (!json.success && (json.code === 'SESI_HABIS') && !opts.noAuthRedirect && global.App) global.App.sessionExpired(json.message);
        if (!json.success && json.code === 'WAJIB_GANTI_PASSWORD' && global.App) global.App.go('#/ganti-password');
        return json;
      } catch (err) {
        return { success: false, code: 'JARINGAN', message: err.name === 'AbortError' ? 'Permintaan terlalu lama. Periksa koneksi lalu coba lagi.' : 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.' };
      } finally { clearTimeout(timer); if (!opts.silent) bar(false); }
    }
  };

  // ============================================================
  // CACHE BACA: stale-while-revalidate (memori + localStorage)
  // ============================================================
  const MEM = new Map(), INFLIGHT = new Map(), LAST = new Map(), LISTENERS = new Set(), HOLD = new Map(), RESP = new Set();
  const PERSIST_MAX = 1500000; // > 1,5 MB hanya disimpan di memori

  function clean(o) {
    if (!o || typeof o !== 'object') return o;
    const out = {}; Object.keys(o).sort().forEach(k => { const v = o[k]; if (v !== undefined && v !== null && v !== '') out[k] = v; });
    return out;
  }
  function uid() { const u = API.loadUser(); return u && u.user ? u.user.id_user : 'anon'; }
  function keyOf(action, data) { return action + '|' + JSON.stringify(clean(data || {})); }
  function lsKey(k) { return CPFX + uid() + ':' + k; }
  function getEntry(k) {
    if (MEM.has(k)) return MEM.get(k);
    try { const raw = localStorage.getItem(lsKey(k)); if (raw) { const e = JSON.parse(raw); MEM.set(k, e); return e; } } catch (e) { /* abaikan */ }
    return null;
  }
  function setEntry(k, d) {
    const e = { t: Date.now(), d, s: JSON.stringify(d) };
    MEM.set(k, e);
    if (e.s.length < PERSIST_MAX) { try { localStorage.setItem(lsKey(k), JSON.stringify({ t: e.t, d, s: e.s })); } catch (x) { pruneLS(); } }
    return e;
  }
  function pruneLS() { try { Object.keys(localStorage).filter(k => k.indexOf(CPFX) === 0).forEach(k => localStorage.removeItem(k)); } catch (e) { /* abaikan */ } }
  function emit(k) { LISTENERS.forEach(fn => { try { fn(k); } catch (e) { console.error(e); } }); }

  async function fetchFresh(k, action, data, silent) {
    if (INFLIGHT.has(k)) return INFLIGHT.get(k);
    LAST.set(k, Date.now());
    const p = API.call(action, data, { silent, noAuthRedirect: silent }).then(r => {
      INFLIGHT.delete(k);
      if (r.success) RESP.forEach(fn => { try { fn(action, r.data); } catch (e) { /* abaikan */ } });
      if (r.success && !HOLD.get(k)) {
        const old = MEM.get(k), s = JSON.stringify(r.data);
        if (!old || old.s !== s) { setEntry(k, r.data); if (old) emit(k); }
        else { old.t = Date.now(); }
      } else if (r.code === 'SESI_HABIS' && global.App) global.App.sessionExpired(r.message);
      return r;
    });
    INFLIGHT.set(k, p);
    return p;
  }

  /**
   * Baca data dengan cache. Bila ada di cache → kembali seketika & diperbarui di latar.
   * opts.fresh: umur (ms) yang dianggap masih segar (default 0 = selalu cek latar, maks 1x/4 dtk).
   */
  API.read = async function (action, data, opts) {
    opts = opts || {};
    const k = keyOf(action, data);
    if (global.App && global.App.useKey) global.App.useKey(k);
    const e = getEntry(k);
    if (e && !opts.force) {
      const age = Date.now() - e.t, last = LAST.get(k) || 0;
      if (age > (opts.fresh || 0) && Date.now() - last > 4000) fetchFresh(k, action, data, true);
      return { success: true, data: e.d, cached: true };
    }
    return fetchFresh(k, action, data, false);
  };
  /** Tulis langsung ke cache (optimistic / hasil simpan). emit=true → halaman aktif diperbarui. */
  API.put = function (action, data, value, emit) { const k = keyOf(action, data); setEntry(k, value); if (emit) emit_(k); };
  /** Tahan kunci: hasil sinkron latar tidak menimpa data optimistis selama penulisan masih antre. */
  API.hold = function (action, data, on) { const k = keyOf(action, data); const n = (HOLD.get(k) || 0) + (on ? 1 : -1); if (n > 0) HOLD.set(k, n); else HOLD.delete(k); return n; };
  /** Tulis value ke semua entri cache aksi tertentu yang cocok predikat (kecuali yang sedang ditahan). */
  API.putMatching = function (action, pred, value) {
    MEM.forEach((e, k) => {
      if (k.indexOf(action + '|') !== 0 || HOLD.get(k)) return;
      let ok = false; try { ok = pred(e.d); } catch (x) { ok = false; }
      if (ok && e.s !== JSON.stringify(value)) { setEntry(k, value); emit(k); }
    });
  };
  /** Dengarkan setiap respons sukses dari server (mis. untuk melacak versi data). */
  API.onResponse = function (fn) { RESP.add(fn); };
  function emit_(k) { emit(k); }
  API.peek = function (action, data) { const e = getEntry(keyOf(action, data)); return e ? e.d : null; };
  API.keyOf = keyOf;
  API.onUpdate = function (fn) { LISTENERS.add(fn); return () => LISTENERS.delete(fn); };
  API.clearCache = function () { MEM.clear(); INFLIGHT.clear(); LAST.clear(); pruneLS(); };

  /** Ambil banyak data sekaligus dalam 1 permintaan (aksi batch di server). */
  API.prefetch = async function (calls, opts) {
    opts = opts || {};
    calls = calls.filter(c => opts.force || !getEntry(keyOf(c.action, c.data)) || Date.now() - (LAST.get(keyOf(c.action, c.data)) || 0) > 4000);
    if (!calls.length || !API.getToken()) return;
    calls.forEach(c => LAST.set(keyOf(c.action, c.data), Date.now()));
    const r = await API.call('batch', { calls: calls.slice(0, 15) }, { silent: true, noAuthRedirect: true });
    if (!r.success || !Array.isArray(r.data)) return;
    r.data.forEach((res, i) => {
      if (!res || !res.success) return;
      RESP.forEach(fn => { try { fn(calls[i].action, res.data); } catch (e) { /* abaikan */ } });
      if (HOLD.get(keyOf(calls[i].action, calls[i].data))) return;
      const c = calls[i], k = keyOf(c.action, c.data), old = MEM.get(k) || getEntry(k), s = JSON.stringify(res.data);
      if (!old || old.s !== s) { setEntry(k, res.data); if (old) emit(k); }
      if (c.action === 'templateGet') API.storeTemplate(res.data);
    });
  };

  /** Simpan hasil bootstrap login ke cache (tanpa permintaan tambahan). */
  API.seed = function (boot) {
    if (!boot || !Array.isArray(boot.calls) || !Array.isArray(boot.results)) return;
    boot.calls.forEach((c, i) => {
      const res = boot.results[i]; if (!res || !res.success) return;
      if (c.action === 'templateGet') API.storeTemplate(res.data);
      else { const k = keyOf(c.action, c.data); setEntry(k, res.data); LAST.set(k, Date.now()); }
    });
  };
  API.templateIds = function () { try { return Object.keys(localStorage).filter(k => k.indexOf('sipersar_tpl_v2_') === 0).map(k => k.substring(16)); } catch (e) { return []; } };

  /** Setelah aksi tulis: perbarui seluruh data terdampak yang ada di cache dalam 1 permintaan batch. */
  API.refreshAffected = function (action) {
    const acts = AFFECT[action]; if (!acts) return;
    const calls = [];
    MEM.forEach((e, k) => {
      const a = k.substring(0, k.indexOf('|'));
      if (acts.indexOf(a) >= 0) { e.t = 0; LAST.delete(k); calls.push({ action: a, data: JSON.parse(k.substring(k.indexOf('|') + 1)) }); }
    });
    if (calls.length) API.prefetch(calls.slice(0, 15), { force: true });
  };

  // ============================================================
  // ANTREAN SINKRONISASI LATAR BELAKANG (optimistic UI)
  // ============================================================
  const SYNC_L = new Set();
  const Sync = {
    chain: Promise.resolve(), pending: 0, failed: 0, lastOk: 0,
    /** Tambahkan pekerjaan tulis; dieksekusi berurutan. fn mengembalikan Promise hasil API. */
    push(fn) {
      this.pending++; this.notify();
      const p = this.chain.then(fn).catch(e => ({ success: false, message: e && e.message ? e.message : String(e) })).then(r => {
        this.pending--; if (r && r.success) this.lastOk = Date.now(); else this.failed++;
        this.notify(); return r;
      });
      this.chain = p;
      return p;
    },
    on(fn) { SYNC_L.add(fn); return () => SYNC_L.delete(fn); },
    notify() { SYNC_L.forEach(fn => { try { fn(this); } catch (e) { /* abaikan */ } }); }
  };
  API.sync = Sync;

  /** Cache template di localStorage (template per id tidak pernah berubah). */
  const TEMPLATE_MEM = {}, TEMPLATE_INFLIGHT = {};
  API.storeTemplate = function (raw) {
    if (!raw || !raw.template) return;
    const id = raw.template.id_template;
    if (!TEMPLATE_MEM[id]) TEMPLATE_MEM[id] = Template.index(JSON.parse(JSON.stringify(raw)));
    try { localStorage.setItem('sipersar_tpl_v2_' + id, JSON.stringify(raw)); } catch (e) { /* kuota penuh: abaikan */ }
  };
  API.hasTemplate = function (id) { return !!TEMPLATE_MEM[id] || !!localStorage.getItem('sipersar_tpl_v2_' + id); };
  API.template = async function (idTemplate) {
    if (TEMPLATE_MEM[idTemplate]) return TEMPLATE_MEM[idTemplate];
    try { const c = localStorage.getItem('sipersar_tpl_v2_' + idTemplate); if (c) { TEMPLATE_MEM[idTemplate] = Template.index(JSON.parse(c)); return TEMPLATE_MEM[idTemplate]; } } catch (e) { /* abaikan */ }
    if (!TEMPLATE_INFLIGHT[idTemplate]) TEMPLATE_INFLIGHT[idTemplate] = API.call('templateGet', { id_template: idTemplate });
    const r = await TEMPLATE_INFLIGHT[idTemplate];
    delete TEMPLATE_INFLIGHT[idTemplate];
    if (!r.success) throw new Error(r.message);
    API.storeTemplate(r.data);
    return TEMPLATE_MEM[idTemplate];
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
        k.baris = raw.items.find(it => it.kode_item === k.kode_kategori);
      });
      return t;
    },
    /** label nomor sesuai master: penanda kolom B/C */
    nomor(it) { return it.penanda ? String(it.penanda).trim() : ''; },
    pathOf(t, it) { const out = []; let p = t.byKode[it.kode_induk]; while (p) { out.unshift(p); p = t.byKode[p.kode_induk]; } return out; }
  };

  global.API = API;
  global.Template = Template;
})(window);
