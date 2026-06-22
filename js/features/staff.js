/* ============================================================
 * STAFF  —  staff.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 25761–25973   (~213 dòng)
 * Global xuất ra : window.STAFF
 * Phase tách     : P5A
 * Phụ thuộc      : sync
 * Khởi tạo (boot): STAFF.init() trong boot
 * ------------------------------------------------------------
 * MÔ TẢ: Trang Staff (page-staff): ROWS rid→{name, role, phone, email}.
 *
 * API công khai (điền/đối chiếu khi tách):
 *   STAFF.init(), STAFF.ROWS, STAFF.render()
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module STAFF từ dòng 25761 đến 25973.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.STAFF).
 *   3) node --check staff.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P5A]: dán thân module STAFF (V4-54 dòng 25761–25973) vào đây. */

/* ===== BÓC TỪ V4-54 dòng 25761–25973 ===== */
const STAFF = (function(){
  let FB = null;
  let ROWS = {};   // rid → {name, role, phone, email}
  const _saveTimers = {};

  function _esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function _escAttr(s){return _esc(s);}
  function _escJs(s){return String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");}
  function _newRid(){ return 'st_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8); }

  /* Strip Vietnamese diacritics for accent-insensitive search.
     Example: "Dương" → "duong", "Nguyễn Văn Hoàng Nhân" → "nguyen van hoang nhan" */
  function _norm(s){
    return String(s||'')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/đ/g,'d').replace(/Đ/g,'D')
      .toLowerCase()
      .trim();
  }

  function init(){
    try{
      if(typeof firebase!=='undefined' && firebase.database){
        FB = firebase.database();
        FB.ref('staff').on('value', snap=>{
          ROWS = snap.val() || {};
          render();
          try{ refreshStaffDatalists(); }catch(_){}
        });
        console.log('[STAFF] ✅ FB listener attached');
      }
    }catch(e){ console.warn('[STAFF] init', e); }
  }

  function addNew(){
    if(!FB){ toast('Firebase not connected','er'); return; }
    const rid = _newRid();
    FB.ref('staff/'+rid).set({name:'', role:'', phone:'', email:''})
      .then(()=>{
        setTimeout(()=>{
          const inp = document.querySelector('#staff-tbody tr[data-rid="'+rid+'"] input[data-field="name"]');
          if(inp){ inp.focus(); }
        }, 80);
      })
      .catch(e=>{ console.warn('[STAFF] add', e); toast('❌ '+e.message,'er'); });
  }

  function render(){
    const tbody = document.getElementById('staff-tbody');
    if(!tbody) return;
    const rawQ = (document.getElementById('staff-search')?.value || '').trim();
    const q = _norm(rawQ);  // diacritic-insensitive
    const entries = Object.entries(ROWS)
      .map(([rid,r])=>({rid, name:(r&&r.name)||'', role:(r&&r.role)||'', phone:(r&&r.phone)||'', email:(r&&r.email)||''}))
      .filter(r=>{
        if(!q) return true;
        return _norm(r.name).includes(q) || _norm(r.role).includes(q)
            || _norm(r.phone).includes(q) || _norm(r.email).includes(q);
      })
      .sort((a,b)=> (a.name||'').localeCompare(b.name||''));

    if(!entries.length){
      tbody.innerHTML = '<tr><td colspan="5" class="staff-empty">'+
        (rawQ ? 'No staff match "'+_esc(rawQ)+'".' : 'No staff yet. Click "+ Add Staff" to begin.')+
        '</td></tr>';
    } else {
      tbody.innerHTML = entries.map(r=>{
        return '<tr data-rid="'+r.rid+'">' +
          '<td><input type="text" data-field="name"  value="'+_escAttr(r.name)+'"  placeholder="Full name"                 oninput="STAFF.update(\''+r.rid+'\',\'name\',this.value)"></td>' +
          '<td><input type="text" data-field="role"  value="'+_escAttr(r.role)+'"  placeholder="e.g. Engineer, Check booth" oninput="STAFF.update(\''+r.rid+'\',\'role\',this.value)"></td>' +
          '<td><input type="tel"  data-field="phone" value="'+_escAttr(r.phone)+'" placeholder="+84…"                       oninput="STAFF.update(\''+r.rid+'\',\'phone\',this.value)"></td>' +
          '<td><input type="email" data-field="email" value="'+_escAttr(r.email)+'" placeholder="name@hyosung.com"          oninput="STAFF.update(\''+r.rid+'\',\'email\',this.value)"></td>' +
          '<td class="actions"><button class="staff-del" onclick="STAFF.del(\''+r.rid+'\',\''+_escJs(r.name||'this entry')+'\')" title="Delete">🗑</button></td>' +
        '</tr>';
      }).join('');
    }
    const cnt = document.getElementById('staff-count');
    if(cnt) cnt.textContent = entries.length + (entries.length===1?' person':' people');
  }

  function update(rid, field, value){
    if(!FB || !ROWS[rid]) return;
    ROWS[rid][field] = value;
    const key = rid + '|' + field;
    clearTimeout(_saveTimers[key]);
    _saveTimers[key] = setTimeout(()=>{
      FB.ref('staff/'+rid+'/'+field).set(value).catch(e=>console.warn('[STAFF] save', e));
      try{ refreshStaffDatalists(); }catch(_){}
    }, 600);
  }

  function del(rid, name){
    if(!FB) return;
    if(!confirm('Delete '+name+'?\n\nThis cannot be undone.')) return;
    FB.ref('staff/'+rid).remove()
      .then(()=>toast('🗑 Deleted: '+name,'ok'))
      .catch(e=>{ console.warn('[STAFF] del', e); toast('❌ '+e.message,'er'); });
  }

  /* Filter helper used by datalists on Scale page.
     Matches if `role` field (case-insensitive) CONTAINS the given keyword. */
  function getByRole(keyword){
    const q = String(keyword||'').toLowerCase();
    return Object.values(ROWS).filter(r=> r && (r.role||'').toLowerCase().includes(q));
  }

  /* ─────────── Custom autocomplete (Scale page: Engineer + Check Booth) ───────────
     • Searches ALL staff (no role filter).
     • Diacritic-insensitive: typing "duong" matches "Dương",
       "nhan" matches "Nguyễn Văn Hoàng Nhân", "loc" matches "Lộc", etc.
     • Dropdown shows ONLY once the user starts typing (not on focus / click).
     • Click an item to fill the input.
     • ↓ / ↑ to highlight, Enter to pick, Esc to close. */
  function _acList(inp){ return document.getElementById(inp.id + '-ac'); }

  function acInput(inp){
    const list = _acList(inp); if(!list) return;
    const raw = inp.value || '';
    if(!raw.trim()){
      /* No query yet → keep dropdown hidden (user requirement: "type to search") */
      list.classList.remove('on');
      list.innerHTML = '';
      return;
    }
    const nq = _norm(raw);
    const matches = Object.values(ROWS || {})
      .filter(r=> r && r.name)
      .map(r=> ({name:r.name, role:r.role||''}))
      .filter(r=> _norm(r.name).includes(nq) || _norm(r.role).includes(nq))
      .sort((a,b)=> a.name.localeCompare(b.name, 'vi'))
      .slice(0, 24);

    if(!matches.length){
      list.innerHTML = '<div class="sc-staff-ac-empty">No staff matches “'+_esc(raw)+'”</div>';
      list.classList.add('on');
      return;
    }
    list.innerHTML = matches.map((s,idx)=>{
      const roleBadge = s.role ? '<span class="rl">'+_esc(s.role)+'</span>' : '';
      return '<div class="sc-staff-ac-item'+(idx===0?' hl':'')+'" data-idx="'+idx+'"'+
        ' onmousedown="event.preventDefault();STAFF.acPick(\''+inp.id+'\',\''+_escJs(s.name)+'\')">'+
        '<span class="nm">'+_esc(s.name)+'</span>'+roleBadge+
      '</div>';
    }).join('');
    list.classList.add('on');
  }

  function acBlur(inp){
    /* small delay so click on a dropdown item still registers (mousedown handles it,
       but we keep this as a safety net) */
    const list = _acList(inp); if(!list) return;
    setTimeout(()=>{ list.classList.remove('on'); }, 120);
  }

  function acKey(ev, inp){
    const list = _acList(inp); if(!list || !list.classList.contains('on')) return;
    const items = Array.from(list.querySelectorAll('.sc-staff-ac-item'));
    if(!items.length) return;
    let cur = items.findIndex(el=> el.classList.contains('hl'));
    if(ev.key === 'ArrowDown'){
      ev.preventDefault();
      if(cur>=0) items[cur].classList.remove('hl');
      cur = (cur+1) % items.length;
      items[cur].classList.add('hl');
      items[cur].scrollIntoView({block:'nearest'});
    } else if(ev.key === 'ArrowUp'){
      ev.preventDefault();
      if(cur>=0) items[cur].classList.remove('hl');
      cur = (cur<=0 ? items.length-1 : cur-1);
      items[cur].classList.add('hl');
      items[cur].scrollIntoView({block:'nearest'});
    } else if(ev.key === 'Enter'){
      if(cur < 0) cur = 0;
      const name = items[cur].querySelector('.nm')?.textContent || '';
      if(name){ ev.preventDefault(); acPick(inp.id, name); }
    } else if(ev.key === 'Escape'){
      list.classList.remove('on');
    }
  }

  function acPick(inpId, name){
    const inp = document.getElementById(inpId);
    if(inp){
      inp.value = name;
      inp.dispatchEvent(new Event('change',{bubbles:true}));
    }
    const list = document.getElementById(inpId + '-ac');
    if(list){ list.classList.remove('on'); list.innerHTML = ''; }
  }

  return { init, addNew, render, update, del, getByRole,
           acInput, acBlur, acKey, acPick,
           get ROWS(){return ROWS;} };
})();

/* refreshStaffDatalists — kept as a no-op for backward compatibility.
   The Scale page Engineer / Check Booth fields now use a custom autocomplete
   (STAFF.acInput) that reads STAFF.ROWS directly and searches ALL staff,
   diacritic-insensitive, only after the user starts typing. */
function refreshStaffDatalists(){ /* no-op since v4.18.14 */ }

/* STAFF.init() — deferred to staged scheduler at end of file (P4) */

/* ============================================================
   MODULE RPT — Report Engine (port from V406)
   v4.18.7+report — adapted for V4-18 data model
   Fills the monthly stock-report .xlsx (ST Data, Raw Data,
   Summary Data sheets) while preserving 100% original format.
   Sources: TL Data (TL.ROWS), WMS GI (WG.ROWS),
            WMS ST (WS.ROWS), SAP (SP.ROWS).
   No vessel data (no VS module yet). No Cancel GI (deferred).
   ============================================================ */
