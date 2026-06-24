/* ============================================================
 * SP  —  sp.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 15160–15504   (~345 dòng)
 * Global xuất ra : window.SP
 * Phase tách     : P3
 * Phụ thuộc      : sync, helpers
 * Khởi tạo (boot): SP.init() trong boot
 * ------------------------------------------------------------
 * MÔ TẢ: SAP ZMMFR022: ROWS {date, sloc(1100/2100/2101/B100), mat(C3/C4), batch(P/X/D/E), init,gr,gi,trs,end}. Kèm ALLOWED_SLOC, MAT_MAP, SLOC_NAME.
 *
 * API công khai (điền/đối chiếu khi tách):
 *   SP.init(), SP.ROWS, SP.render(), SP.parse(text)
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module SP từ dòng 15160 đến 15504.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.SP).
 *   3) node --check sp.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P3]: dán thân module SP (V4-54 dòng 15160–15504) vào đây. */

const SP = (function(){
  const ROWS = {};
  let table = null;
  let _suppressEcho = 0;
  let _versions = { sap:0 };
  let _pendingDiff = null;
  let dateFilter = '';
  let _analysisVisible = true;
  const LS_KEY = 'lpg_v4_sap_v1';
  const NUM_FIELDS = new Set(['init','gr','gi','trs','end']);
  const ALLOWED_SLOC = {'1100':1,'2100':1,'2101':1,'B100':1};
  const MAT_MAP = {'20008511':'C3','20008512':'C4'};
  const SLOC_NAME = {'1100':'Cavern','2100':'TK-3501','2101':'TK-3502','B100':'Heater'};

  function loadCache(){
    try{ const r=localStorage.getItem(LS_KEY); if(!r) return null; const o=JSON.parse(r); return(o&&o.schema===1)?o:null; }catch(e){ return null; }
  }
  function saveCache(){
    try{ localStorage.setItem(LS_KEY, JSON.stringify({schema:1,savedAt:Date.now(),versions:_versions,data:ROWS})); }catch(e){}
  }
  function sapNum(v){
    let s=String(v||0).trim().replace(/,/g,'');
    if(s.length>1&&s[s.length-1]==='-') s='-'+s.slice(0,-1);
    s=s.replace(/\u2212/g,'-');
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
  function isoToDisplay(iso){
    if(!iso) return '';
    const p=iso.split('-'); return(p.length===3)?p[2]+'/'+p[1]+'/'+p[0].slice(2):iso;
  }
  function compKey(r){ return(r.date||'')+'|'+(r.sloc||'')+'|'+(r.mat||'')+'|'+(r.batch||''); }
  function parseTSV(text){
    const rows=[]; let row=[],field='',inQ=false;
    const s=String(text||'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
    for(let i=0;i<s.length;i++){
      const ch=s[i];
      if(inQ){ if(ch==='"'){if(s[i+1]==='"'){field+='"';i++;}else inQ=false;}else field+=ch; }
      else{ if(ch==='"')inQ=true;else if(ch==='\t'){row.push(field);field='';}else if(ch==='\n'){row.push(field);rows.push(row);row=[];field='';}else field+=ch; }
    }
    if(field.length||row.length){row.push(field);rows.push(row);} return rows;
  }
  function parseSapSheet(tsvRows){
    const agg={}; let rawCount=0,skippedSloc=0;
    tsvRows.forEach(cols=>{
      if(cols.length<10) return;
      const c0=String(cols[0]||'').trim().toLowerCase();
      if(c0==='pu'||c0.includes('plant')||c0.includes('material')) return;
      const mat=MAT_MAP[String(cols[2]||'').trim()]; if(!mat) return;
      const sloc=String(cols[4]||'').trim(); if(!ALLOWED_SLOC[sloc]){skippedSloc++;return;}
      const date=sapParseDate(cols[6]); if(!date||date.length<10) return;
      const bType=sapBatch(cols[7]); if(!bType) return;
      rawCount++;
      const k=date+'|'+sloc+'|'+mat+'|'+bType;
      if(!agg[k]) agg[k]={date,sloc,mat,batch:bType,init:0,gr:0,gi:0,trs:0,end:0};
      agg[k].init+=sapNum(cols[8]); agg[k].gr+=sapNum(cols[11]); agg[k].gi+=sapNum(cols[13]);
      agg[k].trs+=sapNum(cols[15]); agg[k].end+=sapNum(cols[17]);
    });
    const result=Object.values(agg);
    result.forEach(r=>{r.init=Math.round(r.init);r.gr=Math.round(r.gr);r.gi=Math.round(r.gi);r.trs=Math.round(r.trs);r.end=Math.round(r.end);});
    return{rows:result,rawCount,skippedSloc};
  }

  function applyAndPush(changes, reason){
    if(!changes||!changes.length) return null;
    if(!canWrite('sap')){toast('No permission','er');return null;}
    const now=Date.now(), payload={};
    changes.forEach(c=>{
      const{rid,field,value}=c;
      if(!ROWS[rid]) ROWS[rid]={_rid:rid};
      if(field==='__DELETE__'){delete ROWS[rid];payload[`sap_/${rid}`]=null;return;}
      let norm=value;
      if(NUM_FIELDS.has(field)){const n=parseFloat(String(value||'').replace(/,/g,''));norm=isNaN(n)?0:Math.round(n);}
      ROWS[rid][field]=norm; c.value=norm;
      payload[`sap_/${rid}/${field}`]=norm;
      ROWS[rid].lastBy=CURRENT_USER.name; ROWS[rid].lastAt=now;
      payload[`sap_/${rid}/lastBy`]=CURRENT_USER.name; payload[`sap_/${rid}/lastAt`]=now;
    });
    _versions.sap=(_versions.sap||0)+1; payload['sap_version']=_versions.sap;
    saveCache();
    if(FB_DB){_suppressEcho++;
      FB_DB.ref().update(payload).then(()=>toast('SAP synced ('+reason+')','ok')).catch(e=>{console.error('SP push',e);toast('SAP write failed','er');})
        .finally(()=>setTimeout(()=>{_suppressEcho--;},600));
    }else toast('Saved locally (offline)','ok');
    return payload;
  }

  let FB_DB=null;
  function attachFirebase(){
    if(typeof firebase==='undefined') return; FB_DB=firebase.database();
    FB_DB.ref('sap_version').on('value',s=>{const v=s.val()||0;if(v>_versions.sap)_versions.sap=v;});
    const ref=FB_DB.ref('sap_');
    /* Reconcile local cache against Firebase to prune stale rows.
       See plan module for full rationale. */
    ref.once('value').then(snap=>{
      const fbData=snap.val()||{};
      const orphans=Object.keys(ROWS).filter(rid=>!Object.prototype.hasOwnProperty.call(fbData,rid));
      if(orphans.length){
        console.warn(`[sap] Reconcile: pruning ${orphans.length} stale local row(s):`,orphans);
        orphans.forEach(rid=>delete ROWS[rid]);
        saveCache();
        if(table) rebuildTableData();
        refreshCounts(); refreshBadge();
        try{ renderAnalysis(); }catch(_){}
      }
    }).catch(()=>{});
    ref.on('child_added',snap=>{if(_suppressEcho)return;const rid=snap.key,row=snap.val();if(!row)return;row._rid=rid;ROWS[rid]=row;saveCache();if(table)rebuildTableData();refreshCounts();refreshBadge();renderAnalysis();});
    ref.on('child_changed',snap=>{if(_suppressEcho)return;const rid=snap.key,row=snap.val();if(!row)return;row._rid=rid;ROWS[rid]=row;saveCache();if(table){const r=table.getRow(rid);if(r)r.update(row);else table.addRow(row);}refreshCounts();refreshBadge();renderAnalysis();});
    ref.on('child_removed',snap=>{if(_suppressEcho)return;const rid=snap.key;delete ROWS[rid];saveCache();if(table){const r=table.getRow(rid);if(r)r.delete();}refreshCounts();refreshBadge();renderAnalysis();});
  }

  /* formatters */
  function kgFmt(cell){
    const v=cell.getValue(); if(v===''||v==null) return '<span class="sp-empty-cell">—</span>';
    const n=typeof v==='number'?v:parseFloat(String(v).replace(/,/g,''));
    if(isNaN(n)) return escapeHtml(String(v)); if(n===0) return '<span class="sp-kg-zero">0</span>';
    return `<span class="${n<0?'sp-kg-neg':'sp-kg-pos'}">${n.toLocaleString('en-US')}</span><span class="u">kg</span>`;
  }
  function endFmt(cell){
    const row=cell.getRow().getData(),calc=(row.init||0)+(row.gr||0)+(row.gi||0)+(row.trs||0),actual=row.end||0;
    const ok=Math.abs(calc-actual)<=1, n=typeof actual==='number'?actual:parseFloat(String(actual).replace(/,/g,''));
    if(isNaN(n)) return escapeHtml(String(actual));
    return `<span class="sp-kg${n<0?' sp-kg-neg':n>0?' sp-kg-pos':' sp-kg-zero'}${ok?'':' sp-end-err'}">${n.toLocaleString('en-US')}</span><span class="u">kg</span>`;
  }
  function dateFmt(cell){const v=String(cell.getValue()||'').trim();return v?`<span class="sp-date">${escapeHtml(isoToDisplay(v))}</span>`:'<span class="sp-empty-cell">—</span>';}
  function slocFmt(cell){const v=String(cell.getValue()||'').trim();if(!v)return'<span class="sp-empty-cell">—</span>';const nm=SLOC_NAME[v]||'';return`<span class="sp-sloc">${escapeHtml(v)}</span>${nm?'<span style="color:var(--ink-3);font-size:9px;margin-left:3px">'+escapeHtml(nm)+'</span>':''}`;}
  function matFmt(cell){const v=String(cell.getValue()||'').trim();if(!v)return'<span class="sp-empty-cell">—</span>';return`<span class="sp-mat ${v==='C3'?'sp-mat-c3':v==='C4'?'sp-mat-c4':''}">${escapeHtml(v)}</span>`;}
  function batchFmt(cell){const v=String(cell.getValue()||'').trim().toUpperCase();if(!v)return'<span class="sp-empty-cell">—</span>';return`<span class="sp-batch sp-batch-${v.toLowerCase()}">${escapeHtml(v)}</span>`;}

  function spRows(){
    let arr=Object.values(ROWS);
    const q=(document.getElementById('spSearch').value||'').trim().toLowerCase();
    if(q) arr=arr.filter(r=>((r.date||'')+(r.sloc||'')+(r.mat||'')+(r.batch||'')+(SLOC_NAME[r.sloc]||'')).toLowerCase().includes(q));
    if(dateFilter) arr=arr.filter(r=>isoToDisplay(r.date)===dateFilter);
    arr.sort((a,b)=>{const ka=(a.date||'')+a.sloc+a.mat+a.batch,kb=(b.date||'')+b.sloc+b.mat+b.batch;return ka<kb?-1:(ka>kb?1:0);});
    return arr;
  }
  function buildColumns(){
    return[
      {title:'#',width:42,hozAlign:'center',headerSort:false,formatter:cell=>cell.getRow().getPosition()},
      {title:'Date',field:'date',width:95,headerSort:true,formatter:dateFmt,sorter:(a,b)=>String(a||'').localeCompare(String(b||''))},
      {title:'SLoc',field:'sloc',width:110,headerSort:true,formatter:slocFmt},
      {title:'Mat',field:'mat',width:55,hozAlign:'center',headerSort:true,formatter:matFmt},
      {title:'Batch',field:'batch',width:60,hozAlign:'center',headerSort:true,formatter:batchFmt},
      {title:'Init (kg)',field:'init',width:100,hozAlign:'right',headerSort:true,formatter:kgFmt},
      {title:'GR',field:'gr',width:85,hozAlign:'right',headerSort:true,formatter:kgFmt},
      {title:'GI',field:'gi',width:95,hozAlign:'right',headerSort:true,formatter:kgFmt},
      {title:'Trs',field:'trs',width:95,hozAlign:'right',headerSort:true,formatter:kgFmt},
      {title:'End (kg)',field:'end',width:100,hozAlign:'right',headerSort:true,formatter:endFmt},
      {title:'Last Edit',field:'lastAt',width:90,headerSort:true,formatter:lastEditFormatter,cssClass:'cell-lastedit-wrap'},
      {title:'🗑',width:44,hozAlign:'center',headerSort:false,formatter:()=>'✕',cssClass:'cell-del',
        cellClick:(e,cell)=>{spRequestDelete(cell.getRow().getData());}}
    ];
  }
  function buildTable(){
    if(table){try{table.destroy();}catch(_){} table=null;}
    table=new Tabulator('#spGrid',{data:spRows(),layout:'fitDataStretch',height:'100%',index:'_rid',
      columns:buildColumns(),placeholder:'No SAP data — click "📋 Paste from Excel" to import',clipboard:true,clipboardPasteAction:'replace'});
    table.on('cellEdited',cell=>{applyAndPush([{rid:cell.getRow().getData()._rid,field:cell.getField(),value:cell.getValue()}],'edit');setTimeout(()=>{refreshCounts();renderAnalysis();},30);});
    table.on('tableBuilt',()=>{refreshCounts();refreshBadge();renderAnalysis();});
  }
  function rebuildTableData(){
    if(!table){buildTable();return;} try{table.replaceData(spRows());}catch(_){buildTable();} refreshCounts();renderAnalysis();
  }
  function refreshCounts(){
    const all=Object.values(ROWS),data=spRows(),dates={};
    data.forEach(r=>{if(r.date)dates[r.date]=1;});
    document.getElementById('spCntDays').textContent=Object.keys(dates).length;
    document.getElementById('spCntRows').textContent=data.length;
    document.getElementById('spCntShown').textContent=data.length;
    document.getElementById('spCntTotal').textContent=all.length;
  }
  function refreshBadge(){const el=document.getElementById('spBadgeCount');if(el)el.textContent=Object.keys(ROWS).length;}

  /* analysis panel */
  function computeAnalysis(){
    const tanks=['2100','2101'],mats=['C3','C4'],result={};
    tanks.forEach(tk=>{result[tk]={};mats.forEach(mt=>{result[tk][mt]={init:null,end:null,gi:0,gr:0,trs:0};});});
    const rows=dateFilter?Object.values(ROWS).filter(r=>isoToDisplay(r.date)===dateFilter):Object.values(ROWS);
    const tankRows={'2100':[],'2101':[]};
    rows.forEach(r=>{if(r.sloc!=='2100'&&r.sloc!=='2101')return;if(r.batch!=='D'&&r.batch!=='E')return;tankRows[r.sloc].push(r);});
    tanks.forEach(sl=>{
      const rr=tankRows[sl]; if(!rr.length)return;
      const dates={}; rr.forEach(r=>{dates[r.date]=1;});
      const sorted=Object.keys(dates).sort(), first=sorted[0], last=sorted[sorted.length-1];
      rr.forEach(r=>{
        if(r.date===first){if(result[sl][r.mat].init===null)result[sl][r.mat].init=0;result[sl][r.mat].init+=(r.init||0);}
        if(r.date===last){if(result[sl][r.mat].end===null)result[sl][r.mat].end=0;result[sl][r.mat].end+=(r.end||0);}
        result[sl][r.mat].gi+=(r.gi||0);result[sl][r.mat].gr+=(r.gr||0);result[sl][r.mat].trs+=(r.trs||0);
      });
    });
    return result;
  }
  function fmtKg(v){if(v===null||v===undefined)return'—';if(v===0)return'<span style="color:var(--ink-3)">0</span>';const s=Math.round(v).toLocaleString('en-US');return v<0?`<span style="color:var(--red)">${s}</span>`:s;}
  function fmtLpg(c3,c4){if((c3==null)&&(c4==null))return'—';return Math.round((c3||0)+(c4||0)).toLocaleString('en-US');}
  function renderAnalysis(){
    const an=computeAnalysis(),rows=Object.values(ROWS);
    const filtered=dateFilter?rows.filter(r=>isoToDisplay(r.date)===dateFilter):rows;
    document.getElementById('spAnScope').textContent=dateFilter?'Filtered: '+dateFilter:'All dates';
    document.getElementById('spAnStats').textContent=filtered.length+' rows analyzed';
    /* v4.22.16 — toggle the in-header clear button alongside the toolbar one */
    const _spAnClr=document.getElementById('spAnDateClr');
    if(_spAnClr) _spAnClr.style.display=dateFilter?'inline-flex':'none';
    const items=[{label:'Initial Stock',key:'init'},{label:'Good Receipt (GR)',key:'gr'},{label:'Good Issue (GI)',key:'gi'},{label:'Transfer (Trs)',key:'trs'},{label:'End Stock',key:'end',bold:true}];
    let html='';
    if(!filtered.length){html='<tr><td colspan="7" style="text-align:center;padding:12px;color:var(--ink-3);font-style:italic">No data</td></tr>';}
    else items.forEach(item=>{
      const d1=an['2100'],d2=an['2101'];
      const bS=item.bold?'background:#eef4fa;font-weight:700':'';
      html+=`<tr${bS?' style="'+bS+'"':''}>`;
      html+=`<td class="lbl-cell">${escapeHtml(item.label)}</td>`;
      html+=`<td>${fmtKg(d1.C3[item.key])}</td><td>${fmtKg(d1.C4[item.key])}</td>`;
      html+=`<td style="font-weight:700;border-right:2px solid var(--line);background:#eef4fa">${fmtLpg(d1.C3[item.key],d1.C4[item.key])}</td>`;
      html+=`<td>${fmtKg(d2.C3[item.key])}</td><td>${fmtKg(d2.C4[item.key])}</td>`;
      html+=`<td style="font-weight:700;background:#fdf5ec">${fmtLpg(d2.C3[item.key],d2.C4[item.key])}</td></tr>`;
    });
    document.getElementById('spAnTbody').innerHTML=html;
  }
  function toggleAnalysis(){_analysisVisible=!_analysisVisible;document.getElementById('spAnalysisWrap').style.display=_analysisVisible?'':'none';document.getElementById('spAnToggleBtn').textContent=_analysisVisible?'Hide':'Show Analysis';}

  /* paste flow */
  function openPaste(){document.getElementById('spPasteModal').classList.add('on');setTimeout(()=>document.getElementById('spPasteArea').focus(),50);}
  function closePaste(){document.getElementById('spPasteModal').classList.remove('on');}
  function submitPaste(){
    const txt=document.getElementById('spPasteArea').value;
    if(!txt.trim()){toast('Nothing to paste','er');return;}
    /* v4.56 — anti misplaced-paste: block if the data clearly belongs to WMS GI/ST */
    const _rows=parseTSV(txt);
    if(window.PASTEGUARD && !PASTEGUARD.guard(_rows,'sap')) return;
    const parsed=parseSapSheet(_rows);
    if(!parsed.rows.length){toast('No valid SAP data found (SLoc 1100/2100/2101/B100, Mat C3/C4)','er');return;}
    closePaste();
    const byKey={}; Object.values(ROWS).forEach(r=>{byKey[compKey(r)]=r;});
    const FIELDS=['date','sloc','mat','batch','init','gr','gi','trs','end'];
    const adds=[],changes=[];
    parsed.rows.forEach(p=>{
      const k=compKey(p),ex=byKey[k];
      if(ex){const diffs=[];FIELDS.forEach(f=>{if(String(ex[f]?? '')!==String(p[f]??''))diffs.push({field:f,old:String(ex[f]??''),new:String(p[f]??'')});});if(diffs.length)changes.push({rid:ex._rid,key:k,diffs});}
      else adds.push({rid:newRid(),fields:p});
    });
    _pendingDiff={adds,changes,stats:parsed};
    showDiff(adds,changes,parsed);
  }
  function showDiff(adds,changes,stats){
    document.getElementById('spDiffTitle').textContent='Confirm: Import SAP ZMMFR022';
    document.getElementById('spDiffSubtitle').textContent=stats.rawCount+' raw → '+stats.rows.length+' aggregated. '+(stats.skippedSloc?stats.skippedSloc+' filtered. ':'')+'Matched on Date+SLoc+Mat+Batch.';
    let html='<div class="tp-diff-stats">';
    html+=`<div class="tp-diff-stat add"><div class="v">${adds.length}</div><div class="l">Added</div></div>`;
    html+=`<div class="tp-diff-stat chg"><div class="v">${changes.length}</div><div class="l">Changed</div></div></div>`;
    if(adds.length){html+=`<div class="tp-diff-section add"><h4><span class="badge">+ NEW</span> ${adds.length} row(s)</h4><div class="tp-diff-list">`;adds.slice(0,40).forEach(a=>{const r=a.fields;html+=`<div class="tp-diff-item"><span class="who">${escapeHtml(r.date)}</span> · ${escapeHtml(r.sloc)} · ${escapeHtml(r.mat)} · ${escapeHtml(r.batch)} · End ${(r.end||0).toLocaleString('en-US')}kg</div>`;});if(adds.length>40)html+='<div class="tp-diff-item" style="font-style:italic;color:var(--ink-3)">…and '+(adds.length-40)+' more</div>';html+='</div></div>';}
    if(changes.length){html+=`<div class="tp-diff-section chg"><h4><span class="badge">~ CHANGED</span> ${changes.length} row(s)</h4><div class="tp-diff-list">`;changes.slice(0,40).forEach(c=>{let line=`<div class="tp-diff-item"><span class="who">${escapeHtml(c.key)}</span> `;c.diffs.forEach(d=>{line+=`<span class="field">${escapeHtml(d.field)}</span><span class="ov">${escapeHtml(d.old||'—')}</span><span class="arr">→</span><span class="nv">${escapeHtml(d.new||'—')}</span> `;});html+=line+'</div>';});if(changes.length>40)html+='<div class="tp-diff-item" style="font-style:italic;color:var(--ink-3)">…and '+(changes.length-40)+' more</div>';html+='</div></div>';}
    if(!adds.length&&!changes.length) html+='<div class="tp-diff-warn" style="background:var(--green-soft);border-color:#bfe3cc;color:#157a40">✓ No changes — paste identical.</div>';
    document.getElementById('spDiffBody').innerHTML=html;
    document.getElementById('spDiffModal').classList.add('on');
  }
  function closeDiff(){document.getElementById('spDiffModal').classList.remove('on');_pendingDiff=null;}
  function confirmDiff(){
    if(!_pendingDiff){closeDiff();return;} const{adds,changes}=_pendingDiff; const batch=[];
    adds.forEach(a=>{Object.entries(a.fields).forEach(([k,v])=>batch.push({rid:a.rid,field:k,value:v}));});
    changes.forEach(c=>{c.diffs.forEach(d=>batch.push({rid:c.rid,field:d.field,value:d.new}));});
    if(!batch.length){toast('No changes','er');closeDiff();return;}
    applyAndPush(batch,'paste '+adds.length+' new / '+changes.length+' updated');
    closeDiff();rebuildTableData();document.getElementById('spPasteArea').value='';
    toast(`SAP: ${adds.length} added, ${changes.length} updated`,'ok');
  }
  function rangeDelete(){
    if(!Object.keys(ROWS).length){ toast('Already empty','er'); return; }
    if(!canWrite('sap')){ toast('No permission','er'); return; }
    BULKOPS.openRangeDelete({
      title:'DELETE DATA — SAP',
      fileBase:'sap',
      skipCsvBackup:true,   /* no CSV download on delete (user request) */
      getRows: ()=> Object.values(ROWS),
      getRid:  r=> r._rid,
      getDate: r=> (r.date ? new Date(r.date+'T00:00:00') : null),
      columns: [
        {title:'Date', field:'date'},{title:'SLoc', field:'sloc'},
        {title:'Mat', field:'mat'},{title:'Batch', field:'batch'},
        {title:'Init (kg)', field:'init'},{title:'GR', field:'gr'},
        {title:'GI', field:'gi'},{title:'Trs', field:'trs'},
        {title:'End (kg)', field:'end'}
      ],
      deleteRids: (rids)=>{
        applyAndPush(rids.map(rid=>({rid,field:'__DELETE__',value:null})),'range-delete SAP ('+rids.length+' rows)');
        try{ logAudit('sales:sap:range_delete','_bulk_','_rangeDelete', rids.length+' rows','','delete'); }catch(_){}
        rebuildTableData();
      }
    });
  }
  function spRequestDelete(rowData){
    const rid=rowData._rid, name=isoToDisplay(rowData.date)+' '+rowData.sloc+' '+rowData.mat+' '+rowData.batch;
    document.getElementById('delConfirmMsg').innerHTML='Delete SAP row <b>"'+escapeHtml(name)+'"</b>?<br>This cannot be undone.';
    document.getElementById('delConfirmInput').value='';document.getElementById('delConfirmBtn').classList.remove('ready');
    document.getElementById('delConfirmBtn').onclick=function(){
      if(document.getElementById('delConfirmInput').value.trim().toLowerCase()!=='confirm'){toast('Type "Confirm"','er');return;}
      applyAndPush([{rid,field:'__DELETE__',value:null}],'delete');
      try{if(table){const r=table.getRow(rid);if(r)r.delete();}}catch(_){}
      refreshCounts();refreshBadge();renderAnalysis();closeDelConfirm();toast('SAP row deleted','ok');
    };
    document.getElementById('delConfirmModal').classList.add('on');
    setTimeout(()=>document.getElementById('delConfirmInput').focus(),80);
  }
  function openPicker(){const dp=document.getElementById('spDatePick');dp.style.pointerEvents='auto';if(dp.showPicker)try{dp.showPicker();}catch(_){dp.click();}else dp.click();}
  function pickerChange(){const dp=document.getElementById('spDatePick');if(dp.value){dateFilter=normalizeDate(dp.value);document.getElementById('spDateFilter').value=dateFilter;document.getElementById('spDateFilter').classList.add('active');document.getElementById('spDateClear').classList.add('on');rebuildTableData();}}
  function clearDate(){dateFilter='';document.getElementById('spDateFilter').value='';document.getElementById('spDateFilter').classList.remove('active');document.getElementById('spDatePick').value='';document.getElementById('spDateClear').classList.remove('on');rebuildTableData();}
  function exportCsv(){if(table)table.download('csv','sap_'+Date.now()+'.csv');}

  return{
    init(){const c=loadCache();if(c){Object.assign(ROWS,c.data||{});_versions=c.versions||_versions;}refreshBadge();attachFirebase();},
    buildTable,rebuildTableData,openPaste,closePaste,submitPaste,closeDiff,confirmDiff,rangeDelete,exportCsv,
    openPicker,pickerChange,clearDate,refreshBadge,renderAnalysis,toggleAnalysis,
    get table(){return table;},get ROWS(){return ROWS;}
  };
})();

/* SAP shims */
function spOpenPaste(){SP.openPaste();}function spClosePaste(){SP.closePaste();}function spSubmitPaste(){SP.submitPaste();}
function spCloseDiff(){SP.closeDiff();}function spConfirmDiff(){SP.confirmDiff();}
function spRangeDelete(){SP.rangeDelete();}function spExportCsv(){SP.exportCsv();}
function spOpenPicker(){SP.openPicker();}function spClearDate(){SP.clearDate();}
function spToggleAnalysis(){SP.toggleAnalysis();}
document.getElementById('spSearch').addEventListener('input',()=>{if(SP.table)SP.rebuildTableData();});
document.getElementById('spDateFilter').addEventListener('change',()=>{
  const raw=(document.getElementById('spDateFilter').value||'').trim();
  if(!raw){SP.clearDate();return;} SP.pickerChange();
});
document.getElementById('spDatePick').addEventListener('change',()=>{SP.pickerChange();});

/* ============================================================
   CUSTOMER MODULE  (build p3.0-cust)
   ─────────────────────────────────────────────────────────
   Customer master list. Per-field delta writes (cust_/{rid}/{field}).
   Lookup API: CT.lookup(wmsName) → short name.
   ============================================================ */
