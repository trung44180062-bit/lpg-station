/* ============================================================
 * TL  —  tl.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 14218–15159   (~942 dòng)
 * Global xuất ra : window.TL
 * Phase tách     : P3
 * Phụ thuộc      : sync, helpers
 * Khởi tạo (boot): TL.init() trong boot
 * ------------------------------------------------------------
 * MÔ TẢ: TL Data (giàn khoan / discharge): ROWS keyed _rid {giDate, ltank, c3Kg, c4Kg, lpgQty, trade, type, dest, doNo, cust, disabled}.
 *
 * API công khai (điền/đối chiếu khi tách):
 *   TL.init(), TL.ROWS, TL.render(), TL.parse(text)
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module TL từ dòng 14218 đến 15159.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.TL).
 *   3) node --check tl.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P3]: dán thân module TL (V4-54 dòng 14218–15159) vào đây. */

const TL = (function(){
  const ROWS = {};
  let table = null;
  let _suppressEcho = 0;
  let _versions = { tl:0 };
  let _pendingDiff = null;
  let dateFilter = '';
  let _delRid = null;
  let FD = null;            /* Firebase DB handle — assigned in attachFirebase() */
  const LS_KEY = 'lpg_v4_tl_v1';

  /* ── v4.34.0 — RAM mutation counter + lookup index ──────────────
     _mut bumps on EVERY ROWS mutation (local writes via _pushBatch →
     saveCache, remote child events via _scheduleRefresh → saveCache).
     getIndex() lazily rebuilds a per-key lookup the first time it is
     read after a mutation (or when the day rolls over), so hot render
     paths (Today-Plan status/actual formatters, station turn counters)
     do O(1) lookups instead of scanning all of ROWS per plan row. */
  let _mut = 0;
  let _idx = null, _idxMut = -1, _idxDay = '';
  function _todayDDMMYY(){
    const d = new Date(), p = n=>String(n).padStart(2,'0');
    return p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+String(d.getFullYear()).slice(-2);
  }
  function getIndex(){
    const day = _todayDDMMYY();
    if(_idx && _idxMut === _mut && _idxDay === day) return _idx;
    /* byKey: key (TL _oid or doNo) → Map(rid → lpgQty number|null).
       Storing rid maps lets a plan row that matches BOTH its _oid and its
       real DO union the two sets without double-counting a row's weight.
       turnByScale: scaleNo → count of today's rows (normalized DD/MM/YY —
       also fixes the latent 4-digit/2-digit year mismatch that made the
       old getTurnFromTLData always return 0). */
    const byKey = new Map();
    const turnByScale = new Map();
    Object.keys(ROWS).forEach(rid=>{
      const r = ROWS[rid];
      if(!r || r.disabled) return;
      const q = parseNum(r.lpgQty);
      const qn = (q === '' ? null : q);
      const add = k => {
        if(!k) return;
        let m = byKey.get(k);
        if(!m){ m = new Map(); byKey.set(k, m); }
        m.set(rid, qn);
      };
      add(String(r._oid||'').trim());
      add(String(r.doNo||'').trim());
      if(parseDate(r.date) === day){
        const s = String(r.scaleNo||'').trim();
        if(s) turnByScale.set(s, (turnByScale.get(s)||0)+1);
      }
    });
    _idx = { byKey, turnByScale };
    _idxMut = _mut; _idxDay = day;
    return _idx;
  }

  /* ── v4.34.0 — debounced refresh for Firebase child-event bursts ──
     The initial child_added replay fires once per row; doing a full
     saveCache + Tabulator rebuild per row made startup O(N²). One timer
     coalesces a burst into a single cache write + rebuild. */
  let _refreshT = null;
  function _scheduleRefresh(){
    if(_refreshT) return;
    _refreshT = setTimeout(()=>{
      _refreshT = null;
      saveCache();
      rebuildTableData();
      refreshBadge();
    }, 120);
  }

  /* ── v4.34.0 — single write helper for ALL local TL pushes ──────
     payload = multi-path object ('raw_data/...': value). The version
     bump rides INSIDE the same update (1 atomic write instead of 2),
     and is only sent when there is actually something to write — no
     more empty bumps broadcasting reloads to every other machine. */
  function _pushBatch(payload){
    if(!payload || !Object.keys(payload).length){ return; }
    _versions.tl++;
    payload['raw_data_version'] = _versions.tl;
    saveCache();
    if(!FD) return;
    _suppressEcho++;
    FD.ref().update(payload).catch(e=>console.warn('[TL] write err:', e));
    setTimeout(()=>{ _suppressEcho = Math.max(0, _suppressEcho-1); }, 600);
  }

  /* ---- Column definitions (same 37 fields as V406 raw_data) ---- */
  const COLS = [
    {k:'date',     h:'Date',           w:82,  ed:true},
    {k:'giDate',   h:'GI Date',        w:74,  ed:true},
    {k:'doNo',     h:'DO No.',         w:95,  ed:true},
    {k:'cust',     h:'Customer',       w:100, ed:true},
    {k:'trade',    h:'Trade',          w:65,  ed:true},
    {k:'type',     h:'LPG Type',       w:65,  ed:true},
    {k:'scaleNo',  h:'Scale',          w:44,  ed:true,  num:true},
    {k:'turn',     h:'Turn',           w:40,  ed:true,  num:true},
    {k:'ltank',    h:'Tank',           w:68,  ed:true},
    {k:'lot',      h:'Lot',            w:40,  ed:true,  num:true},
    {k:'lpgQty',   h:'Net Weight',     w:82,  ed:true,  num:true},
    {k:'truck',    h:'Truck',          w:92,  ed:true},
    {k:'rmooc',    h:'Rmooc',          w:92,  ed:true},
    {k:'driver',   h:'Driver',         w:120, ed:true},
    {k:'c3Kg',     h:'C3 kg',          w:70,  ed:true,  num:true},
    {k:'c4Kg',     h:'C4 kg',          w:70,  ed:true,  num:true},
    {k:'c3Pct',    h:'%C3',            w:48,  ed:false, num:true},
    {k:'c4Pct',    h:'%C4',            w:48,  ed:false, num:true},
    {k:'fq',       h:'FQ',             w:56,  ed:true,  num:true},
    {k:'pct',      h:'Diff%',          w:48,  ed:false, num:true},
    {k:'truckWt',  h:'Truck Wt',       w:70,  ed:true,  num:true},
    {k:'timeIn',   h:'1st Time',       w:52,  ed:true},
    {k:'grossWt',  h:'Gross Wt',       w:70,  ed:true,  num:true},
    {k:'timeOut',  h:'2nd Time',       w:52,  ed:true},
    {k:'pressIn',  h:'Press In',       w:50,  ed:true,  num:true},
    {k:'pressOut', h:'Press Out',      w:52,  ed:true,  num:true},
    {k:'eng',      h:'Engineer',       w:62,  ed:true},
    {k:'dest',     h:'Destination',    w:90,  ed:true},
    {k:'note',     h:'Note',           w:90,  ed:true},
    {k:'error',    h:'Error',          w:80,  ed:true},
    {k:'seal',     h:'Seal No.',       w:70,  ed:true},
    {k:'weigher',  h:'Weigher',        w:90,  ed:true},
    {k:'custFull', h:'Customer WMS',   w:150, ed:true},
    {k:'cw',       h:'Contract Wt',    w:68,  ed:true,  num:true},
    {k:'maxTol',   h:'Max Tol',        w:52,  ed:true,  num:true},
    {k:'price',    h:'Price',          w:72,  ed:true,  num:true}
  ];
  const DATE_FIELDS = new Set(['date','giDate']);
  const NUM_FIELDS  = new Set(COLS.filter(c=>c.num).map(c=>c.k));
  const MERGE_KEY = r => String(r.doNo||'').trim()+'|'+String(r.scaleNo||'').trim()+'|'+String(r.turn||'').trim();

  /* ---- localStorage cache ---- */
  function loadCache(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(!raw) return null;
      const obj = JSON.parse(raw);
      if(!obj || obj.schema!==1) return null;
      return obj;
    }catch(e){ return null; }
  }
  function saveCache(){
    _mut++;   /* every mutation path funnels through saveCache → invalidate getIndex() */
    try{
      localStorage.setItem(LS_KEY, JSON.stringify({ schema:1, savedAt:Date.now(), versions:_versions, data:ROWS }));
    }catch(e){}
  }

  /* ---- helpers ---- */
  function parseNum(v){
    if(v==null) return '';
    const s = String(v).trim();
    if(!s) return '';
    const n = parseFloat(s.replace(/,/g,''));
    if(isNaN(n)) return '';
    return n;
  }
  function fmtNum(v){
    const n = parseNum(v);
    if(n===''||n===0) return '0';
    return n.toLocaleString('en-US',{maximumFractionDigits:3});
  }
  function parseDate(v){
    if(!v) return '';
    const s = String(v).trim();
    /* DD/MM/YYYY, DD/MM/YY, YYYY-MM-DD */
    let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if(m){
      let d=m[1],mo=m[2],y=m[3];
      if(y.length===4 && parseInt(m[1])>12){ /* YYYY-MM-DD */ let t=d;d=y;y=t;let t2=mo;mo=d; /* swap */ }
      if(y.length===2) y='20'+y;
      return String(d).padStart(2,'0')+'/'+String(mo).padStart(2,'0')+'/'+y.slice(-2);
    }
    /* ISO 2026-05-28 */
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(m) return m[3]+'/'+m[2]+'/'+m[1].slice(-2);
    return s;
  }

  /* ---- TSV parser ---- */
  function parseTSV(text){
    const rows = [];
    let row = [], field = '', inQuote = false;
    const s = String(text||'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
    for(let i=0;i<s.length;i++){
      const ch = s[i];
      if(inQuote){
        if(ch === '"'){ if(s[i+1] === '"'){ field += '"'; i++; } else inQuote = false; }
        else field += ch;
      } else {
        if(ch === '"') inQuote = true;
        else if(ch === '\t'){ row.push(field); field = ''; }
        else if(ch === '\n'){ row.push(field); rows.push(row); row = []; field = ''; }
        else field += ch;
      }
    }
    if(field.length || row.length){ row.push(field); rows.push(row); }
    return rows;
  }

  /* ---- Tabulator columns ---- */
  function tabulatorColumns(){
    const cols = [
      { title:'#', field:'_rownum', width:38, frozen:true, headerSort:false,
        formatter:'rownum', hozAlign:'center', cssClass:'tl-rn' },
      { title:'', field:'_act', width:60, frozen:true, headerSort:false,
        cssClass:'tl-act',
        formatter: function(cell){
          const rid = cell.getRow().getData()._rid;
          const id = rid.replace(/'/g,'');
          return ''
            + '<button class="act-btn act-dn"  title="Reprint Delivery Note"    onclick="dnReprintFromTL(\''+id+'\')">🖨</button>'
            + '<button class="act-btn act-del" title="Delete row"               onclick="TL.askDel(\''+id+'\')">✕</button>';
        }
      }
    ];
    COLS.forEach(c=>{
      const def = {
        title: c.h, field: c.k, width: c.w,
        headerSort: true,
        hozAlign: c.num ? 'right' : 'left',
        cssClass: c.num ? 'tl-num' : '',
        /* v4 — column totals shown at the TOP of the grid, aligned under the
           Net Weight / C3 / C4 columns (replaces the old bottom status bar).
           Sums the rows currently in view (respects the date/search filter). */
        topCalc: (c.k==='lpgQty'||c.k==='c3Kg'||c.k==='c4Kg') ? 'sum' : undefined,
        topCalcFormatter: (c.k==='lpgQty'||c.k==='c3Kg'||c.k==='c4Kg')
          ? function(cell){
              const col = c.k==='lpgQty' ? '#2471a3' : c.k==='c3Kg' ? '#1a7f37' : '#b45309';
              return '<span style="color:'+col+'">'+fmtNum(cell.getValue()||0)+'</span>';
            }
          : undefined,
        editor: c.ed ? (c.num ? 'number' : 'input') : false,
        editorParams: c.num ? { verticalNavigation:'table' } : {},
        cellEdited: c.ed ? function(cell){ onCellEdited(cell); } : undefined,
        /* v4.49.11 — Diff% = Net / FQ × 100, shown as a percentage ("98.4%").
           Live render-time so EVERY row shows it; falls back to any stored
           value when net/FQ are absent. */
        formatter: (c.k === 'pct')
          ? function(cell){
              const d = cell.getRow().getData();
              const net = parseNum(d.lpgQty), fq = parseNum(d.fq);
              if(fq > 0 && net > 0) return fmtNum(Math.round(net / fq * 1000) / 10) + '%';
              const v = cell.getValue(); return v!=null && v!=='' ? fmtNum(v) + '%' : '';
            }
          : (c.num ? function(cell){ const v=cell.getValue(); return v!=null&&v!==''?fmtNum(v):''; } : undefined)
      };
      cols.push(def);
    });
    /* v4.49.10 — UI-only: display the Net Weight column between Driver and C3.
       COLS / field keys are untouched, so report + paste mapping stay identical;
       only the on-screen column order changes for readability. */
    const _iNet = cols.findIndex(c => c.field === 'lpgQty');
    if(_iNet > -1){
      const [netCol] = cols.splice(_iNet, 1);
      const _iC3 = cols.findIndex(c => c.field === 'c3Kg');
      if(_iC3 > -1) cols.splice(_iC3, 0, netCol); else cols.push(netCol);
    }
    return cols;
  }

  /* ---- Build Tabulator ---- */
  function buildTable(){
    if(table) return;
    const el = document.getElementById('tlGrid');
    if(!el) return;
    /* v4 — default the date filter to TODAY on first open. The operator can
       pick another day or press ✕ to clear and see every date. Only runs on
       the first build (buildTable is guarded by `if(table) return`), so a
       manual clear stays cleared for the rest of the session. */
    if(!dateFilter){
      const dt=new Date(), p=n=>String(n).padStart(2,'0');
      const today = p(dt.getDate())+'/'+p(dt.getMonth()+1)+'/'+String(dt.getFullYear()).slice(-2);
      dateFilter = today;
      const inp=document.getElementById('tlDateFilter'); if(inp) inp.value = today;
      const clr=document.getElementById('tlDateClear'); if(clr) clr.style.display='inline-block';
    }
    table = new Tabulator(el, {
      data: buildTableData(),
      layout: 'fitDataFill',
      height: '100%',
      columns: tabulatorColumns(),
      placeholder: 'No TL Data — paste from Excel or data will appear when loading completes',
      movableColumns: false,
      initialSort: [{ column:'date', dir:'desc' }],
      rowFormatter: function(row){
        /* v4.40.0 — three row states (V406 parity):
           • no GI date    → neutral grey (pending), overrides tank
           • GI + TK-3501  → blue
           • GI + TK-3502  → orange
           'disabled' concept removed. */
        const d = row.getData();
        const el = row.getElement();
        el.classList.remove('tl-tk-3501','tl-tk-3502','tl-no-gi');
        el.style.opacity = '';
        const hasGi = d.giDate && String(d.giDate).trim() !== '';
        if(!hasGi){
          el.classList.add('tl-no-gi');
        } else {
          const tk = String(d.ltank||'').toUpperCase();
          if(tk.includes('3501')) el.classList.add('tl-tk-3501');
          else if(tk.includes('3502')) el.classList.add('tl-tk-3502');
        }
      }
    });
    updateStatus();
  }

  /* ---- v4.66 — quick-filter helpers (Tank / Trade / Product Type) ---- */
  function _selVal(id){ const e=document.getElementById(id); return e ? String(e.value||'').trim() : ''; }

  /* Product-type match: normalize the row's free-text type through
     _pfDeriveType (handles "30:70", "C3:30/C4:70", "LPG (C3:30/C4:70)",
     pure grades, place-name quirks…) then compare against the selected
     ratio "a:b" or pure grade. Rows with no ratio derive to 50:50 —
     same fallback the PTT/DN printers use. */
  function _typeMatches(rowType, sel){
    if(!sel) return true;
    const norm = (typeof _pfDeriveType==='function') ? _pfDeriveType(rowType||'') : String(rowType||'');
    if(sel==='Pure Propane') return /pure\s*propane/i.test(norm);
    if(sel==='Pure Butane')  return /pure\s*butane/i.test(norm);
    const m = sel.match(/^(\d{1,2}):(\d{1,2})$/);
    if(!m) return norm.toLowerCase().includes(sel.toLowerCase());
    const rm = norm.match(/C3:(\d{1,3})\/C4:(\d{1,3})/i);
    if(!rm) return false;
    return parseInt(rm[1],10)===parseInt(m[1],10) && parseInt(rm[2],10)===parseInt(m[2],10);
  }

  /* Repopulate the Trade dropdown from the distinct trade values actually
     present in ROWS (keeps whatever the operator had selected). */
  let _tradeOptsKey = '';
  function _fillTradeOptions(){
    const sel = document.getElementById('tlTradeFilter');
    if(!sel) return;
    const set = new Set();
    Object.values(ROWS).forEach(r=>{ if(r){ const t=String(r.trade||'').trim(); if(t) set.add(t); } });
    const opts = Array.from(set).sort();
    const key = opts.join('|');
    if(key === _tradeOptsKey) return;           /* no change → don't rebuild */
    _tradeOptsKey = key;
    const cur = sel.value;
    sel.innerHTML = '<option value="">All trades</option>' +
      opts.map(t=>'<option value="'+t.replace(/"/g,'&quot;')+'">'+t+'</option>').join('');
    if(opts.includes(cur)) sel.value = cur; else sel.value = '';
  }

  /* ---- Build data array from ROWS ---- */
  function buildTableData(){
    const search = (document.getElementById('tlSearch')||{}).value||'';
    const sLow = search.toLowerCase();
    /* v4.66 — quick filters */
    _fillTradeOptions();
    const fTank  = _selVal('tlTankFilter');
    const fTrade = _selVal('tlTradeFilter');
    const fType  = _selVal('tlTypeFilter');
    const arr = [];
    Object.keys(ROWS).forEach(rid=>{
      const r = ROWS[rid];
      if(!r) return;
      /* date filter */
      if(dateFilter){
        const rd = parseDate(r.date);
        if(rd !== dateFilter) return;
      }
      /* v4.66 — tank / trade / product-type filters */
      if(fTank  && !String(r.ltank||'').toUpperCase().includes(fTank)) return;
      if(fTrade && String(r.trade||'').trim().toLowerCase() !== fTrade.toLowerCase()) return;
      if(fType  && !_typeMatches(r.type, fType)) return;
      /* search filter */
      if(sLow){
        const hay = [r.doNo, r.cust, r.truck, r.rmooc, r.driver, r.custFull, r.date, r.ltank, r.eng, r.dest].join(' ').toLowerCase();
        if(!hay.includes(sLow)) return;
      }
      arr.push(Object.assign({_rid:rid}, r));
    });
    return arr;
  }

  function rebuildTableData(){
    /* The TL Tabulator only exists while the TL tab has been opened, but the
       dependent refreshes below must run on EVERY TL change (incl. a delete
       received from another machine) — otherwise Today Plan stayed stale until
       an F5. So the table redraw is guarded, the dependents are not. */
    if(table){
      table.replaceData(buildTableData());
      updateStatus();
    }
    /* v4.22.4 — TL data changed: REMAINING stock depends on per-day TL net
       weights via INV.giFromTL, so refresh the stock card + scale row-1.
       RAM-only. SCALE.refreshRow1 also re-runs the PLAN MT calc, which is
       cheap and idempotent. */
    try{ if(typeof INV !== 'undefined' && INV.renderRow1) INV.renderRow1(); }catch(_){}
    try{ if(typeof SCALE !== 'undefined' && SCALE.refreshRow1) SCALE.refreshRow1(); }catch(_){}
    /* v4.x FIX — Today/Tomorrow Plan STATUS + ACTUAL columns are derived from
       TL rows (via TL.getIndex()). A TL delete/edit/paste invalidated that
       index but never told the plan tables to re-render, so they showed stale
       status/actual until the operator pressed F5. refreshStatus() is the
       RAM-only re-render hook the SCALE module already uses (no Firebase
       reads/writes, no loop back into TL). */
    try{ if(typeof TP  !== 'undefined' && TP.refreshStatus)  TP.refreshStatus();  }catch(_){}
    try{ if(typeof TMR !== 'undefined' && TMR.refreshStatus) TMR.refreshStatus(); }catch(_){}
  }

  function updateStatus(){
    const all = Object.keys(ROWS).length;
    const shown = table ? table.getDataCount() : 0;
    /* Net Weight / C3 / C4 totals now live in the top calc row (see
       tabulatorColumns → topCalc), so they recompute automatically with the
       filter. Here we keep the shown/total counters, tab badge, and the
       per-field "has data" counts (rows with a Date / with a GI Date). */
    let nDate=0, nGi=0;
    Object.values(ROWS).forEach(r=>{
      if(!r) return;
      if(String(r.date||'').trim())   nDate++;
      if(String(r.giDate||'').trim()) nGi++;
    });
    const el = (id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=v; };
    el('tlCntDate', nDate);
    el('tlCntGi',   nGi);
    el('tlCntShown', shown);
    el('tlCntTotal', all);
    el('tlBadgeCount', all);
  }

  /* ---- Cell edited → per-field delta write ---- */
  function onCellEdited(cell){
    const rid = cell.getRow().getData()._rid;
    if(!rid || !ROWS[rid]) return;
    const field = cell.getField();
    let val = cell.getValue();
    /* normalize dates */
    if(DATE_FIELDS.has(field)) val = parseDate(val);
    /* normalize numbers */
    if(NUM_FIELDS.has(field) && val!=null && val!=='') val = parseNum(val);
    /* v4.56 — DO No. typed/pasted from WMS carries leading zeros
       ("0086687802"). Strip them (cleanDO keeps temp DOs unchanged) and
       reflect the cleaned value in the grid. row.update does NOT re-fire
       cellEdited, so no recursion. */
    if(field === 'doNo' && typeof cleanDO === 'function'){
      const _c = cleanDO(val);
      if(_c !== val){ val = _c; try{ cell.getRow().update({ doNo: _c }); }catch(_){} }
    }

    const oldVal = ROWS[rid][field];
    if(oldVal === val) return; /* no change */
    ROWS[rid][field] = val;

    /* v4.56 — staff replaced a TEMP DO with the official DO by hand: if Today
       Plan still holds a temp order with that DO for the same day (row's Date
       column), upgrade the plan order too — keeps the auto status chain and
       Actual Loading matched on the real DO. promoteTpTempDo also renames any
       other TL rows still carrying the temp DO. */
    if(field === 'doNo'){
      const oldS = String(oldVal||'').trim();
      const toks = String(val||'').split(/[\s\/,]+/).filter(Boolean);
      const realDo = toks.find(t => /^\d{6,}$/.test(t) && !(typeof isTempOid==='function' && isTempOid(t)));
      const rowDate = ROWS[rid].date;
      if(oldS && realDo && typeof isTempOid==='function' && isTempOid(oldS)){
        /* deferred: promotePair triggers TL rebuildTableData / plan writes —
           keep that OUT of the Tabulator cellEdited cycle. */
        setTimeout(()=>{
          try{
            if(typeof promoteTpTempDo === 'function' && promoteTpTempDo(oldS, realDo, rowDate)){
              if(typeof toast==='function') toast('Today Plan: '+oldS+' → '+realDo,'ok');
            }
          }catch(_){}
        }, 0);
      }
    }

    /* v4.49.9 — recompute derived weights when TW / GW / FQ / Net Weight change.
         • Net Weight (lpgQty) = Gross Wt − Truck Wt  (only when BOTH are present;
           a missing side leaves the existing Net untouched).
         • Diff% (pct)        = Net / FQ × 100  (scale-vs-meter yield %, shown
           with a "%" sign by the column formatter). */
    const _extra = {};
    if(field === 'truckWt' || field === 'grossWt'){
      const tw = parseNum(ROWS[rid].truckWt), gw = parseNum(ROWS[rid].grossWt);
      if(tw > 0 && gw > 0){
        const net = Math.round(gw - tw);
        if(ROWS[rid].lpgQty !== net){ ROWS[rid].lpgQty = net; _extra.lpgQty = net; }
      }
    }
    if(['truckWt','grossWt','lpgQty','fq'].includes(field) || _extra.lpgQty != null){
      const net = parseNum(ROWS[rid].lpgQty), fq = parseNum(ROWS[rid].fq);
      if(fq > 0 && net > 0){
        const pct = Math.round(net / fq * 1000) / 10;  /* Net/FQ × 100, 1-dp */
        if(String(ROWS[rid].pct) !== String(pct)){ ROWS[rid].pct = pct; _extra.pct = pct; }
      }
    }
    if(Object.keys(_extra).length){ try{ cell.getRow().update(_extra); }catch(_){} }

    /* v4.31.12 — keep the row's TANK COLOUR in sync the moment the Tank cell
       is edited (the rowFormatter re-runs on reformat), and re-colour when the
       GI Date changes (no-GI fill toggles). Also, when the TANK of a row dated
       TODAY changes, auto-pull that tank's current lot from the Scale tank card
       so the lot follows the tank instead of being left stale. */
    let _lotAuto = false, _newLot = null;
    if(field === 'ltank'){
      try{ cell.getRow().reformat(); }catch(_){}
      const _t=new Date(), _p=n=>String(n).padStart(2,'0');
      const todayStr=_p(_t.getDate())+'/'+_p(_t.getMonth()+1)+'/'+String(_t.getFullYear()).slice(-2);
      if(String(ROWS[rid].date||'').trim() === todayStr){
        const tkStr=String(val||'');
        const cfg=(typeof SCALE!=='undefined' && SCALE.getTkCfg)?SCALE.getTkCfg():null;
        let full='';
        if(cfg){
          if(tkStr.includes('3501'))      full=(cfg.tk1&&cfg.tk1.lot)||'';
          else if(tkStr.includes('3502')) full=(cfg.tk2&&cfg.tk2.lot)||'';
        }
        if(full){
          const shortL=String(full).replace(/^LPG-\d{4}-/i,'');
          _newLot=/^\d+$/.test(shortL)?parseNum(shortL):shortL;
          if(ROWS[rid].lot!==_newLot){
            ROWS[rid].lot=_newLot; _lotAuto=true;
            try{ cell.getRow().update({lot:_newLot}); }catch(_){}
          }
        }
      }
    } else if(field === 'giDate'){
      try{ cell.getRow().reformat(); }catch(_){}
    }

    /* per-field delta push — field(s) + _ts + version in ONE atomic write */
    const payload = {};
    payload['raw_data/'+rid+'/'+field] = val;
    if(_lotAuto) payload['raw_data/'+rid+'/lot'] = _newLot;
    Object.keys(_extra).forEach(k=>{ payload['raw_data/'+rid+'/'+k] = _extra[k]; });
    payload['raw_data/'+rid+'/_ts'] = Date.now();
    ROWS[rid]._ts = Date.now();
    _pushBatch(payload);
    updateStatus();
  }

  /* ---- Firebase ---- */
  function attachFirebase(){
    if(typeof firebase === 'undefined') return;   /* SDK not present (offline build) */
    FD = firebase.database();                      /* ← the handle the whole module relies on */
    /* ── v4.34.0 — delta sync (same pattern as Plan / WMS GI) ──────────
       Previously every raw_data_version change made every OTHER machine
       re-download the ENTIRE raw_data node (once('value')). With TL Data
       growing daily, each weigh event broadcast a multi-hundred-KB full
       reload to every client — the single largest Spark-bandwidth cost in
       the app. Now: child_added/changed/removed deliver only the changed
       row(s); the one full read left is the reconcile at attach (needed to
       prune ghost rows deleted elsewhere while this machine was offline).

       Version listener kept for two reasons:
       1. Counter-RESET fallback (v4.33.2 case): if the server counter goes
          BACKWARD (node wiped/reset by hand), do one full reconcile.
       2. Mixed-version fleets: older builds still rely on the counter, so
          we keep adopting/bumping it. Forward bumps need NO reload here —
          the data already arrived via the child listeners. */
    FD.ref('raw_data_version').on('value', snap=>{
      const sv = snap.val()||0;
      if(sv < _versions.tl){
        _versions.tl = sv;
        _reconcileFull();            /* counter reset — rare, full re-sync */
      } else if(sv > _versions.tl){
        _versions.tl = sv;           /* adopt; rows arrive via child events */
      }
    });
    const ref = FD.ref('raw_data');
    /* One-shot reconcile at attach — prunes stale local rows (see comment
       inside _reconcileFull). Runs in parallel with the child_added replay;
       both are idempotent assignments so there is no race. The SDK merges
       the overlapping listens on the same path, so the node is not
       downloaded twice. */
    _reconcileFull();
    ref.on('child_added', snap=>{
      if(_suppressEcho) return;
      const rid = snap.key, row = snap.val();
      if(!row || typeof row !== 'object') return;
      row._rid = rid;
      ROWS[rid] = row;
      setSyncStatus(true);
      _scheduleRefresh();
    });
    ref.on('child_changed', snap=>{
      if(_suppressEcho) return;
      const rid = snap.key, row = snap.val();
      if(!row || typeof row !== 'object') return;
      row._rid = rid;
      ROWS[rid] = row;
      _scheduleRefresh();
    });
    ref.on('child_removed', snap=>{
      if(_suppressEcho) return;
      delete ROWS[snap.key];
      _scheduleRefresh();
    });
  }
  /* Full authoritative re-sync: merge remote rows in (Firebase wins), then
     PRUNE every local row not present remotely. A row that exists only
     locally on (re)load is a ghost — it was deleted on another machine while
     this one was offline, and no child_removed replay can recreate that
     deletion. We never write local-only rows back to Firebase here: that
     re-uploaded intentionally-deleted data (the stale-cache-overwrites-
     Firebase bug). Throttled so attach + version listener can't double-read. */
  let _lastReloadTs = 0;
  function _reconcileFull(){
    if(!FD) return;
    const now = Date.now();
    if(now - _lastReloadTs < 800) return;
    _lastReloadTs = now;
    FD.ref('raw_data').once('value', snap=>{
      const data = snap.val() || {};
      Object.keys(data).forEach(k=>{
        if(data[k] && typeof data[k]==='object'){
          data[k]._rid = k;
          ROWS[k] = data[k];
        }
      });
      const localOnly = Object.keys(ROWS).filter(k=>!Object.prototype.hasOwnProperty.call(data,k));
      if(localOnly.length){
        console.warn('[TL] Reconcile: pruning '+localOnly.length+' stale local row(s):', localOnly);
        localOnly.forEach(k=>{ delete ROWS[k]; });
      }
      saveCache();
      setSyncStatus(true);
      rebuildTableData();
      refreshBadge();
    });
  }
  function setSyncStatus(ok){
    const dot = document.getElementById('tlSyncDot');
    if(dot){
      dot.classList.toggle('off', !ok);
      dot.title = ok ? 'Firebase synced' : 'Offline';
    }
  }

  /* ---- Paste ---- */
  function openPaste(){
    document.getElementById('tlPasteArea').value = '';
    document.getElementById('tlPasteInfo').textContent = '';
    document.getElementById('tlPasteModal').classList.add('on');
    setTimeout(()=>document.getElementById('tlPasteArea').focus(), 100);
  }
  function closePaste(){
    document.getElementById('tlPasteModal').classList.remove('on');
  }

  /* Column order for paste — matches V406 COLS original order */
  const PASTE_COLS = [
    'date','giDate','doNo','cust','trade','type','scaleNo','turn','ltank','lot',
    'c3Pct','c4Pct','lpgQty','c3Kg','c4Kg','fq','pct',
    'truckWt','timeIn','grossWt','timeOut','pressIn','pressOut',
    'eng','dest','note','error','seal','weigher','custFull',
    'truck','rmooc','driver','cw','maxTol','price'
  ];

  function doPaste(){
    /* v4.56 — extra confirm: TL Data is usually a first-time load only */
    if(window.PASTEGUARD && !PASTEGUARD.confirmFirst('TL Data','tl',doPaste)) return;
    const text = (document.getElementById('tlPasteArea')||{}).value||'';
    const raw = parseTSV(text).filter(r=>r.some(c=>c.trim()));
    if(!raw.length){ document.getElementById('tlPasteInfo').textContent='⚠ No data found'; return; }
    /* skip header row if first cell is non-numeric and looks like a label */
    let startIdx = 0;
    const first = raw[0][0]||'';
    if(first && isNaN(parseInt(first.replace(/\//g,''))) && first.length>3) startIdx = 1;

    const added=[]; const updated=[]; const unchanged=[]; const rejected=[];
    /* v4.x — ANTI-MISPLACED-PASTE guard. The TL paste maps columns purely by
       POSITION, so dropping a foreign sheet (SAP ZMMFR022 / WMS GI) into this
       box used to create garbage rows (the "phantom rows 1–3": date="L0",
       doNo="20260622"=a YYYYMMDD date, giDate=a SAP doc no). A real TL row
       ALWAYS has a valid export date in the date column and a DO or plate, so
       we validate each row and skip the ones that don't look like TL data. */
    const _validDate = s => /^\d{2}\/\d{2}\/\d{2}$/.test(String(s||''));   /* parseDate output */
    const _looksYMD  = s => /^20\d{6}$/.test(String(s||'').replace(/[^\d]/g,''));  /* YYYYMMDD */
    const _doLike    = s => /^(\d{5,}|[A-Za-z]{2,4}\d{4,}|TMP)/i.test(String(s||'').trim());
    const _plateLike = s => /\d{2}\s*[A-Za-z]/.test(String(s||''));        /* 51D-05867, 29K-13833 */
    /* v4.34.0 — ONE multi-path payload for the whole paste (incl. the
       version bump via _pushBatch) instead of one write per row + a
       separate version set. Nothing changed → nothing written. */
    const batchPayload = {};
    for(let i=startIdx;i<raw.length;i++){
      const r = raw[i];
      const obj = {};
      PASTE_COLS.forEach((k,idx)=>{
        let v = (r[idx]||'').trim();
        if(DATE_FIELDS.has(k)) v = parseDate(v);
        else if(NUM_FIELDS.has(k) && v!=='') v = parseNum(v);
        if(v !== '' && v !== null) obj[k] = v;
      });
      /* v4.56 — strip WMS leading zeros from a pasted DO ("0086687802" →
         "86687802"); temp DOs / non-DO text pass through cleanDO unchanged. */
      if(obj.doNo != null && typeof cleanDO === 'function') obj.doNo = cleanDO(String(obj.doNo));
      if(!obj.doNo && !obj.truck) continue; /* skip empty rows */

      /* anti-misplaced-paste: reject anything that doesn't look like a TL row */
      const _badDate  = obj.date != null && obj.date !== '' && !_validDate(obj.date);
      /* only an ALL-DIGIT doNo can be mistaken for a YYYYMMDD date; alnum DOs
         like KNH26062301 carry a letter prefix that disambiguates them. */
      const _doIsDate = obj.doNo != null && /^\d+$/.test(String(obj.doNo).trim()) && _looksYMD(obj.doNo);
      const _noKey    = !_doLike(obj.doNo) && !_plateLike(obj.truck);
      if(_badDate || _doIsDate || _noKey){
        rejected.push({
          id: obj.doNo || obj.truck || '?',
          why: _badDate ? ('ngày "'+obj.date+'" không hợp lệ')
             : _doIsDate ? ('DO "'+obj.doNo+'" là ngày, không phải số DO')
             : 'thiếu số DO / biển số hợp lệ'
        });
        continue;
      }
      obj._ts = Date.now()+i;

      /* merge key */
      const mk = MERGE_KEY(obj);
      let existRid = null;
      Object.keys(ROWS).forEach(rid=>{
        if(MERGE_KEY(ROWS[rid]) === mk) existRid = rid;
      });

      if(existRid){
        /* compare fields, only push changed */
        let changed = 0;
        PASTE_COLS.forEach(k=>{
          if(obj[k] !== undefined && String(obj[k]||'') !== String(ROWS[existRid][k]||'')){
            batchPayload['raw_data/'+existRid+'/'+k] = obj[k];
            ROWS[existRid][k] = obj[k];
            changed++;
          }
        });
        if(changed){
          batchPayload['raw_data/'+existRid+'/_ts'] = Date.now();
          ROWS[existRid]._ts = Date.now();
          updated.push(obj.doNo||'?');
        } else { unchanged.push(obj.doNo||'?'); }
      } else {
        /* new row */
        const rid = _genRid();
        ROWS[rid] = obj;
        batchPayload['raw_data/'+rid] = obj;
        added.push(obj.doNo||'?');
      }
    }
    _pushBatch(batchPayload);   /* no-op when payload is empty (all unchanged) */
    closePaste();
    rebuildTableData();

    /* show diff summary */
    const body = document.getElementById('tlDiffBody');
    const parts = [];
    /* v4.x — if NOTHING valid came through but rows were rejected, the operator
       almost certainly pasted the wrong sheet (SAP/WMS) into TL Data. */
    if(!added.length && !updated.length && !unchanged.length && rejected.length){
      parts.push('<b style="color:#c1121f">⚠ Không có dòng hợp lệ — có thể bạn đã dán nhầm bảng '
        + '(SAP / WMS GI) vào TL Data. Không có dữ liệu nào được lưu.</b>');
    }
    if(added.length)     parts.push('<b style="color:#1a7f37">✅ Added '+added.length+' rows</b>');
    if(updated.length)   parts.push('<b style="color:#0077b6">🔄 Updated '+updated.length+' rows</b>');
    if(unchanged.length) parts.push('<span style="color:var(--ink-3)">⏭ Unchanged '+unchanged.length+' rows</span>');
    if(rejected.length){
      const _e = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const sample = rejected.slice(0,5).map(x=>'• '+_e(x.id)+' — '+_e(x.why)).join('<br>');
      parts.push('<b style="color:#c1121f">⛔ Bỏ qua '+rejected.length+' dòng sai định dạng</b>'
        + '<div style="font-size:11px;color:#7a1f1f;margin-top:4px;line-height:1.5">'+sample
        + (rejected.length>5 ? '<br>…và '+(rejected.length-5)+' dòng nữa' : '')+'</div>');
    }
    if(!parts.length)    parts.push('No valid rows found');
    body.innerHTML = parts.join('<br>');
    document.getElementById('tlDiffModal').classList.add('on');
  }

  function _genRid(){
    const ts = Date.now().toString(36);
    const rn = Math.random().toString(36).slice(2,8);
    return ts + rn;
  }

  /* ---- Delete ---- */
  function askDel(rid){
    _delRid = rid;
    const r = ROWS[rid];
    if(!r){ return; }
    document.getElementById('tlDelInfo').innerHTML =
      'DO: <b>'+String(r.doNo||'—')+'</b> · Customer: '+String(r.cust||'—')+' · Date: '+String(r.date||'—');
    document.getElementById('tlDelConfirm').value = '';
    document.getElementById('tlDelModal').classList.add('on');
    setTimeout(()=>document.getElementById('tlDelConfirm').focus(), 100);
  }
  function doDelete(){
    const inp = document.getElementById('tlDelConfirm');
    if(!inp || inp.value.trim().toLowerCase() !== 'delete'){
      alert('Type "Delete" to confirm'); return;
    }
    if(!_delRid || !ROWS[_delRid]) return;
    delete ROWS[_delRid];
    _pushBatch({ ['raw_data/'+_delRid]: null });   /* row null + version, one write */
    document.getElementById('tlDelModal').classList.remove('on');
    _delRid = null;
    rebuildTableData();
  }

  /* ---- Range-date delete (per-rid child delete; exports CSV backup first) ----
     Reads ONLY RAM. Deletes the matched rids as a SINGLE multi-path update
     (raw_data/{rid}=null for each + one raw_data_version bump) = one Firebase
     write regardless of row count. Other machines prune via their
     child_removed listeners (v4.34.0) — no full reload. */
  function rangeDelete(){
    if(!Object.keys(ROWS).length){ toast('Already empty','er'); return; }
    BULKOPS.openRangeDelete({
      title:'DELETE DATA — TL Data',
      fileBase:'tl_data',
      getRows: ()=> Object.values(ROWS),
      getRid:  r=> r._rid || Object.keys(ROWS).find(k=>ROWS[k]===r) || null,
      /* v4.33.1 — MUST use the GLOBAL parseDate (returns a Date). TL has a
         local parseDate(v) that returns a normalized "DD/MM/YY" STRING (used
         at paste time); it shadowed the global here, so BULKOPS crashed on
         d.getTime() and the modal never opened. */
      getDate: r=> (typeof window.parseDate==='function' ? window.parseDate(r.date) : null),
      columns: COLS.map(c=>({title:c.h, field:c.k})),
      deleteRids: (rids)=>{
        rids.forEach(rid=>{ delete ROWS[rid]; });
        const upd = {};
        rids.forEach(rid=>{ upd['raw_data/'+rid] = null; });
        _pushBatch(upd);   /* all nulls + version bump in ONE write, echo-suppressed */
        try{ logAudit('scale:raw_data:range_delete','_bulk_','_rangeDelete', rids.length+' rows','','delete'); }catch(_){}
        rebuildTableData();
      }
    });
  }

  /* ---- Export CSV ---- */
  function exportCsv(){
    const rows = Object.values(ROWS).filter(r=>r&&!r.disabled);
    if(!rows.length){ alert('No data to export'); return; }
    const hdr = COLS.map(c=>c.h).join(',');
    const body = rows.map(r=> COLS.map(c=>{
      const v = r[c.k];
      return '"'+String(v!=null?v:'').replace(/"/g,'""')+'"';
    }).join(',')).join('\n');
    const csv = '\uFEFF'+hdr+'\n'+body;
    const blob = new Blob([csv],{type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'TL_Data_'+new Date().toISOString().slice(0,10)+'.csv';
    a.click(); URL.revokeObjectURL(url);
  }

  /* ---- Date filter ---- */
  function openPicker(){
    document.getElementById('tlDatePick').showPicker?.();
    document.getElementById('tlDatePick').click();
  }
  function pickerChange(){
    const v = document.getElementById('tlDatePick').value;
    if(!v) return;
    const [y,m,d] = v.split('-');
    const dd = d+'/'+m+'/'+y.slice(-2);
    document.getElementById('tlDateFilter').value = dd;
    applyTextFilter();
  }
  function applyTextFilter(){
    const v = (document.getElementById('tlDateFilter')||{}).value||'';
    dateFilter = v ? parseDate(v) : '';
    const clr = document.getElementById('tlDateClear');
    if(clr) clr.style.display = dateFilter ? 'inline-block' : 'none';
    rebuildTableData();
  }
  function clearDate(){
    dateFilter = '';
    document.getElementById('tlDateFilter').value = '';
    document.getElementById('tlDateClear').style.display = 'none';
    rebuildTableData();
  }

  function refreshBadge(){
    const cnt = Object.keys(ROWS).length;
    const el = document.getElementById('tlBadgeCount');
    if(el) el.textContent = cnt;
  }

  /* ---- Public API ---- */
  return {
    init: function(){
      const cached = loadCache();
      if(cached){
        Object.assign(ROWS, cached.data || {});
        Object.keys(ROWS).forEach(k=>{ if(ROWS[k]&&typeof ROWS[k]==='object') ROWS[k]._rid=k; });
        _versions = cached.versions || _versions;
      }
      refreshBadge();
      attachFirebase();
    },
    buildTable, rebuildTableData,
    openPaste, closePaste, doPaste,
    askDel, doDelete, rangeDelete, exportCsv,
    openPicker, pickerChange, applyTextFilter, clearDate,
    refreshBadge,
    /* v4.56 — manual "Match DO" button: take every TL row whose Date equals
       the current date filter, search WMS GI for the same date and match
       (same logic as the automatic post-paste run). Fallback for when a WMS
       paste error meant the automatic match never ran. Results are shown in
       the usual confirm table — nothing is written without operator approval. */
    matchWmsDo: function(){
      if(!dateFilter){
        if(typeof toast==='function') toast('Pick a Date filter first — match runs on that day only','er');
        return;
      }
      if(typeof WG === 'undefined' || !WG.matchTlForDate){
        if(typeof toast==='function') toast('WMS GI module not ready','er');
        return;
      }
      WG.matchTlForDate(dateFilter);
    },
    /* Stamp the current date into this row's GI Date column.
       Persisted via the normal per-field delta write (raw_data/{rid}/giDate). */
    setGiNow: function(rid){
      const r = ROWS[rid];
      if(!r){ if(typeof toast==='function') toast('Row not found','er'); return; }
      const dt = new Date(), p = n=>String(n).padStart(2,'0');
      const today = p(dt.getDate())+'/'+p(dt.getMonth()+1)+'/'+String(dt.getFullYear()).slice(-2);
      if(String(r.giDate||'') === today){ if(typeof toast==='function') toast('GI Date already today','' ); return; }
      r.giDate = today; r._ts = Date.now();
      const payload = {};
      payload['raw_data/'+rid+'/giDate'] = today;
      payload['raw_data/'+rid+'/_ts']    = r._ts;
      _pushBatch(payload);   /* giDate + _ts + version in one atomic write */
      rebuildTableData();
      if(typeof toast==='function') toast('📅 GI Date → '+today,'ok');
    },
    /* v4.22.10 — preview a WMS GI sync without writing. Returns
       { before, after, hasChanges } so the confirmation modal can
       display the field-by-field delta to the operator before commit.
       Uses the SAME math as applyWmsSync (single source of truth):
       any future change to the sync rules touches one place. */
    previewWmsSync: function(rid, opts){
      const r = ROWS[rid];
      if(!r) return null;
      opts = opts || {};
      const before = {
        giDate: r.giDate||'', lpgQty: r.lpgQty||'',
        c3Kg: r.c3Kg||'', c4Kg: r.c4Kg||'',
        c3Pct: r.c3Pct||'', c4Pct: r.c4Pct||''
      };
      const after = Object.assign({}, before);
      const dm = String(opts.isoDate||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if(dm) after.giDate = dm[3]+'/'+dm[2]+'/'+dm[1].slice(-2);
      const pickv = (opts.pickKg != null) ? Math.round(parseFloat(opts.pickKg)||0) : null;
      if(pickv != null && pickv > 0) after.lpgQty = String(pickv);
      const c3v = (opts.c3Kg != null) ? Math.round(parseFloat(opts.c3Kg)||0) : null;
      const c4v = (opts.c4Kg != null) ? Math.round(parseFloat(opts.c4Kg)||0) : null;
      if(c3v != null) after.c3Kg = String(c3v);
      if(c4v != null) after.c4Kg = String(c4v);
      const finalC3 = c3v != null ? c3v : (parseFloat(r.c3Kg)||0);
      const finalC4 = c4v != null ? c4v : (parseFloat(r.c4Kg)||0);
      let finalPick = (pickv != null && pickv > 0) ? pickv : 0;
      if(!finalPick){ const lpg = parseFloat(r.lpgQty)||0; if(lpg > 0) finalPick = lpg; }
      if(!finalPick) finalPick = finalC3 + finalC4;
      if(finalPick > 0 && (pickv != null || c3v != null || c4v != null)){
        let pct3, pct4;
        if(finalC4 === 0 && finalC3 > 0){ pct3 = 100; pct4 = 0; }
        else if(finalC3 === 0 && finalC4 > 0){ pct3 = 0; pct4 = 100; }
        else {
          pct3 = Math.round((finalC3 / finalPick) * 1000) / 10;
          pct4 = Math.round((100 - pct3) * 10) / 10;
        }
        after.c3Pct = String(pct3); after.c4Pct = String(pct4);
      }
      const hasChanges = ['giDate','lpgQty','c3Kg','c4Kg','c3Pct','c4Pct'].some(k => String(before[k]||'') !== String(after[k]||''));
      return { before, after, hasChanges };
    },
    /* v4.22.9 — apply a WMS GI sync to a TL row in a single atomic write.
       Patches:
         • giDate     ← from isoDate (DD/MM/YY)  — the WMS paste date
         • lpgQty     ← opts.pickKg (WMS pick weight) — Net Wt
         • c3Kg       ← opts.c3Kg  (WMS propane)
         • c4Kg       ← opts.c4Kg  (WMS butane)
         • c3Pct      ← computed per user spec:  c3Kg / pickKg × 100
         • c4Pct      ← computed: 100 − c3Pct
       Denominator fallback: when pickKg is missing or 0, fall back to the
       row's existing lpgQty if non-zero, otherwise (c3Kg + c4Kg). This
       preserves correct %wt math even for partial / legacy callers.
       Pure-grade rules (per spec):
         • C3 pure (c4Kg == 0, c3Kg > 0) → c3Pct = 100, c4Pct = 0
         • C4 pure (c3Kg == 0, c4Kg > 0) → c3Pct = 0,   c4Pct = 100
       Percent fields are only written when the denominator is > 0 AND at
       least one of pickKg / c3Kg / c4Kg was supplied (never write NaN).
       Idempotent — fields already matching are skipped from the payload;
       returns true if anything actually changed and was written.
       v4.22.9 changes vs v4.22.3:
         (a) pickKg → lpgQty sync added (previously missing entirely)
         (b) %C3 denominator switched from (c3+c4) to pickKg per user spec
         (c) toast / caller updated to advertise the Net Wt field. */
    applyWmsSync: function(rid, opts){
      const r = ROWS[rid];
      if(!r) return false;
      opts = opts || {};
      const patch = {};
      /* GI Date */
      const dm = String(opts.isoDate||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if(dm){
        const formatted = dm[3]+'/'+dm[2]+'/'+dm[1].slice(-2);
        if(String(r.giDate||'') !== formatted) patch.giDate = formatted;
      }
      /* Net Weight — WMS pickKg → TL lpgQty */
      const pickv = (opts.pickKg != null) ? Math.round(parseFloat(opts.pickKg)||0) : null;
      if(pickv != null && pickv > 0 && String(r.lpgQty||'') !== String(pickv)) patch.lpgQty = String(pickv);
      /* C3 / C4 absolute weights */
      const c3v = (opts.c3Kg != null) ? Math.round(parseFloat(opts.c3Kg)||0) : null;
      const c4v = (opts.c4Kg != null) ? Math.round(parseFloat(opts.c4Kg)||0) : null;
      if(c3v != null && String(r.c3Kg||'') !== String(c3v)) patch.c3Kg = String(c3v);
      if(c4v != null && String(r.c4Kg||'') !== String(c4v)) patch.c4Kg = String(c4v);
      /* %C3 / %C4 — denominator is pickKg per user spec; falls back to
         existing lpgQty, then (c3+c4) when pick isn't available. */
      const finalC3 = c3v != null ? c3v : (parseFloat(r.c3Kg)||0);
      const finalC4 = c4v != null ? c4v : (parseFloat(r.c4Kg)||0);
      let finalPick = (pickv != null && pickv > 0) ? pickv : 0;
      if(!finalPick){ const lpg = parseFloat(r.lpgQty)||0; if(lpg > 0) finalPick = lpg; }
      if(!finalPick) finalPick = finalC3 + finalC4;
      if(finalPick > 0 && (pickv != null || c3v != null || c4v != null)){
        let pct3, pct4;
        if(finalC4 === 0 && finalC3 > 0){ pct3 = 100; pct4 = 0; }       /* pure C3 */
        else if(finalC3 === 0 && finalC4 > 0){ pct3 = 0; pct4 = 100; }  /* pure C4 */
        else {
          pct3 = Math.round((finalC3 / finalPick) * 1000) / 10;
          pct4 = Math.round((100 - pct3) * 10) / 10;
        }
        const s3 = String(pct3), s4 = String(pct4);
        if(String(r.c3Pct||'') !== s3) patch.c3Pct = s3;
        if(String(r.c4Pct||'') !== s4) patch.c4Pct = s4;
      }
      if(!Object.keys(patch).length) return false;
      /* Apply RAM + Firebase. */
      Object.assign(r, patch); r._ts = Date.now();
      const payload = {};
      Object.keys(patch).forEach(k => { payload['raw_data/'+rid+'/'+k] = patch[k]; });
      payload['raw_data/'+rid+'/_ts'] = r._ts;
      _pushBatch(payload);   /* fields + _ts + version in one atomic write */
      rebuildTableData();
      return true;
    },
    /* Rename every TL row's doNo old→new (used by SYNC when a TMP order gets its real DO).
       Match is CASE-INSENSITIVE so a hand-typed temp DO (e.g. "Dau26062301")
       still matches regardless of how it was capitalised. */
    renameDoNo: function(oldDo, newDo){
      oldDo = String(oldDo||'').trim(); newDo = String(newDo||'').trim();
      if(!oldDo || !newDo || oldDo.toUpperCase() === newDo.toUpperCase()) return 0;
      const oldU = oldDo.toUpperCase();
      let n = 0;
      const payload = {};
      Object.keys(ROWS).forEach(rid=>{
        if(String(ROWS[rid].doNo||'').trim().toUpperCase() === oldU){
          ROWS[rid].doNo = newDo;
          payload['raw_data/'+rid+'/doNo'] = newDo;
          n++;
        }
      });
      if(n){ _pushBatch(payload); rebuildTableData(); }   /* N field writes + version, one update */
      return n;
    },
    /* Phase 3 (groundwork): upsert one TL row from a SCALE completion, keyed by
       MERGE_KEY(doNo|scaleNo|turn). obj should already carry doNo/scaleNo/turn + scale data.
       Returns the rid. Safe to call repeatedly (merges by key). */
    upsertFromScale: function(obj){
      if(!obj || !obj.doNo) return null;
      const mk = MERGE_KEY(obj);
      let rid = null;
      Object.keys(ROWS).forEach(k=>{ if(MERGE_KEY(ROWS[k]) === mk) rid = k; });
      if(rid){
        const payload = {}; let changed = 0;
        Object.keys(obj).forEach(k=>{
          if(obj[k] !== undefined && String(obj[k]||'') !== String(ROWS[rid][k]||'')){
            payload['raw_data/'+rid+'/'+k] = obj[k]; ROWS[rid][k] = obj[k]; changed++;
          }
        });
        /* v4.34.0 — NOTHING changed (e.g. DONE pressed right after SAVE):
           skip the write AND the version bump entirely. The old code bumped
           the version unconditionally, broadcasting a pointless reload to
           every other machine on every idempotent re-upsert. */
        if(!changed){ return rid; }
        payload['raw_data/'+rid+'/_ts'] = Date.now(); ROWS[rid]._ts = Date.now();
        _pushBatch(payload);
      } else {
        rid = _genRid(); obj._ts = Date.now(); obj._rid = rid; ROWS[rid] = obj;
        _pushBatch({ ['raw_data/'+rid]: obj });   /* row + version, one write */
      }
      rebuildTableData(); refreshBadge();
      return rid;
    },
    getIndex,   /* v4.34.0 — O(1) lookup index for status / actual / turn (RAM only) */
    get table(){ return table; },
    get ROWS(){ return ROWS; }
  };
})();

/* Tabulator-level shims for TL Data */
function tlOpenPaste(){ TL.openPaste(); }
function tlClosePaste(){ TL.closePaste(); }
function tlRangeDelete(){ TL.rangeDelete(); }
function tlExportCsv(){ TL.exportCsv(); }
function tlOpenPicker(){ TL.openPicker(); }
function tlClearDate(){ TL.clearDate(); }
function tlMatchWmsDo(){ TL.matchWmsDo(); }   /* v4.56 — manual WMS GI match */

/* live search + date-filter wiring for TL Data */
document.getElementById('tlSearch').addEventListener('input', ()=>{ if(TL.table) TL.rebuildTableData(); });
document.getElementById('tlDateFilter').addEventListener('change', ()=>{ TL.applyTextFilter(); });
document.getElementById('tlDatePick').addEventListener('change', ()=>{ TL.pickerChange(); });
/* v4.66 — Tank / Trade / Product-type quick filters */
['tlTankFilter','tlTradeFilter','tlTypeFilter'].forEach(id=>{
  const el = document.getElementById(id);
  if(el) el.addEventListener('change', ()=>{ TL.rebuildTableData(); });
});

/* ============================================================
   SAP MODULE  (build p3.0-sap)
   ─────────────────────────────────────────────────────────
   SAP ZMMFR022 Stock Transfer data.
   Architecture mirrors WS (WMS ST):
     - Per-field delta writes via multi-path update (sap_/{rid}/{field}).
     - localStorage cache (key 'lpg_v4_sap_v1').
     - Own version counter node 'sap_version'.
     - rid = 12-char base36 random.
   22 source columns → aggregated to 9 fields per unique key:
     date (YYYY-MM-DD internal), sloc, mat (C3/C4),
     batch (D/E/P/X), init, gr, gi, trs, end — all in kg.
   Analysis panel reads RAM only (ROWS).
   ============================================================ */
