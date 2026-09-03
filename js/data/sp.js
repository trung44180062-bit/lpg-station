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
  /* ── v4.100 — BỘ LỌC SLoc / Batch / Batch code + TỔNG THEO LỌC ──────
     • dateFilter mặc định = NGÀY HÔM QUA (D-1) ngay lần đầu mở tab SAP:
       SAP chốt số theo ngày đã đóng sổ, hôm nay chưa có ZMMFR022 đủ.
       Chỉ set 1 lần (_dfInit) — người dùng xoá/đổi thì tôn trọng lựa chọn.
     • slocFilter / batchFilter (1 ký tự P/X/D/E) / bcodeFilter (mã batch
       đầy đủ của kho ngoại quan 1100) đều là AND với nhau và với ô Search.
     • Danh sách Batch code trong dropdown dựng ĐỘNG theo date+sloc+batch
       đang chọn ⇒ không bao giờ hiện mã không có dòng nào. */
  let slocFilter  = '';
  let batchFilter = '';
  let bcodeFilter = '';
  let matFilter   = '';       /* v4.120.1 — lọc cấu tử C3 / C4 */
  let _dfInit = false;
  /* v4.122 — MẶC ĐỊNH ẨN. Bảng dự báo đã nằm sẵn trên thanh SCALE CONSOLE;
     ở tab SAP nó chỉ là bản đầy đủ để soi khi cần, mở sẵn là đẩy lưới SAP —
     thứ người ta vào tab này để xem — tụt xuống dưới màn hình. */
  let _analysisVisible = false;
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
  /* NGÀY HÔM QUA ở dạng DD/MM/YY — cùng khuôn với dateFilter (normalizeDate). */
  function yesterdayDMY(){
    const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-1);
    const p=n=>String(n).padStart(2,'0');
    return p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+String(d.getFullYear()).slice(-2);
  }
  /* Set dateFilter + đồng bộ ô nhập / nút ✕ (không tự rebuild bảng). */
  function setDateFilter(dmy){
    dateFilter=dmy||'';
    const inp=document.getElementById('spDateFilter');
    if(inp){ inp.value=dateFilter; inp.classList.toggle('active',!!dateFilter); }
    const clr=document.getElementById('spDateClear');
    if(clr) clr.classList.toggle('on',!!dateFilter);
    const pick=document.getElementById('spDatePick');
    if(pick && !dateFilter) pick.value='';
  }
  /* ============================================================
     v4.89 — TÁCH BATCH Ở SLoc 1100 (kho ngoại quan)
     ------------------------------------------------------------
     Trước đây mọi SLoc đều gộp về 1 ký tự batch (P/X/D/E). Riêng 1100 là
     kho ngoại quan: mỗi tờ khai Get Out = 1 batch SAP riêng (260804X001…)
     và phải trừ lùi từng batch tới 0 mới khai Hải quan hoàn thành xuất
     kho ⇒ gộp là mất thông tin. Nay:
        • thêm field `bcode` = MÃ BATCH ĐẦY ĐỦ, CHỈ cho SLoc 1100
        • `batch` vẫn là 1 ký tự → mọi module khác (alloc/cav/rpt) cộng dồn
          theo ký tự nên KHÔNG bị ảnh hưởng, chỉ là nhiều dòng hơn
        • compKey gồm bcode ⇒ 1100 tách dòng, các SLoc khác giữ nguyên khoá
     Dòng 1100 GỘP CŨ (không có bcode) sẽ được đề nghị xoá NGAY TRONG BẢNG
     XÁC NHẬN khi dán bản mới phủ đúng ngày+mat đó — xem findLegacy1100().
     v4.99 — đã BỎ nút 🧹 Clean 1100: cách xử lý chính thức khi dữ liệu cũ
     lộn xộn là XOÁ SẠCH rồi dán lại (🗑 Range delete), không dọn từng phần.
     ============================================================ */
  const SLOC_SPLIT_BATCH = { '1100':1 };
  /* ── v4.98 — MÃ BATCH HỢP LỆ CỦA SLoc 1100 ────────────────────
     Kho ngoại quan luôn đánh mã YYMMDD + P/X/D/E + số thứ tự: 260714X001.
     ⚠ Mã lạ thì VẪN GIỮ DÒNG, chỉ báo cảnh báo — KHÔNG được bỏ đi.
     Bỏ dòng sẽ làm hụt tổng End/GR/GI của SLoc 1100 trong Daily Stock
     (cav.js cộng theo sloc|ký-tự-batch|mat). Điều bắt buộc duy nhất là
     mã lạ đó vẫn nằm ở bcode RIÊNG của nó ⇒ không bao giờ bị gộp chung. */
  const BCODE_RE = /^\d{6}[DEPX]\d{1,4}$/;
  function isBcode(v){ return BCODE_RE.test(String(v||'').trim().toUpperCase()); }
  function compKey(r){
    return(r.date||'')+'|'+(r.sloc||'')+'|'+(r.mat||'')+'|'+(r.batch||'')+'|'+(r.bcode||'');
  }
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
    const bad1100=[];                 /* mã batch 1100 sai khuôn — KHÔNG gộp */
    tsvRows.forEach(cols=>{
      if(cols.length<10) return;
      const c0=String(cols[0]||'').trim().toLowerCase();
      if(c0==='pu'||c0.includes('plant')||c0.includes('material')) return;
      const mat=MAT_MAP[String(cols[2]||'').trim()]; if(!mat) return;
      const sloc=String(cols[4]||'').trim(); if(!ALLOWED_SLOC[sloc]){skippedSloc++;return;}
      const date=sapParseDate(cols[6]); if(!date||date.length<10) return;
      const raw=String(cols[7]||'').trim().toUpperCase();
      /* ── SLoc 1100 = kho ngoại quan: LUÔN tách theo MÃ BATCH ĐẦY ĐỦ ──
         bcode = nguyên mã ⇒ hai batch cùng chữ cái, cùng ngày KHÔNG bao giờ
         bị cộng chung. Mã lạ (không đúng khuôn YYMMDD+P/X/D/E+số) vẫn được
         giữ nguyên dòng — chỉ đưa vào bad1100 để cảnh báo — vì bỏ đi sẽ làm
         hụt tổng SLoc 1100 của Daily Stock.
         Các SLoc khác (2100 / 2101 / B100) giữ nguyên cách gộp 1 ký tự. */
      let bcode='', bType='';
      if(SLOC_SPLIT_BATCH[sloc]){
        if(!raw) return;                              /* dòng tổng của SAP */
        bType=isBcode(raw) ? raw[6] : sapBatch(raw);
        if(!bType) return;
        bcode=raw;
        if(!isBcode(raw)) bad1100.push({date,mat,raw,batch:bType});
      }else{
        bType=sapBatch(raw); if(!bType) return;
      }
      rawCount++;
      const k=date+'|'+sloc+'|'+mat+'|'+bType+'|'+bcode;
      if(!agg[k]) agg[k]={date,sloc,mat,batch:bType,bcode,init:0,gr:0,gi:0,trs:0,end:0};
      agg[k].init+=sapNum(cols[8]); agg[k].gr+=sapNum(cols[11]); agg[k].gi+=sapNum(cols[13]);
      agg[k].trs+=sapNum(cols[15]); agg[k].end+=sapNum(cols[17]);
    });
    const result=Object.values(agg);
    result.forEach(r=>{r.init=Math.round(r.init);r.gr=Math.round(r.gr);r.gi=Math.round(r.gi);r.trs=Math.round(r.trs);r.end=Math.round(r.end);});
    const n1100=result.filter(r=>r.sloc==='1100').length;
    return{rows:result,rawCount,skippedSloc,bad1100,n1100};
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
  /* mã batch đầy đủ — chỉ SLoc 1100 có; SLoc khác hiện '—' là ĐÚNG, không phải lỗi */
  function bcodeFmt(cell){
    const v=String(cell.getValue()||'').trim().toUpperCase();
    if(!v) return '<span class="sp-empty-cell">—</span>';
    return `<span class="sp-bcode">${escapeHtml(v)}</span>`;
  }

  function spRows(){
    let arr=Object.values(ROWS);
    const q=(document.getElementById('spSearch').value||'').trim().toLowerCase();
    /* v4.98 — tìm & sắp theo CẢ MÃ BATCH ĐẦY ĐỦ: gõ "260714X001" vào ô tìm
       là ra đúng dòng, và các batch của cùng ngày/mat xếp theo mã cho dễ đối
       chiếu với tab KNQ. */
    if(q) arr=arr.filter(r=>((r.date||'')+(r.sloc||'')+(r.mat||'')+(r.batch||'')+
      (r.bcode||'')+(SLOC_NAME[r.sloc]||'')).toLowerCase().includes(q));
    if(dateFilter)  arr=arr.filter(r=>isoToDisplay(r.date)===dateFilter);
    if(slocFilter)  arr=arr.filter(r=>String(r.sloc||'')===slocFilter);
    if(matFilter)   arr=arr.filter(r=>String(r.mat||'').toUpperCase()===matFilter);
    if(batchFilter) arr=arr.filter(r=>String(r.batch||'').toUpperCase()===batchFilter);
    if(bcodeFilter) arr=arr.filter(r=>String(r.bcode||'').toUpperCase()===bcodeFilter);
    arr.sort((a,b)=>{
      const ka=(a.date||'')+a.sloc+a.mat+a.batch+(a.bcode||''),
            kb=(b.date||'')+b.sloc+b.mat+b.batch+(b.bcode||'');
      return ka<kb?-1:(ka>kb?1:0); });
    return arr;
  }
  function buildColumns(){
    return[
      {title:'#',width:42,hozAlign:'center',headerSort:false,formatter:cell=>cell.getRow().getPosition()},
      {title:'Date',field:'date',width:95,headerSort:true,formatter:dateFmt,sorter:(a,b)=>String(a||'').localeCompare(String(b||''))},
      {title:'SLoc',field:'sloc',width:110,headerSort:true,formatter:slocFmt},
      {title:'Mat',field:'mat',width:55,hozAlign:'center',headerSort:true,formatter:matFmt},
      {title:'Batch',field:'batch',width:60,hozAlign:'center',headerSort:true,formatter:batchFmt},
      {title:'Batch code',field:'bcode',width:105,hozAlign:'center',headerSort:true,formatter:bcodeFmt,
       tooltip:'Mã batch đầy đủ — chỉ SLoc 1100 (kho ngoại quan) mới tách theo mã batch'},
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
    /* Lần đầu mở tab SAP: chốt mặc định về NGÀY HÔM QUA (D-1). */
    if(!_dfInit){ _dfInit=true; setDateFilter(yesterdayDMY()); }
    refreshBcodeOptions();
    if(table){try{table.destroy();}catch(_){} table=null;}
    table=new Tabulator('#spGrid',{data:spRows(),layout:'fitDataStretch',height:'100%',index:'_rid',
      columns:buildColumns(),placeholder:'No SAP data — click "📋 Paste from Excel" to import',clipboard:true,clipboardPasteAction:'replace'});
    table.on('cellEdited',cell=>{applyAndPush([{rid:cell.getRow().getData()._rid,field:cell.getField(),value:cell.getValue()}],'edit');setTimeout(()=>{refreshCounts();renderAnalysis();},30);});
    table.on('tableBuilt',()=>{refreshCounts();refreshBadge();renderAnalysis();});
  }
  function rebuildTableData(){
    if(!table){buildTable();return;} refreshBcodeOptions();
    try{table.replaceData(spRows());}catch(_){buildTable();} refreshCounts();renderAnalysis();
  }
  function refreshCounts(){
    const all=Object.values(ROWS),data=spRows(),dates={};
    data.forEach(r=>{if(r.date)dates[r.date]=1;});
    document.getElementById('spCntDays').textContent=Object.keys(dates).length;
    document.getElementById('spCntRows').textContent=data.length;
    document.getElementById('spCntShown').textContent=data.length;
    document.getElementById('spCntTotal').textContent=all.length;
    renderTotals(data);
  }

  /* ============================================================
     TỔNG CỦA PHẦN ĐANG LỌC  (v4.100)
     ------------------------------------------------------------
     Cộng đúng những dòng đang hiển thị trong bảng (search + date +
     sloc + batch + batch code). Init/GR/GI/Trs/End là số SAP thô,
     KHÔNG nắn, KHÔNG suy diễn — chỉ cộng. Thêm dòng tách C3/C4 để
     đối chiếu nhanh với Daily Stock / KNQ.
     ⚠ Init & End là số TỒN tại mốc: cộng nhiều NGÀY lại thì con số
     tổng vô nghĩa. Nên khi phạm vi lọc trải > 1 ngày, hai ô đó hiện
     dấu ⚠ để người dùng biết chỉ GR/GI/Trs mới cộng dồn được.
     ============================================================ */
  function totFmt(v){
    v=Math.round(v||0);
    if(!v) return '<span style="color:var(--ink-3)">0</span>';
    const s=v.toLocaleString('en-US');
    return v<0?'<span style="color:var(--red)">'+s+'</span>':s;
  }
  function renderTotals(rows){
    const bar=document.getElementById('spTotBar'); if(!bar) return;
    const data=rows||spRows();
    const T={init:0,gr:0,gi:0,trs:0,end:0};
    const M={C3:{init:0,gr:0,gi:0,trs:0,end:0},C4:{init:0,gr:0,gi:0,trs:0,end:0}};
    const days={};
    data.forEach(r=>{
      ['init','gr','gi','trs','end'].forEach(k=>{
        const n=+r[k]||0; T[k]+=n; if(M[r.mat]) M[r.mat][k]+=n;
      });
      if(r.date) days[r.date]=1;
    });
    const nDays=Object.keys(days).length, multi=nDays>1;
    const warn=multi?' <span class="sp-tot-warn" title="Đang lọc nhiều ngày — Init/End là số tồn tại mốc, cộng dồn nhiều ngày không có ý nghĩa">⚠</span>':'';
    const set=(id,html)=>{const el=document.getElementById(id); if(el) el.innerHTML=html;};
    set('spTotInit',totFmt(T.init)+warn);
    set('spTotGr',  totFmt(T.gr));
    set('spTotGi',  totFmt(T.gi));
    set('spTotTrs', totFmt(T.trs));
    set('spTotEnd', totFmt(T.end)+warn);
    /* nhãn phạm vi lọc */
    const parts=[];
    if(dateFilter)  parts.push('📅 '+dateFilter);
    if(slocFilter)  parts.push('🏷 '+slocFilter+(SLOC_NAME[slocFilter]?' · '+SLOC_NAME[slocFilter]:''));
    if(matFilter)   parts.push('⚗ '+matFilter);
    if(batchFilter) parts.push('🔖 Batch '+batchFilter);
    if(bcodeFilter) parts.push('🧾 '+bcodeFilter);
    const q=(document.getElementById('spSearch')||{}).value||'';
    if(q.trim()) parts.push('🔍 "'+q.trim()+'"');
    set('spTotScope', parts.length?parts.map(escapeHtml).join(' <i>·</i> ')
        :'<span style="color:var(--ink-3)">Tất cả dữ liệu</span>');
    set('spTotRows', data.length+' dòng'+(nDays?' · '+nDays+' ngày':''));
    /* tách C3 / C4 theo End (số hay dùng nhất) */
    set('spTotSplit', data.length
      ? 'C3 '+totFmt(M.C3.end)+' <i>·</i> C4 '+totFmt(M.C4.end)+' <i>· End</i>'
      : '');
    bar.classList.toggle('filtered',
      !!(dateFilter||slocFilter||matFilter||batchFilter||bcodeFilter||q.trim()));
  }

  /* Danh sách MÃ BATCH khả dụng theo date+sloc+batch đang chọn. */
  function bcodeChoices(){
    const s={};
    Object.values(ROWS).forEach(r=>{
      if(!r||!r.bcode) return;
      if(dateFilter  && isoToDisplay(r.date)!==dateFilter) return;
      if(slocFilter  && String(r.sloc||'')!==slocFilter) return;
      if(matFilter   && String(r.mat||'').toUpperCase()!==matFilter) return;
      if(batchFilter && String(r.batch||'').toUpperCase()!==batchFilter) return;
      s[String(r.bcode).trim().toUpperCase()]=1;
    });
    return Object.keys(s).sort();
  }
  function refreshBcodeOptions(){
    const sel=document.getElementById('spBcodeFilter'); if(!sel) return;
    const list=bcodeChoices();
    /* giữ lại mã đang lọc dù nó rơi ra ngoài phạm vi ⇒ không im lặng đổi filter */
    const opts=(bcodeFilter && list.indexOf(bcodeFilter)<0)?[bcodeFilter].concat(list):list;
    let html='<option value="">Batch code · All ('+list.length+')</option>';
    opts.forEach(b=>{html+='<option value="'+escapeHtml(b)+'">'+escapeHtml(b)+'</option>';});
    sel.innerHTML=html; sel.value=bcodeFilter;
    sel.classList.toggle('active',!!bcodeFilter);
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
  /* ══ v4.120.1 — BẢNG "SAP STOCK SUMMARY" CŨ ĐÃ THAY BẰNG BẢNG DỰ BÁO ══
     Bảng cũ cộng Init/GR/GI/Trs/End của hai bồn — đúng nhưng thừa: số đó
     đã có ở dải Σ TỔNG ngay dưới và ở chính lưới SAP. Nay chỗ đó in TOÀN
     BỘ phép tính tồn còn lại (FCST), vì đó mới là thứ người ta mở tab SAP
     ra để xem. Giữ NGUYÊN tên hàm: mọi đường gọi cũ (listener Firebase,
     cellEdited, tableBuilt, xoá dòng…) vẫn chạy, chỉ đổi thứ được vẽ.
     ⚠ computeAnalysis() GIỮ LẠI và vẫn export — bộ test parity của Daily
     Stock đọc nó. */
  function renderAnalysis(){
    try{ if(typeof FCST!=='undefined' && FCST.schedule) FCST.schedule(); }catch(_){}
  }
  function toggleAnalysis(){
    _analysisVisible=!_analysisVisible;
    const w=document.getElementById('spAnalysisWrap');
    if(w) w.classList.toggle('collapsed', !_analysisVisible);
    const b=document.getElementById('spAnToggleBtn');
    if(b) b.textContent=_analysisVisible?'Hide':'Show forecast';
    /* Mở ra thì phải VẼ NGAY: renderFull() tự bỏ qua khi đang collapsed nên
       lúc còn ẩn nó chưa hề dựng bảng lần nào. */
    if(_analysisVisible){ try{ if(typeof FCST!=='undefined') FCST.renderFull(); }catch(_){} }
  }

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
    const FIELDS=['date','sloc','mat','batch','bcode','init','gr','gi','trs','end'];
    const adds=[],changes=[];
    parsed.rows.forEach(p=>{
      const k=compKey(p),ex=byKey[k];
      if(ex){const diffs=[];FIELDS.forEach(f=>{if(String(ex[f]?? '')!==String(p[f]??''))diffs.push({field:f,old:String(ex[f]??''),new:String(p[f]??'')});});if(diffs.length)changes.push({rid:ex._rid,key:k,diffs});}
      else adds.push({rid:newRid(),fields:p});
    });
    const legacy=findLegacy1100(parsed.rows);
    const stale=findStale(parsed.rows,legacy);      /* v4.129 */
    _pendingDiff={adds,changes,legacy,stale,stats:parsed};
    showDiff(adds,changes,parsed,legacy,stale);
  }
  /* ── DỌN DÒNG 1100 GỘP CŨ ────────────────────────────────────
     Dòng 1100 kiểu CŨ = không có bcode (dán trước v4.89, gộp cả ngày về 1 ký
     tự P/X/D/E). Còn nằm đó là ĐẾM HAI LẦN với dòng đã tách.
     v4.98 — nới điều kiện: chỉ cần bản dán mới có batch tách cho ĐÚNG
     ngày + mat đó là dòng gộp cũ bị loại, không cần trùng cả ký tự batch.
     Lý do: bản kết xuất ZMMFR022 cho 1 ngày là ẢNH CHỤP ĐẦY ĐỦ của SLoc
     1100 ngày đó — ký tự nào không xuất hiện nghĩa là SAP không còn tồn,
     giữ dòng gộp cũ lại là giữ một con số đã chết. Danh sách bị xoá được
     liệt kê rõ trong bảng xác nhận trước khi bấm Confirm. */
  function findLegacy1100(newRows){
    const covered={};
    (newRows||[]).forEach(r=>{ if(r.bcode){
      covered[r.date+'|'+r.mat+'|'+r.batch]=1;
      covered[r.date+'|'+r.mat]=1;
    } });
    return Object.values(ROWS).filter(r=>
      String(r.sloc||'')==='1100' && !r.bcode &&
      (covered[(r.date||'')+'|'+(r.mat||'')+'|'+(r.batch||'')] ||
       covered[(r.date||'')+'|'+(r.mat||'')]));
  }
  /* ── v4.129 — DÒNG ĐÃ CHẾT: có trong app, KHÔNG còn trong bản dán ──────
     LỖI ĐÃ SỬA: dán lại SAP đã được kế toán sửa cho một ngày ĐÃ dán trước
     đó thì số cũ vẫn nằm nguyên. Vì submitPaste chỉ biết THÊM (khoá mới) và
     SỬA (khoá trùng, giá trị khác) — chưa bao giờ biết XOÁ. Lô nào SAP đã
     xuất hết và rơi khỏi kết xuất thì dòng cũ sống mãi trong app, cộng vào
     mọi tổng. Thực tế đo được: ngày 02/09/26 SAP chỉ còn 2 lô C3 ở SLoc
     1100 (11.201.816 kg) nhưng app giữ 10 lô, END 49.250.914 kg — sai gấp
     hơn bốn lần, không một cảnh báo nào.

     PHẠM VI XOÁ HẸP VÀ CÓ CHỦ Ý. Nhân viên hay dán kết xuất ĐÃ LỌC (một
     SLoc, một mã vật tư, một chữ lô), nên KHÔNG được coi cả bản dán là ảnh
     chụp toàn kho. Chỉ những NHÓM thật sự có mặt trong bản dán mới bị soi:
           nhóm = ngày | SLoc | Mat | CHỮ LÔ (P/X/D/E)
     Dán lọc riêng batch P thì dòng D/E không hề bị đụng; dán riêng C3 thì
     C4 nguyên vẹn; dán riêng 1100 thì 2100/2101 nguyên vẹn.
     Danh sách bị xoá luôn được liệt kê đầy đủ trong bảng xác nhận, kèm ô
     tick để bỏ chọn khi bản dán chỉ là một phần của nhóm. */
  function findStale(newRows, legacy){
    const groups = {}, keep = {};
    (newRows || []).forEach(r=>{
      groups[(r.date||'')+'|'+(r.sloc||'')+'|'+(r.mat||'')+'|'+(r.batch||'')] = 1;
      keep[compKey(r)] = 1;
    });
    const skip = {};
    (legacy || []).forEach(r=>{ if(r && r._rid) skip[r._rid] = 1; });
    return Object.values(ROWS).filter(r=>{
      if(!r || skip[r._rid]) return false;
      const g = (r.date||'')+'|'+(r.sloc||'')+'|'+(r.mat||'')+'|'+(r.batch||'');
      return groups[g] && !keep[compKey(r)];
    });
  }
  /* mọi dòng 1100 còn gộp cũ, bất kể đã có bản tách hay chưa */
  function allLegacy1100(){
    return Object.values(ROWS).filter(r=> String(r.sloc||'')==='1100' && !r.bcode);
  }
  function showDiff(adds,changes,stats,legacy,stale){
    legacy=legacy||[]; stale=stale||[];
    document.getElementById('spDiffTitle').textContent='Confirm: Import SAP ZMMFR022';
    const bad=(stats.bad1100)||[];
    document.getElementById('spDiffSubtitle').textContent=stats.rawCount+' raw → '+stats.rows.length+' aggregated ('+(stats.n1100||0)+' at SLoc 1100, one row per batch code). '+(stats.skippedSloc?stats.skippedSloc+' filtered. ':'')+'Matched on Date+SLoc+Mat+Batch+BatchCode.';
    let html='<div class="tp-diff-stats">';
    html+=`<div class="tp-diff-stat add"><div class="v">${adds.length}</div><div class="l">Added</div></div>`;
    html+=`<div class="tp-diff-stat chg"><div class="v">${changes.length}</div><div class="l">Changed</div></div>`;
    html+=`<div class="tp-diff-stat"><div class="v">${stats.n1100||0}</div><div class="l">SLoc 1100 batch codes</div></div>`;
    if(legacy.length) html+=`<div class="tp-diff-stat rem"><div class="v">${legacy.length}</div><div class="l">Merged 1100 removed</div></div>`;
    if(stale.length) html+=`<div class="tp-diff-stat rem"><div class="v">${stale.length}</div><div class="l">Gone from SAP</div></div>`;
    html+='</div>';
    if(bad.length){
      html+=`<div class="tp-diff-warn">⚠ ${bad.length} SLoc 1100 row(s) have a batch code that does not match the bonded-warehouse pattern <code>YYMMDD+P/X/D/E+nnn</code>. They are <b>kept</b> (quantities still count towards SLoc 1100 totals) and are still stored on their own code, never merged — but the KNQ tab will not be able to match them. Check them in SAP:<br>`+
        bad.slice(0,12).map(b=>`<code>${escapeHtml(b.date)} · ${escapeHtml(b.mat)} · "${escapeHtml(b.raw)}" → ${escapeHtml(b.batch||'?')}</code>`).join(' · ')+
        (bad.length>12?(' …and '+(bad.length-12)+' more'):'')+`</div>`;
    }
    if(legacy.length){
      html+=`<div class="tp-diff-warn">⚠ ${legacy.length} merged SLoc 1100 row(s) (pre-split, one letter per day) will be DELETED — this paste covers the same dates split per batch code, so keeping them double-counts:<br>`+
        legacy.slice(0,12).map(r=>`<code>${escapeHtml(isoToDisplay(r.date))} · ${escapeHtml(r.mat)} · ${escapeHtml(r.batch)} · End ${(r.end||0).toLocaleString('en-US')}</code>`).join(' · ')+
        (legacy.length>12?(' …and '+(legacy.length-12)+' more'):'')+`</div>`;
    }
    if(stale.length){
      const byDay={};
      stale.forEach(r=>{ const d=isoToDisplay(r.date)||'?'; (byDay[d]=byDay[d]||[]).push(r); });
      html+=`<div class="tp-diff-section rem"><h4><span class="badge">− GONE FROM SAP</span> ${stale.length} row(s)</h4>`
        + `<div class="tp-diff-warn" style="margin:0 0 8px">These rows are still in the app but no longer appear in this paste, `
        + `on days and batch letters the paste <b>does</b> cover. They are stock that SAP has already `
        + `issued out — leaving them in keeps a dead figure in every total.`
        + `<br><label class="sp-stale-opt"><input type="checkbox" id="spDiffStale" checked> `
        + `<b>Remove them</b> — untick if this paste is only part of what those days hold `
        + `(for example a single batch code filtered in Excel).</label></div>`
        + '<div class="tp-diff-list">';
      Object.keys(byDay).sort().forEach(d=>{
        html+=`<div class="tp-diff-item"><span class="who">${escapeHtml(d)}</span> `
          + byDay[d].slice(0,14).map(r=>`<code>${escapeHtml(r.sloc)}·${escapeHtml(r.mat)}·`
              + `${escapeHtml(r.bcode||r.batch)} End ${(r.end||0).toLocaleString('en-US')}</code>`).join(' ')
          + (byDay[d].length>14?(' …+'+(byDay[d].length-14)):'') + '</div>';
      });
      html+='</div></div>';
    }
    if(adds.length){html+=`<div class="tp-diff-section add"><h4><span class="badge">+ NEW</span> ${adds.length} row(s)</h4><div class="tp-diff-list">`;adds.slice(0,40).forEach(a=>{const r=a.fields;html+=`<div class="tp-diff-item"><span class="who">${escapeHtml(r.date)}</span> · ${escapeHtml(r.sloc)} · ${escapeHtml(r.mat)} · ${r.bcode?('<b>'+escapeHtml(r.bcode)+'</b>'):escapeHtml(r.batch)} · End ${(r.end||0).toLocaleString('en-US')}kg</div>`;});if(adds.length>40)html+='<div class="tp-diff-item" style="font-style:italic;color:var(--ink-3)">…and '+(adds.length-40)+' more</div>';html+='</div></div>';}
    if(changes.length){html+=`<div class="tp-diff-section chg"><h4><span class="badge">~ CHANGED</span> ${changes.length} row(s)</h4><div class="tp-diff-list">`;changes.slice(0,40).forEach(c=>{let line=`<div class="tp-diff-item"><span class="who">${escapeHtml(c.key)}</span> `;c.diffs.forEach(d=>{line+=`<span class="field">${escapeHtml(d.field)}</span><span class="ov">${escapeHtml(d.old||'—')}</span><span class="arr">→</span><span class="nv">${escapeHtml(d.new||'—')}</span> `;});html+=line+'</div>';});if(changes.length>40)html+='<div class="tp-diff-item" style="font-style:italic;color:var(--ink-3)">…and '+(changes.length-40)+' more</div>';html+='</div></div>';}
    if(!adds.length&&!changes.length&&!stale.length&&!legacy.length) html+='<div class="tp-diff-warn" style="background:var(--green-soft);border-color:#bfe3cc;color:#157a40">✓ No changes — paste identical.</div>';
    document.getElementById('spDiffBody').innerHTML=html;
    document.getElementById('spDiffModal').classList.add('on');
  }
  function closeDiff(){document.getElementById('spDiffModal').classList.remove('on');_pendingDiff=null;}
  function confirmDiff(){
    if(!_pendingDiff){closeDiff();return;} const{adds,changes}=_pendingDiff; const legacy=_pendingDiff.legacy||[]; const batch=[];
    /* v4.129 — ô tick mặc định BẬT; đọc TRƯỚC khi đóng bảng vì closeDiff xoá DOM. */
    const _stChk=document.getElementById('spDiffStale');
    const stale=(_stChk && !_stChk.checked) ? [] : (_pendingDiff.stale||[]);
    adds.forEach(a=>{Object.entries(a.fields).forEach(([k,v])=>batch.push({rid:a.rid,field:k,value:v}));});
    changes.forEach(c=>{c.diffs.forEach(d=>batch.push({rid:c.rid,field:d.field,value:d.new}));});
    legacy.forEach(r=>{ if(r&&r._rid) batch.push({rid:r._rid,field:'__DELETE__',value:null}); });
    stale.forEach(r=>{ if(r&&r._rid) batch.push({rid:r._rid,field:'__DELETE__',value:null}); });
    if(!batch.length){toast('No changes','er');closeDiff();return;}
    applyAndPush(batch,'paste '+adds.length+' new / '+changes.length+' updated'
      +(legacy.length?' / '+legacy.length+' legacy removed':'')
      +(stale.length?' / '+stale.length+' gone from SAP':''));
    closeDiff();rebuildTableData();document.getElementById('spPasteArea').value='';
    toast(`SAP: ${adds.length} added, ${changes.length} updated`
      +(legacy.length?`, ${legacy.length} legacy 1100 removed`:'')
      +(stale.length?`, ${stale.length} gone from SAP removed`:''),'ok');
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
  function pickerChange(){
    const dp=document.getElementById('spDatePick');
    if(dp.value){ _dfInit=true; setDateFilter(normalizeDate(dp.value)); dropStaleBcode(); rebuildTableData(); }
  }
  function clearDate(){ _dfInit=true; setDateFilter(''); dropStaleBcode(); rebuildTableData(); }
  /* Đổi date/sloc/batch mà mã batch đang lọc không còn dòng nào ⇒ bỏ mã đó,
     nếu không bảng sẽ trống trơn mà người dùng không hiểu vì sao. */
  function dropStaleBcode(){
    if(bcodeFilter && bcodeChoices().indexOf(bcodeFilter)<0) bcodeFilter='';
  }
  function setSloc(v){
    slocFilter=String(v||'').trim().toUpperCase();
    const el=document.getElementById('spSlocFilter');
    if(el){ el.value=slocFilter; el.classList.toggle('active',!!slocFilter); }
    dropStaleBcode(); rebuildTableData();
  }
  function setMat(v){
    matFilter=String(v||'').trim().toUpperCase();
    const el=document.getElementById('spMatFilter');
    if(el){ el.value=matFilter; el.classList.toggle('active',!!matFilter); }
    dropStaleBcode(); rebuildTableData();
  }
  function setBatch(v){
    batchFilter=String(v||'').trim().toUpperCase();
    const el=document.getElementById('spBatchFilter');
    if(el){ el.value=batchFilter; el.classList.toggle('active',!!batchFilter); }
    dropStaleBcode(); rebuildTableData();
  }
  function setBcode(v){
    bcodeFilter=String(v||'').trim().toUpperCase();
    const el=document.getElementById('spBcodeFilter');
    if(el){ el.value=bcodeFilter; el.classList.toggle('active',!!bcodeFilter); }
    rebuildTableData();
  }
  /* ✕ Reset: về đúng trạng thái mặc định của tab = lọc NGÀY HÔM QUA. */
  function resetFilters(){
    slocFilter=''; matFilter=''; batchFilter=''; bcodeFilter='';
    const s=document.getElementById('spSearch'); if(s) s.value='';
    ['spSlocFilter','spMatFilter','spBatchFilter','spBcodeFilter'].forEach(id=>{
      const el=document.getElementById(id); if(el){ el.value=''; el.classList.remove('active'); }
    });
    setDateFilter(yesterdayDMY()); rebuildTableData();
  }
  function exportCsv(){if(table)table.download('csv','sap_'+Date.now()+'.csv');}

  return{
    /* v4.129 — hook kiểm thử: dò dòng đã chết khi dán lại SAP */
    findStale, findLegacy1100, compKey, parseSapSheet,
    init(){const c=loadCache();if(c){Object.assign(ROWS,c.data||{});_versions=c.versions||_versions;}refreshBadge();attachFirebase();},
    buildTable,rebuildTableData,openPaste,closePaste,submitPaste,closeDiff,confirmDiff,rangeDelete,exportCsv,
    openPicker,pickerChange,clearDate,refreshBadge,renderAnalysis,toggleAnalysis,
    setSloc,setMat,setBatch,setBcode,resetFilters,renderTotals,refreshBcodeOptions,
    /* hook test: đọc/ghi trạng thái filter mà không cần DOM */
    _filters(){return{date:dateFilter,sloc:slocFilter,mat:matFilter,batch:batchFilter,bcode:bcodeFilter};},
    _computeAnalysis:computeAnalysis,
    _yesterdayDMY:yesterdayDMY, _rows:spRows,
    /* ── API cho tab KNQ (kho ngoại quan) ──────────────────────────
       Trả dòng SLoc 1100 ĐÃ TÁCH theo mã batch trong khoảng ngày.
       legacy = số dòng 1100 còn ở dạng gộp cũ (chưa có bcode) → KNQ cảnh báo
       người dùng dán lại SAP để tách batch. */
    batch1100(fromDate,toDate){
      const rows=[], legacyRows=[]; let legacy=0; const dates={};
      Object.values(ROWS).forEach(r=>{
        if(!r || String(r.sloc||'')!=='1100') return;
        const d=String(r.date||''); if(!d) return;
        if(fromDate && d<fromDate) return;
        if(toDate   && d>toDate  ) return;
        if(!r.bcode){ legacy++; legacyRows.push(r); return; }
        dates[d]=1;
        rows.push({ mat:String(r.mat||''), batch:String(r.bcode||'').toUpperCase(), date:d,
          init:+r.init||0, gr:+r.gr||0, gi:+r.gi||0, trs:+r.trs||0, end:+r.end||0 });
      });
      return { rows, legacy, legacyRows, dates:Object.keys(dates).sort() };
    },

    /* ── v4.108 — API cho bảng STOCK-TRANSFER RECONCILIATION (INV) ──────
       End Stock của MỘT BỒN tại MỘT NGÀY, tách theo cấu tử.
         sloc    '2100' (TK-3501) | '2101' (TK-3502)
         isoDate 'YYYY-MM-DD' — đúng khuôn r.date đang lưu
       Trả { has, c3, c4, lpg, rows, batches[] } — số là KG, y như SAP.
       CHỈ CỘNG, không suy diễn: ngày không có dòng nào ⇒ has=false và
       c3=c4=0, để phía gọi biết là "SAP chưa có số" chứ không phải "tồn 0".
       Cộng MỌI mã batch của bồn (thực tế chỉ có D/E) và trả danh sách batch
       để bảng nói rõ số này gộp từ đâu. */
    tankEnd(sloc, isoDate){
      const sl = String(sloc||'').trim(), d = String(isoDate||'').trim();
      const out = { has:false, c3:0, c4:0, lpg:0, rows:0, batches:[], lastAt:0, lastBy:'' };
      if(!sl || !d) return out;
      const seen = Object.create(null);
      Object.values(ROWS).forEach(r=>{
        if(!r) return;
        if(String(r.sloc||'') !== sl) return;
        if(String(r.date||'') !== d) return;
        const mat = String(r.mat||'').toUpperCase();
        if(mat !== 'C3' && mat !== 'C4') return;
        out.has = true; out.rows++;
        out[mat === 'C3' ? 'c3' : 'c4'] += (+r.end || 0);
        const b = String(r.batch||'').toUpperCase(); if(b && !seen[b]){ seen[b]=1; out.batches.push(b); }
        /* lastAt/lastBy do applyAndPush ghi cho MỌI đường vào — dán SAP
           (confirmDiff) lẫn sửa tay từng ô. Lấy mốc MỚI NHẤT trong nhóm
           dòng đang cộng, để bảng đối chiếu nói được số này được dán/tạo
           lúc nào — số SAP cũ vài ngày nhìn giống hệt số vừa dán. */
        const t = +r.lastAt || 0;
        if(t > out.lastAt){ out.lastAt = t; out.lastBy = String(r.lastBy||''); }
      });
      out.lpg = out.c3 + out.c4;
      out.batches.sort();
      return out;
    },
    /* Mọi ngày SAP đang có số cho một bồn — để bảng gợi ý ngày gần nhất
       khi ngày cần tra chưa được dán vào. */
    tankEndDates(sloc){
      const sl = String(sloc||'').trim(), s = {};
      Object.values(ROWS).forEach(r=>{
        if(!r || String(r.sloc||'') !== sl || !r.date) return;
        const mat = String(r.mat||'').toUpperCase();
        if(mat === 'C3' || mat === 'C4') s[r.date] = 1;
      });
      return Object.keys(s).sort();
    },
    /* hook cho test (tests/sp-bcode.test.js) — không dùng trong app */
    _parseSap:parseSapSheet, _compKey:compKey, _findLegacy1100:findLegacy1100,
    _isBcode:isBcode, _allLegacy1100:allLegacy1100,
    /* mọi ngày đang có dữ liệu SLoc 1100 (để KNQ dựng bộ chọn ngày) */
    dates1100(){
      const s={};
      Object.values(ROWS).forEach(r=>{ if(r&&String(r.sloc||'')==='1100'&&r.date) s[r.date]=1; });
      return Object.keys(s).sort();
    },
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
/* v4.100 — filter SLoc / Batch / Batch code */
function spResetFilters(){SP.resetFilters();}
document.getElementById('spSlocFilter').addEventListener('change',e=>{SP.setSloc(e.target.value);});
document.getElementById('spMatFilter').addEventListener('change',e=>{SP.setMat(e.target.value);});
document.getElementById('spBatchFilter').addEventListener('change',e=>{SP.setBatch(e.target.value);});
document.getElementById('spBcodeFilter').addEventListener('change',e=>{SP.setBcode(e.target.value);});

/* ============================================================
   CUSTOMER MODULE  (build p3.0-cust)
   ─────────────────────────────────────────────────────────
   Customer master list. Per-field delta writes (cust_/{rid}/{field}).
   Lookup API: CT.lookup(wmsName) → short name.
   ============================================================ */
