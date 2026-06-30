/* ============================================================
 * VS  —  vs.js   (VESSEL DATA — LPG Sales sub-tab)
 * ------------------------------------------------------------
 * NGUỒN: lpg-station-v406.html  (khối Vessel Data, VS_ROWS)
 * Global xuất ra : window.VS (+ các hàm vs* cho onclick)
 * Phụ thuộc      : firebase, toast, normalizeDate (helpers/globals)
 * Khởi tạo (boot): VS.init()  →  attach firebase 'vessel_data'
 * ------------------------------------------------------------
 * MÔ TẢ: Tab VESSEL trong LPG SALES — nhập/sửa/xoá chuyến tàu
 *   (1-ratio / 2-ratio), đồng bộ Firebase 'vessel_data'. Daily
 *   Stock report (cav.js) tham chiếu VS_ROWS theo giDate.
 * Khác V406: LM.attach → firebase.ref().on('value');
 *            _drNormDate tự định nghĩa (V4 chỉ có normalizeDate).
 * ============================================================ */

/* RAM mirror + state */
var VS_ROWS = {}, VS_LOADED = false, VS_EDIT_KEY = null;
var VESSEL_LIST = ['VIET GAS 01', 'VIET GAS', 'OCEAN STAR'];

var VS_COLS = [
  {k:'date',    h:'Date',        w:68},
  {k:'giDate',  h:'GI Date',     w:68},
  {k:'doNo',    h:'DO No.',      w:85},
  {k:'customer',h:'Customer',    w:110},
  {k:'item',    h:'Trade',       w:80},
  {k:'type',    h:'Type',        w:100},
  {k:'tank',    h:'Tank',        w:60},
  {k:'lot',     h:'Lot',         w:42, num:true},
  {k:'lpg',     h:'Net Wt (kg)', w:85, num:true},
  {k:'c3',      h:'C3 (kg)',     w:80, num:true},
  {k:'c4',      h:'C4 (kg)',     w:80, num:true},
  {k:'ratioC3', h:'%C3',         w:48},
  {k:'ratioC4', h:'%C4',         w:48},
  {k:'vessel',  h:'Vessel',      w:100},
  {k:'dest',    h:'Destination', w:140},
  {k:'price',   h:'Price',       w:85, num:true},
  {k:'time',    h:'Time',        w:48},
  {k:'lineNo',  h:'Ln',          w:28}
];

/* ── date helpers ──────────────────────────────────────────── */
/* V406 dùng _drNormDate(s)→ISO 'YYYY-MM-DD'. V4 chỉ có normalizeDate
   (trả DD/MM/YY) nên tự cài _drNormDate độc lập tại đây. */
