/* ============================================================
 * MTHR  —  mthr.js   (MONTHLY REPORT — báo cáo tháng 월별LPG)
 * ------------------------------------------------------------
 * NGUỒN logic: HSVC Engineer · 10-monthly-report.js (công thức GIỮ NGUYÊN 1:1).
 *
 * DỮ LIỆU (V4) — TẤT CẢ chạy trên RAM, KHÔNG Firebase, KHÔNG localStorage,
 *                tắt app là mất:
 *   • SAP ZMMFR022 (KG) ← SP.ROWS (data/sp.js). mat 'C3'/'C4', batch 1 ký tự D/E/P/X.
 *   • OL1 P / X (C3)    ← tự tính từ SAP (nút Auto-fill P/X).
 *   • Pure / Domestic / Export / Vessel ← PASTE TL DATA (sheet "Raw Data"),
 *       parse 36 cột, gom theo tháng × bồn × nhóm. Dùng để auto-fill Pure
 *       và để ĐỐI CHIẾU SAP ⇄ TL.
 *   • 산업체 (industrial split) ← nhập tay (SAP/TL không tách được).
 *   • Inputs nhập tay nhớ trong phiên qua STORE (RAM).
 *
 * Hiển thị: TẤN, 3 chữ số thập phân.  Export: sheet '월별LPG'.
 * ============================================================ */
"use strict";

