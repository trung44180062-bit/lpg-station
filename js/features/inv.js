/* ============================================================
 * INV  —  inv.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 27925–28613   (~689 dòng)
 * Global xuất ra : window.INV
 * Phase tách     : P5B
 * Phụ thuộc      : sync
 * Khởi tạo (boot): INV.init() trong boot
 * ------------------------------------------------------------
 * MÔ TẢ: Tồn kho 2 tank (INV): SLOC/TKNAME/OTHER, DATA[ds][sloc]={init,wt,history}. LBL (28439).
 *
 * API công khai (điền/đối chiếu khi tách):
 *   INV.init(), INV.render()
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module INV từ dòng 27925 đến 28613.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.INV).
 *   3) node --check inv.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P5B]: dán thân module INV (V4-54 dòng 27925–28613) vào đây. */

/* ===== BÓC TỪ V4-54 dòng 27925–28613 ===== */
const INV = (function(){
  'use strict';

  const SLOC   = { 1:'2100', 2:'2101' };          // tank button # -> sloc
  const TKNAME = { '2100':'TK-3501', '2101':'TK-3502' };
  const OTHER  = { '2100':'2101', '2101':'2100' };
  const CACHE  = 'lpg_v4_inv_v1';
  const DEFAULT_WT = 30;

  let FB   = null;
  let sel  = '2100';        // tank currently shown in the XFER card
  let DATA = {};            // DATA[ds][sloc] = { init, wt, history:{} }
  let _initPick = '2100';   // tank chosen inside the Tồn-đầu modal
  let _cavPick  = '2100';
  let _xferFrom = '2100';
  let _fbBound  = false;
  /* Per-tank version stamps. A write bumps inv_daily/{date}/{sloc}/_ver (timestamp).
     The listener only re-syncs + recomputes when the incoming _ver differs from the
     last applied one — so RAM-only deductions never trigger spurious re-syncs, and a
     real Firebase change (from this or another machine) always does. */
  let _localVer = { '2100':null, '2101':null };

  /* ── date / misc helpers ── */
  function ds(){ const d=new Date(),p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }
  /* Canonical DD/MM/YY (2-digit year) — MUST match normalizeDate() / the date
     stored on TL Data rows (_buildTLPayload uses String(year).slice(-2)).
     giFromTL() and _renderExport() compare r.date === todayDMY() by exact
     string; a 4-digit year here silently fails every match, so today's actual
     net-weight sales are NEVER deducted from tank stock. Keep this 2-digit. */
  function todayDMY(){ const d=new Date(),p=n=>String(n).padStart(2,'0'); return p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+String(d.getFullYear()).slice(-2); }
  function nowHM(){ const d=new Date(),p=n=>String(n).padStart(2,'0'); return p(d.getHours())+':'+p(d.getMinutes()); }
  function by(){ try{ return (typeof CURRENT_USER!=='undefined' && CURRENT_USER.name) || '—'; }catch(_){ return '—'; } }
  function num(v){ const n=parseFloat(v); return isFinite(n)?n:0; }
  function fmtKg(n){ const v=Math.round(num(n)); return v.toLocaleString('en-US'); }
  function fmtT(n){ return (num(n)/1000).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function bucket(d, sloc){
    DATA[d] = DATA[d] || {};
    DATA[d][sloc] = DATA[d][sloc] || { init:null, wt:null, history:{} };
    if(!DATA[d][sloc].history) DATA[d][sloc].history = {};
    return DATA[d][sloc];
  }

  /* ── localStorage cache ── */
  function loadCache(){ try{ const r=localStorage.getItem(CACHE); return r?JSON.parse(r):null; }catch(_){ return null; } }
  function saveCache(){ try{ localStorage.setItem(CACHE, JSON.stringify({ data:DATA, ver:_localVer, ts:Date.now() })); }catch(_){ } }

  /* ── Firebase ── */
  function fb(){
    if(FB) return FB;
    if(typeof firebase==='undefined') return null;
    try{ FB = firebase.database(); }catch(_){ FB=null; }
    return FB;
  }
  function attachFirebase(){
    const h = fb(); if(!h || _fbBound) return;
    _fbBound = true;
    /* Listen to today's node only (cheap). Re-bind is handled on date roll by init scheduler re-run. */
    h.ref('inv_daily/'+ds()).on('value', snap=>{
      const v = snap.val() || {};
      DATA[ds()] = DATA[ds()] || {};
      let changed = false;
      ['2100','2101'].forEach(sl=>{
        const n = v[sl] || {};
        const fbVer = (n._ver!=null) ? n._ver : 0;
        /* Only adopt + recompute when the version actually moved (or first load). */
        if(_localVer[sl] === null || fbVer !== _localVer[sl]){
          DATA[ds()][sl] = { init:n.init||null, wt:n.wt||null, history:n.history||{} };
          _localVer[sl] = fbVer;
          changed = true;
        }
      });
      if(changed){ saveCache(); render(); }
    }, err=>console.warn('[INV] fb listen', err));
  }

  /* ── GI sold-today from TL Data (read-only, guarded) ──
     Mirrors V406 _invGiFromTL: sum today's TL rows whose loading tank
     matches this sloc's suffix. Falls back to lpgQty×%wt when no
     C3/C4 breakdown is present. Returns {c3,c4}; 0 if TL not loaded. */
  function giFromTL(sloc, d){
    if(typeof TL==='undefined' || !TL.ROWS) return { c3:0, c4:0 };
    const suffix = sloc==='2100' ? '3501' : '3502';
    const dmy = todayDMY();
    let c3=0, c4=0;
    const b = bucket(d, sloc);
    const pctC3 = (b.wt && isFinite(b.wt.wtC3) ? num(b.wt.wtC3)
                 : b.init && isFinite(b.init.wtC3) ? num(b.init.wtC3) : DEFAULT_WT) / 100;
    Object.values(TL.ROWS).forEach(r=>{
      if(!r || r.disabled || !r.date) return;
      if(r.date !== dmy) return;
      if(typeof isPureType==='function' && isPureType(r.type)) return;
      if(!String(r.ltank||'').toUpperCase().includes(suffix)) return;
      let rc3 = num(r.c3Kg || r.stC3);
      let rc4 = num(r.c4Kg || r.stC4);
      const lpg = num(r.lpgQty);
      const sum = rc3 + rc4;
      /* values look like tons (much smaller than lpgQty in kg) → scale up */
      if(lpg>0 && sum>0 && sum < lpg/100){ rc3*=1000; rc4*=1000; }
      if(rc3>0 || rc4>0){ c3+=rc3; c4+=rc4; }
      else if(lpg>0){ c3 += lpg*pctC3; c4 += lpg*(1-pctC3); }
    });
    return { c3, c4 };
  }

  /* ── core compute (RAM only) ── */
  function compute(sloc, d){
    d = d || ds();
    const b = bucket(d, sloc);
    if(!b.init){
      return { hasInit:false, c3Init:0, c4Init:0, wtC3:DEFAULT_WT,
               cav:{c3:0,c4:0}, xIn:{c3:0,c4:0}, xOut:{c3:0,c4:0},
               gi:{c3:0,c4:0}, stn:{c3:0,c4:0}, c3Cur:0, c4Cur:0, lpg:0 };
    }
    const c3Init = num(b.init.c3), c4Init = num(b.init.c4);
    const wtC3 = b.wt && isFinite(b.wt.wtC3) ? num(b.wt.wtC3)
               : isFinite(b.init.wtC3) ? num(b.init.wtC3) : DEFAULT_WT;
    let cvC3=0,cvC4=0, xInC3=0,xInC4=0, xOutC3=0,xOutC4=0;
    Object.values(b.history||{}).forEach(e=>{
      if(!e) return;
      if(e.type==='cavern'){ cvC3+=num(e.c3); cvC4+=num(e.c4); }
      else if(e.type==='xfer'){
        if(e.toSl===sloc){ xInC3+=num(e.c3); xInC4+=num(e.c4); }
        else if(e.fromSl===sloc){ xOutC3+=num(e.c3); xOutC4+=num(e.c4); }
      }
    });
    const gi = giFromTL(sloc, d);
    /* v4.22.4 — Tentative deduction for vehicles currently assigned to a
       station that is loading from THIS tank. The station's loading qty (MT)
       is converted to kg and split into C3/C4 using the tank's %wt — that
       reflects what's actually being drawn out right now. When the truck
       finishes loading, a TL Data row is written and the gi (from TL Data)
       branch picks it up using actual net weight; the station's loading
       qty drops out on the next render. When the truck is cancelled (dbl-
       click reset), the station goes back to empty and this deduction
       evaporates automatically — the queue's separate accounting doesn't
       affect stock. Per-tank guard: only stations whose `tank` field
       matches this sloc's name are deducted. */
    const tankName = (sloc === '2100') ? 'TK-3501'
                   : (sloc === '2101') ? 'TK-3502'
                   : '';
    let stnC3 = 0, stnC4 = 0;
    if(tankName){
      try{
        const stations = (typeof SCALE !== 'undefined' && SCALE.getStations) ? SCALE.getStations() : null;
        if(stations){
          const pct3 = (wtC3 || 0) / 100;
          Object.values(stations).forEach(st => {
            if(!st || !st.status || st.status === 'empty') return;
            if(String(st.tank || '').trim() !== tankName) return;
            const qtyKg = (parseFloat(st.qty) || 0) * 1000;
            if(qtyKg <= 0) return;
            stnC3 += qtyKg * pct3;
            stnC4 += qtyKg * (1 - pct3);
          });
        }
      }catch(_){}
    }
    const c3Cur = c3Init + cvC3 + xInC3 - xOutC3 - gi.c3 - stnC3;
    const c4Cur = c4Init + cvC4 + xInC4 - xOutC4 - gi.c4 - stnC4;
    return { hasInit:true, c3Init, c4Init, wtC3,
             cav:{c3:cvC3,c4:cvC4}, xIn:{c3:xInC3,c4:xInC4}, xOut:{c3:xOutC3,c4:xOutC4},
             gi, stn:{c3:stnC3,c4:stnC4}, c3Cur, c4Cur, lpg:c3Cur+c4Cur };
  }

  /* ── render the compact XFER card ──
     v4.22.14 — XFER card now shows the STATIC "Tồn đầu ngày" values
     (c3Init / c4Init / lpgInit + effective %wt C3). It does NOT auto-deduct
     based on TL Data outbound or station loading. Only changes when the
     operator manually re-confirms the initial via 📥 Tồn đầu ngày, or
     updates the %wt override via 📐 %wt C3. The Scale tank-cell chip and
     PLAN card REMAINING still auto-deduct (those are operational
     "what's left now" displays — see renderRow1 below and SCALE._updateRow1). */
  function render(){
    renderRow1();   // ROW 1 (Scale tab) always refreshes, independent of the card
    const tab1=document.getElementById('invXTab1'), tab2=document.getElementById('invXTab2');
    if(tab1){ tab1.className='inv-x-tab'+(sel==='2100'?' on-3501':''); }
    if(tab2){ tab2.className='inv-x-tab'+(sel==='2101'?' on-3502':''); }
    const stock=document.getElementById('invXStock'), meta=document.getElementById('invXMeta');
    if(!stock) return;
    const c = compute(sel);
    if(!c.hasInit){
      stock.innerHTML = '<div class="inv-x-empty">No opening stock yet — press <b>📥 Opening Stock</b></div>';
      if(meta) meta.textContent='';
      return;
    }
    const lpgInit = num(c.c3Init) + num(c.c4Init);
    stock.innerHTML =
      '<div class="inv-x-cell"><span class="k">C3 init</span><span class="v c3">'+fmtKg(c.c3Init)+'</span></div>'+
      '<div class="inv-x-cell"><span class="k">C4 init</span><span class="v c4">'+fmtKg(c.c4Init)+'</span></div>'+
      '<div class="inv-x-cell"><span class="k">LPG init</span><span class="v lpg">'+fmtKg(lpgInit)+'</span></div>'+
      '<div class="inv-x-cell"><span class="k">%wt C3</span><span class="v wt">'+(+num(c.wtC3).toFixed(1))+'</span></div>';
    if(meta){
      /* Show what extras have been recorded today (cavern receipts / inter-tank
         transfers) so operator still has visibility, but these no longer change
         the displayed initial volume. */
      const bits=[];
      if(c.cav.c3||c.cav.c4) bits.push('cavern '+fmtKg(c.cav.c3+c.cav.c4));
      const xnet=(c.xIn.c3+c.xIn.c4)-(c.xOut.c3+c.xOut.c4);
      if(xnet) bits.push('xfer '+(xnet>0?'+':'')+fmtKg(xnet));
      meta.textContent = bits.length ? ('Opening stock (static) · ' + bits.join(' · ')) : 'Opening stock (static)';
    }
  }

  /* ── ROW 1 inventory chip + REMAINING (Scale tab) ──
     Follows the tank currently selected in SCALE (not the XFER card's own tabs).
     Shows the same RAM-computed stock as the XFER card. */
  function stockFor(sloc){ return compute(sloc); }
  function _scaleSelectedSloc(){
    try{
      const cfg=(typeof SCALE!=='undefined'&&SCALE.getTkCfg)?SCALE.getTkCfg():null;
      if(cfg) return (cfg.tk2&&cfg.tk2.selected)?'2101':'2100';
    }catch(_){}
    return '2100';
  }
  function renderRow1(){
    /* v4.31.9 — Row 1 Cluster 1 is now TWO per-tank cards. Each card shows
       its own tank's live LPG / C3 / C4, so render both.
       v4.31.11 — renderRow1 also owns the PLAN card cross-tank STOCK total
       (sum of TK-3501 + TK-3502). This runs on every INV change, so the
       total updates live the moment a second tank's init is declared
       (scRenderCtrl no longer computes it — it wasn't re-triggered by INV).
       v4.33.0 — also drives the BALL gauge on each card: the circle is the
       spherical tank shell and liquid rises from the BOTTOM like the real
       11 m ball tank. Volume fraction p = LPG stock ÷ TANK_CAP_KG is converted
       to a liquid LEVEL via the spherical-cap inverse (solve t²(3−2t)=p for
       t = h/2R by Newton iteration), so low stock pools at the bottom and 50%
       volume sits exactly mid-sphere. Also drives the PLAN-card STOCK donut
       (C3 vs C4 segments, center = total LPG in t).
       No opening stock → dashed empty shell, "—" center, card shows the
       No-opening-stock notice instead of C3/C4. */
    /* v4.36.0 — capacity derived from geometry per user decision: 11 m ball
       tank → V = 4/3·π·R³ (R = 5.5 m) ≈ 696.91 m³ × 0.54 t/m³ ≈ 376,331 kg
       (replaces the rounded 376,000 literal; visual % shift < 0.1%). */
    const TANK_CAP_KG = (4/3) * Math.PI * Math.pow(5.5, 3) * 0.54 * 1000;
    /* spherical-cap inverse: volume fraction p → height fraction t (h/2R) */
    function capLevel(p){
      p = Math.max(0, Math.min(1, p));
      let t = p;                                    /* good seed; converges fast */
      for(let i=0;i<6;i++){
        const f = t*t*(3-2*t) - p, d = 6*t*(1-t);
        if(Math.abs(d) < 1e-9) break;
        t -= f/d;
        if(t<0) t=0; else if(t>1) t=1;
      }
      return t;
    }
    /* SVG geometry: shell r=23, cy=30 → liquid spans y 7…53 (height 46) */
    const BALL_TOP=7, BALL_BOT=53, BALL_H=46;
    function setBall(n, c){
      const card=document.getElementById('scTk'+n+'Card');
      const wrap=document.getElementById('scTkBall'+n);
      const liq =document.getElementById('scTkLiq'+n);
      const surf=document.getElementById('scTkSurf'+n);
      const pct =document.getElementById('scTkPct'+n);
      if(!liq) return;
      if(!c.hasInit){
        liq.setAttribute('y', BALL_BOT); liq.setAttribute('height', 0);
        if(surf){ surf.setAttribute('y1', BALL_BOT); surf.setAttribute('y2', BALL_BOT); }
        if(pct)  pct.textContent = '—';
        if(wrap){ wrap.classList.add('nostock'); wrap.classList.remove('lowstock');
                  wrap.title = 'No opening stock data — enter it via 📥 Opening Stock'; }
        if(card) card.classList.add('nostock');
      } else {
        const p = Math.max(0, Math.min(1, (c.lpg||0)/TANK_CAP_KG));
        const lvl = capLevel(p);                    /* liquid level fraction */
        const top = BALL_BOT - lvl*BALL_H;
        liq.setAttribute('y', top.toFixed(1));
        liq.setAttribute('height', (lvl*BALL_H).toFixed(1));
        if(surf){ surf.setAttribute('y1', top.toFixed(1)); surf.setAttribute('y2', top.toFixed(1)); }
        if(pct)  pct.textContent = Math.round(p*100)+'%';
        if(wrap){ wrap.classList.remove('nostock');
                  wrap.classList.toggle('lowstock', p>0 && p<=0.10);
                  wrap.title = ((c.lpg||0)/1000).toFixed(1)+' t / 376 t'; }
        if(card) card.classList.remove('nostock');
      }
    }
    let totLpg=0, totC3=0, totC4=0, totOpen=0, anyInit=false;
    [['2100','scInvLpg1','scInvC3_1','scInvC4_1',1],
     ['2101','scInvLpg2','scInvC3_2','scInvC4_2',2]].forEach(([sloc,lpgId,c3Id,c4Id,n])=>{
      const c=compute(sloc);
      const lpgEl=document.getElementById(lpgId);
      const c3El =document.getElementById(c3Id);
      const c4El =document.getElementById(c4Id);
      if(!c.hasInit){
        if(lpgEl) lpgEl.innerHTML='<span class="sc-inv-empty">—</span>';
        if(c3El)  c3El.innerHTML ='<span class="sc-inv-empty">—</span>';
        if(c4El)  c4El.innerHTML ='<span class="sc-inv-empty">—</span>';
      } else {
        if(lpgEl) lpgEl.innerHTML=fmtKg(c.lpg);
        if(c3El)  c3El.innerHTML =fmtKg(c.c3Cur);
        if(c4El)  c4El.innerHTML =fmtKg(c.c4Cur);
        anyInit=true; totLpg+=c.lpg||0; totC3+=c.c3Cur||0; totC4+=c.c4Cur||0;
        totOpen+=(c.c3Init||0)+(c.c4Init||0);   /* v4.36.1 — opening baseline for the drain donut */
      }
      setBall(n, c);
    });
    /* PLAN card (Cluster 3) STOCK legend = total of BOTH tanks */
    const setTot=(id,v)=>{ const el=document.getElementById(id); if(el) el.textContent = anyInit?fmtKg(v):'—'; };
    setTot('scPlanStockLpg', totLpg);
    setTot('scPlanStockC3',  totC3);
    setTot('scPlanStockC4',  totC4);
    /* v4.36.2 — OPEN baseline figure (the donut's 100% reference) */
    (function(){
      const el=document.getElementById('scPlanStockOpen');
      if(el) el.textContent = anyInit ? fmtKg(totOpen) : '—';
    })();
    /* v4.36.1 — STOCK donut semantics per user decision: the ring represents
       the day's OPENING LPG (both tanks) and the arc DRAINS in real time —
       arc fraction = current LPG ÷ opening LPG (clamped; cavern receipts can
       push it past 100%). Center = current LPG in t. No init → dashed empty
       ring + "—". RAM-only, runs on every INV change.
       v4.36.2 — arc color shifts with remaining level: ≥40% blue,
       15–40% amber, <15% red. */
    (function(){
      const wrap=document.getElementById('scStockDonutWrap');
      const arc =document.getElementById('scStockDonutC3');
      const ctr =document.getElementById('scStockDonutLpg');
      if(!arc) return;
      const CIRC=2*Math.PI*24;
      arc.classList.remove('lv-mid','lv-low');
      if(!anyInit || totOpen<=0){
        wrap&&wrap.classList.add('empty');
        arc.style.strokeDasharray='0 '+CIRC.toFixed(1);
        if(ctr) ctr.textContent='—';
      } else {
        wrap&&wrap.classList.remove('empty');
        const pLeft=Math.max(0,Math.min(1,totLpg/totOpen));
        if(pLeft<0.15)      arc.classList.add('lv-low');
        else if(pLeft<0.40) arc.classList.add('lv-mid');
        arc.style.strokeDasharray=(pLeft*CIRC).toFixed(1)+' '+CIRC.toFixed(1);
        if(ctr) ctr.textContent=(totLpg/1000).toFixed(1);
        if(wrap) wrap.title='LPG '+(totLpg/1000).toFixed(1)+' t left of '+(totOpen/1000).toFixed(1)+' t opening ('+Math.round(pLeft*100)+'%)';
      }
    })();
    /* keep legacy chip in sync (follows selected tank) in case external code reads it */
    const chip=document.getElementById('scInvChip');
    if(chip){
      const c=compute(_scaleSelectedSloc());
      if(!c.hasInit) chip.innerHTML='<span class="sc-inv-empty">no opening stock</span>';
      else chip.innerHTML='<span class="k">LPG</span><b class="lpg">'+fmtKg(c.lpg)+'</b>';
    }
    /* v4.36.1 — refresh the per-tank opening-stock mini-rows on the console */
    try{ if(typeof SCX2 !== 'undefined') SCX2.renderTankExtras(); }catch(_){}
  }

  /* ── tank view switch ── */
  function view(sloc){ sel=sloc; render(); }
  function onTankSwitch(n){ const sl=SLOC[n]; if(sl){ sel=sl; render(); } }

  /* ── modal open/close ── */
  function closeAll(){ document.querySelectorAll('.modal-bg').forEach(m=>{ if(m.id.indexOf('inv')===0) m.classList.remove('on'); }); }
  function open(id){ const m=document.getElementById(id); if(m) m.classList.add('on'); }

  function _setPick(containerId, sloc){
    const wrap=document.getElementById(containerId); if(!wrap) return;
    const btns=wrap.querySelectorAll('button');
    btns.forEach((b,i)=>{ b.className = (i===0&&sloc==='2100')?'on-3501':(i===1&&sloc==='2101')?'on-3502':''; });
  }

  /* Tồn đầu ngày */
  function openInit(){
    _initPick = sel;
    _setPick('invInitPick', _initPick);
    const b=bucket(ds(),_initPick);
    document.getElementById('invInitC3').value = b.init? b.init.c3 : '';
    document.getElementById('invInitC4').value = b.init? b.init.c4 : '';
    /* prefill with EFFECTIVE %wt (override → init.wtC3) so reopening shows the live value */
    const effWt = (b.wt && isFinite(b.wt.wtC3)) ? num(b.wt.wtC3)
                : (b.init && isFinite(b.init.wtC3)) ? num(b.init.wtC3) : '';
    document.getElementById('invInitWt').value = effWt;
    open('invInitModal');
  }
  function pickInit(sloc){
    _initPick=sloc; _setPick('invInitPick', sloc);
    const b=bucket(ds(),sloc);
    document.getElementById('invInitC3').value = b.init? b.init.c3 : '';
    document.getElementById('invInitC4').value = b.init? b.init.c4 : '';
    const effWt = (b.wt && isFinite(b.wt.wtC3)) ? num(b.wt.wtC3)
                : (b.init && isFinite(b.init.wtC3)) ? num(b.init.wtC3) : '';
    document.getElementById('invInitWt').value = effWt;
  }
  function saveInit(){
    const h=fb(); if(!h){ toast('Firebase not ready','er'); return; }
    const c3=num(document.getElementById('invInitC3').value);
    const c4=num(document.getElementById('invInitC4').value);
    let wt=num(document.getElementById('invInitWt').value); if(!wt) wt=DEFAULT_WT;
    if(c3<0||c4<0){ toast('Invalid value','er'); return; }
    const sloc=_initPick, d=ds();
    const ts=Date.now(), user=by();
    const initRec={ c3, c4, wtC3:wt, ts, by:user };
    const updates={};
    updates['inv_daily/'+d+'/'+sloc+'/init']=initRec;
    updates['inv_daily/'+d+'/'+sloc+'/wt']=null;     // a fresh init clears any %wt override
    const key=h.ref('inv_daily/'+d+'/'+sloc+'/history').push().key;
    updates['inv_daily/'+d+'/'+sloc+'/history/'+key]={ type:'init', c3, c4, wtC3:wt, note:'Opening stock', ts, by:user };
    updates['inv_daily/'+d+'/'+sloc+'/_ver']=ts;   // version bump → listeners re-sync + recompute
    h.ref().update(updates)
      .then(()=>{ toast('✓ Initial stock saved · '+TKNAME[sloc],'ok'); sel=sloc; closeAll(); })
      .catch(e=>{ console.warn('[INV] saveInit',e); toast('Failed to save initial stock','er'); });
  }

  /* %wt C3 — standalone update (v4.22.14)
     Writes ONLY the wt override node (inv_daily/{date}/{sloc}/wt). Does NOT
     touch the init C3/C4 values. Mirrors V406's _tiSaveWt path. compute()
     already prefers wt.wtC3 over init.wtC3, so a saved override takes effect
     immediately. Also writes a history entry of type 'wt' for audit. */
  let _wtPick = '2100';
  function openWt(){
    _wtPick = sel;
    _setPick('invWtPick', _wtPick);
    /* prefill with EFFECTIVE current %wt (override → init.wtC3 → default) */
    const b=bucket(ds(),_wtPick);
    const cur = (b.wt && isFinite(b.wt.wtC3)) ? num(b.wt.wtC3)
              : (b.init && isFinite(b.init.wtC3)) ? num(b.init.wtC3) : DEFAULT_WT;
    document.getElementById('invWtVal').value = cur;
    open('invWtModal');
  }
  function pickWt(sloc){
    _wtPick = sloc; _setPick('invWtPick', sloc);
    const b=bucket(ds(),sloc);
    const cur = (b.wt && isFinite(b.wt.wtC3)) ? num(b.wt.wtC3)
              : (b.init && isFinite(b.init.wtC3)) ? num(b.init.wtC3) : DEFAULT_WT;
    document.getElementById('invWtVal').value = cur;
  }
  function saveWt(){
    const h=fb(); if(!h){ toast('Firebase not ready','er'); return; }
    const wt = num(document.getElementById('invWtVal').value);
    if(!wt || wt<=0 || wt>100){ toast('Invalid %wt C3 (0–100)','er'); return; }
    const sloc=_wtPick, d=ds(), ts=Date.now(), user=by();
    const updates={};
    updates['inv_daily/'+d+'/'+sloc+'/wt']={ wtC3:wt, ts, by:user };
    const key=h.ref('inv_daily/'+d+'/'+sloc+'/history').push().key;
    updates['inv_daily/'+d+'/'+sloc+'/history/'+key]={ type:'wt', wtC3:wt, note:'%wt C3 update', ts, by:user };
    updates['inv_daily/'+d+'/'+sloc+'/_ver']=ts;
    h.ref().update(updates)
      .then(()=>{ toast('✓ %wt C3 updated · '+TKNAME[sloc]+' = '+wt,'ok'); sel=sloc; closeAll(); })
      .catch(e=>{ console.warn('[INV] saveWt',e); toast('Failed to save %wt','er'); });
  }

  /* Cavern */
  function openCavern(){
    _cavPick=sel; _setPick('invCavPick', _cavPick);
    document.getElementById('invCavC3').value='';
    document.getElementById('invCavC4').value='';
    document.getElementById('invCavNote').value='';
    open('invCavernModal');
  }
  function pickCav(sloc){ _cavPick=sloc; _setPick('invCavPick', sloc); }
  function saveCavern(){
    const h=fb(); if(!h){ toast('Firebase not ready','er'); return; }
    const c3=num(document.getElementById('invCavC3').value);
    const c4=num(document.getElementById('invCavC4').value);
    if(!c3 && !c4){ toast('Enter at least one value','er'); return; }
    const note=document.getElementById('invCavNote').value.trim();
    const sloc=_cavPick, d=ds(), ts=Date.now(), user=by();
    const key=h.ref('inv_daily/'+d+'/'+sloc+'/history').push().key;
    const updates={};
    updates['inv_daily/'+d+'/'+sloc+'/history/'+key]={ type:'cavern', c3, c4, note, ts, by:user };
    updates['inv_daily/'+d+'/'+sloc+'/_ver']=ts;
    h.ref().update(updates)
      .then(()=>{ toast('✓ Cavern receipt recorded · '+TKNAME[sloc],'ok'); sel=sloc; closeAll(); })
      .catch(e=>{ console.warn('[INV] saveCavern',e); toast('Save failed','er'); });
  }

  /* Inter-tank transfer */
  function openXfer(){
    _xferFrom = sel;
    _setPick('invXferPick', _xferFrom);
    _renderXferDir();
    document.getElementById('invXferC3').value='';
    document.getElementById('invXferC4').value='';
    document.getElementById('invXferNote').value='';
    open('invXferModal');
  }
  function pickXferFrom(sloc){ _xferFrom=sloc; _setPick('invXferPick', sloc); _renderXferDir(); }
  function _renderXferDir(){
    const to=OTHER[_xferFrom];
    const cl=s=>s==='2100'?'t3501':'t3502';
    const el=document.getElementById('invXferDir');
    if(el) el.innerHTML='<span class="tk '+cl(_xferFrom)+'">'+TKNAME[_xferFrom]+'</span><span class="arr">→</span><span class="tk '+cl(to)+'">'+TKNAME[to]+'</span>';
  }
  function saveXfer(){
    const h=fb(); if(!h){ toast('Firebase not ready','er'); return; }
    const c3=num(document.getElementById('invXferC3').value);
    const c4=num(document.getElementById('invXferC4').value);
    if(c3<0||c4<0){ toast('Invalid value','er'); return; }
    if(!c3 && !c4){ toast('Enter a transfer amount','er'); return; }
    const from=_xferFrom, to=OTHER[from], d=ds(), ts=Date.now(), user=by();
    const note=document.getElementById('invXferNote').value.trim();
    const pairId = (h.ref().push().key)||('p'+ts);
    const kFrom=h.ref('inv_daily/'+d+'/'+from+'/history').push().key;
    const kTo  =h.ref('inv_daily/'+d+'/'+to  +'/history').push().key;
    const base={ type:'xfer', c3, c4, fromSl:from, toSl:to, note, ts, by:user, _pairId:pairId };
    const updates={};
    updates['inv_daily/'+d+'/'+from+'/history/'+kFrom]=base;
    updates['inv_daily/'+d+'/'+to  +'/history/'+kTo  ]=base;
    updates['inv_daily/'+d+'/'+from+'/_ver']=ts;
    updates['inv_daily/'+d+'/'+to  +'/_ver']=ts;
    h.ref().update(updates)
      .then(()=>{ toast('✓ Transferred '+TKNAME[from]+' → '+TKNAME[to],'ok'); sel=from; closeAll(); })
      .catch(e=>{ console.warn('[INV] saveXfer',e); toast('Failed to save tank transfer','er'); });
  }

  /* History */
  function openHistory(){
    document.getElementById('invHistTitle').textContent='📜 History · '+TKNAME[sel]+' · '+todayDMY();
    renderHist();
    open('invHistModal');
  }
  function renderHist(){
    const body=document.getElementById('invHistBody'); if(!body) return;
    const b=bucket(ds(),sel);
    const rows=Object.keys(b.history||{}).map(k=>({k, ...b.history[k]})).sort((a,z)=>(a.ts||0)-(z.ts||0));
    if(!rows.length){ body.innerHTML='<tr><td colspan="8" class="inv-hist-empty">No data yet</td></tr>'; return; }
    const LBL={init:'Init',cavern:'Cavern',xfer:'Xfer',wt:'%wt'};
    body.innerHTML = rows.map(r=>{
      const d=new Date(r.ts||0), p=n=>String(n).padStart(2,'0');
      const hm=p(d.getHours())+':'+p(d.getMinutes());
      let note=r.note||'';
      if(r.type==='xfer'){ note=(r.fromSl===sel?'→ '+TKNAME[r.toSl]:'← '+TKNAME[r.fromSl])+(note?' · '+note:''); }
      const sign = r.type==='xfer' && r.fromSl===sel ? -1 : 1;
      const c3=r.c3!=null?fmtKg(sign*num(r.c3)):'—', c4=r.c4!=null?fmtKg(sign*num(r.c4)):'—';
      const wt=r.wtC3!=null?(+num(r.wtC3).toFixed(1)):'—';
      return '<tr><td>'+hm+'</td><td><span class="inv-hist-type '+r.type+'">'+(LBL[r.type]||r.type)+'</span></td>'+
        '<td>'+c3+'</td><td>'+c4+'</td><td>'+wt+'</td><td>'+(note||'—')+'</td><td>'+(r.by||'—')+'</td>'+
        '<td><button class="inv-hist-del" title="Xoá" onclick="INV.delHist(\''+r.k+'\',\''+(r._pairId||'')+'\')">🗑</button></td></tr>';
    }).join('');
  }
  function delHist(key, pairId){
    if(!confirm('Delete this history entry?')) return;
    const h=fb(); if(!h) return;
    const d=ds(), ts=Date.now();
    const updates={};
    updates['inv_daily/'+d+'/'+sel+'/history/'+key]=null;
    updates['inv_daily/'+d+'/'+sel+'/_ver']=ts;
    if(pairId){
      /* remove the mirrored xfer entry in the other tank too */
      const other=OTHER[sel], ob=bucket(d,other);
      Object.keys(ob.history||{}).forEach(k=>{ if(ob.history[k] && ob.history[k]._pairId===pairId) updates['inv_daily/'+d+'/'+other+'/history/'+k]=null; });
      updates['inv_daily/'+d+'/'+other+'/_ver']=ts;
    }
    h.ref().update(updates)
      .then(()=>{ toast('Deleted','ok'); renderHist(); })
      .catch(e=>{ console.warn('[INV] delHist',e); toast('Delete failed','er'); });
  }

  /* Export breakdown — every truck loaded today from the selected tank, with its
     Net Weight split into C3/C4 using the tank's ENTERED %wt C3, plus a grand total.
     Pulls trucks read-only from TL.ROWS (no Firebase write).
     v4.22.15 — added in-modal tank picker (TK-3501 / TK-3502). Switching tank
     re-runs the calculation against TL.ROWS without closing the modal. */
  let _exportTSV = '';
  let _exportPick = '2100';
  function openExport(){
    _exportPick = sel;       // default to the tank shown in XFER card
    _setPick('invExportPick', _exportPick);
    _renderExport(_exportPick);
    open('invExportModal');
  }
  function pickExport(sloc){
    _exportPick = sloc;
    _setPick('invExportPick', sloc);
    _renderExport(sloc);
  }
  function _renderExport(sloc){
    const d=ds();
    const c=compute(sloc);
    const pctC3=(num(c.wtC3)||DEFAULT_WT)/100;
    const suffix = sloc==='2100' ? '3501' : '3502';
    const dmy=todayDMY();
    const rows=[];
    if(typeof TL!=='undefined' && TL.ROWS){
      Object.values(TL.ROWS).forEach(r=>{
        if(!r || r.disabled || !r.date) return;
        if(r.date!==dmy) return;
        if(!String(r.ltank||'').toUpperCase().includes(suffix)) return;
        const lpg=num(r.lpgQty);
        if(lpg<=0) return;
        rows.push({ doNo:String(r.doNo||'—'), cust:String(r.cust||''), lpg, c3:lpg*pctC3, c4:lpg*(1-pctC3) });
      });
    }
    rows.sort((a,b)=>String(a.doNo).localeCompare(String(b.doNo),undefined,{numeric:true}));
    const totLpg=rows.reduce((s,r)=>s+r.lpg,0);
    const totC3 =rows.reduce((s,r)=>s+r.c3,0);
    const totC4 =rows.reduce((s,r)=>s+r.c4,0);

    document.getElementById('invExportTitle').textContent='📋 Export tách C3/C4 · '+TKNAME[sloc]+' · '+dmy;
    const sumEl=document.getElementById('invExportSum');
    if(sumEl){
      sumEl.innerHTML=
        '<div class="box"><span class="k">SỐ XE</span><span class="v">'+rows.length+'</span></div>'+
        '<div class="box"><span class="k">TỔNG LPG (kg)</span><span class="v lpg">'+fmtKg(totLpg)+'</span></div>'+
        '<div class="box"><span class="k">TỔNG C3 (kg)</span><span class="v c3">'+fmtKg(totC3)+'</span></div>'+
        '<div class="box"><span class="k">TỔNG C4 (kg)</span><span class="v c4">'+fmtKg(totC4)+'</span></div>';
    }
    const body=document.getElementById('invExportBody');
    if(body){
      body.innerHTML = rows.length
        ? rows.map(r=>'<tr><td>'+r.doNo+'</td><td>'+(r.cust||'—')+'</td><td>'+fmtKg(r.lpg)+'</td>'+
            '<td class="c3">'+fmtKg(r.c3)+'</td><td class="c4">'+fmtKg(r.c4)+'</td></tr>').join('')
        : '<tr><td colspan="5" class="inv-export-empty">No trucks exported today from '+TKNAME[sloc]+'</td></tr>';
    }
    /* TSV for clipboard: header + total + per-truck (split by entered %wt) */
    const lines=[['DO No.','Customer','Net_kg','C3_kg','C4_kg','%wtC3'].join('\t')];
    lines.push(['TỔNG','('+rows.length+' xe)',Math.round(totLpg),Math.round(totC3),Math.round(totC4),+(pctC3*100).toFixed(1)].join('\t'));
    rows.forEach(r=>lines.push([r.doNo,r.cust,Math.round(r.lpg),Math.round(r.c3),Math.round(r.c4),''].join('\t')));
    _exportTSV=lines.join('\n');
  }
  function copyExport(){
    try{ navigator.clipboard.writeText(_exportTSV); toast('✓ TSV copied','ok'); }
    catch(_){ toast('Copy failed','er'); }
  }

  /* ── init ── */
  function init(){
    const c=loadCache();
    if(c && c.data){ DATA = c.data; }
    if(c && c.ver){ _localVer = Object.assign({'2100':null,'2101':null}, c.ver); }
    /* default the shown tank to whatever SCALE has selected */
    try{
      if(typeof SCALE!=='undefined' && SCALE.getTkCfg){
        const cfg=SCALE.getTkCfg();
        if(cfg && cfg.tk2 && cfg.tk2.selected) sel='2101';
        else sel='2100';
      }
    }catch(_){ }
    render();
    attachFirebase();
  }

  return { init, view, onTankSwitch, render, renderRow1, stockFor,
           openInit, pickInit, saveInit,
           openWt, pickWt, saveWt,
           openCavern, pickCav, saveCavern,
           openXfer, pickXferFrom, saveXfer,
           openHistory, renderHist, delHist,
           openExport, pickExport, copyExport, closeAll };
})();
window.INV = INV;

/* ============================================================
   STAGED INITIALIZATION SCHEDULER (v4.18.13)
   ────────────────────────────────────────────────────────────
   Spreads module init across multiple frames so the UI stays
   responsive during cold start.

   Previously every init() ran in the same JS task (parse
   localStorage + attach Firebase listener × 12 modules) which
   froze the page 5–7s before first paint.

   Priority is tuned for the most common landing: Sales → Scale
     P0 (sync, ~0ms)     : SC                  ← required by all (sets up FB app)
     P0 (sync)           : navGo('sales')      ← paint UI shell immediately
     P1 (next frame)     : SCALE, CT, PP       ← Scale subtab dependencies
     P2 (idle ~80ms)     : SP, TL              ← supporting sales data
     P3 (idle ~200ms)    : TP, TMR             ← plan tables (also lazy-built on demand)
     P4 (idle ~400ms)    : WG, WS, ENG, MC,    ← other pages
                           STAFF, Fleet subs

   Notes
     • SC.init() MUST be P0 because it calls firebase.initializeApp()
       and every other module depends on firebase.database() being ready.
     • PP.init() is scheduled after CT.init() in P1 because the Price
       module references Customer data when rendering.
     • Plan tables (TP/TMR) build their Tabulator instances lazily inside
       navGo() the first time the user opens Sales → Plan; here we only
       need to load their cache + attach FB listeners.
     • Each step is wrapped in try/catch so one failing module never
       breaks the chain.
   ============================================================ */
/* ============================================================
   SCX2 — SCALE "OPERATIONS CONSOLE v2.1" (v4.36.1)
   ------------------------------------------------------------
   Layout module per the approved console mockup, revised after
   on-site feedback (24" screenshots):
   • NO pipe manifold (removed as visual noise).
   • NO right rail — PLAN PROGRESS · QUEUE · EXPIRED CERTS sit in
     one info row UNDER the 4 bays, so the yard has no dead space
     and the layout stacks cleanly on 13" laptops.
   • CERT CHECK card retired: its search input lives in the
     EXPIRED CERTS header; results render as an overlay dropdown.
   • XFER card retired from view: each tank card gains an
     opening-stock mini-row + per-tank action buttons that drive
     the SAME INV modals (INV.view(sloc) then open…). The hidden
     legacy card keeps its DOM so INV internals are untouched.
   All moves are appendChild relocations — every id / handler
   survives. NO new Firebase reads or writes. Missing anchor →
   init aborts and the legacy layout stays (fail-safe).
   ============================================================ */
