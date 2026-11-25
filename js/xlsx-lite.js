/* ============================================================
   SIPERSAR — xlsx-lite.js
   Pembaca & penulis berkas .xlsx tanpa pustaka eksternal.
   - Baca : ZIP (deflate via DecompressionStream bawaan browser) → sel
   - Tulis: ZIP (store) + SpreadsheetML dengan gaya, merge, lebar kolom
   ============================================================ */
(function (global) {
  'use strict';

  // ---------- CRC32 ----------
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  const enc = new TextEncoder(), dec = new TextDecoder('utf-8');

  // ---------- ZIP tulis (metode STORE) ----------
  function zipStore(files) { // files: [{name, data: Uint8Array}]
    const chunks = [], central = []; let offset = 0;
    const dosTime = 0, dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;
    files.forEach(f => {
      const nameB = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, nameB.length, true); lh.setUint16(28, 0, true);
      chunks.push(new Uint8Array(lh.buffer), nameB, f.data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
      ch.setUint16(28, nameB.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nameB);
      offset += 30 + nameB.length + size;
    });
    const cdSize = central.reduce((s, c) => s + c.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    const all = chunks.concat(central, [new Uint8Array(end.buffer)]);
    const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0)); let p = 0;
    all.forEach(c => { out.set(c, p); p += c.length; });
    return out;
  }

  // ---------- ZIP baca ----------
  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Browser tidak mendukung pembacaan .xlsx (DecompressionStream). Gunakan Chrome/Edge/Firefox terbaru.');
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function unzip(buf) {
    const b = new Uint8Array(buf), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Berkas bukan .xlsx yang valid (struktur ZIP tidak ditemukan).');
    const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
    const files = {};
    for (let i = 0; i < n; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      const name = dec.decode(b.subarray(p + 46, p + 46 + nlen));
      const lnlen = dv.getUint16(lho + 26, true), lxlen = dv.getUint16(lho + 28, true);
      const start = lho + 30 + lnlen + lxlen;
      files[name] = { method, data: b.subarray(start, start + csize) };
      p += 46 + nlen + xlen + clen;
    }
    return {
      names: Object.keys(files),
      async text(name) {
        const f = files[name]; if (!f) return null;
        const raw = f.method === 0 ? f.data : f.method === 8 ? await inflateRaw(f.data) : null;
        if (!raw) throw new Error('Metode kompresi ZIP tidak didukung: ' + f.method);
        return dec.decode(raw);
      }
    };
  }

  // ---------- XML util (regex, cukup untuk SpreadsheetML) ----------
  function xmlDecode(s) {
    return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e) => {
      if (e === 'amp') return '&'; if (e === 'lt') return '<'; if (e === 'gt') return '>'; if (e === 'quot') return '"'; if (e === 'apos') return "'";
      return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    }).replace(/_x([0-9A-Fa-f]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
  }
  function xmlEsc(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }
  function attr(tag, name) { const m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag); return m ? xmlDecode(m[1]) : null; }
  function textOf(xml) { // gabungan semua <t> kecuali di dalam <rPh>
    const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
    let out = ''; const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g; let m;
    while ((m = re.exec(clean))) out += m[1] ? xmlDecode(m[1]) : '';
    return out;
  }
  function colToNum(col) { let n = 0; for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
  function numToCol(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

  /** Baca workbook → { sheets: [{name, rows: Map(rowNum → array kolom)}] } */
  async function readWorkbook(arrayBuffer) {
    const z = await unzip(arrayBuffer);
    const wb = await z.text('xl/workbook.xml');
    if (!wb) throw new Error('Berkas bukan workbook Excel (.xlsx).');
    const rels = (await z.text('xl/_rels/workbook.xml.rels')) || '';
    const relMap = {};
    (rels.match(/<Relationship\b[^>]*>/g) || []).forEach(r => { relMap[attr(r, 'Id')] = attr(r, 'Target'); });
    const ssXml = await z.text('xl/sharedStrings.xml');
    const shared = [];
    if (ssXml) { const re = /<si>([\s\S]*?)<\/si>|<si\/>/g; let m; while ((m = re.exec(ssXml))) shared.push(m[1] ? textOf(m[1]) : ''); }
    const sheets = [];
    for (const s of (wb.match(/<sheet\b[^>]*\/?>/g) || [])) {
      const name = attr(s, 'name'), rid = attr(s, 'r:id');
      let target = relMap[rid] || '';
      target = target.replace(/^\//, '');
      const path = target.startsWith('xl/') ? target : 'xl/' + target.replace(/^\.\//, '');
      const xml = await z.text(path);
      const rows = new Map();
      if (xml) {
        const cre = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g; let m;
        while ((m = cre.exec(xml))) {
          const a = m[1], inner = m[2] || '';
          const ref = attr(' ' + a, 'r'); if (!ref) continue;
          const mm = /^([A-Z]+)(\d+)$/.exec(ref); if (!mm) continue;
          const col = colToNum(mm[1]), row = Number(mm[2]);
          const t = attr(' ' + a, 't');
          let v = null;
          const vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
          if (t === 's') v = vm ? shared[Number(vm[1])] : null;
          else if (t === 'inlineStr') v = textOf(inner);
          else if (t === 'str' || t === 'e') v = vm ? xmlDecode(vm[1]) : null;
          else if (t === 'b') v = vm ? vm[1] === '1' : null;
          else if (vm) { const num = Number(vm[1]); v = isNaN(num) ? xmlDecode(vm[1]) : num; }
          if (v === null || v === undefined) continue;
          if (!rows.has(row)) rows.set(row, []);
          rows.get(row)[col - 1] = v;
        }
      }
      sheets.push({ name, rows });
    }
    return { sheets };
  }

  // ---------- Penulis ----------
  // Gaya bawaan (indeks cellXfs):
  const STYLE = { normal: 0, header: 1, cell: 2, cellBold: 3, title: 4, cellWrap: 5, cellNum: 6, cellCenter: 7, subtitle: 8, cellBoldFill: 9, cellNumBold: 10, plain: 11, plainBold: 12, cellZebra: 13, cellNumZebra: 14, cellWrapZebra: 15, cellCenterZebra: 16, plainMuted: 17 };
  const STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="5"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font>' +
    '<font><b/><sz val="12"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><i/><sz val="9"/><color rgb="FF64748B"/><name val="Arial"/></font></fonts>' +
    '<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF14284B"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE8ECF2"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF6F8FB"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left style="thin"><color rgb="FF8A94A6"/></left><right style="thin"><color rgb="FF8A94A6"/></right><top style="thin"><color rgb="FF8A94A6"/></top><bottom style="thin"><color rgb="FF8A94A6"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="18">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
    '<xf numFmtId="3" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
    '<xf numFmtId="3" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>' +
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  /** Sheet builder sederhana */
  class SheetBuilder {
    constructor(name) { this.name = name; this.cells = new Map(); this.merges = []; this.cols = []; this.freeze = null; this.freezeCol = 0; this.filter = null; this.maxRow = 0; this.maxCol = 0; this.rowHeights = {}; }
    set(row, col, value, style) {
      if (value === undefined || value === null) value = '';
      this.cells.set(row + ':' + col, { v: value, s: style || 0 });
      this.maxRow = Math.max(this.maxRow, row); this.maxCol = Math.max(this.maxCol, col);
      return this;
    }
    merge(r1, c1, r2, c2) { this.merges.push(numToCol(c1) + r1 + ':' + numToCol(c2) + r2); return this; }
    widths(arr) { this.cols = arr; return this; }
    freezeAt(row, col) { this.freeze = row; this.freezeCol = col || 0; return this; }
    /** Filter otomatis Excel (dropdown saring & cari di baris header). */
    autoFilter(r1, c1, r2, c2) { this.filter = numToCol(c1) + r1 + ':' + numToCol(c2) + Math.max(r2, r1 + 1); return this; }
    xml() {
      let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
      if (this.freeze) {
        const xs = this.freezeCol ? ' xSplit="' + this.freezeCol + '"' : '';
        x += '<sheetViews><sheetView workbookViewId="0"><pane' + xs + ' ySplit="' + (this.freeze - 1) + '" topLeftCell="' + numToCol(this.freezeCol + 1) + this.freeze + '" activePane="' + (this.freezeCol ? 'bottomRight' : 'bottomLeft') + '" state="frozen"/></sheetView></sheetViews>';
      }
      x += '<sheetFormatPr defaultRowHeight="15"/>';
      if (this.cols.length) x += '<cols>' + this.cols.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>';
      x += '<sheetData>';
      for (let r = 1; r <= this.maxRow; r++) {
        let rowXml = '';
        for (let c = 1; c <= this.maxCol; c++) {
          const cell = this.cells.get(r + ':' + c); if (!cell) continue;
          const ref = numToCol(c) + r, s = cell.s ? ' s="' + cell.s + '"' : '';
          if (typeof cell.v === 'number' && isFinite(cell.v)) rowXml += '<c r="' + ref + '"' + s + '><v>' + cell.v + '</v></c>';
          else if (cell.v === '') rowXml += '<c r="' + ref + '"' + s + '/>';
          else rowXml += '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(cell.v) + '</t></is></c>';
        }
        if (rowXml) x += '<row r="' + r + '"' + (this.rowHeights[r] ? ' ht="' + this.rowHeights[r] + '" customHeight="1"' : '') + '>' + rowXml + '</row>';
      }
      x += '</sheetData>';
      if (this.filter) x += '<autoFilter ref="' + this.filter + '"/>';
      if (this.merges.length) x += '<mergeCells count="' + this.merges.length + '">' + this.merges.map(m => '<mergeCell ref="' + m + '"/>').join('') + '</mergeCells>';
      x += '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>';
      return x;
    }
  }

  function safeSheetName(name, used) {
    let n = String(name).replace(/[\[\]\*\?\/\\:]/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 31) || 'Sheet';
    let base = n, k = 2;
    while (used.has(n.toLowerCase())) { const suf = ' (' + k++ + ')'; n = base.substring(0, 31 - suf.length) + suf; }
    used.add(n.toLowerCase());
    return n;
  }

  function buildWorkbook(sheets) {
    const used = new Set();
    sheets.forEach(s => { s.name = safeSheetName(s.name, used); });
    const files = [];
    const add = (name, str) => files.push({ name, data: enc.encode(str) });
    add('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map((s, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>');
    add('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
    add('docProps/core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>SIPERSAR</dc:title><dc:creator>SIPERSAR Basarnas</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '</dcterms:created></cp:coreProperties>');
    add('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map((s, i) => '<sheet name="' + xmlEsc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets>' +
      (sheets.some(s => s.filter) ? '<definedNames>' + sheets.map((s, i) => s.filter ? '<definedName name="_xlnm._FilterDatabase" localSheetId="' + i + '" hidden="1">\'' + xmlEsc(s.name.replace(/'/g, "''")) + '\'!' + s.filter.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2') + '</definedName>' : '').join('') + '</definedNames>' : '') +
      '</workbook>');
    add('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((s, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    add('xl/styles.xml', STYLES_XML);
    sheets.forEach((s, i) => add('xl/worksheets/sheet' + (i + 1) + '.xml', s.xml()));
    return zipStore(files);
  }

  function download(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  global.XLSXLite = { readWorkbook, buildWorkbook, SheetBuilder, STYLE, download, numToCol, colToNum };
})(typeof window !== 'undefined' ? window : globalThis);
