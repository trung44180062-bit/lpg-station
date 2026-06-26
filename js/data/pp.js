/* ============================================================
 * PP  —  pp.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 15861–16141   (~281 dòng)
 * Global xuất ra : window.PP
 * Phase tách     : P3
 * Phụ thuộc      : sync, helpers
 * Khởi tạo (boot): PP.init() trong boot
 * ------------------------------------------------------------
 * MÔ TẢ: Plan Price: bảng giá theo khách/loại hàng. FIELD_LABELS (15869).
 *
 * API công khai (điền/đối chiếu khi tách):
 *   PP.init(), PP.ROWS, PP.planLookupPrice(cust,type,'')
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module PP từ dòng 15861 đến 16141.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.PP).
 *   3) node --check pp.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P3]: dán thân module PP (V4-54 dòng 15861–16141) vào đây. */

const PP = (function(){
  const ROWS = {};
  let table = null;
  let _suppressEcho = 0;
  let _versions = { price:0 };
  let _pendingDiff = null;
  const LS_KEY = 'lpg_v4_price_v1';
  const PRICE_FIELDS = ['t5050','t3070','tPure','tVessel','s5050','s3070','sPure','sVessel'];
  const FIELD_LABELS = {t5050:'T 50:50',t3070:'T 30:70',tPure:'T Pure',tVessel:'T Vessel',s5050:'S 50:50',s3070:'S 30:70',sPure:'S Pure',sVessel:'S Vessel'};

  function loadCache(){try{const r=localStorage.getItem(LS_KEY);if(!r)return null;const o=JSON.parse(r);return(o&&o.schema===1)?o:null;}catch(e){return null;}}
  function saveCache(){try{localStorage.setItem(LS_KEY,JSON.stringify({schema:1,savedAt:Date.now(),versions:_versions,data:ROWS}));}catch(e){}}

  function applyAndPush(changes,reason){
    if(!changes||!changes.length)return null;
    if(!canWrite('price')){toast('No permission','er');return null;}
    const now=Date.now(),payload={};
    changes.forEach(c=>{
      const{rid,field,value}=c;
      if(!ROWS[rid])ROWS[rid]={_rid:rid};
      if(field==='__DELETE__'){delete ROWS[rid];payload[`price_/${rid}`]=null;return;}
      let norm=value;
      if(PRICE_FIELDS.includes(field)){if(value===''||value==null)norm='';else{const n=parseFloat(String(value).replace(/,/g,''));norm=isNaN(n)?'':n;}}
      ROWS[rid][field]=norm;c.value=norm;payload[`price_/${rid}/${field}`]=norm;
      ROWS[rid].lastBy=CURRENT_USER.name;ROWS[rid].lastAt=now;
      payload[`price_/${rid}/lastBy`]=CURRENT_USER.name;payload[`price_/${rid}/lastAt`]=now;
    });
    _versions.price=(_versions.price||0)+1;payload['price_version']=_versions.price;
    saveCache();
    if(FB_DB){_suppressEcho++;
      FB_DB.ref().update(payload).then(()=>toast('Price synced ('+reason+')','ok')).catch(e=>{console.error('PP push',e);toast('Price write failed','er');})
        .finally(()=>setTimeout(()=>{_suppressEcho--;},600));
    }else toast('Saved locally (offline)','ok');
    return payload;
  }

  let FB_DB=null;
  function attachFirebase(){
    if(typeof firebase==='undefined')return; FB_DB=firebase.database();
    FB_DB.ref('price_version').on('value',s=>{const v=s.val()||0;if(v>_versions.price)_versions.price=v;});
    const ref=FB_DB.ref('price_');
    /* Reconcile — see plan module for rationale. */
    ref.once('value').then(snap=>{
      const fbData=snap.val()||{};
      const orphans=Object.keys(ROWS).filter(rid=>!Object.prototype.hasOwnProperty.call(fbData,rid));
      if(orphans.length){
        console.warn(`[price] Reconcile: pruning ${orphans.length} stale local row(s):`,orphans);
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

  function termFmt(cell){const v=cell.getValue();if(v===''||v==null)return'<span class="pp-empty">—</span>';const n=typeof v==='number'?v:parseFloat(String(v).replace(/,/g,''));if(isNaN(n))return escapeHtml(String(v));return`<span class="pp-term-cell">${n.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:3})}</span>`;}
  function spotFmt(cell){const v=cell.getValue();if(v===''||v==null)return'<span class="pp-empty">—</span>';const n=typeof v==='number'?v:parseFloat(String(v).replace(/,/g,''));if(isNaN(n))return escapeHtml(String(v));return`<span class="pp-spot-cell">${n.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:3})}</span>`;}
  function custFmt(cell){const v=String(cell.getValue()||'').trim();return v?`<span class="pp-cust">${escapeHtml(v)}</span>`:'<span class="pp-empty">— click —</span>';}

  function ppRows(){
    let arr=Object.values(ROWS);
    const q=(document.getElementById('ppSearch').value||'').trim().toLowerCase();
    if(q) arr=arr.filter(r=>(r.customer||'').toLowerCase().includes(q));
    arr.sort((a,b)=>String(a.customer||'').localeCompare(String(b.customer||'')));
    return arr;
  }
  function buildColumns(){
    return[
      {title:'#',width:42,hozAlign:'center',headerSort:false,formatter:cell=>cell.getRow().getPosition()},
      {title:'Customer',field:'customer',minWidth:160,headerSort:true,editor:'input',formatter:custFmt},
      {title:'TERM',cssClass:'pp-grp-term',columns:[
        {title:'50:50',field:'t5050',width:90,hozAlign:'right',headerSort:false,editor:'input',formatter:termFmt},
        {title:'30:70',field:'t3070',width:90,hozAlign:'right',headerSort:false,editor:'input',formatter:termFmt},
        {title:'Pure',field:'tPure',width:90,hozAlign:'right',headerSort:false,editor:'input',formatter:termFmt},
        {title:'Vessel',field:'tVessel',width:90,hozAlign:'right',headerSort:false,editor:'input',formatter:termFmt}
      ]},
      {title:'SPOT',cssClass:'pp-grp-spot',columns:[
        {title:'50:50',field:'s5050',width:90,hozAlign:'right',headerSort:false,editor:'input',formatter:spotFmt},
        {title:'30:70',field:'s3070',width:90,hozAlign:'right',headerSort:false,editor:'input',formatter:spotFmt},
        {title:'Pure',field:'sPure',width:90,hozAlign:'right',headerSort:false,editor:'input',formatter:spotFmt},
        {title:'Vessel',field:'sVessel',width:90,hozAlign:'right',headerSort:false,editor:'input',formatter:spotFmt}
      ]},
      {title:'Last Edit',field:'lastAt',width:90,headerSort:true,formatter:lastEditFormatter,cssClass:'cell-lastedit-wrap'},
      {title:'🗑',width:44,hozAlign:'center',headerSort:false,formatter:()=>'✕',cssClass:'cell-del',
        cellClick:(e,cell)=>{ppRequestDelete(cell.getRow().getData());}}
    ];
  }
  function buildTable(){
    if(table){try{table.destroy();}catch(_){}table=null;}
    table=new Tabulator('#ppGrid',{data:ppRows(),layout:'fitDataStretch',height:'100%',index:'_rid',
      columns:buildColumns(),placeholder:'No price data — click "🔄 Load Customers" or "📋 Paste Data"',clipboard:true,clipboardPasteAction:'replace'});
    table.on('cellEdited',cell=>{applyAndPush([{rid:cell.getRow().getData()._rid,field:cell.getField(),value:cell.getValue()}],'edit');setTimeout(()=>refreshCounts(),30);});
    table.on('tableBuilt',()=>{refreshCounts();refreshBadge();});
  }
  function rebuildTableData(){if(!table){buildTable();return;}try{table.replaceData(ppRows());}catch(_){buildTable();}refreshCounts();}
  function refreshCounts(){
    const all=Object.values(ROWS),filled=all.filter(r=>PRICE_FIELDS.some(f=>r[f]!==''&&r[f]!=null)).length;
    document.getElementById('ppStatFilled').textContent=filled+' with price';
    document.getElementById('ppCntShown').textContent=ppRows().length;
    document.getElementById('ppCntTotal').textContent=all.length;
  }
  function refreshBadge(){const el=document.getElementById('ppBadgeCount');if(el)el.textContent=Object.keys(ROWS).length;}

  function parseTSV(text){const rows=[];let row=[],field='',inQ=false;const s=String(text||'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');for(let i=0;i<s.length;i++){const ch=s[i];if(inQ){if(ch==='"'){if(s[i+1]==='"'){field+='"';i++;}else inQ=false;}else field+=ch;}else{if(ch==='"')inQ=true;else if(ch==='\t'){row.push(field);field='';}else if(ch==='\n'){row.push(field);rows.push(row);row=[];field='';}else field+=ch;}}if(field.length||row.length){row.push(field);rows.push(row);}return rows;}
  function parsePriceSheet(tsvRows){
    const out=[];
    for(let i=0;i<tsvRows.length;i++){
      const r=tsvRows[i].map(c=>(c||'').trim()); if(r.every(v=>!v))continue;
      let off=0; if(r.length>=10&&(/^\d+$/.test(r[0])||/^(no\.?|#|stt)$/i.test(r[0])))off=1;
      const custCol=r[off]||''; if(/^(customer|no\.?|#|stt)$/i.test(custCol)||/^short/i.test(custCol))continue;
      if(!custCol)continue;
      const pf=c=>{const v=c?parseFloat(String(c).replace(/,/g,'')):NaN;return isNaN(v)?'':v;};
      out.push({customer:custCol,t5050:pf(r[off+1]),t3070:pf(r[off+2]),tPure:pf(r[off+3]),tVessel:pf(r[off+4]),
        s5050:pf(r[off+5]),s3070:pf(r[off+6]),sPure:pf(r[off+7]),sVessel:pf(r[off+8])});
    }
    return out;
  }
  function loadFromCust(){
    const custArr=Object.values(typeof CT!=='undefined'?CT.ROWS:{});
    if(!custArr.length){toast('No customer list yet','er');return;}
    const existMap={};Object.values(ROWS).forEach(r=>{if(r.customer)existMap[r.customer.toLowerCase()]=r;});
    const batch=[];
    custArr.forEach(c=>{const sn=String(c.short||'').trim();if(!sn)return;if(existMap[sn.toLowerCase()])return;
      const rid=newRid();batch.push({rid,field:'customer',value:sn});PRICE_FIELDS.forEach(f=>batch.push({rid,field:f,value:''}));});
    if(!batch.length){toast('All customers already in price table','ok');return;}
    applyAndPush(batch,'load from customers');rebuildTableData();
    toast('Loaded '+(batch.length/(PRICE_FIELDS.length+1))+' new customers','ok');
  }
  function openPaste(){document.getElementById('ppPasteModal').classList.add('on');setTimeout(()=>document.getElementById('ppPasteArea').focus(),50);}
  function closePaste(){document.getElementById('ppPasteModal').classList.remove('on');}
  function submitPaste(){
    /* v4.56 — extra confirm: Price table is usually a first-time load only */
    if(window.PASTEGUARD && !PASTEGUARD.confirmFirst('Price','price',submitPaste)) return;
    const txt=document.getElementById('ppPasteArea').value;if(!txt.trim()){toast('Nothing to paste','er');return;}
    const parsed=parsePriceSheet(parseTSV(txt));if(!parsed.length){toast('No valid price data','er');return;}
    closePaste();
    const byName={};Object.values(ROWS).forEach(r=>{if(r.customer)byName[r.customer.toLowerCase()]=r;});
    const FIELDS=['customer',...PRICE_FIELDS],adds=[],changes=[];
    parsed.forEach(p=>{
      const k=String(p.customer).trim().toLowerCase(),ex=byName[k];
      if(ex){const diffs=[];FIELDS.forEach(f=>{if(String(ex[f]??'')!==String(p[f]??''))diffs.push({field:f,old:String(ex[f]??''),new:String(p[f]??'')});});if(diffs.length)changes.push({rid:ex._rid,customer:p.customer,diffs});}
      else adds.push({rid:newRid(),fields:p});
    });
    _pendingDiff={adds,changes};ppShowDiff(adds,changes,parsed.length);
  }
  function ppShowDiff(adds,changes,total){
    document.getElementById('ppDiffTitle').textContent='Confirm: Import '+total+' Price Rows';
    document.getElementById('ppDiffSubtitle').textContent='Matched on customer name. Existing rows not in paste are kept.';
    let html='<div class="tp-diff-stats"><div class="tp-diff-stat add"><div class="v">'+adds.length+'</div><div class="l">Added</div></div><div class="tp-diff-stat chg"><div class="v">'+changes.length+'</div><div class="l">Changed</div></div></div>';
    if(adds.length){html+='<div class="tp-diff-section add"><h4><span class="badge">+ NEW</span> '+adds.length+' row(s)</h4><div class="tp-diff-list">';adds.slice(0,30).forEach(a=>{const prices=PRICE_FIELDS.filter(f=>a.fields[f]!=='').map(f=>FIELD_LABELS[f]+'='+a.fields[f]);html+='<div class="tp-diff-item"><span class="who">'+escapeHtml(a.fields.customer)+'</span>'+(prices.length?' · '+prices.join(', '):'')+'</div>';});if(adds.length>30)html+='<div class="tp-diff-item" style="font-style:italic;color:var(--ink-3)">…and '+(adds.length-30)+' more</div>';html+='</div></div>';}
    if(changes.length){html+='<div class="tp-diff-section chg"><h4><span class="badge">~ CHANGED</span> '+changes.length+' row(s)</h4><div class="tp-diff-list">';changes.slice(0,30).forEach(c=>{let line='<div class="tp-diff-item"><span class="who">'+escapeHtml(c.customer)+'</span> ';c.diffs.forEach(d=>{line+='<span class="field">'+escapeHtml(FIELD_LABELS[d.field]||d.field)+'</span><span class="ov">'+escapeHtml(d.old||'—')+'</span><span class="arr">→</span><span class="nv">'+escapeHtml(d.new||'—')+'</span> ';});html+=line+'</div>';});if(changes.length>30)html+='<div class="tp-diff-item" style="font-style:italic;color:var(--ink-3)">…and '+(changes.length-30)+' more</div>';html+='</div></div>';}
    if(!adds.length&&!changes.length)html+='<div class="tp-diff-warn" style="background:var(--green-soft);border-color:#bfe3cc;color:#157a40">✓ No changes.</div>';
    document.getElementById('ppDiffBody').innerHTML=html;document.getElementById('ppDiffModal').classList.add('on');
  }
  function closeDiff(){document.getElementById('ppDiffModal').classList.remove('on');_pendingDiff=null;}
  function confirmDiff(){
    if(!_pendingDiff){closeDiff();return;}const{adds,changes}=_pendingDiff;const batch=[];
    adds.forEach(a=>{Object.entries(a.fields).forEach(([k,v])=>batch.push({rid:a.rid,field:k,value:v}));});
    changes.forEach(c=>{c.diffs.forEach(d=>batch.push({rid:c.rid,field:d.field,value:d.new}));});
    if(!batch.length){toast('No changes','er');closeDiff();return;}
    applyAndPush(batch,'paste '+adds.length+' new / '+changes.length+' updated');
    closeDiff();rebuildTableData();document.getElementById('ppPasteArea').value='';
    toast(`Price: ${adds.length} added, ${changes.length} updated`,'ok');
  }
  function addRow(){
    const rid=newRid(),batch=[{rid,field:'customer',value:''}];
    PRICE_FIELDS.forEach(f=>batch.push({rid,field:f,value:''}));
    applyAndPush(batch,'add price row');rebuildTableData();toast('New row added','ok');
  }
  function clearAll(){
    const rids=Object.keys(ROWS);if(!rids.length){toast('Already empty','er');return;}
    if(!canWrite('price')){toast('No permission','er');return;}
    /* v4.33.1 — typed-"Confirm" modal (same as per-row delete) instead of native confirm() */
    document.getElementById('delConfirmMsg').innerHTML='Delete <b>ALL '+rids.length+' price rows</b>?<br>This cannot be undone.';
    document.getElementById('delConfirmInput').value='';document.getElementById('delConfirmBtn').classList.remove('ready');
    document.getElementById('delConfirmBtn').onclick=function(){
      if(document.getElementById('delConfirmInput').value.trim().toLowerCase()!=='confirm'){toast('Type "Confirm"','er');return;}
      applyAndPush(rids.map(rid=>({rid,field:'__DELETE__',value:null})),'clear all prices');rebuildTableData();
      closeDelConfirm();toast('🗑 All price data deleted','ok');
    };
    document.getElementById('delConfirmModal').classList.add('on');setTimeout(()=>document.getElementById('delConfirmInput').focus(),80);
  }
  function ppRequestDelete(rowData){
    const rid=rowData._rid,name=rowData.customer||'(empty)';
    document.getElementById('delConfirmMsg').innerHTML='Delete price row <b>"'+escapeHtml(name)+'"</b>?<br>This cannot be undone.';
    document.getElementById('delConfirmInput').value='';document.getElementById('delConfirmBtn').classList.remove('ready');
    document.getElementById('delConfirmBtn').onclick=function(){
      if(document.getElementById('delConfirmInput').value.trim().toLowerCase()!=='confirm'){toast('Type "Confirm"','er');return;}
      applyAndPush([{rid,field:'__DELETE__',value:null}],'delete');
      try{if(table){const r=table.getRow(rid);if(r)r.delete();}}catch(_){}
      refreshCounts();refreshBadge();closeDelConfirm();toast('Price row deleted','ok');
    };
    document.getElementById('delConfirmModal').classList.add('on');setTimeout(()=>document.getElementById('delConfirmInput').focus(),80);
  }
  function exportCsv(){if(table)table.download('csv','price_table_'+Date.now()+'.csv');}

  /* ── Price Lookup API ── */
  function resolvePriceName(custShort){
    if(!custShort)return custShort;if(typeof CT==='undefined')return custShort;
    const arr=Object.values(CT.ROWS),cs=String(custShort).trim().toLowerCase();
    for(const c of arr){if(String(c.short||'').trim().toLowerCase()===cs)return(c.priceName||'').trim()||c.short||custShort;}
    return custShort;
  }
  function findRow(custAbbrev){
    if(!custAbbrev)return null;const arr=Object.values(ROWS);
    const pn=String(resolvePriceName(custAbbrev)).trim().toLowerCase(),ab=String(custAbbrev).trim().toLowerCase();
    for(const r of arr){if((r.customer||'').toLowerCase()===pn)return r;}
    if(pn!==ab){for(const r of arr){if((r.customer||'').toLowerCase()===ab)return r;}}
    return null;
  }
  function lookupPrice(abbrev,ratio,cargoType,trade){
    const row=findRow(abbrev);if(!row)return null;
    const ct=String(cargoType||'').trim().toLowerCase(),prefix=(ct==='spot')?'s':'t';
    const isShip=/ship/i.test(trade||'');let rt=String(ratio||'').trim().toLowerCase();
    if(rt==='vessel'&&!isShip)rt='50:50';
    let suffix='5050';
    if(rt==='30:70')suffix='3070';else if(/pure/i.test(rt))suffix='Pure';else if(/vessel|ship/i.test(rt))suffix='Vessel';
    let price=row[prefix+suffix];
    if(!price&&price!==0){const alt=(prefix==='t')?'s':'t';price=row[alt+suffix];}
    if(!price&&price!==0){const fbs=isShip?['5050','3070','Pure','Vessel']:['5050','3070','Pure'];for(const fb of fbs){if(fb===suffix)continue;price=row[prefix+fb];if(price||price===0)break;}}
    if(!price&&price!==0){const alt2=(prefix==='t')?'s':'t';const fbs2=isShip?['5050','3070','Pure','Vessel']:['5050','3070','Pure'];for(const fb of fbs2){if(fb===suffix)continue;price=row[alt2+fb];if(price||price===0)break;}}
    if(!price&&price!==0)return null;const p=parseFloat(price);if(isNaN(p))return null;
    return{price:p,ppName:row.customer,cargoType:ct||'term'};
  }
  function lookupByType(custShort,productType,cargoType,trade){
    const t=String(productType||'').toLowerCase();let ratio='50:50';
    const rm=t.match(/(?<![a-z])(\d{2}):(\d{2})(?![a-z])/);
    if(rm)ratio=rm[1]+':'+rm[2];else if(/pure/i.test(productType))ratio='Pure';else if(/vessel|ship/i.test(productType))ratio='vessel';
    return lookupPrice(custShort,ratio,cargoType,trade);
  }
  function planLookupPrice(custShort,type,cargoType){
    const t=String(type||'').toLowerCase();let ratio='50:50';
    const rm=t.match(/(?<![a-z])(\d{2}):(\d{2})(?![a-z])/);
    if(rm)ratio=rm[1]+':'+rm[2];else if(/pure/i.test(type))ratio='Pure';else if(/vessel|ship/i.test(type))ratio='vessel';
    const trade=/vessel|ship/i.test(type)?'Domestic (Ship)':'Domestic';
    /* v4.56.x — detect SPOT/TERM from the type string when caller passes none.
       Plan rows carry cargo type inside `type` (e.g. "50:50 Cargo July cargo SPOT pre 262").
       Without this, cargoType defaulted to 'term' and customers with BOTH term+spot
       prices filled (e.g. Gas South) always returned the term price. */
    const ct=cargoType||(/\bspot\b/i.test(type)?'spot':(/\bterm\b/i.test(type)?'term':'term'));
    const result=lookupPrice(custShort,ratio,ct,trade);return result?result.price:null;
  }

  return{
    init(){const c=loadCache();if(c){Object.assign(ROWS,c.data||{});_versions=c.versions||_versions;}refreshBadge();attachFirebase();},
    buildTable,rebuildTableData,loadFromCust,openPaste,closePaste,submitPaste,closeDiff,confirmDiff,
    addRow,clearAll,exportCsv,refreshBadge,lookupPrice,lookupByType,planLookupPrice,
    get table(){return table;},get ROWS(){return ROWS;}
  };
})();

/* PRICE shims */
function ppOpenPaste(){PP.openPaste();}function ppClosePaste(){PP.closePaste();}function ppSubmitPaste(){PP.submitPaste();}
function ppCloseDiff(){PP.closeDiff();}function ppConfirmDiff(){PP.confirmDiff();}
function ppAddRow(){PP.addRow();}function ppLoadFromCust(){PP.loadFromCust();}
function ppClearAll(){PP.clearAll();}function ppExportCsv(){PP.exportCsv();}
document.getElementById('ppSearch').addEventListener('input',()=>{if(PP.table)PP.rebuildTableData();});

/* close SAP/CUST/PRICE modals on Escape */
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    ['spPasteModal','spDiffModal','ctPasteModal','ctDiffModal','ppPasteModal','ppDiffModal'].forEach(id=>{
      document.getElementById(id).classList.remove('on');
    });
  }
});

/* ============================================================
   SCALE STATION MODULE — v4.11.0 (p3.3-cert-check-dual-lot)
   ────────────────────────────────────────────────────
   VERSION LOG:
   p3.3 — Card header 2× bigger; Cert Check panel; dual lot; engineer/check-booth; row-1 color indicator.
     • Card header: font 16px, padding 8px, buttons bigger
     • Rmooc same font size as plate (16px)
     • TK-3501 and TK-3502 now each have their own card with its own lot input (#scLotInp1 / #scLotInp2);
       latest lot is auto-pulled from ENG.ROWS (Tank Log) on selection (v4.18.8)
     • When tank selected → Row 1 cell 1 changes colour (blue/orange tint)
     • Staff1 → Engineer, Staff2 → Check Booth
     • Cert Check panel: live search across ALL fleet tabs (tanklorry+tractor+rmooc)
       Results show plate/rmooc, cert dots per cert status
       Click opens cert detail modal with: stt#, volume (m³ input + safe-fill calc), cert table, remark
       Save goes through SC.editBatch (fleet write path, not direct FB ref)
     • Cert detail modal: consistent with app design tokens
     • Tab initialises with Scale subtab active (no TP buildTable on first load)
   ============================================================ */