function _drNormDate(s){
  if(s==null||s==='') return '';
  var t=String(s).trim().replace(/[T ]\d{1,2}:\d{2}(:\d{2})?.*$/,'').trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0,10);
  var m=t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if(m){ var d=m[1],mo=m[2],y=m[3]; if(y.length===2)y='20'+y; return y+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0'); }
  m=t.match(/^(\d{4})(\d{2})(\d{2})$/); if(m) return m[1]+'-'+m[2]+'-'+m[3];
  var num=parseFloat(t);
  if(isFinite(num)&&num>40000&&num<60000){ var dt=new Date((num-25569)*86400000); return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0'); }
  return '';
}
window._drNormDate = window._drNormDate || _drNormDate;

function _vsFmtDateShort(v){
  if(!v)return'';var s=String(v).trim();
  var m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m)return m[3]+'/'+m[2]+'/'+m[1].slice(2);
  var m2=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(m2)return m2[1]+'/'+m2[2]+'/'+m2[3].slice(2);
  return s;
}
function _vsToDMY(v){
  if(!v) return '';
  var s = String(v).trim();
  if(!s) return '';
  var iso = _drNormDate(s);
  if(iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)){ var p = iso.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
  if(/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  return s;
}
window._vsToDMY = _vsToDMY;

function _vsOpenPicker(pickerId, textId){
  try{
    var picker=document.getElementById(pickerId), text=document.getElementById(textId);
    if(!picker||!text) return;
    var cur=(text.value||'').trim(), iso='';
    if(cur) iso=_drNormDate(cur)||'';
    picker.value=iso||new Date().toISOString().slice(0,10);
    if(typeof picker.showPicker==='function') picker.showPicker(); else { picker.focus(); picker.click(); }
  }catch(e){ console.warn('[VS] _vsOpenPicker', e); }
}
function _vsPickerSync(textId, iso){
  if(!iso) return;
  var text=document.getElementById(textId); if(!text) return;
  var p=String(iso).split('-');
  if(p.length===3){ text.value=p[2]+'/'+p[1]+'/'+p[0]; try{ text.dispatchEvent(new Event('change',{bubbles:true})); }catch(e){} }
}
window._vsOpenPicker=_vsOpenPicker; window._vsPickerSync=_vsPickerSync;

function vsOpenPicker(which){
  var p=document.getElementById('vs-mf-'+which+'-pick'); if(!p) return;
  var t=document.getElementById('vs-mf-'+which), v=t?t.value.trim():'';
  var m=v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m){ p.value=m[3]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0'); }
  if(typeof p.showPicker==='function'){ try{ p.showPicker(); return; }catch(e){} }
  p.style.pointerEvents='auto'; p.focus(); p.click(); setTimeout(function(){ p.style.pointerEvents='none'; }, 200);
}
function vsPickerChange(which, iso){
  var t=document.getElementById('vs-mf-'+which); if(!t) return;
  if(iso){ var pp=iso.split('-'); t.value=pp[2]+'/'+pp[1]+'/'+pp[0]; } else { t.value=''; }
  vsFilter();
}
window.vsOpenPicker=vsOpenPicker; window.vsPickerChange=vsPickerChange;

/* ── Firebase sync ─────────────────────────────────────────── */
var _vsRef = null;
function vsInit(){
  if(_vsRef) return;
  try{
    if(typeof firebase==='undefined' || !firebase.database) return;
    _vsRef = firebase.database().ref('vessel_data');
    _vsRef.on('value', function(snap){
      VS_ROWS = snap.val() || {};
      VS_LOADED = true;
      var syncEl=document.getElementById('vs-sync');
      if(syncEl) syncEl.innerHTML='<span class="rd-sync-dot" style="background:#00c853"></span>SYNCED';
      try{ _vsMigrateDates(); }catch(e){ console.warn('[VS] date migrate', e); }
      try{ vsRender(); }catch(e){ console.error('[VS] vsRender', e); }
    }, function(err){ console.warn('[VS] firebase', err); });
  }catch(e){ console.error('[VS] vsInit', e); }
}

function _vsMigrateDates(){
  if(!VS_ROWS) return;
  var CANON=/^\d{2}\/\d{2}\/\d{4}$/, fixed=0;
  Object.keys(VS_ROWS).forEach(function(k){
    var r=VS_ROWS[k]; if(!r||typeof r!=='object') return;
    var need=false, newDate=r.date, newGi=r.giDate;
    if(r.date && !CANON.test(String(r.date))){ newDate=_vsToDMY(r.date); if(newDate&&newDate!==r.date) need=true; }
    if(r.giDate && !CANON.test(String(r.giDate))){ newGi=_vsToDMY(r.giDate); if(newGi&&newGi!==r.giDate) need=true; }
    if(need){ r.date=newDate; r.giDate=newGi; vsFbSet(k,r).catch(function(){}); fixed++; }
  });
  if(fixed) console.log('[VS] date migration: normalized', fixed, 'rows');
}
function vsFbPush(data){ var r=firebase.database().ref('vessel_data').push(); return r.set(Object.assign({}, data, {_fbk:r.key})); }
function vsFbSet(k,d){ return firebase.database().ref('vessel_data/'+k).set(d); }
function vsFbDel(k){ return firebase.database().ref('vessel_data/'+k).remove(); }

/* ── Filter ────────────────────────────────────────────────── */
function vsMatchRow(r){
  if(!r) return false;
  var fDate=((document.getElementById('vs-mf-date')||{}).value||'').trim().toLowerCase();
  var fGiDate=((document.getElementById('vs-mf-gidate')||{}).value||'').trim().toLowerCase();
  var fQ=((document.getElementById('vs-mf-q')||{}).value||'').trim().toLowerCase();
  if(fDate && !String(r.date||'').toLowerCase().includes(fDate)) return false;
  var hasGi=!!(r.giDate && String(r.giDate).trim());
  if(hasGi && fGiDate && !String(r.giDate||'').toLowerCase().includes(fGiDate)) return false;
  if(fQ){ var hay=[r.doNo||'', r.customer||'', r.vessel||''].join(' ').toLowerCase(); if(!hay.includes(fQ)) return false; }
  return true;
}
function vsFilter(){
  var anyActive=false;
  ['vs-mf-date','vs-mf-gidate','vs-mf-q'].forEach(function(id){
    var el=document.getElementById(id); if(!el) return;
    var has=el.value.trim().length>0; el.classList.toggle('active', has); if(has) anyActive=true;
  });
  var clr=document.getElementById('vs-mf-clr'); if(clr) clr.style.display=anyActive?'flex':'none';
  vsRender();
}
function vsFilterClear(){
  ['vs-mf-date','vs-mf-gidate','vs-mf-q'].forEach(function(id){ var el=document.getElementById(id); if(el){ el.value=''; el.classList.remove('active'); } });
  ['vs-mf-date-pick','vs-mf-gidate-pick'].forEach(function(id){ var el=document.getElementById(id); if(el) el.value=''; });
  var clr=document.getElementById('vs-mf-clr'); if(clr) clr.style.display='none';
  vsRender();
}
window.vsFilter=vsFilter; window.vsFilterClear=vsFilterClear;

/* ── Render ────────────────────────────────────────────────── */
function vsRender(){
  var allRows=Object.entries(VS_ROWS).filter(function(e){return e[1]&&typeof e[1]==='object';})
    .map(function(e){return Object.assign({_k:e[0]}, e[1]);})
    .sort(function(a,b){return(+b.lot||0)-(+a.lot||0);});
  var rows=allRows.filter(vsMatchRow);
  var badge=document.getElementById('badge-vessel'); if(badge) badge.textContent=allRows.length;
  var pov=document.getElementById('vs-pov'), tbl=document.getElementById('vs-tbl');
  if(!allRows.length){ if(pov)pov.style.display=''; if(tbl)tbl.style.display='none'; vsUpdateStats(rows,allRows.length); return; }
  if(pov)pov.style.display='none'; if(tbl)tbl.style.display='';
  var th='<tr><th style="width:36px;min-width:36px;text-align:center">#</th><th style="width:60px;min-width:60px;text-align:center">ACT</th>';
  VS_COLS.forEach(function(c){ th+='<th style="width:'+c.w+'px;min-width:'+c.w+'px">'+c.h+'</th>'; });
  th+='</tr>';
  document.getElementById('vs-thead').innerHTML=th;
  var tbody=document.getElementById('vs-tbody'); tbody.innerHTML='';
  if(!rows.length){
    var trE=document.createElement('tr'), tdE=document.createElement('td');
    tdE.colSpan=VS_COLS.length+2; tdE.style.cssText='text-align:center;padding:24px;color:var(--mt);font-style:italic;font-size:12px';
    tdE.textContent='🔍 Không có dữ liệu khớp filter — bấm ✕ để xóa filter';
    trE.appendChild(tdE); tbody.appendChild(trE); vsUpdateStats(rows,allRows.length); return;
  }
  rows.forEach(function(r,i){
    var tr=document.createElement('tr');
    var tn=document.createElement('td'); tn.className='rdc-n'; tn.textContent=i+1; tr.appendChild(tn);
    var ta=document.createElement('td'); ta.className='rd-act-td';
    var btnE=document.createElement('button'); btnE.className='rd-abt rd-ab-e'; btnE.title='Edit'; btnE.textContent='✏';
    btnE.onclick=(function(k){return function(ev){ev.stopPropagation();vsEditRow(k);};})(r._k);
    var btnD=document.createElement('button'); btnD.className='rd-abt rd-ab-x'; btnD.title='Delete'; btnD.textContent='🗑';
    btnD.onclick=(function(k){return function(ev){ev.stopPropagation();vsDelRow263(k);};})(r._k);
    ta.appendChild(btnE); ta.appendChild(btnD); tr.appendChild(ta);
    VS_COLS.forEach(function(c){
      var td=document.createElement('td'); var v=r[c.k]; if(v===undefined||v===null)v='';
      if(c.k==='ratioC3')td.style.cssText='color:#2d8a4e;font-weight:600';
      else if(c.k==='ratioC4')td.style.cssText='color:#e76f00;font-weight:600';
      if(c.num)td.style.textAlign='right';
      if(c.k==='lpg')td.style.fontWeight='700';
      var sp=document.createElement('span');
      sp.className='rd-ed'; sp.dataset.fk=r._k; sp.dataset.k=c.k; sp.dataset.num=c.num?'1':'';
      sp.textContent=c.num&&v?Number(v).toLocaleString('en-US'):(c.k==='date'||c.k==='giDate')?_vsFmtDateShort(v):String(v);
      sp.onclick=function(e){e.stopPropagation();vsInlineEdit(sp);};
      td.appendChild(sp); tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  vsUpdateStats(rows,allRows.length);
}
function vsUpdateStats(rows, totalCount){
  var el=function(id){return document.getElementById(id);};
  if(el('vs-st-rows')) el('vs-st-rows').textContent=rows.length;
  var ships=new Set(); rows.forEach(function(r){if(r.vessel)ships.add(r.vessel);});
  if(el('vs-st-ships')) el('vs-st-ships').textContent=ships.size;
  var dates=new Set(); rows.forEach(function(r){if(r.date)dates.add(r.date);});
  if(el('vs-st-trips')) el('vs-st-trips').textContent=dates.size;
  var totalLPG=rows.reduce(function(s,r){return s+(+r.lpg||0);},0);
  if(el('vs-st-lpg')) el('vs-st-lpg').textContent=totalLPG.toLocaleString('en-US');
  var hasTotal=(typeof totalCount==='number' && totalCount!==rows.length);
  if(el('vs-rcount')) el('vs-rcount').textContent=hasTotal?(rows.length+' / '+totalCount+' records'):(rows.length+' records');
}
window.vsRender=vsRender;

/* ── Inline edit ───────────────────────────────────────────── */
function vsInlineEdit(sp){
  if(sp.querySelector('input')) return;
  var fk=sp.dataset.fk, k=sp.dataset.k, isNum=sp.dataset.num==='1';
  var isDate=(k==='date'||k==='giDate');
  var row=VS_ROWS[fk]; if(!row) return;
  var orig=row[k];
  sp.style.background='#e3f2fd';
  var inp=document.createElement('input');
  inp.type=isNum?'number':'text';
  inp.value=isDate?(_vsToDMY(orig)||''):(orig!=null?String(orig):'');
  if(isDate){ inp.placeholder='DD/MM/YYYY'; inp.maxLength=10; }
  inp.style.cssText='width:100%;padding:2px 4px;border:1.5px solid var(--ce);border-radius:3px;font-size:11px;font-family:monospace;box-sizing:border-box';
  sp.textContent=''; sp.appendChild(inp); inp.focus(); inp.select();
  var committed=false;
  var commit=function(){
    if(committed) return; committed=true; sp.style.background='';
    var nv=inp.value.trim(), newVal;
    if(isNum){ newVal=nv===''?null:(parseFloat(nv.replace(/,/g,''))||0); }
    else if(isDate){ newVal=nv?_vsToDMY(nv):''; var ok=!nv||_drNormDate(newVal); if(!ok){ toast('⚠ Invalid date — keeping old value','er'); newVal=orig; } }
    else { newVal=nv; }
    if(sp.contains(inp)) sp.removeChild(inp);
    if(isNum && newVal!=null) sp.textContent=Number(newVal).toLocaleString('en-US');
    else if(isDate) sp.textContent=_vsFmtDateShort(newVal);
    else sp.textContent=String(newVal||'');
    row[k]=newVal;
    vsFbSet(fk,row).catch(function(e){toast('❌ '+e.message,'er');});
  };
  inp.addEventListener('blur',commit);
  inp.addEventListener('keydown',function(e){
    if(e.key==='Enter'){e.preventDefault();commit();}
    if(e.key==='Escape'){ committed=true; sp.style.background=''; if(sp.contains(inp)) sp.removeChild(inp);
      if(isNum && orig!=null) sp.textContent=Number(orig).toLocaleString('en-US');
      else if(isDate) sp.textContent=_vsFmtDateShort(orig);
      else sp.textContent=String(orig||''); }
  });
}
window.vsInlineEdit=vsInlineEdit;

/* ── Form ──────────────────────────────────────────────────── */
function vsShowForm(editKey){
  VS_EDIT_KEY=editKey||null;
  var ov=document.getElementById('vs-form-overlay'); ov.style.display='';
  document.getElementById('vs-form-title').textContent=editKey?'✏️ EDIT VESSEL ENTRY':'🚢 ADD VESSEL ENTRY';
  if(!editKey){
    var _now=new Date();
    var _dmy=String(_now.getDate()).padStart(2,'0')+'/'+String(_now.getMonth()+1).padStart(2,'0')+'/'+_now.getFullYear();
    document.getElementById('vs-f-date').value=_dmy;
    document.getElementById('vs-f-gidate').value=_dmy;
    document.getElementById('vs-f-time').value='12:50';
    document.getElementById('vs-f-lot').value='';
    document.getElementById('vs-f-vessel').value='';
    document.getElementById('vs-f-item').value='Domestic (Ship)';
    document.getElementById('vs-f-type').value='LPG';
    document.getElementById('vs-f-customer').value='';
    document.getElementById('vs-f-dest').value='';
    document.getElementById('vs-f-tank').value='Cavern';
    document.getElementById('vs-f-price').value='';
    ['vs-f-do1','vs-f-c3-1','vs-f-c4-1','vs-f-lpg-1','vs-f-r3-1','vs-f-r4-1',
     'vs-f-do2','vs-f-c3-2','vs-f-c4-2','vs-f-lpg-2','vs-f-r3-2','vs-f-r4-2'].forEach(function(id){
      var el=document.getElementById(id); if(el) el.value='';
    });
    vsSetType(1);
  } else {
    var r=VS_ROWS[editKey]; if(!r) return;
    document.getElementById('vs-f-date').value=_vsToDMY(r.date)||'';
    document.getElementById('vs-f-gidate').value=_vsToDMY(r.giDate||r.date)||'';
    document.getElementById('vs-f-time').value=r.time||'';
    document.getElementById('vs-f-lot').value=r.lot||'';
    document.getElementById('vs-f-vessel').value=r.vessel||'';
    document.getElementById('vs-f-item').value=r.item||'';
    document.getElementById('vs-f-type').value=r.type||'LPG';
    document.getElementById('vs-f-customer').value=r.customer||'';
    document.getElementById('vs-f-dest').value=r.dest||'';
    document.getElementById('vs-f-tank').value=r.tank||'Cavern';
    document.getElementById('vs-f-price').value=r.price||'';
    document.getElementById('vs-f-do1').value=r.doNo||'';
    document.getElementById('vs-f-c3-1').value=r.c3||'';
    document.getElementById('vs-f-c4-1').value=r.c4||'';
    document.getElementById('vs-f-lpg-1').value=r.lpg||'';
    vsCalcRatio(1);
    var sib=_vsFindSibling(editKey);
    if(sib){
      vsSetType(2);
      document.getElementById('vs-f-do2').value=sib.doNo||'';
      document.getElementById('vs-f-c3-2').value=sib.c3||'';
      document.getElementById('vs-f-c4-2').value=sib.c4||'';
      document.getElementById('vs-f-lpg-2').value=sib.lpg||'';
      vsCalcRatio(2);
    } else { vsSetType(1); }
  }
}
function _vsFindSibling(key){
  var r=VS_ROWS[key]; if(!r) return null;
  var sibLine=r.lineNo==='1'?'2':'1';
  for(var k in VS_ROWS){
    if(k===key) continue;
    var s=VS_ROWS[k];
    if(s.date===r.date&&s.vessel===r.vessel&&s.customer===r.customer&&s.lineNo===sibLine) return Object.assign({_k:k}, s);
  }
  return null;
}
function vsCloseForm(){ document.getElementById('vs-form-overlay').style.display='none'; VS_EDIT_KEY=null; }
function vsSetType(n){
  var b1=document.getElementById('vs-type-1'), b2=document.getElementById('vs-type-2'), l2=document.getElementById('vs-line2');
  if(n===2){ b2.style.background='#e76f00'; b2.style.color='#fff'; b2.style.borderColor='#e76f00'; b1.style.background=''; b1.style.color=''; b1.style.borderColor=''; l2.style.display=''; }
  else { b1.style.background='var(--ce)'; b1.style.color='#fff'; b1.style.borderColor='var(--ce)'; b2.style.background=''; b2.style.color=''; b2.style.borderColor=''; l2.style.display='none'; }
  document.getElementById('vs-form-overlay').dataset.type=n;
}
function vsOnVesselChange(){ var v=document.getElementById('vs-f-vessel').value; if(v==='VIET GAS') vsSetType(2); else vsSetType(1); }
function vsCalcRatio(line){
  var c3El=document.getElementById('vs-f-c3-'+line), c4El=document.getElementById('vs-f-c4-'+line), lpgEl=document.getElementById('vs-f-lpg-'+line);
  var c3=parseFloat(c3El.value)||0, c4=parseFloat(c4El.value)||0, lpg=parseFloat(lpgEl.value)||0;
  var isLpgFocused=(document.activeElement===lpgEl);
  if(!isLpgFocused && (c3>0||c4>0)){ lpg=c3+c4; lpgEl.value=lpg; }
  if(!lpg){ document.getElementById('vs-f-r3-'+line).value=''; document.getElementById('vs-f-r4-'+line).value=''; return; }
  document.getElementById('vs-f-r3-'+line).value=(c3/lpg).toFixed(2);
  document.getElementById('vs-f-r4-'+line).value=(c4/lpg).toFixed(2);
}
window.vsShowForm=vsShowForm; window.vsCloseForm=vsCloseForm; window.vsSetType=vsSetType;
window.vsOnVesselChange=vsOnVesselChange; window.vsCalcRatio=vsCalcRatio;

/* ── Customer autocomplete (adapt: V4 dùng CT / PLAN_DATA) ──── */
function _vsCustList(){
  try{ if(typeof CT!=='undefined'){
    if(typeof CT.list==='function'){ var l=CT.list(); if(l&&l.length) return l; }
    if(CT.ROWS) return Object.values(CT.ROWS).map(function(c){return {short:c.short||'',wms:c.wms||'',vn:c.vn||''};});
  }}catch(_){}
  try{ if(window.PLAN_DATA&&PLAN_DATA.cust) return PLAN_DATA.cust; }catch(_){}
  return [];
}
var _vsCustIdx=-1;
function vsCustSearch(q){
  var dd=document.getElementById('vs-cust-dd'); if(!dd) return;
  var custs=_vsCustList();
  if(!q||!q.trim()||!custs.length){ dd.innerHTML=''; dd.classList.remove('show'); _vsCustIdx=-1; return; }
  q=q.toLowerCase().trim();
  var matches=custs.filter(function(c){
    return (c.short||'').toLowerCase().includes(q)||(c.wms||'').toLowerCase().includes(q)||(c.vn||'').toLowerCase().includes(q);
  }).slice(0,10);
  if(!matches.length){ dd.innerHTML=''; dd.classList.remove('show'); _vsCustIdx=-1; return; }
  dd.innerHTML=matches.map(function(c,i){
    var shortH=(c.short||'').replace(/</g,'&lt;'), wmsH=(c.wms||'').replace(/</g,'&lt;');
    return '<div class="vs-cust-item'+(i===_vsCustIdx?' active':'')+'" data-short="'+shortH+'" data-wms="'+wmsH+'" onclick="vsCustPick(this)">'
      +'<span class="vs-ci-short">'+shortH+'</span>'+(wmsH?'<span class="vs-ci-wms">'+wmsH+'</span>':'')+'</div>';
  }).join('');
  dd.classList.add('show');
}
function vsCustPick(el){
  var inp=document.getElementById('vs-f-customer');
  if(inp) inp.value=el.dataset.short||el.dataset.wms||'';
  var dd=document.getElementById('vs-cust-dd'); if(dd){ dd.innerHTML=''; dd.classList.remove('show'); }
  _vsCustIdx=-1;
  var cust=inp?inp.value:'';
  if(cust){
    var destEl=document.getElementById('vs-f-dest');
    if(destEl&&!destEl.value){ var rows=Object.values(VS_ROWS||{});
      for(var i=rows.length-1;i>=0;i--){ if(rows[i]&&rows[i].customer===cust&&rows[i].dest){ destEl.value=rows[i].dest; break; } } }
  }
}
function _vsCustHL(items){ for(var i=0;i<items.length;i++){ items[i].classList.toggle('active',i===_vsCustIdx); } if(items[_vsCustIdx]) items[_vsCustIdx].scrollIntoView({block:'nearest'}); }
document.addEventListener('keydown',function(e){
  var dd=document.getElementById('vs-cust-dd'); if(!dd||!dd.classList.contains('show')) return;
  var items=dd.querySelectorAll('.vs-cust-item'); if(!items.length) return;
  if(e.key==='ArrowDown'){e.preventDefault();_vsCustIdx=Math.min(_vsCustIdx+1,items.length-1);_vsCustHL(items);}
  else if(e.key==='ArrowUp'){e.preventDefault();_vsCustIdx=Math.max(_vsCustIdx-1,0);_vsCustHL(items);}
  else if(e.key==='Enter'&&_vsCustIdx>=0){e.preventDefault();vsCustPick(items[_vsCustIdx]);}
  else if(e.key==='Escape'){dd.innerHTML='';dd.classList.remove('show');_vsCustIdx=-1;}
});
document.addEventListener('click',function(e){
  if(!e.target.closest('#vs-f-customer')&&!e.target.closest('#vs-cust-dd')){ var dd=document.getElementById('vs-cust-dd'); if(dd){ dd.classList.remove('show'); _vsCustIdx=-1; } }
});
window.vsCustSearch=vsCustSearch; window.vsCustPick=vsCustPick;

/* ── Save ──────────────────────────────────────────────────── */
function vsSave(){
  var date=_vsToDMY(document.getElementById('vs-f-date').value);
  var giDate=_vsToDMY(document.getElementById('vs-f-gidate').value);
  if(date && !_drNormDate(date)){ toast('⚠ Invalid date — use DD/MM/YYYY','er'); document.getElementById('vs-f-date').focus(); return; }
  if(giDate && !_drNormDate(giDate)){ toast('⚠ Invalid GI Date — use DD/MM/YYYY','er'); document.getElementById('vs-f-gidate').focus(); return; }
  var vessel=document.getElementById('vs-f-vessel').value;
  var doNo1=document.getElementById('vs-f-do1').value.trim();
  if(!date||!vessel){ toast('⚠ Enter Date and Vessel','er'); return; }
  if(!doNo1){ toast('⚠ Enter DO No. (Line 1)','er'); return; }
  var common={
    date:date, giDate:giDate||date,
    time:document.getElementById('vs-f-time').value,
    lot:document.getElementById('vs-f-lot').value.trim(),
    vessel:vessel, item:document.getElementById('vs-f-item').value,
    type:document.getElementById('vs-f-type').value,
    customer:document.getElementById('vs-f-customer').value.trim(),
    dest:document.getElementById('vs-f-dest').value.trim(),
    tank:document.getElementById('vs-f-tank').value,
    price:document.getElementById('vs-f-price').value.trim()
  };
  function buildLine(n){
    var c3=parseFloat(document.getElementById('vs-f-c3-'+n).value)||0;
    var c4=parseFloat(document.getElementById('vs-f-c4-'+n).value)||0;
    var lpg=parseFloat(document.getElementById('vs-f-lpg-'+n).value)||0;
    if(!lpg)lpg=c3+c4;
    return Object.assign({}, common, {
      doNo:document.getElementById('vs-f-do'+n).value.trim(), c3:c3, c4:c4, lpg:lpg,
      ratioC3:lpg?(c3/lpg).toFixed(2):'0', ratioC4:lpg?(c4/lpg).toFixed(2):'0', lineNo:String(n)
    });
  }
  var type=+(document.getElementById('vs-form-overlay').dataset.type||1);
  if(VS_EDIT_KEY){
    var line1=buildLine(1);
    vsFbSet(VS_EDIT_KEY, Object.assign({}, line1, {_fbk:VS_EDIT_KEY})).catch(function(e){toast('❌ '+e.message,'er');});
    var sib=_vsFindSibling(VS_EDIT_KEY);
    if(type===2){
      var line2=buildLine(2);
      if(sib&&sib._k) vsFbSet(sib._k, Object.assign({}, line2, {_fbk:sib._k})).catch(function(){});
      else vsFbPush(line2).catch(function(){});
    } else if(sib&&sib._k){ vsFbDel(sib._k).catch(function(){}); }
    toast('✅ Shipment updated','ok');
  } else {
    vsFbPush(buildLine(1)).catch(function(e){toast('❌ '+e.message,'er');});
    if(type===2){ var doNo2=document.getElementById('vs-f-do2').value.trim(); if(doNo2) vsFbPush(buildLine(2)).catch(function(){}); }
    toast('✅ Added shipment '+(type===2?'(2 ratio)':''),'ok');
  }
  vsCloseForm();
}
window.vsSave=vsSave;

/* ── Edit / Delete ─────────────────────────────────────────── */
function vsEditRow(key){ vsShowForm(key); }
function _vsDM(show){ var m=document.getElementById('vs-m-del'); if(m){ if(show)m.classList.remove('h'); else m.classList.add('h'); } }
window._vsDM=_vsDM;
function vsDelRow263(key){
  var r=VS_ROWS[key]; if(!r){ toast('⚠ Row not found','er'); return; }
  window._vsDelKey=key;
  var esc=function(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  var rowInfo='<b style="color:var(--tx)">'+esc(r.customer||r.vessel)+'</b> — DO '+esc(r.doNo)+' — '+esc(r.date);
  var hdr=document.getElementById('vs-del-header'), info=document.getElementById('vs-del-info'),
      foot=document.getElementById('vs-del-footer'), stat=document.getElementById('vs-del-status');
  if(hdr) hdr.innerHTML='<h3 style="color:#d62839">🗑️ DELETE ROW</h3>'
    +'<div class="rd-mwarn" style="background:#fef2f2;border-color:#fca5a5;color:#991b1b">Xóa dòng này khỏi Firebase. Hành động không thể hoàn tác.</div>';
  if(info) info.innerHTML=rowInfo
    +'<div style="margin-top:10px"><label style="font-size:12px;font-weight:600;color:#991b1b">Type <b>Delete</b> to confirm:</label>'
    +'<input id="vs-del-confirm" type="text" placeholder="Delete" style="width:100%;margin-top:4px;padding:6px 10px;border:2px solid #fca5a5;border-radius:6px;font-size:14px;font-weight:600" oninput="_vsDelConfirmCheck()" onkeyup="_vsDelConfirmCheck()" onchange="_vsDelConfirmCheck()"></div>';
  if(stat) stat.textContent='';
  if(foot) foot.innerHTML='<button class="rd-mbtn-cl" onclick="_vsDM(false)">✕ Cancel</button>'
    +'<button id="vs-del-go" class="rd-btn" style="height:28px;background:#ccc;color:#fff;border-color:#ccc;pointer-events:none" onclick="_vsDoDelete()">🗑️ DELETE</button>';
  _vsDM(true);
}
function _vsDelConfirmCheck(){
  var inp=document.getElementById('vs-del-confirm'), btn=document.getElementById('vs-del-go');
  if(!inp||!btn) return;
  var ok=inp.value.trim().toLowerCase()==='delete';
  btn.style.background=ok?'#d62839':'#ccc'; btn.style.borderColor=ok?'#d62839':'#ccc'; btn.style.pointerEvents=ok?'auto':'none';
}
function _vsDoDelete(){
  var key=window._vsDelKey, r=VS_ROWS[key];
  if(!r){ _vsDM(false); return; }
  var inp=document.getElementById('vs-del-confirm');
  if(!inp||inp.value.trim().toLowerCase()!=='delete'){ toast('⚠ Type "Delete" to confirm','er'); return; }
  var stat=document.getElementById('vs-del-status'), doNo=String(r.doNo||'').trim();
  if(stat) stat.innerHTML='⏳ Deleting from Firebase...';
  vsFbDel(key).then(function(){ toast('🗑 DO '+doNo+' deleted','ok'); _vsDM(false); })
    .catch(function(e){ toast('❌ Delete error: '+e.message,'er'); if(stat) stat.innerHTML='❌ '+e.message; });
}
window.vsEditRow=vsEditRow; window.vsDelRow263=vsDelRow263;
window._vsDelConfirmCheck=_vsDelConfirmCheck; window._vsDoDelete=_vsDoDelete;

/* ── PASTE / CSV (lightweight) ─────────────────────────────── */
function vsExport(){
  var rows=Object.values(VS_ROWS||{}).filter(function(r){return r&&typeof r==='object';})
    .sort(function(a,b){return(+b.lot||0)-(+a.lot||0);});
  if(!rows.length){ toast('⚠ No vessel data to export','er'); return; }
  var head=VS_COLS.map(function(c){return c.h;});
  var lines=[head.join(',')];
  rows.forEach(function(r){
    lines.push(VS_COLS.map(function(c){ var v=r[c.k]; if(v==null)v=''; v=String(v).replace(/"/g,'""'); return /[",\n]/.test(v)?('"'+v+'"'):v; }).join(','));
  });
  var blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'});
  var a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='VesselData_'+new Date().toISOString().slice(0,10)+'.csv'; a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
  toast('📥 Exported '+rows.length+' vessel rows','ok');
}
/* ── PASTE (CSV / Excel TSV) — header-aware, quote-aware, dedup theo DO ── */
var _VS_HDR_MAP={
  'date':'date','gi date':'giDate','gidate':'giDate',
  'do no.':'doNo','do no':'doNo','do':'doNo','dono':'doNo',
  'customer':'customer','trade':'item','item':'item','type':'type',
  'tank':'tank','lot':'lot',
  'net wt (kg)':'lpg','net wt':'lpg','netwt':'lpg','lpg':'lpg','lpg (kg)':'lpg',
  'c3 (kg)':'c3','c3':'c3','c4 (kg)':'c4','c4':'c4',
  '%c3':'ratioC3','ratioc3':'ratioC3','%c4':'ratioC4','ratioc4':'ratioC4',
  'vessel':'vessel','destination':'dest','dest':'dest',
  'price':'price','time':'time','ln':'lineNo','lineno':'lineNo','line':'lineNo'
};
var _VS_DEFAULT_ORDER=['date','giDate','doNo','customer','item','type','tank','lot','lpg','c3','c4','ratioC3','ratioC4','vessel','dest','price','time','lineNo'];

function _vsSplitCSV(line, delim){
  if(delim==='\t') return line.split('\t');
  var out=[], cur='', q=false;
  for(var i=0;i<line.length;i++){
    var ch=line[i];
    if(q){ if(ch==='"'){ if(line[i+1]==='"'){ cur+='"'; i++; } else q=false; } else cur+=ch; }
    else { if(ch==='"') q=true; else if(ch===','){ out.push(cur); cur=''; } else cur+=ch; }
  }
  out.push(cur); return out;
}
function _vsCleanDo(v){ return (typeof cleanDO==='function') ? cleanDO(v||'') : String(v||'').trim().replace(/^0+/,''); }
function _vsNormRow(o){
  var num=function(v){ var n=parseFloat(String(v==null?'':v).replace(/,/g,'')); return isNaN(n)?0:n; };
  var date=_vsToDMY(o.date||''); if(!date) return null;
  var c3=num(o.c3), c4=num(o.c4), lpg=num(o.lpg); if(!lpg) lpg=c3+c4;
  return {
    date:date, giDate:_vsToDMY(o.giDate||o.date||'')||date,
    time:o.time||'12:50', lot:(o.lot!=null?String(o.lot).trim():''),
    vessel:o.vessel||'', item:o.item||'Domestic (Ship)', type:o.type||'',
    customer:o.customer||'', dest:o.dest||'', tank:o.tank||'Cavern',
    price:(o.price!=null?String(o.price).trim():''),
    doNo:_vsCleanDo(o.doNo), c3:c3, c4:c4, lpg:lpg,
    ratioC3:(o.ratioC3&&String(o.ratioC3).trim())?String(o.ratioC3).trim():(lpg?(c3/lpg).toFixed(2):'0'),
    ratioC4:(o.ratioC4&&String(o.ratioC4).trim())?String(o.ratioC4).trim():(lpg?(c4/lpg).toFixed(2):'0'),
    lineNo:(o.lineNo&&String(o.lineNo).trim())?String(o.lineNo).trim():'1'
  };
}
function _vsParsePaste(raw){
  if(!raw) return [];
  raw=raw.replace(/^﻿/,'');
  var lines=raw.split(/\r?\n/).filter(function(l){ return l.trim().length; });
  if(!lines.length) return [];
  var delim=lines[0].indexOf('\t')>=0?'\t':',';
  var first=_vsSplitCSV(lines[0],delim).map(function(s){ return s.trim(); });
  var hasHeader=/^date$/i.test(first[0]||'') || first.join(',').toLowerCase().indexOf('do no')>=0;
  var order=_VS_DEFAULT_ORDER.slice(), start=0;
  if(hasHeader){ order=first.map(function(h){ return _VS_HDR_MAP[h.toLowerCase().trim()]||null; }); start=1; }
  var rows=[];
  for(var i=start;i<lines.length;i++){
    var cols=_vsSplitCSV(lines[i],delim).map(function(s){ return s.trim(); });
    if(!cols.length || cols.every(function(x){ return !x; })) continue;
    var obj={};
    for(var j=0;j<order.length;j++){ var key=order[j]; if(key) obj[key]=cols[j]!=null?cols[j]:''; }
    var row=_vsNormRow(obj); if(row) rows.push(row);
  }
  return rows;
}
function vsPaste(){
  var m=document.getElementById('vs-paste-modal');
  if(!m){ toast('⚠ Paste modal not found','er'); return; }
  var ta=document.getElementById('vs-paste-area'); if(ta) ta.value='';
  m.style.display=''; setTimeout(function(){ if(ta) ta.focus(); }, 30);
}
function vsClosePaste(){ var m=document.getElementById('vs-paste-modal'); if(m) m.style.display='none'; }
function vsSubmitPaste(){
  var ta=document.getElementById('vs-paste-area');
  var rows=_vsParsePaste(ta?ta.value:'');
  if(!rows.length){ toast('⚠ Không nhận được dòng hợp lệ — kiểm tra dữ liệu dán','er'); return; }
  /* index hiện có theo DO (đã clean) để re-paste không tạo trùng */
  var byDo={};
  Object.keys(VS_ROWS||{}).forEach(function(k){
    var r=VS_ROWS[k]; if(r&&r.doNo){ var d=_vsCleanDo(r.doNo); if(d) byDo[d]=k; }
  });
  var added=0, updated=0;
  rows.forEach(function(row){
    var d=row.doNo;
    if(d && byDo[d]){ vsFbSet(byDo[d], Object.assign({}, VS_ROWS[byDo[d]], row, {_fbk:byDo[d]})).catch(function(){}); updated++; }
    else { vsFbPush(row).catch(function(){}); added++; }
  });
  toast('✅ Imported '+rows.length+' rows ('+added+' new · '+updated+' updated)','ok');
  vsClosePaste();
}
window.vsExport=vsExport; window.vsPaste=vsPaste; window.vsClosePaste=vsClosePaste; window.vsSubmitPaste=vsSubmitPaste;

/* ── REPORT HELPER: total vessel C3/C4 GI on a date (ton) ──────
   Mirrors V406 _cvBizVessel — sums VS_ROWS c3/c4 (kg) by giDate. */
function vesselGI(dateISO, mat){
  if(!VS_ROWS) return 0;
  var key=(mat==='C3')?'c3':'c4', sumKg=0;
  Object.keys(VS_ROWS).forEach(function(k){
    var r=VS_ROWS[k]; if(!r||typeof r!=='object') return;
    var gd=_drNormDate(r.giDate||r.date);
    if(gd!==dateISO) return;
    var v=parseFloat(r[key]||0); if(v) sumKg+=v;
  });
  return sumKg/1000;
}
window.vesselGI=vesselGI;

/* Public namespace for boot */
window.VS = { init: vsInit, render: vsRender, ROWS: function(){ return VS_ROWS; }, vesselGI: vesselGI };
