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

  /* ═══════════════════════════════════════════════════════════════
     v4.86 — RATIO COLUMNS (dynamic)
     ───────────────────────────────────────────────────────────────
     Một "ratio" = một cặp cột TERM + SPOT. Field name giữ đúng quy
     ước cũ nên dữ liệu hiện có KHÔNG phải migrate:
         ratio '50:50' → key '5050' → field t5050 / s5050
         ratio '60:40' → key '6040' → field t6040 / s6040
     4 ratio gốc khoá cứng (locked) — không xoá được.
     Ratio user thêm lưu ở node Firebase 'price_cols/{key}' để mọi
     máy thấy cùng một bộ cột; bump chung 'price_version'.
     ═══════════════════════════════════════════════════════════════ */
  const BASE_RATIOS = [
    {key:'5050',  label:'50:50',  locked:true},
    {key:'3070',  label:'30:70',  locked:true},
    {key:'Pure',  label:'Pure',   locked:true},
    {key:'Vessel',label:'Vessel', locked:true}
  ];
  let EXTRA = {};                       /* key -> {key,label,order,addedBy,addedAt} */
  function ratios(){
    const ex = Object.values(EXTRA).sort((a,b)=>(a.order||0)-(b.order||0)||String(a.label).localeCompare(String(b.label)));
    return BASE_RATIOS.concat(ex.map(e=>({key:e.key,label:e.label,locked:false})));
  }
  function ratioKey(label){ return String(label==null?'':label).replace(/[^A-Za-z0-9]/g,''); }
  function priceFields(){ const rr=ratios(); return rr.map(r=>'t'+r.key).concat(rr.map(r=>'s'+r.key)); }
  function isPriceField(f){ return priceFields().includes(f); }
  function fieldLabel(f){
    const grp = f[0]==='t' ? 'T' : (f[0]==='s' ? 'S' : '');
    const hit = ratios().find(r=>('t'+r.key)===f||('s'+r.key)===f);
    return hit ? (grp+' '+hit.label) : f;
  }

  function loadCache(){try{const r=localStorage.getItem(LS_KEY);if(!r)return null;const o=JSON.parse(r);return(o&&o.schema===1)?o:null;}catch(e){return null;}}
  function saveCache(){try{localStorage.setItem(LS_KEY,JSON.stringify({schema:1,savedAt:Date.now(),versions:_versions,data:ROWS,cols:EXTRA}));}catch(e){}}

  function applyAndPush(changes,reason){
    if(!changes||!changes.length)return null;
    if(!canWrite('price')){toast('No permission','er');return null;}
    const now=Date.now(),payload={};
    changes.forEach(c=>{
      const{rid,field,value}=c;
      if(!ROWS[rid])ROWS[rid]={_rid:rid};
      if(field==='__DELETE__'){delete ROWS[rid];payload[`price_/${rid}`]=null;return;}
      let norm=value;
      if(isPriceField(field)){if(value===''||value==null)norm='';else{const n=parseFloat(String(value).replace(/,/g,''));norm=isNaN(n)?'':n;}}
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
    /* v4.86 — bộ cột ratio dùng chung. Node nhỏ, 1 listener, đọc cả cục. */
    FB_DB.ref('price_cols').on('value',s=>{
      const v=s.val()||{},next={};
      Object.keys(v).forEach(k=>{
        const e=v[k]||{};const key=String(e.key||k);
        if(BASE_RATIOS.some(b=>b.key===key))return;               /* không cho ghi đè 4 cột gốc */
        next[key]={key,label:String(e.label||key),order:Number(e.order)||0,addedBy:e.addedBy||'',addedAt:e.addedAt||0};
      });
      if(JSON.stringify(next)===JSON.stringify(EXTRA))return;
      EXTRA=next;saveCache();refreshHint();
      if(table)buildTable();                                       /* đổi cột → dựng lại grid */
    });
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
      /* v4.86 — hai nhóm cột sinh động từ ratios(); cột user thêm có dấu • ở tiêu đề */
      {title:'TERM',cssClass:'pp-grp-term',columns:ratios().map(r=>(
        {title:(r.locked?'':'• ')+r.label,field:'t'+r.key,width:90,hozAlign:'right',headerSort:false,editor:'input',formatter:termFmt})
      )},
      {title:'SPOT',cssClass:'pp-grp-spot',columns:ratios().map(r=>(
        {title:(r.locked?'':'• ')+r.label,field:'s'+r.key,width:90,hozAlign:'right',headerSort:false,editor:'input',formatter:spotFmt})
      )},
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
    const PF=priceFields(),all=Object.values(ROWS),filled=all.filter(r=>PF.some(f=>r[f]!==''&&r[f]!=null)).length;
    document.getElementById('ppStatFilled').textContent=filled+' with price';
    document.getElementById('ppCntShown').textContent=ppRows().length;
    document.getElementById('ppCntTotal').textContent=all.length;
  }
  function refreshBadge(){const el=document.getElementById('ppBadgeCount');if(el)el.textContent=Object.keys(ROWS).length;}
  /* Dòng chú thích cột trên toolbar — bám theo ratios() thay vì text cứng. */
  function refreshHint(){
    const el=document.getElementById('ppRatioHint');if(!el)return;
    const list=ratios().map(r=>r.label).join(' · ');
    el.textContent='TERM: '+list+'  |  SPOT: '+list;
  }

  function parseTSV(text){const rows=[];let row=[],field='',inQ=false;const s=String(text||'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');for(let i=0;i<s.length;i++){const ch=s[i];if(inQ){if(ch==='"'){if(s[i+1]==='"'){field+='"';i++;}else inQ=false;}else field+=ch;}else{if(ch==='"')inQ=true;else if(ch==='\t'){row.push(field);field='';}else if(ch==='\n'){row.push(field);rows.push(row);row=[];field='';}else field+=ch;}}if(field.length||row.length){row.push(field);rows.push(row);}return rows;}
  /* v4.86 — cột dán bám theo priceFields() (TERM trái → phải, rồi SPOT), nên
     thêm ratio là bảng dán tự nới ra, không cần sửa parser nữa. */
  function parsePriceSheet(tsvRows){
    const PF=priceFields(),minLen=PF.length+2,out=[];
    for(let i=0;i<tsvRows.length;i++){
      const r=tsvRows[i].map(c=>(c||'').trim()); if(r.every(v=>!v))continue;
      let off=0; if(r.length>=minLen&&(/^\d+$/.test(r[0])||/^(no\.?|#|stt)$/i.test(r[0])))off=1;
      const custCol=r[off]||''; if(/^(customer|no\.?|#|stt)$/i.test(custCol)||/^short/i.test(custCol))continue;
      if(!custCol)continue;
      const pf=c=>{const v=c?parseFloat(String(c).replace(/,/g,'')):NaN;return isNaN(v)?'':v;};
      const rec={customer:custCol};
      PF.forEach((f,ix)=>{rec[f]=pf(r[off+1+ix]);});
      out.push(rec);
    }
    return out;
  }
  function loadFromCust(){
    const custArr=Object.values(typeof CT!=='undefined'?CT.ROWS:{});
    if(!custArr.length){toast('No customer list yet','er');return;}
    const PF=priceFields();
    const existMap={};Object.values(ROWS).forEach(r=>{if(r.customer)existMap[r.customer.toLowerCase()]=r;});
    const batch=[];
    custArr.forEach(c=>{const sn=String(c.short||'').trim();if(!sn)return;if(existMap[sn.toLowerCase()])return;
      const rid=newRid();batch.push({rid,field:'customer',value:sn});PF.forEach(f=>batch.push({rid,field:f,value:''}));});
    if(!batch.length){toast('All customers already in price table','ok');return;}
    applyAndPush(batch,'load from customers');rebuildTableData();
    toast('Loaded '+(batch.length/(PF.length+1))+' new customers','ok');
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
    const FIELDS=['customer',...priceFields()],adds=[],changes=[];
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
    if(adds.length){html+='<div class="tp-diff-section add"><h4><span class="badge">+ NEW</span> '+adds.length+' row(s)</h4><div class="tp-diff-list">';adds.slice(0,30).forEach(a=>{const prices=priceFields().filter(f=>a.fields[f]!=='').map(f=>fieldLabel(f)+'='+a.fields[f]);html+='<div class="tp-diff-item"><span class="who">'+escapeHtml(a.fields.customer)+'</span>'+(prices.length?' · '+prices.join(', '):'')+'</div>';});if(adds.length>30)html+='<div class="tp-diff-item" style="font-style:italic;color:var(--ink-3)">…and '+(adds.length-30)+' more</div>';html+='</div></div>';}
    if(changes.length){html+='<div class="tp-diff-section chg"><h4><span class="badge">~ CHANGED</span> '+changes.length+' row(s)</h4><div class="tp-diff-list">';changes.slice(0,30).forEach(c=>{let line='<div class="tp-diff-item"><span class="who">'+escapeHtml(c.customer)+'</span> ';c.diffs.forEach(d=>{line+='<span class="field">'+escapeHtml(fieldLabel(d.field))+'</span><span class="ov">'+escapeHtml(d.old||'—')+'</span><span class="arr">→</span><span class="nv">'+escapeHtml(d.new||'—')+'</span> ';});html+=line+'</div>';});if(changes.length>30)html+='<div class="tp-diff-item" style="font-style:italic;color:var(--ink-3)">…and '+(changes.length-30)+' more</div>';html+='</div></div>';}
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
    priceFields().forEach(f=>batch.push({rid,field:f,value:''}));
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

  /* ═══════════════════════════════════════════════════════════════
     v4.86 — QUẢN LÝ CỘT RATIO
     Ghi Firebase: 'price_cols/{key}' (+ bump price_version). Thêm cột
     KHÔNG đụng tới dữ liệu giá — ô chưa nhập chỉ là field vắng mặt.
     ═══════════════════════════════════════════════════════════════ */
  function _pushCols(payload,reason){
    if(!canWrite('price')){toast('No permission','er');return false;}
    _versions.price=(_versions.price||0)+1;payload['price_version']=_versions.price;
    saveCache();
    if(FB_DB){
      _suppressEcho++;
      FB_DB.ref().update(payload).then(()=>toast('Ratio columns synced ('+reason+')','ok'))
        .catch(e=>{console.error('PP cols push',e);toast('Column write failed','er');})
        .finally(()=>setTimeout(()=>{_suppressEcho--;},600));
    }else toast('Saved locally (offline)','ok');
    return true;
  }
  /* Số ô đang có giá của một ratio (dùng để cảnh báo trước khi xoá) */
  function _filledOf(key){
    let n=0;Object.values(ROWS).forEach(r=>{
      if(r['t'+key]!==''&&r['t'+key]!=null)n++;
      if(r['s'+key]!==''&&r['s'+key]!=null)n++;
    });return n;
  }
  function addRatio(){
    const inp=document.getElementById('ppRatioInput');
    const label=String(inp?inp.value:'').trim();
    if(!label){toast('Nhập tỉ lệ, vd 60:40','er');return;}
    const key=ratioKey(label);
    if(!key){toast('Tỉ lệ phải có ít nhất một chữ/số','er');return;}
    if(ratios().some(r=>r.key.toLowerCase()===key.toLowerCase())){toast('Tỉ lệ này đã có cột rồi','er');return;}
    if(!confirm('Thêm tỉ lệ "'+label+'"?\n\n'
      +'→ 2 cột mới: TERM '+label+' và SPOT '+label+'\n'
      +'→ field Firebase: t'+key+' / s'+key+'\n\n'
      +'Ghi 1 bản ghi nhỏ vào price_cols, KHÔNG đụng dữ liệu giá hiện có.')) return;
    const order=Math.max(0,...Object.values(EXTRA).map(e=>e.order||0))+1;
    const rec={key,label,order,addedBy:(typeof CURRENT_USER!=='undefined'&&CURRENT_USER.name)||'',addedAt:Date.now()};
    EXTRA[key]=rec;
    if(!_pushCols({['price_cols/'+key]:rec},'add '+label)){delete EXTRA[key];return;}
    if(inp)inp.value='';
    buildTable();refreshHint();renderRatios();
    toast('Đã thêm cột '+label,'ok');
  }
  function delRatio(key){
    const r=ratios().find(x=>x.key===key);
    if(!r){toast('Không tìm thấy cột','er');return;}
    if(r.locked){toast('4 cột gốc không xoá được','er');return;}
    if(!canWrite('price')){toast('No permission','er');return;}
    const n=_filledOf(key);
    document.getElementById('delConfirmMsg').innerHTML=
      'Xoá cột <b>'+escapeHtml(r.label)+'</b> (TERM + SPOT)?<br>'
      +(n?('<b style="color:var(--red)">'+n+' ô đang có giá sẽ bị xoá vĩnh viễn.</b><br>'):'Chưa ô nào có giá.<br>')
      +'Không thể hoàn tác.';
    document.getElementById('delConfirmInput').value='';
    document.getElementById('delConfirmBtn').classList.remove('ready');
    document.getElementById('delConfirmBtn').onclick=function(){
      if(document.getElementById('delConfirmInput').value.trim().toLowerCase()!=='confirm'){toast('Type "Confirm"','er');return;}
      const payload={['price_cols/'+key]:null};
      Object.values(ROWS).forEach(row=>{
        ['t'+key,'s'+key].forEach(f=>{
          if(row[f]!==''&&row[f]!=null){payload['price_/'+row._rid+'/'+f]=null;delete row[f];}
        });
      });
      delete EXTRA[key];
      _pushCols(payload,'delete '+r.label);
      closeDelConfirm();buildTable();refreshHint();renderRatios();
      toast('🗑 Đã xoá cột '+r.label,'ok');
    };
    document.getElementById('delConfirmModal').classList.add('on');
    setTimeout(()=>document.getElementById('delConfirmInput').focus(),80);
  }
  function _buildRatioModal(){
    if(document.getElementById('ppRatioModal'))return;
    const bg=document.createElement('div');
    bg.className='tl-paste-modal';bg.id='ppRatioModal';
    bg.setAttribute('onclick',"if(event.target===this)PP.closeRatios()");
    bg.innerHTML=''
      +'<div class="tl-paste-box" style="width:560px">'
      +  '<div class="tl-paste-hdr"><h3>⚙ RATIO COLUMNS — tỉ lệ sản phẩm</h3>'
      +    '<button class="tl-paste-x" onclick="PP.closeRatios()">✕</button></div>'
      +  '<div class="tl-paste-body">'
      +    '<div class="pp-ratio-add">'
      +      '<input id="ppRatioInput" placeholder="Tỉ lệ mới — vd 60:40, 70:30, C3 Pure…" '
      +        'onkeydown="if(event.key===\'Enter\')PP.addRatio()">'
      +      '<button class="btn btn-green" onclick="PP.addRatio()">＋ Thêm</button>'
      +    '</div>'
      +    '<div class="pp-ratio-list" id="ppRatioList"></div>'
      +    '<div class="pp-ratio-hint">Mỗi tỉ lệ sinh ra 2 cột: một bên TERM, một bên SPOT. '
      +      'Bộ cột dùng chung cho mọi máy. Bảng dán từ Excel đọc theo đúng thứ tự cột ở đây '
      +      '(Customer → toàn bộ TERM → toàn bộ SPOT).</div>'
      +  '</div>'
      +  '<div class="tl-paste-foot"><button class="btn" onclick="PP.closeRatios()">Đóng</button></div>'
      +'</div>';
    document.body.appendChild(bg);
  }
  function renderRatios(){
    const box=document.getElementById('ppRatioList');if(!box)return;
    box.innerHTML=ratios().map(r=>{
      const n=_filledOf(r.key);
      return '<div class="pp-ratio-it'+(r.locked?' locked':'')+'">'
        +'<span class="nm">'+escapeHtml(r.label)+'</span>'
        +'<span class="fk">t'+r.key+' / s'+r.key+'</span>'
        +'<span class="ct">'+n+' ô có giá</span>'
        +(r.locked?'<span class="lk">cột gốc</span>'
                  :'<button class="rm" onclick="PP.delRatio(\''+escapeHtml(r.key)+'\')" title="Xoá cột">✕</button>')
        +'</div>';
    }).join('');
  }
  function openRatios(){_buildRatioModal();renderRatios();document.getElementById('ppRatioModal').classList.add('on');
    setTimeout(()=>{const i=document.getElementById('ppRatioInput');if(i)i.focus();},60);}
  function closeRatios(){const m=document.getElementById('ppRatioModal');if(m)m.classList.remove('on');}

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
  /* v4.86 — ratio (dạng '60:40' / 'Pure' / nhãn user tự đặt) → key cột.
     Khớp CHÍNH XÁC theo ratios() trước, sau đó mới đoán pure/vessel. */
  function suffixFor(ratio){
    const rt=String(ratio||'').trim();if(!rt)return '5050';
    const k=ratioKey(rt).toLowerCase();
    const hit=ratios().find(r=>r.key.toLowerCase()===k||r.label.toLowerCase()===rt.toLowerCase());
    if(hit)return hit.key;
    if(/pure/i.test(rt))return 'Pure';
    if(/vessel|ship/i.test(rt))return 'Vessel';
    return '5050';
  }
  /* Rút ratio ra từ chuỗi mô tả hàng ("50:50 Cargo July SPOT", "Pure Propane"…).
     Nhãn user thêm được ưu tiên (dài trước) để không bị nhãn gốc nuốt mất. */
  function ratioFromText(txt){
    const s=String(txt||'');
    const custom=ratios().filter(r=>!r.locked).sort((a,b)=>b.label.length-a.label.length);
    for(const r of custom){
      const esc=r.label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      if(new RegExp('(?:^|[^A-Za-z0-9])'+esc+'(?:[^A-Za-z0-9]|$)','i').test(s))return r.label;
    }
    const rm=s.toLowerCase().match(/(?<![a-z])(\d{2}):(\d{2})(?![a-z])/);
    if(rm)return rm[1]+':'+rm[2];
    if(/pure/i.test(s))return 'Pure';
    if(/vessel|ship/i.test(s))return 'vessel';
    return '50:50';
  }
  function lookupPrice(abbrev,ratio,cargoType,trade){
    const row=findRow(abbrev);if(!row)return null;
    const ct=String(cargoType||'').trim().toLowerCase(),prefix=(ct==='spot')?'s':'t';
    const isShip=/ship/i.test(trade||'');let rt=String(ratio||'').trim();
    if(rt.toLowerCase()==='vessel'&&!isShip)rt='50:50';
    const suffix=suffixFor(rt),alt=(prefix==='t')?'s':'t';
    /* Chuỗi fallback sinh động — ratio user thêm cũng nằm trong đây. */
    const fbs=ratios().map(r=>r.key).filter(k=>isShip||k!=='Vessel');
    let price=row[prefix+suffix];
    if(!price&&price!==0)price=row[alt+suffix];
    if(!price&&price!==0){for(const fb of fbs){if(fb===suffix)continue;price=row[prefix+fb];if(price||price===0)break;}}
    if(!price&&price!==0){for(const fb of fbs){if(fb===suffix)continue;price=row[alt+fb];if(price||price===0)break;}}
    if(!price&&price!==0)return null;const p=parseFloat(price);if(isNaN(p))return null;
    return{price:p,ppName:row.customer,cargoType:ct||'term'};
  }
  function lookupByType(custShort,productType,cargoType,trade){
    return lookupPrice(custShort,ratioFromText(productType),cargoType,trade);
  }
  function planLookupPrice(custShort,type,cargoType){
    const ratio=ratioFromText(type);
    const trade=/vessel|ship/i.test(type)?'Domestic (Ship)':'Domestic';
    /* v4.56.x — detect SPOT/TERM from the type string when caller passes none.
       Plan rows carry cargo type inside `type` (e.g. "50:50 Cargo July cargo SPOT pre 262").
       Without this, cargoType defaulted to 'term' and customers with BOTH term+spot
       prices filled (e.g. Gas South) always returned the term price. */
    const ct=cargoType||(/\bspot\b/i.test(type)?'spot':(/\bterm\b/i.test(type)?'term':'term'));
    const result=lookupPrice(custShort,ratio,ct,trade);return result?result.price:null;
  }

  return{
    init(){const c=loadCache();if(c){Object.assign(ROWS,c.data||{});_versions=c.versions||_versions;EXTRA=c.cols||{};}
      refreshBadge();refreshHint();attachFirebase();},
    buildTable,rebuildTableData,loadFromCust,openPaste,closePaste,submitPaste,closeDiff,confirmDiff,
    addRow,clearAll,exportCsv,refreshBadge,lookupPrice,lookupByType,planLookupPrice,
    openRatios,closeRatios,addRatio,delRatio,ratios,priceFields,
    get table(){return table;},get ROWS(){return ROWS;}
  };
})();

/* PRICE shims */
function ppOpenPaste(){PP.openPaste();}function ppClosePaste(){PP.closePaste();}function ppSubmitPaste(){PP.submitPaste();}
function ppCloseDiff(){PP.closeDiff();}function ppConfirmDiff(){PP.confirmDiff();}
function ppAddRow(){PP.addRow();}function ppLoadFromCust(){PP.loadFromCust();}
function ppClearAll(){PP.clearAll();}function ppExportCsv(){PP.exportCsv();}
function ppOpenRatios(){PP.openRatios();}   /* v4.86 — quản lý cột tỉ lệ */
document.getElementById('ppSearch').addEventListener('input',()=>{if(PP.table)PP.rebuildTableData();});

/* close SAP/CUST/PRICE modals on Escape */
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    ['spPasteModal','spDiffModal','ctPasteModal','ctDiffModal','ppPasteModal','ppDiffModal','ppRatioModal'].forEach(id=>{
      const el=document.getElementById(id);if(el)el.classList.remove('on');   /* ppRatioModal dựng lazy */
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
