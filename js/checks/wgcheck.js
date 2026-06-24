/* ============================================================
 * WGCHECK  —  wgcheck.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 19654–20615   (~962 dòng)
 * Global xuất ra : window.WGCHECK
 * Phase tách     : P4
 * Phụ thuộc      : wg, tl, sp
 * Khởi tạo (boot): WGCHECK.recheckRow() khi render
 * ------------------------------------------------------------
 * MÔ TẢ: Đối soát WMS/GI ↔ kế hoạch: badge cảnh báo lệch DO/khối lượng.
 *
 * API công khai (điền/đối chiếu khi tách):
 *   WGCHECK.badgeHtml(r), WGCHECK.plateHasDiff(r), WGCHECK.rowLevel(r), WGCHECK.recheckRow(r)
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module WGCHECK từ dòng 19654 đến 20615.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.WGCHECK).
 *   3) node --check wgcheck.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P4]: dán thân module WGCHECK (V4-54 dòng 19654–20615) vào đây. */

const WGCHECK = (function(){
  'use strict';

  const QTY_TOLERANCE = 0.05;   // 5% — V406 default
  const CUST_MIN_OVERLAP = 8;   // first-N-char substring match for lenient cust compare

  /* Strip leading zeros and extract DO numbers from a free-form string.
     Real DO = 7+ digit numbers (per V406 _wmsSaveIncoming).
     Alnum DO = 2-4 letter prefix + 6+ digits (e.g. KNHC export "KNH26061101")
                — kept verbatim (uppercased), NO zero-strip. v4.36.3: these
                were previously invisible to the cross-check, so KNH-format
                DOs never matched WMS GI after paste.
     Temp DO = XXXX-YYMMDD-BB format. */
  function extractDOs(doVal){
    const s = String(doVal||'').trim();
    if(!s) return [];
    if(/after\s*load|aft\s*load|afer\s*load|after\s*laod/i.test(s)) return [];
    const realDOs  = (s.match(/\b\d{7,}\b/g) || []).map(d => d.replace(/^0+/, '') || '0');
    const alnumDOs = (s.match(/\b[A-Za-z]{2,4}\d{6,}\b/g) || []).map(d => d.toUpperCase());
    const tempDOs  = s.match(/\b[A-Z]{4}-\d{6}-\d{2}\b/g) || [];
    return Array.from(new Set([...realDOs, ...alnumDOs, ...tempDOs]));
  }

  function _np(p){ return String(p||'').toUpperCase().replace(/[\s\-.]/g,''); }

  /* Extract individual VN plates from a combined string. WMS vehicle field
     packs truck+rmooc together ("51C-12345 29RM-04388" or "51C12345 29RM04388"). */
  function extractPlates(vehStr){
    const s = String(vehStr||'').trim();
    if(!s) return [];
    const tokens = s.split(/[\s,;\/]+/);
    const out = [];
    let buf = '';
    for(const t of tokens){
      if(/^\d{2}[A-Z]/.test(t)){
        if(buf) out.push(_np(buf));
        buf = t;
      } else if(buf && /^\d{3,5}$/.test(t)){
        buf += t;
      } else {
        if(buf){ out.push(_np(buf)); buf=''; }
        if(t) out.push(_np(t));
      }
    }
    if(buf) out.push(_np(buf));
    return out.filter(Boolean);
  }

  /* Normalize customer name to WMS canonical form via CUST DB. Falls back
     to uppercase when CT module unavailable or no match found. */
  function normalizeCust(planName){
    if(!planName) return '';
    try{
      if(typeof CT !== 'undefined' && CT.wmsName){
        const mapped = CT.wmsName(planName);
        if(mapped) return String(mapped).toUpperCase().trim();
      }
    }catch(_){}
    return String(planName).toUpperCase().trim();
  }

  /* Build {byDO: {do: wgRow}} from WG.ROWS. */
  function buildWgIndex(){
    const byDO = {};
    if(typeof WG === 'undefined' || !WG.ROWS) return { byDO };
    Object.values(WG.ROWS).forEach(w => {
      if(!w) return;
      const raw = String(w.delivId||'').replace(/[,\s]/g,'').trim();
      if(!raw) return;
      const dos = extractDOs(raw);
      dos.forEach(d => { byDO[d] = w; });
      // Also index by raw delivId (defensive): numeric stripped of leading
      // zeros, or alnum (KNH26061101-style) uppercased verbatim. v4.36.3.
      if(/^\d{6,}$/.test(raw)){
        byDO[raw.replace(/^0+/,'') || '0'] = w;
      } else if(/^[A-Za-z]{2,4}\d{6,}$/.test(raw)){
        byDO[raw.toUpperCase()] = w;
      }
    });
    return { byDO };
  }

  /* Per-row check — returns array of {code, msg}. */
  function _checkRow(r, idx){
    const warns = [];
    const doRaw = String(r.doNum||'').trim();
    const plate = String(r.plate||'').trim();
    const note  = String(r.note||'').trim();
    const dos = extractDOs(doRaw);

    // No DO scenario
    if(!dos.length){
      const all = (doRaw+' '+note).toLowerCase();
      const isAfterLoad = /after\s*load|aft\s*load|afer\s*load|after\s*laod/i.test(all);
      if(!isAfterLoad && plate){
        warns.push({ code:'NO_DO', msg:'⚠ No DO in Sale Plan (plate is set)' });
      }
      return warns;
    }

    dos.forEach(dn => {
      const w = idx.byDO[dn];
      if(!w){
        warns.push({ code:'DO_NOT_IN_WMS', msg:`⚠ DO ${dn} not found in WMS GI` });
        return;
      }
      // Customer compare — lenient first-8-char substring (V406)
      const planC = normalizeCust(r.customer);
      const wmsC  = String(w.customer||'').toUpperCase().trim();
      if(planC && wmsC){
        const ok = wmsC.includes(planC.slice(0, CUST_MIN_OVERLAP))
                || planC.includes(wmsC.slice(0, CUST_MIN_OVERLAP));
        if(!ok){
          warns.push({ code:'CUST_DIFF',
            msg:`⚡ Customer mismatch — Plan: "${r.customer}" | WMS: "${w.customer}"` });
        }
      }
      // Plate compare — every plan plate (truck+rmooc) should appear in WMS vehicle field
      const planPlates = [
        ...extractPlates(plate),
        ...extractPlates(r.rmooc || r.romooc || '')
      ].filter(Boolean);
      const wmsPlates = extractPlates(w.vehicle || '');
      if(planPlates.length && wmsPlates.length){
        const missing = planPlates.filter(p => !wmsPlates.includes(p));
        if(missing.length){
          const planLbl = (r.plate||'') + (r.rmooc ? ' / '+r.rmooc : '');
          warns.push({ code:'PLATE_DIFF',
            msg:`🚨 Plate differs from WMS — Plan: "${planLbl}" | WMS: "${w.vehicle||''}"` });
        }
      }
      // Qty compare with 5% tolerance
      const planQ = parseFloat(r.qty || r.contractQty || 0) || 0;
      const wmsQ  = parseFloat(w.orderMt || 0) || 0;
      if(planQ > 0 && wmsQ > 0){
        const diff = Math.abs(planQ - wmsQ);
        const pct  = diff / Math.max(planQ, wmsQ);
        if(pct > QTY_TOLERANCE){
          warns.push({ code:'QTY_DIFF',
            msg:`⚡ Qty mismatch — Plan: ${planQ} MT | WMS: ${wmsQ} MT` });
        }
      }
    });

    return warns;
  }

  /* Scan a plan dict; mutates r._wgWarns. Returns issue count. */
  function runCheck(plan, opts){
    opts = opts || {};
    if(!plan) return 0;
    const idx = buildWgIndex();
    let n = 0;
    Object.values(plan).forEach(r => {
      if(!r){ return; }
      if(r._status === 'done' || r._status === 'cancel'){ r._wgWarns = null; return; }
      const w = _checkRow(r, idx);
      if(w.length){ r._wgWarns = w; n++; }
      else { r._wgWarns = null; }
    });
    if(opts.toast && n > 0 && typeof toast === 'function'){
      toast(`⚠ ${n} order(s) mismatch Plan ↔ WMS — check row badges`, 'er', 5000);
    }
    return n;
  }

  /* Re-check a single row (used in cellEdited path). */
  function recheckRow(r){
    if(!r) return;
    if(r._status === 'done' || r._status === 'cancel'){ r._wgWarns = null; return; }
    const idx = buildWgIndex();
    const w = _checkRow(r, idx);
    r._wgWarns = w.length ? w : null;
  }

  /* Re-check TP + TMR plans (called after WG paste applied). */
  function recheckAllPlans(opts){
    let n = 0;
    if(typeof TP !== 'undefined' && TP.PLAN)  n += runCheck(TP.PLAN, opts || {});
    if(typeof TMR !== 'undefined' && TMR.PLAN) n += runCheck(TMR.PLAN, opts || {});
    // Trigger re-render of both tables (silent, RAM-only)
    try{ if(typeof TP !== 'undefined' && TP.refreshStatus)  TP.refreshStatus(); }catch(_){}
    try{ if(typeof TMR !== 'undefined' && TMR.refreshStatus) TMR.refreshStatus(); }catch(_){}
    return n;
  }

  /* Inline badge HTML for a row (used in doFormatter). Dedupe per code. */
  function badgeHtml(r){
    const w = r && r._wgWarns;
    if(!w || !w.length) return '';
    const seen = {};
    const parts = [];
    w.forEach(x => {
      if(seen[x.code]) return; seen[x.code] = 1;
      let cls, icon, label;
      switch(x.code){
        case 'NO_DO':         cls='wg-b-no-do'; icon='⚠';  label='NO DO';  break;
        case 'DO_NOT_IN_WMS': cls='wg-b-miss';  icon='🔴'; label='WMS?';   break;
        case 'PLATE_DIFF':    cls='wg-b-plate'; icon='🚨'; label='PLATE';  break;
        case 'QTY_DIFF':      cls='wg-b-qty';   icon='⚡'; label='QTY';    break;
        case 'CUST_DIFF':     cls='wg-b-cust';  icon='👤'; label='CUST';   break;
        default:              cls='wg-b-qty';   icon='⚡'; label='DIFF';
      }
      const t = String(x.msg||'').replace(/"/g,'&quot;').replace(/</g,'&lt;');
      parts.push(`<span class="wg-badge ${cls}" title="${t}">${icon} ${label}</span>`);
    });
    return parts.join('');
  }

  function plateHasDiff(r){
    const w = r && r._wgWarns;
    return !!(w && w.some(x => x.code === 'PLATE_DIFF'));
  }

  /* For row-level tint class: '' | 'any' | 'plate' */
  function rowLevel(r){
    const w = r && r._wgWarns;
    if(!w || !w.length) return '';
    return plateHasDiff(r) ? 'plate' : 'any';
  }

  /* Used in scAssignToStation — return soft WMS warnings for a row to be
     written into station note (parity with V406 checkBoothNote). */
  function assignWarnings(row){
    if(!row) return [];
    const idx = buildWgIndex();
    const doRaw = String(row.doNum||'').trim();
    const dos = extractDOs(doRaw);
    if(!dos.length) return [];
    const out = [];
    dos.forEach(dn => {
      const w = idx.byDO[dn];
      if(!w){
        if(!dn.includes('-')) out.push(`⚠ DO ${dn} not found in WMS`);
        return;
      }
      const planQ = parseFloat(row.qty || row.contractQty || 0) || 0;
      const wmsQ  = parseFloat(w.orderMt || 0) || 0;
      if(planQ > 0 && wmsQ > 0 && planQ > wmsQ){
        out.push(`⚠ DON'T LOAD: Sale Qty ${planQ}MT > DO Qty ${wmsQ}MT`);
      }
    });
    return out;
  }

  return {
    runCheck, recheckRow, recheckAllPlans,
    badgeHtml, rowLevel, plateHasDiff,
    assignWarnings, buildWgIndex, extractDOs, extractPlates
  };
})();



/* ============================================================
   PRINT FORMS MODULE — PTT + DN + KTPTVC
   Ported from V406, adapted for V4 data model
   ============================================================ */

/* ── Tab switch ── */
function pfSwitch(id, btn){
  document.querySelectorAll('.pf-tab').forEach(b=>b.classList.remove('on'));
  document.querySelectorAll('.pf-sub').forEach(s=>s.classList.remove('on'));
  btn.classList.add('on');
  document.getElementById('pf-sub-'+id).classList.add('on');
}

/* ── Auto-calc GW from TW + Qty on PTT ── */
function pfUpdateGross(){
  const tw = parseFloat((document.getElementById('pf-ptt-tw')?.textContent||'').replace(/,/g,''))||0;
  const qtyRaw = (document.getElementById('pf-ptt-qty')?.textContent||'').replace(/,/g,'').trim();
  const qtyTon = parseFloat(qtyRaw)||0;
  const gw = tw + qtyTon * 1000;
  const el = document.getElementById('pf-ptt-gw-display');
  if(el) el.textContent = gw>0 ? Math.round(gw).toLocaleString('en-US') : '';
}
function pfUpdateRmooc(){
  const rm = (document.getElementById('pf-dn-rmooc')?.textContent||'').trim();
  const rmLine = document.getElementById('pf-dn-rmooc-line');
  if(rmLine) rmLine.style.display = rm ? '' : 'none';
}
document.addEventListener('input', e=>{
  const f = e.target.dataset?.pf;
  if(f==='ptt-tw'||f==='ptt-qty') pfUpdateGross();
  if(f==='dn-rmooc') pfUpdateRmooc();
});

/* ── Number to Vietnamese words ── */
function numToWordsVI(n){
  if(!n || n===0) return 'Không';
  const units=['','một','hai','ba','bốn','năm','sáu','bảy','tám','chín'];
  const teens=['mười','mười một','mười hai','mười ba','mười bốn','mười lăm','mười sáu','mười bảy','mười tám','mười chín'];
  function twoDigit(n){if(n<10)return units[n];if(n<20)return teens[n-10];const t=Math.floor(n/10),u=n%10;return units[t]+' mươi'+(u?(' '+(u===1?'mốt':u===5?'lăm':units[u])):'');}
  function threeDigit(n){const h=Math.floor(n/100),r=n%100;if(h&&r)return units[h]+' trăm '+(r<10?'lẻ '+units[r]:twoDigit(r));if(h)return units[h]+' trăm';return r<10?units[r]:twoDigit(r);}
  var raw;
  if(n<1000) raw=threeDigit(n).trim();
  else if(n<1000000){const t=Math.floor(n/1000),r=n%1000;let s=threeDigit(t).trim()+' nghìn';if(r>0&&r<100)s+=' không trăm '+(r<10?'lẻ '+units[r]:twoDigit(r));else if(r>=100)s+=' '+threeDigit(r).trim();raw=s;}
  else raw=String(n);
  return raw.split(' ').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
}
/* ── Number to English words ── */
function numToWordsEN(n){
  if(!n) return 'Zero';
  const ones=['','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
  const tens=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
  function twoD(n){return n<20?ones[n]:tens[Math.floor(n/10)]+(n%10?' '+ones[n%10]:'');}
  function threeD(n){return n>=100?(ones[Math.floor(n/100)]+' hundred'+(n%100?' '+twoD(n%100):'')):twoD(n);}
  var raw;
  if(n<1000)raw=threeD(n);else if(n<1000000){const t=Math.floor(n/1000),r=n%1000;raw=threeD(t)+' thousand'+(r?' '+threeD(r):'');}else raw=String(n);
  return raw.replace(/\b[a-z]/g,c=>c.toUpperCase());
}

/* ── Product type derivation (from V406) ── */
function _pfDeriveType(type){
  const t=(type||'').toLowerCase();if(!t)return '';
  if(/pure.*c4|thuần.*c4|thuan.*c4|\bc4\b.*pure/i.test(type))return 'LPG (Pure Butane)';
  if(/pure.*c3|thuần.*c3|thuan.*c3|\bc3\b.*pure/i.test(type))return 'LPG (Pure Propane)';
  if(/pure|thuần|thuan/i.test(type))return 'LPG (Pure Propane)';
  var rm=t.match(/c3[^0-9]*(\d{1,2})[^0-9]*c4[^0-9]*(\d{1,2})/);
  if(!rm)rm=t.match(/(\d{1,2})\s*[:/]\s*(\d{1,2})/);
  if(rm){var a=parseInt(rm[1]),b=parseInt(rm[2]);if(a+b===100||a+b===10)return 'LPG (C3:'+a+'/C4:'+b+')';}
  /* v4.5x — Sale plan didn't specify a product ratio: default to 50:50
     (treated identically to an explicit "50:50" contract). Trade-only
     keywords (domestic/export/…) carry no ratio, so they default too. */
  return 'LPG (C3:50/C4:50)';
}

/* ── Helper: format kg ── */
function _pfFmt(n){ return (n!=null && !isNaN(n)) ? Math.round(n).toLocaleString('en-US') : ''; }

/* ── Seal display for the DN — every seal is an LPG seal, so prefix the raw
   seal value (e.g. "EIC", "12345") with "LPG " unless it already carries it. ── */
function _pfSealLPG(s){
  s = String(s==null ? '' : s).trim();
  if(!s) return '';
  return /^lpg\b/i.test(s) ? s : 'LPG ' + s;
}

/* ── Lot / Tank stacked display: a lotFull value is "<lot>/<tank>". The PTT
   prints it on two lines — line 1 = tank, line 2 = lot. Returns a string with
   a newline (cell uses white-space:pre-line). ── */
function _pfLotStack(lotFull){
  const s = String(lotFull==null ? '' : lotFull).trim();
  if(!s) return '';
  const i = s.lastIndexOf('/');
  if(i < 0) return s;
  const lot  = s.slice(0, i).trim();
  const tank = s.slice(i + 1).trim();
  return tank + '\n' + lot;
}

/* ── Helper: collapse a doubled "LPG-YYYY-LPG-YYYY-N" prefix to a single one.
   Root cause was fixed in tkGetActive (v4.22.6) but legacy station.batch values
   already written to Firebase may still carry the duplication. Apply this on
   any lot string before it reaches PTT/DN/print code paths. ── */
function _sanitizeLotPrefix(s){
  if(!s) return s;
  return String(s).replace(/^(?:LPG-\d{4}-)+/, m => {
    const all = m.match(/LPG-\d{4}-/g);
    return all ? all[all.length-1] : m;
  });
}

/* ── Fill DN from a TL Data row (adapted for V4: TL.ROWS) ── */
function pfFillDNFromTL(r){
  const pf=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v||'';};
  const yr=String(new Date().getFullYear());
  pf('pf-dn-do', r.doNo||'');
  /* Customer lookup via CT module — v4.22.6 prints VN full name on DN */
  const custName = (typeof CT!=='undefined' && CT.vnName) ? CT.vnName(r.cust||'') : (r.cust||'');
  pf('pf-dn-customer', custName);
  pf('pf-dn-truck', r.truck||'');
  pf('pf-dn-rmooc', r.rmooc||'');
  pf('pf-dn-scale', (r.scaleNo||'')+'-'+(r.turn||''));
  pf('pf-dn-tw', _pfFmt(r.truckWt));
  pf('pf-dn-time1', r.timeIn||'');
  pf('pf-dn-gw', _pfFmt(r.grossWt));
  pf('pf-dn-time2', r.timeOut||'');
  pf('pf-dn-seal', _pfSealLPG(r.seal));
  /* "Người lập phiếu" = nhân viên CHECK BOOTH (luu o r.weigher khi can),
     KHONG phai engineer (r.eng). Fallback ve eng neu thieu de khong de trong. */
  pf('pf-dn-sign1', r.weigher||r.eng||'');
  pf('pf-dn-sign2', r.driver||'');
  pf('pf-dn-sign3', r.driver||'');
  pf('pf-dn-addr', 'Lô 01CN - 08CN, KCN Cái Mép, P. Tân Phước, Tp. Hồ Chí Minh');
  pf('pf-dn-commodity', _pfDeriveType(r.type||'')||'LPG');
  pf('pf-dn-lot', (r.lot&&r.ltank)?('LPG-'+yr+'-'+r.lot+'/'+r.ltank):(r.ltank||''));
  const netWt = r.lpgQty ? parseFloat(r.lpgQty) : (r.grossWt&&r.truckWt ? parseFloat(r.grossWt)-parseFloat(r.truckWt) : null);
  pf('pf-dn-net', _pfFmt(netWt));
  if(netWt && !isNaN(netWt)){
    const netKg=Math.round(netWt);
    pf('pf-dn-words-vi', numToWordsVI(netKg)+' KG');
    pf('pf-dn-words-en', numToWordsEN(netKg)+' KG');
  } else { pf('pf-dn-words-vi',''); pf('pf-dn-words-en',''); }
  const parts=(r.date||'').split('/');
  if(parts.length>=2){pf('pf-dn-day',parts[0]);pf('pf-dn-month',parts[1]);pf('pf-dn-year',parts[2]||yr);}
  else{const now=new Date();pf('pf-dn-day',now.getDate());pf('pf-dn-month',now.getMonth()+1);pf('pf-dn-year',now.getFullYear());}
  pfUpdateRmooc();
}

/* ── Fill PTT/DN from station data object (adapted for V4) ── */
function pfFillFromStation(d){
  const pf=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=(v!=null?String(v):'');};
  const dt=new Date(), day=String(dt.getDate()), month=String(dt.getMonth()+1), year=String(dt.getFullYear());
  const custName = (typeof CT!=='undefined' && CT.vnName) ? CT.vnName(d.cust||'') : (d.cust||'');
  pf('pf-ptt-customer', custName);
  pf('pf-ptt-truck', d.plate||'');
  pf('pf-ptt-rmooc', d.rmooc||'');
  pf('pf-ptt-prodtype', _pfDeriveType(d.type||''));
  pf('pf-ptt-qty', d.qty ? String(d.qty) : '');
  pf('pf-ptt-maxqty', d.maxTol ? String(d.maxTol) : '');
  pf('pf-ptt-tw', d.truckWt ? _pfFmt(d.truckWt) : '');
  pf('pf-ptt-maxload', d.safeFillKg ? d.safeFillKg.toLocaleString('en-US') : '');
  pf('pf-ptt-lot', _pfLotStack(d.lotFull||''));
  pf('pf-ptt-do', d.doNo||'');
  pf('pf-ptt-doqty', d.doQty||'');
  pf('pf-ptt-bay', d.bay||'');
  pf('pf-ptt-day', day); pf('pf-ptt-month', month); pf('pf-ptt-year', year);
  pf('pf-ptt-salenote', d.saleNote||'');
  pf('pf-ptt-boothnote', d.checkNote||'');
  pf('pf-ptt-engnote', d.engNote||'');
  /* Signatures from Scale module inputs */
  const eng = document.getElementById('scEngineer')?.value||'';
  const chk = document.getElementById('scCheckBooth')?.value||'';
  pf('pf-ptt-sign1', chk);
  pf('pf-ptt-sign2', eng);
  pf('pf-ptt-sign3', d.driver||'');
  pfUpdateGross();
  /* DN side */
  pf('pf-dn-do', d.doNo||'');
  pf('pf-dn-lot', d.lotFull||'');
  pf('pf-dn-customer', custName);
  pf('pf-dn-commodity', _pfDeriveType(d.type||'')||'LPG');
  pf('pf-dn-truck', d.plate||'');
  pf('pf-dn-rmooc', d.rmooc||'');
  pf('pf-dn-scale', d.bay||'');
  pf('pf-dn-tw', _pfFmt(d.truckWt));
  pf('pf-dn-gw', _pfFmt(d.grossWt));
  pf('pf-dn-net', _pfFmt(d.netWt));
  pf('pf-dn-time1', d.timeIn||'');
  pf('pf-dn-time2', d.timeOut||'');
  pf('pf-dn-seal', _pfSealLPG(d.seal));
  pf('pf-dn-day', day); pf('pf-dn-month', month); pf('pf-dn-year', year);
  if(d.netWt){const nk=Math.round(d.netWt);pf('pf-dn-words-vi',numToWordsVI(nk)+' KG');pf('pf-dn-words-en',numToWordsEN(nk)+' KG');}
  pf('pf-dn-addr', 'Lô 01CN - 08CN, KCN Cái Mép, P. Tân Phước, Tp. Hồ Chí Minh');
  const weigher = document.getElementById('scCheckBooth')?.value||'';
  pf('pf-dn-sign1', weigher);
  pf('pf-dn-sign2', d.driver||'');
  pf('pf-dn-sign3', d.driver||'');
  pfUpdateRmooc();
}

