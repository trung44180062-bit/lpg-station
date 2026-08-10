/* ============================================================
 * TLXK  —  tlxk.js        (v4.86)
 * ------------------------------------------------------------
 * Global xuất ra : window.TLXK
 * Phụ thuộc      : TL (RAM only), JSZip
 * Khởi tạo (boot): không cần — modal tự dựng khi mở lần đầu.
 * ------------------------------------------------------------
 * MÔ TẢ
 *   Đổ TL Data của MỘT ngày vào sheet "Detail" của file
 *   "PHIẾU XUẤT KHO ... .xlsm" (file VBA của Check booth).
 *
 *   • Đọc TL.ROWS trong RAM — KHÔNG đọc Firebase (Spark quota).
 *   • Ghi cell-level bằng JSZip: chỉ sửa xl/worksheets/<Detail>.xml.
 *     vbaProject.bin, macro, style, conditional formatting, drawing,
 *     data validation… giữ nguyên 100%.
 *   • Mapping cột theo TÊN HEADER ở hàng header của sheet Detail
 *     (không theo vị trí) → thêm/bớt/đảo cột bên Excel vẫn chạy đúng.
 *     Cột nào TL có mà Detail không có → bỏ qua im lặng.
 *   • Ghi tiếp từ DÒNG CUỐI CÙNG đang có dữ liệu.
 *
 *   HAI LỚP KIỂM TRA TRƯỚC KHI GHI
 *   1) NGÀY LIÊN TIẾP — ngày định đổ phải = ngày ở dòng cuối + 1.
 *      Lệch (nhảy cóc / lùi ngày / trùng ngày) → hỏi xác nhận.
 *   2) TRÙNG DO — user hay cập nhật nhiều lần trong cùng 1 ngày, nên
 *      khi ngày đã có sẵn thì so tiếp theo khoá
 *         Date | DO No. | Scale No. | Turn No.
 *      Dòng nào đã có trong Detail → mặc định BỎ QUA, chỉ đổ dòng mới.
 *
 *   File gốc KHÔNG bị đụng: kết quả luôn ghi ra file mới qua Save As.
 * ============================================================ */

