/* ============================================================
 * globals.js — Hàm/biến GLOBAL dùng chung (CORE)  ★ MỚI
 * ------------------------------------------------------------
 * Nguồn V4-54: 9463–9939 (khối top-level giữa FBA và factory PLAN).
 * Gồm: escapeHtml, toast, parseDate, normalizeDate, daysLeft,
 *   dateState, rowState, buildColumns/rowFormatter (fleet),
 *   switchFleetTab, openPaste/doPaste, MN month-map (9510)…
 * PHẢI nạp TRƯỚC data/features (các module dùng escapeHtml/toast/parseDate).
 * (Tách mịn util chung vs helper-fleet là bước tuỳ chọn sau.)
 * ============================================================ */

/* ---------- LED helper (Sync Core calls this) ---------- */
function setLed(on,txt){
  const led=document.getElementById('fbLed'); led.classList.toggle('off',!on);
  document.getElementById('fbTxt').textContent=txt;
}

/* ============================================================
   SUB-TAB BAR
   ============================================================ */
function buildFleetSubs(){
  document.getElementById('fleetSubs').innerHTML=FLEET_TABS.map(t=>{
    const d=CERT_DEFS[t]; const n=Object.keys(DATA[t]||{}).length;
    return `<button class="stab ${t===curTab?'on':''}" data-sub="${t}" onclick="switchFleetTab('${t}')">
      ${d.icon} ${d.label}<span class="stab-badge">${n}</span></button>`;
  }).join('');
}

/* ============================================================
   DATE / STATUS LOGIC
   ============================================================ */
let CERT_WARN_DAYS=30;
/* Accept multiple date formats from paste/edit:
     DD/MM/YY   DD/MM/YYYY   DD-MM-YY   DD-MM-YYYY
     YYYY-MM-DD YYYY/MM/DD   (Excel ISO paste)
   Returns a JS Date or null. Used by status logic AND by
   normalizeDate() before render so the table shows DD/MM/YY consistently. */
function parseDate(s){
  if(!s) return null;
  s = String(s).trim();
  // Strip a trailing time component (e.g. "27/05/2026 14:30" or "2026-05-27T08:00")
  s = s.replace(/[T ]\d{1,2}:\d{2}(:\d{2})?.*$/,'').trim();
  let m;
  // DD/MM/YY or DD/MM/YYYY  (also DD-MM-...)
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if(m){ let [,d,mo,y]=m; y=+y; if(y<100) y+=2000; return new Date(y,+mo-1,+d); }
  // YYYY-MM-DD or YYYY/MM/DD
  m = s.match(/^(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})$/);
  if(m){ let [,y,mo,d]=m; return new Date(+y,+mo-1,+d); }
  // YYYYMMDD compact (8-digit ISO from WMS export)
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if(m){ let [,y,mo,d]=m; return new Date(+y,+mo-1,+d); }
  // DD/MMM/YY or DD-MMM-YYYY with a textual month (e.g. "24/Apr/26", "06-Jun-2026")
  // — Tank Log dates and date-picker display use this form.
  m = s.match(/^(\d{1,2})[\/\- ]([A-Za-z]{3,})[\/\- ](\d{2,4})$/);
  if(m){
    let [,d,mon,y]=m;
    const MN={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
    const mo=MN[mon.slice(0,3).toLowerCase()];
    if(mo!==undefined){ y=+y; if(y<100) y+=2000; return new Date(y,mo,+d); }
  }
  return null;
}
/* Normalize ANY accepted format → canonical "DD/MM/YY" for storage + display.
   If value is unparseable, return it back untouched (don't lose user input). */