/* ══════════════════════════════════════════════════════════
   pfPrint — Core print function (in-page hidden iframe, no new tab)
   CRITICAL: DO NOT MODIFY the PRINT_CSS values (pt/mm)
   ══════════════════════════════════════════════════════════ */
/* ── Hidden iframe used for in-page printing of PTT/DN/3DN ── */
function _pfGetPrintFrame(){
  let f = document.getElementById('_pfPrintFrame');
  if(!f){
    f = document.createElement('iframe');
    f.id = '_pfPrintFrame';
    f.setAttribute('aria-hidden','true');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(f);
  }
  return f;
}
function _pfPrintViaIframe(htmlDoc, delay){
  const f = _pfGetPrintFrame();
  const d = f.contentDocument || f.contentWindow.document;
  d.open(); d.write(htmlDoc); d.close();
  setTimeout(()=>{
    try{ f.contentWindow.focus(); f.contentWindow.print(); }
    catch(e){ console.warn('[pfPrint] iframe print failed', e); }
  }, delay||700);
}
/* Override pfPrint to use the hidden iframe — keeps the existing CSS / paper sourcing
   but prints in the SAME page instead of opening a new tab. */
function pfPrint(form, orientation){
  const paperId = form==='ptt' ? 'pf-ptt-paper' : 'pf-dn-paper';
  const paper = document.getElementById(paperId);
  if(!paper){toast('Paper element not found','er');return;}
  const PRINT_CSS = form==='ptt' ? `
    @page{size:A5 portrait;margin:3mm;}*{margin:0;padding:0;box-sizing:border-box;}html,body{margin:0;padding:0;background:#fff;}
    .pf-ptt-paper{width:100%;box-shadow:none;background:#fff;color:#000;font-family:'Barlow',sans-serif;font-size:9pt;}
    .pf-ptt{padding:2mm;}.pf-ptt-hdr{display:flex;align-items:flex-start;justify-content:space-between;padding-bottom:4pt;border-bottom:2pt solid #000;}
    .pf-ptt-titl{font-size:13pt;font-weight:900;text-align:right;line-height:1.1;}
    .pf-ig{border:1.2pt solid #555;margin-top:5pt;display:grid;grid-template-columns:16mm 1fr 16mm 1fr;}
    .pf-il{background:#e8e8e8;padding:2pt 4pt;font-size:8pt;font-weight:500;border-right:0.5pt solid #888;border-bottom:0.5pt solid #888;display:flex;align-items:center;line-height:1.2;color:#000;}
    .pf-iv{padding:2pt 5pt;font-weight:700;font-size:9pt;display:flex;align-items:center;border-right:0.5pt solid #888;border-bottom:0.5pt solid #888;}
    .pf-iv.norb{border-right:none;}.pf-iv.nobb{border-bottom:none;}.pf-il.nobb{border-bottom:none;}
    .pf-il-qty{background:#e8e8e8;padding:2pt 4pt;font-size:8pt;font-weight:700;border-right:0.5pt solid #888;border-bottom:2pt solid #333;display:flex;align-items:center;color:#000;}
    .pf-iv-qty{padding:3pt 5pt;border-right:none;border-bottom:2pt solid #333;display:flex;align-items:center;grid-column:span 3;}
    .pf-iv-wt{padding:2pt 5pt;font-weight:900;font-size:11pt;font-family:'Courier New',Courier,monospace;display:flex;align-items:center;border-right:0.5pt solid #888;border-bottom:0.5pt solid #888;}
    .pf-iv-wt.nobb{border-bottom:none;}
    .pf-wt{width:100%;border-collapse:collapse;border:1.2pt solid #555;border-top:none;}
    .pf-wt th{background:#d8d8d8;padding:2pt 3pt;font-size:8pt;font-weight:700;border:0.5pt solid #888;text-align:center;white-space:nowrap;}
    .pf-wt td{border:0.5pt solid #aaa;}
    .pw-lbl{background:#ebebeb;font-size:8.5pt;color:#000;width:16mm;padding:2pt 4pt;vertical-align:middle;white-space:nowrap;font-weight:600;}
    .pw-wr{vertical-align:bottom;padding:0 3pt 2pt;font-size:8pt;color:#999;height:11mm;text-align:right;padding-right:3pt;}
    .pw-wr.pw-sm{height:10mm;padding:0 3pt 1pt;font-size:7.5pt;}
    .pf-note{border:0.5pt solid #aaa;border-top:none;padding:2pt 5pt;font-size:9pt;min-height:5mm;display:flex;align-items:flex-start;gap:3pt;}
    .pf-nlbl{font-weight:800;color:#000;white-space:nowrap;font-size:9pt;}
    .pf-nval{color:#000;font-weight:600;flex:1;font-size:9pt;}.pf-nval[data-pf="ptt-boothnote"]{color:#c00;font-weight:700;}
    .pf-date{text-align:right;font-size:9pt;padding:3pt 0 1pt;color:#000;font-weight:700;}
    .pf-sigs{display:grid;grid-template-columns:1fr 1fr 1fr;border:0.5pt solid #aaa;border-bottom:none;margin-top:2pt;}
    .pf-sc{text-align:center;border-right:0.5pt solid #aaa;padding:2pt 6pt 1pt;}.pf-sc:last-child{border-right:none;}
    .pf-sttl{font-size:8pt;color:#333;line-height:1.3;}.pf-ssp{height:16mm;}
    .pf-snm{font-size:9pt;font-weight:600;border-top:0.5pt solid #aaa;border-bottom:0.5pt solid #aaa;padding:1pt 0;}
    .pf-sfoot{border:0.5pt solid #aaa;border-top:none;height:2mm;}
    [contenteditable]{background:none!important;border-bottom:none!important;}
  ` : `
    @page{size:A5 landscape;margin:5mm;}*{margin:0;padding:0;box-sizing:border-box;}html,body{margin:0;padding:0;background:#fff;}
    .pf-dn-paper{width:100%;box-shadow:none;background:#fff;color:#000;font-family:'Barlow',sans-serif;}
    .pf-dn-hdr{display:flex;align-items:center;gap:8pt;padding-bottom:5pt;border-bottom:2pt solid #000;margin-bottom:5pt;}
    .pf-dn-logo{height:10mm;object-fit:contain;flex-shrink:0;}.pf-dn-co{font-size:7.5pt;line-height:1.4;flex:1;}.pf-dn-co .nm{font-weight:800;font-size:8.5pt;}
    .pf-dn-titl{text-align:right;flex-shrink:0;}.pf-dn-tv{font-size:9.5pt;font-weight:900;letter-spacing:.01em;}.pf-dn-te{font-size:8pt;font-weight:700;color:#444;}
    .pf-dt{width:100%;border-collapse:collapse;border:1pt solid #555;margin-top:0;}
    .pf-dt td{padding:4pt 5pt;font-size:10pt;vertical-align:middle;border:0.5pt solid #aaa;}
    .pf-dt .dl{background:#e8e8e8;font-size:9.5pt;font-weight:500;white-space:nowrap;color:#000;}
    .pf-dt .dc{width:4mm;text-align:center;background:#e8e8e8;border-left:none;border-right:none;padding:4pt 0;font-size:10pt;color:#333;}
    .pf-dt .dv{font-weight:700;font-size:11pt;}.pf-dt .dv.mono{font-family:'Courier New',Courier,monospace;}
    .dn-truck-line,.dn-rmooc-line{display:block;line-height:1.35;}
    .pf-dt .dl-full{background:#e8e8e8;font-size:9.5pt;font-weight:500;color:#000;white-space:nowrap;}
    .pf-dt .dv-cust{font-size:12pt;font-weight:900;}
    .pf-dt .net-lbl{background:#d0d0d0;font-weight:700;font-size:10pt;border-top:1.5pt solid #333;border-bottom:1.5pt solid #333;}
    .pf-dt .net-dc{background:#d0d0d0;border-left:none;border-right:none;border-top:1.5pt solid #333;border-bottom:1.5pt solid #333;width:4mm;text-align:center;padding:4pt 0;font-size:10pt;}
    .pf-dt .net-val{font-size:17pt;font-weight:900;font-family:'Courier New',Courier,monospace;border-top:1.5pt solid #333;border-bottom:1.5pt solid #333;}
    .pf-dt .words-lbl{background:#e8e8e8;font-size:9pt;font-weight:600;text-align:center;line-height:1.3;}
    .pf-dt .words-dc{background:#e8e8e8;border-left:none;border-right:none;width:4mm;text-align:center;padding:4pt 0;font-size:10pt;}
    .pf-dt .words-body{padding:4pt 5pt;}.words-vi{font-size:10.5pt;font-style:italic;font-weight:600;border-bottom:0.5pt dashed #ccc;padding-bottom:2pt;margin-bottom:2pt;}
    .words-en{font-size:10.5pt;font-style:italic;font-weight:700;color:#333;}
    .pf-dn-sigs{display:grid;grid-template-columns:1fr 1fr 1fr;margin-top:5pt;border:1pt solid #555;}
    .pf-dn-sc{border-right:0.5pt solid #aaa;padding:5pt 6pt 4pt;text-align:center;}.pf-dn-sc:last-child{border-right:none;}
    .pf-dn-sttl{font-size:9.5pt;color:#000;font-weight:600;border-bottom:0.5pt solid #ddd;padding-bottom:2pt;margin-bottom:2pt;}
    .pf-dn-ssp{height:13.5mm;}.pf-dn-snm{font-size:11pt;font-weight:700;border-top:0.5pt solid #aaa;padding-top:3pt;}
    [contenteditable]{background:none!important;border-bottom:none!important;}
  `;
  const doc = '<!DOCTYPE html><html><head><meta charset="UTF-8"><link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Barlow:wght@300;400;500;600;700;800;900&family=Barlow+Condensed:wght@600;700;800&display=swap" rel="stylesheet"><style>'+PRINT_CSS+'</style></head><body>'+paper.outerHTML+'</body></html>';
  _pfPrintViaIframe(doc, 700);
}

