/* ============================================================
 * SYNC  —  sync2.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 21470–21651   (~182 dòng)
 * Global xuất ra : window.SYNC
 * Phase tách     : P5A
 * Phụ thuộc      : scale, plan
 * Khởi tạo (boot): SYNC.init() trong boot
 * ------------------------------------------------------------
 * MÔ TẢ: Đồng bộ Scale → Today Plan: SC2TP map {loading:'loading'}.
 *
 * API công khai (điền/đối chiếu khi tách):
 *   SYNC.init(), SYNC.push(...)
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module SYNC từ dòng 21470 đến 21651.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.SYNC).
 *   3) node --check sync2.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P5A]: dán thân module SYNC (V4-54 dòng 21470–21651) vào đây. */

/* ===== BÓC TỪ V4-54 dòng 21470–21651 ===== */
const SYNC = (function(){
  'use strict';
  /* SCALE state → conceptual TP status (only used for MANUAL-mode snapshots).
     In AUTO mode the TP status is computed at render time inside TP.computeStatusFromState. */
  const SC2TP = { loading:'loading' };

  /* Called by SCALE on every station state change (single choke point).
     In AUTO mode this just triggers a re-render — the TP row reads station state
     directly to compute its status, and no Firebase write happens.
     In MANUAL mode autoSet is refused per-row (TP enforces that gate itself). */
  function onScaleStatus(stId, data){
    try{
      if(typeof TP === 'undefined' || !data) return;
      const oid = data._oid;
      if(!oid || !TP.PLAN[oid]) return;          /* station not linked to a plan order */
      /* Touch the row so the computed status updates. The target value is informational
         only — autoSet treats it as a re-render trigger in AUTO mode. */
      const tgt = SC2TP[data.status] || '';
      TP.autoSet(oid, '_status', tgt);
    }catch(e){ console.warn('[SYNC] onScaleStatus', e); }
  }

  /* Called by SCALE when a station is completed (setEmpty from Scale modal DONE).
     'done' itself is derived from TL Data presence by TP.computeStatusFromState,
     so we just nudge the table to re-render. No Firebase status write. */
  function onScaleComplete(oid){
    try{
      if(typeof TP === 'undefined' || !oid || !TP.PLAN[oid]) return;
      TP.refreshStatus(oid);
    }catch(e){ console.warn('[SYNC] onScaleComplete', e); }
  }

  /* ----- Phase 2: WMS GI promotes a TEMP order to its official Delivery ID -----
     Direction is strictly one-way: WMS.delivId  → TP._oid (TMP → real DO).
     Identity only — _status is never changed (so a 🔒 manual row keeps its status,
     it just gains its real DO).

     MATCH RULE (v4.56): a WMS GI row is a candidate to replace a TEMP order when
       1) pickKg === 0 (planning paste — DO issued before loading), OR
          pickKg !== 0 AND pickKg === net weight (propane + butane) ±1 kg, AND
       2) a TEMP order matches on customer (WMS name) + driver + plate.
     (v4.56 removed the old "pickKg !== 0" hard gate so a DO created on WMS
      before loading can already promote the temp order. Quantity checking
      for pick ≠ 0 rows is unchanged.)

     Candidates are NEVER applied silently — they are shown in a confirm table where the
     user ticks/unticks each line (default: all ticked) before promotion happens. */

  function netWeight(wmsRow){
    const p = parseFloat(wmsRow.propane)||0;
    const b = parseFloat(wmsRow.butane)||0;
    return p + b;
  }
  /* tolerant equality for pick vs net (kg) — allow 1 kg rounding slack */
  function pickEqualsNet(wmsRow){
    const pick = parseFloat(wmsRow.pickKg)||0;
    if(!pick) return false;                       /* pick must be non-zero */
    const net = netWeight(wmsRow);
    if(!net) return false;
    return Math.abs(pick - net) <= 1;
  }

  /* Build the list of {wmsRow, oid, planRow} candidates from a set of WMS rows.
     v4.22.0 — date gate added: a WMS row is only a candidate when it carries
     `_wmsDate` (set at paste time by the operator's picker) AND the matched
     temp plan row's `_forDate` equals that date. This replaces V406's
     arrival-vs-giDate matching which was error-prone (arrival on the sheet
     could mean a different day than the operator intended to book against).
     Legacy WMS rows without `_wmsDate` are skipped entirely. */
  function collectCandidates(wmsRows){
    const out = [];
    if(typeof TP === 'undefined' || !TP.findTempOrderStrict) return out;
    const seenOid = new Set();
    wmsRows.forEach(w=>{
      if(!w) return;
      const delivId = String(w.delivId||'').trim();
      if(!delivId) return;
      if(TP.PLAN[delivId]) return;                /* a real-DO order already exists */
      /* v4.56 — pick=0 no longer blocks the DO promotion. A planning paste
         (WMS DO issued before loading, pick still 0) already carries the
         official Delivery ID, so identity match (customer+driver+plate+date)
         is enough to promote TMP → real DO. When pick≠0 the old quantity
         gate stays unchanged: pick must equal net (C3+C4) ±1 kg. */
      const _pick = parseFloat(w.pickKg)||0;
      if(_pick !== 0 && !pickEqualsNet(w)) return; /* gate (pick≠0 only): pick===net */
      const wDate = String(w._wmsDate||'').trim();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(wDate)) return;   /* v4.22.0 — legacy row without picker date → skip */
      const oid = TP.findTempOrderStrict(w.customer, w.driver, w.vehicle);
      if(!oid || !isTempOid(String(oid))) return;
      if(seenOid.has(oid)) return;                /* one temp order promoted once per run */
      const planRow = TP.PLAN[oid];
      if(!planRow) return;
      /* v4.22.0 — date gate: plan's _forDate must equal the WMS picker date. */
      const pForDate = String(planRow._forDate||'').trim();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(pForDate) || pForDate !== wDate) return;
      seenOid.add(oid);
      out.push({ wmsRow: w, oid: oid, planRow });
    });
    return out;
  }

  /* Promote a single matched pair (used by the confirm table on tick). */
  function promotePair(oid, delivId){
    try{
      if(typeof TP === 'undefined') return false;
      delivId = String(delivId||'').trim();
      if(!delivId || !oid) return false;
      if(TP.PLAN[delivId]) return false;
      if(!isTempOid(String(oid))) return false;
      const ok = TP.renameOid(oid, delivId, { writeDoNum:true });   /* also writes DO column */
      if(!ok) return false;
      /* relink any in-flight SCALE station still pointing at the old TMP id.
         v4.36.3 — was `typeof setSt === 'function'` against a SCALE-private
         function: always false, so the relink never ran and the station kept
         the stale TMP oid (breaking the WMS↔Plan↔Station chain after every
         promotion). Now goes through the SCALE public API. */
      try{
        if(typeof SCALE !== 'undefined' && SCALE.getStations && SCALE.setSt){
          const _sts = SCALE.getStations() || {};
          Object.keys(_sts).forEach(id=>{
            const s = _sts[id];
            if(s && String(s._oid||'') === oid){
              SCALE.setSt(id, Object.assign({}, s, { _oid: delivId, doNum: delivId }));
            }
          });
        }
      }catch(_){}
      /* v4.59 — relink WAIT-QUEUE items too. Trucks queued while their DO got
         promoted kept the stale TMP _oid; the later assign then carried the
         stale identity onto the station and status never synced. */
      try{ if(typeof SCALE !== 'undefined' && SCALE.waitRelink) SCALE.waitRelink(oid, delivId); }catch(_){}
      /* propagate the new DO to TL Data rows (Phase 3 wires TL.renameDoNo; guarded no-op until then) */
      try{ if(typeof TL !== 'undefined' && TL.renameDoNo) TL.renameDoNo(oid, delivId); }catch(_){}
      console.log('[SYNC] promoted', oid, '→', delivId);
      return true;
    }catch(e){ console.warn('[SYNC] promotePair', e); return false; }
  }

  /* Entry point from WMS GI after a paste: gather candidates and open the confirm table.
     v4.22.11 — accepts optional onClose callback that fires after the
     promote modal is closed (Apply or Cancel). When no modal opens
     (zero candidates), the caller is responsible for running its
     follow-up directly. Returns true iff the modal was opened. */
  function reviewPromotions(wmsRows, onClose){
    try{
      const cands = collectCandidates(wmsRows || []);
      if(!cands.length) return false;             /* nothing to confirm */
      openPromoteModal(cands, onClose);
      return true;
    }catch(e){ console.warn('[SYNC] reviewPromotions', e); return false; }
  }

  return {
    onScaleStatus, onScaleComplete,
    netWeight, pickEqualsNet, collectCandidates,
    promotePair, reviewPromotions
  };
})();


