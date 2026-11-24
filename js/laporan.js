/* ============================================================
   SIPERSAR — laporan.js
   Rekapitulasi Nasional, per Peralatan, per Kantor SAR
   (hanya Pendataan berstatus DIKIRIM yang dihitung)
   ============================================================ */
(function (global) {
  'use strict';
  const { icon, esc, $, $$, fmt, toast, busy, badge } = UI;
  const CACHE = {};

  async function loadLap(idp, force) {
    const key = idp || '_default';
    if (!force && CACHE[key]) return CACHE[key];
    const r = await API.call('laporanData', { id_periode: idp });
    if (!r.success) throw new Error(r.message);
    const lap = r.data;
    lap.tpl = await API.template(lap.periode.id_template);
    lap.agg = {}; lap.agregat.forEach(a => { lap.agg[a.kode_item] = a; });
    lap.kMap = {}; lap.kantor.forEach(k => { lap.kMap[k.id_kantor] = k; });
    lap.byItem = {}; lap.byKantor = {};
    lap.rincian.forEach(r0 => {
      const o = { id_kantor: r0[0], kode_item: r0[1], jml_kebutuhan: r0[2], rencana_alokasi: r0[3], jml_kondisi: r0[4], penempatan_saat_ini: r0[5], justifikasi: r0[6] };
      (lap.byItem[o.kode_item] = lap.byItem[o.kode_item] || []).push(o);
      (lap.byKantor[o.id_kantor] = lap.byKantor[o.id_kantor] || {})[o.kode_item] = o;
    });
    CACHE[key] = lap; CACHE[lap.periode.id_periode] = lap;
    App.lapPeriode = lap.periode.id_periode;
    return lap;
  }

  function shellLap(app, tab, lap, po, extraActions) {
    const c = $('#content');
    const tabs = [['nasional', 'chart', 'Rekap Nasional'], ['peralatan', 'package', 'Rekap per Peralatan'], ['kantor', 'building', 'Rekap per Kantor SAR']];
    const head = app.printKop(tabs.find(t => t[0] === tab)[2] + ' Usulan Kebutuhan SAR', lap.periode.nama_periode + ' · ' + lap.jumlah_dikirim + ' Kantor SAR DIKIRIM') +
      app.pageHead({ crumbs: 'Laporan & Rekapitulasi › <b>' + tabs.find(t => t[0] === tab)[2] + ' ' + esc(lap.periode.nama_periode) + '</b>', eyebrow: '<span class="badge b-navy nodot">Dokumen Resmi Basarnas</span>',
        title: { nasional: 'Laporan Rekapitulasi Nasional Usulan Kebutuhan SAR', peralatan: 'Rekapitulasi Kebutuhan per Nomenklatur Peralatan', kantor: 'Rekapitulasi per Satuan Kerja Kantor SAR' }[tab],
        desc: 'Konsolidasi usulan dari Kantor SAR berstatus <b>DIKIRIM</b> — ' + esc(lap.periode.nama_periode) + '.',
        actions: '<select class="input" id="selP" style="width:auto">' + po + '</select><button class="btn btn-ghost btn-icon" id="btnRf" title="Muat ulang data">' + icon('refresh', 'sm') + '</button>' +
          '<button class="btn btn-ghost" id="btnPrint">' + icon('print', 'sm') + 'Cetak</button>' + (extraActions || '') }) +
      '<div class="tabs">' + tabs.map(t => '<a href="#/admin/laporan/' + t[0] + '" class="' + (t[0] === tab ? 'active' : '') + '">' + icon(t[1], 'sm') + t[2] + (t[0] === 'kantor' ? ' <span class="chip" style="height:20px;font-size:10px">' + lap.jumlah_dikirim + '</span>' : '') + '</a>').join('') + '</div>' +
      '<div class="alert alert-info no-print" style="margin-bottom:16px">' + icon('info') + '<div style="flex:1"><b>Kriteria agregasi</b>Menghitung <b>' + lap.jumlah_dikirim + ' Kantor SAR berstatus DIKIRIM</b> dari ' + lap.jumlah_kantor_aktif + ' Kantor SAR aktif. Kantor berstatus DRAFT/Belum Mengisi tidak dihitung.</div>' +
      '<a href="#" id="lihatTunda" class="small nowrap" style="font-weight:600">Lihat ' + (lap.jumlah_kantor_aktif - lap.jumlah_dikirim) + ' Kantor tertunda →</a></div><div id="lapBody"></div>';
    c.innerHTML = head;
    $('#selP').onchange = e => { App.lapPeriode = e.target.value; app.render(); };
    $('#btnRf').onclick = async () => { await loadLap(lap.periode.id_periode, true); app.render(); };
    $('#lihatTunda').onclick = e => {
      e.preventDefault();
      const t = lap.kantor.filter(k => k.aktif && k.status !== 'DIKIRIM');
      UI.modal({ title: 'Kantor SAR belum DIKIRIM', sub: lap.periode.nama_periode, icon: 'clock', body: t.length ? '<table class="tbl"><tbody>' + t.map(k => '<tr><td class="muted">' + k.no_urut + '</td><td>' + esc(k.nama_kantor) + '</td><td class="r">' + badge(k.status) + '</td></tr>').join('') + '</tbody></table>' : '<p>Semua Kantor SAR aktif sudah mengirim.</p>', buttons: [{ label: 'Tutup', cls: 'btn-navy' }] });
    };
    return $('#lapBody');
  }

  async function prep(app, tab, extra) {
    const c = app.shell('lap-' + tab);
    c.innerHTML = UI.loading('Menghitung rekapitulasi…');
    let lap;
    try { lap = await loadLap(App.lapPeriode || ''); } catch (e) { c.innerHTML = '<div class="alert alert-warn">' + icon('alert') + '<div>' + esc(e.message) + '</div></div>'; return null; }
    const po = await AdminUI.periodeOptions(lap.periode.id_periode);
    const body = shellLap(app, tab, lap, po.html, extra);
    return { lap, body };
  }

  function bars(rows, max, unitFn) {
    if (!rows.length) return UI.emptyState('Belum ada data untuk grafik.', 'chart');
    return '<div class="bars">' + rows.map(r => '<div class="bar-row"><div class="bl"><span title="' + esc(r.label) + '">' + esc(r.label) + '</span><b>' + esc(unitFn(r)) + '</b></div><div class="bar-track"><i style="width:' + Math.max(2, r.value / max * 100) + '%"></i></div></div>').join('') + '</div>';
  }

  function excelBtn() { return '<button class="btn btn-primary" id="btnXls">' + icon('download', 'sm') + 'Unduh Excel Rekap Nasional (.xlsx)</button>'; }
  function bindExcel(lap) {
    const b = $('#btnXls'); if (!b) return;
    b.onclick = () => {
      if (!lap.jumlah_dikirim) return toast('Belum ada Kantor SAR berstatus DIKIRIM.', 'warn');
      busy(b, true, 'Menyusun berkas…');
      setTimeout(() => { try { Excel.downloadNasional(lap.tpl, lap); toast('Excel rekap nasional diunduh (' + (lap.jumlah_dikirim + 1) + ' sheet).'); } catch (e) { toast(e.message, 'error'); } busy(b, false); }, 30);
    };
  }

  // ============================================================
  // REKAP NASIONAL
  // ============================================================
  App.route('/admin/laporan/nasional', async function () {
    const p = await prep(this, 'nasional', excelBtn()); if (!p) return;
    const { lap, body } = p, tpl = lap.tpl;
    bindExcel(lap);
    const diusulkan = tpl.items.filter(it => lap.agg[it.kode_item]);
    const perSat = {}; diusulkan.forEach(it => { const u = it.satuan_kebutuhan || '(tanpa satuan)'; perSat[u] = (perSat[u] || 0) + lap.agg[it.kode_item].total_kebutuhan; });
    const perBag = {}; diusulkan.forEach(it => { perBag[it.bagian] = (perBag[it.bagian] || 0) + 1; });
    const topBag = Object.keys(perBag).sort((a, b) => perBag[b] - perBag[a])[0];
    const bagList = tpl.items.filter(it => it.jenis_baris === 'BAGIAN');
    body.innerHTML = '<div class="grid g4" style="margin-bottom:16px">' +
      '<div class="card metric accent-navy"><span class="label-sm">Kantor SAR Terhitung</span><div class="m-val">' + lap.jumlah_dikirim + '<small>/ ' + lap.jumlah_kantor_aktif + ' aktif</small></div><div class="small muted" style="margin-top:auto">' + (lap.jumlah_kantor_aktif ? Math.round(lap.jumlah_dikirim / lap.jumlah_kantor_aktif * 100) : 0) + '% partisipasi nasional</div></div>' +
      '<div class="card metric accent-orange"><span class="label-sm">Nomenklatur Diusulkan</span><div class="m-val">' + diusulkan.length + '<small>/ ' + tpl.items.filter(i => i.dapat_diisi).length + ' item</small></div><div class="small muted" style="margin-top:auto">jenis sarana & peralatan</div></div>' +
      '<div class="card metric accent-navy"><span class="label-sm">Total Kebutuhan per Satuan</span><div class="stack small" style="gap:4px;margin-top:4px">' + (Object.keys(perSat).length ? Object.keys(perSat).sort((a, b) => perSat[b] - perSat[a]).slice(0, 4).map(u => '<div class="row" style="justify-content:space-between"><span>' + esc(u) + '</span><b class="tnum" style="color:var(--navy)">' + fmt.num(perSat[u]) + '</b></div>').join('') : '<span class="muted">–</span>') + '</div></div>' +
      '<div class="card metric accent-orange"><span class="label-sm">Bagian Paling Banyak Diusulkan</span><b style="font-size:15px;color:var(--navy);margin-top:6px">' + esc(topBag || '–') + '</b><div class="small muted" style="margin-top:auto">' + (topBag ? perBag[topBag] + ' nomenklatur diusulkan' : '') + '</div></div></div>' +
      '<div class="card" style="margin-bottom:16px"><div class="toolbar"><div class="input-icon" style="flex:1;min-width:220px">' + icon('search', 'sm') + '<input class="input" id="q" placeholder="Cari nomenklatur…"></div>' +
      '<select class="input" id="fb" style="width:auto;max-width:300px"><option value="">Semua bagian</option>' + bagList.map(b => '<option value="' + esc(b.kode_item) + '">' + esc(b.kelompok.replace(/ PENCARIAN DAN PERTOLONGAN/, '') + ' · ' + b.penanda + ' ' + b.nama_peralatan) + '</option>').join('') + '</select>' +
      '<div class="seg" id="seg"><button class="on" data-v="1">Hanya yang diusulkan</button><button data-v="0">Seluruh template</button></div></div><div id="tblN"></div></div>' +
      '<div class="card"><div class="card-head"><div><div class="label-sm" style="color:var(--burnt)">Prioritas Volume</div><h3>Top 10 Nomenklatur dengan Total Kebutuhan Terbesar</h3></div><span class="chip">Dari ' + lap.jumlah_dikirim + ' Kantor SAR</span></div><div class="card-body" id="chartN"></div></div>';
    let only = true;
    const draw = () => {
      const q = $('#q').value.trim().toLowerCase(), fb = $('#fb').value;
      const keep = {};
      tpl.items.forEach(it => {
        if (!it.dapat_diisi) return;
        if (only && !lap.agg[it.kode_item]) return;
        if (q && it.nama_peralatan.toLowerCase().indexOf(q) < 0) return;
        if (fb && it.kode_bagian !== fb) return;
        let x = it; while (x) { keep[x.kode_item] = true; x = tpl.byKode[x.kode_induk]; }
      });
      const rows = tpl.items.filter(it => keep[it.kode_item] || (it.jenis_baris === 'RINCIAN' && keep[it.kode_induk] && !only));
      $('#tblN').innerHTML = rows.length ? '<div class="table-wrap" style="max-height:640px"><table class="tbl"><thead><tr><th class="c">No</th><th>Nomenklatur Sarana & Peralatan</th><th class="c">Satuan</th><th class="c">Kantor Pengusul</th><th class="r">Total Kebutuhan (E)</th><th class="r">Total Kondisi Saat Ini (H)</th></tr></thead><tbody>' +
        rows.map(it => {
          if (it.jenis_baris === 'KELOMPOK') return '<tr class="grp-dark"><td colspan="6">' + esc(it.nama_peralatan) + '</td></tr>';
          if (it.jenis_baris === 'BAGIAN') return '<tr class="grp"><td class="c">' + esc(it.penanda) + '</td><td colspan="5">' + esc(it.nama_peralatan) + '</td></tr>';
          const pad = 'padding-left:' + Math.max(0, (it.level - 2) * 14) + 'px';
          if (it.jenis_baris === 'JUDUL') return '<tr><td class="c muted small">' + esc(it.penanda) + '</td><td colspan="5"><b style="' + pad + ';display:inline-block;color:var(--navy)">' + esc(it.nama_peralatan) + '</b></td></tr>';
          if (it.jenis_baris === 'RINCIAN') return '<tr><td></td><td colspan="5" class="small muted"><span style="' + pad + '">' + esc(it.nama_peralatan) + '</span></td></tr>';
          const a = lap.agg[it.kode_item];
          return '<tr><td class="c muted small">' + esc(it.penanda) + '</td><td><span style="' + pad + ';display:inline-block">' + esc(it.nama_peralatan) + '</span></td><td class="c small">' + esc(it.satuan_kebutuhan) + '</td>' +
            '<td class="c">' + (a ? '<span class="chip" style="height:22px">' + a.jumlah_kantor + ' Kantor</span>' : '<span class="muted">–</span>') + '</td>' +
            '<td class="r"><b style="font-size:14px">' + (a ? fmt.num(a.total_kebutuhan) : '–') + '</b></td><td class="r">' + (a ? fmt.num(a.total_kondisi) : '–') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : UI.emptyState(lap.jumlah_dikirim ? 'Tidak ada nomenklatur sesuai filter.' : 'Belum ada Kantor SAR berstatus DIKIRIM pada periode ini.', 'chart');
    };
    $('#q').oninput = UI.debounce(draw); $('#fb').onchange = draw;
    $$('#seg button').forEach(b => b.onclick = () => { $$('#seg button').forEach(x => x.classList.remove('on')); b.classList.add('on'); only = b.dataset.v === '1'; draw(); });
    draw();
    const top = diusulkan.map(it => ({ label: it.nama_peralatan, value: lap.agg[it.kode_item].total_kebutuhan, unit: it.satuan_kebutuhan })).sort((a, b) => b.value - a.value).slice(0, 10);
    $('#chartN').innerHTML = bars(top, top.length ? top[0].value : 1, r => fmt.num(r.value) + ' ' + (r.unit || ''));
    $('#btnPrint').onclick = () => window.print();
  }, { role: 'ADMIN' });

  // ============================================================
  // REKAP PER PERALATAN
  // ============================================================
  App.route('/admin/laporan/peralatan', async function () {
    const p = await prep(this, 'peralatan'); if (!p) return;
    const { lap, body } = p, tpl = lap.tpl;
    const items = tpl.items.filter(it => lap.agg[it.kode_item]).map(it => Object.assign({ it }, lap.agg[it.kode_item]));
    const bagList = tpl.items.filter(it => it.jenis_baris === 'BAGIAN');
    const maxK = items.reduce((m, x) => Math.max(m, x.jumlah_kantor), 0);
    const defisit = items.reduce((s, x) => s + Math.max(0, x.total_kebutuhan), 0);
    body.innerHTML = '<div class="grid g3" style="margin-bottom:16px">' +
      '<div class="card metric accent-navy"><span class="label-sm">Total Nomenklatur Terusul</span><div class="m-val">' + items.length + '<small>item</small></div><div class="small muted" style="margin-top:auto">dari ' + tpl.items.filter(i => i.dapat_diisi).length + ' item dalam template</div></div>' +
      '<div class="card metric accent-orange"><span class="label-sm">Sebaran Pengusulan Tertinggi</span><div class="m-val" style="color:var(--burnt)">' + maxK + '<small>/ ' + lap.jumlah_dikirim + ' Kantor</small></div><div class="small muted" style="margin-top:auto">' + esc((items.find(x => x.jumlah_kantor === maxK) || { it: { nama_peralatan: '–' } }).it.nama_peralatan) + '</div></div>' +
      '<div class="card metric accent-navy"><span class="label-sm">Total Kuantitas Diusulkan</span><div class="m-val">' + fmt.num(defisit) + '<small>lintas satuan</small></div><div class="small muted" style="margin-top:auto">jumlah kolom E seluruh item</div></div></div>' +
      '<div class="card" style="margin-bottom:16px"><div class="toolbar"><div class="input-icon" style="flex:1;min-width:220px">' + icon('search', 'sm') + '<input class="input" id="q" placeholder="Cari nama alat…"></div>' +
      '<select class="input" id="fb" style="width:auto;max-width:280px"><option value="">Semua bagian</option>' + bagList.map(b => '<option value="' + esc(b.kode_item) + '">' + esc(b.penanda + ' ' + b.nama_peralatan) + '</option>').join('') + '</select>' +
      '<select class="input" id="so" style="width:auto"><option value="e">Urut: Kebutuhan terbanyak</option><option value="k">Urut: Kantor pengusul terbanyak</option><option value="t">Urut: Urutan template</option></select>' +
      '<button class="btn btn-ghost btn-sm" id="exAll">' + icon('down', 'sm') + 'Buka semua rincian</button></div><div id="tblP"></div></div>' +
      '<div class="card"><div class="card-head"><h3>Top 8 Peralatan Berdasarkan Jumlah Kantor SAR Pengusul</h3><span class="chip">' + esc(lap.periode.nama_periode) + '</span></div><div class="card-body" id="chartP"></div></div>';
    let page = 1, openAll = false, printing = false; const open = {};
    const draw = () => {
      const q = $('#q').value.trim().toLowerCase(), fb = $('#fb').value, so = $('#so').value;
      let rows = items.filter(x => (!q || x.it.nama_peralatan.toLowerCase().indexOf(q) >= 0 || (x.it.subkategori || '').toLowerCase().indexOf(q) >= 0) && (!fb || x.it.kode_bagian === fb));
      rows = rows.slice().sort((a, b) => so === 'e' ? b.total_kebutuhan - a.total_kebutuhan : so === 'k' ? b.jumlah_kantor - a.jumlah_kantor || b.total_kebutuhan - a.total_kebutuhan : a.it.urutan - b.it.urutan);
      const size = 25, view = printing ? rows : rows.slice((page - 1) * size, page * size);
      $('#tblP').innerHTML = rows.length ? '<div class="table-wrap"><table class="tbl"><thead><tr><th></th><th class="c">No</th><th>Nama Sarana & Peralatan</th><th>Bagian / Kategori</th><th class="c">Satuan</th><th class="c">Jml Pengusul</th><th class="r">Kebutuhan (E)</th><th class="r">Kondisi (H)</th></tr></thead><tbody>' +
        view.map((x, i) => {
          const isOpen = openAll || open[x.it.kode_item] || printing;
          const det = (lap.byItem[x.it.kode_item] || []).slice().sort((a, b) => lap.kMap[a.id_kantor].no_urut - lap.kMap[b.id_kantor].no_urut);
          return '<tr class="expander" data-ex="' + esc(x.it.kode_item) + '"><td class="c no-print">' + icon(isOpen ? 'down' : 'right', 'sm') + '</td><td class="c muted">' + ((printing ? 0 : (page - 1) * size) + i + 1) + '</td>' +
            '<td><b>' + esc(x.it.nama_peralatan) + '</b>' + (x.it.subkategori ? '<div class="xs muted">' + esc(x.it.subkategori) + '</div>' : '') + '</td><td class="small">' + esc(x.it.bagian) + '<div class="xs muted">' + esc(x.it.kategori) + '</div></td>' +
            '<td class="c small">' + esc(x.it.satuan_kebutuhan) + '</td><td class="c"><span class="chip" style="height:22px">' + icon('building', 'sm') + x.jumlah_kantor + ' Kantor</span></td>' +
            '<td class="r"><b style="font-size:14px">' + fmt.num(x.total_kebutuhan) + '</b></td><td class="r">' + fmt.num(x.total_kondisi) + '</td></tr>' +
            (isOpen ? '<tr class="detail-row"><td></td><td colspan="7" style="padding:8px 12px 16px"><div class="label-sm" style="margin-bottom:6px;color:var(--burnt)">Rincian ' + det.length + ' Kantor SAR pengusul ' + esc(x.it.nama_peralatan) + '</div><table class="tbl" style="border:1px solid var(--border);border-radius:6px"><thead><tr><th>Kantor SAR</th><th class="r">Kebutuhan (E)</th><th>Rencana Alokasi (G)</th><th class="r">Kondisi (H)</th><th>Penempatan Saat Ini (J)</th><th>Justifikasi (K)</th></tr></thead><tbody>' +
              det.map(o => '<tr><td class="small"><b>' + esc(lap.kMap[o.id_kantor].nama_kantor) + '</b></td><td class="r"><span class="chip" style="height:22px">' + fmt.num(o.jml_kebutuhan) + ' ' + esc(x.it.satuan_kebutuhan) + '</span></td><td class="small">' + esc(o.rencana_alokasi || '–') + '</td>' +
                '<td class="r small">' + (o.jml_kondisi === '' ? '–' : fmt.num(o.jml_kondisi) + ' ' + esc(x.it.satuan_kondisi)) + '</td><td class="small">' + esc(o.penempatan_saat_ini || '–') + '</td><td class="small" style="max-width:340px;white-space:pre-wrap"><i>' + esc(o.justifikasi) + '</i></td></tr>').join('') + '</tbody></table></td></tr>' : '');
        }).join('') + '</tbody></table></div>' + (printing ? '' : AdminUI.pager(rows.length, page, size, n => { page = n; draw(); }, 'pgP'))
        : UI.emptyState(lap.jumlah_dikirim ? 'Tidak ada peralatan sesuai filter.' : 'Belum ada Kantor SAR berstatus DIKIRIM.', 'package');
      $$('[data-ex]').forEach(tr => tr.onclick = () => { open[tr.dataset.ex] = !open[tr.dataset.ex]; draw(); });
    };
    $('#q').oninput = UI.debounce(() => { page = 1; draw(); }); $('#fb').onchange = $('#so').onchange = () => { page = 1; draw(); };
    $('#exAll').onclick = () => { openAll = !openAll; $('#exAll').innerHTML = icon(openAll ? 'up' : 'down', 'sm') + (openAll ? 'Tutup semua rincian' : 'Buka semua rincian'); draw(); };
    draw();
    const top = items.slice().sort((a, b) => b.jumlah_kantor - a.jumlah_kantor || b.total_kebutuhan - a.total_kebutuhan).slice(0, 8).map(x => ({ label: x.it.nama_peralatan, value: x.jumlah_kantor }));
    $('#chartP').innerHTML = bars(top, Math.max(1, lap.jumlah_dikirim), r => r.value + ' Kantor (' + Math.round(r.value / Math.max(1, lap.jumlah_dikirim) * 100) + '%)');
    $('#btnPrint').onclick = () => { printing = true; draw(); setTimeout(() => { window.print(); printing = false; draw(); }, 100); };
  }, { role: 'ADMIN' });

  // ============================================================
  // REKAP PER KANTOR SAR
  // ============================================================
  App.route('/admin/laporan/kantor', async function () {
    const p = await prep(this, 'kantor'); if (!p) return;
    const { lap, body } = p, tpl = lap.tpl;
    const kirim = lap.kantor.filter(k => k.status === 'DIKIRIM');
    let idk = this.query.get('k') || (kirim[0] && kirim[0].id_kantor) || (lap.kantor[0] && lap.kantor[0].id_kantor);
    const k = lap.kMap[idk];
    if (!k) { body.innerHTML = '<div class="card">' + UI.emptyState('Belum ada Kantor SAR.', 'building') + '</div>'; return; }
    const pd = k.pendataan, isKirim = k.status === 'DIKIRIM';
    const itemMap = isKirim ? (lap.byKantor[k.id_kantor] || {}) : {};
    const n = Object.keys(itemMap).length;
    const perBag = {}; Object.keys(itemMap).forEach(kd => { const it = tpl.byKode[kd]; if (it) perBag[it.bagian] = (perBag[it.bagian] || 0) + 1; });
    let only = true;
    body.innerHTML = '<div class="card no-print" style="margin-bottom:16px"><div class="toolbar" style="border-bottom:0"><span class="small" style="font-weight:600">' + icon('building', 'sm') + ' Pilih Satuan Kerja:</span>' +
      '<select class="input" id="selK" style="width:auto;min-width:300px;flex:1;max-width:520px">' + lap.kantor.map(x => '<option value="' + esc(x.id_kantor) + '"' + (x.id_kantor === idk ? ' selected' : '') + '>' + String(x.no_urut).padStart(2, '0') + ' · ' + esc(x.nama_kantor) + ' — ' + (x.status === 'BELUM' ? 'BELUM MENGISI' : x.status) + '</option>').join('') + '</select>' +
      '<span class="spacer"></span><a class="btn btn-primary" href="#/admin/edit/' + esc(k.id_kantor) + '">' + icon('edit', 'sm') + 'Edit Usulan Satker (Mode Admin)</a></div></div>' +
      '<div class="grid g3" style="margin-bottom:16px">' +
      '<div class="card card-pad"><div class="row" style="gap:12px;flex-wrap:nowrap"><div class="ico-box navy">' + icon('building') + '</div><div><div class="label-sm" style="color:var(--burnt)">Wilayah Pelayanan SAR</div><h3>' + esc(k.nama_kantor) + '</h3><div class="small muted">No. urut master ' + k.no_urut + '</div></div></div></div>' +
      '<div class="card card-pad"><div class="row" style="justify-content:space-between"><span class="label-sm">Status Pengajuan</span>' + badge(k.status) + '</div><dl class="kv small" style="margin-top:10px">' +
      '<dt>Waktu pengiriman</dt><dd>' + (pd && pd.dikirim_pada && isKirim ? fmt.dt(pd.dikirim_pada) : '–') + '</dd><dt>Operator pengirim</dt><dd>' + esc(pd && isKirim ? pd.dikirim_oleh : '–') + '</dd><dt>Terakhir disimpan</dt><dd>' + (pd ? fmt.dt(pd.disimpan_terakhir) : '–') + '</dd></dl></div>' +
      '<div class="card card-pad"><div class="row" style="justify-content:space-between"><span class="label-sm">Pengesah Dokumen Usulan</span><span class="badge b-draft nodot">Kepala Kantor SAR</span></div>' +
      '<h3 style="margin-top:8px">' + esc(pd && pd.nama_kepala || '–') + '</h3><div class="small muted tnum">NIP: ' + esc(pd && pd.nip_kepala || '–') + '</div><div class="small muted">' + esc(pd && pd.pangkat_golongan_kepala || '') + '</div></div></div>' +
      (isKirim ? '<div class="alert alert-ok" style="margin-bottom:16px">' + icon('checkc') + '<div><b>Status usulan: RESMI & TERKIRIM</b>Usulan ini masuk kompilasi Rekapitulasi Nasional ' + esc(lap.periode.nama_periode) + '. Jika Admin menyunting isi usulan, status tetap DIKIRIM dan setiap perubahan tercatat di Riwayat Perubahan.</div></div>'
        : '<div class="alert alert-warn" style="margin-bottom:16px">' + icon('alert') + '<div><b>Kantor ini berstatus ' + (k.status === 'BELUM' ? 'BELUM MENGISI' : k.status) + '</b>Data Kantor yang belum DIKIRIM tidak masuk rekapitulasi. Gunakan <a href="#/admin/edit/' + esc(k.id_kantor) + '">Mode Admin</a> untuk melihat atau menyunting isian sementara.</div></div>') +
      (isKirim ? '<div class="grid g3" style="margin-bottom:16px"><div class="card metric accent-navy"><span class="label-sm">Total Item Usulan</span><div class="m-val">' + n + '<small>item</small></div><div class="small muted" style="margin-top:auto">tersebar di ' + Object.keys(perBag).length + ' bagian</div></div>' +
        '<div class="card metric accent-orange" style="grid-column:span 2"><span class="label-sm">Sebaran Item per Bagian</span>' + bars(Object.keys(perBag).map(b => ({ label: b, value: perBag[b] })).sort((a, b) => b.value - a.value), Math.max(1, ...Object.values(perBag)), r => r.value + ' item') + '</div></div>' +
        '<div class="card"><div class="card-head"><div><h3>' + icon('layout') + 'Rincian Usulan ' + esc(lap.periode.nama_periode) + '</h3><div class="small muted">Format kolom A–K sesuai template resmi Direktorat Sarpras</div></div>' +
        '<div class="seg no-print" id="seg"><button class="on" data-v="1">Hanya yang diusulkan</button><button data-v="0">Seluruh template</button></div></div><div id="tblK"></div></div>' : '');
    $('#selK').onchange = e => App.go('#/admin/laporan/kantor?k=' + encodeURIComponent(e.target.value));
    $('#btnPrint').onclick = () => window.print();
    if (!isKirim) return;
    const draw = () => { $('#tblK').innerHTML = Pendataan.fullTable(tpl, itemMap, { hanyaTerisi: only }); };
    $$('#seg button').forEach(b => b.onclick = () => { $$('#seg button').forEach(x => x.classList.remove('on')); b.classList.add('on'); only = b.dataset.v === '1'; draw(); });
    draw();
  }, { role: 'ADMIN' });

  global.Laporan = { loadLap, clear() { Object.keys(CACHE).forEach(k => delete CACHE[k]); } };
})(window);
