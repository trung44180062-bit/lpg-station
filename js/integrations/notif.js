/* ============================================================
 * NOTIF  —  notif.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 27497–27587   (~91 dòng)
 * Global xuất ra : window.NOTIF
 * Phase tách     : P5A
 * Phụ thuộc      : sync
 * Khởi tạo (boot): NOTIF.init() trong boot
 * ------------------------------------------------------------
 * MÔ TẢ: Thông báo chung (toast/badge tổng).
 *
 * API công khai (điền/đối chiếu khi tách):
 *   NOTIF.init(), NOTIF.push(msg)
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module NOTIF từ dòng 27497 đến 27587.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.NOTIF).
 *   3) node --check notif.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P5A]: dán thân module NOTIF (V4-54 dòng 27497–27587) vào đây. */

/* ===== BÓC TỪ V4-54 dòng 27497–27587 ===== */
const NOTIF = (function(){
  const _counts = { tankmix:0, cert:0, sync:0 };
  let _activeTab = 'tankmix';

  function _updateUI(){
    const all = _counts.tankmix + _counts.cert + _counts.sync;
    const $ = id => document.getElementById(id);
    /* per-tab counts */
    if($('notif-c-tankmix')) $('notif-c-tankmix').textContent = _counts.tankmix;
    if($('notif-c-cert'))    $('notif-c-cert').textContent    = _counts.cert;
    if($('notif-c-sync'))    $('notif-c-sync').textContent    = _counts.sync;
    if($('notif-c-all'))     $('notif-c-all').textContent     = all;
    /* Engineer-Notification button badge */
    const badge = $('scNotifEngBadge');
    const btn   = $('scNotifEngBtn');
    if(badge) badge.textContent = all;
    if(btn){
      if(all > 0) btn.classList.add('has-notif');
      else        btn.classList.remove('has-notif');
    }
  }

  function setCount(kind, n){
    if(!(kind in _counts)) return;
    _counts[kind] = n|0;
    _updateUI();
  }

  function tab(name){
    _activeTab = name;
    ['tankmix','cert','sync','all'].forEach(k=>{
      const t = document.getElementById('notif-tab-'+k);
      const p = document.getElementById('notif-pane-'+k);
      if(t) t.classList.toggle('on', k===name);
      if(p) p.classList.toggle('on', k===name);
    });
  }

  function open(tabName){
    const m = document.getElementById('notif-modal');
    if(m) m.classList.add('on');
    if(tabName) tab(tabName);
    /* nudge MIXNOTIFY to repaint into the newly-visible host */
    try{ if(typeof MIXNOTIFY!=='undefined' && MIXNOTIFY.render) MIXNOTIFY.render(); }catch(_){}
  }
  function close(){
    const m = document.getElementById('notif-modal');
    if(m) m.classList.remove('on');
  }
  function openSale(){
    if(typeof toast==='function') toast('Sale notifications — coming soon','info');
  }

  return { open, close, tab, setCount, openSale, get counts(){ return Object.assign({}, _counts); } };
})();
window.NOTIF = NOTIF;

/* ============================================================
   TKV · TANK VIEWER (v4.29.1 — Session 2)
   ────────────────────────────────────────────────────────────
   Compact, read-only TL Data viewer scoped to ONE tank
   (TK-3501 or TK-3502). Opens as a modal overlay from the
   QUICK ACTIONS bar in Scale.

   Source of truth: TL.ROWS (live RAM mirror of /raw_data).
   No Firebase reads — purely a filtered projection.

   Filters:
     • Tank — required, set by open('3501') or open('3502').
       Matched by String(r.ltank).toUpperCase().includes(suffix)
       to handle every stored format ('TK-3501', '3501', '01').
     • GI Date — optional, default = today (DD/MM/YY). The
       date input is HTML <input type="date"> so it shows in
       the user's locale, but we compare against r.giDate
       (DD/MM/YY) — both directions converted on the fly.
     • Search — optional, lowercase substring across DO /
       customer / truck / rmooc / driver / lot / engineer.

   Sort: by GI date, then scale, then turn — chronological
   dispatch order so operators read top-to-bottom matches the
   real flow at the booth.

   Columns (15): the operationally most-useful subset of TL's
   37 fields — Date, GI Date, DO No., Customer, Trade, Type,
   Sc, Tn, Lot, Net Wt, Truck, Rmooc, Driver, C3 kg, C4 kg.

   "Full TL Data →" — navigates to the Sales > TL sub-tab where
   the full 37-column editor lives (clears the date filter so
   the operator sees everything; can re-apply via TL's own
   filter UI). Session 3 will add inline edit + save here, so
   this button stays as the escape hatch for now. */