/* ── Print 3 copies DN ── */
function pfPrint3DN(){
  const doEl = document.getElementById('pf-dn-do');
  if(!doEl || !doEl.textContent.trim()){
    /* Try filling from TL Data first */
    toast('⚠ No data on DN — fill from TL Data or enter manually','er'); return;
  }
  _doPrint3DN();
}
function _doPrint3DN(){
  const paper = document.getElementById('pf-dn-paper');
  if(!paper){toast('DN paper not found','er');return;}
  const PRINT_CSS = `
    @page{size:A5 landscape;margin:4mm;}*{margin:0;padding:0;box-sizing:border-box;}html,body{margin:0;padding:0;background:#fff;}
    .dn-copy-label{text-align:center;font-size:8pt;font-weight:700;color:#666;padding:2pt 0;border-bottom:0.5pt dashed #ccc;margin-bottom:3pt;font-family:sans-serif;}
    .pf-dn-paper{width:100%;box-shadow:none;background:#fff;color:#000;font-family:'Barlow',sans-serif;font-size:9pt;page-break-after:always;}
    .pf-dn-paper:last-child{page-break-after:auto;}
    .pf-dn{padding:5pt 8pt 4pt;font-size:9pt;}
    .pf-dn-hdr{display:flex;align-items:center;gap:8pt;padding-bottom:5pt;border-bottom:2pt solid #000;margin-bottom:5pt;}
    .pf-dn-logo{height:10mm;object-fit:contain;flex-shrink:0;}.pf-dn-co{font-size:7.5pt;line-height:1.4;flex:1;}.pf-dn-co .nm{font-weight:800;font-size:8.5pt;}
    .pf-dn-titl{text-align:right;flex-shrink:0;}.pf-dn-tv{font-size:9.5pt;font-weight:900;letter-spacing:.01em;}.pf-dn-te{font-size:8pt;font-weight:700;color:#444;}
    .pf-dt{width:100%;border-collapse:collapse;border:1pt solid #555;margin-top:0;}
    .pf-dt td{padding:4pt 5pt;font-size:10pt;vertical-align:middle;border:0.5pt solid #aaa;}
    .pf-dt .dl{background:#e8e8e8;font-size:9.5pt;font-weight:500;white-space:nowrap;color:#000;}
    .pf-dt .dc{width:4mm;text-align:center;background:#e8e8e8;border-left:none;border-right:none;padding:4pt 0;font-size:10pt;color:#333;}
    .pf-dt .dv{font-weight:700;font-size:11pt;}.pf-dt .dv.mono{font-family:'Courier New',Courier,monospace;}
    .dn-truck-line,.dn-rmooc-line{display:block;line-height:1.35;}
    .pf-dt .dl-full{background:#e8e8e8;font-size:9.5pt;font-weight:500;color:#000;white-space:nowrap;}
    .pf-dt .dv-cust{font-size:12pt;font-weight:900;}
    .pf-dt .net-lbl{background:#d0d0d0;font-weight:700;font-size:10pt;border-top:1.5pt solid #333;border-bottom:1.5pt solid #333;}
    .pf-dt .net-dc{background:#d0d0d0;border-left:none;border-right:none;border-top:1.5pt solid #333;border-bottom:1.5pt solid #333;width:4mm;text-align:center;padding:4pt 0;font-size:10pt;}
    .pf-dt .net-val{font-size:17pt;font-weight:900;font-family:'Courier New',Courier,monospace;border-top:1.5pt solid #333;border-bottom:1.5pt solid #333;}
    .pf-dt .words-lbl{background:#e8e8e8;font-size:9pt;font-weight:600;text-align:center;line-height:1.3;}
    .pf-dt .words-dc{background:#e8e8e8;border-left:none;border-right:none;width:4mm;text-align:center;padding:4pt 0;font-size:10pt;}
    .pf-dt .words-body{padding:4pt 5pt;}.words-vi{font-size:10.5pt;font-style:italic;font-weight:600;border-bottom:0.5pt dashed #ccc;padding-bottom:2pt;margin-bottom:2pt;}
    .words-en{font-size:10.5pt;font-style:italic;font-weight:700;color:#333;}
    .pf-dn-sigs{display:grid;grid-template-columns:1fr 1fr 1fr;margin-top:5pt;border:1pt solid #555;}
    .pf-dn-sc{border-right:0.5pt solid #aaa;padding:5pt 6pt 4pt;text-align:center;}.pf-dn-sc:last-child{border-right:none;}
    .pf-dn-sttl{font-size:9.5pt;color:#000;font-weight:600;border-bottom:0.5pt solid #ddd;padding-bottom:2pt;margin-bottom:2pt;}
    .pf-dn-ssp{height:13.5mm;}.pf-dn-snm{font-size:11pt;font-weight:700;border-top:0.5pt solid #aaa;padding-top:3pt;}
    [contenteditable]{background:none!important;border-bottom:none!important;}
  `;
  const paperHTML = paper.outerHTML;
  const pagesHTML = paperHTML + paperHTML + paperHTML;
  const doc = '<!DOCTYPE html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Barlow:wght@300;400;500;600;700;800;900&family=Barlow+Condensed:wght@600;700;800&display=swap" rel="stylesheet"><style>'+PRINT_CSS+'</style></head><body>'+pagesHTML+'</body></html>';
  _pfPrintViaIframe(doc, 800);
  toast('🖨 Printing 3 weighing slip copies','ok');
}

