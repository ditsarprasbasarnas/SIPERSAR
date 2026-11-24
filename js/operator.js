/* ============================================================
   SIPERSAR — operator.js
   Dashboard Operator, Pendataan, Kirim, Riwayat & Salin Periode
   ============================================================ */
(function (global) {
  'use strict';
  const { icon, esc, $, $$, fmt, toast, busy, badge, progress } = UI;

  const Operator = {
    kepalaModal(d, ids, onDone) {
      const pd = d.pendataan || {};
      UI.modal({
        title: 'Identitas Kepala Kantor Pencarian dan Pertolongan', sub: 'Pejabat pengesah usulan ' + d.kantor.nama_kantor, icon: 'user', iconCls: 'navy',
        body: '<form id="fKep" class="stack" novalidate>' +
          '<div class="field"><label>Nama Lengkap & Gelar <span class="req">*</span></label><input class="input" name="nama_kepala" maxlength="150" value="' + esc(pd.nama_kepala || '') + '"><div class="field-err"></div></div>' +
          '<div class="grid g2"><div class="field"><label>NIP (18 digit) <span class="req">*</span></label><input class="input tnum" name="nip_kepala" inputmode="numeric" maxlength="18" value="' + esc(pd.nip_kepala || '') + '"><div class="field-err"></div></div>' +
          '<div class="field"><label>Pangkat / Golongan <span class="req">*</span></label><input class="input" name="pangkat_golongan_kepala" maxlength="100" placeholder="mis. Pembina Utama Muda (IV/c)" value="' + esc(pd.pangkat_golongan_kepala || '') + '"><div class="field-err"></div></div></div>' +
          (d.pendataan && d.pendataan.status === 'DIKIRIM' && App.user.role === 'OPERATOR' ? '<div class="alert alert-warn small">' + icon('alert', 'sm') + '<div>Mengubah identitas setelah dikirim mengembalikan status ke DRAFT.</div></div>' : '') + '</form>',
        onOpen: (m) => { const n = m.querySelector('[name=nip_kepala]'); n.oninput = () => { n.value = n.value.replace(/\D/g, '').slice(0, 18); }; },
        buttons: [{ label: 'Batal' }, {
          label: 'Simpan Identitas', cls: 'btn-primary', icon: 'save', onClick: async (btn) => {
            const f = $('#fKep'), v = UI.formData(f), err = {};
            if (!v.nama_kepala) err.nama_kepala = 'Wajib diisi.';
            if (!/^\d{18}$/.test(v.nip_kepala)) err.nip_kepala = 'NIP harus 18 digit angka.';
            if (!v.pangkat_golongan_kepala) err.pangkat_golongan_kepala = 'Wajib diisi.';
            UI.fieldErrors(f, err); if (Object.keys(err).length) return false;
            busy(btn, true, 'Menyimpan…');
            const r = await API.call('pendataanSimpanKepala', Object.assign({}, ids, v));
            busy(btn, false);
            if (!r.success) { UI.fieldErrors(f, r.detail); toast(r.message, 'error'); return false; }
            toast(r.message, r.message.indexOf('DRAFT') >= 0 ? 'warn' : 'success');
            if (onDone) onDone(r.data);
          }
        }]
      });
    },

    async downloadExcel(idPeriode, btn) {
      busy(btn, true, 'Menyiapkan…');
      try {
        const d = await Pendataan.load({ id_periode: idPeriode });
        if (!d.pendataan || d.pendataan.status !== 'DIKIRIM') throw new Error('Excel hanya dapat diunduh bila status pendataan DIKIRIM.');
        Excel.downloadKantor(d.tpl, d.kantor, d.periode, d.itemMap, d.pendataan);
        toast('Berkas Excel diunduh.');
      } catch (e) { toast(e.message, 'error'); }
      busy(btn, false);
    }
  };

  // ============================================================
  // DASHBOARD OPERATOR
  // ============================================================
  App.route('/dashboard', async function () {
    const c = this.shell('dash');
    c.innerHTML = UI.loading();
    const r = await API.call('dashboardOperator', {});
    if (!r.success) { c.innerHTML = '<div class="alert alert-err">' + icon('alert') + '<div>' + esc(r.message) + '</div></div>'; return; }
    const d = r.data, u = d.user || this.user;
    if (!d.periode) {
      c.innerHTML = this.pageHead({ title: 'Dashboard Operator', desc: esc(d.kantor.nama_kantor) }) +
        '<div class="card">' + UI.emptyState('Belum ada periode pendataan. Tunggu pengumuman periode dari Direktorat Sarana dan Prasarana.', 'calendar') + '</div>';
      return;
    }
    const tpl = await API.template(d.periode.id_template);
    const pd = d.pendataan, kat = tpl.kategori, total = kat.length;
    const done = kat.filter(k => d.review[k.kode_kategori] && d.review[k.kode_kategori].selesai).length;
    const nItem = Object.values(d.item_per_kategori).reduce((a, b) => a + b, 0);
    const status = pd ? pd.status : 'BELUM';
    const sisa = fmt.sisaHari(d.periode.batas_pengisian);
    const kepalaOk = pd && pd.nama_kepala && pd.nip_kepala && pd.pangkat_golongan_kepala;

    let banner;
    if (!d.dapat_ubah) banner = ['alert-warn', 'lock', 'Mode baca-saja', d.alasan];
    else if (status === 'DIKIRIM') banner = ['alert-ok', 'checkc', 'Pendataan sudah DIKIRIM ke Direktorat', 'Dikirim ' + fmt.dt(pd.dikirim_pada) + ' oleh ' + pd.dikirim_oleh + '. Anda masih dapat memperbarui data selama periode dibuka; status akan kembali DRAFT dan wajib dikirim ulang.'];
    else if (status === 'DRAFT') banner = ['alert-info', 'info', 'Status Pengisian Usulan: Mode Draft Aktif', 'Perubahan tersimpan sebagai DRAFT. Pastikan seluruh ' + total + ' kategori ditandai Selesai Ditinjau dan data Kepala Kantor lengkap sebelum dikirim ke Direktorat.'];
    else banner = ['alert-info', 'info', 'Kantor Anda belum mulai mengisi', 'Mulai pendataan dengan membuka kategori pada menu Pendataan. Kategori tanpa usulan tetap perlu ditandai Selesai Ditinjau.'];

    // kelompok per bagian
    const bagian = []; const byB = {};
    kat.forEach(k => { if (!byB[k.bagian]) { byB[k.bagian] = []; bagian.push(k.bagian); } byB[k.bagian].push(k); });

    c.innerHTML = this.pageHead({ eyebrow: 'Dashboard Operator', title: d.kantor.nama_kantor, desc: 'Ringkasan pendataan usulan kebutuhan sarana dan peralatan SAR Kantor Anda.' }) +
      '<div class="alert ' + banner[0] + '" style="margin-bottom:16px">' + icon(banner[1]) + '<div><b>' + esc(banner[2]) + '</b>' + esc(banner[3]) + '</div></div>' +
      '<div class="grid g3" style="margin-bottom:16px">' +
      '<div class="card accent-navy metric"><div class="m-top"><div class="m-ico">' + icon('building') + '</div><span class="label-sm">Unit Kerja</span></div><h3 style="margin-top:6px">' + esc(d.kantor.nama_kantor) + '</h3>' +
      '<dl class="kv small" style="margin-top:auto"><dt>Operator</dt><dd>' + esc(u.nama) + '</dd><dt>NIP</dt><dd class="tnum">' + esc(u.nip) + '</dd></dl></div>' +
      '<div class="card accent-orange metric"><div class="m-top"><div class="m-ico">' + icon('calendar') + '</div>' + badge(d.periode.status) + '</div><h3 style="margin-top:6px">' + esc(d.periode.nama_periode) + '</h3>' +
      (d.periode.batas_pengisian ? '<div class="small" style="color:var(--burnt);font-weight:600">' + icon('clock', 'sm') + ' Batas pengisian: ' + fmt.dateOnly(d.periode.batas_pengisian) + (sisa !== null && d.dapat_ubah ? ' (' + (sisa >= 0 ? 'sisa ' + sisa + ' hari' : 'lewat ' + (-sisa) + ' hari') + ')' : '') + '</div>' : '') +
      '<dl class="kv small" style="margin-top:auto"><dt>Template</dt><dd>Versi ' + esc(d.periode.template_versi) + ' (' + d.periode.jumlah_item_template + ' item)</dd></dl></div>' +
      '<div class="card accent-navy metric"><div class="m-top"><div class="m-ico">' + icon('clipboard') + '</div>' + badge(status) + '</div>' +
      '<div class="m-val">' + nItem + '<small>item diusulkan</small></div>' +
      '<dl class="kv small" style="margin-top:auto"><dt>Terakhir disimpan</dt><dd>' + (pd ? fmt.dt(pd.disimpan_terakhir) + ' (' + esc(pd.disimpan_oleh) + ')' : '–') + '</dd></dl></div></div>' +

      '<div class="card" style="margin-bottom:16px"><div class="card-head"><div><h3>Progres Peninjauan Kategori Kebutuhan <span class="chip" style="margin-left:6px">' + done + ' / ' + total + ' kategori (' + Math.round(done / total * 100) + '%)</span></h3>' +
      '<div class="small muted" style="margin-top:4px">Setiap kategori — termasuk yang tanpa usulan — wajib ditandai Selesai Ditinjau sebelum pengiriman.</div></div>' +
      '<div class="small row"><span><span style="color:var(--orange)">●</span> Selesai Ditinjau (' + done + ')</span><span><span style="color:var(--muted-2)">●</span> Belum (' + (total - done) + ')</span></div></div>' +
      '<div class="card-body">' + progress(done / total * 100) +
      '<div class="grid g4" style="margin-top:20px;gap:20px">' + bagian.map(b => {
        const ks = byB[b], dn = ks.filter(k => d.review[k.kode_kategori] && d.review[k.kode_kategori].selesai).length;
        return '<div><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><b class="small" style="color:var(--navy)">' + esc(b) + '</b><span class="chip" style="height:22px">' + dn + ' / ' + ks.length + '</span></div>' +
          '<div style="margin:8px 0">' + progress(dn / ks.length * 100, 'sm') + '</div>' +
          ks.map(k => { const ok = d.review[k.kode_kategori] && d.review[k.kode_kategori].selesai, n = d.item_per_kategori[k.kode_kategori] || 0;
            return '<a href="#/pendataan/' + encodeURIComponent(k.kode_kategori) + '" class="row small" style="flex-wrap:nowrap;gap:8px;padding:4px 0;color:var(--text-2);text-decoration:none">' +
              '<span style="color:' + (ok ? 'var(--burnt)' : 'var(--muted-2)') + '">' + icon(ok ? 'checkc' : 'circle', 'sm') + '</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(k.nama) + '</span>' +
              '<span class="xs" style="color:' + (n ? 'var(--navy)' : 'var(--muted-2)') + ';font-weight:600">' + n + '</span></a>'; }).join('') + '</div>';
      }).join('') + '</div></div></div>' +

      '<div class="card" style="margin-bottom:16px"><div class="card-head"><div class="row"><div class="ico-box">' + icon('shieldok') + '</div><div><h3>Pejabat Pengesah: Kepala Kantor SAR ' + (kepalaOk ? '<span class="badge b-kirim">Data Lengkap</span>' : '<span class="badge b-review">Belum Lengkap</span>') + '</h3><div class="small muted">Penandatangan usulan sarana prasarana Kantor SAR</div></div></div>' +
      (d.dapat_ubah ? '<button class="btn btn-ghost" id="btnKepala">' + icon('edit', 'sm') + 'Ubah Data Kepala Kantor</button>' : '') + '</div>' +
      '<div class="card-body"><div class="grid g3">' +
      ['Nama Lengkap & Gelar', 'Nomor Induk Pegawai (NIP)', 'Pangkat / Golongan Ruang'].map((l, i) => '<div class="kv-box"><div class="label-sm">' + l + '</div><div style="font-weight:600;margin-top:6px;font-size:14px" class="tnum">' +
        esc(pd ? [pd.nama_kepala, pd.nip_kepala, pd.pangkat_golongan_kepala][i] || '–' : '–') + '</div></div>').join('') + '</div></div></div>' +

      '<div class="card"><div class="card-body row" style="gap:16px"><div class="ico-box">' + icon('rocket') + '</div><div style="flex:1;min-width:220px"><h3>Aksi Lanjutan Pengusulan</h3><div class="small muted">Lanjutkan pengisian per kategori atau lakukan validasi kesiapan kirim.</div></div>' +
      '<div class="row"><button class="btn btn-ghost" id="btnXls" ' + (status === 'DIKIRIM' ? '' : 'disabled title="Tersedia setelah status DIKIRIM"') + '>' + icon('sheet', 'sm') + 'Unduh Excel Usulan</button>' +
      '<a class="btn btn-navy" href="#/kirim">' + icon('send', 'sm') + 'Kirim Usulan ke Direktorat</a>' +
      '<a class="btn btn-primary" href="#/pendataan">Lanjutkan Pengisian ' + icon('arrowr', 'sm') + '</a></div></div></div>';
    if ($('#btnKepala')) $('#btnKepala').onclick = () => Operator.kepalaModal({ pendataan: pd, kantor: d.kantor }, { id_periode: d.periode.id_periode }, () => this.render());
    $('#btnXls').onclick = e => Operator.downloadExcel(d.periode.id_periode, e.currentTarget);
  }, { role: 'OPERATOR' });

  // ============================================================
  // PENDATAAN
  // ============================================================
  App.route('/pendataan', async function () {
    const c = this.shell('pendataan');
    await Pendataan.listPage(c, { mode: 'OPERATOR', base: '#/pendataan' });
  }, { role: 'OPERATOR' });
  App.route('/pendataan/:kode', async function (kode) {
    const c = this.shell('pendataan');
    await Pendataan.formPage(c, { mode: 'OPERATOR', base: '#/pendataan' }, kode, this.query.get('fokus'));
  }, { role: 'OPERATOR' });

  // ============================================================
  // KIRIM PENDATAAN
  // ============================================================
  App.route('/kirim', async function () {
    const c = this.shell('kirim');
    c.innerHTML = UI.loading();
    const d = await Pendataan.load({});
    const tpl = d.tpl, kat = tpl.kategori, pd = d.pendataan;
    const belum = kat.filter(k => !(d.review[k.kode_kategori] && d.review[k.kode_kategori].selesai));
    const kepalaOk = pd && pd.nama_kepala && /^\d{18}$/.test(pd.nip_kepala) && pd.pangkat_golongan_kepala;
    const siap = pd && !belum.length && kepalaOk && d.dapat_ubah && pd.status !== 'DIKIRIM';
    const perBag = {}; const bagOrder = [];
    kat.forEach(k => { if (!perBag[k.bagian]) { perBag[k.bagian] = { n: 0, kat: 0 }; bagOrder.push(k.bagian); } perBag[k.bagian].kat++; perBag[k.bagian].n += Pendataan.itemCount(d, k); });
    const sent = pd && pd.status === 'DIKIRIM';

    c.innerHTML = '<div class="card alert-navy" style="padding:22px 24px;margin-bottom:16px;border-radius:var(--r-lg)"><div class="row" style="gap:16px"><div class="ico-box orange">' + icon('send') + '</div>' +
      '<div style="flex:1;min-width:220px"><div class="label-sm" style="color:#FDBA8C">Tahap Akhir Pengusulan · ' + esc(d.periode.nama_periode) + '</div><h1 style="color:#fff">Finalisasi & Pengiriman Usulan Kebutuhan</h1><div class="small" style="color:#C7D2E5">' + esc(d.kantor.nama_kantor) + '</div></div>' +
      (d.periode.batas_pengisian ? '<div class="kv-box" style="background:rgba(255,255,255,.08);color:#fff"><div class="label-sm" style="color:#C7D2E5">Batas Pengisian</div><b>' + fmt.dateOnly(d.periode.batas_pengisian) + '</b></div>' : '') + '</div></div>' +
      (!d.dapat_ubah ? '<div class="alert alert-warn" style="margin-bottom:16px">' + icon('lock') + '<div><b>Mode baca-saja</b>' + esc(d.alasan) + '</div></div>' : '') +
      (sent ? '<div class="alert alert-ok" style="margin-bottom:16px">' + icon('checkc') + '<div style="flex:1"><b>Usulan telah DIKIRIM ke Direktorat</b>Dikirim ' + fmt.dt(pd.dikirim_pada) + ' oleh ' + esc(pd.dikirim_oleh) + '. Data Kantor Anda sudah masuk rekap nasional.</div><button class="btn btn-navy btn-sm" id="btnXls">' + icon('sheet', 'sm') + 'Unduh Excel</button></div>' : '') +
      '<div class="grid" style="grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);align-items:start" id="kgrid">' +
      '<div class="stack"><div class="card"><div class="card-head"><h3>' + icon('checkc') + 'Checklist Kesiapan Pengiriman</h3>' + (siap || sent ? '<span class="badge b-kirim">Siap</span>' : '<span class="badge b-review">' + (belum.length + (kepalaOk ? 0 : 1)) + ' syarat belum terpenuhi</span>') + '</div><div class="card-body stack">' +
      chk(!belum.length, 'Seluruh kategori Selesai Ditinjau', (kat.length - belum.length) + ' dari ' + kat.length + ' kategori sudah ditandai.', (kat.length - belum.length) / kat.length * 100) +
      (belum.length ? '<div class="kv-box"><div class="label-sm" style="margin-bottom:6px">Kategori belum ditinjau</div><div class="row" style="gap:6px">' + belum.map(k => '<a class="chip" href="#/pendataan/' + encodeURIComponent(k.kode_kategori) + '">' + esc((k.penanda ? k.penanda + (/[.)]$/.test(k.penanda) ? ' ' : '. ') : '') + k.nama) + '</a>').join('') + '</div></div>' : '') +
      chk(kepalaOk, 'Identitas Kepala Kantor lengkap', kepalaOk ? pd.nama_kepala + ' · NIP ' + pd.nip_kepala + ' · ' + pd.pangkat_golongan_kepala : 'Nama, NIP (18 digit), dan pangkat/golongan wajib diisi.') +
      chk(true, 'Validasi isian per baris', 'Justifikasi wajib dan jumlah bilangan bulat sudah diperiksa saat setiap kategori disimpan.') + '</div>' +
      (d.dapat_ubah ? '<div class="card-foot"><button class="btn btn-ghost" id="btnKep">' + icon('user', 'sm') + (kepalaOk ? 'Ubah' : 'Lengkapi') + ' Identitas Kepala Kantor</button></div>' : '') + '</div>' +
      '<div class="alert alert-info small">' + icon('info') + '<div><b>Ketentuan perubahan status</b>Setelah dikirim, data masih dapat diubah selama periode dibuka. Setiap perubahan yang disimpan mengembalikan status ke DRAFT dan usulan wajib dikirim ulang agar kembali masuk rekap nasional.</div></div></div>' +
      '<div class="card"><div class="card-head"><h3>' + icon('chart') + 'Ringkasan Usulan</h3>' + Pendataan.statusBadge(d) + '</div><div class="card-body">' +
      '<div class="m-val" style="font-size:34px;line-height:40px;font-weight:600;color:var(--navy)">' + d.items.length + ' <small class="muted" style="font-size:13px;font-weight:500">item sarana & peralatan diusulkan</small></div>' +
      '<table class="tbl" style="margin-top:12px"><thead><tr><th>Bagian</th><th class="r">Kategori</th><th class="r">Item</th></tr></thead><tbody>' +
      bagOrder.map(b => '<tr><td>' + esc(b) + '</td><td class="r">' + perBag[b].kat + '</td><td class="r"><b>' + perBag[b].n + '</b></td></tr>').join('') + '</tbody></table></div>' +
      '<div class="card-foot" style="flex-direction:column;align-items:stretch"><button class="btn btn-primary btn-block" style="height:42px" id="btnKirim" ' + (siap ? '' : 'disabled') + '>' + icon('send', 'sm') + (sent ? 'Sudah Dikirim' : 'Kirim Usulan ke Direktorat') + '</button>' +
      '<a class="btn btn-text btn-block" href="#/pendataan">' + icon('arrowl', 'sm') + 'Periksa Kembali Daftar Kategori</a></div></div></div>';
    if (window.matchMedia('(max-width: 1023px)').matches) $('#kgrid').style.gridTemplateColumns = 'minmax(0,1fr)';
    if ($('#btnXls')) $('#btnXls').onclick = e => Operator.downloadExcel(d.periode.id_periode, e.currentTarget);
    if ($('#btnKep')) $('#btnKep').onclick = () => Operator.kepalaModal(d, { id_periode: d.periode.id_periode }, () => this.render());
    $('#btnKirim').onclick = () => {
      UI.modal({
        title: 'Konfirmasi Pengiriman Usulan', sub: 'Rencana Kebutuhan Sarpras · ' + d.periode.nama_periode, icon: 'send',
        body: '<div class="kv-box" style="margin-bottom:14px"><dl class="kv"><dt>Satuan Kerja</dt><dd>' + esc(d.kantor.nama_kantor) + '</dd><dt>Kepala Kantor</dt><dd>' + esc(pd.nama_kepala) + '</dd><dt>Volume Usulan</dt><dd style="color:var(--burnt)">' + d.items.length + ' item sarana & peralatan</dd></dl></div>' +
          '<p>Apakah data usulan telah dikoordinasikan secara final dan disetujui Kepala Kantor? Usulan akan langsung masuk ke rekapitulasi Direktorat Sarana dan Prasarana Basarnas.</p>',
        buttons: [{ label: 'Batal' }, { label: 'Ya, Kirim Usulan Sekarang', cls: 'btn-primary', icon: 'checkc', onClick: async (btn) => {
          busy(btn, true, 'Mengirim…');
          const r = await API.call('pendataanKirim', { id_periode: d.periode.id_periode });
          busy(btn, false);
          if (!r.success) { toast(r.message, 'error'); return false; }
          toast(r.message); this.render();
        } }]
      });
    };
    function chk(ok, title, sub, pct) {
      return '<div class="row" style="flex-wrap:nowrap;align-items:flex-start;gap:12px"><span style="color:' + (ok ? 'var(--ok)' : 'var(--burnt)') + '">' + icon(ok ? 'checkc' : 'alert') + '</span><div style="flex:1"><b>' + esc(title) + '</b><div class="small muted">' + esc(sub) + '</div>' +
        (pct !== undefined ? '<div style="margin-top:8px">' + progress(pct, ok ? 'ok' : '') + '</div>' : '') + '</div></div>';
    }
  }, { role: 'OPERATOR' });

  // ============================================================
  // RIWAYAT PENDATAAN & SALIN PERIODE
  // ============================================================
  App.route('/riwayat', async function () {
    const c = this.shell('riwayat');
    c.innerHTML = UI.loading();
    const r = await API.call('pendataanRiwayat', {});
    if (!r.success) { c.innerHTML = '<div class="alert alert-err">' + icon('alert') + '<div>' + esc(r.message) + '</div></div>'; return; }
    const rows = r.data, aktif = rows.find(x => x.periode.status === 'DIBUKA');
    const arsip = rows.filter(x => x.pendataan).length, kirim = rows.filter(x => x.pendataan && x.pendataan.status === 'DIKIRIM').length;
    c.innerHTML = this.pageHead({ eyebrow: 'Arsip Pendataan · ' + esc(this.user.nama_kantor), title: 'Riwayat Pendataan Usulan Kebutuhan', desc: 'Data periode sebelumnya bersifat baca-saja. Anda dapat menyalin data periode lalu sebagai DRAFT ke periode yang sedang dibuka.',
      actions: '<div class="card row" style="padding:10px 14px;gap:10px"><div class="ico-box navy">' + icon('file') + '</div><div><div class="label-sm">Total Arsip</div><b style="font-size:16px">' + arsip + ' Periode</b></div></div>' +
        '<div class="card row" style="padding:10px 14px;gap:10px"><div class="ico-box orange">' + icon('checkc') + '</div><div><div class="label-sm">Telah Dikirim</div><b style="font-size:16px">' + kirim + ' Periode</b></div></div>' }) +
      '<div class="card"><div class="table-wrap"><table class="tbl"><thead><tr><th>Periode Anggaran</th><th class="c">Status</th><th>Waktu & Pengirim</th><th>Pengesah (Kepala Kantor)</th><th class="r">Total Item</th><th class="c">Aksi</th></tr></thead><tbody>' +
      (rows.length ? rows.map(x => {
        const p = x.periode, pd = x.pendataan, isAktif = p.status === 'DIBUKA';
        return '<tr><td><div class="row" style="gap:10px;flex-wrap:nowrap"><div class="ico-box" style="width:34px;height:34px">' + icon(isAktif ? 'calendar' : 'file', 'sm') + '</div><div><b>' + esc(p.nama_periode) + '</b> ' + (isAktif ? '<span class="badge b-buka">Periode Berjalan</span>' : badge(p.status)) +
          '<div class="xs muted">Template v' + esc(p.template_versi) + (p.batas_pengisian ? ' · batas ' + fmt.dateOnly(p.batas_pengisian) : '') + '</div></div></div></td>' +
          '<td class="c">' + (pd ? badge(pd.status) : badge('BELUM')) + '</td>' +
          '<td class="small">' + (pd && pd.status === 'DIKIRIM' ? fmt.dt(pd.dikirim_pada) + '<div class="xs muted">oleh ' + esc(pd.dikirim_oleh) + '</div>' : pd ? '<i>Belum dikirim</i><div class="xs muted">diubah ' + fmt.dt(pd.disimpan_terakhir) + '</div>' : '–') + '</td>' +
          '<td class="small">' + (pd && pd.nama_kepala ? esc(pd.nama_kepala) + '<div class="xs muted tnum">NIP ' + esc(pd.nip_kepala) + '</div>' : '–') + '</td>' +
          '<td class="r"><b>' + x.jumlah_item + '</b> item</td>' +
          '<td class="c nowrap"><a class="btn btn-ghost btn-icon btn-sm" title="Lihat" href="' + (isAktif ? '#/pendataan' : '#/riwayat/' + encodeURIComponent(p.id_periode)) + '">' + icon('eye', 'sm') + '</a> ' +
          '<button class="btn btn-navy btn-icon btn-sm" title="Unduh Excel (hanya DIKIRIM)" data-xls="' + esc(p.id_periode) + '" ' + (pd && pd.status === 'DIKIRIM' ? '' : 'disabled') + '>' + icon('sheet', 'sm') + '</button> ' +
          '<button class="btn btn-primary btn-icon btn-sm" title="Salin ke periode berjalan" data-salin="' + esc(p.id_periode) + '" ' + (aktif && !isAktif && pd && x.jumlah_item ? '' : 'disabled') + '>' + icon('copy', 'sm') + '</button></td></tr>';
      }).join('') : '<tr><td colspan="6">' + UI.emptyState('Belum ada periode.', 'calendar') + '</td></tr>') + '</tbody></table></div>' +
      '<div class="pager"><span>' + icon('info', 'sm') + ' Salinan dibuat sebagai DRAFT; periode asal tidak berubah; tanda Selesai Ditinjau direset.</span></div></div>';
    $$('[data-xls]').forEach(b => b.onclick = () => Operator.downloadExcel(b.dataset.xls, b));
    $$('[data-salin]').forEach(b => b.onclick = () => salin(b.dataset.salin, false));
    const salin = async (idAsal, timpa) => {
      const asal = rows.find(x => x.periode.id_periode === idAsal);
      if (!timpa) {
        const ok = await UI.confirmDialog({ title: 'Salin dari ' + asal.periode.nama_periode + '?', icon: 'copy', sub: 'Tujuan: ' + aktif.periode.nama_periode,
          body: '<p><b>' + asal.jumlah_item + ' item</b> usulan beserta identitas Kepala Kantor akan disalin sebagai DRAFT ke periode berjalan. Item yang tidak ada lagi di template baru tidak ikut tersalin.</p>', ok: 'Salin Data' });
        if (!ok) return;
      }
      const r2 = await API.call('pendataanSalin', { id_periode_asal: idAsal, timpa });
      if (!r2.success) return toast(r2.message, 'error');
      if (r2.data && r2.data.perlu_konfirmasi) {
        const ok = await UI.confirmDialog({ title: 'Timpa data periode berjalan?', icon: 'alert', body: '<p>Periode berjalan sudah berisi <b>' + r2.data.jumlah_item_ada + ' item</b> (status ' + esc(r2.data.status) + '). Menyalin akan <b>mengganti seluruh isian</b> periode berjalan dengan data ' + esc(asal.periode.nama_periode) + '.</p>', ok: 'Ya, Timpa', okCls: 'btn-danger' });
        if (ok) return salin(idAsal, true);
        return;
      }
      UI.modal({ title: 'Penyalinan selesai', icon: 'checkc', body: '<p>' + esc(r2.message) + '</p>' + (r2.data.dilewati && r2.data.dilewati.length ? '<div class="kv-box small"><b>Tidak tersalin:</b><ul>' + r2.data.dilewati.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul></div>' : ''),
        buttons: [{ label: 'Buka Pendataan', cls: 'btn-primary', onClick: () => App.go('#/pendataan') }] });
    };
  }, { role: 'OPERATOR' });

  App.route('/riwayat/:id', async function (id) {
    const c = this.shell('riwayat');
    c.innerHTML = UI.loading();
    const d = await Pendataan.load({ id_periode: id });
    const pd = d.pendataan;
    let only = true;
    const draw = () => {
      c.innerHTML = this.printKop('Usulan Kebutuhan ' + d.kantor.nama_kantor, d.periode.nama_periode) +
        this.pageHead({ crumbs: '<a href="#/riwayat">Riwayat Pendataan</a> › <b>' + esc(d.periode.nama_periode) + '</b>', eyebrow: pd ? badge(pd.status) : badge('BELUM'),
          title: 'Detail Usulan ' + d.periode.nama_periode + ' — ' + d.kantor.nama_kantor,
          desc: pd ? (pd.status === 'DIKIRIM' ? 'Dikirim ' + fmt.dt(pd.dikirim_pada) + ' oleh ' + esc(pd.dikirim_oleh) : 'Belum dikirim · terakhir diubah ' + fmt.dt(pd.disimpan_terakhir)) : 'Tidak ada data pada periode ini.',
          actions: '<a class="btn btn-ghost" href="#/riwayat">' + icon('arrowl', 'sm') + 'Kembali</a><button class="btn btn-ghost" onclick="window.print()">' + icon('print', 'sm') + 'Cetak</button>' +
            '<button class="btn btn-navy" id="btnX" ' + (pd && pd.status === 'DIKIRIM' ? '' : 'disabled') + '>' + icon('sheet', 'sm') + 'Unduh Excel Resmi</button>' }) +
        '<div class="alert alert-warn" style="margin-bottom:16px">' + icon('lock') + '<div><b>Mode baca-saja</b>Data periode ini dikunci untuk arsip. Gunakan menu Riwayat → Salin untuk memakai ulang data pada periode berjalan.</div></div>' +
        '<div class="grid g2" style="margin-bottom:16px"><div class="card card-pad"><div class="label-sm" style="margin-bottom:10px">' + icon('shieldok', 'sm') + ' Identitas Pengesah</div><div class="grid g3" style="gap:10px">' +
        ['Kepala Kantor SAR', 'NIP', 'Pangkat / Golongan'].map((l, i) => '<div class="kv-box"><div class="xs muted">' + l + '</div><b class="small tnum">' + esc(pd ? [pd.nama_kepala, pd.nip_kepala, pd.pangkat_golongan_kepala][i] || '–' : '–') + '</b></div>').join('') + '</div></div>' +
        '<div class="card card-pad"><div class="label-sm">' + icon('package', 'sm') + ' Ringkasan Kebutuhan</div><div class="m-val" style="font-size:30px;line-height:40px;font-weight:600;color:var(--navy)">' + d.items.length + ' <small style="font-size:13px;color:var(--muted);font-weight:500">item diusulkan</small></div></div></div>' +
        '<div class="card"><div class="card-head"><h3>' + icon('layout') + 'Matriks Usulan (Kolom A s/d K)</h3><div class="seg no-print"><button class="' + (only ? 'on' : '') + '" data-o="1">Hanya yang diusulkan</button><button class="' + (only ? '' : 'on') + '" data-o="0">Seluruh template</button></div></div>' +
        Pendataan.fullTable(d.tpl, d.itemMap, { hanyaTerisi: only }) + '</div>';
      $$('[data-o]').forEach(b => b.onclick = () => { only = b.dataset.o === '1'; draw(); });
      $('#btnX').onclick = () => Excel.downloadKantor(d.tpl, d.kantor, d.periode, d.itemMap, pd);
    };
    draw();
  }, { role: 'OPERATOR' });

  global.Operator = Operator;
})(window);
