/* ============================================================
 * WG  —  wg.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 12569–13361   (~793 dòng)
 * Global xuất ra : window.WG
 * Phase tách     : P3
 * Phụ thuộc      : sync, helpers
 * Khởi tạo (boot): WG.init() trong boot
 * ------------------------------------------------------------
 * MÔ TẢ: WMS GI: ROWS keyed _rid {arrival/_wmsDate, propane(C3), butane(C4), pickKg, shipToId(Domestic/Export), txType}.
 *
 * API công khai (điền/đối chiếu khi tách):
 *   WG.init(), WG.ROWS, WG.render(), WG.parse(text)
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module WG từ dòng 12569 đến 13361.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.WG).
 *   3) node --check wg.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P3]: dán thân module WG (V4-54 dòng 12569–13361) vào đây. */

const WG = (function(){
  /* live state */
  const ROWS = {};                 // keyed by _rid: { _rid, delivId, ... }
  let table = null;
  let _suppressEcho = 0;           // suppress our own Firebase echoes
  let _versions = { wms:0 };       // local idea of the area version
  let _pendingDiff = null;         // { adds:[], changes:[] } awaiting Apply
  let dateFilter = '';             // normalized DD/MM/YY string, '' = no filter
  const LS_KEY = 'lpg_v4_wms_v1';

  /* fields that hold dates → normalized at source */
  const DATE_FIELDS = new Set(['transDate','arrival']);
  /* fields that hold KG weights → parsed for thousand-separators at source */
  const NUM_FIELDS  = new Set(['pickKg','propane','butane']);

  /* -------- localStorage cache (versioned blob, separate per area) -------- */
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
    try{
      localStorage.setItem(LS_KEY, JSON.stringify({ schema:1, savedAt:Date.now(), versions:_versions, data:ROWS }));
    }catch(e){ /* quota — ignore */ }
  }

  /* -------- helpers -------- */
  /* Parse a weight/number cell — handles "8,090.00", "8090", "8090.5".
     Strips thousand-separator commas, keeps decimals; integer KG stays integer. */
  function parseNum(v){
    if(v == null) return '';
    const s = String(v).trim();
    if(!s) return '';
    const n = parseFloat(s.replace(/,/g,''));
    if(isNaN(n)) return '';
    return Number.isInteger(n) ? String(Math.round(n)) : n.toFixed(2);
  }
  function stripLeadingZeros(s){
    const v = String(s||'').replace(/[,\s]/g,'').trim();
    return v.replace(/^0+/, '') || v;
  }

  /* -------- TSV parser (RFC 4180 quoted-multiline aware) -------- */
  function parseTSV(text){
    const rows = [];
    let row = [], field = '', inQuote = false;
    const s = String(text||'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
    for(let i=0;i<s.length;i++){
      const ch = s[i];
      if(inQuote){
        if(ch === '"'){
          if(s[i+1] === '"'){ field += '"'; i++; }
          else inQuote = false;
        } else field += ch;
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

  /* -------- WMS sheet parser (13 cols A–M, ported from v406) -------- */
  function parseWmsSheet(rows){
    const out = [];
    for(let i=0;i<rows.length;i++){
      const r = rows[i];
      if(!r || r.length < 2) continue;
      const c = r.map(v => (v||'').trim());
      if(c.every(v => !v)) continue;
      // skip header row (B column is a non-numeric "DELIV..." label)
      if(c[1] && !/^\d/.test(c[1]) && c[1].toUpperCase().includes('DELIV')) continue;
      const delivRaw = (c[1]||'').replace(/,/g,'').trim();
      /* v4.36.3 — delivery IDs are numeric (86511943) OR alnum with a
         letter prefix (KNH26061101, KNHC export). The numeric-only gate
         here silently DROPPED every alnum row at paste time, which broke
         the whole WMS↔Plan↔TL match chain for those customers. */
      const _isNumDeliv   = /^\d{6,}$/.test(delivRaw);
      const _isAlnumDeliv = /^[A-Za-z]{2,4}\d{6,}$/.test(delivRaw);
      if(!delivRaw || (!_isNumDeliv && !_isAlnumDeliv)) continue;
      const delivClean = _isNumDeliv ? stripLeadingZeros(delivRaw)
                                     : delivRaw.toUpperCase();
      out.push({
        delivId:   delivClean,
        txType:    c[0]  || '',
        transDate: c[2]  || '',
        customer:  c[3]  || '',
        vehicle:   c[4]  || '',
        driver:    c[5]  || '',
        arrival:   c[6]  || '',
        orderMt:   c[7]  || '',
        uom:       c[8]  || '',
        pickKg:    parseNum(c[9]),
        propane:   parseNum(c[10]),
        butane:    parseNum(c[11]),
        shipToId:  c[12] || ''
      });
    }
    return out;
  }

  /* -------- the ONLY function that mutates ROWS + writes to FB --------
     changes = [{ rid, field, value }] ; field '__DELETE__' removes the row.
     Per-field deltas, date/number normalized at source, version bumped once. */
  function applyAndPush(changes, reason){
    if(!changes || !changes.length) return null;
    if(!canWrite('sales')){ toast('You do not have permission to edit','er'); return null; }
    const now = Date.now();
    const payload = {};
    changes.forEach(c=>{
      const { rid, field, value } = c;
      if(!ROWS[rid]) ROWS[rid] = { _rid: rid };
      const row = ROWS[rid];
      if(field === '__DELETE__'){
        delete ROWS[rid];
        payload[`wms_gi_/${rid}`] = null;
        return;
      }
      let norm = value;
      if(DATE_FIELDS.has(field)) norm = normalizeDate(value);
      else if(NUM_FIELDS.has(field)) norm = parseNum(value);
      row[field] = norm;
      c.value = norm;                       // keep caller record in sync
      payload[`wms_gi_/${rid}/${field}`] = norm;
      row.lastBy = CURRENT_USER.name;
      row.lastAt = now;
      payload[`wms_gi_/${rid}/lastBy`] = CURRENT_USER.name;
      payload[`wms_gi_/${rid}/lastAt`] = now;
    });
    _versions.wms = (_versions.wms||0) + 1;
    payload['wms_gi_version'] = _versions.wms;
    saveCache();
    if(FB_DB){
      _suppressEcho++;
      FB_DB.ref().update(payload)
        .then(()=>toast('WMS GI synced ('+reason+')','ok'))
        .catch(e=>{ console.error('WG push',e); toast('WMS GI write failed','er'); })
        .finally(()=>setTimeout(()=>{ _suppressEcho--; }, 600));
    } else {
      toast('Saved locally (offline) — will sync when online','ok');
    }
    return payload;
  }

  /* single-field edit from a Tabulator cell */
  function editCellField(rid, field, value){
    applyAndPush([{ rid, field, value }], 'edit');
  }

  /* -------- Firebase listeners (cache + version, per-area) -------- */
  let FB_DB = null;
  function attachFirebase(){
    if(typeof firebase === 'undefined') return;
    FB_DB = firebase.database();

    FB_DB.ref('wms_gi_version').on('value', s=>{
      const v = s.val()||0;
      if(v > _versions.wms) _versions.wms = v;
    });

    const ref = FB_DB.ref('wms_gi_');

    /* See plan module for rationale — prevents stale localStorage from resurrecting
       rows that were deleted on a different machine while this one was offline. */
    ref.once('value').then(snap => {
      const fbData = snap.val() || {};
      const orphans = Object.keys(ROWS).filter(rid => !Object.prototype.hasOwnProperty.call(fbData, rid));
      if(orphans.length){
        console.warn(`[wms_gi] Reconcile: pruning ${orphans.length} stale local row(s):`, orphans);
        orphans.forEach(rid => delete ROWS[rid]);
        saveCache();
        if(table) rebuildTableData();
        refreshCounts(); refreshBadge();
      }
      /* One-shot: WG has now finished its initial Firebase replay (child_added
         has fired for every row). Trigger a WGCHECK pass over both plans so the
         badges / blink / row tint reflect the loaded WMS data without requiring
         a paste or cell edit. RAM-only, silent (no toast on auto-load). */
      try{
        if(typeof WGCHECK !== 'undefined'){
          setTimeout(()=>{ WGCHECK.recheckAllPlans({toast:false}); }, 400);
        }
      }catch(_){}
    }).catch(()=>{});

    /* ── v4.34.0 — child events coalesce into ONE debounced refresh
       (same rationale as the plan factory: per-row saveCache + full table
       rebuild during the initial replay made startup O(N²)). */
    let _syncT = null;
    const _scheduleSync = ()=>{
      if(_syncT) return;
      _syncT = setTimeout(()=>{
        _syncT = null;
        saveCache();
        if(table) rebuildTableData();
        refreshCounts(); refreshBadge();
      }, 100);
    };
    ref.on('child_added', snap=>{
      if(_suppressEcho) return;
      const rid = snap.key, row = snap.val();
      if(!row) return;
      row._rid = rid;
      ROWS[rid] = row;
      _scheduleSync();
    });
    ref.on('child_changed', snap=>{
      if(_suppressEcho) return;
      const rid = snap.key, row = snap.val();
      if(!row) return;
      row._rid = rid;
      ROWS[rid] = row;
      _scheduleSync();
    });
    ref.on('child_removed', snap=>{
      if(_suppressEcho) return;
      const rid = snap.key;
      delete ROWS[rid];
      _scheduleSync();
    });
  }

  /* -------- Tabulator -------- */
  function kgFormatter(cell){
    const v = cell.getValue();
    if(v === '' || v == null) return '<span class="wg-empty-cell">—</span>';
    const n = parseFloat(v);
    if(isNaN(n)) return escapeHtml(String(v));
    return n.toLocaleString('en-US') + '<span class="u">kg</span>';
  }
  function mtFormatter(cell){
    const v = cell.getValue();
    if(v === '' || v == null) return '<span class="wg-empty-cell">—</span>';
    return escapeHtml(String(v));
  }
  function plainFormatter(cls){
    return cell=>{
      const v = String(cell.getValue()||'').trim();
      if(!v) return '<span class="wg-empty-cell">—</span>';
      return `<span class="${cls}">${escapeHtml(v)}</span>`;
    };
  }
  function rowNumFormatter(cell){
    return cell.getRow().getPosition();
  }

  function wgRows(){
    let arr = Object.values(ROWS);
    const q = (document.getElementById('wgSearch').value||'').trim().toLowerCase();
    if(q){
      arr = arr.filter(r=>{
        const hay = (r.delivId||'')+' '+(r.customer||'')+' '+(r.vehicle||'')+' '+(r.driver||'');
        return hay.toLowerCase().includes(q);
      });
    }
    if(dateFilter){
      arr = arr.filter(r => normalizeDate(r.arrival) === dateFilter);
    }
    // default sort: arrival desc (most recent first), then delivId
    arr.sort((a,b)=>{
      const da = parseDate(a.arrival), db = parseDate(b.arrival);
      const ta = da ? da.getTime() : 0, tb = db ? db.getTime() : 0;
      if(ta !== tb) return tb - ta;
      return String(b.delivId||'').localeCompare(String(a.delivId||''));
    });
    return arr;
  }

  function buildColumns(){
    return [
      { title:'#', width:42, hozAlign:'center', headerSort:false, formatter:rowNumFormatter, cssClass:'wg-no' },
      { title:'Delivery ID', field:'delivId', width:120, headerSort:true, editor:'input', formatter:plainFormatter('wg-deliv') },
      { title:'Trans Date',  field:'transDate', width:100, headerSort:true, editor:'input', formatter:plainFormatter('wg-date') },
      { title:'Customer',    field:'customer', minWidth:180, headerSort:true, editor:'input', formatter:plainFormatter('wg-cust') },
      { title:'Vehicle',     field:'vehicle', width:110, headerSort:true, editor:'input', formatter:plainFormatter('wg-veh') },
      { title:'Driver',      field:'driver', minWidth:130, headerSort:true, editor:'input', formatter:plainFormatter('wg-drv') },
      { title:'Arrival',     field:'arrival', width:100, headerSort:true, editor:'input', formatter:plainFormatter('wg-date'),
        sorter:(a,b)=>{ const da=parseDate(a),db=parseDate(b); return (da?da.getTime():0)-(db?db.getTime():0); } },
      /* v4.22.0 — WMS Date: operator-picked at paste time. Source of truth for
         matching against Today Plan _forDate and TL Data date. Stored as ISO
         YYYY-MM-DD. Displayed as DD/MM/YY. NOT editable by hand — set by
         re-pasting with a different picker date. */
      { title:'WMS Date',    field:'_wmsDate', width:90, headerSort:true, editor:false,
        formatter:cell=>{
          const v = String(cell.getValue()||'').trim();
          if(!v) return '<span style="color:#dc2626;font-style:italic">—</span>';
          const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if(m) return '<span style="font-family:Oswald,sans-serif;font-weight:700;color:#7b2d8e">'+m[3]+'/'+m[2]+'/'+m[1].slice(-2)+'</span>';
          return escapeHtml(v);
        },
        sorter:(a,b)=> String(a||'').localeCompare(String(b||''))
      },
      { title:'Order (MT)',  field:'orderMt', width:90, hozAlign:'right', headerSort:true, editor:'input', formatter:mtFormatter, cssClass:'wg-mt' },
      { title:'UOM',         field:'uom', width:60, hozAlign:'center', headerSort:true, editor:'input', formatter:plainFormatter('wg-uom') },
      { title:'Pick (KG)',   field:'pickKg', width:100, hozAlign:'right', headerSort:true, editor:'input', formatter:kgFormatter, cssClass:'wg-kg' },
      { title:'Propane (KG)',field:'propane', width:105, hozAlign:'right', headerSort:true, editor:'input', formatter:kgFormatter, cssClass:'wg-kg' },
      { title:'Butane (KG)', field:'butane', width:105, hozAlign:'right', headerSort:true, editor:'input', formatter:kgFormatter, cssClass:'wg-kg' },
      { title:'G-To-InternalCode', field:'shipToId', width:140, headerSort:true, editor:'input', formatter:plainFormatter('wg-shipto') },
      { title:'Last Edit', field:'lastAt', width:90, headerSort:true, formatter:lastEditFormatter, cssClass:'cell-lastedit-wrap' },
      { title:'🗑', width:44, hozAlign:'center', headerSort:false, formatter:()=>'✕', cssClass:'cell-del',
        cellClick:(e,cell)=>{ requestDeleteRow(cell.getRow().getData()); } }
    ];
  }

  function buildTable(){
    if(table){ try{ table.destroy(); }catch(_){ } table = null; }
    table = new Tabulator('#wgGrid', {
      data: wgRows(),
      layout:'fitDataStretch',
      height:'100%',
      index:'_rid',
      columns: buildColumns(),
      placeholder:'No WMS GI data — click "📦 Paste from Excel" to import',
      clipboard:true, clipboardPasteAction:'replace'
    });
    table.on('cellEdited', cell=>{
      const field = cell.getField();
      const rid   = cell.getRow().getData()._rid;
      const value = cell.getValue();
      editCellField(rid, field, value);
      setTimeout(()=>{ refreshCounts(); }, 30);
      /* WG row changed → plan↔WMS comparisons may flip. Recheck cheap (RAM-only),
         debounced via setTimeout. Only react when the changed field actually
         affects the comparison (delivId/customer/vehicle/orderMt). */
      try{
        if(typeof WGCHECK !== 'undefined'
           && /^(delivId|customer|vehicle|orderMt)$/.test(field)){
          setTimeout(()=>{ WGCHECK.recheckAllPlans({toast:false}); }, 60);
        }
      }catch(_){}
    });
    table.on('tableBuilt', ()=>{ refreshCounts(); refreshBadge(); });
  }

  function rebuildTableData(){
    if(!table){ buildTable(); return; }
    try{ table.replaceData(wgRows()); }
    catch(_){ buildTable(); }
    refreshCounts();
  }

  /* -------- counts / badge / statusbar totals -------- */
  function refreshCounts(){
    const all = Object.values(ROWS);
    const shown = table ? table.getRows('active') : [];
    let ord = 0, pick = 0;
    (shown.length ? shown.map(r=>r.getData()) : wgRows()).forEach(r=>{
      const o = parseFloat(String(r.orderMt||'').replace(/,/g,''));
      if(!isNaN(o)) ord += o;
      const p = parseFloat(String(r.pickKg||'').replace(/,/g,''));
      if(!isNaN(p)) pick += p;
    });
    document.getElementById('wgSumOrderMt').textContent = ord.toFixed(1);
    document.getElementById('wgSumPickKg').textContent  = (pick/1000).toFixed(2);
    document.getElementById('wgCntShown').textContent   = table ? table.getRows('active').length : all.length;
    document.getElementById('wgCntTotal').textContent   = all.length;
  }
  function refreshBadge(){
    const el = document.getElementById('wgBadgeCount');
    if(el) el.textContent = Object.keys(ROWS).length;
  }

  /* -------- Paste flow (parse → diff by delivId → confirm → apply) -------- */
  function openPaste(){
    document.getElementById('wgPasteModal').classList.add('on');
    /* v4.22.0 — default the date picker to today on every open. Operator can
       override (e.g. paste yesterday's data) but the safe default is today. */
    pasteDateToday();
    setTimeout(()=>document.getElementById('wgPasteArea').focus(), 50);
  }
  function pasteDateToday(){
    const inp = document.getElementById('wgPasteDate');
    if(!inp) return;
    const d = new Date(), p = n => String(n).padStart(2,'0');
    inp.value = d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
  }
  function closePaste(){
    document.getElementById('wgPasteModal').classList.remove('on');
  }
  function submitPaste(){
    const txt = document.getElementById('wgPasteArea').value;
    if(!txt.trim()){ toast('Nothing to paste','er'); return; }
    /* v4.22.0 — read the date picker. ISO YYYY-MM-DD. Required. */
    const wmsDate = String((document.getElementById('wgPasteDate')||{}).value||'').trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(wmsDate)){
      toast('Pick a date for this paste (default = today)','er'); return;
    }
    const parsed = parseWmsSheet(parseTSV(txt));
    if(!parsed.length){ toast('No valid WMS GI rows detected','er'); return; }
    /* Stamp every parsed row with the picked date. This is the field used to
       match Today Plan _forDate and TL Data date during sync — arrival is
       kept for display only. */
    parsed.forEach(p => { p._wmsDate = wmsDate; });
    closePaste();
    /* build delivId → existing rid lookup */
    const byDeliv = {};
    Object.values(ROWS).forEach(r=>{ if(r.delivId) byDeliv[r.delivId] = r; });
    const adds = [];        // [{ rid, fields:{...} }]
    const changes = [];     // [{ rid, delivId, diffs:[{field,old,new}] }]
    /* v4.22.0 — _wmsDate added to tracked field list so diffs persist it. */
    const FIELDS = ['txType','transDate','customer','vehicle','driver','arrival','orderMt','uom','pickKg','propane','butane','shipToId','_wmsDate'];
    /* v4.22.0 — collect re-paste date mismatches: BOTH old and new pick > 0
       AND _wmsDate differs. If only old pick = 0, the existing row is just
       preliminary sales-planning data — silently take the new date. If only
       new pick = 0, this is also a planning paste — silently take new date.
       Mixed cases (both pick > 0, dates differ) require operator confirm. */
    const dateConflicts = [];
    parsed.forEach(p=>{
      const ex = byDeliv[p.delivId];
      if(ex){
        const exDate = String(ex._wmsDate||'').trim();
        const exPick = parseFloat(ex.pickKg||0) || 0;
        const npPick = parseFloat(p.pickKg||0) || 0;
        if(exDate && exDate !== p._wmsDate && exPick > 0 && npPick > 0){
          dateConflicts.push({ delivId:p.delivId, customer:ex.customer||p.customer||'',
            oldDate:exDate, newDate:p._wmsDate, oldPick:Math.round(exPick), newPick:Math.round(npPick) });
        }
        const diffs = [];
        FIELDS.forEach(f=>{
          let nv = p[f];
          if(DATE_FIELDS.has(f)) nv = normalizeDate(nv);
          const ov = ex[f] == null ? '' : String(ex[f]);
          if(String(nv||'') !== ov) diffs.push({ field:f, old:ov, new:String(nv||'') });
        });
        if(diffs.length) changes.push({ rid: ex._rid, delivId: p.delivId, diffs });
      } else {
        adds.push({ rid: newRid(), fields: p });
      }
    });
    _pendingDiff = { adds, changes, dateConflicts, wmsDate };
    showDiff(adds, changes, dateConflicts);
  }

  /* -------- Diff modal -------- */
  function showDiff(adds, changes, dateConflicts){
    document.getElementById('wgDiffTitle').textContent = 'Confirm: Import WMS GI';
    document.getElementById('wgDiffSubtitle').textContent =
      `Matched on Delivery ID · new rows are added, matching rows update only changed fields, existing rows not in the paste are kept.`;
    let html = '';
    html += '<div class="tp-diff-stats">';
    html += `<div class="tp-diff-stat add"><div class="v">${adds.length}</div><div class="l">Added</div></div>`;
    html += `<div class="tp-diff-stat chg"><div class="v">${changes.length}</div><div class="l">Changed</div></div>`;
    if(dateConflicts && dateConflicts.length){
      html += `<div class="tp-diff-stat" style="background:#fff7ed;border-color:#fdba74"><div class="v" style="color:#ea580c">${dateConflicts.length}</div><div class="l">Date conflict</div></div>`;
    }
    html += '</div>';
    /* v4.22.0 — date-mismatch warning. Only shown when BOTH old and new
       pickKg are > 0 and _wmsDate differs (mixed cases with pick=0 on one
       side silently take the new date). User must confirm overwrite. */
    if(dateConflicts && dateConflicts.length){
      html += `<div class="tp-diff-section dmm"><h4><span class="badge">⚠ DATE CONFLICT</span> ${dateConflicts.length} row(s) — both old & new have pick &gt; 0 but WMS dates differ</h4>`;
      html += `<div style="font-size:11px;color:#7a3e07;margin-bottom:6px;padding:6px 8px;background:#fff;border-radius:4px;border:1px solid #fdba74">
        Clicking <b>Apply</b> overwrites the old <b>WMS Date</b> with the new picker value (${dateConflicts[0].newDate}).
        If you want to keep the old dates, click <b>Cancel</b> and re-paste with the correct picker.</div>`;
      html += `<div class="tp-diff-list">`;
      dateConflicts.slice(0,40).forEach(c=>{
        html += `<div class="tp-diff-item"><span class="who">${escapeHtml(c.delivId)}</span> · ${escapeHtml(c.customer)} · <span class="field">old</span><span class="ov">${escapeHtml(c.oldDate)} (pick ${c.oldPick} kg)</span><span class="arr">→</span><span class="nv">${escapeHtml(c.newDate)} (pick ${c.newPick} kg)</span></div>`;
      });
      if(dateConflicts.length > 40) html += `<div class="tp-diff-item" style="font-style:italic;color:var(--ink-3)">…and ${dateConflicts.length-40} more</div>`;
      html += '</div></div>';
    }
    if(adds.length){
      html += `<div class="tp-diff-section add"><h4><span class="badge">+ NEW</span> ${adds.length} row(s) added</h4><div class="tp-diff-list">`;
      adds.slice(0,40).forEach(a=>{
        const r = a.fields;
        html += `<div class="tp-diff-item"><span class="who">${escapeHtml(r.delivId)}</span> · ${escapeHtml(r.customer||'?')} · ${escapeHtml(r.vehicle||'')} ${escapeHtml(r.driver||'')}</div>`;
      });
      if(adds.length > 40) html += `<div class="tp-diff-item" style="font-style:italic;color:var(--ink-3)">…and ${adds.length-40} more</div>`;
      html += '</div></div>';
    }
    if(changes.length){
      html += `<div class="tp-diff-section chg"><h4><span class="badge">~ CHANGED</span> ${changes.length} row(s) with field changes</h4><div class="tp-diff-list">`;
      changes.slice(0,40).forEach(c=>{
        let line = `<div class="tp-diff-item"><span class="who">${escapeHtml(c.delivId)}</span> `;
        c.diffs.forEach(d=>{
          line += `<span class="field">${escapeHtml(d.field)}</span><span class="ov">${escapeHtml(d.old||'(empty)')}</span><span class="arr">→</span><span class="nv">${escapeHtml(d.new||'(empty)')}</span> `;
        });
        line += '</div>';
        html += line;
      });
      if(changes.length > 40) html += `<div class="tp-diff-item" style="font-style:italic;color:var(--ink-3)">…and ${changes.length-40} more row(s)</div>`;
      html += '</div></div>';
    }
    if(!adds.length && !changes.length){
      html += '<div class="tp-diff-warn" style="background:var(--green-soft);border-color:#bfe3cc;color:#157a40">✓ No changes detected — paste is identical to current WMS GI data.</div>';
    }
    document.getElementById('wgDiffBody').innerHTML = html;
    document.getElementById('wgDiffModal').classList.add('on');
  }
  function closeDiff(){
    document.getElementById('wgDiffModal').classList.remove('on');
    _pendingDiff = null;
  }
  function confirmDiff(){
    if(!_pendingDiff){ closeDiff(); return; }
    const { adds, changes, wmsDate } = _pendingDiff;
    const batch = [];
    adds.forEach(a=>{
      Object.entries(a.fields).forEach(([k,v])=> batch.push({ rid:a.rid, field:k, value:v }));
    });
    changes.forEach(c=>{
      c.diffs.forEach(d=> batch.push({ rid:c.rid, field:d.field, value:d.new }));
    });
    if(!batch.length){ toast('No changes to apply','er'); closeDiff(); return; }
    applyAndPush(batch, 'paste '+adds.length+' new / '+changes.length+' updated');
    /* v4.22.11 — corrected modal chain.
       Old order: _autoFillTlGiDate ran FIRST, then SYNC.reviewPromotions.
       That meant TL.doNo still held TMP-xxx ids when candidates were
       gathered, so newly-promoted rows never appeared in the TL sync
       modal. Fix: run promotion first; defer TL sync to fire after
       the promote modal closes (Apply OR Cancel paths both trigger
       the callback). When no promotion candidates exist, run TL
       sync directly. */
    const runTlSync = () => {
      try{ _autoFillTlGiDate(adds, changes, wmsDate); }
      catch(e){ console.warn('[WG] auto-fill GI', e); }
    };
    let promoteOpened = false;
    try{
      if(typeof SYNC !== 'undefined' && SYNC.reviewPromotions){
        const seen = new Set(); const wmsRows = [];
        [...adds, ...changes].forEach(x=>{
          const rid = x.rid;
          if(!rid || seen.has(rid)) return;
          seen.add(rid);
          const r = ROWS[rid];
          if(r) wmsRows.push(r);
        });
        promoteOpened = SYNC.reviewPromotions(wmsRows, runTlSync) === true;
      }
    }catch(e){ console.warn('[WG] promote hook', e); }
    /* No promotion modal opened — run TL sync now with current state. */
    if(!promoteOpened) runTlSync();
    closeDiff();
    rebuildTableData();
    document.getElementById('wgPasteArea').value = '';
    toast(`WMS GI: ${adds.length} added, ${changes.length} updated`,'ok');
    /* WMS GI just changed — re-run WGCHECK on TP + TMR plans so any
       Plan ↔ WMS GI mismatches refresh. RAM-only, no Firebase writes. */
    try{ if(typeof WGCHECK !== 'undefined') WGCHECK.recheckAllPlans({toast:false}); }catch(_){}
  }

  /* v4.22.12 — full-scope WMS GI → TL Data match.
     Triggered on every WMS GI paste (via WG.confirmDiff → runTlSync
     after promotions). Spec (per user clarification):

     Match conditions — TL row qualifies as a candidate iff:
       1. TL.doNo contains at least one real DO (6+ digits)
          — covers both rows whose DO was always official and rows
          whose TMP-xxx was just promoted by SYNC in the same paste.
       2. TL.giDate is empty
          — giDate is the field that records "this row has been GI'd
          on WMS". Empty = not yet matched. Rows that already have a
          giDate are skipped to avoid overwriting confirmed history.
       3. TL.date (truck export day) === picker wmsDate
          — narrows the search to the date the operator picked, so
          a WMS DO can't accidentally match a TL row from a different
          export day. The operator picks the export date (which the
          WMS GI document references), not necessarily today.

     Search pool — every WMS row where:
       • delivId is a real DO (6+ digits)
       • pickKg > 0
       • _wmsDate === picker wmsDate (same date window)
     Includes rows from past pastes, not just this paste's adds /
     changes — so a TL row added today can still match a WMS row
     pasted yesterday, as long as both reference the same export day.

     Stamp — when the operator confirms the modal, the matched row
     gets:
       • giDate ← TODAY (current system date), not wmsDate.
         Reason: GI date represents when the operator GI'd on WMS,
         which is happening now. Daily reports aggregate by giDate
         and must align with the WMS system's GI timestamp.
       • lpgQty ← WMS pickKg
       • c3Kg / c4Kg ← WMS propane / butane
       • c3Pct / c4Pct ← derived (see TL.applyWmsSync header)

     Filtered out at preview time: rows where every field already
     matches (hasChanges === false) so the modal only surfaces real
     diffs. */
  function _autoFillTlGiDate(adds, changes, wmsDate){
    if(!wmsDate) return;
    if(typeof TL === 'undefined' || !TL.ROWS || !TL.applyWmsSync || !TL.previewWmsSync) return;

    /* Today's date — what gets stamped on TL.giDate when match confirmed. */
    const dNow = new Date();
    const todayIso = dNow.getFullYear()+'-'+String(dNow.getMonth()+1).padStart(2,'0')+'-'+String(dNow.getDate()).padStart(2,'0');

    /* DD/MM/YY (or /YYYY) → YYYY-MM-DD for cross-format date compare. */
    const _isoFromDDMMYY = s => {
      const m = String(s||'').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
      if(!m) return '';
      let yy = m[3]; if(yy.length === 2) yy = '20'+yy;
      return yy+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0');
    };

    /* Build the WMS search pool: every WG row whose _wmsDate === picker
       date, has a real DO (numeric OR alnum like KNH26061101 — v4.36.3),
       and reports a non-zero pick. Keys uppercased for alnum stability. */
    const _isDoTok = x => /^\d{6,}$/.test(x) || /^[A-Za-z]{2,4}\d{6,}$/.test(x);
    const wmsByDo = {};
    Object.values(ROWS).forEach(w => {
      const wDO = String(w.delivId||'').trim();
      if(!_isDoTok(wDO)) return;
      const pick = parseFloat(w.pickKg||0) || 0;
      if(!pick) return;
      if(String(w._wmsDate||'') !== wmsDate) return;
      wmsByDo[wDO.toUpperCase()] = w;
    });
    if(!Object.keys(wmsByDo).length) return;       /* no WMS rows in date window */

    /* Scan every TL row that fits the candidate criteria. */
    const tlRows = TL.ROWS;
    const cands = [];
    for(const rid in tlRows){
      const r = tlRows[rid];
      if(!r || r.disabled) continue;
      if(String(r.giDate||'').trim()) continue;                /* already GI'd */
      const tlIso = _isoFromDDMMYY(r.date);
      if(!tlIso || tlIso !== wmsDate) continue;                /* outside date window */
      const dos = String(r.doNo||'').trim().split(/[\s\/,]+/)
        .filter(_isDoTok).map(x => x.toUpperCase());
      if(!dos.length) continue;                                /* still TMP-only */
      let matched = null;
      for(const x of dos){ if(wmsByDo[x]){ matched = wmsByDo[x]; break; } }
      if(!matched) continue;
      const c3   = parseFloat(matched.propane||0) || 0;
      const c4   = parseFloat(matched.butane ||0) || 0;
      const pick = parseFloat(matched.pickKg ||0) || 0;
      /* giDate stamped with TODAY, not the picker date. */
      const opts = { isoDate: todayIso, pickKg: pick, c3Kg: c3, c4Kg: c4 };
      try{
        const preview = TL.previewWmsSync(rid, opts);
        if(preview && preview.hasChanges){
          cands.push({
            rid,
            realDo: String(matched.delivId||'').trim(),
            opts, preview,
            wmsRow: matched, tlRow: r
          });
        }
      }catch(_){}
    }

    if(!cands.length) return;
    try{ openTlSyncModal(cands); }catch(e){ console.warn('[WG] openTlSyncModal', e); }
  }

  /* -------- Clear all -------- */
  function rangeDelete(){
    if(!Object.keys(ROWS).length){ toast('Already empty','er'); return; }
    if(!canWrite('sales')){ toast('No permission','er'); return; }
    BULKOPS.openRangeDelete({
      title:'DELETE DATA — WMS GI',
      fileBase:'wms_gi',
      skipCsvBackup:true,   /* no CSV download on delete (user request) */
      getRows: ()=> Object.values(ROWS),
      getRid:  r=> r._rid,
      getDate: r=> (typeof parseDate==='function' ? parseDate(r.arrival) : null),
      columns: [
        {title:'Delivery ID', field:'delivId'},{title:'Trans Date', field:'transDate'},
        {title:'Customer', field:'customer'},{title:'Vehicle', field:'vehicle'},
        {title:'Driver', field:'driver'},{title:'Arrival', field:'arrival'},
        {title:'WMS Date', field:'_wmsDate'},{title:'Order (MT)', field:'orderMt'},
        {title:'UOM', field:'uom'},{title:'Pick (KG)', field:'pickKg'},
        {title:'Propane (KG)', field:'propane'},{title:'Butane (KG)', field:'butane'},
        {title:'G-To-InternalCode', field:'shipToId'}
      ],
      deleteRids: (rids)=>{
        const batch = rids.map(rid => ({ rid, field:'__DELETE__', value:null }));
        applyAndPush(batch, 'range-delete WMS GI ('+rids.length+' rows)');
        try{ logAudit('sales:wms_gi:range_delete','_bulk_','_rangeDelete', rids.length+' rows','','delete'); }catch(_){}
        rebuildTableData();
      }
    });
  }

  /* -------- Delete single row (reuses global del-confirm modal) -------- */
  let _pendingDeleteRid = null;
  function requestDeleteRow(rowData){
    _pendingDeleteRid = rowData._rid;
    const name = rowData.delivId || ('row '+(rowData._rid||'?'));
    document.getElementById('delConfirmMsg').innerHTML =
      'Delete WMS GI row <b>"'+escapeHtml(name)+'"</b>?<br>This cannot be undone.';
    document.getElementById('delConfirmInput').value = '';
    document.getElementById('delConfirmBtn').classList.remove('ready');
    document.getElementById('delConfirmBtn').onclick = doDelete;
    document.getElementById('delConfirmModal').classList.add('on');
    setTimeout(()=> document.getElementById('delConfirmInput').focus(), 80);
  }
  function doDelete(){
    if(!_pendingDeleteRid) return;
    if(document.getElementById('delConfirmInput').value.trim().toLowerCase() !== 'confirm'){
      toast('Type "Confirm" to delete','er'); return;
    }
    applyAndPush([{ rid:_pendingDeleteRid, field:'__DELETE__', value:null }], 'delete');
    try{ if(table){ const r = table.getRow(_pendingDeleteRid); if(r) r.delete(); } }catch(_){ }
    refreshCounts(); refreshBadge();
    closeDelConfirm();
    document.getElementById('delConfirmBtn').onclick = executeDelete;  // restore Fleet handler
    _pendingDeleteRid = null;
    toast('Row deleted','ok');
  }

  /* -------- Date filter -------- */
  function openPicker(){
    const dp = document.getElementById('wgDatePick');
    dp.style.pointerEvents = 'auto';
    if(dp.showPicker) try{ dp.showPicker(); }catch(_){ dp.click(); }
    else dp.click();
  }
  function pickerChange(){
    const dp = document.getElementById('wgDatePick');
    if(dp.value){
      dateFilter = normalizeDate(dp.value);           // dp.value is YYYY-MM-DD
      const tf = document.getElementById('wgDateFilter');
      tf.value = dateFilter; tf.classList.add('active');
      document.getElementById('wgDateClear').classList.add('on');
      rebuildTableData();
    }
  }
  function applyTextFilter(){
    const raw = (document.getElementById('wgDateFilter').value||'').trim();
    const tf  = document.getElementById('wgDateFilter');
    if(!raw){ dateFilter=''; tf.classList.remove('active'); document.getElementById('wgDateClear').classList.remove('on'); rebuildTableData(); return; }
    const nd = normalizeDate(raw);
    dateFilter = nd;
    tf.classList.add('active');
    document.getElementById('wgDateClear').classList.add('on');
    rebuildTableData();
  }
  function clearDate(){
    dateFilter = '';
    const tf = document.getElementById('wgDateFilter');
    tf.value = ''; tf.classList.remove('active');
    document.getElementById('wgDatePick').value = '';
    document.getElementById('wgDateClear').classList.remove('on');
    rebuildTableData();
  }

  /* -------- Export -------- */
  function exportCsv(){
    if(table) table.download('csv','wms_gi_'+Date.now()+'.csv');
  }

  /* -------- public API -------- */
  return {
    init(){
      const cached = loadCache();
      if(cached){
        Object.assign(ROWS, cached.data || {});
        _versions = cached.versions || _versions;
      }
      refreshBadge();
      attachFirebase();
    },
    buildTable, rebuildTableData,
    openPaste, closePaste, submitPaste, pasteDateToday,
    closeDiff, confirmDiff,
    rangeDelete, requestDeleteRow, exportCsv,
    openPicker, pickerChange, applyTextFilter, clearDate,
    refreshBadge,
    get table(){ return table; },
    get ROWS(){ return ROWS; }
  };
})();

/* Tabulator-level shims used by WMS GI (mirrors fleet/TP helpers) */
function wgOpenPaste(){ WG.openPaste(); }
function wgClosePaste(){ WG.closePaste(); }
function wgSubmitPaste(){ WG.submitPaste(); }
function wgCloseDiff(){ WG.closeDiff(); }
function wgConfirmDiff(){ WG.confirmDiff(); }
/* ============================================================
   BULKOPS — shared range-date delete + CSV-export-before-delete
   ------------------------------------------------------------
   Generic, area-agnostic. Each module calls openRangeDelete(cfg)
   and supplies RAM accessors + its own delta-delete callback.
   - Reads ONLY RAM (getRows). No Firebase reads.
   - Deletion goes through the caller's deleteRids() (delta path).
   - Before deleting, the matched rows are exported to CSV+BOM so a
     mistaken delete can be re-imported.
   - Rows with no parseable date are NEVER auto-deleted (shown as
     "skipped") to avoid accidental loss.
   ============================================================ */
