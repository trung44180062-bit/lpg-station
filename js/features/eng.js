/* ============================================================
 * ENG  —  eng.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 21652–22524   (~873 dòng)
 * Global xuất ra : window.ENG
 * Phase tách     : P5B
 * Phụ thuộc      : sync, scale
 * Khởi tạo (boot): ENG.init() trong boot
 * ------------------------------------------------------------
 * MÔ TẢ: Trang Engineer (page-engineer).
 *
 * API công khai (điền/đối chiếu khi tách):
 *   ENG.init(), ENG.render()
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module ENG từ dòng 21652 đến 22524.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.ENG).
 *   3) node --check eng.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P5B]: dán thân module ENG (V4-54 dòng 21652–22524) vào đây. */

/* ===== BÓC TỪ V4-54 dòng 21652–22524 ===== */
const ENG = (function(){
  'use strict';
  const CACHE_KEY = 'lpg_v4_eng_tkmix_v2';   // v2 schema: rid-keyed
  const FB_PATH   = 'eng_tkmix';

  /* ROW_W — row width. v4.55: extended 34 → 44 for COQ data:
     [34] COQ No  [35] Sampling Time  [36] Analysis Date  [37] C3H6 %vol
     [38] Vapor Pressure kPa  [39] Total Sulfur mg/kg  [40] Free Water
     [41] Cu Corrosion  [42] Residue  [43] Molecular Weight.
     v4.55.1: +9 → 53: [44] Pro/Bu %Vol  [45] Pro/Bu %Wt  [46] t-2-Butene
     [47] 1-Butene  [48] i-Butene  [49] neo-Pentane  [50] i-Pentane
     [51] n-Pentane  [52] n-Hexane.
     v4.68: +3 → 56 cho Stock Transfer (đồng bộ chuyển kho WMS):
       [53] ST flag ('1' = đã chuyển kho trên WMS, '' = chưa)
       [54] ST timestamp (ms)  [55] ST user (email/uid rút gọn).
     Ý nghĩa nghiệp vụ: lot ĐÃ tick = SAP/WMS đã ghi nhận bút toán chuyển
     kho 1100→2100/2101 nên đã nằm trong End Stock của SAP. Lot CHƯA tick =
     đã pha trộn thực tế nhưng hệ thống chưa chuyển kho → ALLOC phải cộng
     thêm vào bồn (và trừ khỏi hầm 1100) khi dự báo tồn.
     Old shorter rows load fine (missing cells default ''). */
  const ROW_W = 56;
  const C_ST = 53, C_ST_TS = 54, C_ST_BY = 55;

  /* ROWS — display-ordered array of 34-col row arrays. Each row also
     carries a non-enumerable `_rid` (base36 random) used as Firebase key.
     RID_MAP[rid] points at the SAME row object, so all reads share state.
     Mutating a row in place keeps both views in sync. */
  let ROWS = [];
  let RID_MAP = Object.create(null);
  let _lotSortAsc = false;
  let _fbRef = null;
  let _suppressEcho = 0;            // counter of in-flight self-writes
  let _migrationDone = false;

  /* v4.62 — LAZY LOAD: on boot only the INIT_LOTS most-recently-written
     rows are fetched (orderByChild('_ts').limitToLast). The 📥 Load All
     button (or ENG.loadAll(cb) from other modules, e.g. ODOR) fetches the
     whole node once and switches the listeners to the full ref.
     NOTE: firebase.rules.json needs  "eng_tkmix": { ".indexOn": ["_ts"] }
     so the limit query is served server-side (bandwidth saving). */
  const INIT_LOTS = 10;
  let _allLoaded = false;
  let _query = null;                // live limitToLast window (partial mode)

  /* ---------- base36 random rid (collision-safe across offline devices) ---------- */
  function _genRid(){
    /* 6 chars random + 4 chars time-tail → ~10 chars, very low collision risk */
    return Math.random().toString(36).slice(2, 8) +
           Date.now().toString(36).slice(-4);
  }

  /* ---------- localStorage cache ---------- */
  function _loadCache(){
    try{
      const raw = localStorage.getItem(CACHE_KEY);
      if(!raw) return;
      const obj = JSON.parse(raw);
      if(!obj || !obj.rows || typeof obj.rows !== 'object') return;
      ROWS = []; RID_MAP = Object.create(null);
      for(const rid in obj.rows){
        const cells = obj.rows[rid];
        if(!Array.isArray(cells)) continue;
        _setRowLocal(rid, cells, /*silent*/ true);
      }
    }catch(_){ ROWS = []; RID_MAP = Object.create(null); }
  }
  function _saveCache(){
    try{
      const dump = { schema:2, rows:{} };
      ROWS.forEach(r => { if(r._rid) dump.rows[r._rid] = r.slice(0, ROW_W); });
      localStorage.setItem(CACHE_KEY, JSON.stringify(dump));
    }catch(_){}
  }

  /* ---------- internal row map maintenance ----------
     _setRowLocal mutates an existing row in place (preserving identity) or
     pushes a new row. Returns the row object. */
  function _setRowLocal(rid, cells, silent){
    let row = RID_MAP[rid];
    if(row){
      for(let i = 0; i < ROW_W; i++) row[i] = (cells[i] != null ? cells[i] : '');
    } else {
      row = new Array(ROW_W);
      for(let i = 0; i < ROW_W; i++) row[i] = (cells[i] != null ? cells[i] : '');
      Object.defineProperty(row, '_rid', { value: rid, writable: true, enumerable: false, configurable: true });
      RID_MAP[rid] = row;
      ROWS.push(row);
    }
    if(!row._rid) row._rid = rid;
    return row;
  }
  function _removeRowLocal(rid){
    if(!RID_MAP[rid]) return false;
    delete RID_MAP[rid];
    const i = ROWS.findIndex(r => r._rid === rid);
    if(i >= 0) ROWS.splice(i, 1);
    return true;
  }

  /* ---------- Firebase wiring — incremental child writes only ---------- */
  /* v4.77 — cb(ok, err) tuỳ chọn: caller cần BIẾT ghi Firebase có thành công
     hay không (vd. MIXNOTIFY chỉ được xoá thông báo sau khi cờ ST đã lên FB).
     Trước đây lỗi ghi chỉ console.warn → mất dữ liệu âm thầm. */
  function _pushRowFb(rid, cells, cb){
    if(!_fbRef){ if(typeof cb==='function') cb(false, 'no-firebase-ref'); return; }
    _suppressEcho++;
    _fbRef.child(rid).set({ cells: cells.slice(0, ROW_W), _ts: Date.now() })
      .then(()=>{ if(typeof cb==='function') cb(true, null); })
      .catch(e => {
        console.warn('[ENG] fb push row', e);
        if(typeof cb==='function') cb(false, e);
      })
      .finally(()=> setTimeout(()=>{ _suppressEcho = Math.max(0, _suppressEcho - 1); }, 400));
  }
  function _deleteRowFb(rid){
    if(!_fbRef) return;
    _suppressEcho++;
    _fbRef.child(rid).set(null)
      .catch(e => console.warn('[ENG] fb del row', e))
      .finally(()=> setTimeout(()=>{ _suppressEcho = Math.max(0, _suppressEcho - 1); }, 400));
  }
  function _bulkUpdateFb(updates){
    /* updates: { rid: cells[] | null } — batched multi-path .update() */
    if(!_fbRef || !updates) return;
    const payload = {};
    let count = 0;
    for(const rid in updates){
      const v = updates[rid];
      payload[rid] = v ? { cells: v.slice(0, ROW_W), _ts: Date.now() } : null;
      count++;
    }
    if(!count) return;
    _suppressEcho++;
    _fbRef.update(payload)
      .catch(e => console.warn('[ENG] fb bulk update', e))
      .finally(()=> setTimeout(()=>{ _suppressEcho = Math.max(0, _suppressEcho - 1); }, 600));
  }

  /* ---------- formatting helpers ---------- */
  function _esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function _fmtDate(v){
    const s = String(v||'').trim();
    if(!s) return '';
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(m) return m[3]+'/'+m[2]+'/'+m[1].slice(2);
    m = s.match(/^(\d{1,2})[\/\-](\w+)[\/\-](\d{2,4})$/);
    if(m){
      const yr = m[3].length===4 ? m[3].slice(2) : m[3];
      return String(m[1]).padStart(2,'0')+'/'+String(m[2]).padStart(2,'0')+'/'+yr;
    }
    return s;
  }
  function _fmtNum(v, d){
    const n = parseFloat(String(v||'').replace(/,/g,''));
    if(isNaN(n)) return String(v||'');
    return n.toLocaleString('en-US', {minimumFractionDigits: d||0, maximumFractionDigits: d||4});
  }
  function _fmtPct(v){
    const n = parseFloat(String(v||'').replace(/,/g,''));
    if(isNaN(n)) return String(v||'');
    return ((Math.abs(n) > 1) ? n : (n*100)).toFixed(2) + '%';
  }
  function _fmtTime(v){
    const s = String(v||'').trim();
    if(!s) return '';
    const m = s.match(/(\d{1,2}):(\d{2})/);
    return m ? String(m[1]).padStart(2,'0')+':'+m[2] : s;
  }

  /* ---------- lot number parsing (newest-first sort) ---------- */
  function _lotKey(lotStr){
    const s = String(lotStr||'').trim();
    const m = s.match(/(?:LPG-)?(\d{4})-?(\d+)/i);
    if(m) return parseInt(m[1])*1e6 + parseInt(m[2]);
    const n = parseInt(s);
    return isNaN(n) ? 0 : n;
  }

  /* ---------- date → 'YYYY-MM' (tolerant: 2026-05-20 · 20-05-26 · 07-Feb-26) ---------- */
  const _MO_ABBR = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  function _ymOf(dateStr){
    const s = String(dateStr||'').trim();
    if(!s) return null;
    let m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);          // yyyy-mm-dd
    if(m && +m[2] >= 1 && +m[2] <= 12) return m[1]+'-'+String(+m[2]).padStart(2,'0');
    m = s.match(/^(\d{1,2})[\/\-]([A-Za-z]{3,})[\/\-](\d{2,4})$/);      // dd-Mon-yy
    if(m){ const mo = _MO_ABBR[m[2].slice(0,3).toLowerCase()];
      if(mo){ let y = +m[3]; if(y < 100) y += 2000; return y+'-'+String(mo).padStart(2,'0'); } }
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);           // dd-mm-yy
    if(m && +m[2] >= 1 && +m[2] <= 12){ let y = +m[3]; if(y < 100) y += 2000;
      return y+'-'+String(+m[2]).padStart(2,'0'); }
    return null;
  }
  function _ymLabelEng(ym){ const p = ym.split('-'); return p[1]+'/'+p[0]; }

  /* ---------- main render ---------- */
  function render(){
    const tbody  = document.getElementById('engTbody');
    const overlay= document.getElementById('engPasteOverlay');
    const tbl    = document.getElementById('engTbl');
    const stats  = document.getElementById('engStats');
    const badge  = document.getElementById('engBadgeTkmix');
    if(badge) badge.textContent = ROWS.length + (_allLoaded ? '' : '+');
    _updateLoadAllBtn();
    if(!tbody) return;

    if(!ROWS.length){
      if(overlay) overlay.style.display = '';
      if(tbl) tbl.style.display = 'none';
      if(stats) stats.innerHTML = '';
      return;
    }
    if(overlay) overlay.style.display = 'none';
    if(tbl) tbl.style.display = '';

    /* filters */
    const monthSel = document.getElementById('engSrchMonth');
    _refreshMonthOptions(monthSel);
    const qLot  = (document.getElementById('engSrchLot')?.value || '').toLowerCase().trim();
    const qTank = (document.getElementById('engSrchTank')?.value || '').trim();
    const qDate = (document.getElementById('engSrchDate')?.value || '').trim();
    const qMonth = (monthSel?.value || '').trim();

    /* sort copy of ROWS by lot (newest first by default) */
    const sorted = ROWS.slice().sort((a,b)=>{
      const ka = _lotKey(a[1]), kb = _lotKey(b[1]);
      return _lotSortAsc ? (ka - kb) : (kb - ka);
    });
    const filtered = sorted.filter(r=>{
      if(qLot  && !String(r[1]||'').toLowerCase().includes(qLot)) return false;
      if(qTank && !String(r[2]||'').toUpperCase().includes(qTank)) return false;
      if(qDate && !String(r[3]||'').includes(qDate)) return false;
      if(qMonth && _ymOf(r[3]) !== qMonth) return false;
      return true;
    });

    /* update sort indicator */
    const sortHdr = document.getElementById('engThLotSort');
    if(sortHdr) sortHdr.textContent = 'Lot ' + (_lotSortAsc ? '▲' : '▼');

    /* render rows */
    tbody.innerHTML = filtered.map((r, idx)=>{
      const c = []; for(let i=0;i<ROW_W;i++) c.push(r[i]||'');
      const tk = String(c[2]).toUpperCase();
      const tkCls = tk.includes('3501') ? 'td-tk-3501' : (tk.includes('3502') ? 'td-tk-3502' : '');
      const ql = String(c[27]).trim().toLowerCase();
      const qualCls = ql==='pass' ? 'td-qual-pass' : (ql==='fail' ? 'td-qual-fail' : (ql==='pending' ? 'td-qual-pending' : ''));
      const isPending = ql==='pending';
      const draftBadge = isPending ? '<span class="eng-draft-badge">Draft</span>' : '';
      const st = _fmtTime(c[4]);
      const fi = _fmtTime(c[5]);
      const overnight = (st && fi && fi < st);
      const realIdx = ROWS.indexOf(r);
      return '<tr class="'+(isPending?'row-pending':'')+'" onclick="ENG.editRow('+realIdx+',event)">' +
        '<td class="td-del" onclick="event.stopPropagation();ENG.deleteRow('+realIdx+')" title="Delete">✕</td>' +
        '<td class="td-c" style="color:var(--ink-3)">'+(idx+1)+'</td>' +
        '<td class="td-c" style="font-weight:700">'+_esc(c[1])+'</td>' +
        '<td class="td-c '+tkCls+'">'+_esc(c[2])+'</td>' +
        '<td>'+_fmtDate(c[3])+'</td>' +
        '<td>'+st+'</td>' +
        '<td style="'+(overnight?'color:#7b2d8e;font-weight:600':'')+'" title="'+(overnight?'Ends next day':'')+'">'+fi+(overnight?' +1':'')+'</td>' +
        '<td class="td-r">'+_fmtNum(c[10],3)+'</td>' +
        '<td class="td-r td-c3">'+_fmtPct(c[11])+'</td>' +
        '<td class="td-r td-c4">'+_fmtPct(c[12])+'</td>' +
        '<td class="td-r td-fill-c3">'+_fmtNum(c[13],3)+'</td>' +
        '<td class="td-r td-fill-c4">'+_fmtNum(c[14],3)+'</td>' +
        '<td class="td-r td-fill-lpg">'+_fmtNum(c[15],3)+'</td>' +
        '<td class="td-c td-st" onclick="event.stopPropagation();ENG.toggleST('+realIdx+')" title="'+
            (String(c[C_ST])==='1'
               ? 'Đã stock transfer trên WMS'+(c[C_ST_TS]?' · '+_stWhen(c[C_ST_TS]):'')+(c[C_ST_BY]?' · '+_esc(c[C_ST_BY]):'')
               : 'CHƯA chuyển kho — lot này đang được ALLOC cộng thêm vào bồn')+'">' +
          (String(c[C_ST])==='1'
             ? '<span class="eng-st eng-st-on">✔</span>'
             : '<span class="eng-st eng-st-off">○</span>') + '</td>' +
        '<td class="td-r">'+_fmtNum(c[6],3)+'</td>' +
        '<td class="td-r" style="font-weight:700;color:var(--green)">'+_fmtNum(c[7],2)+'</td>' +
        '<td class="td-r td-c3" style="font-weight:600">'+_fmtPct(c[8])+'</td>' +
        '<td class="td-r td-c4" style="font-weight:600">'+_fmtPct(c[9])+'</td>' +
        '<td class="td-r">'+_fmtNum(c[17],4)+'</td>' +
        '<td class="td-r">'+_fmtNum(c[18],4)+'</td>' +
        '<td class="td-r">'+_fmtNum(c[19],4)+'</td>' +
        '<td class="td-r">'+_fmtNum(c[20],4)+'</td>' +
        '<td class="td-r">'+_fmtNum(c[22],4)+'</td>' +
        '<td class="td-r">'+_fmtNum(c[23],4)+'</td>' +
        '<td class="td-r">'+_fmtNum(c[31],1)+'</td>' +
        '<td class="td-r">'+_fmtNum(c[32],2)+'</td>' +
        '<td class="td-r td-density">'+_fmtNum(c[33],3)+'</td>' +
        '<td class="td-r">'+_fmtNum(c[26],2)+'</td>' +
        '<td class="td-c '+qualCls+'">'+_esc(c[27])+draftBadge+'</td>' +
        '<td>'+_esc(c[28])+'</td>' +
        '<td class="td-r td-target">'+(c[29]?_fmtPct(c[29]):'')+'</td>' +
        '<td class="td-r td-target">'+(c[30]?_fmtNum(c[30],0):'')+'</td>' +
        '<td class="td-c td-coq">'+_esc(c[34])+'</td>' +
        '<td class="td-r td-coq">'+(c[37]!==''?_fmtNum(c[37],4):'')+'</td>' +
        '<td class="td-r td-coq">'+(c[38]!==''?_fmtNum(c[38],0):'')+'</td>' +
        '<td class="td-r td-coq">'+(c[39]!==''?_fmtNum(c[39],2):'')+'</td>' +
        '<td class="td-c td-coq">'+_esc(c[40])+'</td>' +
        '<td class="td-c td-coq">'+_esc(c[41])+'</td>' +
        '<td class="td-c td-coq">'+_esc(c[42])+'</td>' +
        '<td class="td-r td-coq">'+(c[43]!==''?_fmtNum(c[43],2):'')+'</td>' +
        '<td class="td-c td-coq" style="white-space:nowrap">'+_esc(c[44])+'</td>' +
        '<td class="td-c td-coq" style="white-space:nowrap">'+_esc(c[45])+'</td>' +
        '<td class="td-r td-coq">'+(c[46]!==''?_fmtNum(c[46],4):'')+'</td>' +
        '<td class="td-r td-coq">'+(c[47]!==''?_fmtNum(c[47],4):'')+'</td>' +
        '<td class="td-r td-coq">'+(c[48]!==''?_fmtNum(c[48],4):'')+'</td>' +
        '<td class="td-r td-coq">'+(c[49]!==''?_fmtNum(c[49],4):'')+'</td>' +
        '<td class="td-r td-coq">'+(c[50]!==''?_fmtNum(c[50],4):'')+'</td>' +
        '<td class="td-r td-coq">'+(c[51]!==''?_fmtNum(c[51],4):'')+'</td>' +
        '<td class="td-r td-coq">'+(c[52]!==''?_fmtNum(c[52],4):'')+'</td>' +
        '</tr>';
    }).join('');

    /* v4.76 — TOTALS: cộng dồn trên đúng tập ĐANG hiển thị (sau filter). */
    const T = _sumRows(filtered);
    const tf = document.getElementById('engTfoot');
    if(tf){
      tf.innerHTML =
        '<tr class="eng-tfoot-row">' +
          '<td colspan="10" class="td-tot-lbl">Σ TỔNG — '+filtered.length+' lot'+
            (filtered.length !== ROWS.length ? ' (đang lọc / '+ROWS.length+')' : '')+'</td>' +
          '<td class="td-r td-fill-c3">'+_fmtNum(T.fc3,3)+'</td>' +
          '<td class="td-r td-fill-c4">'+_fmtNum(T.fc4,3)+'</td>' +
          '<td class="td-r td-fill-lpg">'+_fmtNum(T.flpg,3)+'</td>' +
          '<td class="td-c" style="font-size:9px;color:var(--green)">'+T.stOn+'/'+filtered.length+'</td>' +
          '<td class="td-r">'+_fmtNum(T.vol,3)+'</td>' +
          '<td class="td-r" style="color:var(--green)">'+_fmtNum(T.qty,2)+'</td>' +
          '<td colspan="11"></td>' +
          '<td class="td-r" style="color:#7b2d8e">'+_fmtNum(T.odo,2)+'</td>' +
          '<td colspan="21"></td>' +
        '</tr>';
    }

    if(stats){
      let html = '<b>'+filtered.length+'</b> / '+ROWS.length+' rows';
      html += ' <span class="eng-tot-chip" title="Tổng cộng trên tập đang hiển thị">'
        + 'ΣC3 <b>'+_fmtNum(T.fc3,3)+'</b> · ΣC4 <b>'+_fmtNum(T.fc4,3)+'</b> · ΣLPG <b>'+_fmtNum(T.flpg,3)+'</b> MT'
        + ' · ΣQty <b>'+_fmtNum(T.qty,2)+'</b> T · ΣOdo <b>'+_fmtNum(T.odo,2)+'</b> kg</span>';
      if(qMonth){
        const s = _monthSummary(qMonth);
        html += ' <span style="color:var(--blue,#2f80ed);font-weight:600">· Tháng '+_ymLabelEng(qMonth)+': '
          + '<b>'+s.lots+'</b> lượt mix · Filled LPG <b>'+_fmtNum(s.lpg,3)+'</b> MT · Odorant <b>'
          + _fmtNum(s.odo,2)+'</b> kg</span>';
      }
      html += (_allLoaded ? '' :
           ' <span style="color:var(--orange);font-weight:600">· '+INIT_LOTS+' lot mới nhất — bấm 📥 Load All để tải toàn bộ</span>');
      stats.innerHTML = html;
    }
  }

  /* v4.63 — populate month dropdown from ROWS (giữ nguyên lựa chọn hiện tại) */
  function _refreshMonthOptions(sel){
    if(!sel) return;
    const months = Array.from(new Set(ROWS.map(r=>_ymOf(r[3])).filter(Boolean))).sort().reverse();
    const cur = sel.value;
    const sig = months.join('|');
    if(sel.dataset.sig === sig) return;      // không đổi → khỏi dựng lại
    sel.dataset.sig = sig;
    sel.innerHTML = ['<option value="">All months</option>']
      .concat(months.map(m=>'<option value="'+m+'">'+_ymLabelEng(m)+'</option>')).join('');
    if(months.indexOf(cur) >= 0) sel.value = cur;
  }

  /* v4.63 — tổng hợp tháng: số lượt mix · Σ Filled LPG (MT) · Σ Odorant (kg) */
  function _monthSummary(ym){
    let lots = 0, lpg = 0, odo = 0;
    ROWS.forEach(r=>{
      if(_ymOf(r[3]) !== ym) return;
      lots++;
      const q = parseFloat(String(r[15]||'').replace(/,/g,'')); if(!isNaN(q)) lpg += q;
      const o = parseFloat(String(r[26]||'').replace(/,/g,'')); if(!isNaN(o)) odo += o;
    });
    return { lots, lpg, odo };
  }

  /* v4.76 — cộng dồn 1 tập row bất kỳ.
     Filled C3 [13] · Filled C4 [14] · Filled LPG [15] · Final Vol m³ [6]
     · Qty ton [7] · Odorant kg [26] · số lot đã Stock Transfer.
     Ô rỗng / không parse được → bỏ qua (không tính là 0 sai lệch). */
  function _num(v){
    const n = parseFloat(String(v == null ? '' : v).replace(/,/g,'').trim());
    return isNaN(n) ? null : n;
  }
  function _sumRows(list){
    const T = { fc3:0, fc4:0, flpg:0, vol:0, qty:0, odo:0, stOn:0, n:0 };
    (list||[]).forEach(r=>{
      T.n++;
      const a = _num(r[13]); if(a !== null) T.fc3  += a;
      const b = _num(r[14]); if(b !== null) T.fc4  += b;
      const c = _num(r[15]); if(c !== null) T.flpg += c;
      const d = _num(r[6]);  if(d !== null) T.vol  += d;
      const e = _num(r[7]);  if(e !== null) T.qty  += e;
      const f = _num(r[26]); if(f !== null) T.odo  += f;
      if(String(r[C_ST]||'') === '1') T.stOn++;
    });
    return T;
  }

  /* v4.62 — Load-All button state */
  function _updateLoadAllBtn(){
    const b = document.getElementById('engLoadAllBtn');
    if(!b) return;
    if(_allLoaded){
      b.textContent = '✓ All '+ROWS.length;
      b.disabled = true;
      b.style.opacity = '.55';
      b.style.cursor = 'default';
    } else {
      b.textContent = '📥 Load All';
      b.disabled = false;
      b.style.opacity = '';
      b.style.cursor = '';
    }
  }

  /* ---------- paste modal ---------- */
  function openPaste(){
    const ta = document.getElementById('engPasteArea');
    if(ta) ta.value = '';
    document.getElementById('engPasteModal').classList.add('on');
    setTimeout(()=>{ ta && ta.focus(); }, 100);
  }
  function closePaste(){
    document.getElementById('engPasteModal').classList.remove('on');
  }
  function doPaste(){
    const ta = document.getElementById('engPasteArea');
    if(!ta){ closePaste(); return; }
    pasteText(ta.value || '');
    closePaste();
  }
  /* Header → internal 34-col index. The legacy plant software exports columns
     in a DIFFERENT order than V4's internal layout (it groups Init/Filled
     before Vol/Qty and omits the reserved slots), so a positional copy scrambles
     every column from index 6 onward. When a header row is present we place each
     source column by NAME, so legacy-format, V4-export and V406-format pastes all
     import correctly. With no header we fall back to positional (V4 order). */
  const _PASTE_COL_INDEX = {
    'no':0,'lot':1,'tank':2,'date':3,'start':4,'finish':5,
    'vol(m³)':6,'vol':6,'qty(ton)':7,'qty':7,'%c3':8,'%c4':9,
    'initvol':10,'i.%c3':11,'i.%c4':12,
    'filledc3':13,'filledc4':14,'filledlpg':15,
    'c2h6':17,'c3h8':18,'i-c4':19,'n-c4':20,'c5+':22,'olefin':23,
    'odorant':26,'quality':27,'remark':28,
    't.c3%':29,'targetc3%':29,'t.vol':30,'targetvol':30,
    'temp':31,'pres':32,'pressure':32,'density':33,
    'coqno':34,'samptime':35,'samplingtime':35,'analysisdate':36,
    'c3h6':37,'propylene':37,'vp':38,'vaporpressure':38,
    'sulfur':39,'totalsulfur':39,'freewater':40,'cucorr':41,'coppercorrosion':41,
    'residue':42,'mw':43,'molecularweight':43,
    'probu%vol':44,'probu%wt':45,'t2butene':46,'1butene':47,'ibutene':48,
    'neopentane':49,'ipentane':50,'npentane':51,'nhexane':52
  };
  function _pasteNorm(s){ return String(s==null?'':s).toLowerCase().replace(/\s+/g,''); }
  function _pasteIsHeader(cols){
    const c0 = _pasteNorm(cols[0]);
    return c0 === 'no' || (c0 === '' && _pasteNorm(cols[3]) === 'date');
  }

  function pasteText(text){
    const lines = text.split('\n').map(l=>l.trim()).filter(Boolean);
    const newRows = [];
    let headerMap = null;   // source col j -> internal index (-1 = drop)
    lines.forEach(ln=>{
      const cols = ln.split('\t');
      if(cols.length < 5) return;
      if(_pasteIsHeader(cols)){
        headerMap = cols.map(h=>{
          const k = _pasteNorm(h);
          return Object.prototype.hasOwnProperty.call(_PASTE_COL_INDEX, k) ? _PASTE_COL_INDEX[k] : -1;
        });
        return;
      }
      if(headerMap){
        const cells = new Array(ROW_W).fill('');
        for(let j = 0; j < cols.length && j < headerMap.length; j++){
          const idx = headerMap[j];
          if(idx >= 0) cells[idx] = cols[j];
        }
        newRows.push(cells);
      } else {
        newRows.push(cols.slice(0, 29));
      }
    });
    if(!newRows.length){ toast('⚠ Could not parse data','er'); return; }

    /* merge by Lot|Tank — preserves rid on update so FB child is patched, not duplicated */
    const lotTankToRid = {};
    ROWS.forEach(r=>{
      const k = String(r[1]||'').trim() + '|' + String(r[2]||'').trim();
      if(k !== '|' && r._rid) lotTankToRid[k] = r._rid;
    });
    let upd = 0, add = 0;
    const fbUpdates = {};
    newRows.forEach(raw=>{
      const cells = raw.slice();
      while(cells.length < ROW_W) cells.push('');
      const k = String(cells[1]||'').trim() + '|' + String(cells[2]||'').trim();
      let rid;
      if(k !== '|' && lotTankToRid[k]){
        rid = lotTankToRid[k]; upd++;
      } else {
        rid = _genRid();
        if(k !== '|') lotTankToRid[k] = rid;
        add++;
      }
      /* v4.68 — paste không mang cột ST, nên giữ lại cờ cũ của row bị ghi đè */
      const prev = RID_MAP[rid];
      if(prev && (raw.length <= C_ST || raw[C_ST] === undefined)){
        cells[C_ST]    = prev[C_ST]    || '';
        cells[C_ST_TS] = prev[C_ST_TS] || '';
        cells[C_ST_BY] = prev[C_ST_BY] || '';
      }
      _setRowLocal(rid, cells);
      fbUpdates[rid] = cells.slice(0, ROW_W);
    });
    _saveCache();

    if(!confirm('Push '+ (upd+add) +' paste rows ('+upd+' updated, '+add+' new) to Firebase Tank Log?\n\nSpark account — each row is a single child write.')){
      toast('Paste kept in RAM only (Firebase not updated)','warn');
      render();
      return;
    }
    _bulkUpdateFb(fbUpdates);

    const parts = [];
    if(upd) parts.push(upd+' updated');
    if(add) parts.push(add+' new');
    toast('✅ Tank Mix Info: '+parts.join(' · ')+' (total: '+ROWS.length+')', 'ok');
    render();
  }

  /* v4.33.1 — Tank Log "Delete All" replaced by RANGE-DATE delete (BULKOPS).
     Old clearAll wiped the whole 'eng_tkmix' node (_fbRef.set(null)); the new
     path does PER-RID child deletes in ONE _fbRef.update(map) — delta-only,
     CSV backup downloaded first, rows with no parseable date never deleted. */
  function rangeDelete(){
    if(!_allLoaded){ toast('⚠ Đang ở chế độ 10 lot mới nhất — bấm 📥 Load All trước khi Range delete','warn'); return; }
    if(!ROWS.length){ toast('Tank Log is already empty',''); return; }
    BULKOPS.openRangeDelete({
      title:'DELETE DATA — Tank Log',
      fileBase:'tank_log',
      getRows: ()=> ROWS.slice(),
      getRid:  r=> r._rid,
      getDate: r=> (typeof window.parseDate==='function' ? window.parseDate(r[3]) : null),
      columns: ['No','Lot','Tank','Date','Start','Finish','Vol(m³)','Qty(ton)','%C3','%C4',
        'InitVol','I.%C3','I.%C4','FilledC3','FilledC4','FilledLPG','CH4','C2H6','C3H8','i-C4','n-C4','1.3-BD',
        'C5+','Olefin','(24)','(25)','Odorant','Quality','Remark','TargetC3%','TargetVol','Temp','Pres','Density',
        'COQNo','SampTime','AnalysisDate','C3H6','VP','Sulfur','FreeWater','CuCorr','Residue','MW',
        'ProBu%Vol','ProBu%Wt','t2Butene','1Butene','iButene','neoPentane','iPentane','nPentane','nHexane']
        .map((t,i)=>({title:t, get:r=> r[i]==null?'':r[i]})),
      deleteRids: (rids)=>{
        const map = {};
        rids.forEach(rid=>{ _removeRowLocal(rid); map[rid] = null; });
        _saveCache();
        if(_fbRef){
          _suppressEcho++;
          _fbRef.update(map)
            .catch(e=>console.warn('[ENG] range-del', e))
            .finally(()=> setTimeout(()=>{ _suppressEcho = Math.max(0, _suppressEcho-1); }, 400));
        }
        try{ logAudit('eng:tank_log:range_delete','_bulk_','_rangeDelete', rids.length+' rows','','delete'); }catch(_){}
        render();
      }
    });
  }

  function deleteRow(idx){
    if(idx < 0 || idx >= ROWS.length) return;
    const r = ROWS[idx];
    if(!confirm('Delete this row?\n\nLot: '+(r[1]||'—')+'  ·  Tank: '+(r[2]||'—')+'\n\nThis writes one child deletion to Firebase.')) return;
    const rid = r._rid;
    _removeRowLocal(rid);
    _saveCache();
    if(rid) _deleteRowFb(rid);
    toast('Row deleted','ok');
    render();
  }

  /* ---------- public write API used by MC (Mix Calculator) ---------- */
  /* upsertRow(cells, opts?) — push a 34-cell row to RAM + Firebase.
     If opts.rid is supplied, that rid is reused (update path). Otherwise:
       - if a row in ROWS matches by Lot|Tank, its rid is reused
       - otherwise a fresh base36 rid is generated
     Returns the rid used. Performs ONE child write to Firebase.    */
  function upsertRow(cells, opts){
    if(!Array.isArray(cells)){
      console.warn('[ENG] upsertRow: cells must be an array', cells);
      return null;
    }
    const safe = cells.slice(0, ROW_W);
    while(safe.length < ROW_W) safe.push('');
    let rid = opts && opts.rid;
    if(!rid){
      /* try to match by Lot|Tank — preserves rid for updates */
      const k = String(safe[1]||'').trim() + '|' + String(safe[2]||'').trim();
      if(k !== '|'){
        for(const r of ROWS){
          const kk = String(r[1]||'').trim() + '|' + String(r[2]||'').trim();
          if(kk === k){ rid = r._rid; break; }
        }
      }
    }
    if(!rid) rid = _genRid();
    /* v4.68 — GIỮ cờ Stock Transfer khi caller không gửi kèm.
       MC (Mix Calc) và paste dựng mảng 53 ô theo schema cũ; nếu không chặn thì
       mỗi lần SAVE lại lot sẽ xoá mất cờ ST đã tick, khiến ALLOC cộng trùng. */
    if(cells.length <= C_ST || cells[C_ST] === undefined){
      const prev = RID_MAP[rid];
      if(prev){ safe[C_ST] = prev[C_ST]||''; safe[C_ST_TS] = prev[C_ST_TS]||''; safe[C_ST_BY] = prev[C_ST_BY]||''; }
    }
    _setRowLocal(rid, safe);
    _saveCache();
    _pushRowFb(rid, safe);
    render();
    return rid;
  }

  /* findRowByLotTank(lot, tank) — RAM-only lookup. lot can be "173" or
     "LPG-2026-173"; tank can be "TK-3501" or "3501". Returns the row
     array (with _rid) or null. */
  /* ---------- v4.68 · STOCK TRANSFER flag (cột 53/54/55) ----------
     Nguồn sự thật của ALLOC: lot CHƯA tick = chưa chuyển kho trên WMS →
     tồn SAP của bồn chưa có phần này. Tick tay ở Tank Log, hoặc tự động
     khi nhân viên cân ấn ✅ Confirm ở Mix Notify (MIXNOTIFY.confirm). */
  function _stWhen(ts){
    const n = parseInt(ts); if(!n || isNaN(n)) return '';
    const d = new Date(n), p = v=>String(v).padStart(2,'0');
    return p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+String(d.getFullYear()).slice(-2)+' '+p(d.getHours())+':'+p(d.getMinutes());
  }
  function _stWho(){
    try{
      const u = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) ? CURRENT_USER : null;
      const s = u ? (u.name || u.email || u.uid || '') : '';
      return String(s).split('@')[0].slice(0, 24);
    }catch(_){ return ''; }
  }
  /* Ghi cờ ST lên 1 row (đã có sẵn object row). Trả về true nếu có thay đổi. */
  function _applyST(row, on, who, cb){
    if(!row){ if(typeof cb==='function') cb(false,'no-row'); return false; }
    const want = on ? '1' : '';
    if(String(row[C_ST]||'') === want){       // đã đúng trạng thái → coi như thành công
      if(typeof cb==='function') cb(true, 'already');
      return false;
    }
    row[C_ST]    = want;
    row[C_ST_TS] = on ? String(Date.now()) : '';
    row[C_ST_BY] = on ? String(who != null ? who : _stWho()) : '';
    _pushRowFb(row._rid, row, cb);
    _saveCache();
    return true;
  }
  /* Tick/bỏ tick thủ công từ bảng Tank Log */
  function toggleST(idx){
    const row = ROWS[idx]; if(!row) return;
    if(typeof canWrite === 'function' && !canWrite('eng_tkmix')){
      if(typeof toast==='function') toast('Không có quyền sửa Tank Log','er'); return;
    }
    const on = String(row[C_ST]||'') !== '1';
    _applyST(row, on);
    render();
    try{ if(window.ALLOC && ALLOC.refresh) ALLOC.refresh(); }catch(_){}
    if(typeof toast==='function'){
      toast(on ? '✔ Lot '+String(row[1]||'')+' · đã stock transfer'
               : '○ Lot '+String(row[1]||'')+' · bỏ đánh dấu stock transfer', on?'ok':'warn');
    }
    try{ logAudit('eng:tank_log:stock_transfer', row._rid, 'stockTransfer', on?'':'1', on?'1':'', 'toggle'); }catch(_){}
  }
  /* Gọi từ MIXNOTIFY khi nhân viên cân xác nhận mixing notify.
     Trả về true nếu tìm được lot và đã set cờ. */
  /* v4.77 — cb(ok, why) BẮT BUỘC dùng nếu caller cần biết kết quả thật.
     why: 'ok' | 'already' | 'notfound' | 'fb-error'.
     Giá trị trả về CHỈ mang tính đồng bộ tức thời (null = đang chờ loadAll),
     đừng dựa vào nó — bug cũ: nhánh lazy-load return true ngay lập tức nên
     MIXNOTIFY tưởng đã tick xong và xoá thông báo, trong khi lot có thể
     không bao giờ được tìm thấy → cờ ST mất âm thầm. */
  function setStockTransfer(lot, tank, on, who, cb){
    const fin = (ok, why) => {
      if(!ok) console.warn('[ENG] setStockTransfer FAILED', lot, tank, why);
      if(typeof cb === 'function'){ try{ cb(!!ok, why); }catch(e){ console.warn('[ENG] ST cb', e); } }
      return !!ok;
    };
    const commit = (row) => {
      const changed = _applyST(row, on !== false, who, (ok, err)=>{
        fin(ok, ok ? (err === 'already' ? 'already' : 'ok') : 'fb-error');
      });
      if(changed){
        render();
        try{ if(window.ALLOC && ALLOC.refresh) ALLOC.refresh(); }catch(_){}
      }
      return true;
    };

    const row = findRowByLotTank(lot, tank);
    if(row) return commit(row);

    /* v4.62 lazy-load: chỉ 10 lot mới nhất nằm trong RAM. Lot cũ hơn thì
       kéo toàn bộ Tank Log về rồi thử lại đúng 1 lần. */
    if(!_allLoaded){
      loadAll(()=>{
        const r2 = findRowByLotTank(lot, tank);
        if(!r2){ fin(false, 'notfound'); return; }
        commit(r2);
      });
      return null;                      // ĐANG CHỜ — kết quả trả về qua cb
    }
    return fin(false, 'notfound');
  }
  /* Danh sách lot CHƯA chuyển kho — ALLOC dùng để cộng thêm vào bồn. */
  function pendingTransfers(){
    return ROWS.filter(r => String(r[C_ST]||'') !== '1');
  }

  function findRowByLotTank(lot, tank){
    const lotStr = String(lot||'').trim();
    const m1 = lotStr.match(/(\d+)\s*$/);
    const lotNum = m1 ? parseInt(m1[1]) : NaN;
    const tkUpper = String(tank||'').toUpperCase();
    for(const row of ROWS){
      const rLot = String(row[1]||'').trim();
      const rTank = String(row[2]||'').trim().toUpperCase();
      const tkOk = tkUpper && (rTank === tkUpper || rTank.includes(tkUpper) || tkUpper.includes(rTank));
      if(!tkOk) continue;
      if(rLot === lotStr) return row;
      const m2 = rLot.match(/(\d+)\s*$/);
      const rNum = m2 ? parseInt(m2[1]) : NaN;
      if(!isNaN(rNum) && !isNaN(lotNum) && rNum === lotNum) return row;
    }
    /* v4.77 — VÒNG 2: bỏ qua điều kiện bồn, khớp riêng số lot.
       Số lot là duy nhất trong Tank Log nên vẫn an toàn; vòng này cứu các
       trường hợp tên bồn lệch nhau giữa notify và Tank Log (vd "TK-3501"
       vs "Tank 1" vs "3501 A") mà trước đây làm tick ST thất bại âm thầm. */
    if(!isNaN(lotNum)){
      for(const row of ROWS){
        const rLot = String(row[1]||'').trim();
        if(rLot === lotStr) return row;
        const m3 = rLot.match(/(\d+)\s*$/);
        const rNum = m3 ? parseInt(m3[1]) : NaN;
        if(!isNaN(rNum) && rNum === lotNum) return row;
      }
    }
    return null;
  }

  /* ---------- row edit modal (v4.23.0) ---------- */
  let _editingRid = null;

  /* Field layout: 5 rows × 6 columns. Order mirrors V406's engEditRow,
     re-grouped logically (identity → init → results → GC → quality). */
  const _editFields = [
    /* Row 1 — identity & time */
    {col:1, label:'Lot',              cls:'hl-lot'},
    {col:2, label:'Tank',             cls:'hl-tank'},
    {col:3, label:'Date (DD/MM/YY)',  type:'date'},
    {col:4, label:'Start Time',       type:'time'},
    {col:5, label:'Finish Time',      type:'time'},
    {col:10,label:'Init Vol (m³)'},
    /* Row 2 — init composition / target / filled C3-C4 */
    {col:11,label:'I.%C3'},
    {col:12,label:'I.%C4'},
    {col:29,label:'Target C3%'},
    {col:30,label:'Target Vol'},
    {col:13,label:'✦ Filled C3 (ton)', cls:'hl-c3'},
    {col:14,label:'✦ Filled C4 (ton)', cls:'hl-c4'},
    /* Row 3 — filled LPG + result % + final vol/qty/temp */
    {col:15,label:'✦ Filled LPG (ton)', cls:'hl-lpg'},
    {col:8, label:'✦ %C3 Result',       cls:'hl-c3'},
    {col:9, label:'✦ %C4 Result',       cls:'hl-c4'},
    {col:6, label:'Final Vol (m³)'},
    {col:7, label:'Qty (ton)'},
    {col:31,label:'Temp (°C)'},
    /* Row 4 — pressure/density/odorant + GC light */
    {col:32,label:'Pressure'},
    {col:33,label:'Density (kg/l)'},
    {col:26,label:'Odorant'},
    {col:16,label:'CH₄'},
    {col:17,label:'C₂H₆'},
    {col:18,label:'C₃H₈'},
    {col:19,label:'i-C₄'},
    /* Row 5 — GC heavy + quality + remark */
    {col:20,label:'n-C₄'},
    {col:21,label:'1,3-BD'},
    {col:22,label:'C5+'},
    {col:23,label:'Olefin'},
    {col:27,label:'Quality'},
    {col:28,label:'Remark', span:2},
    /* Row 6 — COQ identity + composition extras (v4.55) */
    {col:34,label:'COQ No',            cls:'hl-coq', type:'str'},
    {col:35,label:'Sampling Time',     type:'time'},
    {col:36,label:'Analysis Date',     type:'date'},
    {col:37,label:'C₃H₆ (Propylene)'},
    {col:38,label:'Vapor Pres. (kPa)'},
    {col:39,label:'T.Sulfur (mg/kg)'},
    /* Row 7 — COQ quality checks */
    {col:40,label:'Free Water',        type:'str'},
    {col:41,label:'Cu Corrosion',      type:'str'},
    {col:42,label:'Residue',           type:'str'},
    {col:43,label:'Mol. Weight'},
    {col:44,label:'Pro/Bu %Vol',       cls:'hl-coq', type:'str'},
    {col:45,label:'Pro/Bu %Wt',        cls:'hl-coq', type:'str'},
    /* Row 8 — COQ minor components (%vol) */
    {col:46,label:'t-2-Butene'},
    {col:47,label:'1-Butene'},
    {col:48,label:'i-Butene'},
    {col:49,label:'neo-Pentane'},
    {col:50,label:'i-Pentane'},
    {col:51,label:'n-Pentane'},
    /* Row 9 */
    {col:52,label:'n-Hexane'}
  ];

  function _fmtEditDate(raw){
    const s = String(raw||'').trim(); if(!s) return '';
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(m) return m[3]+'/'+m[2]+'/'+m[1].slice(2);
    if(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s)) return s.replace(/-/g,'/');
    return s;
  }
  function _fmtEditTime(raw){
    let s = String(raw||'').trim(); if(!s) return '';
    if(/^\d{1,2}$/.test(s)) s = s.padStart(2,'0')+':00';
    return s;
  }
  function _fmtEditNum(raw, col){
    if(raw === '' || raw == null) return '';
    const num = parseFloat(String(raw).replace(/,/g,''));
    if(isNaN(num)) return String(raw);
    /* 4dp for percent / GC mole-fraction columns */
    if([8,9,11,12,16,17,18,19,20,21,22,23,24,25,29].indexOf(col) >= 0)
      return String(parseFloat(num.toFixed(4)));
    /* 3dp for mass / volume columns */
    if([6,7,10,13,14,15,26,30].indexOf(col) >= 0)
      return String(parseFloat(num.toFixed(3)));
    return String(parseFloat(num.toFixed(3)));
  }

  /* live-mask helpers attached to the modal inputs */
  function _editTimeMask(el){
    let v = String(el.value||'').replace(/[^\d]/g,'').slice(0,4);
    if(v.length >= 3) v = v.slice(0,2) + ':' + v.slice(2);
    el.value = v;
  }
  function _editDateMask(el){
    /* very light DD/MM/YY auto-slash — keeps user typing fast on mobile */
    let v = String(el.value||'').replace(/[^\d\/]/g,'');
    el.value = v;
  }

  function editRow(idx, e){
    /* compatibility entry — render uses ENG.editRow(realIdx, event) */
    if(e) e.stopPropagation();
    const r = ROWS[idx];
    if(!r || !r._rid) return;
    openEdit(r._rid);
  }

  function openEdit(rid){
    const r = RID_MAP[rid]; if(!r) return;
    _editingRid = rid;
    while(r.length < ROW_W) r.push('');

    const tagEl = document.getElementById('engEditTag');
    if(tagEl) tagEl.textContent = (r[1]||'—') + '  ·  ' + (r[2]||'—');

    const gridEl = document.getElementById('engEditGrid');
    if(!gridEl){ _editingRid = null; return; }

    gridEl.innerHTML = _editFields.map(f=>{
      const raw = r[f.col];
      let val;
      if(f.type === 'date')      val = _fmtEditDate(raw);
      else if(f.type === 'time') val = _fmtEditTime(raw);
      else                       val = _fmtEditNum(raw, f.col);
      const span = f.span ? (' style="grid-column:span '+f.span+'"') : '';
      const cls  = 'eng-edit-inp' + (f.cls ? (' '+f.cls) : '');
      let extra = '';
      if(f.type === 'time')
        extra = ' inputmode="numeric" maxlength="5" placeholder="HH:MM"'
              + ' onfocus="this.select()" oninput="ENG._timeMask(this)"';
      else if(f.type === 'date')
        extra = ' placeholder="DD/MM/YY" maxlength="10"'
              + ' onfocus="this.select()" oninput="ENG._dateMask(this)"';
      return '<div class="eng-edit-fld"'+span+'>'
        +'<label class="eng-edit-lbl">'+f.label+'</label>'
        +'<input data-col="'+f.col+'" data-type="'+(f.type||'num')+'"'
        +' type="text" class="'+cls+'" value="'+_esc(val)+'"'+extra+'>'
        +'</div>';
    }).join('');

    document.getElementById('engEditBg')?.classList.add('on');
  }

  function closeEdit(){
    document.getElementById('engEditBg')?.classList.remove('on');
    _editingRid = null;
  }

  function saveEdit(){
    if(!_editingRid){ toast('Nothing to save','warn'); return; }
    const r = RID_MAP[_editingRid]; if(!r){ closeEdit(); return; }
    const modal = document.getElementById('engEditModal');
    if(!modal) return;
    const qPrev = String(r[27]||'').trim().toLowerCase();   /* v4.61 — quality BEFORE this edit */

    /* string-preserving columns: date/time, lot/tank labels, quality, remark, COQ text cols */
    const strCols = new Set([3,4,5,1,2,27,28,34,35,36,40,41,42,44,45]);
    modal.querySelectorAll('input[data-col]').forEach(inp=>{
      const col = parseInt(inp.dataset.col);
      const val = String(inp.value||'').trim();
      if(strCols.has(col)){
        r[col] = val;
      } else {
        const num = parseFloat(val.replace(/,/g,''));
        r[col] = (!isNaN(num) && val !== '') ? num : val;
      }
    });

    /* v4.55 — auto re-evaluate Quality vs the spec table whenever
       parameters are edited (only for rows already judged Pass/Fail;
       Pending drafts keep their status). %C3-vs-target deviation is a
       WARNING only — it never flips the verdict. */
    const q0 = String(r[27]||'').trim().toLowerCase();
    if((q0==='pass' || q0==='fail')
       && typeof MC !== 'undefined' && typeof MC.evalRowQuality === 'function'){
      try{
        const ev = MC.evalRowQuality(r);
        if(ev && ev.verdict){
          r[27] = ev.verdict;
          if(ev.fails.length) toast('⚠ Quality = FAIL: '+ev.fails.join(' · '),'er');
          if(ev.warns.length) toast('⚠ '+ev.warns.join(' · '),'warn');
        }
      }catch(e){ console.warn('[ENG] evalRowQuality', e); }
    }

    _saveCache();
    _pushRowFb(_editingRid, r);
    render();
    toast('💾 Changes saved — '+String(r[1]||'')+' '+String(r[2]||''), 'ok');
    /* v4.61 — draft resumed to Pass (e.g. after IMPORT COQ) must reach the
       Scale Station like every Mix-Cal Pass save does. Auto-notify ONLY on
       the non-Pass → Pass transition; re-saving an already-Pass row stays
       silent (use the 📢 NOTIFY button for a manual re-push). */
    _notifyOnNewPass(r, qPrev);
    closeEdit();
  }

  /* v4.61 — push mix_notify when a row's Quality just BECAME Pass */
  function _notifyOnNewPass(r, qPrev){
    const qNew = String(r[27]||'').trim().toLowerCase();
    if(qNew !== 'pass' || qPrev === 'pass') return;
    const _n = v => { const x = parseFloat(String(v==null?'':v).replace(/,/g,'')); return isNaN(x) ? 0 : x; };
    const fC3Kg = Math.round(Math.abs(_n(r[13])) * 1000);
    const fC4Kg = Math.round(Math.abs(_n(r[14])) * 1000);
    if(fC3Kg <= 0 && fC4Kg <= 0) return;
    if(typeof MIXNOTIFY === 'undefined' || !MIXNOTIFY.pushNotify) return;
    const tkStr = String(r[2]||'');
    const tkName = tkStr.includes('3501') ? 'TK-3501'
                : (tkStr.includes('3502') ? 'TK-3502' : tkStr);
    const tkKey  = tkStr.includes('3501') ? 'tk1'
                : (tkStr.includes('3502') ? 'tk2' : '');
    const lotStr = String(r[1]||'');
    try{
      MIXNOTIFY.pushNotify(tkName, lotStr, fC3Kg, fC4Kg, tkKey);
      toast('📢 Auto-notified Scale (Pending → Pass) · '+lotStr+' '+tkName
          +' · C3:'+fC3Kg+' C4:'+fC4Kg+' kg','ok');
    }catch(e){ console.warn('[ENG] _notifyOnNewPass', e); }
  }

  /* ============================================================
     v4.61 — IMPORT COQ directly into the edit modal (replaces the
     OPEN GC button). Reuses MC.parseCoqWorkbook (same file format as
     the Tank Mix panel import), validates Lot + Shore Tank against
     the row being edited, then fills the modal INPUTS only — nothing
     is saved until the operator presses CALC+SAVE / SAVE.
     ============================================================ */
  function importCoq(){
    if(!_editingRid){ toast('No row selected','warn'); return; }
    const inp = document.getElementById('engCoqFile');
    if(!inp){ toast('❌ File input missing','er'); return; }
    inp.value = '';
    inp.click();
  }

  function _coqLotParse(s){
    const m = String(s||'').match(/(\d{4})\s*-\s*(\d+)\s*$/);
    return m ? { year:parseInt(m[1]), num:parseInt(m[2]) } : null;
  }

  function coqChosen(inputEl){
    const f = inputEl && inputEl.files && inputEl.files[0];
    if(!f) return;
    if(typeof XLSX === 'undefined'){ toast('❌ XLSX library not loaded','er'); return; }
    if(typeof MC === 'undefined' || typeof MC.parseCoqWorkbook !== 'function'){
      toast('❌ Mix Cal module not ready — open the Mix Cal tab once, then retry','er'); return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      let coq;
      try{
        const wb = XLSX.read(e.target.result, {type:'array'});
        coq = MC.parseCoqWorkbook(wb);
      }catch(err){
        console.warn('[ENG] COQ parse', err);
        toast('❌ Không đọc được file COQ: '+err.message,'er');
        return;
      }
      _applyCoqToModal(coq, f.name);
    };
    reader.onerror = ()=> toast('❌ Không đọc được file','er');
    reader.readAsArrayBuffer(f);
  }

  function _applyCoqToModal(coq, fname){
    if(!_editingRid){ toast('No row selected','warn'); return; }
    const r = RID_MAP[_editingRid]; if(!r) return;
    const modal = document.getElementById('engEditModal'); if(!modal) return;
    /* ── 1. Lot check — mismatch → warn & ABORT (no data written) ── */
    if(!coq.lot){
      alert('⚠ KHÔNG TÌM THẤY SỐ LOT trong file COQ\n\nFile: '+fname+'\nKiểm tra lại file trước khi import.');
      return;
    }
    const rowLotStr = String(r[1]||'');
    const coqLot = _coqLotParse(coq.lot), rowLot = _coqLotParse(rowLotStr);
    if(!rowLot){
      alert('⚠ ROW CHƯA CÓ SỐ LOT HỢP LỆ\n\nRow: "'+rowLotStr+'"\nCOQ: '+coq.lot);
      return;
    }
    if(!coqLot || coqLot.num !== rowLot.num || coqLot.year !== rowLot.year){
      alert('❌ SỐ LOT KHÔNG KHỚP — DỮ LIỆU KHÔNG ĐƯỢC IMPORT\n\n'+
            '• COQ file:  '+coq.lot+'\n'+
            '• Row đang sửa:  '+rowLotStr+'\n\n'+
            'Nhân viên có thể đã chọn sai file. Kiểm tra lại.');
      toast('❌ COQ Lot '+coq.lot+' ≠ '+rowLotStr+' — không import','er');
      return;
    }
    /* ── 2. Shore-tank check ── */
    const rowTk = String(r[2]||'').replace(/[^\d]/g,'');
    if(coq.tank){
      const coqTk = String(coq.tank).replace(/[^\d]/g,'');
      if(coqTk && rowTk && coqTk !== rowTk){
        alert('❌ SAI BỒN — DỮ LIỆU KHÔNG ĐƯỢC IMPORT\n\n'+
              '• COQ file:  TK'+coqTk+'\n'+
              '• Row đang sửa:  TK-'+rowTk);
        return;
      }
    }
    /* ── 3. Fill modal INPUTS (not the row) — same col map as Tank Mix ── */
    const setC = (col, v, dec)=>{
      if(v == null || v === '') return;
      const inp = modal.querySelector('input[data-col="'+col+'"]');
      if(!inp) return;
      inp.value = (typeof v === 'number')
        ? String(parseFloat(v.toFixed(dec == null ? 4 : dec)))
        : String(v);
    };
    const c = coq.comp || {};
    const ch4Inp = modal.querySelector('input[data-col="16"]');
    if(ch4Inp) ch4Inp.value = '';            // COQ has no CH4 line
    setC(17, c.c2h6);  setC(18, c.c3h8);  setC(19, c.ic4);  setC(20, c.nc4);
    setC(21, c.bd13);  setC(22, c.c5);    setC(23, c.olef);
    setC(34, coq.no || '');
    setC(35, coq.sampTime || '');
    const anaFmt = (typeof MC.fmtCoqDate === 'function') ? MC.fmtCoqDate(coq.anaDate) : '';
    setC(36, anaFmt);
    setC(37, c.c3h6);  setC(38, coq.vp, 0);  setC(39, coq.sul, 2);
    setC(40, coq.h2o); setC(41, coq.cu);     setC(42, coq.res);
    setC(43, coq.mw, 2);
    setC(44, coq.frv); setC(45, coq.frw);
    setC(46, c.t2b);   setC(47, c.b1);   setC(48, c.ib);
    setC(49, c.neoc5); setC(50, c.ic5);  setC(51, c.nc5);  setC(52, c.nc6);
    /* Quantity = Final Vol · Density@15 — same as Tank Mix import */
    if(coq.qty) setC(6,  coq.qty, 3);
    if(coq.den) setC(33, coq.den, 4);
    /* Finish time: only fill when EMPTY (a draft usually already has the
       real finish time from the mix — don't clobber it with sampling time) */
    const finInp = modal.querySelector('input[data-col="5"]');
    if(finInp && !String(finInp.value||'').trim() && coq.sampTime) finInp.value = coq.sampTime;
    toast('📄 Import COQ '+(coq.no||'')+' → '+rowLotStr+' — double-click 🧮 CALC + 💾 SAVE để tính Filled C3/C4','ok');
  }

  /* Bridge — Tank Log → Mix Cal: resume Pending lot into inline GC.
     Closes the edit modal first, then snapshots the row and calls
     MC.openGc with a defensive copy so concurrent edits can't shift
     the live row mid-render. (Button removed from the modal in v4.61 —
     kept as API for legacy callers.) */
  function openGc(){
    if(!_editingRid){ toast('No row selected','warn'); return; }
    const r = RID_MAP[_editingRid]; if(!r){ closeEdit(); return; }
    const snap = r.slice(0, ROW_W);
    closeEdit();
    if(typeof MC === 'undefined' || typeof MC.openGc !== 'function'){
      toast('❌ Mix Cal not ready — try again after the Mix Cal tab loads once','er');
      return;
    }
    try{ MC.openGc(snap); }
    catch(e){ console.warn('[ENG] openGc', e); toast('⚠ openGc failed: '+e.message,'er'); }
  }

  /* CALC + SAVE — port of V406 engCalcSaveNotify (v4.24.0), notify split
     out in v4.60. Reads modal inputs into the row, validates timing,
     calls MC.calcFromRow to recompute Filled C3/C4/LPG/Qty/%C3/%C4/
     Odorant, stamps Quality='Pass' and persists to FB. It no longer
     pushes mix_notify — use the separate 📢 NOTIFY button (notifyScale)
     so a recalculation can be reviewed before the Scale Station is told. */
  /* v4.61 — double-click gate: a single click only arms the button; the
     recalculation runs on the second click within 600 ms. Prevents an
     accidental tap from silently rewriting Filled C3/C4. */
  let _csArmTs = 0;
  function calcSaveClick(){
    const now = Date.now();
    if(now - _csArmTs < 600){ _csArmTs = 0; calcSave(); return; }
    _csArmTs = now;
    toast('🖱 Click ĐÔI để 🧮 CALC + 💾 SAVE (tránh bấm nhầm)','warn');
  }

  function calcSave(){
    if(!_editingRid){ toast('Nothing to recalculate','warn'); return; }
    const r = RID_MAP[_editingRid]; if(!r){ closeEdit(); return; }
    const modal = document.getElementById('engEditModal');
    if(!modal) return;
    const qPrev = String(r[27]||'').trim().toLowerCase();   /* v4.61 — quality BEFORE recalc */

    /* 1) commit modal inputs to row (same rules as saveEdit) */
    const strCols = new Set([3,4,5,1,2,27,28]);
    modal.querySelectorAll('input[data-col]').forEach(inp=>{
      const col = parseInt(inp.dataset.col);
      const val = String(inp.value||'').trim();
      if(strCols.has(col)) r[col] = val;
      else {
        const num = parseFloat(val.replace(/,/g,''));
        r[col] = (!isNaN(num) && val !== '') ? num : val;
      }
    });

    /* 2) validate / auto-fill timing */
    const stTime = String(r[4]||'').trim();
    if(!stTime){ toast('❌ No Start Time — open MIX CAL and press ▶START first','er'); return; }
    let fiTime = String(r[5]||'').trim();
    if(!fiTime){
      const d = new Date(), p2 = v => String(v).padStart(2,'0');
      fiTime = p2(d.getHours())+':'+p2(d.getMinutes());
      r[5] = fiTime;
      const finInp = modal.querySelector('input[data-col="5"]');
      if(finInp) finInp.value = fiTime;
      toast('⏱ Finish Time auto-filled: '+fiTime, 'warn');
    }

    /* 3) recompute via MC.calcFromRow */
    if(typeof MC === 'undefined' || typeof MC.calcFromRow !== 'function'){
      toast('❌ Mix Cal not ready — open the Mix Cal tab once, then retry','er'); return;
    }
    const out = MC.calcFromRow(r);
    if(out.error){ toast('⚠ '+out.error, 'er'); return; }

    /* 4) write computed values back to canonical columns */
    r[13] = out.fC3;
    r[14] = out.fC4;
    r[15] = out.fLPG;
    r[7]  = parseFloat(out.qty.toFixed(3));
    r[8]  = parseFloat((out.rC3 * 100).toFixed(4));
    r[9]  = parseFloat((out.rC4 * 100).toFixed(4));
    r[24] = parseFloat((out.rC3 * 100).toFixed(4));
    r[25] = parseFloat((out.rC4 * 100).toFixed(4));
    /* v4.61 — verdict vs the COQ spec table (was a blind 'Pass' stamp,
       V406 parity). C3-vs-target deviation stays a WARNING only. */
    r[27] = 'Pass';
    if(typeof MC.evalRowQuality === 'function'){
      try{
        const ev = MC.evalRowQuality(r);
        if(ev && ev.verdict){
          r[27] = ev.verdict;
          if(ev.fails.length) toast('⚠ Quality = FAIL: '+ev.fails.join(' · '),'er');
          if(ev.warns.length) toast('⚠ '+ev.warns.join(' · '),'warn');
        }
      }catch(e){ console.warn('[ENG] evalRowQuality', e); }
    }
    if(out.odoBD) r[26] = out.odoBD;

    _saveCache();
    _pushRowFb(_editingRid, r);

    /* 5) refresh the modal inputs so the operator SEES the recomputed
       values before deciding to 📢 NOTIFY */
    const _setInp = (col, v) => {
      const inp = modal.querySelector('input[data-col="'+col+'"]');
      if(inp) inp.value = _fmtEditNum(v, col);
    };
    _setInp(13, r[13]); _setInp(14, r[14]); _setInp(15, r[15]);
    _setInp(7,  r[7]);  _setInp(8,  r[8]);  _setInp(9,  r[9]);
    if(out.odoBD) _setInp(26, r[26]);
    const qInp = modal.querySelector('input[data-col="27"]');
    if(qInp) qInp.value = String(r[27]||'');

    const tkStr = String(r[2]||'');
    const tkName = tkStr.includes('3501') ? 'TK-3501'
                : (tkStr.includes('3502') ? 'TK-3502' : tkStr);
    const lotStr = String(r[1]||'');
    render();
    toast('✅ Calc+Save · '+lotStr+' '+tkName
        +' · C3:'+_fmtEditNum(r[13],13)+' C4:'+_fmtEditNum(r[14],14)
        +' ton — press 📢 NOTIFY to push to Scale', 'ok');
    /* v4.61 — draft (Pending/Fail) that just became Pass auto-notifies
       Scale, mirroring the Mix-Cal SAVE PASS behaviour. Re-calc of an
       already-Pass row stays silent (📢 NOTIFY for manual push). */
    _notifyOnNewPass(r, qPrev);
  }

  /* 📢 NOTIFY — v4.60, split out of CALC+SAVE+NOTIFY. Takes the CURRENT
     modal values (no recalculation, no save) and pushes them to the
     Scale Station 4-slot mix bar via MIXNOTIFY.pushNotify. */
  function notifyScale(){
    if(!_editingRid){ toast('No row selected','warn'); return; }
    const r = RID_MAP[_editingRid]; if(!r){ closeEdit(); return; }
    const modal = document.getElementById('engEditModal');
    /* current value = what is in the modal input right now; fall back to row */
    const _cur = col => {
      const inp = modal ? modal.querySelector('input[data-col="'+col+'"]') : null;
      const raw = inp ? inp.value : r[col];
      const num = parseFloat(String(raw==null?'':raw).replace(/,/g,''));
      return isNaN(num) ? 0 : num;
    };
    const _curS = col => {
      const inp = modal ? modal.querySelector('input[data-col="'+col+'"]') : null;
      return String((inp ? inp.value : r[col]) || '').trim();
    };
    const lotStr = _curS(1) || String(r[1]||'');
    const tkStr  = _curS(2) || String(r[2]||'');
    const tkName = tkStr.includes('3501') ? 'TK-3501'
                : (tkStr.includes('3502') ? 'TK-3502' : tkStr);
    const tkKey  = tkStr.includes('3501') ? 'tk1'
                : (tkStr.includes('3502') ? 'tk2' : '');
    const fC3Kg = Math.round(Math.abs(_cur(13)) * 1000);
    const fC4Kg = Math.round(Math.abs(_cur(14)) * 1000);
    if(fC3Kg <= 0 && fC4Kg <= 0){
      toast('⚠ Filled C3/C4 are both 0 — nothing to notify','er'); return;
    }
    if(typeof MIXNOTIFY === 'undefined' || !MIXNOTIFY.pushNotify){
      toast('❌ Mix-notify module not ready','er'); return;
    }
    try{
      MIXNOTIFY.pushNotify(tkName, lotStr, fC3Kg, fC4Kg, tkKey);
      toast('📢 Notified Scale · '+lotStr+' '+tkName+' · C3:'+fC3Kg+' C4:'+fC4Kg+' kg','ok');
    }catch(e){
      console.warn('[ENG] MIXNOTIFY.pushNotify', e);
      toast('❌ Notify failed: '+e.message,'er');
    }
  }

  function toggleLotSort(){
    _lotSortAsc = !_lotSortAsc;
    render();
  }

  /* CSV export — light Excel-compatible, no XLSX lib dependency */
  function exportXlsx(){
    if(!ROWS.length){ toast('Tank Log is empty','er'); return; }
    if(!_allLoaded && !confirm('Mới tải '+ROWS.length+' lot gần nhất — file export sẽ CHỈ gồm các lot này.\n\nOK = export luôn · Cancel = hủy (bấm 📥 Load All trước nếu cần đủ dữ liệu)')) return;
    const headers = ['No','Lot','Tank','Date','Start','Finish','Vol(m³)','Qty(ton)','%C3','%C4',
      'InitVol','I.%C3','I.%C4','FilledC3','FilledC4','FilledLPG','CH4','C2H6','C3H8','i-C4','n-C4','1.3-BD',
      'C5+','Olefin','(24)','(25)','Odorant','Quality','Remark','TargetC3%','TargetVol','Temp','Pres','Density',
      'COQNo','SampTime','AnalysisDate','C3H6','VP','Sulfur','FreeWater','CuCorr','Residue','MW',
      'ProBu%Vol','ProBu%Wt','t2Butene','1Butene','iButene','neoPentane','iPentane','nPentane','nHexane',
      'StockTransfer','ST_Time','ST_By'];   /* v4.68 — 3 cột cuối khớp ROW_W=56 */
    const csvLines = [headers.join(',')];
    /* v4.63 — export theo thứ tự lot MỚI NHẤT → CŨ NHẤT (khớp bảng) */
    const ordered = ROWS.slice().sort((a,b)=> _lotKey(b[1]) - _lotKey(a[1]));
    ordered.forEach(r=>{
      const cells = [];
      for(let i=0;i<ROW_W;i++){
        let v = String(r[i] == null ? '' : r[i]);
        if(/[",\n]/.test(v)) v = '"' + v.replace(/"/g,'""') + '"';
        cells.push(v);
      }
      csvLines.push(cells.join(','));
    });
    const blob = new Blob(['\uFEFF'+csvLines.join('\n')], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    const p2 = n=>String(n).padStart(2,'0');
    a.href = url;
    a.download = 'tank_log_'+d.getFullYear()+p2(d.getMonth()+1)+p2(d.getDate())+'.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('📥 Exported Tank Log: '+ROWS.length+' rows','ok');
  }

  /* ---------- Firebase init: legacy-array migration + child listeners ----------
     v4.62 — src param: partial mode listens on the limitToLast QUERY (live
     window of newest rows), full mode listens on the whole ref. */
  function _attachChildListeners(src){
    const ref = src || _fbRef;
    if(!ref) return;
    ref.on('child_added', snap=>{
      if(_suppressEcho > 0) return;
      const rid = snap.key;
      const v = snap.val();
      if(!v || !Array.isArray(v.cells)) return;
      if(RID_MAP[rid]) return;        // already known (initial load or our own write)
      _setRowLocal(rid, v.cells);
      _saveCache();
      try{ render(); }catch(_){}
      try{ if(typeof SCALE!=='undefined' && SCALE.refreshLotFromTankLog) SCALE.refreshLotFromTankLog(); }catch(_){}
    });
    ref.on('child_changed', snap=>{
      if(_suppressEcho > 0) return;
      const rid = snap.key;
      const v = snap.val();
      if(!v || !Array.isArray(v.cells)) return;
      _setRowLocal(rid, v.cells);
      _saveCache();
      try{ render(); }catch(_){}
    });
    ref.on('child_removed', snap=>{
      if(_suppressEcho > 0) return;
      const rid = snap.key;
      if(_removeRowLocal(rid)){
        _saveCache();
        try{ render(); }catch(_){}
      }
    });
  }

  /* v4.62 — PARTIAL initial load: only the INIT_LOTS newest rows (by _ts).
     Replaces the old full once('value'). Legacy-array schema is detected
     from the window contents and falls back to loadAll() (migration path). */
  function _initialLoadAndAttach(){
    if(!_fbRef) return;
    _query = _fbRef.orderByChild('_ts').limitToLast(INIT_LOTS);
    _query.once('value').then(snap=>{
      const val = snap.val();
      if(!val){
        /* EMPTY FB — prune ghost cache rows (same semantics as before:
           limitToLast on a non-empty node always returns rows). */
        if(ROWS.length){
          console.warn('[ENG] Reconcile: Firebase node empty — pruning '+ROWS.length+' stale local row(s)');
          ROWS = []; RID_MAP = Object.create(null);
          _saveCache();
        }
        render();
        _attachChildListeners(_query);
      } else {
        /* legacy array schema? children are plain arrays (no .cells) */
        let legacy = false;
        for(const k in val){
          const v = val[k];
          if(Array.isArray(v)){ legacy = true; }
          break;
        }
        if(legacy){ loadAll(); return; }
        /* NEW SCHEMA — window replaces the local cache (partial truth) */
        ROWS = []; RID_MAP = Object.create(null);
        for(const rid in val){
          const v = val[rid];
          if(!v || !Array.isArray(v.cells)) continue;
          _setRowLocal(rid, v.cells);
        }
        _saveCache();
        render();
        _attachChildListeners(_query);
      }
      /* SCALE: refresh active tank's lot from latest tank-log row */
      try{ if(typeof SCALE!=='undefined' && SCALE.refreshLotFromTankLog) SCALE.refreshLotFromTankLog(); }catch(_){}
    }).catch(e=> console.warn('[ENG] partial load fail', e));
  }

  /* v4.62 — LOAD ALL: one-shot full read (keeps the old migration logic),
     then live listeners on the FULL ref. Other modules that need the whole
     Tank Log in RAM (e.g. ODOR monthly sums) call ENG.loadAll(cb). */
  function loadAll(done){
    if(_allLoaded || !_fbRef){ if(typeof done==='function') done(); return; }
    if(_query){ try{ _query.off(); }catch(_){} _query = null; }
    _fbRef.once('value').then(snap=>{
      const val = snap.val();
      if(Array.isArray(val) && val.length){
        /* LEGACY ARRAY SCHEMA detected — migrate to rid-keyed */
        const migrate = confirm(
          'Tank Log: Firebase data is in legacy array format ('+val.length+' rows).\n\n' +
          'Migrate to the new rid-keyed schema now? (one-time Firebase write)\n\n' +
          'OK = migrate · Cancel = keep using legacy data this session'
        );
        if(migrate){
          ROWS = []; RID_MAP = Object.create(null);
          const migrated = {};
          val.forEach(rowArr=>{
            if(!Array.isArray(rowArr)) return;
            const cells = [];
            for(let i = 0; i < ROW_W; i++) cells[i] = rowArr[i] != null ? rowArr[i] : '';
            const rid = _genRid();
            migrated[rid] = { cells, _ts: Date.now() };
            _setRowLocal(rid, cells);
          });
          _suppressEcho++;
          _fbRef.set(migrated)
            .then(()=> { _migrationDone = true; toast('✅ Tank Log migrated to rid-keyed schema ('+val.length+' rows)','ok'); })
            .catch(e=> console.warn('[ENG] migrate set fail', e))
            .finally(()=> setTimeout(()=>{ _suppressEcho = Math.max(0, _suppressEcho - 1); }, 800));
          _saveCache();
        } else {
          /* user declined — load array rows into RAM as if migrated, but don't push back to FB */
          ROWS = []; RID_MAP = Object.create(null);
          val.forEach(rowArr=>{
            if(!Array.isArray(rowArr)) return;
            const cells = [];
            for(let i = 0; i < ROW_W; i++) cells[i] = rowArr[i] != null ? rowArr[i] : '';
            _setRowLocal(_genRid(), cells);
          });
          _saveCache();
        }
        render();
        /* don't attach child listeners on legacy array — the data is at root level, not children */
        if(_migrationDone) _attachChildListeners();
      } else if(val && typeof val === 'object'){
        /* NEW SCHEMA — replace local cache with FB truth, then listen for deltas */
        ROWS = []; RID_MAP = Object.create(null);
        for(const rid in val){
          const v = val[rid];
          if(!v || !Array.isArray(v.cells)) continue;
          _setRowLocal(rid, v.cells);
        }
        _saveCache();
        render();
        _attachChildListeners();
      } else {
        /* EMPTY FB — Firebase is the source of truth: if the local cache still
           holds rows, they are ghosts (node was wiped / range-deleted on another
           machine while this one was offline). PRUNE them — never keep stale
           rows visible, and never let a later edit write one back to Firebase
           (that would resurrect intentionally-deleted data). v4.33.2 */
        if(ROWS.length){
          console.warn('[ENG] Reconcile: Firebase node empty — pruning '+ROWS.length+' stale local row(s)');
          ROWS = []; RID_MAP = Object.create(null);
          _saveCache();
          render();
        }
        _attachChildListeners();
      }
      _allLoaded = true;
      _updateLoadAllBtn();
      render();
      toast('📥 Tank Log: đã tải toàn bộ '+ROWS.length+' lot','ok');
      /* SCALE: refresh active tank's lot from latest tank-log row */
      try{ if(typeof SCALE!=='undefined' && SCALE.refreshLotFromTankLog) SCALE.refreshLotFromTankLog(); }catch(_){}
      if(typeof done==='function') done();
    }).catch(e=>{
      console.warn('[ENG] full load fail', e);
      toast('❌ Load All thất bại: '+(e&&e.message||e),'er');
    });
  }

  function init(){
    _loadCache();
    try{
      if(typeof firebase !== 'undefined'){
        _fbRef = firebase.database().ref(FB_PATH);
        _initialLoadAndAttach();
      }
    }catch(e){ console.warn('[ENG] FB init', e); }
    const b = document.getElementById('engBadgeTkmix');
    if(b) b.textContent = ROWS.length;
    console.log('[ENG] ✅ Init OK · '+ROWS.length+' tank-log rows (rid-keyed)');
  }

  /* ============================================================
     v4.77 — IN PHIẾU DỮ LIỆU LÔ PHA TRỘN (A4 portrait)
     ------------------------------------------------------------
     Mục đích: xuất 1 tờ A4 / 1 lot chứa dữ liệu của lot (điều kiện
     pha trộn, cân bằng vật chất, kết quả GC, chỉ tiêu COQ, trạng
     thái chuyển kho) kèm ô ký tên của LPG Terminal để cung cấp cho
     đoàn kiểm tra / audit.

     Luồng 2 bước:
       B1  gõ số lot → danh sách CHỈ hiện khi đã gõ (tránh rối mắt)
           → tick chọn; tìm tiếp lot khác, các lot đã chọn giữ
           nguyên dưới dạng chip → in nhiều trang một lần.
       B2  "Xem trước & sửa": dựng đúng bản in trên màn hình,
           mọi ô số đều sửa được tại chỗ, có ✕ để xoá trắng, và
           checkbox bật/tắt từng VÙNG dữ liệu (đầu phiếu, GC, COQ,
           ký tên…) — vùng nào không muốn lộ thì bỏ tick.
           Sửa/ẩn CHỈ ảnh hưởng bản in, KHÔNG ghi lại Tank Log.
     In qua hidden iframe (_pfPrintViaIframe) — không mở tab mới.
     ============================================================ */
  const CO_VN  = 'CÔNG TY TNHH HÓA CHẤT HYOSUNG VINA';
  const CO_EN  = 'HYOSUNG VINA CHEMICALS CO., LTD.';
  const DEPT   = 'LPG TERMINAL — ENGINEERING / TANK MIXING';

  /* Các vùng bật/tắt được. key phải khớp data-sec trong _buildOneSheet. */
  const PR_SECS = [
    { k:'hdr',  n:'Đầu phiếu (tên công ty, ngày in, người in)' },
    { k:'band', n:'Dải nhận diện lô (Lot · Bồn · Ngày · Kết quả)' },
    { k:'s1',   n:'1. Điều kiện pha trộn' },
    { k:'s2',   n:'2. Cân bằng vật chất' },
    { k:'s3',   n:'3. Kết quả phân tích GC' },
    { k:'s4',   n:'4. Chỉ tiêu COQ' },
    { k:'s5',   n:'5. Ghi chú' },
    { k:'cert', n:'Câu xác nhận' },
    { k:'sig',  n:'Khối ký tên' },
    { k:'foot', n:'Chân trang' }
  ];

  let _prSel  = Object.create(null);      // rid -> true (lot đã chọn, giữ qua nhiều lần tìm)
  let _prSecOn = Object.create(null);     // key vùng -> bật/tắt
  PR_SECS.forEach(s => _prSecOn[s.k] = true);
  let _prEdit = false;                    // đang dựng bản CÓ chỉnh sửa?

  /* ---------------- BƯỚC 1 — tìm & chọn lot ---------------- */
  function openPrint(){
    _prSel = Object.create(null);
    PR_SECS.forEach(s => _prSecOn[s.k] = true);
    const bg = document.getElementById('engPrintModal');
    if(!bg) return;
    const q = document.getElementById('engPrintSrch');
    if(q) q.value = '';
    printBack();
    bg.classList.add('on');
    renderPrintList();
    setTimeout(()=>{ q && q.focus(); }, 80);
  }
  function closePrint(){
    const bg = document.getElementById('engPrintModal');
    if(bg) bg.classList.remove('on');
  }

  function _prQuery(){
    return String(document.getElementById('engPrintSrch')?.value || '').toLowerCase().trim();
  }
  /* Kết quả tìm — khớp Lot, Bồn hoặc COQ No. KHÔNG trả gì khi chưa gõ. */
  function _prMatches(){
    const q = _prQuery();
    if(!q) return [];
    return ROWS.slice()
      .sort((a,b)=> _lotKey(b[1]) - _lotKey(a[1]))
      .filter(r =>
        String(r[1]||'').toLowerCase().includes(q) ||
        String(r[2]||'').toLowerCase().includes(q) ||
        String(r[34]||'').toLowerCase().includes(q))
      .slice(0, 40);
  }
  function renderPrintList(){
    const box = document.getElementById('engPrintList');
    if(!box) return;
    const q = _prQuery();

    if(!q){
      box.innerHTML = '<div class="eng-pr-empty">'
        + '<div class="eng-pr-empty-ic">🔍</div>'
        + 'Gõ <b>số lot</b> vào ô trên để tìm — ví dụ <code>305</code> hoặc <code>LPG-2026-305</code>.'
        + '<br>Tick lot cần in, rồi tìm tiếp lot khác nếu muốn in nhiều trang.'
        + '</div>';
      _syncPrintCount(); return;
    }
    const list = _prMatches();
    if(!list.length){
      box.innerHTML = '<div class="eng-pr-empty">Không tìm thấy lot nào khớp "<b>'+_esc(q)+'</b>"'
        + (_allLoaded ? '' : '<br><span style="color:var(--orange)">Đang ở chế độ '+INIT_LOTS
           +' lot mới nhất — bấm 📥 Load All ở thanh công cụ để tìm trong toàn bộ dữ liệu.</span>')
        + '</div>';
      _syncPrintCount(); return;
    }
    box.innerHTML =
      '<div class="eng-pr-hd">'
      + '<span></span><span>Lot</span><span>Bồn</span><span>Ngày</span>'
      + '<span class="ta-r">Filled LPG</span><span class="ta-c">Quality</span><span>COQ No</span>'
      + '</div>'
      + list.map(r=>{
        const rid = r._rid || '';
        const on  = !!_prSel[rid];
        const ql  = String(r[27]||'').trim().toLowerCase();
        const qc  = ql==='pass' ? 'var(--green)' : (ql==='fail' ? 'var(--red)' : '#d97706');
        return '<label class="eng-pr-item'+(on?' on':'')+'">'
          + '<input type="checkbox" '+(on?'checked':'')+' onchange="ENG.togglePrintSel(\''+rid+'\',this.checked)">'
          + '<span class="eng-pr-lot">'+_esc(r[1])+'</span>'
          + '<span class="eng-pr-tk">'+_esc(r[2])+'</span>'
          + '<span class="eng-pr-dt">'+_fmtDate(r[3])+'</span>'
          + '<span class="eng-pr-lpg">'+_fmtNum(r[15],3)+'</span>'
          + '<span class="eng-pr-q" style="color:'+qc+'">'+_esc(r[27])+'</span>'
          + '<span class="eng-pr-coq">'+_esc(r[34])+'</span>'
          + '</label>';
      }).join('');
    _syncPrintCount();
  }
  function togglePrintSel(rid, on){
    if(on) _prSel[rid] = true; else delete _prSel[rid];
    renderPrintList();
  }
  function printSelectAll(){
    const l = _prMatches();
    if(!l.length) return;
    l.forEach(r=>{ if(r._rid) _prSel[r._rid] = true; });
    renderPrintList();
  }
  function printClearSel(){ _prSel = Object.create(null); renderPrintList(); }

  /* Lot đã chọn theo thứ tự lot giảm dần */
  function _prPicked(){
    return ROWS.filter(r => r._rid && _prSel[r._rid])
               .sort((a,b)=> _lotKey(b[1]) - _lotKey(a[1]));
  }
  function _syncPrintCount(){
    const picked = _prPicked();
    const n = picked.length;

    const chips = document.getElementById('engPrChips');
    if(chips){
      chips.innerHTML = n
        ? picked.map(r=>'<span class="eng-pr-chip">'+_esc(r[1])+' · '+_esc(r[2])
            + '<button onclick="ENG.togglePrintSel(\''+r._rid+'\',false)" title="Bỏ lot này">✕</button></span>').join('')
            + '<button class="eng-pr-chip-clr" onclick="ENG.printClearSel()">Xoá hết</button>'
        : '<span class="eng-pr-chip-none">— chưa chọn lot nào —</span>';
    }
    const cn = document.getElementById('engPrChipN'); if(cn) cn.textContent = n;

    const el = document.getElementById('engPrintCnt');
    if(el) el.textContent = n ? (n + ' lot · ' + n + ' trang A4') : 'Chưa chọn lot nào';
    const nx = document.getElementById('engPrNext');
    if(nx){ nx.disabled = !n; nx.style.opacity = n ? '' : '.5'; nx.style.cursor = n ? '' : 'not-allowed'; }
  }

  /* ---------------- BƯỚC 2 — xem trước & sửa ---------------- */
  function printReview(){
    const picked = _prPicked();
    if(!picked.length){ toast('⚠ Chưa chọn lot nào','warn'); return; }

    /* nhúng CSS bản in vào trang để xem trước giống hệt lúc in */
    if(!document.getElementById('engPrStyle')){
      const st = document.createElement('style');
      st.id = 'engPrStyle';
      st.textContent = _PR_CSS + _PR_SCREEN_CSS;
      document.head.appendChild(st);
    }
    const host = document.getElementById('engPrSheets');
    if(host){
      _prEdit = true;
      host.innerHTML = picked.map((r,i)=> '<div class="pr-paper">'
        + _buildOneSheet(r, i+1, picked.length) + '</div>').join('');
      _prEdit = false;
      if(!host.dataset.wired){
        host.dataset.wired = '1';
        /* ✕ trên từng ô → bật/tắt cờ .pr-off cho CẢ nhãn lẫn giá trị.
           Lúc in, ô .pr-off bị làm trống hoàn toàn nên không còn cảnh
           "có tiêu đề mà không có số" — thứ luôn bị đoàn kiểm tra hỏi. */
        host.addEventListener('click', e=>{
          const x = e.target.closest ? e.target.closest('.pr-x') : null;
          if(!x) return;
          e.preventDefault(); e.stopPropagation();
          _prToggleCell(x.closest('td'));
        });
        /* checkbox tiêu đề mục ngay trên phiếu */
        host.addEventListener('change', e=>{
          const cb = e.target;
          if(!cb || !cb.dataset || !cb.dataset.seck) return;
          printToggleSec(cb.dataset.seck, cb.checked);
          _prSyncSecUI();
        });
      }
    }
    /* bảng bật/tắt vùng */
    const sec = document.getElementById('engPrSecList');
    if(sec){
      sec.innerHTML =
        '<div class="eng-pr-sec-bar">'
        + '<button class="eng-pr-sec-b" onclick="ENG.printAllSecs(true)">Chọn tất cả</button>'
        + '<button class="eng-pr-sec-b" onclick="ENG.printAllSecs(false)">Bỏ tất cả</button>'
        + '<span class="eng-pr-sec-cnt" id="engPrSecCnt">'
        + PR_SECS.filter(x=>_prSecOn[x.k]).length + '/' + PR_SECS.length + '</span>'
        + '</div>'
        + PR_SECS.map(s=>
        '<label class="eng-pr-sec"><input type="checkbox" '+(_prSecOn[s.k]?'checked':'')
        + ' onchange="ENG.printToggleSec(\''+s.k+'\',this.checked);ENG.syncSecUI()"><span>'+s.n+'</span></label>').join('');
    }
    PR_SECS.forEach(s=> printToggleSec(s.k, _prSecOn[s.k]));
    _prSyncSecUI();

    _prSwitch(2);
    _prFit();
    const cnt = document.getElementById('engPrintCnt');
    if(cnt) cnt.textContent = picked.length + ' trang A4 — kiểm tra và sửa trước khi in';
  }
  /* v4.78 — TỰ CO TỜ GIẤY cho vừa khung xem trước.
     Không tin vào chiều rộng modal nữa: đo trực tiếp chỗ trống thực tế rồi
     đặt zoom. Trước đây .modal của core.css khoá width:680px nên tờ A4
     190mm luôn bị cắt mất mép phải dù CSS override đã có. */
  let _prFitWired = false;
  function _prFit(){
    const host = document.getElementById('engPrSheets');
    if(!host) return;
    const papers = host.querySelectorAll('.pr-paper');
    if(!papers.length) return;
    const avail = host.clientWidth - 24;            // trừ padding 2 bên
    if(avail <= 0) return;
    const PAPER_PX = 210 * 96 / 25.4;               // 190mm nội dung + 20mm lề = 210mm
    let z = avail / PAPER_PX;
    if(z > 1) z = 1;
    if(z < 0.35) z = 0.35;
    Array.prototype.forEach.call(papers, el=>{ el.style.zoom = z.toFixed(3); });
    if(!_prFitWired){
      _prFitWired = true;
      window.addEventListener('resize', ()=>{ try{ _prFit(); }catch(_){} });
    }
  }

  function printBack(){ _prSwitch(1); _syncPrintCount(); }
  function _prSwitch(step){
    const p1 = document.getElementById('engPrPane1'), p2 = document.getElementById('engPrPane2');
    const bk = document.getElementById('engPrBack'), nx = document.getElementById('engPrNext');
    const go = document.getElementById('engPrintGo');
    if(p1) p1.style.display = step===1 ? '' : 'none';
    if(p2) p2.style.display = step===2 ? '' : 'none';
    if(bk) bk.style.display = step===2 ? '' : 'none';
    if(nx) nx.style.display = step===1 ? '' : 'none';
    if(go) go.style.display = step===2 ? '' : 'none';
    /* .modal của core.css khoá width:680px — bước 2 cần khổ giấy 190mm nên
       phải đổi bằng class (đặt width + max-height), không chỉ maxWidth. */
    const md = document.querySelector('#engPrintModal .modal');
    if(md) md.classList.toggle('pr-wide', step === 2);
  }
  function printToggleSec(key, on){
    _prSecOn[key] = !!on;
    const host = document.getElementById('engPrSheets');
    if(!host) return;
    Array.prototype.forEach.call(host.querySelectorAll('[data-sec="'+key+'"]'),
      el => { el.style.display = on ? '' : 'none'; });
    _prRenum();
  }
  /* Đồng bộ 2 nơi tick: cột trái và checkbox trên tiêu đề mục trong phiếu */
  function _prSyncSecUI(){
    const host = document.getElementById('engPrSheets');
    if(host) Array.prototype.forEach.call(host.querySelectorAll('[data-seck]'), cb=>{
      cb.checked = !!_prSecOn[cb.dataset.seck];
    });
    const side = document.getElementById('engPrSecList');
    if(side) Array.prototype.forEach.call(side.querySelectorAll('input[type=checkbox]'), (cb,i)=>{
      if(PR_SECS[i]) cb.checked = !!_prSecOn[PR_SECS[i].k];
    });
    const n = PR_SECS.filter(s=>_prSecOn[s.k]).length;
    const el = document.getElementById('engPrSecCnt');
    if(el) el.textContent = n + '/' + PR_SECS.length;
  }
  function printAllSecs(on){
    PR_SECS.forEach(s=> printToggleSec(s.k, on));
    _prSyncSecUI();
  }
  /* Đánh lại số mục 1,2,3… theo các mục CÒN được in (bỏ mục 2 thì mục 3
     thành 2) — bản in không nhảy số nên không phát sinh câu hỏi khi audit. */
  function _prRenum(){
    const host = document.getElementById('engPrSheets');
    if(!host) return;
    Array.prototype.forEach.call(host.querySelectorAll('.pr-paper'), paper=>{
      let i = 0;
      Array.prototype.forEach.call(paper.querySelectorAll('[data-sec] .pr-sec-no'), sp=>{
        const blk = sp.closest('[data-sec]');
        if(blk && blk.style.display === 'none') return;
        sp.textContent = (++i) + '.';
      });
    });
  }
  /* Bật/tắt 1 ô dữ liệu: ẩn CẢ nhãn lẫn giá trị khi in */
  function _prToggleCell(td){
    if(!td) return;
    const on = !td.classList.contains('pr-off');
    td.classList.toggle('pr-off', on);
    /* ô nhãn đứng ngay trước ô giá trị */
    const lbl = td.previousElementSibling;
    if(lbl && lbl.classList.contains('pr-l')) lbl.classList.toggle('pr-off', on);
    /* mục 2 (cân bằng vật chất): nhãn nằm ở hàng <th> phía trên, cùng cột */
    if(td.parentNode && td.parentNode.classList.contains('pr-bal-v')){
      const idx = Array.prototype.indexOf.call(td.parentNode.children, td);
      const hdr = td.closest('table').querySelector('.pr-bal-h');
      if(hdr && hdr.children[idx]) hdr.children[idx].classList.toggle('pr-off', on);
    }
  }
  function printResetEdits(){ printReview(); toast('↺ Đã khôi phục dữ liệu gốc của phiếu','ok'); }

  /* ---------------- dựng phiếu ---------------- */
  /* _ed — bọc giá trị để sửa tại chỗ khi đang ở chế độ xem trước.
     .pr-e = ô sửa được · .pr-x = nút xoá trắng (cả hai bị ẩn khi in). */
  function _ed(html){
    if(!_prEdit) return html;
    return '<span class="pr-e" contenteditable="true">'+html+'</span>'
         + '<button class="pr-x" title="Bỏ ô này khỏi bản in (ẩn cả nhãn lẫn số)">✕</button>';
  }

  /* v4.79 — tiêu đề mục kèm checkbox in/không in ngay trên phiếu.
     data-no giữ số gốc để _prRenum() đánh lại 1,2,3… cho các mục CÒN in,
     tránh bản in nhảy số (1,3,5) khiến đoàn kiểm tra thắc mắc. */
  function _secHdr(key, no, vn, en){
    return '<div class="pr-sec">'
      + (_prEdit ? '<label class="pr-sec-ck" title="Bỏ tick = KHÔNG in mục này">'
                 + '<input type="checkbox" checked data-seck="'+key+'"></label>' : '')
      + '<span class="pr-sec-no" data-no="'+no+'">'+no+'.</span> '
      + vn + ' <i>· ' + en + '</i></div>';
  }
  /* v4.78 — bỏ số 0 thừa ở đuôi phần thập phân: 54.6200 → 54.62, 0.0400 →
     0.04, 11.70 → 11.7. Giữ nguyên dấu phân cách nghìn của _fmtNum. */
  function _trimZ(str){
    const t = String(str);
    if(t.indexOf('.') < 0) return t;
    return t.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  }
  function _pv(v, d){                       // giá trị số → chuỗi, rỗng thì '—'
    const s = String(v == null ? '' : v).trim();
    if(s === '') return _ed('<span class="pr-na">—</span>');
    return _ed(d != null ? _trimZ(_fmtNum(v, d)) : _esc(s));
  }
  function _pvp(v){                          // phần trăm
    const s = String(v == null ? '' : v).trim();
    if(s === '') return _ed('<span class="pr-na">—</span>');
    return _ed(_fmtPct(v));
  }
  function _pt(v){                           // chuỗi thuần
    const s = _esc(String(v == null ? '' : v).trim());
    return _ed(s || '<span class="pr-na">—</span>');
  }
  function _prNowStr(){
    const d = new Date(), p = v=>String(v).padStart(2,'0');
    return p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+d.getFullYear()+' '+p(d.getHours())+':'+p(d.getMinutes());
  }
  /* 1 ô dữ liệu: nhãn + giá trị + đơn vị */
  /* Nhãn truyền vào dạng 'Tiếng Việt|English'. LUÔN dựng 2 dòng (dòng EN
     rỗng thì để &nbsp;) để mọi hàng cao bằng nhau — trước đây nhãn dài ngắn
     khác nhau làm mỗi hàng lệch một kiểu, nhìn rất lộn xộn.
     Giá trị và đơn vị tách thành 2 span: .pr-n canh phải, .pr-u là máng
     rộng cố định → tất cả con số thẳng hàng dù đơn vị dài ngắn khác nhau. */
  function _cell(lbl, val, unit){
    const p = String(lbl).split('|');
    return '<td class="pr-l">'
         +   '<span class="pr-l-vn">'+p[0]+'</span>'
         +   '<span class="pr-l-en">'+(p[1] || '&nbsp;')+'</span>'
         + '</td>'
         + '<td class="pr-v">'
         +   '<span class="pr-n">'+val+'</span>'
         +   '<span class="pr-u">'+(unit || '')+'</span>'
         + '</td>';
  }

  function _buildOneSheet(r, pageNo, pageTot){
    const c = []; for(let i=0;i<ROW_W;i++) c.push(r[i] == null ? '' : r[i]);
    const ql = String(c[27]).trim().toLowerCase();
    const qCls = ql==='pass' ? 'pr-pass' : (ql==='fail' ? 'pr-fail' : 'pr-pend');
    const stOn = String(c[C_ST]) === '1';
    const fin  = _fmtTime(c[5]), sta = _fmtTime(c[4]);
    const overnight = (sta && fin && fin < sta);

    return ''
    + '<div class="pr-page">'

    /* ── ĐẦU PHIẾU ── */
    + '<div data-sec="hdr">'
    + '<table class="pr-hdr"><tr>'
      + '<td class="pr-logo">'
        + '<div class="pr-logo-hy">HYOSUNG</div>'
        + '<div class="pr-logo-vc">VINA CHEMICALS</div>'
      + '</td>'
      + '<td class="pr-hdr-mid">'
        + '<div class="pr-co">'+CO_VN+'</div>'
        + '<div class="pr-co-en">'+CO_EN+'</div>'
        + '<div class="pr-dept">'+DEPT+'</div>'
      + '</td>'
      + '<td class="pr-hdr-r">'
        + '<div>Biểu mẫu / <i>Form</i>: <b>LPG-ENG-TKMIX-01</b></div>'
        + '<div>Ngày in / <i>Printed</i>: <b>'+_prNowStr()+'</b></div>'
        + '<div>Người in / <i>By</i>: <b>'+(_esc(_stWho()) || '—')+'</b></div>'
        + '<div>Trang / <i>Page</i>: <b>'+pageNo+' / '+pageTot+'</b></div>'
      + '</td>'
    + '</tr></table>'
    + '</div>'

    + '<div class="pr-title">PHIẾU DỮ LIỆU LÔ PHA TRỘN LPG</div>'
    + '<div class="pr-title-en">LPG TANK MIXING BATCH DATA SHEET</div>'

    /* ── DẢI NHẬN DIỆN LÔ ── */
    + '<div data-sec="band">'
    + '<table class="pr-band"><tr>'
      + '<td><span class="pr-band-l">SỐ LÔ / LOT No.</span><span class="pr-band-v pr-lot">'+_pt(c[1])+'</span></td>'
      + '<td><span class="pr-band-l">BỒN / TANK</span><span class="pr-band-v">'+_pt(c[2])+'</span></td>'
      + '<td><span class="pr-band-l">NGÀY / DATE</span><span class="pr-band-v">'+_ed(_fmtDate(c[3]))+'</span></td>'
      + '<td><span class="pr-band-l">KẾT QUẢ / RESULT</span><span class="pr-band-v '+qCls+'">'+_pt(c[27])+'</span></td>'
    + '</tr></table>'
    + '</div>'

    /* ── 1. ĐIỀU KIỆN PHA TRỘN ── */
    + '<div data-sec="s1">'
    + _secHdr('s1','1','ĐIỀU KIỆN PHA TRỘN','Mixing conditions')
    + '<table class="pr-t">'
      + '<tr>'
        + _cell('Bắt đầu|Start', _ed(sta || '<span class="pr-na">—</span>'), '')
        + _cell('Kết thúc|Finish', _ed((fin || '—') + (overnight?' <span class="pr-nx">(+1 ngày)</span>':'')), '')
        + _cell('Thể tích đầu|Init vol.', _pv(c[10],3), 'm³')
      + '</tr>'
      + '<tr>'
        + _cell('%C3 đầu|Init %C3', _pvp(c[11]), '')
        + _cell('%C4 đầu|Init %C4', _pvp(c[12]), '')
        + _cell('Nhiệt độ|Temp.', _pv(c[31],1), '°C')
      + '</tr>'
      + '<tr>'
        + _cell('Áp suất|Pressure', _pv(c[32],2), 'bar')
        + _cell('Tỷ trọng|Density', _pv(c[33],3), 'kg/l')
        + _cell('Mùi (Odorant)', _pv(c[26],2), 'kg')
      + '</tr>'
      + '<tr>'
        + _cell('%C3 mục tiêu|Target', _pvp(c[29]), '')
        + _cell('Thể tích mục tiêu|Target vol.', _pv(c[30],1), 'm³')
        + _cell('Chuyển kho WMS|Stock transfer',
            _ed((stOn ? '<b class="pr-pass">✔ ĐÃ CHUYỂN</b>' : '<b class="pr-pend">○ CHƯA CHUYỂN</b>')
            + (stOn && c[C_ST_TS] ? ' <span class="pr-sm">'+_stWhen(c[C_ST_TS])
               + (c[C_ST_BY] ? ' · '+_esc(c[C_ST_BY]) : '')+'</span>' : '')), '')
      + '</tr>'
    + '</table>'
    + '</div>'

    /* ── 2. CÂN BẰNG VẬT CHẤT ── */
    + '<div data-sec="s2">'
    + _secHdr('s2','2','CÂN BẰNG VẬT CHẤT','Material balance')
    + '<table class="pr-t pr-bal">'
      + '<tr class="pr-bal-h">'
        + '<th>Propane nạp<br><i>Filled C3</i> (MT)</th>'
        + '<th>Butane nạp<br><i>Filled C4</i> (MT)</th>'
        + '<th>Tổng LPG nạp<br><i>Filled LPG</i> (MT)</th>'
        + '<th>Thể tích cuối<br><i>Final vol.</i> (m³)</th>'
        + '<th>Khối lượng cuối<br><i>Final qty</i> (MT)</th>'
      + '</tr>'
      + '<tr class="pr-bal-v">'
        + '<td class="pr-c3">'+_pv(c[13],3)+'</td>'
        + '<td class="pr-c4">'+_pv(c[14],3)+'</td>'
        + '<td class="pr-lpg">'+_pv(c[15],3)+'</td>'
        + '<td>'+_pv(c[6],3)+'</td>'
        + '<td class="pr-qty">'+_pv(c[7],2)+'</td>'
      + '</tr>'
    + '</table>'
    + '</div>'

    /* ── 3. KẾT QUẢ PHÂN TÍCH GC ── */
    + '<div data-sec="s3">'
    + _secHdr('s3','3','KẾT QUẢ PHÂN TÍCH THÀNH PHẦN (GC)','Gas chromatography')
    + '<table class="pr-t">'
      + '<tr>'
        + _cell('%C3 cuối|Final %C3', _pvp(c[8]), '')
        + _cell('%C4 cuối|Final %C4', _pvp(c[9]), '')
        + _cell('Ethane (C₂H₆)', _pv(c[17],4), '%')
      + '</tr>'
      + '<tr>'
        + _cell('Propane (C₃H₈)', _pv(c[18],4), '%')
        + _cell('iso-Butane (i-C₄)', _pv(c[19],4), '%')
        + _cell('n-Butane (n-C₄)', _pv(c[20],4), '%')
      + '</tr>'
      + '<tr>'
        + _cell('Pentane+ (C₅⁺)', _pv(c[22],4), '%')
        + _cell('Olefin', _pv(c[23],4), '%')
        + _cell('Propylene (C₃H₆)', _pv(c[37],4), '%')
      + '</tr>'
    + '</table>'
    + '</div>'

    /* ── 4. CHỨNG THƯ CHẤT LƯỢNG (COQ) ── */
    + '<div data-sec="s4">'
    + _secHdr('s4','4','CHỈ TIÊU CHỨNG THƯ CHẤT LƯỢNG','Certificate of Quality')
    + '<table class="pr-t">'
      + '<tr>'
        + _cell('Số COQ|COQ No.', _pt(c[34]), '')
        + _cell('Ngày phân tích|Analysis', _pt(c[36]), '')
        + _cell('Áp suất hơi|Vapour press.', _pv(c[38],0), 'kPa')
      + '</tr>'
      + '<tr>'
        + _cell('Lưu huỳnh tổng|Total sulfur', _pv(c[39],2), 'mg/kg')
        + _cell('Nước tự do|Free water', _pt(c[40]), '')
        + _cell('Ăn mòn đồng|Cu corrosion', _pt(c[41]), '')
      + '</tr>'
      + '<tr>'
        + _cell('Cặn|Residue', _pt(c[42]), '')
        + _cell('Khối lượng phân tử|MW', _pv(c[43],2), '')
        + _cell('Pro/Bu %Vol', _pt(c[44]), '')
      + '</tr>'
      + '<tr>'
        + _cell('Pro/Bu %Wt', _pt(c[45]), '')
        + _cell('t-2-Butene', _pv(c[46],4), '%')
        + _cell('1-Butene', _pv(c[47],4), '%')
      + '</tr>'
      + '<tr>'
        + _cell('iso-Butene', _pv(c[48],4), '%')
        + _cell('neo-Pentane', _pv(c[49],4), '%')
        + _cell('iso-Pentane', _pv(c[50],4), '%')
      + '</tr>'
      + '<tr>'
        + _cell('n-Pentane', _pv(c[51],4), '%')
        + _cell('n-Hexane', _pv(c[52],4), '%')
        + '<td class="pr-l"></td><td class="pr-v"></td>'
      + '</tr>'
    + '</table>'
    + '</div>'

    /* ── 5. GHI CHÚ ── */
    + '<div data-sec="s5">'
    + _secHdr('s5','5','GHI CHÚ','Remark')
    + '<table class="pr-t"><tr><td class="pr-rmk">'
      + (_prEdit ? '<span class="pr-e" contenteditable="true">'+(_esc(c[28])||'&nbsp;')+'</span>'
                 : (_esc(c[28]) || '&nbsp;'))
      + '</td></tr></table>'
    + '</div>'

    /* ── XÁC NHẬN / KÝ TÊN ── */
    + '<div class="pr-spacer"></div>'
    + '<div data-sec="cert"><div class="pr-cert">'
      + 'Chúng tôi xác nhận các số liệu trên được trích xuất trung thực từ hệ thống quản lý '
      + 'pha trộn LPG của Nhà máy và phản ánh đúng dữ liệu lô hàng nêu trên.<br>'
      + '<i>We hereby certify that the data above is truthfully extracted from the plant LPG mixing management '
      + 'system and correctly reflects the stated batch.</i></div></div>'
    + '<div data-sec="sig">'
    + '<table class="pr-sig"><tr>'
      + '<td><div class="pr-sig-r">NGƯỜI LẬP</div><div class="pr-sig-en">Prepared by</div>'
        + '<div class="pr-sig-note">(Ký, ghi rõ họ tên)</div><div class="pr-sig-sp"></div><div class="pr-sig-ln"></div></td>'
      + '<td><div class="pr-sig-r">TRƯỞNG CA VẬN HÀNH</div><div class="pr-sig-en">Shift Supervisor</div>'
        + '<div class="pr-sig-note">(Ký, ghi rõ họ tên)</div><div class="pr-sig-sp"></div><div class="pr-sig-ln"></div></td>'
      + '<td><div class="pr-sig-r">QUẢN ĐỐC LPG TERMINAL</div><div class="pr-sig-en">LPG Terminal Manager</div>'
        + '<div class="pr-sig-note">(Ký, đóng dấu, ghi rõ họ tên)</div><div class="pr-sig-sp"></div><div class="pr-sig-ln"></div></td>'
    + '</tr></table>'
    + '</div>'
    + '<div data-sec="foot"><div class="pr-foot">HSVC LPG Station v4 · Tank Log · Lot '+_esc(c[1])+' · '+_esc(c[2])
      + ' · In lúc '+_prNowStr()+' — Tài liệu phục vụ kiểm tra / audit, không dùng cho mục đích thương mại.</div></div>'
    + '</div>';
  }

  /* CSS dùng CHUNG cho bản xem trước trên màn hình và bản in.
     Phần @page / html,body chỉ thêm vào lúc in (xem _prDoc). */
  const _PR_CSS = '\
.pr-page{display:flex;flex-direction:column;min-height:271mm;font-family:"Barlow",Arial,sans-serif;font-size:8.6pt;color:#111;}\
.pr-page *{box-sizing:border-box;}\
.pr-hdr{width:100%;border-collapse:collapse;border:0.8pt solid #123;}\
.pr-hdr td{border:0.5pt solid #567;padding:3pt 6pt;vertical-align:middle;}\
.pr-logo{width:34mm;text-align:center;}\
.pr-logo-hy{font-family:"Arial Black",Arial,sans-serif;font-size:15pt;font-weight:900;letter-spacing:.4pt;color:#000;line-height:1;}\
.pr-logo-vc{font-size:7pt;font-weight:700;letter-spacing:1.1pt;color:#1a3a5c;margin-top:1.5pt;}\
.pr-hdr-mid{text-align:center;}\
.pr-co{font-size:10.5pt;font-weight:800;color:#0b2c4d;letter-spacing:.2pt;}\
.pr-co-en{font-size:7.5pt;color:#456;font-style:italic;margin-top:1pt;}\
.pr-dept{font-size:8pt;font-weight:700;color:#1a3a5c;margin-top:2.5pt;letter-spacing:.6pt;}\
.pr-hdr-r{width:52mm;font-size:7.2pt;line-height:1.55;}\
.pr-hdr-r i{color:#789;font-size:6.6pt;}\
.pr-title{text-align:center;font-size:14pt;font-weight:900;letter-spacing:.4pt;color:#0b2c4d;margin-top:5pt;}\
.pr-title-en{text-align:center;font-size:8pt;font-style:italic;color:#567;letter-spacing:1pt;margin-bottom:5pt;}\
.pr-band{width:100%;border-collapse:collapse;border:0.8pt solid #123;background:#eef4fa;margin-bottom:5pt;}\
.pr-band td{border:0.5pt solid #9ab;padding:4pt 7pt;text-align:center;}\
.pr-band-l{display:block;font-size:6.6pt;font-weight:700;color:#567;letter-spacing:.7pt;}\
.pr-band-v{display:block;font-size:11.5pt;font-weight:800;color:#0b2c4d;margin-top:1.5pt;}\
.pr-band-v.pr-lot{font-family:"Courier New",monospace;letter-spacing:.4pt;}\
.pr-sec{font-size:8.6pt;font-weight:800;color:#0b2c4d;background:#dde7f1;border-left:2.5pt solid #1a5f9e;\
  padding:2.6pt 6pt;margin:5pt 0 0;letter-spacing:.2pt;}\
.pr-sec i{font-weight:400;color:#567;font-size:7.4pt;}\
.pr-t{width:100%;border-collapse:collapse;border:0.6pt solid #567;table-layout:fixed;}\
.pr-t td,.pr-t th{border:0.4pt solid #9ab;padding:3pt 6pt;vertical-align:middle;font-size:8.4pt;}\
.pr-l{background:#f4f7fa;width:20.4%;line-height:1.2;vertical-align:middle;padding:2.5pt 6pt;}\
.pr-l-vn{display:block;font-size:7.6pt;font-weight:600;color:#26445e;}\
.pr-l-en{display:block;font-size:6.3pt;font-style:italic;font-weight:400;color:#93a6b8;}\
.pr-l i{color:#89a;font-weight:400;}\
.pr-v{width:12.93%;text-align:right;vertical-align:middle;padding:2.5pt 4pt 2.5pt 5pt;\
  position:relative;white-space:nowrap;}\
.pr-n{display:inline-block;font-size:9.2pt;font-weight:700;color:#111;font-variant-numeric:tabular-nums;\
  letter-spacing:-.1pt;}\
.pr-u{display:inline-block;width:8.2mm;padding-left:1.5pt;text-align:left;vertical-align:baseline;\
  font-size:6.5pt;font-weight:500;color:#93a6b8;white-space:nowrap;}\
.pr-t tr{height:25pt;}\
.pr-sm{font-size:6.8pt;font-weight:500;color:#567;}\
.pr-na{color:#bbb;font-weight:400;}\
.pr-nx{font-size:6.8pt;color:#7b2d8e;font-weight:600;}\
.pr-pass{color:#157a40;}\
.pr-fail{color:#c0392b;}\
.pr-pend{color:#b8860b;}\
.pr-bal-h th{background:#eef4fa;font-size:7.2pt;font-weight:700;color:#345;text-align:center;line-height:1.35;padding:3.5pt 3pt;}\
.pr-bal-h th i{font-weight:400;color:#89a;}\
.pr-bal-v td{text-align:center;font-size:13pt;font-weight:800;padding:6pt 3pt;font-variant-numeric:tabular-nums;position:relative;}\
.pr-bal-v .pr-c3{color:#1a5f9e;background:#f2f8fd;}\
.pr-bal-v .pr-c4{color:#c26a11;background:#fffaf3;}\
.pr-bal-v .pr-lpg{color:#c0392b;background:#fef5f6;}\
.pr-bal-v .pr-qty{color:#157a40;background:#f3faf5;}\
.pr-rmk{height:11mm;font-size:8.6pt;vertical-align:top;padding:4pt 7pt;line-height:1.5;text-align:left;}\
.pr-spacer{flex:1;min-height:4mm;}\
.pr-cert{font-size:7.4pt;line-height:1.55;color:#345;text-align:justify;border-top:0.5pt dashed #9ab;\
  padding-top:4pt;margin-top:5pt;}\
.pr-cert i{color:#789;}\
.pr-sig{width:100%;border-collapse:collapse;margin-top:5pt;table-layout:fixed;}\
.pr-sig td{text-align:center;vertical-align:top;padding:4pt 4pt 0;}\
.pr-sig-r{font-size:8.4pt;font-weight:800;color:#0b2c4d;letter-spacing:.3pt;}\
.pr-sig-en{font-size:7pt;font-style:italic;color:#789;margin-top:.5pt;}\
.pr-sig-note{font-size:6.6pt;color:#9ab;margin-top:1pt;}\
.pr-sig-sp{height:20mm;}\
.pr-sig-ln{border-top:0.5pt dotted #789;margin:0 6mm;}\
.pr-foot{margin-top:5pt;border-top:0.5pt solid #ccd;padding-top:2.5pt;font-size:6.4pt;color:#9ab;text-align:center;}\
.pr-e{outline:none;}\
.pr-x{display:none;}\
';

  /* CSS chỉ dùng khi XEM TRƯỚC trên màn hình (không đi vào bản in). */
  const _PR_SCREEN_CSS = '\
#engPrSheets .pr-paper{box-sizing:border-box;width:210mm;background:#fff;padding:8mm 10mm;\
  margin:0 auto 14px;box-shadow:0 2px 14px rgba(15,35,60,.16);border-radius:2px;}\
#engPrSheets .pr-e{outline:none;border-radius:3px;padding:0 2px;cursor:text;\
  box-shadow:inset 0 -1px 0 rgba(47,128,237,.35);transition:background .12s;}\
#engPrSheets .pr-e:hover{background:#eaf3fd;}\
#engPrSheets .pr-e:focus{background:#fffbe6;box-shadow:0 0 0 2px #f0c000;}\
#engPrSheets .pr-x{display:inline-block;visibility:hidden;width:14px;height:14px;line-height:12px;\
  margin-left:3px;padding:0;border:none;border-radius:50%;background:#c0392b;color:#fff;\
  font-size:9px;font-weight:700;cursor:pointer;vertical-align:middle;}\
#engPrSheets .pr-e:hover + .pr-x,#engPrSheets .pr-x:hover,\
#engPrSheets td:hover .pr-x,#engPrSheets .pr-band-v:hover .pr-x{visibility:visible;}\
#engPrSheets [data-sec].pr-sec-off{display:none!important;}\
#engPrSheets .pr-sec-ck{float:left;margin:0 6px 0 0;display:inline-flex;align-items:center;}\
#engPrSheets .pr-sec-ck input{width:13px;height:13px;cursor:pointer;accent-color:#1a5f9e;margin:0;}\
#engPrSheets .pr-off{background:#f2f4f6!important;opacity:.42;}\
#engPrSheets .pr-off .pr-e{text-decoration:line-through;box-shadow:none;}\
#engPrSheets .pr-off .pr-l-vn,#engPrSheets .pr-off .pr-l-en{text-decoration:line-through;}\
#engPrSheets .pr-off .pr-x{visibility:visible;background:#7a8a99;}\
';

  function _prDoc(bodyHtml){
    return '<!DOCTYPE html><html><head><meta charset="utf-8">'
      + '<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">'
      + '<style>@page{size:A4 portrait;margin:8mm 10mm;}'
      + '*{margin:0;padding:0;box-sizing:border-box;}'
      + 'html,body{background:#fff;}'
      + '.pr-page{page-break-after:always;}'
      + '.pr-page:last-child{page-break-after:auto;}'
      + _PR_CSS + '</style></head><body>' + bodyHtml + '</body></html>';
  }

  /* IN — lấy đúng những gì đang hiển thị ở bước xem trước (đã sửa / đã ẩn vùng). */
  function doPrint(){
    const host = document.getElementById('engPrSheets');
    if(!host || !host.children.length){ toast('⚠ Chưa có phiếu nào để in','warn'); return; }

    const clone = host.cloneNode(true);
    /* 1 · vùng bỏ tick → XOÁ HẲN khỏi bản in (cả tiêu đề mục) */
    Array.prototype.forEach.call(clone.querySelectorAll('[data-sec]'), el=>{
      const k = el.getAttribute('data-sec');
      if(!_prSecOn[k] && el.parentNode) el.parentNode.removeChild(el);
    });
    /* 2 · ô bỏ tick → làm TRỐNG cả nhãn lẫn số (giữ khung bảng cho thẳng
       hàng, nhưng không để lại tiêu đề trơ trọi không có số liệu) */
    Array.prototype.forEach.call(clone.querySelectorAll('.pr-off'), el=>{
      el.innerHTML = '';
      el.classList.remove('pr-off');
    });
    /* 3 · gỡ toàn bộ chrome chỉnh sửa */
    Array.prototype.forEach.call(clone.querySelectorAll('.pr-x, .pr-sec-ck'), el=>{
      if(el.parentNode) el.parentNode.removeChild(el);
    });
    Array.prototype.forEach.call(clone.querySelectorAll('[contenteditable]'), el=>{
      el.removeAttribute('contenteditable');
    });
    /* .pr-paper chỉ là khung giấy trên màn hình — giữ .pr-page bên trong */
    const pages = Array.prototype.map.call(clone.querySelectorAll('.pr-page'), el => el.outerHTML).join('');
    if(!pages){ toast('⚠ Không có nội dung để in','er'); return; }

    const n = clone.querySelectorAll('.pr-page').length;
    const doc = _prDoc(pages);
    if(typeof _pfPrintViaIframe === 'function'){
      _pfPrintViaIframe(doc, 700);
    } else {
      const w = window.open('', '_blank');
      if(!w){ toast('⚠ Trình duyệt chặn cửa sổ in — hãy cho phép pop-up','er'); return; }
      w.document.write(doc); w.document.close();
      setTimeout(()=>{ try{ w.focus(); w.print(); }catch(_){ } }, 700);
    }
    const off = PR_SECS.filter(s=>!_prSecOn[s.k]).length;
    toast('🖨 Đang in '+n+' phiếu lô'+(off?' · đã ẩn '+off+' vùng dữ liệu':''),'ok');
  }

  return {
    init, render, openPaste, closePaste, doPaste, pasteText,
    /* v4.76 — in phiếu dữ liệu lô (A4) phục vụ kiểm tra / audit */
    openPrint, closePrint, renderPrintList, togglePrintSel,
    printSelectAll, printClearSel, doPrint,
    printReview, printBack, printToggleSec, printResetEdits,
    printAllSecs, syncSecUI: _prSyncSecUI,
    rangeDelete, deleteRow, editRow, openEdit, closeEdit, saveEdit,
    calcSave, calcSaveClick, notifyScale, openGc,
    importCoq, coqChosen,       /* v4.61 — COQ import in the edit modal */
    calcSaveNotify: calcSave,   /* legacy alias (pre-v4.60 callers) */
    _timeMask: _editTimeMask, _dateMask: _editDateMask,
    toggleLotSort, exportXlsx,
    upsertRow, findRowByLotTank,
    /* v4.68 — Stock Transfer (đồng bộ chuyển kho WMS) */
    toggleST, setStockTransfer, pendingTransfers,
    ST_COL: C_ST, ST_TS_COL: C_ST_TS, ST_BY_COL: C_ST_BY,
    loadAll,                          /* v4.62 — fetch full Tank Log on demand */
    get allLoaded(){ return _allLoaded; },
    get ROWS(){ return ROWS; }
  };
})();


/* ============================================================
   MIX TANK CALCULATOR MODULE (MC)
   ────────────────────────────────────────────────────────────
   Builds rows that go into the Tank Log via ENG.upsertRow(...).
   READS from ENG.ROWS in RAM only (no Firebase fetch for display).

   Firebase footprint (Spark-frugal):
     • Calculation state            → RAM only (no FB writes)
     • MIXING state (per tank)      → eng_mix_state/tk1 or tk2 (1 small object)
                                      Written on ▶START, DELETED on
                                      FINISH / revert / draft-save.
                                      Listened to by ALL devices so every
                                      operator sees who is currently mixing.
     • SAVE / SAVE DRAFT / FINISH   → ENG.upsertRow → 1 child write to
                                      eng_tkmix/{rid}
     • Settings (constants)         → localStorage only

   Constants live in MC_D / MC_TV / MC_TANK_R / MC_ODO. Override via
   the ⚙️ Settings modal (persisted in localStorage key
   'lpg_v4_mc_config_v1'). Reset-to-defaults restores hard-coded values.
   ============================================================ */