/* ══════════════════════════════════════════════════════════
   KTPTVC MODULE — LPG Vehicle Inspection Slip (port from V406 ktPrint)
   - Reads RAM only: TL.ROWS for vehicle list, DATA.tanklorry/rmooc for cap.
   - Prints inline via _pfPrintViaIframe (no new tab).
   - Form body stays Vietnamese: it is the LPGT-PD-002 ISO document.
   - Sort by Engineer toggle: timeIn (default) -> asc -> desc -> timeIn.
   - Tables (.kt-t) use table-layout:auto so content drives column width;
     labels keep nowrap+min-width for the V406 structural rhythm.
   ══════════════════════════════════════════════════════════ */
var KT_LIST = [];
var KT_SORT = 'time'; /* 'time' | 'asc' | 'desc' */
var KT_DATE_OBJ = null;

/* Plate normalizer (local — TL/FLEET have their own inside IIFEs). */
function _ktNormPlate(v){ return String(v||'').replace(/[-.\s]/g,'').toUpperCase(); }

/* Capacity lookup: try rmooc plate first (it's the actual tank), fall back to truck plate. */
function _ktLookupCap(truckPlate, rmoocPlate){
  if(typeof DATA === 'undefined') return '';
  const tk = _ktNormPlate(truckPlate);
  const rm = _ktNormPlate(rmoocPlate);
  if(rm && DATA.rmooc){
    for(const rid in DATA.rmooc){
      const row = DATA.rmooc[rid];
      if(_ktNormPlate(row.plate) === rm && row.cap) return row.cap;
    }
  }
  if(tk && DATA.tanklorry){
    for(const rid in DATA.tanklorry){
      const row = DATA.tanklorry[rid];
      if(_ktNormPlate(row.plate) === tk && row.cap) return row.cap;
    }
  }
  return '';
}

