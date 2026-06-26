/* ============================================================
 * PLOG  —  plog.js   (Pure Product Log)
 * ------------------------------------------------------------
 * NGUỒN tham khảo: lpg-station-v406.html  (module PURE LOG, plInit…plDelRow)
 * Global xuất ra  : window.PLOG
 * Khởi tạo (boot) : PLOG.init()
 * Phụ thuộc       : firebase, toast
 * ------------------------------------------------------------
 * MÔ TẢ: Nhật ký sản phẩm Pure C3 / C4 (TANK LORRY).
 *   Firebase path : pure_log   (MẢNG các hàng 27 cột — GIỮ NGUYÊN
 *   định dạng V406 để tương thích dữ liệu với phần mềm đang chạy).
 *   Cột: [0]No [1]Lot [2]Tank [3]Date [4]Start [5]Finish [6]Qty(ton)
 *        [7]%VolC3 [8]%VolC4 [9]MixQty [10]%VolC3st [11]%VolC4st
 *        [12]C3Wt [13]C4Wt [14]LPGWt
 *        [15]Methane [16]Ethane [17]Propane [18]iC4 [19]nC4
 *        [20]1.3BD [21]C5+ [22]Olefins [23]RatioC3 [24]RatioC4
 *        [25]Remark [26]Odorant
 * ============================================================ */

