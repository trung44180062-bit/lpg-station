/* ============================================================
 * FNOTE  —  fnote.js   (v4.81)  ★ MODULE MỚI
 * ------------------------------------------------------------
 * Global xuất ra : window.FNOTE
 * Mở từ          : Quick Actions ở tab SCALE → 📝 GHI CHÚ XE/TX
 * Phụ thuộc      : firebase (compat), DATA (fleet), toast, escapeHtml,
 *                  parseDate/normalizeDate, canWrite, closeDelConfirm
 * ------------------------------------------------------------
 * MÔ TẢ
 *   Sổ ghi chú các trường hợp đặc biệt liên quan tới XE / TÀI XẾ.
 *   Cột: ĐỐI TƯỢNG (tên hoặc biển số) · NGÀY · NỘI DUNG · người ghi.
 *   Ô ĐỐI TƯỢNG có gợi ý (datalist) lấy từ danh sách Fleet đang có trong
 *   RAM, nhưng KHÔNG bắt buộc — vẫn gõ tự do được cho xe/người lạ.
 *
 * NGUYÊN TẮC "LAZY" (quan trọng — đừng phá):
 *   Module này KHÔNG gắn listener Firebase và KHÔNG đọc gì lúc boot.
 *   Dữ liệu chỉ về khi người dùng bấm nút ⬇ TẢI DỮ LIỆU (một lần
 *   .once('value') rồi giữ trong RAM cho tới khi bấm lại). Mở modal mà
 *   không bấm tải thì tuyệt đối không phát sinh lượt đọc nào — đây là
 *   yêu cầu tiết kiệm quota Spark, không phải tối ưu vặt.
 *
 * GHI:
 *   Thêm dòng → dòng nháp (draft) nằm trong RAM, viền cam, CHƯA lên
 *   Firebase. Sửa ô của dòng đã lưu → đánh dấu bẩn (dirty), cũng chưa
 *   lên. Bấm 💾 LƯU mới đẩy 1 lần bằng multi-path update.
 *   Xóa → modal gõ "Confirm" dùng chung với các bảng khác.
 *
 * DATA SHAPE  fleet_notes/{nid} = {
 *     subject, subjectKind:'vehicle'|'driver'|'other',
 *     date:'DD/MM/YY', note,
 *     type:'',                 // ← ĐỂ DÀNH: "loại ghi chú", sẽ phát triển sau
 *     createdBy, createdAt, lastBy, lastAt }
 * ------------------------------------------------------------
 * ĐỘC LẬP với cột ⛔ BLOCK ở tab Fleet: ghi chú ở đây KHÔNG sinh cảnh
 * báo và KHÔNG chặn assign. Muốn cấm xe/tài xế thì tick ⛔ BLOCK.
 * ============================================================ */

