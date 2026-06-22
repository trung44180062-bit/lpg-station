/* ============================================================
 * WS  —  ws.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 13522–14217   (~696 dòng)
 * Global xuất ra : window.WS
 * Phase tách     : P3
 * Phụ thuộc      : sync, helpers
 * Khởi tạo (boot): WS.init() trong boot
 * ------------------------------------------------------------
 * MÔ TẢ: WMS ST (chuyển kho): ROWS {transDate/erpDate, matLabel(C3/C4), kg, fromLoc, toLoc, reason(D/E), status}.
 *
 * API công khai (điền/đối chiếu khi tách):
 *   WS.init(), WS.ROWS, WS.render(), WS.parse(text)
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module WS từ dòng 13522 đến 14217.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.WS).
 *   3) node --check ws.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P3]: dán thân module WS (V4-54 dòng 13522–14217) vào đây. */

const WS = (function(){
  const ROWS = {};
  let table = null;
  let _suppressEcho = 0;
  let _versions = { st:0 };
  let _pendingDiff = null;
  let dateFilter = '';
  let _analysisVisible = true;
  const LS_KEY = 'lpg_v4_st_v1';

  const DATE_FIELDS = new Set(['transDate','erpDate']);
  const NUM_FIELDS  = new Set(['kg']);

  /* -------- localStorage cache -------- */
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
    }catch(e){ }
  }

  /* -------- helpers -------- */
  function parseNum(v){
    if(v == null) return '';
    const s = String(v).trim();
    if(!s) return '';
    const n = parseFloat(s.replace(/,/g,''));
    if(isNaN(n)) return '';
    return Number.isInteger(n) ? String(Math.round(n)) : n.toFixed(2);
  }

  /* Extract material code from product string like "[20008511]{2ea, 139623.0kg}" */
  function extractMatCode(prod){
    const s = String(prod||'');
    const m = s.match(/\[?(\d{8})\]?/);
    return m ? m[1] : '';
  }
  function matLabel(code){ return code==='20008511'?'C3':code==='20008512'?'C4':code; }
  /* Extract kg from product string like "[20008511]{2ea, 139623.0kg}" */
  function extractKg(prod){
    const s = String(prod||'');
    const m = s.match(/([\d,]+(?:\.\d+)?)\s*kg/i);
    if(!m) return '';
    return parseNum(m[1]);
  }

  /* -------- TSV parser (same as WG) -------- */
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

  /* -------- WMS ST sheet parser (13 cols 0-12) -------- */
  function parseWmsStSheet(rows){
    const out = [];
    for(let i=0;i<rows.length;i++){
      const r = rows[i];
      if(!r || r.length < 6) continue;
      const c = r.map(v => (v||'').trim());
      if(c.every(v => !v)) continue;
      // skip header
      if(c[0] && (c[0].toLowerCase().includes('wms-job') || c[0].toLowerCase().includes('wms_job'))) continue;
      const jobRaw = (c[0]||'').trim();
      if(!jobRaw) continue;
      // jobId must look like SIT-xxxxx or at least have some pattern
      const prod = c[2]||'';
      const mc = extractMatCode(prod);
      const ml = matLabel(mc);
      const kgVal = extractKg(prod);
      out.push({
        jobId:     jobRaw,
        transDate: c[1]  || '',
        product:   prod,
        fromLoc:   c[3]  || '',
        toLoc:     c[4]  || '',
        erpDate:   c[5]  || '',
        reason:    c[6]  || '',
        txType:    c[7]  || '',
        status:    c[8]  || '',
        remark:    c[9]  || '',
        erpYN:     c[10] || '',
        user:      c[11] || '',
        share:     c[12] || '',
        matCode:   mc,
        matLabel:  ml,
        kg:        kgVal
      });
    }
    return out;
  }

  /* -------- applyAndPush (ONLY mutation point) -------- */
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
        payload[`wms_st_/${rid}`] = null;
        return;
      }
      let norm = value;
      if(DATE_FIELDS.has(field)) norm = normalizeDate(value);
      else if(NUM_FIELDS.has(field)) norm = parseNum(value);
      row[field] = norm;
      c.value = norm;
      payload[`wms_st_/${rid}/${field}`] = norm;
      row.lastBy = CURRENT_USER.name;
      row.lastAt = now;
      payload[`wms_st_/${rid}/lastBy`] = CURRENT_USER.name;
      payload[`wms_st_/${rid}/lastAt`] = now;
    });
    _versions.st = (_versions.st||0) + 1;
    payload['wms_st_version'] = _versions.st;
    saveCache();
    if(FB_DB){
      _suppressEcho++;
      FB_DB.ref().update(payload)
        .then(()=>toast('WMS ST synced ('+reason+')','ok'))
        .catch(e=>{ console.error('WS push',e); toast('WMS ST write failed','er'); })
        .finally(()=>setTimeout(()=>{ _suppressEcho--; }, 600));
    } else {
      toast('Saved locally (offline) — will sync when online','ok');
    }
    return payload;
  }

  function editCellField(rid, field, value){
    applyAndPush([{ rid, field, value }], 'edit');
  }

  /* -------- Firebase listeners -------- */
  let FB_DB = null;
  function attachFirebase(){
    if(typeof firebase === 'undefined') return;
    FB_DB = firebase.database();

    FB_DB.ref('wms_st_version').on('value', s=>{
      const v = s.val()||0;
      if(v > _versions.st) _versions.st = v;
    });

    const ref = FB_DB.ref('wms_st_');

    /* See plan module for rationale. */
    ref.once('value').then(snap => {
      const fbData = snap.val() || {};
      const orphans = Object.keys(ROWS).filter(rid => !Object.prototype.hasOwnProperty.call(fbData, rid));
      if(orphans.length){
        console.warn(`[wms_st] Reconcile: pruning ${orphans.length} stale local row(s):`, orphans);
        orphans.forEach(rid => delete ROWS[rid]);
        saveCache();
        if(table) rebuildTableData();
        refreshCounts(); refreshBadge();
        try{ renderAnalysis(); }catch(_){}
      }
    }).catch(()=>{});

    ref.on('child_added', snap=>{
      if(_suppressEcho) return;
      const rid = snap.key, row = snap.val();
      if(!row) return;
      row._rid = rid;
      ROWS[rid] = row;
      saveCache();
      if(table) rebuildTableData();
      refreshCounts(); refreshBadge(); renderAnalysis();
    });
    ref.on('child_changed', snap=>{
      if(_suppressEcho) return;
      const rid = snap.key, row = snap.val();
      if(!row) return;
      row._rid = rid;
      ROWS[rid] = row;
      saveCache();
      if(table){
        const r = table.getRow(rid);
        if(r) r.update(row); else table.addRow(row);
      }
      refreshCounts(); refreshBadge(); renderAnalysis();
    });
    ref.on('child_removed', snap=>{
      if(_suppressEcho) return;
      const rid = snap.key;
      delete ROWS[rid];
      saveCache();
      if(table){ const r = table.getRow(rid); if(r) r.delete(); }
      refreshCounts(); refreshBadge(); renderAnalysis();
    });
  }

  /* -------- Tabulator formatters -------- */
  function kgFormatter(cell){
    const v = cell.getValue();
    if(v === '' || v == null) return '<span class="ws-empty-cell">—</span>';
    const n = parseFloat(v);
    if(isNaN(n)) return escapeHtml(String(v));
    return n.toLocaleString('en-US') + '<span class="u">kg</span>';
  }
  function plainFormatter(cls){
    return cell=>{
      const v = String(cell.getValue()||'').trim();
      if(!v) return '<span class="ws-empty-cell">—</span>';
      return `<span class="${cls}">${escapeHtml(v)}</span>`;
    };
  }
  function matFormatter(cell){
    const v = String(cell.getValue()||'').trim();
    if(!v) return '<span class="ws-empty-cell">—</span>';
    const cls = v==='C3' ? 'ws-mat ws-mat-c3' : v==='C4' ? 'ws-mat ws-mat-c4' : 'ws-mat';
    return `<span class="${cls}">${escapeHtml(v)}</span>`;
  }
  function statusFormatter(cell){
    const v = String(cell.getValue()||'').trim().toUpperCase();
    if(!v) return '<span class="ws-empty-cell">—</span>';
    const cls = v==='Y' ? 'ws-status ws-status-y' : 'ws-status ws-status-n';
    return `<span class="${cls}">${escapeHtml(v)}</span>`;
  }
  function rowNumFormatter(cell){
    return cell.getRow().getPosition();
  }

  function wsRows(){
    let arr = Object.values(ROWS);
    const q = (document.getElementById('wsSearch').value||'').trim().toLowerCase();
    if(q){
      arr = arr.filter(r=>{
        const hay = (r.jobId||'')+' '+(r.product||'')+' '+(r.fromLoc||'')+' '+(r.toLoc||'')+' '+(r.matLabel||'')+' '+(r.reason||'');
        return hay.toLowerCase().includes(q);
      });
    }
    if(dateFilter){
      arr = arr.filter(r => normalizeDate(r.transDate) === dateFilter || normalizeDate(r.erpDate) === dateFilter);
    }
    arr.sort((a,b)=>{
      const da = parseDate(a.transDate), db = parseDate(b.transDate);
      const ta = da ? da.getTime() : 0, tb = db ? db.getTime() : 0;
      if(ta !== tb) return tb - ta;
      return String(b.jobId||'').localeCompare(String(a.jobId||''));
    });
    return arr;
  }

  function buildColumns(){
    return [
      { title:'#', width:42, hozAlign:'center', headerSort:false, formatter:rowNumFormatter },
      { title:'WMS Job ID', field:'jobId', width:155, headerSort:true, editor:'input', formatter:plainFormatter('ws-job') },
      { title:'Trans Date', field:'transDate', width:100, headerSort:true, editor:'input', formatter:plainFormatter('ws-date'),
        sorter:(a,b)=>{ const da=parseDate(a),db=parseDate(b); return (da?da.getTime():0)-(db?db.getTime():0); } },
      { title:'Mat', field:'matLabel', width:55, hozAlign:'center', headerSort:true, formatter:matFormatter },
      { title:'Qty (kg)', field:'kg', width:105, hozAlign:'right', headerSort:true, editor:'input', formatter:kgFormatter, cssClass:'ws-kg' },
      { title:'From', field:'fromLoc', width:80, headerSort:true, editor:'input', formatter:plainFormatter('ws-loc') },
      { title:'To', field:'toLoc', width:80, headerSort:true, editor:'input', formatter:plainFormatter('ws-loc') },
      { title:'ERP Trans Date', field:'erpDate', width:130, headerSort:true, editor:'input', formatter:plainFormatter('ws-date') },
      { title:'Batch', field:'reason', width:60, hozAlign:'center', headerSort:true, editor:'input', formatter:plainFormatter('ws-reason') },
      { title:'Type', field:'txType', width:70, headerSort:true, editor:'input', formatter:plainFormatter('ws-reason') },
      { title:'Status', field:'status', width:60, hozAlign:'center', headerSort:true, editor:'input', formatter:statusFormatter },
      { title:'Remark', field:'remark', minWidth:120, headerSort:true, editor:'input', formatter:plainFormatter('') },
      { title:'ERP YN', field:'erpYN', width:60, hozAlign:'center', headerSort:true, editor:'input', formatter:statusFormatter },
      { title:'User', field:'user', width:120, headerSort:true, editor:'input', formatter:plainFormatter('') },
      { title:'Last Edit', field:'lastAt', width:90, headerSort:true, formatter:lastEditFormatter, cssClass:'cell-lastedit-wrap' },
      { title:'🗑', width:44, hozAlign:'center', headerSort:false, formatter:()=>'✕', cssClass:'cell-del',
        cellClick:(e,cell)=>{ requestDeleteRow(cell.getRow().getData()); } }
    ];
  }

  function buildTable(){
    if(table){ try{ table.destroy(); }catch(_){ } table = null; }
    table = new Tabulator('#wsGrid', {
      data: wsRows(),
      layout:'fitDataStretch',
      height:'100%',
      index:'_rid',
      columns: buildColumns(),
      placeholder:'No WMS ST data — click "📦 Paste from Excel" to import',
      clipboard:true, clipboardPasteAction:'replace'
    });
    table.on('cellEdited', cell=>{
      const field = cell.getField();
      const rid   = cell.getRow().getData()._rid;
      const value = cell.getValue();
      editCellField(rid, field, value);
      setTimeout(()=>{ refreshCounts(); renderAnalysis(); }, 30);
    });
    table.on('tableBuilt', ()=>{ refreshCounts(); refreshBadge(); renderAnalysis(); });
  }

  function rebuildTableData(){
    if(!table){ buildTable(); return; }
    try{ table.replaceData(wsRows()); }
    catch(_){ buildTable(); }
    refreshCounts(); renderAnalysis();
  }

  /* -------- counts / badge / statusbar -------- */
  function refreshCounts(){
    const all = Object.values(ROWS);
    const shown = table ? table.getRows('active') : [];
    const data = shown.length ? shown.map(r=>r.getData()) : wsRows();
    let cavCount = 0, xferCount = 0;
    data.forEach(r=>{
      const from = String(r.fromLoc||''), to = String(r.toLoc||'');
      if(from==='1100' || to==='1100') cavCount++;
      else if((from==='2100'||from==='2101') && (to==='2100'||to==='2101')) xferCount++;
    });
    document.getElementById('wsSumCav').textContent = cavCount;
    document.getElementById('wsSumXfer').textContent = xferCount;
    document.getElementById('wsCntShown').textContent = table ? table.getRows('active').length : all.length;
    document.getElementById('wsCntTotal').textContent = all.length;
  }
  function refreshBadge(){
    const el = document.getElementById('wsBadgeCount');
    if(el) el.textContent = Object.keys(ROWS).length;
  }

  /* -------- Analysis panel (reads ROWS only, no Firebase) -------- */
  function computeAnalysis(){
    const result = {};
    // directions: fromCav (1100→tank), toCav (tank→1100), tkXfer (tank↔tank)
    const tanks = ['2100','2101'];
    const mats = ['C3','C4'];
    const batches = ['D','E'];
    const dirs = ['fromCav','toCav','tkXfer'];
    tanks.forEach(tk=>{ result[tk] = {};
      mats.forEach(mt=>{ result[tk][mt] = {};
        batches.forEach(bt=>{ result[tk][mt][bt] = { fromCav:0, toCav:0, tkXfer:0 }; });
      });
    });

    const rows = dateFilter ? Object.values(ROWS).filter(r=>
      normalizeDate(r.transDate)===dateFilter || normalizeDate(r.erpDate)===dateFilter
    ) : Object.values(ROWS);

    rows.forEach(r=>{
      const from = String(r.fromLoc||'').trim();
      const to = String(r.toLoc||'').trim();
      const batch = String(r.reason||'').trim().toUpperCase();
      const st = String(r.status||'').trim().toUpperCase();
      const mc = r.matCode || extractMatCode(r.product);
      const kg = parseFloat(r.kg) || 0;
      if(!mc || kg===0 || st!=='Y') return;
      if(batch!=='D' && batch!=='E') return;
      const mat = mc==='20008511'?'C3':mc==='20008512'?'C4':'';
      if(!mat) return;

      if(from==='1100' && tanks.includes(to)){
        result[to][mat][batch].fromCav += kg;
      } else if(tanks.includes(from) && to==='1100'){
        result[from][mat][batch].toCav += kg;
      } else if(tanks.includes(from) && tanks.includes(to) && from!==to){
        result[to][mat][batch].tkXfer += kg;
        result[from][mat][batch].tkXfer -= kg;
      }
    });
    return result;
  }

  function fmtTon(kg){ return kg===0 ? '—' : (kg/1000).toFixed(3); }

  function renderAnalysis(){
    const an = computeAnalysis();
    const rows = Object.values(ROWS);
    const filtered = dateFilter ? rows.filter(r=>
      normalizeDate(r.transDate)===dateFilter || normalizeDate(r.erpDate)===dateFilter
    ) : rows;

    document.getElementById('wsAnScope').textContent = dateFilter ? 'Filtered: '+dateFilter : 'All dates';
    document.getElementById('wsAnStats').textContent = filtered.length + ' rows analyzed';
    /* v4.22.16 — toggle the in-header clear button alongside the toolbar one */
    const _wsAnClr = document.getElementById('wsAnDateClr');
    if(_wsAnClr) _wsAnClr.style.display = dateFilter ? 'inline-flex' : 'none';

    // Build analysis rows for C3 and C4
    const dirDefs = [
      { key:'fromCav', label:'C3 Cavern → Tank (In)', mat:'C3' },
      { key:'toCav',   label:'C3 Tank → Cavern (Out)', mat:'C3' },
      { key:'tkXfer',  label:'C3 Tank ↔ Tank (Cross)', mat:'C3' },
      { key:'fromCav', label:'C4 Cavern → Tank (In)', mat:'C4' },
      { key:'toCav',   label:'C4 Tank → Cavern (Out)', mat:'C4' },
      { key:'tkXfer',  label:'C4 Tank ↔ Tank (Cross)', mat:'C4' }
    ];

    let html = '';
    let prevMat = '';
    dirDefs.forEach(dd=>{
      if(dd.mat !== prevMat){
        const matColor = dd.mat==='C3' ? '#2d8a4e' : '#e76f00';
        html += `<tr><td colspan="7" style="background:#f0f4f8;padding:4px 8px;font-weight:700;color:${matColor};font-size:11px">${dd.mat} — ${dd.mat==='C3'?'Propane':'Butane'}</td></tr>`;
        prevMat = dd.mat;
      }
      const d2100 = an['2100'][dd.mat];
      const d2101 = an['2101'][dd.mat];
      const vD1 = d2100['D'][dd.key], vE1 = d2100['E'][dd.key], t1 = vD1+vE1;
      const vD2 = d2101['D'][dd.key], vE2 = d2101['E'][dd.key], t2 = vD2+vE2;
      html += `<tr>`;
      html += `<td class="dir-cell">${escapeHtml(dd.label)}</td>`;
      html += `<td>${fmtTon(vD1)}</td><td>${fmtTon(vE1)}</td>`;
      html += `<td style="font-weight:700;border-right:2px solid var(--line);background:#eef4fa">${fmtTon(t1)}</td>`;
      html += `<td>${fmtTon(vD2)}</td><td>${fmtTon(vE2)}</td>`;
      html += `<td style="font-weight:700;background:#fdf5ec">${fmtTon(t2)}</td>`;
      html += `</tr>`;
    });

    if(!filtered.length){
      html = '<tr><td colspan="7" style="text-align:center;padding:12px;color:var(--ink-3);font-style:italic">No data yet — paste WMS ST data first</td></tr>';
    }
    document.getElementById('wsAnTbody').innerHTML = html;
  }

  function toggleAnalysis(){
    _analysisVisible = !_analysisVisible;
    document.getElementById('wsAnalysisWrap').style.display = _analysisVisible ? '' : 'none';
    document.getElementById('wsAnToggleBtn').textContent = _analysisVisible ? 'Hide' : 'Show Analysis';
  }

  /* -------- Paste flow -------- */
  function openPaste(){
    document.getElementById('wsPasteModal').classList.add('on');
    setTimeout(()=>document.getElementById('wsPasteArea').focus(), 50);
  }
  function closePaste(){
    document.getElementById('wsPasteModal').classList.remove('on');
  }
  function submitPaste(){
    const txt = document.getElementById('wsPasteArea').value;
    if(!txt.trim()){ toast('Nothing to paste','er'); return; }
    const parsed = parseWmsStSheet(parseTSV(txt));
    if(!parsed.length){ toast('No valid WMS ST rows detected','er'); return; }
    closePaste();
    const byJob = {};
    Object.values(ROWS).forEach(r=>{ if(r.jobId) byJob[r.jobId] = r; });
    const adds = [];
    const changes = [];
    const FIELDS = ['transDate','product','fromLoc','toLoc','erpDate','reason','txType','status','remark','erpYN','user','share','matCode','matLabel','kg'];
    parsed.forEach(p=>{
      const ex = byJob[p.jobId];
      if(ex){
        const diffs = [];
        FIELDS.forEach(f=>{
          let nv = p[f];
          if(DATE_FIELDS.has(f)) nv = normalizeDate(nv);
          const ov = ex[f] == null ? '' : String(ex[f]);
          if(String(nv||'') !== ov) diffs.push({ field:f, old:ov, new:String(nv||'') });
        });
        if(diffs.length) changes.push({ rid: ex._rid, jobId: p.jobId, diffs });
      } else {
        adds.push({ rid: newRid(), fields: p });
      }
    });
    _pendingDiff = { adds, changes };
    showDiff(adds, changes);
  }

  /* -------- Diff modal -------- */
  function showDiff(adds, changes){
    document.getElementById('wsDiffTitle').textContent = 'Confirm: Import WMS ST';
    document.getElementById('wsDiffSubtitle').textContent =
      `Matched on WMS Job ID · new rows are added, matching rows update only changed fields, existing rows not in the paste are kept.`;
    let html = '';
    html += '<div class="tp-diff-stats">';
    html += `<div class="tp-diff-stat add"><div class="v">${adds.length}</div><div class="l">Added</div></div>`;
    html += `<div class="tp-diff-stat chg"><div class="v">${changes.length}</div><div class="l">Changed</div></div>`;
    html += '</div>';
    if(adds.length){
      html += `<div class="tp-diff-section add"><h4><span class="badge">+ NEW</span> ${adds.length} row(s) added</h4><div class="tp-diff-list">`;
      adds.slice(0,40).forEach(a=>{
        const r = a.fields;
        html += `<div class="tp-diff-item"><span class="who">${escapeHtml(r.jobId)}</span> · ${escapeHtml(r.matLabel||'?')} · ${escapeHtml(r.fromLoc||'')}→${escapeHtml(r.toLoc||'')}</div>`;
      });
      if(adds.length > 40) html += `<div class="tp-diff-item" style="font-style:italic;color:var(--ink-3)">…and ${adds.length-40} more</div>`;
      html += '</div></div>';
    }
    if(changes.length){
      html += `<div class="tp-diff-section chg"><h4><span class="badge">~ CHANGED</span> ${changes.length} row(s) with field changes</h4><div class="tp-diff-list">`;
      changes.slice(0,40).forEach(c=>{
        let line = `<div class="tp-diff-item"><span class="who">${escapeHtml(c.jobId)}</span> `;
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
      html += '<div class="tp-diff-warn" style="background:var(--green-soft);border-color:#bfe3cc;color:#157a40">✓ No changes detected — paste is identical to current WMS ST data.</div>';
    }
    document.getElementById('wsDiffBody').innerHTML = html;
    document.getElementById('wsDiffModal').classList.add('on');
  }
  function closeDiff(){
    document.getElementById('wsDiffModal').classList.remove('on');
    _pendingDiff = null;
  }
  function confirmDiff(){
    if(!_pendingDiff){ closeDiff(); return; }
    const { adds, changes } = _pendingDiff;
    const batch = [];
    adds.forEach(a=>{
      Object.entries(a.fields).forEach(([k,v])=> batch.push({ rid:a.rid, field:k, value:v }));
    });
    changes.forEach(c=>{
      c.diffs.forEach(d=> batch.push({ rid:c.rid, field:d.field, value:d.new }));
    });
    if(!batch.length){ toast('No changes to apply','er'); closeDiff(); return; }
    applyAndPush(batch, 'paste '+adds.length+' new / '+changes.length+' updated');
    closeDiff();
    rebuildTableData();
    document.getElementById('wsPasteArea').value = '';
    toast(`WMS ST: ${adds.length} added, ${changes.length} updated`,'ok');
  }

  /* -------- Range-date delete (exports CSV backup first) -------- */
  function rangeDelete(){
    if(!Object.keys(ROWS).length){ toast('Already empty','er'); return; }
    if(!canWrite('sales')){ toast('No permission','er'); return; }
    BULKOPS.openRangeDelete({
      title:'DELETE DATA — WMS ST',
      fileBase:'wms_st',
      skipCsvBackup:true,   /* no CSV download on delete (user request) */
      getRows: ()=> Object.values(ROWS),
      getRid:  r=> r._rid,
      getDate: r=> (typeof parseDate==='function' ? parseDate(r.transDate) : null),
      columns: [
        {title:'WMS Job ID', field:'jobId'},{title:'Trans Date', field:'transDate'},
        {title:'Mat', field:'matLabel'},{title:'Qty (kg)', field:'kg'},
        {title:'From', field:'fromLoc'},{title:'To', field:'toLoc'},
        {title:'ERP Trans Date', field:'erpDate'},{title:'Batch', field:'reason'},
        {title:'Type', field:'txType'},{title:'Status', field:'status'},
        {title:'Remark', field:'remark'},{title:'ERP YN', field:'erpYN'},
        {title:'User', field:'user'}
      ],
      deleteRids: (rids)=>{
        const batch = rids.map(rid => ({ rid, field:'__DELETE__', value:null }));
        applyAndPush(batch, 'range-delete WMS ST ('+rids.length+' rows)');
        try{ logAudit('sales:wms_st:range_delete','_bulk_','_rangeDelete', rids.length+' rows','','delete'); }catch(_){}
        rebuildTableData();
      }
    });
  }

  /* -------- Delete single row -------- */
  let _pendingDeleteRid = null;
  function requestDeleteRow(rowData){
    _pendingDeleteRid = rowData._rid;
    const name = rowData.jobId || ('row '+(rowData._rid||'?'));
    document.getElementById('delConfirmMsg').innerHTML =
      'Delete WMS ST row <b>"'+escapeHtml(name)+'"</b>?<br>This cannot be undone.';
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
    refreshCounts(); refreshBadge(); renderAnalysis();
    closeDelConfirm();
    document.getElementById('delConfirmBtn').onclick = executeDelete;
    _pendingDeleteRid = null;
    toast('Row deleted','ok');
  }

  /* -------- Date filter -------- */
  function openPicker(){
    const dp = document.getElementById('wsDatePick');
    dp.style.pointerEvents = 'auto';
    if(dp.showPicker) try{ dp.showPicker(); }catch(_){ dp.click(); }
    else dp.click();
  }
  function pickerChange(){
    const dp = document.getElementById('wsDatePick');
    if(dp.value){
      dateFilter = normalizeDate(dp.value);
      const tf = document.getElementById('wsDateFilter');
      tf.value = dateFilter; tf.classList.add('active');
      document.getElementById('wsDateClear').classList.add('on');
      rebuildTableData();
    }
  }
  function applyTextFilter(){
    const raw = (document.getElementById('wsDateFilter').value||'').trim();
    const tf  = document.getElementById('wsDateFilter');
    if(!raw){ dateFilter=''; tf.classList.remove('active'); document.getElementById('wsDateClear').classList.remove('on'); rebuildTableData(); return; }
    dateFilter = normalizeDate(raw);
    tf.classList.add('active');
    document.getElementById('wsDateClear').classList.add('on');
    rebuildTableData();
  }
  function clearDate(){
    dateFilter = '';
    const tf = document.getElementById('wsDateFilter');
    tf.value = ''; tf.classList.remove('active');
    document.getElementById('wsDatePick').value = '';
    document.getElementById('wsDateClear').classList.remove('on');
    rebuildTableData();
  }

  /* -------- Export -------- */
  function exportCsv(){
    if(table) table.download('csv','wms_st_'+Date.now()+'.csv');
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
    openPaste, closePaste, submitPaste,
    closeDiff, confirmDiff,
    rangeDelete, requestDeleteRow, exportCsv,
    openPicker, pickerChange, applyTextFilter, clearDate,
    refreshBadge, renderAnalysis, toggleAnalysis,
    get table(){ return table; },
    get ROWS(){ return ROWS; }
  };
})();

