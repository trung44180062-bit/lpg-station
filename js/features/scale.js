/* ============================================================
 * SCALE  —  scale.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 16142–18776   (~2635 dòng)
 * Global xuất ra : window.SCALE
 * Phase tách     : P5C
 * Phụ thuộc      : sync, plan, ct
 * Khởi tạo (boot): SCALE.init() trong boot
 * ------------------------------------------------------------
 * MÔ TẢ: ★ Cân xe (SCALE) ~2.6k dòng: DB_SC, SC_TK_CFG, trạng thái cân (empty/loading...), SLBL/STLBL.
 *
 * API công khai (điền/đối chiếu khi tách):
 *   SCALE.init(), SCALE.render(), SCALE.onWeigh(...)
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module SCALE từ dòng 16142 đến 18776.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.SCALE).
 *   3) node --check scale.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P5C]: dán thân module SCALE (V4-54 dòng 16142–18776) vào đây. */

/* ===== BÓC TỪ V4-54 dòng 16142–18776 ===== */
const SCALE = (function(){
  'use strict';

  const DB_SC = {
    stations: {
      1:{status:'empty',plate:'',driver:'',tank:'',batch:'',customer:'',turn:0,tech:{}},
      2:{status:'empty',plate:'',driver:'',tank:'',batch:'',customer:'',turn:0,tech:{}},
      3:{status:'empty',plate:'',driver:'',tank:'',batch:'',customer:'',turn:0,tech:{}},
      4:{status:'empty',plate:'',driver:'',tank:'',batch:'',customer:'',turn:0,tech:{}}
    }
  };
  /* v4.36.3 — CRITICAL SYNC FIX: DB_SC lives inside this IIFE, but
     TP.computeStatusFromState (loading detection), TP._stationIdFor and
     SYNC.promotePair all reference the bare identifier behind a
     `typeof DB_SC !== 'undefined'` guard. From their scopes the guard was
     FALSE, so they silently skipped — Today Plan could never show LOADING
     (done still worked via the global TL index) and promoted orders never
     relinked their in-flight station. Publishing the same object on window
     restores every guarded read with zero behavioural change inside SCALE. */
  window.DB_SC = DB_SC;

  /* TK_CFG now holds SEPARATE lots per tank */
  let SC_TK_CFG = {
    tk1:{ selected:true, lot:'', initWt:0, mode:'auto', manualWt:0 },
    tk2:{ selected:false, lot:'', initWt:0, mode:'auto', manualWt:0 }
  };
  let _tkVer = 0;
  /* Status set reduced to {empty, loading}. 'done' is virtual: a station's order
     counts as Done when a matching row exists in TL Data. Auto-status in Today Plan
     computes from station state + TL Data presence — Firebase is NOT used to persist
     status (saves Spark quota). Manual-mode edits to Today Plan status still write to
     Firebase so other machines can see the override. */
  const SLBL = {empty:'Empty', loading:'Loading'};
  let FB_SC = null;
  let _stDragSrc = null;
  let _certModalCtx = null; // {tab, rid, row}

  function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  /* ─── Tank helpers ─── */
  function tkGetActive(){
    const key = SC_TK_CFG.tk1.selected ? 'tk1' : SC_TK_CFG.tk2.selected ? 'tk2' : null;
    if(!key) return null;
    const cfg = SC_TK_CFG[key];
    const num = key==='tk1' ? '3501' : '3502';
    /* v4.22.6 — cfg.lot is ALREADY the canonical full "LPG-YYYY-N" string
       (set by _onLotChange and _latestLotForTank). The previous version naively
       prepended another "LPG-{yr}-" producing "LPG-2026-LPG-2026-7" on PTT/DN.
       Defensive sanitizer collapses any legacy doubled prefix that may still
       live in Firebase from prior writes. */
    return { name:'TK-'+num, key,
      lotFull: _sanitizeLotPrefix(cfg.lot||''),
      lotNum: cfg.lot, initWt: cfg.initWt };
  }
  function shortLot(batch){ return (batch||'').replace(/^LPG-\d{4}-/,'') || '—'; }

  /* Classify a plan-row type string as a Pure product. Returns 'C3', 'C4',
     or '' (not pure). Mirrors WGCHECK's pure detection; a bare "pure" with no
     C3/C4 token defaults to C3 (propane), matching the rest of the app. */
  function _scPureType(type){
    const t = String(type||'').toLowerCase();
    if(!/pure|thuần|thuan|순수/.test(t)) return '';
    if(/c4|butane|부탄/.test(t)) return 'C4';
    if(/c3|propane|프로판/.test(t)) return 'C3';
    return 'C3';
  }

  /* ─── Turn from TL Data ─── */
  function getTurnFromTLData(stId){
    /* v4.34.0 — O(1) lookup via TL.getIndex() (today's per-scale counts,
       rebuilt once per TL mutation) instead of scanning all of TL.ROWS on
       every station render. Also fixes a latent bug: the old code compared
       r.date against a DD/MM/YYYY (4-digit year) string while TL stores
       DD/MM/YY — the comparison never matched, so the count was always 0. */
    if(typeof TL==='undefined' || !TL.getIndex) return 0;
    return TL.getIndex().turnByScale.get(String(stId)) || 0;
  }
  function getDisplayTurn(stId){
    const base = getTurnFromTLData(stId);
    const st = (DB_SC.stations[stId]||{}).status||'empty';
    return st==='loading' ? base+1 : base;
  }
  /* v4.37.0 — RAM-only frozen turn per loading station. The TL MERGE_KEY is
     doNo|scaleNo|turn; getDisplayTurn() drifts +1 once SAVE has pushed this
     vehicle's own row (its row is then counted in base), so a later DONE push
     would compute a higher turn → new MERGE_KEY → a duplicate TL row. Freezing
     the turn at the first push keeps SAVE and DONE on one key so DONE merges
     idempotently. Map only — never written to Firebase; cleared on completion. */
  const _tlTurnFreeze = {};
  /* Per-station signature of the last weigh successfully pushed to TL Data.
     Lets _pushToTL short-circuit when SAVE already captured this exact weigh,
     so a following DONE / PRINT&DONE does NO TL work (no scan, no Firebase). */
  const _tlPushSig = {};
  function _tlFreezeTurn(stId){
    if(_tlTurnFreeze[stId]==null) _tlTurnFreeze[stId]=getDisplayTurn(stId);
    return _tlTurnFreeze[stId];
  }
  function _tlClearFrozenTurn(stId){ delete _tlTurnFreeze[stId]; delete _tlPushSig[stId]; }
  function getNextTurn(stId){ return getTurnFromTLData(stId)+1; }

  /* ─── Firebase write ─── */
  function fbScSet(path, data){
    if(!FB_SC) return;
    FB_SC.ref(path).set(data).catch(e=>console.warn('[SCALE] fb err',e));
  }

  /* ─── Station state ───
     Firebase writes use the per-station path stations/{id} so a single station change
     only updates that one branch (4 separate write points — one per station).
     We compare the previous local state with the new state and SKIP the write if
     nothing actually changed: this stops listener echoes from looping back as writes
     and keeps Firebase traffic low (Spark plan). */
  function _stEq(a, b){
    try{ return JSON.stringify(a||{}) === JSON.stringify(b||{}); }catch(_){ return false; }
  }
  function setSt(id, data){
    const prev = DB_SC.stations[id];
    const changed = !_stEq(prev, data);
    DB_SC.stations[id] = data;
    scRenderCtrl();
    if(changed) fbScSet('stations/'+id, data);
    try{ if(typeof FCHECK!=='undefined') FCHECK.recompute(); }catch(_){}
    try{ if(typeof SYNC!=='undefined') SYNC.onScaleStatus(id, data); }catch(_){}
  }
  /* DONE flow — called from the Scale modal once weight has been entered.
     Pushes the captured weight row to TL Data (Firebase write to its own area),
     then clears the station (per-station Firebase write). After this the Today
     Plan order auto-resolves to 'done' on the next render because TL Data now
     has a matching row — no separate Firebase 'done' write is needed. */
  function setEmpty(id){
    const t = (DB_SC.stations[id]||{}).tech||{};
    if(!t.grossWt && !t.wtFull && !t.truckWt){ toast('No scale data','er'); return; }
    const doneOid = (DB_SC.stations[id]||{})._oid||'';
    try{ if(typeof SYNC!=='undefined' && doneOid) SYNC.onScaleComplete(doneOid); }catch(_){}
    _tlClearFrozenTurn(id);
    setSt(id, {status:'empty', plate:'', driver:'', tank:'', batch:'', customer:'', doNum:'', qty:'', rmooc:'', turn:0, type:'', note:'', tech:{}, _oid:''});
    toast('Station '+id+' completed','ok');
  }
  /* Dbl-click on a loading card resets it without requiring scale data —
     the truck returns to 'pending' in Today Plan automatically because no station
     and no TL Data row reference its _oid. The plan-side _status is purely
     computed at render time so nothing to write there.
     v4.21.0 — "back to queue" bonus: before clearing the station, push the
     vehicle back to the queue with _targetSt = this station, so it survives
     the reset instead of vanishing. */
  function stationReset(id){
    const cur = DB_SC.stations[id]||{};
    if(cur.status === 'empty') return;
    const oid = cur._oid||'';
    try{ _scWaitBackFromStation(cur, id); }catch(_){}
    _tlClearFrozenTurn(id);
    setSt(id, {status:'empty', plate:'', driver:'', tank:'', batch:'', customer:'', doNum:'', qty:'', rmooc:'', turn:0, type:'', note:'', tech:{}, _oid:''});
    /* Re-render Today Plan so the order shows back as pending immediately. */
    try{ if(typeof TP!=='undefined' && oid) TP.refreshStatus(oid); }catch(_){}
    toast('Station '+id+' → empty','ok');
  }
  function swapStations(src,dst){
    const a={...(DB_SC.stations[src]||{status:'empty'})}, b={...(DB_SC.stations[dst]||{status:'empty'})};
    DB_SC.stations[src]=b; DB_SC.stations[dst]=a;
    if(FB_SC){ const u={}; u['stations/'+src]=b; u['stations/'+dst]=a; FB_SC.ref().update(u).catch(()=>{}); }
    scRenderCtrl(); toast('Station '+src+' ⟷ '+dst,'ok');
    try{ if(typeof FCHECK!=='undefined') FCHECK.recompute(); }catch(_){}
    try{ if(typeof TP!=='undefined') TP.refreshStatus(); }catch(_){}
  }

  /* v4.22.7 — Swap THIS station's tank to the other tank (3501 ↔ 3502).
     Only the station's {tank, batch} fields change; the global SC_TK_CFG
     (which drives the per-machine tank-selector buttons) is NOT touched —
     other stations and the inventory display keep using whatever was
     selected before. Tech weights are preserved (the operator may have
     already weighed the truck-in with the old tank's tare).

     One Firebase write per swap, via setSt → fbScSet('stations/'+id,…)
     (the standard per-station path). Bandwidth parity with drag-swap. */
  function swapStationTank(id){
    const cur = DB_SC.stations[id] || {};
    if(cur.status === 'empty'){ toast('Station '+id+' is empty','er'); return; }
    const curTank = String(cur.tank||'').toUpperCase();
    const isOn3501 = curTank.indexOf('3501') >= 0;
    const isOn3502 = curTank.indexOf('3502') >= 0;
    if(!isOn3501 && !isOn3502){
      toast('Current tank is not recognized (3501/3502) — cannot swap','er');
      return;
    }
    /* Target tank = the other one. Pull its lot from SC_TK_CFG. */
    const targetKey  = isOn3501 ? 'tk2' : 'tk1';
    const targetNum  = isOn3501 ? '3502' : '3501';
    const targetCfg  = SC_TK_CFG[targetKey] || {};
    const targetLot  = String(targetCfg.lot||'').trim();
    if(!targetLot){
      toast('TK-'+targetNum+' has no lot — enter a lot before swapping','er');
      return;
    }
    const targetTank  = 'TK-'+targetNum;
    const targetBatch = (typeof _sanitizeLotPrefix==='function')
      ? _sanitizeLotPrefix(targetLot)
      : targetLot;
    /* No-op guard: shouldn't happen given the 3501/3502 detection, but
       avoid writing if nothing actually changes. */
    if(cur.tank === targetTank && cur.batch === targetBatch){
      toast('Tank unchanged','');
      return;
    }
    const next = Object.assign({}, cur, { tank: targetTank, batch: targetBatch });
    setSt(id, next);
    try{ logAudit('scale:swap_tank:'+id, cur._oid || cur.doNum || '_', 'tank', curTank, targetTank, 'swap'); }catch(_){}
    toast('Station '+id+': '+(isOn3501?'TK-3501':'TK-3502')+' → '+targetTank,'ok');
  }

  /* ═══════════════════════════════════════════════════
     RENDER STATION CARDS
  ═══════════════════════════════════════════════════ */
  function scRenderCtrl(){
    const g = document.getElementById('scCtrlGrid'); if(!g) return;
    const sv={};
    for(let i=1;i<=4;i++) sv[i]={q:(document.getElementById('sc-inp-'+i)||{}).value||''};
    g.innerHTML='';
    const STLBL={empty:'Empty',calling:'Calling',loading:'Loading',wait:'Wait scale',done:'Done'};
    for(let i=1;i<=4;i++){
      const s=DB_SC.stations[i]||{status:'empty'}, st=s.status||'empty';
      const cc=document.createElement('div');
      cc.className='sc-card st-'+st;
      if(st!=='empty'&&s.tank){
        const tk=String(s.tank).toUpperCase();
        if(tk.indexOf('3501')>=0) cc.classList.add('tk-3501');
        else if(tk.indexOf('3502')>=0) cc.classList.add('tk-3502');
      }
      cc.dataset.stId=i;
      /* drag-drop */
      cc.draggable=true;
      cc.addEventListener('dragstart',e=>{ _stDragSrc=i; e.dataTransfer.setData('text/plain',String(i)); setTimeout(()=>cc.style.opacity='.4',0); });
      cc.addEventListener('dragend',()=>{ cc.style.opacity=''; _stDragSrc=null; document.querySelectorAll('.sc-card').forEach(c=>c.classList.remove('cc-dragover')); });
      cc.addEventListener('dragover',e=>{ if(_stDragSrc===null||_stDragSrc===i) return; e.preventDefault(); cc.classList.add('cc-dragover'); });
      cc.addEventListener('dragleave',()=>cc.classList.remove('cc-dragover'));
      cc.addEventListener('drop',e=>{ e.preventDefault(); cc.classList.remove('cc-dragover'); if(_stDragSrc!==null&&_stDragSrc!==i) swapStations(_stDragSrc,i); _stDragSrc=null; });
      /* v4.22.7 — card-level dblclick removed. Reset is now scoped to the status
         pill ("ĐANG NẠP"), and the tank/lot span has its own dblclick to swap
         tanks on THIS station only. Both handlers are attached AFTER innerHTML
         is written further down. */

      const rc = st==='loading' ? 'rl' : '';
      const turnNum=st==='empty'?getNextTurn(i):getDisplayTurn(i);
      const turnBadge=turnNum>0?`<span class="sc-turn-badge">T${turnNum}</span>`:'';

      /* header middle section */
      let hdrMid='';
      if(st==='empty'){
        hdrMid=`<input class="sc-hdr-search" id="sc-inp-${i}" placeholder="driver · plate · DO…"
          oninput="SCALE.scSearch(${i},this.value)" onfocus="SCALE.scShowResults(${i})" autocomplete="off">
          <button class="sc-search-clear" id="sc-clr-${i}" onclick="SCALE.scClear(${i})">✕</button>`;
      } else {
        /* loading state — SCALE opens the weighing-entry modal (writes station.tech).
           DONE completes the station (guarded by entered weight) and clears it; the
           order resolves to 'done' from TL-Data presence. PTT prints the loading ticket.
           No status dropdown — double-click the card to reset. */
        hdrMid=`<div class="sc-hdr-actions">
          <button class="sc-hdr-btn by" onclick="SCALE.openTech(${i})">SCALE</button>
          <button class="sc-hdr-btn bg" onclick="SCALE.setEmpty(${i})">DONE</button>
          <button class="sc-hdr-btn bb" onclick="SCALE.pttPrint(${i})">PTT</button>
        </div>`;
      }

      /* body */
      let body='';
      if(st==='empty'){
        body=`<div class="sc-empty-body">EMPTY</div>`;
      } else {
        const lotShort=shortLot(s.batch);
        /* RAM-only fleet/cert warning + sale note for this station (no popup, no Firebase). */
        let warnRow='';
        try{
          if(typeof FCHECK!=='undefined'){
            const w=FCHECK.stationWarning(s);
            const saleNote=(s.note||s.saleNote||'').toString().trim();
            if(w||saleNote){
              let inner='';
              if(w) inner+=`<div class="sc-warn-line sc-warn-${w.level}">${esc(w.text)}</div>`;
              if(saleNote) inner+=`<div class="sc-note-line">📝 ${esc(saleNote)}</div>`;
              warnRow=`<div class="sc-warn-row">${inner}</div>`;
            }
          }
        }catch(_){}
        body=`<div class="sc-card-body" onclick="SCALE.stEditOpen(${i})" title="Click to edit">
          <div class="sc-line ${rc}"><span class="sc-v cust">${esc(s.customer)||'—'}</span></div>
          <div class="sc-line ${rc}">
            <span class="sc-v tk" title="Double-click to swap to the other tank">${esc(s.tank)||'—'}/${lotShort}</span>
            <span class="sc-do-qty">
              <span class="sc-v do">${_mdoIsCombined(s) ? esc(s._linkedRows.map(r=>(r&&r.doNum)?String(r.doNum).trim():'Waiting DO').join(' / ')) : (isMultiDO(s.doNum) ? esc(splitDOs(s.doNum).join(' / ')) : (esc(s.doNum)||'—'))}</span>${_mdoIsCombined(s) ? `<span class="sc-combined-tag">${s._linkedRows.length} DO · COMBINED</span>` : ((s._multiDO && isMultiDO(s.doNum)) ? `<span class="sc-combined-tag">${splitDOs(s.doNum).length} DO · COMBINED</span>` : '')}
              ${s.qty?`<span class="sc-v qty">${parseFloat(s.qty)}<span class="sc-v qty-unit"> MT</span></span>`:'<span class="sc-v qty-miss">NO QTY</span>'}
            </span>
          </div>
          <div class="sc-line ${rc}">
            <span class="sc-v plate">${esc(s.plate)||'—'}</span>
            ${s.rmooc?`<span class="sc-v rmooc">/ ${esc(s.rmooc)}</span>`:''}
            <span class="sc-v driver" style="margin-left:auto">${esc(s.driver)||'—'}</span>
          </div>
        </div>${warnRow}`;
      }

      cc.innerHTML=`
        <div class="sc-card-hdr">
          <span class="sc-stn-name">TLB ${i}</span>${turnBadge}
          ${hdrMid}
          <div class="sc-status-wrap" title="${st==='empty'?'Empty':'Double-click the pill to reset this station'}">
            <span class="sc-status-pill st-${st}"><span class="sc-status-dot st-${st}"></span>${STLBL[st]||st}</span>
          </div>
        </div>${body}`;
      /* v4.22.7 — split-zone dblclick wiring (loading state only).
         The pill resets the station; the tank/lot span swaps to the other tank
         on this station only (SC_TK_CFG untouched). stopPropagation prevents
         the body's onclick (stEditOpen) from firing on dblclick. */
      if(st !== 'empty'){
        const pill = cc.querySelector('.sc-status-pill');
        if(pill){
          pill.addEventListener('dblclick', e=>{
            e.preventDefault(); e.stopPropagation();
            stationReset(i);
          });
        }
        const tkSpan = cc.querySelector('.sc-v.tk');
        if(tkSpan){
          tkSpan.addEventListener('dblclick', e=>{
            e.preventDefault(); e.stopPropagation();
            swapStationTank(i);
          });
          /* Block the parent body's single-click edit when the user is
             double-clicking the tank — avoids opening the edit modal in
             the brief window between the two clicks. */
          tkSpan.addEventListener('click', e=> e.stopPropagation());
        }
      }
      g.appendChild(cc);
    }
    for(let i=1;i<=4;i++){ const inp=document.getElementById('sc-inp-'+i); if(inp&&sv[i]?.q){ inp.value=sv[i].q; scShowResults(i,sv[i].q); } }
    _updateRow1();
  }

  function _updateRow1(){
    /* v4.22.8 — Combined PLAN card. Computes three MT figures in one pass
       over today's TP.PLAN, using TP.getEffectiveStatus(r) so AUTO-mode
       'done' rows (whose r._status is empty by design) and rows currently
       on a station ('loading') are both counted. Then sums INV.compute
       across both tanks for the cross-tank LPG/C3/C4 row. Pure RAM.
       v4.22.17 — Second pass over SCALE.getStations() picks up any station
       currently loading whose _oid did NOT match a plan row in the first
       pass (e.g. manually-created plan rows with empty _oid, or stations
       loading a truck not represented in today's plan). Their station.qty
       (operator-typed in-progress volume) is added to LOADED so the figure
       includes every truck physically loading at this moment. */
    /* v4.55.x — KHỚP logic với Customer Ledger (đúng số liệu):
       • PLAN  = Σ qty (CHỈ trường qty, KHÔNG fallback contractQty — contractQty là
                 cả hợp đồng, dùng nó sẽ thổi phồng PLAN) của đơn KHÔNG cancel.
       • LOADED= Σ khối lượng cân THỰC (TL) cho đơn 'done' (đổi kg→MT), thiếu thì
                 dùng qty; cộng thêm qty trạm đang nạp (live) ở vòng 2 bên dưới.
       Tránh các lỗi cũ: dùng plan qty thay vì cân thực, đếm cả đơn cancel. */
    let planTotalMt = 0, planDoneLoadMt = 0;
    const countedOids = new Set();
    const hasTP = (typeof TP !== 'undefined' && TP.PLAN);
    const getEff = (hasTP && typeof TP.getEffectiveStatus === 'function')
      ? TP.getEffectiveStatus : null;
    const getAct = (hasTP && typeof TP.getEffectiveActual === 'function')
      ? TP.getEffectiveActual : null;
    let planRowCount = 0;
    let planDoneCount = 0;   /* v4.5x — số ĐƠN đã complete (status done) */
    if(hasTP){
      const d = new Date(), p = n => String(n).padStart(2,'0');
      const today = d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
      Object.values(TP.PLAN).forEach(r => {
        const fd = String(r._forDate || '').trim();
        if(fd && fd !== today) return;                       /* today's plan only */
        const qty = parseFloat(r.qty || 0) || 0;             /* qty only — no contractQty */
        if(qty <= 0) return;
        const st = getEff ? String(getEff(r)||'').toLowerCase() : String(r._status||'').toLowerCase();
        if(st === 'cancel') return;                          /* đơn huỷ: bỏ khỏi mọi tổng */
        planRowCount++;
        planTotalMt += qty;
        if(st === 'done'){
          planDoneCount++;                                   /* đếm số đơn complete */
          const akg = getAct ? parseFloat(getAct(r)) : NaN;  /* khối lượng cân thực (kg) */
          planDoneLoadMt += (isFinite(akg) && akg > 0) ? akg/1000 : qty;
          const oid = String(r._oid||'').trim();
          if(oid) countedOids.add(oid);                      /* tránh trạm đếm trùng */
        }
        /* 'loading' KHÔNG cộng ở đây — vòng 2 cộng qty trạm đang nạp (live) */
      });
    }
    /* v4.22.17 — Station-level second pass: add qty for any station currently
       loading whose _oid wasn't already counted via the plan loop. Uses the
       station's own qty (what's actually being loaded right now), not plan.qty.
       Skips already-counted oids and skips loading sessions whose plan row was
       already counted under 'done' (TL row exists). */
    try{
      const stations = (typeof SCALE !== 'undefined' && SCALE.getStations) ? SCALE.getStations() : null;
      if(stations){
        Object.values(stations).forEach(s => {
          if(!s || s.status !== 'loading') return;
          const sOid = String(s._oid||'').trim();
          if(sOid && countedOids.has(sOid)) return;          /* already counted via plan loop */
          const q = parseFloat(s.qty) || 0;
          if(q <= 0) return;
          planDoneLoadMt += q;
          /* v4.5x — đếm đơn LOADED tạm tính: xe đang nạp ở trạm cũng tính là
             "loaded", khớp đúng cách LOADED qty cộng qty trạm đang nạp (live).
             Mirror qty 1:1 — không dedup riêng để count & qty luôn đồng bộ. */
          planDoneCount++;
        });
      }
    }catch(_){}
    const planRemainMt = Math.max(0, planTotalMt - planDoneLoadMt);
    const fmtMt = v => v > 0
      ? (Math.round(v * 10) / 10).toFixed(1)
      : (planRowCount > 0 ? '0' : '—');
    const setTxt = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
    setTxt('scPlanTotal',    fmtMt(planTotalMt));
    setTxt('scPlanDoneLoad', fmtMt(planDoneLoadMt));
    setTxt('scPlanRemain',   fmtMt(planRemainMt));
    /* v4.5x — dòng đếm SỐ ĐƠN: PLAN(tổng) · LOADED(đã complete) · REMAIN(còn lại).
       Ghi đầy đủ chữ + tô màu khớp với legend PLAN (đồng bộ màu). */
    (function(){
      const oc=document.getElementById('scPlanOrderCount');
      if(!oc) return;
      const rem=Math.max(0, planRowCount - planDoneCount);
      oc.innerHTML =
        '<span class="oc-plan">PLAN: '+planRowCount+'</span>'+
        '<span class="oc-load">LOADED: '+planDoneCount+'</span>'+
        '<span class="oc-remain">REMAIN: '+rem+'</span>';
    })();
    /* v4.33.0 — PLAN donut: arc = LOADED ÷ PLAN, center = % loaded.
       No plan rows today → dashed empty ring + "—". RAM-only. */
    (function(){
      const wrap=document.getElementById('scPlanDonutWrap');
      const arc =document.getElementById('scPlanDonutArc');
      const ctr =document.getElementById('scPlanDonutPct');
      if(!arc) return;
      const CIRC=2*Math.PI*24;
      if(planTotalMt<=0){
        wrap&&wrap.classList.add('empty');
        arc.style.strokeDasharray='0 '+CIRC.toFixed(1);
        if(ctr) ctr.textContent='—';
      } else {
        wrap&&wrap.classList.remove('empty');
        const p=Math.max(0,Math.min(1,planDoneLoadMt/planTotalMt));
        arc.style.strokeDasharray=(p*CIRC).toFixed(1)+' '+CIRC.toFixed(1);
        if(ctr) ctr.textContent=Math.round(p*100)+'%';
        if(wrap) wrap.title='Loaded '+fmtMt(planDoneLoadMt)+' / '+fmtMt(planTotalMt)+' MT';
      }
    })();

    /* Row 2: cross-tank STOCK total (TK-3501 + TK-3502) is owned by
       INV.renderRow1 (called below). It runs on every INV change, so the
       total stays live when a tank's init is declared — scRenderCtrl alone
       was not re-triggered by INV updates (v4.31.11). */

    /* Tank cards + PLAN stock total + XFER card refresh. */
    try{ if(typeof INV!=='undefined' && INV.renderRow1) INV.renderRow1(); }catch(_){}
  }

  /* ─── Tank cards (one per tank) ─── */
  function _renderTankBar(){
    const card1=document.getElementById('scTk1Card'), card2=document.getElementById('scTk2Card');
    if(!card1) return;
    const sel1=!!SC_TK_CFG.tk1.selected, sel2=!!SC_TK_CFG.tk2.selected;
    /* selected card highlighted, the other dimmed.
       v4.33.0 — preserve the 'nostock' state class (owned by INV.renderRow1's
       ball gauge): a full className overwrite here would wipe it and re-show
       the C3/C4 row on tanks that have no opening stock. */
    const ns1=card1.classList.contains('nostock')?' nostock':'';
    const ns2=card2.classList.contains('nostock')?' nostock':'';
    card1.className='sc-tkc sc-tkc-3501'+(sel1?' sel-3501':' dim')+ns1;
    card2.className='sc-tkc sc-tkc-3502'+(sel2?' sel-3502':' dim')+ns2;
    /* per-tank lot inputs */
    [['tk1','scLotInp1'],['tk2','scLotInp2']].forEach(([key,id])=>{
      const li=document.getElementById(id); if(!li) return;
      const full=SC_TK_CFG[key].lot||'';
      li.dataset.full=full;
      li.value=full?shortLot(full):'';
    });
    /* per-tank mode buttons */
    [['tk1','scModeBtn1'],['tk2','scModeBtn2']].forEach(([key,id])=>{
      const mb=document.getElementById(id); if(!mb) return;
      const m=SC_TK_CFG[key].mode||'auto';
      mb.className='sc-mode-btn '+(m==='auto'?'auto':'manual');
      mb.textContent=m==='auto'?'AUTO':'MANUAL';
    });
    /* legacy cell tint kept in sync (harmless if rules unused) */
    const cell=document.getElementById('scTkCell');
    if(cell){
      cell.classList.remove('tk-active-3501','tk-active-3502');
      if(sel1) cell.classList.add('tk-active-3501');
      else if(sel2) cell.classList.add('tk-active-3502');
    }
    /* INV owns the live LPG/C3/C4 of BOTH tanks (renders into each card) */
    try{ if(typeof INV!=='undefined' && INV.renderRow1) INV.renderRow1(); }catch(_){}
  }

  /* Latest lot string for a tank — reads ENG.ROWS (Tank Log) and returns the
     highest-numbered LPG-YYYY-NN of the current year for that tank. */
  function _latestLotForTank(n){
    const tk = n===1 ? '3501' : '3502';
    const yr = new Date().getFullYear();
    let best = null;
    const rows = (typeof ENG!=='undefined' && ENG.ROWS) ? ENG.ROWS : [];
    rows.forEach(r=>{
      if(!r) return;
      const lotStr = String(r[1]||'').trim();
      let lotYr=yr, lotNum=NaN;
      const pm = lotStr.match(/LPG-(\d{4})-(\d+)/i);
      if(pm){ lotYr=parseInt(pm[1]); lotNum=parseInt(pm[2]); }
      else { lotNum=parseInt(lotStr); }
      if(isNaN(lotNum) || lotYr !== yr) return;
      const rTk = String(r[2]||'').toUpperCase();
      if(!rTk.includes(tk)) return;
      if(!best || lotNum > best.num) best = {num:lotNum, full:lotStr};
    });
    return best ? best.full : '';
  }

  function scTkSelect(n){
    SC_TK_CFG.tk1.selected=(n===1); SC_TK_CFG.tk2.selected=(n===2);
    /* Auto-pull latest lot from Tank Log when switching tanks */
    const latest = _latestLotForTank(n);
    if(latest) SC_TK_CFG['tk'+n].lot = latest;
    _tkSaveToFb(); _renderTankBar(); scRenderCtrl();
    try{ if(typeof INV!=='undefined') INV.onTankSwitch(n); }catch(_){}
  }
  function scToggleMode(n){
    const key = n===1 ? 'tk1' : n===2 ? 'tk2'
              : (SC_TK_CFG.tk1.selected?'tk1':SC_TK_CFG.tk2.selected?'tk2':null);
    if(!key){ toast('Select tank first','er'); return; }
    SC_TK_CFG[key].mode=SC_TK_CFG[key].mode==='auto'?'manual':'auto';
    _tkSaveToFb(); _renderTankBar();
    toast((key==='tk1'?'TK-3501':'TK-3502')+' → '+(SC_TK_CFG[key].mode==='auto'?'AUTO':'MANUAL'),'ok');
  }
  /* Called by oninput on the single lot input — the field now shows the SHORT lot
     (just the number). We reconstruct the full LPG-YYYY-NN before storing so the rest
     of the app and Firebase keep the canonical full lot. */
  function _onLotChange(n){
    const id  = n===2 ? 'scLotInp2' : 'scLotInp1';
    const key = n===2 ? 'tk2' : 'tk1';
    const inp=document.getElementById(id);
    if(!inp) return;
    const typed=inp.value.trim();
    let full;
    if(typed===''){
      full='';
    }else if(/^\d+$/.test(typed)){
      /* pure number → rebuild using the year from the previous full lot, else current year */
      let yr=new Date().getFullYear();
      const prev=inp.dataset.full||SC_TK_CFG[key].lot||'';
      const m=prev.match(/LPG-(\d{4})-/); if(m) yr=m[1];
      full='LPG-'+yr+'-'+typed;
    }else{
      full=typed; /* user typed a custom/full lot — keep verbatim */
    }
    SC_TK_CFG[key].lot=full;
    inp.dataset.full=full;
    /* debounce save */
    clearTimeout(SC_TK_CFG._lotTimer);
    SC_TK_CFG._lotTimer=setTimeout(()=>_tkSaveToFb(),800);
  }
  /* External helper — called by ENG init or whenever Tank Log changes.
     Refreshes the active tank's lot from latest Tank Log entry. */
  function refreshLotFromTankLog(){
    const key=SC_TK_CFG.tk1.selected?'tk1':SC_TK_CFG.tk2.selected?'tk2':null;
    if(!key) return;
    const n = key==='tk1' ? 1 : 2;
    const latest = _latestLotForTank(n);
    if(latest && latest !== SC_TK_CFG[key].lot){
      SC_TK_CFG[key].lot = latest;
      _tkSaveToFb();
      _renderTankBar();
    }
  }
  function _tkSaveToFb(){
    if(!FB_SC) return;
    _tkVer++;
    const clean={_ver:_tkVer};
    ['tk1','tk2'].forEach(k=>{ const c=SC_TK_CFG[k]; clean[k]={selected:!!c.selected,lot:c.lot||'',initWt:c.initWt||0,mode:c.mode||'auto',manualWt:c.manualWt||0}; });
    FB_SC.ref('tank_config').set(clean).catch(e=>console.warn('[SCALE] tk save',e));
  }

  /* ─── Search (station assign) ─── */
  /* v4.31.8 — accent-insensitive (no-dấu) normalizer for station search.
     Lowercase + strip Vietnamese diacritics + đ→d + collapse whitespace, so
     "cong" matches "Công", "dat" matches "Đạt", etc. Loosens the match. */
  function _normVN(s){
    return String(s||'')
      .trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/đ/g,'d').replace(/Đ/g,'d')
      .replace(/\s+/g,' ');
  }

  function scSearch(stId,query){
    const clr=document.getElementById('sc-clr-'+stId);
    if(clr) clr.style.display=query.length>0?'block':'none';
    if(!query.trim()){ scHideResults(stId); return; }
    scShowResults(stId,query.trim());
  }
  function _getOrCreateRes(stId){
    let res=document.getElementById('sc-res-'+stId);
    if(!res){ res=document.createElement('div'); res.id='sc-res-'+stId;
      res.style.cssText='position:fixed;z-index:9999;background:#fff;border:1.5px solid var(--border);border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.15);max-height:240px;overflow-y:auto;display:none;';
      document.body.appendChild(res); }
    return res;
  }
  function _positionRes(stId){
    const inp=document.getElementById('sc-inp-'+stId), res=document.getElementById('sc-res-'+stId);
    if(!inp||!res) return;
    const r=inp.getBoundingClientRect();
    res.style.left=r.left+'px'; res.style.top=(r.bottom+2)+'px'; res.style.width=Math.max(r.width,280)+'px';
  }
  /* v4.31.13 — central guard: which plan rows may NOT be assigned to a station
     (i.e. sold). Returns {code, badge, msg} when the row is blocked, else null.
     Used by the search results (compressed, non-assignable render) AND by every
     assign path (click, queue, multi-DO picker, waitPop) via scAssignToStation.
       • done / cancel — order already finished / cancelled
       • noload        — sales set "allow to load" = NO (explicitly not sellable)
       • nodo          — no usable DO yet: no real DO AND no temp DO. A legit temp
                         DO (e.g. KNH26060201) is still sellable; only an empty /
                         placeholder DO column (e.g. the auto "PLN-…" id) blocks. */
  function _assignBlockReason(r){
    if(!r) return null;
    let st='';
    try{ if(typeof TP!=='undefined' && typeof TP.getEffectiveStatus==='function') st=String(TP.getEffectiveStatus(r)||'').toLowerCase(); }catch(_){}
    if(st==='done')   return { code:'done',   badge:'<span class="sc-res-status-badge s-done">✅ DONE</span>',     msg:'Order is DONE — cannot assign to a station' };
    if(st==='cancel') return { code:'cancel', badge:'<span class="sc-res-status-badge s-cancel">🚫 CANCEL</span>', msg:'Order is CANCELLED — cannot assign to a station' };
    if(String(r.allowLoad||'').trim().toUpperCase()==='NO')
      return { code:'noload', badge:'<span class="sc-res-status-badge s-noload">🚫 NO LOAD</span>', msg:'Sale marked NO (not for sale) — cannot assign to a station' };
    const dnum=String(r.doNum||'').trim();
    /* A row is assignable when it carries at least one real DO OR a temp OID.
       Combined multi-DO rows hold a space-joined string (e.g. "8651943 PET2606121"
       or all-temp "PET2606121 TAN2606121"); isTempOid() rejects multi-token strings,
       so check every whitespace token, not just the whole string. */
    const _hasId = splitDOs(dnum).length>0 || dnum.split(/\s+/).some(t=>isTempOid(t));
    if(!_hasId)
      return { code:'nodo', badge:'<span class="sc-res-status-badge s-nodo">⚠ NO DO</span>', msg:'No DO yet — cannot assign to a station (create a DO first)' };
    return null;
  }

  function scShowResults(stId,query){
    const res=_getOrCreateRes(stId);
    const q=query||(document.getElementById('sc-inp-'+stId)||{}).value||'';
    if(!q.trim()){ res.style.display='none'; return; }
    _positionRes(stId);
    let rows=typeof TP!=='undefined'&&TP.PLAN ? Object.values(TP.PLAN) : [];
    const ql=_normVN(q);
    /* Build the set of orders currently on a station. Key by the UNIQUE identity (_oid);
       only also key by doNum when it is a real DO. NEVER key by a placeholder/temp doNum,
       because many temp orders can share the same text (e.g. "After loading") and that
       would wrongly hide every other order with the same text. */
    const assigned=new Set();
    Object.values(DB_SC.stations||{}).forEach(st=>{
      if(st.status&&st.status!=='empty'){
        const oid=String(st._oid||'').trim();
        const dn =String(st.doNum||'').trim();
        if(oid) assigned.add(oid);
        if(/^\d{7,}$/.test(dn)) assigned.add(dn);   /* real DO only */
        splitDOs(dn).forEach(d=>assigned.add(d));   /* multi-DO: each combined DO counts as assigned */
      }
    });
    const matches=rows.filter(r=>{
      const doStr=String(r.doNum||'').trim();
      const oidStr=String(r._oid||'').trim();
      if(oidStr&&assigned.has(oidStr)) return false;            /* same order already on a station */
      if(/^\d{7,}$/.test(doStr)&&assigned.has(doStr)) return false;  /* same real DO already on a station */
      return _normVN(r.plate).includes(ql)||_normVN(r.driver).includes(ql)||_normVN(doStr).includes(ql)||_normVN(oidStr).includes(ql)||_normVN(r.customer).includes(ql);
    }).slice(0,8);
    if(!matches.length){ res.innerHTML='<div style="padding:8px;color:var(--muted);font-size:10px;text-align:center">No results</div>'; res.style.display='block'; return; }
    /* v4.31.13 — resolve a non-assignable reason for each match (RAM only).
       Blocked orders (done / cancel / NO-load / no-DO) are still shown so the
       operator understands why a familiar plate isn't sellable, but rendered
       compressed and non-clickable (the click handler explains and aborts). */
    res.innerHTML=matches.map((r,idx)=>{
      const block = _assignBlockReason(r);
      /* Compressed render for any blocked order — single line, reason badge, no click. */
      if(block){
        const idTxt = esc(r.doNum || (isTempOid(String(r._oid||'')) ? r._oid : ''));
        return `<div class="sc-res-row-closed" id="sc-res-row-${stId}-${idx}"
          style="padding:4px 9px;border-bottom:1px solid #f0f4f8;font-size:10px;display:flex;align-items:center;gap:6px;"
          onclick="SCALE.assignFromSearch(${stId},${idx})"
          title="${esc(block.msg)}">
          <span style="font-family:'Oswald',sans-serif;font-weight:700;font-size:11px">${esc(r.plate||'—')}</span>
          <span style="color:var(--muted);font-size:9px">${idTxt}</span>
          <span style="color:var(--muted);font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0">${esc(r.customer||'—')}</span>
          ${block.badge}
        </div>`;
      }
      const qty=r.qty||r.contractQty||'';
      let warn=null;
      try{ if(typeof FCHECK!=='undefined') warn=FCHECK.orderWarning(r); }catch(_){}
      let badgeHtml='';
      if(warn&&warn.badges&&warn.badges.length){
        badgeHtml='<div class="sc-res-badges">'+warn.badges.map(b=>{
          const cls=b.type==='exp'?'b-exp':(b.type==='miss'?'b-miss':'b-warn');
          const ic=b.type==='exp'?'🔴':(b.type==='miss'?'❌':'⚠');
          return `<span class="sc-res-badge ${cls}">${ic} ${esc(b.text)}</span>`;
        }).join('')+'</div>';
      }
      const saleNote=(r.note||'').toString().trim();
      const noteHtml=saleNote?`<div class="sc-res-note">📝 ${esc(saleNote)}</div>`:'';
      const plateCls=(warn&&warn.badges&&warn.badges.some(b=>b.type==='miss'))?'style="color:#d62839"':'';
      return `<div id="sc-res-row-${stId}-${idx}" data-warn="${warn&&warn.hasWarn?1:0}"
        style="padding:5px 9px;border-bottom:1px solid #f0f4f8;cursor:pointer;font-size:11px;transition:background .1s"
        onmouseover="if(!this.classList.contains('sc-res-armed'))this.style.background='#f0f8ff'" onmouseout="if(!this.classList.contains('sc-res-armed'))this.style.background=''"
        onclick="SCALE.assignFromSearch(${stId},${idx})">
        <div style="display:flex;align-items:center;gap:6px">
          <div style="flex:1;min-width:0">
            <span style="font-family:'Oswald',sans-serif;font-weight:700;font-size:12px" ${plateCls}>${esc(r.plate||'—')}</span>
            <span style="font-size:9px;color:var(--muted);margin-left:4px">${esc(r.doNum || (isTempOid(String(r._oid||'')) ? r._oid : ''))}</span>
            <div style="color:var(--muted);font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${esc(r.driver||'—')} · ${esc(r.customer||'—')}${qty?' · <b>'+esc(String(qty))+'MT</b>':''}
            </div>
          </div>
        </div>
        ${badgeHtml}${noteHtml}
        <div class="sc-res-confirm">⚠ Click again to assign anyway</div>
      </div>`;
    }).join('');
    res.style.display='block';
    window._scSearchMatches=window._scSearchMatches||{};
    window._scSearchMatches[stId]=matches;
    if(window._scArmed) window._scArmed[stId]=null;   // reset two-click arm on new search
  }
  function scHideResults(stId){ const res=document.getElementById('sc-res-'+stId); if(res) res.style.display='none'; }
  function scClear(stId){
    const inp=document.getElementById('sc-inp-'+stId); if(inp) inp.value='';
    const clr=document.getElementById('sc-clr-'+stId); if(clr) clr.style.display='none';
    scHideResults(stId);
  }
  function assignFromSearch(stId,idx){
    const matches=(window._scSearchMatches||{})[stId];
    if(!matches||!matches[idx]) return;
    const row=matches[idx];
    /* v4.31.13 — blocked orders (done / cancel / NO-load / no-DO) are rendered
       compressed but the click still fires; intercept here and explain instead
       of a silent no-op. */
    const _block = _assignBlockReason(row);
    if(_block){ toast(_block.msg,'er'); return; }
    let warn=null;
    try{ if(typeof FCHECK!=='undefined') warn=FCHECK.orderWarning(row); }catch(_){}
    /* No warning → assign on single click (unchanged behavior). */
    if(!warn||!warn.hasWarn){ scHideResults(stId); scAssignToStation(stId,row); return; }
    /* Has warning → two-click confirm. 1st click arms (color + blink), 2nd assigns. */
    window._scArmed=window._scArmed||{};
    const el=document.getElementById('sc-res-row-'+stId+'-'+idx);
    if(window._scArmed[stId]===idx){
      window._scArmed[stId]=null;
      scHideResults(stId);
      scAssignToStation(stId,row);
    }else{
      window._scArmed[stId]=idx;
      const res=document.getElementById('sc-res-'+stId);
      if(res) Array.from(res.children).forEach(c=>{ c.classList.remove('sc-res-armed'); c.style.background=''; });
      if(el) el.classList.add('sc-res-armed');
    }
  }
  /* ════════════════════════════════════════════════════════════
     MULTI-DO ASSIGN — detection + picker popup (V406 parity)
     One truck (same plate + same driver) with several DOs in the
     plan today → offer LOAD TOGETHER (merge into one combined-DO
     station load) vs assign only the picked row. Total ≤ 27 MT.
     RAM-only: reads TP.PLAN / DB_SC.stations / SC_WAIT, no plan writes.
     Re-entry guard: row._mdResolved (set by the callbacks).
     ════════════════════════════════════════════════════════════ */
  let _mdoCtx = null;
  function _mdoNormPlate(v){ return String(v||'').replace(/[-.\s]/g,'').toUpperCase(); }

  /* Find OTHER plan rows that can be loaded together with `row`. */
  function _mdoFindLinkable(stId, row){
    const plate = _mdoNormPlate(row.plate);
    const driver = String(row.driver||'').trim().toUpperCase();
    if(!plate || !driver) return [];
    const rowDate = String(row._forDate||'').trim();
    /* DOs already committed: on a station, in the wait queue, or the picked row */
    const assigned = new Set();
    Object.values(DB_SC.stations||{}).forEach(st=>{ if(st && st.doNum) splitDOs(st.doNum).forEach(d=>assigned.add(d)); });
    (SC_WAIT||[]).forEach(w=>{ if(w && w.doNum) splitDOs(w.doNum).forEach(d=>assigned.add(d)); });
    splitDOs(row.doNum||'').forEach(d=>assigned.add(d));
    const rows = (typeof TP!=='undefined' && TP.PLAN) ? Object.values(TP.PLAN) : [];
    const effStatus = (r)=>{ try{ return (typeof TP!=='undefined'&&TP.getEffectiveStatus)
      ? String(TP.getEffectiveStatus(r)||'').toLowerCase() : String(r._status||'').toLowerCase(); }
      catch(_){ return String(r._status||'').toLowerCase(); } };
    return rows.filter(r=>{
      if(!r || r===row) return false;
      if(r._oid && String(r._oid) === String(row._oid||'')) return false;       /* same order */
      const es = effStatus(r);
      if(es==='done' || es==='cancel') return false;
      if(_mdoNormPlate(r.plate) !== plate) return false;                         /* same plate */
      if(String(r.driver||'').trim().toUpperCase() !== driver) return false;     /* same driver */
      if(rowDate && String(r._forDate||'').trim() !== rowDate) return false;     /* same plan date */
      const rDOs = splitDOs(r.doNum||'');
      if(rDOs.length && rDOs.every(d=>assigned.has(d))) return false;            /* already committed */
      /* not currently sitting in a station (by plate or DO overlap) */
      let inStation = false;
      Object.values(DB_SC.stations||{}).forEach(st=>{
        if(inStation || !st || !st.status || st.status==='empty') return;
        if(r.plate && _mdoNormPlate(st.plate) === _mdoNormPlate(r.plate)){ inStation = true; return; }
        if(r.doNum && st.doNum && dosOverlap(st.doNum, r.doNum)){ inStation = true; }
      });
      if(inStation) return false;
      return true;
    });
  }

  /* Render the merge/single picker into the station's search-results dropdown. */
  function _mdoShowPopup(stId, pickedRow, otherRows){
    const res = _getOrCreateRes(stId);
    _positionRes(stId);
    const allRows = [pickedRow, ...otherRows];
    const totalQty = allRows.reduce((s,r)=>s+(parseFloat(r.qty||0)||0),0);
    /* Combined max-tol. Each plan row's `tolerance` already holds (qty + per-load
       allowance), e.g. 25.000 → 25.300. Summing those would count the loading
       qty N times. The correct combined max weight is: total loading qty + ONE
       allowance, where the allowance is the largest per-DO (tolerance − qty). */
    const _mdoAllow = Math.max.apply(null, allRows.map(r=>{
      const q = parseFloat(r.qty||0)||0, t = parseFloat(r.tolerance||r.maxTol||0)||0;
      return (t>q) ? (t-q) : 0;
    }).concat([0]));
    const maxTol = totalQty + _mdoAllow;
    const pickedDO = String(pickedRow.doNum||'').trim();
    const pickedQty = parseFloat(pickedRow.qty||0)||0;
    const listHTML = allRows.map((r,i)=>{
      const rowNote=(r.note||'').trim();
      const doDisplay = String(r.doNum||'').trim() || '<span style="color:#d62839;font-style:italic">Waiting DO</span>';
      return '<div style="padding:5px 0;'+(i>0?'border-top:1px dashed #e0e8ef':'')+'">'
        + '<div style="display:flex;align-items:center;gap:6px">'
        + '<span style="font-family:\'Oswald\',sans-serif;font-weight:700;color:#0077b6;font-size:12px;min-width:85px">'+doDisplay+'</span>'
        + '<span style="font-size:11px;color:#1a2733;flex:1">'+esc(r.customer||'—')+'</span>'
        + '<span style="font-family:\'Oswald\',sans-serif;font-weight:700;color:#0d6e3a;font-size:12px">'+esc(String(r.qty||'—'))+' MT</span>'
        + '</div>'
        + (rowNote?'<div style="margin-top:3px;padding:3px 6px;background:#fffde7;border-left:3px solid #f59e0b;font-size:12px;font-weight:600;color:#92400e">📝 '+esc(rowNote)+'</div>':'')
        + '</div>';
    }).join('');
    const saleNotes = allRows.filter(r=>(r.note||'').trim()).map(r=>esc((r.note||'').trim()));
    const saleNoteHTML = saleNotes.length
      ? '<div style="background:#fff8e1;border:2px solid #f59e0b;border-radius:6px;padding:8px 10px;margin-top:8px">'
        + '<div style="font-family:\'Oswald\',sans-serif;font-size:11px;color:#b45309;letter-spacing:1px;margin-bottom:4px">📋 SALE NOTE</div>'
        + '<div style="font-size:14px;font-weight:700;color:#78350f;line-height:1.4">'+saleNotes.join('<br>')+'</div></div>'
      : '';
    res.innerHTML = '<div style="padding:10px">'
      + '<div style="font-family:\'Oswald\',sans-serif;font-size:12px;letter-spacing:1px;color:#0077b6;margin-bottom:6px">⚠ MULTI-DO DETECTED — '+esc(pickedRow.plate)+'</div>'
      + '<div style="font-size:11px;color:var(--muted);margin-bottom:8px">Truck <b>'+esc(pickedRow.plate)+'</b> · Driver <b>'+esc(pickedRow.driver||'—')+'</b> — '+allRows.length+' DOs:</div>'
      + '<div style="background:#f7f9fc;border:1px solid var(--border);border-radius:5px;padding:6px 10px">'+listHTML+'</div>'
      + saleNoteHTML
      + '<div style="display:flex;flex-direction:column;gap:5px;margin-top:10px">'
      + '<button onclick="SCALE.mdoMerge('+stId+')" style="padding:8px 14px;background:linear-gradient(135deg,#0077b6,#005f8e);color:#fff;border:none;border-radius:5px;font-family:\'Oswald\',sans-serif;font-size:12px;font-weight:700;letter-spacing:1px;cursor:pointer">🔗 LOAD TOGETHER — '+totalQty.toFixed(1)+' MT ('+allRows.length+' DO)</button>'
      + '<button onclick="SCALE.mdoSingle('+stId+')" style="padding:7px 12px;background:#fff;color:#1a2733;border:1.5px solid var(--border);border-radius:5px;font-size:11px;font-weight:600;cursor:pointer">📄 Only '+(pickedDO?('DO '+esc(pickedDO)):esc(pickedRow.customer||'this row'))+' — '+pickedQty.toFixed(1)+' MT</button>'
      + '<button onclick="SCALE.mdoCancel('+stId+')" style="padding:4px;background:none;border:none;color:var(--muted);font-size:10px;cursor:pointer">✕ Cancel</button>'
      + '</div></div>';
    res.style.display='block';
    _mdoCtx = { stId, pickedRow, otherRows, allRows, totalQty, maxTol };
  }

  /* LOAD TOGETHER → merge all DOs into one combined-DO row, then assign. */
  function mdoMerge(stId){
    const ctx = _mdoCtx; if(!ctx) return;
    scHideResults(stId);
    /* Build the combined DO string by resolving EACH linked row to its own
       identity — a real DO when present, otherwise its temp OID. Cleaning the
       joined string instead (cleanDO of "8651943 PET2606121") would discard every
       temp token whenever any real DO was present, losing temp-DO members. */
    const _rowId = r=>{
      const c = cleanDO(String(r.doNum||'').trim());
      if(c && /\d{7,}/.test(c)) return c;                 /* has a real DO */
      const oid = String(r._oid||'').trim();
      return isTempOid(c) ? c : (isTempOid(oid) ? oid : '');
    };
    const mergedDOs = ctx.allRows.map(_rowId).filter(Boolean).join(' ');
    const merged = Object.assign({}, ctx.pickedRow, {
      doNum: mergedDOs,
      qty: String(ctx.totalQty),
      tolerance: String(ctx.maxTol),
      _multiDO: true,
      _linkedRows: ctx.allRows.map(r=>({ doNum:r.doNum||'', customer:r.customer||'', qty:r.qty||'', type:r.type||'', note:r.note||'' })),
      _mdResolved: true
    });
    try{ if(typeof logAudit==='function') logAudit('scale:assign_multi_do', stId, '_merge', ctx.allRows.length, '', 'merge'); }catch(_){}
    scAssignToStation(stId, merged);
    _mdoCtx = null;
  }
  /* Only the picked row → assign normally (skip re-detection). */
  function mdoSingle(stId){
    const ctx = _mdoCtx; if(!ctx) return;
    scHideResults(stId);
    const single = Object.assign({}, ctx.pickedRow, { _mdResolved: true });
    scAssignToStation(stId, single);
    _mdoCtx = null;
  }
  function mdoCancel(stId){ _mdoCtx = null; scClear(stId); }

  function scAssignToStation(stId,row){
    /* v4.31.13 — central sales guard. Every assign path (search click, queue 📍,
       multi-DO picker, waitPop) funnels through here, so blocked orders
       (done / cancel / allowLoad=NO / no-DO) can never reach a station. */
    const _block = _assignBlockReason(row);
    if(_block){ toast(_block.msg,'er'); return; }
    /* The unified order identifier (_oid) is the source of truth. Use the real DO only
       when the DO column actually holds one; otherwise (empty or a placeholder like
       "after loading") fall back to the temp id (_oid). SYNC links station↔plan by _oid. */
    const _rawDO = String(row.doNum||'').trim();
    /* A combined multi-DO row keeps its full DO string verbatim (already
       normalised at merge time), even when its DOs are TEMP ids — relying on
       isMultiDO() here would collapse a temp-DO combine back to a single _oid. */
    const _isCombo = !!(row._multiDO && Array.isArray(row._linkedRows) && row._linkedRows.length > 1);
    const realDO = _isCombo ? _rawDO
                 : (/^\d{7,}$/.test(_rawDO) ? _rawDO : '');
    const doStr  = realDO || String(row._oid||'').trim();
    if(!doStr){ toast('Order has no DO / Order ID','er'); return; }
    if(!row.plate){ toast('Missing plate','er'); return; }
    if(!row.driver){ toast('Missing driver','er'); return; }
    /* Plan date gate — a row whose _forDate is not today is either a future
       plan staged in advance, or a stale row from a previous day. Either way,
       it must not be loaded onto a station: the operator should wait for the
       day to arrive (future) or remove the stale row (past). */
    const _scIsoToday = (()=>{ const d=new Date(),p=n=>String(n).padStart(2,'0');
      return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); })();
    const rowDate = String(row._forDate||'').trim();
    if(rowDate && rowDate !== _scIsoToday){
      const which = rowDate > _scIsoToday ? 'future' : 'stale';
      toast('Cannot assign — this row is a '+which+' plan ('+rowDate+'). Only rows for today can be loaded.','er');
      return;
    }
    const qty=parseFloat(row.qty||row.contractQty||0)||0;
    if(!qty){ toast('Missing Loading Qty','er'); return; }
    let active=tkGetActive();
    /* ── Pure-product override ──────────────────────────────────────────────
       A Pure C3 / C4 order does NOT load from TK-3501/3502. Instead it draws
       from its dedicated pure tank and gets an auto Pure-Log lot:
         • Pure C3 → TK-3301, lot = next C3 lot in Pure Log (+1)
         • Pure C4 → TK-3401, lot = next C4 lot in Pure Log (+1)
       Year is the current year (handled by PLOG.nextLot). C3/C4 lots are
       tracked separately, e.g. LPG-2026-TL-C3-09 / LPG-2026-TL-C4-09. The
       operator does NOT need to select a tank or type a lot for pure orders. */
    const _pureType = _scPureType(row.type);
    if(_pureType){
      const pn = _pureType==='C3' ? '3301' : '3401';
      let plot = '';
      try{ if(typeof PLOG!=='undefined' && PLOG.nextLot) plot = PLOG.nextLot(_pureType); }catch(_){}
      active = { name:'TK-'+pn, key:'pure', lotFull:plot, lotNum:plot, initWt:0 };
    }
    if(!active||!active.lotNum){
      toast(_pureType ? 'Cannot compute Pure lot — check Pure Log' : 'Select tank & enter lot first','er');
      return;
    }
    /* ── Multi-DO detection (V406 parity). Runs once per operator action; the
       merge/single callbacks set row._mdResolved so re-entry skips this. The
       picked row is already validated (DO/plate/driver/date/qty/tank) at this
       point, so whichever branch the operator picks proceeds cleanly. ── */
    if(!row._mdResolved){
      try{
        const _others = _mdoFindLinkable(stId, row);
        if(_others.length){
          const _tot = [row].concat(_others).reduce((s,r)=>s+(parseFloat(r.qty||0)||0),0);
          if(_tot <= 27){ _mdoShowPopup(stId, row, _others); return; }
        }
      }catch(e){ console.warn('[multiDO] detect failed', e); }
    }
    /* Fleet/cert warning is surfaced inline in the search results + two-click
       confirm in assignFromSearch() — no blocking dialog here. RAM-only.
       Status goes straight to 'loading' (no Calling intermediate). The PTT
       print overlay opens automatically so the operator can print and hand it
       to the driver — that is the moment loading effectively begins. */
    /* WGCHECK soft warning (parity with V406 checkBoothNote): compute Plan↔WMS
       discrepancies (planQty > wmsQty, DO not in WMS) and prepend to the station
       note so the booth operator sees them. Operator can still proceed — V406
       did NOT block on these. RAM-only. */
    let stNote = (row.note||'').toString().trim();
    try{
      if(typeof WGCHECK !== 'undefined'){
        const wgWarns = WGCHECK.assignWarnings(row);
        if(wgWarns.length){
          const wgText = wgWarns.join(' | ');
          stNote = stNote ? (wgText + ' | ' + stNote) : wgText;
          if(typeof toast === 'function') toast('⚠ Plan ↔ WMS warning — see station note', 'er', 4500);
        }
      }
    }catch(_){}
    setSt(stId,{status:'loading',plate:row.plate||'',driver:row.driver||'',tank:active.name,
      batch:active.lotFull,customer:row.customer||'',doNum:doStr,qty:String(qty),
      rmooc:row.rmooc||row.romooc||'',turn:getDisplayTurn(stId),type:row.type||'',
      note:stNote,tech:{},_oid:row._oid||'',
      tolerance:String(row.tolerance||row.maxTol||''),
      _multiDO:row._multiDO||false,_linkedRows:row._linkedRows||null});
    /* v4.5x — Staff-on-duty reminder folded into the assign toast (so it isn't
       overwritten by a separate toast). Engineer / Check Booth feed the PTT & DN
       signatures that auto-print right after assign, so nudge if either is empty
       at commit time. Non-blocking — the truck is still assigned. */
    (function(){
      const _engOn = (document.getElementById('scEngineer')?.value||'').trim();
      const _chkOn = (document.getElementById('scCheckBooth')?.value||'').trim();
      const _missStaff = [];
      if(!_engOn) _missStaff.push('Engineer');
      if(!_chkOn) _missStaff.push('Check Booth');
      if(_missStaff.length)
        toast(row.plate+' → Station '+stId+' · ⚠ Chưa điền Staff on duty: '+_missStaff.join(' & '), 'warn');
      else
        toast(row.plate+' → Station '+stId, 'ok');
    })();
    scClear(stId);
    /* v4.21.3 — Clean the wait-queue of any items matching this assigned
       row. Centralizing the cleanup here covers ALL assign paths (per-
       station search input, queue's 📍 click, popup waitPopAssign) so a
       vehicle can never appear twice (on a station AND still in queue).
       Match by _oid first (canonical), then by real DO as a fallback.
       Idempotent — if the queue's own assign path already spliced the
       item, nothing left to remove. */
    try{ _scWaitCleanupByRow(row._oid||'', doStr); }catch(_){}
    /* Auto-open PTT for printing — driver needs the ticket to begin loading. */
    setTimeout(()=>{ try{ pttPrint(stId); }catch(e){ console.warn('[SCALE] auto PTT', e); } }, 150);
  }

  /* ═══════════════════════════════════════════════════
     CERT CHECK PANEL — search Fleet RAM
  ═══════════════════════════════════════════════════ */
  function certSearch(query){
    const resEl=document.getElementById('scCertResults'); if(!resEl) return;
    const q=_normVN(query);
    if(!q){ resEl.innerHTML=''; return; }

    /* Search across tanklorry + tractor + rmooc + driver tabs.
       Vehicle tabs key on plate; driver tab keys on name + phone.
       v4.31.15 — no-dấu + token-AND match: each whitespace-separated token
       only has to appear somewhere in the row's combined plate+name+phone
       haystack (accent-insensitive, order-free, field-agnostic). Loosens
       the match so "sang dao" finds "Đào Ngọc Sang", a partial plate plus a
       driver fragment finds the same row, etc. */
    const tokens=q.split(' ').filter(Boolean);
    const hits=[];
    ['tanklorry','tractor','rmooc','driver'].forEach(tab=>{
      const tabData=typeof DATA!=='undefined' ? DATA[tab] : {};
      Object.values(tabData||{}).forEach(row=>{
        const hay=_normVN((row.plate||'')+' '+(row.name||'')+' '+(row.phone||''));
        if(tokens.every(t=>hay.includes(t))){
          hits.push({tab, row});
        }
      });
    });
    hits.sort((a,b)=>(a.row.plate||a.row.name||'').localeCompare(b.row.plate||b.row.name||''));

    if(!hits.length){ resEl.innerHTML='<div style="color:#aaa;font-size:10px;padding:4px">No results</div>'; return; }

    resEl.innerHTML=hits.slice(0,20).map((h,idx)=>{
      const r=h.row, tab=h.tab;
      const def=typeof CERT_DEFS!=='undefined'?CERT_DEFS[tab]:null;
      const certs=def?def.certs:[];
      const dots=certs.map(c=>{
        const st=typeof dateState!=='undefined'?dateState(r[c.k]):'none';
        return `<span class="sc-cert-dot ${st}" title="${c.name}"></span>`;
      }).join('');
      const stt=r.stt||'—';
      const icon=(def&&def.icon)?def.icon:'🚚';
      const primary=tab==='driver'?(r.name||'—'):(r.plate||r.name||'—');
      const label=`${icon} ${esc(primary)}`;
      const sub=tab==='driver'?esc(r.phone||('#'+stt)):('#'+esc(String(stt)));
      return `<div class="sc-cert-item" onclick="SCALE.certModalOpen('${tab}','${esc(r._rid||'')}',${idx})">
        <div style="flex:1;min-width:0">
          <div class="sc-cert-plate">${label}</div>
          <div class="sc-cert-rmooc">${sub}</div>
        </div>
        <div class="sc-cert-dots">${dots}</div>
      </div>`;
    }).join('');
    window._scCertHits=hits;
  }

  /* ─── Cert detail modal ─── */
  /* Build the status badge + row class for an expiry-date string.
     Shared by initial render and the live oninput recompute. */
  function _cmBadge(val){
    const st=typeof dateState!=='undefined'?dateState(val):'none';
    const dl=typeof daysLeft!=='undefined'?daysLeft(val):null;
    if(st==='exp') return {html:`<span class="sc-cm-badge exp">Expired</span>`, tr:'row-exp'};
    if(st==='due') return {html:`<span class="sc-cm-badge due">Due ${dl}d</span>`, tr:'row-due'};
    if(st==='ok')  return {html:`<span class="sc-cm-badge ok">OK ${dl}d</span>`, tr:''};
    return {html:`<span class="sc-cm-badge none">—</span>`, tr:''};
  }
  function certModalOpen(tab, rid, idx){
    const hits=window._scCertHits||[];
    const h=hits[idx]||hits.find(h=>h.tab===tab&&(h.row._rid===rid||h.row._rid===rid));
    if(!h) return;
    const row=h.row, tabDef=typeof CERT_DEFS!=='undefined'?CERT_DEFS[h.tab]:null;
    _certModalCtx={tab:h.tab, rid:row._rid, row};

    /* header */
    const cmIcon=(tabDef&&tabDef.icon)?tabDef.icon:'🚚';
    const cmName=tab==='driver'?(row.name||'—'):(row.plate||row.name||'—');
    const title=`${cmIcon} ${cmName} — ${tabDef?tabDef.label:tab}`;
    document.getElementById('scCmTitle').textContent=title;
    document.getElementById('scCmStt').textContent='#'+(row.stt||'—');

    /* volume section — only for hasCap tabs */
    const volEl=document.getElementById('scCmVol');
    const capInp=document.getElementById('scCmCapInp');
    const sfEl=document.getElementById('scCmSafeFill');
    if(tabDef&&tabDef.hasCap){
      volEl.style.display='flex';
      capInp.value=row.cap||'';
      capInp.oninput=()=>{
        const cap=parseFloat(capInp.value)||0;
        const sf=cap ? (cap*(typeof sfDensity!=='undefined'?sfDensity():0.538)*(typeof sfFillPct!=='undefined'?sfFillPct():0.9)).toFixed(2) : '—';
        sfEl.textContent=sf+(cap?' T':'');
      };
      const cap=parseFloat(row.cap)||0;
      const sf=cap?(cap*(typeof sfDensity!=='undefined'?sfDensity():0.538)*(typeof sfFillPct!=='undefined'?sfFillPct():0.9)).toFixed(2):'—';
      sfEl.textContent=sf+(cap?' T':'');
    } else {
      volEl.style.display='none';
    }

    /* cert table */
    const certs=tabDef?tabDef.certs:[];
    const tbody=document.getElementById('scCmCertBody');
    tbody.innerHTML=certs.map(c=>{
      const val=row[c.k]||'';
      const b=_cmBadge(val);
      return `<tr class="${b.tr}">
        <td>${esc(c.name)}</td>
        <td><input class="sc-cm-date-inp" data-cert="${c.k}" value="${esc(val)}" placeholder="DD/MM/YY"></td>
        <td class="sc-cm-badge-cell">${b.html}</td>
      </tr>`;
    }).join('');
    /* Live recompute the status badge as soon as a new date is typed —
       no need to press SAVE to see OK/Due/Expired (v4 UX request). */
    tbody.querySelectorAll('.sc-cm-date-inp').forEach(inp=>{
      inp.addEventListener('input', ()=>{
        const b=_cmBadge(inp.value.trim());
        const tr=inp.closest('tr');
        if(!tr) return;
        const cell=tr.querySelector('.sc-cm-badge-cell');
        if(cell) cell.innerHTML=b.html;
        tr.classList.remove('row-exp','row-due');
        if(b.tr) tr.classList.add(b.tr);
      });
    });

    /* remark */
    document.getElementById('scCmRemark').value=row.remark||'';

    document.getElementById('scCertModalBg').classList.add('on');
  }

  function certModalClose(){ document.getElementById('scCertModalBg').classList.remove('on'); _certModalCtx=null; }

  function certModalSave(){
    if(!_certModalCtx) return;
    const {tab, rid, row}=_certModalCtx;
    const changes=[];
    /* cap */
    const capInp=document.getElementById('scCmCapInp');
    if(capInp && capInp.closest('#scCmVol').style.display!=='none'){
      const newCap=capInp.value.trim();
      if(newCap!==String(row.cap||'')) changes.push({tab, rid, field:'cap', value:newCap});
    }
    /* cert date fields */
    document.querySelectorAll('#scCmCertBody .sc-cm-date-inp').forEach(inp=>{
      const field=inp.dataset.cert;
      const newVal=inp.value.trim();
      const oldVal=String(row[field]||'');
      if(newVal!==oldVal) changes.push({tab, rid, field, value:newVal});
    });
    /* remark */
    const remarkEl=document.getElementById('scCmRemark');
    if(remarkEl){
      const newRemark=remarkEl.value.trim();
      if(newRemark!==String(row.remark||'')) changes.push({tab, rid, field:'remark', value:newRemark});
    }
    if(!changes.length){ toast('No changes',''); certModalClose(); return; }
    /* write via SC.editBatch (fleet write path) */
    if(typeof SC!=='undefined' && typeof SC.editBatch==='function'){
      SC.editBatch(changes, 'scale-cert-check');
      toast('✅ Saved '+changes.length+' field'+(changes.length>1?'s':''),'ok');
    } else {
      toast('SC module not ready','er');
    }
    certModalClose();
    /* re-run search to refresh dots */
    setTimeout(()=>{ const inp=document.getElementById('scCertSearchInp'); if(inp) certSearch(inp.value); },300);
  }

  /* ─── Stubs ─── */
  function stEditOpen(stId){ toast('Edit Station '+stId+' — coming soon',''); }

  /* ─── Scale (weighing) entry modal ───
     Captures weighing data into station.tech via the existing setSt wrapper
     (single per-station Firebase write, Spark-frugal). SAVE writes the tech
     record; the station's "DONE" button on its card calls setEmpty separately.
     The order resolves to 'done' from TL-Data presence (TP.computeStatusFromState),
     so no extra Firebase write is made on completion. */
  const _TECH_FIELDS = [
    {k:'truckWt',  dom:'tc-truck-wt',  num:true, fmt:true},
    {k:'grossWt',  dom:'tc-gross-wt',  num:true, fmt:true},
    {k:'timeIn',   dom:'tc-time-in',   num:false},
    {k:'timeOut',  dom:'tc-time-out',  num:false},
    {k:'pressIn',  dom:'tc-press-in',  num:true},
    {k:'pressOut', dom:'tc-press-out', num:true},
    {k:'seal',     dom:'tc-seal',      num:false},
    {k:'fq',       dom:'tc-fq',        num:true, expr:true},
    {k:'dest',     dom:'tc-dest',      num:false},
    {k:'note',     dom:'tc-note',      num:false},
    {k:'error',    dom:'tc-error',     num:false}
  ];
  /* Auto-set GI Date toggle preference (persisted in localStorage) */
  const _GI_PREF_KEY = 'lpg_v4_gi_auto';
  function _giGetPref(){ try{ return localStorage.getItem(_GI_PREF_KEY) === '1'; }catch(_){ return false; } }
  function _giSetPref(v){ try{ localStorage.setItem(_GI_PREF_KEY, v?'1':'0'); }catch(_){} }

  /* v4.22.6 — Truck Wt / Gross Wt live thousands-separator formatting.
     Why: kg values are typically 5 digits (10,000–35,000); a raw string of
     digits is easy to misread. Adding a comma every three digits makes
     them scannable at a glance and matches the format already used on the
     printed PTT/DN ("10,000" via _pfFmt). The formatter strips non-digits,
     reformats, and restores the caret by counting digits-before-caret —
     so typing in the middle of a number doesn't snap to the end. */
  function _stripCommas(v){ return String(v||'').replace(/,/g,''); }
  /* v4.49.9 — evaluate a simple arithmetic expression typed in a numeric field
     (e.g. FQ: "1+1" → 2, "20000+150" → 20150). Only digits, + - * / . ( ) and
     whitespace are allowed; anything else falls back to parseFloat. Safe: the
     character whitelist makes Function() here a pure calculator, never a code
     path for arbitrary input. */
  function _evalArith(str){
    const s = _stripCommas(str).trim();
    if(s === '') return null;
    if(!/[+\-*/()]/.test(s)) return parseFloat(s);        /* plain number — fast path */
    if(!/^[0-9+\-*/().\s]+$/.test(s)) return parseFloat(s); /* contains other chars — bail */
    try{
      const r = Function('"use strict";return (' + s + ')')();
      return (typeof r === 'number' && isFinite(r)) ? r : parseFloat(s);
    }catch(_){ return parseFloat(s); }
  }
  function _fmtWtLive(inp, ev){
    if(!inp) return;
    /* v4.x FIX — digit-duplication on some PCs ("11200" → "111200").
       Root cause: when a Vietnamese IME (Unikey/Telex/VNI) is active, the very
       first keystroke fires an `input` event MID-COMPOSITION (isComposing=true).
       Rewriting inp.value + setSelectionRange while a composition is open makes
       Windows re-commit the first character, doubling it. Machines with the IME
       off never composed, so they never saw the bug. Fix: never touch the value
       while composing — let the IME finish, then the trailing isComposing=false
       `input` event reformats cleanly. Works on every machine, IME on or off. */
    if(ev && ev.isComposing) return;
    const raw = inp.value;
    /* Save digit-count-before-caret so we can restore the caret precisely
       even after commas are inserted/removed. */
    const caret = inp.selectionStart != null ? inp.selectionStart : raw.length;
    let digitsBefore = 0;
    for(let i=0;i<caret && i<raw.length;i++){
      if(/\d/.test(raw[i])) digitsBefore++;
    }
    /* Keep digits and at most one decimal point — kg values are integers
       in practice, but allow decimal entry just in case. */
    let cleaned = raw.replace(/[^\d.]/g,'');
    const firstDot = cleaned.indexOf('.');
    if(firstDot !== -1){
      cleaned = cleaned.slice(0,firstDot+1) + cleaned.slice(firstDot+1).replace(/\./g,'');
    }
    if(cleaned === '' || cleaned === '.'){ inp.value = cleaned; return; }
    const parts = cleaned.split('.');
    const intStr = parts[0].replace(/^0+(?=\d)/, '');
    const n = parseInt(intStr || '0', 10);
    let out = isNaN(n) ? '' : n.toLocaleString('en-US');
    if(parts.length > 1) out += '.' + parts[1];
    inp.value = out;
    /* Restore caret by walking the new value until digitsBefore digits seen */
    let pos = 0, count = 0;
    while(pos < out.length && count < digitsBefore){
      if(/\d/.test(out[pos])) count++;
      pos++;
    }
    try{ inp.setSelectionRange(pos, pos); }catch(_){}
  }
  /* Format a stored numeric value for display in a wt input */
  function _fmtWtDisplay(v){
    if(v == null || v === '') return '';
    const n = parseFloat(_stripCommas(v));
    return isNaN(n) ? String(v) : n.toLocaleString('en-US');
  }

  /* Net weight live calc (writes into the static net display) */
  function scCalcNet(){
    const tw = parseFloat(_stripCommas(document.getElementById('tc-truck-wt')?.value)) || 0;
    const gw = parseFloat(_stripCommas(document.getElementById('tc-gross-wt')?.value)) || 0;
    const el = document.getElementById('sc-net-disp');
    const bar = document.getElementById('sc-net-bar');
    const inline = document.getElementById('sc-net-inline');
    if(!el || !bar) return;
    if(tw > 0 && gw > 0){
      const net = gw - tw;
      el.textContent = net.toLocaleString('en-US') + ' kg  (' + (net/1000).toFixed(3) + ' T)';
      bar.classList.toggle('neg', net <= 0);
      if(inline){ inline.textContent = net.toLocaleString('en-US') + ' kg'; inline.style.color = net <= 0 ? '#d32f2f' : '#157a40'; }
    } else {
      el.textContent = '—';
      bar.classList.remove('neg');
      if(inline){ inline.textContent = '—'; inline.style.color = '#157a40'; }
    }
  }

  /* Enter key → next field */
  function scTabNext(e, nextId){
    if(e.key !== 'Enter') return;
    e.preventDefault();
    if(nextId){
      const el = document.getElementById(nextId);
      if(el){ el.focus(); el.select && el.select(); }
    }
  }

  /* Format time input → 24h HH:MM (smart parse, partial-aware) */
  function scFmtTime(inp){
    let raw = inp.value.replace(/[^0-9:]/g,'');
    if(raw.includes(':')){
      const parts = raw.split(':');
      let hStr = parts[0] || '';
      let mStr = (parts[1] || '').slice(0,2);
      let h = parseInt(hStr) || 0;
      if(h > 23) h = 23;
      if(mStr.length < 2){ inp.value = String(h).padStart(2,'0') + ':' + mStr; return; }
      let m = parseInt(mStr) || 0;
      if(m > 59) m = 59;
      inp.value = String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
      return;
    }
    let digits = raw.replace(/:/g,'');
    if(digits.length === 0){ inp.value = ''; return; }
    if(digits.length <= 3){ inp.value = digits; return; }
    let h = parseInt(digits.slice(0,2));
    let m = parseInt(digits.slice(2,4));
    if(h > 23) h = 23;
    if(m > 59) m = 59;
    inp.value = String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
  }

  /* Destination autocomplete — collects unique dest values from TL Data */
  let _destIdx = -1;
  function _destNfc(s){ return s ? _normVN(s) : ''; }
  function _destGetUnique(){
    const map = {};
    try{
      const src = (typeof TL !== 'undefined' && TL.ROWS) ? TL.ROWS : {};
      Object.values(src).forEach(r=>{
        const d = (r && r.dest || '').trim();
        if(d) map[d] = (map[d]||0) + 1;
      });
    }catch(_){}
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count}));
  }
  function scDestSearch(q){
    const dd = document.getElementById('sc-dest-dd');
    if(!dd) return;
    _destIdx = -1;
    const all = _destGetUnique();
    const esc1 = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    const buildItem = d =>
      /* v4.x FIX — the JS-string arg sits inside a DOUBLE-quoted onmousedown
         attribute, so JSON.stringify()'s double quotes used to TERMINATE the
         attribute early ( ...scDestPick(" → broken JS ) and clicking an item
         did nothing. esc1() encodes the quotes as &quot;, which the browser
         decodes back to a valid scDestPick("Name") before running it. */
      '<div class="sc-dest-item" onmousedown="event.preventDefault();SCALE.scDestPick('
      + esc1(JSON.stringify(d.name))
      + ')">' + esc1(d.name) + '<span class="sc-dest-count">×' + d.count + '</span></div>';
    if(!q || !q.trim()){
      const top = all.slice(0, 8);
      if(!top.length){ dd.classList.remove('on'); return; }
      dd.innerHTML = top.map(buildItem).join('');
      dd.classList.add('on');
      return;
    }
    const qn = _destNfc(q);
    const matches = all.filter(d => _destNfc(d.name).includes(qn)).slice(0, 8);
    if(!matches.length){ dd.classList.remove('on'); return; }
    dd.innerHTML = matches.map(buildItem).join('');
    dd.classList.add('on');
  }
  function scDestPick(val){
    const inp = document.getElementById('tc-dest');
    if(inp){ inp.value = val; }
    const dd = document.getElementById('sc-dest-dd');
    if(dd) dd.classList.remove('on');
    _destIdx = -1;
  }
  function scDestKeydown(e){
    const dd = document.getElementById('sc-dest-dd');
    if(!dd || !dd.classList.contains('on')){
      if(e.key === 'Enter'){ scTabNext(e, null); }
      return;
    }
    const items = dd.querySelectorAll('.sc-dest-item');
    if(!items.length) return;
    if(e.key === 'ArrowDown'){
      e.preventDefault();
      _destIdx = Math.min(_destIdx + 1, items.length - 1);
      items.forEach((el,i)=> el.classList.toggle('active', i === _destIdx));
      items[_destIdx].scrollIntoView({block:'nearest'});
    } else if(e.key === 'ArrowUp'){
      e.preventDefault();
      _destIdx = Math.max(_destIdx - 1, 0);
      items.forEach((el,i)=> el.classList.toggle('active', i === _destIdx));
      items[_destIdx].scrollIntoView({block:'nearest'});
    } else if(e.key === 'Enter' && _destIdx >= 0){
      e.preventDefault();
      const txt = items[_destIdx].textContent.replace(/×\d+$/,'').trim();
      scDestPick(txt);
    } else if(e.key === 'Escape'){
      dd.classList.remove('on');
      _destIdx = -1;
    }
  }

  /* GI Date toggle visual state */
  function scGiToggle(){
    const cb = document.getElementById('tc-gi-auto');
    const wrap = document.getElementById('sc-gi-wrap');
    const status = document.getElementById('tc-gi-status');
    if(!cb || !wrap || !status) return;
    const on = !!cb.checked;
    wrap.classList.toggle('on', on);
    status.textContent = on ? 'ON' : 'OFF';
    _giSetPref(on);
  }

  /* Read all input values back into a tech object */
  function _techRead(){
    const t = {};
    _TECH_FIELDS.forEach(f=>{
      let v = (document.getElementById(f.dom)?.value||'').trim();
      /* v4.22.6 — strip thousands separators on formatted wt fields so
         parseFloat sees the raw number ("10,000" → 10000, not 10). */
      if(f.fmt) v = _stripCommas(v);
      /* v4.49.9 — expression fields (FQ) accept "1+1" and store the result */
      if(f.expr){
        if(v === '') return;            /* empty stays unset, as before */
        const r = _evalArith(v);
        t[f.k] = (r==null || isNaN(r)) ? 0 : r;
        return;
      }
      if(v !== '') t[f.k] = f.num ? (parseFloat(v)||0) : v;
    });
    /* Engineer auto-fill from station-bar setting (kept for downstream consumers) */
    const engDefault = (document.getElementById('scEngineer')?.value||'').trim();
    if(engDefault) t.eng = engDefault;
    /* GI auto preference snapshot */
    t._giAuto = !!document.getElementById('tc-gi-auto')?.checked;
    return t;
  }

  /* Order info populate — runs on openTech */
  function _populateOrderInfo(stId, s){
    const eHtml = v => String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    /* DO + Customer line */
    const doNum = s.doNum || '—';
    const cust  = s.customer || '';
    const doCustEl = document.getElementById('sc-do-cust');
    if(doCustEl){
      doCustEl.innerHTML = eHtml(doNum) + (cust ? '  ' + eHtml(cust) : '');
    }

    /* Plate / Driver / Tank-Lot / Contract */
    document.getElementById('sc-plate-disp').textContent  = s.plate  || '—';
    document.getElementById('sc-driver-disp').textContent = s.driver || '—';
    const tankLot = (s.tank || s.batch)
      ? ((s.tank||'—') + ' / ' + ((s.batch||'').replace(/^LPG-\d{4}-/,'') || '—'))
      : '—';
    document.getElementById('sc-tank-disp').textContent = tankLot;
    document.getElementById('sc-cw-disp').textContent   = s.qty ? (parseFloat(s.qty)||s.qty) + ' MT' : '—';

    /* Station / Turn */
    const turn = getDisplayTurn(stId) || 1;
    document.getElementById('sc-turn-disp').textContent = 'Turn ' + turn;
    document.getElementById('tech-sid').dataset.turn = turn;
    document.getElementById('sc-station-lbl').textContent = 'Station ' + stId + '  ·  Today';

    /* GW AVG reference (truck tare avg + safe-fill capacity) */
    const grossRefEl = document.getElementById('sc-gross-ref');
    if(grossRefEl){
      let twAvg = 0, sfKg = 0;
      try{
        const pl = String(s.plate||'').trim().toUpperCase();
        const rm = String(s.rmooc||'').trim().toUpperCase();
        const fleets = (typeof DATA!=='undefined') ? DATA : {};
        const twd = fleets.twavg || {};
        for(const rid in twd){
          if(String(twd[rid].plate||'').trim().toUpperCase() === pl){
            twAvg = parseFloat(twd[rid].avgWt) || 0; break;
          }
        }
        const findCap = (tab)=>{
          const d = fleets[tab] || {};
          for(const rid in d){
            const dp = String(d[rid].plate||'').trim().toUpperCase();
            if(dp && (dp===pl || (rm && dp===rm))) return parseFloat(d[rid].cap||d[rid].volume)||0;
          }
          return 0;
        };
        const capM3 = findCap('tanklorry') || findCap('rmooc');
        if(capM3 > 0){
          const dens = (typeof sfDensity==='function') ? sfDensity() : 0.538;
          const pct  = (typeof sfFillPct==='function') ? sfFillPct() : 0.9;
          sfKg = Math.round(capM3 * dens * pct * 1000);
        }
      }catch(_){}
      const grossRef = (twAvg && sfKg) ? Math.round(twAvg + sfKg) : 0;
      if(grossRef > 0){
        grossRefEl.textContent = '📊 GW AVG ref: ' + grossRef.toLocaleString('en-US') + ' kg';
        grossRefEl.classList.add('on');
      } else {
        grossRefEl.classList.remove('on');
        grossRefEl.textContent = '';
      }
    }
  }

  function openTech(stId){
    const s = DB_SC.stations[stId];
    if(!s || s.status==='empty'){ toast('⚠ Station empty','er'); return; }
    const tech = s.tech || {};
    document.getElementById('tech-sid').value = stId;

    /* Populate order info card */
    _populateOrderInfo(stId, s);

    /* Pre-fill scale fields from existing tech */
    _TECH_FIELDS.forEach(f=>{
      const el = document.getElementById(f.dom);
      if(!el) return;
      let raw = (tech[f.k] != null && tech[f.k] !== '') ? tech[f.k] : '';
      /* v4.22.6 — for thousands-separator-formatted fields, format on display */
      if(f.fmt && raw !== '') raw = _fmtWtDisplay(raw);
      el.value = raw;
    });

    /* GI toggle — remember last preference */
    const giCb = document.getElementById('tc-gi-auto');
    if(giCb){
      giCb.checked = (tech._giAuto != null) ? !!tech._giAuto : _giGetPref();
      scGiToggle();
    }

    /* Reset save button label */
    const saveBtn = document.getElementById('sc-save-btn');
    if(saveBtn) saveBtn.innerHTML = '💾 SAVE';

    /* Reset footer to stage 1 (Cancel + SAVE only) — PRINT & DONE / DONE
       only appear after a successful SAVE so the flow is enforced. */
    _setFootStage('presave');

    /* Update modal title and show */
    document.getElementById('scTechTitle').innerHTML = '<span class="scico">⚖️</span><span>SCALE DATA</span>';
    document.getElementById('scTechBg').classList.add('on');

    /* Live calcs */
    scCalcNet();

    /* Focus first empty/Truck Wt field */
    setTimeout(()=>{
      const tw = document.getElementById('tc-truck-wt');
      if(tw){ tw.focus(); tw.select && tw.select(); }
    }, 120);
  }

  /* ── Build a TL Data row payload from station + tech inputs.
       Merge key = doNo|scaleNo|turn so re-saves update the same row.
       DO No fallback: cur.doNum  →  cur._oid  →  ''  (TMP orders live on _oid). ── */
  function _buildTLPayload(stId, cur, tech){
    const turn = _tlFreezeTurn(stId);
    const dt = new Date();
    const p = n => String(n).padStart(2,'0');
    const today = p(dt.getDate())+'/'+p(dt.getMonth()+1)+'/'+String(dt.getFullYear()).slice(-2);
    /* batch field on station is the full "LPG-YYYY-N" form; TL.lot wants just "N" */
    const lotNum = String(cur.batch||'').replace(/^LPG-\d{4}-/,'');
    /* Net = Gross − Truck (rounded kg) when both present */
    let lpgQty = '';
    if(tech.grossWt!=null && tech.truckWt!=null){
      const net = parseFloat(tech.grossWt) - parseFloat(tech.truckWt);
      if(!isNaN(net) && net > 0) lpgQty = String(Math.round(net));
    }
    const doNo = String(cur.doNum || cur._oid || '').trim();

    /* ── Derived fields (do NOT mutate the station — DN/PTT derive from the raw
         contract at print time, so the station must keep cur.type / cur.customer
         intact). The derivation happens here, at the single point where station
         data crosses into TL Data. ──
       • Customer  : map the pasted Sale-Plan name → CUST short code (for reports).
                     CT.lookup is idempotent, so a code stays a code.
       • Customer WMS (custFull): keep the original full/sale-plan name for trace.
       • Trade     : Export when the name contains "Export", else Domestic;
                     "(Pure)" appended when the contract text says Pure.
       • LPG Type  : product type derived from the contract via _pfDeriveType
                     (same routine the PTT/DN already use), e.g. 50:50 → LPG (C3:50/C4:50). */
    const fullCust  = String(cur.customer||'');
    const contract  = String(cur.type||'');
    const shortCust = (typeof CT!=='undefined' && CT.lookup)   ? CT.lookup(fullCust)   : fullCust;
    const wmsCust   = (typeof CT!=='undefined' && CT.wmsName)  ? CT.wmsName(fullCust)  : fullCust;
    const isExport  = /export/i.test(fullCust);
    const isPure    = /pure|thuần|thuan/i.test(contract);
    const trade     = (isExport ? 'Export' : 'Domestic') + (isPure ? ' (Pure)' : '');
    const prodType  = (typeof _pfDeriveType==='function') ? _pfDeriveType(contract) : contract;
    /* Price ($/ton): same lookup the Today Plan price preview uses
       (customer short + contract type → PP price table). The price is shown
       on Today Plan but was never carried into TL Data when the truck was
       sold — fill it here so the sold row keeps its price. Blank when no match. */
    let priceVal = '';
    try{
      if(typeof PP!=='undefined' && PP.planLookupPrice){
        const pr = PP.planLookupPrice(shortCust, contract, '');
        if(typeof pr==='number' && isFinite(pr) && pr>0) priceVal = String(pr);
      }
    }catch(_){}

    const payload = {
      doNo:    doNo,
      scaleNo: String(stId),
      turn:    String(turn),
      date:    today,
      cust:    shortCust,
      custFull:wmsCust,
      trade:   trade,
      type:    prodType,
      ltank:   String(cur.tank||''),
      lot:     lotNum,
      truck:   String(cur.plate||''),
      rmooc:   String(cur.rmooc||''),
      driver:  String(cur.driver||''),
      cw:      cur.qty!=null ? String(cur.qty) : ''
    };
    /* GI Date auto-set when toggle is ON */
    if(tech._giAuto) payload.giDate = today;
    /* Tech / weighing fields */
    if(tech.truckWt!=null)  payload.truckWt  = String(tech.truckWt);
    if(tech.grossWt!=null)  payload.grossWt  = String(tech.grossWt);
    if(lpgQty)              payload.lpgQty   = lpgQty;
    if(tech.timeIn)         payload.timeIn   = tech.timeIn;
    if(tech.timeOut)        payload.timeOut  = tech.timeOut;
    if(tech.pressIn!=null)  payload.pressIn  = String(tech.pressIn);
    if(tech.pressOut!=null) payload.pressOut = String(tech.pressOut);
    if(tech.seal)           payload.seal     = tech.seal;
    if(tech.fq!=null)       payload.fq       = String(tech.fq);
    if(tech.dest)           payload.dest     = tech.dest;
    if(tech.note)           payload.note     = tech.note;
    if(tech.error)          payload.error    = tech.error;
    if(tech.eng)            payload.eng      = tech.eng;
    const chk = document.getElementById('scCheckBooth')?.value||'';
    if(chk) payload.weigher = chk;
    if(priceVal) payload.price = priceVal;
    return payload;
  }
  /* Push to TL Data and return the rid on success, null on failure.
     Caller decides what to show the user — no lies. */
  function _pushToTL(stId, cur, tech){
    if(typeof TL === 'undefined' || !TL.upsertFromScale){
      console.warn('[SCALE] TL module unavailable — push skipped');
      return null;
    }
    const payload = _buildTLPayload(stId, cur, tech);
    if(!payload.doNo){
      console.warn('[SCALE] DO No missing on station — TL push skipped', cur);
      return null;
    }
    /* Write-once guard. _buildTLPayload is deterministic for a given station +
       weigh, so an identical signature means SAVE already pushed this exact
       weigh. In that case DONE / PRINT&DONE do NOTHING here — no upsert scan,
       no Firebase delta. The push runs again only if the weigh actually changed
       (operator re-weighed before DONE without pressing SAVE), so no data loss. */
    let sig = '';
    try{ sig = JSON.stringify(payload); }catch(_){ sig = ''; }
    if(sig && _tlPushSig[stId] && _tlPushSig[stId].sig === sig && _tlPushSig[stId].rid){
      return _tlPushSig[stId].rid;
    }
    try{
      const rid = TL.upsertFromScale(payload);
      if(!rid){
        console.warn('[SCALE] TL.upsertFromScale returned null', payload);
        return null;
      }
      if(sig) _tlPushSig[stId] = { sig, rid };
      console.log('[SCALE] TL push OK · rid='+rid+' · key='+payload.doNo+'|'+payload.scaleNo+'|'+payload.turn);
      return rid;
    }catch(e){
      console.warn('[SCALE] TL push threw', e);
      return null;
    }
  }

  /* ════════════════════════════════════════════════════════════
     M4a · MULTI-DO COMBINED — weight allocation → N TL Data rows (V406 parity)
     One physical weigh on a combined-DO station load. The operator allocates
     the net across the linked DOs (last auto-balances); we push ONE TL row per
     DO with cascading truck/gross (each DO's truck weight = previous DO's gross),
     per-DO customer/type/qty. Mirrors V406 _showMultiAllocPopup / _maRecalc /
     _maDoSave, adapted to TL.upsertFromScale. Writes go ONLY through
     TL.upsertFromScale (existing TL Data path) and setSt — no direct refs,
     no new Firebase paths.
     ════════════════════════════════════════════════════════════ */
  let _mdoAllocCtx = null;
  /* v4.49.4 — RAM-only: per-station list of the per-DO TL payloads built at
     allocation time, so PRINT & DONE can offer "separate DNs" (one per DO)
     without re-deriving the (drift-prone) turn. Never written to Firebase. */
  const _mdoPayloadsByStation = {};
  function _mdoIsCombined(cur){
    return !!(cur && cur._multiDO && Array.isArray(cur._linkedRows) && cur._linkedRows.length > 1);
  }
  /* Per-DO TL payload — mirrors _buildTLPayload but sourced from a linked row. */
  function _mdoBuildPayloadFor(stId, cur, tech, lr, jNet, jTruckWt, jGrossWt, sharedTurn){
    /* A combined load is ONE physical truck visit, so every linked DO shares
       the SAME turn. The caller passes a single frozen turn; without it each
       call would re-read getDisplayTurn() and drift +1 after each TL push. */
    const turn = (sharedTurn != null) ? sharedTurn : _tlFreezeTurn(stId);
    const dt = new Date(), p = n => String(n).padStart(2,'0');
    const today = p(dt.getDate())+'/'+p(dt.getMonth()+1)+'/'+String(dt.getFullYear()).slice(-2);
    const lotNum = String(cur.batch||'').replace(/^LPG-\d{4}-/,'');
    const doNo = (typeof _mdNormDO==='function') ? _mdNormDO(lr.doNum) : String(lr.doNum||'').trim();
    const fullCust = String(lr.customer || cur.customer || '');
    const contract = String(lr.type || cur.type || '');
    const shortCust = (typeof CT!=='undefined' && CT.lookup)  ? CT.lookup(fullCust)  : fullCust;
    const wmsCust   = (typeof CT!=='undefined' && CT.wmsName) ? CT.wmsName(fullCust) : fullCust;
    const isExport  = /export/i.test(fullCust);
    const isPure    = /pure|thuần|thuan/i.test(contract);
    const trade     = (isExport ? 'Export' : 'Domestic') + (isPure ? ' (Pure)' : '');
    const prodType  = (typeof _pfDeriveType==='function') ? _pfDeriveType(contract) : contract;
    /* Price ($/ton) per linked DO — same PP lookup as Today Plan. */
    let priceVal = '';
    try{
      if(typeof PP!=='undefined' && PP.planLookupPrice){
        const pr = PP.planLookupPrice(shortCust, contract, '');
        if(typeof pr==='number' && isFinite(pr) && pr>0) priceVal = String(pr);
      }
    }catch(_){}
    const payload = {
      doNo: doNo, scaleNo: String(stId), turn: String(turn), date: today,
      cust: shortCust, custFull: wmsCust, trade: trade, type: prodType,
      ltank: String(cur.tank||''), lot: lotNum,
      truck: String(cur.plate||''), rmooc: String(cur.rmooc||''), driver: String(cur.driver||''),
      cw: (lr.qty!=null && lr.qty!=='') ? String(lr.qty) : ''
    };
    if(tech._giAuto) payload.giDate = today;
    payload.truckWt = String(Math.round(jTruckWt));
    payload.grossWt = String(Math.round(jGrossWt));
    if(jNet > 0) payload.lpgQty = String(Math.round(jNet));
    if(tech.timeIn)         payload.timeIn   = tech.timeIn;
    if(tech.timeOut)        payload.timeOut  = tech.timeOut;
    if(tech.pressIn!=null)  payload.pressIn  = String(tech.pressIn);
    if(tech.pressOut!=null) payload.pressOut = String(tech.pressOut);
    if(tech.seal)           payload.seal     = tech.seal;
    if(tech.fq!=null)       payload.fq       = String(tech.fq);
    if(tech.dest)           payload.dest     = tech.dest;
    if(tech.note)           payload.note     = tech.note;
    if(tech.error)          payload.error    = tech.error;
    if(tech.eng)            payload.eng      = tech.eng;
    const chk = document.getElementById('scCheckBooth')?.value||'';
    if(chk) payload.weigher = chk;
    if(priceVal) payload.price = priceVal;
    return payload;
  }
  /* Render the allocation popup (global overlay element). */
  function _mdoAllocShow(stId, cur, tech, netWt){
    const lr = cur._linkedRows || [];
    const n = lr.length;
    _mdoAllocCtx = { stId, cur, tech, netWt, truckWt: parseFloat(tech.truckWt)||0, grossWt: parseFloat(tech.grossWt)||0, n };
    let bg = document.getElementById('mdo-alloc-bg');
    if(bg) bg.remove();
    let rows = '';
    for(let i=0;i<n;i++){
      const doNum = ((typeof _mdNormDO==='function'?_mdNormDO(lr[i].doNum):String(lr[i].doNum||'').trim())) || '(waiting DO)';
      const cust = lr[i].customer || '—';
      const planQty = lr[i].qty ? String(parseFloat(lr[i].qty)) : '—';
      const isLast = (i === n-1);
      rows += '<tr style="border-bottom:1px solid #e0e8ef">'
        + '<td style="padding:6px 8px;font-family:\'Oswald\',sans-serif;font-weight:700;color:#0077b6;font-size:13px">'+esc(doNum)+'</td>'
        + '<td style="padding:6px 8px;font-size:12px;color:#1a2733">'+esc(cust)+'</td>'
        + '<td style="padding:6px 8px;font-family:\'Oswald\',sans-serif;font-weight:600;color:#0d6e3a;font-size:12px;text-align:center">'+planQty+' MT</td>'
        + '<td style="padding:4px 6px;text-align:right">'
        + (isLast
          ? '<span id="mdo-net-last" style="font-family:\'Oswald\',sans-serif;font-size:15px;font-weight:700;color:#0077b6">—</span> <span style="font-size:10px;color:var(--muted)">kg (auto)</span>'
          : '<input type="text" inputmode="decimal" id="mdo-net-'+i+'" oninput="SCALE.mdoAllocRecalc()" placeholder="0" style="width:90px;padding:5px 8px;border:2px solid #0077b6;border-radius:5px;font-family:\'Oswald\',sans-serif;font-size:14px;font-weight:700;text-align:right;color:#1a2733">')
        + '</td></tr>';
    }
    bg = document.createElement('div');
    bg.id = 'mdo-alloc-bg';
    bg.style.cssText = 'position:fixed;inset:0;z-index:12000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center';
    bg.innerHTML = '<div style="background:#fff;border-radius:12px;width:min(540px,96vw);max-height:90vh;overflow:auto;padding:18px 22px;box-shadow:0 8px 32px rgba(0,0,0,.25)">'
      + '<h3 style="margin:0 0 4px;font-family:\'Oswald\',sans-serif;font-size:15px;color:#0077b6;letter-spacing:.5px">⚖️ WEIGHT ALLOCATION — '+n+' DO</h3>'
      + '<div style="font-size:12px;color:var(--muted);margin-bottom:10px">Net Weight: <b style="color:#1a2733;font-size:14px">'+Math.round(netWt).toLocaleString('en-US')+' kg</b> (Gross '+Math.round(_mdoAllocCtx.grossWt).toLocaleString('en-US')+' − Truck '+Math.round(_mdoAllocCtx.truckWt).toLocaleString('en-US')+')</div>'
      + '<table style="width:100%;border-collapse:collapse;margin-bottom:8px">'
      + '<thead><tr style="background:#f0f4f8;border-bottom:2px solid var(--border)">'
      + '<th style="padding:5px 8px;text-align:left;font-size:10px;color:var(--muted);letter-spacing:1px">DO</th>'
      + '<th style="padding:5px 8px;text-align:left;font-size:10px;color:var(--muted);letter-spacing:1px">CUSTOMER</th>'
      + '<th style="padding:5px 8px;text-align:center;font-size:10px;color:var(--muted);letter-spacing:1px">PLAN</th>'
      + '<th style="padding:5px 8px;text-align:right;font-size:10px;color:var(--muted);letter-spacing:1px">NET (kg)</th>'
      + '</tr></thead><tbody>'+rows+'</tbody>'
      + '<tfoot><tr style="border-top:2px solid #0077b6;background:#e8f4fd">'
      + '<td colspan="3" style="padding:6px 8px;font-family:\'Oswald\',sans-serif;font-size:12px;font-weight:700;color:#0077b6;letter-spacing:1px">TOTAL</td>'
      + '<td style="padding:6px 8px;text-align:right"><span id="mdo-total" style="font-family:\'Oswald\',sans-serif;font-size:15px;font-weight:700;color:#1a2733">'+Math.round(netWt).toLocaleString('en-US')+'</span> <span style="font-size:10px;color:var(--muted)">kg</span> <span id="mdo-check" style="font-size:12px;font-weight:700;margin-left:4px">✓</span></td>'
      + '</tr></tfoot></table>'
      + '<div id="mdo-detail" style="background:#f7f9fc;border:1px solid var(--border);border-radius:5px;padding:8px 10px;margin-bottom:10px;font-size:11px;color:var(--muted)"></div>'
      + '<div style="display:flex;gap:8px">'
      + '<button onclick="SCALE.mdoAllocSave()" style="flex:1;padding:10px;background:linear-gradient(135deg,#2d8a4e,#1b6e3a);border:none;border-radius:6px;color:#fff;font-family:\'Oswald\',sans-serif;font-size:13px;font-weight:700;letter-spacing:1.5px;cursor:pointer">💾 SAVE '+n+' TL DATA ROWS</button>'
      + '<button onclick="SCALE.mdoAllocCancel()" style="min-width:70px;padding:10px;background:#f0f4f8;border:1.5px solid var(--border);border-radius:6px;color:#1a2733;font-family:\'Oswald\',sans-serif;font-size:11px;letter-spacing:1px;cursor:pointer">✕ Cancel</button>'
      + '</div></div>';
    document.body.appendChild(bg);
    /* Pre-fill the non-last inputs with each DO's plan qty (kg). */
    for(let j=0;j<n-1;j++){
      const inp = document.getElementById('mdo-net-'+j);
      if(inp && lr[j].qty){ const planKg = Math.round(parseFloat(lr[j].qty)*1000); if(planKg>0) inp.value = planKg; }
    }
    mdoAllocRecalc();
  }
  function mdoAllocRecalc(){
    const ctx = _mdoAllocCtx; if(!ctx) return;
    const n = ctx.n; let total = 0;
    for(let i=0;i<n-1;i++){ const inp=document.getElementById('mdo-net-'+i); total += inp?(parseFloat(inp.value)||0):0; }
    const lastNet = Math.round(ctx.netWt - total);
    const el = document.getElementById('mdo-net-last'); if(el) el.textContent = lastNet.toLocaleString('en-US');
    const chk = document.getElementById('mdo-check');
    if(chk){ if(lastNet>=0 && Math.abs(total+lastNet-ctx.netWt)<1){ chk.textContent='✓'; chk.style.color='#2d8a4e'; } else { chk.textContent='✗'; chk.style.color='#d62839'; } }
    const detail = document.getElementById('mdo-detail');
    if(detail){
      let h = '<div style="font-family:\'Oswald\',sans-serif;font-size:10px;letter-spacing:1px;color:#0077b6;margin-bottom:4px">PREVIEW TL DATA</div>';
      let runTruck = ctx.truckWt;
      const lr = ctx.cur._linkedRows||[];
      for(let k=0;k<n;k++){
        const kNet = (k<n-1) ? (parseFloat((document.getElementById('mdo-net-'+k)||{}).value)||0) : lastNet;
        const kGross = Math.round(runTruck + kNet);
        const doLabel = ((typeof _mdNormDO==='function'?_mdNormDO(lr[k].doNum):String(lr[k].doNum||'').trim())) || '(waiting DO)';
        h += '<div style="display:flex;gap:8px;padding:2px 0;'+(k>0?'border-top:1px dashed #e0e8ef;':'')+'">'
          + '<span style="min-width:80px;font-weight:700;color:#0077b6">'+esc(doLabel)+'</span>'
          + '<span>Truck='+Math.round(runTruck).toLocaleString('en-US')+'</span>'
          + '<span>Gross='+kGross.toLocaleString('en-US')+'</span>'
          + '<span style="font-weight:700;color:#0d6e3a">Net='+Math.round(kNet).toLocaleString('en-US')+'</span>'
          + '</div>';
        runTruck = kGross;
      }
      detail.innerHTML = h;
    }
  }
  function mdoAllocCancel(){ const bg=document.getElementById('mdo-alloc-bg'); if(bg) bg.remove(); _mdoAllocCtx=null; }
  function mdoAllocSave(){
    const ctx = _mdoAllocCtx; if(!ctx) return;
    const n = ctx.n, lr = ctx.cur._linkedRows||[];
    const nets = []; let total = 0;
    for(let i=0;i<n-1;i++){
      const v = Math.round(parseFloat((document.getElementById('mdo-net-'+i)||{}).value)||0);
      if(v<=0){ toast('⚠ Enter weight for DO '+(i+1),'er'); return; }
      nets.push(v); total += v;
    }
    const lastNet = Math.round(ctx.netWt - total);
    if(lastNet<=0){ toast('⚠ Last DO weight ≤ 0 — please check','er'); return; }
    nets.push(lastNet);
    let runTruck = ctx.truckWt, pushed = 0;
    /* One frozen turn for the whole combined load (same truck, one visit). */
    const comboTurn = _tlFreezeTurn(ctx.stId);
    const builtPayloads = [];
    for(let j=0;j<n;j++){
      const jNet = nets[j];
      const jGross = Math.round(runTruck + jNet);
      const payload = _mdoBuildPayloadFor(ctx.stId, ctx.cur, ctx.tech, lr[j], jNet, runTruck, jGross, comboTurn);
      builtPayloads.push(payload);
      if(payload.doNo && typeof TL!=='undefined' && TL.upsertFromScale){
        try{ if(TL.upsertFromScale(payload)) pushed++; }catch(e){ console.warn('[multiDO] TL push', e); }
      }
      runTruck = jGross;
    }
    /* Remember the per-DO payloads so PRINT & DONE can print separate DNs. */
    _mdoPayloadsByStation[ctx.stId] = builtPayloads;
    /* Mark the station tech as allocated so PRINT&DONE / DONE skip the single push. */
    const cur2 = DB_SC.stations[ctx.stId] || ctx.cur;
    const tech2 = Object.assign({}, cur2.tech||ctx.tech, { _mdoAllocated:true, updatedAt:Date.now() });
    setSt(ctx.stId, Object.assign({}, cur2, { tech: tech2 }));
    try{ if(typeof logAudit==='function') logAudit('scale:assign_multi_do', ctx.stId, '_alloc', pushed, '', 'combined'); }catch(_){}
    mdoAllocCancel();
    toast('💾 Saved '+pushed+' TL rows (combined) · Station '+ctx.stId,'ok');
    _setFootStage('postsave');
  }

  /* Swap the modal footer between pre-save (Cancel + SAVE) and
     post-save (Cancel + PRINT & DONE + DONE).                          */
  function _setFootStage(stage){
    const sBtn = document.getElementById('sc-save-btn');
    const pBtn = document.getElementById('sc-print-done-btn');
    const dBtn = document.getElementById('sc-done-btn');
    if(stage === 'postsave'){
      if(sBtn) sBtn.style.display = 'none';
      if(pBtn) pBtn.style.display = '';
      if(dBtn) dBtn.style.display = '';
    } else {
      if(sBtn) sBtn.style.display = '';
      if(pBtn) pBtn.style.display = 'none';
      if(dBtn) dBtn.style.display = 'none';
    }
  }

  /* SAVE — writes tech to station + upserts TL Data row.
     On success: modal STAYS OPEN and the footer swaps to stage 2
                 (Cancel · PRINT & DONE · DONE) so user picks next step.
     On failure: explicit error toast; modal stays open. */
  function techSaveNew(){
    const stId = parseInt(document.getElementById('tech-sid').value);
    const cur = DB_SC.stations[stId];
    if(!cur || cur.status==='empty'){ toast('⚠ Station empty','er'); techClose(); return; }
    const tech = _techRead();
    if(!tech.grossWt && !tech.truckWt){
      toast('Enter Truck or Gross Wt first','er');
      return;
    }
    /* Persist updatedAt for downstream consumers */
    tech.updatedAt = Date.now();
    setSt(stId, {...cur, tech});
    /* Combined multi-DO: split this one weigh across the linked DOs via the
       allocation popup (pushes one TL row per DO). Needs both gross + truck. */
    if(_mdoIsCombined(cur)){
      const g = parseFloat(tech.grossWt), t = parseFloat(tech.truckWt);
      if(isNaN(g) || isNaN(t)){ toast('Combined order — enter BOTH Truck and Gross Wt to allocate','er'); return; }
      const net = g - t;
      if(net <= 0){ toast('Net ≤ 0 — check Truck / Gross Wt','er'); return; }
      _mdoAllocShow(stId, cur, tech, net);
      return;
    }
    const rid = _pushToTL(stId, cur, tech);
    if(rid){
      toast('💾 Saved → TL Data · Station '+stId, 'ok');
      _setFootStage('postsave');
    } else {
      toast('⚠ Saved to station, but TL push failed — check DO No.','er');
    }
    /* Modal intentionally stays open in both cases */
  }

  /* PRINT & DONE — re-upsert (idempotent merge) then open editable DN overlay.
     Loading turn stays open until user clicks DONE on the overlay (dnOvDone). */
  function techPrintDone(){
    const stId = parseInt(document.getElementById('tech-sid').value);
    const cur = DB_SC.stations[stId];
    if(!cur || cur.status==='empty'){ toast('⚠ Station empty','er'); techClose(); return; }
    const tech = _techRead();
    if(!tech.grossWt && !tech.truckWt){
      toast('Enter Truck or Gross Wt first','er');
      return;
    }
    /* Combined multi-DO: weights must be allocated per DO (one TL row each)
       before the turn can be printed/closed. */
    if(_mdoIsCombined(cur)){
      const wasAlloc = !!(cur.tech && cur.tech._mdoAllocated);
      if(!wasAlloc){
        const g = parseFloat(tech.grossWt), t = parseFloat(tech.truckWt);
        if(isNaN(g) || isNaN(t)){ toast('Combined order — enter BOTH Truck and Gross Wt to allocate','er'); return; }
        const net = g - t;
        if(net <= 0){ toast('Net ≤ 0 — check Truck / Gross Wt','er'); return; }
        tech.updatedAt = Date.now();
        setSt(stId, {...cur, tech});
        _mdoAllocShow(stId, cur, tech, net);
        return;
      }
      tech._mdoAllocated = true;
      tech.updatedAt = Date.now();
      setSt(stId, {...cur, tech});
      techClose();
      /* Rows already pushed by allocation. Ask: one merged DN, or a separate
         DN per DO. Falls back to merged if the per-DO payloads aren't around. */
      const _pl = _mdoPayloadsByStation[stId];
      try{
        if(typeof _mdoPrintChoice === 'function' && Array.isArray(_pl) && _pl.length > 1){
          _mdoPrintChoice(stId, cur, tech, _pl);
        } else {
          _dnShowOverlay(stId, cur, tech);
        }
      }
      catch(e){ console.warn('[SCALE] DN overlay failed', e); toast('Could not open DN preview','er'); }
      return;
    }
    tech.updatedAt = Date.now();
    setSt(stId, {...cur, tech});
    _pushToTL(stId, cur, tech);
    techClose();
    /* Open DN preview overlay so user can edit before printing */
    try{ _dnShowOverlay(stId, cur, tech); }
    catch(e){ console.warn('[SCALE] DN overlay failed', e); toast('Could not open DN preview','er'); }
  }

  /* DONE — re-upsert (idempotent) then complete the loading turn. No print. */
  function techDoneNew(){
    const stId = parseInt(document.getElementById('tech-sid').value);
    const cur = DB_SC.stations[stId];
    if(!cur || cur.status==='empty'){ toast('⚠ Station empty','er'); techClose(); return; }
    const tech = _techRead();
    if(!tech.grossWt && !tech.truckWt){
      toast('Enter Truck or Gross Wt first','er');
      return;
    }
    /* Combined multi-DO: allocate per DO before completing the turn. */
    if(_mdoIsCombined(cur)){
      const wasAlloc = !!(cur.tech && cur.tech._mdoAllocated);
      if(!wasAlloc){
        const g = parseFloat(tech.grossWt), t = parseFloat(tech.truckWt);
        if(isNaN(g) || isNaN(t)){ toast('Combined order — enter BOTH Truck and Gross Wt to allocate','er'); return; }
        const net = g - t;
        if(net <= 0){ toast('Net ≤ 0 — check Truck / Gross Wt','er'); return; }
        tech.updatedAt = Date.now();
        setSt(stId, {...cur, tech});
        _mdoAllocShow(stId, cur, tech, net);
        return;
      }
      tech._mdoAllocated = true;
      tech.updatedAt = Date.now();
      setSt(stId, {...cur, tech});
      toast('✓ Done · Station '+stId,'ok');
      techClose();
      setEmpty(stId);
      return;
    }
    tech.updatedAt = Date.now();
    setSt(stId, {...cur, tech});
    _pushToTL(stId, cur, tech);
    toast('✓ Done · Station '+stId,'ok');
    techClose();
    setEmpty(stId);
  }

  /* Legacy entry points retained for compatibility */
  function techSave(stId){
    const cur = DB_SC.stations[stId];
    if(!cur || cur.status==='empty'){ toast('⚠ Station empty','er'); techClose(); return; }
    setSt(stId, {...cur, tech:_techRead()});
    toast('Scale data saved · Station '+stId,'ok');
    techClose();
  }
  function techDone(stId){
    const cur = DB_SC.stations[stId];
    if(!cur || cur.status==='empty'){ toast('⚠ Station empty','er'); techClose(); return; }
    const tech = _techRead();
    if(!tech.grossWt && !tech.truckWt){ toast('Enter Truck or Gross Wt first','er'); return; }
    DB_SC.stations[stId] = {...cur, tech};
    techClose();
    setEmpty(stId);
  }
  /* Back-compat shim — older paths still call _techNet */
  function _techNet(){ scCalcNet(); }
  function techClose(){
    document.getElementById('scTechBg').classList.remove('on');
    const dd = document.getElementById('sc-dest-dd');
    if(dd) dd.classList.remove('on');
  }
  function pttPrint(stId){
    const s = DB_SC.stations[stId];
    if(!s||s.status==='empty'){toast('⚠ Station empty','er');return;}
    if(!s.qty||parseFloat(s.qty)<=0){toast('⛔ No Loading Qty — check Sale Plan','er');return;}
    /* Build data object and call external overlay */
    const tk = tkGetActive();
    const turn = getDisplayTurn(stId);
    const yr = new Date().getFullYear();
    /* Find matching plan row */
    const planRow = (typeof TP!=='undefined'&&TP.PLAN) ? Object.values(TP.PLAN).find(p=>String(p.doNum||'').trim()===String(s.doNum||'').trim()) : null;
    /* Customer lookup — v4.22.6 uses VN full name (printed on PTT) */
    const custName = (typeof CT!=='undefined'&&CT.vnName) ? CT.vnName(s.customer||'') : (s.customer||'');
    /* TW AVG from Fleet twavg */
    let twAvg = null;
    try{
      const twd = (typeof DATA!=='undefined'&&DATA.twavg) ? DATA.twavg : {};
      const pl = String(s.plate||'').trim().toUpperCase();
      for(const rid in twd){ if(String(twd[rid].truck||twd[rid].plate||'').trim().toUpperCase()===pl){ twAvg=parseFloat(twd[rid].avgWt)||null; break; } }
    }catch(e){}
    /* Safe fill from Fleet */
    let sfKg = null;
    try{
      const fleets = (typeof DATA!=='undefined') ? DATA : {};
      const pl = String(s.plate||'').trim().toUpperCase();
      const rm = String(s.rmooc||'').trim().toUpperCase();
      const findCap = (tab)=>{ const d=fleets[tab]||{}; for(const rid in d){ const dp=String(d[rid].plate||'').trim().toUpperCase(); if(dp&&(dp===pl||(rm&&dp===rm))){ return parseFloat(d[rid].cap||d[rid].volume)||0; } } return 0; };
      const capM3 = findCap('tanklorry')||findCap('rmooc');
      if(capM3>0) sfKg = Math.round(capM3 * (typeof sfDensity==='function'?sfDensity():0.538) * (typeof sfFillPct==='function'?sfFillPct():0.9) * 1000);
    }catch(e){}
    _pttShowOverlay({
      stId, plate:s.plate, rmooc:s.rmooc||planRow?.rmooc||'', doNum:s.doNum,
      customer:custName, qty:parseFloat(s.qty)||0, type:s.type||planRow?.type||'',
      driver:s.driver||planRow?.driver||'', tank:s.tank, batch:s.batch,
      turn, twAvg, sfKg, lotFull: s.batch ? _sanitizeLotPrefix(s.batch)+'/'+s.tank : (tk?(tk.lotFull+'/'+tk.name):''),
      saleNote: planRow?.note||'', maxTol: parseFloat(s.tolerance||planRow?.tolerance||planRow?.maxTol||0)||0
    });
  }

  /* ─── Firebase init ─── */
  function init(){
    try{
      if(typeof firebase==='undefined') return;
      FB_SC=firebase.database();
      FB_SC.ref('stations').on('value',s=>{
        const val=s.val();
        if(val){ for(let i=1;i<=4;i++) if(val[i]) DB_SC.stations[i]=val[i]; }
        if(document.getElementById('sub-scale')?.classList.contains('on')) scRenderCtrl();
      });
      FB_SC.ref('tank_config').on('value',snap=>{
        const val=snap.val();
        if(val&&(val.tk1||val.tk2)){
          const _def={selected:false,lot:'',initWt:0,mode:'auto',manualWt:0};
          SC_TK_CFG.tk1=Object.assign({},_def,val.tk1||{});
          SC_TK_CFG.tk2=Object.assign({},_def,val.tk2||{});
          _tkVer=parseInt(val._ver)||0;
          _renderTankBar();
        }
      });
      console.log('[SCALE] ✅ Init OK');
      /* QUEUE (v4.21.0) — start listener and paint the empty state immediately
         so the UI shows "— No vehicles in queue —" before Firebase responds. */
      _scWaitInit();
      _scRenderWait();
    }catch(e){ console.error('[SCALE] Init error',e); }
  }

  /* click-outside close station search */
  document.addEventListener('click',e=>{
    for(let i=1;i<=4;i++){
      const res=document.getElementById('sc-res-'+i);
      if(res&&res.style.display==='block'){
        const inp=document.getElementById('sc-inp-'+i);
        if(!inp?.contains(e.target)&&!res.contains(e.target)) scHideResults(i);
      }
    }
    /* close destination dropdown when clicking outside its field */
    const destDd = document.getElementById('sc-dest-dd');
    if(destDd && destDd.classList.contains('on')){
      const destInp = document.getElementById('tc-dest');
      if(!destInp?.contains(e.target) && !destDd.contains(e.target)){
        destDd.classList.remove('on');
      }
    }
    /* QUEUE search dropdown (v4.21.0) — same pattern */
    const wres = document.getElementById('scWaitRes');
    if(wres && wres.style.display === 'block'){
      const winp = document.getElementById('scWaitSearch');
      if(!winp?.contains(e.target) && !wres.contains(e.target)) waitHideRes();
    }
  },true);
  window.addEventListener('scroll',()=>{
    for(let i=1;i<=4;i++){ const r=document.getElementById('sc-res-'+i); if(r&&r.style.display==='block') _positionRes(i); }
    const wr=document.getElementById('scWaitRes'); if(wr&&wr.style.display==='block') _scWaitPositionRes();
  },true);
  window.addEventListener('resize',()=>{
    for(let i=1;i<=4;i++){ const r=document.getElementById('sc-res-'+i); if(r&&r.style.display==='block') _positionRes(i); }
    const wr=document.getElementById('scWaitRes'); if(wr&&wr.style.display==='block') _scWaitPositionRes();
  });

  /* ─── Mix Calculator integration ───
     Called by the MC module after a successful SAVE Pass.
     RAM-only mutation of filled C3/C4/lotSrc (not persisted to FB to keep
     the tank_config payload small). lot + initWt ARE persisted via the
     existing _tkSaveToFb full-object write — Spark-frugal since the
     payload is tiny (~80 bytes). */
  function mcSyncTkCfg(tkKey, payload){
    if(tkKey !== 'tk1' && tkKey !== 'tk2') return false;
    const cfg = SC_TK_CFG[tkKey];
    if(!cfg) return false;
    if(cfg.mode !== 'auto') return false;     // manual mode → leave alone
    const lotS = String(payload.lot || '');
    if(cfg.lot && cfg.lot !== lotS) return false;   // a different lot is set — don't overwrite
    cfg.lot = lotS;
    cfg.lotSrc = 'auto';
    cfg.filledC3 = payload.filledC3 || 0;     // RAM-only
    cfg.filledC4 = payload.filledC4 || 0;     // RAM-only
    if(payload.initWt != null) cfg.initWt = payload.initWt;
    _tkSaveToFb();
    _renderTankBar();
    try{ scRenderCtrl(); }catch(_){}
    return true;
  }

  /* ═══════════════════════════════════════════════════
     QUEUE (SC_WAIT) — v4.21.0 (port of V406 SC_WAIT)
     A wait-list for vehicles that arrive while all 4 stations are busy.
     ── Decisions (confirmed with user) ──
       • Persist: Firebase `sc_wait_queue` with .on('value') multi-machine
         sync + 300ms debounce save. Anti-loop via _scWaitSuppressSave.
       • Day-rollover: silent clear when listener sees forDate != today.
       • Manual promotion only — operator clicks 📍 (no auto-promote
         when a station goes empty).
       • "Back to queue": dbl-click reset on a loading station re-queues
         the vehicle (with _targetSt hint) instead of destroying it.
       • V4 has only 2 station states (empty / loading), so the picker
         popup is simpler than V406 (no calling/wait branches).
       • PTT for queue items reuses _pttShowOverlay with a custom turn
         (= getTurnFromTLData + 2 + queuePos for the target station).
       • TP.PLAN / TMR.PLAN are READ-ONLY for this module — no writes
         back to plan rows (V406 didn't either).
     ═══════════════════════════════════════════════════ */
  let SC_WAIT = [];
  let _scWaitSaveTimer = null;
  let _scWaitLastJson  = '';
  let _scWaitSuppressSave = false;

  function _scWaitMakeId(){
    /* base36 random + time tail — collision-safe across machines that
       may add queue items offline (per project convention for rids). */
    return Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4);
  }

  function _scWaitIsoToday(){
    const d = new Date(), p = n => String(n).padStart(2,'0');
    return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
  }

  /* Strip runtime fields when serializing for Firebase persist. */
  function _scWaitSnapshot(){
    const KEEP = ['_id','plate','driver','customer','doNum','qty','type','note','rmooc','_oid','_targetSt','_turn'];
    const items = SC_WAIT.map(it => {
      const out = {};
      KEEP.forEach(k => { if(it[k] != null && it[k] !== '') out[k] = it[k]; });
      return out;
    });
    return { forDate: _scWaitIsoToday(), items };
  }

  /* Debounced write to `sc_wait_queue` — skips equal-JSON to avoid burning
     Spark quota on noop writes (e.g. echo from listener). */
  function _scWaitScheduleSave(){
    if(_scWaitSuppressSave) return;
    if(_scWaitSaveTimer) clearTimeout(_scWaitSaveTimer);
    _scWaitSaveTimer = setTimeout(() => {
      _scWaitSaveTimer = null;
      if(_scWaitSuppressSave) return;
      if(!FB_SC) return;
      const snap = _scWaitSnapshot();
      const json = JSON.stringify(snap);
      if(json === _scWaitLastJson) return;
      _scWaitLastJson = json;
      FB_SC.ref('sc_wait_queue').set(snap).catch(e => console.warn('[SCALE] queue save', e));
      try{ logAudit('scale:queue:save', '_bulk_', '_save', SC_WAIT.length, '', 'save'); }catch(_){}
    }, 300);
  }

  function scWaitClear(){
    SC_WAIT = [];
    _scRenderWait();
    if(FB_SC){
      const empty = { forDate: _scWaitIsoToday(), items: [] };
      _scWaitLastJson = JSON.stringify(empty);
      FB_SC.ref('sc_wait_queue').set(empty).catch(() => {});
    }
    try{ logAudit('scale:queue:clear', '_bulk_', '_clear', '', '', 'clear'); }catch(_){}
  }

  function _scWaitInit(){
    if(!FB_SC) return;
    FB_SC.ref('sc_wait_queue').on('value', snap => {
      const v = snap.val();
      if(!v){
        _scWaitSuppressSave = true;
        SC_WAIT = [];
        _scWaitLastJson = '';
        _scWaitSuppressSave = false;
        _scRenderWait();
        return;
      }
      /* Day-rollover: silent clear, then push an empty snapshot for today.
         All connected machines reach this branch at the same wall-clock
         day boundary; second-write echoes are skipped by the equal-JSON
         guard in _scWaitScheduleSave. */
      if(v.forDate && v.forDate !== _scWaitIsoToday()){
        SC_WAIT = [];
        _scWaitLastJson = '';
        _scRenderWait();
        _scWaitScheduleSave();
        return;
      }
      /* Normal apply — wrap in _scWaitSuppressSave so the render below
         can't trigger a write loop with the source machine. */
      _scWaitSuppressSave = true;
      SC_WAIT = Array.isArray(v.items) ? v.items.slice() : [];
      _scWaitLastJson = JSON.stringify({ forDate: v.forDate || _scWaitIsoToday(), items: SC_WAIT });
      _scWaitSuppressSave = false;
      _scRenderWait();
    });
  }

  /* Set of identifiers ineligible for adding (currently on a station or
     already in queue). Keyed by both _oid and the real DO to mirror the
     existing scSearch dedup logic. */
  function _scWaitOccupiedKeys(){
    const set = new Set();
    Object.values(DB_SC.stations || {}).forEach(st => {
      if(st.status && st.status !== 'empty'){
        const oid = String(st._oid || '').trim();
        const dn  = String(st.doNum || '').trim();
        if(oid) set.add('oid:' + oid);
        if(/^\d{7,}$/.test(dn)) set.add('do:' + dn);
      }
    });
    SC_WAIT.forEach(it => {
      const oid = String(it._oid || '').trim();
      const dn  = String(it.doNum || '').trim();
      if(oid) set.add('oid:' + oid);
      if(/^\d{7,}$/.test(dn)) set.add('do:' + dn);
    });
    return set;
  }

  function _scWaitGetRes(){
    let res = document.getElementById('scWaitRes');
    if(!res){
      res = document.createElement('div');
      res.id = 'scWaitRes';
      res.className = 'sc-wait-res';
      document.body.appendChild(res);
    }
    return res;
  }
  function _scWaitPositionRes(){
    const inp = document.getElementById('scWaitSearch');
    const res = document.getElementById('scWaitRes');
    if(!inp || !res) return;
    const r = inp.getBoundingClientRect();
    res.style.left  = r.left + 'px';
    res.style.top   = (r.bottom + 2) + 'px';
    res.style.width = Math.max(r.width, 280) + 'px';
  }

  function waitSearch(query){
    const res = _scWaitGetRes();
    const q = (query || '').trim().toLowerCase();
    if(!q){ res.style.display = 'none'; return; }
    _scWaitPositionRes();
    /* Pool = TP.PLAN ∪ TMR.PLAN. Exclude rows already on a station or in
       the queue. Source badge distinguishes today vs tomorrow rows so
       operator knows what they're queuing (tomorrow rows still validate
       _forDate in _scWaitValidate before they're allowed in). */
    const pool = [];
    if(typeof TP  !== 'undefined' && TP.PLAN)  Object.values(TP.PLAN).forEach(r => pool.push({src:'today',    row:r}));
    if(typeof TMR !== 'undefined' && TMR.PLAN) Object.values(TMR.PLAN).forEach(r => pool.push({src:'tomorrow', row:r}));
    const occupied = _scWaitOccupiedKeys();
    const matches = pool.filter(({row}) => {
      const oidStr = String(row._oid || '').trim();
      const doStr  = String(row.doNum || '').trim();
      if(oidStr && occupied.has('oid:' + oidStr)) return false;
      if(/^\d{7,}$/.test(doStr) && occupied.has('do:' + doStr)) return false;
      return (row.plate    || '').toLowerCase().includes(q)
          || (row.driver   || '').toLowerCase().includes(q)
          || doStr.toLowerCase().includes(q)
          || oidStr.toLowerCase().includes(q)
          || (row.customer || '').toLowerCase().includes(q);
    }).slice(0, 8);
    if(!matches.length){
      res.innerHTML = '<div style="padding:8px;color:var(--muted);font-size:10px;text-align:center">No results</div>';
      res.style.display = 'block';
      return;
    }
    res.innerHTML = matches.map((m, idx) => {
      const r = m.row;
      const qty = r.qty || r.contractQty || '';
      const srcBadge = m.src === 'tomorrow'
        ? '<span style="background:#ff8a00;color:#fff;font-size:8px;padding:1px 4px;border-radius:3px;margin-left:4px">TMR</span>'
        : '';
      return `<div class="sc-wait-res-item" onclick="SCALE.waitPick(${idx})">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-family:'Oswald',sans-serif;font-weight:700;font-size:12px">${esc(r.plate || '—')}</span>
          <span style="font-size:9px;color:var(--muted)">${esc(r.doNum || (isTempOid(String(r._oid || '')) ? r._oid : ''))}</span>
          ${srcBadge}
        </div>
        <div style="color:var(--muted);font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${esc(r.driver || '—')} · ${esc(r.customer || '—')}${qty ? ' · <b>' + esc(String(qty)) + 'MT</b>' : ''}
        </div>
      </div>`;
    }).join('');
    res.style.display = 'block';
    window._scWaitMatches = matches;
  }

  function waitHideRes(){
    const res = document.getElementById('scWaitRes');
    if(res) res.style.display = 'none';
  }

  function waitPick(idx){
    const matches = window._scWaitMatches;
    if(!matches || !matches[idx]) return;
    const row = matches[idx].row;
    waitHideRes();
    const inp = document.getElementById('scWaitSearch');
    if(inp) inp.value = '';
    _scWaitPopOpen(row);
  }

  /* Block validation, shared by assign-now and add-to-queue paths.
     Mirrors the blocks in scAssignToStation so a row that can't go to
     a station also can't sit in the queue (it would just fail later). */
  function _scWaitValidate(row){
    const realDO = /^\d{7,}$/.test(String(row.doNum || '').trim()) ? String(row.doNum).trim() : '';
    const doStr  = realDO || String(row._oid || '').trim();
    if(!doStr)        return {ok:false, err:'Order has no DO / Order ID'};
    if(!row.plate)    return {ok:false, err:'Missing plate'};
    if(!row.driver)   return {ok:false, err:'Missing driver'};
    const qty = parseFloat(row.qty || row.contractQty || 0) || 0;
    if(!qty)          return {ok:false, err:'Missing Loading Qty'};
    const rowDate = String(row._forDate || '').trim();
    if(rowDate && rowDate !== _scWaitIsoToday()){
      const which = rowDate > _scWaitIsoToday() ? 'future' : 'stale';
      return {ok:false, err:'Cannot queue — this row is a ' + which + ' plan (' + rowDate + ').'};
    }
    return {ok:true, doStr, qty};
  }

  function _scWaitPopOpen(row){
    const pop  = document.getElementById('scWaitPopBg');
    const head = document.getElementById('scWaitPopVeh');
    const btns = document.getElementById('scWaitPopBtns');
    if(!pop || !head || !btns) return;
    const v = _scWaitValidate(row);
    if(!v.ok){ toast(v.err, 'er'); return; }
    head.textContent = (row.plate || '—') + ' · ' + (row.doNum || row._oid || '');
    const html = [];
    for(let i = 1; i <= 4; i++){
      const s = DB_SC.stations[i] || {status:'empty'};
      const empty = !s.status || s.status === 'empty';
      const baseTurn = getTurnFromTLData(i);
      if(empty){
        html.push(`<button class="sc-wait-pop-btn" onclick="SCALE.waitPopAssign(${i})">
          S${i} — Assign now
          <span class="sc-wait-pop-st">Station empty · turn T${baseTurn + 1}</span>
        </button>`);
      }else{
        /* Queue position counts only items targeting THIS station, so
           same-target T-numbers are dense. */
        const pos = SC_WAIT.filter(it => Number(it._targetSt) === i).length;
        const t = baseTurn + 2 + pos;
        html.push(`<button class="sc-wait-pop-btn busy" onclick="SCALE.waitPopQueue(${i})">
          S${i} — Add to queue
          <span class="sc-wait-pop-st">Loading ${esc(String(s.plate || '').slice(0, 10))} · waitlist T${t}</span>
        </button>`);
      }
    }
    btns.innerHTML = html.join('');
    pop.classList.add('on');
    window._scWaitPopRow = row;
  }

  function waitPopClose(){
    const pop = document.getElementById('scWaitPopBg');
    if(pop) pop.classList.remove('on');
    window._scWaitPopRow = null;
  }

  function waitPopAssign(stId){
    const row = window._scWaitPopRow;
    if(!row) return;
    waitPopClose();
    /* Re-check just before the assign in case another machine grabbed
       the station between popup-open and click. */
    const s = DB_SC.stations[stId] || {status:'empty'};
    if(s.status && s.status !== 'empty'){
      toast('Station ' + stId + ' is no longer empty — pick again', 'er');
      _scWaitPopOpen(row);
      return;
    }
    scAssignToStation(stId, row);
  }

  function waitPopQueue(stId){
    const row = window._scWaitPopRow;
    if(!row) return;
    waitPopClose();
    const v = _scWaitValidate(row);
    if(!v.ok){ toast(v.err, 'er'); return; }
    const dupKey = String(row.plate || '').toUpperCase() + '|' + String(row.doNum || row._oid || '').trim();
    if(SC_WAIT.some(it => (String(it.plate || '').toUpperCase() + '|' + String(it.doNum || it._oid || '').trim()) === dupKey)){
      toast('Vehicle already in queue', 'er');
      return;
    }
    const pos  = SC_WAIT.filter(it => Number(it._targetSt) === stId).length;
    const turn = getTurnFromTLData(stId) + 2 + pos;
    const item = {
      _id:        _scWaitMakeId(),
      plate:      row.plate || '',
      driver:     row.driver || '',
      customer:   row.customer || '',
      doNum:      row.doNum || '',
      qty:        String(parseFloat(row.qty || row.contractQty || 0) || 0),
      type:       row.type || '',
      note:       (row.note || '').toString().trim(),
      rmooc:      row.rmooc || row.romooc || '',
      _oid:       row._oid || '',
      tolerance:  String(row.tolerance || row.maxTol || ''),
      _multiDO:   row._multiDO || false,
      _linkedRows: row._linkedRows || null,
      _mdResolved: !!(row._multiDO && Array.isArray(row._linkedRows) && row._linkedRows.length > 1),
      _targetSt:  stId,
      _turn:      turn
    };
    SC_WAIT.push(item);
    _scRenderWait();
    _scWaitScheduleSave();
    toast(item.plate + ' → Queue (T' + turn + ', target S' + stId + ')', 'ok');
    try{ logAudit('scale:queue:add', item._oid || item.doNum || '_', '_add', '', JSON.stringify({stId, turn}), 'add'); }catch(_){}
    /* Print PTT with the wait-list turn so the driver knows their slot. */
    try{ _scWaitPttPrint(item); }catch(e){ console.warn('[SCALE] queue PTT', e); }
  }

  /* Print PTT for a queue item — same overlay as pttPrint() but data is
     built from the queue snapshot (no station to read from) and turn is
     the queue's _turn (not getDisplayTurn). */
  function _scWaitPttPrint(item){
    let tk = tkGetActive();
    /* Pure order in the queue prints its dedicated pure tank + auto lot, same
       rule as scAssignToStation (TK-3301 / TK-3401 + next Pure-Log lot). */
    const _pt = _scPureType(item.type);
    if(_pt){
      const pn = _pt==='C3' ? '3301' : '3401';
      let plot=''; try{ if(typeof PLOG!=='undefined' && PLOG.nextLot) plot = PLOG.nextLot(_pt); }catch(_){}
      tk = { name:'TK-'+pn, key:'pure', lotFull:plot, lotNum:plot, initWt:0 };
    }
    const custName = (typeof CT !== 'undefined' && CT.vnName) ? CT.vnName(item.customer || '') : (item.customer || '');
    /* TW AVG from Fleet twavg by plate */
    let twAvg = null;
    try{
      const twd = (typeof DATA !== 'undefined' && DATA.twavg) ? DATA.twavg : {};
      const pl = String(item.plate || '').trim().toUpperCase();
      for(const rid in twd){
        if(String(twd[rid].truck || twd[rid].plate || '').trim().toUpperCase() === pl){
          twAvg = parseFloat(twd[rid].avgWt) || null;
          break;
        }
      }
    }catch(_){}
    /* Safe fill — derive from Fleet cap × density × fillPct */
    let sfKg = null;
    try{
      const fleets = (typeof DATA !== 'undefined') ? DATA : {};
      const pl = String(item.plate || '').trim().toUpperCase();
      const rm = String(item.rmooc || '').trim().toUpperCase();
      const findCap = tab => {
        const d = fleets[tab] || {};
        for(const rid in d){
          const dp = String(d[rid].plate || '').trim().toUpperCase();
          if(dp && (dp === pl || (rm && dp === rm))) return parseFloat(d[rid].cap || d[rid].volume) || 0;
        }
        return 0;
      };
      const capM3 = findCap('tanklorry') || findCap('rmooc');
      if(capM3 > 0) sfKg = Math.round(capM3 * (typeof sfDensity === 'function' ? sfDensity() : 0.538) * (typeof sfFillPct === 'function' ? sfFillPct() : 0.9) * 1000);
    }catch(_){}
    /* WGCHECK Plan↔WMS warnings — prepend to note for the booth, matching
       what scAssignToStation does at real assign time. RAM-only. */
    let displayNote = item.note || '';
    try{
      if(typeof WGCHECK !== 'undefined'){
        const rowLike = {plate:item.plate, rmooc:item.rmooc, doNum:item.doNum, customer:item.customer, qty:item.qty, note:item.note, _oid:item._oid};
        const wgWarns = WGCHECK.assignWarnings(rowLike);
        if(wgWarns && wgWarns.length){
          const wgText = wgWarns.join(' | ');
          displayNote = displayNote ? (wgText + ' | ' + displayNote) : wgText;
        }
      }
    }catch(_){}
    _pttShowOverlay({
      stId:     item._targetSt || '?',
      plate:    item.plate,
      rmooc:    item.rmooc || '',
      doNum:    item.doNum || item._oid || '',
      customer: custName,
      qty:      parseFloat(item.qty) || 0,
      type:     item.type || '',
      driver:   item.driver || '',
      tank:     tk ? tk.name : '',
      batch:    tk ? tk.lotFull : '',
      turn:     item._turn || 1,
      twAvg, sfKg,
      lotFull:  tk ? (tk.lotFull + '/' + tk.name) : '',
      saleNote: displayNote,
      maxTol:   0
    });
  }

  function _scRenderWait(){
    const list = document.getElementById('scWaitList');
    const cnt  = document.getElementById('scWaitCnt');
    if(cnt) cnt.textContent = String(SC_WAIT.length);
    if(!list) return;
    if(!SC_WAIT.length){
      list.innerHTML = '<div class="sc-wait-empty">— No vehicles in queue —</div>';
      return;
    }
    list.innerHTML = SC_WAIT.map((it, idx) => {
      const tag = it._targetSt ? `<span class="sc-wait-tag">T${it._targetSt}·L${it._turn || '?'}</span>` : '';
      return `<div class="sc-wait-item">
        <span class="sc-wait-plate">${esc(it.plate || '—')}</span>
        ${tag}
        <span class="sc-wait-meta">${esc(it.driver || '')} · ${esc(it.customer || '')}${it.qty ? ' · ' + esc(String(it.qty)) + 'MT' : ''}</span>
        <button class="sc-wait-go" title="Assign to a station" onclick="SCALE.waitClickAssign(${idx})">📍</button>
        <button class="sc-wait-del" title="Remove from queue" onclick="SCALE.waitDel(${idx})">×</button>
      </div>`;
    }).join('');
  }

  /* Operator clicks 📍: prefer the targeted station if empty, else fall
     back to the first empty one. If nothing is empty, toast and bail —
     the item stays in queue for the operator to retry. */
  function waitClickAssign(idx){
    const it = SC_WAIT[idx]; if(!it) return;
    const target = Number(it._targetSt);
    const stations = DB_SC.stations || {};
    let stId = 0;
    if(target >= 1 && target <= 4 && (!stations[target] || stations[target].status === 'empty')){
      stId = target;
    }else{
      for(let i = 1; i <= 4; i++){
        if(!stations[i] || stations[i].status === 'empty'){ stId = i; break; }
      }
    }
    if(!stId){ toast('No station is empty — wait for one to finish', 'er'); return; }
    /* Prefer a fresh copy from TP.PLAN by _oid (catches edits made since
       the row was queued) — fall back to the queue snapshot if the
       original plan row is gone. */
    let row = null;
    try{
      if(it._oid && typeof TP !== 'undefined' && TP.PLAN){
        const found = Object.values(TP.PLAN).find(p => String(p._oid || '') === String(it._oid));
        if(found) row = found;
      }
    }catch(_){}
    if(!row){
      row = {
        plate: it.plate, driver: it.driver, customer: it.customer,
        doNum: it.doNum, qty: it.qty, type: it.type, note: it.note,
        rmooc: it.rmooc, _oid: it._oid, _forDate: _scWaitIsoToday()
      };
    }
    /* If this queue item was a COMBINED multi-DO order, restore the combined
       identity onto the row. The fresh TP.PLAN-by-_oid lookup above returns
       only the primary SINGLE plan row (no _multiDO/_linkedRows), which would
       make scAssignToStation re-run linking — and that fails once the combined
       doNum is sitting in SC_WAIT (Bug3). Overlaying _mdResolved + _linkedRows
       makes scAssignToStation skip re-linking and assign the combined order
       directly. Shallow-copy so we never pollute the live TP.PLAN row. */
    if(it._multiDO && Array.isArray(it._linkedRows) && it._linkedRows.length > 1){
      row = Object.assign({}, row, {
        doNum:       it.doNum,
        qty:         (it.qty != null && it.qty !== '') ? it.qty : row.qty,
        tolerance:   it.tolerance || row.tolerance || '',
        _multiDO:    true,
        _linkedRows: it._linkedRows,
        _mdResolved: true
      });
    }
    try{ logAudit('scale:queue:assign', it._oid || it.doNum || '_', '_assign', '', String(stId), 'assign'); }catch(_){}
    /* Do NOT pre-splice the queue. scAssignToStation calls _scWaitCleanupByRow
       at the END (after setSt succeeds), so if validation fails early (e.g.
       no active tank), the item stays in queue for retry. Centralized in
       v4.21.3 — fixes the "lost item on failed assign" race. */
    scAssignToStation(stId, row);
  }

  function waitDel(idx){
    const it = SC_WAIT[idx]; if(!it) return;
    SC_WAIT.splice(idx, 1);
    _scRenderWait();
    _scWaitScheduleSave();
    try{ logAudit('scale:queue:remove', it._oid || it.doNum || '_', '_remove', '', '', 'remove'); }catch(_){}
    toast(it.plate + ' removed from queue', 'ok');
  }

  /* Drop any queue items matching the row that was just assigned to a
     station. Called from scAssignToStation as the centralized cleanup so
     EVERY assign path (per-station search, queue 📍 click, popup
     waitPopAssign) leaves the queue clean. Match priority:
       1. _oid (canonical unique identity)
       2. real DO (7+ digits) — fallback when _oid is unknown / temp
     Plate alone is NOT a match key — same truck can re-appear with a
     different DO on a later trip and we don't want to drop that. */
  function _scWaitCleanupByRow(oid, doNum){
    const oidS = String(oid || '').trim();
    const doS  = String(doNum || '').trim();
    if(!oidS && !doS) return;
    const isRealDO = /^\d{7,}$/.test(doS);
    const before = SC_WAIT.length;
    SC_WAIT = SC_WAIT.filter(it => {
      const iOid = String(it._oid || '').trim();
      const iDo  = String(it.doNum || '').trim();
      if(oidS && iOid && iOid === oidS) return false;
      if(isRealDO && iDo === doS)       return false;
      return true;
    });
    if(SC_WAIT.length === before) return;   // nothing matched — idempotent no-op
    _scRenderWait();
    _scWaitScheduleSave();
    try{ logAudit('scale:queue:autoclean', oidS || doS, '_autoclean', String(before - SC_WAIT.length), '', 'autoclean'); }catch(_){}
  }

  /* "Back to queue" bonus (v4.21.0): called from stationReset BEFORE the
     station is cleared. Re-queues the vehicle with _targetSt = the
     station it was on. Pulls a clean note from TP.PLAN (the on-station
     note may have WGCHECK warnings prepended at assign time, which would
     double up if re-prepended on the next assign). */
  function _scWaitBackFromStation(stData, stId){
    if(!stData || !stData.plate) return;
    const dupKey = String(stData.plate || '').toUpperCase() + '|' + String(stData.doNum || stData._oid || '').trim();
    if(SC_WAIT.some(it => (String(it.plate || '').toUpperCase() + '|' + String(it.doNum || it._oid || '').trim()) === dupKey)) return;
    let cleanNote = '';
    try{
      if(stData._oid && typeof TP !== 'undefined' && TP.PLAN){
        const planRow = Object.values(TP.PLAN).find(p => String(p._oid || '') === String(stData._oid));
        if(planRow) cleanNote = (planRow.note || '').toString().trim();
      }
    }catch(_){}
    const pos  = SC_WAIT.filter(it => Number(it._targetSt) === stId).length;
    const turn = getTurnFromTLData(stId) + 2 + pos;
    SC_WAIT.push({
      _id:        _scWaitMakeId(),
      plate:      stData.plate || '',
      driver:     stData.driver || '',
      customer:   stData.customer || '',
      doNum:      stData.doNum || '',
      qty:        String(parseFloat(stData.qty || 0) || 0),
      type:       stData.type || '',
      note:       cleanNote || (stData.note || '').toString().trim(),
      rmooc:      stData.rmooc || '',
      _oid:       stData._oid || '',
      tolerance:  String(stData.tolerance || stData.maxTol || ''),
      _multiDO:   stData._multiDO || false,
      _linkedRows: stData._linkedRows || null,
      _mdResolved: !!(stData._multiDO && Array.isArray(stData._linkedRows) && stData._linkedRows.length > 1),
      _targetSt:  stId,
      _turn:      turn
    });
    _scRenderWait();
    _scWaitScheduleSave();
    try{ logAudit('scale:queue:back', stData._oid || stData.doNum || '_', '_back', '', String(stId), 'back'); }catch(_){}
    toast(stData.plate + ' → Queue (back from S' + stId + ')', 'ok');
  }

  return {
    init, scRenderCtrl, scTkSelect, scToggleMode, _onLotChange, refreshLotFromTankLog,
    setSt, setEmpty, stationReset, swapStations, swapStationTank,
    scSearch, scShowResults, scClear, scHideResults,
    assignFromSearch, stEditOpen, openTech, pttPrint,
    mdoMerge, mdoSingle, mdoCancel,
    mdoAllocRecalc, mdoAllocSave, mdoAllocCancel,
    techSave, techSaveNew, techPrintDone, techDoneNew, techDone, techClose, _techNet,
    scCalcNet, scFmtTime, scTabNext, _fmtWtLive,
    scDestSearch, scDestPick, scDestKeydown, scGiToggle,
    certSearch, certModalOpen, certModalClose, certModalSave,
    getStations:()=>DB_SC.stations, getStation:(id)=>DB_SC.stations[id], getTkCfg:()=>SC_TK_CFG,
    /* v4.36.3 — exposed for SYNC.promotePair to relink an in-flight station
       to the promoted real DO (was a dead bare-identifier call before). */
    setSt,
    mcSyncTkCfg,
    /* v4.22.4 — exposed so TP / TL can trigger a row1 recompute (PLAN
       remaining MT + tank REMAINING with station tentative deduction) when
       their data changes. Pure RAM, no FB. */
    refreshRow1: _updateRow1,
    /* QUEUE (v4.21.0) */
    waitSearch, waitHideRes, waitPick, waitPopClose, waitPopAssign, waitPopQueue,
    waitClickAssign, waitDel, waitClear: scWaitClear,
    _scWaitBackFromStation, _scWaitInit, _scWaitPositionRes
  };
})();
