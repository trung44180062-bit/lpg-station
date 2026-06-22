/* ============================================================
 * MC  —  mixctrl.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 22525–23672   (~1148 dòng)
 * Global xuất ra : window.MC
 * Phase tách     : P5B
 * Phụ thuộc      : sync, vmix
 * Khởi tạo (boot): MC.init() trong boot
 * ------------------------------------------------------------
 * MÔ TẢ: Mixing Controller (pha trộn 2 tank): DEF, ST/ORD/LP/PC/CR_MODE/MIXING_LOT/GCR theo tank.
 *
 * API công khai (điền/đối chiếu khi tách):
 *   MC.init(), MC.start(t), MC.stop(t)
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module MC từ dòng 22525 đến 23672.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.MC).
 *   3) node --check mixctrl.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P5B]: dán thân module MC (V4-54 dòng 22525–23672) vào đây. */

/* ===== BÓC TỪ V4-54 dòng 22525–23672 ===== */
const MC = (function(){
  'use strict';

  /* ---------- defaults & cached settings (localStorage) ---------- */
  const CFG_KEY = 'lpg_v4_mc_config_v1';
  const DEF = {
    c3l: 0.483, c4l: 0.560,         // liquid densities kg/L
    c3v: 0.01721, c4v: 0.00825,     // vapor densities kg/L
    tv: 696.91,                     // max tank vol m³ (one sphere)
    r:  5.5,                        // tank radius m
    odoPpm: 30, odoRef: 570, odoBd: 0.00003
  };
  let MC_D, MC_TV, MC_TANK_R, MC_ODO;
  function _applyCfg(c){
    MC_D = { c3l:c.c3l, c4l:c.c4l, c3v:c.c3v, c4v:c.c4v };
    MC_TV = c.tv;
    MC_TANK_R = c.r;
    MC_ODO = { ppm:c.odoPpm, ref:c.odoRef, bd:c.odoBd };
  }
  function _loadCfg(){
    try{
      const raw = localStorage.getItem(CFG_KEY);
      if(!raw){ _applyCfg(DEF); return; }
      const c = Object.assign({}, DEF, JSON.parse(raw));
      _applyCfg(c);
    }catch(_){ _applyCfg(DEF); }
  }
  function _saveCfg(c){
    try{ localStorage.setItem(CFG_KEY, JSON.stringify(c)); }catch(_){}
  }
  _loadCfg();

  /* ---------- spherical-tank volume math (R=5.5m default) ---------- */
  function _volAtH(h){ return Math.PI * h * h * (MC_TANK_R - h / 3); }
  function _v2L(vol){
    if(vol <= 0) return 0;
    const maxV = _volAtH(2 * MC_TANK_R);
    if(vol >= maxV) return Math.round(2 * MC_TANK_R * 1000);
    let h = MC_TANK_R;
    for(let i = 0; i < 50; i++){
      const f  = Math.PI * h * h * (MC_TANK_R - h / 3) - vol;
      const fp = Math.PI * (2 * h * (MC_TANK_R - h / 3) + h * h * (-1 / 3));
      if(Math.abs(fp) < 1e-12) break;
      h -= f / fp;
      if(h < 0) h = 0.001;
      if(h > 2 * MC_TANK_R) h = 2 * MC_TANK_R;
      if(Math.abs(f) < 1e-6) break;
    }
    return Math.round(h * 1000);    // → mm
  }

  /* ---------- state machine ----------
     Per-tank state: 'idle' | 'calc' | 'mixing'. UI status pill is computed
     from this base + GC progress (pending-gc / completed). */
  const ST = { '1':'idle', '2':'idle' };
  const ORD = { '1':'C4', '2':'C4' };
  const LP  = { '1':false, '2':false };
  const PC  = { '1':false, '2':false };
  const CR_MODE = { '1':'auto', '2':'auto' };
  const MIXING_LOT = { '1':0, '2':0 };

  /* timers — debounce */
  const _calcTimer = { '1':null, '2':null };
  const _gcTimer   = { '1':null, '2':null };
  const _startTimer= { '1':null, '2':null };
  let   _calcSilent = false;
  let   _gcSilent   = false;

  /* Mixing-state Firebase sync */
  let _fbRef = null;            // ref to eng_mix_state
  let _suppressEcho = 0;
  const _remoteState = { tk1:null, tk2:null };

  /* GC context — last calc result per tank (used by SAVE/DRAFT) */
  const GCR = { '1':null, '2':null };

  /* ---------- generic helpers ---------- */
  function _gid(id){ return document.getElementById(id); }
  function _gv(id){ const e = _gid(id); return e ? e.value : ''; }
  function _gnum(id){ const v = parseFloat(_gv(id)); return isNaN(v) ? 0 : v; }
  function _fmt(v, d){
    if(v == null || isNaN(v)) return '—';
    return Number(v).toLocaleString('en-US', { maximumFractionDigits: (d != null ? d : 3) });
  }
  function _p2(v){ return String(v).padStart(2, '0'); }
  function _todayDDMMYY(){
    const d = new Date();
    return _p2(d.getDate())+'/'+_p2(d.getMonth()+1)+'/'+String(d.getFullYear()).slice(2);
  }
  function _nowHHMM(){
    const d = new Date();
    return _p2(d.getHours())+':'+_p2(d.getMinutes());
  }
  function _lotName(num){
    return 'LPG-'+new Date().getFullYear()+'-'+num;
  }
  function _parseLotNum(v){
    const s = String(v||'').trim();
    let m = s.match(/LPG-(\d{4})-(\d+)/i);
    if(m) return { year:parseInt(m[1]), num:parseInt(m[2]) };
    const n = parseInt(s);
    if(!isNaN(n) && n > 0) return { year:new Date().getFullYear(), num:n };
    return null;
  }
  /* Audit-log shim (SC.logAudit is a no-op in v4.5+, but the call is kept
     so flipping the audit feature on later doesn't need code edits here). */
  function _audit(area, rid, field, before, after, reason){
    try{ if(typeof SC !== 'undefined' && SC.logAudit) SC.logAudit(area, rid, field, before, after, reason); }catch(_){}
  }

  /* ---------- input normalisation (date / time) ---------- */
  function fmtTime(el){
    const v = (el.value||'').replace(/[^\d]/g,'');
    if(v.length >= 3){
      let hh = v.slice(0,2), mm = v.slice(2,4);
      if(parseInt(hh) > 23) hh = '23';
      if(mm.length >= 2 && parseInt(mm) > 59) mm = '59';
      el.value = hh + ':' + mm;
    }
  }
  function fmtDate(el){
    const raw = (el.value||'').replace(/[^\d\/]/g,'').slice(0,8);
    if(raw !== el.value) el.value = raw;
  }
  function fmtDateBlur(el){
    const v = (el.value||'').replace(/[^\d]/g,'');
    if(!v.length) return;
    if(v.length <= 2){ el.value = v; return; }
    if(v.length <= 4){ el.value = v.slice(0,2)+'/'+v.slice(2); return; }
    let dd = v.slice(0,2), mm = v.slice(2,4), yy = v.slice(4,6);
    if(parseInt(dd) > 31) dd = '31';
    if(parseInt(mm) > 12) mm = '12';
    el.value = dd + '/' + mm + (yy ? '/' + yy : '');
  }

  /* ---------- lot-name label (LPG-YYYY-NNN) ---------- */
  function updateLotNames(){
    ['1','2'].forEach(n=>{
      const inp = _gid('mc-l'+n), name = _gid('mc-ln'+n);
      if(!inp || !name) return;
      const num = parseInt(inp.value) || 0;
      name.textContent = num > 0 ? _lotName(num) : '';
    });
  }

  /* ---------- duplicate-lot check (RAM-only — reads ENG.ROWS) ---------- */
  function checkDupLot(n){
    const lotEl = _gid('mc-l'+n);
    if(!lotEl) return;
    const val = parseInt(lotEl.value);
    if(!val || val <= 0) return;
    const tk = n==='1' ? '3501' : '3502';
    const otherN = n==='1' ? '2' : '1';
    const otherLot = parseInt(_gid('mc-l'+otherN)?.value) || 0;
    if(otherLot === val){
      toast('⚠ Lot '+val+' is already used by TK-'+(otherN==='1'?'3501':'3502')+' — pick a different lot','er');
      lotEl.value = ''; lotEl.focus();
      return;
    }
    const rows = (typeof ENG !== 'undefined') ? ENG.ROWS : [];
    for(const r of rows){
      const rLot = String(r[1]||'').trim();
      const rTank = String(r[2]||'').trim().toUpperCase();
      const p = _parseLotNum(rLot);
      const rNum = p ? p.num : parseInt(rLot);
      if(rNum === val && rTank.includes(tk)){
        const q = String(r[27]||'').trim().toLowerCase();
        const statusTxt = q==='pass' ? '✅ Pass' : (q==='pending' ? '⏳ Pending' : '📋 '+(r[27]||''));
        alert('⚠ DUPLICATE LOT\n\nLot '+val+' ('+_lotName(val)+') already exists in the Tank Log:\n'+
              '• Tank: '+(r[2]||'')+'\n'+
              '• Date: '+(r[3]||'')+'\n'+
              '• Quality: '+statusTxt+'\n\n'+
              'Please use a different lot number.');
        toast('❌ Lot '+val+' already exists in Tank Log','er');
        lotEl.value = ''; lotEl.focus();
        return;
      }
    }
  }

  /* ---------- Current C3 auto-fill (latest lot for that tank in ENG.ROWS) ---------- */
  function _autoFillCr(n){
    if(CR_MODE[n] !== 'auto') return;
    const tk = n==='1' ? '3501' : '3502';
    const crEl = _gid('mc-cr'+n), hEl = _gid('mc-h'+n);
    if(!crEl) return;
    const yr = new Date().getFullYear();
    let best = null;
    const rows = (typeof ENG !== 'undefined') ? ENG.ROWS : [];
    rows.forEach(r=>{
      const p = _parseLotNum(r[1]);
      if(!p || p.year !== yr) return;
      const rTk = String(r[2]||'').toUpperCase();
      if(!rTk.includes(tk)) return;
      const c3pct = parseFloat(String(r[8]||'').replace(/,/g,''));
      if(isNaN(c3pct) || c3pct <= 0) return;
      if(!best || p.num > best.num) best = { num:p.num, c3:c3pct };
    });
    if(best){
      const pct = (Math.abs(best.c3) > 1) ? best.c3 : (best.c3 * 100);
      crEl.value = pct.toFixed(4);
      if(hEl) hEl.textContent = '← TK-'+tk+' Lot '+_lotName(best.num);
    } else {
      crEl.value = '';
      if(hEl) hEl.textContent = 'No prior lot data';
    }
  }
  function toggleCrMode(n){
    const btn = _gid('mc-crm'+n), crEl = _gid('mc-cr'+n), hEl = _gid('mc-h'+n);
    if(CR_MODE[n] === 'auto'){
      CR_MODE[n] = 'manual';
      if(btn){ btn.textContent = 'MANUAL'; btn.classList.add('manual'); }
      if(crEl){ crEl.readOnly = false; crEl.placeholder = 'manual'; }
      if(hEl) hEl.textContent = '✏ Manual';
    } else {
      CR_MODE[n] = 'auto';
      if(btn){ btn.textContent = 'AUTO'; btn.classList.remove('manual'); }
      if(crEl){ crEl.readOnly = true; crEl.placeholder = 'auto'; }
      _autoFillCr(n);
    }
    autoCalc(n);
  }

  /* ---------- panel state rendering ---------- */
  function _renderStatus(n){
    const badge = _gid('mc-status'+n);
    const hdr = _gid('mc-hdr'+n);
    if(!badge || !hdr) return;
    const cls = ['mc-hdr', 'mc-tk-'+n];
    if(ST[n] === 'calc')        cls.push('mc-state-calc');
    else if(ST[n] === 'mixing') cls.push('mc-state-mixing');
    hdr.className = cls.join(' ');
    let stateCls = 's-calc', label = '● CALCULATION';
    if(ST[n] === 'mixing'){
      stateCls = 's-mixing'; label = '◉ MIXING';
    } else if(ST[n] === 'calc'){
      const fvol = _gnum('gc'+n+'-fvol');
      const c3h8 = _gnum('gc'+n+'-c3h8');
      const gcRes = _gid('mc-gcres'+n);
      const gcDone = gcRes && gcRes.classList.contains('on') && (gcRes.innerHTML||'').indexOf('FILLED') >= 0;
      if(gcDone){ stateCls = 's-completed'; label = '● COMPLETED'; }
      else if(fvol > 0 || c3h8 > 0){ stateCls = 's-pending-gc'; label = '● PENDING GC'; }
    }
    badge.className = 'mc-status ' + stateCls;
    badge.textContent = label;
    const body = _gid('mc-body'+n);
    if(body) body.classList.toggle('on', ST[n] !== 'idle');
    const gc = _gid('mc-gc-inline'+n);
    if(gc) gc.classList.toggle('on', ST[n] !== 'idle');
    /* Lock IV/TV/TR when mixing */
    const locked = (ST[n] === 'mixing');
    ['mc-iv'+n,'mc-tv'+n,'mc-tr'+n].forEach(id=>{
      const el = _gid(id);
      if(el){ el.readOnly = locked; el.style.opacity = locked ? '.6' : '1'; }
    });
  }

  function activate(n){
    if(ST[n] === 'idle'){ ST[n] = 'calc'; }
    else if(ST[n] === 'calc'){ ST[n] = 'idle'; }
    /* never collapse from 'mixing' via header click — must finish/revert */
    _renderStatus(n);
    if(ST[n] !== 'idle') _autoFillCr(n);
  }

  /* ---------- toggles ---------- */
  function toggleOrder(n){
    const btn = _gid('mc-ord'+n);
    if(ORD[n] === 'C4'){
      ORD[n] = 'C3';
      if(btn){ btn.textContent = '➊C3 ➋C4'; btn.classList.remove('mc-btn-c4'); btn.classList.add('mc-btn-c3'); }
      toast('TK-'+(n==='1'?'3501':'3502')+': C3 first → C4 second','warn');
    } else {
      ORD[n] = 'C4';
      if(btn){ btn.textContent = '➊C4 ➋C3'; btn.classList.remove('mc-btn-c3'); btn.classList.add('mc-btn-c4'); }
      toast('TK-'+(n==='1'?'3501':'3502')+': C4 first → C3 second (default)','ok');
    }
    autoCalc(n);
  }
  function toggleLP(n){
    LP[n] = !LP[n];
    if(LP[n] && PC[n]){ PC[n] = false; _gid('mc-pc'+n)?.classList.remove('on'); _gid('mc-pc-box'+n)?.classList.remove('on'); }
    _gid('mc-lp'+n)?.classList.toggle('on', LP[n]);
    _gid('mc-lp-box'+n)?.classList.toggle('on', LP[n]);
    autoCalc(n);
  }
  function togglePC(n){
    PC[n] = !PC[n];
    if(PC[n] && LP[n]){ LP[n] = false; _gid('mc-lp'+n)?.classList.remove('on'); _gid('mc-lp-box'+n)?.classList.remove('on'); }
    _gid('mc-pc'+n)?.classList.toggle('on', PC[n]);
    _gid('mc-pc-box'+n)?.classList.toggle('on', PC[n]);
    autoCalc(n);
  }

  /* ---------- main mass-balance calc (RAM) ---------- */
  function _calcOne(n){
    const tk = n==='1' ? '3501' : '3502';
    const iv = _gnum('mc-iv'+n);
    const tv = _gnum('mc-tv'+n);
    const trC3 = _gnum('mc-tr'+n) / 100;
    const crC3 = _gnum('mc-cr'+n) / 100;
    const resEl = _gid('mc-r'+n);
    if(!resEl) return;
    if(!(iv > 0) || !(tv > 0) || !(trC3 > 0) || !(crC3 > 0)){
      if(!_calcSilent) toast('⚠ TK-'+tk+': fill all four inputs','er');
      resEl.classList.remove('on');
      return;
    }
    const iC3 = crC3*iv, iC4 = (1-crC3)*iv;
    let aC3 = trC3*tv - iC3;
    let aC4 = (1-trC3)*tv - iC4;
    /* Pre-C3 adjustment (RECEIVE C3 before mixing) */
    let preC3 = 0, startVol = iv, addC3 = aC3, addC4 = aC4;
    if(PC[n]){
      preC3 = _gnum('mc-prec3'+n);
      if(preC3 > 0){
        if(preC3 > aC3){
          if(!_calcSilent) toast('⚠ TK-'+tk+': pre-C3 ('+preC3.toFixed(2)+' m³) exceeds C3 needed ('+aC3.toFixed(2)+' m³)','er');
          resEl.classList.remove('on'); return;
        }
        startVol = iv + preC3;
        const newCr = (crC3*iv + preC3) / startVol;
        const newCrEl = _gid('mc-newcr'+n);
        if(newCrEl) newCrEl.value = (newCr * 100).toFixed(2);
        addC3 = aC3 - preC3; addC4 = aC4;
      }
    }
    const ord = ORD[n];
    const first  = ord === 'C4' ? 'C4' : 'C3';
    const second = ord === 'C4' ? 'C3' : 'C4';
    const addFirst  = ord === 'C4' ? addC4 : addC3;
    const addSecond = ord === 'C4' ? addC3 : addC4;
    /* Levels */
    const vAfter1 = startVol + addFirst;
    const vAfter2 = vAfter1 + addSecond;
    const lvl1 = _v2L(vAfter1), lvl2 = _v2L(vAfter2);
    /* Mass in tons */
    const wC3 = aC3 * MC_D.c3l, wC4 = aC4 * MC_D.c4l;
    /* Low-pressure expected C3 */
    let lpHTML = '';
    if(LP[n]){
      const vPipe = _gnum('mc-vpipe'+n);
      if(vPipe > 0){
        const expC3 = (trC3*tv + crC3*vPipe) / (tv + vPipe);
        const expEl = _gid('mc-expc3'+n);
        if(expEl) expEl.value = (expC3 * 100).toFixed(2);
        const ok = expC3 >= 0.30 && expC3 <= 0.35;
        const rc = ok ? '#15803d' : '#c53727', rb = ok ? 'var(--green-soft)' : 'var(--red-soft)';
        const solved = (0.33*(tv + vPipe) - crC3*vPipe) / tv;
        lpHTML = '<div style="margin-top:4px;padding:4px 10px;background:#f3e8ff;border:1.5px solid #d4b5f0;border-radius:5px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">'+
          '<span style="font-family:Oswald;font-size:10px;letter-spacing:1px;color:#7b2d8e;font-weight:700">📐 LOW PRESSURE</span>'+
          '<span style="font-size:10px;color:#7b2d8e">Pipe '+_fmt(vPipe,1)+' m³ · Prev C3 '+_fmt(crC3*100,1)+'%</span>'+
          '<span style="padding:2px 8px;border-radius:4px;background:'+rb+';color:'+rc+';font-family:Oswald;letter-spacing:1px;font-weight:800;font-size:11px">★ EXPECTED C3 <span style="font-family:monospace;font-size:14px">'+(expC3*100).toFixed(2)+'%</span></span>'+
          (ok ? '' : '<span style="font-size:9px;color:var(--red);font-weight:600">⚠ Hint target: '+(solved*100).toFixed(1)+'%</span>')+
        '</div>';
      }
    }
    /* Odorant (BDSET) — based on pre-PC amounts for stable formula */
    const odoSET = Math.round((aC3 + aC4) / MC_ODO.ref * 100) * 1000;
    const odoBD  = MC_ODO.bd * odoSET;
    const col1 = first === 'C4' ? 'var(--orange)' : 'var(--blue)';
    const col2 = second === 'C4' ? 'var(--orange)' : 'var(--blue)';
    resEl.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;margin-bottom:4px;border-bottom:1.5px solid rgba(0,0,0,.08);flex-wrap:wrap;gap:4px">'+
        '<span style="font-family:Oswald;font-size:14px;letter-spacing:1px;color:var(--ink-2)">TARGET <span style="font-weight:700;color:var(--blue)">C3 '+(trC3*100).toFixed(0)+'%</span> · <span style="font-weight:700;color:var(--orange)">C4 '+((1-trC3)*100).toFixed(0)+'%</span></span>'+
        '<span style="display:flex;align-items:center;gap:8px">'+
          '<span style="font-family:monospace;font-size:15px;font-weight:700">'+_fmt(tv,0)+' m³</span>'+
          '<span style="font-family:Oswald;font-size:10px;color:#7b2d8e;font-weight:600;letter-spacing:1px">💨 ODO SET <span style="font-family:monospace;font-size:15px;font-weight:800">'+_fmt(odoSET,0)+'</span> BD <span style="font-family:monospace;font-size:15px;font-weight:800">'+_fmt(odoBD,2)+'</span></span>'+
        '</span></div>'+
      (PC[n] && preC3 > 0 ?
        '<div style="font-size:10px;padding:3px 8px;background:#fef3c7;border-radius:4px;margin-bottom:4px;color:#92400e;font-weight:600;display:flex;gap:8px;align-items:center"><span>📥 Receive C3: '+_fmt(preC3)+' m³</span><span>C3% after: '+(((crC3*iv + preC3) / startVol) * 100).toFixed(2)+'%</span></div>' : '')+
      '<div style="display:flex;align-items:center;gap:4px;margin:4px 0;flex-wrap:wrap">'+
        '<div style="display:flex;align-items:center;gap:4px;background:var(--orange-soft);padding:3px 8px;border-radius:4px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--orange)"></span><span style="font-family:Oswald;font-size:12px;color:var(--orange);font-weight:700">C4</span><span style="font-family:monospace;font-size:14px;font-weight:800;color:var(--orange);margin-left:4px">'+_fmt(addC4)+'</span><span style="font-size:9px;color:var(--ink-2)">m³</span></div>'+
        '<div style="display:flex;align-items:center;gap:4px;background:var(--blue-soft);padding:3px 8px;border-radius:4px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--blue)"></span><span style="font-family:Oswald;font-size:12px;color:var(--blue);font-weight:700">C3</span><span style="font-family:monospace;font-size:14px;font-weight:800;color:var(--blue);margin-left:4px">'+_fmt(addC3)+'</span><span style="font-size:9px;color:var(--ink-2)">m³</span></div>'+
        '<div style="display:flex;align-items:center;gap:4px;padding:3px 8px"><span style="font-family:Oswald;font-size:12px;color:var(--red);font-weight:700">LPG</span><span style="font-family:monospace;font-size:14px;font-weight:800;color:var(--red);margin-left:4px">'+_fmt(wC3 + wC4)+'</span><span style="font-size:9px;color:var(--ink-2)">ton</span></div>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px">'+
        '<div style="background:var(--panel);border-radius:6px;padding:8px 12px;border:2.5px dashed '+col1+';display:flex;align-items:center;justify-content:space-between">'+
          '<div style="display:flex;align-items:center;gap:5px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+col1+'"></span><span style="font-family:Oswald;font-size:13px;letter-spacing:1.5px;color:var(--ink-2);font-weight:600">STOP '+first+'</span></div>'+
          '<div style="display:flex;align-items:baseline;gap:6px"><span style="font-family:monospace;font-size:28px;font-weight:800;color:'+col1+'">'+_fmt(vAfter1,1)+'</span><span style="font-size:15px;color:var(--ink-2);font-weight:600">m³</span><span style="font-family:monospace;font-size:18px;font-weight:700;color:'+col1+';opacity:.6">'+_fmt(lvl1,0)+'</span><span style="font-size:12px;color:var(--ink-2)">mm</span></div>'+
        '</div>'+
        '<div style="background:var(--panel);border-radius:6px;padding:8px 12px;border:2.5px dashed '+col2+';display:flex;align-items:center;justify-content:space-between">'+
          '<div style="display:flex;align-items:center;gap:5px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+col2+'"></span><span style="font-family:Oswald;font-size:13px;letter-spacing:1.5px;color:var(--ink-2);font-weight:600">STOP '+second+'</span></div>'+
          '<div style="display:flex;align-items:baseline;gap:6px"><span style="font-family:monospace;font-size:28px;font-weight:800;color:'+col2+'">'+_fmt(vAfter2,1)+'</span><span style="font-size:15px;color:var(--ink-2);font-weight:600">m³</span><span style="font-family:monospace;font-size:18px;font-weight:700;color:'+col2+';opacity:.6">'+_fmt(lvl2,0)+'</span><span style="font-size:12px;color:var(--ink-2)">mm</span></div>'+
        '</div>'+
      '</div>'+ lpHTML;
    resEl.classList.add('on');
    /* Tank height hint (only update when in MANUAL mode — AUTO already shows "← TK-... Lot ...") */
    if(CR_MODE[n] !== 'auto'){
      const hEl = _gid('mc-h'+n);
      if(hEl && iv > 0) hEl.textContent = 'H='+( _v2L(iv) / 1000 ).toFixed(3)+' m';
    }
    if(!_calcSilent) toast('✅ TK-'+tk+': calculation done','ok');
  }

  function calcOne(n){
    if(ST[n] === 'mixing'){ toast('⚠ TK-'+(n==='1'?'3501':'3502')+' is mixing — cannot recalculate','er'); return; }
    if(ST[n] === 'idle'){ ST[n] = 'calc'; _renderStatus(n); }
    _calcOne(n);
    autoGcRecalc(n);
  }

  function autoCalc(n){
    clearTimeout(_calcTimer[n]);
    _calcTimer[n] = setTimeout(()=>{
      const iv = _gnum('mc-iv'+n);
      const tv = _gnum('mc-tv'+n);
      const tr = _gnum('mc-tr'+n);
      const cr = _gnum('mc-cr'+n);
      const resEl = _gid('mc-r'+n);
      if(iv > 0 && tv > 0 && tr > 0 && cr > 0){
        if(ST[n] === 'idle'){ ST[n] = 'calc'; _renderStatus(n); }
        if(ST[n] === 'mixing') return;
        _calcSilent = true;
        _calcOne(n);
        autoGcRecalc(n);
        _calcSilent = false;
      } else if(resEl){
        resEl.classList.remove('on');
        const gcRes = _gid('mc-gcres'+n);
        if(gcRes) gcRes.classList.remove('on');
      }
    }, 350);
  }

  function resetCalc(n){
    const tk = n==='1' ? 'TK-3501' : 'TK-3502';
    if(ST[n] === 'mixing'){ toast('⚠ '+tk+' is mixing — cannot reset','er'); return; }
    if(ST[n] !== 'calc') return;
    ['mc-iv'+n,'mc-sd'+n,'mc-s'+n,'mc-fd'+n,'mc-f'+n,'mc-l'+n,'mc-prec3'+n].forEach(id=>{ const e = _gid(id); if(e) e.value = ''; });
    const tvEl = _gid('mc-tv'+n); if(tvEl) tvEl.value = '570';
    const trEl = _gid('mc-tr'+n); if(trEl) trEl.value = '55';
    const vpEl = _gid('mc-vpipe'+n); if(vpEl) vpEl.value = '74';
    CR_MODE[n] = 'auto';
    const crEl = _gid('mc-cr'+n);
    if(crEl){ crEl.readOnly = true; crEl.placeholder = 'auto'; }
    const crmBtn = _gid('mc-crm'+n);
    if(crmBtn){ crmBtn.textContent = 'AUTO'; crmBtn.classList.remove('manual'); }
    _autoFillCr(n);
    _gid('mc-r'+n)?.classList.remove('on');
    _gid('mc-gcres'+n)?.classList.remove('on');
    /* Clear GC inputs too */
    ['ch4','c2h6','c3h8','ic4','nc4','bd13','c5','olef','temp','pres','fvol','den'].forEach(k=>{
      const e = _gid('gc'+n+'-'+k); if(e) e.value = '';
    });
    const sumEl = _gid('mc-gcsum'+n);
    if(sumEl){ sumEl.textContent = 'Sum: —'; sumEl.className = 'mc-gc-sum'; }
    LP[n] = false; _gid('mc-lp'+n)?.classList.remove('on'); _gid('mc-lp-box'+n)?.classList.remove('on');
    PC[n] = false; _gid('mc-pc'+n)?.classList.remove('on'); _gid('mc-pc-box'+n)?.classList.remove('on');
    MIXING_LOT[n] = 0;
    GCR[n] = null;
    updateLotNames();
    _renderStatus(n);
    toast('🗑 Reset '+tk,'ok');
  }

  /* ---------- START / FINISH / REVERT (mixing-state Firebase sync) ---------- */
  function _collectMixingState(n){
    return {
      lot: MIXING_LOT[n] || 0,
      iv: _gv('mc-iv'+n), tv: _gv('mc-tv'+n),
      tr: _gv('mc-tr'+n), cr: _gv('mc-cr'+n),
      sd: _gv('mc-sd'+n), st: _gv('mc-s'+n),
      lp: LP[n], pc: PC[n], ord: ORD[n],
      vpipe: _gv('mc-vpipe'+n), prec3: _gv('mc-prec3'+n),
      crMode: CR_MODE[n],
      by: (typeof CURRENT_USER !== 'undefined' ? CURRENT_USER.name : ''),
      _ts: Date.now()
    };
  }
  function _pushMixingFb(n){
    if(!_fbRef) return;
    const key = 'tk' + n;
    const payload = _collectMixingState(n);
    _suppressEcho++;
    _fbRef.child(key).set(payload)
      .catch(e => console.warn('[MC] mix-state push', e))
      .finally(()=> setTimeout(()=>{ _suppressEcho = Math.max(0, _suppressEcho - 1); }, 400));
    _audit('tankmix:state', key, 'state', null, 'mixing', 'mc start');
  }
  function _clearMixingFb(n){
    if(!_fbRef) return;
    const key = 'tk' + n;
    _suppressEcho++;
    _fbRef.child(key).set(null)
      .catch(e => console.warn('[MC] mix-state clear', e))
      .finally(()=> setTimeout(()=>{ _suppressEcho = Math.max(0, _suppressEcho - 1); }, 400));
    _audit('tankmix:state', key, 'state', 'mixing', null, 'mc finish/revert');
  }
  function _onRemoteMixingState(snap){
    if(_suppressEcho > 0) return;
    const key = snap.key;     // 'tk1' | 'tk2'
    if(key !== 'tk1' && key !== 'tk2') return;
    const v = snap.val();
    _remoteState[key] = v;
    const n = key === 'tk1' ? '1' : '2';
    if(v && typeof v === 'object' && v.lot){
      /* Another device says this tank is mixing — reflect locally
         only if WE aren't already mixing (don't clobber local input). */
      if(ST[n] !== 'mixing'){
        ST[n] = 'mixing';
        MIXING_LOT[n] = v.lot || 0;
        const set = (id, val)=>{ const el = _gid(id); if(el && val != null && val !== '') el.value = val; };
        set('mc-l'+n,  v.lot);
        set('mc-iv'+n, v.iv); set('mc-tv'+n, v.tv); set('mc-tr'+n, v.tr);
        if(v.cr){ const cr = _gid('mc-cr'+n); if(cr){ cr.value = v.cr; cr.readOnly = false; } CR_MODE[n] = v.crMode || 'manual'; }
        set('mc-sd'+n, v.sd); set('mc-s'+n, v.st);
        if(v.lp){ LP[n] = true; _gid('mc-lp'+n)?.classList.add('on'); _gid('mc-lp-box'+n)?.classList.add('on'); }
        if(v.pc){ PC[n] = true; _gid('mc-pc'+n)?.classList.add('on'); _gid('mc-pc-box'+n)?.classList.add('on'); }
        if(v.vpipe){ const e = _gid('mc-vpipe'+n); if(e) e.value = v.vpipe; }
        if(v.prec3){ const e = _gid('mc-prec3'+n); if(e) e.value = v.prec3; }
        if(v.ord){
          ORD[n] = v.ord;
          const btn = _gid('mc-ord'+n);
          if(btn){
            if(v.ord === 'C3'){ btn.textContent = '➊C3 ➋C4'; btn.classList.remove('mc-btn-c4'); btn.classList.add('mc-btn-c3'); }
            else { btn.textContent = '➊C4 ➋C3'; btn.classList.remove('mc-btn-c3'); btn.classList.add('mc-btn-c4'); }
          }
        }
        updateLotNames();
        _renderStatus(n);
        _calcSilent = true; _calcOne(n); _calcSilent = false;
      }
    } else if(v === null){
      /* Remote cleared — if local thinks it's mixing, drop back to calc */
      if(ST[n] === 'mixing'){
        ST[n] = 'calc';
        MIXING_LOT[n] = 0;
        _renderStatus(n);
      }
    }
  }

  function _startMix(n){
    if(ST[n] !== 'calc'){ toast('⚠ Click TK header to activate calculation first','er'); return; }
    const tk = n==='1' ? '3501' : '3502';
    const sdEl = _gid('mc-sd'+n), sEl = _gid('mc-s'+n);
    if(!sdEl.value) sdEl.value = _todayDDMMYY();
    if(!sEl.value || !sEl.value.trim()) sEl.value = _nowHHMM();
    /* Auto-suggest next lot from RAM (ENG.ROWS) */
    const yr = new Date().getFullYear();
    let maxLot = 0;
    const rows = (typeof ENG !== 'undefined') ? ENG.ROWS : [];
    rows.forEach(r=>{
      const p = _parseLotNum(r[1]);
      if(p && p.year === yr && p.num > maxLot) maxLot = p.num;
    });
    const otherN = n==='1' ? '2' : '1';
    const otherLot = MIXING_LOT[otherN] || 0;
    if(otherLot > maxLot) maxLot = otherLot;
    const lotEl = _gid('mc-l'+n);
    if(lotEl && !lotEl.value){ lotEl.value = String(maxLot + 1); }
    MIXING_LOT[n] = parseInt(lotEl?.value) || 0;
    if(!MIXING_LOT[n]){ toast('⚠ TK-'+tk+': enter a lot number first','er'); return; }
    if(!confirm('TK-'+tk+': start mixing Lot '+MIXING_LOT[n]+'?\n\n• Locks INIT VOL / TARGET VOL / TARGET C3 inputs\n• Pushes mixing state to Firebase (~120 bytes)\n• Other operators will see TK-'+tk+' is MIXING in real time\n\nOK to proceed?')){
      toast('Mix start cancelled','warn');
      return;
    }
    ST[n] = 'mixing';
    updateLotNames();
    _renderStatus(n);
    _pushMixingFb(n);
    toast('🔄 TK-'+tk+' → MIXING ('+_lotName(MIXING_LOT[n])+')','ok');
  }

  function startClick(n){
    clearTimeout(_startTimer[n]);
    _startTimer[n] = setTimeout(()=>{ _startMix(n); }, 230);
  }
  function startDblClick(n){
    clearTimeout(_startTimer[n]);
    _revertMix(n);
  }
  function _revertMix(n){
    if(ST[n] !== 'mixing') return;
    const tk = n==='1' ? '3501' : '3502';
    if(!confirm('Revert TK-'+tk+' to CALCULATION?\n\n• Clears Start time + Lot number\n• Deletes mixing state from Firebase')) return;
    const sdEl = _gid('mc-sd'+n), sEl = _gid('mc-s'+n), lotEl = _gid('mc-l'+n);
    if(sdEl) sdEl.value = ''; if(sEl) sEl.value = ''; if(lotEl) lotEl.value = '';
    MIXING_LOT[n] = 0;
    updateLotNames();
    ST[n] = 'calc';
    _renderStatus(n);
    _clearMixingFb(n);
    toast('↩ TK-'+tk+' → CALCULATION','ok');
  }

  /* ---------- GC sum visual & tab-next ---------- */
  function gcSumInline(n){
    let sum = 0;
    document.querySelectorAll('.gc-inp-'+n).forEach(el=>{ const v = parseFloat(el.value); if(!isNaN(v)) sum += v; });
    const el = _gid('mc-gcsum'+n);
    if(!el) return;
    if(sum === 0){
      el.textContent = 'Sum: —'; el.className = 'mc-gc-sum';
    } else if(Math.abs(sum - 100) < 0.5){
      el.textContent = 'Sum: '+sum.toFixed(2)+'% ✓'; el.className = 'mc-gc-sum s-ok';
    } else if(Math.abs(sum - 100) < 2){
      el.textContent = 'Sum: '+sum.toFixed(2)+'% ⚠'; el.className = 'mc-gc-sum s-warn';
    } else {
      el.textContent = 'Sum: '+sum.toFixed(2)+'% ≠100'; el.className = 'mc-gc-sum s-err';
    }
    autoGcRecalc(n);
  }
  function gcTabNext(e, el){
    if(e.key !== 'Enter') return;
    e.preventDefault();
    const container = el.closest('.mc-gc-inline');
    if(!container) return;
    const inputs = Array.from(container.querySelectorAll('input[type="text"]'));
    const idx = inputs.indexOf(el);
    if(idx >= 0 && idx < inputs.length - 1){
      inputs[idx + 1].focus();
      inputs[idx + 1].select?.();
    }
  }

  function autoGcRecalc(n){
    clearTimeout(_gcTimer[n]);
    _gcTimer[n] = setTimeout(()=>{
      const resEl = _gid('mc-gcres'+n);
      if(!resEl || !resEl.classList.contains('on')) return;
      const c3h8 = _gnum('gc'+n+'-c3h8'), ic4 = _gnum('gc'+n+'-ic4'), nc4 = _gnum('gc'+n+'-nc4');
      const fvol = _gnum('gc'+n+'-fvol');
      if((!c3h8 && !ic4 && !nc4) || !fvol) return;
      _gcSilent = true;
      gcCalcInline(n);
      _gcSilent = false;
    }, 300);
  }

  function gcCalcInline(n){
    const tk = n==='1' ? '3501' : '3502';
    let ch4 = _gnum('gc'+n+'-ch4'), c2h6 = _gnum('gc'+n+'-c2h6'), c3h8 = _gnum('gc'+n+'-c3h8');
    let ic4 = _gnum('gc'+n+'-ic4'), nc4 = _gnum('gc'+n+'-nc4'), bd13 = _gnum('gc'+n+'-bd13');
    let c5 = _gnum('gc'+n+'-c5'), olef = _gnum('gc'+n+'-olef');
    const fvol = _gnum('gc'+n+'-fvol'), lpgDen = _gnum('gc'+n+'-den');
    if(!c3h8 && !ic4 && !nc4){ if(!_gcSilent) toast('⚠ Enter Propane, i/n-Butane','er'); return; }
    if(!fvol){ if(!_gcSilent) toast('⚠ Enter Final Volume','er'); return; }
    const sum = ch4 + c2h6 + c3h8 + ic4 + nc4 + bd13 + c5 + olef;
    /* If user entered as 0-1 ratios, keep; if as percentages, normalize to fractions */
    if(sum > 1.5){ ch4/=100; c2h6/=100; c3h8/=100; ic4/=100; nc4/=100; bd13/=100; c5/=100; olef/=100; }
    const sL = c3h8 + ic4 + nc4;
    const sI = ch4 + c2h6 + bd13 + c5 + olef;
    /* Redistribute impurities proportionally to C3/C4 (matches V406 mass-balance model) */
    const rC3 = c3h8 + (sL > 0 ? (c3h8/sL)*sI : 0);
    const rC4 = (ic4 + nc4) + (sL > 0 ? ((ic4+nc4)/sL)*sI : 0);
    const wC3 = rC3*fvol*MC_D.c3l, wC4 = rC4*fvol*MC_D.c4l;
    const vwC3 = (MC_TV - fvol)*rC3*MC_D.c3v;
    const vwC4 = (MC_TV - fvol)*rC4*MC_D.c4v;
    const tC3 = wC3 + vwC3, tC4 = wC4 + vwC4;
    const iv = _gnum('mc-iv'+n), crd = _gnum('mc-cr'+n)/100;
    const bC3 = crd*iv*MC_D.c3l + (MC_TV - iv)*crd*MC_D.c3v;
    const bC4 = (1-crd)*iv*MC_D.c4l + (MC_TV - iv)*(1-crd)*MC_D.c4v;
    const fC3 = parseFloat((tC3 - bC3).toFixed(3));
    const fC4 = parseFloat((tC4 - bC4).toFixed(3));
    const fLPG = parseFloat((fC3 + fC4).toFixed(3));
    const lot = parseInt(_gv('mc-l'+n)) || 0;
    GCR[n] = {
      tk, lot,
      ch4, c2h6, c3h8, ic4, nc4, bd13, c5, olef,
      fvol, lpgDen, rC3, rC4, tC3, tC4, fC3, fC4, fLPG,
      qty: lpgDen > 0 ? fvol*lpgDen : fvol*(rC3*MC_D.c3l + rC4*MC_D.c4l),
      dens: lpgDen
    };
    /* Render 3 result cards + SAVE button */
    const resEl = _gid('mc-gcres'+n);
    if(!resEl) return;
    const _ord = ORD[n] || 'C4';
    const _fc = '<div style="background:var(--blue-soft);padding:8px 6px;border-radius:6px;text-align:center">'+
      '<div style="display:flex;align-items:baseline;justify-content:center;gap:4px"><span style="font-size:10px;color:var(--blue);font-weight:700;text-transform:uppercase;letter-spacing:1px">FILLED C3</span><span style="font-size:9px;color:var(--ink-2);font-weight:600">ton</span></div>'+
      '<div style="font-family:monospace;font-size:22px;font-weight:800;color:var(--blue);margin:2px 0">'+_fmt(fC3)+'</div>'+
      '<div style="font-size:9px;color:var(--ink-2)">'+(rC3*100).toFixed(2)+'%</div></div>';
    const _f4 = '<div style="background:var(--orange-soft);padding:8px 6px;border-radius:6px;text-align:center">'+
      '<div style="display:flex;align-items:baseline;justify-content:center;gap:4px"><span style="font-size:10px;color:var(--orange);font-weight:700;text-transform:uppercase;letter-spacing:1px">FILLED C4</span><span style="font-size:9px;color:var(--ink-2);font-weight:600">ton</span></div>'+
      '<div style="font-family:monospace;font-size:22px;font-weight:800;color:var(--orange);margin:2px 0">'+_fmt(fC4)+'</div>'+
      '<div style="font-size:9px;color:var(--ink-2)">'+(rC4*100).toFixed(2)+'%</div></div>';
    const _fl = '<div style="background:var(--red-soft);padding:8px 6px;border-radius:6px;text-align:center">'+
      '<div style="display:flex;align-items:baseline;justify-content:center;gap:4px"><span style="font-size:10px;color:var(--red);font-weight:700;text-transform:uppercase;letter-spacing:1px">FILLED LPG</span><span style="font-size:9px;color:var(--ink-2);font-weight:600">ton</span></div>'+
      '<div style="font-family:monospace;font-size:22px;font-weight:800;color:var(--red);margin:2px 0">'+_fmt(fLPG)+'</div>'+
      '<div style="font-size:9px;color:var(--ink-2)">'+(lpgDen ? 'ρ='+lpgDen : '')+'</div></div>';
    resEl.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">'+
        (_ord === 'C4' ? _f4 + _fc + _fl : _fc + _f4 + _fl)+
      '</div>'+
      '<div style="text-align:center;margin-top:8px">'+
        '<button type="button" onclick="MC.gcSave(\''+n+'\')" style="padding:7px 22px;background:var(--green);color:#fff;border:none;border-radius:5px;font-family:Oswald;font-size:12px;font-weight:700;letter-spacing:1px;cursor:pointer">💾 SAVE PASS → TANK LOG</button>'+
      '</div>';
    resEl.classList.add('on');
    if(!_gcSilent){
      toast('✅ GC TK-'+tk+' → Filled LPG: '+_fmt(fLPG)+' ton','ok');
      _renderStatus(n);
    }
  }

  /* ---------- SAVE to Tank Log (Pass / Pending) — pushes ONE row via ENG.upsertRow ---------- */
  function _saveToTankLog(n, quality, silent){
    const tk = n==='1' ? '3501' : '3502';
    const tkName = 'TK-'+tk;
    const lotNum = parseInt(_gv('mc-l'+n)) || 0;
    if(!lotNum){ toast('❌ Lot = 0 — press ▶START first to assign a Lot','er'); return false; }
    const lotStr = _lotName(lotNum);
    const stVal = (_gv('mc-s'+n)||'').trim();
    if(!stVal){ toast('❌ START not pressed — no Start time','er'); return false; }
    /* Form data */
    const formIV   = _gnum('mc-iv'+n);
    const formTV   = _gnum('mc-tv'+n);
    const formTrC3 = _gnum('mc-tr'+n);
    const formCrC3 = _gnum('mc-cr'+n);
    const formSD   = _gv('mc-sd'+n);
    const formST   = _gv('mc-s'+n);
    let   formFT   = _gv('mc-f'+n);
    let   formFD   = _gv('mc-fd'+n);
    if(!formFT){ formFT = _nowHHMM(); const fEl = _gid('mc-f'+n); if(fEl) fEl.value = formFT; }
    if(!formFD){ formFD = _todayDDMMYY(); const fdEl = _gid('mc-fd'+n); if(fdEl) fdEl.value = formFD; }
    const dateStr = formSD || _todayDDMMYY();
    /* GC numeric (may all be 0 if quality=Pending). GCR holds 0–1 fractions;
       store back as 0–100 % consistently. Scale is decided by the TOTAL GC
       sum, NOT by ethane alone — a 0-ethane sample must still store as %. */
    const gc = GCR[n] || {};
    const _gcSum = (gc.ch4||0)+(gc.c2h6||0)+(gc.c3h8||0)+(gc.ic4||0)
                 + (gc.nc4||0)+(gc.bd13||0)+(gc.c5||0)+(gc.olef||0);
    const gcMult = (_gcSum > 0 && _gcSum < 1.5) ? 100 : 1;
    /* Pull Temp/Pres/Density even if no GCR (user might have filled them) */
    const gcTemp = _gnum('gc'+n+'-temp');
    const gcPres = _gnum('gc'+n+'-pres');
    const gcDen  = _gnum('gc'+n+'-den');
    /* Try to reuse the rid if a row for this Lot|Tank already exists */
    const existing = (typeof ENG !== 'undefined') ? ENG.findRowByLotTank(lotStr, tkName) : null;
    let row;
    if(existing){
      /* mutate copy of existing row, keep its rid */
      row = existing.slice(0, 34);
      while(row.length < 34) row.push('');
    } else {
      row = new Array(34).fill('');
      row[1] = lotStr;
      row[2] = tkName;
    }
    row[3] = dateStr;
    row[4] = formST || row[4] || '';
    row[5] = formFT || row[5] || '';
    if(formIV)   row[10] = formIV;
    if(formCrC3){ row[11] = formCrC3; row[12] = parseFloat((100 - formCrC3).toFixed(4)); }
    if(formTrC3) row[29] = formTrC3;
    if(formTV)   row[30] = formTV;
    if(quality === 'Pass' && gc.fLPG != null){
      row[6]  = gc.fvol;
      row[7]  = gc.qty;
      row[8]  = gc.rC3;
      row[9]  = gc.rC4;
      row[13] = gc.fC3;
      row[14] = gc.fC4;
      row[15] = gc.fLPG;
      row[16] = (gc.ch4  || 0) * gcMult;
      row[17] = (gc.c2h6 || 0) * gcMult;
      row[18] = (gc.c3h8 || 0) * gcMult;
      row[19] = (gc.ic4  || 0) * gcMult;
      row[20] = (gc.nc4  || 0) * gcMult;
      row[21] = (gc.bd13 || 0) * gcMult;
      row[22] = (gc.c5   || 0) * gcMult;
      row[23] = (gc.olef || 0) * gcMult;
      row[24] = gc.rC3;
      row[25] = gc.rC4;
      /* Odorant (BDSET) — uses pre-PC amounts */
      if(formIV && formTV && formTrC3 && formCrC3){
        const aC3 = formTrC3/100*formTV - formCrC3/100*formIV;
        const aC4 = (1 - formTrC3/100)*formTV - (1 - formCrC3/100)*formIV;
        const odoSET = Math.round((aC3 + aC4) / MC_ODO.ref * 100) * 1000;
        row[26] = parseFloat((MC_ODO.bd * odoSET).toFixed(2));
      }
    } else {
      /* Pending — keep any pre-existing fields & write any user-entered GC partials */
      if(gc.fvol)   row[6]  = gc.fvol;
      if(gc.c3h8)   row[18] = gc.c3h8 * gcMult;
      if(gc.ic4)    row[19] = gc.ic4 * gcMult;
      if(gc.nc4)    row[20] = gc.nc4 * gcMult;
    }
    if(gcTemp) row[31] = gcTemp;
    if(gcPres) row[32] = gcPres;
    if(gcDen)  row[33] = gcDen;
    row[27] = quality;
    if(!row[28]) row[28] = '';
    /* Push via ENG (one child write) — ENG handles rid generation/lookup */
    const rid = ENG.upsertRow(row, existing ? { rid: existing._rid } : null);
    _audit('tankmix:'+(quality==='Pass'?'save':'draft'), rid, 'quality', '', quality.toLowerCase(),
           'mc '+ (quality==='Pass'?'save pass':'save draft'));
    if(!silent) toast((quality==='Pass'?'💾 SAVED PASS':'💾 Draft saved')+' — '+lotStr+' '+tkName,'ok');
    /* Sync filled C3/C4 + lot into Scale's tank config (auto-mode only) */
    if(quality === 'Pass' && typeof SCALE !== 'undefined' && SCALE.mcSyncTkCfg){
      try{
        SCALE.mcSyncTkCfg(n==='1'?'tk1':'tk2', {
          lot: String(lotNum),
          initWt: gc.qty || 0,
          filledC3: gc.fC3 || 0,
          filledC4: gc.fC4 || 0
        });
      }catch(e){ console.warn('[MC] SCALE.mcSyncTkCfg', e); }
    }
    /* Push the Scale Station 4-slot mix-notify bar — same as the edit-modal
       CALC+SAVE+NOTIFY — so the live MIX calc Pass-save also notifies Scale.
       One idempotent child write to mix_notify/{Tank_Lot} (overwrites on re-save). */
    if(quality === 'Pass' && gc.fLPG != null
       && typeof MIXNOTIFY !== 'undefined' && MIXNOTIFY.pushNotify){
      const fC3Kg = Math.round(Math.abs(gc.fC3 || 0) * 1000);
      const fC4Kg = Math.round(Math.abs(gc.fC4 || 0) * 1000);
      if(fC3Kg > 0 || fC4Kg > 0){
        try{ MIXNOTIFY.pushNotify(tkName, lotStr, fC3Kg, fC4Kg, n==='1'?'tk1':'tk2'); }
        catch(e){ console.warn('[MC] MIXNOTIFY.pushNotify', e); }
      }
    }
    return true;
  }

  /* Called by the SAVE button inside the GC result block (Quality = Pass) */
  function gcSave(n){
    if(!GCR[n]){ toast('⚠ Press 🧮 CALC in the GC section first','er'); return; }
    if(!confirm('Save GC PASS result to Tank Log?\n\n• Lot: '+_lotName(GCR[n].lot)+'\n• Tank: TK-'+GCR[n].tk+'\n• Filled LPG: '+_fmt(GCR[n].fLPG)+' ton\n\nOne child write to Firebase (incremental sync).')) return;
    if(!_saveToTankLog(n, 'Pass', /*silent*/ false)) return;
    /* Exit mixing if applicable; mixing-state node will be cleared */
    if(ST[n] === 'mixing'){
      ST[n] = 'calc';
      _clearMixingFb(n);
    }
    _renderStatus(n);
  }

  /* Called by the inline 💾 DRAFT button (Quality = Pending) */
  function gcSaveDraftInline(n){
    if(!_saveToTankLog(n, 'Pending', /*silent*/ false)) return;
    if(ST[n] === 'mixing'){
      ST[n] = 'calc';
      _clearMixingFb(n);
    }
    _renderStatus(n);
  }

  function finishMix(n){
    const tk = n==='1' ? '3501' : '3502';
    const lotNum = parseInt(_gv('mc-l'+n)) || 0;
    const stVal = (_gv('mc-s'+n)||'').trim();
    if(!lotNum || !stVal){
      toast('❌ START not pressed — no Lot/Start time. Press ▶START first.','er');
      return;
    }
    /* Auto-fill finish time/date if blank */
    if(!_gv('mc-fd'+n)){ const fdEl = _gid('mc-fd'+n); if(fdEl) fdEl.value = _todayDDMMYY(); }
    if(!_gv('mc-f'+n)){  const fEl  = _gid('mc-f'+n);  if(fEl)  fEl.value  = _nowHHMM(); }
    /* Warnings about missing GC */
    const c3h8 = _gnum('gc'+n+'-c3h8');
    const fvol = _gnum('gc'+n+'-fvol');
    const gcRes = _gid('mc-gcres'+n);
    const hasGc = gcRes && gcRes.classList.contains('on') && (gcRes.innerHTML||'').indexOf('FILLED') >= 0;
    const warns = [];
    if(!c3h8) warns.push('• GC Propane = 0');
    if(!fvol) warns.push('• Final Volume not entered');
    if(!hasGc) warns.push('• 🧮 CALC not pressed on the GC section');
    if(warns.length){
      if(!confirm('TK-'+tk+' — Finish without complete GC?\n\n'+warns.join('\n')+'\n\nRow will be saved as Quality = Pending.\n\nOK = save Pending  ·  Cancel = go back')) return;
    }
    const quality = hasGc ? 'Pass' : 'Pending';
    if(!_saveToTankLog(n, quality, /*silent*/ false)) return;
    if(ST[n] === 'mixing'){
      ST[n] = 'calc';
      _clearMixingFb(n);
    }
    _renderStatus(n);
  }

  /* ---------- Settings modal ---------- */
  function openSettings(){
    const c = { c3l:MC_D.c3l, c4l:MC_D.c4l, c3v:MC_D.c3v, c4v:MC_D.c4v,
                tv:MC_TV, r:MC_TANK_R,
                odoPpm:MC_ODO.ppm, odoRef:MC_ODO.ref, odoBd:MC_ODO.bd };
    const fields = ['c3l','c4l','c3v','c4v','tv','r','odoPpm','odoRef','odoBd'];
    const idMap = { c3l:'mc-cfg-c3l', c4l:'mc-cfg-c4l', c3v:'mc-cfg-c3v', c4v:'mc-cfg-c4v',
                    tv:'mc-cfg-tv', r:'mc-cfg-r', odoPpm:'mc-cfg-odo-ppm',
                    odoRef:'mc-cfg-odo-ref', odoBd:'mc-cfg-odo-bd' };
    fields.forEach(k=>{ const e = _gid(idMap[k]); if(e) e.value = c[k]; });
    _gid('mc-cfg-backdrop')?.classList.add('on');
  }
  function closeSettings(){ _gid('mc-cfg-backdrop')?.classList.remove('on'); }
  function saveSettings(){
    const idMap = { c3l:'mc-cfg-c3l', c4l:'mc-cfg-c4l', c3v:'mc-cfg-c3v', c4v:'mc-cfg-c4v',
                    tv:'mc-cfg-tv', r:'mc-cfg-r', odoPpm:'mc-cfg-odo-ppm',
                    odoRef:'mc-cfg-odo-ref', odoBd:'mc-cfg-odo-bd' };
    const c = {};
    Object.keys(idMap).forEach(k=>{
      const v = parseFloat(_gv(idMap[k]));
      c[k] = isNaN(v) ? DEF[k] : v;
    });
    _applyCfg(c);
    _saveCfg(c);
    closeSettings();
    toast('⚙️ Mix Calculator settings saved','ok');
    /* Re-run any visible calculations to reflect new constants */
    ['1','2'].forEach(n=>{
      if(ST[n] !== 'idle'){
        _calcSilent = true; _calcOne(n); _calcSilent = false;
        const gcRes = _gid('mc-gcres'+n);
        if(gcRes && gcRes.classList.contains('on')){ _gcSilent = true; gcCalcInline(n); _gcSilent = false; }
      }
    });
  }
  function resetSettings(){
    if(!confirm('Reset all Mix Calculator constants to defaults?\n\n(C3/C4 densities, tank radius, max volume, odorant constants)')) return;
    _applyCfg(DEF);
    _saveCfg(DEF);
    openSettings();    // re-populate the form with defaults
    toast('↺ Constants reset to defaults','ok');
  }

  /* ---------- refresh() — called when user navigates to the Mix Cal sub-tab ---------- */
  function refresh(){
    ['1','2'].forEach(n=>{
      _autoFillCr(n);
      _renderStatus(n);
    });
    updateLotNames();
  }

  /* ---------- init: connect Firebase listener for mixing-state ---------- */
  function init(){
    /* No localStorage state cache for in-progress calc — spec says calc on RAM,
       only mixing-state goes to Firebase. */
    try{
      if(typeof firebase !== 'undefined'){
        _fbRef = firebase.database().ref('eng_mix_state');
        _fbRef.on('child_added',   _onRemoteMixingState);
        _fbRef.on('child_changed', _onRemoteMixingState);
        _fbRef.on('child_removed', snap=>{
          if(_suppressEcho > 0) return;
          const key = snap.key;
          if(key !== 'tk1' && key !== 'tk2') return;
          _remoteState[key] = null;
          const n = key === 'tk1' ? '1' : '2';
          if(ST[n] === 'mixing'){
            ST[n] = 'calc';
            MIXING_LOT[n] = 0;
            _renderStatus(n);
          }
        });
      }
    }catch(e){ console.warn('[MC] FB init', e); }
    /* Initial UI sync */
    refresh();
    console.log('[MC] ✅ Init OK · Mix Calculator ready');
  }

  /* ---------- Public: resume a Pending Tank Log row into the inline GC -----
     Caller passes a 34-col row snapshot (NOT a live reference) from
     ENG.ROWS[i]. We pick the tank from r[2], switch to the Mix Cal
     sub-tab, set ST='calc' (so everything stays editable), prefill
     all Lot / IV / TV / TR / CR / Start / Finish / GC / Final Vol /
     Density fields, then scroll the inline GC into view and focus
     the first GC input. When the operator finishes GC and presses
     💾 SAVE PASS, _saveToTankLog → ENG.upsertRow finds the existing
     row by Lot|Tank (lot number match, year-tolerant via
     findRowByLotTank) and updates it in place — same rid, one child
     write. */
  function _fmtRowDate(raw){
    const s = String(raw||'').trim(); if(!s) return '';
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(m) return m[3]+'/'+m[2]+'/'+m[1].slice(2);
    if(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s)) return s.replace(/-/g,'/');
    return s;
  }
  function _fmtRowTime(raw){
    let s = String(raw||'').trim(); if(!s) return '';
    if(/^\d{1,2}$/.test(s)) s = s.padStart(2,'0')+':00';
    return s;
  }
  function _numStr(v){
    const x = parseFloat(String(v||'').replace(/,/g,''));
    return isNaN(x) ? '' : String(x);
  }

  function openGc(rowSnap){
    if(!rowSnap || !rowSnap[2]){ toast('⚠ Invalid row — missing tank','er'); return; }
    const tkStr = String(rowSnap[2]||'');
    const n = tkStr.includes('3501') ? '1' : (tkStr.includes('3502') ? '2' : null);
    if(!n){ toast('⚠ Unknown tank: '+tkStr,'er'); return; }

    const rowLotNum = (function(){
      const p = _parseLotNum(rowSnap[1]);
      return p ? p.num : 0;
    })();

    /* If the SAME tank is mixing a different lot, ask before clobbering */
    if(ST[n] === 'mixing' && MIXING_LOT[n] && rowLotNum && MIXING_LOT[n] !== rowLotNum){
      if(!confirm('⚠ TK-'+(n==='1'?'3501':'3502')+' is currently MIXING Lot '+MIXING_LOT[n]+
                  '\n\nLoading Lot '+rowLotNum+' for GC will overwrite the live mix state.\n\nProceed?')){
        return;
      }
      /* user said yes — clear the mixing FB state for this tank */
      _clearMixingFb(n);
    }

    /* Switch sub-tab to Mix Cal */
    if(typeof engSwitchTab === 'function'){
      try{ engSwitchTab('mixcal'); }catch(_){}
    }

    /* Reset to 'calc' state so all inputs remain editable */
    ST[n] = 'calc';
    MIXING_LOT[n] = rowLotNum || 0;

    /* Prefill identity / mix inputs from the row */
    const _set = (id, val) => {
      const el = _gid(id);
      if(el && val !== null && val !== undefined && val !== '') el.value = val;
    };
    _set('mc-l'+n,  rowLotNum || '');
    _set('mc-iv'+n, _numStr(rowSnap[10]));
    _set('mc-tv'+n, _numStr(rowSnap[30]) || '570');
    _set('mc-tr'+n, _numStr(rowSnap[29]) || '55');
    _set('mc-cr'+n, _numStr(rowSnap[11]));
    _set('mc-sd'+n, _fmtRowDate(rowSnap[3]));
    _set('mc-s'+n,  _fmtRowTime(rowSnap[4]));
    _set('mc-fd'+n, _fmtRowDate(rowSnap[3]));
    _set('mc-f'+n,  _fmtRowTime(rowSnap[5]));

    /* Force CR mode to MANUAL — we explicitly supplied a value from the row */
    CR_MODE[n] = 'manual';
    const crEl = _gid('mc-cr'+n);
    if(crEl){ crEl.readOnly = false; crEl.placeholder = ''; }
    const crmBtn = _gid('mc-crm'+n);
    if(crmBtn){ crmBtn.textContent = 'MANUAL'; crmBtn.classList.add('manual'); }

    /* Prefill GC inputs */
    _set('gc'+n+'-c2h6', _numStr(rowSnap[17]));
    _set('gc'+n+'-c3h8', _numStr(rowSnap[18]));
    _set('gc'+n+'-ic4',  _numStr(rowSnap[19]));
    _set('gc'+n+'-nc4',  _numStr(rowSnap[20]));
    _set('gc'+n+'-c5',   _numStr(rowSnap[22]));
    _set('gc'+n+'-olef', _numStr(rowSnap[23]));
    _set('gc'+n+'-temp', _numStr(rowSnap[31]));
    _set('gc'+n+'-pres', _numStr(rowSnap[32]));
    _set('gc'+n+'-fvol', _numStr(rowSnap[6]));
    _set('gc'+n+'-den',  _numStr(rowSnap[33]));

    /* Refresh derived UI */
    try{ updateLotNames(); }catch(_){}
    _renderStatus(n);
    try{ gcSumInline(n); }catch(_){}
    try{ autoCalc(n); }catch(_){}      // recompute STOP-C3/STOP-C4 etc.

    /* Scroll to + focus the GC section */
    setTimeout(()=>{
      const gc = _gid('mc-gc-inline'+n);
      if(gc){
        gc.scrollIntoView({ behavior:'smooth', block:'center' });
        const firstGc = gc.querySelector('input[type="text"]');
        if(firstGc){ firstGc.focus(); firstGc.select?.(); }
      }
    }, 300);

    const lotDisp = String(rowSnap[1]||'') || ('Lot '+rowLotNum);
    toast('🧪 Resumed '+(n==='1'?'TK-3501':'TK-3502')+' · '+lotDisp+' — enter GC + 🧮 CALC + 💾 SAVE PASS','ok');
  }

  /* ---------- Public: re-calc Filled C3/C4/LPG from a Tank Log row -----
     Reads cols [17]C2H6 [18]C3H8 [19]iC4 [20]nC4 [22]C5 [23]Olefin for GC,
     [6] final vol, [33] density, [10] init vol, [11] current C3,
     [29] target C3%, [30] target vol (used for Odorant BD only).
     Pure function: does NOT write to the row. Returns
       { fC3, fC4, fLPG, rC3, rC4, qty, tC3, tC4, odoBD, error? }.
     Caller decides which columns to update — keeps the recompute side-
     effect-free so it can be reused by an audit / preview later. */
  function calcFromRow(r){
    if(!r) return { error:'Row missing' };
    const _num = v => { const x = parseFloat(String(v||'').replace(/,/g,'')); return isNaN(x) ? 0 : x; };
    let c2h6 = _num(r[17]), c3h8 = _num(r[18]);
    let ic4  = _num(r[19]), nc4  = _num(r[20]);
    let c5   = _num(r[22]), olef = _num(r[23]);
    let ch4  = _num(r[16]), bd13 = _num(r[21]);   // CH₄ / 1,3-BD now stored in TL row
    const fvol   = _num(r[6]);
    const lpgDen = _num(r[33]);
    if(!c3h8 && !ic4 && !nc4) return { error:'Missing GC data (C₃H₈ / i-C₄ / n-C₄)' };
    if(!fvol)                 return { error:'Missing Final Volume (col 6)' };
    /* Normalize 0–100 % entries down to 0–1 fractions */
    const sum = ch4 + c2h6 + c3h8 + ic4 + nc4 + bd13 + c5 + olef;
    if(sum > 1.5){ ch4/=100; c2h6/=100; c3h8/=100; ic4/=100; nc4/=100; bd13/=100; c5/=100; olef/=100; }
    const sL = c3h8 + ic4 + nc4;
    const sI = ch4 + c2h6 + bd13 + c5 + olef;
    /* Redistribute impurities proportionally onto C3 / C4 (V406 model) */
    const rC3 = c3h8 + (sL > 0 ? (c3h8/sL)*sI : 0);
    const rC4 = (ic4 + nc4) + (sL > 0 ? ((ic4+nc4)/sL)*sI : 0);
    const wC3 = rC3*fvol*MC_D.c3l, wC4 = rC4*fvol*MC_D.c4l;
    const vwC3 = (MC_TV - fvol)*rC3*MC_D.c3v;
    const vwC4 = (MC_TV - fvol)*rC4*MC_D.c4v;
    const tC3 = wC3 + vwC3, tC4 = wC4 + vwC4;
    const iv  = _num(r[10]);
    const crRaw = _num(r[11]);
    const crd = crRaw > 1 ? crRaw / 100 : crRaw;
    const bC3 = crd*iv*MC_D.c3l + (MC_TV - iv)*crd*MC_D.c3v;
    const bC4 = (1-crd)*iv*MC_D.c4l + (MC_TV - iv)*(1-crd)*MC_D.c4v;
    const fC3 = parseFloat((tC3 - bC3).toFixed(3));
    const fC4 = parseFloat((tC4 - bC4).toFixed(3));
    const fLPG= parseFloat((fC3 + fC4).toFixed(3));
    const qty = lpgDen > 0 ? fvol*lpgDen : fvol*(rC3*MC_D.c3l + rC4*MC_D.c4l);
    /* Odorant BD — only when form has init vol / target vol / target C3 / current C3 */
    let odoBD = 0;
    const trRaw = _num(r[29]);
    const tv    = _num(r[30]);
    if(iv && tv && trRaw && crRaw){
      const _tr = trRaw > 1 ? trRaw/100 : trRaw;
      const aC3o = _tr*tv - crd*iv;
      const aC4o = (1-_tr)*tv - (1-crd)*iv;
      const odoSET = Math.round((aC3o + aC4o) / MC_ODO.ref * 100) * 1000;
      odoBD = parseFloat((MC_ODO.bd * odoSET).toFixed(2));
    }
    return { fC3, fC4, fLPG, rC3, rC4, qty, tC3, tC4, odoBD };
  }

  /* ---------- public API ---------- */
  return {
    init, refresh,
    activate, calcOne, autoCalc, resetCalc,
    toggleOrder, toggleLP, togglePC, toggleCrMode,
    startClick, startDblClick, finishMix,
    fmtTime, fmtDate, fmtDateBlur,
    updateLotNames, checkDupLot,
    gcSumInline, gcTabNext, autoGcRecalc, gcCalcInline, gcSave, gcSaveDraftInline,
    openSettings, closeSettings, saveSettings, resetSettings,
    calcFromRow, openGc
  };
})();


/* ============================================================
   MIXNOTIFY — Tank Mix → Scale Station notification bar (v4.24.0)
   ────────────────────────────────────────────────────────────
   Tank Log "🧮 CALC + 💾 SAVE + 📢 NOTIFY" pushes a small entry
   to Firebase path /mix_notify/{pk} so the Scale Station floor
   staff sees a pending stock-transfer for that tank/lot in
   real time. The Scale tab has 4 fixed slots in Row 5
   (#scRow5 .sc-r5-cell × 4); we render the 4 OLDEST PENDING
   entries (sorted by _ts ascending) into those slots, leaving
   blanks for the rest. Click ✅ on a slot → write
   {confirmed:true} to the FB entry → it drops out of PEND →
   the next oldest takes its place.

   Firebase footprint (Spark-frugal):
     • One small object per mix (~80 bytes)
     • Written on CALC+SAVE+NOTIFY, updated on ✅ confirm.
     • All devices share a single .on('value') listener.
   ============================================================ */
