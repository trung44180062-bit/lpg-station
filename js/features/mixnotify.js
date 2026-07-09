/* ============================================================
 * MIXNOTIFY  —  mixnotify.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 23673–23817   (~145 dòng)
 * Global xuất ra : window.MIXNOTIFY
 * Phase tách     : P5A
 * Phụ thuộc      : mixctrl
 * Khởi tạo (boot): MIXNOTIFY.init() trong boot
 * ------------------------------------------------------------
 * MÔ TẢ: Thông báo trạng thái pha trộn.
 *
 * API công khai (điền/đối chiếu khi tách):
 *   MIXNOTIFY.init(), MIXNOTIFY.push(...)
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module MIXNOTIFY từ dòng 23673 đến 23817.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.MIXNOTIFY).
 *   3) node --check mixnotify.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P5A]: dán thân module MIXNOTIFY (V4-54 dòng 23673–23817) vào đây. */

/* ===== BÓC TỪ V4-54 dòng 23673–23817 ===== */
const MIXNOTIFY = (function(){
  'use strict';
  const FB_PATH = 'mix_notify';
  const PEND = Object.create(null);   // pk -> entry (only NOT confirmed/cancelled)
  let _fbRef = null;
  let _attached = false;

  function _sanitizePk(s){
    /* Firebase keys can't contain . # $ / [ ] — replace with _ */
    return String(s||'').replace(/[.#$/\[\]]/g, '_');
  }
  function _esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
                        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function pushNotify(tkName, lot, c3Kg, c4Kg, key){
    if(!_fbRef){ console.warn('[MIXNOTIFY] fb not init'); return null; }
    if(!c3Kg && !c4Kg) return null;
    const pk = _sanitizePk(tkName + '_' + lot);
    return _fbRef.child(pk).set({
      lot:    String(lot),
      c3:     c3Kg|0,
      c4:     c4Kg|0,
      tkName: String(tkName),
      key:    String(key||''),
      _ts:    Date.now()
    }).catch(e=>{ if(typeof fbErr==='function') fbErr(e,'Notify Scale'); else console.warn('[MIXNOTIFY] push', e); });
  }

  /* v4.62 — confirm/cancel now DELETE the node outright (was: mark
     confirmed/cancelled=true, which left the record on Firebase forever).
     A notify is a live prompt only: once the operator has acted on it there
     is nothing left to keep, so we remove it → no residual data buildup on
     /mix_notify. The confirmed/cancelled filter in _onValue is kept so any
     legacy flagged records already on Firebase still stay hidden. */
  function confirm(pk){
    if(!_fbRef) return;
    _fbRef.child(pk).remove()
      .then(()=>{ try{ if(typeof toast==='function') toast('✓ Mix confirmed','ok'); }catch(_){} })
      .catch(e => { if(typeof fbErr==='function') fbErr(e,'Confirm mix'); else console.warn('[MIXNOTIFY] confirm', e); });
  }

  function cancel(pk){
    if(!_fbRef) return;
    _fbRef.child(pk).remove()
      .catch(e => { if(typeof fbErr==='function') fbErr(e,'Cancel mix'); else console.warn('[MIXNOTIFY] cancel', e); });
  }

  function _onValue(snap){
    const all = snap.val() || {};
    for(const k in PEND) delete PEND[k];
    for(const pk in all){
      const v = all[pk];
      if(!v || typeof v !== 'object') continue;
      if(v.confirmed || v.cancelled)  continue;
      PEND[pk] = Object.assign({ _pk:pk }, v);
    }
    render();
  }

  function render(){
    /* v4.30.0 — Row 5 retired. Tank mix slots now live inside the
       Notifications modal at #notif-tankmix-host. Same 4-slot oldest-
       first layout; identical HTML per cell. Also pushes the pending
       count to NOTIF so the Engineer-Notification badge updates live. */
    const cells = document.querySelectorAll('#notif-tankmix-host .sc-r5-cell');
    if(!cells || cells.length < 4) return;
    /* Oldest first — first mix that came in fills slot 1 */
    const list = Object.values(PEND)
      .sort((a,b) => (a._ts||0) - (b._ts||0))
      .slice(0, 4);
    for(let i = 0; i < 4; i++){
      const cell = cells[i];
      const item = list[i];
      if(!item){
        cell.className = 'sc-r5-cell';
        cell.innerHTML = '<span style="opacity:.5">Tank Mix '+(i+1)+'</span>';
        continue;
      }
      cell.className = 'sc-r5-cell sc-r5-cell-on';
      const total  = (item.c3||0) + (item.c4||0);
      const lotRaw = String(item.lot||'');
      /* v4.28.3 — show only the trailing lot number (e.g. "LPG-2026-7" → "7").
         Falls back to the raw string if no trailing digits found. */
      const lotMatch = lotRaw.match(/(\d+)$/);
      const lotDisp = lotMatch ? lotMatch[1] : lotRaw;
      const pkJs = String(item._pk||'').replace(/'/g,"\\'");
      cell.innerHTML =
        '<div class="sc-r5-mix">'+
          '<div class="sc-r5-mix-hd">'+_esc(item.tkName)+' · '+_esc(lotDisp)+'</div>'+
          '<div class="sc-r5-mix-vals">'+
            '<span class="sc-r5-mix-c3">C3: '+(item.c3||0).toLocaleString('en-US')+'</span>'+
            '<span class="sc-r5-mix-c4">C4: '+(item.c4||0).toLocaleString('en-US')+'</span>'+
            '<span class="sc-r5-mix-tot">= '+total.toLocaleString('en-US')+' kg</span>'+
          '</div>'+
          '<button class="sc-r5-mix-ok" '+
                  'onclick="MIXNOTIFY.confirm(\''+pkJs+'\')" '+
                  'title="Confirm stock transferred">✅</button>'+
        '</div>';
    }
    _syncBadge();
  }

  /* v4.30.0 — also notify NOTIF so the Engineer-button badge follows
     PEND.size live. Called at the tail of every render() pass. */
  function _syncBadge(){
    const n = Object.keys(PEND).length;
    if(typeof NOTIF !== 'undefined' && NOTIF.setCount) NOTIF.setCount('tankmix', n);
  }

  function init(){
    if(_attached) return;
    try{
      if(typeof firebase === 'undefined' || !firebase.database){
        console.warn('[MIXNOTIFY] firebase not loaded'); return;
      }
      _fbRef = firebase.database().ref(FB_PATH);
      _fbRef.on('value', _onValue, e => { if(typeof fbErr==='function') fbErr(e,'Load mix notifications'); else console.warn('[MIXNOTIFY] listener', e); });
      _attached = true;
      console.log('[MIXNOTIFY] ✅ Init OK · path /'+FB_PATH);
    }catch(e){ console.warn('[MIXNOTIFY] init', e); }
  }

  return {
    init, pushNotify, confirm, cancel, render,
    get PENDING(){ return PEND; }
  };
})();
window.MIXNOTIFY = MIXNOTIFY;
/* v4.62: fbErr() wired into confirm/cancel/push + listener (see globals.js) */


/* ============================================================
   VMIX — Vessel Mix Calculator module (v4.26.0 scaffold)
   ────────────────────────────────────────────────────────────
   Port of V406 sm* (Ship Mix). This Session 4 lays out:
     • State: SHIPS list, density / component-props constants,
       selected ship, ratio mode (1 / 2), unit per tank (vol/wt)
     • UI plumbing: ship dropdown, lot auto-fill, status pills,
       GC sum visual check, ratio toggle, unit toggle, reset
     • Firebase listeners — STUB (attach in Session 5 once the
       calculation pipeline is in place; we don't want a half-
       working write path going live)
     • calcPlan() / calcResult() / saveLog() — STUBS that show a
       toast "coming in v4.27.0". Pure scaffold so the operator
       can see and validate the layout against V406's screens.

   Firebase footprint (planned, Session 5+):
     • vessel_config   : { ships:[{name,tk1_m3,tk2_m3}], props:{…} }
     • vessel_density  : { c3l, c4l, c3v, c4v }
     • vessel_mix_log  : { pushKey: entry }   ← Session 6
   ============================================================ */