/* Apply current sort to KT_LIST in place. */
function _ktApplySort(){
  if(KT_SORT === 'time'){
    KT_LIST.sort((a,b)=>String(a._timeIn||'').localeCompare(String(b._timeIn||'')));
  } else {
    const dir = KT_SORT === 'asc' ? 1 : -1;
    KT_LIST.sort((a,b)=>{
      const ae = String(a.eng||'').toLowerCase();
      const be = String(b.eng||'').toLowerCase();
      if(ae === be) return String(a._timeIn||'').localeCompare(String(b._timeIn||''));
      return ae < be ? -dir : dir;
    });
  }
  const th = document.getElementById('kt-th-eng');
  const ind = document.getElementById('kt-sort-ind');
  if(th){
    th.classList.remove('sort-asc','sort-desc');
    if(KT_SORT === 'asc'){ th.classList.add('sort-asc'); if(ind) ind.textContent = '↑'; }
    else if(KT_SORT === 'desc'){ th.classList.add('sort-desc'); if(ind) ind.textContent = '↓'; }
    else if(ind){ ind.textContent = '↕'; }
  }
}

function ktSortByEng(){
  if(!KT_LIST.length) return;
  KT_SORT = KT_SORT === 'time' ? 'asc' : (KT_SORT === 'asc' ? 'desc' : 'time');
  _ktApplySort();
  _ktRenderTable();
}

