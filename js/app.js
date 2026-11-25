/* ============================================================
   SIPERSAR — app.js  (router SPA, kerangka tata letak, autentikasi, profil)
   ============================================================ */
(function (global) {
  'use strict';
  const { icon, esc, $, $$, fmt, toast, busy, fieldErrors, formData, pwToggle, pwStrength, brandMark } = UI;

  const App = {
    user: null, periode: null, routes: [], current: null, guard: null, lastHash: '',
    renderKeys: new Set(), interacted: false, renderSeq: 0, pendingUpdate: false,

    route(pattern, handler, opts) { this.routes.push({ re: new RegExp('^' + pattern.replace(/:(\w+)/g, '([^/]+)') + '$'), handler, opts: opts || {} }); },
    go(hash) { if (location.hash === hash) this.render(); else location.hash = hash; },
    /** Dipanggil API.read: mencatat data yang dipakai halaman aktif. */
    useKey(k) { this.renderKeys.add(k); },

    async start() {
      if (!API.configured()) return this.renderSetupNotice();
      window.addEventListener('hashchange', () => this.onHash());
      window.addEventListener('beforeunload', e => {
        if ((this.guard && this.guard()) || API.sync.pending > 0) { e.preventDefault(); e.returnValue = ''; }
      });
      // data baru dari latar belakang → perbarui halaman aktif secara senyap
      API.onUpdate(k => this.onDataUpdate(k));
      API.sync.on(s => this.paintSync(s));
      // interaksi pengguna di halaman → jangan render ulang otomatis
      ['input', 'change', 'click'].forEach(ev => document.addEventListener(ev, e => {
        const c = document.getElementById('content');
        if (c && c.contains(e.target) && !(ev === 'click' && e.target.closest('a[href^="#"]'))) this.interacted = true;
      }, true));
      // prefetch saat kursor/sentuhan berada di menu (sebelum diklik)
      ['mouseover', 'touchstart'].forEach(ev => document.addEventListener(ev, e => {
        const a = e.target.closest && e.target.closest('.nav a[href^="#"], a[data-prefetch]');
        if (a) this.prefetchHash(a.getAttribute('href'));
      }, { passive: true }));

      if (API.getToken()) {
        const cached = API.loadUser();
        if (cached && cached.user && cached.user.id_user) {
          // ✅ Boot instan: tampilkan dari identitas tersimpan, verifikasi sesi di latar
          this.user = cached.user; this.periode = cached.periode;
          this.verifySession();
        } else {
          const r = await API.call('me', {}, { noAuthRedirect: true });
          if (r.success) { this.setMe(r.data); }
          else if (r.code === 'WAJIB_GANTI_PASSWORD') { this.user = { wajib_ganti_password: true }; }
          else if (r.code === 'JARINGAN') { this.hideBoot(); $('#root').innerHTML = this.errorPage(r.message); return; }
          else API.clearToken();
        }
      }
      this.hideBoot();
      this.lastHash = location.hash;
      this.render();
      if (this.user && this.user.role) this.prefetchRole();
    },
    hideBoot() { const b = $('#boot'); if (b) b.remove(); },

    setMe(d) {
      this.user = d.user; this.periode = d.periode_aktif || null;
      API.saveUser(this.user, this.periode);
    },
    async verifySession() {
      const r = await API.call('me', {}, { noAuthRedirect: true, silent: true });
      if (r.success) {
        const before = JSON.stringify([this.user, this.periode]);
        this.setMe(r.data);
        if (before !== JSON.stringify([this.user, this.periode]) && this.user.role) this.refreshChrome();
      } else if (r.code === 'SESI_HABIS') this.sessionExpired(r.message);
      else if (r.code === 'WAJIB_GANTI_PASSWORD') { this.user.wajib_ganti_password = true; this.go('#/ganti-password'); }
    },

    /** Prefetch data utama per peran dalam SATU permintaan batch (Prinsip 4). */
    prefetchRole() {
      if (!this.user || !this.user.role) return;
      const calls = this.user.role === 'ADMIN'
        ? [{ action: 'dashboardAdmin', data: {} }, { action: 'kantorList', data: {} }, { action: 'periodeList', data: {} }, { action: 'templateList', data: {} },
          { action: 'operatorList', data: {} }, { action: 'laporanData', data: {} }]
        : [{ action: 'dashboardOperator', data: {} }, { action: 'pendataanGet', data: {} }, { action: 'pendataanRiwayat', data: {} }];
      if (this.periode && this.periode.id_template && !API.hasTemplate(this.periode.id_template)) calls.push({ action: 'templateGet', data: { id_template: this.periode.id_template } });
      API.prefetch(calls).then(() => {
        // template periode default (bila tidak ada periode DIBUKA)
        const d = API.peek(this.user.role === 'ADMIN' ? 'dashboardAdmin' : 'dashboardOperator', {});
        const idt = d && d.periode && d.periode.id_template;
        if (idt && !API.hasTemplate(idt)) API.template(idt).catch(() => {});
      });
    },
    /** Prefetch data halaman tujuan saat menu disorot. */
    prefetchHash(href) {
      if (!this.user || !this.user.role || !href) return;
      const map = {
        '#/dashboard': [['dashboardOperator', {}]], '#/pendataan': [['pendataanGet', {}]], '#/kirim': [['pendataanGet', {}]], '#/riwayat': [['pendataanRiwayat', {}]],
        '#/admin': [['dashboardAdmin', {}], ['periodeList', {}]], '#/admin/kantor': [['kantorList', {}]], '#/admin/akun': [['operatorList', {}]],
        '#/admin/template': [['templateList', {}]], '#/admin/periode': [['periodeList', {}], ['templateList', {}]],
        '#/admin/laporan/nasional': [['laporanData', {}], ['periodeList', {}]], '#/admin/laporan/peralatan': [['laporanData', {}], ['periodeList', {}]],
        '#/admin/laporan/kantor': [['laporanData', {}], ['periodeList', {}]]
      };
      const c = map[href.split('?')[0]];
      if (c) API.prefetch(c.map(x => ({ action: x[0], data: x[1] })));
    },

    async onHash() {
      if (this.guard && this.guard() && location.hash !== this.lastHash) {
        const ok = await UI.confirmDialog({ title: 'Perubahan belum disimpan', sub: 'Isian pada kategori ini belum disimpan.', body: '<p>Jika Anda meninggalkan halaman ini, perubahan yang belum disimpan akan hilang (draf tetap tersimpan di perangkat ini).</p>', ok: 'Tinggalkan Halaman', okCls: 'btn-danger' });
        if (!ok) { history.replaceState(null, '', this.lastHash || '#/'); return; }
      }
      this.guard = null;
      this.lastHash = location.hash;
      this.render();
    },

    homeHash() { return !this.user ? '#/login' : this.user.wajib_ganti_password ? '#/ganti-password' : this.user.role === 'ADMIN' ? '#/admin' : '#/dashboard'; },

    /** Render rute aktif. silent=true: render ulang karena data baru (posisi gulir dipertahankan). */
    async render(silent) {
      document.body.classList.remove('nav-open');
      const hash = location.hash || '';
      const full = hash.replace(/^#/, '') || '/';
      const qi = full.indexOf('?');
      const path = qi >= 0 ? full.substring(0, qi) : full;
      this.query = new URLSearchParams(qi >= 0 ? full.substring(qi + 1) : '');
      if (path === '/' || path === '') return this.go(this.homeHash());
      for (const r of this.routes) {
        const m = r.re.exec(path);
        if (!m) continue;
        const o = r.opts;
        if (o.public) { if (this.user && !this.user.wajib_ganti_password && o.guestOnly) return this.go(this.homeHash()); }
        else {
          if (!this.user) return this.go('#/login');
          if (this.user.wajib_ganti_password && path !== '/ganti-password') return this.go('#/ganti-password');
          if (o.role && o.role !== this.user.role) return this.go(this.homeHash());
        }
        this.current = path;
        const y = window.scrollY, seq = ++this.renderSeq;
        this.renderKeys = new Set(); this.interacted = false; this.pendingUpdate = false;
        const keep = silent ? this.captureState() : null;
        if (!silent) window.scrollTo(0, 0);
        try { await r.handler.apply(this, m.slice(1).map(decodeURIComponent)); }
        catch (err) { console.error(err); const c = $('#content'); (c || $('#root')).innerHTML = this.errorPage(err.message); }
        if (silent && seq === this.renderSeq) { this.restoreState(keep); window.scrollTo(0, y); }
        return;
      }
      this.go(this.homeHash());
    },

    /** Simpan nilai filter/pencarian & pilihan tab agar tidak hilang saat render ulang senyap. */
    captureState() {
      const c = $('#content'); if (!c) return null;
      const st = { v: {}, seg: {} };
      $$('input[id],select[id],textarea[id]', c).forEach(el => { if (el.type !== 'file' && !el.closest('.modal')) st.v[el.id] = el.type === 'checkbox' ? el.checked : el.value; });
      $$('.seg[id]', c).forEach(sg => { const on = sg.querySelector('button.on'); if (on) st.seg[sg.id] = Array.from(sg.children).indexOf(on); });
      return st;
    },
    restoreState(st) {
      if (!st) return;
      Object.keys(st.v).forEach(id => {
        const el = document.getElementById(id); if (!el) return;
        const cur = el.type === 'checkbox' ? el.checked : el.value;
        if (cur === st.v[id]) return;
        if (el.type === 'checkbox') el.checked = st.v[id]; else el.value = st.v[id];
        el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      });
      Object.keys(st.seg).forEach(id => { const sg = document.getElementById(id); const b = sg && sg.children[st.seg[id]]; if (b && !b.classList.contains('on')) b.click(); });
    },

    /** Data di cache berubah (hasil sinkron latar). */
    onDataUpdate(k) {
      if (!this.renderKeys.has(k) || !this.user) return;
      const ae = document.activeElement, mengetik = ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && $('#content') && $('#content').contains(ae);
      if (mengetik || (this.guard && this.guard()) || document.querySelector('.modal-bg')) { this.showUpdateChip(); return; }
      clearTimeout(this._upd);
      this._upd = setTimeout(() => this.render(true), 60);
    },
    showUpdateChip() {
      if (this.pendingUpdate) return;
      this.pendingUpdate = true;
      const el = document.createElement('button');
      el.className = 'update-chip';
      el.innerHTML = icon('refresh', 'sm') + 'Data terbaru tersedia · Perbarui tampilan';
      el.onclick = () => { el.remove(); if (this.guard && this.guard()) return toast('Simpan atau batalkan isian terlebih dahulu.', 'warn'); this.render(true); };
      document.body.appendChild(el);
      const rm = () => el.remove();
      window.addEventListener('hashchange', rm, { once: true });
    },
    /** Indikator antrean sinkronisasi di topbar. */
    paintSync(s) {
      const el = document.getElementById('syncChip'); if (!el) return;
      clearTimeout(this._syncT);
      if (s.pending > 0) { el.className = 'chip sync on'; el.innerHTML = '<span class="spinner sm"></span>Menyinkronkan ' + s.pending + ' perubahan…'; }
      else if (Date.now() - s.lastOk < 2500) {
        el.className = 'chip sync ok'; el.innerHTML = icon('check', 'sm') + 'Tersimpan';
        // timer hanya menyembunyikan label "Tersimpan"; bila ada antrean baru, status dihitung ulang
        this._syncT = setTimeout(() => this.paintSync(API.sync), 2600);
      } else { el.className = 'chip sync'; el.innerHTML = ''; }
    },

    sessionExpired(msg) {
      if (!this.user) return;
      this.user = null; this.guard = null; API.clearToken();
      toast(msg || 'Sesi berakhir. Silakan masuk kembali.', 'warn');
      this.go('#/login');
    },

    async logout() {
      if (this.guard && this.guard()) { const ok = await UI.confirmDialog({ title: 'Keluar dari sistem?', body: '<p>Ada perubahan yang belum disimpan dan akan hilang.</p>', ok: 'Keluar', okCls: 'btn-danger' }); if (!ok) return; }
      if (API.sync.pending > 0) { toast('Tunggu sebentar, ' + API.sync.pending + ' perubahan sedang disinkronkan…', 'warn'); await API.sync.chain; }
      this.guard = null;
      API.call('logout', {}, { noAuthRedirect: true, silent: true });
      API.clearToken(); this.user = null; this.periode = null;
      this.go('#/login');
    },

    errorPage(msg) {
      return '<div class="auth-page"><div class="auth-card" style="text-align:center"><div class="mark orange">' + icon('alert', 'lg') + '</div><h2>Terjadi kendala</h2><p class="muted">' + esc(msg) + '</p><button class="btn btn-navy" onclick="location.reload()">' + icon('refresh', 'sm') + 'Muat Ulang</button></div></div>';
    },
    renderSetupNotice() {
      this.hideBoot();
      $('#root').innerHTML = '<div class="auth-page"><div class="auth-card"><div class="mark orange">' + icon('alert', 'lg') + '</div><h2 style="text-align:center">Konfigurasi belum lengkap</h2>' +
        '<p class="muted" style="text-align:center">Isi <b>GAS_URL</b> pada berkas <span class="kode">js/config.js</span> dengan URL Web App Google Apps Script (berakhiran <span class="kode">/exec</span>), lalu unggah ulang.</p></div></div>';
    },

    // ---------------- KERANGKA TATA LETAK (dibangun sekali, Prinsip 1) ----------------
    chromeKey() { const u = this.user; return [u.id_user, u.role, u.nama, u.nama_kantor].join('|'); },
    shell(active) {
      const u = this.user, admin = u.role === 'ADMIN';
      const app = $('#root .app');
      if (!app || app.dataset.key !== this.chromeKey()) this.buildChrome();
      $$('.nav a').forEach(a => a.classList.toggle('active', a.dataset.k === active));
      this.paintPeriodeChip();
      const c = $('#content');
      c.innerHTML = '';
      return c;
    },
    refreshChrome() { const app = $('#root .app'); if (app) { app.dataset.key = ''; this.render(true); } },
    paintPeriodeChip() {
      const el = $('#periodeChip'); if (!el) return;
      const p = this.periode;
      el.className = 'chip' + (p ? '' : ' off');
      el.innerHTML = p ? '<span class="dot"></span>' + esc(p.nama_periode) + ' · <b style="color:var(--burnt)">DIBUKA</b>' : '<span class="dot"></span>Tidak ada periode dibuka';
    },
    buildChrome() {
      const u = this.user, admin = u.role === 'ADMIN';
      const nav = admin ? [
        ['sec', 'Menu Utama'], ['#/admin', 'dashboard', 'Dashboard', 'dash'], ['#/admin/kantor', 'building', 'Kantor SAR', 'kantor'],
        ['#/admin/akun', 'users', 'Akun Operator', 'akun'], ['#/admin/template', 'layout', 'Template', 'template'], ['#/admin/periode', 'calendar', 'Periode', 'periode'],
        ['sec', 'Laporan'], ['#/admin/laporan/nasional', 'chart', 'Rekap Nasional', 'lap-nasional'], ['#/admin/laporan/peralatan', 'package', 'Per Peralatan', 'lap-peralatan'],
        ['#/admin/laporan/kantor', 'building', 'Per Kantor SAR', 'lap-kantor'],
        ['sec', 'Akun'], ['#/profil', 'usercircle', 'Profil Admin', 'profil']
      ] : [
        ['sec', 'Menu Operator'], ['#/dashboard', 'dashboard', 'Dashboard', 'dash'], ['#/pendataan', 'clipboard', 'Pendataan', 'pendataan'],
        ['#/kirim', 'send', 'Kirim Pendataan', 'kirim'], ['#/riwayat', 'history', 'Riwayat Pendataan', 'riwayat'], ['#/profil', 'usercircle', 'Profil & Akun', 'profil']
      ];
      const navHtml = nav.map(n => n[0] === 'sec' ? '<div class="nav-sec">' + esc(n[1]) + '</div>' :
        '<a href="' + n[0] + '" data-k="' + n[3] + '">' + icon(n[1]) + '<span>' + esc(n[2]) + '</span></a>').join('');
      const ctxChip = admin ? '' : '<span class="chip hide-md">' + icon('building', 'sm') + esc(u.nama_kantor) + '</span>';
      $('#root').innerHTML =
        '<div class="app" data-key="' + esc(this.chromeKey()) + '"><aside class="sidebar"><div class="brand"><div class="brand-logo">' + brandMark + '</div><div><b>SIPERSAR</b><span>' + (admin ? 'Dit. Sarpras · Basarnas' : 'Basarnas RI') + '</span></div></div>' +
        '<nav class="nav">' + navHtml + '</nav><div class="side-foot"><a id="btnLogout">' + icon('logout') + 'Keluar Sistem</a></div></aside>' +
        '<div class="scrim" id="scrim"></div>' +
        '<div class="main"><header class="topbar"><button class="btn btn-text btn-icon menu-btn" id="btnMenu" aria-label="Menu">' + icon('menu') + '</button>' +
        '<div class="t-title"><b>' + (admin ? 'Panel Administrasi Direktorat' : 'Portal Operator Usulan SAR') + '</b><span>Direktorat Sarana dan Prasarana Basarnas</span></div>' +
        '<div class="t-right"><span id="syncChip" class="chip sync"></span><span id="periodeChip"></span>' + ctxChip +
        '<div class="user-box" id="btnUser" title="Profil"><div class="u-txt"><b>' + esc(u.nama) + '</b><span>' + (admin ? 'Admin Direktorat' : 'Operator Kantor SAR') + '</span></div><div class="avatar">' + esc(fmt.initials(u.nama)) + '</div></div>' +
        '</div></header><main class="content" id="content"></main></div></div>';
      $('#btnLogout').onclick = () => this.logout();
      $('#btnMenu').onclick = () => document.body.classList.toggle('nav-open');
      $('#scrim').onclick = () => document.body.classList.remove('nav-open');
      $('#btnUser').onclick = () => this.go('#/profil');
      this.paintSync(API.sync);
    },

    pageHead(o) {
      return '<div class="page-head"><div style="min-width:0">' + (o.crumbs ? '<div class="crumbs">' + o.crumbs + '</div>' : '') +
        (o.eyebrow ? '<div class="eyebrow">' + o.eyebrow + '</div>' : '') + '<h1>' + esc(o.title) + '</h1>' + (o.desc ? '<p>' + o.desc + '</p>' : '') + '</div>' +
        (o.actions ? '<div class="page-actions">' + o.actions + '</div>' : '') + '</div>';
    },

    printKop(judul, sub) {
      return '<div class="print-only print-kop"><b>BADAN NASIONAL PENCARIAN DAN PERTOLONGAN</b><b>DIREKTORAT SARANA DAN PRASARANA</b><span>' + esc(judul) + (sub ? ' — ' + esc(sub) : '') + '</span><br><span>Dicetak: ' + fmt.dt(new Date().toISOString()) + '</span></div>';
    },

    /** Identitas dari cache, diperbarui di latar. */
    async refreshMe(wait) {
      if (!wait) { this.verifySession(); return { success: true }; }
      const r = await API.call('me', {});
      if (r.success) this.setMe(r.data);
      return r;
    }
  };

  // ============================================================
  // HALAMAN PUBLIK
  // ============================================================
  App.route('/login', function () {
    $('#root').innerHTML =
      '<div class="auth-page"><div class="auth-split">' +
      '<div class="auth-left"><div class="row" style="gap:12px"><div class="brand-logo" style="width:44px;height:44px">' + brandMark + '</div><div><b style="color:#fff;font-size:17px;display:block">SIPERSAR</b><span class="xs" style="letter-spacing:.12em;color:#FDBA8C;font-weight:600">BASARNAS RI</span></div></div>' +
      '<div class="pill">' + icon('clock', 'sm') + 'Pendataan Usulan Kebutuhan Tahunan</div>' +
      '<div><h2>Direktorat Sarana dan Prasarana Basarnas</h2><p style="margin:8px 0 0;font-size:13px;line-height:20px">Sistem Permintaan Usulan Kebutuhan Sarana dan Prasarana SAR untuk seluruh Kantor Pencarian dan Pertolongan di Indonesia.</p></div>' +
      '<div class="stack" style="gap:10px;margin-top:8px">' +
      '<div class="feat">' + icon('layout') + '<div><b>Satu Template Resmi</b><span>Nomenklatur & satuan seragam secara nasional</span></div></div>' +
      '<div class="feat">' + icon('shieldok') + '<div><b>Akses Berbasis Peran</b><span>Operator hanya mengelola data Kantor SAR sendiri</span></div></div>' +
      '<div class="feat">' + icon('chart') + '<div><b>Rekapitulasi Otomatis</b><span>Rekap nasional, per peralatan & per Kantor SAR</span></div></div></div></div>' +
      '<div class="auth-right"><div><span class="chip">' + icon('shield', 'sm') + 'PORTAL SIPERSAR</span></div>' +
      '<div><h1>Masuk ke SIPERSAR</h1><p class="muted" style="margin:6px 0 0">Masukkan username dan kata sandi akun Anda untuk mengelola usulan kebutuhan sarana dan prasarana SAR.</p></div>' +
      '<form id="fLogin" class="stack" novalidate>' +
      '<div class="field"><label>Username <span class="req">*</span></label><div class="input-icon">' + icon('user', 'sm') + '<input class="input" name="username" autocomplete="username" placeholder="contoh: budi.sar" required></div><div class="field-err"></div></div>' +
      '<div class="field"><label><span>Kata Sandi <span class="req">*</span></span><a href="#" id="lupa" class="small" style="font-weight:600">Lupa sandi?</a></label><div class="input-wrap input-icon">' + icon('lock', 'sm') + '<input class="input" type="password" name="password" autocomplete="current-password" placeholder="••••••••" required><button type="button" class="addon" data-pw>' + icon('eye') + '</button></div><div class="field-err"></div></div>' +
      '<label class="check"><input type="checkbox" name="ingat"> Ingat sesi saya di perangkat ini</label>' +
      '<div id="loginErr"></div>' +
      '<button class="btn btn-primary btn-block" style="height:42px" type="submit">' + icon('arrowr', 'sm') + 'MASUK KE SISTEM</button></form>' +
      '<div class="kv-box stack" style="gap:12px"><div class="row" style="align-items:flex-start;gap:10px">' + icon('plus', 'sm') + '<div><b>Belum memiliki akun operator?</b><br><a href="#/daftar">Daftar Mandiri Operator Kantor SAR →</a></div></div>' +
      '<div class="row small muted" style="align-items:flex-start;gap:10px;flex-wrap:nowrap">' + icon('info', 'sm') + '<div>Lupa kata sandi? Hubungi Admin Direktorat Sarpras untuk mendapatkan kata sandi sementara.</div></div></div>' +
      '<div class="xs muted" style="text-align:center">© ' + new Date().getFullYear() + ' Badan Nasional Pencarian dan Pertolongan (BASARNAS)</div></div></div></div>';
    pwToggle($('#root'));
    $('#lupa').onclick = e => { e.preventDefault(); UI.modal({ title: 'Lupa kata sandi', icon: 'key', body: '<p>Hubungi <b>Admin Direktorat Sarana dan Prasarana</b>. Admin akan mereset akun Anda dan memberikan <b>kata sandi sementara</b> secara pribadi. Setelah masuk, Anda wajib membuat kata sandi baru.</p>', buttons: [{ label: 'Mengerti', cls: 'btn-navy' }] }); };
    const f = $('#fLogin');
    f.onsubmit = async e => {
      e.preventDefault();
      const d = formData(f); const btn = f.querySelector('button[type=submit]');
      fieldErrors(f, null); $('#loginErr').innerHTML = '';
      if (!d.username || !d.password) { fieldErrors(f, { username: !d.username ? 'Username wajib diisi.' : undefined, password: !d.password ? 'Kata sandi wajib diisi.' : undefined }); return; }
      busy(btn, true, 'Memeriksa…');
      const r = await API.call('login', { username: d.username, password: d.password, bootstrap: true, punya_template: API.templateIds() });
      busy(btn, false);
      if (!r.success) { $('#loginErr').innerHTML = '<div class="alert alert-err">' + icon('alert') + '<div>' + esc(r.message) + '</div></div>'; return; }
      API.setToken(r.data.token, !!d.ingat);
      this.setMe(r.data);
      API.seed(r.data.bootstrap);
      this.go(this.homeHash());
      if (!this.user.wajib_ganti_password) setTimeout(() => this.prefetchRole(), 50);
    };
  }, { public: true, guestOnly: true });

  App.route('/daftar', async function () {
    $('#root').innerHTML = '<div class="auth-page"><div class="auth-card" id="regCard">' + UI.loading('Memuat daftar Kantor SAR…') + '</div></div>';
    const r = await API.read('kantorPublik', {});
    const kantor = r.success ? r.data : [];
    $('#regCard').innerHTML =
      '<div class="mark">' + brandMark + '</div><div style="text-align:center"><span class="chip">SIPERSAR BASARNAS</span><h2 style="margin-top:10px">Pendaftaran Akun Operator Kantor SAR</h2>' +
      '<p class="muted" style="margin:4px 0 16px">Daftarkan diri Anda sebagai penanggung jawab pendataan usulan sarana prasarana Kantor SAR.</p></div>' +
      '<div class="alert alert-info" style="margin-bottom:16px">' + icon('info') + '<div class="small">Akun langsung aktif setelah registrasi berhasil. Satu NIP hanya untuk satu akun dan Kantor SAR tidak dapat diganti sendiri.</div></div>' +
      (!kantor.length ? '<div class="alert alert-warn" style="margin-bottom:12px">' + icon('alert') + '<div>' + esc(r.success ? 'Belum ada Kantor SAR aktif. Hubungi Admin Direktorat.' : r.message) + '</div></div>' : '') +
      '<form id="fReg" class="stack" novalidate><div class="sec-title">1. Data Identitas Pegawai</div>' +
      '<div class="field"><label>Nama Lengkap (beserta gelar) <span class="req">*</span></label><input class="input" name="nama" maxlength="120" required><div class="field-err"></div></div>' +
      '<div class="grid g2"><div class="field"><label>NIP Pegawai (18 digit) <span class="req">*</span></label><input class="input tnum" name="nip" inputmode="numeric" maxlength="18" required><div class="field-err"></div></div>' +
      '<div class="field"><label>Jabatan <span class="req">*</span></label><input class="input" name="jabatan" maxlength="120" required><div class="field-err"></div></div></div>' +
      '<div class="field"><label>Kantor SAR <span class="req">*</span></label><select class="input" name="id_kantor" required><option value="">— Pilih Kantor SAR —</option>' +
      kantor.map(k => '<option value="' + esc(k.id_kantor) + '">' + esc(k.no_urut + '. ' + k.nama_kantor) + '</option>').join('') + '</select><div class="field-err"></div></div>' +
      '<div class="sec-title">2. Kredensial Akun</div>' +
      '<div class="grid g2"><div class="field"><label>Username <span class="req">*</span></label><input class="input" name="username" autocomplete="username" maxlength="30" placeholder="huruf kecil, angka, titik"><div class="field-hint">4–30 karakter: a-z, 0-9, titik, garis bawah</div><div class="field-err"></div></div>' +
      '<div class="field"><label>Email <span class="muted" style="font-weight:400">(opsional)</span></label><input class="input" name="email" type="email" maxlength="120"><div class="field-err"></div></div></div>' +
      '<div class="grid g2"><div class="field"><label>Kata Sandi <span class="req">*</span></label><div class="input-wrap"><input class="input" type="password" name="password" autocomplete="new-password"><button type="button" class="addon" data-pw>' + icon('eye') + '</button></div><div class="pw-meter" id="pwm"><i></i><i></i><i></i><i></i></div><div class="field-err"></div></div>' +
      '<div class="field"><label>Ulangi Kata Sandi <span class="req">*</span></label><div class="input-wrap"><input class="input" type="password" name="password2" autocomplete="new-password"><button type="button" class="addon" data-pw>' + icon('eye') + '</button></div><div class="field-err"></div></div></div>' +
      '<div class="field-hint">Minimal 8 karakter, mengandung huruf dan angka.</div>' +
      '<label class="check"><input type="checkbox" name="setuju"> Saya menyatakan data yang saya masukkan adalah sah dan mewakili penugasan resmi Kantor SAR terkait.</label>' +
      '<div id="regErr"></div><button class="btn btn-primary btn-block" style="height:42px" type="submit">DAFTAR AKUN OPERATOR ' + icon('arrowr', 'sm') + '</button>' +
      '<a href="#/login" class="small" style="text-align:center;color:var(--text-2);font-weight:600">' + icon('arrowl', 'sm') + ' Sudah memiliki akun? Masuk ke Sistem</a></form>';
    const f = $('#fReg'); pwToggle(f);
    f.password.oninput = () => { $('#pwm').className = 'pw-meter s' + pwStrength(f.password.value).score; };
    f.nip.oninput = () => { f.nip.value = f.nip.value.replace(/\D/g, '').slice(0, 18); };
    f.username.oninput = () => { f.username.value = f.username.value.toLowerCase().replace(/[^a-z0-9._]/g, ''); };
    f.onsubmit = async e => {
      e.preventDefault();
      const d = formData(f), err = {};
      if (!d.nama) err.nama = 'Nama wajib diisi.';
      if (!/^\d{18}$/.test(d.nip)) err.nip = 'NIP harus 18 digit angka.';
      if (!d.jabatan) err.jabatan = 'Jabatan wajib diisi.';
      if (!d.id_kantor) err.id_kantor = 'Pilih Kantor SAR.';
      if (!/^[a-z0-9._]{4,30}$/.test(d.username)) err.username = 'Username 4–30 karakter (a-z, 0-9, titik, garis bawah).';
      if ((d.password || '').length < 8 || !/[A-Za-z]/.test(d.password) || !/\d/.test(d.password)) err.password = 'Minimal 8 karakter berisi huruf dan angka.';
      if (d.password !== d.password2) err.password2 = 'Konfirmasi kata sandi tidak sama.';
      fieldErrors(f, err); $('#regErr').innerHTML = '';
      if (Object.keys(err).length) return;
      if (!d.setuju) { $('#regErr').innerHTML = '<div class="alert alert-warn">' + icon('alert') + '<div>Centang pernyataan keabsahan data terlebih dahulu.</div></div>'; return; }
      const btn = f.querySelector('button[type=submit]'); busy(btn, true, 'Mendaftarkan…');
      const r = await API.call('register', d);
      busy(btn, false);
      if (!r.success) { fieldErrors(f, r.detail); $('#regErr').innerHTML = '<div class="alert alert-err">' + icon('alert') + '<div>' + esc(r.message) + '</div></div>'; return; }
      toast(r.message, 'success', 6000);
      this.go('#/login');
    };
  }, { public: true, guestOnly: true });

  App.route('/ganti-password', function () {
    if (!API.getToken()) return this.go('#/login');
    const u = this.user || {};
    $('#root').innerHTML = '<div class="auth-page"><div class="auth-card" style="max-width:560px">' +
      '<div class="mark orange">' + icon('shield', 'lg') + '</div><div style="text-align:center"><div class="label-sm" style="color:var(--burnt)">SIPERSAR</div><h2 style="margin-top:4px">Pembaruan Kata Sandi Wajib</h2>' +
      '<p class="muted" style="margin:6px 0 16px">Demi keamanan akun, Anda wajib membuat kata sandi baru sebelum dapat mengakses sistem.</p></div>' +
      '<div class="alert alert-warn" style="margin-bottom:16px">' + icon('key') + '<div class="small">Anda masuk menggunakan kata sandi sementara/awal. Kata sandi ini harus segera diperbarui.</div></div>' +
      (u.nama ? '<div class="kv-box row" style="margin-bottom:16px"><div class="avatar">' + esc(fmt.initials(u.nama)) + '</div><div><b>' + esc(u.nama) + '</b><div class="small muted">' + esc(u.username || '') + (u.nip ? ' · NIP ' + esc(u.nip) : '') + '</div></div>' + (u.nama_kantor ? '<span class="chip" style="margin-left:auto">' + icon('building', 'sm') + esc(u.nama_kantor) + '</span>' : '') + '</div>' : '') +
      '<form id="fPw" class="stack" novalidate>' + pwFields(true) +
      '<div id="pwErr"></div><button class="btn btn-primary btn-block" style="height:42px" type="submit">Simpan Kata Sandi & Lanjutkan ' + icon('arrowr', 'sm') + '</button>' +
      '<a href="#" id="pwOut" class="small" style="text-align:center;color:var(--text-2);font-weight:600">' + icon('logout', 'sm') + ' Batal dan Keluar ke Halaman Login</a></form></div></div>';
    const f = $('#fPw'); bindPwForm(f);
    $('#pwOut').onclick = e => { e.preventDefault(); this.logout(); };
    f.onsubmit = async e => {
      e.preventDefault();
      const d = formData(f), err = validatePw(d);
      fieldErrors(f, err); if (Object.keys(err).length) return;
      const btn = f.querySelector('button[type=submit]'); busy(btn, true, 'Menyimpan…');
      const r = await API.call('changePassword', { password_lama: d.password_lama, password_baru: d.password_baru });
      busy(btn, false);
      if (!r.success) { fieldErrors(f, r.detail); $('#pwErr').innerHTML = '<div class="alert alert-err">' + icon('alert') + '<div>' + esc(r.message) + '</div></div>'; return; }
      toast('Kata sandi diperbarui. Selamat bekerja!');
      await this.refreshMe(true);
      this.go(this.homeHash());
      this.prefetchRole();
    };
  }, { public: true });

  function pwFields(temp) {
    return '<div class="field"><label>' + (temp ? 'Kata Sandi Sementara / Saat Ini' : 'Kata Sandi Saat Ini') + ' <span class="req">*</span></label><div class="input-wrap"><input class="input" type="password" name="password_lama" autocomplete="current-password"><button type="button" class="addon" data-pw>' + icon('eye') + '</button></div><div class="field-err"></div></div>' +
      '<div class="field"><label>Kata Sandi Baru <span class="req">*</span></label><div class="input-wrap"><input class="input" type="password" name="password_baru" autocomplete="new-password"><button type="button" class="addon" data-pw>' + icon('eye') + '</button></div>' +
      '<div class="pw-meter" data-meter><i></i><i></i><i></i><i></i></div><div class="field-err"></div></div>' +
      '<div class="rules" data-rules><span data-r="len">○ Minimal 8 karakter</span><span data-r="digit">○ Mengandung angka (0-9)</span><span data-r="case">○ Huruf besar & kecil (disarankan)</span><span data-r="sym">○ Simbol (disarankan)</span></div>' +
      '<div class="field"><label>Konfirmasi Kata Sandi Baru <span class="req">*</span></label><div class="input-wrap"><input class="input" type="password" name="password_baru2" autocomplete="new-password"><button type="button" class="addon" data-pw>' + icon('eye') + '</button></div><div class="field-err"></div></div>';
  }
  function bindPwForm(f) {
    pwToggle(f);
    f.password_baru.oninput = () => {
      const s = pwStrength(f.password_baru.value);
      f.querySelector('[data-meter]').className = 'pw-meter s' + s.score;
      $$('[data-r]', f).forEach(el => { const ok = s.rules[el.dataset.r]; el.classList.toggle('ok', ok); el.textContent = (ok ? '✓ ' : '○ ') + el.textContent.slice(2); });
    };
  }
  function validatePw(d) {
    const err = {};
    if (!d.password_lama) err.password_lama = 'Wajib diisi.';
    if ((d.password_baru || '').length < 8 || !/[A-Za-z]/.test(d.password_baru) || !/\d/.test(d.password_baru)) err.password_baru = 'Minimal 8 karakter berisi huruf dan angka.';
    else if (d.password_baru === d.password_lama) err.password_baru = 'Tidak boleh sama dengan kata sandi lama.';
    if (d.password_baru !== d.password_baru2) err.password_baru2 = 'Konfirmasi tidak sama.';
    return err;
  }

  // ============================================================
  // PROFIL (Admin & Operator)
  // ============================================================
  App.route('/profil', async function () {
    const c = this.shell('profil');
    c.innerHTML = UI.loading();
    await this.refreshMe();
    const u = this.user, op = u.role === 'OPERATOR';
    c.innerHTML = this.pageHead({ eyebrow: 'Manajemen Akun', title: 'Profil Pengguna & Keamanan Akun', desc: op ? 'Kelola identitas operator Kantor SAR dan perbarui kata sandi secara berkala.' : 'Akun Admin Direktorat bersama. Perbarui kata sandi secara berkala dan bagikan hanya kepada petugas berwenang.' }) +
      '<div class="stack">' +
      '<div class="card"><div class="card-body row" style="gap:16px"><div class="avatar" style="width:56px;height:56px;font-size:18px">' + esc(fmt.initials(u.nama)) + '</div>' +
      '<div style="flex:1;min-width:200px"><div class="row" style="gap:8px"><h2>' + esc(u.nama) + '</h2><span class="badge b-navy nodot">' + (op ? 'Operator Kantor' : 'Admin Direktorat') + '</span>' + UI.badge('AKTIF') + '</div>' +
      (op ? '<div class="muted" style="margin-top:4px">' + icon('building', 'sm') + ' ' + esc(u.nama_kantor) + '</div>' : '') + '</div>' +
      '<div class="kv-box small"><span class="muted">Terakhir masuk</span><br><b>' + fmt.dt(u.login_terakhir) + '</b></div></div></div>' +
      (op ? '<div class="card"><div class="card-head"><h3>' + icon('lock') + 'Kredensial Penugasan (Terkunci)</h3></div><div class="card-body"><div class="grid g3">' +
        ro('Nomor Induk Pegawai (NIP)', u.nip) + ro('Username Akun', u.username) + ro('Kantor SAR', u.nama_kantor) + '</div>' +
        '<p class="small muted" style="margin:12px 0 0">NIP, username, dan Kantor SAR tidak dapat diubah. Jika pindah tugas, minta Admin menonaktifkan akun ini lalu buat akun baru.</p></div></div>' +
        '<div class="card"><div class="card-head"><h3>' + icon('edit') + 'Informasi Kontak & Jabatan</h3></div><form id="fProf" novalidate><div class="card-body"><div class="grid g2">' +
        '<div class="field"><label>Nama Lengkap (dengan gelar) <span class="req">*</span></label><input class="input" name="nama" value="' + esc(u.nama) + '" maxlength="120"><div class="field-err"></div></div>' +
        '<div class="field"><label>Jabatan <span class="req">*</span></label><input class="input" name="jabatan" value="' + esc(u.jabatan) + '" maxlength="120"><div class="field-err"></div></div>' +
        '<div class="field"><label>Email <span class="muted" style="font-weight:400">(opsional)</span></label><input class="input" name="email" type="email" value="' + esc(u.email) + '" maxlength="120"><div class="field-err"></div></div></div></div>' +
        '<div class="card-foot"><span class="small muted" style="margin-right:auto">' + icon('shield', 'sm') + ' NIP, username & Kantor SAR tetap terkunci.</span><button class="btn btn-primary" type="submit">' + icon('save', 'sm') + 'Simpan Perubahan Profil</button></div></form></div>'
        : '<div class="card"><div class="card-head"><h3>' + icon('lock') + 'Kredensial</h3></div><div class="card-body"><div class="grid g3">' + ro('Username', u.username) + ro('Peran', 'Admin Direktorat') + ro('Dibuat', fmt.date(u.dibuat_pada)) + '</div></div></div>') +
      '<div class="card"><div class="card-head"><h3>' + icon('key') + 'Ganti Kata Sandi</h3></div><form id="fPw2" novalidate><div class="card-body stack" style="max-width:640px">' + pwFields(false) + '</div>' +
      '<div class="card-foot"><span class="small muted" style="margin-right:auto">Sesi di perangkat lain otomatis diakhiri setelah kata sandi diubah.</span><button class="btn btn-primary" type="submit">' + icon('key', 'sm') + 'Ubah Kata Sandi</button></div></form></div></div>';
    if (op) {
      const f = $('#fProf');
      f.onsubmit = async e => {
        e.preventDefault(); const d = formData(f); const btn = f.querySelector('button[type=submit]');
        busy(btn, true, 'Menyimpan…'); const r = await API.call('updateProfile', d); busy(btn, false);
        fieldErrors(f, r.detail);
        if (!r.success) return toast(r.message, 'error');
        toast(r.message); this.setMe({ user: r.data.user, periode_aktif: this.periode }); this.render(true);
      };
    }
    const f2 = $('#fPw2'); bindPwForm(f2);
    f2.onsubmit = async e => {
      e.preventDefault(); const d = formData(f2), err = validatePw(d); fieldErrors(f2, err); if (Object.keys(err).length) return;
      const btn = f2.querySelector('button[type=submit]'); busy(btn, true, 'Menyimpan…');
      const r = await API.call('changePassword', { password_lama: d.password_lama, password_baru: d.password_baru }); busy(btn, false);
      fieldErrors(f2, r.detail);
      if (!r.success) return toast(r.message, 'error');
      toast(r.message); f2.reset();
    };
  });
  function ro(label, val) { return '<div class="kv-box"><div class="label-sm">' + esc(label) + '</div><div style="font-weight:600;margin-top:4px;word-break:break-word" class="tnum">' + esc(val || '–') + '</div></div>'; }

  global.App = App;
})(window);
