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

  /* v4.70 (V406 SL_GRP / SL_SORT): optional column groups + header sorting */
  const GRP  = { plan:false, gc1:false, gc2:false, extra:false };
  const SORT = { col:'lot', dir:'desc' };
  const GC_COLS   = ['meth','eth','prop','ibut','nbut','buta','c5','ole','labdens'];
  const GC_LABELS = ['CH₄','C₂H₆','C₃H₈','i-C₄','n-C₄','1.3BD','C5+','Ole','Dens'];

  function toggleGrp(g){
    GRP[g] = !GRP[g];
    const btn = document.querySelector('.vslog-grp-btn[data-grp="'+g+'"]');
    if(btn){
      btn.style.fontWeight = GRP[g] ? '700' : '';
      btn.style.background = GRP[g] ? '#f0f4ff' : '';
    }
    render();
  }
  function sortBy(col){
    if(SORT.col === col) SORT.dir = (SORT.dir === 'desc' ? 'asc' : 'desc');
    else { SORT.col = col; SORT.dir = 'desc'; }
    render();
  }
  function _sortRows(arr){
    const sd = SORT.dir === 'asc' ? 1 : -1;
    return arr.slice().sort((a,b)=>{
      let r = 0;
      if(SORT.col === 'date'){
        r = String(a.date||'').localeCompare(String(b.date||''));
        if(!r) r = _lotKey(a.lot) - _lotKey(b.lot);
      } else {
        r = _lotKey(a.lot) - _lotKey(b.lot);
      }
      if(!r){
        const ta = String(a.tank||''), tb = String(b.tank||'');
        if(ta === '02 TANK' && tb !== '02 TANK') r = -1;
        else if(tb === '02 TANK' && ta !== '02 TANK') r = 1;
        else r = ta.localeCompare(tb);
        return r; /* tank tiebreak not inverted */
      }
      return r * sd;
    });
  }
  function _filterRows(arr){
    const q   = (document.getElementById('vlog-q')?.value || '').toLowerCase().trim();
    const qV  = (document.getElementById('vlog-q-vol')?.value || '').trim();
    const qW  = (document.getElementById('vlog-q-wt')?.value  || '').trim();
    return arr.filter(e=>{
      if(q){
        const hay = [e.lot, e.ship, e.customer, e.tank, e.date, e.type].join(' ').toLowerCase();
        if(!hay.includes(q)) return false;
      }
      if(qV){ const v = parseFloat(qV); if(!isNaN(v) && e.volC3 != null && Math.abs(e.volC3 - v) > 0.5) return false; }
      if(qW){ const w = parseFloat(qW); if(!isNaN(w) && e.wtC3  != null && Math.abs(e.wtC3  - w) > 0.5) return false; }
      return true;
    });
  }
  function _gcVal(e, tIdx, k){
    const t = e.t && e.t[tIdx] ? e.t[tIdx] : (tIdx === 0 ? (e.gc||{}) : (e.gc2||{}));
    const v = t ? t[k] : null;
    return v != null && !isNaN(v) ? _n(v, 4) : '';
  }

  function render(){
    const tbody = document.getElementById('vlogTbody');
    const thead = document.getElementById('vlogThead');
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

    const filtered = _filterRows(_sortRows(ROWS));

    if(empty) empty.style.display = 'none';
    if(tbl)   tbl.style.display   = '';
    if(stats) stats.innerHTML = '<b style="color:var(--blue)">'+filtered.length+'</b> / '+ROWS.length;

    /* dynamic thead — respects GRP toggles + shows sort arrows */
    if(thead){
      const sa = c => SORT.col === c ? (SORT.dir === 'asc' ? ' ▲' : ' ▼') : '';
      let h = '<tr>'
        +'<th style="width:48px"></th><th style="width:36px">No</th>'
        +'<th style="width:130px;cursor:pointer" onclick="VLOG.sortBy(\'lot\')">Lot'+sa('lot')+'</th>'
        +'<th style="width:74px">Tank</th><th style="width:120px">Ship</th><th>Customer</th>'
        +'<th style="width:70px;cursor:pointer" onclick="VLOG.sortBy(\'date\')">Date'+sa('date')+'</th>'
        +'<th style="width:50px">Start</th><th style="width:50px">Finish</th>'
        +'<th style="width:64px;text-align:right">Qty</th>'
        +'<th style="width:58px;text-align:right;color:var(--blue)">%Vol C3</th>'
        +'<th style="width:58px;text-align:right;color:var(--orange)">%Vol C4</th>';
      if(GRP.plan) h += '<th style="width:64px;text-align:right">LPG Mix</th>'
        +'<th style="width:44px;color:var(--blue)">Tgt</th><th style="width:40px">Min</th><th style="width:40px">Max</th>';
      h += '<th style="width:54px;text-align:right;color:var(--blue)">%Wt C3</th>'
        +'<th style="width:54px;text-align:right;color:var(--orange)">%Wt C4</th>'
        +'<th style="width:64px;text-align:right;color:var(--blue);background:rgba(0,119,182,.08)">C3 Wt</th>'
        +'<th style="width:64px;text-align:right;color:var(--orange);background:rgba(231,111,0,.08)">C4 Wt</th>'
        +'<th style="width:64px;text-align:right;color:var(--red);background:rgba(214,40,57,.08)">LPG Wt</th>';
      if(GRP.gc1) GC_LABELS.forEach(l=>{ h += '<th style="background:#e8f4fd;font-size:9px">'+l+'</th>'; });
      if(GRP.gc2) GC_LABELS.forEach(l=>{ h += '<th style="background:#fff5eb;font-size:9px">'+l+'</th>'; });
      if(GRP.extra) h += '<th style="width:48px">FQ C3</th><th style="width:48px">FQ C4</th>'
        +'<th style="width:48px">Odo T1</th><th style="width:48px">Odo T2</th>';
      h += '<th style="width:58px">Qual.</th><th style="min-width:90px">Remark</th></tr>';
      thead.innerHTML = h;
    }

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
      let r = '<tr class="'+(isNew?'row-newlot':'')+'">'
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
        +'<td style="text-align:right;color:var(--orange)">'+_n(e.volC4,2)+'</td>';
      if(GRP.plan){
        r += '<td style="font-family:monospace;text-align:right">'+_n(e.lpgMixQty != null ? e.lpgMixQty : e.cTotal, 1)+'</td>'
          +'<td style="text-align:center;color:var(--blue)">'+(e.targetC3 != null ? e.targetC3 : '')+'</td>'
          +'<td style="text-align:center">'+(e.minC3 != null ? e.minC3 : '')+'</td>'
          +'<td style="text-align:center">'+(e.maxC3 != null ? e.maxC3 : '')+'</td>';
      }
      r += '<td style="font-family:monospace;text-align:right;color:var(--blue);font-weight:600">'+_n(e.wtC3,2)+'</td>'
        +'<td style="font-family:monospace;text-align:right;color:var(--orange);font-weight:600">'+_n(e.wtC4,2)+'</td>'
        +'<td style="font-family:monospace;text-align:right;color:var(--blue);font-weight:800;background:rgba(0,119,182,.05)">'+_w3(e.stC3)+'</td>'
        +'<td style="font-family:monospace;text-align:right;color:var(--orange);font-weight:800;background:rgba(231,111,0,.05)">'+_w3(e.stC4)+'</td>'
        +'<td style="font-family:monospace;text-align:right;color:var(--red);font-weight:800;background:rgba(214,40,57,.05)">'+_w3(e.lpgWt || e.cTotal)+'</td>';
      if(GRP.gc1) GC_COLS.forEach(k=>{ r += '<td style="font-family:monospace;text-align:right;font-size:10px;background:#f8fbff">'+_gcVal(e,0,k)+'</td>'; });
      if(GRP.gc2) GC_COLS.forEach(k=>{ r += '<td style="font-family:monospace;text-align:right;font-size:10px;background:#fffcf5">'+_gcVal(e,1,k)+'</td>'; });
      if(GRP.extra){
        r += '<td style="text-align:center">'+_n(e.c3fq,0)+'</td>'
          +'<td style="text-align:center">'+_n(e.c4fq,0)+'</td>'
          +'<td style="text-align:center">'+_n(e.odoTk1,2)+'</td>'
          +'<td style="text-align:center">'+_n(e.odoTk2,2)+'</td>';
      }
      r += '<td class="'+qualCls+'">'+_esc(qual)+'</td>'
        +'<td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+_esc(e.remark||'')+'">'+_esc(e.remark||'')+'</td>'
        +'</tr>';
      return r;
    }).join('');
  }

  /* ============================================================
     v4.70 — FULL EDIT MODAL (V406 smEditLogRow port)
     All summary fields + GC Tank 1 / Tank 2 editable, with
     🔄 RECALC (recompute C3/C4 Wt from %Wt·LPG or derive %Wt
     from %Vol) and 💾 SAVE / 🚢 SAVE+PUSH VESSEL.
     ============================================================ */
  const EDIT_FIELDS = [
    {k:'lot',l:'LOT'},{k:'tank',l:'Tank'},{k:'ship',l:'Ship'},{k:'customer',l:'Customer'},
    {k:'date',l:'Date'},{k:'tStart',l:'Start'},{k:'tEnd',l:'Finish'},
    {k:'qty',l:'Qty (ton)'},{k:'volC3',l:'%Vol C3'},{k:'volC4',l:'%Vol C4'},
    {k:'lpgMixQty',l:'LPG Mix qty'},{k:'wtC3',l:'%Wt C3'},{k:'wtC4',l:'%Wt C4'},
    {k:'stC3',l:'C3 Weight'},{k:'stC4',l:'C4 Weight'},{k:'lpgWt',l:'LPG Weight'},
    {k:'targetC3',l:'Target C3'},{k:'minC3',l:'Min C3'},{k:'maxC3',l:'Max C3'},
    {k:'c3fq',l:'FQ C3'},{k:'c4fq',l:'FQ C4'},{k:'odoTk1',l:'Odo T1'},{k:'odoTk2',l:'Odo T2'},
    {k:'quality',l:'Quality'},{k:'remark',l:'Remark'}
  ];
  const EDIT_TXT = ['lot','tank','ship','customer','date','tStart','tEnd','quality','remark'];
  const EDIT_GC_LABELS = ['CH₄','C₂H₆','C₃H₈','i-C₄','n-C₄','1.3-BD','C5+','Olefins','Density'];
  function _escAttr(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

  function openEdit(rid){
    const e = RID_MAP[rid]; if(!e){ toast('Row not found','er'); return; }
    const old = document.getElementById('vlog-edit-overlay'); if(old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'vlog-edit-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px';
    ov.onclick = ev => { if(ev.target === ov) ov.remove(); };
    let h = '<div style="background:#fff;border-radius:10px;padding:16px;max-width:700px;width:100%;max-height:90vh;overflow-y:auto">';
    h += '<div style="font-family:Oswald;font-size:14px;font-weight:700;margin-bottom:10px">✏ Edit — Lot '+_escAttr(e.lot)+' Tank '+_escAttr(e.tank)+'</div>';
    h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px">';
    EDIT_FIELDS.forEach(f=>{
      const v = e[f.k] != null ? e[f.k] : '';
      h += '<div><div style="font-size:8px;font-weight:700;color:var(--ink-3);text-transform:uppercase">'+f.l+'</div>'
        +'<input id="vle-'+f.k+'" value="'+_escAttr(v)+'" style="width:100%;font-family:monospace;font-size:11px;padding:3px 4px;border:1px solid var(--line);border-radius:3px"></div>';
    });
    h += '</div>';
    [0,1].forEach(t=>{
      const col = t === 0 ? 'var(--blue)' : 'var(--orange)';
      h += '<div style="font-size:10px;font-weight:700;color:'+col+';margin:8px 0 4px">GC TANK '+(t+1)+'</div>';
      h += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px">';
      GC_COLS.forEach((k,ki)=>{
        const src = e.t && e.t[t] ? e.t[t] : (t === 0 ? (e.gc||{}) : (e.gc2||{}));
        const v = src && src[k] != null ? src[k] : '';
        h += '<div><div style="font-size:8px;font-weight:700;color:var(--ink-3)">'+EDIT_GC_LABELS[ki]+'</div>'
          +'<input id="vle-gc'+t+'-'+k+'" value="'+_escAttr(v)+'" style="width:100%;font-family:monospace;font-size:10px;padding:2px 3px;border:1px solid var(--line);border-radius:3px"></div>';
      });
      h += '</div>';
    });
    h += '<div style="margin-top:10px;display:flex;gap:6px;justify-content:center;flex-wrap:wrap">';
    h += '<button onclick="VLOG.recalcEditForm()" style="background:#2d8a4e;color:#fff;border:1px solid #2d8a4e;border-radius:5px;font-size:11px;padding:5px 16px;cursor:pointer" title="Recalculate C3/C4 Weight from %Wt (or %Vol) and LPG qty">🔄 RECALC</button>';
    h += '<button onclick="VLOG.saveEdit(\''+String(rid).replace(/'/g,"\\'")+'\')" style="background:var(--blue);color:#fff;border:1px solid var(--blue);border-radius:5px;font-size:11px;padding:5px 16px;cursor:pointer">💾 SAVE</button>';
    h += '<button onclick="VLOG.saveAndPushVessel(\''+String(rid).replace(/'/g,"\\'")+'\')" style="background:#7b2d8e;color:#fff;border:1px solid #7b2d8e;border-radius:5px;font-size:11px;padding:5px 16px;cursor:pointer" title="Save + push this entry to the LPG Sales → Vessel tab">🚢 SAVE + PUSH VESSEL</button>';
    h += '<button onclick="document.getElementById(\'vlog-edit-overlay\').remove()" style="background:#f0f4f8;border:1px solid var(--line);border-radius:5px;font-size:11px;padding:5px 16px;cursor:pointer">✕ CANCEL</button>';
    h += '</div></div>';
    ov.innerHTML = h;
    document.body.appendChild(ov);
  }

  function saveEdit(rid){
    const e = RID_MAP[rid]; if(!e){ toast('Row not found','er'); return; }
    const gv = id => { const el = document.getElementById(id); return el ? el.value : ''; };
    const gn = id => { const v = parseFloat(gv(id)); return isNaN(v) ? null : v; };
    EDIT_FIELDS.forEach(f=>{
      if(EDIT_TXT.includes(f.k)) e[f.k] = gv('vle-'+f.k);
      else e[f.k] = gn('vle-'+f.k);
    });
    e.cTotal  = e.lpgWt || e.lpgMixQty || e.qty || 0;
    e.cFilled = e.lpgWt || e.lpgMixQty || 0;
    if(!e.t) e.t = [{},{}];
    if(!e.t[0]) e.t[0] = {};
    if(!e.t[1]) e.t[1] = {};
    GC_COLS.forEach(k=>{
      const v0 = gn('vle-gc0-'+k), v1 = gn('vle-gc1-'+k);
      if(v0 != null) e.t[0][k] = v0; else delete e.t[0][k];
      if(v1 != null) e.t[1][k] = v1; else delete e.t[1][k];
    });
    recalcEntry(e);
    e._ts = Date.now();
    if(_fbRef){
      _suppressEcho++;
      _fbRef.child(rid).set(e)
        .catch(err => console.warn('[VLOG] edit', err))
        .finally(()=> setTimeout(()=>{ _suppressEcho = Math.max(0, _suppressEcho-1); }, 400));
    }
    render();
    const ov = document.getElementById('vlog-edit-overlay'); if(ov) ov.remove();
    toast('✅ Saved','ok');
  }

  /* v4.70 (V406 smRecalcEntry): recompute C3/C4 weights from %Wt × LPG qty;
     if only %Vol is present, derive %Wt from densities first. */
  function recalcEntry(e){
    const dens = (typeof VMIX !== 'undefined' && VMIX.DENS) ? VMIX.DENS : { c3l:0.492, c4l:0.566 };
    const wtC3 = parseFloat(e.wtC3);
    const lpg  = parseFloat(e.lpgMixQty) || parseFloat(e.lpgWt) || parseFloat(e.cTotal) || 0;
    if(!isNaN(wtC3) && lpg > 0){
      e.stC3 = parseFloat((lpg * wtC3 / 100).toFixed(3));
      e.stC4 = parseFloat((lpg * (100 - wtC3) / 100).toFixed(3));
      e.lpgWt = lpg; e.cTotal = lpg; e.cFilled = lpg;
    }
    if(isNaN(wtC3) && !isNaN(parseFloat(e.volC3))){
      const vc3 = parseFloat(e.volC3);
      const m3 = vc3 * dens.c3l, m4 = (100 - vc3) * dens.c4l;
      const wc3 = (m3 / (m3 + m4)) * 100;
      e.wtC3 = Math.round(wc3 * 100) / 100;
      e.wtC4 = Math.round((100 - wc3) * 100) / 100;
      if(lpg > 0){
        e.stC3 = parseFloat((lpg * e.wtC3 / 100).toFixed(3));
        e.stC4 = parseFloat((lpg * e.wtC4 / 100).toFixed(3));
      }
    }
  }

  /* v4.70 (V406 smRecalcEditForm): live recompute inside the edit modal */
  function recalcEditForm(){
    const gv = id => { const el = document.getElementById(id); return el ? el.value : ''; };
    const gn = id => { const v = parseFloat(gv(id)); return isNaN(v) ? null : v; };
    const sv = (id,val) => { const el = document.getElementById(id); if(el) el.value = val; };
    const dens = (typeof VMIX !== 'undefined' && VMIX.DENS) ? VMIX.DENS : { c3l:0.492, c4l:0.566 };
    let wtC3 = gn('vle-wtC3');
    const volC3 = gn('vle-volC3');
    const lpg = gn('vle-lpgMixQty') || gn('vle-lpgWt') || gn('vle-qty') || 0;
    if(wtC3 == null && volC3 != null){
      const m3 = volC3 * dens.c3l, m4 = (100 - volC3) * dens.c4l;
      wtC3 = (m3 / (m3 + m4)) * 100;
      sv('vle-wtC3', Math.round(wtC3 * 100) / 100);
      sv('vle-wtC4', Math.round((100 - wtC3) * 100) / 100);
    }
    if(wtC3 != null && lpg > 0){
      const stC3 = parseFloat((lpg * wtC3 / 100).toFixed(3));
      const stC4 = parseFloat((lpg * (100 - wtC3) / 100).toFixed(3));
      sv('vle-stC3', stC3); sv('vle-stC4', stC4); sv('vle-lpgWt', lpg);
      toast('✅ Recalculated: C3='+stC3+' · C4='+stC4+' · LPG='+lpg,'ok');
    } else {
      toast('⚠ Need %Wt C3 (or %Vol C3) and LPG qty to calculate','er');
    }
  }

  /* v4.70 (V406 smPushToVessel): push a Vessel Log entry to the LPG Sales →
     Vessel tab (vs.js / vessel_data). Skips if the lot already exists there. */
  function pushToVessel(e){
    if(!e || !e.lot){ toast('⚠ Entry has no Lot','er'); return; }
    if(typeof VS_ROWS === 'undefined' || typeof vsFbPush !== 'function'){
      toast('⚠ Vessel tab (VS) not loaded','er'); return;
    }
    const lotKey = String(e.lot||'').trim().toUpperCase();
    const tankKey = String(e.tank||'').trim();
    const exists = Object.values(VS_ROWS||{}).some(v =>
      v && String(v.lot||'').trim().toUpperCase() === lotKey);
    if(exists){ toast('ℹ Lot '+e.lot+' đã có ở Vessel tab — bỏ qua',''); return; }

    /* DD/MM/YY (or DD-MM-YY) → YYYY-MM-DD */
    const dateRaw = e.date||'';
    let isoDate = dateRaw;
    const dm = dateRaw.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
    if(dm){
      const yr = dm[3].length === 2 ? '20'+dm[3] : dm[3];
      isoDate = yr+'-'+String(dm[2]).padStart(2,'0')+'-'+String(dm[1]).padStart(2,'0');
    }
    const c3Wt = parseFloat(e.stC3)||0;
    const c4Wt = parseFloat(e.stC4)||0;
    let lpgWt = c3Wt + c4Wt;
    if(!lpgWt) lpgWt = parseFloat(e.lpgWt)||parseFloat(e.lpgMixQty)||0;

    const vesselRow = {
      date: isoDate,
      giDate: '',            /* để trống — nhân viên trạm cân điền sau */
      doNo: '',
      time: e.tEnd||e.tStart||'',
      lot: e.lot||'',
      vessel: e.ship||'',
      item: 'Domestic (Ship)',
      type: tankKey === '02 TANK' ? '02 TANK' : ('Tank '+tankKey),
      customer: e.customer||'',
      dest: '',
      tank: tankKey||'',
      c3: c3Wt, c4: c4Wt, lpg: lpgWt,
      ratioC3: lpgWt ? (c3Wt/lpgWt).toFixed(2) : '0',
      ratioC4: lpgWt ? (c4Wt/lpgWt).toFixed(2) : '0',
      price: '', lineNo: '1',
      _fromVesselLog: true
    };
    vsFbPush(vesselRow).then(()=>{
      toast('🚢 Pushed '+e.lot+' → Vessel tab','ok');
    }).catch(err=>{
      console.warn('[VLOG] push to Vessel tab failed:', err);
      toast('❌ Push failed: '+(err && err.message || err),'er');
    });
  }
  function saveAndPushVessel(rid){
    saveEdit(rid);
    const e = RID_MAP[rid];
    if(e) pushToVessel(e);
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
     v4.70 — EXPORT XLSX (V406 shiplogExportXlsx / v383-v384 port)
     Always exports the FULL 44-column layout regardless of GRP
     toggles; respects the current sort + search filters.
     ============================================================ */
  function exportXlsx(){
    if(typeof XLSX === 'undefined'){ toast('❌ SheetJS not loaded','er'); return; }
    if(!ROWS.length){ toast('⚠ Vessel Log is empty','er'); return; }
    const filtered = _filterRows(_sortRows(ROWS));
    if(!filtered.length){ toast('⚠ No rows match current filter','er'); return; }

    const gc = (e,t,k) => {
      const src = e.t && e.t[t] ? e.t[t] : (t === 0 ? (e.gc||{}) : (e.gc2||{}));
      const v = src ? src[k] : null;
      return v != null && !isNaN(v) ? parseFloat(parseFloat(v).toFixed(4)) : '';
    };
    const nn = (v,d) => (v != null && v !== 0 && !isNaN(v)) ? parseFloat(parseFloat(v).toFixed(d != null ? d : 2)) : '';
    const w3 = v => (v != null && !isNaN(v) && v !== 0) ? parseFloat(parseFloat(v).toFixed(3)) : '';

    const hdr = ['No','Lot','Tank','Ship','Customer','Date','Start','Finish',
      'Qty','%Vol C3','%Vol C4','LPG Mix','Tgt','Min','Max',
      '%Wt C3','%Wt C4','C3 Wt','C4 Wt','LPG Wt',
      'T1 CH4','T1 C2H6','T1 C3H8','T1 i-C4','T1 n-C4','T1 1.3BD','T1 C5+','T1 Ole','T1 Dens',
      'T2 CH4','T2 C2H6','T2 C3H8','T2 i-C4','T2 n-C4','T2 1.3BD','T2 C5+','T2 Ole','T2 Dens',
      'FQ C3','FQ C4','Odo T1','Odo T2','Quality','Remark'];
    const aoa = [hdr];
    filtered.forEach((e,i)=>{
      aoa.push([
        i+1, e.lot||'', e.tank||(e.t?'02 TANK':'—'), e.ship||'', e.customer||'',
        e.date||'', e.tStart||'', e.tEnd||'',
        nn(e.qty != null ? e.qty : e.cTotal, 0), nn(e.volC3), nn(e.volC4),
        nn(e.lpgMixQty != null ? e.lpgMixQty : e.cTotal, 1),
        e.targetC3 != null ? e.targetC3 : '', e.minC3 != null ? e.minC3 : '', e.maxC3 != null ? e.maxC3 : '',
        nn(e.wtC3), nn(e.wtC4), w3(e.stC3), w3(e.stC4), w3(e.lpgWt || e.cTotal),
        gc(e,0,'meth'),gc(e,0,'eth'),gc(e,0,'prop'),gc(e,0,'ibut'),gc(e,0,'nbut'),gc(e,0,'buta'),gc(e,0,'c5'),gc(e,0,'ole'),gc(e,0,'labdens'),
        gc(e,1,'meth'),gc(e,1,'eth'),gc(e,1,'prop'),gc(e,1,'ibut'),gc(e,1,'nbut'),gc(e,1,'buta'),gc(e,1,'c5'),gc(e,1,'ole'),gc(e,1,'labdens'),
        nn(e.c3fq,0), nn(e.c4fq,0), nn(e.odoTk1,2), nn(e.odoTk2,2),
        e.quality||'', e.remark||''
      ]);
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      {wch:5},{wch:14},{wch:8},{wch:10},{wch:14},{wch:11},{wch:7},{wch:7},
      {wch:7},{wch:8},{wch:8},{wch:9},{wch:6},{wch:6},{wch:6},
      {wch:8},{wch:8},{wch:9},{wch:9},{wch:9},
      {wch:8},{wch:8},{wch:8},{wch:8},{wch:8},{wch:8},{wch:8},{wch:8},{wch:8},
      {wch:8},{wch:8},{wch:8},{wch:8},{wch:8},{wch:8},{wch:8},{wch:8},{wch:8},
      {wch:7},{wch:7},{wch:7},{wch:7},{wch:7},{wch:18}
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Vessel Log');
    XLSX.writeFile(wb, 'VesselLog_'+new Date().toISOString().slice(0,10)+'.xlsx');
    toast('📥 Exported Vessel Log: '+filtered.length+'/'+ROWS.length+' rows (full columns)','ok');
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
    /* v4.70 */
    toggleGrp, sortBy, exportXlsx,
    saveEdit, recalcEntry, recalcEditForm, pushToVessel, saveAndPushVessel,
    get ROWS(){ return ROWS; }
  };
})();
window.VLOG = VLOG;
