/* ============================================================
 * BULKOPS  —  bulkops.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 13362–13521   (~160 dòng)
 * Global xuất ra : window.BULKOPS
 * Phase tách     : P3
 * Phụ thuộc      : sync
 * Khởi tạo (boot): (gọi theo nhu cầu)
 * ------------------------------------------------------------
 * MÔ TẢ: Thao tác hàng loạt (bulk import/clear) cho các bảng dữ liệu.
 *
 * API công khai (điền/đối chiếu khi tách):
 *   BULKOPS.run(...)
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module BULKOPS từ dòng 13362 đến 13521.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.BULKOPS).
 *   3) node --check bulkops.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P3]: dán thân module BULKOPS (V4-54 dòng 13362–13521) vào đây. */

const BULKOPS = (function(){
  let _cfg = null;

  function _dayStart(v){ if(!v) return null; const p=v.split('-').map(Number); if(p.length<3||!p[0]) return null; return new Date(p[0],p[1]-1,p[2],0,0,0,0); }
  function _dayEnd(v){ if(!v) return null; const p=v.split('-').map(Number); if(p.length<3||!p[0]) return null; return new Date(p[0],p[1]-1,p[2],23,59,59,999); }
  function _iso(d){ const p2=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate()); }

  /* matched rids for a mode: 'in' = inside [from,to]; 'keep' = outside [from,to].
     Returns {match:[rids], total, skipped} (skipped = rows with no date). */
  function _compute(mode, fromV, toV){
    const rows = _cfg.getRows() || [];
    /* 'all' = every row (used by the DELETE ALL side — no date range). */
    if(mode==='all'){ return { match: rows.slice(), total: rows.length, skipped: 0 }; }
    const from = _dayStart(fromV), to = _dayEnd(toV);
    const match = []; let skipped = 0;
    rows.forEach(r=>{
      const d = _cfg.getDate(r);
      if(!d || isNaN(d.getTime())){ skipped++; return; }
      const inside = (!from || d>=from) && (!to || d<=to);
      if(mode==='in' ? inside : !inside) match.push(r);
    });
    return { match, total: rows.length, skipped };
  }

  function _refresh(){
    if(!_cfg) return;
    const k = _compute('keep', val('bdKeepFrom'), val('bdKeepTo'));
    const a = _compute('all');
    document.getElementById('bdKeepStat').innerHTML =
      'Total '+k.total+' · <b class="keep">keep '+(k.total-k.match.length-k.skipped)+'</b> · delete '+k.match.length
      + (k.skipped? ' · <span class="bd-skip">'+k.skipped+' no-date skipped</span>':'');
    document.getElementById('bdInStat').innerHTML =
      'Total '+a.total+' · keep 0 · <b class="del">delete ALL '+a.match.length+'</b>';
    _syncBtn('bdKeepInput','bdKeepBtn','keep', k.match.length);
    _syncBtn('bdInInput','bdInBtn','del', a.match.length);
  }
  function _syncBtn(inputId, btnId, cls, n){
    const ok = document.getElementById(inputId).value.trim().toLowerCase()==='delete' && n>0;
    const b = document.getElementById(btnId);
    b.classList.toggle('ready', ok);
  }
  function val(id){ return document.getElementById(id).value; }

  function _run(mode){
    const inputId = mode==='keep'?'bdKeepInput':'bdInInput';
    if(document.getElementById(inputId).value.trim().toLowerCase()!=='delete'){ toast('Type "Delete" to confirm','er'); return; }

    let res, fileSuffix;
    if(mode==='all'){
      res = _compute('all');
      if(!res.match.length){ toast('No data to delete','er'); return; }
      /* SECOND confirmation — deliberate extra step so DELETE ALL can't be
         triggered by a single accidental click. */
      if(!confirm('⚠️ CẢNH BÁO CUỐI CÙNG\n\nBạn sắp XÓA TOÀN BỘ '+res.match.length+' dòng dữ liệu của bảng này.\nHành động KHÔNG THỂ HOÀN TÁC.\n\nNhấn OK để xác nhận xóa tất cả, hoặc Cancel để hủy.')) return;
      fileSuffix = '_deleted_ALL';
    } else {
      res = _compute('keep', val('bdKeepFrom'), val('bdKeepTo'));
      if(!res.match.length){ toast('Nothing in range to delete','er'); return; }
      fileSuffix = '_deleted';
    }

    /* capture before closeRangeDelete() nulls _cfg */
    const skipCsv = !!_cfg.skipCsvBackup;
    /* 1) export the rows that will be deleted (CSV backup) — skipped for modules that opt out */
    if(!skipCsv) exportRowsCsv(_cfg.fileBase+fileSuffix, _cfg.columns, res.match);
    /* 2) delete via the caller's delta path */
    const rids = res.match.map(r=>_cfg.getRid(r));
    _cfg.deleteRids(rids);
    closeRangeDelete();
    toast('🗑 Deleted '+rids.length+' rows'+(skipCsv?'':' (CSV backup downloaded)'),'ok');
  }

  function openRangeDelete(cfg){
    _cfg = cfg;
    document.getElementById('bulkDelTitle').textContent = cfg.title || 'DELETE DATA';
    const rows = cfg.getRows() || [];
    let min=null;
    rows.forEach(r=>{ const d=cfg.getDate(r); if(d&&!isNaN(d.getTime())){ if(!min||d<min)min=d; } });
    const today = new Date(); const tIso=_iso(today);
    const minIso = min?_iso(min):tIso;
    /* v4.39.0 — default the modal to a 7-day rolling retention:
       KEEP   = last 7 days incl. today  → [today-6 .. today], pressing
                "DELETE OUTSIDE range" keeps only the last 7 days.
       DELETE = everything older than that window → [earliest .. today-7].
       Both are only defaults; the operator can edit either date. */
    const _shift=n=>{ const d=new Date(today); d.setDate(d.getDate()+n); return _iso(d); };
    const keepFromIso=_shift(-6), keepToIso=tIso;
    document.getElementById('bdKeepFrom').value = keepFromIso;
    document.getElementById('bdKeepTo').value   = keepToIso;
    document.getElementById('bdKeepInput').value = '';
    document.getElementById('bdInInput').value   = '';
    _refresh();
    document.getElementById('bulkDelModal').classList.add('on');
  }
  function closeRangeDelete(){ document.getElementById('bulkDelModal').classList.remove('on'); _cfg=null; }

  /* CSV + BOM (matches app convention; re-importable). columns=[{title,field}] */
  function exportRowsCsv(fileBase, columns, rows){
    const esc = v => { v = String(v==null?'':v); return /[",\n\r]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v; };
    const lines = [ columns.map(c=>esc(c.title)).join(',') ];
    rows.forEach(r=>{ lines.push(columns.map(c=> esc(typeof c.get==='function'? c.get(r) : r[c.field])).join(',')); });
    const blob = new Blob(['\uFEFF'+lines.join('\n')], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const d = new Date(); const p2=n=>String(n).padStart(2,'0');
    const a = document.createElement('a');
    a.href = url;
    a.download = fileBase+'_'+d.getFullYear()+p2(d.getMonth()+1)+p2(d.getDate())+'_'+p2(d.getHours())+p2(d.getMinutes())+p2(d.getSeconds())+'.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* wire modal events once */
  function _init(){
    ['bdKeepFrom','bdKeepTo','bdKeepInput','bdInInput'].forEach(id=>{
      document.getElementById(id).addEventListener('input', _refresh);
      document.getElementById(id).addEventListener('change', _refresh);
    });
    document.getElementById('bdKeepBtn').addEventListener('click', ()=>_run('keep'));
    document.getElementById('bdInBtn').addEventListener('click', ()=>_run('all'));
    document.getElementById('bulkDelModal').addEventListener('click', e=>{ if(e.target.id==='bulkDelModal') closeRangeDelete(); });
  }
  if(document.getElementById('bulkDelModal')) _init();
  else document.addEventListener('DOMContentLoaded', _init);

  return { openRangeDelete, closeRangeDelete, exportRowsCsv };
})();

function wgRangeDelete(){ WG.rangeDelete(); }
function wgExportCsv(){ WG.exportCsv(); }
function wgOpenPicker(){ WG.openPicker(); }
function wgClearDate(){ WG.clearDate(); }

/* live search + date-filter wiring */
document.getElementById('wgSearch').addEventListener('input', ()=>{ if(WG.table) WG.rebuildTableData(); });
document.getElementById('wgDateFilter').addEventListener('change', ()=>{ WG.applyTextFilter(); });
document.getElementById('wgDatePick').addEventListener('change', ()=>{ WG.pickerChange(); });

/* close WMS GI modals on Escape */
document.addEventListener('keydown', e=>{
  if(e.key === 'Escape'){
    document.getElementById('wgPasteModal').classList.remove('on');
    document.getElementById('wgDiffModal').classList.remove('on');
  }
});

/* ============================================================
   WMS ST MODULE  (build p2.0-wms-st)
   ─────────────────────────────────────────────────────────
   Stock-Transfer register imported from the WMS Excel export.
   Architecture mirrors WMS GI (WG module):
     - Per-field delta writes via multi-path update (wms_st_/{rid}/{field}).
     - localStorage cache (key 'lpg_v4_st_v1') for instant, offline-safe UI.
     - Own version counter node 'wms_st_version' (bumped per write batch).
     - rid = 12-char base36 random (collision-safe, offline-create friendly).
   Identity / paste merge:
     - Rows are matched on jobId (the WMS Job ID, e.g. SIT-2605280001).
       A re-paste UPDATES matching rows and ADDS new ones. Existing rows
       whose jobId is absent from the paste are KEPT (incremental).
   13 columns (0-12): WMS-Job-ID · Trans-Date · Product · From · To ·
     ERP-Trans-Date · Reason(Batch) · Type · Status · Remark · ERP-YN ·
     User · Share.
   Parsed fields stored per row:
     jobId, transDate, product, fromLoc, toLoc, erpDate, reason,
     txType, status, remark, erpYN, user, share,
     matCode (extracted), matLabel (C3/C4), kg (extracted weight).
   Analysis panel:
     Groups by tank (2100/2101) × batch (D/E) × direction × material.
     Reads RAM only (ROWS), no Firebase calls for display.
   Firebase path uses human-readable node names:
     wms_st_/{rid}/{field} — NOT cryptic hash keys.
   ============================================================ */