const FNOTE = (function(){
  'use strict';

  const FBN  = 'fleet_notes';
  const VERK = 'fleet_notes_version';

  let FB_DB   = null;
  let ROWS    = {};        /* nid -> row (chỉ có sau khi bấm TẢI) */
  let _loaded = false;     /* đã tải về lần nào chưa */
  let _loading= false;
  let _loadedAt = 0;
  let _drafts = [];        /* dòng nháp chưa lưu */
  let _dirty  = {};        /* nid -> { field: value } — sửa chưa lưu */
  let _f      = { q:'', kind:'all', from:'', to:'' };

  /* ---------- tiện ích nhỏ ---------- */
  function _db(){
    if(FB_DB) return FB_DB;
    if(typeof firebase === 'undefined') return null;
    try{ FB_DB = firebase.database(); }catch(_){ FB_DB = null; }
    return FB_DB;
  }
  function _esc(s){
    return (typeof escapeHtml === 'function')
      ? escapeHtml(s)
      : String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function _toast(m,t){ try{ if(typeof toast==='function') toast(m,t); }catch(_){} }
  function _nid(){ return 'FN'+Date.now().toString(36)+Math.random().toString(36).slice(2,5); }
  function _who(){ try{ return (window.CURRENT_USER && CURRENT_USER.name) || '?'; }catch(_){ return '?'; } }
  /* bỏ dấu + hạ chữ thường → so khớp tìm kiếm tiếng Việt không dấu */
  function _norm(s){
    return String(s==null?'':s).toLowerCase().normalize('NFD')
      .replace(/[̀-ͯ]/g,'').replace(/đ/g,'d').trim();
  }
  function _plateKey(p){ return String(p==null?'':p).toUpperCase().replace(/[^0-9A-Z]/g,''); }
  function _isoToVn(v){
    /* input type=date trả 'YYYY-MM-DD'; kho lưu 'DD/MM/YY' cho đồng bộ toàn app */
    if(!v) return '';
    return (typeof normalizeDate === 'function') ? normalizeDate(v) : v;
  }
  function _vnToIso(v){
    const d = (typeof parseDate === 'function') ? parseDate(v) : null;
    if(!d) return '';
    const p = n => String(n).padStart(2,'0');
    return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
  }
  function _ts(v){
    const d = (typeof parseDate === 'function') ? parseDate(v) : null;
    return d ? d.getTime() : 0;
  }
  function _todayIso(){
    const d = new Date(), p = n => String(n).padStart(2,'0');
    return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
  }

  /* ---------- gợi ý ĐỐI TƯỢNG lấy từ Fleet trong RAM ----------
     Không đọc Firebase: DATA đã nằm sẵn nhờ Sync Core của tab Fleet. */
  function _fleetSubjects(){
    const out = [];
    if(typeof DATA === 'undefined') return out;
    ['tanklorry','tractor','rmooc'].forEach(tab=>{
      Object.values(DATA[tab]||{}).forEach(r=>{
        if(r && r.plate) out.push({ v:String(r.plate).trim(), kind:'vehicle', tab });
      });
    });
    Object.values(DATA.twavg||{}).forEach(r=>{
      if(r && r.truck) out.push({ v:String(r.truck).trim(), kind:'vehicle', tab:'twavg' });
    });
    Object.values(DATA.driver||{}).forEach(r=>{
      if(r && r.name) out.push({ v:String(r.name).trim(), kind:'driver', tab:'driver' });
    });
    /* khử trùng lặp, giữ lần xuất hiện đầu */
    const seen = {}, uniq = [];
    out.forEach(o=>{
      const k = o.kind+'|'+_norm(o.v);
      if(seen[k]) return;
      seen[k] = 1; uniq.push(o);
    });
    return uniq;
  }
  /* Suy ra loại đối tượng từ chuỗi người dùng gõ/chọn. */
  function subjectKind(name){
    const s = String(name||'').trim();
    if(!s) return 'other';
    if(typeof DATA === 'undefined') return 'other';
    const pk = _plateKey(s);
    if(pk){
      const hit = ['tanklorry','tractor','rmooc'].some(tab =>
        Object.values(DATA[tab]||{}).some(r => r && _plateKey(r.plate) === pk));
      if(hit) return 'vehicle';
      if(Object.values(DATA.twavg||{}).some(r => r && _plateKey(r.truck) === pk)) return 'vehicle';
    }
    const n = _norm(s);
    if(Object.values(DATA.driver||{}).some(r => r && _norm(r.name) === n)) return 'driver';
    /* Không khớp Fleet: đoán theo hình dạng biển số VN (51D-05867 / 51C11111). */
    if(/^\d{2}[A-Z]{1,2}\d{3,6}$/.test(pk)) return 'vehicle';
    return 'other';
  }

  /* ---------- TẢI (chỉ khi bấm nút) ---------- */
  function load(){
    if(_loading) return;
    const db = _db();
    if(!db){ _toast('Firebase not connected','er'); return; }
    if(Object.keys(_dirty).length || _drafts.length){
      if(!confirm('You have UNSAVED changes. Reloading will discard them.\n\nReload anyway?')) return;
    }
    _loading = true;
    _render();
    db.ref(FBN).once('value')
      .then(snap=>{
        ROWS = snap.val() || {};
        /* gắn _nid vào từng row cho tiện render/sửa */
        Object.keys(ROWS).forEach(k=>{ if(ROWS[k]) ROWS[k]._nid = k; });
        _loaded = true; _loadedAt = Date.now();
        _drafts = []; _dirty = {};
        _toast('📥 Loaded '+Object.keys(ROWS).length+' note(s)','ok');
      })
      .catch(e=>{
        console.error('[fnote] load', e);
        if(typeof fbErr === 'function') fbErr(e, 'Load fleet notes');
        else _toast('Failed to load notes','er');
      })
      .finally(()=>{ _loading = false; _render(); });
  }

  /* ---------- LỌC + SẮP XẾP ---------- */
  function _visibleRows(){
    let arr = Object.values(ROWS).filter(Boolean);
    const q = _norm(_f.q);
    const fromT = _f.from ? _ts(_isoToVn(_f.from)) : 0;
    const toT   = _f.to   ? _ts(_isoToVn(_f.to))   : 0;
    arr = arr.filter(r=>{
      const rr = _merged(r);
      if(_f.kind !== 'all' && (rr.subjectKind||'other') !== _f.kind) return false;
      if(q && !(_norm(rr.subject).includes(q) || _norm(rr.note).includes(q))) return false;
      if(fromT || toT){
        const t = _ts(rr.date);
        if(!t) return false;                 /* không có ngày → ẩn khi đang lọc theo ngày */
        if(fromT && t < fromT) return false;
        if(toT   && t > toT)   return false;
      }
      return true;
    });
    /* mới nhất lên trước; cùng ngày thì theo thời điểm tạo */
    arr.sort((a,b)=>{
      const d = _ts(_merged(b).date) - _ts(_merged(a).date);
      if(d) return d;
      return (b.createdAt||0) - (a.createdAt||0);
    });
    return arr;
  }
  /* row đã lưu + phần sửa chưa lưu → giá trị hiển thị */
  function _merged(r){
    const d = _dirty[r._nid];
    return d ? Object.assign({}, r, d) : r;
  }

  /* ---------- THÊM / SỬA / XÓA ---------- */
  function addDraft(){
    if(typeof canWrite === 'function' && !canWrite('fleet')){ _toast('You do not have permission to edit','er'); return; }
    _drafts.unshift({ _nid:_nid(), subject:'', subjectKind:'other',
                      date:_isoToVn(_todayIso()), note:'', type:'' });
    _render();
    setTimeout(()=>{ const el = document.querySelector('#fn-tbl .fn-draft input'); if(el) el.focus(); }, 30);
  }
  function onDraft(nid, field, value){
    const d = _drafts.find(x=>x._nid===nid);
    if(!d) return;
    d[field] = (field==='date') ? _isoToVn(value) : value;
    if(field==='subject') d.subjectKind = subjectKind(value);
    _paintDirtyCount();
  }
  function dropDraft(nid){
    _drafts = _drafts.filter(x=>x._nid!==nid);
    _render();
  }
  function onEdit(nid, field, value){
    const r = ROWS[nid];
    if(!r) return;
    const v = (field==='date') ? _isoToVn(value) : value;
    if(String(r[field]||'') === String(v||'')){
      /* quay về giá trị gốc → bỏ đánh dấu bẩn cho field này */
      if(_dirty[nid]){
        delete _dirty[nid][field];
        if(!Object.keys(_dirty[nid]).length) delete _dirty[nid];
      }
    } else {
      _dirty[nid] = _dirty[nid] || {};
      _dirty[nid][field] = v;
      if(field==='subject') _dirty[nid].subjectKind = subjectKind(v);
    }
    _paintDirtyCount();
  }
  function requestDelete(nid){
    const r = ROWS[nid];
    if(!r) return;
    if(typeof canWrite === 'function' && !canWrite('fleet')){ _toast('You do not have permission to delete','er'); return; }
    const msg = document.getElementById('delConfirmMsg');
    const inp = document.getElementById('delConfirmInput');
    const btn = document.getElementById('delConfirmBtn');
    if(!msg || !inp || !btn){ _toast('Confirm dialog not available','er'); return; }
    msg.innerHTML = 'Delete the note for <b>"'+_esc(r.subject||'—')+'"</b> dated '+_esc(r.date||'—')+'?<br>This cannot be undone.';
    inp.value = ''; btn.classList.remove('ready');
    btn.onclick = function(){
      if(inp.value.trim().toLowerCase() !== 'confirm'){ _toast('Type "Confirm" to delete','er'); return; }
      const db = _db();
      if(!db){ _toast('Firebase not connected','er'); return; }
      const payload = {};
      payload[FBN+'/'+nid] = null;
      payload[VERK] = Date.now();
      db.ref().update(payload)
        .then(()=>{ _toast('🗑 Note deleted','ok'); })
        .catch(e=>{ console.error('[fnote] delete', e);
                    if(typeof fbErr==='function') fbErr(e,'Delete note'); else _toast('Delete failed','er'); });
      delete ROWS[nid]; delete _dirty[nid];
      if(typeof closeDelConfirm === 'function') closeDelConfirm();
      _render();
    };
    document.getElementById('delConfirmModal').classList.add('on');
    setTimeout(()=>inp.focus(), 80);
  }

  /* ---------- LƯU (một lần, multi-path) ---------- */
  function save(){
    if(typeof canWrite === 'function' && !canWrite('fleet')){ _toast('You do not have permission to edit','er'); return; }
    const db = _db();
    if(!db){ _toast('Firebase not connected','er'); return; }

    /* Bỏ qua dòng nháp trống hoàn toàn; dòng có nội dung thì bắt buộc
       phải có SUBJECT — ghi chú không gắn với ai thì vô nghĩa. */
    const drafts = _drafts.filter(d => (d.subject||'').trim() || (d.note||'').trim());
    const bad = drafts.filter(d => !(d.subject||'').trim());
    if(bad.length){ _toast('⚠ '+bad.length+' row(s) missing SUBJECT (plate / driver name)','er'); return; }

    const nDirty = Object.keys(_dirty).length;
    if(!drafts.length && !nDirty){ _toast('Nothing to save',''); return; }

    const now = Date.now(), who = _who();
    const payload = {};
    drafts.forEach(d=>{
      const base = FBN+'/'+d._nid+'/';
      payload[base+'subject']     = (d.subject||'').trim();
      payload[base+'subjectKind'] = d.subjectKind || subjectKind(d.subject);
      payload[base+'date']        = d.date || '';
      payload[base+'note']        = (d.note||'').trim();
      payload[base+'type']        = d.type || '';      /* để dành cho "loại" sau này */
      payload[base+'createdBy']   = who;
      payload[base+'createdAt']   = now;
      payload[base+'lastBy']      = who;
      payload[base+'lastAt']      = now;
    });
    Object.keys(_dirty).forEach(nid=>{
      const base = FBN+'/'+nid+'/';
      Object.entries(_dirty[nid]).forEach(([f,v])=>{ payload[base+f] = v; });
      payload[base+'lastBy'] = who;
      payload[base+'lastAt'] = now;
    });
    payload[VERK] = now;

    /* Cập nhật RAM ngay để bảng không nhấp nháy chờ mạng. */
    drafts.forEach(d=>{
      ROWS[d._nid] = { _nid:d._nid, subject:(d.subject||'').trim(),
                       subjectKind:d.subjectKind || subjectKind(d.subject),
                       date:d.date||'', note:(d.note||'').trim(), type:d.type||'',
                       createdBy:who, createdAt:now, lastBy:who, lastAt:now };
    });
    Object.keys(_dirty).forEach(nid=>{
      if(ROWS[nid]) Object.assign(ROWS[nid], _dirty[nid], { lastBy:who, lastAt:now });
    });
    const nNew = drafts.length;
    _drafts = []; _dirty = {}; _loaded = true;
    _render();

    db.ref().update(payload)
      .then(()=>{ _toast('💾 Saved '+nNew+' new note(s)'+(nDirty?' · '+nDirty+' edited':''),'ok'); })
      .catch(e=>{
        console.error('[fnote] save', e);
        if(typeof fbErr === 'function') fbErr(e, 'Save fleet notes');
        else _toast('Save failed — check your connection','er');
      });
  }

  /* ---------- FILTER handlers ---------- */
  function setSearch(v){ _f.q = v||''; _renderBody(); }
  function setKind(k){ _f.kind = k||'all'; _render(); }
  function setFrom(v){ _f.from = v||''; _renderBody(); }
  function setTo(v){ _f.to = v||''; _renderBody(); }
  function clearFilters(){
    _f = { q:'', kind:'all', from:'', to:'' };
    ['fn-q','fn-from','fn-to'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
    _render();
  }

  /* ---------- RENDER ---------- */
  const KIND_ICON = { vehicle:'🚚', driver:'👤', other:'📌' };
  const KIND_LBL  = { vehicle:'Truck', driver:'Driver', other:'Other' };

  function _paintDirtyCount(){
    const n = _drafts.length + Object.keys(_dirty).length;
    const b = document.getElementById('fn-save-btn');
    if(b){
      b.disabled = !n;
      b.textContent = n ? ('💾 SAVE ('+n+')') : '💾 SAVE';
      b.classList.toggle('hot', !!n);
    }
  }
  function _renderDatalist(){
    const dl = document.getElementById('fn-subjects');
    if(!dl) return;
    dl.innerHTML = _fleetSubjects()
      .map(o=>'<option value="'+_esc(o.v)+'">'+KIND_LBL[o.kind]+'</option>')
      .join('');
  }
  function _rowHtml(r, isDraft){
    const rr   = isDraft ? r : _merged(r);
    const nid  = r._nid;
    const dirt = !isDraft && _dirty[nid] ? _dirty[nid] : null;
    const dcls = f => (dirt && Object.prototype.hasOwnProperty.call(dirt,f)) ? ' fn-dirty' : '';
    const call = isDraft ? 'FNOTE.onDraft' : 'FNOTE.onEdit';
    const kind = rr.subjectKind || 'other';
    return '<tr class="'+(isDraft?'fn-draft':'')+'">'
      + '<td class="fn-td-kind" title="'+KIND_LBL[kind]+'">'+(KIND_ICON[kind]||'📌')+'</td>'
      + '<td class="fn-td-subj"><input type="text" list="fn-subjects" class="fn-inp fn-inp-subj'+dcls('subject')+'" '
          + 'value="'+_esc(rr.subject||'')+'" placeholder="Plate or driver name…" '
          + 'oninput="'+call+'(\''+nid+'\',\'subject\',this.value)"></td>'
      + '<td class="fn-td-date"><input type="date" class="fn-inp fn-inp-date'+dcls('date')+'" '
          + 'value="'+_esc(_vnToIso(rr.date||''))+'" '
          + 'oninput="'+call+'(\''+nid+'\',\'date\',this.value)"></td>'
      + '<td class="fn-td-note"><input type="text" class="fn-inp'+dcls('note')+'" '
          + 'value="'+_esc(rr.note||'')+'" placeholder="What happened…" '
          + 'oninput="'+call+'(\''+nid+'\',\'note\',this.value)"></td>'
      + '<td class="fn-td-by">'+(isDraft
            ? '<span class="fn-new">NEW</span>'
            : '<span title="'+_esc('last edit: '+(r.lastBy||r.createdBy||'—'))+'">'+_esc(r.createdBy||'—')+'</span>')+'</td>'
      + '<td class="fn-td-del">'+(isDraft
            ? '<button class="fn-x" title="Discard this draft row" onclick="FNOTE.dropDraft(\''+nid+'\')">✕</button>'
            : '<button class="fn-x" title="Delete note (type Confirm)" onclick="FNOTE.requestDelete(\''+nid+'\')">✕</button>')+'</td>'
      + '</tr>';
  }
  function _renderBody(){
    const box = document.getElementById('fn-tbl');
    if(!box) return;

    if(_loading){
      box.innerHTML = '<div class="fn-empty"><div class="fn-spin"></div>Loading notes from Firebase…</div>';
      return;
    }
    if(!_loaded && !_drafts.length){
      box.innerHTML =
        '<div class="fn-empty fn-empty-idle">'
      +   '<div class="fn-empty-ic">📥</div>'
      +   '<div class="fn-empty-t">NOTHING LOADED YET</div>'
      +   '<div class="fn-empty-s">Press <b>⬇ LOAD</b> to fetch the notes from Firebase.<br>'
      +     'Until you do, this table reads nothing — that is deliberate, to save quota.</div>'
      +   '<button class="fn-btn fn-btn-load" onclick="FNOTE.load()">⬇ LOAD</button>'
      + '</div>';
      const c = document.getElementById('fn-count');
      if(c) c.textContent = '—';
      return;
    }

    const rows = _loaded ? _visibleRows() : [];
    const drafts = _f.kind === 'all' ? _drafts
                 : _drafts.filter(d => (d.subjectKind||'other') === _f.kind);

    let h = '<table class="fn-table"><thead><tr>'
      + '<th class="fn-th-kind" title="Subject type">•</th>'
      + '<th class="fn-th-subj">SUBJECT <span class="fn-th-hint">(plate / driver)</span></th>'
      + '<th class="fn-th-date">DATE</th>'
      + '<th class="fn-th-note">NOTE</th>'
      + '<th class="fn-th-by">ADDED BY</th>'
      + '<th class="fn-th-del"></th>'
      + '</tr></thead><tbody>';
    drafts.forEach(d=>{ h += _rowHtml(d, true); });
    rows.forEach(r=>{ h += _rowHtml(r, false); });
    h += '</tbody></table>';
    if(!drafts.length && !rows.length){
      h += '<div class="fn-empty">No notes match the current filter.</div>';
    }
    box.innerHTML = h;

    const c = document.getElementById('fn-count');
    if(c) c.textContent = rows.length + ' / ' + Object.keys(ROWS).length + ' rows'
                        + (drafts.length ? ' · '+drafts.length+' draft' : '');
  }
  function _render(){
    /* chip loại */
    document.querySelectorAll('#fn-modal .fn-chip').forEach(el=>{
      el.classList.toggle('on', el.dataset.kind === _f.kind);
    });
    const st = document.getElementById('fn-loadstate');
    if(st){
      st.textContent = _loading ? 'loading…'
        : (_loaded ? ('loaded ' + new Date(_loadedAt).toLocaleTimeString('en-GB')) : 'not loaded');
      st.classList.toggle('on', _loaded && !_loading);
    }
    const lb = document.getElementById('fn-load-btn');
    if(lb){ lb.disabled = _loading; lb.textContent = _loaded ? '↻ RELOAD' : '⬇ LOAD'; }
    _renderDatalist();
    _renderBody();
    _paintDirtyCount();
  }

  /* ---------- MỞ / ĐÓNG ---------- */
  function open(){
    const m = document.getElementById('fn-modal');
    if(!m){ _toast('Fleet Notes modal missing from index.html','er'); return; }
    m.classList.add('on');
    m.style.display = 'flex';   /* không phụ thuộc CSS — xem ghi chú ở index.html */
    /* CỐ TÌNH không gọi load() ở đây — xem phần "NGUYÊN TẮC LAZY" ở đầu file. */
    _render();
    setTimeout(()=>{ const q=document.getElementById('fn-q'); if(q) q.focus(); }, 60);
  }
  function close(){
    if(_drafts.length || Object.keys(_dirty).length){
      if(!confirm('You have UNSAVED changes. Closing will discard them.\n\nClose anyway?')) return;
      _drafts = []; _dirty = {};
    }
    const m = document.getElementById('fn-modal');
    if(m){ m.classList.remove('on'); m.style.display = 'none'; }
    _render();
  }

  return {
    open, close, load, save,
    addDraft, dropDraft, onDraft, onEdit, requestDelete,
    setSearch, setKind, setFrom, setTo, clearFilters,
    subjectKind,
    /* dùng cho test/debug */
    _state(){ return { loaded:_loaded, rows:ROWS, drafts:_drafts, dirty:_dirty, filter:_f }; },
    _setRows(o){ ROWS = o||{}; Object.keys(ROWS).forEach(k=>{ if(ROWS[k]) ROWS[k]._nid=k; }); _loaded=true; },
    _visibleRows
  };
})();

try{ window.FNOTE = FNOTE; }catch(_){}

/* ESC — handler ESC toàn cục trong globals.js chỉ gỡ class '.on', mà modal này
   còn đặt style.display inline (chống lỗi CSS không nạp) nên sẽ vẫn hiện. Tự
   đóng lấy ở đây để hai cơ chế không đá nhau. */
document.addEventListener('keydown', function(e){
  if(e.key !== 'Escape' && e.keyCode !== 27) return;
  var m = document.getElementById('fn-modal');
  if(!m || m.style.display === 'none') return;
  try{ FNOTE.close(); }catch(_){}
});