const TLXK = (function(){

  const state = { zip:null, fileName:'', fileHandle:null, built:false };

  /* ── Header (đã normalize) → field key của TL.ROWS ─────────────
     normalize = lowercase + bỏ mọi ký tự không phải a-z0-9.
     Vd: '%C3' → 'c3'  ·  'C3 kg' → 'c3kg'  ·  'Diff%' → 'diff'. */
  const HMAP = {
    date:'date', ngay:'date', loadingdate:'date',
    gidate:'giDate',
    dono:'doNo', donumber:'doNo', do:'doNo', donum:'doNo',
    customer:'cust', cust:'cust',
    tradetype:'trade', trade:'trade',
    lpgtype:'type', type:'type', producttype:'type',
    scaleno:'scaleNo', scale:'scaleNo',
    turnno:'turn', turn:'turn',
    tank:'ltank', ltank:'ltank', shoretank:'ltank',
    lot:'lot', lotno:'lot',
    truck:'truck', truckno:'truck', plate:'truck',
    rmooc:'rmooc', rmoocno:'rmooc', romooc:'rmooc', trailer:'rmooc',
    driver:'driver',
    netweight:'lpgQty', netwt:'lpgQty', net:'lpgQty', lpgqty:'lpgQty', qty:'lpgQty',
    c3kg:'c3Kg', c4kg:'c4Kg',
    c3:'c3Pct', c4:'c4Pct', wtc3:'c3Pct', wtc4:'c4Pct',
    fq:'fq',
    diff:'pct', diffpct:'pct',
    truckwt:'truckWt', tarewt:'truckWt',
    '1sttime':'timeIn', firsttime:'timeIn', timein:'timeIn',
    grosswt:'grossWt',
    '2ndtime':'timeOut', secondtime:'timeOut', timeout:'timeOut',
    pressin:'pressIn', pressout:'pressOut',
    engineer:'eng', eng:'eng',
    destination:'dest', dest:'dest',
    note:'note', remark:'note',
    error:'error',
    sealno:'seal', seal:'seal',
    checkbooth:'weigher', weigher:'weigher', checkboothstaff:'weigher',
    customerwms:'custFull', custwms:'custFull', wmscustomer:'custFull',
    contractwt:'cw', cw:'cw', contractweight:'cw',
    maxtol:'maxTol', maxtolerance:'maxTol',
    price:'price'
  };

  /* Kiểu ghi ra Excel cho từng field */
  const K_DATE = new Set(['date','giDate']);
  const K_TIME = new Set(['timeIn','timeOut']);
  const K_PCT  = new Set(['c3Pct','c4Pct','pct']);   /* ô Excel format 0% → ghi phân số */
  const K_NUM  = new Set(['scaleNo','turn','lot','lpgQty','c3Kg','c4Kg','fq',
                          'truckWt','grossWt','pressIn','pressOut','cw','maxTol','price']);

  /* ═══════════ helpers: chuỗi / số / ngày / giờ ═══════════ */
  function _norm(s){ return String(s==null?'':s).toLowerCase().replace(/[^a-z0-9]/g,''); }
  function _xesc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function _num(v){
    if(v==null) return '';
    const s = String(v).trim(); if(!s) return '';
    const n = parseFloat(s.replace(/,/g,''));
    return isFinite(n) ? n : '';
  }
  /* Mọi format ngày của app → ISO 'YYYY-MM-DD'. Trả '' nếu không đọc được. */
  function _toISO(v){
    if(v==null) return '';
    const s = String(v).trim(); if(!s) return '';
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if(m) return m[1]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[3]).padStart(2,'0');
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if(m){
      let y = m[3]; if(y.length===2) y = '20'+y;
      return y+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0');
    }
    return '';
  }
  function _isoToSerial(iso){
    if(!iso) return '';
    const p = iso.split('-');
    const ms = Date.UTC(+p[0], +p[1]-1, +p[2]);
    return Math.round(ms/86400000) + 25569;
  }
  function _serialToISO(n){
    const d = new Date(Math.round((n - 25569) * 86400000));
    const p = x => String(x).padStart(2,'0');
    return d.getUTCFullYear()+'-'+p(d.getUTCMonth()+1)+'-'+p(d.getUTCDate());
  }
  function _isoAddDays(iso, k){
    const p = iso.split('-');
    const d = new Date(Date.UTC(+p[0], +p[1]-1, +p[2]+k));
    const q = x => String(x).padStart(2,'0');
    return d.getUTCFullYear()+'-'+q(d.getUTCMonth()+1)+'-'+q(d.getUTCDate());
  }
  function _isoDiffDays(a, b){   /* b - a, tính theo ngày */
    return Math.round((Date.parse(b+'T00:00:00Z') - Date.parse(a+'T00:00:00Z')) / 86400000);
  }
  function _isoToVN(iso){ if(!iso) return ''; const p = iso.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
  function _todayISO(){ const d=new Date(), p=x=>String(x).padStart(2,'0');
    return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }
  /* 'HH:MM' | 'HH:MM:SS' | '6h54' → phân số của một ngày (ô format h:mm) */
  function _timeFrac(v){
    if(v==null) return '';
    const s = String(v).trim(); if(!s) return '';
    const m = s.match(/^(\d{1,2})\s*[:hH]\s*(\d{1,2})(?:\s*[:.]\s*(\d{1,2}))?/);
    if(!m) return '';
    const h = +m[1], mi = +m[2], se = m[3] ? +m[3] : 0;
    if(h>23 || mi>59 || se>59) return '';
    return Math.round(((h*3600 + mi*60 + se) / 86400) * 1e10) / 1e10;
  }
  /* DO chuẩn hoá để so trùng: bỏ dấu phẩy/khoảng trắng + số 0 dẫn đầu */
  function _normDO(v){ return String(v==null?'':v).replace(/[,\s]/g,'').replace(/^0+(?=\d)/,'').toUpperCase(); }
  function _key(iso, doNo, scale, turn){
    return iso+'|'+_normDO(doNo)+'|'+String(scale==null?'':scale).trim()+'|'+String(turn==null?'':turn).trim();
  }

  /* ═══════════ helpers: XML của SpreadsheetML ═══════════ */
  function _parseSST(xml){
    const out = [];
    const re = /<si>([\s\S]*?)<\/si>/g; let m;
    while((m = re.exec(xml)) !== null){
      let t = ''; const tr = /<t[^>]*>([\s\S]*?)<\/t>/g; let tm;
      while((tm = tr.exec(m[1])) !== null) t += tm[1];
      out.push(t);
    }
    return out;
  }
  function _cellVal(cx, sst){
    const tm = cx.match(/\bt="([^"]+)"/);
    const tp = tm ? tm[1] : 'n';
    if(tp === 'inlineStr' || tp === 'str'){
      const im = cx.match(/<t[^>]*>([\s\S]*?)<\/t>/);
      return im ? im[1] : '';
    }
    const vm = cx.match(/<v>([\s\S]*?)<\/v>/);
    if(!vm) return '';
    if(tp === 's') return sst[parseInt(vm[1],10)] || '';
    return vm[1];
  }
  function _parseRows(xml){
    const out = [];
    const re = /<row\b[^>]*\/>|<row\b[^>]*>[\s\S]*?<\/row>/g; let m;
    while((m = re.exec(xml)) !== null){
      const rm = m[0].match(/\br="(\d+)"/);
      if(rm) out.push({ num: parseInt(rm[1],10), xml: m[0] });
    }
    return out;
  }
  function _cellsOf(rowXml){
    const map = {};
    const re = /<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g; let m;
    while((m = re.exec(rowXml)) !== null){
      const rm = m[0].match(/\br="([A-Z]+)\d+"/);
      if(rm) map[rm[1]] = m[0];
    }
    return map;
  }
  function _openTag(rowXml){ const m = rowXml.match(/^<row\b[^>]*?\/?>/); return m ? m[0] : '<row>'; }
  function _styleOf(cx){ const m = cx && cx.match(/\bs="(\d+)"/); return m ? m[1] : null; }
  function _colNum(L){ let n=0; for(let i=0;i<L.length;i++) n = n*26 + (L.charCodeAt(i)-64); return n; }
  function _colName(n){ let s=''; while(n>0){ const r=(n-1)%26; s=String.fromCharCode(65+r)+s; n=(n-1-r)/26; } return s; }
  function _cell(col, rn, sty, val){
    const sA = sty ? ' s="'+sty+'"' : '';
    if(val === '' || val == null) return '<c r="'+col+rn+'"'+sA+'/>';
    if(typeof val === 'number' && isFinite(val)) return '<c r="'+col+rn+'"'+sA+'><v>'+val+'</v></c>';
    return '<c r="'+col+rn+'"'+sA+' t="inlineStr"><is><t xml:space="preserve">'+_xesc(String(val))+'</t></is></c>';
  }
  /* Biến ô có công thức thành ô rỗng giữ style — dùng cho vùng append.
     Cần thiết: sheet Detail còn sót shared-formula (Q64:Q67 si=0). Nếu ghi
     đè ô master mà bỏ lại ô con thì Excel báo file hỏng. */
  function _stripFormulas(rowXml){
    return rowXml.replace(/<c\b[^>]*>[\s\S]*?<\/c>/g, cx=>{
      if(cx.indexOf('<f') < 0) return cx;
      const rm = cx.match(/\br="([A-Z]+\d+)"/);
      if(!rm) return cx;
      const sty = _styleOf(cx);
      return '<c r="'+rm[1]+'"'+(sty ? ' s="'+sty+'"' : '')+'/>';
    });
  }
  async function _findSheet(zip, re){
    const wb   = await zip.file('xl/workbook.xml').async('string');
    const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    const sheets = []; let m;
    const sr = /<sheet[^>]+name="([^"]+)"[^>]*r:id="([^"]+)"/g;
    while((m = sr.exec(wb)) !== null) sheets.push({ name:m[1], rId:m[2] });
    const rm = {}; let mm;
    const rr = /<Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"/g;
    while((mm = rr.exec(rels)) !== null) rm[mm[1]] = mm[2];
    const f = sheets.find(s => re.test(s.name));
    if(!f) return null;
    return { name:f.name, path:'xl/'+String(rm[f.rId]).replace(/^\//,'') };
  }

  /* ═══════════ log trong modal ═══════════ */
  function log(msg, cls){
    const box = document.getElementById('tlxk-log');
    if(!box) return;
    const d = document.createElement('div');
    d.className = 'tlxk-l ' + (cls || '');
    d.textContent = msg;
    box.appendChild(d);
    box.scrollTop = box.scrollHeight;
  }
  function clearLog(){ const b = document.getElementById('tlxk-log'); if(b) b.innerHTML = ''; }

  /* ═══════════ nguồn dữ liệu: TL.ROWS trong RAM ═══════════ */
  function rowsForDate(iso){
    const src = (typeof TL !== 'undefined' && TL.ROWS) ? TL.ROWS : {};
    const out = [];
    Object.keys(src).forEach(rid=>{
      const r = src[rid];
      if(!r || r.disabled) return;
      if(_toISO(r.date) !== iso) return;
      out.push(r);
    });
    /* Thứ tự ghi = thứ tự cân thực tế: giờ vào cân → scale → turn. */
    out.sort((a,b)=>{
      const ta = _timeFrac(a.timeIn), tb = _timeFrac(b.timeIn);
      if(ta !== '' && tb !== '' && ta !== tb) return ta - tb;
      if(ta === '' && tb !== '') return 1;
      if(tb === '' && ta !== '') return -1;
      const sa = _num(a.scaleNo)||0, sb = _num(b.scaleNo)||0;
      if(sa !== sb) return sa - sb;
      return (_num(a.turn)||0) - (_num(b.turn)||0);
    });
    return out;
  }

  /* ═══════════ chọn file ═══════════ */
  const XLSM_TYPE = { description:'Excel macro workbook',
    accept:{ 'application/vnd.ms-excel.sheet.macroEnabled.12':['.xlsm'],
             'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx'] } };

  async function pickFile(){
    try{
      if(window.showOpenFilePicker){
        const hs = await window.showOpenFilePicker({ types:[XLSM_TYPE] });
        state.fileHandle = hs[0];
        state.fileName   = state.fileHandle.name;
        const f = await state.fileHandle.getFile();
        state.zip = await JSZip.loadAsync(await f.arrayBuffer());
      } else {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = '.xlsm,.xlsx';
        inp.onchange = async ()=>{
          if(!inp.files.length) return;
          state.fileName   = inp.files[0].name;
          state.zip        = await JSZip.loadAsync(await inp.files[0].arrayBuffer());
          state.fileHandle = null;
          log('📄 Loaded: '+state.fileName, 'ok');
          await _afterLoad();
        };
        inp.click();
        return;
      }
      log('📄 Loaded: '+state.fileName, 'ok');
      await _afterLoad();
    }catch(e){
      if(e && e.name === 'AbortError') return;
      log('❌ '+(e && e.message ? e.message : e), 'er');
    }
  }
  async function _afterLoad(){
    const sh = await _findSheet(state.zip, /^\s*Detail\s*$/i);
    if(!sh){ log('❌ Không tìm thấy sheet "Detail" trong file này.', 'er'); state.zip = null; }
    else    log('✓ Sheet "'+sh.name+'" → '+sh.path, 'ok');
    _updateUI();
    await preview();
  }
  function _updateUI(){
    const box  = document.getElementById('tlxk-file-box');
    const name = document.getElementById('tlxk-file-name');
    const btn  = document.getElementById('tlxk-btn-fill');
    if(box)  box.classList.toggle('has-file', !!state.zip);
    if(name) name.textContent = state.zip ? state.fileName : 'Chọn file PHIẾU XUẤT KHO (.xlsm)…';
    if(btn)  btn.disabled = !state.zip;
  }

  /* ═══════════ đọc bố cục sheet Detail ═══════════
     Trả về { sh, sXml, sst, rows, headerRow, dataStart, colOf, dateCol,
              doCol, scaleCol, turnCol, lastDataRow, lastISO, keys } */
  async function _scan(){
    const sh = await _findSheet(state.zip, /^\s*Detail\s*$/i);
    if(!sh) throw new Error('Sheet "Detail" không tồn tại');
    const sstF   = state.zip.file('xl/sharedStrings.xml');
    const sst    = _parseSST(sstF ? await sstF.async('string') : '');
    const sXml   = await state.zip.file(sh.path).async('string');
    const rows   = _parseRows(sXml);

    /* Hàng header = hàng đầu tiên có ≥ 8 ô khớp HMAP. */
    let headerRow = 0, colOf = null;
    for(let i=0; i<rows.length && i<20; i++){
      const cells = _cellsOf(rows[i].xml);
      const map = {}; let hit = 0;
      Object.keys(cells).forEach(L=>{
        const k = HMAP[_norm(_cellVal(cells[L], sst))];
        if(k && !map[L]){ map[L] = k; hit++; }
      });
      if(hit >= 8){ headerRow = rows[i].num; colOf = map; break; }
    }
    if(!colOf) throw new Error('Không đọc được hàng header của sheet Detail');

    /* Hàng ngay dưới header có thể là hàng SỐ THỨ TỰ CỘT (1,2,3…) của VBA —
       không phải dữ liệu. Nhận diện: mọi ô đều là số nguyên ≤ 200. */
    let dataStart = headerRow + 1;
    const nxt = rows.find(r => r.num === headerRow + 1);
    if(nxt){
      const cs = _cellsOf(nxt.xml);
      const vals = Object.keys(cs).map(L => _cellVal(cs[L], sst)).filter(v => v !== '');
      if(vals.length >= 8 && vals.every(v => /^\d+$/.test(v) && +v <= 200)) dataStart = headerRow + 2;
    }

    /* Cột khoá */
    const inv = {}; Object.keys(colOf).forEach(L => { if(!inv[colOf[L]]) inv[colOf[L]] = L; });
    const dateCol = inv.date, doCol = inv.doNo, scaleCol = inv.scaleNo, turnCol = inv.turn;
    if(!dateCol) throw new Error('Sheet Detail không có cột "Date"');

    /* Quét vùng dữ liệu: dòng cuối cùng có ngày + tập khoá đã tồn tại */
    let lastDataRow = dataStart - 1, lastISO = '';
    const keys = Object.create(null);
    rows.forEach(r=>{
      if(r.num < dataStart) return;
      const cs = _cellsOf(r.xml);
      const dv = cs[dateCol] ? _cellVal(cs[dateCol], sst) : '';
      if(dv === '') return;
      let iso = '';
      if(/^\d+(\.\d+)?$/.test(dv)){ const n = parseFloat(dv); if(n > 20000 && n < 80000) iso = _serialToISO(n); }
      else iso = _toISO(dv);
      if(!iso) return;
      lastDataRow = r.num; lastISO = iso;
      keys[_key(iso,
                doCol    && cs[doCol]    ? _cellVal(cs[doCol], sst)    : '',
                scaleCol && cs[scaleCol] ? _cellVal(cs[scaleCol], sst) : '',
                turnCol  && cs[turnCol]  ? _cellVal(cs[turnCol], sst)  : '')] = r.num;
    });

    return { sh, sXml, sst, rows, headerRow, dataStart, colOf,
             dateCol, doCol, scaleCol, turnCol, lastDataRow, lastISO, keys };
  }

  /* ═══════════ preview (không ghi gì) ═══════════ */
  async function preview(){
    const el = document.getElementById('tlxk-preview');
    const iso = (document.getElementById('tlxk-date')||{}).value || '';
    if(!el) return;
    if(!iso){ el.textContent = 'Chọn ngày để xem trước.'; return; }
    const tl = rowsForDate(iso);
    if(!state.zip){ el.innerHTML = '<b>'+tl.length+'</b> dòng TL ngày '+_isoToVN(iso)+' · chưa chọn file.'; return; }
    try{
      const s = await _scan();
      let dup = 0;
      tl.forEach(r=>{ if(s.keys[_key(iso, r.doNo, r.scaleNo, r.turn)] != null) dup++; });
      el.innerHTML = '<b>'+tl.length+'</b> dòng TL ngày '+_isoToVN(iso)
        + ' → ghi từ dòng <b>'+(s.lastDataRow+1)+'</b>'
        + (s.lastISO ? ' · dòng cuối đang là <b>'+_isoToVN(s.lastISO)+'</b>' : ' · sheet đang trống')
        + (dup ? ' · <span class="tlxk-warn">'+dup+' dòng trùng DO sẽ bị bỏ qua</span>' : '');
    }catch(e){ el.textContent = '⚠ '+e.message; }
  }

  /* ═══════════ ghi dữ liệu + Save As ═══════════ */
  async function fill(){
    if(!state.zip){ log('❌ Chưa chọn file .xlsm', 'er'); return; }
    const iso = (document.getElementById('tlxk-date')||{}).value || '';
    if(!iso){ log('❌ Chưa chọn ngày', 'er'); return; }

    clearLog();
    log('═══ FILL ' + _isoToVN(iso) + ' ═══', 'info');

    let s;
    try{ s = await _scan(); }
    catch(e){ log('❌ '+e.message, 'er'); return; }
    log('ℹ Header hàng '+s.headerRow+' · dữ liệu từ hàng '+s.dataStart
        +' · '+Object.keys(s.colOf).length+'/36 cột TL được map', 'info');

    let tl = rowsForDate(iso);
    if(!tl.length){ log('❌ Không có dòng TL nào cho ngày '+_isoToVN(iso), 'er'); return; }
    log('ℹ TL Data: '+tl.length+' dòng cho ngày '+_isoToVN(iso), 'info');

    /* ── KIỂM TRA 1: ngày liên tiếp ───────────────────────────── */
    if(s.lastISO){
      const gap = _isoDiffDays(s.lastISO, iso);
      /* gap === 0: user cập nhật nhiều lần trong cùng một ngày — chuyện bình
         thường, KHÔNG hỏi ở lớp này. Lớp 2 (trùng DO) mới là lớp quyết định. */
      if(gap === 0){
        log('ℹ Ngày '+_isoToVN(iso)+' đã có sẵn ở dòng cuối — chuyển sang đối chiếu DO.', 'info');
      } else if(gap !== 1){
        let msg;
        if(gap < 0)        msg = 'Ngày định đổ ('+_isoToVN(iso)+') NHỎ HƠN ngày ở dòng cuối ('+_isoToVN(s.lastISO)+').';
        else               msg = 'Ngày không liên tiếp: dòng cuối là '+_isoToVN(s.lastISO)
                               + ', ngày định đổ là '+_isoToVN(iso)+' — thiếu '+(gap-1)+' ngày ở giữa'
                               + ' ('+_isoToVN(_isoAddDays(s.lastISO,1))
                               + (gap > 2 ? ' … '+_isoToVN(_isoAddDays(iso,-1)) : '')+').';
        log('⚠ '+msg, 'warn');
        if(!confirm('⚠ NGÀY KHÔNG LIÊN TIẾP\n\n'+msg+'\n\nOK = vẫn ghi tiếp.\nCancel = huỷ.')){
          log('⚠ Đã huỷ.', 'warn'); return;
        }
      } else {
        log('✓ Ngày liên tiếp ('+_isoToVN(s.lastISO)+' → '+_isoToVN(iso)+')', 'ok');
      }
    } else {
      log('ℹ Sheet Detail chưa có dữ liệu — ghi từ hàng '+s.dataStart, 'info');
    }

    /* ── KIỂM TRA 2: trùng DO trong cùng ngày ─────────────────── */
    const dup = [], fresh = [];
    tl.forEach(r=>{
      if(s.keys[_key(iso, r.doNo, r.scaleNo, r.turn)] != null) dup.push(r);
      else fresh.push(r);
    });
    if(dup.length){
      const lines = dup.slice(0,25).map(r =>
        '  • DO '+(r.doNo||'—')+'  ·  '+(r.cust||'—')+'  ·  Scale '+(r.scaleNo||'—')+' / Turn '+(r.turn||'—')
        + '  → đã có ở hàng '+s.keys[_key(iso, r.doNo, r.scaleNo, r.turn)]);
      if(dup.length > 25) lines.push('  … và '+(dup.length-25)+' dòng nữa');
      log('⚠ '+dup.length+' dòng đã có sẵn trong Detail (trùng Date + DO + Scale + Turn)', 'warn');
      lines.forEach(l => log(l, 'warn'));
      if(!fresh.length){
        alert('ℹ Tất cả '+dup.length+' dòng TL của ngày '+_isoToVN(iso)
            + ' đều đã có trong sheet Detail.\n\nKhông có gì để đổ thêm.');
        log('ℹ Không có dòng mới — dừng.', 'info'); return;
      }
      if(!confirm('⚠ TRÙNG DO — '+dup.length+' dòng đã có trong sheet Detail:\n\n'
                + lines.join('\n')+'\n\n'
                + 'OK  = bỏ qua các dòng trùng, chỉ đổ '+fresh.length+' dòng mới.\n'
                + 'Cancel = huỷ, không ghi gì.')){
        log('⚠ Đã huỷ.', 'warn'); return;
      }
    }
    tl = fresh;
    log('▶ Sẽ ghi '+tl.length+' dòng'+(dup.length ? ' (bỏ qua '+dup.length+' dòng trùng)' : ''), 'ok');

    /* ── Dựng nội dung ghi ─────────────────────────────────────── */
    const startRow = s.lastDataRow + 1;
    const rowMap = {}; s.rows.forEach(r => { rowMap[r.num] = r.xml; });

    /* Mẫu style: dòng gần startRow nhất còn đủ ô (dùng cho dòng mới hoàn toàn) */
    let tplNum = null;
    for(let i=s.rows.length-1; i>=0; i--){
      if(Object.keys(_cellsOf(s.rows[i].xml)).length >= 8){ tplNum = s.rows[i].num; break; }
    }
    const tplCells = tplNum != null ? _cellsOf(rowMap[tplNum]) : {};
    const tplOpen  = tplNum != null ? _openTag(rowMap[tplNum]) : '<row>';
    const tplStyle = {}; Object.keys(tplCells).forEach(L => { tplStyle[L] = _styleOf(tplCells[L]); });

    const tgtSerial = _isoToSerial(iso);
    let rn = startRow;
    tl.forEach(r=>{
      const base  = rowMap[rn];
      const cells = base ? _cellsOf(base) : {};
      Object.keys(s.colOf).forEach(L=>{
        const sty = _styleOf(cells[L]) || tplStyle[L] || null;
        cells[L] = _cell(L, rn, sty, _valueFor(s.colOf[L], r, tgtSerial));
      });
      /* ô KHÔNG thuộc mapping mà đang chứa công thức → làm rỗng (giữ style) */
      Object.keys(cells).forEach(L=>{
        if(cells[L].indexOf('<f') < 0) return;
        const sty = _styleOf(cells[L]);
        cells[L] = '<c r="'+L+rn+'"'+(sty ? ' s="'+sty+'"' : '')+'/>';
      });
      const open = base ? _openTag(base).replace(/\/>$/,'>') : tplOpen.replace(/\br="\d+"/, 'r="'+rn+'"').replace(/\/>$/,'>');
      rowMap[rn] = open.replace(/\br="\d+"/, 'r="'+rn+'"')
                 + Object.keys(cells).sort((a,b)=>_colNum(a)-_colNum(b)).map(L=>cells[L]).join('')
                 + '</row>';
      rn++;
    });
    const endRow = rn - 1;

    /* Vùng phía dưới: dọn công thức sót (shared formula Q64:Q67) */
    let cleaned = 0;
    Object.keys(rowMap).forEach(k=>{
      const n = +k;
      if(n <= endRow) return;
      if(rowMap[k].indexOf('<f') < 0) return;
      rowMap[k] = _stripFormulas(rowMap[k]); cleaned++;
    });
    if(cleaned) log('ℹ Dọn công thức rỗng còn sót ở '+cleaned+' dòng bên dưới', 'info');

    /* ── Ráp lại sheetData ─────────────────────────────────────── */
    let sXml = s.sXml;
    const body = Object.keys(rowMap).map(Number).sort((a,b)=>a-b).map(n=>rowMap[n]).join('');
    const a = sXml.indexOf('<sheetData>');
    if(a >= 0){
      const b = sXml.indexOf('</sheetData>', a);
      sXml = sXml.slice(0, a+11) + body + sXml.slice(b);
    } else if(sXml.indexOf('<sheetData/>') >= 0){
      sXml = sXml.replace('<sheetData/>', '<sheetData>'+body+'</sheetData>');
    } else { log('❌ Không tìm thấy <sheetData>', 'er'); return; }

    /* dimension + autoFilter bám theo dòng cuối mới */
    const lastCol = _colName(Math.max.apply(null, Object.keys(s.colOf).map(_colNum)));
    sXml = sXml.replace(/<dimension ref="A1:[A-Z]+(\d+)"\/>/, (m0, n0)=>
      '<dimension ref="A1:'+lastCol+Math.max(+n0, endRow)+'"/>');
    sXml = sXml.replace(/(<autoFilter ref="A)(\d+)(:[A-Z]+)(\d+)(")/, (m0,p1,p2,p3,p4,p5)=>
      p1+p2+p3+Math.max(+p4, endRow)+p5);

    state.zip.file(s.sh.path, sXml);
    state.zip.remove('xl/calcChain.xml');   /* Excel dựng lại khi mở */
    log('✅ Đã ghi '+tl.length+' dòng vào "'+s.sh.name+'" (hàng '+startRow+'→'+endRow+')', 'ok');

    /* ── Save As (file gốc không bị đụng) ──────────────────────── */
    const isXlsm = /\.xlsm$/i.test(state.fileName);
    const mime   = isXlsm ? 'application/vnd.ms-excel.sheet.macroEnabled.12'
                          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    log('⏳ Đang tạo file…', 'info');
    const blob = await state.zip.generateAsync({ type:'blob', mimeType:mime,
                        compression:'DEFLATE', compressionOptions:{ level:6 } });
    const base = state.fileName.replace(/\.xls[mx]$/i, '').replace(/_\d{4}-\d{2}-\d{2}$/, '');
    const dl   = base + '_' + iso + (isXlsm ? '.xlsm' : '.xlsx');

    let saved = false;
    if(window.showSaveFilePicker){
      try{
        const opts = { suggestedName: dl, types:[{ description: isXlsm ? 'Excel macro workbook' : 'Excel workbook',
                       accept: isXlsm ? { 'application/vnd.ms-excel.sheet.macroEnabled.12':['.xlsm'] }
                                      : { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx'] } }] };
        if(state.fileHandle) opts.startIn = state.fileHandle;
        const h = await window.showSaveFilePicker(opts);
        const w = await h.createWritable();
        await w.write(blob); await w.close();
        log('💾 Đã lưu: '+h.name+' ('+Math.round(blob.size/1024)+' KB) — file gốc giữ nguyên', 'ok');
        saved = true;
      }catch(e){
        if(e && e.name === 'AbortError'){ log('⚠ Đã huỷ hộp thoại lưu — KHÔNG có file nào được ghi.', 'warn'); return; }
        log('⚠ Lỗi hộp thoại lưu: '+e.message+' → chuyển sang tải xuống', 'warn');
      }
    }
    if(!saved){
      const url = URL.createObjectURL(blob);
      const a2 = document.createElement('a'); a2.href = url; a2.download = dl; a2.click();
      URL.revokeObjectURL(url);
      log('💾 Đã tải xuống: '+dl+' ('+Math.round(blob.size/1024)+' KB) — file gốc giữ nguyên', 'ok');
    }
    if(typeof logAudit === 'function'){
      try{ logAudit('export:tl_phieu_xuat_kho', { date: iso, rows: tl.length, skipped: dup.length }); }catch(_){}
    }
    if(typeof toast === 'function') toast('📤 Phiếu xuất kho '+_isoToVN(iso)+' — '+tl.length+' dòng','ok');
    await preview();
  }

  /* Giá trị Excel cho một field của TL */
  function _valueFor(key, r, tgtSerial){
    if(key === 'date'){ const v = _isoToSerial(_toISO(r.date)); return v === '' ? tgtSerial : v; }
    if(key === 'giDate'){ const iso = _toISO(r.giDate); return iso ? _isoToSerial(iso) : ''; }
    if(K_TIME.has(key)) return _timeFrac(r[key]);
    if(K_PCT.has(key))  return _pctFrac(key, r);
    if(K_NUM.has(key))  return _num(r[key]);
    if(key === 'doNo'){
      const v = String(r.doNo == null ? '' : r.doNo).trim();
      if(!v) return '';
      return /^\d+$/.test(v) ? parseFloat(v) : v;
    }
    const v = r[key];
    return (v == null) ? '' : String(v);
  }
  /* Ô %C3 / %C4 / Diff% trong Detail có numFmt "0%" → phải ghi PHÂN SỐ.
     TL lưu ba trường này ở thang 0–100, nên chia 100. Thiếu thì tự tính. */
  function _pctFrac(key, r){
    const net = _num(r.lpgQty), c3 = _num(r.c3Kg), c4 = _num(r.c4Kg), fq = _num(r.fq);
    const rnd = x => Math.round(x * 1e6) / 1e6;
    if(key === 'pct'){
      if(fq > 0 && net > 0) return rnd(net / fq);
      const v = _num(r.pct); return v === '' ? '' : rnd(v / 100);
    }
    if(key === 'c3Pct'){
      const v = _num(r.c3Pct); if(v !== '') return rnd(v / 100);
      if(net > 0 && c3 !== '') return rnd(c3 / net);
      return '';
    }
    /* c4Pct */
    const v = _num(r.c4Pct); if(v !== '') return rnd(v / 100);
    if(net > 0 && c4 !== '') return rnd(c4 / net);
    const v3 = _num(r.c3Pct); if(v3 !== '') return rnd(1 - v3 / 100);
    return '';
  }

  /* ═══════════ modal ═══════════ */
  function _build(){
    if(state.built) return;
    const bg = document.createElement('div');
    bg.className = 'tl-paste-modal';
    bg.id = 'tlxkModal';
    bg.setAttribute('onclick', "if(event.target===this)TLXK.close()");
    bg.innerHTML = ''
      + '<div class="tl-paste-box" style="width:760px">'
      +   '<div class="tl-paste-hdr">'
      +     '<h3>📤 FILL PHIẾU XUẤT KHO — TL Data → sheet "Detail"</h3>'
      +     '<button class="tl-paste-x" onclick="TLXK.close()">✕</button>'
      +   '</div>'
      +   '<div class="tl-paste-body">'
      +     '<div class="tlxk-file" id="tlxk-file-box" onclick="TLXK.pickFile()" title="Chọn file PHIẾU XUẤT KHO (.xlsm)">'
      +       '<span class="tlxk-file-ic">📄</span>'
      +       '<span class="tlxk-file-nm" id="tlxk-file-name">Chọn file PHIẾU XUẤT KHO (.xlsm)…</span>'
      +     '</div>'
      +     '<div class="tlxk-row">'
      +       '<label>Ngày cần đổ</label>'
      +       '<input type="date" id="tlxk-date" onchange="TLXK.preview()">'
      +       '<button class="btn" onclick="TLXK.setToday()">Hôm nay</button>'
      +     '</div>'
      +     '<div class="tlxk-prev" id="tlxk-preview">Chọn file và ngày để xem trước.</div>'
      +     '<div class="tlxk-log" id="tlxk-log"></div>'
      +     '<div class="tlxk-hint">Ghi tiếp từ dòng cuối cùng của sheet Detail. Map cột theo tên header — '
      +       'cột nào TL Data có mà Detail không có sẽ bỏ qua. Trùng ngày thì so tiếp DO + Scale + Turn để '
      +       'không đổ lại dòng đã có. File gốc không bị sửa: kết quả lưu ra file mới.</div>'
      +   '</div>'
      +   '<div class="tl-paste-foot">'
      +     '<button class="btn" onclick="TLXK.close()">Đóng</button>'
      +     '<button class="btn btn-green" id="tlxk-btn-fill" onclick="TLXK.fill()" disabled>📤 Đổ dữ liệu &amp; lưu file</button>'
      +   '</div>'
      + '</div>';
    document.body.appendChild(bg);
    state.built = true;
  }
  function open(){
    _build();
    const d = document.getElementById('tlxk-date');
    if(d && !d.value){
      /* mặc định = ngày đang lọc ở lưới TL Data, không có thì hôm nay */
      const f = (document.getElementById('tlDateFilter')||{}).value || '';
      d.value = _toISO(f) || _todayISO();
    }
    _updateUI();
    document.getElementById('tlxkModal').classList.add('on');
    preview();
  }
  function close(){ const m = document.getElementById('tlxkModal'); if(m) m.classList.remove('on'); }
  function setToday(){ const d = document.getElementById('tlxk-date'); if(d){ d.value = _todayISO(); preview(); } }

  return { open, close, pickFile, preview, fill, setToday, rowsForDate, log, clearLog };
})();

/* Shim cho nút trên thanh công cụ TL Data */
function tlFillXuatKho(){ TLXK.open(); }