const MTHR = (function(){

  /* ── V4 semantics (adapter) ── */
  const MAT_C3 = 'C3';
  const MAT_C4 = 'C4';

  const INPUT_KEYS = [
    'gi_P_C3','gi_X_C3','pure_C3','pure_C4',
    'ind_TK3501_C3','ind_TK3501_C4','ind_TK3502_C3','ind_TK3502_C4'
  ];
  const INPUT_EL = {
    gi_P_C3:'mthr-gi-p', gi_X_C3:'mthr-gi-x', pure_C3:'mthr-pure-c3', pure_C4:'mthr-pure-c4',
    ind_TK3501_C3:'mthr-ind-tk1-c3', ind_TK3501_C4:'mthr-ind-tk1-c4',
    ind_TK3502_C3:'mthr-ind-tk2-c3', ind_TK3502_C4:'mthr-ind-tk2-c4'
  };

  let MONTH = '';
  let INPUTS       = _zeroInputs();
  let INPUTS_SAVED = _zeroInputs();
  let _dirty = false;
  let _initDone = false;

  /* RAM-only stores (session) */
  const STORE = {};        // STORE[YYYY-MM] = {…inputs}  nhớ nhập tay trong phiên
  let TL_ROWS = [];        // [{month,date,sloc,bucket,c3,c4,net}]
  let TL_INFO = null;      // {n, months:[], pastedAt}

  /* ── RAM-only SAP ZMMFR022 (paste vào tab Monthly, KHÔNG local/Firebase) ──
     Khi SAP_RAM có dữ liệu → báo cáo dùng RIÊNG SAP_RAM (bỏ qua SP.ROWS tab SAP).
     Khi SAP_RAM rỗng → fallback về SP.ROWS như cũ. Tắt app là mất. */
  const SAP_RAM = {};      // key date|sloc|mat|batch → {date,sloc,mat,batch,init,gr,gi,trs,end}
  let SAP_INFO = null;     // {n, months:[], pastedAt}

  /* ── RAM-only WMS-SAP batch X (OL1 EX-PETCHEM) — paste C3사용량, KHÔNG local/FB ──
     X_RAM[date] = kg. Ô input X tự điền từ ĐÂY (không đọc CAV). Tắt app là mất. */
  const X_RAM = {};        // 'YYYY-MM-DD' → kg (theo ngày, hiển thị 2 số lẻ → có thể sai số cộng dồn)
  const X_TOTAL = {};      // 'YYYY-MM' → kg (lấy từ dòng Total/합계, full-precision → ưu tiên)
  let X_INFO = null;       // {n, months:[], pastedAt, total}

  function _zeroInputs(){ const o={}; INPUT_KEYS.forEach(k=>o[k]=0); return o; }

  /* ── helpers ── */
  function esc(s){ return (typeof escapeHtml==='function') ? escapeHtml(s) : String(s==null?'':s); }
  function num(v){
    if(v===null||v===undefined||v==='') return 0;
    let s=String(v).trim().replace(/,/g,'').replace(/\s/g,'');
    s=s.replace(/[−‒–—]/g,'-'); if(/-$/.test(s)) s='-'+s.slice(0,-1);
    const n=parseFloat(s); return isFinite(n)?n:0;
  }
  function bat(r){ return String((r&&r.batch)||'').trim().toUpperCase(); }
  /* Nguồn SAP cho báo cáo:
       • SAP_RAM (paste tại tab Monthly) có dữ liệu → dùng RIÊNG SAP_RAM.
       • SAP_RAM rỗng → fallback SP.ROWS (tab SAP, Firebase/local) như cũ. */
  function sapUsingRam(){ return Object.keys(SAP_RAM).length>0; }
  function sapRows(){
    if(sapUsingRam()) return Object.values(SAP_RAM);
    const src=(typeof SP!=='undefined'&&SP.ROWS)?SP.ROWS:{}; return Object.values(src);
  }
  function ton(kg){ return (kg/1000).toLocaleString('en-US',{maximumFractionDigits:3}); }

  /* ============================================================
     Lifecycle  (inputs = RAM, không Firebase)
  ============================================================ */
  function init(){
    if(_initDone) return; _initDone=true;
    const now=new Date();
    MONTH=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
    const mEl=document.getElementById('mthr-month'); if(mEl) mEl.value=MONTH;
  }
  function onTabEnter(){
    if(!MONTH){
      const now=new Date(); MONTH=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
      const mEl=document.getElementById('mthr-month'); if(mEl) mEl.value=MONTH;
    }
    loadInputs(); autoFillXFromWms(); renderTable();
  }
  function _commit(month){ if(!month) return; const rec={}; INPUT_KEYS.forEach(k=>rec[k]=INPUTS[k]||0); STORE[month]=rec; }

  function onMonthChange(){
    const mEl=document.getElementById('mthr-month'); if(!mEl||!mEl.value) return;
    _commit(MONTH);                 // giữ lại nhập tay của tháng đang xem (RAM)
    MONTH=mEl.value;
    loadInputs(); autoFillXFromWms(); renderTable();
  }
  /* nạp inputs của tháng từ STORE (RAM). Không có → 0. */
  function loadInputs(){
    const saved=(MONTH&&STORE[MONTH])?STORE[MONTH]:null;
    INPUT_KEYS.forEach(k=>{ const v=(saved&&typeof saved[k]==='number')?saved[k]:0; INPUTS[k]=v; INPUTS_SAVED[k]=v; });
    _dirty=false; syncInputEls();
  }
  function onInputChange(key){
    if(!INPUT_KEYS.includes(key)) return;
    const el=document.getElementById(INPUT_EL[key]); if(!el) return;
    const v=num(el.value);
    INPUTS[key]=v;
    STORE[MONTH]=Object.assign({}, STORE[MONTH], _snapshot());  // commit live → RAM
    _dirty=true;
    el.classList.toggle('mthr-diff', v!==INPUTS_SAVED[key]);
    el.classList.remove('mthr-auto');
    renderTable();
  }
  function _snapshot(){ const o={}; INPUT_KEYS.forEach(k=>o[k]=INPUTS[k]||0); return o; }

  function toggleInputs(){
    const p=document.getElementById('mthr-inputs-panel'), btn=document.getElementById('mthr-inputs-toggle');
    if(!p) return; p.classList.toggle('on');
    if(btn) btn.innerHTML=p.classList.contains('on')?'⚙ Inputs ▲':'⚙ Inputs ▼';
  }
  function syncInputEls(){
    INPUT_KEYS.forEach(k=>{
      const el=document.getElementById(INPUT_EL[k]); if(!el) return;
      el.value=INPUTS[k]?INPUTS[k].toLocaleString('en-US',{maximumFractionDigits:3}):'';
      el.classList.toggle('mthr-diff', INPUTS[k]!==INPUTS_SAVED[k]);
      el.classList.remove('mthr-auto');
    });
  }
  /* "Save" giờ chỉ ghi nhớ baseline trong RAM (xoá highlight diff) */
  function saveInputs(){
    if(!MONTH){ toast('⚠ Chưa chọn tháng','warn'); return; }
    INPUT_KEYS.forEach(k=>INPUTS_SAVED[k]=INPUTS[k]||0);
    STORE[MONTH]=_snapshot(); _dirty=false; syncInputEls();
    toast('✅ Đã ghi nhớ inputs tháng '+MONTH+' (RAM — mất khi tắt app)','ok');
  }

  /* Auto-fill OL1 GI batch P & X (C3) từ SAP */
  function fillFromSap(){
    if(!MONTH){ toast('⚠ Chưa chọn tháng','warn'); return; }
    const rows=filterMonth(sapRows(),MONTH);
    if(!rows.length){ toast('⚠ Không có SAP data cho tháng '+MONTH,'warn'); return; }
    const giP=-sum(rows,r=>r.sloc==='1100'&&r.mat===MAT_C3&&bat(r)==='P','gi')/1000;
    const giX=-sum(rows,r=>r.sloc==='1100'&&r.mat===MAT_C3&&bat(r)==='X','gi')/1000;
    INPUTS.gi_P_C3=+(giP.toFixed(3)); INPUTS.gi_X_C3=+(giX.toFixed(3));
    STORE[MONTH]=_snapshot(); _dirty=true; syncInputEls();
    ['mthr-gi-p','mthr-gi-x'].forEach(id=>{const e=document.getElementById(id);if(e)e.classList.add('mthr-auto');});
    renderTable(); toast('⚡ Auto-fill OL1 GI P, GI X từ SAP','ok');
  }
  function recalc(){ renderTable(); toast('🔄 Đã tính lại bảng','ok'); }
  function toggleVerify(){
    const body=document.getElementById('mthr-verify-body'), caret=document.getElementById('mthr-verify-caret');
    if(!body) return; body.classList.toggle('hide');
    if(caret) caret.textContent=body.classList.contains('hide')?'▶':'▼';
  }

  /* ============================================================
     Calc helpers
  ============================================================ */
  function filterMonth(rows,ym){
    if(!Array.isArray(rows)||!rows.length||!ym) return [];
    const prefix=ym+'-'; return rows.filter(r=>r&&typeof r.date==='string'&&r.date.startsWith(prefix));
  }
  function sum(rows,pred,field){ let s=0; for(let i=0;i<rows.length;i++){const r=rows[i]; if(pred(r)) s+=(+r[field]||0);} return s; }
  function sumInitFirstDay(rows,pred){
    const map=new Map();
    for(let i=0;i<rows.length;i++){const r=rows[i]; if(!pred(r))continue; const k=r.sloc+'|'+r.mat+'|'+r.batch; const ex=map.get(k); if(!ex||r.date<ex.date)map.set(k,r);}
    let s=0; map.forEach(r=>{s+=(+r.init||0);}); return s;
  }
  function sumEndLastDay(rows,pred){
    const map=new Map();
    for(let i=0;i<rows.length;i++){const r=rows[i]; if(!pred(r))continue; const k=r.sloc+'|'+r.mat+'|'+r.batch; const ex=map.get(k); if(!ex||r.date>ex.date)map.set(k,r);}
    let s=0; map.forEach(r=>{s+=(+r.end||0);}); return s;
  }

  /* ============================================================
     Compute 14 rows (KG) — GIỮ NGUYÊN công thức Engineer
  ============================================================ */
  function computeAllRows(rows, inputsTon){
    const i_giP=(inputsTon.gi_P_C3||0)*1000, i_giX=(inputsTon.gi_X_C3||0)*1000;
    const i_pC3=(inputsTon.pure_C3||0)*1000, i_pC4=(inputsTon.pure_C4||0)*1000;
    const i_ind_TK1_C3=(inputsTon.ind_TK3501_C3||0)*1000, i_ind_TK1_C4=(inputsTon.ind_TK3501_C4||0)*1000;
    const i_ind_TK2_C3=(inputsTon.ind_TK3502_C3||0)*1000, i_ind_TK2_C4=(inputsTon.ind_TK3502_C4||0)*1000;

    const predCavP=r=>r.sloc==='1100'&&r.mat===MAT_C3&&['D','E','P'].includes(bat(r));
    const cavP_init_cav=sumInitFirstDay(rows,predCavP);
    const cavP_gr=sum(rows,predCavP,'gr');
    const cavP_end_cav=sumEndLastDay(rows,predCavP);
    const cavP_ol1=i_giP;
    const cavP_heater=-sum(rows,r=>r.sloc==='B100'&&r.mat===MAT_C3,'gi');
    const cavP_mix=sum(rows,r=>(r.sloc==='2100'||r.sloc==='2101')&&r.mat===MAT_C3&&['D','E'].includes(bat(r)),'trs');
    const cavP_giD_abs=-sum(rows,r=>r.sloc==='1100'&&r.mat===MAT_C3&&bat(r)==='D','gi');
    const cavP_dom=Math.max(0,cavP_giD_abs-i_pC3);
    const cavP_ind=i_pC3;
    const cavP_exp=-sum(rows,r=>r.sloc==='1100'&&r.mat===MAT_C3&&bat(r)==='E','gi');
    const cavP_gitot=cavP_ol1+cavP_heater+cavP_mix+cavP_dom+cavP_ind+cavP_exp;

    const predCavX=r=>r.sloc==='1100'&&r.mat===MAT_C3&&bat(r)==='X';
    const cavX_init_cav=sumInitFirstDay(rows,predCavX);
    const cavX_gr=sum(rows,predCavX,'gr');
    const cavX_end_cav=sumEndLastDay(rows,predCavX);
    const cavX_ol1=i_giX; const cavX_gitot=cavX_ol1;

    const predCavC4=r=>r.sloc==='1100'&&r.mat===MAT_C4;
    const cavC4_init_cav=sumInitFirstDay(rows,predCavC4);
    const cavC4_gr=sum(rows,predCavC4,'gr');
    const cavC4_end_cav=sumEndLastDay(rows,predCavC4);
    const cavC4_mix=sum(rows,r=>(r.sloc==='2100'||r.sloc==='2101')&&r.mat===MAT_C4&&['D','E'].includes(bat(r)),'trs');
    const cavC4_giD_abs=-sum(rows,r=>r.sloc==='1100'&&r.mat===MAT_C4&&bat(r)==='D','gi');
    const cavC4_dom=Math.max(0,cavC4_giD_abs-i_pC4);
    const cavC4_ind=i_pC4;
    const cavC4_exp=-sum(rows,r=>r.sloc==='1100'&&r.mat===MAT_C4&&bat(r)==='E','gi');
    const cavC4_gitot=cavC4_mix+cavC4_dom+cavC4_ind+cavC4_exp;

    const predTK1C3=r=>r.sloc==='2100'&&r.mat===MAT_C3;
    const tk1c3_init_tk=sumInitFirstDay(rows,predTK1C3);
    const tk1c3_gr=sum(rows,r=>r.sloc==='2100'&&r.mat===MAT_C3&&['D','E'].includes(bat(r)),'trs');
    const tk1c3_end_tk=sumEndLastDay(rows,predTK1C3);
    const tk1c3_giD_abs=-sum(rows,r=>r.sloc==='2100'&&r.mat===MAT_C3&&bat(r)==='D','gi');
    const tk1c3_ind=i_ind_TK1_C3;
    const tk1c3_dom=Math.max(0,tk1c3_giD_abs-i_ind_TK1_C3);
    const tk1c3_exp=-sum(rows,r=>r.sloc==='2100'&&r.mat===MAT_C3&&bat(r)==='E','gi');
    const tk1c3_gitot=tk1c3_dom+tk1c3_ind+tk1c3_exp;

    const predTK1C4=r=>r.sloc==='2100'&&r.mat===MAT_C4;
    const tk1c4_init_tk=sumInitFirstDay(rows,predTK1C4);
    const tk1c4_gr=sum(rows,r=>r.sloc==='2100'&&r.mat===MAT_C4&&['D','E'].includes(bat(r)),'trs');
    const tk1c4_end_tk=sumEndLastDay(rows,predTK1C4);
    const tk1c4_giD_abs=-sum(rows,r=>r.sloc==='2100'&&r.mat===MAT_C4&&bat(r)==='D','gi');
    const tk1c4_ind=i_ind_TK1_C4;
    const tk1c4_dom=Math.max(0,tk1c4_giD_abs-i_ind_TK1_C4);
    const tk1c4_exp=-sum(rows,r=>r.sloc==='2100'&&r.mat===MAT_C4&&bat(r)==='E','gi');
    const tk1c4_gitot=tk1c4_dom+tk1c4_ind+tk1c4_exp;

    const tk1_init_tk=tk1c3_init_tk+tk1c4_init_tk, tk1_gr=tk1c3_gr+tk1c4_gr, tk1_end_tk=tk1c3_end_tk+tk1c4_end_tk;
    const tk1_gitot=tk1c3_gitot+tk1c4_gitot, tk1_dom=tk1c3_dom+tk1c4_dom, tk1_ind=tk1c3_ind+tk1c4_ind, tk1_exp=tk1c3_exp+tk1c4_exp;

    const predTK2C3=r=>r.sloc==='2101'&&r.mat===MAT_C3;
    const tk2c3_init_tk=sumInitFirstDay(rows,predTK2C3);
    const tk2c3_gr=sum(rows,r=>r.sloc==='2101'&&r.mat===MAT_C3&&['D','E'].includes(bat(r)),'trs');
    const tk2c3_end_tk=sumEndLastDay(rows,predTK2C3);
    const tk2c3_giD_abs=-sum(rows,r=>r.sloc==='2101'&&r.mat===MAT_C3&&bat(r)==='D','gi');
    const tk2c3_ind=i_ind_TK2_C3;
    const tk2c3_dom=Math.max(0,tk2c3_giD_abs-i_ind_TK2_C3);
    const tk2c3_exp=-sum(rows,r=>r.sloc==='2101'&&r.mat===MAT_C3&&bat(r)==='E','gi');
    const tk2c3_gitot=tk2c3_dom+tk2c3_ind+tk2c3_exp;

    const predTK2C4=r=>r.sloc==='2101'&&r.mat===MAT_C4;
    const tk2c4_init_tk=sumInitFirstDay(rows,predTK2C4);
    const tk2c4_gr=sum(rows,r=>r.sloc==='2101'&&r.mat===MAT_C4&&['D','E'].includes(bat(r)),'trs');
    const tk2c4_end_tk=sumEndLastDay(rows,predTK2C4);
    const tk2c4_giD_abs=-sum(rows,r=>r.sloc==='2101'&&r.mat===MAT_C4&&bat(r)==='D','gi');
    const tk2c4_ind=i_ind_TK2_C4;
    const tk2c4_dom=Math.max(0,tk2c4_giD_abs-i_ind_TK2_C4);
    const tk2c4_exp=-sum(rows,r=>r.sloc==='2101'&&r.mat===MAT_C4&&bat(r)==='E','gi');
    const tk2c4_gitot=tk2c4_dom+tk2c4_ind+tk2c4_exp;

    const tk2_init_tk=tk2c3_init_tk+tk2c4_init_tk, tk2_gr=tk2c3_gr+tk2c4_gr, tk2_end_tk=tk2c3_end_tk+tk2c4_end_tk;
    const tk2_gitot=tk2c3_gitot+tk2c4_gitot, tk2_dom=tk2c3_dom+tk2c4_dom, tk2_ind=tk2c3_ind+tk2c4_ind, tk2_exp=tk2c3_exp+tk2c4_exp;

    const pureC3_gr=i_pC3, pureC3_dom=i_pC3, pureC3_cav_re=i_pC3;
    const pureC4_gr=i_pC4, pureC4_dom=i_pC4, pureC4_cav_re=i_pC4;
    const pure_gr=pureC3_gr+pureC4_gr, pure_dom=pureC3_dom+pureC4_dom, pure_cav_re=pureC3_cav_re+pureC4_cav_re;

    const sapC3_init_cav=cavP_init_cav+cavX_init_cav, sapC3_init_tk=tk1c3_init_tk+tk2c3_init_tk;
    const sapC3_init_tot=sapC3_init_cav+sapC3_init_tk, sapC3_gr=tk1c3_gr+tk2c3_gr;
    const sapC3_ol1=cavP_ol1+cavX_ol1, sapC3_heater=cavP_heater, sapC3_cav_re=pureC3_cav_re, sapC3_mix=cavP_mix;
    const sapC3_dom=cavP_dom+tk1c3_dom+tk2c3_dom+pureC3_dom, sapC3_ind=cavP_ind+tk1c3_ind+tk2c3_ind, sapC3_exp=cavP_exp+tk1c3_exp+tk2c3_exp;
    const sapC3_gitot=sapC3_ol1+sapC3_heater+sapC3_mix+sapC3_dom+sapC3_ind+sapC3_exp;
    const sapC3_end_cav=cavP_end_cav+cavX_end_cav, sapC3_end_tk=tk1c3_end_tk+tk2c3_end_tk, sapC3_end_tot=sapC3_end_cav+sapC3_end_tk;

    const sapC4_init_cav=cavC4_init_cav, sapC4_init_tk=tk1c4_init_tk+tk2c4_init_tk, sapC4_init_tot=sapC4_init_cav+sapC4_init_tk;
    const sapC4_gr=tk1c4_gr+tk2c4_gr, sapC4_mix=cavC4_mix, sapC4_cav_re=pureC4_cav_re;
    const sapC4_dom=cavC4_dom+tk1c4_dom+tk2c4_dom+pureC4_dom, sapC4_ind=cavC4_ind+tk1c4_ind+tk2c4_ind, sapC4_exp=cavC4_exp+tk1c4_exp+tk2c4_exp;
    const sapC4_gitot=sapC4_mix+sapC4_dom+sapC4_ind+sapC4_exp;
    const sapC4_end_cav=cavC4_end_cav, sapC4_end_tk=tk1c4_end_tk+tk2c4_end_tk, sapC4_end_tot=sapC4_end_cav+sapC4_end_tk;

    return [
      { key:'sap_c3', a:'SAP마감', b:'프로판', cls:'mthr-row-sap',
        init_tot:sapC3_init_tot,init_cav:sapC3_init_cav,init_tk:sapC3_init_tk,gr:sapC3_gr,
        gitot:sapC3_gitot,ol1:sapC3_ol1,heater:sapC3_heater,mix:sapC3_mix,cav_re:sapC3_cav_re,
        dom:sapC3_dom,ind:sapC3_ind,exp:sapC3_exp,end_tot:sapC3_end_tot,end_cav:sapC3_end_cav,end_tk:sapC3_end_tk },
      { key:'sap_c4', a:'SAP마감', b:'부탄', cls:'mthr-row-sap',
        init_tot:sapC4_init_tot,init_cav:sapC4_init_cav,init_tk:sapC4_init_tk,gr:sapC4_gr,
        gitot:sapC4_gitot,mix:sapC4_mix,cav_re:sapC4_cav_re,
        dom:sapC4_dom,ind:sapC4_ind,exp:sapC4_exp,end_tot:sapC4_end_tot,end_cav:sapC4_end_cav,end_tk:sapC4_end_tk },
      { key:'cav_p', a:'캐번', b:'프로판(P)', cls:'mthr-row-cav-p',
        init_tot:cavP_init_cav,init_cav:cavP_init_cav,init_tk:0,gr:cavP_gr,
        gitot:cavP_gitot,ol1:cavP_ol1,heater:cavP_heater,mix:cavP_mix,
        dom:cavP_dom,ind:cavP_ind,exp:cavP_exp,end_tot:cavP_end_cav,end_cav:cavP_end_cav,end_tk:0 },
      { key:'cav_x', a:'', b:'프로판(EXP)', cls:'mthr-row-cav-x',
        init_tot:cavX_init_cav,init_cav:cavX_init_cav,init_tk:0,gr:cavX_gr,
        gitot:cavX_gitot,ol1:cavX_ol1,end_tot:cavX_end_cav,end_cav:cavX_end_cav,end_tk:0 },
      { key:'cav_c4', a:'캐번', b:'부탄', cls:'mthr-row-cav-c4',
        init_tot:cavC4_init_cav,init_cav:cavC4_init_cav,init_tk:0,gr:cavC4_gr,
        gitot:cavC4_gitot,mix:cavC4_mix,dom:cavC4_dom,ind:cavC4_ind,exp:cavC4_exp,
        end_tot:cavC4_end_cav,end_cav:cavC4_end_cav,end_tk:0 },
      { key:'tk1_mix', a:'TK3501', b:'Mix LPG', cls:'mthr-row-tk-tot',
        init_tot:tk1_init_tk,init_cav:0,init_tk:tk1_init_tk,gr:tk1_gr,
        gitot:tk1_gitot,dom:tk1_dom,ind:tk1_ind,exp:tk1_exp,end_tot:tk1_end_tk,end_cav:0,end_tk:tk1_end_tk },
      { key:'tk1_c3', a:'', b:'(C3)', cls:'mthr-row-tk-sub', indent:true,
        init_tot:tk1c3_init_tk,init_cav:0,init_tk:tk1c3_init_tk,gr:tk1c3_gr,
        gitot:tk1c3_gitot,dom:tk1c3_dom,ind:tk1c3_ind,exp:tk1c3_exp,end_tot:tk1c3_end_tk,end_cav:0,end_tk:tk1c3_end_tk },
      { key:'tk1_c4', a:'', b:'(C4)', cls:'mthr-row-tk-sub', indent:true,
        init_tot:tk1c4_init_tk,init_cav:0,init_tk:tk1c4_init_tk,gr:tk1c4_gr,
        gitot:tk1c4_gitot,dom:tk1c4_dom,ind:tk1c4_ind,exp:tk1c4_exp,end_tot:tk1c4_end_tk,end_cav:0,end_tk:tk1c4_end_tk },
      { key:'tk2_mix', a:'TK3502', b:'Mix LPG', cls:'mthr-row-tk-tot',
        init_tot:tk2_init_tk,init_cav:0,init_tk:tk2_init_tk,gr:tk2_gr,
        gitot:tk2_gitot,dom:tk2_dom,ind:tk2_ind,exp:tk2_exp,end_tot:tk2_end_tk,end_cav:0,end_tk:tk2_end_tk },
      { key:'tk2_c3', a:'', b:'(C3)', cls:'mthr-row-tk-sub', indent:true,
        init_tot:tk2c3_init_tk,init_cav:0,init_tk:tk2c3_init_tk,gr:tk2c3_gr,
        gitot:tk2c3_gitot,dom:tk2c3_dom,ind:tk2c3_ind,exp:tk2c3_exp,end_tot:tk2c3_end_tk,end_cav:0,end_tk:tk2c3_end_tk },
      { key:'tk2_c4', a:'', b:'(C4)', cls:'mthr-row-tk-sub', indent:true,
        init_tot:tk2c4_init_tk,init_cav:0,init_tk:tk2c4_init_tk,gr:tk2c4_gr,
        gitot:tk2c4_gitot,dom:tk2c4_dom,ind:tk2c4_ind,exp:tk2c4_exp,end_tot:tk2c4_end_tk,end_cav:0,end_tk:tk2c4_end_tk },
      { key:'pure_tot', a:'캐번', b:'Pure C3, C4', cls:'mthr-row-pure-tot',
        init_tot:0,init_cav:0,init_tk:0,gr:pure_gr,gitot:pure_dom,cav_re:pure_cav_re,mix:0,dom:pure_dom,
        end_tot:0,end_cav:0,end_tk:0 },
      { key:'pure_c3', a:'(ETC)', b:'(C3)', cls:'mthr-row-pure-sub', indent:true,
        init_tot:0,init_cav:0,init_tk:0,gitot:0,end_tot:0,end_cav:0,end_tk:0 },
      { key:'pure_c4', a:'', b:'(C4)', cls:'mthr-row-pure-sub', indent:true,
        init_tot:0,init_cav:0,init_tk:0,gr:pureC4_gr,gitot:pureC4_dom,dom:pureC4_dom,end_tot:0,end_cav:0,end_tk:0 }
    ];
  }

  /* ============================================================ Render ============================================================ */
  function fmtTon(kg){ if(kg===undefined||kg===null) return ''; const t=kg/1000; if(Math.abs(t)<0.0005) return '-'; return t.toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:3}); }
  function cellCls(kg,extra){ let c=extra||''; if(kg===0||kg===undefined||kg===null) c+=' mthr-val-zero'; else if(kg<0) c+=' mthr-val-neg'; return c.trim(); }
  function cellHtml(val,extra,hi){ if(val===undefined||val===null) return '<td class="'+(extra||'').trim()+'"></td>'; let c=cellCls(val,extra); if(hi&&Math.abs((val||0)/1000)>=0.0005) c=(c+' mthr-hi-red').trim(); return '<td class="'+c+'">'+fmtTon(val)+'</td>'; }

  function renderSrcBadge(){
    const b=document.getElementById('mthr-src-badge'); if(!b) return;
    if(sapUsingRam()){
      const m=SAP_INFO?SAP_INFO.months.join(', '):'';
      b.className='mthr-src ram';
      b.innerHTML='💾 SAP: <b>RAM paste</b>'+(m?(' · '+esc(m)):'');
      b.title='Báo cáo đang dùng SAP paste trong RAM (bỏ qua tab SAP). Tắt app là mất.';
    } else {
      b.className='mthr-src fb';
      b.innerHTML='☁ SAP: tab SAP (SP)';
      b.title='Chưa paste SAP vào RAM — đang dùng dữ liệu tab SAP (Firebase/local).';
    }
    const xb=document.getElementById('mthr-x-badge');
    if(xb){
      if(X_INFO){ xb.style.display=''; xb.className='mthr-src ram'; xb.innerHTML='⛽ X: <b>WMS-SAP RAM</b> · '+esc(X_INFO.months.join(', ')); xb.title='Ô X tự điền từ WMS-SAP paste (RAM).'; }
      else { xb.style.display='none'; }
    }
  }
  function renderTable(){
    const tbl=document.getElementById('tbl-mthr'), empty=document.getElementById('mthr-empty'),
          tbody=document.getElementById('tbody-mthr'), verifyBox=document.getElementById('mthr-verify'),
          infoRows=document.getElementById('mthr-info-rows');
    if(!tbl||!empty||!tbody) return;
    const monthRows=filterMonth(sapRows(),MONTH);
    if(infoRows) infoRows.textContent=monthRows.length;
    renderSrcBadge();
    if(!monthRows.length){ tbl.style.display='none'; empty.style.display=''; if(verifyBox) verifyBox.style.display='none'; renderCompare(); return; }
    empty.style.display='none'; tbl.style.display=''; if(verifyBox) verifyBox.style.display='';
    const allRows=computeAllRows(monthRows,INPUTS);
    tbody.innerHTML=allRows.map(r=>{
      const labelPad=r.indent?'mthr-row-sublabel':'mthr-row-label';
      const labelText=r.a?(esc(r.a)+' <span class="mthr-row-tag">'+esc(r.b)+'</span>')
                         :('<span class="mthr-row-tag" style="margin-left:0;font-weight:600">'+esc(r.b)+'</span>');
      return '<tr class="'+r.cls+'"><td class="'+labelPad+'">'+labelText+'</td>'+
        cellHtml(r.init_tot,'mthr-col-init-tot')+cellHtml(r.init_cav,'mthr-col-init')+cellHtml(r.init_tk,'mthr-col-init')+
        cellHtml(r.gr,'mthr-col-gr')+cellHtml(r.gitot,'mthr-col-gitot')+
        cellHtml(r.ol1,'mthr-col-use',true)+cellHtml(r.heater,'mthr-col-use')+cellHtml(r.sap_err,'mthr-col-use')+
        cellHtml(r.cav_re,'mthr-col-use')+cellHtml(r.loss,'mthr-col-use')+cellHtml(r.mix,'mthr-col-use',true)+
        cellHtml(r.dom,'mthr-col-use',true)+cellHtml(r.ind,'mthr-col-use')+cellHtml(r.exp,'mthr-col-use',true)+
        cellHtml(r.end_tot,'mthr-col-end-tot')+cellHtml(r.end_cav,'mthr-col-end')+cellHtml(r.end_tk,'mthr-col-end')+'</tr>';
    }).join('');
    renderVerify(monthRows,allRows);
    renderCompare();
  }

  function renderVerify(monthRows,computedRows){
    const body=document.getElementById('mthr-verify-body'); if(!body) return;
    const items=[];
    ['cav_p','cav_x','cav_c4'].forEach(key=>{ const r=computedRows.find(x=>x.key===key); if(!r) return;
      const calcEnd=(r.init_tot||0)+(r.gr||0)-(r.gitot||0), diff=calcEnd-(r.end_tot||0), ok=Math.abs(diff)<1;
      items.push({kind:ok?'ok':'er',lbl:'Stock balance ['+r.a+' '+r.b+']: INIT + GR − GI_TOT = END',val:ok?'✓ khớp':('✗ lệch '+fmtTon(diff)+' TON')}); });
    ['tk1_mix','tk2_mix'].forEach(key=>{ const r=computedRows.find(x=>x.key===key); if(!r) return;
      const calcEnd=(r.init_tot||0)+(r.gr||0)-(r.gitot||0), diff=calcEnd-(r.end_tot||0), ok=Math.abs(diff)<1;
      items.push({kind:ok?'ok':'warn',lbl:'Stock balance ['+r.a+' '+r.b+']: INIT + GR − GI_TOT = END',val:ok?'✓ khớp':('Δ='+fmtTon(diff)+' (check input 산업체)')}); });
    const b100_gi=-sum(monthRows,r=>r.sloc==='B100'&&r.mat===MAT_C3,'gi'), b100_trs=sum(monthRows,r=>r.sloc==='B100'&&r.mat===MAT_C3,'trs'), b100_diff=b100_trs-b100_gi;
    items.push({kind:Math.abs(b100_diff)<1?'ok':'warn',lbl:'B100 invariant: GI = TRS in (C3)',val:'GI='+fmtTon(b100_gi)+' / TRS+='+fmtTon(b100_trs)+(Math.abs(b100_diff)<1?' ✓':(' Δ='+fmtTon(b100_diff)))});
    const sap_giP=-sum(monthRows,r=>r.sloc==='1100'&&r.mat===MAT_C3&&bat(r)==='P','gi')/1000, usr_giP=INPUTS.gi_P_C3||0, dP=Math.abs(sap_giP-usr_giP);
    items.push({kind:(sap_giP===0&&usr_giP===0)?'ok':(dP<0.001?'ok':'warn'),lbl:'GI batch P (OL1): SAP raw vs user input',val:'SAP='+sap_giP.toLocaleString('en-US',{maximumFractionDigits:3})+' / user='+usr_giP.toLocaleString('en-US',{maximumFractionDigits:3})+(dP<0.001?' ✓':(' Δ='+dP.toFixed(3)))});
    const sap_giX=-sum(monthRows,r=>r.sloc==='1100'&&r.mat===MAT_C3&&bat(r)==='X','gi')/1000, usr_giX=INPUTS.gi_X_C3||0, dX=Math.abs(sap_giX-usr_giX);
    items.push({kind:(sap_giX===0&&usr_giX===0)?'ok':(dX<0.001?'ok':'warn'),lbl:'GI batch X (OL1): SAP raw vs user input',val:'SAP='+sap_giX.toLocaleString('en-US',{maximumFractionDigits:3})+' / user='+usr_giX.toLocaleString('en-US',{maximumFractionDigits:3})+(dX<0.001?' ✓':(' Δ='+dX.toFixed(3)))});
    const sapC3=computedRows.find(r=>r.key==='sap_c3'), sapC4=computedRows.find(r=>r.key==='sap_c4');
    if(sapC3){ const e=(computedRows.find(r=>r.key==='cav_p').init_cav||0)+(computedRows.find(r=>r.key==='cav_x').init_cav||0)+(computedRows.find(r=>r.key==='tk1_c3').init_tk||0)+(computedRows.find(r=>r.key==='tk2_c3').init_tk||0); const ok=Math.abs(e-sapC3.init_tot)<1; items.push({kind:ok?'ok':'er',lbl:'SAP마감 (C3) INIT pivot: Cavern + TK = total',val:ok?'✓ khớp ('+fmtTon(sapC3.init_tot)+')':('lệch '+fmtTon(e-sapC3.init_tot))}); }
    if(sapC4){ const e=(computedRows.find(r=>r.key==='cav_c4').init_cav||0)+(computedRows.find(r=>r.key==='tk1_c4').init_tk||0)+(computedRows.find(r=>r.key==='tk2_c4').init_tk||0); const ok=Math.abs(e-sapC4.init_tot)<1; items.push({kind:ok?'ok':'er',lbl:'SAP마감 (C4) INIT pivot: Cavern + TK = total',val:ok?'✓ khớp ('+fmtTon(sapC4.init_tot)+')':('lệch '+fmtTon(e-sapC4.init_tot))}); }
    body.innerHTML=items.map(it=>'<div class="mthr-vrow '+it.kind+'"><span class="mthr-vlbl">'+esc(it.lbl)+'</span><span class="mthr-vval">'+esc(it.val)+'</span></div>').join('');
  }

  /* ============================================================
     TL DATA — paste (RAM), parse 36 cột, gom nhóm, đối chiếu SAP
  ============================================================ */
  function _anyDate(s){
    s=String(s||'').trim(); if(!s) return '';
    let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if(m) return m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
    /* dd-Mon-yy / dd/Mon/yyyy  (vd: 29-May-26) — định dạng Excel hay hiển thị */
    m=s.match(/^(\d{1,2})[-\/]([A-Za-z]{3,})[-\/](\d{2,4})/);
    if(m){ const mon={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12}[m[2].slice(0,3).toLowerCase()];
           if(mon){ const y=m[3].length===2?'20'+m[3]:m[3]; return y+'-'+String(mon).padStart(2,'0')+'-'+m[1].padStart(2,'0'); } }
    m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if(m){const y=m[3].length===2?'20'+m[3]:m[3]; return y+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');}
    m=s.match(/^(\d{1,2})[.\-](\d{1,2})[.\-](\d{4})/); if(m) return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
    return '';
  }
  /* TSV nhận biết ô có dấu " (chứa xuống dòng / tab) — giống parseTSV của sp.js */
  function _tsvRows(text){
    const rows=[]; let row=[],field='',inQ=false; const s=String(text||'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
    for(let i=0;i<s.length;i++){ const ch=s[i];
      if(inQ){ if(ch==='"'){ if(s[i+1]==='"'){field+='"';i++;} else inQ=false; } else field+=ch; }
      else{ if(ch==='"')inQ=true; else if(ch==='\t'){row.push(field);field='';} else if(ch==='\n'){row.push(field);rows.push(row);row=[];field='';} else field+=ch; } }
    if(field.length||row.length){row.push(field);rows.push(row);} return rows;
  }
  function _classifyTL(trade,lpg){
    const t=String(trade||'').toLowerCase(), l=String(lpg||'').toLowerCase();
    if(t.includes('pure')||l.includes('pure')) return 'PURE';
    if(t.includes('ship')) return 'VESSEL';
    if(t.includes('export')||/수출/.test(t)) return 'EXPORT';
    if(t.includes('domestic')||/내수/.test(t)) return 'DOMESTIC';
    return '';
  }
  function _tlSloc(tank){
    const s=String(tank||'').toUpperCase();
    if(s.includes('3501')) return '2100';
    if(s.includes('3502')) return '2101';
    if(s.includes('1100')||s.includes('CAVERN')) return '1100';
    return '';
  }
  /* Parser ROBUST: KHÔNG cần header, KHÔNG phụ thuộc thứ tự cột.
     Nhận diện cột theo nội dung (date / trade / tank / lpg-type) bằng tần suất;
     Net/C3/C4 lấy theo offset cố định từ cột Tank (Tank,Lot,%C3,%C4,Net,C3,C4
     luôn liền nhau ở nguồn) → đúng cho cả layout gốc lẫn cột bị xoay. */
  const _TKRE=/\bTK[\s-]?(3501|3502|1100)\b|cavern/i;
  const _DATERE=/^\s*((\d{4}-\d{1,2}-\d{1,2})|(\d{1,2}[-\/][A-Za-z]{3,}[-\/]\d{2,4})|(\d{1,2}\/\d{1,2}\/\d{2,4}))/;
  const _TRADERE=/^\s*(domestic|export)\b/i;
  const _LPGRE=/lpg\s*\(|pure\s*(propane|butane)/i;
  function parseTL(text){
    const rows=_tsvRows(text); if(!rows.length) return [];
    const maxc=rows.reduce((m,r)=>Math.max(m,r.length),0);
    function bestCol(test){ let best=-1,bestN=0; for(let c=0;c<maxc;c++){ let n=0; for(let i=0;i<rows.length;i++){ if(test(String(rows[i][c]||''))) n++; } if(n>bestN){bestN=n;best=c;} } return bestN>0?best:-1; }
    const tankIdx=bestCol(s=>_TKRE.test(s)); if(tankIdx<0) return [];
    const dateIdx=bestCol(s=>_DATERE.test(s)); if(dateIdx<0) return [];
    const tradeIdx=bestCol(s=>_TRADERE.test(s));
    const lpgIdx=bestCol(s=>_LPGRE.test(s));
    const netIdx=tankIdx+4, c3Idx=tankIdx+5, c4Idx=tankIdx+6;
    const out=[];
    rows.forEach(r=>{
      const iso=_anyDate(r[dateIdx]); if(!iso) return;                 // chỉ giữ dòng có ngày hợp lệ
      const bucket=_classifyTL(tradeIdx>=0?r[tradeIdx]:'', lpgIdx>=0?r[lpgIdx]:''); if(!bucket) return;
      const sloc=_tlSloc(r[tankIdx]||'');                              // tank có thể trống (vd: lên tàu)
      let c3=num(r[c3Idx]), c4=num(r[c4Idx]); const net=num(r[netIdx]);
      if(bucket==='PURE'&&c3===0&&c4===0&&net>0){ const lt=String(r[lpgIdx]||''); if(/propane/i.test(lt))c3=net; else if(/butane/i.test(lt))c4=net; }
      out.push({ month:iso.slice(0,7), date:iso, sloc, bucket, c3, c4, net });
    });
    return out;
  }
  function openTLPaste(){ const m=document.getElementById('mthrTLModal'); if(m){ m.classList.add('on'); const a=document.getElementById('mthrTLArea'); if(a){a.value='';setTimeout(()=>a.focus(),50);} } }
  function closeTLPaste(){ const m=document.getElementById('mthrTLModal'); if(m) m.classList.remove('on'); }
  function submitTLPaste(){
    const a=document.getElementById('mthrTLArea'); if(!a){ return; }
    const rows=parseTL(a.value);
    if(!rows.length){ toast('❌ Không parse được dòng TL nào (cần cột Date/Trade Type/Tank/C3/C4)','er'); return; }
    TL_ROWS=rows;
    const months=Array.from(new Set(rows.map(r=>r.month))).sort();
    TL_INFO={ n:rows.length, months, pastedAt:Date.now() };
    closeTLPaste();
    toast('✅ TL: '+rows.length+' dòng · '+months.length+' tháng ('+months.join(', ')+') — RAM, mất khi tắt','ok');
    renderTable();
  }
  function clearTL(){ TL_ROWS=[]; TL_INFO=null; toast('🧹 Đã xoá TL data (RAM)',''); renderTable(); }

  function tlAgg(month){
    const z=()=>({c3:0,c4:0});
    const A={ dom:{'2100':z(),'2101':z(),'':z(),tot:z()}, exp:{'2100':z(),'2101':z(),'':z(),tot:z()}, vessel:z(), pure:z(), n:0 };
    TL_ROWS.forEach(r=>{
      if(r.month!==month) return; A.n++;
      const add=(o)=>{o.c3+=r.c3;o.c4+=r.c4;};
      if(r.bucket==='DOMESTIC'){ if(A.dom[r.sloc])add(A.dom[r.sloc]); add(A.dom.tot); }
      else if(r.bucket==='EXPORT'){ if(A.exp[r.sloc])add(A.exp[r.sloc]); add(A.exp.tot); }
      else if(r.bucket==='VESSEL') add(A.vessel);
      else if(r.bucket==='PURE') add(A.pure);
    });
    return A;
  }
  function fillPureFromTL(){
    if(!MONTH){ toast('⚠ Chưa chọn tháng','warn'); return; }
    if(!TL_ROWS.length){ toast('⚠ Chưa có TL data — bấm 📋 Paste TL','warn'); return; }
    const A=tlAgg(MONTH);
    INPUTS.pure_C3=+(A.pure.c3/1000).toFixed(3); INPUTS.pure_C4=+(A.pure.c4/1000).toFixed(3);
    STORE[MONTH]=_snapshot(); _dirty=true; syncInputEls();
    ['mthr-pure-c3','mthr-pure-c4'].forEach(id=>{const e=document.getElementById(id);if(e)e.classList.add('mthr-auto');});
    renderTable(); toast('⚡ Pure C3/C4 lấy từ TL data','ok');
  }

  /* ── SAP coverage: đủ ngày trong tháng hay thiếu bao nhiêu ── */
  function sapCoverage(){
    if(!MONTH) return null;
    const p=MONTH.split('-'), y=+p[0], mo=+p[1];
    const dim=new Date(y,mo,0).getDate();
    const have=new Set(filterMonth(sapRows(),MONTH).map(r=>r.date));
    const missing=[];
    for(let d=1;d<=dim;d++){ const ds=MONTH+'-'+String(d).padStart(2,'0'); if(!have.has(ds)) missing.push(d); }
    return { dim, days:dim-missing.length, missing };
  }
  function renderCoverage(){
    const box=document.getElementById('mthr-coverage'); if(!box) return;
    const c=sapCoverage();
    if(!c){ box.style.display='none'; return; }
    box.style.display='';
    const full=c.missing.length===0, none=c.days===0;
    box.className='mthr-cov '+(none?'er':full?'ok':(c.missing.length<=Math.ceil(c.dim/3)?'warn':'er'));
    let h='<span class="ic">📅</span><span class="t">SAP tháng '+esc(MONTH)+': <b>'+c.days+'/'+c.dim+'</b> ngày có dữ liệu</span>';
    if(none) h+='<span class="badge">✗ chưa có SAP cho tháng này</span>';
    else if(full) h+='<span class="badge">✓ ĐỦ cả tháng</span>';
    else h+='<span class="badge">⚠ thiếu '+c.missing.length+' ngày</span><span class="miss">Ngày thiếu: '+c.missing.join(', ')+'</span>';
    box.innerHTML=h;
  }

  function renderCompare(){
    const box=document.getElementById('mthr-compare'); if(!box) return;
    if(!TL_ROWS.length){ box.style.display='none'; box.innerHTML=''; return; }
    box.style.display='';
    const rows=filterMonth(sapRows(),MONTH);
    const A=tlAgg(MONTH);
    const sapGI=(sloc,b)=>-sum(rows,r=>r.sloc===sloc&&bat(r)===b,'gi');                    // C3+C4, kg
    const sapGImat=(sloc,b,mat)=>-sum(rows,r=>r.sloc===sloc&&bat(r)===b&&r.mat===mat,'gi'); // 1 mat
    const tol=(s)=>Math.max(500, Math.abs(s)*0.01);
    function row(label, tlKg, repKg){ const d=tlKg-repKg, ok=Math.abs(d)<=tol(repKg); return {label, tl:tlKg, rep:repKg, diff:d, kind:ok?'ok':'warn'}; }
    function sec(label){ return {section:label}; }

    /* Cavern 1100: GI batch D gộp Pure + Vessel → Vessel = GI − Pure(khai báo) */
    const lumpC3=sapGImat('1100','D',MAT_C3), lumpC4=sapGImat('1100','D',MAT_C4);
    const pureC3=(INPUTS.pure_C3||0)*1000,    pureC4=(INPUTS.pure_C4||0)*1000;
    const vesDerivC3=lumpC3-pureC3,           vesDerivC4=lumpC4-pureC4;

    const items=[
      sec('Tank lorry — SAP tự tính từ GI (không cần nhập)'),
      row('Domestic · TK-3501 (batch D)', A.dom['2100'].c3+A.dom['2100'].c4, sapGI('2100','D')),
      row('Domestic · TK-3502 (batch D)', A.dom['2101'].c3+A.dom['2101'].c4, sapGI('2101','D')),
      row('Export · TK-3501 (batch E)',   A.exp['2100'].c3+A.exp['2100'].c4, sapGI('2100','E')),
      row('Export · TK-3502 (batch E)',   A.exp['2101'].c3+A.exp['2101'].c4, sapGI('2101','E')),
      sec('Cavern 1100 (batch D) — Pure + Vessel gộp chung, tách bằng khai báo Pure'),
      row('Pure C3 — TL vs khai báo',     A.pure.c3, pureC3),
      row('Pure C4 — TL vs khai báo',     A.pure.c4, pureC4),
      row('Vessel C3 — TL vs (GI−Pure)',  A.vessel.c3, vesDerivC3),
      row('Vessel C4 — TL vs (GI−Pure)',  A.vessel.c4, vesDerivC4)
    ];
    const monthsTxt=TL_INFO?TL_INFO.months.join(', '):'';
    const hasMonth=TL_INFO&&TL_INFO.months.includes(MONTH);
    let h='<div class="mthr-cmp-hdr"><span>📊 SAP ⇄ TL DATA — đối chiếu tháng '+esc(MONTH)+'</span>'+
      '<span class="mthr-cmp-meta">TL: '+(TL_INFO?TL_INFO.n:0)+' dòng · tháng có data: '+esc(monthsTxt)+'</span></div>';
    if(!hasMonth) h+='<div class="mthr-cmp-warn">⚠ TL data đã dán không chứa tháng '+esc(MONTH)+'. Dán TL đúng tháng để đối chiếu.</div>';
    h+='<table class="mthr-cmp-tbl"><thead><tr><th>Khoản mục</th><th>TL (TẤN)</th><th>Báo cáo (TẤN)</th><th>Δ (TẤN)</th><th>Kết quả</th></tr></thead><tbody>';
    items.forEach(it=>{
      if(it.section){ h+='<tr class="cmp-sec"><td colspan="5">'+esc(it.section)+'</td></tr>'; return; }
      const d=(it.diff>0?'+':'')+ton(it.diff), res=it.kind==='ok'?'✓ khớp':'⚠ lệch';
      h+='<tr class="cmp-'+it.kind+'"><td class="lbl">'+esc(it.label)+'</td><td>'+ton(it.tl)+'</td><td>'+ton(it.rep)+'</td><td class="d">'+d+'</td><td class="res">'+res+'</td></tr>';
    });
    h+='</tbody></table>'+
      '<div class="mthr-cmp-note">Quy ước (remark file gốc): 도매사 = TL <b>Domestic</b> = SAP-GI batch <b>*D*</b>; 수출 = TL <b>Export</b> = SAP-GI batch <b>*E*</b> (mỗi bồn, tự tính). '+
      'Cavern 1100: Pure &amp; Vessel xuất chung 1 ngày bị gộp vào GI batch D — khai <b>Pure C3/C4</b> (hoặc ⚡ Pure←TL) thì <b>Vessel = GI − Pure</b>. Cột "Báo cáo" = giá trị phần mềm đang dùng (SAP-GI / khai báo / GI−Pure).</div>';
    box.innerHTML=h;
  }

  /* ============================================================
     SAP ZMMFR022 — PASTE vào RAM (KHÔNG local, KHÔNG Firebase)
     Port logic parse từ data/sp.js — giữ schema y hệt SP.ROWS:
       {date,sloc,mat(C3/C4),batch(P/X/D/E),init,gr,gi,trs,end}
  ============================================================ */
  const SAP_MAT_MAP = {'20008511':'C3','20008512':'C4'};
  const SAP_ALLOWED_SLOC = {'1100':1,'2100':1,'2101':1,'B100':1};
  function sapNum(v){
    let s=String(v||0).trim().replace(/,/g,'');
    if(s.length>1&&s[s.length-1]==='-') s='-'+s.slice(0,-1);
    s=s.replace(/−/g,'-');
    return parseFloat(s)||0;
  }
  function sapParseDate(v){
    const s=String(v||'').trim();
    if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
    if(/^\d{8}$/.test(s)) return s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8);
    if(/^\d{2}[.\/-]\d{2}[.\/-]\d{4}$/.test(s)){ const p=s.split(/[.\/-]/); return p[2]+'-'+p[1]+'-'+p[0]; }
    if(/^\d{2}[.\/-]\d{2}[.\/-]\d{2}$/.test(s)){ const p=s.split(/[.\/-]/); return '20'+p[2]+'-'+p[1]+'-'+p[0]; }
    if(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)){ const p=s.split('/'); const yr=p[2].length===2?'20'+p[2]:p[2]; return yr+'-'+p[0].padStart(2,'0')+'-'+p[1].padStart(2,'0'); }
    return '';
  }
  function sapBatch(b){
    b=String(b||'').trim().toUpperCase();
    if(b.length>=7&&'DEPX'.includes(b[6])) return b[6];
    if(b.length===1&&'DEPX'.includes(b)) return b;
    const last=b[b.length-1]; if(last&&'DEPX'.includes(last)) return last;
    return '';
  }
  /* parse sheet ZMMFR022 (cùng vị trí cột với sp.js): mat col2, sloc col4, date col6,
     batch col7, init col8, gr col11, gi col13, trs col15, end col17. */
  function parseSapSheet(tsvRows){
    const agg={}; let rawCount=0, skippedSloc=0;
    tsvRows.forEach(cols=>{
      if(cols.length<10) return;
      const c0=String(cols[0]||'').trim().toLowerCase();
      if(c0==='pu'||c0.includes('plant')||c0.includes('material')) return;
      const mat=SAP_MAT_MAP[String(cols[2]||'').trim()]; if(!mat) return;
      const sloc=String(cols[4]||'').trim(); if(!SAP_ALLOWED_SLOC[sloc]){skippedSloc++;return;}
      const date=sapParseDate(cols[6]); if(!date||date.length<10) return;
      const bType=sapBatch(cols[7]); if(!bType) return;
      rawCount++;
      const k=date+'|'+sloc+'|'+mat+'|'+bType;
      if(!agg[k]) agg[k]={date,sloc,mat,batch:bType,init:0,gr:0,gi:0,trs:0,end:0};
      agg[k].init+=sapNum(cols[8]); agg[k].gr+=sapNum(cols[11]); agg[k].gi+=sapNum(cols[13]);
      agg[k].trs+=sapNum(cols[15]); agg[k].end+=sapNum(cols[17]);
    });
    const rows=Object.values(agg);
    rows.forEach(r=>{r.init=Math.round(r.init);r.gr=Math.round(r.gr);r.gi=Math.round(r.gi);r.trs=Math.round(r.trs);r.end=Math.round(r.end);});
    return { rows, rawCount, skippedSloc };
  }
  function openSapPaste(){ const m=document.getElementById('mthrSapModal'); if(m){ m.classList.add('on'); const a=document.getElementById('mthrSapArea'); if(a){a.value='';setTimeout(()=>a.focus(),50);} } }
  function closeSapPaste(){ const m=document.getElementById('mthrSapModal'); if(m) m.classList.remove('on'); }
  function submitSapPaste(){
    const a=document.getElementById('mthrSapArea'); if(!a) return;
    if(!a.value.trim()){ toast('❌ Chưa có gì để dán','er'); return; }
    const parsed=parseSapSheet(_tsvRows(a.value));
    if(!parsed.rows.length){ toast('❌ Không thấy dữ liệu SAP hợp lệ (SLoc 1100/2100/2101/B100, Mat C3/C4)','er'); return; }
    /* RAM-only: thay toàn bộ SAP_RAM bằng lần paste mới (clean cross-check) */
    Object.keys(SAP_RAM).forEach(k=>delete SAP_RAM[k]);
    parsed.rows.forEach(r=>{ SAP_RAM[r.date+'|'+r.sloc+'|'+r.mat+'|'+r.batch]=r; });
    const months=Array.from(new Set(parsed.rows.map(r=>r.date.slice(0,7)))).sort();
    SAP_INFO={ n:parsed.rows.length, months, pastedAt:Date.now() };
    closeSapPaste();
    toast('✅ SAP RAM: '+parsed.rows.length+' dòng · '+months.length+' tháng ('+months.join(', ')+') — RAM, mất khi tắt','ok');
    if(months.length && !months.includes(MONTH)){ MONTH=months[months.length-1]; const mEl=document.getElementById('mthr-month'); if(mEl) mEl.value=MONTH; loadInputs(); }
    autoFillXFromWms(); renderTable();
  }
  function clearSap(){
    Object.keys(SAP_RAM).forEach(k=>delete SAP_RAM[k]); SAP_INFO=null;
    toast('🧹 Đã xoá SAP RAM — quay lại dùng tab SAP (SP.ROWS)','');
    renderTable();
  }

  /* ============================================================
     WMS-SAP batch X (OL1 EX-PETCHEM) — PASTE C3사용량 vào RAM
     Nguồn = sheet "일자별 C3사용량". Cột X = J (관세유예…실적) ưu tiên,
     fallback H (관세유예…계획/추정). MT → kg. Map theo HEADER tiếng Hàn
     (miễn nhiễm với cột ẩn). Năm lấy theo tháng báo cáo đang chọn.
     X_RAM[date]=kg → ô input X tự điền từ đây (KHÔNG đọc CAV).
  ============================================================ */
  function _xnum(v){ return parseFloat(String(v==null?'':v).replace(/,/g,'').trim()); }
  function parseXText(text, yr){
    const rows=_tsvRows(text);
    let jCol=-1,hCol=-1,moCol=-1,dayCol=-1;
    for(let r=0;r<rows.length;r++){
      const c=rows[r]||[];
      for(let k=0;k<c.length;k++){
        const t=String(c[k]||'').replace(/\s+/g,' ').trim(); if(!t) continue;
        if(t.indexOf('관세유예')>-1){
          if(t.indexOf('실적')>-1){ if(jCol<0)jCol=k; }
          else if(t.indexOf('계획')>-1||t.indexOf('추정')>-1){ if(hCol<0)hCol=k; }
        }
        if(t==='월'&&moCol<0) moCol=k;
        if((t==='일자'||t==='일')&&dayCol<0) dayCol=k;
      }
      if(jCol>-1&&hCol>-1&&moCol>-1&&dayCol>-1) break;
    }
    if(jCol<0&&hCol<0) return { error:'NO_HEADER' };
    const out=[];
    let totalMt=null;   // giá trị dòng "Total/합계" cột J (MT, full-precision 3 số lẻ)
    const _isTotalLabel=s=>/(^|\b)(total|grand\s*total|sum|합계|총계|소계|계)\b/i.test(String(s||'').trim());
    rows.forEach(c=>{
      if(!c) return;
      let mo, day;
      if(moCol>-1&&dayCol>-1){ mo=_xnum(c[moCol]); day=_xnum(c[dayCol]); }
      if(!(Number.isInteger(mo)&&mo>=1&&mo<=12&&Number.isInteger(day)&&day>=1&&day<=31)){
        mo=undefined; day=undefined;
        for(let i=1;i<c.length;i++){
          const m2=_xnum(c[i-1]), d2=_xnum(c[i]);
          if(Number.isInteger(m2)&&m2>=1&&m2<=12&&Number.isInteger(d2)&&d2>=1&&d2<=31){ mo=m2; day=d2; break; }
        }
        if(mo===undefined){
          /* Không có ngày hợp lệ → có thể là dòng TỔNG (Total/합계).
             Dòng Total cột J hiển thị 3 số lẻ (full-precision) = tổng đúng,
             dùng để tránh sai số cộng dồn từ các ô ngày làm tròn 2 số lẻ. */
          const jv=(jCol>-1)?_xnum(c[jCol]):NaN;
          if(isFinite(jv) && Math.abs(jv)>0 && c.some(_isTotalLabel)) totalMt=jv;
          return;
        }
      }
      const J=(jCol>-1)?_xnum(c[jCol]):NaN, H=(hCol>-1)?_xnum(c[hCol]):NaN;
      let val=null, src='';
      if(!isNaN(J)){ val=J; src='actual(J)'; }
      else if(!isNaN(H)){ val=H; src='plan(H)'; }
      if(val==null) return;
      const date=yr+'-'+String(mo).padStart(2,'0')+'-'+String(day).padStart(2,'0');
      out.push({ date, kg:Math.round(val*1000*1000)/1000, src });  /* MT → kg */
    });
    const totalKg = (totalMt!=null) ? Math.round(totalMt*1000*1000)/1000 : null;
    return { list:out, totalKg };
  }
  function openXPaste(){ const m=document.getElementById('mthrXModal'); if(m){ m.classList.add('on'); const a=document.getElementById('mthrXArea'); if(a){a.value='';setTimeout(()=>a.focus(),50);} } }
  function closeXPaste(){ const m=document.getElementById('mthrXModal'); if(m) m.classList.remove('on'); }
  function submitXPaste(){
    const a=document.getElementById('mthrXArea'); if(!a) return;
    if(!a.value.trim()){ toast('❌ Chưa có gì để dán','er'); return; }
    const yr=(MONTH&&MONTH.length>=4)?MONTH.slice(0,4):String(new Date().getFullYear());
    const res=parseXText(a.value, yr);
    if(res&&res.error==='NO_HEADER'){ toast('❌ Không thấy cột "관세유예 C3사용량" — copy KÈM dòng tiêu đề (cột H và J)','er'); return; }
    const list=(res&&res.list)||[];
    if(!list.length){ toast('❌ Không thấy dòng X hợp lệ (cần cột 월, 일자, H/J)','er'); return; }
    Object.keys(X_RAM).forEach(k=>delete X_RAM[k]);
    Object.keys(X_TOTAL).forEach(k=>delete X_TOTAL[k]);
    list.forEach(e=>{ X_RAM[e.date]=(X_RAM[e.date]||0)+(+e.kg||0); });
    const months=Array.from(new Set(list.map(e=>e.date.slice(0,7)))).sort();
    /* Dòng Total/합계 (full-precision) → gán cho tháng DUY NHẤT có trong paste.
       Tránh sai số cộng dồn do các ô ngày bị làm tròn khi copy từ Excel. */
    let totalNote='';
    if(res.totalKg!=null && months.length===1){
      X_TOTAL[months[0]]=res.totalKg;
      const daySum=Object.keys(X_RAM).filter(d=>d.startsWith(months[0]+'-')).reduce((s,d)=>s+X_RAM[d],0);
      const dlt=Math.abs(res.totalKg-daySum)/1000;
      totalNote=' · dùng Total='+ (res.totalKg/1000).toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:3})+' TON'+(dlt>0.0005?(' (Σngày lệch '+dlt.toFixed(3)+')'):'');
    }
    X_INFO={ n:list.length, months, pastedAt:Date.now(), total:(res.totalKg!=null?res.totalKg:null) };
    closeXPaste();
    toast('✅ WMS-SAP X: '+list.length+' ngày · '+months.join(', ')+totalNote+' — RAM, mất khi tắt','ok');
    autoFillXFromWms(true); renderTable();
  }
  function clearX(){
    Object.keys(X_RAM).forEach(k=>delete X_RAM[k]);
    Object.keys(X_TOTAL).forEach(k=>delete X_TOTAL[k]); X_INFO=null;
    toast('🧹 Đã xoá WMS-SAP X (RAM)','');
    renderTable();
  }
  /* kg cho tháng: ưu tiên Total row (full-precision), nếu không có thì cộng các ngày. */
  function xSumForMonth(ym){
    if(!ym) return 0;
    if(X_TOTAL[ym]!=null) return X_TOTAL[ym];
    const prefix=ym+'-'; let s=0;
    Object.keys(X_RAM).forEach(d=>{ if(d.startsWith(prefix)) s+=(+X_RAM[d]||0); });
    return s; // kg
  }
  function xHasMonth(ym){ if(!ym) return false; if(X_TOTAL[ym]!=null) return true; const p=ym+'-'; return Object.keys(X_RAM).some(d=>d.startsWith(p)); }
  /* Tự điền ô X (TON) từ WMS-SAP RAM cho tháng đang chọn.
     force=true: luôn ghi đè. force=false: chỉ điền khi X đang trống (=0). */
  function autoFillXFromWms(force){
    if(!MONTH || !xHasMonth(MONTH)) return false;
    if(!force && Math.abs(INPUTS.gi_X_C3||0)>0.0005) return false;
    const ton=xSumForMonth(MONTH)/1000;
    INPUTS.gi_X_C3=+ton.toFixed(3);
    STORE[MONTH]=_snapshot(); syncInputEls();
    const e=document.getElementById('mthr-gi-x'); if(e) e.classList.add('mthr-auto');
    return true;
  }
  function fillXFromWms(){
    if(!MONTH){ toast('⚠ Chưa chọn tháng','warn'); return; }
    if(!xHasMonth(MONTH)){ toast('⚠ WMS-SAP X chưa có dữ liệu tháng '+MONTH+' — bấm 📋 Paste WMS-X','warn'); return; }
    autoFillXFromWms(true); renderTable();
    toast('⚡ OL1 GI batch X lấy từ WMS-SAP (RAM)','ok');
  }

  /* ============================================================ Export Excel (월별LPG) ============================================================ */
  async function exportXlsx(){
    if(!MONTH){ toast('⚠ Chưa chọn tháng','warn'); return; }
    const monthRows=filterMonth(sapRows(),MONTH);
    if(!monthRows.length){ toast('⚠ Không có data SAP cho tháng '+MONTH,'warn'); return; }
    if(typeof XLSX==='undefined'){
      toast('⏳ Đang tải SheetJS...','');
      try{ await new Promise((res,rej)=>{const s=document.createElement('script'); s.src='https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js'; s.onload=res; s.onerror=rej; document.head.appendChild(s);}); }
      catch(e){ toast('❌ Không tải được SheetJS','er'); return; }
    }
    if(typeof XLSX==='undefined') return;
    const allRows=computeAllRows(monthRows,INPUTS), ymLbl=MONTH.slice(2).replace('-','.')+'월';
    const aoa=[];
    aoa.push(['',ymLbl,'','','','','','','','','','','','','','','','','']);
    aoa.push(['','','기초재고(SAP:장부)','','','입고량','사용량','','','','','','','','','','기말재고(SAP:장부)','','']);
    aoa.push(['','','합계','Cavern\n(+ETC)','Mixed LPG\nTK-3501/3502','','합계','OL-1이체','C3 히터사용','SAP오류\n조정','캐번재입고','Loss','Mix조제이송','내수판매\n(도매사)','내수판매\n(산업체)','수출','합계','Cavern','Mixed LPG\nTK-3501/3502']);
    const t=v=>(v===undefined||v===null)?'':(v/1000);
    allRows.forEach(r=>aoa.push([r.a||'',r.b||'',t(r.init_tot),t(r.init_cav),t(r.init_tk),t(r.gr),t(r.gitot),t(r.ol1),t(r.heater),t(r.sap_err),t(r.cav_re),t(r.loss),t(r.mix),t(r.dom),t(r.ind),t(r.exp),t(r.end_tot),t(r.end_cav),t(r.end_tk)]));
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges']=[{s:{r:1,c:2},e:{r:1,c:4}},{s:{r:1,c:5},e:{r:2,c:5}},{s:{r:1,c:6},e:{r:1,c:15}},{s:{r:1,c:16},e:{r:1,c:18}}];
    ws['!cols']=[{wch:10},{wch:14},{wch:11},{wch:11},{wch:13},{wch:11},{wch:11},{wch:11},{wch:10},{wch:9},{wch:11},{wch:8},{wch:11},{wch:11},{wch:11},{wch:11},{wch:11},{wch:11},{wch:13}];
    const numFmt='#,##0.000;[Red]-#,##0.000;-';
    for(let r=3;r<aoa.length;r++){ for(let c=2;c<19;c++){ const ref=XLSX.utils.encode_cell({r:r,c:c}); if(ws[ref]&&typeof ws[ref].v==='number') ws[ref].z=numFmt; } }
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'월별LPG');
    XLSX.writeFile(wb,'monthly_lpg_'+MONTH+'.xlsx'); toast('✅ Đã xuất monthly_lpg_'+MONTH+'.xlsx','ok');
  }

  return {
    init, onTabEnter, onMonthChange, onInputChange,
    toggleInputs, saveInputs, fillFromSap, recalc, toggleVerify, exportXlsx, render:renderTable,
    openTLPaste, closeTLPaste, submitTLPaste, clearTL, fillPureFromTL,
    openSapPaste, closeSapPaste, submitSapPaste, clearSap,
    openXPaste, closeXPaste, submitXPaste, clearX, fillXFromWms
  };
})();
window.MTHR = MTHR;