const PLOG = (function(){
  'use strict';
  const FB_PATH = 'pure_log';

  let PL_DATA = [];
  let _fbRef = null;
  let _attached = false;
  let _editIdx = -1;          // -1 = add new, >=0 = edit existing

  const COLS = [
    {i:0,  h:'No',         w:30,  num:true},
    {i:1,  h:'Lot',        w:150},
    {i:2,  h:'Tank',       w:80},
    {i:3,  h:'Date',       w:70,  date:true},
    {i:4,  h:'Start',      w:48,  time:true},
    {i:5,  h:'Finish',     w:48,  time:true},
    {i:6,  h:'Qty(ton)',   w:65,  num:true, dec:2},
    {i:7,  h:'%Vol C3',    w:58,  num:true, dec:2},
    {i:8,  h:'%Vol C4',    w:58,  num:true, dec:2},
    {i:9,  h:'Mix Qty',    w:65,  num:true, dec:2},
    {i:10, h:'%Vol C3 ST', w:65,  num:true, dec:2},
    {i:11, h:'%Vol C4 ST', w:65,  num:true, dec:2},
    {i:12, h:'C3 Wt',      w:60,  num:true, dec:2},
    {i:13, h:'C4 Wt',      w:60,  num:true, dec:2},
    {i:14, h:'LPG Wt',     w:60,  num:true, dec:2},
    {i:15, h:'Methane',    w:55,  num:true, dec:2},
    {i:16, h:'Ethane',     w:55,  num:true, dec:2},
    {i:17, h:'Propane',    w:55,  num:true, dec:2},
    {i:18, h:'iC4',        w:55,  num:true, dec:2},
    {i:19, h:'nC4',        w:55,  num:true, dec:2},
    {i:20, h:'1.3BD',      w:50,  num:true, dec:2},
    {i:21, h:'C5+',        w:45,  num:true, dec:2},
    {i:22, h:'Olefins',    w:55,  num:true, dec:2},
    {i:23, h:'Ratio C3',   w:58,  num:true, dec:2},
    {i:24, h:'Ratio C4',   w:58,  num:true, dec:2},
    {i:25, h:'Remark',     w:100},
    {i:26, h:'Odorant',    w:55,  num:true, dec:1}
  ];

  /* form-field id  ->  column index (row layout) */
  const FORM_MAP = {
    'plog-f-lot':1, 'plog-f-tank':2, 'plog-f-date':3, 'plog-f-start':4, 'plog-f-finish':5,
    'plog-f-qty':6, 'plog-f-vc3':7, 'plog-f-vc4':8, 'plog-f-mqty':9, 'plog-f-svc3':10,
    'plog-f-svc4':11, 'plog-f-c3wt':12, 'plog-f-c4wt':13, 'plog-f-lpgwt':14,
    'plog-f-meth':15, 'plog-f-eth':16, 'plog-f-prop':17, 'plog-f-ic4':18, 'plog-f-nc4':19,
    'plog-f-bd':20, 'plog-f-c5':21, 'plog-f-ole':22, 'plog-f-rc3':23, 'plog-f-rc4':24,
    'plog-f-remark':25, 'plog-f-odo':26
  };

  /* ---------- helpers ---------- */
  function _esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
  function _g(id){ const el=document.getElementById(id); return el ? String(el.value||'').trim() : ''; }
  function _set(id,v){ const el=document.getElementById(id); if(el) el.value=(v==null?'':v); }
  function _toast(m,t){ try{ if(typeof toast==='function') toast(m,t); }catch(_){} }

  function _fD(v){
    const s=String(v||'').trim(); if(!s) return '';
    let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return m[3]+'/'+m[2]+'/'+m[1].slice(2);
    const m2=s.match(/^(\d{1,2})[\/\-](\w+)[\/\-](\d{2,4})$/);
    if(m2){ const yr=m2[3].length===4?m2[3].slice(2):m2[3]; return m2[1].padStart(2,'0')+'/'+m2[2]+'/'+yr; }
    return s;
  }
  function _fN(v,d){
    const n=parseFloat(String(v||'').replace(/,/g,''));
    if(isNaN(n)) return String(v||'');
    return n.toLocaleString('en-US',{minimumFractionDigits:d||0,maximumFractionDigits:d||4});
  }
  function _fT(v){
    const s=String(v||'').trim(); if(!s) return '';
    const m=s.match(/(\d{1,2}):(\d{2})/); return m?m[1].padStart(2,'0')+':'+m[2]:s;
  }
  /* detect C3 / C4 from lot, e.g. LPG-2026-TL-C4-01 -> C4 */
  function _type(r){
    const lot=String(r[1]||'').toUpperCase();
    if(lot.includes('-C3-')) return 'C3';
    if(lot.includes('-C4-')) return 'C4';
    return '';
  }
  function _sort(){
    PL_DATA.sort((a,b)=>{
      const la=parseInt(String(a[1]||'').replace(/[^0-9]/g,''))||0;
      const lb=parseInt(String(b[1]||'').replace(/[^0-9]/g,''))||0;
      return lb-la;  // newest first
    });
  }

  /* ---------- Firebase (array storage, V406-compatible) ---------- */
  function _attach(){
    if(_attached) return;
    if(typeof firebase==='undefined' || !firebase.database){ console.warn('[PLOG] firebase not loaded'); return; }
    _fbRef = firebase.database().ref(FB_PATH);
    _fbRef.on('value', snap=>{
      const val = snap.val();
      PL_DATA = val ? (Array.isArray(val) ? val.filter(Boolean) : Object.values(val)) : [];
      render();
    }, e=>console.warn('[PLOG] value', e));
    _attached = true;
    console.log('[PLOG] ✅ Init OK · listening to /'+FB_PATH);
  }
  function _save(){
    _sort();
    if(_fbRef) _fbRef.set(PL_DATA).catch(e=>console.warn('[PLOG] save', e));
    render();
  }

  /* ---------- render ---------- */
  function render(){
    const tbody=document.getElementById('plogTbody');
    const thead=document.getElementById('plogThead');
    const empty=document.getElementById('plogEmpty');
    const tbl=document.getElementById('plogTbl');
    const stats=document.getElementById('plog-stats');
    const badge=document.getElementById('engBadgePurelog');
    if(badge) badge.textContent = PL_DATA.length;
    if(!tbody) return;

    if(!PL_DATA.length){
      if(empty) empty.style.display='';
      if(tbl)   tbl.style.display='none';
      if(stats) stats.innerHTML='';
      return;
    }
    if(empty) empty.style.display='none';
    if(tbl)   tbl.style.display='';

    const qType=(_g('search-pure-type')||'').toUpperCase();
    const qLot =(_g('search-pure-lot')||'').toLowerCase();
    const qDate=(_g('search-pure-date')||'');

    const filtered = PL_DATA.filter(r=>{
      if(qType && _type(r)!==qType) return false;
      if(qLot && !String(r[1]||'').toLowerCase().includes(qLot)) return false;
      if(qDate && !String(r[3]||'').trim().includes(qDate)) return false;
      return true;
    });

    /* header */
    if(thead){
      let th='<tr><th style="width:28px;text-align:center">#</th>'
           + '<th style="width:36px;text-align:center">Type</th>';
      COLS.forEach(c=>{ th+='<th style="width:'+c.w+'px'+(c.num?';text-align:right':'')+'">'+c.h+'</th>'; });
      th+='</tr>';
      thead.innerHTML=th;
    }

    /* body */
    let html='';
    filtered.forEach((r,idx)=>{
      const tp=_type(r);
      const tpCls = tp==='C3' ? 'vslog-tk-1' : (tp==='C4' ? 'vslog-tk-2' : '');
      const realIdx=PL_DATA.indexOf(r);
      html+='<tr class="row-newlot" style="cursor:pointer" onclick="PLOG.openEdit('+realIdx+')">';
      html+='<td style="white-space:nowrap;color:var(--ink-3)" onclick="event.stopPropagation()">'+(idx+1)
          +' <span class="vslog-act-btn del" style="cursor:pointer" onclick="PLOG.delRow('+realIdx+')" title="Delete">✕</span></td>';
      html+='<td class="'+tpCls+'" style="text-align:center;font-weight:700">'+(tp||'—')+'</td>';
      COLS.forEach(c=>{
        let v=r[c.i]; if(v===undefined||v===null) v='';
        let disp;
        if(c.date)            disp=_fD(v);
        else if(c.time)       disp=_fT(v);
        else if(c.num&&v!=='')disp=_fN(v,c.dec||0);
        else                  disp=_esc(v);
        html+='<td style="'+(c.num?'text-align:right':'')+(c.i===1?';font-weight:700':'')+'">'+disp+'</td>';
      });
      html+='</tr>';
    });
    tbody.innerHTML=html;

    /* stats */
    const c3=PL_DATA.filter(r=>_type(r)==='C3').length;
    const c4=PL_DATA.filter(r=>_type(r)==='C4').length;
    if(stats) stats.innerHTML='<b style="color:var(--blue)">'+filtered.length+'</b> / '+PL_DATA.length
        +' · <span style="color:var(--blue);font-weight:600">C3: '+c3+'</span>'
        +' · <span style="color:var(--orange);font-weight:600">C4: '+c4+'</span>';
  }

  /* ---------- Add / Edit ---------- */
  /* Next lot for a Pure type (C3/C4 tracked separately): the highest existing
     lot number for that type +1, with the CURRENT year. Used both by the Add
     form and by the station-assign flow (scAssignToStation).
     e.g. existing LPG-2025-TL-C3-08 -> nextLot('C3') = LPG-2026-TL-C3-09 */
  function nextLot(type){
    const ty=String(type||'C4').toUpperCase();
    let maxN=0;
    PL_DATA.forEach(r=>{
      const lot=String(r[1]||'').toUpperCase();
      if(lot.includes('-'+ty+'-')){ const m=lot.match(/-(\d+)$/); if(m){ const nn=parseInt(m[1]); if(nn>maxN) maxN=nn; } }
    });
    const yr=new Date().getFullYear();
    return 'LPG-'+yr+'-TL-'+ty+'-'+String(maxN+1).padStart(2,'0');
  }
  function autoLot(){ _set('plog-f-lot', nextLot(_g('plog-f-type')||'C4')); }

  function openAdd(){
    _editIdx=-1;
    _set('plog-add-title','');
    const t=document.getElementById('plog-add-title'); if(t) t.textContent='🧪 ADD PURE LOG';
    _set('plog-f-type','C4');
    const ty=document.getElementById('plog-f-type'); if(ty) ty.disabled=false;
    _set('plog-f-tank','TANK LORRY');
    _set('plog-f-date', new Date().toISOString().slice(0,10));
    Object.keys(FORM_MAP).forEach(id=>{ if(id!=='plog-f-tank') _set(id,''); });
    _set('plog-f-tank','TANK LORRY');
    autoLot();
    _openModal('plog-add-modal');
  }

  function openEdit(idx){
    const r=PL_DATA[idx]; if(!r) return;
    _editIdx=idx;
    const t=document.getElementById('plog-add-title'); if(t) t.textContent='✏️ EDIT PURE LOG';
    const tp=_type(r);
    _set('plog-f-type', tp||'C4');
    const ty=document.getElementById('plog-f-type'); if(ty) ty.disabled=true;
    /* date -> input[type=date] needs YYYY-MM-DD */
    let d=String(r[3]||'').trim();
    const dm=d.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if(dm){ const yr=dm[3].length===2?'20'+dm[3]:dm[3]; d=yr+'-'+dm[2].padStart(2,'0')+'-'+dm[1].padStart(2,'0'); }
    _set('plog-f-date', /^\d{4}-\d{2}-\d{2}/.test(d)?d.slice(0,10):'');
    Object.entries(FORM_MAP).forEach(([id,ci])=>{ if(ci!==3) _set(id, r[ci]||''); });
    _openModal('plog-add-modal');
  }

  function saveForm(){
    const lot=_g('plog-f-lot'); if(!lot){ _toast('⚠ Nhập Lot','er'); return; }
    const row=new Array(27).fill('');
    row[3]=_g('plog-f-date');
    Object.entries(FORM_MAP).forEach(([id,ci])=>{ if(ci!==3) row[ci]=_g(id); });
    if(!row[2]) row[2]='TANK LORRY';
    if(_editIdx>=0){
      row[0]=PL_DATA[_editIdx][0]||String(_editIdx+1);
      PL_DATA[_editIdx]=row;
    } else {
      row[0]=String(PL_DATA.length+1);
      PL_DATA.push(row);
    }
    _save();
    _closeModal('plog-add-modal');
    _toast('✅ '+(_editIdx>=0?'Updated':'Added')+': '+lot,'ok');
    _editIdx=-1;
  }

  function delRow(idx){
    const r=PL_DATA[idx]; if(!r) return;
    if(!confirm('Delete '+String(r[1]||'(empty)')+'?')) return;
    PL_DATA.splice(idx,1);
    _save();
    _toast('🗑 Deleted','ok');
  }

  /* ---------- Paste import (from Pure C3 / C4 sheet) ---------- */
  function pasteData(text){
    const lines=String(text||'').split('\n').map(l=>l.replace(/\r/g,'')).filter(l=>l.trim()!=='');
    const newRows=[];
    lines.forEach(ln=>{
      const cols=ln.split('\t');
      if(cols.length<5) return;
      const c0=String(cols[0]||'').trim().toUpperCase();
      if(c0==='NO' || (c0==='' && String(cols[3]||'').trim().toLowerCase()==='date')) return; // header
      const row=new Array(27).fill('');
      for(let i=0;i<Math.min(cols.length,27);i++){
        let v=String(cols[i]||'').trim();
        if(i===3 && v){
          const dm=v.match(/^(\d{4})-(\d{2})-(\d{2})/);
          if(dm) v=dm[0];
          else{ const dm2=v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
                 if(dm2){ const yr=dm2[3].length===2?'20'+dm2[3]:dm2[3]; v=yr+'-'+dm2[2].padStart(2,'0')+'-'+dm2[1].padStart(2,'0'); } }
        }
        if((i===4||i===5) && v){ const tm=v.match(/(\d{1,2}):(\d{2})/); if(tm) v=tm[1].padStart(2,'0')+':'+tm[2]; }
        row[i]=v;
      }
      newRows.push(row);
    });
    if(!newRows.length){ _toast('⚠ Không có dữ liệu hợp lệ','er'); return; }

    /* merge: dedupe by lot name */
    const existing={};
    PL_DATA.forEach((r,idx)=>{ const k=String(r[1]||'').trim().toUpperCase(); if(k) existing[k]=idx; });
    let add=0,upd=0;
    newRows.forEach(r=>{
      const k=String(r[1]||'').trim().toUpperCase();
      if(k && existing[k]!==undefined){ PL_DATA[existing[k]]=r; upd++; }
      else{ PL_DATA.push(r); if(k) existing[k]=PL_DATA.length-1; add++; }
    });
    _save();
    const p=[]; if(upd)p.push(upd+' cập nhật'); if(add)p.push(add+' mới');
    _toast('✅ Pure Log: '+p.join(' · ')+' (tổng: '+PL_DATA.length+')','ok');
  }

  function doImport(){
    const ta=document.getElementById('plogImpArea');
    pasteData(ta ? ta.value : '');
    _closeModal('plog-imp-modal');
  }
  function openImport(){
    const ta=document.getElementById('plogImpArea'); if(ta) ta.value='';
    _openModal('plog-imp-modal');
    setTimeout(()=>{ if(ta) ta.focus(); },100);
  }

  /* ---------- Export ---------- */
  function exportXlsx(){
    if(!PL_DATA.length){ _toast('⚠ Pure Log trống','er'); return; }
    const hdr=['No','Lot','Tank','Date','Start','Finish','Qty(ton)',
      '%Vol C3','%Vol C4','LPG Mix Qty','%Vol C3 ST','%Vol C4 ST',
      'C3 Weight','C4 Weight','LPG Weight',
      'Methane','Ethane','Propane','iC4','nC4','1.3BD','C5+','Olefins',
      'Ratio C3','Ratio C4','Remark','Odorant'];
    if(typeof XLSX!=='undefined'){
      const aoa=[hdr];
      PL_DATA.forEach(r=>{ const row=[]; for(let i=0;i<27;i++) row.push(r[i]!=null?r[i]:''); aoa.push(row); });
      const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Pure Log');
      XLSX.writeFile(wb,'PureLog_'+new Date().toISOString().slice(0,10)+'.xlsx');
      _toast('📥 Exported Pure Log: '+PL_DATA.length+' dòng','ok');
      return;
    }
    /* fallback: CSV */
    const escCsv=v=>{ const s=String(v==null?'':v); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
    const lines=[hdr.map(escCsv).join(',')];
    PL_DATA.forEach(r=>{ const row=[]; for(let i=0;i<27;i++) row.push(r[i]!=null?r[i]:''); lines.push(row.map(escCsv).join(',')); });
    const blob=new Blob(['﻿'+lines.join('\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url; a.download='pure_log_'+new Date().toISOString().slice(0,10)+'.csv';
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); },100);
    _toast('⬇ Exported '+PL_DATA.length+' dòng (CSV)','ok');
  }

  /* ---------- modal helpers ---------- */
  function _openModal(id){ const m=document.getElementById(id); if(m) m.classList.add('on'); }
  function _closeModal(id){ const m=document.getElementById(id); if(m) m.classList.remove('on'); }

  function init(){ _attach(); render(); }

  return {
    init, render, openAdd, openEdit, saveForm, autoLot, nextLot, delRow,
    openImport, doImport, pasteData, exportXlsx,
    closeModal:_closeModal,
    get ROWS(){ return PL_DATA; }
  };
})();
window.PLOG = PLOG;
