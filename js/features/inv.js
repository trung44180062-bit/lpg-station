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
    /* v4.113 — bản nháp tồn đầu hệ thống của bảng ⚖ / ô thông báo Tank Mix */
    try{ _stxAttachDrafts(); }catch(e){ console.warn('[INV] stx draft attach', e); }
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
    }, err=>{ if(typeof fbErr==='function') fbErr(err,'Load inventory'); else console.warn('[INV] fb listen', err); });
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
  /* v4.108 — thêm tiền tố 'stx' (Stock-transfer reconciliation) vào danh sách
     modal do INV sở hữu, không thì bấm × / Close không đóng được bảng đó. */
  function closeAll(){ document.querySelectorAll('.modal-bg').forEach(m=>{
    if(m.id.indexOf('inv')===0 || m.id.indexOf('stx')===0) m.classList.remove('on'); }); }
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
      .catch(e=>{ if(typeof fbErr==='function') fbErr(e,'Opening stock'); else { console.warn('[INV] saveInit',e); toast('Failed to save initial stock','er'); } });
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
      .catch(e=>{ if(typeof fbErr==='function') fbErr(e,'%wt C3'); else { console.warn('[INV] saveWt',e); toast('Failed to save %wt','er'); } });
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
  let _exportPick = '2100';
  let _exportDate = '';                 // dmy 'dd/mm/yy' — date being split
  let _exportRows = [];                 // {doNo, cust, lpg, c3, c4, sel}
  let _exportMeta = { sloc:'2100', pctC3:0, dmy:'' };

  /* dmy 'dd/mm/yy' ↔ ISO 'yyyy-mm-dd' (for the <input type="date">) */
  function _dmyToISO(dmy){ const m=String(dmy||'').split('/'); return m.length===3 ? '20'+m[2]+'-'+m[1]+'-'+m[0] : ''; }
  function _isoToDMY(iso){ const m=String(iso||'').split('-'); return m.length===3 ? m[2]+'/'+m[1]+'/'+m[0].slice(-2) : ''; }

  /* EXPORT detection — the TRADE column written by scale.js is authoritative
     ('Export' / 'Export (Pure)' vs 'Domestic' / 'Domestic (Pure)').
     v4 fix: the old regex /EX|.../ matched "EX" inside names like PETIMEX and
     let Domestic trucks leak in. Now: if trade is set, ONLY trade decides.
     Name fallback (whole-word) is used only when trade is blank. */
  function _isExport(r){
    const tr = String(r.trade||'').trim().toUpperCase();
    if(tr) return tr.indexOf('EXPORT')===0;   // 'EXPORT', 'EXPORT (PURE)'
    const t = (String(r.dest||'')+' '+String(r.cust||'')+' '+String(r.custFull||'')).toUpperCase();
    return /\bEXPORT\b|수출|\bXK\b|XUẤT KHẨU|XUAT KHAU/.test(t);
  }

  function openExport(){
    _exportPick = sel;       // default to the tank shown in XFER card
    _exportDate = todayDMY();             // default: today
    const di=document.getElementById('invExportDate');
    if(di) di.value=_dmyToISO(_exportDate);
    _setPick('invExportPick', _exportPick);
    _renderExport(_exportPick);
    open('invExportModal');
  }
  function pickExport(sloc){
    _exportPick = sloc;
    _setPick('invExportPick', sloc);
    _renderExport(sloc);
  }
  function pickExportDate(iso){
    const dmy=_isoToDMY(iso);
    if(!dmy) return;
    _exportDate=dmy;
    _renderExport(_exportPick);
  }
  function _renderExport(sloc){
    const c=compute(sloc);
    const pctC3=(num(c.wtC3)||DEFAULT_WT)/100;
    const suffix = sloc==='2100' ? '3501' : '3502';
    const dmy=_exportDate||todayDMY();
    const rows=[];
    if(typeof TL!=='undefined' && TL.ROWS){
      Object.values(TL.ROWS).forEach(r=>{
        if(!r || r.disabled || !r.date) return;
        if(r.date!==dmy) return;
        if(!String(r.ltank||'').toUpperCase().includes(suffix)) return;
        if(!_isExport(r)) return;                 // ⬅ EXPORT customers only (skip domestic)
        const lpg=Math.round(num(r.lpgQty));
        if(lpg<=0) return;
        /* v4.75 — mọi giá trị lưu ở dòng ĐỀU là số nguyên kg đã làm tròn, đúng
           bằng con số hiển thị. C3 = round(LPG × %wt), C4 = LPG − C3.
           Tổng ở khung summary = Σ các dòng (KHÔNG tính lại từ tổng LPG),
           nên tổng luôn khớp chi tiết, không lệch 1 kg do làm tròn 2 lần. */
        const c3=Math.round(lpg*pctC3);
        rows.push({ doNo:String(r.doNo||'—'), cust:String(r.cust||''), lpg, c3, c4:lpg-c3, sel:true });
      });
    }
    rows.sort((a,b)=>String(a.doNo).localeCompare(String(b.doNo),undefined,{numeric:true}));
    _exportRows = rows;
    _exportMeta = { sloc, pctC3, dmy };
    document.getElementById('invExportTitle').textContent='📋 Export tách C3/C4 · '+TKNAME[sloc]+' · '+dmy;
    _renderExportBody();
    _recalcExport();
  }

  /* render the per-truck rows with a select checkbox (click row or box to toggle) */
  function _renderExportBody(){
    const body=document.getElementById('invExportBody');
    if(!body) return;
    if(!_exportRows.length){
      body.innerHTML='<tr><td colspan="6" class="inv-export-empty">No EXPORT trucks on '+(_exportMeta.dmy||todayDMY())+' from '+TKNAME[_exportMeta.sloc]+'</td></tr>';
      return;
    }
    body.innerHTML=_exportRows.map((r,i)=>
      '<tr class="inv-export-row'+(r.sel?'':' off')+'" onclick="INV.toggleExportRow('+i+')">'
      +'<td class="pick"><input type="checkbox" '+(r.sel?'checked':'')+' onclick="event.stopPropagation();INV.toggleExportRow('+i+')"></td>'
      +'<td>'+r.doNo+'</td><td>'+(r.cust||'—')+'</td><td>'+fmtKg(r.lpg)+'</td>'
      +'<td class="c3">'+fmtKg(r.c3)+'</td><td class="c4">'+fmtKg(r.c4)+'</td></tr>').join('');
  }

  /* recompute totals from SELECTED rows only */
  function _recalcExport(){
    const selRows=_exportRows.filter(r=>r.sel);
    /* v4.75 — CỘNG DỒN TỪ CHI TIẾT. Tuyệt đối không tính totC3 = totLpg × %wt
       (cách cũ gây lệch 1 kg: 124.630 × 48% = 59.822,4 → 59.822 trong khi Σ các
       dòng đã làm tròn = 59.823). Chi tiết là chuẩn, tổng bám theo chi tiết. */
    const totLpg=selRows.reduce((s,r)=>s+Math.round(r.lpg),0);
    const totC3 =selRows.reduce((s,r)=>s+Math.round(r.c3),0);
    const totC4 =selRows.reduce((s,r)=>s+Math.round(r.c4),0);
    const sumEl=document.getElementById('invExportSum');
    if(sumEl){
      const cntTxt = (_exportRows.length && selRows.length!==_exportRows.length)
        ? selRows.length+' / '+_exportRows.length : String(selRows.length);
      sumEl.innerHTML=
        '<div class="box"><span class="k">SỐ XE</span><span class="v">'+cntTxt+'</span></div>'+
        '<div class="box"><span class="k">TỔNG LPG (kg)</span><span class="v lpg">'+fmtKg(totLpg)+'</span></div>'+
        '<div class="box"><span class="k">TỔNG C3 (kg)</span><span class="v c3">'+fmtKg(totC3)+'</span></div>'+
        '<div class="box"><span class="k">TỔNG C4 (kg)</span><span class="v c4">'+fmtKg(totC4)+'</span></div>';
    }
    /* keep the "select all" header box in sync */
    const allBox=document.getElementById('invExportAll');
    if(allBox){
      allBox.checked = _exportRows.length>0 && selRows.length===_exportRows.length;
      allBox.indeterminate = selRows.length>0 && selRows.length<_exportRows.length;
    }
  }

  function toggleExportRow(i){
    if(!_exportRows[i]) return;
    _exportRows[i].sel=!_exportRows[i].sel;
    _renderExportBody();
    _recalcExport();
  }
  function toggleExportAll(on){
    _exportRows.forEach(r=>{ r.sel=!!on; });
    _renderExportBody();
    _recalcExport();
  }

  /* ── LPG → C3/C4 split calculator ──
     Operator enters a TOTAL LPG (kg); we split it into C3/C4 using the tank's
     ALREADY-DECLARED %wt C3 (override → init.wtC3 → default). Pure RAM calc,
     no Firebase write. C3 = total × %wt ; C4 = total − C3. */
  let _splitPick = '2100';
  let _splitTSV  = '';
  function _splitWtFor(sloc){ return num(compute(sloc).wtC3) || DEFAULT_WT; }
  function openSplit(){
    _splitPick = sel;
    _setPick('invSplitPick', _splitPick);
    const wt = _splitWtFor(_splitPick);
    document.getElementById('invSplitWt').value = (+wt.toFixed(1)) + ' %';
    document.getElementById('invSplitTotal').value = '';
    _splitTSV = '';
    calcSplit();
    open('invSplitModal');
  }
  function pickSplit(sloc){
    _splitPick = sloc;
    _setPick('invSplitPick', sloc);
    const wt = _splitWtFor(sloc);
    document.getElementById('invSplitWt').value = (+wt.toFixed(1)) + ' %';
    calcSplit();
  }
  function calcSplit(){
    const out = document.getElementById('invSplitResult');
    if(!out) return;
    const total = num(document.getElementById('invSplitTotal').value);
    const pct   = _splitWtFor(_splitPick) / 100;
    const c3 = total * pct, c4 = total - c3;
    out.innerHTML =
      '<div class="box"><span class="k">TỔNG LPG (kg)</span><span class="v lpg">'+fmtKg(total)+'</span></div>'+
      '<div class="box"><span class="k">C3 (kg)</span><span class="v c3">'+fmtKg(c3)+'</span></div>'+
      '<div class="box"><span class="k">C4 (kg)</span><span class="v c4">'+fmtKg(c4)+'</span></div>';
    _splitTSV = ['Tank','%wtC3','Tong_LPG_kg','C3_kg','C4_kg'].join('\t')+'\n'+
      [TKNAME[_splitPick], +(pct*100).toFixed(1), Math.round(total), Math.round(c3), Math.round(c4)].join('\t');
  }
  function copySplit(){
    if(!num(document.getElementById('invSplitTotal').value)){ toast('Nhập tổng LPG trước','er'); return; }
    try{ navigator.clipboard.writeText(_splitTSV); toast('✓ Đã copy kết quả','ok'); }
    catch(_){ toast('Copy failed','er'); }
  }
  /* ══════════════════════════════════════════════════════════════════════
     v4.108 — ⚖ STOCK-TRANSFER RECONCILIATION  (nút 📏 trên thẻ tank)
     ----------------------------------------------------------------------
     BÀI TOÁN
     Check Booth chuyển kho lên hệ thống bằng con số Filled C3/C4 theo COQ.
     Nhưng INIT VOL và FINAL VOL trên Tank Log là số ĐO ĐƯỢC bằng thiết bị,
     nên nhân với nền COQ (ρ, %wt C3) sẽ ra tồn C3/C4 THỰC SỰ trong bồn ở
     hai mốc đầu và cuối mẻ. Tồn ĐẦU thực tế thường lệch tồn ĐẦU trên hệ
     thống. Nếu cứ chuyển đúng số COQ thì cái lệch đó nằm nguyên ở tồn CUỐI.

     CÁCH CÂN
        System closing  =  System opening + Transfer
        muốn            =  Actual closing
        ⇒ Transfer      =  Actual closing − System opening
     Đúng ví dụ của vận hành: thực tồn đầu 10, hệ thống 20, COQ nạp 100
        Actual closing = 10 + 100 = 110  ⇒  Transfer = 110 − 20 = 90.

     NGUỒN SỐ (bảng hiện đủ, mỗi khối một nhãn nguồn)
       • Actual   ← Tank Log: INIT/FINAL VOL × ρ_COQ × %wt C3  (ENG.actualSplit)
       • Filled   ← Tank Log cột [66]/[67] — số COQ chính thức
       • Notified ← /mix_notify, chính là số Check Booth đang thấy
       • System   ← SAP End Stock (SP.ROWS) khi đủ điều kiện, không thì gõ tay

     LUẬT LẤY SAP END STOCK  (chốt của vận hành)
       Chỉ tự lấy khi giờ FINISH nằm NGOÀI 08:00–19:00 — lúc đó nhà máy
       không xuất hàng nên End Stock của ngày đó đúng bằng tồn hệ thống ngay
       trước bút toán chuyển kho.
         finish ≥ 19:00      →  End Stock NGÀY FINISH
         finish <  08:00     →  End Stock NGÀY FINISH − 1  (ca đêm của hôm trước)
         08:00 ≤ finish < 19:00 → KHÔNG tự lấy, bắt gõ tay và nói rõ lý do
       Ví dụ: TK-3501 xong 23:00 ngày 9 và TK-3502 xong 01:00 ngày 10 thì cả
       hai đều lấy End Stock NGÀY 9 — đúng như vận hành mô tả.

     TẤT CẢ TÍNH TRÊN MÁY. Không ghi Firebase, không đụng /mix_notify —
     bảng chỉ GỢI Ý con số, Check Booth vẫn tự gõ khi chuyển kho.
     Đơn vị hiển thị: KG (cùng đơn vị SAP và thông báo), kèm dòng tấn.
     ══════════════════════════════════════════════════════════════════════ */
  const _STX_SLOCS = ['2100','2101'];
  const _STX_TKNUM = { '2100':'3501', '2101':'3502' };
  let _stxTSV    = '';
  const _stxLotIn  = { '2100':'', '2101':'' };   // lot người dùng gõ đè

  /* ══ v4.113 — TỒN ĐẦU HỆ THỐNG GÕ TAY: BẢN NHÁP LƯU TẠM TRÊN FIREBASE ══
     v4.111 để con số này trong RAM và CHỈ MỘT ô cho mỗi bồn. Hai lỗ hổng:
       ① Bồn vừa trộn xong mẻ mới ⇒ thông báo lot mới đẩy vào, số đang gõ dở
          của lot CŨ bị đè mất — dù thông báo của lot cũ vẫn còn nguyên trên
          /mix_notify (nó khoá theo TỪNG LOT).
       ② F5, đổi ca, hay người bấm ✅ ngồi máy khác ⇒ mất trắng.
     Nay: khoá theo BỒN + LOT (nhiều lot cùng tồn tại song song, đúng như 4
     ô thông báo có thể là 4 lot khác nhau), và ghi tạm lên
     /stx_draft/<TK>_<LOT>. Bản nháp bị XOÁ ngay khi kết quả đối chiếu đã
     được lưu vào Tank Log (nút 💾 hoặc ✅ ở ô thông báo) — Tank Log mới là
     nơi lưu chính thức, nháp không được phép tích lại theo thời gian.
     Nháp quá hạn (mặc định 30 ngày) cũng bị dọn khi nạp: một thông báo trộn
     được trả lời trong vài giờ, nháp cả tháng chỉ còn là rác. */
  const _STX_DRAFT_PATH = 'stx_draft';
  const _STX_DRAFT_TTL  = 30*24*3600*1000;     /* 30 ngày */
  const _stxSys   = Object.create(null);   /* 'sloc|LOT' → {sloc,lot,c3,c4,by,ts} */
  const _stxPushT = Object.create(null);   /* hẹn giờ gộp ghi cho từng khoá */
  let   _stxFbRef = null;

  function _stxKey(sloc, lot){ return String(sloc)+'|'+String(lot||'').trim().toUpperCase(); }
  /* Khoá Firebase: "TK-3501_LPG-2026-900". Firebase cấm . # $ / [ ] */
  function _stxFbKey(sloc, lot){
    return String((TKNAME[sloc]||sloc)+'_'+String(lot||'').trim()).replace(/[.#$/\[\]]/g,'_');
  }
  function _stxN(v){
    if(v === '' || v === null || v === undefined) return null;
    /* Bỏ cả dấu phẩy LẪN khoảng trắng: nhân viên hay gõ "20 000" hoặc dán
       "20,000" từ SAP. Ô nhập là type=text nên hai dạng đó tới được đây. */
    const x = parseFloat(String(v).replace(/[,\s]/g,''));
    return isFinite(x) ? x : null;
  }
  /* Số gõ tay ĐANG CÓ HIỆU LỰC cho đúng bồn + lot này, hoặc null. */
  function _stxManualOf(sloc, lot){
    const l = String(lot||'').trim();
    if(!l) return null;
    /* CỐ Ý: xoá trắng cả hai ô VẪN là "đang gõ tay" — người dùng đang tự
       nhập, đừng lặng lẽ nhét số SAP trở lại vào ô họ vừa xoá. */
    return _stxSys[_stxKey(sloc, l)] || null;
  }
  function _stxStore(sloc, lot, c3, c4){
    const l = String(lot||'').trim();
    if(!l) return;                       /* chưa biết lot thì không có gì để lưu */
    _stxSys[_stxKey(sloc, l)] = { sloc:String(sloc), lot:l, c3:_stxN(c3), c4:_stxN(c4),
                                  by:by(), ts:Date.now() };
    _stxPushDraft(sloc, l);
  }
  /* Bỏ bản nháp của MỘT lot — gọi khi đã lưu vào Tank Log, hoặc khi người
     dùng bấm ⟳ để quay lại số SAP. */
  function _stxDrop(sloc, lot){
    const l = String(lot||'').trim(); if(!l) return;
    const k = _stxKey(sloc, l);
    delete _stxSys[k];
    if(_stxPushT[k]){ clearTimeout(_stxPushT[k]); delete _stxPushT[k]; }
    _stxRemoveDraft(sloc, l);
  }
  /* Ghi GỘP: gõ từng chữ số không được đẻ ra một lượt ghi Firebase. */
  function _stxPushDraft(sloc, lot){
    const k = _stxKey(sloc, lot);
    if(_stxPushT[k]) clearTimeout(_stxPushT[k]);
    _stxPushT[k] = setTimeout(()=>{
      delete _stxPushT[k];
      const m = _stxSys[k];
      if(!m || !_stxFbRef) return;
      try{
        _stxFbRef.child(_stxFbKey(m.sloc, m.lot)).set({
          sloc:String(m.sloc), lot:String(m.lot),
          c3:(m.c3 === null ? null : m.c3), c4:(m.c4 === null ? null : m.c4),
          by:String(m.by||''), ts:+m.ts || Date.now()
        }).catch(e=>{
          console.warn('[INV] stx draft push', e);
          toast('⚠ Could not save the system-opening draft to the server — it is kept on this machine only','warn');
        });
      }catch(e){ console.warn('[INV] stx draft push', e); }
    }, 700);
  }
  function _stxRemoveDraft(sloc, lot){
    if(!_stxFbRef) return;
    try{ _stxFbRef.child(_stxFbKey(sloc, lot)).remove()
      .catch(e=>console.warn('[INV] stx draft remove', e)); }
    catch(e){ console.warn('[INV] stx draft remove', e); }
  }
  /* Nạp bản nháp từ Firebase. Bản ĐANG GÕ ở máy này (ts mới hơn) được GIỮ,
     không để một lượt đẩy về của chính mình nuốt mất mấy chữ số vừa gõ. */
  function _stxAttachDrafts(){
    const h = fb(); if(!h || _stxFbRef) return;
    _stxFbRef = h.ref(_STX_DRAFT_PATH);
    _stxFbRef.on('value', snap=>{
      const all = snap.val() || {};
      const seen = Object.create(null);
      const stale = [];
      Object.keys(all).forEach(fk=>{
        const v = all[fk]; if(!v || typeof v !== 'object') return;
        const sloc = String(v.sloc||''), lot = String(v.lot||'').trim();
        /* ⚠ _stxSys là Object.create(null) — KHÔNG có hasOwnProperty. Đừng
           bao giờ gọi phương thức của Object trên nó. */
        if(!sloc || !lot || !TKNAME[sloc]) return;
        const ts = +v.ts || 0;
        if(ts && (Date.now() - ts) > _STX_DRAFT_TTL){ stale.push(fk); return; }
        const k = _stxKey(sloc, lot);
        seen[k] = 1;
        const cur = _stxSys[k];
        if(cur && (+cur.ts||0) >= ts) return;      /* bản ở máy này mới hơn */
        _stxSys[k] = { sloc:sloc, lot:lot, c3:_stxN(v.c3), c4:_stxN(v.c4),
                       by:String(v.by||''), ts:ts };
      });
      /* Bản nháp đã bị máy khác xoá (vì đã lưu xong vào Tank Log) thì bỏ
         luôn ở đây — trừ bản đang chờ ghi của chính máy này. */
      Object.keys(_stxSys).forEach(k=>{ if(!seen[k] && !_stxPushT[k]) delete _stxSys[k]; });
      if(stale.length){
        console.warn('[INV] stx draft: dọn '+stale.length+' bản nháp quá hạn');
        stale.forEach(fk=>{ try{ _stxFbRef.child(fk).remove().catch(()=>{}); }catch(_){} });
      }
      _stxSyncViews(true);
    }, err=>{
      console.warn('[INV] stx draft listen', err);
      if(typeof fbErr === 'function') fbErr(err, 'Load reconciliation drafts');
    });
  }
  /* Vẽ lại CẢ HAI cửa sổ — mỗi cửa sổ CHỈ vẽ khi đang mở. Vẽ một modal
     đang đóng là công toi, và với ô thông báo thì mỗi lượt vẽ là 4 thẻ,
     mỗi thẻ quét lại Tank Log. NOTIF.open() tự gọi MIXNOTIFY.render() lúc
     mở nên không sợ mở ra thấy số cũ. */
  function _stxNotifOpen(){
    try{ const m = document.getElementById('notif-modal');
         return !!(m && m.classList.contains('on')); }catch(_){ return false; }
  }
  function _stxRenderNotif(){
    if(!_stxNotifOpen()) return;
    try{ if(typeof MIXNOTIFY !== 'undefined' && MIXNOTIFY.render) MIXNOTIFY.render(); }catch(_){}
  }
  function _stxSyncViews(refillModal){
    try{
      const m = document.getElementById('stxModal');
      if(m && m.classList.contains('on')) renderStx(refillModal !== false);
    }catch(_){}
    _stxRenderNotif();
  }
  /* API cho MIXNOTIFY: gõ ở ô thông báo = gõ ở bảng đối chiếu. */
  function stxSetSys(sloc, lot, c3, c4){ _stxStore(sloc, lot, c3, c4); _stxSyncViews(true); }
  function stxSlocOf(tkName){
    const d = String(tkName || '').replace(/\D/g, '');
    if(d.indexOf('3501') >= 0) return '2100';
    if(d.indexOf('3502') >= 0) return '2101';
    return '';
  }

  /* ---------- helpers ---------- */
  function _stxLotKey(s){
    const m = String(s||'').match(/(?:LPG-)?(\d{4})-?(\d+)/i);
    if(m) return parseInt(m[1])*1e6 + parseInt(m[2]);
    const n = parseInt(s); return isNaN(n) ? 0 : n;
  }
  function _stxRows(){
    try{ return (typeof ENG !== 'undefined' && ENG.ROWS) ? ENG.ROWS : []; }catch(_){ return []; }
  }
  /* Thông báo finish-mixing đang treo của bồn này (mới nhất theo lot) */
  function _stxNotify(sloc){
    let pend = null;
    try{ pend = (typeof MIXNOTIFY !== 'undefined') ? MIXNOTIFY.PENDING : null; }catch(_){}
    if(!pend) return null;
    const want = _STX_TKNUM[sloc];
    let best = null;
    Object.keys(pend).forEach(pk=>{
      const it = pend[pk]; if(!it) return;
      if(String(it.tkName||'').replace(/\D/g,'') !== want) return;
      if(!best || _stxLotKey(it.lot) > _stxLotKey(best.lot)) best = it;
    });
    return best;
  }
  /* Lot đang xét + nó từ đâu ra */
  function _stxPickLot(sloc){
    if(_stxLotIn[sloc]) return { lot:_stxLotIn[sloc], src:'typed', srcTxt:'typed in' };
    const nt = _stxNotify(sloc);
    if(nt && nt.lot) return { lot:String(nt.lot), src:'notify', srcTxt:'pending mix notification' };
    try{
      const cfg = (typeof SCALE !== 'undefined' && SCALE.getTkCfg) ? SCALE.getTkCfg() : null;
      const l = cfg ? String((sloc === '2100' ? cfg.tk1 : cfg.tk2)?.lot || '').trim() : '';
      if(l) return { lot:l, src:'scale', srcTxt:'lot on the tank card' };
    }catch(_){}
    const want = _STX_TKNUM[sloc];
    let best = null;
    _stxRows().forEach(r=>{
      if(!r || String(r[2]||'').replace(/\D/g,'') !== want) return;
      if(!best || _stxLotKey(r[1]) > _stxLotKey(best[1])) best = r;
    });
    return best ? { lot:String(best[1]||''), src:'latest', srcTxt:'latest lot in the Tank Log' }
                : { lot:'', src:'none', srcTxt:'' };
  }
  /* So lot: người dùng quen gõ SỐ TRẦN ("901") trong khi Tank Log lưu đủ
     "LPG-2026-901" — y như ô LOT trên thẻ tank. Gõ số trần thì so phần số
     đuôi; gõ đủ chuỗi thì so khoá năm+số. Nhiều năm cùng số thì lấy lot mới
     nhất, không im lặng chọn bừa. */
  function _stxLotMatch(rowLot, want){
    const wtxt = String(want||'').trim();
    if(!wtxt) return false;
    if(/^\d+$/.test(wtxt)){
      const m = String(rowLot||'').match(/(\d+)\s*$/);
      return !!m && parseInt(m[1], 10) === parseInt(wtxt, 10);
    }
    return _stxLotKey(rowLot) === _stxLotKey(wtxt);
  }
  function _stxFindRow(sloc, lot){
    const want = _STX_TKNUM[sloc];
    if(!String(lot||'').trim()) return null;
    let best = null;
    _stxRows().forEach(r=>{
      if(!r || String(r[2]||'').replace(/\D/g,'') !== want) return;
      if(!_stxLotMatch(r[1], lot)) return;
      if(!best || _stxLotKey(r[1]) > _stxLotKey(best[1])) best = r;
    });
    return best;
  }
  /* DD/MM/YY | YYYY-MM-DD → YYYY-MM-DD (khuôn của SP.ROWS.date) */
  function _stxIso(v){
    const s = String(v||'').trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return m[1]+'-'+m[2]+'-'+m[3];
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if(!m) return '';
    const yr = m[3].length === 4 ? m[3] : '20'+m[3];
    return yr+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0');
  }
  function _stxShift(iso, days){
    if(!iso) return '';
    const d = new Date(iso+'T00:00:00'); if(isNaN(d.getTime())) return '';
    d.setDate(d.getDate()+days);
    const p = n => String(n).padStart(2,'0');
    return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
  }
  function _stxDmy(iso){
    const m = String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? m[3]+'/'+m[2]+'/'+m[1].slice(2) : (iso||'');
  }
  /* Mốc SAP được dán / sửa lần cuối — "số của ngày 09/08" và "số này được
     dán lúc nào" là HAI chuyện khác nhau: bản dán từ tuần trước nhìn giống
     hệt bản vừa dán sáng nay, mà chỉ bản mới mới phản ánh đúng bút toán. */
  function _stxWhen(ms){
    const t = +ms || 0; if(!t) return '';
    const d = new Date(t); if(isNaN(d.getTime())) return '';
    const p = n => String(n).padStart(2,'0');
    return p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+String(d.getFullYear()).slice(-2)
         + ' ' + p(d.getHours())+':'+p(d.getMinutes());
  }
  function _stxSapStamp(sap){
    if(!sap) return '';
    const when = _stxWhen(sap.lastAt);
    if(!when) return '<span class="stamp warn">SAP data has no paste timestamp (pasted by an older version)</span>';
    return '<span class="stamp">SAP data pasted ' + when
         + (sap.lastBy ? ' by ' + _esc2(sap.lastBy) : '') + '</span>';
  }
  function _stxHm(v){
    const m = String(v||'').match(/(\d{1,2}):(\d{2})/);
    return m ? { h:parseInt(m[1]), m:parseInt(m[2]), txt:String(m[1]).padStart(2,'0')+':'+m[2] } : null;
  }

  /* ── LUẬT NGÀY SAP — tách riêng để test được mà không cần DOM ──
     Trả { ok, sapDate, finishDate, finishTxt, why }
       ok=false ⇒ không tự lấy SAP, `why` nói rõ vì sao (hiện luôn lên bảng). */
  const STX_OPEN_H = 8, STX_CLOSE_H = 19;
  function _stxSapDate(dateRaw, startRaw, finishRaw){
    const base = _stxIso(dateRaw);
    const fi = _stxHm(finishRaw), st = _stxHm(startRaw);
    if(!base)  return { ok:false, sapDate:'', finishDate:'', finishTxt:'', why:'the Tank Log row has no date' };
    if(!fi)    return { ok:false, sapDate:'', finishDate:base, finishTxt:'',
                        why:'the Tank Log row has no FINISH time' };
    /* qua đêm: giờ kết thúc nhỏ hơn giờ bắt đầu ⇒ mẻ kết thúc sang ngày hôm sau */
    const overnight = !!(st && (fi.h*60+fi.m) < (st.h*60+st.m));
    const finishDate = overnight ? _stxShift(base, 1) : base;
    if(fi.h >= STX_OPEN_H && fi.h < STX_CLOSE_H)
      return { ok:false, sapDate:'', finishDate:finishDate, finishTxt:fi.txt, overnight:overnight,
               why:'mixing finished at '+fi.txt+', inside operating hours ('
                   +String(STX_OPEN_H).padStart(2,'0')+':00–'+STX_CLOSE_H+':00) — '
                   +'SAP End Stock of that day is not the opening balance for this transfer' };
    /* trước 08:00 = ca đêm của NGÀY HÔM TRƯỚC */
    const sapDate = (fi.h < STX_OPEN_H) ? _stxShift(finishDate, -1) : finishDate;
    return { ok:true, sapDate:sapDate, finishDate:finishDate, finishTxt:fi.txt, overnight:overnight,
             why:(fi.h < STX_OPEN_H)
                  ? 'finished at '+fi.txt+' (night shift) → SAP End Stock of the previous day'
                  : 'finished at '+fi.txt+' (after '+STX_CLOSE_H+':00) → SAP End Stock of the same day' };
  }

  /* ── Gom toàn bộ dữ liệu của MỘT BỒN ──
     lotOverride: phía gọi đã biết chắc lot (ô thông báo Tank Mix cầm sẵn
     lot của chính thông báo đó) ⇒ khỏi đoán lại. */
  function _stxCtx(sloc, lotOverride){
    const pick = (lotOverride != null && String(lotOverride).trim())
      ? { lot:String(lotOverride).trim(), src:'given', srcTxt:'the notification being handled' }
      : _stxPickLot(sloc);
    const row  = pick.lot ? _stxFindRow(sloc, pick.lot) : null;
    const ctx  = { sloc:sloc, tank:TKNAME[sloc], lot:pick.lot, lotSrc:pick.src, lotSrcTxt:pick.srcTxt,
                   row:row, split:null, notify:_stxNotify(sloc), sap:null, day:null,
                   coqC3:null, coqC4:null };
    if(!row) return ctx;
    /* v4.111 — CHUẨN HOÁ LOT VỀ ĐÚNG CHUỖI TRONG TANK LOG.
       Nhân viên quen gõ số trần ("900") trong khi Tank Log lưu đủ
       "LPG-2026-900". Chip lot trên tiêu đề, thông báo lưu và lệnh ghi vào
       Tank Log đều phải nói ĐÚNG tên lot chính thức, không phải mấy chữ số
       vừa gõ — nếu không, nhìn lại lịch sử sẽ không biết là lot nào. */
    if(row[1]) ctx.lot = String(row[1]).trim();
    try{ ctx.split = (typeof ENG !== 'undefined' && ENG.actualSplit) ? ENG.actualSplit(row) : null; }catch(_){}
    const q3 = parseFloat(row[66]), q4 = parseFloat(row[67]);
    ctx.coqC3 = isFinite(q3) ? q3 : null;
    ctx.coqC4 = isFinite(q4) ? q4 : null;
    ctx.day = _stxSapDate(row[3], row[4], row[5]);
    if(ctx.day.ok){
      try{
        ctx.sap = (typeof SP !== 'undefined' && SP.tankEnd) ? SP.tankEnd(sloc, ctx.day.sapDate) : null;
      }catch(_){ ctx.sap = null; }
    }
    return ctx;
  }

  /* ── TỒN ĐẦU HỆ THỐNG: gõ tay đè, không thì SAP theo luật giờ finish ──
     THUẦN TÍNH — không đụng DOM, để ô thông báo dùng chung được. */
  function _stxSysPick(sloc, ctx){
    const lot = ctx && ctx.lot ? ctx.lot : '';
    const man = _stxManualOf(sloc, lot);
    const day = ctx && ctx.day, sap = ctx && ctx.sap;
    if(man) return { c3:man.c3, c4:man.c4, tag:'manual', manual:true };
    if(!ctx || !ctx.row)             return { c3:null, c4:null, tag:'none', manual:false };
    if(day && day.ok && sap && sap.has)
      return { c3:Math.round(sap.c3), c4:Math.round(sap.c4), tag:'sap', manual:false };
    if(day && day.ok)                return { c3:null, c4:null, tag:'sap-missing', manual:false };
    return { c3:null, c4:null, tag:'manual-required', manual:false };
  }

  /* ══ v4.111 — MỘT HÀM TÍNH DUY NHẤT CHO CẢ HAI MÀN HÌNH ══════════════
     Bảng ⚖ đối chiếu và ô thông báo Tank Mix trước đây tính rời nhau nên
     rất dễ trôi lệch. Giờ cả hai gọi đúng hàm này. THUẦN TÍNH, không đụng
     DOM, đơn vị KG (cùng đơn vị SAP và thông báo Check Booth).
       ok=false ⇒ `why` nói rõ vì sao chưa tính được:
         'no-row'  chưa tìm ra dòng Tank Log của lot
         'no-coq'  dòng có rồi nhưng thiếu nền COQ (miss = ô còn thiếu)   */
  function _stxFigures(sloc, lotOverride){
    const ctx = _stxCtx(sloc, lotOverride);
    const F = { ctx:ctx, sloc:sloc, lot:ctx.lot, tank:ctx.tank,
                ok:false, why:'', miss:'',
                aOpC3:null, aOpC4:null, aClC3:null, aClC4:null,
                fC3:null, fC4:null, fSrc:'',
                sysC3:null, sysC4:null, sysTag:'none', sysManual:false, hasSys:false,
                gapC3:null, gapC4:null, xC3:null, xC4:null };
    const sys = _stxSysPick(sloc, ctx);
    F.sysC3 = sys.c3; F.sysC4 = sys.c4; F.sysTag = sys.tag; F.sysManual = sys.manual;
    F.hasSys = (sys.c3 !== null && sys.c4 !== null);
    if(!ctx.row){ F.why = 'no-row'; return F; }
    const s = ctx.split;
    if(!s || !s.openOk || !s.endOk){
      F.why  = 'no-coq';
      F.miss = (s && s.miss.length) ? s.miss.join(' · ') : 'COQ density / %wt C3';
      return F;
    }
    const T = v => (v === null ? null : v * 1000);      /* tấn → kg */
    F.aOpC3 = T(s.openC3); F.aOpC4 = T(s.openC4);
    F.aClC3 = T(s.endC3);  F.aClC4 = T(s.endC4);
    /* Filled: ưu tiên cột [66]/[67] đã lưu (số COQ CHÍNH THỨC) */
    F.fC3 = ctx.coqC3 !== null ? ctx.coqC3*1000 : (F.aClC3 - F.aOpC3);
    F.fC4 = ctx.coqC4 !== null ? ctx.coqC4*1000 : (F.aClC4 - F.aOpC4);
    F.fSrc = ctx.coqC3 !== null ? 'Tank Log C3/C4 ◈COQ' : 'closing − opening';
    F.ok = true;
    if(F.hasSys){
      F.gapC3 = F.aOpC3 - F.sysC3;   F.gapC4 = F.aOpC4 - F.sysC4;
      F.xC3   = F.aClC3 - F.sysC3;   F.xC4   = F.aClC4 - F.sysC4;
    }
    return F;
  }

  /* ---------- render ---------- */
  function _stxNum(v, dp){
    if(v === null || v === undefined || !isFinite(v)) return '—';
    return (+v).toLocaleString('en-US', { minimumFractionDigits:dp||0, maximumFractionDigits:dp||0 });
  }
  function _stxSigned(v){
    if(v === null || v === undefined || !isFinite(v)) return '—';
    const r = Math.round(v);
    return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r).toLocaleString('en-US');
  }
  function _stxSignCls(v){
    if(v === null || v === undefined || !isFinite(v)) return '';
    return Math.abs(v) < 1 ? 'z' : (v > 0 ? 'p' : 'm');
  }
  /* v4.114 — `key` gắn nhãn data-c lên từng ô số, để lúc nhân viên đang GÕ
     ta cập nhật đúng mấy ô đó thay vì dựng lại cả bảng (dựng lại là phải
     chuyển hai ô <input> đi chỗ khác, và chuyển ô đang focus trong DOM là
     trình duyệt cắt focus — gõ một chữ số là ô "đơ" ra). */
  function _stxRow(cls, label, note, vol, c3, c4, lpg, key){
    const dk = k => key ? (' data-c="'+key+'-'+k+'"') : '';
    const noteHtml = (note || key)
      ? ('<i'+(key ? ' data-c="'+key+'-note"' : '')+'>'+(note||'')+'</i>') : '';
    return '<tr class="'+cls+'">'
      + '<td class="lbl">'+label+noteHtml+'</td>'
      + '<td class="n vol"'+dk('v')+'>'+vol+'</td>'
      + '<td class="n"'+dk('3')+'>'+c3+'</td><td class="n"'+dk('4')+'>'+c4+'</td>'
      + '<td class="n tot"'+dk('t')+'>'+lpg+'</td></tr>';
  }

  function openStx(n){
    const first = (n === 2 || n === '2101') ? '2101' : '2100';
    /* v4.111 — CHỈ xoá lot gõ đè. Số tồn đầu gõ tay thì GIỮ: nhân viên có
       thể vừa gõ nó ở ô thông báo Tank Mix rồi mới mở bảng này lên xem chi
       tiết — mở bảng mà mất số vừa gõ là hỏng đúng luồng làm việc đó. */
    _STX_SLOCS.forEach(sl=>{ _stxLotIn[sl] = ''; });
    const wrap = document.getElementById('stxGrid');
    if(wrap){
      const a = document.getElementById('stxPane2100'), b = document.getElementById('stxPane2101');
      if(a && b) wrap.appendChild(first === '2100' ? b : a);
    }
    _STX_SLOCS.forEach(sl=>{
      const li = document.getElementById('stxLot'+sl);
      if(li) li.value = '';
    });
    renderStx(true);
    open('stxModal');
  }
  /* Người dùng gõ lot khác → đổi ngữ cảnh, và bỏ luôn cờ "đã gõ tay"
     để System opening được nạp lại theo lot mới. */
  function stxLotChange(sloc){
    const li = document.getElementById('stxLot'+sloc);
    _stxLotIn[sloc] = li ? li.value.trim() : '';
    renderStx(true);
    _stxRenderNotif();
  }
  /* Gõ ở ô System opening của bảng → cất vào kho dùng chung → ô thông báo
     Tank Mix đổi theo ngay. refill=false để không giật con trỏ đang gõ. */
  function stxSysEdit(sloc){
    const e3 = document.getElementById('stxSys3'+sloc);
    const e4 = document.getElementById('stxSys4'+sloc);
    const ctx = _stxCtx(sloc);
    _stxStore(sloc, ctx.lot, e3 ? e3.value : '', e4 ? e4.value : '');
    /* v4.114 — cập nhật TẠI CHỖ. renderStx() ở đây là thứ đã làm ô nhập
       mất focus sau mỗi chữ số (xem chú thích ở _stxLive). */
    _stxLive(sloc);
    _stxRenderNotif();
  }
  /* ⟳ — bỏ số gõ tay, quay lại số SAP tự lấy. v4.113: xoá luôn bản nháp
     trên Firebase, nếu không lần nạp sau nó lại đẩy con số vừa bỏ trở về. */
  function stxSysReset(sloc){
    try{ const ctx = _stxCtx(sloc); _stxDrop(sloc, ctx.lot); }catch(_){}
    renderStx(true);
    _stxRenderNotif();
  }

  /* refill = có được phép ghi đè ô System opening bằng số SAP hay không.
     Khi người dùng đang gõ thì KHÔNG bao giờ ghi đè (mất số đang gõ). */
  /* ── v4.114 — CHÂN VÙNG (khối đề xuất) tách riêng ─────────────────────
     Dùng chung cho lượt vẽ đầy đủ và lượt cập nhật-khi-đang-gõ, nên hai
     đường không thể hiện ra hai con số khác nhau. */
  function _stxFootHtml(sloc, F){
    const saved = _stxSavedOf(F.ctx);
    if(!F.hasSys){
      return '<div class="stx-sug stx-sug-off">Enter the <b>system opening stock</b> above to get the suggested '
        + 'transfer quantity.'
        + (saved.has ? '<div class="stx-saved on">'+saved.txt+'</div>' : '')
        + '</div>';
    }
    const N   = v => _stxNum(v, 0);
    const xC3 = F.xC3, xC4 = F.xC4, xL = xC3 + xC4;
    const fC3 = F.fC3, fC4 = F.fC4;
    return '<div class="stx-sug">'
      + '<div class="stx-sug-hd">➜ SUGGESTED STOCK TRANSFER'
      +   '<span>actual closing − system opening</span></div>'
      + '<div class="stx-sug-vals">'
      +   '<div class="v c3"><span class="k">C3</span><b>'+N(xC3)+'</b><i>kg</i></div>'
      +   '<div class="v c4"><span class="k">C4</span><b>'+N(xC4)+'</b><i>kg</i></div>'
      +   '<div class="v lpg"><span class="k">LPG</span><b>'+N(xL)+'</b><i>kg</i></div>'
      + '</div>'
      + '<div class="stx-sug-t">= '+_stxNum(xC3/1000,3)+' t C3 · '+_stxNum(xC4/1000,3)+' t C4 · '
      +   _stxNum(xL/1000,3)+' t LPG</div>'
      + '<div class="stx-sug-vs">COQ figure is <b>'+N(fC3)+'</b> / <b>'+N(fC4)+'</b> kg → adjust by '
      +   '<b class="'+_stxSignCls(xC3-fC3)+'">'+_stxSigned(xC3-fC3)+'</b> / '
      +   '<b class="'+_stxSignCls(xC4-fC4)+'">'+_stxSigned(xC4-fC4)+'</b> kg'
      +   ((xC3 < 0 || xC4 < 0)
            ? '<br><span class="warn">⚠ A suggested figure is NEGATIVE — the system already holds more than '
              + 'the tank actually contains. Check the system opening figure before posting.</span>' : '')
      + '</div>'
      + '<div class="stx-save-row">'
      +   '<button class="stx-save" onclick="INV.stxSave(\'' + sloc + '\')" '
      +     'title="Write the opening gap and the adjusted transfer quantity onto this lot in the Tank Log '
      +     '(columns Gap C3 / Gap C4 / Adj ST C3 / Adj ST C4), so the figure can be reviewed and cross-checked later">'
      +     '💾 Save to Tank Log</button>'
      +   '<span class="stx-saved '+(saved.has?'on':'')+'">'+saved.txt+'</span>'
      + '</div>'
      + '</div>';
  }

  /* ══ v4.114 — CẬP NHẬT TẠI CHỖ KHI ĐANG GÕ ═════════════════════════════
     LỖI ĐÃ SỬA: mỗi lần gõ một chữ số, `oninput` gọi renderStx → hàm này
     ghi đè `body.innerHTML`, mà trước đó phải KÉO hai ô <input> ra kho ẩn
     rồi gắn lại (`_stxPark`/`_stxMountInputs`). Element thì vẫn sống, NHƯNG
     chuyển một element ĐANG FOCUS sang cha khác là trình duyệt cắt focus —
     nên gõ được đúng một chữ số rồi ô "đơ", chữ số sau rơi ra ngoài.
     Nay đường gõ KHÔNG đụng tới innerHTML của bảng nữa: chỉ ghi lại đúng
     mấy ô số phụ thuộc (đánh dấu bằng data-c) và dựng lại phần chân. Ô nhập
     đứng yên tuyệt đối ⇒ focus và con trỏ không bao giờ mất.
     Bảng chưa dựng (lần đầu, hoặc vừa đổi lot) thì lùi về vẽ đầy đủ. */
  function _stxLive(sloc){
    const body = document.getElementById('stxBody'+sloc);
    const foot = document.getElementById('stxFoot'+sloc);
    if(!body || !foot) return;
    const tbl = body.querySelector('.stx-tbl');
    const F   = _stxFigures(sloc);
    if(!tbl || !F.ok){ renderStx(false); return; }
    const sysInfo = _stxSysFill(sloc, F.ctx, F, false);   /* refill=false: KHÔNG đụng ô nhập */
    const N  = v => _stxNum(v, 0);
    const SG = v => '<span class="'+_stxSignCls(v)+'">'+_stxSigned(v)+'</span>';
    const hasSys = F.hasSys;
    const sOpL  = hasSys ? F.sysC3 + F.sysC4 : null;
    const sClC3 = hasSys ? F.sysC3 + F.fC3 : null;
    const sClC4 = hasSys ? F.sysC4 + F.fC4 : null;
    const sClL  = hasSys ? sClC3 + sClC4 : null;
    const gClC3 = hasSys ? F.aClC3 - sClC3 : null;
    const gClC4 = hasSys ? F.aClC4 - sClC4 : null;
    const set = (k, html)=>{ const el = tbl.querySelector('[data-c="'+k+'"]'); if(el) el.innerHTML = html; };
    set('sopen-note',  _esc2(sysInfo.label || ''));
    set('sopen-t',     N(sOpL));
    set('sclose-3',    N(sClC3));  set('sclose-4', N(sClC4));  set('sclose-t', N(sClL));
    set('gopen-3',     SG(F.gapC3)); set('gopen-4', SG(F.gapC4));
    set('gopen-t',     SG(hasSys ? F.gapC3 + F.gapC4 : null));
    set('gclose-3',    SG(gClC3));   set('gclose-4', SG(gClC4));
    set('gclose-t',    SG(hasSys ? gClC3 + gClC4 : null));
    foot.innerHTML = _stxFootHtml(sloc, F);
    _stxTsvRebuild();
  }

  /* Dòng TSV của một bồn — tách ra để lượt gõ cũng làm mới được nút Copy. */
  function _stxLineFor(sloc){
    const F = _stxFigures(sloc);
    if(!F.ok) return null;
    const ctx = F.ctx, hasSys = F.hasSys;
    const saved = _stxSavedOf(ctx);
    return [ctx.tank, ctx.lot, (ctx.day && ctx.day.finishTxt) || '',
            (ctx.day && ctx.day.sapDate) ? _stxDmy(ctx.day.sapDate) : '',
            Math.round(F.aOpC3), Math.round(F.aOpC4), Math.round(F.aClC3), Math.round(F.aClC4),
            Math.round(F.fC3), Math.round(F.fC4),
            hasSys ? Math.round(F.sysC3) : '', hasSys ? Math.round(F.sysC4) : '', F.sysTag,
            (ctx.sap && ctx.sap.lastAt)
              ? _stxWhen(ctx.sap.lastAt) + (ctx.sap.lastBy ? ' ' + ctx.sap.lastBy : '') : '',
            hasSys ? Math.round(F.gapC3) : '', hasSys ? Math.round(F.gapC4) : '',
            hasSys ? Math.round(F.xC3) : '', hasSys ? Math.round(F.xC4) : '',
            hasSys ? Math.round(F.xC3 - F.fC3) : '', hasSys ? Math.round(F.xC4 - F.fC4) : '',
            saved.has ? 'yes' : 'no'].join('\t');
  }
  const _STX_TSV_HEAD = ['Tank','Lot','Finish','SAP_date','Actual_open_C3_kg','Actual_open_C4_kg',
                         'Actual_close_C3_kg','Actual_close_C4_kg','COQ_fill_C3_kg','COQ_fill_C4_kg',
                         'System_open_C3_kg','System_open_C4_kg','System_open_source','SAP_data_pasted',
                         'Gap_open_C3_kg','Gap_open_C4_kg',
                         'Suggest_C3_kg','Suggest_C4_kg','Adjust_C3_kg','Adjust_C4_kg',
                         'Saved_to_TankLog'].join('\t');
  function _stxTsvRebuild(){
    const lines = [_STX_TSV_HEAD];
    _STX_SLOCS.forEach(sl=>{ const l = _stxLineFor(sl); if(l) lines.push(l); });
    _stxTSV = lines.length > 1 ? lines.join('\n') : '';
  }

  function renderStx(refill){
    _stxFocusKeep = _stxSnapFocus();     /* v4.114 — chụp TRƯỚC mọi lượt _stxPark */
    _STX_SLOCS.forEach(sloc=>{
      const F   = _stxFigures(sloc);
      const ctx = F.ctx;
      _stxHead(ctx, F);
      const body = document.getElementById('stxBody'+sloc);
      const foot = document.getElementById('stxFoot'+sloc);
      if(!body || !foot) return;
      _stxPark(sloc);        /* cứu hai ô nhập trước khi ghi đè innerHTML */

      if(!F.ok && F.why === 'no-row'){
        body.innerHTML = '<div class="stx-empty">No Tank Log row found'
          + (ctx.lot ? ' for lot <b>'+_esc2(ctx.lot)+'</b>' : '')
          + '. Type a lot number above, or press <b>📥 Load All</b> in the Tank Log if it is an older lot.</div>';
        foot.innerHTML = '';
        _stxSysFill(sloc, ctx, F, refill);
        return;
      }
      if(!F.ok){
        body.innerHTML = '<div class="stx-empty">Lot <b>'+_esc2(ctx.lot)+'</b> has no COQ basis yet, so the actual '
          + 'C3 / C4 split cannot be computed.<br><span class="miss">Missing: '
          + _esc2(F.miss)
          + '</span><br>Open the lot in the Tank Log and press <b>◈ CALC COQ</b>, or run <b>◈ COQ audit</b>.</div>';
        foot.innerHTML = '';
        _stxSysFill(sloc, ctx, F, refill);
        return;
      }

      const s = ctx.split;
      const aOpC3 = F.aOpC3, aOpC4 = F.aOpC4, aOpL = aOpC3 + aOpC4;
      const aClC3 = F.aClC3, aClC4 = F.aClC4, aClL = aClC3 + aClC4;
      const fC3 = F.fC3, fC4 = F.fC4, fSrc = F.fSrc;

      /* ── tồn hệ thống (SAP tự lấy hoặc gõ tay) — nhãn nguồn + đổ ô nhập ── */
      const sysInfo = _stxSysFill(sloc, ctx, F, refill);
      const sOpC3 = F.sysC3, sOpC4 = F.sysC4, hasSys = F.hasSys;
      const sOpL  = hasSys ? sOpC3 + sOpC4 : null;

      /* ── nếu cứ chuyển đúng số COQ ── */
      const sClC3 = hasSys ? sOpC3 + fC3 : null;
      const sClC4 = hasSys ? sOpC4 + fC4 : null;
      const sClL  = hasSys ? sClC3 + sClC4 : null;
      /* ── lệch ── */
      const gOpC3 = F.gapC3, gOpC4 = F.gapC4;
      const gClC3 = hasSys ? aClC3 - sClC3 : null;
      const gClC4 = hasSys ? aClC4 - sClC4 : null;
      /* ── số đề xuất ── */
      const xC3 = F.xC3, xC4 = F.xC4;
      const xL  = hasSys ? xC3 + xC4 : null;

      const N  = v => _stxNum(v, 0);
      const SG = v => '<span class="'+_stxSignCls(v)+'">'+_stxSigned(v)+'</span>';
      body.innerHTML =
        '<table class="stx-tbl"><thead><tr>'
        + '<th class="lbl"></th><th class="n">Volume</th><th class="n">C3</th><th class="n">C4</th>'
        + '<th class="n tot">LPG</th></tr></thead><tbody>'
        + '<tr class="grp"><td colspan="5">ACTUAL — from measured volume × COQ basis</td></tr>'
        + _stxRow('a', 'Opening stock', 'INIT VOL × opening COQ',
                  _stxNum(s.ivol,3)+' m³', N(aOpC3), N(aOpC4), N(aOpL))
        + _stxRow('a', 'Closing stock', 'FINAL VOL × this lot COQ',
                  _stxNum(s.fvol,3)+' m³', N(aClC3), N(aClC4), N(aClL))
        + _stxRow('f', 'Filled this lot', fSrc, '', N(fC3), N(fC4), N(fC3+fC4))
        + '<tr class="grp"><td colspan="5">SYSTEM — what SAP holds for this tank</td></tr>'
        + _stxRow('s', 'Opening stock', sysInfo.label, '',
                  '<span class="stx-inp-slot" data-for="stxSys3'+sloc+'"></span>',
                  '<span class="stx-inp-slot" data-for="stxSys4'+sloc+'"></span>', N(sOpL), 'sopen')
        + _stxRow('s', 'Closing if COQ posted', 'system opening + filled', '',
                  N(sClC3), N(sClC4), N(sClL), 'sclose')
        + '<tr class="grp"><td colspan="5">GAP — actual minus system</td></tr>'
        + _stxRow('g', 'At opening', 'measured vs SAP', '',
                  SG(gOpC3), SG(gOpC4), SG(hasSys?gOpC3+gOpC4:null), 'gopen')
        + _stxRow('g', 'At closing if COQ posted', 'the gap simply carries over', '',
                  SG(gClC3), SG(gClC4), SG(hasSys?gClC3+gClC4:null), 'gclose')
        + '</tbody></table>';
      /* Hai ô nhập là element THẬT, không dựng lại theo innerHTML —
         nếu không thì mỗi lần gõ một chữ số là ô bị huỷ, mất con trỏ. */
      _stxMountInputs(sloc, body);

      foot.innerHTML = _stxFootHtml(sloc, F);
    });
    _stxFocusKeep = null;
    _stxTsvRebuild();
  }

  /* ── v4.111 — ĐÃ LƯU VÀO TANK LOG CHƯA ──────────────────────────────
     Đọc thẳng 4 ô trên dòng Tank Log, không giữ trạng thái riêng: nguồn
     sự thật duy nhất là dữ liệu đã ghi, nên máy khác lưu thì máy này cũng
     thấy ngay sau khi Firebase đồng bộ về. */
  function _stxSavedOf(ctx){
    const out = { has:false, txt:'Not saved to the Tank Log yet', gap3:null, gap4:null, adj3:null, adj4:null };
    try{
      if(!ctx || !ctx.row || typeof ENG === 'undefined' || !ENG.stxReconOf) return out;
      const r = ENG.stxReconOf(ctx.row);
      if(!r.has) return out;
      const n = v => v === null ? '—' : _stxNum(v, 0);
      out.has = true; out.gap3 = r.gap3; out.gap4 = r.gap4; out.adj3 = r.adj3; out.adj4 = r.adj4;
      out.txt = '✔ Saved on this lot — gap ' + _stxSigned(r.gap3) + ' / ' + _stxSigned(r.gap4)
              + ' · transfer ' + n(r.adj3) + ' / ' + n(r.adj4) + ' kg';
    }catch(_){}
    return out;
  }

  /* ══ v4.111 — 💾 LƯU KẾT QUẢ ĐỐI CHIẾU VÀO TANK LOG ══════════════════
     Ghi 4 ô [69]–[72] của ĐÚNG dòng lot đang xét. Chỉ ghi khi đã có đủ
     tồn đầu hệ thống — không có số thì không đoán, và nói rõ vì sao.
     Dùng chung cho nút 💾 của bảng và cho ✅ ở ô thông báo Tank Mix. */
  function _stxSaveCore(sloc, lot, opt){
    const o = opt || {};
    const done = (ok, why) => { if(typeof o.cb === 'function'){ try{ o.cb(ok, why); }catch(_){} } return ok; };
    const F = _stxFigures(sloc, lot);
    if(!F.ok){
      if(!o.quiet) toast(F.why === 'no-row'
        ? '❌ No Tank Log row for lot ' + (F.lot || '—') + ' — nothing to save'
        : '❌ Lot ' + (F.lot || '—') + ' has no COQ basis yet (' + F.miss + ') — nothing to save', 'er');
      return done(false, F.why);
    }
    if(!F.hasSys){
      if(!o.quiet) toast('⚠ Enter the system opening stock first — the gap and the adjusted transfer '
                       + 'cannot be computed without it', 'warn');
      return done(false, 'no-system-opening');
    }
    if(typeof canWrite === 'function' && !canWrite('eng_tkmix')){
      if(!o.quiet) toast('❌ No permission to write to the Tank Log', 'er');
      return done(false, 'no-permission');
    }
    if(typeof ENG === 'undefined' || !ENG.setStxRecon){
      if(!o.quiet) toast('❌ Tank Log module not ready — wait a few seconds and press 💾 again', 'er');
      return done(false, 'eng-not-ready');
    }
    ENG.setStxRecon(F.lot, F.tank,
      { gap3:F.gapC3, gap4:F.gapC4, adj3:F.xC3, adj4:F.xC4 },
      (ok, why)=>{
        /* ══ v4.113 — LƯU XONG THÌ BỎ BẢN NHÁP ═══════════════════════
           Tank Log mới là nơi lưu chính thức. Giữ lại bản nháp vừa thừa
           vừa nguy hiểm: lần sau mở lên nó đè số SAP bằng con số cũ mà
           không ai nhớ vì sao. Chỉ xoá khi ghi THÀNH CÔNG — thất bại thì
           GIỮ nguyên để nhân viên bấm 💾 lại, không mất công gõ. */
        if(ok){ try{ _stxDrop(F.sloc, F.lot); }catch(_){} }
        if(!o.quiet){
          if(ok) toast('💾 Saved to the Tank Log · lot ' + F.lot + ' (' + F.tank + ') — gap '
                     + Math.round(F.gapC3).toLocaleString('en-US') + ' / '
                     + Math.round(F.gapC4).toLocaleString('en-US') + ' · transfer '
                     + Math.round(F.xC3).toLocaleString('en-US') + ' / '
                     + Math.round(F.xC4).toLocaleString('en-US') + ' kg', 'ok');
          else toast(why === 'notfound'
                 ? '❌ Lot ' + F.lot + ' (' + F.tank + ') was not found in the Tank Log — nothing was saved'
                 : '❌ Could not save to the Tank Log (' + why + ') — please try again', 'er');
        }
        _stxSyncViews(false);
        done(ok, why);
      });
    return true;
  }
  function stxSave(sloc){ return _stxSaveCore(sloc, null, {}); }
  /* Cho MIXNOTIFY: biết sẵn tên bồn + lot của chính thông báo đang xử lý. */
  function stxSaveFor(tkName, lot, cb, quiet){
    const sloc = stxSlocOf(tkName);
    if(!sloc){ if(typeof cb === 'function') cb(false, 'unknown-tank'); return false; }
    return _stxSaveCore(sloc, lot, { cb:cb, quiet:!!quiet });
  }

  function _esc2(s){
    return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
                               .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* Đầu mỗi vùng: tên bồn · LOT ĐANG TÍNH · nguồn lot · giờ finish · thông báo đang treo */
  function _stxHead(ctx, F){
    const sloc = ctx.sloc;
    const meta = document.getElementById('stxMeta'+sloc);
    const badge = document.getElementById('stxLotSrc'+sloc);
    /* ── v4.111 — LOT ĐANG TÍNH ĐỨNG NGAY CẠNH TÊN BỒN ────────────────
       Ô nhập LOT để trống (placeholder "auto") suốt phần lớn thời gian vì
       lot được lấy tự động, nên nhìn vào bảng KHÔNG biết con số đang là
       của mẻ nào. Chip này in thẳng lot đang tính lên cùng hàng với
       TK-3501 / TK-3502 — nhìn một cái là biết kết quả bên dưới thuộc lot
       nào, đúng chỗ dễ nhận biết nhất. */
    const now = document.getElementById('stxLotNow'+sloc);
    if(now){
      const hasLot = !!(ctx.lot && String(ctx.lot).trim());
      now.innerHTML = hasLot
        ? '<span class="k">LOT</span><b>'+_esc2(ctx.lot)+'</b>'
        : '<span class="k">LOT</span><b class="none">— none —</b>';
      now.className = 'stx-lotnow' + (hasLot ? '' : ' empty')
                    + (F && F.ok === false && F.why ? ' warn' : '');
      now.title = hasLot
        ? ('Every figure in this pane belongs to lot ' + ctx.lot
           + (ctx.lotSrcTxt ? ' — taken from the ' + ctx.lotSrcTxt : '')
           + '. Type another lot in the box on the right to switch.')
        : 'No lot could be resolved for this tank — type one in the box on the right.';
    }
    if(badge){
      const map = { notify:'from mix notification', scale:'from tank card', latest:'latest lot',
                    typed:'typed in', given:'from the notification', none:'no lot' };
      badge.textContent = map[ctx.lotSrc] || '';
      badge.className = 'stx-lotsrc s-'+ctx.lotSrc;
      badge.title = ctx.lotSrcTxt ? ('Lot taken from the '+ctx.lotSrcTxt+' — type another lot to override.') : '';
    }
    if(!meta) return;
    if(!ctx.row){ meta.innerHTML = '<span class="w">No Tank Log row for this lot</span>'; return; }
    const d = ctx.day || {};
    const s = ctx.split || {};
    let html = '';
    html += '<span class="k">FINISHED</span><b>'+(d.finishTxt || '—')+'</b>';
    html += '<span class="k">ON</span><b>'+(d.finishDate ? _stxDmy(d.finishDate) : '—')+'</b>';
    if(d.overnight) html += '<span class="tag ov">overnight</span>';
    html += '<span class="k">ρ COQ</span><b>'+(s.fDen ? (+s.fDen).toFixed(4) : '—')+'</b>'
          + '<span class="k">%wt C3</span><b>'+(s.fW3 != null ? (s.fW3*100).toFixed(2) : '—')+'</b>';
    html += '<span class="sub"><span class="k">OPENING BASIS</span>ρ '
          + (s.iDen ? (+s.iDen).toFixed(4) : '—') + ' · '
          + (s.iW3 != null ? (s.iW3*100).toFixed(2)+' %wt C3' : '—')
          + (ctx.row[65] ? ' — '+_esc2(String(ctx.row[65])) : '') + '</span>';
    if(ctx.notify){
      const nC3 = ctx.notify.c3|0, nC4 = ctx.notify.c4|0;
      const coq3 = ctx.coqC3 !== null ? Math.round(ctx.coqC3*1000) : null;
      const coq4 = ctx.coqC4 !== null ? Math.round(ctx.coqC4*1000) : null;
      const differs = coq3 !== null && coq4 !== null
                    && (Math.abs(nC3-coq3) > 1 || Math.abs(nC4-coq4) > 1);
      html += '<span class="sub notify'+(differs?' differs':'')+'">'
            + '<span class="k">NOTIFIED TO CHECK BOOTH</span>'
            + 'lot '+_esc2(ctx.notify.lot)+' · C3 '+nC3.toLocaleString('en-US')
            + ' · C4 '+nC4.toLocaleString('en-US')+' kg'
            + (differs ? ' <b>⚠ differs from the COQ columns of this lot</b>' : '')
            + '</span>';
    }
    meta.innerHTML = html;
  }

  /* System opening: đổ số vào ô nhập + viết nhãn nguồn.
     Số ĐÃ được _stxFigures chốt sẵn (F.sysC3/F.sysC4/F.sysTag) — hàm này
     chỉ lo phần hiển thị, nên bảng và ô thông báo không thể nói khác nhau. */
  function _stxSysFill(sloc, ctx, F, refill){
    const e3 = document.getElementById('stxSys3'+sloc);
    const e4 = document.getElementById('stxSys4'+sloc);
    const note = document.getElementById('stxSrc'+sloc);
    const day = ctx && ctx.day;
    const sap = ctx && ctx.sap;
    const tag = (F && F.sysTag) || 'none';

    /* đổ số vào ô — chỉ khi được phép và khi CHUỖI khác, để không giật con trỏ */
    if(refill !== false){
      const put = (el, v)=>{
        if(!el) return;
        /* v4.114 — TUYỆT ĐỐI không ghi đè ô người ta ĐANG GÕ. Một lượt vẽ
           lại do máy khác đẩy về (hoặc do bản nháp vừa ghi xong) mà nhảy
           vào sửa ô đang gõ là con trỏ nhảy về cuối và mất chữ đang nhập. */
        try{
          if(_stxFocusKeep && _stxFocusKeep.id === el.id) return;
          if(typeof document !== 'undefined' && el === document.activeElement) return;
        }catch(_){}
        const want = (v === null || v === undefined) ? '' : String(Math.round(v));
        if(el.value !== want) el.value = want;
      };
      put(e3, F ? F.sysC3 : null);
      put(e4, F ? F.sysC4 : null);
    }

    /* nhãn nguồn — luôn nói rõ số này ở đâu ra, hoặc vì sao chưa có */
    let cls = 'na', txt = '';
    if(tag === 'manual'){
      cls = 'man';
      const man = ctx ? _stxManualOf(sloc, ctx.lot) : null;
      const who = man && man.by ? String(man.by) : '';
      const whn = man && man.ts ? _stxWhen(man.ts) : '';
      txt = '<b>Manual entry</b> — typed by ' + (who ? _esc2(who) : 'the operator')
          + (whn ? ' at ' + whn : '')
          + ' <button class="stx-mini" onclick="INV.stxSysReset(\'' + sloc + '\')" '
          + 'title="Discard the typed figures and reload from SAP">⟳ reload</button>'
          + (day && day.ok && sap && sap.has
              ? '<span class="why">SAP End Stock of '+_stxDmy(day.sapDate)+' was '
                + Math.round(sap.c3).toLocaleString('en-US')+' / '+Math.round(sap.c4).toLocaleString('en-US')
                + ' kg</span>' + _stxSapStamp(sap)
              : '')
          + '<span class="why">The same figure is shown on the Tank Mix notification — editing it in '
          + 'either place changes both.</span>'
          /* v4.113 — nói rõ số đang gõ ĐÃ được giữ hộ, để nhân viên yên tâm
             bỏ dở đi làm việc khác rồi quay lại. */
          + '<span class="why">Held on the server for this lot, so it survives a refresh, a shift change '
          + 'and a new mix on the same tank. It is cleared the moment the figures are saved to the Tank Log.</span>';
    } else if(tag === 'none'){
      cls = 'na'; txt = 'No lot selected.';
    } else if(tag === 'sap'){
      cls = 'sap';
      txt = '<b>SAP End Stock of '+_stxDmy(day.sapDate)+'</b>'
          + (sap.batches.length ? ' · batch '+sap.batches.join('+') : '')
          + ' · '+sap.rows+' row'+(sap.rows>1?'s':'')
          + '<span class="why">'+_esc2(day.why)+'</span>'
          + _stxSapStamp(sap);
    } else if(tag === 'sap-missing'){
      cls = 'miss';
      let have = [];
      try{ have = (typeof SP !== 'undefined' && SP.tankEndDates) ? SP.tankEndDates(sloc) : []; }catch(_){}
      const newest = have.length ? have[have.length-1] : '';
      txt = '<b>SAP End Stock of '+_stxDmy(day.sapDate)+' is not loaded</b> — paste that day into the '
          + 'SAP tab, or type the figures here.<span class="why">'+_esc2(day.why)+'</span>'
          + (newest ? '<span class="stamp">Latest SAP day loaded for this tank: '+_stxDmy(newest)
                      + ' — do NOT use it as the opening balance for this lot</span>' : '');
    } else {
      cls = 'need';
      txt = '<b>Enter it manually</b> — '+_esc2((day && day.why) || 'no finish time on the row')+'.';
    }
    if(note){ note.className = 'stx-src s-'+cls; note.innerHTML = txt; }
    return { c3:F ? F.sysC3 : null, c4:F ? F.sysC4 : null, tag:tag,
             label:({ sap:'SAP End Stock', manual:'manual entry', 'sap-missing':'not available',
                      'manual-required':'manual entry required', none:'—' })[tag] || '' };
  }

  /* ── Ô nhập System opening: GỬI VỀ KHO TRƯỚC, dựng bảng SAU ───────────
     Hai ô này được CHUYỂN vào trong bảng để hiện đúng chỗ. Nhưng mỗi lượt
     vẽ lại đều ghi đè `body.innerHTML`, mà lúc đó ô đang NẰM TRONG body ⇒
     ô bị huỷ, người dùng gõ một chữ số là mất ô và mất luôn con trỏ.
     Vì thế: _stxPark() kéo ô về lại kho ẩn TRƯỚC khi đụng innerHTML, rồi
     _stxMountInputs() mới gắn lại vào ô mới. Cùng một element sống suốt
     phiên nên giá trị đang gõ và vị trí con trỏ không bao giờ mất. */
  /* v4.114 — ô nhập nào đang được gõ, và con trỏ ở đâu. Phải chụp TRƯỚC
     khi _stxPark() chuyển ô đi (chuyển là mất focus ngay lúc đó, chụp sau
     là đã muộn). Giữ ở mức module vì một lượt renderStx đi qua cả hai bồn. */
  let _stxFocusKeep = null;
  function _stxSnapFocus(){
    try{
      const act = document.activeElement;
      if(act && act.id && /^stxSys[34]/.test(act.id)){
        const k = { id:act.id, ss:null, se:null };
        try{ k.ss = act.selectionStart; k.se = act.selectionEnd; }catch(_){}
        return k;
      }
    }catch(_){}
    return null;
  }
  function _stxPark(sloc){
    const pool = document.querySelector('.stx-inp-pool');
    if(!pool) return;
    ['3','4'].forEach(k=>{
      const inp = document.getElementById('stxSys'+k+sloc);
      if(inp && inp.parentNode !== pool) pool.appendChild(inp);
    });
  }
  function _stxMountInputs(sloc, body){
    ['3','4'].forEach(k=>{
      const slot = body.querySelector('.stx-inp-slot[data-for="stxSys'+k+sloc+'"]');
      const inp  = document.getElementById('stxSys'+k+sloc);
      if(slot && inp) slot.appendChild(inp);
    });
    /* v4.114 — LƯỚI AN TOÀN: đường gõ đã không đi qua renderStx nữa, nhưng
       một lượt vẽ ĐẦY ĐỦ (máy khác đẩy về, bản nháp vừa nạp…) vẫn có thể
       rơi đúng lúc nhân viên đang gõ. Trả lại focus + con trỏ cho đúng ô. */
    const keep = _stxFocusKeep;
    if(keep && keep.id.slice(-4) === String(sloc)){
      const el = document.getElementById(keep.id);
      if(el){
        try{ el.focus(); }catch(_){}
        try{ if(keep.ss !== null && keep.ss !== undefined) el.setSelectionRange(keep.ss, keep.se); }catch(_){}
      }
    }
  }

  function copyStx(){
    if(!_stxTSV){ toast('Nothing to copy yet','er'); return; }
    try{ navigator.clipboard.writeText(_stxTSV); toast('✓ Reconciliation copied','ok'); }
    catch(_){ toast('Copy failed','er'); }
  }


  /* ══════════════════════════════════════════════════════════════════════
     v4.117 — 🔍 WMS STOCK CHECK  (nút 🔍 trên thẻ tank → INV.openWms)
     ----------------------------------------------------------------------
     KHÁC HẲN bảng 📏 (⚖ Stock-transfer reconciliation):
       • 📏 nhìn về QUÁ KHỨ: đối chiếu MỘT MẺ đã trộn (INIT/FINAL VOL của
         dòng Tank Log) để ra số chuyển kho đã điều chỉnh cho mẻ đó.
       • 🔍 nhìn vào HIỆN TẠI: nhân viên vừa đo bồn xong, cầm con số m³
         thực tế và con số C3/C4 WMS đang hiện, hỏi "WMS đang lệch bao
         nhiêu và phải chuyển kho đi đâu cho khớp?".
     Vì thế lot mặc định ở đây là LOT MỚI NHẤT của bồn (thứ đang nằm trong
     bồn), KHÔNG phải lot của thông báo trộn đang treo — nhưng vẫn cho gõ
     lot khác khi cần.

     CÔNG THỨC
       Actual LPG (kg) = volume (m³) × ρ COQ (kg/L) × 1000
       Actual C3       = Actual LPG × %wt C3        ·  C4 = LPG − C3
       Difference      = Actual − WMS   (mỗi loại tính riêng)

     CHIỀU CHUYỂN KHO — chỗ dễ làm sai nhất, nên bảng viết hẳn thành câu:
       Difference ÂM  (WMS đang CAO hơn thực tế) ⇒ phải GIẢM WMS
                      ⇒ chuyển kho TỪ BỒN VỀ HẦM:  2100/2101 ➜ 1100
       Difference DƯƠNG (WMS đang THẤP hơn thực tế) ⇒ phải TĂNG WMS
                      ⇒ chuyển kho TỪ HẦM LÊN BỒN:  1100 ➜ 2100/2101
     Số lượng LUÔN in ra dạng DƯƠNG (số gõ vào SAP không bao giờ âm), chiều
     nằm ở câu chữ và ở mũi tên SLoc, không bắt người đọc tự suy từ dấu.

     KHÔNG lưu gì cả: không Firebase, không Tank Log — đây là phép đo tại
     chỗ, chốt số xong là gõ thẳng vào WMS. Nhưng số gõ được GIỮ TRONG RAM
     suốt phiên (đóng bảng đi làm việc khác, mở lại vẫn còn), theo yêu cầu
     của người dùng.
     ══════════════════════════════════════════════════════════════════════ */
  const _WMS_SLOCS  = ['2100','2101'];
  const _WMS_CAVERN = '1100';
  const _WMS_TOL    = 1;          /* kg — dưới 1 kg coi như khớp */
  /* Giữ NGUYÊN CHUỖI người dùng gõ (không ép về số) để mở lại thấy đúng
     những gì mình đã nhập, kể cả "20,000" hay "12.3 " đang gõ dở. */
  const _wmsIn = {
    '2100':{ lot:'', vol:'', c3:'', c4:'', den:'', w3:'' },
    '2101':{ lot:'', vol:'', c3:'', c4:'', den:'', w3:'' }
  };
  const _WMS_FLD = ['lot','vol','c3','c4','den','w3'];
  const _wmsElId = (f, sloc) => 'wmsx' + f.charAt(0).toUpperCase() + f.slice(1) + sloc;

  function _wmsW3(v){
    if(v === '' || v === null || v === undefined) return null;
    try{ if(typeof ENG !== 'undefined' && ENG.parseW3) return ENG.parseW3(v); }catch(_){}
    const x = _stxN(v);
    return (x === null || x <= 0) ? null : (x > 1.5 ? x/100 : x);
  }
  /* Lot đang xét: gõ tay đè, không thì LOT MỚI NHẤT của chính bồn đó. */
  function _wmsPickLot(sloc){
    const typed = String((_wmsIn[sloc]||{}).lot || '').trim();
    if(typed){
      const row = _stxFindRow(sloc, typed);
      return { lot: row ? String(row[1]||'').trim() : typed, row:row,
               src:'typed', srcTxt:'typed in' };
    }
    const want = _STX_TKNUM[sloc];
    let best = null;
    _stxRows().forEach(r=>{
      if(!r || String(r[2]||'').replace(/\D/g,'') !== want) return;
      if(!best || _stxLotKey(r[1]) > _stxLotKey(best[1])) best = r;
    });
    return best ? { lot:String(best[1]||'').trim(), row:best, src:'latest',
                    srcTxt:'the latest lot of this tank in the Tank Log' }
                : { lot:'', row:null, src:'none', srcTxt:'' };
  }
  /* Lot đang ghi trên thẻ tank của tab Scale — chỉ dùng để CẢNH BÁO khi nó
     khác lot mới nhất, không tự ý lấy thay. */
  function _wmsCardLot(sloc){
    try{
      const cfg = (typeof SCALE !== 'undefined' && SCALE.getTkCfg) ? SCALE.getTkCfg() : null;
      const t = cfg ? (sloc === '2100' ? cfg.tk1 : cfg.tk2) : null;
      return t ? String(t.lot || '').trim() : '';
    }catch(_){ return ''; }
  }

  /* Lot GẦN NHẤT của bồn này mà ĐÃ có nền COQ — chỉ dùng để MÁCH NƯỚC khi
     lot mới nhất chưa có kết quả COQ. TUYỆT ĐỐI không tự lấy thay: sản phẩm
     trong bồn là của mẻ mới, mượn ρ của mẻ cũ là ra số sai mà không ai biết. */
  function _wmsLastBasis(sloc, exceptLot){
    const want = _STX_TKNUM[sloc];
    let best = null;
    _stxRows().forEach(r=>{
      if(!r || String(r[2]||'').replace(/\D/g,'') !== want) return;
      if(exceptLot && _stxLotMatch(r[1], exceptLot)) return;
      const den = parseFloat(r[33]);
      const w3  = _wmsW3(r[45]);
      if(!(den > 0) || w3 === null) return;
      if(!best || _stxLotKey(r[1]) > _stxLotKey(best.lot))
        best = { lot:String(r[1]||'').trim(), den:den, w3:w3 };
    });
    return best;
  }

  /* ── HÀM TÍNH DUY NHẤT — thuần tính, không đụng DOM, đơn vị KG ──
     ok=false ⇒ `miss` liệt kê đích danh thứ còn thiếu, không đoán, không in 0. */
  function _wmsFigures(sloc){
    const inp  = _wmsIn[sloc] || {};
    const pick = _wmsPickLot(sloc);
    const row  = pick.row;
    let split = null;
    try{ split = (row && typeof ENG !== 'undefined' && ENG.actualSplit) ? ENG.actualSplit(row) : null; }catch(_){}
    /* Nền COQ của LÔ HÀNG ĐANG NẰM TRONG BỒN = nền CUỐI mẻ ([33] ρ, [45] %wt C3). */
    const lotDen = (split && split.fDen > 0)   ? split.fDen : null;
    const lotW3  = (split && split.fW3 != null) ? split.fW3  : null;
    const ovDen  = _stxN(inp.den);
    const ovW3   = _wmsW3(inp.w3);
    const F = {
      sloc:sloc, tank:TKNAME[sloc] || sloc, cavern:_WMS_CAVERN,
      lot:pick.lot, lotSrc:pick.src, lotSrcTxt:pick.srcTxt, row:row, split:split,
      cardLot:_wmsCardLot(sloc),
      den:(ovDen !== null && ovDen > 0) ? ovDen : lotDen,
      w3 :(ovW3  !== null) ? ovW3 : lotW3,
      denSrc:(ovDen !== null && ovDen > 0) ? 'typed' : (lotDen !== null ? 'lot' : 'none'),
      w3Src :(ovW3  !== null) ? 'typed' : (lotW3  !== null ? 'lot' : 'none'),
      lotDen:lotDen, lotW3:lotW3,
      vol:_stxN(inp.vol),
      wmsC3:_stxN(inp.c3), wmsC4:_stxN(inp.c4),
      hasWms:false, ok:false, miss:[],
      aC3:null, aC4:null, aL:null, wL:null, dC3:null, dC4:null, dL:null
    };
    F.hasWms = (F.wmsC3 !== null && F.wmsC4 !== null);
    if(F.hasWms) F.wL = F.wmsC3 + F.wmsC4;
    if(F.vol === null)  F.miss.push('actual tank volume (m³)');
    else if(F.vol < 0)  F.miss.push('a volume that is not negative');
    if(!(F.den > 0))    F.miss.push('COQ density (kg/L)');
    if(F.w3 === null)   F.miss.push('%wt C3');
    if(F.miss.length) return F;
    F.aL  = F.vol * F.den * 1000;      /* m³ × kg/L = tấn ⇒ ×1000 ra kg */
    F.aC3 = F.aL * F.w3;
    F.aC4 = F.aL - F.aC3;
    F.ok  = true;
    if(F.hasWms){
      F.dC3 = F.aC3 - F.wmsC3;
      F.dC4 = F.aC4 - F.wmsC4;
      F.dL  = F.dC3 + F.dC4;
    }
    return F;
  }

  /* ── CÂU LỆNH CHUYỂN KHO ──────────────────────────────────────────────
     Tách riêng và thuần chuỗi để test khoá được đúng CHIỀU. Người dùng
     đọc câu này rồi gõ thẳng vào WMS, nên nó phải nói đủ: tăng hay giảm,
     đi từ SLoc nào sang SLoc nào, bao nhiêu kg, và làm vậy thì WMS đổi
     theo hướng nào. Không dùng dấu +/− thay cho câu chữ. */
  function _wmsAction(mat, sloc, diff){
    const tank = TKNAME[sloc] || sloc;
    const kg = v => Math.round(Math.abs(v)).toLocaleString('en-US');
    if(diff === null || diff === undefined || !isFinite(diff))
      return { dir:'na', qty:null, head:'', txt:'' };
    if(Math.abs(diff) < _WMS_TOL)
      return { dir:'ok', qty:0,
        head: mat + ' — WMS already matches, post nothing',
        txt : 'The WMS figure and the actual stock differ by less than 1 kg. Do not post any '
            + mat + ' stock transfer for ' + tank + '.' };
    if(diff < 0)
      return { dir:'down', qty:Math.round(-diff),
        head: mat + ' — WMS is TOO HIGH by ' + kg(diff) + ' kg → bring it DOWN',
        txt : 'Post a stock transfer of ' + kg(diff) + ' kg of ' + mat
            + ' OUT of the tank and INTO the cavern: ' + tank + ' (SLoc ' + sloc
            + ')  ➜  Cavern (SLoc ' + _WMS_CAVERN + '). '
            + 'That takes ' + kg(diff) + ' kg off ' + tank + ' in WMS and puts it back in the cavern, '
            + 'so the WMS figure for ' + tank + ' drops onto the measured stock.' };
    return { dir:'up', qty:Math.round(diff),
      head: mat + ' — WMS is TOO LOW by ' + kg(diff) + ' kg → bring it UP',
      txt : 'Post a stock transfer of ' + kg(diff) + ' kg of ' + mat
          + ' OUT of the cavern and INTO the tank: Cavern (SLoc ' + _WMS_CAVERN
          + ')  ➜  ' + tank + ' (SLoc ' + sloc + '). '
          + 'That adds ' + kg(diff) + ' kg onto ' + tank + ' in WMS, '
          + 'so the WMS figure for ' + tank + ' rises onto the measured stock.' };
  }

  /* ---------- render ---------- */
  function _wmsActHtml(F, mat, diff){
    const a = _wmsAction(mat, F.sloc, diff);
    if(a.dir === 'na') return '';
    return '<div class="wmsx-act d-'+a.dir+'">'
      + '<div class="hd">'+_esc2(a.head)+'</div>'
      + '<div class="tx">'+_esc2(a.txt)+'</div>'
      + (a.dir === 'ok' ? '' :
          '<div class="mv"><span class="from">'+_esc2(a.dir === 'down' ? F.tank+' · SLoc '+F.sloc
                                                                      : 'Cavern · SLoc '+_WMS_CAVERN)+'</span>'
        + '<span class="ar">➜</span>'
        + '<span class="to">'+_esc2(a.dir === 'down' ? 'Cavern · SLoc '+_WMS_CAVERN
                                                     : F.tank+' · SLoc '+F.sloc)+'</span>'
        + '<span class="q">'+a.qty.toLocaleString('en-US')+' kg '+mat+'</span></div>')
      + '</div>';
  }

  function _wmsRender(sloc){
    const F = _wmsFigures(sloc);
    const now  = document.getElementById('wmsxLotNow'+sloc);
    const bsrc = document.getElementById('wmsxLotSrc'+sloc);
    const bas  = document.getElementById('wmsxBasis'+sloc);
    const out  = document.getElementById('wmsxOut'+sloc);
    if(now){
      const has = !!F.lot;
      now.innerHTML = '<span class="k">LOT</span><b'+(has?'':' class="none"')+'>'
                    + (has ? _esc2(F.lot) : '— none —')+'</b>';
      now.className = 'wmsx-lotnow' + (has ? '' : ' empty');
      now.title = has
        ? ('The density and %wt C3 below are the COQ basis of lot ' + F.lot
           + ' — the product currently in ' + F.tank + '.')
        : 'No lot found for this tank — type one, or type the density and %wt C3 by hand.';
    }
    if(bsrc){
      const map = { typed:'lot typed in', latest:'latest lot of this tank', none:'no lot' };
      bsrc.textContent = map[F.lotSrc] || '';
      bsrc.className = 'wmsx-lotsrc s-'+F.lotSrc;
      bsrc.title = F.lotSrcTxt ? ('Lot taken from ' + F.lotSrcTxt + ' — type another lot to override.') : '';
    }
    if(bas){
      const dTxt = (F.den > 0) ? (+F.den).toFixed(4) : '—';
      const wTxt = (F.w3 != null) ? (F.w3*100).toFixed(2)+' %' : '—';
      let html = '<span class="k">ρ COQ</span><b class="'+(F.denSrc==='typed'?'ov':'')+'">'+dTxt+'</b>'
               + '<span class="u">kg/L</span>'
               + '<span class="k">%wt C3</span><b class="'+(F.w3Src==='typed'?'ov':'')+'">'+wTxt+'</b>';
      if(F.denSrc === 'typed' || F.w3Src === 'typed')
        html += '<span class="sub ov">Typed basis in use — the COQ result of lot '
              + (F.lot ? _esc2(F.lot) : '—') + ' is '
              + (F.lotDen ? (+F.lotDen).toFixed(4) : '—') + ' kg/L · '
              + (F.lotW3 != null ? (F.lotW3*100).toFixed(2)+' %' : '—') + ' wt C3.</span>';
      else if(F.lotDen === null || F.lotW3 === null)
        html += '<span class="sub warn">Lot ' + (F.lot ? _esc2(F.lot) : '—')
              + ' has no COQ result yet — nothing can be computed from a volume until the density and '
              + '%wt C3 are known.</span>';
      else
        html += '<span class="sub">Closing COQ basis of lot '
              + (F.lot ? _esc2(F.lot) : '—') + ' — the product now in the tank.</span>';
      if(F.cardLot && F.lotSrc === 'latest' && !_stxLotMatch(F.lot, F.cardLot))
        html += '<span class="sub warn">⚠ The tank card on the Scale tab shows lot '
              + _esc2(F.cardLot) + '. If that is what is in the tank now, type it in the LOT box above.</span>';
      bas.innerHTML = html;
    }
    if(!out) return;
    if(!F.ok){
      let msg = '<div class="wmsx-empty">Fill in ' + _esc2(F.miss.join(' · '))
              + ' to get the actual stock.';
      if(F.lot && (F.lotDen === null || F.lotW3 === null)){
        msg += '<br><span class="miss">Lot ' + _esc2(F.lot) + ' has no COQ result yet — press '
             + '◈ CALC COQ in the Tank Log, or type the density and %wt C3 below.</span>';
        const lb = _wmsLastBasis(sloc, F.lot);
        if(lb) msg += '<br><span class="hint">The newest lot of this tank that does have a COQ result is '
             + _esc2(lb.lot) + ' (' + (+lb.den).toFixed(4) + ' kg/L · ' + (lb.w3*100).toFixed(2)
             + ' %wt C3). Type that lot above ONLY if it is what is really in the tank now — '
             + 'do NOT borrow its basis for lot ' + _esc2(F.lot) + '.</span>';
      }
      out.innerHTML = msg + '</div>';
      return;
    }
    const N  = v => _stxNum(v, 0);
    const SG = v => '<span class="'+_stxSignCls(v)+'">'+_stxSigned(v)+'</span>';
    let html = '<table class="wmsx-tbl"><thead><tr>'
      + '<th class="lbl"></th><th class="n">C3</th><th class="n">C4</th><th class="n tot">LPG</th>'
      + '</tr></thead><tbody>'
      + '<tr class="a"><td class="lbl">Actual stock in the tank'
      +   '<i>' + _stxNum(F.vol,3) + ' m³ × ' + (+F.den).toFixed(4) + ' kg/L × '
      +   (F.w3*100).toFixed(2) + ' %wt C3</i></td>'
      +   '<td class="n">'+N(F.aC3)+'</td><td class="n">'+N(F.aC4)+'</td>'
      +   '<td class="n tot">'+N(F.aL)+'</td></tr>'
      + '<tr class="w"><td class="lbl">WMS stock right now<i>typed in from WMS</i></td>'
      +   '<td class="n">'+N(F.wmsC3)+'</td><td class="n">'+N(F.wmsC4)+'</td>'
      +   '<td class="n tot">'+N(F.wL)+'</td></tr>'
      + '<tr class="g"><td class="lbl">Difference<i>actual − WMS</i></td>'
      +   '<td class="n">'+SG(F.dC3)+'</td><td class="n">'+SG(F.dC4)+'</td>'
      +   '<td class="n tot">'+SG(F.dL)+'</td></tr>'
      + '</tbody></table>'
      + '<div class="wmsx-t">= '+_stxNum(F.aC3/1000,3)+' t C3 · '+_stxNum(F.aC4/1000,3)
      +   ' t C4 · '+_stxNum(F.aL/1000,3)+' t LPG actual</div>';
    if(!F.hasWms){
      html += '<div class="wmsx-empty">Type the <b>WMS C3</b> and <b>WMS C4</b> figures above to get '
            + 'the difference and the stock transfer to post.</div>';
    } else {
      html += '<div class="wmsx-acts">'
            + '<div class="wmsx-acts-hd">➜ WHAT TO POST IN WMS</div>'
            + _wmsActHtml(F, 'C3', F.dC3)
            + _wmsActHtml(F, 'C4', F.dC4)
            + '<div class="wmsx-note">Post C3 and C4 as <b>two separate lines</b> — they can go in '
            + 'opposite directions. After posting, the WMS stock of ' + _esc2(F.tank)
            + ' equals the measured stock: ' + N(F.aC3) + ' kg C3 · ' + N(F.aC4) + ' kg C4.</div>'
            + '</div>';
    }
    out.innerHTML = html;
  }

  function renderWms(refill){
    _WMS_SLOCS.forEach(sl=>{
      if(refill) _wmsFill(sl);
      _wmsRender(sl);
    });
  }
  /* Đổ số từ RAM vào ô — KHÔNG bao giờ đụng ô đang được gõ. */
  function _wmsFill(sloc){
    _WMS_FLD.forEach(f=>{
      const el = document.getElementById(_wmsElId(f, sloc));
      if(!el) return;
      try{ if(typeof document !== 'undefined' && el === document.activeElement) return; }catch(_){}
      const want = String((_wmsIn[sloc]||{})[f] || '');
      if(el.value !== want) el.value = want;
    });
  }
  /* Gõ ở bất kỳ ô nào → cất vào RAM → vẽ lại RIÊNG phần kết quả.
     Ô nhập là element tĩnh của index.html, không lượt vẽ nào dựng lại nó,
     nên không dính họ lỗi mất focus của v4.114. */
  function wmsEdit(sloc){
    if(!_wmsIn[sloc]) return;
    _WMS_FLD.forEach(f=>{
      const el = document.getElementById(_wmsElId(f, sloc));
      if(el) _wmsIn[sloc][f] = el.value;
    });
    _wmsRender(sloc);
  }
  function wmsClear(sloc){
    if(!_wmsIn[sloc]) return;
    _WMS_FLD.forEach(f=>{ _wmsIn[sloc][f] = ''; });
    _wmsFill(sloc);
    _wmsRender(sloc);
  }
  /* n = 1 | 2 (hoặc sloc): bồn được bấm đứng TRƯỚC, nhưng luôn hiện cả hai. */
  function openWms(n){
    const first = (n === 2 || n === '2101') ? '2101' : '2100';
    const wrap = document.getElementById('wmsxGrid');
    if(wrap){
      const a = document.getElementById('wmsxPane2100'), b = document.getElementById('wmsxPane2101');
      if(a && b) wrap.appendChild(first === '2100' ? b : a);
    }
    /* CỐ Ý KHÔNG xoá số cũ: người dùng đóng bảng đi làm việc khác rồi quay
       lại phải thấy nguyên những gì đã nhập (yêu cầu của vận hành). Muốn
       trắng thì bấm ✕ clear của đúng bồn đó. */
    renderWms(true);
    open('stxWmsModal');
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
           openExport, pickExport, pickExportDate, toggleExportRow, toggleExportAll,
           openSplit, pickSplit, calcSplit, copySplit,
           /* v4.108 — ⚖ Stock-transfer reconciliation (nút 📏 trên thẻ tank) */
           openStx, renderStx, copyStx, stxLotChange, stxSysEdit, stxSysReset,
           stxCtx: _stxCtx, stxSapDate: _stxSapDate,
           /* v4.111 — dùng chung với ô thông báo Tank Mix + ghi vào Tank Log */
           stxFigures: _stxFigures, stxSetSys, stxSlocOf, stxSave, stxSaveFor,
           stxSavedOf: _stxSavedOf,
           /* v4.117 — 🔍 WMS stock check (nút 🔍 trên thẻ tank): thể tích ĐO
              ĐƯỢC ngay lúc này × nền COQ của lot đang trong bồn, đặt cạnh số
              WMS đang hiện ⇒ độ vênh + câu lệnh chuyển kho nói rõ chiều
              (bồn ➜ hầm 1100 để GIẢM, hầm 1100 ➜ bồn để TĂNG). */
           openWms, renderWms, wmsEdit, wmsClear,
           wmsFigures: _wmsFigures, wmsAction: _wmsAction,
           openVolChk: openStx,          /* alias cho lối gọi cũ */
           closeAll };
})();
window.INV = INV;
