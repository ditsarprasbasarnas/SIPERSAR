/* ============================================================
   SIPERSAR — excel.js
   Ekspor Excel mengikuti format template resmi "sarpalsar 2028"
   (kolom A–K, header 2 baris, nomenklatur kolom A–D apa adanya).
   ============================================================ */
(function (global) {
  'use strict';
  const X = global.XLSXLite, S = X.STYLE;
  const WIDTHS = [6, 5, 5, 50, 9, 10, 30, 9, 10, 26, 44];

  function namaPanjangKantor(nama) {
    const n = String(nama || '').trim();
    if (/^kantor pencarian dan pertolongan/i.test(n)) return n;
    return 'Kantor Pencarian dan Pertolongan ' + n.replace(/^kantor\s+sar\s+/i, '');
  }
  function namaPendekKantor(nama) { return String(nama || '').replace(/^kantor\s+(sar|pencarian dan pertolongan)\s+/i, '').trim(); }
  function cellC(v) { return /^\d+$/.test(String(v).trim()) ? Number(String(v).trim()) : v; }
  function isBold(it) { return it.jenis_baris !== 'ITEM' && it.jenis_baris !== 'RINCIAN'; }
  function satF(it) { return it.jenis_baris === 'ITEM' ? it.satuan_kebutuhan : (it.satuan_asli_f || ''); }
  function satI(it) { return it.jenis_baris === 'ITEM' ? it.satuan_kondisi : (it.satuan_asli_i || ''); }
  function tanggalCetak() { return UI.fmt.date(new Date().toISOString(), true); }

  function headerResmi(s, judul1, judul2, baris3, kanan3) {
    s.set(1, 1, judul1, S.title).merge(1, 1, 1, 11);
    s.set(2, 1, judul2, S.subtitle).merge(2, 1, 2, 11);
    s.set(3, 1, baris3, S.plainBold);
    if (kanan3) s.set(3, 11, kanan3, S.plain);
    const H = S.header;
    for (let c = 1; c <= 11; c++) { s.set(4, c, '', H); s.set(5, c, '', H); }
    s.set(4, 1, 'NO', H).set(4, 2, 'NAMA SARANA Dan/ PERALATAN SAR', H).set(4, 5, 'KEBUTUHAN ', H)
      .set(4, 7, 'RENCANA ALOKASI PENEMPATAN (Kantor SAR /Pos SAR)', H).set(4, 8, 'KONDISI SAAT INI', H)
      .set(4, 10, 'PENEMPATAN SAAT INI', H).set(4, 11, 'JUSTIFIKASI KEBUTUHAN', H)
      .set(5, 5, 'JML', H).set(5, 6, 'SATUAN', H).set(5, 8, 'JML', H).set(5, 9, 'SATUAN', H);
    s.merge(4, 1, 5, 1).merge(4, 2, 5, 4).merge(4, 5, 4, 6).merge(4, 7, 5, 7).merge(4, 8, 4, 9).merge(4, 10, 5, 10).merge(4, 11, 5, 11);
    s.rowHeights[4] = 30;
    s.widths(WIDTHS).freezeAt(6);
  }

  /** Lembar usulan satu Kantor SAR sesuai template resmi. */
  function sheetKantor(tpl, kantor, periode, itemMap, pd, sheetName) {
    const s = new X.SheetBuilder(sheetName || namaPendekKantor(kantor.nama_kantor));
    headerResmi(s, 'DATA KEBUTUHAN SARANA DAN PERALATAN SAR', 'UNTUK PENYUSUNAN RENCANA KEBUTUHAN', namaPanjangKantor(kantor.nama_kantor), periode.nama_periode);
    let r = 6;
    tpl.items.forEach(it => {
      const b = isBold(it), st = b ? S.cellBold : S.cell, wrap = b ? S.cellBold : S.cellWrap;
      s.set(r, 1, cellC(it.kol_a), st).set(r, 2, cellC(it.kol_b), st).set(r, 3, cellC(it.kol_c), st).set(r, 4, it.kol_d, wrap);
      const v = itemMap[it.kode_item];
      s.set(r, 5, v && v.jml_kebutuhan !== '' ? Number(v.jml_kebutuhan) : '', S.cellNum).set(r, 6, satF(it), S.cellCenter)
        .set(r, 7, v ? v.rencana_alokasi || '' : '', S.cellWrap)
        .set(r, 8, v && v.jml_kondisi !== '' && v.jml_kondisi !== undefined ? Number(v.jml_kondisi) : '', S.cellNum).set(r, 9, satI(it), S.cellCenter)
        .set(r, 10, v ? v.penempatan_saat_ini || '' : '', S.cellWrap).set(r, 11, v ? v.justifikasi || '' : '', S.cellWrap);
      r++;
    });
    // blok pengesahan
    r += 2;
    s.set(r++, 10, '……………………, ' + tanggalCetak(), S.plain);
    s.set(r++, 10, 'Kepala ' + namaPanjangKantor(kantor.nama_kantor), S.plain);
    r += 3;
    s.set(r++, 10, pd && pd.nama_kepala ? pd.nama_kepala : '(……………………………)', S.plainBold);
    if (pd && pd.pangkat_golongan_kepala) s.set(r++, 10, pd.pangkat_golongan_kepala, S.plain);
    s.set(r++, 10, 'NIP. ' + (pd && pd.nip_kepala ? pd.nip_kepala : '……………………'), S.plain);
    return s;
  }

  /** Lembar "Rekap Nasional" (hanya Kantor berstatus DIKIRIM). */
  function sheetRekap(tpl, lap) {
    const s = new X.SheetBuilder('Rekap Nasional');
    const kMap = {}; lap.kantor.forEach(k => { kMap[k.id_kantor] = k; });
    const agg = {}; lap.agregat.forEach(a => { agg[a.kode_item] = a; });
    const pengusul = {}; lap.rincian.forEach(r => { (pengusul[r[1]] = pengusul[r[1]] || []).push(r[0]); });
    s.set(1, 1, 'REKAPITULASI NASIONAL USULAN KEBUTUHAN SARANA DAN PERALATAN SAR', S.title).merge(1, 1, 1, 10);
    s.set(2, 1, lap.periode.nama_periode + ' — Direktorat Sarana dan Prasarana Basarnas', S.subtitle).merge(2, 1, 2, 10);
    s.set(3, 1, 'Dihitung dari ' + lap.jumlah_dikirim + ' Kantor SAR berstatus DIKIRIM (dari ' + lap.jumlah_kantor_aktif + ' Kantor SAR aktif). Diunduh ' + tanggalCetak() + '.', S.plain);
    const H = S.header;
    for (let c = 1; c <= 10; c++) { s.set(4, c, '', H); s.set(5, c, '', H); }
    s.set(4, 1, 'NO', H).set(4, 2, 'NAMA SARANA Dan/ PERALATAN SAR', H).set(4, 5, 'TOTAL KEBUTUHAN', H).set(4, 7, 'JUMLAH KANTOR SAR PENGUSUL', H)
      .set(4, 8, 'TOTAL KONDISI SAAT INI', H).set(4, 10, 'KANTOR SAR PENGUSUL', H)
      .set(5, 5, 'JML', H).set(5, 6, 'SATUAN', H).set(5, 8, 'JML', H).set(5, 9, 'SATUAN', H);
    s.merge(4, 1, 5, 1).merge(4, 2, 5, 4).merge(4, 5, 4, 6).merge(4, 7, 5, 7).merge(4, 8, 4, 9).merge(4, 10, 5, 10);
    s.rowHeights[4] = 30;
    s.widths([6, 5, 5, 50, 10, 10, 14, 10, 10, 60]).freezeAt(6);
    let r = 6; const perSatuan = {};
    tpl.items.forEach(it => {
      const b = isBold(it), st = b ? S.cellBold : S.cell;
      s.set(r, 1, cellC(it.kol_a), st).set(r, 2, cellC(it.kol_b), st).set(r, 3, cellC(it.kol_c), st).set(r, 4, it.kol_d, b ? S.cellBold : S.cellWrap);
      const a = agg[it.kode_item];
      s.set(r, 5, a ? a.total_kebutuhan : '', S.cellNum).set(r, 6, satF(it), S.cellCenter).set(r, 7, a ? a.jumlah_kantor : '', S.cellNum)
        .set(r, 8, a ? a.total_kondisi : '', S.cellNum).set(r, 9, satI(it), S.cellCenter)
        .set(r, 10, a ? (pengusul[it.kode_item] || []).map(id => kMap[id]).filter(Boolean).sort((x, y) => x.no_urut - y.no_urut).map(k => namaPendekKantor(k.nama_kantor)).join(', ') : '', S.cellWrap);
      if (a) { const u = (satF(it) || '(tanpa satuan)'); perSatuan[u] = (perSatuan[u] || 0) + a.total_kebutuhan; }
      r++;
    });
    r++;
    s.set(r++, 2, 'Total kebutuhan per satuan:', S.plainBold);
    Object.keys(perSatuan).sort().forEach(u => { s.set(r, 4, u, S.cellBoldFill).set(r, 5, perSatuan[u], S.cellNumBold); r++; });
    return s;
  }

  // ------------------------------------------------------------
  // Tabel data datar yang mudah dibaca, disaring & dicari di Excel
  // ------------------------------------------------------------
  /** cols: [{h: judul, w: lebar, t: 'num'|'wrap'|'center'|'text'}], rows: array nilai per kolom */
  function sheetTabel(nama, judul, sub, cols, rows, opts) {
    opts = opts || {};
    const s = new X.SheetBuilder(nama), n = cols.length;
    s.set(1, 1, judul, S.title).merge(1, 1, 1, n);
    s.set(2, 1, sub, S.subtitle).merge(2, 1, 2, n);
    s.set(3, 1, 'Petunjuk: klik tombol ▼ pada judul kolom untuk menyaring atau mencari (Data → Filter). Baris judul tetap terlihat saat digulir.', S.plainMuted).merge(3, 1, 3, n);
    const H = 5;
    cols.forEach((c, i) => s.set(H, i + 1, c.h, S.header));
    s.rowHeights[H] = 32;
    rows.forEach((row, ri) => {
      const z = ri % 2 === 1;
      cols.forEach((c, ci) => {
        let v = row[ci]; if (v === undefined || v === null) v = '';
        const st = c.t === 'num' ? (z ? S.cellNumZebra : S.cellNum) : c.t === 'wrap' ? (z ? S.cellWrapZebra : S.cellWrap) : c.t === 'center' ? (z ? S.cellCenterZebra : S.cellCenter) : (z ? S.cellZebra : S.cell);
        s.set(H + 1 + ri, ci + 1, c.t === 'num' && v !== '' ? Number(v) : (typeof v === 'number' ? v : String(v)), st);
      });
    });
    if (!rows.length) s.set(H + 1, 1, 'Belum ada data.', S.plainMuted);
    let r = H + 1 + Math.max(rows.length, 1);
    if (opts.total) { r++; opts.total.forEach(t => { s.set(r, t.col, t.v, typeof t.v === 'number' ? S.cellNumBold : S.cellBoldFill); }); r++; }
    s.widths(cols.map(c => c.w)).freezeAt(H + 1, opts.freezeCol || 0).autoFilter(H, 1, H + Math.max(rows.length, 1), n);
    return s;
  }
  function jalurItem(tpl, it) {
    const kel = it.kelompok || '', bag = it.bagian || '', kat = it.kategori && it.kategori !== (it.bagian || '').replace(/^\S+\s/, '') ? it.kategori : '';
    return { kel, bag, kat, sub: it.subkategori || '' };
  }
  function infoLap(lap) { return lap.periode.nama_periode + ' · ' + lap.jumlah_dikirim + ' Kantor SAR berstatus DIKIRIM (dari ' + lap.jumlah_kantor_aktif + ' aktif) · diunduh ' + tanggalCetak(); }

  function fileSafe(s) { return String(s).replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_').substring(0, 60); }

  const Excel = {
    namaPanjangKantor, namaPendekKantor,
    downloadKantor(tpl, kantor, periode, itemMap, pd) {
      const s = sheetKantor(tpl, kantor, periode, itemMap, pd, 'sarpalsar ' + (periode.tahun || ''));
      X.download(X.buildWorkbook([s]), 'Usulan_' + fileSafe(namaPendekKantor(kantor.nama_kantor)) + '_' + fileSafe(periode.nama_periode) + '.xlsx');
    },
    downloadNasional(tpl, lap) {
      const sheets = [sheetRekap(tpl, lap)];
      const byK = {}; lap.rincian.forEach(r => { (byK[r[0]] = byK[r[0]] || {})[r[1]] = { jml_kebutuhan: r[2], rencana_alokasi: r[3], jml_kondisi: r[4], penempatan_saat_ini: r[5], justifikasi: r[6] }; });
      lap.kantor.filter(k => k.status === 'DIKIRIM').sort((a, b) => a.no_urut - b.no_urut).forEach(k => {
        sheets.push(sheetKantor(tpl, k, lap.periode, byK[k.id_kantor] || {}, k.pendataan, String(k.no_urut).padStart(2, '0') + ' ' + namaPendekKantor(k.nama_kantor)));
      });
      X.download(X.buildWorkbook(sheets), 'Rekap_Nasional_SIPERSAR_' + fileSafe(lap.periode.nama_periode) + '.xlsx');
    },
    /** Rekap per Peralatan: ringkasan per item + rincian Kantor pengusul bernomor. */
    downloadPeralatan(tpl, lap) {
      const kMap = lap.kMap, items = tpl.items.filter(it => lap.agg[it.kode_item]);
      const ringkas = items.map((it, i) => {
        const a = lap.agg[it.kode_item], j = jalurItem(tpl, it);
        const pengusul = (lap.byItem[it.kode_item] || []).slice().sort((x, y) => kMap[x.id_kantor].no_urut - kMap[y.id_kantor].no_urut);
        return [i + 1, j.kel, j.bag, it.kategori, j.sub, it.nama_peralatan, it.satuan_kebutuhan, a.jumlah_kantor, a.total_kebutuhan, a.total_kondisi,
          pengusul.map(o => namaPendekKantor(kMap[o.id_kantor].nama_kantor)).join(', ')];
      });
      const s1 = sheetTabel('Rekap per Peralatan', 'REKAPITULASI KEBUTUHAN PER NOMENKLATUR SARANA & PERALATAN SAR', infoLap(lap), [
        { h: 'No', w: 6, t: 'center' }, { h: 'Kelompok', w: 22, t: 'wrap' }, { h: 'Bagian', w: 26, t: 'wrap' }, { h: 'Kategori', w: 24, t: 'wrap' }, { h: 'Sub Kategori', w: 26, t: 'wrap' },
        { h: 'Nama Sarana / Peralatan', w: 46, t: 'wrap' }, { h: 'Satuan', w: 9, t: 'center' }, { h: 'Jumlah Kantor SAR Pengusul', w: 13, t: 'num' },
        { h: 'Total Kebutuhan (E)', w: 13, t: 'num' }, { h: 'Total Kondisi Saat Ini (H)', w: 13, t: 'num' }, { h: 'Kantor SAR Pengusul', w: 60, t: 'wrap' }
      ], ringkas, { freezeCol: 0, total: [{ col: 6, v: 'Jumlah nomenklatur diusulkan: ' + items.length }] });
      const rinci = [];
      items.forEach(it => {
        const det = (lap.byItem[it.kode_item] || []).slice().sort((x, y) => kMap[x.id_kantor].no_urut - kMap[y.id_kantor].no_urut);
        det.forEach((o, i) => rinci.push([rinci.length + 1, it.nama_peralatan, it.satuan_kebutuhan, i + 1, det.length, kMap[o.id_kantor].nama_kantor,
          o.jml_kebutuhan, o.rencana_alokasi, o.jml_kondisi, o.penempatan_saat_ini, o.justifikasi, it.bagian, it.kategori]));
      });
      const s2 = sheetTabel('Rincian Kantor Pengusul', 'RINCIAN KANTOR SAR PENGUSUL PER PERALATAN', infoLap(lap) + ' · Saring kolom "Nama Sarana / Peralatan" untuk melihat daftar pengusul bernomor.', [
        { h: 'No', w: 6, t: 'center' }, { h: 'Nama Sarana / Peralatan', w: 42, t: 'wrap' }, { h: 'Satuan', w: 9, t: 'center' }, { h: 'No. Pengusul', w: 10, t: 'center' },
        { h: 'Jumlah Kantor Pengusul', w: 11, t: 'num' }, { h: 'Kantor SAR', w: 30, t: 'wrap' }, { h: 'Kebutuhan (E)', w: 11, t: 'num' }, { h: 'Rencana Alokasi Penempatan (G)', w: 30, t: 'wrap' },
        { h: 'Kondisi Saat Ini (H)', w: 11, t: 'num' }, { h: 'Penempatan Saat Ini (J)', w: 26, t: 'wrap' }, { h: 'Justifikasi Kebutuhan (K)', w: 54, t: 'wrap' },
        { h: 'Bagian', w: 24, t: 'wrap' }, { h: 'Kategori', w: 22, t: 'wrap' }
      ], rinci, { freezeCol: 2 });
      X.download(X.buildWorkbook([s1, s2]), 'Rekap_per_Peralatan_' + fileSafe(lap.periode.nama_periode) + '.xlsx');
      return { item: items.length, baris: rinci.length };
    },
    /** Rekap per Kantor SAR: ringkasan seluruh Kantor + rincian usulan Kantor DIKIRIM. */
    downloadRekapKantor(tpl, lap) {
      const kantor = lap.kantor.slice().sort((a, b) => a.no_urut - b.no_urut);
      const ringkas = kantor.map((k, i) => {
        const pd = k.pendataan || {}, items = k.status === 'DIKIRIM' ? Object.values(lap.byKantor[k.id_kantor] || {}) : [];
        return [i + 1, k.no_urut, k.nama_kantor, k.status === 'BELUM' ? 'BELUM MENGISI' : k.status, k.status === 'DIKIRIM' ? UI.fmt.dt(pd.dikirim_pada) : '', k.status === 'DIKIRIM' ? pd.dikirim_oleh || '' : '',
          pd.nama_kepala || '', pd.nip_kepala || '', pd.pangkat_golongan_kepala || '', k.status === 'DIKIRIM' ? items.length : '', k.status === 'DIKIRIM' ? items.reduce((t, o) => t + (Number(o.jml_kebutuhan) || 0), 0) : ''];
      });
      const s1 = sheetTabel('Ringkasan Kantor SAR', 'REKAPITULASI USULAN PER KANTOR SAR', infoLap(lap) + ' · Hanya Kantor berstatus DIKIRIM yang dihitung dalam rekap.', [
        { h: 'No', w: 6, t: 'center' }, { h: 'No. Urut Master', w: 9, t: 'center' }, { h: 'Kantor SAR', w: 32, t: 'wrap' }, { h: 'Status', w: 15, t: 'center' },
        { h: 'Waktu Pengiriman', w: 22, t: 'text' }, { h: 'Dikirim Oleh', w: 16, t: 'text' }, { h: 'Kepala Kantor', w: 30, t: 'wrap' }, { h: 'NIP Kepala', w: 21, t: 'text' },
        { h: 'Pangkat / Golongan', w: 24, t: 'wrap' }, { h: 'Jumlah Item Diusulkan', w: 12, t: 'num' }, { h: 'Total Kuantitas Kebutuhan (lintas satuan)', w: 15, t: 'num' }
      ], ringkas, { freezeCol: 3, total: [{ col: 3, v: 'DIKIRIM: ' + lap.jumlah_dikirim + ' dari ' + kantor.length + ' Kantor SAR' }] });
      const rinci = [];
      kantor.filter(k => k.status === 'DIKIRIM').forEach(k => {
        const m = lap.byKantor[k.id_kantor] || {};
        let n = 0;
        tpl.items.forEach(it => {
          const o = m[it.kode_item]; if (!o) return; n++;
          const j = jalurItem(tpl, it);
          rinci.push([rinci.length + 1, k.no_urut, k.nama_kantor, n, j.kel, j.bag, it.kategori, j.sub, it.nama_peralatan, o.jml_kebutuhan, it.satuan_kebutuhan, o.rencana_alokasi,
            o.jml_kondisi, it.satuan_kondisi, o.penempatan_saat_ini, o.justifikasi]);
        });
      });
      const s2 = sheetTabel('Rincian Usulan per Kantor', 'RINCIAN USULAN KEBUTUHAN PER KANTOR SAR', infoLap(lap) + ' · Saring kolom "Kantor SAR" untuk melihat usulan satu Kantor.', [
        { h: 'No', w: 6, t: 'center' }, { h: 'No. Urut Kantor', w: 8, t: 'center' }, { h: 'Kantor SAR', w: 28, t: 'wrap' }, { h: 'No. Item di Kantor', w: 9, t: 'center' },
        { h: 'Kelompok', w: 20, t: 'wrap' }, { h: 'Bagian', w: 24, t: 'wrap' }, { h: 'Kategori', w: 22, t: 'wrap' }, { h: 'Sub Kategori', w: 24, t: 'wrap' },
        { h: 'Nama Sarana / Peralatan', w: 42, t: 'wrap' }, { h: 'Kebutuhan (E)', w: 11, t: 'num' }, { h: 'Satuan (F)', w: 9, t: 'center' }, { h: 'Rencana Alokasi Penempatan (G)', w: 28, t: 'wrap' },
        { h: 'Kondisi Saat Ini (H)', w: 11, t: 'num' }, { h: 'Satuan (I)', w: 9, t: 'center' }, { h: 'Penempatan Saat Ini (J)', w: 24, t: 'wrap' }, { h: 'Justifikasi Kebutuhan (K)', w: 54, t: 'wrap' }
      ], rinci, { freezeCol: 3 });
      X.download(X.buildWorkbook([s1, s2]), 'Rekap_per_Kantor_SAR_' + fileSafe(lap.periode.nama_periode) + '.xlsx');
      return { kantor: lap.jumlah_dikirim, baris: rinci.length };
    },
    downloadTemplateKosong(tpl, nama) {
      const s = new X.SheetBuilder('sarpalsar ' + new Date().getFullYear());
      headerResmi(s, 'DATA KEBUTUHAN SARANA DAN PERALATAN SAR', 'UNTUK PENYUSUNAN RENCANA KEBUTUHAN', 'Kantor Pencarian dan Pertolongan ...', '');
      let r = 6;
      tpl.items.forEach(it => {
        const b = isBold(it), st = b ? S.cellBold : S.cell;
        s.set(r, 1, cellC(it.kol_a), st).set(r, 2, cellC(it.kol_b), st).set(r, 3, cellC(it.kol_c), st).set(r, 4, it.kol_d, b ? S.cellBold : S.cellWrap)
          .set(r, 5, '', S.cell).set(r, 6, it.satuan_asli_f || '', S.cellCenter).set(r, 7, '', S.cell).set(r, 8, '', S.cell)
          .set(r, 9, it.satuan_asli_i || '', S.cellCenter).set(r, 10, '', S.cell).set(r, 11, '', S.cell);
        r++;
      });
      X.download(X.buildWorkbook([s]), fileSafe(nama || 'Template_SIPERSAR') + '.xlsx');
    }
  };
  global.Excel = Excel;
})(window);