/* Tabulator-level shims for WMS ST */
function wsOpenPaste(){ WS.openPaste(); }
function wsClosePaste(){ WS.closePaste(); }
function wsSubmitPaste(){ WS.submitPaste(); }
function wsCloseDiff(){ WS.closeDiff(); }
function wsConfirmDiff(){ WS.confirmDiff(); }
function wsRangeDelete(){ WS.rangeDelete(); }
function wsExportCsv(){ WS.exportCsv(); }
function wsOpenPicker(){ WS.openPicker(); }
function wsClearDate(){ WS.clearDate(); }
function wsToggleAnalysis(){ WS.toggleAnalysis(); }

/* live search + date-filter wiring for WMS ST */
document.getElementById('wsSearch').addEventListener('input', ()=>{ if(WS.table) WS.rebuildTableData(); });
document.getElementById('wsDateFilter').addEventListener('change', ()=>{ WS.applyTextFilter(); });
document.getElementById('wsDatePick').addEventListener('change', ()=>{ WS.pickerChange(); });

/* close WMS ST modals on Escape */
document.addEventListener('keydown', e=>{
  if(e.key === 'Escape'){
    document.getElementById('wsPasteModal').classList.remove('on');
    document.getElementById('wsDiffModal').classList.remove('on');
    document.getElementById('tlPasteModal').classList.remove('on');
    document.getElementById('tlDiffModal').classList.remove('on');
    document.getElementById('tlDelModal').classList.remove('on');
  }
});

/* ============================================================
   MODULE TL — TL Data (raw_data) — Standalone, IIFE pattern
   v4.9.0 — Firebase path: raw_data/{rid}/{field}
   Version node: raw_data_version, cache: lpg_v4_tl_v1
   Merge key: composite(doNo + scaleNo + turn)
   37 columns, per-field delta writes via SC.applyAndPush
   NO cross-module sync (deferred to integration phase)
   ============================================================ */