function _ktRenderTable(){
  const tbody = document.getElementById('kt-tbody');
  if(!tbody) return;
  if(!KT_LIST.length){
    tbody.innerHTML = '<tr><td colspan="6" style="padding:30px;text-align:center;color:var(--muted);font-size:12px">Select a date and press 🔄 LOAD to list vehicles from TL Data.</td></tr>';
    const stats = document.getElementById('kt-stats');
    if(stats) stats.textContent = '';
    return;
  }
  tbody.innerHTML = KT_LIST.map((v,i)=>`<tr>
    <td style="text-align:center"><input type="checkbox" class="kt-cb" data-idx="${i}" ${v.checked?'checked':''} onchange="KT_LIST[${i}].checked=this.checked;_ktUpdateStats()"></td>
    <td style="font-weight:700;font-family:'Courier New',monospace">${escapeHtml(v.truck)}</td>
    <td style="font-family:'Courier New',monospace;color:var(--muted)">${escapeHtml(v.rmooc||'—')}</td>
    <td>${escapeHtml(v.driver)}</td>
    <td style="color:var(--pri);font-weight:600">${escapeHtml(v.eng)}</td>
    <td style="text-align:right;font-weight:700">${escapeHtml(v.cap||'—')}</td>
  </tr>`).join('');
  _ktUpdateStats();
}

function _ktUpdateStats(){
  const n = KT_LIST.filter(v=>v.checked).length;
  const stats = document.getElementById('kt-stats');
  if(stats) stats.textContent = n + ' / ' + KT_LIST.length + ' vehicles · ' + Math.ceil(n/2) + ' A4 page(s)';
}

function ktLoad(){
  const dateEl = document.getElementById('kt-date');
  if(!dateEl || !dateEl.value){ toast('⚠ Select date first','er'); return; }
  if(typeof TL === 'undefined' || !TL.ROWS){ toast('⚠ TL Data not loaded','er'); return; }

  const sel = dateEl.value; /* YYYY-MM-DD */
  const parts = sel.split('-');
  KT_DATE_OBJ = new Date(+parts[0], +parts[1]-1, +parts[2]);

  /* Filter TL rows for the selected loading date (parseDate normalizes DD/MM/YY etc) */
  const rows = Object.values(TL.ROWS).filter(r=>{
    if(!r || !r.truck || r.disabled) return false;
    const rd = parseDate(r.date);
    if(!rd) return false;
    const y = rd.getFullYear();
    const m = String(rd.getMonth()+1).padStart(2,'0');
    const d = String(rd.getDate()).padStart(2,'0');
    return sel === (y+'-'+m+'-'+d);
  });

  /* Pre-sort by timeIn so the first-trip engineer wins on dedup */
  rows.sort((a,b)=>String(a.timeIn||'').localeCompare(String(b.timeIn||'')));

  const seen = {};
  const list = [];
  rows.forEach(r=>{
    const pl = String(r.truck||'').trim().toUpperCase();
    if(!pl || seen[pl]) return;
    seen[pl] = true;
    const rm = String(r.rmooc||'').trim();
    list.push({
      truck: pl,
      rmooc: rm,
      driver: r.driver||'',
      eng: r.eng||'',
      cap: _ktLookupCap(pl, rm),
      checked: true,
      _timeIn: r.timeIn||''
    });
  });

  KT_LIST = list;
  KT_SORT = 'time'; /* reset to default on every load */
  _ktApplySort();
  _ktRenderTable();
  toast('✅ Loaded '+list.length+' vehicles for KTPTVC','ok');
}

function ktSelectAll(checked){
  KT_LIST.forEach(v=>{ v.checked = checked; });
  _ktRenderTable();
}

/* Build one V406-equivalent KTPTVC form block (Vietnamese — ISO doc LPGT-PD-002).
   No inline width:X% — tables auto-fit; CSS gives labels min-width + nowrap. */
function _ktBuildOneForm(v, pageNum){
  const d = KT_DATE_OBJ || new Date();
  const dateStr = String(d.getDate()).padStart(2,'0')+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getFullYear()).slice(-2);
  let plateStr = escapeHtml(v.truck);
  if(v.rmooc) plateStr += ' &nbsp;&nbsp; ' + escapeHtml(v.rmooc);
  const capStr = v.cap ? parseFloat(v.cap).toFixed(2) : '';
  return '<div class="kt-form">'
    +'<table class="kt-t"><tr>'
      +'<td rowspan="2" class="kt-logo-cell"><div class="kt-logo-txt"><span class="kt-logo-hy">HYOSUNG</span><br><span class="kt-logo-vc">VINA CHEMICALS</span></div></td>'
      +'<td class="kt-h-lbl">Tên quy trình<br><span class="kt-h-s">(Procedure name)</span></td>'
      +'<td class="kt-h-lbl">Số quy trình<br><span class="kt-h-s">(Procedure number)</span></td>'
      +'<td class="kt-h-lbl">Ngày ban hành<br><span class="kt-h-s">(Created date)</span></td>'
      +'<td class="kt-h-lbl">Ngày chỉnh sửa<br><span class="kt-h-s">(Revised date)</span></td>'
      +'<td class="kt-h-lbl">Lần chỉnh sửa<br><span class="kt-h-s">(Revision No.)</span></td>'
      +'<td class="kt-h-lbl">Page</td>'
    +'</tr><tr>'
      +'<td class="kt-h-val">QUY TRÌNH AN TOÀN NẠP LPG</td>'
      +'<td class="kt-h-val">LPGT-PD-002</td>'
      +'<td class="kt-h-val">01.02.2022</td>'
      +'<td class="kt-h-val">23.01.2026</td>'
      +'<td class="kt-h-val">1</td>'
      +'<td class="kt-h-val">'+(pageNum||'')+'</td>'
    +'</tr></table>'
    +'<div class="kt-title">PHIẾU KIỂM TRA PHƯƠNG TIỆN VẬN CHUYỂN LPG</div>'
    +'<table class="kt-t"><tr>'
      +'<td class="kt-lbl">Ngày</td>'
      +'<td class="kt-lbl">Nơi làm việc:</td>'
      +'<td class="kt-lbl">Tên thiết bị (máy móc):</td>'
      +'<td class="kt-lbl">Số xe (biển số)</td>'
      +'<td class="kt-lbl" colspan="2">Dung tích bồn: (m³)</td>'
    +'</tr><tr>'
      +'<td class="kt-val" rowspan="3" style="vertical-align:middle">'+dateStr+'</td>'
      +'<td class="kt-val" rowspan="3" style="vertical-align:middle">Tank Lorry Bay</td>'
      +'<td class="kt-val" rowspan="3" style="vertical-align:middle">Xe bồn LPG</td>'
      +'<td class="kt-val kt-plate" rowspan="3" style="vertical-align:middle">'+plateStr+'</td>'
      +'<td class="kt-val" colspan="2" rowspan="3" style="text-align:center;font-weight:800;vertical-align:middle;font-size:12pt">'+escapeHtml(capStr)+'</td>'
    +'</tr><tr></tr><tr></tr><tr>'
      +'<td class="kt-lbl" rowspan="2" style="vertical-align:middle">Tên tài xế:</td>'
      +'<td class="kt-val" rowspan="2" style="font-weight:700;vertical-align:middle">'+escapeHtml(v.driver)+'</td>'
      +'<td class="kt-lbl" rowspan="2" style="vertical-align:middle">Tài liệu kiểm tra<br>trước khi vào trạm</td>'
      +'<td class="kt-doc">✓ &nbsp;Bằng lái xe</td>'
      +'<td class="kt-doc">✓ &nbsp;Giấy chứng nhận bảo hiểm bắt buộc</td>'
      +'<td class="kt-doc" rowspan="2" style="vertical-align:middle">✓ &nbsp;Giấy PCCC<br>&nbsp;&nbsp;&nbsp;&nbsp;&amp; CNCH</td>'
    +'</tr><tr>'
      +'<td class="kt-doc">✓ &nbsp;Kiểm định phương tiện</td>'
      +'<td class="kt-doc">✓ &nbsp;Giấy phép vận chuyển hóa chất</td>'
    +'</tr></table>'
    +'<div class="kt-sec">KIỂM TRA CÁC BIỆN PHÁP AN TOÀN TRƯỚC KHI VÀO TRẠM</div>'
    +'<table class="kt-t kt-ck">'
      +'<tr><td class="kt-ck-hdr">KIỂM TRA CHUNG</td><td class="kt-ck-yn-hdr">Có</td><td class="kt-ck-yn-hdr">Không</td></tr>'
      +'<tr><td class="kt-ck-txt">Biểu trưng nguy hiểm và cảnh báo dán trên xe, bồn<br>Số điện thoại và số liên hệ khẩn cấp dán trên cabin và thành bồn</td><td class="kt-ck-yn">✓</td><td class="kt-ck-yn"></td></tr>'
      +'<tr><td class="kt-ck-txt">Thiết bị đo, thiết bị an toàn đầy đủ<br>Bồn có tem kiểm định</td><td class="kt-ck-yn">✓</td><td class="kt-ck-yn"></td></tr>'
      +'<tr><td class="kt-ck-txt">Xe không có dấu hiệu bị va chạm, hư hỏng<br>Bồn không có dấu hiệu bị ăn mòn, móp méo, hư hỏng, cháy hoặc vệt hồ quang</td><td class="kt-ck-yn"></td><td class="kt-ck-yn">✓</td></tr>'
      +'<tr><td class="kt-ck-txt">Các thiết bị, phụ kiện gắn trên bồn hoạt động tốt, không có dấu hiệu hư hỏng</td><td class="kt-ck-yn">✓</td><td class="kt-ck-yn"></td></tr>'
    +'</table>'
    +'<table class="kt-t kt-sig"><tr>'
      +'<td class="kt-sig-lbl">Người kiểm tra:</td>'
      +'<td class="kt-sig-name">'+escapeHtml(v.eng)+'</td>'
      +'<td class="kt-sig-lbl">Ký tên:</td>'
      +'<td></td>'
    +'</tr></table>'
  +'</div>';
}