function normalizeDate(s){
  const d = parseDate(s);
  if(!d) return s||'';
  const p = n => String(n).padStart(2,'0');
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${String(d.getFullYear()).slice(-2)}`;
}
function daysLeft(s){const dt=parseDate(s);if(!dt)return null;
  return Math.round((dt-new Date().setHours(0,0,0,0))/86400000);}
function dateState(s){const dl=daysLeft(s);if(dl===null)return'none';
  if(dl<0)return'exp';if(dl<=CERT_WARN_DAYS)return'due';return'ok';}
function rowState(row){
  const certs=CERT_DEFS[curTab].certs; let worst='ok',hasAny=false;
  certs.forEach(c=>{const st=dateState(row[c.k]);if(st==='none')return;hasAny=true;
    if(st==='exp')worst='exp';else if(st==='due'&&worst!=='exp')worst='due';});
  return hasAny?worst:'none';
}
/* RAM-only: number of cert fields that are missing/empty/unparseable.
   Used to float incomplete rows to the top. Strictly client-side —
   never touches Firebase. */
function missingCount(row){
  const certs = CERT_DEFS[curTab].certs;
  let n = 0;
  certs.forEach(c=>{
    const v = row[c.k];
    if(!v || !parseDate(v)) n++;
  });
  return n;
}
/* Composite sort key: more-broken first, then expired first, then
   nearest-to-expire first. Pure RAM, no FB calls. */
function rowSortKey(row){
  const miss = missingCount(row);
  const st = rowState(row);
  const stRank = st==='exp'?0 : st==='due'?1 : st==='ok'?2 : 3;
  // for valid rows, sort by soonest expiry → earliest expiry first
  let soonest = Infinity;
  CERT_DEFS[curTab].certs.forEach(c=>{
    const dl = daysLeft(row[c.k]);
    if(dl!==null && dl<soonest) soonest = dl;
  });
  return { miss, stRank, soonest };
}

/* ============================================================
   TABULATOR
   ============================================================ */
let table=null;

function dateFormatter(cell){
  const raw=cell.getValue();
  if(!raw) return `<span class="dc none">—</span>`;
  const disp = normalizeDate(raw);
  const st   = dateState(raw);
  return `<span class="dc ${st}"><span class="dcd"></span>${disp}</span>`;
}
/* compact "5m ago / 2h ago / 3d ago" + tooltip with full timestamp + user */
function fmtRelative(ts){
  if(!ts) return '';
  const s = Math.floor((Date.now()-ts)/1000);
  if(s<60)   return s+'s';
  if(s<3600) return Math.floor(s/60)+'m';
  if(s<86400)return Math.floor(s/3600)+'h';
  return Math.floor(s/86400)+'d';
}
function fmtFullTs(ts){
  if(!ts) return '';
  const d=new Date(ts), p=n=>String(n).padStart(2,'0');
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function lastEditFormatter(cell){
  const row=cell.getRow().getData();
  if(!row.lastBy && !row.lastAt) return `<span class="cell-lastedit none">—</span>`;
  const rel = fmtRelative(row.lastAt);
  const tip = `${row.lastBy||'?'} · ${fmtFullTs(row.lastAt)}`;
  // initials for compactness; tooltip on hover via title attr
  const initials = (row.lastBy||'?').split(/\s+/).map(p=>p[0]||'').join('').toUpperCase().slice(0,2);
  return `<span class="cell-lastedit" title="${tip}">
    <span class="le-who">${initials}</span><span class="le-when">${rel}</span></span>`;
}

/* ============================================================
   ⛔ BLOCK COLUMNS (v4.80 → tách đôi ở v4.82)
   ------------------------------------------------------------
   HAI cột riêng trên MỌI bảng Fleet, sửa THẲNG trong ô (v4.82 —
   bản đầu dùng modal, thao tác chậm nên bỏ). Cả hai nằm liền nhau
   ngay SAU cột Remark, theo thứ tự đọc tự nhiên "lý do rồi mới tick"
   (v4.83 — trước đó ô tick bị tách lên đầu bảng, phải nhìn hai nơi):
     • BLOCK NOTE  — lý do cấm, editor input bình thường.
     • ⛔          — ô tick, CLICK 1 phát là bật/tắt lệnh cấm.
   Khi tick, xe/rmooc/tài xế đó bị đánh dấu CẤM NHẬN HÀNG — FCHECK
   phát cảnh báo ⛔ kèm nội dung ở Plan grid / trạm cân / panel /
   popup paste, và assign vào trạm phải xác nhận 2 lần.
   ============================================================ */
function blockTickFormatter(cell){
  const on = !!cell.getValue();
  if(!on) return `<span class="blk-tick off" title="Click to BLOCK this vehicle / driver">☐</span>`;
  const note = rowBlockNote(cell.getRow().getData());
  return `<span class="blk-tick on" title="${escapeHtml('BLOCKED' + (note ? ' — ' + note : ' — no reason yet'))}">⛔</span>`;
}
/* Click ô ⛔ → đảo trạng thái ngay, không hỏi han. Bỏ tick KHÔNG xoá
   lý do: thường bị cấm lại vì cùng lý do, giữ chữ đỡ phải gõ lại. */
function toggleBlock(cell){
  const row = cell.getRow().getData();
  const rid = row._rid;
  if(!rid) return;
  const on = !isRowBlocked(row);
  SC.edit(curTab, rid, BLOCK_F, on, on ? 'block' : 'unblock');
  try{ cell.getRow().reformat(); }catch(_){}
  try{ rowFormatter(cell.getRow()); }catch(_){}
  try{ if(typeof FCHECK!=='undefined') FCHECK.recompute(); }catch(_){}
  if(on && !rowBlockNote(row)){
    toast('⛔ BLOCKED — fill in "BLOCK NOTE" (after Remark) with the reason','er');
  } else {
    toast(on ? '⛔ BLOCKED' : '✅ Unblocked', on ? 'er' : 'ok');
  }
}
function blockTickColumn(){
  return {
    title:'⛔', field:BLOCK_F, width:56, hozAlign:'center', headerSort:true,
    cssClass:'cell-blk-tick',
    headerTooltip:'BLOCK — banned from loading. Click a cell to toggle.',
    sorter:(a,b)=>(a?1:0)-(b?1:0),
    formatter:blockTickFormatter,
    cellClick:(e,cell)=>{ toggleBlock(cell); }
  };
}
function blockNoteColumn(){
  return {
    title:'⛔ BLOCK NOTE', field:BLOCK_N, minWidth:220, editor:'input',
    headerSort:false, cssClass:'cell-blk-note',
    headerTooltip:'Reason shown everywhere the block is warned about',
    formatter:c=>{
      const v = c.getValue();
      if(v) return `<span class="blk-note-txt">${escapeHtml(v)}</span>`;
      return isRowBlocked(c.getRow().getData())
        ? `<span class="blk-note-txt miss">⚠ no reason — click to fill</span>`
        : `<span class="blk-note-txt none">—</span>`;
    }
  };
}

/* ============================================================
   v4.130 — QUYỀN THEO Ô TRÊN LƯỚI FLEET
   ------------------------------------------------------------
   Vai trò không có quyền cả vùng 'fleet' (hiện tại: sale, viewer) thì lưới
   phải KHOÁ CỨNG bằng mắt, không chỉ chặn lúc ghi: gỡ `editor` khỏi mọi cột
   trừ những ô AUTH.canWriteField() cho phép, và thay `cellClick` (ô 🗑 xoá
   dòng, ô ⛔ tick block) bằng câu từ chối.
   ⚠ Ô 🗑 và ô ⛔ KHÔNG có editor — chúng ghi qua cellClick, nên gỡ editor
   thôi là chưa đủ.
   Khoá thật vẫn nằm ở SC.applyAndPush + cổng đường dẫn trong auth.js.
   ============================================================ */
function applyFleetFieldPerm(cols){
  try{
    if(typeof canWrite !== 'function' || canWrite('fleet')) return cols;   /* toàn quyền → giữ nguyên */
    const fw = (typeof AUTH !== 'undefined' && AUTH && AUTH.canWriteField) ? AUTH.canWriteField : null;
    cols.forEach(c=>{
      const allow = !!(fw && c.field && fw('fleet', curTab, c.field));
      if(allow) return;
      delete c.editor;
      if(c.cellClick) c.cellClick = ()=>{ toast('You do not have permission to edit','er'); };
    });
  }catch(_){}
  return cols;
}

function buildColumns(){
  const d=CERT_DEFS[curTab];
  if(curTab==='twavg'){
    return applyFleetFieldPerm([
      {title:'#',field:'stt',width:50,hozAlign:'center',editor:'number',headerSort:true,
        sorter:'number',cssClass:'cell-num'},
      {title:'Truck',field:'truck',width:150,editor:'input',cssClass:'cell-plate'},
      {title:'Rmooc',field:'rmooc',width:140,editor:'input'},
      {title:'Avg Wt (kg)',field:'avgWt',width:130,editor:'number',cssClass:'cell-avgwt',
        formatter:c=>c.getValue()?Number(c.getValue()).toLocaleString():''},
      {title:'Remark',field:'remark',editor:'input'},
      blockNoteColumn(),
      blockTickColumn(),
      {title:'Last Edit',field:'lastAt',width:90,headerSort:true,formatter:lastEditFormatter,cssClass:'cell-lastedit-wrap'},
      {title:'🗑',width:44,hozAlign:'center',headerSort:false,formatter:()=>'✕',cssClass:'cell-del',
        cellClick:(e,cell)=>{ requestDeleteRow(cell.getRow().getData()); }}
    ]);
  }
  const cols=[{title:'#',field:'stt',width:50,hozAlign:'center',editor:'number',
    headerSort:true, sorter:'number', cssClass:'cell-num',frozen:true}];
  // alert badge
  cols.push({
    title:'⚠', field:'_alert', width:50, hozAlign:'center', headerSort:false,
    cssClass:'cell-alert', frozen:true,
    formatter:c=>{
      const r = c.getRow().getData();
      const n = missingCount(r);
      if(!n) return '';
      return `<span class="alert-pill" title="${n} cert field${n>1?'s':''} missing or invalid">${n}</span>`;
    }
  });
  if(d.kind==='driver'){
    cols.push({title:'Driver Name',field:'name',width:190,editor:'input',cssClass:'cell-plate',frozen:true});
    cols.push({title:'Phone',field:'phone',width:130,editor:'input',cssClass:'cell-phone'});
  }else{
    cols.push({title:'Plate',field:'plate',width:130,editor:'input',cssClass:'cell-plate',frozen:true});
    if(d.hasCap){
      cols.push({title:'Cap m³',field:'cap',width:90,editor:'number',cssClass:'cell-cap',formatter:c=>c.getValue()?c.getValue()+' m³':''});
      cols.push({title:'Safe Fill T',field:'_safefill',width:100,cssClass:'cell-safefill',headerSort:false,
        formatter:c=>{const cap=c.getRow().getData().cap;return cap?(cap*sfDensity()*sfFillPct()).toFixed(2):'';}});
    }
  }
  d.certs.forEach(c=>{ cols.push({title:c.name,field:c.k,minWidth:118,editor:'input',formatter:dateFormatter,headerSort:false}); });
  cols.push({title:'Remark',field:'remark',width:90,editor:'input'});
  /* v4.83 — cặp BLOCK đứng liền nhau ngay sau Remark: lý do trước, tick sau. */
  cols.push(blockNoteColumn());
  cols.push(blockTickColumn());
  cols.push({title:'Last Edit',field:'lastAt',width:90,headerSort:true,formatter:lastEditFormatter,cssClass:'cell-lastedit-wrap'});
  // Delete column — rightmost
  cols.push({title:'🗑',width:44,hozAlign:'center',headerSort:false,formatter:()=>'✕',cssClass:'cell-del',
    cellClick:(e,cell)=>{ requestDeleteRow(cell.getRow().getData()); }});
  return applyFleetFieldPerm(cols);
}
function rowFormatter(row){
  const el=row.getElement();
  el.classList.remove('row-exp','row-due','row-missing','row-blocked');
  const data = row.getData();
  /* ⛔ BLOCK thắng mọi trạng thái cert — tô nền xám-đỏ cho cả dòng. */
  if(isRowBlocked(data)) el.classList.add('row-blocked');
  if(curTab!=='twavg'){
    const miss = missingCount(data);
    const st = rowState(data);
    if(miss>0) el.classList.add('row-missing');
    if(st==='exp') el.classList.add('row-exp');
    else if(st==='due') el.classList.add('row-due');
  }
}

/* tab-race guard (kept from p1-fleet-fb) */
let tableBusy=false;
function destroyTable(){ if(table){ try{ table.destroy(); }catch(e){} table=null; } }
function tabRows(){
  if(curTab==='twavg') return Object.values(DATA.twavg||{});
  const rows = Object.values(DATA[curTab]||{});
  // sort: BLOCKED first; then missing certs; among complete rows: exp → due → ok by soonest expiry
  rows.sort((a,b)=>{
    const ba = isRowBlocked(a)?0:1, bb = isRowBlocked(b)?0:1;
    if(ba !== bb) return ba - bb;
    const ka = rowSortKey(a), kb = rowSortKey(b);
    if(ka.miss !== kb.miss)     return kb.miss - ka.miss;        // more missing → top
    if(ka.stRank !== kb.stRank) return ka.stRank - kb.stRank;    // exp → due → ok
    if(ka.soonest !== kb.soonest) return ka.soonest - kb.soonest;// soonest expiry → top
    return (a.stt||0) - (b.stt||0);
  });
  return rows;
}
function rebuildTableData(){
  if(!table){ buildTable(); return; }
  try{ table.replaceData(tabRows()); }catch(e){ buildTable(); }
  refreshCounts();
}
function buildTable(){
  destroyTable();
  table=new Tabulator('#fleetGrid',{
    data:tabRows(),
    layout:'fitDataStretch',
    height:'100%',
    index:'_rid',                                  // keyed by stable rid
    columns:buildColumns(),
    rowFormatter:rowFormatter,
    placeholder:'No vehicles — use “Paste from Excel” to import',
    clipboard:true, clipboardPasteAction:'replace'
  });
  table.on('tableBuilt',()=>{ applyFilter(); refreshCounts(); });
  /* CRITICAL: edits go via Sync Core */
  table.on('cellEdited', cell=>{
    const field = cell.getField();
    const rid   = cell.getRow().getData()._rid;
    const value = cell.getValue();
    SC.edit(curTab, rid, field, value, 'edit');
    /* v4 FIX — "Safe Fill T" is a derived formatter computed from Cap m³.
       Editing Cap didn't redraw that cell, so the new safe-fill only showed
       after switching tabs and back. Reformat the edited row so the computed
       value appears immediately. */
    if(field==='cap'){ try{ cell.getRow().reformat(); }catch(_){} }
    setTimeout(()=>{ table.getRows().forEach(r=>rowFormatter(r)); refreshCounts(); }, 30);
    try{ if(typeof FCHECK!=='undefined') FCHECK.recompute(); }catch(_){}
  });
}

/* ============================================================
   SAFE FILL
   ============================================================ */
function sfDensity(){return parseFloat(document.getElementById('sfDensity').value)||0.538;}
function sfFillPct(){return (parseFloat(document.getElementById('sfFill').value)||90)/100;}
function recalcSafeFill(){
  document.getElementById('sfD2').textContent=sfDensity().toFixed(3);
  document.getElementById('sfF2').textContent=(sfFillPct()*100).toFixed(0);
  if(table) table.redraw(true);
}


/* ============================================================
   DELETE ROW — with "Confirm" typing requirement
   ============================================================ */
let _pendingDeleteRid = null;
function requestDeleteRow(rowData){
  _pendingDeleteRid = rowData._rid;
  const name = rowData.plate || rowData.name || rowData.truck || ('row '+(rowData.stt||'?'));
  document.getElementById('delConfirmMsg').innerHTML =
    'Delete row <b>"'+escapeHtml(name)+'"</b> from '+CERT_DEFS[curTab].label+'?<br>This cannot be undone.';
  document.getElementById('delConfirmInput').value = '';
  document.getElementById('delConfirmBtn').classList.remove('ready');
  document.getElementById('delConfirmModal').classList.add('on');
  setTimeout(()=> document.getElementById('delConfirmInput').focus(), 80);
}
document.addEventListener('input', e=>{
  if(e.target.id==='delConfirmInput'){
    const ok = e.target.value.trim().toLowerCase() === 'confirm';
    document.getElementById('delConfirmBtn').classList.toggle('ready', ok);
  }
});
function closeDelConfirm(){
  document.getElementById('delConfirmModal').classList.remove('on');
  _pendingDeleteRid = null;
  /* v4.33.1 — modules (CT/PP/TP/WG/WS/SP…) override delConfirmBtn.onclick for
     their own deletes; always restore the default Fleet handler on close so a
     later Fleet row-delete never fires a stale module handler. */
  try{ document.getElementById('delConfirmBtn').onclick = executeDelete; }catch(_){}
}
function executeDelete(){
  if(!_pendingDeleteRid) return;
  if(document.getElementById('delConfirmInput').value.trim().toLowerCase() !== 'confirm'){
    toast('Type "Confirm" to delete','er'); return;
  }
  SC.deleteRow(curTab, _pendingDeleteRid, 'delete');
  try{ if(table){ const r=table.getRow(_pendingDeleteRid); if(r) r.delete(); } }catch(_){}
  refreshCounts(); buildFleetSubs();
  closeDelConfirm();
  toast('Row deleted','ok');
}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

/* ── Global ESC → close the top-most open modal/overlay ──────────────
   Any overlay shown via the `.on` convention (fixed/absolute container) is
   dismissable with Escape. The `.on` class is also used on chips/tabs, but
   those are statically positioned and excluded here. Pasted text is wiped on
   close so a re-open always starts empty (paste data is never retained). */
document.addEventListener('keydown', function(e){
  if(e.key !== 'Escape' && e.keyCode !== 27) return;
  let top = null;
  document.querySelectorAll('.on').forEach(el=>{
    const cs = getComputedStyle(el);
    if(cs.display === 'none') return;
    if(cs.position !== 'fixed' && cs.position !== 'absolute') return;
    top = el;   // last match in DOM order ≈ top-most overlay
  });
  if(!top) return;
  e.preventDefault();
  try{ top.querySelectorAll('textarea').forEach(t=>{ t.value = ''; }); }catch(_){}
  top.classList.remove('on');
}, true);

/* Clear all rows in current tab */
function clearAllInTab(){
  const n = Object.keys(DATA[curTab]||{}).length;
  if(!n){ toast('Already empty','er'); return; }
  if(!confirm('Clear ALL '+n+' rows in '+CERT_DEFS[curTab].label+'?\nThis cannot be undone.')) return;
  SC.wipeArea(curTab, 'clear all '+CERT_DEFS[curTab].label);
  rebuildTableData(); buildFleetSubs();
}

/* ============================================================
   FILTER / SEARCH / COUNTS
   ============================================================ */
function setFilt(f){curFilt=f;
  document.querySelectorAll('.filt').forEach(b=>b.classList.toggle('on',b.dataset.filt===f));
  applyFilter();}
function applyFilter(){
  if(!table)return;
  const q=document.getElementById('fleetSearch').value.trim().toLowerCase();
  table.setFilter(row=>{
    if(q){ const hay=(row.plate||'')+(row.name||'')+(row.truck||'')+(row.rmooc||'');
      if(!hay.toLowerCase().includes(q))return false; }
    if(curFilt==='all'||curTab==='twavg')return true;
    const st=rowState(row);
    if(curFilt==='valid')return st==='ok'||st==='none';
    if(curFilt==='due')return st==='due';
    if(curFilt==='exp')return st==='exp';
    return true;
  });
  refreshCounts();
}
function refreshCounts(){
  const all=tabRows();let v=0,du=0,e=0;
  if(curTab!=='twavg') all.forEach(r=>{const s=rowState(r);if(s==='exp')e++;else if(s==='due')du++;else v++;});
  document.getElementById('cntValid').textContent=v;
  document.getElementById('cntDue').textContent=du;
  document.getElementById('cntExp').textContent=e;
  document.getElementById('cntTotal').textContent=all.length;
  document.getElementById('cntShown').textContent=table?table.getRows('active').length:all.length;
}
document.getElementById('fleetSearch').addEventListener('input',applyFilter);

/* ============================================================
   VIEW TOGGLE
   ============================================================ */
function setView(v){curView=v;
  document.getElementById('vtCompact').classList.toggle('on',v==='compact');
  document.getElementById('vtFull').classList.toggle('on',v==='full');
  toast(v==='full'?'Full view (extra columns) — coming soon':'Compact view',v==='full'?'':'ok');
}

/* ============================================================
   SWITCH SUB-TAB  (re-entry guard preserved)
   ============================================================ */
function switchFleetTab(t){
  if(tableBusy) return;
  if(t===curTab && table) return;
  tableBusy=true;
  curTab=t;
  document.querySelectorAll('#fleetSubs .stab').forEach(s=>s.classList.toggle('on',s.dataset.sub===t));
  const d=CERT_DEFS[t];const bar=document.getElementById('safefillBar');
  if(d.safefill){bar.classList.add('on');document.getElementById('sfLabel').textContent=d.safefill;}
  else bar.classList.remove('on');
  document.getElementById('fleetSearch').placeholder = d.kind==='driver'?'Search driver name…':'Search plate…';
  requestAnimationFrame(()=>{ buildTable(); tableBusy=false; });
}

/* ============================================================
   PASTE / ADD / EXPORT
   ============================================================ */
function openPaste(){document.getElementById('pasteModal').classList.add('on');
  setTimeout(()=>document.getElementById('pasteArea').focus(),50);}
function closePaste(){document.getElementById('pasteModal').classList.remove('on');}
/* v4.127 — khoá định danh một dòng TW AVG.
   Chuẩn hoá biển số về CHỮ+SỐ viết hoa nên '51R-20972', '51r 20972' và
   '51R20972' là MỘT. Trả '' khi thiếu biển đầu xe ⇒ dòng đó bị bỏ qua. */
function twavgKey(r){
  const p = v => String(v==null?'':v).toUpperCase().replace(/[^0-9A-Z]/g,'');
  const t = p(r && (r.truck || r.plate));
  return t ? t + '|' + p(r && r.rmooc) : '';
}
/* Khoá NỚI: cùng đầu xe, rơ-moóc TRỐNG. Dùng để vá những dòng cũ nhập thiếu
   rơ-moóc — dán bảng mới sẽ điền rơ-moóc vào dòng đó thay vì đẻ dòng trùng. */
function twavgAltKey(r){
  const p = v => String(v==null?'':v).toUpperCase().replace(/[^0-9A-Z]/g,'');
  const t = p(r && (r.truck || r.plate));
  return t ? t + '|' : '';
}
function doPaste(){
  /* v4.56 — extra confirm: Fleet cert tabs are usually a first-time load only */
  var _flLabel = 'Fleet';
  try{ _flLabel = 'Fleet — ' + ((CERT_DEFS[curTab] && CERT_DEFS[curTab].label) || curTab); }catch(_){}
  if(window.PASTEGUARD && !PASTEGUARD.confirmFirst(_flLabel,'fleet',doPaste)) return;
  const txt=document.getElementById('pasteArea').value.trim();
  if(!txt){toast('Nothing to paste','er');return;}
  const lines=txt.split(/\r?\n/).filter(l=>l.trim());
  const delim = lines[0].includes('\t')?'\t':',';
  /* Detect & skip the derived "Safe Fill (T)" column (it sits right after Cap
     in the Excel export but is computed from Cap, not stored). */
  const hdr=lines[0].split(delim).map(x=>x.trim().toLowerCase());
  const hasSafeFillCol=hdr.some(h=>h.includes('safe fill'));
  const rows=lines.slice(1).map((l,i)=>{ const c=l.split(delim).map(x=>x.trim()); return mapPasteRow(c,i+1,hasSafeFillCol); });
  /* v4.127 — TW AVG dán theo kiểu GỘP, không thay thế cả bảng.
     Bảng này được nạp NHIỀU LẦN (mỗi quý tính lại trung bình xe rỗng từ dữ
     liệu cân), và mỗi lần chỉ có một PHẦN đội xe. replaceTab sẽ xoá sạch số
     xe không nằm trong lần dán đó — đúng thứ không được phép mất. Khoá định
     danh là CẶP đầu xe + rơ-moóc: cùng một đầu kéo đổi rơ-moóc thì khối
     lượng rỗng lệch tới hơn 2.500 kg nên phải là hai dòng riêng. */
  if(curTab === 'twavg'){
    const valid = rows.filter(r => twavgKey(r));
    if(!valid.length){ toast('No vehicle rows found — check the Truck column','er'); return; }
    /* Số thứ tự (#) là nhãn do nhân viên tự đánh, KHÔNG phải khoá. Dòng đã có
       giữ nguyên số cũ; dòng mới đánh tiếp từ số lớn nhất đang có để không
       đụng số của những xe lần này không dán. */
    let _nextStt = 0;
    try{ Object.values(DATA.twavg||{}).forEach(r=>{ const n=parseInt(r&&r.stt,10);
         if(!isNaN(n) && n>_nextStt) _nextStt=n; }); }catch(_){}
    const st = SC.upsertRows('twavg', valid, twavgKey,
                             'paste merge '+valid.length+' rows', twavgAltKey, {
      onUpdate: (nw)=>{ const o = Object.assign({}, nw); delete o.stt; return o; },
      onAdd:    (nw)=>Object.assign({}, nw, { stt: ++_nextStt })
    });
    closePaste();
    rebuildTableData(); buildFleetSubs();
    document.getElementById('pasteArea').value='';
    toast('TW AVG merged — '+st.updated+' updated, '+st.added+' added, '
          +st.unchanged+' unchanged, '+st.kept+' left untouched','ok');
    return;
  }
  /* v4.80 — Excel KHÔNG có cột ⛔ BLOCK, mà replaceTab xoá sạch tab rồi ghi lại.
     Nếu không gánh lại cờ cấm thì mỗi lần paste cert mới là lệnh cấm biến mất
     âm thầm — đúng thứ tuyệt đối không được mất. Snapshot theo khoá định danh
     (plate / tên tài xế / truck) rồi gắn lại vào row mới cùng khoá. */
  try{
    const _bKey = r => String(r.plate || r.name || r.truck || '')
                        .trim().toUpperCase().replace(/\s+/g,' ');
    const keep = {};
    Object.values(DATA[curTab]||{}).forEach(r=>{
      if(!isRowBlocked(r)) return;
      const k = _bKey(r); if(k) keep[k] = rowBlockNote(r);
    });
    let carried = 0;
    rows.forEach(r=>{
      const k = _bKey(r);
      if(k && Object.prototype.hasOwnProperty.call(keep,k)){
        r[BLOCK_F] = true; r[BLOCK_N] = keep[k]; carried++;
      }
    });
    if(carried) setTimeout(()=>toast('⛔ Giữ lại '+carried+' lệnh cấm sau khi paste','er'), 2700);
  }catch(_){}
  if(rows.length){
    SC.replaceTab(curTab, rows, 'paste '+rows.length+' rows');
    closePaste();
    rebuildTableData(); buildFleetSubs();
    document.getElementById('pasteArea').value='';
    toast(`Imported ${rows.length} rows into ${CERT_DEFS[curTab].label}`,'ok');
  } else toast('Could not parse rows','er');
}
function mapPasteRow(c,stt,hasSafeFillCol){
  const d=CERT_DEFS[curTab];
  if(curTab==='twavg') return {stt:+c[0]||stt,truck:c[1]||'',rmooc:c[2]||'',avgWt:+(String(c[3]||'').replace(/[^\d]/g,''))||0,remark:c[4]||''};
  if(d.kind==='driver') return {stt:+c[0]||stt,name:c[1]||'',phone:c[2]||'',license:c[3]||'',fireSafety:c[4]||'',hazmat:c[5]||'',remark:c[6]||''};
  const r={stt:+c[0]||stt,plate:c[1]||''};let idx=2;
  if(d.hasCap){r.cap=parseFloat(String(c[2]||'').replace(/[^\d.]/g,''))||0;idx=3;
    if(hasSafeFillCol) idx++;}   // skip derived "Safe Fill (T)" column
  d.certs.forEach((cert,i)=>{r[cert.k]=c[idx+i]||'';});
  r.remark=c[idx+d.certs.length]||'';
  return r;
}
function addRow(){
  const d=CERT_DEFS[curTab];
  let r={stt:'',remark:''};  // STT is manually entered by staff
  if(curTab==='twavg')Object.assign(r,{truck:'',rmooc:'',avgWt:0});
  else if(d.kind==='driver')Object.assign(r,{name:'',phone:''});
  else r.plate='';
  SC.addRow(curTab, r, 'add row');
  rebuildTableData(); buildFleetSubs();
  toast('Row added — enter STT number manually','ok');
}
function exportCsv(){ if(table) table.download('csv',`fleet_${curTab}_${Date.now()}.csv`); }

/* resizer removed in v4.5.0 — full-width table */

/* ============================================================
   CLOCK + TOAST + ESC + LAST-EDIT TICK
   ============================================================ */
const WD=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
(function clk(){const tick=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');
  document.getElementById('clk').textContent=`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  document.getElementById('dat').textContent=`${WD[d.getDay()]} ${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()}`;};
  tick();setInterval(tick,1000);})();
