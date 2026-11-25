/* ============================================================
   SIPERSAR — pendataan.js
   Daftar kategori, formulir isian per kategori (kolom A–K),
   dan tabel baca-saja lengkap. Dipakai Operator & mode sunting Admin.
   ============================================================ */
(function (global) {
  'use strict';
  const { icon, esc, $, $$, fmt, toast, busy, badge, progress } = UI;

  const KEL_ICON = (nama) => /^PERALATAN/i.test(nama) ? 'tool' : 'truck';
  const BAG_ICON = (b) => /UDARA/i.test(b) ? 'plane' : /PERAIRAN/i.test(b) ? 'ship' : /DARAT/i.test(b) ? 'truck' : /PENCARIAN$/i.test(b.trim()) ? 'target' : /PERLENGKAPAN/i.test(b) ? 'backpack' : /PENDUKUNG/i.test(b) ? 'package' : 'tool';

  const P = {
    /** Muat data pendataan + template. ctx: {mode, id_kantor, id_periode} */
    keyData(ctx) { return { id_periode: ctx.id_periode || '', id_kantor: ctx.mode === 'ADMIN' ? ctx.id_kantor : '' }; },
    async load(ctx) {
      const r = await API.read('pendataanGet', P.keyData(ctx));
      if (!r.success) throw new Error(r.message);
      const d = Object.assign({}, r.data);
      d.tpl = await API.template(d.periode.id_template);
      d.itemMap = {}; d.items.forEach(x => { d.itemMap[x.kode_item] = x; });
      return d;
    },
    // ----------------------------------------------------------
    // OPTIMISTIC UI: ubah cache seketika → kirim ke server lewat antrean
    // ----------------------------------------------------------
    versi: {},
    pkey(d) { return d.periode.id_periode + '|' + d.kantor.id_kantor; },
    /**
     * opts: { action, payload(versi) → data, patch(raw), pesan, onOk(r), onFail(r) }
     * patch mengubah salinan data pendataanGet yang langsung dipakai tampilan.
     */
    queue(ctx, d, opts) {
      const kd = this.keyData(ctx), pk = this.pkey(d);
      if (this.versi[pk] === undefined) { const c = API.peek('pendataanGet', kd); const pd = (c && c.pendataan) || d.pendataan; this.versi[pk] = pd ? Number(pd.versi_data) || 0 : 0; }
      // 1) UI instan: tambal cache lalu render
      const raw = JSON.parse(JSON.stringify(API.peek('pendataanGet', kd) || {}));
      if (!raw.pendataan) raw.pendataan = { id_pendataan: '', id_periode: d.periode.id_periode, id_kantor: d.kantor.id_kantor, status: 'DRAFT', nama_kepala: '', nip_kepala: '', pangkat_golongan_kepala: '', dikirim_pada: '', dikirim_oleh: '', versi_data: 0 };
      raw.items = raw.items || []; raw.review = raw.review || {};
      opts.patch(raw);
      raw.pendataan.disimpan_terakhir = new Date().toISOString();
      raw.pendataan.disimpan_oleh = App.user.username;
      if (App.user.role === 'OPERATOR' && raw.pendataan.status === 'DIKIRIM') raw.pendataan.status = 'DRAFT';
      raw._optimistis = true;
      API.hold('pendataanGet', kd, true);
      API.put('pendataanGet', kd, raw);
      // 2) Sinkron latar belakang (berurutan, versi data terbaru dipakai saat giliran tiba)
      return API.sync.push(async () => {
        const res = await API.call(opts.action, opts.payload(this.versi[pk]), { silent: true });
        const sisa = API.hold('pendataanGet', kd, false);
        if (res.success) {
          if (res.data && res.data.pendataan) this.versi[pk] = Number(res.data.pendataan.versi_data) || 0;
          if (sisa <= 0 && res.data && res.data.pendataan) API.put('pendataanGet', kd, res.data, true);
          if (/DRAFT/.test(res.message || '')) toast(res.message, 'warn');
          if (opts.onOk) opts.onOk(res);
        } else {
          delete this.versi[pk];
          if (opts.onFail) opts.onFail(res);
          this.gagal(res, ctx);
          if (sisa <= 0) API.read('pendataanGet', kd, { force: true }).then(() => API.put('pendataanGet', kd, API.peek('pendataanGet', kd), true));
        }
        return res;
      });
    },
    gagal(res, ctx) {
      if (res.code === 'VERSI_KONFLIK') {
        UI.modal({ title: 'Data diperbarui akun lain', icon: 'refresh', dismiss: false,
          body: '<p>' + esc(res.message) + '</p><p class="small muted">Isian Anda tetap tersimpan sebagai <b>draf di perangkat ini</b> dan dapat dipulihkan setelah data dimuat ulang.</p>',
          buttons: [{ label: 'Muat Ulang Data', cls: 'btn-primary', icon: 'refresh', onClick: () => { App.render(true); } }] });
      } else toast('Gagal menyimpan ke server: ' + res.message + ' Isian disimpan sebagai draf di perangkat ini.', 'error', 12000);
    },
    // ---- draf isian di localStorage (tidak hilang bila tab tertutup / gagal sinkron) ----
    draftKey(d, kat) { return 'sipersar_draft:' + App.user.id_user + ':' + this.pkey(d) + ':' + kat; },
    saveDraft(d, kat, cur) { try { localStorage.setItem(this.draftKey(d, kat), JSON.stringify({ t: Date.now(), cur })); } catch (e) { /* abaikan */ } },
    loadDraft(d, kat) { try { return JSON.parse(localStorage.getItem(this.draftKey(d, kat)) || 'null'); } catch (e) { return null; } },
    clearDraft(d, kat) { try { localStorage.removeItem(this.draftKey(d, kat)); } catch (e) { /* abaikan */ } },
    /** Tunggu seluruh antrean tulis selesai (sebelum Kirim / ubah Kepala / Salin). */
    async flush(btn) {
      if (API.sync.pending > 0) { if (btn) busy(btn, true, 'Menunggu sinkronisasi…'); await API.sync.chain; if (btn) busy(btn, false); }
    },

    reviewDone(d) { return d.tpl.kategori.filter(k => d.review[k.kode_kategori] && d.review[k.kode_kategori].selesai).length; },
    itemCount(d, k) { return k.itemKodes.filter(kd => d.itemMap[kd]).length; },

    statusBadge(d) { return d.pendataan ? badge(d.pendataan.status) : badge('BELUM'); },

    // ==========================================================
    // DAFTAR KATEGORI
    // ==========================================================
    async listPage(c, ctx) {
      c.innerHTML = UI.loading('Memuat daftar kategori…');
      const d = await this.load(ctx);
      const admin = ctx.mode === 'ADMIN';
      const tpl = d.tpl, total = tpl.kategori.length, done = this.reviewDone(d);
      const sisa = fmt.sisaHari(d.periode.batas_pengisian);
      const head = App.pageHead({
        crumbs: admin ? '<a href="#/admin/laporan/kantor?k=' + esc(d.kantor.id_kantor) + '">Laporan per Kantor SAR</a> › <b>Mode Penyuntingan Admin</b>' : '',
        eyebrow: this.statusBadge(d) + '<span class="muted" style="letter-spacing:0;text-transform:none;font-weight:500">' + esc(d.periode.nama_periode) + ' · Template v' + esc(d.periode.template_versi) + '</span>',
        title: admin ? d.kantor.nama_kantor + ' · Form Usulan' : 'Pendataan Usulan Kebutuhan Sarana & Peralatan SAR',
        desc: admin ? 'Penyuntingan isi usulan oleh Admin Direktorat. Status pendataan tidak berubah dan setiap perubahan tercatat di Riwayat Perubahan.'
          : 'Isi usulan per kategori sesuai template resmi. Tandai setiap kategori <b>Selesai Ditinjau</b> (termasuk kategori tanpa usulan), lengkapi identitas Kepala Kantor, lalu kirim ke Direktorat.',
        actions: !admin && d.periode.batas_pengisian ? '<div class="card" style="padding:10px 14px;display:flex;gap:10px;align-items:center">' + icon('clock') + '<div><div class="label-sm">Batas Pengisian</div><b>' + fmt.dateOnly(d.periode.batas_pengisian) + '</b>' + (sisa !== null && d.dapat_ubah ? ' <span class="small" style="color:var(--burnt)">(' + (sisa >= 0 ? 'sisa ' + sisa + ' hari' : 'lewat ' + (-sisa) + ' hari') + ')</span>' : '') + '</div></div>' : ''
      });
      let banner = '';
      if (admin) banner = '<div class="alert alert-navy" style="margin-bottom:16px">' + icon('shieldok') + '<div><b>MODE PENYUNTINGAN ADMINISTRATOR DIREKTORAT</b>Koreksi Admin tidak mengubah status (' + esc(d.pendataan ? d.pendataan.status : 'belum ada data') + '). Seluruh perubahan sel direkam di Riwayat Perubahan dengan akun Admin.</div></div>';
      else if (!d.dapat_ubah) banner = '<div class="alert alert-warn" style="margin-bottom:16px">' + icon('lock') + '<div><b>Mode baca-saja</b>' + esc(d.alasan) + '</div></div>';
      else if (d.pendataan && d.pendataan.status === 'DIKIRIM') banner = '<div class="alert alert-ok" style="margin-bottom:16px">' + icon('checkc') + '<div><b>Pendataan sudah DIKIRIM</b>Jika Anda menyimpan perubahan apa pun, status kembali menjadi DRAFT dan Kantor Anda keluar dari rekap nasional sampai dikirim ulang.</div></div>';

      c.innerHTML = head + banner +
        '<div class="card" style="margin-bottom:16px"><div class="toolbar" style="border-bottom:0">' +
        '<div class="input-icon" style="flex:1;min-width:220px">' + icon('search', 'sm') + '<input class="input" id="q" placeholder="Cari kategori atau nama peralatan…"></div>' +
        '<select class="input" id="fStatus" style="width:auto"><option value="">Semua kategori (' + total + ')</option><option value="belum">Belum ditinjau</option><option value="selesai">Selesai ditinjau</option><option value="isi">Ada usulan</option></select>' +
        '<div style="min-width:240px;flex:0 1 320px"><div class="row" style="justify-content:space-between;margin-bottom:6px"><span class="small" style="font-weight:600">' + icon('checkc', 'sm') + ' Progres Peninjauan</span><b style="color:var(--burnt)">' + done + ' / ' + total + ' kategori</b></div>' +
        progress(done / total * 100) + '<div class="xs muted" style="margin-top:4px">' + d.items.length + ' item diusulkan · terakhir disimpan ' + (d.pendataan ? fmt.dt(d.pendataan.disimpan_terakhir) : '–') + '</div></div></div></div>' +
        '<div id="searchRes"></div><div class="stack" id="katList"></div>';

      const renderList = () => {
        const q = $('#q').value.trim().toLowerCase(), st = $('#fStatus').value;
        const kels = [], byKel = {};
        tpl.kategori.forEach(k => {
          const rv = d.review[k.kode_kategori] && d.review[k.kode_kategori].selesai, n = this.itemCount(d, k);
          if (st === 'belum' && rv) return; if (st === 'selesai' && !rv) return; if (st === 'isi' && !n) return;
          if (q && k.nama.toLowerCase().indexOf(q) < 0 && !k.rows.some(r => r.nama_peralatan.toLowerCase().indexOf(q) >= 0)) return;
          if (!byKel[k.kelompok]) { byKel[k.kelompok] = {}; kels.push(k.kelompok); }
          (byKel[k.kelompok][k.bagian] = byKel[k.kelompok][k.bagian] || []).push(k);
        });
        $('#katList').innerHTML = kels.length ? kels.map(kel => {
          const bags = byKel[kel];
          const katAll = tpl.kategori.filter(k => k.kelompok === kel);
          const dn = katAll.filter(k => d.review[k.kode_kategori] && d.review[k.kode_kategori].selesai).length;
          return '<div class="kat-group"><div class="kel-head"><div class="ico-box navy">' + icon(KEL_ICON(kel)) + '</div><h3>' + esc(kel) + '</h3><span class="chip">' + katAll.length + ' kategori</span>' +
            '<span class="small" style="margin-left:auto;font-weight:600;color:var(--text-2)"><span style="color:var(--orange)">●</span> ' + dn + ' selesai · ' + (katAll.length - dn) + ' belum ditinjau</span></div>' +
            Object.keys(bags).map(b => '<div class="bag-head">' + icon(BAG_ICON(b), 'sm') + 'Bagian ' + esc(b) + '<span class="xs muted" style="margin-left:auto;font-weight:500">' + bags[b].length + ' kategori</span></div>' +
              bags[b].map(k => this.katRow(d, k, ctx)).join('')).join('') + '</div>';
        }).join('') : '<div class="card">' + UI.emptyState('Tidak ada kategori yang cocok dengan filter.', 'search') + '</div>';
        // hasil pencarian item
        if (q.length >= 2) {
          const hits = tpl.items.filter(it => it.dapat_diisi && it.nama_peralatan.toLowerCase().indexOf(q) >= 0).slice(0, 30);
          $('#searchRes').innerHTML = hits.length ? '<div class="card" style="margin-bottom:16px"><div class="card-head"><h3>' + icon('search') + 'Peralatan cocok “' + esc(q) + '” (' + hits.length + (hits.length === 30 ? '+' : '') + ')</h3></div><div class="table-wrap"><table class="tbl"><tbody>' +
            hits.map(it => { const k = tpl.kategori.find(x => x.kode_kategori === it.kode_kategori); const v = d.itemMap[it.kode_item];
              return '<tr><td>' + esc(it.nama_peralatan) + '<div class="xs muted">' + esc(it.bagian + ' › ' + (k ? k.nama : '') + (it.subkategori ? ' › ' + it.subkategori : '')) + '</div></td><td class="r nowrap">' + (v ? '<b>' + fmt.num(v.jml_kebutuhan) + '</b> ' + esc(it.satuan_kebutuhan) : '<span class="muted small">belum diusulkan</span>') + '</td>' +
                '<td class="r"><a class="btn btn-ghost btn-xs" href="' + ctx.base + '/' + encodeURIComponent(it.kode_kategori) + '?fokus=' + encodeURIComponent(it.kode_item) + '">Buka ' + icon('right', 'sm') + '</a></td></tr>'; }).join('') + '</tbody></table></div></div>' : '';
        } else $('#searchRes').innerHTML = '';
        bindRev();
      };
      const bindRev = () => $$('[data-rev]').forEach(b => b.onclick = async () => {
        const kode = b.dataset.rev, selesai = b.dataset.val === '1';
        if (d.pendataan && d.pendataan.status === 'DIKIRIM' && !(await UI.confirmDialog({ title: 'Ubah data yang sudah dikirim?', body: '<p>Status kembali menjadi <b>DRAFT</b> dan pendataan wajib dikirim ulang.</p>', ok: 'Ya, Lanjutkan' }))) return;
        this.queue(ctx, d, {
          action: 'pendataanSetReview', payload: () => ({ id_periode: d.periode.id_periode, kode_kategori: kode, selesai }),
          patch: raw => { raw.review[kode] = { selesai, ditinjau_pada: new Date().toISOString(), ditinjau_oleh: App.user.username }; }
        });
        const y = window.scrollY; await this.listPage(c, ctx); window.scrollTo(0, y);
      });
      $('#q').oninput = UI.debounce(renderList, 200);
      $('#fStatus').onchange = renderList;
      renderList();

      if (!admin) {
        const bar = document.createElement('div');
        bar.className = 'save-bar';
        bar.innerHTML = '<div class="state"><div class="ico-box orange" style="width:32px;height:32px">' + icon('checkc', 'sm') + '</div><div><b style="color:var(--text)">' + done + ' dari ' + total + ' kategori telah ditandai Selesai Ditinjau</b><br>Pastikan isian dan justifikasi kebutuhan telah diperiksa.</div></div>' +
          '<div class="acts"><a class="btn btn-primary" href="#/kirim">Lanjut ke Kirim Pendataan ' + icon('arrowr', 'sm') + '</a></div>';
        c.appendChild(bar);
      } else {
        const bar = document.createElement('div');
        bar.className = 'save-bar';
        bar.innerHTML = '<div class="state"><b style="color:var(--text)">Status usulan: ' + esc(d.pendataan ? d.pendataan.status : 'BELUM MENGISI') + ' (tetap)</b></div><div class="acts">' +
          '<button class="btn btn-ghost" id="btnKepalaAdm">' + icon('user', 'sm') + 'Identitas Kepala Kantor</button>' +
          '<a class="btn btn-navy" href="#/admin/laporan/kantor?k=' + esc(d.kantor.id_kantor) + '">' + icon('arrowl', 'sm') + 'Kembali ke Laporan Kantor</a></div>';
        c.appendChild(bar);
        $('#btnKepalaAdm').onclick = () => Operator.kepalaModal(d, { id_kantor: d.kantor.id_kantor, id_periode: d.periode.id_periode }, () => this.listPage(c, ctx));
      }
    },

    katRow(d, k, ctx) {
      const rv = d.review[k.kode_kategori] && d.review[k.kode_kategori].selesai, n = this.itemCount(d, k);
      const canRev = ctx.mode === 'OPERATOR' && d.dapat_ubah;
      return '<div class="kat-row"><div class="mk">' + esc(k.penanda || '•') + '</div>' +
        '<div class="nm">' + esc(k.nama) + '<small>' + k.itemKodes.length + ' item dapat diisi</small></div>' +
        '<div class="c-items small">' + (n ? icon('clipboard', 'sm') + ' <b>' + n + '</b> item diusulkan' : '<span class="muted">' + icon('info', 'sm') + ' 0 item (belum diisi)</span>') + '</div>' +
        '<div class="c-rev">' + (rv ? badge('SELESAI') : badge('REVIEW')) +
        (canRev ? ' <button class="btn btn-text btn-xs" data-rev="' + esc(k.kode_kategori) + '" data-val="' + (rv ? '0' : '1') + '" title="' + (rv ? 'Batalkan tanda' : 'Tandai Selesai Ditinjau') + '">' + icon(rv ? 'x' : 'check', 'sm') + '</button>' : '') + '</div>' +
        '<div class="c-act" style="text-align:right"><a class="btn ' + (rv ? 'btn-navy' : 'btn-primary') + ' btn-sm" href="' + ctx.base + '/' + encodeURIComponent(k.kode_kategori) + '">Buka Kategori ' + icon('arrowr', 'sm') + '</a></div></div>';
    },

    // ==========================================================
    // FORMULIR ISIAN PER KATEGORI
    // ==========================================================
    async formPage(c, ctx, kodeKat, fokus) {
      c.innerHTML = UI.loading('Memuat formulir kategori…');
      const d = await this.load(ctx);
      const tpl = d.tpl, admin = ctx.mode === 'ADMIN';
      const kIdx = tpl.kategori.findIndex(k => k.kode_kategori === kodeKat);
      if (kIdx < 0) { c.innerHTML = UI.emptyState('Kategori tidak ditemukan pada template periode ini.'); return; }
      const k = tpl.kategori[kIdx];
      const prev = tpl.kategori[kIdx - 1], next = tpl.kategori[kIdx + 1];
      const editable = d.dapat_ubah;
      const baseLevel = k.baris.level;
      const rv = d.review[k.kode_kategori] && d.review[k.kode_kategori].selesai;

      // state isian
      const orig = {}, cur = {};
      k.itemKodes.forEach(kd => {
        const v = d.itemMap[kd];
        orig[kd] = v ? { E: v.jml_kebutuhan === '' ? '' : String(v.jml_kebutuhan), G: v.rencana_alokasi || '', H: v.jml_kondisi === '' || v.jml_kondisi === undefined ? '' : String(v.jml_kondisi), J: v.penempatan_saat_ini || '', K: v.justifikasi || '' }
          : { E: '', G: '', H: '', J: '', K: '' };
        cur[kd] = Object.assign({}, orig[kd]);
      });
      let serverErr = {};
      const isDirty = () => k.itemKodes.some(kd => ['E', 'G', 'H', 'J', 'K'].some(f => cur[kd][f] !== orig[kd][f]));

      const crumbs = '<a href="' + ctx.base + '">' + (admin ? 'Form Usulan ' + esc(d.kantor.nama_kantor) : 'Pendataan') + '</a> › ' + esc(k.kelompok) + ' › ' + esc('Bagian ' + k.bagian) + ' › <b>' + esc(k.nama) + '</b>';
      c.innerHTML = App.pageHead({
        crumbs,
        eyebrow: (d.pendataan ? badge(d.pendataan.status) : badge('BELUM')) + (rv ? badge('SELESAI') : badge('REVIEW')) + (admin ? '<span class="badge b-buka">Admin Edit Aktif</span>' : ''),
        title: (k.penanda ? k.penanda + (/[.)]$/.test(k.penanda) ? ' ' : '. ') : '') + k.nama,
        desc: esc(k.kelompok) + ' · Bagian ' + esc(k.bagian) + ' · ' + k.itemKodes.length + ' item dapat diisi. Kolom nama dan satuan terkunci sesuai template resmi.',
        actions: '<a class="btn btn-ghost" href="' + ctx.base + '">' + icon('arrowl', 'sm') + 'Daftar Kategori</a>'
      }) +
        (admin ? '<div class="alert alert-navy" style="margin-bottom:12px">' + icon('shieldok') + '<div><b>MODE PENYUNTINGAN ADMINISTRATOR</b>Menyunting usulan ' + esc(d.kantor.nama_kantor) + '. Status tetap ' + esc(d.pendataan ? d.pendataan.status : 'DRAFT (dibuat saat simpan)') + '; perubahan tercatat di Riwayat Perubahan.</div></div>' : '') +
        (!editable ? '<div class="alert alert-warn" style="margin-bottom:12px">' + icon('lock') + '<div><b>Mode baca-saja</b>' + esc(d.alasan) + '</div></div>' : '') +
        '<div id="konflik"></div>' +
        '<div class="card" style="margin-bottom:12px"><div class="toolbar" style="border-bottom:0">' +
        '<div class="input-icon" style="flex:1;min-width:200px">' + icon('search', 'sm') + '<input class="input" id="fq" placeholder="Filter peralatan dalam kategori ini…"></div>' +
        '<div class="seg" id="seg"><button data-v="all" class="on">Semua</button><button data-v="isi">Hanya terisi</button><button data-v="err">Perlu perbaikan</button></div>' +
        '<span class="small muted">' + icon('info', 'sm') + ' E & H bilangan bulat · Justifikasi (K) wajib bila E terisi · E = 0/kosong berarti tidak diusulkan</span></div></div>' +
        '<div class="form-wrap" id="fw"><table class="ftbl" id="ft"><thead>' +
        '<tr><th class="sticky-l c-no" rowspan="2">No</th><th class="sticky-l c-nama" rowspan="2" style="left:56px">Nama Sarana dan/ Peralatan SAR (A–D)</th>' +
        '<th class="grp-e" colspan="2">Kebutuhan</th><th class="grp-e" rowspan="2">Rencana Alokasi Penempatan (G)<br><span style="text-transform:none;font-weight:500">Kantor SAR / Pos SAR</span></th>' +
        '<th class="grp-h" colspan="2">Kondisi Saat Ini</th><th class="grp-h" rowspan="2">Penempatan Saat Ini (J)</th><th rowspan="2">Justifikasi Kebutuhan (K)</th></tr>' +
        '<tr><th class="grp-e c-num">Jml (E)</th><th class="grp-e c-sat">Satuan (F)</th><th class="grp-h c-num">Jml (H)</th><th class="grp-h c-sat">Satuan (I)</th></tr></thead><tbody id="fb"></tbody></table></div>' +
        '<div class="row" style="margin-top:12px;justify-content:space-between">' +
        (prev ? '<a class="btn btn-ghost btn-sm" href="' + ctx.base + '/' + encodeURIComponent(prev.kode_kategori) + '">' + icon('left', 'sm') + esc(prev.nama) + '</a>' : '<span></span>') +
        (next ? '<a class="btn btn-ghost btn-sm" href="' + ctx.base + '/' + encodeURIComponent(next.kode_kategori) + '">' + esc(next.nama) + icon('right', 'sm') + '</a>' : '<span></span>') + '</div>';

      // baris tabel
      const rowHtml = (it) => {
        const lv = Math.max(0, it.level - baseLevel - 1), pad = 'padding-left:' + (lv * 16) + 'px';
        const no = esc(Template.nomor(it));
        if (it.jenis_baris === 'JUDUL') {
          return '<tr class="r-judul lv' + lv + '" data-judul="' + esc(it.kode_item) + '"><td class="sticky-l c-no">' + no + '</td><td class="sticky-l c-nama" style="left:56px"><span class="ind" style="' + pad + '">' + esc(it.nama_peralatan) + '</span></td><td colspan="7" class="xs muted" style="font-weight:500">Judul kelompok — tidak diisi</td></tr>';
        }
        if (it.jenis_baris === 'RINCIAN') {
          return '<tr class="r-rincian" data-rinc="' + esc(it.kode_induk) + '"><td class="sticky-l c-no"></td><td class="sticky-l c-nama" style="left:56px"><span class="ind" style="' + pad + '">' + esc(it.nama_peralatan) + '</span></td><td colspan="7" class="xs">rincian isi paket</td></tr>';
        }
        const v = cur[it.kode_item];
        const satE = '<span class="sat' + (it.satuan_otomatis ? ' auto' : '') + '" title="' + ({ PCS: 'Satuan otomatis Pcs (master baris 277–408 tanpa satuan)', INDUK: 'Satuan mengikuti baris induk pada master', BAWAAN: 'Satuan bawaan (master tanpa satuan)' }[it.sumber_satuan] || 'Satuan dari template') + '">' + esc(it.satuan_kebutuhan || '—') + '</span>';
        const satH = '<span class="sat' + (it.satuan_otomatis ? ' auto' : '') + '">' + esc(it.satuan_kondisi || '—') + '</span>';
        const sub = it.subkategori ? '<span class="nm-sub">' + esc(it.subkategori) + '</span>' : '';
        const nm = '<span class="ind" style="' + pad + '"><span class="nm-text">' + esc(it.nama_peralatan) + '</span>' + sub + '<span class="row-msg"></span></span>';
        if (!editable) {
          return '<tr class="r-item' + (v.E ? ' filled' : '') + '" data-k="' + esc(it.kode_item) + '"><td class="sticky-l c-no">' + no + '</td><td class="sticky-l c-nama" style="left:56px">' + nm + '</td>' +
            '<td class="c-num r"><span class="ro-val"><b>' + esc(v.E || '–') + '</b></span></td><td class="c-sat">' + satE + '</td><td class="c-txt"><span class="ro-val">' + esc(v.G || '–') + '</span></td>' +
            '<td class="c-num r"><span class="ro-val">' + esc(v.H === '' ? '–' : v.H) + '</span></td><td class="c-sat">' + satH + '</td><td class="c-txt"><span class="ro-val">' + esc(v.J || '–') + '</span></td><td class="c-just"><span class="ro-val">' + esc(v.K || '–') + '</span></td></tr>';
        }
        return '<tr class="r-item" data-k="' + esc(it.kode_item) + '"><td class="sticky-l c-no">' + no + '</td><td class="sticky-l c-nama" style="left:56px">' + nm + '</td>' +
          '<td class="c-num"><input class="cell-in num" data-f="E" inputmode="numeric" maxlength="7" value="' + esc(v.E) + '" aria-label="Jumlah kebutuhan"></td><td class="c-sat">' + satE + '</td>' +
          '<td class="c-txt"><input class="cell-in" data-f="G" maxlength="500" value="' + esc(v.G) + '" placeholder="Kosongkan bila tidak diusulkan" aria-label="Rencana alokasi"></td>' +
          '<td class="c-num"><input class="cell-in num" data-f="H" inputmode="numeric" maxlength="7" value="' + esc(v.H) + '" aria-label="Jumlah kondisi saat ini"></td><td class="c-sat">' + satH + '</td>' +
          '<td class="c-txt"><input class="cell-in" data-f="J" maxlength="500" value="' + esc(v.J) + '" aria-label="Penempatan saat ini"></td>' +
          '<td class="c-just"><textarea class="cell-in" data-f="K" maxlength="2000" rows="1" aria-label="Justifikasi">' + esc(v.K) + '</textarea></td></tr>';
      };
      $('#fb').innerHTML = k.rows.map(rowHtml).join('');

      // validasi baris
      const cekBaris = (kd) => {
        const v = cur[kd], e = [], w = [];
        ['E', 'H'].forEach(f => { if (v[f] !== '' && !/^\d+$/.test(v[f])) e.push((f === 'E' ? 'Jumlah kebutuhan' : 'Jumlah kondisi') + ' harus bilangan bulat ≥ 0.'); });
        const diusulkan = /^\d+$/.test(v.E) && Number(v.E) > 0;
        if (diusulkan && !v.K.trim()) e.push('Justifikasi (K) wajib diisi.');
        if (!diusulkan && (v.G.trim() || v.H !== '' || v.J.trim() || v.K.trim())) w.push(v.E === '0' ? 'Jumlah kebutuhan 0 = tidak diusulkan; isian baris ini akan dikosongkan saat disimpan.' : 'Jumlah kebutuhan kosong; isian baris ini akan dikosongkan saat disimpan.');
        if (serverErr[kd]) serverErr[kd].forEach(m => { if (e.indexOf(m) < 0) e.push(m); });
        return { e, w, diusulkan };
      };
      const paint = (tr) => {
        const kd = tr.dataset.k, r = cekBaris(kd), v = cur[kd];
        tr.classList.toggle('err', r.e.length > 0); tr.classList.toggle('warn', !r.e.length && r.w.length > 0);
        tr.classList.toggle('filled', r.diusulkan);
        tr.classList.toggle('changed', ['E', 'G', 'H', 'J', 'K'].some(f => v[f] !== orig[kd][f]));
        tr.querySelector('.row-msg').innerHTML = r.e.map(m => '<span class="row-err">' + icon('alert', 'sm') + ' ' + esc(m) + '</span>').join('') + r.w.map(m => '<span class="row-warn">' + esc(m) + '</span>').join('');
        $$('[data-f="E"],[data-f="H"]', tr).forEach(inp => inp.classList.toggle('invalid', inp.value !== '' && !/^\d+$/.test(inp.value)));
        const kIn = tr.querySelector('[data-f="K"]'); if (kIn) kIn.classList.toggle('invalid', r.diusulkan && !v.K.trim());
      };
      const updateBar = () => {
        const dirty = isDirty();
        App.guard = editable ? isDirty : null;
        const st = $('#saveState');
        if (!st) return;
        st.classList.toggle('dirty', dirty);
        const nChanged = k.itemKodes.filter(kd => ['E', 'G', 'H', 'J', 'K'].some(f => cur[kd][f] !== orig[kd][f])).length;
        st.innerHTML = '<span class="dot"></span><span>' + (dirty ? '<b style="color:var(--burnt)">' + nChanged + ' baris diubah belum disimpan</b>' :
          'Terakhir disimpan: <b>' + (d.pendataan ? fmt.dt(d.pendataan.disimpan_terakhir) + '</b> oleh <b style="color:var(--burnt)">' + esc(d.pendataan.disimpan_oleh) : '–') + '</b>') + '</span>';
      };
      $$('#fb tr.r-item').forEach(paint);

      // draf otomatis ke perangkat (Prinsip 2: LocalStorage)
      const simpanDraf = UI.debounce(() => { if (isDirty()) this.saveDraft(d, k.kode_kategori, cur); else this.clearDraft(d, k.kode_kategori); }, 400);
      if (editable) {
        const draf = this.loadDraft(d, k.kode_kategori);
        const beda = draf && draf.cur && k.itemKodes.some(kd => draf.cur[kd] && ['E', 'G', 'H', 'J', 'K'].some(f => (draf.cur[kd][f] || '') !== orig[kd][f]));
        if (beda) {
          $('#konflik').innerHTML = '<div class="alert alert-warn" style="margin-bottom:12px">' + icon('save') + '<div style="flex:1"><b>Ada draf isian yang belum tersimpan ke server</b>Draf terakhir di perangkat ini: ' + fmt.dt(new Date(draf.t).toISOString()) + '. Pulihkan untuk melanjutkan, lalu simpan.</div>' +
            '<button class="btn btn-primary btn-sm" id="btnDrafOk">' + icon('refresh', 'sm') + 'Pulihkan Draf</button><button class="btn btn-ghost btn-sm" id="btnDrafX">Buang</button></div>';
          $('#btnDrafOk').onclick = () => {
            k.itemKodes.forEach(kd => { if (draf.cur[kd]) cur[kd] = Object.assign({ E: '', G: '', H: '', J: '', K: '' }, draf.cur[kd]); });
            $('#fb').innerHTML = k.rows.map(rowHtml).join('');
            $$('#fb tr.r-item').forEach(paint); updateBar(); $('#konflik').innerHTML = '';
            toast('Draf dipulihkan. Periksa lalu simpan kategori.', 'info');
          };
          $('#btnDrafX').onclick = () => { this.clearDraft(d, k.kode_kategori); $('#konflik').innerHTML = ''; };
        } else if (draf) this.clearDraft(d, k.kode_kategori);
        $('#fb').addEventListener('input', e => {
          const inp = e.target; if (!inp.dataset.f) return;
          const tr = inp.closest('tr'), kd = tr.dataset.k;
          if (inp.dataset.f === 'E' || inp.dataset.f === 'H') { const cleaned = inp.value.replace(/[^\d]/g, ''); if (cleaned !== inp.value && !/[.,\-]/.test(inp.value)) inp.value = cleaned; }
          cur[kd][inp.dataset.f] = inp.dataset.f === 'E' || inp.dataset.f === 'H' ? inp.value.trim() : inp.value;
          delete serverErr[kd];
          paint(tr); updateBar(); simpanDraf();
        });
        $('#fb').addEventListener('keydown', e => {
          const inp = e.target; if (!inp.dataset || !inp.dataset.f || e.key !== 'Enter' || inp.tagName === 'TEXTAREA') return;
          e.preventDefault();
          const rows = $$('#fb tr.r-item'), i = rows.indexOf(inp.closest('tr'));
          const nx = rows[i + (e.shiftKey ? -1 : 1)]; if (nx) nx.querySelector('[data-f="' + inp.dataset.f + '"]').focus();
        });
        $('#fb').addEventListener('focusin', e => { if (e.target.tagName === 'TEXTAREA') e.target.style.height = Math.max(34, e.target.scrollHeight + 2) + 'px'; });
      }

      // filter
      let segV = 'all';
      const applyFilter = () => {
        const q = $('#fq').value.trim().toLowerCase();
        $$('#fb tr').forEach(tr => {
          if (!tr.dataset.k) { tr.style.display = q || segV !== 'all' ? 'none' : ''; return; }
          const it = tpl.byKode[tr.dataset.k];
          let show = !q || it.nama_peralatan.toLowerCase().indexOf(q) >= 0 || (it.subkategori || '').toLowerCase().indexOf(q) >= 0;
          if (segV === 'isi') show = show && tr.classList.contains('filled');
          if (segV === 'err') show = show && (tr.classList.contains('err') || tr.classList.contains('warn'));
          tr.style.display = show ? '' : 'none';
        });
      };
      $('#fq').oninput = UI.debounce(applyFilter, 150);
      $$('#seg button').forEach(b => b.onclick = () => { $$('#seg button').forEach(x => x.classList.remove('on')); b.classList.add('on'); segV = b.dataset.v; applyFilter(); });

      // bilah simpan
      const bar = document.createElement('div');
      bar.className = 'save-bar';
      bar.innerHTML = '<div class="state" id="saveState"></div><div class="acts">' + (editable ?
        '<button class="btn btn-ghost" id="btnReset">' + icon('refresh', 'sm') + 'Batal / Reset</button>' +
        '<button class="btn btn-navy" id="btnSave">' + icon('save', 'sm') + 'Simpan Kategori</button>' +
        (!admin ? (rv ? '<button class="btn btn-ghost" id="btnUnrev">' + icon('x', 'sm') + 'Batalkan Tanda Tinjau</button>' : '<button class="btn btn-primary" id="btnSaveRev">' + icon('checkc', 'sm') + 'Simpan & Tandai Selesai Ditinjau</button>') : '')
        : '<a class="btn btn-navy" href="' + ctx.base + '">' + icon('arrowl', 'sm') + 'Kembali</a>') + '</div>';
      c.appendChild(bar);
      updateBar();

      if (fokus) {
        const tr = $('#fb tr[data-k="' + CSS.escape(fokus) + '"]');
        if (tr) { tr.scrollIntoView({ block: 'center' }); const inp = tr.querySelector('input'); if (inp) inp.focus(); tr.style.outline = '2px solid var(--orange)'; setTimeout(() => tr.style.outline = '', 2500); }
      }
      if (!editable) return;

      const reload = () => this.formPage(c, ctx, kodeKat);
      $('#btnReset').onclick = async () => {
        if (isDirty() && !(await UI.confirmDialog({ title: 'Batalkan perubahan?', body: '<p>Semua isian yang belum disimpan pada kategori ini akan dikembalikan ke data tersimpan terakhir.</p>', ok: 'Ya, Reset', okCls: 'btn-danger' }))) return;
        this.clearDraft(d, k.kode_kategori);
        App.guard = null; reload();
      };
      const doSave = async (tandai, btn) => {
        // kumpulkan baris valid & periksa
        const errRows = [], hapus = [], kosongkan = [];
        k.itemKodes.forEach(kd => {
          const r = cekBaris(kd), it = tpl.byKode[kd];
          if (r.e.length) errRows.push(it.nama_peralatan);
          if (!r.diusulkan && orig[kd].E && Number(orig[kd].E) > 0) hapus.push(it.nama_peralatan);
          else if (!r.diusulkan && r.w.length) kosongkan.push(it.nama_peralatan);
        });
        if (errRows.length) {
          toast('Simpan ditolak: ' + errRows.length + ' baris belum valid (ditandai merah).', 'error');
          segV = 'err'; $$('#seg button').forEach(x => x.classList.toggle('on', x.dataset.v === 'err')); applyFilter();
          return;
        }
        if (hapus.length || kosongkan.length) {
          const ok = await UI.confirmDialog({
            title: hapus.length ? 'Hapus usulan?' : 'Kosongkan isian?', icon: 'trash',
            body: (hapus.length ? '<p>Jumlah kebutuhan dikosongkan pada <b>' + hapus.length + '</b> item. <b>Seluruh isian baris tersebut (E–K) akan ikut terhapus</b>:</p><ul class="small">' + hapus.slice(0, 12).map(n => '<li>' + esc(n) + '</li>').join('') + (hapus.length > 12 ? '<li>…</li>' : '') + '</ul>' : '') +
              (kosongkan.length ? '<p>' + kosongkan.length + ' baris memiliki isian tanpa jumlah kebutuhan sehingga akan dikosongkan:</p><ul class="small">' + kosongkan.slice(0, 8).map(n => '<li>' + esc(n) + '</li>').join('') + '</ul>' : ''),
            ok: 'Ya, Simpan', okCls: 'btn-danger'
          });
          if (!ok) return;
        }
        if (!admin && d.pendataan && d.pendataan.status === 'DIKIRIM' && (isDirty() || tandai)) {
          const ok = await UI.confirmDialog({ title: 'Ubah data yang sudah dikirim?', body: '<p>Status pendataan akan kembali menjadi <b>DRAFT</b> dan Kantor Anda keluar dari rekap nasional sampai pendataan <b>dikirim ulang</b>.</p>', ok: 'Ya, Simpan sebagai DRAFT' });
          if (!ok) return;
        }
        const items = [];
        k.itemKodes.forEach(kd => { const v = cur[kd]; if (/^\d+$/.test(v.E) && Number(v.E) > 0) items.push({ kode_item: kd, jml_kebutuhan: v.E, rencana_alokasi: v.G.trim(), jml_kondisi: v.H, penempatan_saat_ini: v.J.trim(), justifikasi: v.K.trim() }); });
        // ✅ Optimistic: tampilan langsung tersimpan, sinkron ke server di latar belakang
        const snapshot = JSON.parse(JSON.stringify(cur));
        const now = new Date().toISOString();
        this.queue(ctx, d, {
          action: 'pendataanSimpanKategori',
          payload: versi => ({ id_periode: d.periode.id_periode, id_kantor: d.kantor.id_kantor, kode_kategori: k.kode_kategori, items, versi_data: versi, tandai_selesai: !!tandai }),
          patch: raw => {
            const set = new Set(k.itemKodes);
            raw.items = raw.items.filter(x => !set.has(x.kode_item)).concat(items.map(x => ({ kode_item: x.kode_item, jml_kebutuhan: Number(x.jml_kebutuhan),
              rencana_alokasi: x.rencana_alokasi, jml_kondisi: x.jml_kondisi === '' ? '' : Number(x.jml_kondisi), penempatan_saat_ini: x.penempatan_saat_ini, justifikasi: x.justifikasi, diubah_pada: now, diubah_oleh: App.user.username })));
            if (tandai && !admin) raw.review[k.kode_kategori] = { selesai: true, ditinjau_pada: now, ditinjau_oleh: App.user.username };
          },
          onOk: () => { this.clearDraft(d, k.kode_kategori); },
          onFail: () => { this.saveDraft(d, k.kode_kategori, snapshot); }
        });
        this.clearDraft(d, k.kode_kategori);
        App.guard = null;
        toast(items.length + ' item disimpan' + (tandai && !admin ? ' · ditandai Selesai Ditinjau' : '') + '. Sinkronisasi berjalan di latar belakang.', 'success', 2500);
        if (tandai && !admin && next) { App.go(ctx.base + '/' + encodeURIComponent(next.kode_kategori)); return; }
        const y = window.scrollY; await this.formPage(c, ctx, kodeKat); window.scrollTo(0, y);
      };
      $('#btnSave').onclick = e => doSave(false, e.currentTarget);
      if ($('#btnSaveRev')) $('#btnSaveRev').onclick = e => doSave(true, e.currentTarget);
      if ($('#btnUnrev')) $('#btnUnrev').onclick = async e => {
        if (isDirty()) return toast('Simpan atau reset perubahan terlebih dahulu.', 'warn');
        this.queue(ctx, d, {
          action: 'pendataanSetReview', payload: () => ({ id_periode: d.periode.id_periode, kode_kategori: k.kode_kategori, selesai: false }),
          patch: raw => { raw.review[k.kode_kategori] = { selesai: false, ditinjau_pada: new Date().toISOString(), ditinjau_oleh: App.user.username }; }
        });
        toast('Tanda Selesai Ditinjau dibatalkan.', 'warn', 2500); reload();
      };
    },

    // ==========================================================
    // TABEL BACA-SAJA LENGKAP (riwayat & laporan per kantor)
    // ==========================================================
    /** opts: {hanyaTerisi:bool} → HTML tabel kolom A–K dikelompokkan per Bagian */
    fullTable(tpl, itemMap, opts) {
      opts = opts || {};
      const keep = {};
      if (opts.hanyaTerisi) {
        tpl.items.forEach(it => { if (it.dapat_diisi && itemMap[it.kode_item]) { let p = it; while (p) { keep[p.kode_item] = true; p = tpl.byKode[p.kode_induk]; } } });
      }
      const rows = tpl.items.filter(it => it.jenis_baris !== 'KELOMPOK' && (!opts.hanyaTerisi || keep[it.kode_item] || (it.jenis_baris === 'RINCIAN' && keep[it.kode_induk])));
      if (!rows.length) return UI.emptyState('Belum ada item yang diusulkan.');
      const body = rows.map(it => {
        if (it.jenis_baris === 'BAGIAN') return '<tr class="grp-dark"><td colspan="9">' + esc(it.penanda + ' ' + it.nama_peralatan) + '</td></tr>';
        const pad = 'padding-left:' + Math.max(0, (it.level - 2) * 14) + 'px';
        if (it.jenis_baris === 'JUDUL') return '<tr class="grp"><td class="c">' + esc(Template.nomor(it)) + '</td><td colspan="8"><span style="' + pad + '">' + esc(it.nama_peralatan) + '</span></td></tr>';
        if (it.jenis_baris === 'RINCIAN') return '<tr><td></td><td class="small muted"><span style="' + pad + '">' + esc(it.nama_peralatan) + '</span></td><td colspan="7"></td></tr>';
        const v = itemMap[it.kode_item] || {};
        return '<tr><td class="c">' + esc(Template.nomor(it)) + '</td><td><span style="' + pad + ';display:inline-block">' + esc(it.nama_peralatan) + '</span></td>' +
          '<td class="r"><b>' + (v.jml_kebutuhan ? fmt.num(v.jml_kebutuhan) : '') + '</b></td><td class="c small">' + esc(it.satuan_kebutuhan) + '</td><td class="small">' + esc(v.rencana_alokasi || '') + '</td>' +
          '<td class="r">' + (v.jml_kondisi !== undefined && v.jml_kondisi !== '' ? fmt.num(v.jml_kondisi) : '') + '</td><td class="c small">' + esc(it.satuan_kondisi) + '</td><td class="small">' + esc(v.penempatan_saat_ini || '') + '</td>' +
          '<td class="small" style="min-width:240px;white-space:pre-wrap">' + esc(v.justifikasi || '') + '</td></tr>';
      }).join('');
      return '<div class="table-wrap"><table class="tbl"><thead><tr><th class="c">No</th><th>Nama Sarana dan/ Peralatan SAR</th><th class="r">Kebutuhan (E)</th><th class="c">Satuan (F)</th><th>Rencana Alokasi (G)</th><th class="r">Kondisi (H)</th><th class="c">Satuan (I)</th><th>Penempatan Saat Ini (J)</th><th>Justifikasi (K)</th></tr></thead><tbody>' + body + '</tbody></table></div>';
    }
  };

  // Lacak versi data terbaru dari setiap respons server & sebarkan hasil tulis ke cache terkait
  API.onResponse((action, data) => {
    if (!data || !data.pendataan || !data.periode || !data.kantor || !Array.isArray(data.items)) return;
    const pk = data.periode.id_periode + '|' + data.kantor.id_kantor, v = Number(data.pendataan.versi_data) || 0;
    if (P.versi[pk] !== undefined && v > P.versi[pk]) P.versi[pk] = v;
    if (['pendataanSimpanKepala', 'pendataanKirim', 'pendataanSimpanKategori', 'pendataanSetReview'].indexOf(action) >= 0) {
      API.putMatching('pendataanGet', x => x && x.periode && x.kantor && x.periode.id_periode === data.periode.id_periode && x.kantor.id_kantor === data.kantor.id_kantor, data);
    }
  });

  global.Pendataan = P;
})(window);