/* CSS for the printed paper — V406 layout + auto-fit content (table-layout:auto). */
const _KT_PRINT_CSS = '\
@page { size: A4 portrait; margin: 4mm 7mm; }\
* { margin:0; padding:0; box-sizing:border-box; }\
html, body { margin:0; padding:0; background:#fff; font-family:"Barlow",sans-serif; font-size:9pt; color:#000; }\
.kt-page { page-break-after:always; height:100vh; display:flex; flex-direction:column; }\
.kt-page:last-child { page-break-after:auto; }\
.kt-sep { height:1.5mm; border-bottom:0.3pt dashed #aaa; margin:0.5mm 0; flex-shrink:0; }\
.kt-form { flex:1; display:flex; flex-direction:column; }\
.kt-t { width:100%; border-collapse:collapse; border:0.7pt solid #333; table-layout:auto; }\
.kt-t td { border:0.5pt solid #666; padding:3pt 6pt; vertical-align:middle; font-size:9pt; }\
.kt-logo-cell { width:26mm; text-align:center; padding:3pt 4pt!important; vertical-align:middle; }\
.kt-logo-txt { line-height:1.15; }\
.kt-logo-hy { font-size:12pt; font-weight:900; letter-spacing:.5pt; color:#006838; display:block; }\
.kt-logo-vc { font-size:6.5pt; font-weight:700; letter-spacing:.3pt; color:#333; display:block; margin-top:1pt; }\
.kt-h-lbl { background:#e0e0e0; font-size:7pt; font-weight:600; text-align:center; line-height:1.3; white-space:nowrap; min-width:14mm; }\
.kt-h-s { font-size:5.5pt; color:#555; font-weight:400; }\
.kt-h-val { font-size:8pt; font-weight:700; text-align:center; }\
.kt-title { text-align:center; font-size:12.5pt; font-weight:900; padding:4pt 0 2pt; letter-spacing:.03em; }\
.kt-lbl { background:#e0e0e0; font-size:8pt; font-weight:600; line-height:1.35; white-space:nowrap; min-width:16mm; }\
.kt-val { font-size:9.5pt; padding:3pt 6pt; word-break:break-word; overflow-wrap:anywhere; }\
.kt-plate { font-weight:800; font-size:11pt; font-family:"Courier New",Courier,"Barlow",sans-serif; letter-spacing:.5pt; min-width:40mm; }\
.kt-doc { font-size:8pt; vertical-align:middle; line-height:1.4; padding:2pt 5pt; white-space:nowrap; }\
.kt-sec { font-size:10pt; font-weight:800; padding:3pt 0 1pt; letter-spacing:.02em; }\
.kt-ck-hdr { background:#e0e0e0; font-size:9pt; font-weight:800; padding:3pt 6pt; white-space:nowrap; }\
.kt-ck-yn-hdr { background:#e0e0e0; text-align:center; font-size:9pt; font-weight:700; white-space:nowrap; min-width:14mm; }\
.kt-ck-txt { font-size:8.5pt; line-height:1.45; padding:3pt 6pt; word-break:break-word; }\
.kt-ck-yn { text-align:center; font-size:13pt; font-weight:700; vertical-align:middle; min-width:14mm; }\
.kt-sig td { padding:5pt 6pt; }\
.kt-sig-lbl { background:#e0e0e0; font-size:9pt; font-weight:800; white-space:nowrap; }\
.kt-sig-name { font-size:10.5pt; font-weight:700; text-align:center; min-width:60mm; }\
';

function ktPrint(){
  const items = KT_LIST.filter(v=>v.checked);
  if(!items.length){ toast('⚠ No vehicle selected','er'); return; }

  let pages = '';
  let pageNo = 0;
  for(let i=0; i<items.length; i+=2){
    pageNo++;
    pages += '<div class="kt-page">';
    pages += _ktBuildOneForm(items[i], pageNo);
    if(i+1 < items.length){
      pages += '<div class="kt-sep"></div>';
      pages += _ktBuildOneForm(items[i+1], pageNo);
    }
    pages += '</div>';
  }

  const doc = '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">'
    + '<style>'+_KT_PRINT_CSS+'</style></head><body>'+pages+'</body></html>';

  /* Inline print via the same hidden iframe pfPrint uses — no new tab. */
  _pfPrintViaIframe(doc, 800);
  toast('🖨 Printing '+items.length+' KTPTVC slip(s) — '+Math.ceil(items.length/2)+' A4 page(s)','ok');
}

/* Init: default date = today, render empty placeholder so the table isn't blank. */
(function _ktInit(){
  const el = document.getElementById('kt-date');
  if(el && !el.value){
    const n = new Date();
    el.value = n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');
  }
  _ktRenderTable();
})();

/* ══════════════════════════════════════════════════════════
   PTT OVERLAY — A5 preview on Scale, editable, then print
   ══════════════════════════════════════════════════════════ */