/* re-render "5m ago" labels every minute (only the lastAt column) */
setInterval(()=>{ if(table) table.redraw(); }, 60000);

let toastT;function toast(m,t){const el=document.getElementById('toast');el.textContent=m;el.className='show '+(t||'');
  clearTimeout(toastT);toastT=setTimeout(()=>el.className='',2600);}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closePaste();
  closeDelConfirm();}});

/* ============================================================
   FIREBASE PERMISSION-DENIED WARNING  (v4.62)
   ------------------------------------------------------------
   RTDB rules only allow read/write when the user is SIGNED IN
   AND present in the active whitelist. When the auth token drops
   (session expired / offline / tab left idle overnight) the rule
   fails and Firebase throws PERMISSION_DENIED. Before this, writes
   failed silently (console.warn only) and reads just showed blank —
   so staff "saved" opening stock / %wt / notify confirms that never
   landed, with no warning. This surfaces the error loudly and bounces
   the operator to the sign-in screen so nothing is lost silently.

   Usage:
     .catch(e => fbErr(e, 'Opening stock'))     // writes
     ref.on('value', ok, e => fbErr(e, 'Load')) // reads
   Returns true if the error was a permission denial.
   ============================================================ */
function isFbPermissionDenied(e){
  if(!e) return false;
  var c = String(e.code || '').toUpperCase();
  var m = String(e.message || e || '').toLowerCase();
  return c.indexOf('PERMISSION_DENIED') >= 0
      || m.indexOf('permission_denied') >= 0
      || m.indexOf('permission denied') >= 0;
}
var _fbDeniedAt = 0;
function fbErr(e, ctx){
  console.warn('[FB] error' + (ctx ? ' · ' + ctx : ''), e);
  if(isFbPermissionDenied(e)){
    var where = ctx ? (ctx + ' — ') : '';
    try{ toast('⛔ ' + where + 'blocked: your session expired or you are not authorized. Please sign in again.', 'er'); }catch(_){}
    /* Throttle so a burst of failures doesn't repeatedly force a sign-out. */
    var now = Date.now();
    if(now - _fbDeniedAt > 5000){
      _fbDeniedAt = now;
      /* If the session is actually gone, send them back to the login screen
         to re-authenticate (onAuthStateChanged will re-show it on sign-out). */
      var noSession = !(window.firebase && firebase.auth && firebase.auth().currentUser);
      if(noSession && window.AUTH && typeof AUTH.logout === 'function'){
        setTimeout(function(){ try{ AUTH.logout(); }catch(_){} }, 1800);
      }
    }
    return true;
  }
  /* Any other failure (network, etc.) — still tell the user, don't fail silent. */
  try{ toast((ctx ? ctx + ': ' : '') + 'save failed — check your connection and try again.', 'er'); }catch(_){}
  return false;
}
window.isFbPermissionDenied = isFbPermissionDenied;
window.fbErr = fbErr;

