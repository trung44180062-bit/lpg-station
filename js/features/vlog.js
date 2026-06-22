/* ============================================================
 * VLOG  —  vlog.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 24746–25058   (~313 dòng)
 * Global xuất ra : window.VLOG
 * Phase tách     : P5A
 * Phụ thuộc      : sync
 * Khởi tạo (boot): VLOG.init() trong boot
 * ------------------------------------------------------------
 * MÔ TẢ: Vessel Log: ROWS {date, type(Dom/Exp), qty/cTotal, ship, c3/cC3}.
 *
 * API công khai (điền/đối chiếu khi tách):
 *   VLOG.init(), VLOG.ROWS, VLOG.add(...)
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module VLOG từ dòng 24746 đến 25058.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.VLOG).
 *   3) node --check vlog.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P5A]: dán thân module VLOG (V4-54 dòng 24746–25058) vào đây. */

/* ===== BÓC TỪ V4-54 dòng 24746–25058 ===== */
const VLOG = (function(){
  'use strict';
  const FB_PATH = 'vessel_mix_log';

  let ROWS = [];                       // ordered for render
  let RID_MAP = Object.create(null);   // rid -> row object (same identity as ROWS[i])
  let _fbRef = null;
  let _suppressEcho = 0;
  let _attached = false;

  function _genRid(){
    return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  }
  function _esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
                        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function _n(v, d){
    if(v == null || isNaN(v) || v === '' || v === 0) return v === 0 ? '0' : '';
    const num = parseFloat(v);
    return isNaN(num) ? '' : num.toFixed(d != null ? d : 2);
  }
  function _w3(v){
    if(v == null || isNaN(v) || v === '' || v === 0) return '';
    return parseFloat(v).toFixed(3);
  }

  /* ---------- mutate map maintenance ---------- */
  function _setRow(rid, entry){
    entry = Object.assign({}, entry || {});
    entry._rid = rid;
    if(RID_MAP[rid]){
      const i = ROWS.findIndex(r => r._rid === rid);
      if(i >= 0) ROWS[i] = entry; else ROWS.push(entry);
    } else {
      ROWS.push(entry);
    }
    RID_MAP[rid] = entry;
  }
  function _removeRow(rid){
    if(!RID_MAP[rid]) return false;
    delete RID_MAP[rid];
    const i = ROWS.findIndex(r => r._rid === rid);
    if(i >= 0) ROWS.splice(i, 1);
    return true;
  }

  /* ---------- Firebase ---------- */
  function _attach(){
    if(_attached) return;
    if(typeof firebase === 'undefined' || !firebase.database){
      console.warn('[VLOG] firebase not loaded'); return;
    }
    _fbRef = firebase.database().ref(FB_PATH);
    /* child_added → initial backfill + incremental adds from other devices */
    _fbRef.on('child_added', snap=>{
      if(_suppressEcho > 0) return;
      const rid = snap.key, v = snap.val();
      if(v && typeof v === 'object'){ _setRow(rid, v); render(); }
    }, e=>console.warn('[VLOG] child_added', e));
    _fbRef.on('child_changed', snap=>{
      if(_suppressEcho > 0) return;
      const rid = snap.key, v = snap.val();
      if(v && typeof v === 'object'){ _setRow(rid, v); render(); }
    }, e=>console.warn('[VLOG] child_changed', e));
    _fbRef.on('child_removed', snap=>{
      if(_suppressEcho > 0) return;
      _removeRow(snap.key); render();
    }, e=>console.warn('[VLOG] child_removed', e));
    _attached = true;
    console.log('[VLOG] ✅ Init OK · listening to /'+FB_PATH);
  }

  function pushEntry(entry){
    /* Add (or overwrite by rid) a single entry. Returns the rid. */
    const rid = (entry && entry._rid) || _genRid();
    const payload = Object.assign({}, entry || {}, { _rid: rid, _ts: entry._ts || Date.now() });
    _setRow(rid, payload);
    if(_fbRef){
      _suppressEcho++;
      _fbRef.child(rid).set(payload)
        .catch(e => console.warn('[VLOG] push', e))
        .finally(()=> setTimeout(()=>{ _suppressEcho = Math.max(0, _suppressEcho-1); }, 400));
    }
    render();
    return rid;
  }

  function deleteRow(rid){
    if(!RID_MAP[rid]) return;
    const entry = RID_MAP[rid];
    if(!confirm('Delete vessel-mix entry?\n\nLot: '+(entry.lot||'—')+'\nTank: '+(entry.tank||'—')+'\nShip: '+(entry.ship||'—')+'\n\nThis writes one child deletion to Firebase.'))
      return;
    _removeRow(rid);
    if(_fbRef){
      _suppressEcho++;
      _fbRef.child(rid).set(null)
        .catch(e => console.warn('[VLOG] del', e))
        .finally(()=> setTimeout(()=>{ _suppressEcho = Math.max(0, _suppressEcho-1); }, 400));
    }
    render();
    toast('🗑 Deleted '+(entry.lot||'')+' '+(entry.tank||''), 'ok');
  }

  /* ---- Range-date delete (per-rid child delete; exports CSV backup first) ----
     Reads ONLY RAM (ROWS). Deletes matched rids as a SINGLE multi-path update
     (one Firebase write); other devices prune via the child_removed listener. */
  function rangeDelete(){
    if(!ROWS.length){ toast('Vessel Log is already empty',''); return; }
    BULKOPS.openRangeDelete({
      title:'DELETE DATA — Vessel Log',
      fileBase:'vessel_log',
      getRows: ()=> ROWS.slice(),
      getRid:  r=> r._rid,
      getDate: r=> (typeof parseDate==='function' ? parseDate(r.date) : null),
      columns: [
        {title:'Lot', get:e=>e.lot},{title:'Tank', get:e=>e.tank},
        {title:'Ship', get:e=>e.ship},{title:'Customer', get:e=>e.customer},
        {title:'Date', get:e=>e.date},{title:'Start', get:e=>e.tStart},
        {title:'Finish', get:e=>e.tEnd},
        {title:'Qty', get:e=> e.qty != null ? e.qty : (e.cTotal||'')},
        {title:'%Vol C3', get:e=>e.volC3},{title:'%Vol C4', get:e=>e.volC4},
        {title:'%Wt C3', get:e=>e.wtC3},{title:'%Wt C4', get:e=>e.wtC4},
        {title:'C3 Wt', get:e=>e.stC3},{title:'C4 Wt', get:e=>e.stC4},
        {title:'LPG Wt', get:e=> e.lpgWt || e.cTotal || ''},
        {title:'Quality', get:e=>e.quality},{title:'Remark', get:e=>e.remark}
      ],
      deleteRids: (rids)=>{
        const map = {};
        rids.forEach(rid=>{ _removeRow(rid); map[rid] = null; });
        if(_fbRef){
          _suppressEcho++;
          _fbRef.update(map)
            .catch(e => console.warn('[VLOG] range-del', e))
            .finally(()=> setTimeout(()=>{ _suppressEcho = Math.max(0, _suppressEcho-1); }, 400));
        }
        try{ logAudit('eng:vessel_log:range_delete','_bulk_','_rangeDelete', rids.length+' rows','','delete'); }catch(_){}
        render();
      }
    });
  }

  /* ---------- render ---------- */
  function _lotKey(s){
    const m = String(s||'').match(/(\d+)\s*$/);
    return m ? parseInt(m[1]) : 0;
  }

  function render(){
    const tbody = document.getElementById('vlogTbody');
    const empty = document.getElementById('vlogEmpty');
    const tbl   = document.getElementById('vlogTbl');
    const stats = document.getElementById('vlog-stats');
    const badge = document.getElementById('engBadgeShiplog');
    if(badge) badge.textContent = ROWS.length;
    if(!tbody) return;

    if(!ROWS.length){
      if(empty) empty.style.display = '';
      if(tbl)   tbl.style.display   = 'none';
      if(stats) stats.textContent   = '0';
      return;
    }

    /* sort: lot desc (newest), tie-broken by tank then _ts */
    const sorted = ROWS.slice().sort((a,b)=>{
      const la = _lotKey(a.lot), lb = _lotKey(b.lot);
      if(la !== lb) return lb - la;
      const ta = String(a.tank||''), tb = String(b.tank||'');
      if(ta !== tb) return ta.localeCompare(tb);
      return (b._ts||0) - (a._ts||0);
    });

    /* filters */
    const q   = (document.getElementById('vlog-q')?.value || '').toLowerCase().trim();
    const qV  = (document.getElementById('vlog-q-vol')?.value || '').trim();
    const qW  = (document.getElementById('vlog-q-wt')?.value  || '').trim();
    const filtered = sorted.filter(e=>{
      if(q){
        const hay = [e.lot, e.ship, e.customer, e.tank, e.date, e.type].join(' ').toLowerCase();
        if(!hay.includes(q)) return false;
      }
      if(qV){ const v = parseFloat(qV); if(!isNaN(v) && e.volC3 != null && Math.abs(e.volC3 - v) > 0.5) return false; }
      if(qW){ const w = parseFloat(qW); if(!isNaN(w) && e.wtC3  != null && Math.abs(e.wtC3  - w) > 0.5) return false; }
      return true;
    });

    if(empty) empty.style.display = 'none';
    if(tbl)   tbl.style.display   = '';
    if(stats) stats.innerHTML = '<b style="color:var(--blue)">'+filtered.length+'</b> / '+ROWS.length;

    let prevLot = '';
    tbody.innerHTML = filtered.map((e, i)=>{
      const isNew = (String(e.lot||'') !== prevLot);
      prevLot = String(e.lot||'');
      const tk = String(e.tank||'');
      const tkCls = tk === '1' ? 'vslog-tk-1'
                  : (tk === '2' ? 'vslog-tk-2' : 'vslog-tk-x');
      const qual = String(e.quality||'');
      const qualCls = qual === 'Pass' ? 'vslog-qual-pass'
                    : (qual === 'Fail' ? 'vslog-qual-fail' : '');
      const rid = String(e._rid||'').replace(/'/g, "\\'");
      return '<tr class="'+(isNew?'row-newlot':'')+'">'
        +'<td><div class="vslog-act">'
          +'<button class="vslog-act-btn edit" onclick="VLOG.openEdit(\''+rid+'\')" title="Edit">✏</button>'
          +'<button class="vslog-act-btn del" onclick="VLOG.deleteRow(\''+rid+'\')" title="Delete">✕</button>'
        +'</div></td>'
        +'<td style="color:var(--ink-3)">'+(i+1)+'</td>'
        +'<td style="font-weight:700">'+(isNew ? _esc(e.lot||'') : '<span style="color:var(--ink-3)">↳</span>')+'</td>'
        +'<td class="'+tkCls+'">'+_esc(tk||'—')+'</td>'
        +'<td>'+_esc(e.ship||'')+'</td>'
        +'<td>'+(isNew ? _esc(e.customer||'') : '')+'</td>'
        +'<td>'+(isNew ? _esc(e.date||'') : '')+'</td>'
        +'<td>'+_esc(e.tStart||'')+'</td>'
        +'<td>'+_esc(e.tEnd||'')+'</td>'
        +'<td style="font-family:monospace;text-align:right;font-weight:700">'+_n(e.qty != null ? e.qty : e.cTotal, 0)+'</td>'
        +'<td style="text-align:right;color:var(--blue)">'+_n(e.volC3,2)+'</td>'
        +'<td style="text-align:right;color:var(--orange)">'+_n(e.volC4,2)+'</td>'
        +'<td style="font-family:monospace;text-align:right;color:var(--blue);font-weight:600">'+_n(e.wtC3,2)+'</td>'
        +'<td style="font-family:monospace;text-align:right;color:var(--orange);font-weight:600">'+_n(e.wtC4,2)+'</td>'
        +'<td style="font-family:monospace;text-align:right;color:var(--blue);font-weight:800;background:rgba(0,119,182,.05)">'+_w3(e.stC3)+'</td>'
        +'<td style="font-family:monospace;text-align:right;color:var(--orange);font-weight:800;background:rgba(231,111,0,.05)">'+_w3(e.stC4)+'</td>'
        +'<td style="font-family:monospace;text-align:right;color:var(--red);font-weight:800;background:rgba(214,40,57,.05)">'+_w3(e.lpgWt || e.cTotal)+'</td>'
        +'<td class="'+qualCls+'">'+_esc(qual)+'</td>'
        +'<td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+_esc(e.remark||'')+'">'+_esc(e.remark||'')+'</td>'
        +'</tr>';
    }).join('');
  }

  /* placeholder edit modal (full edit form deferred to a later session;
     for now it just lets the user tweak Remark / Quality, the two fields
     most often updated post-save) */
  function openEdit(rid){
    const e = RID_MAP[rid]; if(!e){ toast('Row not found','er'); return; }
    const newRemark = prompt('Edit remark for '+(e.lot||'—')+' '+(e.tank||'—')+':', e.remark || '');
    if(newRemark === null) return;
    e.remark = newRemark;
    if(_fbRef){
      _suppressEcho++;
      _fbRef.child(rid).update({ remark: newRemark, _ts: Date.now() })
        .catch(err => console.warn('[VLOG] edit', err))
        .finally(()=> setTimeout(()=>{ _suppressEcho = Math.max(0, _suppressEcho-1); }, 400));
    }
    render();
    toast('💾 Remark updated','ok');
  }

  /* light CSV export for visible rows */
  function exportCsv(){
    if(!ROWS.length){ toast('Vessel Log is empty','er'); return; }
    const tbody = document.getElementById('vlogTbody');
    const headers = ['No','Lot','Tank','Ship','Customer','Date','Start','Finish',
                     'Qty','%Vol C3','%Vol C4','%Wt C3','%Wt C4',
                     'C3 Wt','C4 Wt','LPG Wt','Quality','Remark'];
    const escCsv = v => {
      const s = String(v == null ? '' : v);
      return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
    };
    /* Sort + filter same as render */
    const sorted = ROWS.slice().sort((a,b)=>{
      const la = _lotKey(a.lot), lb = _lotKey(b.lot);
      if(la !== lb) return lb - la;
      return String(a.tank||'').localeCompare(String(b.tank||''));
    });
    const q   = (document.getElementById('vlog-q')?.value || '').toLowerCase().trim();
    const filtered = sorted.filter(e=>{
      if(!q) return true;
      return [e.lot,e.ship,e.customer,e.tank,e.date,e.type].join(' ').toLowerCase().includes(q);
    });
    const lines = [headers.join(',')];
    filtered.forEach((e, i)=>{
      lines.push([
        i+1, e.lot||'', e.tank||'', e.ship||'', e.customer||'', e.date||'',
        e.tStart||'', e.tEnd||'',
        e.qty != null ? e.qty : (e.cTotal||''),
        e.volC3||'', e.volC4||'', e.wtC3||'', e.wtC4||'',
        e.stC3||'', e.stC4||'', e.lpgWt || e.cTotal || '',
        e.quality||'', e.remark||''
      ].map(escCsv).join(','));
    });
    const blob = new Blob(['\ufeff'+lines.join('\n')], { type:'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vessel_log_' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    toast('⬇ Exported '+filtered.length+' rows','ok');
  }

  /* ============================================================
     IMPORT — paste from Excel (Vessel Log .xlsx layout)
     ------------------------------------------------------------
     One pasted ROW  ->  one VLOG entry (allow duplicates by design).
     Header auto-detected; if absent, falls back to the fixed Excel
     column order (44 cols). All columns preserved into the entry so
     future modules (export / edit / GC view) can use them.
     Source file ref: VesselLog_2026-06-22.xlsx (44 columns).
     ============================================================ */

  /* canonical column order of the source .xlsx (used when no header row) */
  const IMP_ORDER = [
    'no','lot','tank','ship','customer','date','start','finish','qty',
    'volc3','volc4','lpgmix','tgt','min','max','wtc3','wtc4','c3wt','c4wt','lpgwt',
    't1ch4','t1c2h6','t1c3h8','t1ic4','t1nc4','t113bd','t1c5','t1ole','t1dens',
    't2ch4','t2c2h6','t2c3h8','t2ic4','t2nc4','t213bd','t2c5','t2ole','t2dens',
    'fqc3','fqc4','odot1','odot2','quality','remark'
  ];

  /* normalized-header-token  ->  entry field path.
     'gc.<k>' = tank-1 chromatograph, 'gc2.<k>' = tank-2. */
  const IMP_MAP = {
    no:null, lot:'lot', tank:'tank', ship:'ship', customer:'customer',
    date:'date', start:'tStart', finish:'tEnd', qty:'qty',
    volc3:'volC3', volc4:'volC4', lpgmix:'lpgMixQty',
    tgt:'targetC3', min:'minC3', max:'maxC3',
    wtc3:'wtC3', wtc4:'wtC4', c3wt:'stC3', c4wt:'stC4', lpgwt:'lpgWt',
    t1ch4:'gc.meth', t1c2h6:'gc.eth', t1c3h8:'gc.prop', t1ic4:'gc.ibut',
    t1nc4:'gc.nbut', t113bd:'gc.buta', t1c5:'gc.c5', t1ole:'gc.ole', t1dens:'labdens',
    t2ch4:'gc2.meth', t2c2h6:'gc2.eth', t2c3h8:'gc2.prop', t2ic4:'gc2.ibut',
    t2nc4:'gc2.nbut', t213bd:'gc2.buta', t2c5:'gc2.c5', t2ole:'gc2.ole', t2dens:'labdens2',
    fqc3:'c3fq', fqc4:'c4fq', odot1:'odoTk1', odot2:'odoTk2',
    quality:'quality', remark:'remark'
  };

  function _normHdr(s){
    return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,''); // "%Vol C3"->"volc3"
  }
  function _impNum(v){
    if(v == null) return undefined;
    const s = String(v).replace(/,/g,'').trim();
    if(s === '') return undefined;
    const n = parseFloat(s);
    return isNaN(n) ? undefined : n;
  }
  /* date: fix the YYYY-DD-MM source typo (middle>12) then normalizeDate -> DD/MM/YY */
  function _impDate(v){
    let s = String(v||'').trim();
    if(!s) return '';
    const m = s.match(/^(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})$/);
    if(m && +m[2] > 12 && +m[3] <= 12) s = m[1]+'-'+m[3]+'-'+m[2]; // 2026-17-06 -> 2026-06-17
    const out = (typeof normalizeDate === 'function') ? normalizeDate(s) : s;
    return out || s;
  }
  function _setPath(obj, path, val){
    if(val === undefined || val === '') return;
    const dot = path.indexOf('.');
    if(dot < 0){ obj[path] = val; return; }
    const head = path.slice(0,dot), tail = path.slice(dot+1);
    (obj[head] || (obj[head] = {}))[tail] = val;
  }

  /* turn one array-of-cells row + field list into a VLOG entry */
  function _rowToEntry(cells, fields){
    const e = {};
    for(let i = 0; i < fields.length; i++){
      const f = fields[i];
      if(!f) continue;                         // skip 'No' / unknown
      let raw = cells[i] != null ? String(cells[i]).trim() : '';
      if(raw === '') continue;
      let val;
      if(f === 'date'){ val = _impDate(raw); }
      else if(f === 'quality' || f === 'remark' || f === 'lot' || f === 'tank'
              || f === 'ship' || f === 'customer' || f === 'tStart' || f === 'tEnd'){
        val = raw;
      } else {
        val = _impNum(raw);                    // numeric (incl. gc.*)
      }
      _setPath(e, f, val);
    }
    /* derive Spot/Domestic type from the lot code letter, e.g. LPG-2026-S-25 -> 'S' */
    const lm = String(e.lot||'').match(/-([A-Za-z])-/);
    if(lm) e.type = lm[1].toUpperCase();
    /* keep both summary keys the renderer reads */
    if(e.lpgWt == null && e.lpgMixQty != null) e.lpgWt = e.lpgMixQty;
    if(e.cTotal == null && e.qty != null) e.cTotal = e.qty;
    return e;
  }

  /* parse the pasted TSV in #vlogImpArea -> array of entries (no UI side-effects) */
  function _parseRows(){
    const ta = document.getElementById('vlogImpArea');
    const txt = (ta && ta.value || '').replace(/\r/g,'');
    const lines = txt.split('\n').filter(l => l.trim() !== '');
    if(!lines.length) return [];
    const grid = lines.map(l => l.split('\t'));
    let fields, dataRows;
    const first = grid[0].map(_normHdr);
    if(first.includes('lot') && first.includes('tank')){      // header row present
      fields = grid[0].map(h => IMP_MAP.hasOwnProperty(_normHdr(h)) ? IMP_MAP[_normHdr(h)] : null);
      dataRows = grid.slice(1);
    } else {                                                  // no header -> fixed Excel order
      fields = IMP_ORDER.map(k => IMP_MAP[k]);
      dataRows = grid;
    }
    return dataRows.map(c => _rowToEntry(c, fields)).filter(e => e.lot || e.tank || e.ship);
  }

  /* Tank-Log-style: parse + import in one click, then show a small summary. */
  function doImport(){
    const info = document.getElementById('vlogImpInfo');
    const rows = _parseRows();
    if(!rows.length){
      if(info) info.textContent = '⚠ No data found';
      else toast('No data found','er');
      return;
    }
    rows.forEach(e => pushEntry(e));            // each: RAM + one Firebase child
    try{ logAudit('eng:vessel_log:import','_bulk_','_import', rows.length+' rows','','create'); }catch(_){}
    closeImport();
    const body = document.getElementById('vlogImpDiffBody');
    if(body){
      body.innerHTML =
        '<b style="color:#1a7f37">✅ Added '+rows.length+' row(s)</b> to Vessel Log.'
        +'<br><span style="color:var(--ink-3);font-size:12px">Duplicates kept · dates normalized to DD/MM/YY</span>';
    }
    const dm = document.getElementById('vlogImpDiffModal'); if(dm) dm.classList.add('on');
    toast('⬆ Imported '+rows.length+' row(s)','ok');
  }

  function openImport(){
    const ta = document.getElementById('vlogImpArea'); if(ta) ta.value = '';
    const info = document.getElementById('vlogImpInfo'); if(info) info.textContent = '';
    const m = document.getElementById('vlogImpModal'); if(m) m.classList.add('on');
    setTimeout(()=>{ if(ta) ta.focus(); }, 100);
  }
  function closeImport(){
    const m = document.getElementById('vlogImpModal'); if(m) m.classList.remove('on');
  }

  function init(){
    _attach();
    render();
  }

  return {
    init, render, pushEntry, deleteRow, rangeDelete, openEdit, exportCsv,
    openImport, closeImport, doImport,
    get ROWS(){ return ROWS; }
  };
})();
window.VLOG = VLOG;