/* ============================================================
   ENGINEER MODULE — Tank Log + Mix Calculator integration
   ────────────────────────────────────────────────────────────
   34-column row layout (preserved from V406 for Excel-paste compatibility):
     [0]  STT (No)              [17] GC %C2H6
     [1]  Lot                   [18] GC %C3H8
     [2]  Tank                  [19] GC %i-C4
     [3]  Date                  [20] GC %n-C4
     [4]  Start time            [21] GC %1,3-BD
     [5]  Finish time           [22] GC %C5+
     [6]  Vol (m³)              [23] GC %Olefin
     [7]  Qty (ton)             [24] (reserved)
     [8]  %C3 (result)          [25] (reserved)
     [9]  %C4 (result)          [26] Odorant (BDSET)
     [10] Init Vol              [27] Quality (Pass/Fail/Pending)
     [11] Init %C3              [28] Remark
     [12] Init %C4              [29] Target %C3
     [13] Filled C3             [30] Target Vol
     [14] Filled C4             [31] Temp
     [15] Filled LPG            [32] Pressure
     [16] GC %CH4               [33] Density
   ────────────────────────────────────────────────────────────
   v4.18.7 — schema upgraded for Spark-frugal incremental sync:
     Firebase 'eng_tkmix' is now an OBJECT keyed by base36 random rid
     (collision-safe across offline devices). Each child is
     { cells:[v0..v33], _ts:number }. Writes go via upsertRow(row)
     (single child write) rather than full-array .set(). Reads use
     child_added / child_changed / child_removed for incremental sync.
     One-shot legacy migration: if the path holds an array on first
     load, ENG converts it to the new keyed schema and re-saves once
     (user confirmation required).
   localStorage cache key 'lpg_v4_eng_tkmix_v2'.
   ============================================================ */