var _pttOvStId = 0;
function _pttShowOverlay(d){
  _pttOvStId = d.stId;
  const yr = new Date().getFullYear(), dt = new Date();
  const day=dt.getDate(), mon=dt.getMonth()+1;
  const eng = document.getElementById('scEngineer')?.value||'';
  const chk = document.getElementById('scCheckBooth')?.value||'';
  const prodType = _pfDeriveType(d.type||'');
  /* Safe fill adjustment — display values get capped; boothnote keeps the ORIGINAL plan X/Y */
  const origPlanX = d.qty, origPlanY = d.maxTol||d.qty;
  let dX = origPlanX, dY = origPlanY;
  let boothNote = '';
  if(d.sfKg){
    const sfT = d.sfKg/1000;
    if(origPlanX>0 && origPlanX<sfT && sfT<origPlanY){ dY=parseFloat(sfT.toFixed(2)); boothNote='⚠ Sale plan '+origPlanX+' ton/'+origPlanY+' ton > Safe fill allow'; }
    else if(origPlanX>0 && sfT<=origPlanX){ dY=parseFloat(sfT.toFixed(2)); dX=parseFloat((sfT-0.2).toFixed(1)); boothNote='⚠ Sale plan '+origPlanX+' ton/'+origPlanY+' ton > Safe fill allow'; }
  }
  const sfStr = d.sfKg ? d.sfKg.toLocaleString('en-US') : '';
  const twStr = d.twAvg ? Math.round(d.twAvg).toLocaleString('en-US') : '';
  const gwStr = (d.twAvg && dX>0) ? Math.round(d.twAvg + dX*1000).toLocaleString('en-US') : '';
  const bayStr = d.stId+'-'+(d.turn||'');
  const lotStr = _pfLotStack(d.lotFull||'');
  const e=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const ce=(id,v)=>'<span contenteditable="true" id="pttov-'+id+'">'+e(v)+'</span>';
  let h='';
  /* ── Render A5 PTT paper ── */
  h+='<div class="pf-ptt-paper" id="pttOvPaper" style="box-shadow:none;width:100%"><div class="pf-ptt">';
  /* Header */
  h+='<div class="pf-ptt-hdr"><div style="line-height:1.15"><div style="font-family:\'Arial Black\',Arial,sans-serif;font-size:18pt;font-weight:900;color:#000;letter-spacing:0.5px">HYOSUNG</div><div style="font-family:Arial,sans-serif;font-size:10pt;font-weight:700;color:#1a3a5c;letter-spacing:1px;margin-top:1px">VINA CHEMICALS</div></div><div><div class="pf-ptt-titl">LPG LOADING INFORMATION</div></div></div>';
  /* Info grid */
  h+='<div class="pf-ig">';
  h+='<div class="pf-il">Customer</div><div class="pf-iv" style="grid-column:span 3;border-right:none;font-size:10.5pt">'+ce('cust',d.customer)+'</div>';
  h+='<div class="pf-il">Truck No.</div><div class="pf-iv" style="font-size:13pt;font-weight:900;font-family:\'Courier New\',monospace">'+ce('plate',d.plate)+'</div>';
  h+='<div class="pf-il" style="border-left:none">Rmooc No.</div><div class="pf-iv norb" style="font-size:13pt;font-weight:900;font-family:\'Courier New\',monospace">'+ce('rmooc',d.rmooc)+'</div>';
  h+='<div class="pf-il-qty">Loading Q\'ty</div>';
  h+='<div style="padding:3px 6px;border-right:1px solid #888;border-bottom:2px solid #333;display:flex;align-items:center"><span contenteditable="true" id="pttov-qty" style="font-size:20pt;font-weight:900;font-family:\'Courier New\',monospace">'+e(dX>0?dX:'')+'</span><span style="font-size:11pt;color:#666;margin:0 4px">Ton /</span><span contenteditable="true" id="pttov-maxqty" style="font-size:20pt;font-weight:900;font-family:\'Courier New\',monospace">'+e(dY>0?dY:'')+'</span><span style="font-size:11pt;color:#666;margin-left:4px">Ton</span></div>';
  h+='<div class="pf-il-qty" style="border-left:none;font-size:8pt">Product Type</div><div style="padding:3px 6px;border-bottom:2px solid #333;display:flex;align-items:center"><span contenteditable="true" id="pttov-prodtype" style="font-size:12pt;font-weight:800;color:#1a5276;letter-spacing:0.5px">'+e(prodType)+'</span></div>';
  h+='<div class="pf-il" style="font-size:8pt;padding:2px 4px">Safe Fill Allow</div><div class="pf-iv" style="font-family:\'Courier New\',monospace;padding:2px 5px;display:flex;align-items:center"><span contenteditable="true" id="pttov-sf" style="font-size:20pt;font-weight:900;font-family:\'Courier New\',monospace">'+e(sfStr)+'</span><span style="font-size:9pt;color:#666;margin-left:4px;font-weight:600">kg</span></div>';
  h+='<div class="pf-il" style="border-left:none;font-size:8pt;padding:2px 4px">Lot / Tank</div><div class="pf-iv norb" style="font-family:\'Courier New\',monospace;font-size:12pt;font-weight:700;padding:2px 5px;line-height:1.15;white-space:pre-line">'+ce('lot',lotStr)+'</div>';
  h+='<div class="pf-il nobb" style="font-size:8pt;padding:2px 4px">DO Info</div><div class="pf-iv nobb" style="font-family:\'Courier New\',monospace;padding:2px 5px;line-height:1.2;display:block"><div contenteditable="true" id="pttov-do" style="font-size:12pt;font-weight:900;white-space:pre-line">'+e(d.doNum)+'</div><div style="font-size:12pt;font-weight:900;color:#000"><span contenteditable="true" id="pttov-doqty">'+e(d.qty||'')+'</span><span style="font-size:9pt;color:#666;margin-left:3px;font-weight:600">Ton</span></div></div>';
  h+='<div class="pf-il nobb" style="border-left:none;font-size:8pt;padding:2px 4px">Bay</div><div class="pf-iv norb nobb" style="font-size:15pt;font-weight:900;padding:2px 5px">'+ce('bay',bayStr)+'</div>';
  h+='</div>';
  /* Weigh table */
  h+='<table class="pf-wt"><thead><tr><th style="width:60px">Parameter</th><th style="width:70px">AVG</th><th>1st time</th><th>2nd time</th><th style="width:70px">Time</th><th style="width:70px">Pressure</th></tr></thead><tbody>';
  h+='<tr><td class="pw-lbl">Truck Wt</td><td class="pw-wr pw-sm" style="font-size:15pt;font-weight:900;background:#f5f9fc;padding:3px 5px">'+ce('tw',twStr)+'</td><td class="pw-wr pw-sm">kg</td><td class="pw-wr pw-sm">kg</td><td class="pw-wr pw-sm"></td><td class="pw-wr pw-sm"></td></tr>';
  h+='<tr><td class="pw-lbl">Gross Wt</td><td class="pw-wr pw-sm" style="font-size:15pt;font-weight:900;background:#f5f9fc;padding:3px 5px"><span id="pttov-gw">'+e(gwStr)+'</span></td><td class="pw-wr pw-sm">kg</td><td class="pw-wr pw-sm">kg</td><td class="pw-wr pw-sm"></td><td class="pw-wr pw-sm"></td></tr>';
  h+='<tr><td class="pw-lbl">Net Wt</td><td class="pw-wr pw-sm" colspan="2">kg</td><td class="pw-wr pw-sm">kg</td><td class="pw-wr pw-sm"></td><td class="pw-wr pw-sm"></td></tr>';
  h+='<tr><td class="pw-lbl">Seal No.</td><td class="pw-wr pw-sm" colspan="3"></td><td rowspan="2" colspan="2" style="border:1px solid #aaa;vertical-align:top;padding:3px 5px"><span style="font-size:7pt;color:#888;font-weight:600;letter-spacing:.5px">ENGINEER NOTE</span><div contenteditable="true" id="pttov-engnote" style="font-size:8.5pt;color:#d62839;min-height:16px"></div></td></tr>';
  h+='<tr><td class="pw-lbl">FQ</td><td class="pw-wr pw-sm" colspan="2">kg</td><td class="pw-wr pw-sm">kg</td></tr>';
  h+='</tbody></table>';
  /* Notes */
  h+='<div class="pf-note" style="min-height:20px"><span class="pf-nlbl">Sale Note:</span><span class="pf-nval" contenteditable="true" id="pttov-salenote">'+e(d.saleNote)+'</span></div>';
  h+='<div class="pf-note" style="min-height:20px;background:#fff5f5"><span class="pf-nlbl" style="color:#c00">Check booth:</span><span class="pf-nval" style="color:#c00;font-weight:700" contenteditable="true" id="pttov-boothnote">'+e(boothNote)+'</span></div>';
  /* Date */
  h+='<div class="pf-date" style="padding:2px 0 1px">Ngày '+ce('day',day)+' tháng '+ce('mon',mon)+' năm '+ce('yr',yr)+'</div>';
  /* Signatures */
  h+='<div class="pf-sigs">';
  h+='<div class="pf-sc" style="padding:2px 8px 1px"><div class="pf-sttl" style="font-size:8pt">Check Booth</div><div class="pf-ssp" style="height:52px"></div><div class="pf-snm" style="font-size:9pt">'+ce('sign1',chk)+'</div></div>';
  h+='<div class="pf-sc" style="padding:2px 8px 1px"><div class="pf-sttl" style="font-size:8pt">Engineer</div><div class="pf-ssp" style="height:52px"></div><div class="pf-snm" style="font-size:9pt">'+ce('sign2',eng)+'</div></div>';
  h+='<div class="pf-sc" style="padding:2px 8px 1px"><div class="pf-sttl" style="font-size:8pt">Driver</div><div class="pf-ssp" style="height:52px"></div><div class="pf-snm" style="font-size:9pt">'+ce('sign3',d.driver)+'</div></div>';
  h+='</div><div class="pf-sfoot"></div>';
  h+='</div></div>';
  /* Inject */
  document.getElementById('pttOvTitle').textContent='📋 PTT — Station '+d.stId+' · '+d.plate;
  document.getElementById('pttOvBody').innerHTML=h;
  document.getElementById('pttOvBg').classList.add('on');
}
function pttOvClose(){
  document.getElementById('pttOvBg').classList.remove('on');
}
function pttOvPrint(){
  /* Copy overlay paper into pf-ptt-paper for pfPrint to use */
  const ovPaper = document.getElementById('pttOvPaper');
  if(!ovPaper){toast('No PTT data','er');return;}
  const target = document.getElementById('pf-ptt-paper');
  if(target) target.innerHTML = ovPaper.innerHTML;
  pfPrint('ptt','portrait');
  toast('🖨 Printing PTT — Station '+_pttOvStId,'ok');
}

/* ══════════════════════════════════════════════════════════
   PTT_EARLY — Bulk print PTT for early-morning orders (before 8AM)
   Source  : TMR.PLAN (Tomorrow Plan) only — matches V406 behaviour.
   Trigger : note contains the digit "8" (sale writes "Arrive before 8AM").
   Date    : printed PTT date = row._forDate (NOT new Date()).
   Lot/Tank: placeholder only — "LPG-<curYear>-...... / TK-350....." —
             tank not yet decided, booth staff fills by hand.
   Print   : multi A5 page doc via _pfPrintViaIframe (no new tab).
   "Printed" mark : RAM-only (module-level _printedOids), never Firebase.
   Cert badges    : FCHECK.orderWarning(row, parseDate(_forDate)).
   �
   (Chi tiet trien khai nam trong js/integrations/ptt-early.js)
   ══════════════════════════════════════════════════════════ */
