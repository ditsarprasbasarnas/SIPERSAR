/* ============================================================
   SIPERSAR — admin.js
   Dashboard nasional, Kantor SAR, Akun Operator, Template, Periode,
   Riwayat Perubahan, dan mode sunting usulan oleh Admin.
   ============================================================ */
(function (global) {
  'use strict';
  const { icon, esc, $, $$, fmt, toast, busy, badge, progress } = UI;
  const err = (c, m) => { c.innerHTML = '<div class="alert alert-err">' + icon('alert') + '<div>' + esc(m) + '</div></div>'; };

  /** Pager klien sederhana */
  function pager(total, page, size, onGo, id) {
    const pages = Math.max(1, Math.ceil(total / size));
    let html = '<div class="pager" id="' + id + '"><span>Menampilkan ' + (total ? (page - 1) * size + 1 : 0) + '–' + Math.min(total, page * size) + ' dari ' + total + '</span><div class="row" style="gap:4px">';
    html += '<button class="btn btn-ghost btn-xs" data-pg="' + (page - 1) + '" ' + (page <= 1 ? 'disabled' : '') + '>' + icon('left', 'sm') + '</button>';
    for (let i = 1; i <= pages; i++) { if (pages > 7 && i > 2 && i < pages - 1 && Math.abs(i - page) > 1) { if (i === 3 || i === pages - 2) html += '<span>…</span>'; continue; } html += '<button class="btn btn-xs ' + (i === page ? 'btn-navy' : 'btn-ghost') + '" data-pg="' + i + '">' + i + '</button>'; }
    html += '<button class="btn btn-ghost btn-xs" data-pg="' + (page + 1) + '" ' + (page >= pages ? 'disabled' : '') + '>' + icon('right', 'sm') + '</button></div></div>';
    setTimeout(() => $$('#' + id + ' [data-pg]').forEach(b => b.onclick = () => onGo(Number(b.dataset.pg))), 0);
    return html;
  }

  async function periodeOptions(selected) {
    const r = await API.call('periodeList', {});
    const list = r.success ? r.data : [];
    return { list, html: list.map(p => '<option value="' + esc(p.id_periode) + '"' + (p.id_periode === selected ? ' selected' : '') + '>' + esc(p.nama_periode) + (p.status === 'DIBUKA' ? ' (DIBUKA)' : '') + '</option>').join('') };
  }

  // ============================================================
  // DASHBOARD NASIONAL
  // ============================================================
  App.route('/admin', async function () {
    const c = this.shell('dash');
    c.innerHTML = UI.loading('Memuat dashboard nasional…');
    const idp = this.query.get('p') || App.lapPeriode || '';
    const [r, po] = await Promise.all([API.call('dashboardAdmin', { id_periode: idp }), periodeOptions(idp)]);
    if (!r.success) return err(c, r.message);
    const d = r.data, s = d.ringkasan, p = d.periode;
    if (p) App.lapPeriode = p.id_periode;
    const pct = n => s.total ? Math.round(n / s.total * 1000) / 10 : 0;
    const totalRev = d.kantor.reduce((a, k) => a + (k.kategori_ditinjau || 0), 0), maxRev = s.total * (d.total_kategori || 1);
    const belumList = d.kantor.filter(k => k.status === 'BELUM');
    c.innerHTML = this.pageHead({ eyebrow: 'Direktorat Sarana dan Prasarana', title: 'Dashboard Pengawasan Nasional Usulan SAR',
      desc: 'Pemantauan progres entri usulan sarana & peralatan dari seluruh Kantor SAR' + (p ? ' — ' + esc(p.nama_periode) : '') + '.',
      actions: (po.list.length ? '<select class="input" id="selP" style="width:auto">' + po.html + '</select>' : '') + '<button class="btn btn-ghost" id="btnMx">' + icon('download', 'sm') + 'Ekspor Matriks Progres</button>' }) +
      (!p ? '<div class="alert alert-warn" style="margin-bottom:16px">' + icon('calendar') + '<div><b>Belum ada periode</b>Buat dan buka periode pendataan di menu <a href="#/admin/periode">Periode</a>.</div></div>' : '') +
      '<div class="grid g4" style="margin-bottom:16px">' +
      metric('accent-navy', 'Cakupan Wilayah', s.total, 'Kantor SAR aktif', 'building', '100% satuan kerja terdaftar') +
      metric('accent-ok', 'Dikirim (Usulan Final)', s.dikirim, 'Kantor SAR', 'checkc', pct(s.dikirim) + '% telah mengirim', 'var(--ok)') +
      metric('accent-blue', 'Draft (Sedang Mengisi)', s.draft, 'Kantor SAR', 'edit', pct(s.draft) + '% masih draft', 'var(--draft)') +
      metric('accent-gray', 'Belum Mengisi', s.belum, 'Kantor SAR', 'clock', belumList.slice(0, 2).map(k => k.nama_kantor.replace(/^Kantor SAR /i, '')).join(', ') + (belumList.length > 2 ? ' +' + (belumList.length - 2) : '') || '–') + '</div>' +
      (p ? '<div class="grid" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);margin-bottom:16px" id="g2">' +
        '<div class="card"><div class="card-head"><h3>' + icon('calendar') + 'Status Periode Anggaran</h3>' + badge(p.status) + '</div><div class="card-body stack">' +
        '<div class="kv-box row" style="gap:14px"><div class="ico-box orange">' + icon('clock') + '</div><div><div class="label-sm">' + esc(p.nama_periode) + ' · Template v' + esc(p.template_versi) + '</div>' +
        '<b style="font-size:17px">' + (p.batas_pengisian ? 'Batas pengisian ' + fmt.dateOnly(p.batas_pengisian) : 'Batas pengisian belum ditentukan') + '</b>' +
        (p.batas_pengisian && p.status === 'DIBUKA' ? '<div class="small" style="color:var(--burnt);font-weight:600">' + (fmt.sisaHari(p.batas_pengisian) >= 0 ? 'Tersisa ' + fmt.sisaHari(p.batas_pengisian) + ' hari' : 'Lewat ' + (-fmt.sisaHari(p.batas_pengisian)) + ' hari') + '</div>' : '') + '</div></div>' +
        '<div><div class="row" style="justify-content:space-between"><b class="small">Cakupan kategori nasional selesai ditinjau</b><span class="small muted">' + fmt.num(totalRev) + ' / ' + fmt.num(maxRev) + '</span></div><div style="margin-top:6px">' + progress(maxRev ? totalRev / maxRev * 100 : 0, 'navy') + '</div></div>' +
        '<div class="row" style="justify-content:space-between;border-top:1px solid var(--border);padding-top:14px"><span class="small muted">' + icon('info', 'sm') + ' Menutup periode mengunci isian seluruh Operator.</span><div class="row">' +
        '<a class="btn btn-ghost btn-sm" href="#/admin/periode">' + icon('edit', 'sm') + 'Ubah Batas Waktu</a>' +
        (p.status === 'DIBUKA' ? '<button class="btn btn-danger btn-sm" id="btnTutup">' + icon('lock', 'sm') + 'Tutup Periode</button>' : '<button class="btn btn-primary btn-sm" id="btnBuka">' + icon('power', 'sm') + 'Buka Periode</button>') + '</div></div></div></div>' +
        '<div class="card"><div class="card-head"><h3>' + icon('chart') + 'Distribusi Status Nasional</h3><span class="small muted">N = ' + s.total + ' Kantor</span></div><div class="card-body row" style="gap:20px;flex-wrap:nowrap">' +
        '<div class="donut" style="background:conic-gradient(#16A34A 0 ' + pct(s.dikirim) + '%, #2563EB ' + pct(s.dikirim) + '% ' + (pct(s.dikirim) + pct(s.draft)) + '%, #CBD5E1 ' + (pct(s.dikirim) + pct(s.draft)) + '% 100%)"><div class="d-center"><b>' + pct(s.dikirim) + '%</b><span>Tuntas</span></div></div>' +
        '<div class="stack" style="gap:8px;flex:1">' + [['#16A34A', 'Dikirim (Final)', s.dikirim], ['#2563EB', 'Draft', s.draft], ['#CBD5E1', 'Belum Mengisi', s.belum]].map(x => '<div class="legend-row"><i style="background:' + x[0] + '"></i><span class="small">' + x[1] + '</span><b>' + x[2] + '</b><span class="xs muted" style="width:44px;text-align:right">' + pct(x[2]) + '%</span></div>').join('') + '</div></div>' +
        (s.belum + s.draft ? '<div class="card-foot" style="justify-content:flex-start"><span class="small" style="color:var(--warn)">' + icon('alert', 'sm') + ' ' + (s.belum + s.draft) + ' Kantor SAR belum finalisasi pengiriman.</span></div>' : '') + '</div></div>' : '') +
      '<div class="card"><div class="card-head"><div><h3>Tabel Pemantauan Kantor SAR <span class="chip">Urutan Master</span></h3><div class="small muted">Klik ikon mata untuk melihat rincian usulan, atau ikon pensil untuk menyunting (Mode Admin).</div></div>' +
      '<div class="row"><div class="input-icon">' + icon('search', 'sm') + '<input class="input" id="q" placeholder="Cari nama Kantor SAR…" style="width:220px"></div>' +
      '<select class="input" id="fs" style="width:auto"><option value="">Semua status (' + s.total + ')</option><option value="DIKIRIM">Dikirim (' + s.dikirim + ')</option><option value="DRAFT">Draft (' + s.draft + ')</option><option value="BELUM">Belum Mengisi (' + s.belum + ')</option></select>' +
      '<button class="btn btn-ghost btn-icon" id="btnRef" title="Muat ulang">' + icon('refresh', 'sm') + '</button></div></div><div id="tblK"></div></div>';
    if ($('#g2') && window.matchMedia('(max-width: 1023px)').matches) $('#g2').style.gridTemplateColumns = 'minmax(0,1fr)';
    if ($('#selP')) $('#selP').onchange = e => { App.lapPeriode = e.target.value; this.go('#/admin?p=' + encodeURIComponent(e.target.value)); };
    $('#btnRef').onclick = () => this.render();
    let page = 1;
    const draw = () => {
      const q = $('#q').value.trim().toLowerCase(), fs = $('#fs').value;
      const rows = d.kantor.filter(k => (!q || k.nama_kantor.toLowerCase().indexOf(q) >= 0) && (!fs || k.status === fs));
      const size = 15, view = rows.slice((page - 1) * size, page * size);
      $('#tblK').innerHTML = '<div class="table-wrap"><table class="tbl"><thead><tr><th class="c">No.</th><th>Nama Kantor SAR</th><th class="c">Status Usulan</th><th>Progres Kategori</th><th class="r">Total Item</th><th>Terakhir Disimpan</th><th class="c">Aksi</th></tr></thead><tbody>' +
        (view.length ? view.map(k => '<tr><td class="c muted">' + String(k.no_urut).padStart(2, '0') + '</td><td><div class="row" style="gap:10px;flex-wrap:nowrap"><span class="avatar" style="width:30px;height:30px;font-size:11px;background:#EEF2F7;color:var(--navy);border-radius:6px">' + esc(fmt.initials(k.nama_kantor.replace(/^Kantor SAR /i, ''))) + '</span><b>' + esc(k.nama_kantor) + '</b></div></td>' +
          '<td class="c">' + badge(k.status) + '</td><td><div class="mini-prog">' + progress(k.total_kategori ? k.kategori_ditinjau / k.total_kategori * 100 : 0, 'sm' + (k.kategori_ditinjau === k.total_kategori ? ' ok' : '')) + '<span class="xs muted nowrap">' + (k.kategori_ditinjau || 0) + '/' + k.total_kategori + '</span></div></td>' +
          '<td class="r"><b>' + k.jumlah_item + '</b> <span class="muted small">item</span></td>' +
          '<td class="small">' + (k.disimpan_terakhir ? fmt.dt(k.disimpan_terakhir) + '<div class="xs muted">oleh ' + esc(k.disimpan_oleh) + '</div>' : '<i class="muted">Belum ada aktivitas</i>') + '</td>' +
          '<td class="c nowrap"><a class="btn btn-ghost btn-icon btn-sm" title="Lihat rincian" href="#/admin/laporan/kantor?k=' + esc(k.id_kantor) + '">' + icon('eye', 'sm') + '</a> <a class="btn btn-ghost btn-icon btn-sm" title="Sunting (Mode Admin)" href="#/admin/edit/' + esc(k.id_kantor) + '">' + icon('edit', 'sm') + '</a></td></tr>').join('')
          : '<tr><td colspan="7">' + UI.emptyState('Tidak ada Kantor SAR sesuai filter.', 'building') + '</td></tr>') + '</tbody></table></div>' + pager(rows.length, page, size, (n) => { page = n; draw(); }, 'pgK');
    };
    $('#q').oninput = UI.debounce(() => { page = 1; draw(); }); $('#fs').onchange = () => { page = 1; draw(); };
    draw();
    const setStatus = async (status) => {
      const ok = await UI.confirmDialog({ title: (status === 'DIBUKA' ? 'Buka ' : 'Tutup ') + p.nama_periode + '?', icon: status === 'DIBUKA' ? 'power' : 'lock',
        body: status === 'DIBUKA' ? '<p>Operator dapat mengisi dan mengirim pendataan pada periode ini.</p>' : '<p>Operator <b>tidak dapat lagi menyimpan atau mengirim</b> data. Tampilan Operator menjadi baca-saja. Admin tetap dapat mengelola data.</p>',
        ok: status === 'DIBUKA' ? 'Buka Periode' : 'Tutup Periode', okCls: status === 'DIBUKA' ? 'btn-primary' : 'btn-danger' });
      if (!ok) return;
      const r2 = await API.call('periodeSetStatus', { id_periode: p.id_periode, status });
      if (!r2.success) return toast(r2.message, 'error');
      toast(r2.message); await App.refreshMe(); this.render();
    };
    if ($('#btnTutup')) $('#btnTutup').onclick = () => setStatus('DITUTUP');
    if ($('#btnBuka')) $('#btnBuka').onclick = () => setStatus('DIBUKA');
    $('#btnMx').onclick = () => {
      const X = XLSXLite, S = X.STYLE, sh = new X.SheetBuilder('Progres');
      sh.set(1, 1, 'MATRIKS PROGRES PENDATAAN — ' + (p ? p.nama_periode : ''), S.title).merge(1, 1, 1, 8);
      ['No', 'Nama Kantor SAR', 'Status', 'Kategori Ditinjau', 'Total Kategori', 'Jumlah Item', 'Terakhir Disimpan', 'Oleh'].forEach((h, i) => sh.set(3, i + 1, h, S.header));
      d.kantor.forEach((k, i) => { const r0 = 4 + i; [k.no_urut, k.nama_kantor, k.status === 'BELUM' ? 'BELUM MENGISI' : k.status, k.kategori_ditinjau, k.total_kategori, k.jumlah_item, k.disimpan_terakhir ? fmt.dt(k.disimpan_terakhir) : '', k.disimpan_oleh].forEach((v, j) => sh.set(r0, j + 1, v === undefined ? '' : v, typeof v === 'number' ? S.cellNum : S.cell)); });
      sh.widths([6, 40, 16, 12, 12, 12, 24, 18]).freezeAt(4);
      X.download(X.buildWorkbook([sh]), 'Matriks_Progres_' + (p ? p.nama_periode.replace(/\W+/g, '_') : '') + '.xlsx');
    };
    function metric(acc, label, val, unit, ic, foot, color) {
      return '<div class="card ' + acc + ' metric"><div class="m-top"><span class="label-sm" style="' + (color ? 'color:' + color : '') + '">' + esc(label) + '</span><div class="m-ico">' + icon(ic) + '</div></div>' +
        '<div class="m-val" style="' + (color ? 'color:' + color : '') + '">' + fmt.num(val) + '<small>' + esc(unit) + '</small></div><div class="small muted" style="margin-top:auto">' + esc(foot) + '</div></div>';
    }
  }, { role: 'ADMIN' });

  // ============================================================
  // KANTOR SAR
  // ============================================================
  App.route('/admin/kantor', async function () {
    const c = this.shell('kantor');
    c.innerHTML = UI.loading();
    const r = await API.call('kantorList', {});
    if (!r.success) return err(c, r.message);
    const list = r.data, aktif = list.filter(k => k.aktif).length;
    c.innerHTML = this.pageHead({ eyebrow: 'Master Data', title: 'Master Data Kantor SAR', desc: 'Daftar resmi Kantor SAR sesuai urutan master. Nomor urut menentukan urutan pada dashboard, laporan, dan Excel nasional.',
      actions: '<button class="btn btn-ghost" id="btnImp">' + icon('upload', 'sm') + 'Impor Daftar</button><button class="btn btn-primary" id="btnAdd">' + icon('plus', 'sm') + 'Tambah Kantor SAR</button>' }) +
      '<div class="grid g3" style="margin-bottom:16px"><div class="card metric accent-navy"><span class="label-sm">Total Terdaftar</span><div class="m-val">' + list.length + '<small>Kantor</small></div></div>' +
      '<div class="card metric accent-ok"><span class="label-sm">Aktif</span><div class="m-val" style="color:var(--ok)">' + aktif + '<small>Kantor</small></div></div>' +
      '<div class="card metric accent-gray"><span class="label-sm">Nonaktif</span><div class="m-val">' + (list.length - aktif) + '<small>Kantor</small></div></div></div>' +
      (!list.length ? '<div class="alert alert-warn" style="margin-bottom:16px">' + icon('alert') + '<div><b>Daftar Kantor SAR masih kosong</b>Klik <b>Impor Daftar</b> lalu tempel 45 nama Kantor SAR sesuai urutan resmi (Nama_Kantor_SAR.xlsx), satu nama per baris.</div></div>' : '') +
      '<div class="card"><div class="toolbar"><div class="input-icon" style="flex:1;max-width:360px">' + icon('search', 'sm') + '<input class="input" id="q" placeholder="Cari nama Kantor SAR…"></div></div><div id="tbl"></div></div>' +
      '<div class="alert alert-info" style="margin-top:16px">' + icon('shield') + '<div class="small"><b>Catatan tata kelola</b>Menonaktifkan Kantor SAR tidak menghapus data maupun riwayat. Kantor nonaktif tidak muncul di registrasi dan tidak dihitung sebagai "Belum Mengisi".</div></div>';
    const draw = () => {
      const q = $('#q').value.trim().toLowerCase();
      const rows = list.filter(k => !q || k.nama_kantor.toLowerCase().indexOf(q) >= 0);
      $('#tbl').innerHTML = '<div class="table-wrap"><table class="tbl"><thead><tr><th class="c">No. Urut</th><th>Nama Kantor SAR</th><th class="c">Operator Aktif</th><th class="c">Status</th><th>Diubah</th><th class="c">Aksi</th></tr></thead><tbody>' +
        (rows.length ? rows.map(k => '<tr><td class="c"><b>' + String(k.no_urut).padStart(2, '0') + '</b></td><td><b>' + esc(k.nama_kantor) + '</b></td><td class="c">' + k.operator_aktif + ' <span class="muted xs">/ ' + k.jumlah_operator + '</span></td>' +
          '<td class="c">' + badge(k.aktif ? 'AKTIF' : 'NONAKTIF') + '</td><td class="small">' + fmt.dt(k.diubah_pada) + '</td>' +
          '<td class="c"><button class="btn btn-ghost btn-sm" data-ed="' + esc(k.id_kantor) + '">' + icon('edit', 'sm') + 'Ubah</button></td></tr>').join('') : '<tr><td colspan="6">' + UI.emptyState('Belum ada Kantor SAR.', 'building') + '</td></tr>') + '</tbody></table></div>';
      $$('[data-ed]').forEach(b => b.onclick = () => form(list.find(k => k.id_kantor === b.dataset.ed)));
    };
    $('#q').oninput = UI.debounce(draw); draw();
    const form = (k) => {
      UI.modal({ title: k ? 'Ubah Kantor SAR' : 'Tambah Kantor SAR Baru', sub: 'Direktorat Sarana dan Prasarana Basarnas', icon: 'building',
        body: '<form id="fK" class="stack" novalidate><div class="field"><label>Nomor Urut Master <span class="req">*</span></label><input class="input" type="number" min="1" max="' + (list.length + (k ? 0 : 1)) + '" name="no_urut" value="' + (k ? k.no_urut : list.length + 1) + '"><div class="field-hint">Menentukan posisi pada seluruh rekapitulasi. Kantor lain digeser otomatis.</div><div class="field-err"></div></div>' +
          '<div class="field"><label>Nama Resmi Kantor SAR <span class="req">*</span></label><input class="input" name="nama_kantor" maxlength="150" value="' + esc(k ? k.nama_kantor : '') + '" placeholder="mis. Kantor SAR Nabire"><div class="field-err"></div></div>' +
          '<label class="kv-box row" style="justify-content:space-between;cursor:pointer"><div><b>Status Operasional</b><div class="small muted">Aktif untuk periode pengusulan & registrasi</div></div><span class="switch"><input type="checkbox" name="aktif" ' + (!k || k.aktif ? 'checked' : '') + '><span></span></span></label></form>',
        buttons: [{ label: 'Batal' }, { label: 'Simpan', cls: 'btn-primary', icon: 'checkc', onClick: async (btn) => {
          const f = $('#fK'), v = { id_kantor: k ? k.id_kantor : '', no_urut: Number(f.no_urut.value), nama_kantor: f.nama_kantor.value.trim(), aktif: f.aktif.checked };
          if (!v.nama_kantor) { UI.fieldErrors(f, { nama_kantor: 'Wajib diisi.' }); return false; }
          busy(btn, true, 'Menyimpan…'); const r2 = await API.call('kantorSimpan', v); busy(btn, false);
          if (!r2.success) { UI.fieldErrors(f, r2.detail); toast(r2.message, 'error'); return false; }
          toast(r2.message); App.render();
        } }] });
    };
    $('#btnAdd').onclick = () => form(null);
    $('#btnImp').onclick = () => UI.modal({ title: 'Impor Daftar Kantor SAR', sub: 'Tempel nama sesuai urutan resmi master', icon: 'upload', size: 'lg',
      body: '<p class="small">Satu nama per baris. Nomor di depan (mis. "1. ") diabaikan. Nama yang sudah ada dilewati; nama baru ditambahkan di urutan terakhir sesuai urutan tempel.</p><textarea class="input" id="taK" rows="14" placeholder="Kantor SAR Banda Aceh&#10;Kantor SAR Medan&#10;…"></textarea><div class="small muted" id="cntK" style="margin-top:6px">0 nama</div>',
      onOpen: () => { const ta = $('#taK'); ta.oninput = () => { $('#cntK').textContent = ta.value.split(/\n/).filter(s => s.trim()).length + ' nama'; }; },
      buttons: [{ label: 'Batal' }, { label: 'Impor', cls: 'btn-primary', icon: 'upload', onClick: async (btn) => {
        busy(btn, true, 'Mengimpor…'); const r2 = await API.call('kantorImpor', { daftar: $('#taK').value }); busy(btn, false);
        if (!r2.success) { toast(r2.message, 'error'); return false; }
        toast(r2.message); App.render();
      } }] });
  }, { role: 'ADMIN' });

  // ============================================================
  // AKUN OPERATOR
  // ============================================================
  App.route('/admin/akun', async function () {
    const c = this.shell('akun');
    c.innerHTML = UI.loading();
    const r = await API.call('operatorList', {});
    if (!r.success) return err(c, r.message);
    const list = r.data;
    const kantorNames = [...new Set(list.map(u => u.nama_kantor))];
    c.innerHTML = this.pageHead({ eyebrow: 'Manajemen Akses', title: 'Akun Operator Kantor SAR', desc: 'Operator mendaftar mandiri dan langsung aktif. Admin dapat menonaktifkan/mengaktifkan akun dan mereset kata sandi; identitas (nama, NIP, jabatan, Kantor SAR) tidak dapat diubah Admin.' }) +
      '<div class="card"><div class="toolbar"><div class="input-icon" style="flex:1;min-width:220px">' + icon('search', 'sm') + '<input class="input" id="q" placeholder="Cari nama, username, NIP…"></div>' +
      '<select class="input" id="fk" style="width:auto;max-width:260px"><option value="">Semua Kantor SAR</option>' + kantorNames.map(n => '<option>' + esc(n) + '</option>').join('') + '</select>' +
      '<select class="input" id="fs" style="width:auto"><option value="">Semua status</option><option value="1">Aktif</option><option value="0">Nonaktif</option></select>' +
      '<span class="small muted">' + list.length + ' akun</span></div><div id="tbl"></div></div>';
    let page = 1;
    const draw = () => {
      const q = $('#q').value.trim().toLowerCase(), fk = $('#fk').value, fs = $('#fs').value;
      const rows = list.filter(u => (!q || (u.nama + ' ' + u.username + ' ' + u.nip).toLowerCase().indexOf(q) >= 0) && (!fk || u.nama_kantor === fk) && (!fs || String(u.aktif ? 1 : 0) === fs));
      const size = 20, view = rows.slice((page - 1) * size, page * size);
      $('#tbl').innerHTML = '<div class="table-wrap"><table class="tbl"><thead><tr><th>Operator</th><th>NIP</th><th>Jabatan</th><th>Kantor SAR</th><th class="c">Status</th><th>Login Terakhir</th><th class="c">Aksi</th></tr></thead><tbody>' +
        (view.length ? view.map(u => '<tr><td><div class="row" style="gap:10px;flex-wrap:nowrap"><div class="avatar" style="width:30px;height:30px;font-size:11px">' + esc(fmt.initials(u.nama)) + '</div><div><b>' + esc(u.nama) + '</b><div class="xs muted">@' + esc(u.username) + (u.email ? ' · ' + esc(u.email) : '') + '</div></div></div></td>' +
          '<td class="small tnum">' + esc(u.nip) + '</td><td class="small">' + esc(u.jabatan) + '</td><td class="small">' + esc(u.nama_kantor) + '</td>' +
          '<td class="c">' + badge(u.aktif ? 'AKTIF' : 'NONAKTIF') + (u.wajib_ganti_password ? '<div class="xs" style="color:var(--warn);margin-top:2px">wajib ganti sandi</div>' : '') + '</td>' +
          '<td class="small">' + (u.login_terakhir ? fmt.dt(u.login_terakhir) : '<i class="muted">belum pernah</i>') + '</td>' +
          '<td class="c nowrap"><button class="btn btn-ghost btn-sm" data-tg="' + esc(u.id_user) + '">' + icon('power', 'sm') + (u.aktif ? 'Nonaktifkan' : 'Aktifkan') + '</button> <button class="btn btn-ghost btn-sm" data-rs="' + esc(u.id_user) + '">' + icon('key', 'sm') + 'Reset Sandi</button></td></tr>').join('')
          : '<tr><td colspan="7">' + UI.emptyState('Belum ada akun Operator.', 'users') + '</td></tr>') + '</tbody></table></div>' + pager(rows.length, page, size, n => { page = n; draw(); }, 'pgA');
      $$('[data-tg]').forEach(b => b.onclick = async () => {
        const u = list.find(x => x.id_user === b.dataset.tg);
        const ok = await UI.confirmDialog({ title: (u.aktif ? 'Nonaktifkan ' : 'Aktifkan ') + u.nama + '?', icon: 'power', body: u.aktif ? '<p>Akun tidak dapat login dan sesi aktif diakhiri. <b>Data dan riwayat tidak dihapus.</b></p>' : '<p>Akun dapat login kembali.</p>', ok: u.aktif ? 'Nonaktifkan' : 'Aktifkan', okCls: u.aktif ? 'btn-danger' : 'btn-primary' });
        if (!ok) return;
        const r2 = await API.call('operatorSetAktif', { id_user: u.id_user, aktif: !u.aktif });
        if (!r2.success) return toast(r2.message, 'error');
        toast(r2.message); u.aktif = !u.aktif; draw();
      });
      $$('[data-rs]').forEach(b => b.onclick = async () => {
        const u = list.find(x => x.id_user === b.dataset.rs);
        const ok = await UI.confirmDialog({ title: 'Reset kata sandi ' + u.nama + '?', icon: 'key', body: '<p>Sistem membuat <b>kata sandi sementara</b> yang hanya ditampilkan sekali. Operator wajib menggantinya saat login berikutnya. Sesi aktif operator akan diakhiri.</p>', ok: 'Reset Kata Sandi' });
        if (!ok) return;
        const r2 = await API.call('operatorResetPassword', { id_user: u.id_user });
        if (!r2.success) return toast(r2.message, 'error');
        u.wajib_ganti_password = true; draw();
        UI.modal({ title: 'Kata sandi sementara', sub: '@' + r2.data.username + ' · ' + u.nama_kantor, icon: 'key', dismiss: false,
          body: '<p class="small">Sampaikan secara pribadi kepada <b>' + esc(u.nama) + '</b>. Kata sandi ini <b>tidak akan ditampilkan lagi</b>.</p><div class="temp-pw">' + esc(r2.data.password_sementara) + '</div>',
          buttons: [{ label: 'Salin', icon: 'copy', close: false, onClick: () => UI.copyText(r2.data.password_sementara) }, { label: 'Sudah Dicatat', cls: 'btn-navy' }] });
      });
    };
    $('#q').oninput = UI.debounce(() => { page = 1; draw(); }); $('#fk').onchange = $('#fs').onchange = () => { page = 1; draw(); };
    draw();
  }, { role: 'ADMIN' });

  // ============================================================
  // TEMPLATE
  // ============================================================
  App.route('/admin/template', async function () {
    const c = this.shell('template');
    c.innerHTML = UI.loading();
    const r = await API.call('templateList', {});
    if (!r.success) return err(c, r.message);
    const list = r.data, terbaru = list[0];
    c.innerHTML = this.pageHead({ eyebrow: 'Direktorat Sarana & Prasarana', title: 'Master Template Usulan Kebutuhan', desc: 'Template resmi menstandarkan nomenklatur, hierarki, dan satuan. Template yang sudah dipakai periode tidak diubah; unggahan baru selalu menjadi versi baru.' }) +
      '<div class="alert alert-navy" style="margin-bottom:16px">' + icon('layout') + '<div><b>Aturan pembacaan baris template</b>Baris yang memiliki turunan = <b>JUDUL</b> (tidak diisi). Baris tanpa turunan = <b>ITEM</b> (diisi). Baris bersatuan yang seluruh turunannya tanpa satuan (mis. <i>Heavy Rescue Hydraulic Set</i> → <i>Rescue Ram</i>) = ITEM dengan <b>RINCIAN</b> isi paket. Bila turunannya bernomor (mis. <i>Rotary Wing Rescue</i> → <i>1 Light Helicopter, 2 Medium Helicopter</i>), induk menjadi JUDUL dan tiap turunan diusulkan terpisah dengan satuan induk. Kategori bertingkat yang seluruhnya tanpa satuan (master baris 277–408) diberi satuan otomatis <b>"Pcs"</b>; item lain tanpa satuan diberi <b>"Unit"</b>.</div></div>' +
      '<div class="grid" style="grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);margin-bottom:16px" id="tg">' +
      '<div class="card"><div class="card-head"><h3>' + icon('sheet') + 'Versi Template</h3><span class="small muted">' + list.length + ' versi</span></div><div class="card-body stack" style="gap:12px">' +
      list.map(t => '<div class="kv-box"><div class="row" style="justify-content:space-between;flex-wrap:nowrap;gap:12px"><div style="min-width:0"><b style="word-break:break-word">' + esc(t.nama) + '</b>' +
        '<div class="xs muted" style="margin-top:2px"><span class="badge b-navy nodot">Versi ' + t.versi + '</span> · diunggah ' + fmt.dt(t.diunggah_pada) + ' oleh ' + esc(t.diunggah_oleh) + '</div>' +
        '<div class="row xs" style="gap:6px;margin-top:8px"><span class="chip" style="height:24px">' + t.jumlah_item + ' item dapat diisi</span><span class="chip" style="height:24px">' + t.jumlah_kategori + ' kategori</span>' +
        (t.dipakai_periode.length ? '<span class="chip" style="height:24px;background:var(--ok-bg);color:var(--ok)">Dipakai: ' + esc(t.dipakai_periode.join(', ')) + '</span>' : '<span class="chip off" style="height:24px">Belum dipakai periode</span>') + '</div></div>' +
        '<div class="row" style="flex-wrap:nowrap"><button class="btn btn-ghost btn-sm" data-lihat="' + esc(t.id_template) + '">' + icon('eye', 'sm') + 'Struktur</button><button class="btn btn-ghost btn-sm" data-unduh="' + esc(t.id_template) + '">' + icon('download', 'sm') + '.xlsx</button></div></div></div>').join('') + '</div></div>' +
      '<div class="card"><div class="card-head"><h3>' + icon('upload') + 'Unggah Pembaruan Template</h3></div><div class="card-body stack">' +
      '<label class="drop" id="drop"><input type="file" id="file" accept=".xlsx" hidden><div class="ico-box orange" style="margin:0 auto 10px">' + icon('upload') + '</div><b>Seret & letakkan berkas Excel template (.xlsx)</b><div class="small muted" style="margin:6px 0 12px">Struktur kolom A–K, header, kelompok, bagian, kategori, item, dan satuan divalidasi sebelum dapat dipakai.</div><span class="btn btn-navy btn-sm">' + icon('file', 'sm') + 'Pilih Berkas dari Komputer</span></label>' +
      '<div class="small muted">' + icon('info', 'sm') + ' Kode item dibuat stabil dari hierarki nama, sehingga data dapat dicocokkan antarperiode saat disalin.</div></div></div></div>' +
      '<div id="hasil"></div><div id="struktur"></div>';
    if (window.matchMedia('(max-width: 1023px)').matches) $('#tg').style.gridTemplateColumns = 'minmax(0,1fr)';
    $$('[data-lihat]').forEach(b => b.onclick = async () => { const t = await API.template(b.dataset.lihat); showTree($('#struktur'), t.items, 'Struktur ' + t.template.nama + ' (v' + t.template.versi + ')'); $('#struktur').scrollIntoView({ behavior: 'smooth' }); });
    $$('[data-unduh]').forEach(b => b.onclick = async () => { const t = await API.template(b.dataset.unduh); Excel.downloadTemplateKosong(t, 'Template_SIPERSAR_v' + t.template.versi); });
    const drop = $('#drop'), file = $('#file');
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) handle(e.dataTransfer.files[0]); };
    file.onchange = () => { if (file.files[0]) handle(file.files[0]); file.value = ''; };

    async function handle(f) {
      const out = $('#hasil');
      if (!/\.xlsx$/i.test(f.name)) return toast('Gunakan berkas .xlsx (Excel 2007+).', 'error');
      if (f.size > 25 * 1024 * 1024) return toast('Berkas terlalu besar (maks 25 MB).', 'error');
      out.innerHTML = '<div class="card" style="margin-bottom:16px">' + UI.loading('Membaca ' + f.name + '…') + '</div>';
      let wb;
      try { wb = await XLSXLite.readWorkbook(await f.arrayBuffer()); } catch (e) { out.innerHTML = '<div class="alert alert-err" style="margin-bottom:16px">' + icon('alert') + '<div>' + esc(e.message) + '</div></div>'; return; }
      const cand = wb.sheets.filter(s => { for (const [, row] of s.rows) { if (String(row[0] || '').trim().toUpperCase() === 'NO' && /^NAMA SARANA/i.test(String(row[1] || '').trim())) return true; } return false; });
      const pick = async (sh) => {
        const rows = [];
        [...sh.rows.keys()].sort((a, b) => a - b).forEach(rn => { const v = sh.rows.get(rn); const vv = []; for (let i = 0; i < 11; i++) vv.push(v[i] === undefined ? '' : v[i]); if (vv.some(x => x !== '')) rows.push({ r: rn, v: vv }); });
        out.innerHTML = '<div class="card" style="margin-bottom:16px">' + UI.loading('Memvalidasi struktur di server…') + '</div>';
        const r2 = await API.call('templateValidasi', { rows });
        if (!r2.success) { out.innerHTML = '<div class="alert alert-err" style="margin-bottom:16px">' + icon('alert') + '<div>' + esc(r2.message) + '</div></div>'; return; }
        const v = r2.data, st = v.stats || {};
        out.innerHTML = '<div class="card" style="margin-bottom:16px"><div class="card-head"><div><h3>' + icon(v.valid ? 'checkc' : 'alert') + 'Hasil Verifikasi Struktur</h3><div class="small muted">' + esc(f.name) + ' · sheet "' + esc(sh.name) + '"</div></div>' + (v.valid ? '<span class="badge b-kirim">Valid</span>' : '<span class="badge b-tutup">' + v.errors.length + ' kesalahan</span>') + '</div><div class="card-body stack">' +
          (v.errors.length ? '<div class="alert alert-err">' + icon('alert') + '<div><b>Template ditolak</b><ul class="small" style="margin:4px 0 0;padding-left:18px">' + v.errors.slice(0, 40).map(e => '<li>' + esc(e) + '</li>').join('') + '</ul></div></div>' : '') +
          (v.valid ? '<div class="grid g4">' + [['Item dapat diisi', st.item], ['Kategori (unit tinjau)', st.kategori], ['Judul', st.judul], ['Rincian paket', st.rincian], ['Kelompok', st.kelompok], ['Bagian', st.bagian], ['Satuan otomatis "Pcs"', st.item_pcs], ['Satuan ikut induk / bawaan "Unit"', (st.item_satuan_induk || 0) + ' / ' + (st.item_satuan_bawaan || 0)]].map(x => '<div class="kv-box"><div class="label-sm">' + x[0] + '</div><b style="font-size:18px">' + (typeof x[1] === 'number' ? fmt.num(x[1]) : esc(x[1])) + '</b></div>').join('') + '</div>' : '') +
          (v.warnings.length ? '<div class="alert alert-warn">' + icon('alert') + '<div><b>Peringatan (' + v.warnings.length + ')</b><ul class="small" style="margin:4px 0 0;padding-left:18px">' + v.warnings.slice(0, 30).map(e => '<li>' + esc(e) + '</li>').join('') + '</ul></div></div>' : '') +
          (v.banding ? '<div class="alert alert-info">' + icon('refresh') + '<div><b>Perbandingan dengan versi ' + v.banding.versi_pembanding + '</b>' + v.banding.item_sama + ' item sama (kode cocok) · ' + v.banding.item_baru + ' item baru · ' + v.banding.item_hilang.length + ' item tidak ada lagi' +
            (v.banding.item_hilang.length ? '<div class="xs" style="margin-top:4px">Tidak ada lagi: ' + esc(v.banding.item_hilang.slice(0, 25).join('; ')) + (v.banding.item_hilang.length > 25 ? ' …' : '') + '</div>' : '') + '</div></div>' : '') +
          (v.valid ? '<div class="grid g2"><div class="field"><label>Nama template <span class="req">*</span></label><input class="input" id="tNama" value="' + esc(f.name.replace(/\.xlsx$/i, '') + ' — ' + sh.name) + '" maxlength="150"></div><div class="field"><label>Catatan</label><input class="input" id="tCat" maxlength="300" placeholder="opsional"></div></div>' : '') +
          '</div>' + (v.valid ? '<div class="card-foot"><span class="small muted" style="margin-right:auto">' + icon('info', 'sm') + ' Versi baru dipakai saat Anda membuat periode baru dan memilih template ini.</span><button class="btn btn-primary" id="btnSaveT">' + icon('save', 'sm') + 'Simpan Sebagai Versi Template Baru</button></div>' : '') + '</div>';
        if (v.valid) {
          showTree($('#struktur'), v.items, 'Pratinjau Hierarki & Aturan Baris (unggahan)');
          $('#btnSaveT').onclick = async (e) => {
            const btn = e.currentTarget; busy(btn, true, 'Menyimpan…');
            const r3 = await API.call('templateSimpan', { rows, nama: $('#tNama').value, catatan: $('#tCat').value });
            busy(btn, false);
            if (!r3.success) return toast(r3.message, 'error');
            toast(r3.message); App.render();
          };
        }
      };
      if (cand.length === 1) return pick(cand[0]);
      const opts = (cand.length ? cand : wb.sheets);
      UI.modal({ title: 'Pilih sheet template', icon: 'sheet', body: '<p class="small">' + (cand.length ? 'Ditemukan beberapa sheet berformat template.' : 'Header "NO / NAMA SARANA…" tidak ditemukan otomatis. Pilih sheet yang akan divalidasi.') + '</p><select class="input" id="selS">' + opts.map((s, i) => '<option value="' + i + '">' + esc(s.name) + '</option>').join('') + '</select>',
        buttons: [{ label: 'Batal', onClick: () => { out.innerHTML = ''; } }, { label: 'Validasi', cls: 'btn-primary', onClick: () => { pick(opts[Number($('#selS').value)]); } }] });
    }
  }, { role: 'ADMIN' });

  function showTree(box, items, title) {
    let f = '', q = '';
    const draw = () => {
      const rows = items.filter(it => (!f || it.jenis_baris === f || (f === 'PCS' && it.sumber_satuan === 'PCS')) && (!q || it.nama_peralatan.toLowerCase().indexOf(q) >= 0));
      $('#trBody').innerHTML = rows.slice(0, 600).map(it => '<div class="tree-row" style="padding-left:' + (12 + it.level * 18) + 'px"><span class="tag ' + it.jenis_baris + '">' + it.jenis_baris + '</span>' +
        '<span style="flex:1;min-width:0;' + (it.jenis_baris === 'ITEM' || it.jenis_baris === 'RINCIAN' ? '' : 'font-weight:600;color:var(--navy)') + '">' + (it.penanda ? '<b class="muted">' + esc(it.penanda) + '</b> ' : '') + esc(it.nama_peralatan) + '</span>' +
        (it.jenis_baris === 'ITEM' ? '<span class="sat' + (it.satuan_otomatis ? ' auto' : '') + '">' + esc(it.satuan_kebutuhan || 'tanpa satuan') + ({ PCS: ' · otomatis', INDUK: ' · ikut induk', BAWAAN: ' · bawaan' }[it.sumber_satuan] || '') + '</span>' : '') +
        '<span class="xs muted" style="width:70px;text-align:right">baris ' + it.baris_master + '</span></div>').join('') + (rows.length > 600 ? '<div class="small muted" style="padding:10px">… ' + (rows.length - 600) + ' baris lagi, persempit pencarian.</div>' : '');
      $('#trCount').textContent = rows.length + ' baris';
    };
    box.innerHTML = '<div class="card"><div class="card-head"><div><h3>' + icon('layout') + esc(title) + '</h3><div class="small muted">Tag JUDUL tidak dapat diisi · ITEM diisi kolom E–K · RINCIAN keterangan isi paket</div></div>' +
      '<div class="row"><div class="input-icon">' + icon('search', 'sm') + '<input class="input" id="trQ" placeholder="Cari nama peralatan…" style="width:220px"></div>' +
      '<select class="input" id="trF" style="width:auto"><option value="">Semua jenis</option><option>KELOMPOK</option><option>BAGIAN</option><option>JUDUL</option><option>ITEM</option><option>RINCIAN</option><option value="PCS">Satuan otomatis Pcs</option></select><span class="chip" id="trCount"></span></div></div>' +
      '<div id="trBody" style="max-height:560px;overflow:auto"></div></div>';
    $('#trQ').oninput = UI.debounce(() => { q = $('#trQ').value.trim().toLowerCase(); draw(); });
    $('#trF').onchange = () => { f = $('#trF').value; draw(); };
    draw();
  }

  // ============================================================
  // PERIODE
  // ============================================================
  App.route('/admin/periode', async function () {
    const c = this.shell('periode');
    c.innerHTML = UI.loading();
    const [r, rt] = await Promise.all([API.call('periodeList', {}), API.call('templateList', {})]);
    if (!r.success) return err(c, r.message);
    const list = r.data, tpls = rt.success ? rt.data : [];
    c.innerHTML = this.pageHead({ eyebrow: 'Siklus Pendataan', title: 'Periode Pendataan', desc: 'Hanya satu periode yang dapat berstatus DIBUKA pada satu waktu. Periode yang ditutup mengunci isian Operator; Admin tetap dapat mengelola data.',
      actions: '<button class="btn btn-primary" id="btnNew">' + icon('plus', 'sm') + 'Buat Periode Baru</button>' }) +
      '<div class="card"><div class="table-wrap"><table class="tbl"><thead><tr><th>Periode</th><th class="c">Status</th><th>Template</th><th>Batas Pengisian</th><th>Dibuka / Ditutup</th><th class="r">Dikirim</th><th class="r">Draft</th><th class="c">Aksi</th></tr></thead><tbody>' +
      (list.length ? list.map(p => '<tr><td><b>' + esc(p.nama_periode) + '</b><div class="xs muted">Tahun ' + esc(p.tahun) + '</div></td>' +
        '<td class="c">' + (p.status === 'DITUTUP' && !p.tgl_buka ? badge('BELUMBUKA') : badge(p.status)) + '</td><td class="small">v' + esc(p.template_versi) + ' · ' + esc(p.template_nama) + '</td>' +
        '<td class="small">' + (p.batas_pengisian ? fmt.dateOnly(p.batas_pengisian) : '–') + '</td><td class="small">' + (p.tgl_buka ? fmt.dt(p.tgl_buka) : '–') + (p.tgl_tutup ? '<div class="xs muted">ditutup ' + fmt.dt(p.tgl_tutup) + '</div>' : '') + '</td>' +
        '<td class="r"><b>' + p.jumlah_dikirim + '</b></td><td class="r">' + p.jumlah_draft + '</td>' +
        '<td class="c nowrap">' + (p.status === 'DIBUKA' ? '<button class="btn btn-danger btn-sm" data-st="DITUTUP" data-id="' + esc(p.id_periode) + '">' + icon('lock', 'sm') + 'Tutup</button>' : '<button class="btn btn-primary btn-sm" data-st="DIBUKA" data-id="' + esc(p.id_periode) + '">' + icon('power', 'sm') + (p.tgl_buka ? 'Buka Kembali' : 'Buka') + '</button>') +
        ' <button class="btn btn-ghost btn-sm" data-ed="' + esc(p.id_periode) + '">' + icon('edit', 'sm') + 'Ubah</button></td></tr>').join('')
        : '<tr><td colspan="8">' + UI.emptyState('Belum ada periode. Klik "Buat Periode Baru".', 'calendar') + '</td></tr>') + '</tbody></table></div></div>';
    $$('[data-st]').forEach(b => b.onclick = async () => {
      const p = list.find(x => x.id_periode === b.dataset.id), st = b.dataset.st;
      const ok = await UI.confirmDialog({ title: (st === 'DIBUKA' ? 'Buka ' : 'Tutup ') + p.nama_periode + '?', icon: st === 'DIBUKA' ? 'power' : 'lock',
        body: st === 'DIBUKA' ? '<p>Operator dapat mengisi & mengirim pendataan. Periode lain yang masih DIBUKA harus ditutup terlebih dahulu.</p>' : '<p>Operator tidak dapat lagi menyimpan atau mengirim data (baca-saja).</p>',
        ok: st === 'DIBUKA' ? 'Buka Periode' : 'Tutup Periode', okCls: st === 'DIBUKA' ? 'btn-primary' : 'btn-danger' });
      if (!ok) return;
      const r2 = await API.call('periodeSetStatus', { id_periode: p.id_periode, status: st });
      if (!r2.success) return toast(r2.message, 'error');
      toast(r2.message); await App.refreshMe(); App.render();
    });
    const form = (p) => {
      const thn = new Date().getFullYear() + 1;
      UI.modal({ title: p ? 'Ubah Periode' : 'Buat Periode Baru', icon: 'calendar', sub: p ? p.nama_periode : 'Periode baru dibuat dalam keadaan belum dibuka',
        body: '<form id="fP" class="stack" novalidate><div class="grid g2"><div class="field"><label>Nama Periode <span class="req">*</span></label><input class="input" name="nama_periode" maxlength="100" value="' + esc(p ? p.nama_periode : 'Periode TA ' + thn) + '"><div class="field-err"></div></div>' +
          '<div class="field"><label>Tahun Anggaran <span class="req">*</span></label><input class="input" name="tahun" maxlength="4" inputmode="numeric" value="' + esc(p ? p.tahun : thn) + '"><div class="field-err"></div></div></div>' +
          '<div class="field"><label>Template <span class="req">*</span></label><select class="input" name="id_template">' + tpls.map(t => '<option value="' + esc(t.id_template) + '"' + ((p ? p.id_template : tpls[0] && tpls[0].id_template) === t.id_template ? ' selected' : '') + '>v' + t.versi + ' · ' + esc(t.nama) + ' (' + t.jumlah_item + ' item)</option>').join('') + '</select><div class="field-hint">Pakai ulang template periode sebelumnya atau pilih versi terbaru. Tidak dapat diganti bila periode sudah berisi data.</div><div class="field-err"></div></div>' +
          '<div class="field"><label>Batas Pengisian</label><input class="input" type="date" name="batas_pengisian" value="' + esc(p ? p.batas_pengisian : '') + '"><div class="field-hint">Informasi tenggat untuk Operator (periode tetap harus ditutup manual).</div><div class="field-err"></div></div></form>',
        buttons: [{ label: 'Batal' }, { label: 'Simpan', cls: 'btn-primary', icon: 'save', onClick: async (btn) => {
          const f = $('#fP'), v = UI.formData(f); if (p) v.id_periode = p.id_periode;
          busy(btn, true, 'Menyimpan…'); const r2 = await API.call('periodeSimpan', v); busy(btn, false);
          if (!r2.success) { UI.fieldErrors(f, r2.detail); toast(r2.message, 'error'); return false; }
          toast(r2.message); App.render();
        } }] });
    };
    $('#btnNew').onclick = () => { if (!tpls.length) return toast('Belum ada template.', 'error'); form(null); };
    $$('[data-ed]').forEach(b => b.onclick = () => form(list.find(x => x.id_periode === b.dataset.ed)));
  }, { role: 'ADMIN' });

  // ============================================================
  // RIWAYAT PERUBAHAN
  // ============================================================
  const AKSI = { TAMBAH_USULAN: 'Tambah usulan', UBAH_USULAN: 'Ubah usulan', HAPUS_USULAN: 'Hapus usulan', TANDAI_DITINJAU: 'Tandai ditinjau', BATAL_DITINJAU: 'Batal ditinjau', KIRIM: 'Kirim', STATUS: 'Status berubah',
    UBAH_KEPALA: 'Ubah Kepala Kantor', SALIN_PERIODE: 'Salin periode', MULAI_PENDATAAN: 'Mulai pendataan', REGISTRASI: 'Registrasi', UBAH_PROFIL: 'Ubah profil', GANTI_PASSWORD: 'Ganti sandi',
    RESET_PASSWORD: 'Reset sandi', AKTIFKAN_AKUN: 'Aktifkan akun', NONAKTIFKAN_AKUN: 'Nonaktifkan akun', TAMBAH_KANTOR: 'Tambah Kantor', UBAH_KANTOR: 'Ubah Kantor', UNGGAH_TEMPLATE: 'Unggah template',
    BUAT_PERIODE: 'Buat periode', UBAH_PERIODE: 'Ubah periode', BUKA_PERIODE: 'Buka periode', TUTUP_PERIODE: 'Tutup periode' };
  App.route('/admin/riwayat', async function () {
    const c = this.shell('riwayat');
    c.innerHTML = UI.loading();
    const [rk, po] = await Promise.all([API.call('kantorList', {}), periodeOptions('')]);
    const kantor = rk.success ? rk.data : [];
    c.innerHTML = this.pageHead({ eyebrow: 'Audit', title: 'Riwayat Perubahan Data', desc: 'Log seluruh perubahan oleh Admin maupun Operator: waktu, akun, Kantor SAR, item peralatan, nilai sebelum dan sesudah.' }) +
      '<div class="card"><div class="toolbar">' +
      '<select class="input" id="fk" style="width:auto;max-width:230px"><option value="">Semua Kantor SAR</option>' + kantor.map(k => '<option value="' + esc(k.id_kantor) + '">' + esc(k.nama_kantor) + '</option>').join('') + '</select>' +
      '<select class="input" id="fp" style="width:auto;max-width:200px"><option value="">Semua periode</option>' + po.html + '</select>' +
      '<select class="input" id="fu" style="width:auto;max-width:180px"><option value="">Semua akun</option></select>' +
      '<select class="input" id="fa" style="width:auto;max-width:180px"><option value="">Semua aksi</option>' + Object.keys(AKSI).map(a => '<option value="' + a + '">' + AKSI[a] + '</option>').join('') + '</select>' +
      '<input class="input" type="date" id="fd" style="width:auto" title="Dari tanggal"><input class="input" type="date" id="fs" style="width:auto" title="Sampai tanggal">' +
      '<div class="input-icon" style="flex:1;min-width:180px">' + icon('search', 'sm') + '<input class="input" id="fq" placeholder="Cari item / nilai…"></div></div><div id="tbl">' + UI.loading() + '</div></div>';
    let offset = 0; const limit = 100; let usersLoaded = false;
    const load = async () => {
      $('#tbl').innerHTML = UI.loading();
      const r = await API.call('riwayatList', { id_kantor: $('#fk').value, id_periode: $('#fp').value, username: $('#fu').value, aksi: $('#fa').value, dari: $('#fd').value, sampai: $('#fs').value, q: $('#fq').value, offset, limit });
      if (!r.success) return err($('#tbl'), r.message);
      const d = r.data;
      if (!usersLoaded) { $('#fu').innerHTML += d.usernames.map(u => '<option>' + esc(u) + '</option>').join(''); usersLoaded = true; }
      $('#tbl').innerHTML = '<div class="table-wrap"><table class="tbl"><thead><tr><th>Waktu</th><th>Akun</th><th>Kantor SAR</th><th>Item / Objek</th><th>Aksi</th><th class="c">Kolom</th><th>Nilai Sebelum</th><th>Nilai Sesudah</th></tr></thead><tbody>' +
        (d.rows.length ? d.rows.map(x => '<tr><td class="small nowrap">' + fmt.dt(x.waktu) + '<div class="xs muted">' + esc(x.periode) + '</div></td><td class="small"><b>' + esc(x.username) + '</b><div class="xs muted">' + esc(x.role) + '</div></td>' +
          '<td class="small">' + esc(x.kantor || '–') + '</td><td class="small" style="max-width:260px">' + esc(x.nama_item || '–') + '</td><td><span class="badge nodot ' + (/HAPUS|NONAKTIF|TUTUP/.test(x.aksi) ? 'b-tutup' : /KIRIM|TAMBAH|BUKA/.test(x.aksi) ? 'b-kirim' : 'b-draft') + '">' + esc(AKSI[x.aksi] || x.aksi) + '</span></td>' +
          '<td class="c"><span class="kode">' + esc(x.field) + '</span></td><td class="small" style="max-width:220px;color:var(--err);white-space:pre-wrap">' + esc(x.nilai_lama) + '</td><td class="small" style="max-width:220px;color:var(--ok);white-space:pre-wrap">' + esc(x.nilai_baru) + '</td></tr>').join('')
          : '<tr><td colspan="8">' + UI.emptyState('Tidak ada riwayat sesuai filter.', 'history') + '</td></tr>') + '</tbody></table></div>' +
        '<div class="pager"><span>Menampilkan ' + (d.total ? offset + 1 : 0) + '–' + Math.min(d.total, offset + limit) + ' dari ' + fmt.num(d.total) + ' catatan</span><div class="row" style="gap:4px"><button class="btn btn-ghost btn-xs" id="pv" ' + (offset ? '' : 'disabled') + '>' + icon('left', 'sm') + 'Sebelumnya</button><button class="btn btn-ghost btn-xs" id="nx" ' + (offset + limit < d.total ? '' : 'disabled') + '>Berikutnya' + icon('right', 'sm') + '</button></div></div>';
      $('#pv').onclick = () => { offset = Math.max(0, offset - limit); load(); };
      $('#nx').onclick = () => { offset += limit; load(); };
    };
    ['fk', 'fp', 'fu', 'fa', 'fd', 'fs'].forEach(id => $('#' + id).onchange = () => { offset = 0; load(); });
    $('#fq').oninput = UI.debounce(() => { offset = 0; load(); }, 400);
    load();
  }, { role: 'ADMIN' });

  // ============================================================
  // MODE SUNTING ADMIN
  // ============================================================
  App.route('/admin/edit/:kantor', async function (idk) {
    const c = this.shell('lap-kantor');
    await Pendataan.listPage(c, { mode: 'ADMIN', id_kantor: idk, id_periode: App.lapPeriode || '', base: '#/admin/edit/' + encodeURIComponent(idk) });
  }, { role: 'ADMIN' });
  App.route('/admin/edit/:kantor/:kode', async function (idk, kode) {
    const c = this.shell('lap-kantor');
    await Pendataan.formPage(c, { mode: 'ADMIN', id_kantor: idk, id_periode: App.lapPeriode || '', base: '#/admin/edit/' + encodeURIComponent(idk) }, kode, this.query.get('fokus'));
  }, { role: 'ADMIN' });

  global.AdminUI = { pager, periodeOptions };
})(window);
