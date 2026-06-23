/* ============================================================
 * TKV  —  tkv.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 27588–27924   (~337 dòng)
 * Global xuất ra : window.TKV
 * Phase tách     : P5A
 * Phụ thuộc      : sync
 * Khởi tạo (boot): TKV.init() trong boot
 * ------------------------------------------------------------
 * MÔ TẢ: Tank view / theo dõi tank (TKV).
 *
 * API công khai (điền/đối chiếu khi tách):
 *   TKV.init(), TKV.render()
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module TKV từ dòng 27588 đến 27924.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.TKV).
 *   3) node --check tkv.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P5A]: dán thân module TKV (V4-54 dòng 27588–27924) vào đây. */

/* ===== BÓC TỪ V4-54 dòng 27588–27924 ===== */
const TKV = (function(){
  let _tk='', _filterDate='', _search='', _table=null;
  /* v4.29.2 — Session 3: track dirty (edited-but-unsaved) cells.
     Map key:  rid + '|' + field
     Map val:  { rid, field, original, edited }
     Mirrors TL.onCellEdited's per-field delta-write pattern except we
     batch — the operator clicks 💾 SAVE to commit everything at once. */
  const _dirty = new Map();

  function _todayDdmmyy(){
    const d=new Date(), p=n=>String(n).padStart(2,'0');
    return p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+String(d.getFullYear()).slice(-2);
  }
  function _isoToDdmmyy(iso){
    if(!iso) return '';
    const m=String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m) return '';
    return m[3]+'/'+m[2]+'/'+m[1].slice(-2);
  }
  function _ddmmyyToIso(s){
    const m=String(s||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if(!m) return '';
    const yyyy = m[3].length===2 ? '20'+m[3] : m[3];
    return yyyy+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
  }
  function _ddmmyyKey(s){
    /* sortable ISO-ish key from DD/MM/YY; empty → '' so unset rows sink */
    return _ddmmyyToIso(s);
  }
  function _numFmt(cell){
    const v=cell.getValue();
    if(v==null||v===''||isNaN(v)) return v||'';
    return Number(v).toLocaleString('en-US');
  }

  /* Fields that are numeric in TL.COLS — used to coerce edited values
     back to Number before writing, so types don't drift on Firebase. */
  const _numFields = new Set(['scaleNo','turn','lot','lpgQty','c3Kg','c4Kg']);
  /* Fields that are dates in TL.COLS — normalized via the global
     normalizeDate() helper before writing. */
  const _dateFields = new Set(['date','giDate']);

  /* v4.29.2 — every column except computed (% / Diff%) is editable.
     COLS keep their visual width; the editor type matches the field's
     natural data shape (number editor for numeric fields, plain input
     for text fields). */
  const COLS = [
    {title:'Date',     field:'date',    width:62,  hozAlign:'center', editor:'input'},
    {title:'GI Date',  field:'giDate',  width:62,  hozAlign:'center', editor:'input'},
    {title:'DO No.',   field:'doNo',    width:95,                     editor:'input'},
    {title:'Customer', field:'cust',    width:100,                    editor:'input'},
    {title:'Trade',    field:'trade',   width:55,  hozAlign:'center', editor:'input'},
    {title:'Type',     field:'type',    width:55,  hozAlign:'center', editor:'input'},
    {title:'Sc',       field:'scaleNo', width:38,  hozAlign:'center', editor:'number', editorParams:{min:0,step:1}},
    {title:'Tn',       field:'turn',    width:36,  hozAlign:'center', editor:'number', editorParams:{min:0,step:1}},
    {title:'Lot',      field:'lot',     width:36,  hozAlign:'center', editor:'number', editorParams:{min:0,step:1}},
    {title:'Net Wt',   field:'lpgQty',  width:74,  hozAlign:'right',  formatter:_numFmt, editor:'number', editorParams:{min:0,step:1}},
    {title:'Truck',    field:'truck',   width:86,                     editor:'input'},
    {title:'Rmooc',    field:'rmooc',   width:86,                     editor:'input'},
    {title:'Driver',   field:'driver',  width:110,                    editor:'input'},
    {title:'C3 kg',    field:'c3Kg',    width:66,  hozAlign:'right',  formatter:_numFmt, editor:'number', editorParams:{min:0,step:1}},
    {title:'C4 kg',    field:'c4Kg',    width:66,  hozAlign:'right',  formatter:_numFmt, editor:'number', editorParams:{min:0,step:1}}
  ];

  function _filterRows(){
    const out=[];
    if(typeof TL==='undefined' || !TL.ROWS) return out;
    const ROWS = TL.ROWS;
    const suffix = _tk;
    Object.keys(ROWS).forEach(rid=>{
      const r = ROWS[rid];
      if(!r || r.disabled) return;
      if(!String(r.ltank||'').toUpperCase().includes(suffix)) return;
      if(_filterDate && String(r.date||'').trim() !== _filterDate) return;
      if(_search){
        const hay = [r.doNo,r.cust,r.truck,r.rmooc,r.driver,r.lot,r.eng,r.custFull].join(' ').toLowerCase();
        if(!hay.includes(_search)) return;
      }
      out.push(Object.assign({rid}, r));
    });
    out.sort((a,b)=>{
      const ka = _ddmmyyKey(a.date||a.giDate||'')
                 + '|' + String(a.scaleNo||'').padStart(2,'0')
                 + '|' + String(a.turn||'').padStart(3,'0');
      const kb = _ddmmyyKey(b.date||b.giDate||'')
                 + '|' + String(b.scaleNo||'').padStart(2,'0')
                 + '|' + String(b.turn||'').padStart(3,'0');
      return ka.localeCompare(kb);
    });
    return out;
  }

  /* v4.29.2 — handle inline cell edits. We DON'T write to Firebase per
     edit (TL does that; we batch). Instead the edit is stashed in
     _dirty and the cell gets a yellow .tkv-dirty class. If the user
     "edits back" to the original value, the dirty mark is removed. */
  function _onCellEdited(cell){
    const data = cell.getRow().getData();
    const rid = data.rid;
    const field = cell.getField();
    if(!rid || !field) return;
    if(typeof TL==='undefined' || !TL.ROWS || !TL.ROWS[rid]) return;

    let val = cell.getValue();
    if(_dateFields.has(field) && typeof normalizeDate==='function'){
      val = normalizeDate(val);
      /* feed normalized form back into the table so the user sees it */
      if(val !== cell.getValue()) cell.setValue(val, false);
    } else if(_numFields.has(field)){
      if(val==null || val==='') val = '';
      else {
        const n = Number(val);
        if(!isNaN(n)) val = n;
      }
    }

    const original = TL.ROWS[rid][field];
    const key = rid + '|' + field;
    const same = val===original
              || (val==null && original==null)
              || String(val||'') === String(original||'');

    const el = cell.getElement();
    if(same){
      _dirty.delete(key);
      if(el) el.classList.remove('tkv-dirty');
    } else {
      _dirty.set(key, { rid, field, original, edited: val });
      if(el) el.classList.add('tkv-dirty');
    }
    _updateSaveBtn();
  }

  function _updateSaveBtn(){
    const btn = document.getElementById('tkv-save-btn');
    const reset = document.getElementById('tkv-reset-btn');
    if(!btn) return;
    const n = _dirty.size;
    if(n>0){
      btn.disabled = false;
      btn.innerHTML = '💾 SAVE (' + n + ')';
      btn.classList.add('tkv-tb-btn-save-on');
      if(reset){ reset.style.display = ''; reset.disabled = false; }
    } else {
      btn.disabled = true;
      btn.innerHTML = '💾 SAVE';
      btn.classList.remove('tkv-tb-btn-save-on');
      if(reset){ reset.style.display = 'none'; reset.disabled = true; }
    }
  }

  /* Multi-path Firebase write. Mirrors the TL.onCellEdited shape but
     batched: every dirty cell gets its own raw_data/{rid}/{field} path,
     plus a single _ts per touched rid, plus a raw_data_version bump
     so any other open client picks up the change via TL's listener. */
  function save(){
    if(_dirty.size===0) return;
    if(typeof firebase==='undefined' || !firebase.database){
      if(typeof toast==='function') toast('Firebase offline — cannot save','er');
      return;
    }
    const payload = {};
    const ts = Date.now();
    const touchedRids = new Set();
    _dirty.forEach(info => {
      payload['raw_data/' + info.rid + '/' + info.field] = info.edited;
      touchedRids.add(info.rid);
      /* update RAM mirror immediately so TL stays in sync */
      if(TL.ROWS[info.rid]) TL.ROWS[info.rid][info.field] = info.edited;
    });
    touchedRids.forEach(rid => {
      payload['raw_data/' + rid + '/_ts'] = ts;
      if(TL.ROWS[rid]) TL.ROWS[rid]._ts = ts;
    });

    const btn = document.getElementById('tkv-save-btn');
    if(btn){ btn.disabled = true; btn.innerHTML = '⏳ Saving…'; }

    firebase.database().ref().update(payload).then(() => {
      /* bump version so other listeners (and TL itself on next open)
         know to refresh. We read-then-set to avoid clobbering a higher
         version posted by someone else in the meantime. */
      return firebase.database().ref('raw_data_version').once('value');
    }).then(snap => {
      const v = (snap && snap.val ? snap.val() : 0) || 0;
      return firebase.database().ref('raw_data_version').set(v + 1);
    }).then(() => {
      const n = touchedRids.size;
      _dirty.clear();
      /* clear visual dirty markers */
      document.querySelectorAll('#tkv-tbl .tkv-dirty').forEach(el => el.classList.remove('tkv-dirty'));
      _updateSaveBtn();
      /* nudge TL's rendered table if it's been built — keeps numbers in
         sync without forcing a full reload */
      try{ if(TL && typeof TL.rebuildTableData==='function') TL.rebuildTableData(); }catch(_){}
      if(typeof toast==='function') toast('Saved '+n+' row'+(n===1?'':'s'),'ok');
    }).catch(e => {
      console.warn('[TKV] save error:', e);
      if(typeof toast==='function') toast('Save failed: '+(e&&e.message||e),'er');
      _updateSaveBtn();
    });
  }

  /* Drop every staged edit and re-render from TL.ROWS — original values
     return to the cells. */
  function reset(){
    if(_dirty.size===0) return;
    if(typeof confirm==='function' && !confirm('Discard '+_dirty.size+' staged edit'+(_dirty.size===1?'':'s')+'?')) return;
    _dirty.clear();
    document.querySelectorAll('#tkv-tbl .tkv-dirty').forEach(el => el.classList.remove('tkv-dirty'));
    _render();
    _updateSaveBtn();
  }

  function _render(){
    const rows = _filterRows();
    if(_table){
      try{ _table.replaceData(rows); }catch(_){}
    } else {
      try{
        _table = new Tabulator('#tkv-tbl', {
          data: rows,
          columns: COLS,
          layout: 'fitData',
          height: '100%',
          index: 'rid',
          placeholder: 'No rows for this tank with the current filters.',
          /* v4.29.2 — edit-trigger=click makes single-click pop the
             editor (otherwise default is dblclick on number editors). */
          editTriggerEvent: 'click',
          rowFormatter: function(row){
            const d = row.getData(), el = row.getElement();
            el.classList.remove('tl-tk-3501','tl-tk-3502');
            const tk = String(d.ltank||'').toUpperCase();
            if(tk.includes('3501')) el.classList.add('tl-tk-3501');
            else if(tk.includes('3502')) el.classList.add('tl-tk-3502');
            /* re-apply dirty markers when virtual scroll rebuilds the row */
            const rid = d.rid;
            if(rid){
              row.getCells().forEach(c => {
                const f = c.getField();
                if(_dirty.has(rid+'|'+f)){
                  const ce = c.getElement();
                  if(ce) ce.classList.add('tkv-dirty');
                }
              });
            }
          }
        });
        _table.on('cellEdited', _onCellEdited);
      }catch(e){ console.warn('[TKV] table init failed', e); }
    }
    const cnt = document.getElementById('tkv-count');
    if(cnt) cnt.textContent = rows.length + ' row' + (rows.length===1?'':'s');
  }

  function open(tk){
    /* If there are unsaved edits when re-opening on a different tank,
       give the operator a chance to bail out. */
    if(_dirty.size>0 && _tk && _tk !== String(tk||'').trim()){
      if(typeof confirm==='function' &&
         !confirm('Switching tanks will discard '+_dirty.size+' unsaved edit'+(_dirty.size===1?'':'s')+'. Continue?')) return;
      _dirty.clear();
    }
    _tk = String(tk||'').trim();
    _filterDate = _todayDdmmyy();
    _search = '';
    const m = document.getElementById('tkv-modal'); if(m) m.classList.add('on');
    const t = document.getElementById('tkv-title'); if(t) t.textContent = '🛢 TK-' + _tk + ' · OUTGOING ORDERS (editable)';
    const di = document.getElementById('tkv-date'); if(di) di.value = _ddmmyyToIso(_filterDate);
    const si = document.getElementById('tkv-search'); if(si) si.value = '';
    const hdr = document.getElementById('tkv-header');
    if(hdr){
      hdr.classList.remove('tkv-hdr-3501','tkv-hdr-3502');
      hdr.classList.add('tkv-hdr-' + _tk);
    }
    /* Defer so the modal layout settles before Tabulator measures height */
    setTimeout(()=>{ _render(); _updateSaveBtn(); }, 30);
  }
  function close(){
    if(_dirty.size>0){
      if(typeof confirm==='function' &&
         !confirm('You have '+_dirty.size+' unsaved edit'+(_dirty.size===1?'':'s')+'. Close without saving?')) return;
      _dirty.clear();
      document.querySelectorAll('#tkv-tbl .tkv-dirty').forEach(el => el.classList.remove('tkv-dirty'));
      _updateSaveBtn();
    }
    const m = document.getElementById('tkv-modal'); if(m) m.classList.remove('on');
  }
  function onDateChange(iso){ _filterDate = _isoToDdmmyy(iso); _render(); }
  function clearDate(){
    _filterDate = '';
    const di = document.getElementById('tkv-date'); if(di) di.value = '';
    _render();
  }
  function setDateToday(){
    _filterDate = _todayDdmmyy();
    const di = document.getElementById('tkv-date'); if(di) di.value = _ddmmyyToIso(_filterDate);
    _render();
  }
  function onSearch(v){ _search = String(v||'').toLowerCase().trim(); _render(); }
  function openInTl(){
    if(_dirty.size>0){
      if(typeof confirm==='function' &&
         !confirm('You have '+_dirty.size+' unsaved edit'+(_dirty.size===1?'':'s')+' in this view. Navigate away anyway?')) return;
      _dirty.clear();
    }
    close();
    try{ navGo('sales'); }catch(_){}
    try{ switchSalesTab('tl'); }catch(_){}
  }

  return { open, close, onDateChange, clearDate, setDateToday, onSearch, openInTl, save, reset };
})();
window.TKV = TKV;


/* ============================================================
   INV · TANK INVENTORY  (ported & simplified from V406 INV tab)
   ────────────────────────────────────────────────────────────
   Folded into the XFER card of the Scale tab — NOT a separate tab.
   • Two tanks: TK-3501 (sloc 2100) / TK-3502 (sloc 2101)
   • A button picks a tank to receive its initial daily stock
     (C3 kg, C4 kg, %wt C3). Everything else lives behind buttons
     that pop modals: cavern receive/return, inter-tank transfer,
     history, and a WMS copy-out.
   • Firebase path  : inv_daily/{YYYY-MM-DD}/{sloc}/{init|wt|history}
     localStorage    : lpg_v4_inv_v1
   • RAM-ONLY rule  : only user-entered data (init / cavern / xfer /
     history) is written to Firebase. The CURRENT stock is computed
     in RAM on every render and never persisted.
   • Sold deduction : current stock subtracts today's GI read directly
     from TL.ROWS (read-only, defensively guarded — 0 if TL absent).
     The wider WMS-GI ↔ Today-Plan ↔ Station bidirectional sync chain
     (incl. PLAN pending-GI estimation) is INTENTIONALLY DEFERRED to a
     dedicated unified-design session and is NOT implemented here.
   ============================================================ */