/* ============================================================
   USER CHIP (top-right) reflects CURRENT_USER
   ============================================================ */
(function paintUser(){
  const av=document.querySelector('.nav-user .avatar');
  const un=document.querySelector('.nav-user .uname');
  const ur=document.querySelector('.nav-user .urole');
  if(av) av.textContent=(CURRENT_USER.name[0]||'?').toUpperCase();
  if(un) un.textContent=CURRENT_USER.name;
  if(ur) ur.textContent=CURRENT_USER.role.charAt(0).toUpperCase()+CURRENT_USER.role.slice(1);
})();

/* ============================================================
   TODAY PLAN MODULE  (build p1.9-wms-gi)
   ─────────────────────────────────────────────────────────
   Sync model (aligned with Fleet Sync Core):
     - Per-field delta writes via multi-path update.
     - localStorage cache (key 'lpg_v4_plan_v1') for instant, offline-safe UI.
     - Own version counter node 'plan_today_version' (bumped per write batch).
   Identity:
     - Each row has a SINGLE source-of-truth identifier: _oid.
       Default value: doNum if it looks real (>=7 digits), else
       an auto-generated temp id 'TMP-YYYYMMDD-NNN'. The _oid IS
       the Firebase key (plan_today_/{oid}/{field}). It is also
       displayed as the last column ("DO Var") and is user-editable.
     - Cross-paste matching uses a positional fingerprint
       (customer | driver | plate | row-no | load-date) so a re-paste
       can resolve "same order" and preserve _oid + status even when
       the order has no real DO yet.
   ============================================================ */
/* ─────────────────────────────────────────────────────────────────────
   PLAN MODULE FACTORY — used by TP (today) and TMR (tomorrow).
   opts = { kind, idPrefix, fbNode, versionKey, lsKey, permKey,
            uiLabel, defaultDate }
   Both instances are independent (own Firebase node, own cache, own
   Tabulator table, own modals). They share no state.
   ───────────────────────────────────────────────────────────────────── */
