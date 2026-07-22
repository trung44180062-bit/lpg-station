/* ============================================================
 * VMIX  —  vmix.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 23818–24745   (~928 dòng)
 * Global xuất ra : window.VMIX
 * Phase tách     : P5B
 * Phụ thuộc      : sync, mixctrl
 * Khởi tạo (boot): VMIX.init() trong boot
 * ------------------------------------------------------------
 * MÔ TẢ: Vessel/volume mix: DEFAULT_DENS/DEFAULT_PROPS, STATE/UNIT theo tank.
 *
 * API công khai (điền/đối chiếu khi tách):
 *   VMIX.init(), VMIX.calc(...)
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module VMIX từ dòng 23818 đến 24745.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.VMIX).
 *   3) node --check vmix.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P5B]: dán thân module VMIX (V4-54 dòng 23818–24745) vào đây. */

/* ===== BÓC TỪ V4-54 dòng 23818–24745 ===== */
const VMIX = (function(){
  'use strict';

  /* ---------- defaults (V406 values, used until vessel_config loads) ---------- */
  const DEFAULT_SHIPS = [
    { name:'VIET GAS 01', tk1_m3:452.056, tk2_m3:721.153 },
    { name:'VIET GAS',    tk1_m3:500,     tk2_m3:500     },
    { name:'OCEAN STAR',  tk1_m3:2509.007,tk2_m3:2508.962}
  ];
  const DEFAULT_DENS = { c3l:0.492, c4l:0.566, c3v:0.01721, c4v:0.00825 };
  const DEFAULT_PROPS = {
    c3_vr:100,   c3_den:0.5074,
    nc4_vr:78,   nc4_den:0.5841,
    ic4_vr:22,   ic4_den:0.5629
  };
  const GC_KEYS = ['meth','eth','prop','ibut','nbut','buta','c5','ole'];
  /* v4.72 — chỉ tiêu COQ bổ sung / tank (COQ vessel có, tab này trước đây chưa có).
     Lưu ý: COQ vessel KHÔNG có final volume nên không import tload/lvol. */
  const VCQ = [
    {k:'c3h6',l:'C₃H₆ Propylene'},{k:'vp',l:'Vapor kPa'},{k:'sul',l:'Sulfur mg/kg'},{k:'mw',l:'Mol. Weight'},
    {k:'frv',l:'Pro/Bu %Vol',txt:1},{k:'frw',l:'Pro/Bu %Wt',txt:1},
    {k:'h2o',l:'Free Water',txt:1},{k:'cu',l:'Cu Corrosion',txt:1},{k:'res',l:'Residue',txt:1},
    {k:'t2b',l:'t-2-Butene'},{k:'b1',l:'1-Butene'},{k:'ib',l:'i-Butene'},
    {k:'neoc5',l:'neo-Pentane'},{k:'ic5',l:'i-Pentane'},{k:'nc5',l:'n-Pentane'},{k:'nc6',l:'n-Hexane'}
  ];
  const VCQ_TXT = ['frv','frw','h2o','cu','res'];

  /* ---------- module state ---------- */
  let SHIPS    = DEFAULT_SHIPS.slice();
  let DENS     = Object.assign({}, DEFAULT_DENS);
  let PROPS    = Object.assign({}, DEFAULT_PROPS);
  let SEL_SHIP = null;
  let RATIO    = 1;                          // 1 | 2
  const STATE  = { '0':'idle', '1':'idle' }; // per-tank state
  const UNIT   = { '0':'vol',  '1':'vol'  }; // %vol or %wt for target C3
  let _attached = false;

  /* ---------- DOM helpers ---------- */
  function _gid(id){ return document.getElementById(id); }
  function _gv(id){ const e = _gid(id); return e ? e.value : ''; }
  function _gnum(id){ const v = parseFloat(_gv(id)); return isNaN(v) ? 0 : v; }
  function _p2(v){ return String(v).padStart(2, '0'); }
  function _todayDDMMYY(){
    const d = new Date();
    return _p2(d.getDate())+'/'+_p2(d.getMonth()+1)+'/'+String(d.getFullYear()).slice(2);
  }
  function _nowHHMM(){
    const d = new Date();
    return _p2(d.getHours())+':'+_p2(d.getMinutes());
  }

  /* ---------- ship dropdown ---------- */
  function _populateShipSel(){
    const sel = _gid('vs-ship-sel'); if(!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">— Select vessel —</option>';
    SHIPS.forEach(s=>{
      const opt = document.createElement('option');
      opt.value = s.name;
      opt.textContent = s.name+' ('+s.tk1_m3+'m³ / '+s.tk2_m3+'m³)';
      sel.appendChild(opt);
    });
    /* preserve previous selection if still in the list */
    if(prev && SHIPS.some(s=>s.name===prev)) sel.value = prev;
    else if(SEL_SHIP && SHIPS.some(s=>s.name===SEL_SHIP)) sel.value = SEL_SHIP;
    else {
      const def = SHIPS.find(s => /VIET\s*GAS/i.test(s.name));
      if(def){ sel.value = def.name; }
      else if(SHIPS.length){ sel.value = SHIPS[0].name; }
    }
    onShipChange();
  }

  function onShipChange(){
    const sel = _gid('vs-ship-sel');
    SEL_SHIP = sel ? sel.value : '';
    const ship = SEL_SHIP ? SHIPS.find(s=>s.name===SEL_SHIP) : null;
    const v1 = _gid('vs-tk1-vol');
    const v2 = _gid('vs-tk2-vol');
    if(v1) v1.textContent = ship ? '('+ship.tk1_m3+' m³)' : '';
    if(v2) v2.textContent = ship ? '('+ship.tk2_m3+' m³)' : '';
    updateLot();
  }

  /* ---------- lot formatter LPG-YYYY-{S/EX}-NNN ---------- */
  function updateLot(){
    const ty   = _gv('vs-type-sel') || 'S';
    const dt   = _gv('vs-date');
    const num  = _gv('vs-lot-num');
    let yr;
    if(dt){
      const p = String(dt).split('/');
      yr = p.length === 3 ? ('20' + p[2]) : new Date().getFullYear();
    } else {
      yr = new Date().getFullYear();
    }
    const disp = _gid('vs-lot-display');
    if(disp) disp.textContent = num ? ('LPG-'+yr+'-'+ty+'-'+num) : '';
  }

  function autoLot(){
    /* Until Vessel Log is wired (Session 6), just pick "1" as a safe default
       and let the operator override. Once SM_LOG / VL_ROWS exists, scan that. */
    const ty = _gv('vs-type-sel') || 'S';
    let maxN = 0;
    if(typeof VLOG !== 'undefined' && VLOG.ROWS){
      try{
        for(const r of VLOG.ROWS){
          if(!r) continue;
          if((r.type || 'S') !== ty && !(ty === 'S' && !r.type)) continue;
          const m = String(r.lot||'').match(/(\d+)\s*$/);
          if(m){ const n = parseInt(m[1]); if(n > maxN) maxN = n; }
        }
      }catch(_){}
    }
    const inp = _gid('vs-lot-num');
    if(inp) inp.value = String(maxN + 1);
    updateLot();
    toast('Lot = '+(maxN + 1)+' ('+ty+')', 'ok');
  }

  /* ---------- ratio + unit toggles ---------- */
  function toggleRatio(){
    RATIO = (RATIO === 1) ? 2 : 1;
    const btn = _gid('vs-ratio-btn');
    if(btn){
      btn.textContent = (RATIO === 1) ? '1 RATIO' : '2 RATIO';
      btn.classList.toggle('r2', RATIO === 2);
    }
    /* In 1-RATIO mode the two tanks share Target C3 & MIN/MAX. We don't
       enforce a hard sync here yet (will hook into calcPlan() in Session 5);
       just show the visual signal. */
    toast(RATIO === 1
      ? 'Switched to 1-RATIO (both tanks share target C3%)'
      : 'Switched to 2-RATIO (independent targets per tank)', 'ok');
  }

  function onUnitChange(i){
    const sel = _gid('vs-runit-'+i);
    UNIT[String(i)] = sel ? sel.value : 'vol';
    const lblTag = document.querySelector('#vs-tr3-lbl-'+i+' .vsmix-unit-tag');
    if(lblTag) lblTag.textContent = UNIT[String(i)] === 'wt' ? '%WT' : '%VOL';
    /* Recalc plan once calcPlan is real (Session 5) */
    try{ calcPlan(); }catch(_){}
  }

  /* ---------- GC sum visual check ---------- */
  function gcSum(i){
    let sum = 0, hasVal = false;
    document.querySelectorAll('.vs-gc-'+i).forEach(el=>{
      const v = parseFloat(el.value); if(!isNaN(v)){ sum += v; hasVal = true; }
    });
    const el = _gid('vs-gcsum-'+i);
    if(el){
      if(!hasVal){ el.textContent = 'Σ —'; el.className = 'vsmix-gc-sum'; }
      else {
        const fmt = sum.toFixed(2);
        if(Math.abs(sum - 100) < 0.5){
          el.textContent = 'Σ '+fmt+'% ✓'; el.className = 'vsmix-gc-sum s-ok';
        } else if(Math.abs(sum - 100) < 2){
          el.textContent = 'Σ '+fmt+'% ⚠'; el.className = 'vsmix-gc-sum s-warn';
        } else {
          el.textContent = 'Σ '+fmt+'% ≠100'; el.className = 'vsmix-gc-sum s-err';
        }
      }
    }
    /* v4.70 (V406): tint GC input borders + live-recalc the after-loading result */
    const ok = hasVal && Math.abs(sum - 100) <= 0.5;
    document.querySelectorAll('.vs-gc-'+i).forEach(inp=>{
      inp.style.borderColor = !hasVal ? '' : (ok ? '#86efac' : '#fca5a5');
    });
    try{ calcResult(true); }catch(_){}
  }

  /* ---------- v4.70: lock tank inputs while MIXING (V406 smLockTank) ---------- */
  function _lockTank(i, lock){
    const col = document.querySelector('.vsmix-col-'+(i+1));
    if(col){
      col.querySelectorAll('input').forEach(el=>{
        el.readOnly = lock;
        el.style.opacity = lock ? '0.6' : '1';
        el.style.pointerEvents = lock ? 'none' : '';
      });
      col.querySelectorAll('select').forEach(el=>{
        el.disabled = lock;
        el.style.opacity = lock ? '0.6' : '1';
      });
    }
    const card = _gid('vs-card-'+i);
    if(card) card.style.boxShadow = lock ? '0 0 0 3px #22c55e' : '';
  }

  /* ---------- status pill ---------- */
  function _renderStatus(i){
    const el = _gid('vs-status-'+i); if(!el) return;
    const s = STATE[String(i)];
    el.className = 'vsmix-card-status' + (s==='idle' ? '' : ' on');
    if(s === 'mixing'){ el.classList.add('s-mixing'); el.textContent = '🔄 ĐANG TRỘN'; el.style.animation = 'vsmixPulse 1.5s ease-in-out infinite'; return; }
    el.style.animation = 'none';
    if(s === 'calc'){ el.classList.add('s-pending'); el.textContent = '📐 TÍNH TOÁN'; }
    else if(s === 'pending'){ el.classList.add('s-pending'); el.textContent = '● PENDING GC'; }
    else if(s === 'done'){ el.classList.add('s-done'); el.textContent = '● COMPLETED'; }
    else { el.textContent = ''; }
  }
  /* pulse keyframes for the MIXING badge (V406 smPulse) */
  try{
    const _st = document.createElement('style');
    _st.textContent = '@keyframes vsmixPulse{0%,100%{opacity:1}50%{opacity:.5}}';
    document.head.appendChild(_st);
  }catch(_){}

  /* ---------- START / FINISH — V406 state machine (v4.70) ----------
     START: tanks in 'calc' → 'mixing' (inputs locked, badge pulses, state
            persisted to /vessel_mix_state so other engineers see it live).
            Double-click while mixing = revert 'mixing' → 'calc' (unlock).
     FINISH: 'mixing' → 'calc' (unlock), stamp finish time, persist.      */
  let _startLastClick = 0;
  function startMix(){
    const now = Date.now();
    const anyMixing = STATE['0']==='mixing' || STATE['1']==='mixing';
    if(anyMixing && now - _startLastClick < 500){
      /* double-click: revert mixing → calc */
      for(let i=0;i<2;i++){
        if(STATE[String(i)]==='mixing'){ STATE[String(i)]='calc'; _lockTank(i,false); _renderStatus(i); }
      }
      _startLastClick = 0;
      saveMixState();
      toast('↩ Mixing reverted to CALC (unlocked)','warn');
      return;
    }
    _startLastClick = now;
    if(anyMixing) return;   /* single click while mixing: ignore */
    const dt = _gid('vs-date'); if(dt && !dt.value) dt.value = _todayDDMMYY();
    const st = _gid('vs-stime'); if(st && !st.value.trim()) st.value = _nowHHMM();
    let started = 0;
    for(let i=0;i<2;i++){
      const s = STATE[String(i)];
      if(s && s !== 'idle' && s !== 'mixing'){ STATE[String(i)]='mixing'; _lockTank(i,true); _renderStatus(i); started++; }
    }
    updateLot();
    if(started){ saveMixState(); toast('▶ Vessel mix started ('+started+' tank'+(started>1?'s':'')+') — session synced','ok'); }
    else toast('⚠ Nhập QTY/Target trước (tank chưa ở trạng thái TÍNH TOÁN)','er');
  }
  function finishMix(){
    const ft = _gid('vs-ftime'); if(ft && !ft.value.trim()) ft.value = _nowHHMM();
    for(let i=0;i<2;i++){
      if(STATE[String(i)]==='mixing'){ STATE[String(i)]='calc'; _lockTank(i,false); _renderStatus(i); }
    }
    saveMixState();
    toast('⏹ Finish time stamped — fill GC + 🧮 CALCULATE RESULT','ok');
  }

  /* ---------- v4.70: NOW button (V406 smNow) ---------- */
  function now(id){
    const el = _gid(id); if(!el) return;
    el.value = _nowHHMM();
    toast('⏱ '+el.value,'ok');
  }

  /* ---------- v4.70: Firebase mixing-state persistence (V406 sm_mixing_state) ---------- */
  const MIX_STATE_PATH = 'vessel_mix_state';
  const PLAN_IDS  = ['qty','tr3','odor','min','max','tole'];
  const AFTER_IDS = ['ilw','ivw','tload','lvol','labdens'];
  let _mixSaveT = null;
  function saveMixState(){
    clearTimeout(_mixSaveT);
    _mixSaveT = setTimeout(_doSaveMixState, 500);
  }
  function _doSaveMixState(){
    if(typeof firebase === 'undefined' || !firebase.database) return;
    const data = {
      ts: Date.now(),
      ship:  _gv('vs-ship-sel'), type: _gv('vs-type-sel') || 'S',
      lotNum:_gv('vs-lot-num'),  cust: _gv('vs-cust'),
      date:  _gv('vs-date'),     stime:_gv('vs-stime'), ftime:_gv('vs-ftime'),
      c3fq:  _gv('vs-c3fq'),     c4fq: _gv('vs-c4fq'),
      states:[STATE['0']==='idle'?null:STATE['0'], STATE['1']==='idle'?null:STATE['1']],
      ratio: RATIO,
      tanks: []
    };
    for(let i=0;i<2;i++){
      const tk = { runit: (_gid('vs-runit-'+i)||{}).value || 'vol' };
      PLAN_IDS.forEach(k => { tk['p_'+k] = _gv('vs-'+k+'-'+i); });
      AFTER_IDS.forEach(k => { tk['a_'+k] = _gv('vs-'+k+'-'+i); });
      GC_KEYS.forEach(k => { tk['gc_'+k] = _gv('vs-gc-'+k+'-'+i); });
      data.tanks.push(tk);
    }
    try{
      firebase.database().ref(MIX_STATE_PATH).set(data).catch(e=>console.warn('[VMIX] saveMixState', e));
    }catch(_){}
  }
  function restoreMixState(){
    if(typeof firebase === 'undefined' || !firebase.database) return;
    firebase.database().ref(MIX_STATE_PATH).once('value', snap=>{
      const d = snap.val();
      if(!d || !d.tanks) return;
      /* only restore active sessions < 24h old */
      if(d.ts && Date.now() - d.ts > 86400000) return;

      /* header */
      const sel = _gid('vs-ship-sel');
      if(sel && d.ship){ sel.value = d.ship; onShipChange(); }
      const ids = { type:'vs-type-sel', lotNum:'vs-lot-num', cust:'vs-cust', date:'vs-date',
                    stime:'vs-stime', ftime:'vs-ftime', c3fq:'vs-c3fq', c4fq:'vs-c4fq' };
      Object.keys(ids).forEach(k=>{ const el=_gid(ids[k]); if(el && d[k]) el.value = d[k]; });

      /* per-tank */
      for(let i=0;i<2;i++){
        const tk = d.tanks[i]; if(!tk) continue;
        const ru = _gid('vs-runit-'+i); if(ru && tk.runit){ ru.value = tk.runit; UNIT[String(i)] = tk.runit; }
        PLAN_IDS.forEach(k=>{ const el=_gid('vs-'+k+'-'+i); if(el && tk['p_'+k]) el.value = tk['p_'+k]; });
        AFTER_IDS.forEach(k=>{ const el=_gid('vs-'+k+'-'+i); if(el && tk['a_'+k]) el.value = tk['a_'+k]; });
        GC_KEYS.forEach(k=>{ const el=_gid('vs-gc-'+k+'-'+i); if(el && tk['gc_'+k]) el.value = tk['gc_'+k]; });
        gcSum(i);
      }

      /* ratio */
      if(d.ratio){
        RATIO = d.ratio;
        const btn = _gid('vs-ratio-btn');
        if(btn){ btn.textContent = RATIO+' RATIO'; btn.classList.toggle('r2', RATIO === 2); }
      }

      /* keep as 'calc' first so calcPlan renders, then apply real state + lock */
      const saved = [null, null];
      if(d.states){
        for(let j=0;j<2;j++){
          saved[j] = d.states[j] || null;
          STATE[String(j)] = saved[j] ? 'calc' : 'idle';
          _renderStatus(j);
        }
      }
      try{ calcPlan(); }catch(_){}
      updateLot();
      if(d.states){
        for(let j=0;j<2;j++){
          STATE[String(j)] = saved[j] || 'idle';
          _renderStatus(j);
          if(STATE[String(j)]==='mixing') _lockTank(j,true);
        }
      }
      toast('📋 Mix session restored','ok');
    });
  }

  /* ---------- reset ---------- */
  function reset(){
    if(!confirm('Reset entire Vessel Mix Cal?')) return;
    /* Plan + after-loading inputs */
    [0,1].forEach(i=>{
      ['qty','tr3','min','max','odor','tole','ilw','ivw','tload','lvol','labdens'].forEach(k=>{
        const el = _gid('vs-'+k+'-'+i); if(el){
          /* preserve sticky defaults */
          if(k === 'odor') el.value = '10';
          else if(k === 'tole') el.value = '5';
          else el.value = '';
        }
      });
      GC_KEYS.forEach(g=>{ const el = _gid('vs-gc-'+g+'-'+i); if(el) el.value = ''; });
      VCQ.forEach(f=>{ const el = _gid('vs-cq-'+f.k+'-'+i); if(el) el.value = ''; });
      const sel = _gid('vs-runit-'+i); if(sel){ sel.value = 'vol'; UNIT[String(i)] = 'vol'; }
      const lblTag = document.querySelector('#vs-tr3-lbl-'+i+' .vsmix-unit-tag');
      if(lblTag) lblTag.textContent = '%VOL';
      gcSum(i);
      const pres = _gid('vs-plan-res-'+i); if(pres){ pres.classList.remove('on'); pres.innerHTML = ''; }
      const ares = _gid('vs-after-res-'+i); if(ares){ ares.classList.remove('on'); ares.innerHTML = ''; }
      const gr   = _gid('vs-grand-'+i); if(gr){ gr.classList.remove('on'); gr.innerHTML = ''; }
      STATE[String(i)] = 'idle'; _renderStatus(i);
      _lockTank(i, false);                       /* v4.70: unlock */
    });
    ['vs-cust','vs-lot-num','vs-date','vs-stime','vs-ftime','vs-c3fq','vs-c4fq'].forEach(id=>{
      const el = _gid(id); if(el) el.value = '';
    });
    /* v4.70: clear the shared mixing session */
    try{
      if(typeof firebase !== 'undefined' && firebase.database)
        firebase.database().ref(MIX_STATE_PATH).set(null).catch(()=>{});
    }catch(_){}
    updateLot();
    toast('🔄 Vessel Mix reset','ok');
  }

  /* ---------- v4.70: collapse/expand AFTER LOADING boxes (V406 smToggleAfter) ---------- */
  function toggleAfter(){
    const boxes = document.querySelectorAll('.vsmix-after');
    const btn = _gid('vs-btn-after');
    if(!boxes.length) return;
    const vis = boxes[0].style.display !== 'none';
    boxes.forEach(b=>{ b.style.display = vis ? 'none' : ''; });
    if(btn) btn.textContent = vis ? '🧪 AFTER ▼' : '🧪 AFTER ▲';
  }

  /* ---------- v4.70: customer autocomplete (V406 smCustSearch/Pick) ---------- */
  function custSearch(){
    const inp = _gid('vs-cust');
    let dd = _gid('vsmix-cust-dd');
    if(!dd){
      dd = document.createElement('div');
      dd.id = 'vsmix-cust-dd';
      dd.style.cssText = 'display:none;position:fixed;z-index:99999;background:#fff;border:1.5px solid var(--blue);'
        +'border-radius:6px;max-height:200px;overflow-y:auto;width:240px;box-shadow:0 6px 20px rgba(0,0,0,.2)';
      document.body.appendChild(dd);
    }
    if(!inp) return;
    const rc = inp.getBoundingClientRect();
    dd.style.left = rc.left+'px'; dd.style.top = (rc.bottom+2)+'px';
    const q = (inp.value||'').toLowerCase().trim();
    /* unique short-name list from Customer table (CT), fallback PLAN_DATA.cust */
    const seen = {}, items = [];
    try{
      if(typeof CT !== 'undefined' && CT.ROWS){
        Object.values(CT.ROWS).forEach(c=>{
          const s = (c && c.short || '').trim();
          if(s && !seen[s.toLowerCase()]){ seen[s.toLowerCase()] = 1; items.push(s); }
        });
      }
    }catch(_){}
    try{
      if(!items.length && typeof PLAN_DATA !== 'undefined' && PLAN_DATA.cust){
        PLAN_DATA.cust.forEach(c=>{
          const s = (c.short||'').trim();
          if(s && !seen[s.toLowerCase()]){ seen[s.toLowerCase()] = 1; items.push(s); }
        });
      }
    }catch(_){}
    const filtered = q ? items.filter(s=>s.toLowerCase().includes(q)) : items;
    if(!filtered.length){ dd.style.display = 'none'; return; }
    dd.style.display = '';
    dd.innerHTML = filtered.map(s=>
      '<div style="padding:5px 10px;cursor:pointer;font-size:11px;border-bottom:1px solid #f0f0f0" '
      +'onmousedown="event.preventDefault();VMIX.custPick(\''+s.replace(/'/g,"\\'")+'\')">'+_esc(s)+'</div>'
    ).join('');
  }
  function custPick(name){
    const inp = _gid('vs-cust'); if(inp) inp.value = name;
    const dd = _gid('vsmix-cust-dd'); if(dd) dd.style.display = 'none';
  }
  /* hide dropdown when clicking elsewhere */
  document.addEventListener('click', e=>{
    const dd = _gid('vsmix-cust-dd');
    if(dd && e.target !== _gid('vs-cust') && !dd.contains(e.target)) dd.style.display = 'none';
  });

  /* ---------- v4.70: Enter-key nav between plan inputs (V406 data-sm-next) ---------- */
  document.addEventListener('keydown', e=>{
    if(e.key !== 'Enter') return;
    const t = e.target; if(!t || !t.getAttribute) return;
    const nxt = t.getAttribute('data-vs-next');
    if(!nxt) return;
    e.preventDefault();
    const el = _gid(nxt);
    if(el){ el.focus(); if(el.select) el.select(); }
  });

  /* ---------- helpers used by the calc pipeline ---------- */
  function _fmtNum(v, d){
    if(v == null || isNaN(v)) return '—';
    return Number(v).toLocaleString('en-US', { maximumFractionDigits: (d != null ? d : 3) });
  }
  function _esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
                        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  /* Strict number-or-null: returns null for blank / non-numeric input so the
     downstream calc can branch on "missing" vs "0". (V406 _smV pattern.) */
  function _val(id){
    const el = _gid(id); if(!el) return null;
    const s = String(el.value||'').trim();
    if(!s) return null;
    const n = parseFloat(s.replace(/,/g,''));
    return isNaN(n) ? null : n;
  }

  /* per-tank cached after-loading result; used by the grand-total card and
     (in Session 6) by saveLog as the source of truth for what goes to
     /vessel_mix_log. Re-built fresh on every calcResult() call. */
  let _afterResult = [null, null];

  /* ---------- STEP 1: planning calc (V406 smCalcPlan port) ----------
     For each tank i ∈ {0,1}:
       inputs : qty (ton), target r3 (% C3, vol or wt), tolerance %, ODO ppm
       outputs: %vol C3/C4, %wt C3/C4, est. density, mix-target C3 & C4 (ton),
                odorant (kg), tolerance band [qMin..qMax] (ton).
     Pure RAM: no Firebase writes, no DOM listeners. Auto-recomputes whenever
     QTY / TARGET / ODO / TOL changes (already wired via oninput).      */
  function calcPlan(){
    updateLot();
    const DL3 = DENS.c3l, DL4 = DENS.c4l;

    for(let i = 0; i < 2; i++){
      const card = _gid('vs-plan-res-'+i);
      if(!card) continue;
      if(STATE[String(i)] === 'mixing') continue;   // don't redraw during a live mix

      const qty     = _val('vs-qty-'+i);
      const r3      = _val('vs-tr3-'+i);
      const unit    = (_gid('vs-runit-'+i)||{}).value || 'vol';
      const tole    = _val('vs-tole-'+i) || 0;
      const odorPpm = _val('vs-odor-'+i);

      /* drive state pill: any plan input present → 'calc'; both blank → 'idle' */
      if(r3 != null || qty != null){
        if(STATE[String(i)] !== 'mixing'){
          const wasIdle = (STATE[String(i)] === 'idle');
          STATE[String(i)] = 'calc';
          if(wasIdle){
            const lotInp = _gid('vs-lot-num');
            if(lotInp && !lotInp.value.trim()){ try{ autoLot(); }catch(_){} }
          }
        }
      } else {
        STATE[String(i)] = 'idle';
      }
      _renderStatus(i);

      if(r3 == null){ card.classList.remove('on'); card.innerHTML = ''; continue; }

      const r4 = 100 - r3;
      let ptv3, ptv4, ptw3, ptw4;
      if(unit === 'vol'){
        ptv3 = r3; ptv4 = r4;
        const m3 = r3 * DL3, m4 = r4 * DL4;
        ptw3 = (m3 / (m3 + m4)) * 100;
        ptw4 = (m4 / (m3 + m4)) * 100;
      } else {
        ptw3 = r3; ptw4 = r4;
        const v3 = r3 / DL3, v4 = r4 / DL4;
        ptv3 = (v3 / (v3 + v4)) * 100;
        ptv4 = (v4 / (v3 + v4)) * 100;
      }

      const edens   = Math.round(((ptv3/100)*(PROPS.c3_vr/100)*PROPS.c3_den
                                + (ptv4/100)*((PROPS.nc4_vr/100)*PROPS.nc4_den
                                + (PROPS.ic4_vr/100)*PROPS.ic4_den)) * 1000);
      const mixtgt3 = qty != null ? qty * (ptw3 / 100) : null;
      const mixtgt4 = qty != null ? qty * (ptw4 / 100) : null;
      const odorkg  = (qty != null && odorPpm != null) ? (qty * odorPpm) / 1000 : null;
      const qMin    = qty != null ? qty * (1 - tole/100) : null;
      const qMax    = qty != null ? qty * (1 + tole/100) : null;

      const blue   = (i === 0) ? 'var(--blue)' : 'var(--orange)';
      const orange = (i === 0) ? 'var(--orange)' : 'var(--blue)';
      /* Header line — labels share the same Oswald 11px treatment */
      let h = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">'
        +'<span style="font-family:Oswald;font-size:11px;letter-spacing:1.5px;color:var(--ink-3);font-weight:600">MIX TARGET</span>'
        +'<span style="font-family:Oswald;font-size:11px;font-weight:700;color:#334155">%Vol C3: <span style="color:'+blue+'">'+_fmtNum(ptv3,2)+'</span></span>'
        +'<span style="font-family:Oswald;font-size:11px;font-weight:700;color:#334155">%Wt C3: <span style="color:'+orange+'">'+_fmtNum(ptw3,2)+'</span></span>'
        +'<span style="font-family:Oswald;font-size:11px;font-weight:700;color:var(--green)">Odorant: <span style="font-size:20px">'+(odorkg!=null?_fmtNum(odorkg,2)+' kg':'—')+'</span></span>'
        +'<span style="font-family:Oswald;font-size:11px;font-weight:700;color:#92400e">Est.Density: <span style="font-size:20px">'+edens+'</span> kg/m³</span>'
      +'</div>';

      if(qty != null){
        h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">'
          +'<div style="text-align:center;padding:8px 4px;background:linear-gradient(135deg,#ffedd5,#fed7aa);border:2px solid #f97316;border-radius:6px">'
            +'<div style="font-size:9px;color:#c2410c;font-weight:600">C4 BUTANE</div>'
            +'<div style="font-family:Oswald;font-size:24px;font-weight:800;color:#ea580c">'+_fmtNum(mixtgt4,3)+'</div>'
            +'<div style="font-size:9px;color:#f97316">ton</div>'
          +'</div>'
          +'<div style="text-align:center;padding:8px 4px;background:linear-gradient(135deg,#dbeafe,#bfdbfe);border:2px solid #3b82f6;border-radius:6px">'
            +'<div style="font-size:9px;color:#1e40af;font-weight:600">C3 PROPANE</div>'
            +'<div style="font-family:Oswald;font-size:24px;font-weight:800;color:#1d4ed8">'+_fmtNum(mixtgt3,3)+'</div>'
            +'<div style="font-size:9px;color:#3b82f6">ton</div>'
          +'</div>'
        +'</div>';
        if(tole > 0){
          h += '<div style="text-align:center;font-size:9px;color:var(--ink-3);margin-top:3px">'
            +'Range: <b>'+_fmtNum(qMin,1)+'</b> — <b>'+_fmtNum(qty,1)+'</b> — <b>'+_fmtNum(qMax,1)+'</b> ton (±'+tole+'%)'
          +'</div>';
        }
      }

      card.innerHTML = h;
      card.classList.add('on');
    }
  }

  /* ---------- STEP 2: after-loading calc (V406 smCalcResult port) ----------
     Per tank i ∈ {0,1}:
       inputs : Liq Vol m³, Total Loaded, Init Liq/Vap Wt, GC %vol
                + ship.tk{i+1}_m3 from SHIPS list.
       formula:
         GC light & heavy → liquid volume ratios lvr3/lvr4 (C3 / (C3+C4))
         Liquid vol per component  : lv3 = lvol·lvr3, lv4 = lvol·lvr4
         Vapor  space               : vtot = maxV − lvol
         Vapor  vol per component  : vv3 = vtot·lvr3, vv4 = vtot·lvr4
         Liquid wt per component  : lw3 = lv3·DL3, lw4 = lv4·DL4 (ton)
         Vapor  wt per component  : vw3 = vv3·DV3, vw4 = vv4·DV4 (ton)
         Total  wt                 : tw3 = lw3+vw3, tw4 = lw4+vw4
         Total LPG wt              : twt = tw3 + tw4
         Wt ratio in tank          : wr3 = tw3/twt, wr4 = tw4/twt
         Filled qty                : fqty = twt − initVapWt
         Loaded split              : ld3 = tload·round(wr3,2), ld4 = tload − ld3
     Outputs are written into #vs-after-res-{i} (collapsible RESULT row +
     hidden detail table) and #vs-grand-{i} (per-tank grand-total card).
     The intermediate _smCalcData[i] equivalent is cached in module-private
     _afterResult[i] for Session 6's saveLog to consume.                  */
  function calcResult(silent){
    const DL3 = DENS.c3l, DL4 = DENS.c4l;
    const DV3 = DENS.c3v, DV4 = DENS.c4v;
    const ship = SEL_SHIP ? SHIPS.find(s => s.name === SEL_SHIP) : null;
    let hasResult = false;
    _afterResult = [null, null];

    for(let i = 0; i < 2; i++){
      const container = _gid('vs-after-res-'+i);
      if(!container) continue;

      const maxV  = ship ? (i === 0 ? ship.tk1_m3 : ship.tk2_m3) : 0;
      const lvol  = _val('vs-lvol-'+i);
      const tload = _val('vs-tload-'+i);
      const ivw   = _val('vs-ivw-'+i);

      const prop  = _val('vs-gc-prop-'+i) || 0;
      const buts  = (_val('vs-gc-ibut-'+i) || 0) + (_val('vs-gc-nbut-'+i) || 0);
      const s34   = prop + buts;
      const lvr3  = s34 > 0 ? prop / s34 : null;
      const lvr4  = s34 > 0 ? buts / s34 : null;

      if(lvol != null && lvr3 != null && maxV > 0){
        hasResult = true;
        const lv3  = lvol * lvr3, lv4  = lvol * lvr4;
        const vtot = maxV - lvol;
        const vv3  = vtot * lvr3, vv4  = vtot * lvr4;
        const lw3  = lv3 * DL3,  lw4  = lv4 * DL4;
        const vw3  = vv3 * DV3,  vw4  = vv4 * DV4;
        const tw3  = lw3 + vw3,  tw4  = lw4 + vw4;
        const twt  = tw3 + tw4;
        const wr3  = twt > 0 ? tw3 / twt : 0;
        const wr4  = twt > 0 ? tw4 / twt : 0;
        const fqty = twt - (ivw || 0);
        const r3r2 = Math.round(wr3 * 100) / 100;
        const ld3  = tload != null ? parseFloat((tload * r3r2).toFixed(3)) : null;
        const ld4  = tload != null ? parseFloat((tload - ld3).toFixed(3)) : null;

        _afterResult[i] = { tw3, tw4, twt, wr3, wr4, ld3, ld4, fqty,
                            lv3, lv4, lvol, vtot, lw3, lw4, vw3, vw4, tload };

        const tkColor = i === 0 ? 'var(--blue)' : 'var(--orange)';
        const tkBg    = i === 0 ? 'var(--blue-soft)' : 'var(--orange-soft)';
        const tkBd    = i === 0 ? '#b3ddf5' : '#ffd4a8';

        /* Collapsible summary row + hidden detail table */
        let h = '<div style="border:1.5px solid '+tkBd+';border-radius:6px;overflow:hidden">'
          +'<div onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'none\'?\'\':\'none\'" '
          +'style="cursor:pointer;padding:4px 8px;background:'+tkBg+';display:flex;justify-content:space-between;align-items:center">'
            +'<span style="font-size:10px;font-weight:700;color:'+tkColor+'">RESULT ▾</span>'
            +'<span style="font-size:10px;font-family:monospace">'
              +'<span style="color:var(--blue)">C3:'+_fmtNum(tw3,3)+'</span> '
              +'<span style="color:var(--orange)">C4:'+_fmtNum(tw4,3)+'</span> '
              +'<span style="font-weight:800;color:#2d8a4e">LPG:'+_fmtNum(twt,3)+'</span>'
              +(tload != null ? ' | <span style="font-weight:800">Loaded:'+_fmtNum(tload,3)+'</span>' : '')
            +'</span>'
          +'</div>'
          +'<div style="display:none;padding:4px">'
            +'<table style="width:100%;border-collapse:collapse;font-size:9px">'
              +'<tr style="background:#f0f4f8">'
                +'<th style="padding:1px 3px;text-align:left">Param</th>'
                +'<th style="padding:1px 3px;text-align:right;color:var(--blue)">C3</th>'
                +'<th style="padding:1px 3px;text-align:right;color:var(--orange)">C4</th>'
                +'<th style="padding:1px 3px;text-align:right;color:#2d8a4e">LPG</th>'
              +'</tr>';
        const R = (lbl, c3v, c4v, tv) =>
          '<tr><td style="padding:1px 3px;border-bottom:1px solid #f0f0f0">'+_esc(lbl)+'</td>'
          +'<td style="padding:1px 3px;text-align:right;font-family:monospace;border-bottom:1px solid #f0f0f0">'+_fmtNum(c3v,3)+'</td>'
          +'<td style="padding:1px 3px;text-align:right;font-family:monospace;border-bottom:1px solid #f0f0f0">'+_fmtNum(c4v,3)+'</td>'
          +'<td style="padding:1px 3px;text-align:right;font-family:monospace;border-bottom:1px solid #f0f0f0">'+_fmtNum(tv,3)+'</td></tr>';
        h += R('Liq Vol (m³)',  lv3, lv4, lvol);
        h += R('Liq Ratio (%)', lvr3*100, lvr4*100, 100);
        h += R('Vap Vol (m³)',  vv3, vv4, vtot);
        h += R('Liq Wt (ton)',  lw3, lw4, lw3+lw4);
        h += R('Vap Wt (ton)',  vw3, vw4, vw3+vw4);
        h += '<tr style="background:#dcfce7;font-weight:700">'
          +'<td style="padding:1px 3px">Total Wt</td>'
          +'<td style="padding:1px 3px;text-align:right;font-family:monospace">'+_fmtNum(tw3,3)+'</td>'
          +'<td style="padding:1px 3px;text-align:right;font-family:monospace">'+_fmtNum(tw4,3)+'</td>'
          +'<td style="padding:1px 3px;text-align:right;font-family:monospace">'+_fmtNum(twt,3)+'</td></tr>';
        h += R('Wt Ratio (%)', wr3*100, wr4*100, 100);
        h += '<tr style="background:#fef9c3;font-weight:700">'
          +'<td style="padding:1px 3px">Filled Qty</td>'
          +'<td colspan="3" style="padding:1px 3px;text-align:right;font-family:monospace">'+_fmtNum(fqty,3)+'</td></tr>';
        if(tload != null){
          h += '<tr style="background:#fff5eb;font-weight:700">'
            +'<td style="padding:1px 3px">Loaded</td>'
            +'<td style="padding:1px 3px;text-align:right;font-family:monospace;color:var(--blue)">'+_fmtNum(ld3,3)+'</td>'
            +'<td style="padding:1px 3px;text-align:right;font-family:monospace;color:var(--orange)">'+_fmtNum(ld4,3)+'</td>'
            +'<td style="padding:1px 3px;text-align:right;font-family:monospace;font-weight:800">'+_fmtNum(tload,3)+'</td></tr>';
        }
        h += '</table></div></div>';
        container.innerHTML = h;
        container.classList.add('on');

        /* Promote tank state to 'done' once GC + lvol + tload are all in */
        if(tload != null && STATE[String(i)] !== 'mixing'){
          STATE[String(i)] = 'done';
          _renderStatus(i);
        } else if(STATE[String(i)] === 'idle'){
          STATE[String(i)] = 'pending';
          _renderStatus(i);
        }
      } else {
        container.innerHTML = '';
        container.classList.remove('on');
      }
    }

    /* Per-tank grand-total card (yellow) — only shows when tload + result are present */
    for(let g = 0; g < 2; g++){
      const gd = _gid('vs-grand-'+g); if(!gd) continue;
      const cd = _afterResult[g];
      const tload_g = _val('vs-tload-'+g);
      if(cd && tload_g != null){
        let gh = '<div style="font-family:Oswald;font-size:12px;letter-spacing:1.5px;color:#92400e;margin-bottom:4px">🏆 TANK '+(g+1)+' TOTAL</div>'
          +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;text-align:center">'
            +'<div><div style="font-size:9px;color:var(--ink-3)">C4</div>'
              +'<div style="font-family:monospace;font-size:20px;font-weight:800;color:var(--orange)">'+_fmtNum(cd.ld4,3)+'</div></div>'
            +'<div><div style="font-size:9px;color:var(--ink-3)">C3</div>'
              +'<div style="font-family:monospace;font-size:20px;font-weight:800;color:var(--blue)">'+_fmtNum(cd.ld3,3)+'</div></div>'
            +'<div><div style="font-size:9px;color:var(--ink-3)">LPG</div>'
              +'<div style="font-family:monospace;font-size:20px;font-weight:800;color:#2d8a4e">'+_fmtNum(tload_g,3)+'</div></div>'
          +'</div>';
        gd.innerHTML = gh;
        gd.classList.add('on');
      } else {
        gd.classList.remove('on');
        gd.innerHTML = '';
      }
    }

    /* Diagnostics when no tank produced a result — matches V406's UX cue */
    if(silent === true) return;
    if(!hasResult){
      const diag = [];
      if(!ship) diag.push('Vessel not selected');
      for(let d = 0; d < 2; d++){
        const dMaxV = ship ? (d===0 ? ship.tk1_m3 : ship.tk2_m3) : 0;
        const dLvol = _val('vs-lvol-'+d);
        const dProp = _val('vs-gc-prop-'+d) || 0;
        const dIbut = (_val('vs-gc-ibut-'+d)||0) + (_val('vs-gc-nbut-'+d)||0);
        const ds34  = dProp + dIbut;
        if(dLvol == null && ds34 <= 0) continue;  // skip empty tank
        if(dLvol == null) diag.push('TK'+(d+1)+': missing Liq Vol m³');
        if(ds34 <= 0)     diag.push('TK'+(d+1)+': missing GC C3/C4');
        if(dMaxV <= 0)    diag.push('TK'+(d+1)+': maxVol=0 (pick a vessel)');
      }
      if(diag.length) toast('⚠ '+diag.join('; '), 'er');
      else toast('Fill QTY/GC/LiqVol then press 🧮 again','warn');
    } else {
      toast('🧮 Vessel mix result computed','ok');
    }
  }

  /* ---------- saveLog: build entry → push to /vessel_mix_log -----
     Reads the same DOM the calc reads, but uses _afterResult[i] (cached
     by calcResult()) as the source of truth for tw3/tw4/twt/wr3/ld3/ld4
     so we don't redo math here. If the operator skipped CALCULATE
     RESULT, we fall back to a defensive recompute via calcResult().
     Writes one or two child entries to /vessel_mix_log/{rid}:
       • RATIO=1 + both tanks have data → ONE merged row tank='02 TANK'
       • RATIO=2 (or single-tank) → ONE row per active tank, tank='1'|'2'
     ----------------------------------------------------------------- */
  function _calcVolWt(tr3, unit){
    if(tr3 == null) return { volC3:null, volC4:null, wtC3:null, wtC4:null };
    const DL3 = DENS.c3l, DL4 = DENS.c4l;
    let ptv3, ptv4, ptw3, ptw4;
    if(unit === 'vol'){
      ptv3 = tr3; ptv4 = 100 - tr3;
      const m3 = tr3 * DL3, m4 = (100 - tr3) * DL4;
      ptw3 = (m3 / (m3 + m4)) * 100;
      ptw4 = (m4 / (m3 + m4)) * 100;
    } else {
      ptw3 = tr3; ptw4 = 100 - tr3;
      const v3 = tr3 / DL3, v4 = (100 - tr3) / DL4;
      ptv3 = (v3 / (v3 + v4)) * 100;
      ptv4 = (v4 / (v3 + v4)) * 100;
    }
    return {
      volC3: Math.round(ptv3 * 100) / 100,
      volC4: Math.round(ptv4 * 100) / 100,
      wtC3 : Math.round(ptw3 * 100) / 100,
      wtC4 : Math.round(ptw4 * 100) / 100
    };
  }
  function _qualCheck(tkData){
    if(!tkData || tkData.wr3 == null) return '';
    const pctC3 = tkData.wr3 * 100;
    const min3 = tkData.min, max3 = tkData.max;
    if(min3 == null || max3 == null) return '';
    const DL3 = DENS.c3l, DL4 = DENS.c4l;
    let lo, hi;
    if((tkData.unit || 'vol') === 'vol'){
      const mLo = min3 * DL3, mLoR = mLo / (mLo + (100 - min3) * DL4) * 100;
      const mHi = max3 * DL3, mHiR = mHi / (mHi + (100 - max3) * DL4) * 100;
      lo = mLoR; hi = mHiR;
    } else {
      lo = min3; hi = max3;
    }
    return (pctC3 >= lo - 0.5 && pctC3 <= hi + 0.5) ? 'Pass' : 'Fail';
  }

  function _collectTank(i){
    const t = {
      qty:    _val('vs-qty-'+i),
      tole:   _val('vs-tole-'+i),
      odor:   _val('vs-odor-'+i),
      tr3:    _val('vs-tr3-'+i),
      unit:   (_gid('vs-runit-'+i)||{}).value || 'vol',
      min:    _val('vs-min-'+i),
      max:    _val('vs-max-'+i),
      ilw:    _val('vs-ilw-'+i),
      ivw:    _val('vs-ivw-'+i),
      tload:  _val('vs-tload-'+i),
      lvol:   _val('vs-lvol-'+i),
      labdens:_val('vs-labdens-'+i)
    };
    GC_KEYS.forEach(k => { t[k] = _val('vs-gc-'+k+'-'+i); });
    /* v4.72 — chỉ tiêu COQ bổ sung (numeric hoặc text) → lưu vào entry.t[tank] */
    VCQ.forEach(f=>{
      const el = _gid('vs-cq-'+f.k+'-'+i);
      if(!el) return;
      if(VCQ_TXT.includes(f.k)){
        const s = String(el.value||'').trim(); if(s) t[f.k] = s;
      } else {
        const v = _val('vs-cq-'+f.k+'-'+i); if(v != null) t[f.k] = v;
      }
    });
    /* Merge cached after-result intermediates (tw3/tw4/wr3/ld3/ld4/fqty) */
    const cd = _afterResult[i];
    if(cd){
      t.lw3 = cd.lw3; t.lw4 = cd.lw4;
      t.vw3 = cd.vw3; t.vw4 = cd.vw4;
      t.tw3 = cd.tw3; t.tw4 = cd.tw4;
      t.wr3 = cd.wr3; t.wr4 = cd.wr4;
      t.fqty = cd.fqty;
      t.stC3 = cd.ld3; t.stC4 = cd.ld4;
    }
    return t;
  }

  function saveLog(){
    const lotDisp = (_gid('vs-lot-display')||{}).textContent || '';
    if(!lotDisp){ toast('⚠ Enter Lot number first','er'); return; }

    /* If user hasn't pressed CALCULATE RESULT for this session, run it
       once so _afterResult is populated. Silent — no toast spam. */
    let needsRecalc = false;
    for(let i = 0; i < 2; i++){
      const hasInputs = (_val('vs-tload-'+i) != null) || (_val('vs-lvol-'+i) != null);
      if(hasInputs && !_afterResult[i]){ needsRecalc = true; break; }
    }
    if(needsRecalc){ try{ calcResult(); }catch(_){} }

    /* GC sum sanity check (warn-but-allow per V406 UX) */
    for(let i = 0; i < 2; i++){
      let sum = 0;
      document.querySelectorAll('.vs-gc-'+i).forEach(el=>{
        const v = parseFloat(el.value); if(!isNaN(v)) sum += v;
      });
      if(sum > 0 && Math.abs(sum - 100) > 0.001){
        if(!confirm('⚠ GC Sum Tank '+(i+1)+' = '+sum.toFixed(2)+'% (≠100%).\n\nContinue saving?')) return;
      }
    }

    /* Critical field check — Customer, Date, and at least one tank's Total Loaded */
    const empties = [];
    if(!_gv('vs-cust')) empties.push('Customer');
    if(!_gv('vs-date')) empties.push('Date');
    for(let i = 0; i < 2; i++){
      if(_val('vs-qty-'+i) == null && _val('vs-tload-'+i) == null) continue;
      if(_val('vs-tload-'+i) == null) empties.push('Tank '+(i+1)+' Total Loaded');
    }
    if(empties.length){
      if(!confirm('⚠ Missing fields:\n  • '+empties.join('\n  • ')+'\n\nContinue saving?')) return;
    }

    const commonInfo = {
      lot:      lotDisp,
      type:     _gv('vs-type-sel') || 'S',
      ship:     SEL_SHIP || '',
      customer: _gv('vs-cust') || '',
      date:     _gv('vs-date') || '',
      tStart:   _gv('vs-stime') || '',
      tEnd:     _gv('vs-ftime') || '',
      c3fq:     _val('vs-c3fq'),
      c4fq:     _val('vs-c4fq'),
      ratio:    RATIO
    };

    const tanks       = [_collectTank(0), _collectTank(1)];
    const isOneRatio  = (RATIO === 1);
    const tk0hasData  = (tanks[0].qty != null) || (tanks[0].tload != null);
    const tk1hasData  = (tanks[1].qty != null) || (tanks[1].tload != null);

    /* Cross-check RATIO vs actual Target C3% (V406 sanity dialog) */
    if(tk0hasData && tk1hasData){
      const t30 = tanks[0].tr3, t31 = tanks[1].tr3;
      if(t30 != null && t31 != null){
        const same = Math.abs(t30 - t31) < 0.01;
        if(isOneRatio && !same){
          if(!confirm('⚠ 1-RATIO selected but Target C3% differ:\n\n'
                     +'Tank 1: '+t30+'%\nTank 2: '+t31+'%\n\nShould be 2-RATIO?\n\n'
                     +'OK = save as 1-ratio, Cancel = abort and fix.')) return;
        }
        if(!isOneRatio && same){
          if(!confirm('⚠ 2-RATIO selected but Target C3% are identical:\n\n'
                     +'Tank 1: '+t30+'%\nTank 2: '+t31+'%\n\nShould be 1-RATIO?\n\n'
                     +'OK = save as 2-ratio, Cancel = abort and fix.')) return;
        }
      }
    }

    const written = [];

    if(isOneRatio && tk0hasData && tk1hasData){
      /* 1-RATIO merged row: aggregate both tanks into one entry */
      const gTw3   = (tanks[0].tw3 || 0) + (tanks[1].tw3 || 0);
      const gTw4   = (tanks[0].tw4 || 0) + (tanks[1].tw4 || 0);
      const gTwt   = gTw3 + gTw4;
      const gTload = (tanks[0].tload || 0) + (tanks[1].tload || 0);
      const gR     = gTwt > 0 ? gTw3 / gTwt : 0;
      const gR2    = Math.round(gR * 100) / 100;
      const vw     = _calcVolWt(tanks[0].tr3, tanks[0].unit || 'vol');
      const entry  = Object.assign({}, commonInfo, {
        tank: '02 TANK',
        t: [tanks[0], tanks[1]],
        cTotal:    gTload,
        cFilled:   (tanks[0].fqty || 0) + (tanks[1].fqty || 0),
        stC3:      parseFloat((gR2 * gTload).toFixed(3)),
        stC4:      parseFloat((gTload - gR2 * gTload).toFixed(3)),
        wr3:       gR,
        targetC3:  tanks[0].tr3,
        targetUnit:tanks[0].unit || 'vol',
        minC3:     tanks[0].min,
        maxC3:     tanks[0].max,
        volC3:     vw.volC3, volC4: vw.volC4,
        wtC3:      vw.wtC3,  wtC4:  vw.wtC4,
        lpgMixQty: gTload,
        lpgWt:     gTload,
        odoTk1:    (tanks[0].qty != null && tanks[0].odor != null) ? (tanks[0].qty * tanks[0].odor / 1000) : null,
        odoTk2:    (tanks[1].qty != null && tanks[1].odor != null) ? (tanks[1].qty * tanks[1].odor / 1000) : null,
        qty:       (tanks[0].qty || 0) + (tanks[1].qty || 0),
        quality:   _qualCheck({ wr3:gR, min:tanks[0].min, max:tanks[0].max, tr3:tanks[0].tr3, unit:tanks[0].unit || 'vol' }),
        remark:    ''
      });
      VLOG.pushEntry(entry);
      written.push('1 merged row');
    } else {
      /* 2-RATIO (or single tank): one entry per active tank */
      for(let j = 0; j < 2; j++){
        if(j === 0 && !tk0hasData) continue;
        if(j === 1 && !tk1hasData) continue;
        const tkData = tanks[j];
        const vw = _calcVolWt(tkData.tr3, tkData.unit || 'vol');
        const entry = Object.assign({}, commonInfo, {
          tank: String(j + 1),
          t: [tanks[0], tanks[1]],
          _tkIdx:    j,
          cTotal:    tkData.tload || 0,
          cFilled:   tkData.fqty || 0,
          stC3:      tkData.stC3 || 0,
          stC4:      tkData.stC4 || 0,
          wr3:       tkData.wr3 || 0,
          targetC3:  tkData.tr3,
          targetUnit:tkData.unit || 'vol',
          minC3:     tkData.min,
          maxC3:     tkData.max,
          quality:   _qualCheck(tkData),
          volC3:     vw.volC3, volC4: vw.volC4,
          wtC3:      vw.wtC3,  wtC4:  vw.wtC4,
          lpgMixQty: tkData.tload || 0,
          lpgWt:     tkData.tload || 0,
          qty:       tkData.qty || 0,
          odoTk1:    (tkData.qty != null && tkData.odor != null) ? (tkData.qty * tkData.odor / 1000) : null,
          gc:        GC_KEYS.reduce((acc,k)=>{ acc[k] = tkData[k]; return acc; }, {}),
          labdens:   tkData.labdens,
          remark:    ''
        });
        VLOG.pushEntry(entry);
        written.push('TK '+(j+1));
      }
    }

    if(!written.length){
      toast('⚠ No tank had enough data to save','er'); return;
    }
    toast('💾 Vessel Log saved — '+lotDisp+' ('+written.join(' + ')+')', 'ok');
  }

  /* ---------- modal: edit ships / density ---------- */
  function _escAttr(s){ return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;'); }
  function openShipEdit(){
    const m = _gid('vsmixModal'); if(!m) return;
    const rows = SHIPS.map((s,i)=>
      '<div class="vsmix-ship-row" data-idx="'+i+'" style="display:flex;gap:6px;align-items:center;margin-bottom:5px">'+
        '<input class="vsmix-inp" data-fld="name" value="'+_escAttr(s.name)+'" style="flex:2;font-size:12px">'+
        '<input class="vsmix-inp" data-fld="tk1" value="'+s.tk1_m3+'" style="flex:1;font-size:11px;text-align:right" placeholder="TK1 m³">'+
        '<input class="vsmix-inp" data-fld="tk2" value="'+s.tk2_m3+'" style="flex:1;font-size:11px;text-align:right" placeholder="TK2 m³">'+
        '<button onclick="this.closest(\'.vsmix-ship-row\').remove()" '+
                'style="padding:3px 7px;border:1px solid var(--red);color:var(--red);background:var(--panel);'+
                'border-radius:4px;cursor:pointer;font-size:11px">✕</button>'+
      '</div>'
    ).join('');
    m.innerHTML =
      '<div style="display:flex;align-items:center;margin-bottom:12px">'+
        '<span style="font-family:Oswald;font-size:15px;font-weight:700;letter-spacing:2px;color:#7b2d8e">⚙ VESSEL MANAGEMENT</span>'+
        '<button onclick="VMIX.closeModal()" style="margin-left:auto;padding:4px 12px;border:1.5px solid var(--line);background:#f0f4f8;border-radius:5px;font-family:Oswald;font-size:11px;cursor:pointer">✕ Close</button>'+
      '</div>'+
      '<div id="vsmix-ships-list">'+rows+'</div>'+
      '<div style="display:flex;gap:6px;margin-top:8px">'+
        '<input id="vsmix-newship-name" placeholder="New vessel name" class="vsmix-inp" style="flex:2;font-size:12px">'+
        '<input id="vsmix-newship-tk1"  placeholder="TK1 m³" class="vsmix-inp" style="flex:1;font-size:11px;text-align:right">'+
        '<input id="vsmix-newship-tk2"  placeholder="TK2 m³" class="vsmix-inp" style="flex:1;font-size:11px;text-align:right">'+
        '<button onclick="VMIX._addShipRow()" style="padding:5px 14px;border:1.5px solid var(--blue);color:var(--blue);background:var(--blue-soft);border-radius:5px;cursor:pointer;font-family:Oswald;font-size:11px;font-weight:700">+ ADD</button>'+
      '</div>'+
      '<div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">'+
        '<button onclick="VMIX._saveShips()" style="padding:8px 22px;background:var(--green);color:#fff;border:none;border-radius:5px;font-family:Oswald;font-size:12px;font-weight:700;letter-spacing:1px;cursor:pointer">💾 SAVE</button>'+
        '<button onclick="VMIX.closeModal()" style="padding:8px 16px;background:#f0f4f8;border:1.5px solid var(--line);border-radius:5px;font-family:Oswald;font-size:12px;cursor:pointer">Cancel</button>'+
      '</div>';
    _gid('vsmixModalBg')?.classList.add('on');
  }
  function _addShipRow(){
    const nm  = _gv('vsmix-newship-name').trim();
    const tk1 = parseFloat(_gv('vsmix-newship-tk1'));
    const tk2 = parseFloat(_gv('vsmix-newship-tk2'));
    if(!nm){ toast('⚠ Enter vessel name','er'); return; }
    if(isNaN(tk1) || isNaN(tk2)){ toast('⚠ Enter TK1 and TK2 volumes','er'); return; }
    const list = _gid('vsmix-ships-list'); if(!list) return;
    const div = document.createElement('div');
    div.className = 'vsmix-ship-row';
    div.innerHTML =
      '<input class="vsmix-inp" data-fld="name" value="'+_escAttr(nm)+'" style="flex:2;font-size:12px">'+
      '<input class="vsmix-inp" data-fld="tk1" value="'+tk1+'" style="flex:1;font-size:11px;text-align:right">'+
      '<input class="vsmix-inp" data-fld="tk2" value="'+tk2+'" style="flex:1;font-size:11px;text-align:right">'+
      '<button onclick="this.closest(\'.vsmix-ship-row\').remove()" '+
              'style="padding:3px 7px;border:1px solid var(--red);color:var(--red);background:var(--panel);'+
              'border-radius:4px;cursor:pointer;font-size:11px">✕</button>';
    div.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:5px';
    list.appendChild(div);
    _gid('vsmix-newship-name').value = '';
    _gid('vsmix-newship-tk1').value  = '';
    _gid('vsmix-newship-tk2').value  = '';
  }
  function _saveShips(){
    const rows = document.querySelectorAll('#vsmix-ships-list .vsmix-ship-row');
    const next = [];
    rows.forEach(r=>{
      const nm  = r.querySelector('input[data-fld="name"]')?.value.trim();
      const tk1 = parseFloat(r.querySelector('input[data-fld="tk1"]')?.value);
      const tk2 = parseFloat(r.querySelector('input[data-fld="tk2"]')?.value);
      if(nm && !isNaN(tk1) && !isNaN(tk2)) next.push({ name:nm, tk1_m3:tk1, tk2_m3:tk2 });
    });
    if(!next.length){ toast('⚠ Need at least one vessel','er'); return; }
    SHIPS = next;
    /* Firebase persistence wired in S5 along with vessel_config listener.
       Until then, this is a session-local override — keep it noisy. */
    if(typeof firebase !== 'undefined' && firebase.database){
      try{
        firebase.database().ref('vessel_config').update({ ships: next, props: PROPS })
          .catch(e=>console.warn('[VMIX] save ships', e));
      }catch(_){}
    }
    _populateShipSel();
    closeModal();
    toast('💾 Saved '+next.length+' vessels','ok');
  }
  function openDensityEdit(){
    const m = _gid('vsmixModal'); if(!m) return;
    const fld = (id, lbl, val) =>
      '<div class="vsmix-fld"><label class="vsmix-lbl">'+lbl+'</label>'+
        '<input id="'+id+'" class="vsmix-inp" value="'+val+'" inputmode="decimal" style="font-size:13px"></div>';
    m.innerHTML =
      '<div style="display:flex;align-items:center;margin-bottom:12px">'+
        '<span style="font-family:Oswald;font-size:15px;font-weight:700;letter-spacing:2px;color:var(--green)">ρ DENSITY CONSTANTS</span>'+
        '<button onclick="VMIX.closeModal()" style="margin-left:auto;padding:4px 12px;border:1.5px solid var(--line);background:#f0f4f8;border-radius:5px;font-family:Oswald;font-size:11px;cursor:pointer">✕ Close</button>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'+
        fld('vsd-c3l','C3 liquid (kg/L)', DENS.c3l)+
        fld('vsd-c4l','C4 liquid (kg/L)', DENS.c4l)+
        fld('vsd-c3v','C3 vapor (kg/L)',  DENS.c3v)+
        fld('vsd-c4v','C4 vapor (kg/L)',  DENS.c4v)+
      '</div>'+
      /* v4.70 (V406): component density used by Est.Density */
      '<div style="margin-top:12px;font-family:Oswald;font-size:11px;letter-spacing:1px;color:var(--ink-3);margin-bottom:4px">COMPONENT DENSITY (Est. Density)</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;align-items:center">'+
        '<div style="text-align:center;font-size:9px;font-weight:700;color:var(--ink-3)">Component</div>'+
        '<div style="text-align:center;font-size:9px;font-weight:700;color:var(--ink-3)">Vol Ratio %</div>'+
        '<div style="text-align:center;font-size:9px;font-weight:700;color:var(--ink-3)">Density kg/L</div>'+
        '<div style="text-align:center;font-size:11px;color:var(--blue);font-weight:700">C3</div>'+
        '<input id="vsd-c3vr"  class="vsmix-inp" value="'+PROPS.c3_vr+'"  inputmode="decimal" style="font-size:11px;text-align:center">'+
        '<input id="vsd-c3den" class="vsmix-inp" value="'+PROPS.c3_den+'" inputmode="decimal" style="font-size:11px;text-align:center">'+
        '<div style="text-align:center;font-size:11px;color:var(--orange);font-weight:700">n-C4</div>'+
        '<input id="vsd-nc4vr"  class="vsmix-inp" value="'+PROPS.nc4_vr+'"  inputmode="decimal" style="font-size:11px;text-align:center">'+
        '<input id="vsd-nc4den" class="vsmix-inp" value="'+PROPS.nc4_den+'" inputmode="decimal" style="font-size:11px;text-align:center">'+
        '<div style="text-align:center;font-size:11px;color:var(--orange);font-weight:700">i-C4</div>'+
        '<input id="vsd-ic4vr"  class="vsmix-inp" value="'+PROPS.ic4_vr+'"  inputmode="decimal" style="font-size:11px;text-align:center">'+
        '<input id="vsd-ic4den" class="vsmix-inp" value="'+PROPS.ic4_den+'" inputmode="decimal" style="font-size:11px;text-align:center">'+
      '</div>'+
      '<div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">'+
        '<button onclick="VMIX._saveDensity()" style="padding:8px 22px;background:var(--green);color:#fff;border:none;border-radius:5px;font-family:Oswald;font-size:12px;font-weight:700;letter-spacing:1px;cursor:pointer">💾 SAVE</button>'+
        '<button onclick="VMIX._resetDensity()" style="padding:8px 16px;background:#fef3c7;color:#92400e;border:1.5px solid #f59e0b;border-radius:5px;font-family:Oswald;font-size:12px;cursor:pointer">Reset to defaults</button>'+
        '<button onclick="VMIX.closeModal()" style="padding:8px 16px;background:#f0f4f8;border:1.5px solid var(--line);border-radius:5px;font-family:Oswald;font-size:12px;cursor:pointer">Cancel</button>'+
      '</div>';
    _gid('vsmixModalBg')?.classList.add('on');
  }
  function _saveDensity(){
    const next = {
      c3l: parseFloat(_gv('vsd-c3l')) || DENS.c3l,
      c4l: parseFloat(_gv('vsd-c4l')) || DENS.c4l,
      c3v: parseFloat(_gv('vsd-c3v')) || DENS.c3v,
      c4v: parseFloat(_gv('vsd-c4v')) || DENS.c4v
    };
    DENS = next;
    /* v4.70 (V406): also save component props used by Est.Density */
    PROPS = {
      c3_vr:  parseFloat(_gv('vsd-c3vr'))  || PROPS.c3_vr,
      c3_den: parseFloat(_gv('vsd-c3den')) || PROPS.c3_den,
      nc4_vr: parseFloat(_gv('vsd-nc4vr')) || PROPS.nc4_vr,
      nc4_den:parseFloat(_gv('vsd-nc4den'))|| PROPS.nc4_den,
      ic4_vr: parseFloat(_gv('vsd-ic4vr')) || PROPS.ic4_vr,
      ic4_den:parseFloat(_gv('vsd-ic4den'))|| PROPS.ic4_den
    };
    if(typeof firebase !== 'undefined' && firebase.database){
      try{
        firebase.database().ref('vessel_density').set(next).catch(e=>console.warn('[VMIX] density', e));
        firebase.database().ref('vessel_config').update({ ships: SHIPS, props: PROPS }).catch(()=>{});
      }catch(_){}
    }
    closeModal();
    try{ calcPlan(); }catch(_){}
    toast('💾 Density + Component saved → recalculated','ok');
  }
  function _resetDensity(){
    DENS = Object.assign({}, DEFAULT_DENS);
    openDensityEdit();
    toast('Density reset to defaults (not saved yet)','warn');
  }
  function closeModal(){ _gid('vsmixModalBg')?.classList.remove('on'); }

  /* ============================================================
     v4.72 — COQ extras grid (render vào placeholder mỗi tank) + IMPORT COQ.
     COQ vessel có CẢ TANK 1 (cột H) và TANK 2 (cột J) trong 1 file;
     import điền GC %vol + Lab Dens + các chỉ tiêu COQ cho cả 2 tank.
     KHÔNG import final volume (COQ vessel không có).
     ============================================================ */
  function _renderCoqExtra(){
    [0,1].forEach(i=>{
      const host = _gid('vs-coq-extra-'+i);
      if(!host || host.dataset.built === '1') return;
      let h = '<div class="vsmix-gc-row" style="align-items:flex-start">'
        + '<span class="vsmix-gc-ttl" style="color:#7b2d8e" title="Chỉ tiêu từ COQ (điền khi IMPORT COQ)">📄 COQ</span>'
        + '<div class="vsmix-gc-grid" style="flex-wrap:wrap">';
      VCQ.forEach(f=>{
        h += '<div class="vsmix-fld"><label class="vsmix-lbl-xs">'+f.l+'</label>'
          + '<input type="text" id="vs-cq-'+f.k+'-'+i+'" class="vsmix-inp vsmix-inp-xs" inputmode="decimal"'
          + ' style="background:#f6f0fb;border:1.5px solid #c9a0e8"></div>';
      });
      h += '</div></div>';
      host.innerHTML = h;
      host.dataset.built = '1';
    });
  }

  /* ---------- refresh: called when navigating to the Vessel Mix sub-tab ---------- */
  function refresh(){
    _populateShipSel();
    _renderCoqExtra();
    const dt = _gid('vs-date'); if(dt && !dt.value) dt.value = _todayDDMMYY();
    updateLot();
    [0,1].forEach(_renderStatus);
  }

  /* ---------- COQ import (vessel, 2-tank) ---------- */
  function importCoqPick(){
    const inp = _gid('vs-coqfile');
    if(!inp){ toast('❌ File input missing','er'); return; }
    inp.value = ''; inp.click();
  }
  function _vmLotParse(s){
    s = String(s||'');
    const y = s.match(/(20\d{2})/), n = s.match(/(\d+)(?!.*\d)/);
    return (y && n) ? { year:parseInt(y[1]), num:parseInt(n[1]) } : null;
  }
  function coqChosen(inputEl){
    const f = inputEl && inputEl.files && inputEl.files[0]; if(!f) return;
    if(typeof XLSX === 'undefined'){ toast('❌ XLSX library not loaded','er'); return; }
    if(typeof VLOG === 'undefined' || typeof VLOG.parseVesselCoq !== 'function'){
      toast('❌ Vessel Log module chưa sẵn sàng','er'); return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      let coq;
      try{ const wb = XLSX.read(ev.target.result, {type:'array'}); coq = VLOG.parseVesselCoq(wb); }
      catch(err){ console.warn('[VMIX] COQ parse', err); toast('❌ Không đọc được file COQ: '+err.message,'er'); return; }
      _applyCoq(coq, f.name);
    };
    reader.onerror = ()=> toast('❌ Không đọc được file','er');
    reader.readAsArrayBuffer(f);
  }
  function _applyCoq(coq, fname){
    _renderCoqExtra();
    if(!coq.lot){ alert('⚠ KHÔNG TÌM THẤY SỐ LOT trong file COQ\n\nFile: '+fname+'\nKiểm tra lại file.'); return; }
    /* validate Lot vs LOT đang nhập (nếu đã có) */
    const curDisp = (_gid('vs-lot-display')||{}).textContent || '';
    const cq = _vmLotParse(coq.lot), rw = _vmLotParse(curDisp);
    if(rw && cq && (cq.num !== rw.num || cq.year !== rw.year)){
      alert('❌ SỐ LOT KHÔNG KHỚP — DỮ LIỆU KHÔNG ĐƯỢC IMPORT\n\n'+
            '• COQ file:  '+coq.lot+'\n'+
            '• Đang nhập: '+curDisp+'\n\nCó thể chọn nhầm file. Kiểm tra lại.');
      toast('❌ COQ Lot '+coq.lot+' ≠ '+curDisp+' — không import','er');
      return;
    }
    const sv = (id, val)=>{
      const el = _gid(id);
      if(!el || val == null || val === '') return;
      el.value = (typeof val === 'number') ? String(parseFloat(val.toFixed(4))) : String(val);
    };
    /* điền định danh nếu đang trống (không đè dữ liệu đã nhập) */
    const cust = _gid('vs-cust'); if(cust && !cust.value && coq.customer) cust.value = coq.customer;
    const fin  = _gid('vs-ftime'); if(fin && !fin.value && coq.sampTime) fin.value = coq.sampTime;
    [0,1].forEach(i=>{
      const tk = (coq.tanks && coq.tanks[i]) || {};
      /* GC %vol — CH₄ để trống (COQ không có) */
      GC_KEYS.forEach(k=>{ if(k !== 'meth') sv('vs-gc-'+k+'-'+i, tk[k]); });
      /* Lab Dens = Density@15 của COQ */
      sv('vs-labdens-'+i, tk.labdens);
      /* các chỉ tiêu COQ bổ sung (KHÔNG có final volume) */
      VCQ.forEach(f=>{ sv('vs-cq-'+f.k+'-'+i, tk[f.k]); });
      try{ gcSum(i); }catch(_){}
    });
    toast('📄 Import COQ '+(coq.no||coq.lot)+' → điền GC %vol + Lab Dens + chỉ tiêu cả 2 tank (tím)','ok');
  }

  /* ---------- init: attach Firebase listeners (vessel_config / density) ---------- */
  function init(){
    if(_attached) return;
    _populateShipSel();
    _renderCoqExtra();
    try{
      if(typeof firebase === 'undefined' || !firebase.database){ console.warn('[VMIX] firebase not loaded'); return; }
      firebase.database().ref('vessel_config').on('value', snap=>{
        const v = snap.val();
        if(v && Array.isArray(v.ships) && v.ships.length) SHIPS = v.ships;
        if(v && v.props && typeof v.props === 'object') PROPS = Object.assign({}, DEFAULT_PROPS, v.props);
        _populateShipSel();
      }, e=>console.warn('[VMIX] vessel_config', e));
      firebase.database().ref('vessel_density').on('value', snap=>{
        const v = snap.val();
        if(v && typeof v === 'object') DENS = Object.assign({}, DEFAULT_DENS, v);
      }, e=>console.warn('[VMIX] vessel_density', e));
      _attached = true;
      console.log('[VMIX] ✅ Init OK · '+SHIPS.length+' vessels');
    }catch(e){ console.warn('[VMIX] init', e); }
    /* v4.70: auto-restore the shared mixing session (delayed for other init) */
    setTimeout(()=>{ try{ restoreMixState(); }catch(e){ console.warn('[VMIX] restore', e); } }, 2500);
  }

  /* ---------- public API ---------- */
  return {
    init, refresh,
    onShipChange, updateLot, autoLot,
    toggleRatio, onUnitChange,
    gcSum, startMix, finishMix, reset,
    calcPlan, calcResult, saveLog,
    importCoqPick, coqChosen,
    openShipEdit, openDensityEdit, closeModal,
    now, toggleAfter, custSearch, custPick,
    saveMixState, restoreMixState,
    _addShipRow, _saveShips, _saveDensity, _resetDensity,
    get SHIPS(){ return SHIPS; },
    get DENS(){  return DENS;  },
    get PROPS(){ return PROPS; },
    get RATIO(){ return RATIO; },
    get UNIT(){  return UNIT;  },
    get STATE(){ return STATE; },
    get SEL_SHIP(){ return SEL_SHIP; },
    get AFTER_RESULT(){ return _afterResult; }
  };
})();
window.VMIX = VMIX;


/* ============================================================
   VLOG — Vessel Log module (v4.28.0)
   ────────────────────────────────────────────────────────────
   Firebase path: /vessel_mix_log/{rid} — rid-keyed (not array)
   so individual saves write one child, not the whole tree.

   Each entry is the full snapshot of a vessel-mix save:
     {
       _rid, _ts,
       lot, type, ship, customer, date, tStart, tEnd,
       c3fq, c4fq, ratio,
       tank,                       // '1' | '2' | '02 TANK' (1-ratio merged row)
       qty, targetC3, targetUnit, minC3, maxC3,
       volC3, volC4, wtC3, wtC4,
       stC3, stC4, lpgWt,          // actual loaded mass split
       cTotal, cFilled, lpgMixQty,
       odoTk1, odoTk2,
       quality, remark,
       t: [tank0Obj, tank1Obj]     // raw per-tank inputs + intermediates
     }
   ============================================================ */
