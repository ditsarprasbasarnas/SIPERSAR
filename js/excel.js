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
