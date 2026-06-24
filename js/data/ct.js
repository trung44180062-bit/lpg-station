/* ============================================================
 * CT  —  ct.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 15505–15860   (~356 dòng)
 * Global xuất ra : window.CT
 * Phase tách     : P3
 * Phụ thuộc      : sync, helpers
 * Khởi tạo (boot): CT.init() trong boot
 * ------------------------------------------------------------
 * MÔ TẢ: Customer table: tra cứu tên/short của khách hàng.
 *
 * API công khai (điền/đối chiếu khi tách):
 *   CT.init(), CT.ROWS, CT.lookup(customer)
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module CT từ dòng 15505 đến 15860.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.CT).
 *   3) node --check ct.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P3]: dán thân module CT (V4-54 dòng 15505–15860) vào đây. */

const CT = (function(){
  const ROWS = {};
  let table = null;
  let _suppressEcho = 0;
  let _versions = { cust:0 };
  let _pendingDiff = null;
  const LS_KEY = 'lpg_v4_cust_v1';

  function loadCache(){try{const r=localStorage.getItem(LS_KEY);if(!r)return null;const o=JSON.parse(r);return(o&&o.schema===1)?o:null;}catch(e){return null;}}
  function saveCache(){try{localStorage.setItem(LS_KEY,JSON.stringify({schema:1,savedAt:Date.now(),versions:_versions,data:ROWS}));}catch(e){}}

  function salePlanAliases(r){
    if(!r||!r.salePlan) return [];
    return String(r.salePlan).split(/[,;|]+/).map(s=>s.trim().toUpperCase()).filter(s=>s.length>0);
  }
  /* Shared matching cascade: pasted name (sale-plan / wms / vn / short) → CUST record.
     Returns the matched record or null. Both lookup() and wmsName() build on this so
     the matching rules can never drift apart. */
  function _findRecord(name){
    if(!name) return null;
    const up=String(name).trim().toUpperCase(), arr=Object.values(ROWS);
    for(const c of arr){if(String(c.wms||'').trim().toUpperCase()===up) return c;}
    for(const c of arr){if(salePlanAliases(c).includes(up)) return c;}
    for(const c of arr){if(String(c.short||'').trim().toUpperCase()===up) return c;}
    for(const c of arr){const vn=String(c.vn||'').trim().toUpperCase();if(vn&&vn===up)return c;}
    for(const c of arr){
      const w=String(c.wms||'').trim().toUpperCase(),vn=String(c.vn||'').trim().toUpperCase();
      if(w.length>=5&&(up.includes(w)||w.includes(up)))return c;
      if(vn.length>=5&&(up.includes(vn)||vn.includes(up)))return c;
      for(const sp of salePlanAliases(c)){if(sp.length>=6&&(up.includes(sp)||sp.includes(up)))return c;}
    }
    for(const c of arr){const sh=String(c.short||'').trim().toUpperCase();if(sh.length>=4&&(up.startsWith(sh)||up.includes(sh)))return c;}
    return null;
  }
  /* name (any alias) → CUST short code (customer code, for reports). */
  function lookup(name){
    if(!name) return name;
    const al=_caLookup(name); if(al) return al;
    const rec=_findRecord(name);
    return rec ? (rec.short||name) : name;
  }
  /* name (any alias) → CUST WMS name (the official WMS company name). */
  function wmsName(name){
    if(!name) return name;
    const rec=_findRecord(name);
    return rec ? (rec.wms||name) : name;
  }
  /* v4.22.6 — name (any alias) → CUST Vietnamese full name (cust.vn).
     Used by PTT and DN printouts where the legally-recognized Vietnamese
     company name is required. Cascades vn → wms → short → original so the
     printout is never empty if the vn field hasn't been filled yet. */
  function vnName(name){
    if(!name) return name;
    const rec=_findRecord(name);
    return rec ? (rec.vn||rec.wms||rec.short||name) : name;
  }

  /* v4.38.0 — CUSTOMER ALIAS MEMORY (ported from V406).
     A pasted Sale-Plan customer name that no CUST record can resolve is
     remembered here once the operator assigns a Short Name (via the match
     modal at plan paste). Firebase node `cust_alias` (key→short, ≤200 keys,
     ~16KB). lookup() consults this FIRST so every later resolution — incl.
     the Scale→TL push — yields the short name without re-asking. */
  let _custAlias = {};
  function _caKey(n){ return String(n||'').trim().toUpperCase().replace(/[.#$/\[\]\s]+/g,'_').slice(0,80); }
  function _caLookup(name){ const k=_caKey(name); return k?(_custAlias[k]||''):''; }
  function aliasSave(name, shortName){
    if(!name||!shortName) return;
    if(!canWrite('cust')){ toast('No permission','er'); return; }
    const k=_caKey(name);
    _custAlias[k]=shortName;
    /* Enforce ≤200: drop oldest by key alpha. */
    const keys=Object.keys(_custAlias);
    if(keys.length>200){ keys.sort(); for(let i=0;i<keys.length-200;i++) delete _custAlias[keys[i]]; }
    if(FB_DB){ _suppressEcho++; FB_DB.ref('cust_alias/'+k).set(shortName).catch(()=>{}).finally(()=>setTimeout(()=>{_suppressEcho--;},400)); }
  }
  /* true when a name already resolves to a CUST short (record or remembered alias). */
  function resolvesShort(name){
    if(!name) return false;
    if(_caLookup(name)) return true;
    return !!_findRecord(name);
  }
  /* Sorted list of all known short codes (for the match-modal picker). */
  function shortList(){
    return Object.values(ROWS).map(r=>String(r.short||'').trim()).filter(Boolean)
      .sort((a,b)=>a.toLowerCase()<b.toLowerCase()?-1:1);
  }

  function applyAndPush(changes,reason){
    if(!changes||!changes.length)return null;
    if(!canWrite('cust')){toast('No permission','er');return null;}
    const now=Date.now(),payload={};
    changes.forEach(c=>{
      const{rid,field,value}=c;
      if(!ROWS[rid])ROWS[rid]={_rid:rid};
      if(field==='__DELETE__'){delete ROWS[rid];payload[`cust_/${rid}`]=null;return;}
      ROWS[rid][field]=value;c.value=value;payload[`cust_/${rid}/${field}`]=value;
      ROWS[rid].lastBy=CURRENT_USER.name;ROWS[rid].lastAt=now;
      payload[`cust_/${rid}/lastBy`]=CURRENT_USER.name;payload[`cust_/${rid}/lastAt`]=now;
    });
    _versions.cust=(_versions.cust||0)+1;payload['cust_version']=_versions.cust;
    saveCache();
    if(FB_DB){_suppressEcho++;
      FB_DB.ref().update(payload).then(()=>toast('Customers synced ('+reason+')','ok')).catch(e=>{console.error('CT push',e);toast('Customer write failed','er');})
        .finally(()=>setTimeout(()=>{_suppressEcho--;},600));
    }else toast('Saved locally (offline)','ok');
    return payload;
  }
  function editCellField(rid,field,value){
    if(field==='salePlan'&&value){const parts=String(value).split(/[,;|]+/).map(s=>s.trim()).filter(Boolean);const seen={},uniq=[];parts.forEach(p=>{const k=p.toUpperCase();if(!seen[k]){seen[k]=1;uniq.push(p);}});value=uniq.join(', ');}
    applyAndPush([{rid,field,value}],'edit');
  }

  let FB_DB=null;
  function attachFirebase(){
    if(typeof firebase==='undefined')return; FB_DB=firebase.database();
    FB_DB.ref('cust_version').on('value',s=>{const v=s.val()||0;if(v>_versions.cust)_versions.cust=v;});
    FB_DB.ref('cust_alias').on('value',s=>{ _custAlias=s.val()||{}; if(table)rebuildTableData(); });
    const ref=FB_DB.ref('cust_');
    /* Reconcile — see plan module for rationale. */
    ref.once('value').then(snap=>{
      const fbData=snap.val()||{};
      const orphans=Object.keys(ROWS).filter(rid=>!Object.prototype.hasOwnProperty.call(fbData,rid));
      if(orphans.length){
        console.warn(`[cust] Reconcile: pruning ${orphans.length} stale local row(s):`,orphans);
        orphans.forEach(rid=>delete ROWS[rid]);
        saveCache();
        if(table) rebuildTableData();
        refreshCounts(); refreshBadge();
      }
    }).catch(()=>{});
    ref.on('child_added',snap=>{if(_suppressEcho)return;const rid=snap.key,row=snap.val();if(!row)return;row._rid=rid;ROWS[rid]=row;saveCache();if(table)rebuildTableData();refreshCounts();refreshBadge();});
    ref.on('child_changed',snap=>{if(_suppressEcho)return;const rid=snap.key,row=snap.val();if(!row)return;row._rid=rid;ROWS[rid]=row;saveCache();if(table){const r=table.getRow(rid);if(r)r.update(row);else table.addRow(row);}refreshCounts();refreshBadge();});
    ref.on('child_removed',snap=>{if(_suppressEcho)return;delete ROWS[snap.key];saveCache();if(table){const r=table.getRow(snap.key);if(r)r.delete();}refreshCounts();refreshBadge();});
  }

  function shortFmt(cell){const v=String(cell.getValue()||'').trim();return v?`<span class="ct-short">${escapeHtml(v)}</span>`:'<span class="ct-empty">—</span>';}
  function wmsFmt(cell){const v=String(cell.getValue()||'').trim();return v?`<span class="ct-wms">${escapeHtml(v)}</span>`:'<span class="ct-empty">—</span>';}
  function vnFmt(cell){const v=String(cell.getValue()||'').trim();return v?`<span class="ct-vn">${escapeHtml(v)}</span>`:'<span class="ct-empty">—</span>';}
  function spFmt(cell){const v=String(cell.getValue()||'').trim();if(!v)return'<span class="ct-empty">—</span>';const parts=v.split(/[,;|]+/).map(s=>s.trim()).filter(Boolean);return parts.length<=1?`<span class="ct-saleplan">${escapeHtml(v)}</span>`:parts.map(p=>`<span class="ct-sp-chip">${escapeHtml(p)}</span>`).join('');}
  function brFmt(cell){const v=String(cell.getValue()||'').trim();if(!v)return'<span class="ct-empty">—</span>';return v.split(',').map(s=>s.trim()).filter(Boolean).map(p=>`<span class="ct-br-chip">${escapeHtml(p)}</span>`).join('');}
  function prFmt(cell){const v=String(cell.getValue()||'').trim();return v?`<span class="ct-price">${escapeHtml(v)}</span>`:'<span class="ct-empty">—</span>';}

  function ctRows(){
    let arr=Object.values(ROWS);
    const q=(document.getElementById('ctSearch').value||'').trim().toLowerCase();
    if(q) arr=arr.filter(r=>(r.short||'').toLowerCase().includes(q)||(r.wms||'').toLowerCase().includes(q)||(r.vn||'').toLowerCase().includes(q)||(r.salePlan||'').toLowerCase().includes(q)||(r.priceName||'').toLowerCase().includes(q)||(r.branches||'').toLowerCase().includes(q));
    arr.sort((a,b)=>String(a.short||'').localeCompare(String(b.short||'')));
    return arr;
  }
  function buildColumns(){
    return[
      {title:'#',width:42,hozAlign:'center',headerSort:false,formatter:cell=>cell.getRow().getPosition()},
      {title:'Short Name',field:'short',width:150,headerSort:true,editor:'input',formatter:shortFmt},
      {title:'WMS Name',field:'wms',minWidth:200,headerSort:true,editor:'input',formatter:wmsFmt},
      {title:'Vietnamese Name',field:'vn',minWidth:200,headerSort:true,editor:'input',formatter:vnFmt},
      {title:'Sale Plan',field:'salePlan',width:200,headerSort:true,editor:'input',formatter:spFmt,tooltip:'Multiple names separated by , ; |'},
      {title:'Branch',field:'branches',width:200,headerSort:true,editor:'input',formatter:brFmt},
      {title:'Price',field:'priceName',width:160,headerSort:true,editor:'input',formatter:prFmt},
      {title:'Last Edit',field:'lastAt',width:90,headerSort:true,formatter:lastEditFormatter,cssClass:'cell-lastedit-wrap'},
      {title:'🗑',width:44,hozAlign:'center',headerSort:false,formatter:()=>'✕',cssClass:'cell-del',
        cellClick:(e,cell)=>{ctRequestDelete(cell.getRow().getData());}}
    ];
  }
  function buildTable(){
    if(table){try{table.destroy();}catch(_){}table=null;}
    table=new Tabulator('#ctGrid',{data:ctRows(),layout:'fitDataStretch',height:'100%',index:'_rid',
      columns:buildColumns(),placeholder:'No customer data — click "📋 Paste Data" to import',clipboard:true,clipboardPasteAction:'replace'});
    table.on('cellEdited',cell=>{editCellField(cell.getRow().getData()._rid,cell.getField(),cell.getValue());setTimeout(()=>refreshCounts(),30);});
    table.on('tableBuilt',()=>{refreshCounts();refreshBadge();});
  }
  function rebuildTableData(){if(!table){buildTable();return;}try{table.replaceData(ctRows());}catch(_){buildTable();}refreshCounts();}
  function refreshCounts(){const all=Object.values(ROWS);document.getElementById('ctCntShown').textContent=ctRows().length;document.getElementById('ctCntTotal').textContent=all.length;}
  function refreshBadge(){const el=document.getElementById('ctBadgeCount');if(el)el.textContent=Object.keys(ROWS).length;}

  function parseTSV(text){const rows=[];let row=[],field='',inQ=false;const s=String(text||'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');for(let i=0;i<s.length;i++){const ch=s[i];if(inQ){if(ch==='"'){if(s[i+1]==='"'){field+='"';i++;}else inQ=false;}else field+=ch;}else{if(ch==='"')inQ=true;else if(ch==='\t'){row.push(field);field='';}else if(ch==='\n'){row.push(field);rows.push(row);row=[];field='';}else field+=ch;}}if(field.length||row.length){row.push(field);rows.push(row);}return rows;}
  function parseCustSheet(tsvRows){
    const out=[];
    for(let i=0;i<tsvRows.length;i++){
      const r=tsvRows[i].map(c=>(c||'').trim()); if(r.every(v=>!v))continue;
      if(r[1]&&(/^short/i.test(r[1])||(/^#$/i.test(r[0])&&/name/i.test(r[1]))))continue;
      if(r[0]&&/^no\.?$/i.test(r[0])&&/name/i.test(r[1]||''))continue;
      const short=r[1]||''; if(!short)continue;
      out.push({short,wms:r[2]||'',vn:r[3]||'',salePlan:r[4]||'',priceName:r[5]||'',branches:r[6]||''});
    }
    return out;
  }
  function openPaste(){document.getElementById('ctPasteModal').classList.add('on');setTimeout(()=>document.getElementById('ctPasteArea').focus(),50);}
  function closePaste(){document.getElementById('ctPasteModal').classList.remove('on');}
  function submitPaste(){
    /* v4.56 — extra confirm: Customer table is usually a first-time load only */
    if(window.PASTEGUARD && !PASTEGUARD.confirmFirst('Cust (Customer)','cust',submitPaste)) return;
    const txt=document.getElementById('ctPasteArea').value; if(!txt.trim()){toast('Nothing to paste','er');return;}
    const parsed=parseCustSheet(parseTSV(txt)); if(!parsed.length){toast('No valid customer data','er');return;}
    closePaste();
    const byShort={};Object.values(ROWS).forEach(r=>{const k=String(r.short||'').trim().toUpperCase();if(k)byShort[k]=r;});
    const FIELDS=['short','wms','vn','salePlan','priceName','branches'],adds=[],changes=[];
    parsed.forEach(p=>{
      const k=String(p.short).trim().toUpperCase(),ex=byShort[k];
      if(ex){const diffs=[];FIELDS.forEach(f=>{if(String(ex[f]||'')!==String(p[f]||''))diffs.push({field:f,old:String(ex[f]||''),new:String(p[f]||'')});});if(diffs.length)changes.push({rid:ex._rid,short:p.short,diffs});}
      else adds.push({rid:newRid(),fields:p});
    });
    _pendingDiff={adds,changes};
    ctShowDiff(adds,changes,parsed.length);
  }
  function ctShowDiff(adds,changes,total){
    document.getElementById('ctDiffTitle').textContent='Confirm: Import '+total+' Customers';
    document.getElementById('ctDiffSubtitle').textContent='Matched on Short Name. Existing rows not in paste are kept.';
    let html='<div class="tp-diff-stats"><div class="tp-diff-stat add"><div class="v">'+adds.length+'</div><div class="l">Added</div></div><div class="tp-diff-stat chg"><div class="v">'+changes.length+'</div><div class="l">Changed</div></div></div>';
    if(adds.length){html+='<div class="tp-diff-section add"><h4><span class="badge">+ NEW</span> '+adds.length+' customer(s)</h4><div class="tp-diff-list">';adds.slice(0,40).forEach(a=>{html+='<div class="tp-diff-item"><span class="who">'+escapeHtml(a.fields.short)+'</span> · '+escapeHtml(a.fields.wms||'—')+'</div>';});if(adds.length>40)html+='<div class="tp-diff-item" style="font-style:italic;color:var(--ink-3)">…and '+(adds.length-40)+' more</div>';html+='</div></div>';}
    if(changes.length){html+='<div class="tp-diff-section chg"><h4><span class="badge">~ CHANGED</span> '+changes.length+' customer(s)</h4><div class="tp-diff-list">';changes.slice(0,40).forEach(c=>{let line='<div class="tp-diff-item"><span class="who">'+escapeHtml(c.short)+'</span> ';c.diffs.forEach(d=>{line+='<span class="field">'+escapeHtml(d.field)+'</span><span class="ov">'+escapeHtml(d.old||'—')+'</span><span class="arr">→</span><span class="nv">'+escapeHtml(d.new||'—')+'</span> ';});html+=line+'</div>';});if(changes.length>40)html+='<div class="tp-diff-item" style="font-style:italic;color:var(--ink-3)">…and '+(changes.length-40)+' more</div>';html+='</div></div>';}
    if(!adds.length&&!changes.length)html+='<div class="tp-diff-warn" style="background:var(--green-soft);border-color:#bfe3cc;color:#157a40">✓ No changes.</div>';
    document.getElementById('ctDiffBody').innerHTML=html;document.getElementById('ctDiffModal').classList.add('on');
  }
  function closeDiff(){document.getElementById('ctDiffModal').classList.remove('on');_pendingDiff=null;}
  function confirmDiff(){
    if(!_pendingDiff){closeDiff();return;}const{adds,changes}=_pendingDiff;const batch=[];
    adds.forEach(a=>{Object.entries(a.fields).forEach(([k,v])=>batch.push({rid:a.rid,field:k,value:v}));});
    changes.forEach(c=>{c.diffs.forEach(d=>batch.push({rid:c.rid,field:d.field,value:d.new}));});
    if(!batch.length){toast('No changes','er');closeDiff();return;}
    applyAndPush(batch,'paste '+adds.length+' new / '+changes.length+' updated');
    closeDiff();rebuildTableData();document.getElementById('ctPasteArea').value='';
    toast(`Customers: ${adds.length} added, ${changes.length} updated`,'ok');
  }
  function addRow(){
    const rid=newRid();
    applyAndPush([{rid,field:'short',value:''},{rid,field:'wms',value:''},{rid,field:'vn',value:''},{rid,field:'salePlan',value:''},{rid,field:'priceName',value:''},{rid,field:'branches',value:''}],'add customer');
    rebuildTableData();toast('New row added — click a cell to edit','ok');
  }
  function clearAll(){
    const rids=Object.keys(ROWS);if(!rids.length){toast('Already empty','er');return;}
    if(!canWrite('cust')){toast('No permission','er');return;}
    /* v4.33.1 — typed-"Confirm" modal (same as per-row delete) instead of native confirm() */
    document.getElementById('delConfirmMsg').innerHTML='Delete <b>ALL '+rids.length+' customers</b>?<br>This cannot be undone.';
    document.getElementById('delConfirmInput').value='';document.getElementById('delConfirmBtn').classList.remove('ready');
    document.getElementById('delConfirmBtn').onclick=function(){
      if(document.getElementById('delConfirmInput').value.trim().toLowerCase()!=='confirm'){toast('Type "Confirm"','er');return;}
      applyAndPush(rids.map(rid=>({rid,field:'__DELETE__',value:null})),'clear all customers');rebuildTableData();
      closeDelConfirm();toast('🗑 All customers deleted','ok');
    };
    document.getElementById('delConfirmModal').classList.add('on');setTimeout(()=>document.getElementById('delConfirmInput').focus(),80);
  }
  function ctRequestDelete(rowData){
    const rid=rowData._rid,name=rowData.short||rowData.wms||'(unnamed)';
    document.getElementById('delConfirmMsg').innerHTML='Delete customer <b>"'+escapeHtml(name)+'"</b>?<br>This cannot be undone.';
    document.getElementById('delConfirmInput').value='';document.getElementById('delConfirmBtn').classList.remove('ready');
    document.getElementById('delConfirmBtn').onclick=function(){
      if(document.getElementById('delConfirmInput').value.trim().toLowerCase()!=='confirm'){toast('Type "Confirm"','er');return;}
      applyAndPush([{rid,field:'__DELETE__',value:null}],'delete');
      try{if(table){const r=table.getRow(rid);if(r)r.delete();}}catch(_){}
      refreshCounts();refreshBadge();closeDelConfirm();toast('Customer deleted','ok');
    };
    document.getElementById('delConfirmModal').classList.add('on');setTimeout(()=>document.getElementById('delConfirmInput').focus(),80);
  }
  function exportCsv(){if(table)table.download('csv','customers_'+Date.now()+'.csv');}

  return{
    init(){const c=loadCache();if(c){Object.assign(ROWS,c.data||{});_versions=c.versions||_versions;}refreshBadge();attachFirebase();},
    buildTable,rebuildTableData,openPaste,closePaste,submitPaste,closeDiff,confirmDiff,
    addRow,clearAll,exportCsv,refreshBadge,lookup,wmsName,vnName,
    aliasSave,resolvesShort,shortList,
    get table(){return table;},get ROWS(){return ROWS;}
  };
})();

/* CUST shims */
function ctOpenPaste(){CT.openPaste();}function ctClosePaste(){CT.closePaste();}function ctSubmitPaste(){CT.submitPaste();}
function ctCloseDiff(){CT.closeDiff();}function ctConfirmDiff(){CT.confirmDiff();}
function ctAddRow(){CT.addRow();}function ctClearAll(){CT.clearAll();}function ctExportCsv(){CT.exportCsv();}
document.getElementById('ctSearch').addEventListener('input',()=>{if(CT.table)CT.rebuildTableData();});

/* ============================================================
   CUSTOMER MATCH MODAL  (v4.38.0 — ported from V406)
   ─────────────────────────────────────────────────────────
   Shown at plan paste when one or more pasted customers cannot be
   resolved to a CUST Short Name. The operator types/picks a short for
   each; on Confirm the choice is remembered via CT.aliasSave so the
   Scale→TL push (and every future paste) resolves it automatically.
   unmatchedMap : { fullCustomerName : occurrenceCount }
   ============================================================ */
function _cmEsc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
function _custMatchModal(unmatchedMap){
  const existing=document.getElementById('cust-match-modal'); if(existing) existing.remove();
  const keys=Object.keys(unmatchedMap);
  if(!keys.length) return;
  const shortList=(typeof CT!=='undefined'&&CT.shortList)?CT.shortList():[];
  const m=document.createElement('div');
  m.id='cust-match-modal';
  m.style.cssText='position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px';
  let html='<div style="background:#fff;border-radius:10px;padding:20px;width:min(700px,95vw);max-height:90vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.3)">';
  html+='<div style="font-family:Oswald,sans-serif;font-size:15px;font-weight:700;color:#d62839;letter-spacing:1px;margin-bottom:6px">\u26A0 CUSTOMER NOT MATCHED TO SHORT NAME</div>';
  html+='<div style="font-size:11px;color:var(--mt);margin-bottom:12px">Type to find a Short Name. The choice is remembered for next time.</div>';
  html+='<div style="flex:1;overflow:visible;min-height:0">';
  keys.forEach((custName,idx)=>{
    const cnt=unmatchedMap[custName];
    let suggested='', cnUp=custName.toUpperCase();
    for(let i=0;i<shortList.length;i++){ if(shortList[i].length>=3 && cnUp.includes(shortList[i].toUpperCase())){ suggested=shortList[i]; break; } }
    html+='<div style="padding:8px 0;border-bottom:1px solid #eee">';
    html+='<div style="font-size:12px;font-weight:600;color:var(--tx)">'+_cmEsc(custName)+' <span style="color:var(--mt);font-weight:400">('+cnt+' order'+(cnt>1?'s':'')+')</span></div>';
    html+='<div style="position:relative;margin-top:4px">';
    html+='<input id="cm-inp-'+idx+'" autocomplete="off" value="'+_cmEsc(suggested)+'" placeholder="Type short name..." style="width:100%;padding:8px 12px;border:1.5px solid var(--bd);border-radius:5px;font-size:14px;box-sizing:border-box" oninput="_cmFilter('+idx+')" onfocus="_cmFilter('+idx+')">';
    html+='<div id="cm-dd-'+idx+'" style="display:none;position:absolute;left:0;right:0;top:100%;z-index:99999;background:#fff;border:1.5px solid var(--ce);border-radius:0 0 8px 8px;max-height:240px;overflow:auto;box-shadow:0 8px 24px rgba(0,0,0,.2)"></div>';
    html+='</div></div>';
  });
  html+='</div>';
  html+='<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">';
  html+='<button onclick="_cmSkip()" style="padding:6px 16px;border:1.5px solid #ccc;background:#fff;border-radius:5px;font-size:12px;cursor:pointer">Skip</button>';
  html+='<button onclick="_cmSave()" style="padding:6px 20px;border:none;background:var(--ce);color:#fff;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer">\u2705 Confirm</button>';
  html+='</div></div>';
  m.innerHTML=html;
  document.body.appendChild(m);
  m.addEventListener('click',e=>{
    if(!e.target.closest('[id^="cm-dd-"]')&&!e.target.closest('[id^="cm-inp-"]')){
      keys.forEach((_,i)=>{ const dd=document.getElementById('cm-dd-'+i); if(dd) dd.style.display='none'; });
    }
  });
  window._cmCtx={keys,shortList};
  for(let fi=0;fi<keys.length;fi++){ const finp=document.getElementById('cm-inp-'+fi); if(finp&&!finp.value){ finp.focus(); break; } }
}
function _cmFilter(idx){
  const inp=document.getElementById('cm-inp-'+idx), dd=document.getElementById('cm-dd-'+idx);
  if(!inp||!dd||!window._cmCtx) return;
  const q=inp.value.trim().toLowerCase(), list=window._cmCtx.shortList;
  const matches=q ? list.filter(sn=>sn.toLowerCase().includes(q)) : list.slice(0,20);
  if(!matches.length){ dd.style.display='none'; return; }
  dd.style.display='';
  dd.innerHTML=matches.map(sn=>'<div style="padding:8px 12px;font-size:13px;cursor:pointer;border-bottom:1px solid #f0f0f0;color:var(--tx)" onmousedown="_cmPick('+idx+',\''+_cmEsc(sn).replace(/'/g,"\\'")+'\')">'+_cmEsc(sn)+'</div>').join('');
}
function _cmPick(idx,val){
  const inp=document.getElementById('cm-inp-'+idx), dd=document.getElementById('cm-dd-'+idx);
  if(inp) inp.value=val; if(dd) dd.style.display='none';
}
function _cmSkip(){ const m=document.getElementById('cust-match-modal'); if(m) m.remove(); window._cmCtx=null; }
function _cmSave(){
  const ctx=window._cmCtx; if(!ctx){ _cmSkip(); return; }
  let saved=0;
  ctx.keys.forEach((custName,idx)=>{
    const inp=document.getElementById('cm-inp-'+idx);
    const shortName=(inp?inp.value:'').trim();
    if(!shortName) return;
    if(typeof CT!=='undefined'&&CT.aliasSave) CT.aliasSave(custName,shortName);
    saved++;
  });
  if(saved){
    toast('\u2705 Remembered Short Name for '+saved+' customer'+(saved>1?'s':''),'ok');
    try{ if(typeof TL!=='undefined'&&TL.rebuildTableData) TL.rebuildTableData(); }catch(_){}
  }
  const m=document.getElementById('cust-match-modal'); if(m) m.remove();
  window._cmCtx=null;
}

/* ============================================================
   PRICE MODULE  (build p3.0-price)
   ─────────────────────────────────────────────────────────
   LPG Price Table. 8 price columns per customer.
   Lookup API: PP.lookupPrice / PP.lookupByType / PP.planLookupPrice
   DEPENDS ON: CT module (priceName resolution).
   ============================================================ */
