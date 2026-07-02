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
     Old 34-col rows load fine (missing cells default ''). */
  const ROW_W = 44;

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
  function _pushRowFb(rid, cells){
    if(!_fbRef) return;
    _suppressEcho++;
    _fbRef.child(rid).set({ cells: cells.slice(0, ROW_W), _ts: Date.now() })
      .catch(e => console.warn('[ENG] fb push row', e))
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

  /* ---------- main render ---------- */
  function render(){
    const tbody  = document.getElementById('engTbody');
    const overlay= document.getElementById('engPasteOverlay');
    const tbl    = document.getElementById('engTbl');
    const stats  = document.getElementById('engStats');
    const badge  = document.getElementById('engBadgeTkmix');
    if(badge) badge.textContent = ROWS.length;
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
    const qLot  = (document.getElementById('engSrchLot')?.value || '').toLowerCase().trim();
    const qTank = (document.getElementById('engSrchTank')?.value || '').trim();
    const qDate = (document.getElementById('engSrchDate')?.value || '').trim();

    /* sort copy of ROWS by lot (newest first by default) */
    const sorted = ROWS.slice().sort((a,b)=>{
      const ka = _lotKey(a[1]), kb = _lotKey(b[1]);
      return _lotSortAsc ? (ka - kb) : (kb - ka);
    });
    const filtered = sorted.filter(r=>{
      if(qLot  && !String(r[1]||'').toLowerCase().includes(qLot)) return false;
      if(qTank && !String(r[2]||'').toUpperCase().includes(qTank)) return false;
      if(qDate && !String(r[3]||'').includes(qDate)) return false;
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
        '</tr>';
    }).join('');

    if(stats){
      stats.innerHTML = '<b>'+filtered.length+'</b> / '+ROWS.length+' rows';
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
    'residue':42,'mw':43,'molecularweight':43
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
        'COQNo','SampTime','AnalysisDate','C3H6','VP','Sulfur','FreeWater','CuCorr','Residue','MW']
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
    _setRowLocal(rid, safe);
    _saveCache();
    _pushRowFb(rid, safe);
    render();
    return rid;
  }

  /* findRowByLotTank(lot, tank) — RAM-only lookup. lot can be "173" or
     "LPG-2026-173"; tank can be "TK-3501" or "3501". Returns the row
     array (with _rid) or null. */
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
    {col:43,label:'Mol. Weight'}
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

    /* string-preserving columns: date/time, lot/tank labels, quality, remark, COQ text cols */
    const strCols = new Set([3,4,5,1,2,27,28,34,35,36,40,41,42]);
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
    closeEdit();
  }

  /* Bridge — Tank Log → Mix Cal: resume Pending lot into inline GC.
     Closes the edit modal first, then snapshots the row and calls
     MC.openGc with a defensive copy so concurrent edits can't shift
     the live row mid-render. */
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

  /* CALC + SAVE + NOTIFY — port of V406 engCalcSaveNotify (v4.24.0).
     Reads modal inputs into the row, validates timing, calls
     MC.calcFromRow to recompute Filled C3/C4/LPG/Qty/%C3/%C4/Odorant,
     stamps Quality='Pass', persists to FB, and pushes mix_notify to
     the Scale Station 4-slot bar via MIXNOTIFY.pushNotify. */
  function calcSaveNotify(){
    if(!_editingRid){ toast('Nothing to recalculate','warn'); return; }
    const r = RID_MAP[_editingRid]; if(!r){ closeEdit(); return; }
    const modal = document.getElementById('engEditModal');
    if(!modal) return;

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
    r[27] = 'Pass';
    if(out.odoBD) r[26] = out.odoBD;

    _saveCache();
    _pushRowFb(_editingRid, r);

    /* 5) notify the Scale Station 4-slot mix bar */
    const tkStr = String(r[2]||'');
    const tkName = tkStr.includes('3501') ? 'TK-3501'
                : (tkStr.includes('3502') ? 'TK-3502' : tkStr);
    const tkKey  = tkStr.includes('3501') ? 'tk1'
                : (tkStr.includes('3502') ? 'tk2' : '');
    const lotStr = String(r[1]||'');
    const fC3Kg  = Math.round(Math.abs(out.fC3) * 1000);
    const fC4Kg  = Math.round(Math.abs(out.fC4) * 1000);
    if((fC3Kg > 0 || fC4Kg > 0) && typeof MIXNOTIFY !== 'undefined' && MIXNOTIFY.pushNotify){
      try{ MIXNOTIFY.pushNotify(tkName, lotStr, fC3Kg, fC4Kg, tkKey); }
      catch(e){ console.warn('[ENG] MIXNOTIFY.pushNotify', e); }
    }

    render();
    toast('✅ Calc+Save+Notify · '+lotStr+' '+tkName+' · C3:'+fC3Kg+' C4:'+fC4Kg+' kg', 'ok');
    closeEdit();
  }

  function toggleLotSort(){
    _lotSortAsc = !_lotSortAsc;
    render();
  }

  /* CSV export — light Excel-compatible, no XLSX lib dependency */
  function exportXlsx(){
    if(!ROWS.length){ toast('Tank Log is empty','er'); return; }
    const headers = ['No','Lot','Tank','Date','Start','Finish','Vol(m³)','Qty(ton)','%C3','%C4',
      'InitVol','I.%C3','I.%C4','FilledC3','FilledC4','FilledLPG','CH4','C2H6','C3H8','i-C4','n-C4','1.3-BD',
      'C5+','Olefin','(24)','(25)','Odorant','Quality','Remark','TargetC3%','TargetVol','Temp','Pres','Density',
      'COQNo','SampTime','AnalysisDate','C3H6','VP','Sulfur','FreeWater','CuCorr','Residue','MW'];
    const csvLines = [headers.join(',')];
    ROWS.forEach(r=>{
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

  /* ---------- Firebase init: legacy-array migration + child listeners ---------- */
  function _attachChildListeners(){
    if(!_fbRef) return;
    _fbRef.on('child_added', snap=>{
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
    _fbRef.on('child_changed', snap=>{
      if(_suppressEcho > 0) return;
      const rid = snap.key;
      const v = snap.val();
      if(!v || !Array.isArray(v.cells)) return;
      _setRowLocal(rid, v.cells);
      _saveCache();
      try{ render(); }catch(_){}
    });
    _fbRef.on('child_removed', snap=>{
      if(_suppressEcho > 0) return;
      const rid = snap.key;
      if(_removeRowLocal(rid)){
        _saveCache();
        try{ render(); }catch(_){}
      }
    });
  }

  function _initialLoadAndAttach(){
    if(!_fbRef) return;
    /* one-shot read for migration detection; child listeners afterwards
       give incremental sync without re-reading the whole tree. */
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
      /* SCALE: refresh active tank's lot from latest tank-log row */
      try{ if(typeof SCALE!=='undefined' && SCALE.refreshLotFromTankLog) SCALE.refreshLotFromTankLog(); }catch(_){}
    }).catch(e=> console.warn('[ENG] initial load fail', e));
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

  return {
    init, render, openPaste, closePaste, doPaste, pasteText,
    rangeDelete, deleteRow, editRow, openEdit, closeEdit, saveEdit,
    calcSaveNotify, openGc,
    _timeMask: _editTimeMask, _dateMask: _editDateMask,
    toggleLotSort, exportXlsx,
    upsertRow, findRowByLotTank,
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
