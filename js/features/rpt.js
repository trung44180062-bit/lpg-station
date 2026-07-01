/* ============================================================
 * RPT  —  rpt.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 25974–27496   (~1523 dòng)
 * Global xuất ra : window.RPT
 * Phase tách     : P5C
 * Phụ thuộc      : sync, all-data, JSZip
 * Khởi tạo (boot): RPT.init() trong boot
 * ------------------------------------------------------------
 * MÔ TẢ: Báo cáo (Daily Stock) + xuất .xlsx qua JSZip: pickFile/findSheet/findDateRow/parseRows/executeExport (~25592–26110 theo MODULE-MAP).
 *
 * API công khai (điền/đối chiếu khi tách):
 *   RPT.init(), RPT.pickFile(), RPT.executeExport()
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module RPT từ dòng 25974 đến 27496.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.RPT).
 *   3) node --check rpt.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P5C]: dán thân module RPT (V4-54 dòng 25974–27496) vào đây. */

/* ===== BÓC TỪ V4-54 dòng 25974–27496 ===== */
const RPT = (function(){
  const state = { zip:null, fileHandle:null, fileName:'' };

  /* ─────────── DATE HELPERS ─────────── */
  function isoToday(){
    const d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function isoDayBefore(iso){
    const p=iso.split('-');
    const d=new Date(+p[0], +p[1]-1, +p[2]-1);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function isoDayAfter(iso){
    const p=iso.split('-');
    const d=new Date(+p[0], +p[1]-1, +p[2]+1);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  /* Accept DD/MM/YY, DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, YYYYMMDD → YYYY-MM-DD */
  function anyToISO(s){
    if(!s) return '';
    s=String(s).trim().replace(/[T ]\d{1,2}:\d{2}(:\d{2})?.*$/,'').trim();
    if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
    let m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if(m){
      let d=m[1], mo=m[2], y=m[3];
      if(y.length===2) y='20'+y;
      return y+'-'+mo.padStart(2,'0')+'-'+d.padStart(2,'0');
    }
    m=s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if(m) return m[1]+'-'+m[2]+'-'+m[3];
    return '';
  }
  function isoToSerial(iso){
    const p=iso.split('-');
    const d=new Date(+p[0], +p[1]-1, +p[2]);
    return Math.floor((d-new Date(1899,11,30))/86400000);
  }
  function serialToISO(s){
    const d=new Date((s-25569)*86400000);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }

  /* ─────────── DO + TANK HELPERS ─────────── */
  function normDO(s){
    return String(s||'').trim().replace(/^0+/, '').toUpperCase();
  }
  function tankToSloc(t){
    const s=String(t||'').toUpperCase().replace(/\s/g,'');
    if(s.includes('3501')) return '2100';
    if(s.includes('3502')) return '2101';
    return '';
  }

  /* ─────────── LOGGING ─────────── */
  function log(msg, cls){
    const el=document.getElementById('rpt-log');
    if(!el) return;
    // Clear placeholder on first log line
    const empty=el.querySelector('.rpt-log-empty');
    if(empty) el.innerHTML='';
    const esc=String(msg).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    el.innerHTML += '<div class="'+(cls||'')+'">'+esc+'</div>';
    el.scrollTop = el.scrollHeight;
    if(cls==='er') console.error('[RPT]',msg); else console.log('[RPT]',msg);
  }
  function clearLog(){
    const el=document.getElementById('rpt-log');
    if(el) el.innerHTML='<div class="rpt-log-empty">Log cleared.</div>';
  }

  /* ─────────── FILE PICKER ─────────── */
  async function pickFile(){
    if(window.showOpenFilePicker){
      try{
        const handles=await window.showOpenFilePicker({types:[{description:'Excel',accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx']}}]});
        state.fileHandle=handles[0];
        state.fileName=state.fileHandle.name;
        const file=await state.fileHandle.getFile();
        state.zip=await JSZip.loadAsync(await file.arrayBuffer());
        log('📄 Loaded: '+state.fileName+' (file handle saved)','ok');
      }catch(e){ if(e.name!=='AbortError') log('❌ '+e.message,'er'); return; }
    } else {
      const input=document.createElement('input');
      input.type='file'; input.accept='.xlsx';
      input.onchange=async ()=>{
        if(!input.files.length) return;
        state.fileName=input.files[0].name;
        state.zip=await JSZip.loadAsync(await input.files[0].arrayBuffer());
        state.fileHandle=null;
        log('📄 Loaded: '+state.fileName,'ok');
        updateUI();
      };
      input.click(); return;
    }
    updateUI();
  }
  async function reload(){
    if(!state.fileHandle) return false;
    try{
      let perm=await state.fileHandle.queryPermission({mode:'read'});
      if(perm!=='granted') perm=await state.fileHandle.requestPermission({mode:'read'});
      if(perm!=='granted') return false;
      const f=await state.fileHandle.getFile();
      state.zip=await JSZip.loadAsync(await f.arrayBuffer());
      state.fileName=state.fileHandle.name;
      return true;
    }catch(e){ return false; }
  }
  function updateUI(){
    /* Update both homes:
       - Report tab (#page-report)         — IDs rpt-*
       - Scale Row 1 shortcut (v4.28.1)    — IDs sc-rpt-*  */
    const box=document.getElementById('rpt-file-box');
    const name=document.getElementById('rpt-file-name');
    const badge=document.getElementById('rpt-file-badge');
    const btnEx=document.getElementById('rpt-btn-export');
    const scBox=document.getElementById('sc-rpt-file-box');
    const scName=document.getElementById('sc-rpt-file-name');
    const scBadge=document.getElementById('sc-rpt-file-badge');
    const scBtnEx=document.getElementById('sc-rpt-btn-export');
    if(state.zip){
      if(box) box.classList.add('has-file');
      if(name) name.textContent=state.fileName;
      if(badge){ badge.textContent='READY'; badge.classList.add('ready'); }
      if(btnEx) btnEx.disabled=false;
      if(scBox) scBox.classList.add('has-file');
      if(scName) scName.textContent=state.fileName;
      if(scBadge){ scBadge.textContent='READY'; scBadge.classList.add('ready'); }
      if(scBtnEx) scBtnEx.disabled=false;
    }
  }

  /* ─────────── DATE QUICK-BUTTONS ─────────── */
  function setDate(which){
    const el=document.getElementById('rpt-date');
    const elSc=document.getElementById('sc-rpt-date');
    let v=null;
    if(which==='today') v=isoToday();
    else if(which==='yesterday') v=isoDayBefore(isoToday());
    if(v==null) return;
    if(el) el.value=v;
    if(elSc) elSc.value=v;
  }

  /* ═════════════════════════════════════════════════════════
     XML HELPERS — verbatim port from V406 (pure utilities)
     ═════════════════════════════════════════════════════════ */
  function xmlEsc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function parseSST(xml){
    const ss=[];
    const re=/<si>([\s\S]*?)<\/si>/g; let m;
    while((m=re.exec(xml))!==null){
      let t=''; const tr=/<t[^>]*>([\s\S]*?)<\/t>/g; let tm;
      while((tm=tr.exec(m[1]))!==null) t+=tm[1];
      ss.push(t);
    }
    return ss;
  }
  function cellVal(xml, sst){
    const tm=xml.match(/\bt="([^"]+)"/);
    const tp=tm?tm[1]:'n';
    if(tp==='inlineStr'||tp==='str'){
      const im=xml.match(/<t[^>]*>([\s\S]*?)<\/t>/);
      return im?im[1]:'';
    }
    const vm=xml.match(/<v>([\s\S]*?)<\/v>/);
    if(!vm) return '';
    if(tp==='s') return sst[parseInt(vm[1])]||'';
    return vm[1];
  }
  function parseRows(xml){
    const rows=[]; const re=/<row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/row>|<row\b[^>]*\br="(\d+)"[^>]*\/>/g; let m;
    while((m=re.exec(xml))!==null){
      const rn=parseInt(m[1]||m[2]);
      rows.push({num:rn, xml:m[0], start:m.index, end:m.index+m[0].length});
    }
    return rows;
  }
  async function findSheet(zip, pattern){
    const wb=await zip.file('xl/workbook.xml').async('string');
    const rels=await zip.file('xl/_rels/workbook.xml.rels').async('string');
    const sheets=[]; const re=/<sheet[^>]+name="([^"]+)"[^>]*r:id="([^"]+)"/g; let m;
    while((m=re.exec(wb))!==null) sheets.push({name:m[1], rId:m[2]});
    const rm={}; const rr=/<Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"/g; let mm;
    while((mm=rr.exec(rels))!==null) rm[mm[1]]=mm[2];
    const found=sheets.find(s=>pattern.test(s.name));
    if(!found) return null;
    return { name:found.name, path:'xl/'+rm[found.rId] };
  }
  function findDateRow(rows, dateISO, sst){
    for(let i=0;i<rows.length;i++){
      const r=rows[i];
      const caRe=new RegExp('<c\\s+r="A'+r.num+'"[^>]*>[\\s\\S]*?<\\/c>');
      const caM=r.xml.match(caRe);
      if(!caM) continue;
      const val=cellVal(caM[0], sst);
      let ds='';
      if(/^\d{4}-\d{2}-\d{2}/.test(val)) ds=val.slice(0,10);
      else if(/^\d+(\.\d+)?$/.test(val)){
        const n=parseFloat(val);
        if(n>40000 && n<60000) ds=serialToISO(n);
      }
      if(ds===dateISO) return {idx:i, row:r};
    }
    return null;
  }
  function readCellNum(sXml, sst, cellRef){
    const re=new RegExp('<c\\s+r="'+cellRef+'"[^>]*>[\\s\\S]*?<\\/c>');
    const m=sXml.match(re);
    if(!m) return null;
    const v=cellVal(m[0], sst);
    if(v===''||v==null) return null;
    const n=parseFloat(v);
    return isFinite(n)?n:null;
  }

  /* ═════════════════════════════════════════════════════════
     DATA COLLECTORS — V4-18 adapted (WG.ROWS / WS.ROWS / TL.ROWS / SP.ROWS)
     ═════════════════════════════════════════════════════════ */
  function collectWmsGI(giDateISO){
    const out=[];
    const rows=(typeof WG!=='undefined' && WG.ROWS) ? WG.ROWS : {};
    Object.values(rows).forEach(w=>{
      if(!w||!w.delivId) return;
      const iso = anyToISO(w.arrival || w.transDate || '');
      if(iso === giDateISO){
        out.push({
          doNo: String(w.delivId).trim(),
          pickKg: parseFloat(String(w.pickKg||'').replace(/,/g,''))||0,
          customer: w.customer || ''
        });
      }
    });
    return out;
  }
  function collectWmsST(giDateISO){
    const wms={'2100':{fromCav:{C3:0,C4:0},toCav:{C3:0,C4:0},tkXfer:{C3:0,C4:0}},
               '2101':{fromCav:{C3:0,C4:0},toCav:{C3:0,C4:0},tkXfer:{C3:0,C4:0}}};
    let count=0;
    const rows=(typeof WS!=='undefined' && WS.ROWS) ? WS.ROWS : {};
    Object.values(rows).forEach(r=>{
      if(!r) return;
      const iso = anyToISO(r.transDate) || anyToISO(r.erpDate);
      if(iso !== giDateISO) return;
      const mat = r.matLabel;                     // 'C3' | 'C4'
      if(mat!=='C3' && mat!=='C4') return;
      const batch = String(r.reason||'').toUpperCase();
      if(batch!=='D' && batch!=='E') return;
      const status = String(r.status||'').toUpperCase();
      if(status && status!=='Y') return;           // lenient: empty OK, 'Y' OK, anything else skip
      const kg = parseFloat(String(r.kg||'').replace(/,/g,''))||0;
      if(!kg) return;
      const from = String(r.fromLoc||'').trim();
      const to   = String(r.toLoc||'').trim();
      if(from==='1100' && (to==='2100' || to==='2101')){
        wms[to].fromCav[mat] += kg; count++;
      } else if((from==='2100'||from==='2101') && to==='1100'){
        wms[from].toCav[mat] += kg; count++;
      } else if((from==='2100'&&to==='2101')||(from==='2101'&&to==='2100')){
        wms[to].tkXfer[mat] += kg;
        wms[from].tkXfer[mat] -= kg;
        count++;
      }
    });
    return { wms, count };
  }
  function collectTL(giDateISO){
    const out=[];
    const rows=(typeof TL!=='undefined' && TL.ROWS) ? TL.ROWS : {};
    Object.entries(rows).forEach(([rid, r])=>{
      if(!r||r.disabled) return;
      const iso = anyToISO(r.giDate);
      if(iso === giDateISO){
        out.push({ _rid: rid, ...r });
      }
    });
    return out;
  }

  /* Vessel Data rows (VS_ROWS) for a GI date. STRICT giDate: vessel chưa GI
     (không có giDate) KHÔNG vào báo cáo — giống V406 (v331). */
  function collectVS(giDateISO){
    const out=[];
    if(typeof VS_ROWS==='undefined' || !VS_ROWS) return out;
    Object.values(VS_ROWS).forEach(r=>{
      if(!r || typeof r!=='object' || !r.giDate) return;
      if(anyToISO(r.giDate) === giDateISO) out.push(r);
    });
    return out;
  }
  function collectGIbyTank(giDateISO){
    const gi={'2100':{C3:0,C4:0},'2101':{C3:0,C4:0}};
    collectTL(giDateISO).forEach(r=>{
      const sl = tankToSloc(r.ltank);
      if(!sl) return;
      let c3 = parseFloat(String(r.c3Kg||'').replace(/,/g,''))||0;
      let c4 = parseFloat(String(r.c4Kg||'').replace(/,/g,''))||0;
      if(!c3 && !c4){
        const n = parseFloat(String(r.lpgQty||'').replace(/,/g,''))||0;
        c3 = n/2; c4 = n/2;
      }
      gi[sl].C3 += c3;
      gi[sl].C4 += c4;
    });
    return gi;
  }
  /* SAP raw rows for date (already filtered to SLoc 1100/2100/2101 with mat C3/C4) */
  function collectSAPraw(dateISO){
    const arr=[];
    const rows=(typeof SP!=='undefined' && SP.ROWS) ? SP.ROWS : {};
    Object.values(rows).forEach(r=>{
      if(!r||r.date!==dateISO) return;
      arr.push(r);
    });
    return arr;
  }

  /* ═════════════════════════════════════════════════════════
     READ from existing report file (for SAP cross-check)
     ═════════════════════════════════════════════════════════ */
  async function readSTDataByDate(zip, dateISO){
    const stSh = await findSheet(zip, /^ST\s*Data$/i);
    if(!stSh) return null;
    const sstF = zip.file('xl/sharedStrings.xml');
    const sstXml = sstF ? await sstF.async('string') : '';
    const sst = parseSST(sstXml);
    const sXml = await zip.file(stSh.path).async('string');

    // Quick path: day-of-year + 3
    const p = dateISO.split('-');
    const dt = new Date(+p[0], +p[1]-1, +p[2]);
    const doy = Math.floor((dt - new Date(+p[0],0,0))/86400000);
    const guessRow = doy + 3;
    let targetRow = null;
    const cAxml = sXml.match(new RegExp('<c\\s+r="A'+guessRow+'"[^>]*>[\\s\\S]*?<\\/c>'));
    if(cAxml){
      const v = cellVal(cAxml[0], sst);
      const n = parseFloat(v);
      if(isFinite(n) && n>40000 && n<60000 && serialToISO(n)===dateISO) targetRow = guessRow;
    }
    if(!targetRow){
      const rows = parseRows(sXml);
      for(let i=0;i<rows.length;i++){
        const r=rows[i]; if(r.num<4) continue;
        const cM=r.xml.match(/<c\s+r="A\d+"[^>]*>[\s\S]*?<\/c>/);
        if(!cM) continue;
        const v=cellVal(cM[0],sst); if(!v) continue;
        const n=parseFloat(v);
        if(isFinite(n)&&n>40000&&n<60000&&serialToISO(n)===dateISO){ targetRow=r.num; break; }
      }
    }
    if(!targetRow) return null;
    const rd = col => { const v=readCellNum(sXml, sst, col+targetRow); return v==null?0:v; };
    return {
      row: targetRow,
      init: {C3_2100:rd('B'), C4_2100:rd('G'), C3_2101:rd('L'), C4_2101:rd('Q')},
      gi:   {C3_2100:rd('F'), C4_2100:rd('K'), C3_2101:rd('P'), C4_2101:rd('U')},
      trsNet: {
        C3_2100: rd('C')+rd('D')-rd('E'),
        C4_2100: rd('H')+rd('I')-rd('J'),
        C3_2101: rd('M')+rd('N')-rd('O'),
        C4_2101: rd('R')+rd('S')-rd('T')
      }
    };
  }
  async function readRawDataDetailByDate(zip, dateISO){
    const sh = await findSheet(zip, /^Raw\s*Data$/i);
    if(!sh) return null;
    const sstF = zip.file('xl/sharedStrings.xml');
    const sstXml = sstF ? await sstF.async('string') : '';
    const sst = parseSST(sstXml);
    const sXml = await zip.file(sh.path).async('string');
    const rows = parseRows(sXml);
    let sumC3_2100=0, sumC4_2100=0, sumC3_2101=0, sumC4_2101=0, rowCount=0;
    for(let i=0;i<rows.length;i++){
      const r=rows[i]; if(r.num<14) continue;
      const cC = r.xml.match(/<c\s+r="C\d+"[^>]*>[\s\S]*?<\/c>/);
      const cJ = r.xml.match(/<c\s+r="J\d+"[^>]*>[\s\S]*?<\/c>/);
      const cO = r.xml.match(/<c\s+r="O\d+"[^>]*>[\s\S]*?<\/c>/);
      const cP = r.xml.match(/<c\s+r="P\d+"[^>]*>[\s\S]*?<\/c>/);
      if(!cC||!cJ) continue;
      const giV = cellVal(cC[0], sst); if(!giV) continue;
      let giDS='';
      if(/^\d{4}-\d{2}-\d{2}/.test(giV)) giDS = giV.slice(0,10);
      else if(/^\d+(\.\d+)?$/.test(giV)){ const nn=parseFloat(giV); if(nn>40000&&nn<60000) giDS=serialToISO(nn); }
      if(giDS!==dateISO) continue;
      const tank = String(cellVal(cJ[0], sst)||'').trim().toUpperCase();
      const sl = (tank==='TK-3501'||tank==='TK3501') ? '2100' : (tank==='TK-3502'||tank==='TK3502') ? '2101' : null;
      if(!sl) continue;
      const c3 = cO ? (parseFloat(cellVal(cO[0], sst))||0) : 0;
      const c4 = cP ? (parseFloat(cellVal(cP[0], sst))||0) : 0;
      if(sl==='2100'){ sumC3_2100+=c3; sumC4_2100+=c4; } else { sumC3_2101+=c3; sumC4_2101+=c4; }
      rowCount++;
    }
    return { C3_2100:sumC3_2100, C4_2100:sumC4_2100, C3_2101:sumC3_2101, C4_2101:sumC4_2101, rowCount };
  }

  /* SAP 5-day cross-check (last 5 days before giDate) */
  async function verifySAP5Days(giDateISO){
    const toT = v => Math.round(v)/1000;
    const diffs=[];
    let noSAP=true;
    const allSap = (typeof SP!=='undefined' && SP.ROWS) ? SP.ROWS : {};
    Object.values(allSap).forEach(r=>{
      if(r && (r.sloc==='2100'||r.sloc==='2101') && (r.batch==='D'||r.batch==='E')) noSAP=false;
    });
    if(noSAP) return { noSAP:true, diffs:[] };
    if(!state.zip) return { noSAP:false, diffs:[], noFile:true };

    const dates=[];
    let d=giDateISO;
    for(let i=0;i<5;i++){ d=isoDayBefore(d); dates.unshift(d); }

    const stCache={};
    async function getST(ds){
      if(ds in stCache) return stCache[ds];
      try{ stCache[ds] = await readSTDataByDate(state.zip, ds); }
      catch(e){ stCache[ds]=null; }
      return stCache[ds];
    }

    for(let di=0; di<dates.length; di++){
      const checkDate = dates[di];
      const sapGI   = {'2100':{C3:0,C4:0},'2101':{C3:0,C4:0}};
      const sapTrs  = {'2100':{C3:0,C4:0},'2101':{C3:0,C4:0}};
      const sapInit = {'2100':{C3:0,C4:0},'2101':{C3:0,C4:0}};
      const sapEnd  = {'2100':{C3:0,C4:0},'2101':{C3:0,C4:0}};
      let hasSap=false;
      Object.values(allSap).forEach(r=>{
        if(!r||r.date!==checkDate) return;
        if(r.sloc!=='2100'&&r.sloc!=='2101') return;
        if(r.batch!=='D'&&r.batch!=='E') return;
        hasSap=true;
        sapGI  [r.sloc][r.mat] += Math.abs(r.gi||0);
        sapTrs [r.sloc][r.mat] += (r.trs||0);
        sapInit[r.sloc][r.mat] += (r.init||0);
        sapEnd [r.sloc][r.mat] += (r.end||0);
      });
      if(!hasSap) continue;
      const st = await getST(checkDate);
      if(!st){
        diffs.push({date:checkDate, sloc:'-', mat:'-', field:'ST',
          desc:checkDate+' ⚠ Cannot find row in ST Data sheet'});
        continue;
      }
      const stNext = await getST(isoDayAfter(checkDate));
      let rd=null;
      try{ rd = await readRawDataDetailByDate(state.zip, checkDate); }catch(e){ rd=null; }
      const checks = [
        /* stEnd = ST End(D) tính TỪ CHÍNH ngày D: Init + TransferNet − GI.
           (Trước đây lấy stNext.init = ô công thức ngày D+1, cache bị stale trên
           file chưa recalc → so lệch giả. Nay tự tính, đáng tin cậy.) */
        {sl:'2100', mat:'C3', name:'TK-3501 C3', giCol:'F', trsCols:'C+D-E', initCol:'B',
          stGI:st.gi.C3_2100, stTrs:st.trsNet.C3_2100, stInit:st.init.C3_2100,
          stEnd: st.init.C3_2100 + st.trsNet.C3_2100 - st.gi.C3_2100, rdSum: rd?rd.C3_2100:null},
        {sl:'2100', mat:'C4', name:'TK-3501 C4', giCol:'K', trsCols:'H+I-J', initCol:'G',
          stGI:st.gi.C4_2100, stTrs:st.trsNet.C4_2100, stInit:st.init.C4_2100,
          stEnd: st.init.C4_2100 + st.trsNet.C4_2100 - st.gi.C4_2100, rdSum: rd?rd.C4_2100:null},
        {sl:'2101', mat:'C3', name:'TK-3502 C3', giCol:'P', trsCols:'M+N-O', initCol:'L',
          stGI:st.gi.C3_2101, stTrs:st.trsNet.C3_2101, stInit:st.init.C3_2101,
          stEnd: st.init.C3_2101 + st.trsNet.C3_2101 - st.gi.C3_2101, rdSum: rd?rd.C3_2101:null},
        {sl:'2101', mat:'C4', name:'TK-3502 C4', giCol:'U', trsCols:'R+S-T', initCol:'Q',
          stGI:st.gi.C4_2101, stTrs:st.trsNet.C4_2101, stInit:st.init.C4_2101,
          stEnd: st.init.C4_2101 + st.trsNet.C4_2101 - st.gi.C4_2101, rdSum: rd?rd.C4_2101:null}
      ];
      checks.forEach(ck=>{
        const sapGIval   = toT(sapGI  [ck.sl][ck.mat]);
        const sapTrsVal  = toT(sapTrs [ck.sl][ck.mat]);
        const sapInitVal = toT(sapInit[ck.sl][ck.mat]);
        const sapEndVal  = toT(sapEnd [ck.sl][ck.mat]);
        if(Math.abs(sapGIval - ck.stGI) > 0.01)
          diffs.push({date:checkDate, sloc:ck.sl, mat:ck.mat, field:'GI ['+ck.giCol+']',
            desc:checkDate+' '+ck.name+' GI: SAP='+sapGIval.toFixed(3)+'t, ST['+ck.giCol+']='+ck.stGI.toFixed(3)+'t, Δ='+(sapGIval-ck.stGI).toFixed(3)+'t'});
        if(Math.abs(sapTrsVal - ck.stTrs) > 0.01)
          diffs.push({date:checkDate, sloc:ck.sl, mat:ck.mat, field:'TRS ['+ck.trsCols+']',
            desc:checkDate+' '+ck.name+' Transfer: SAP='+sapTrsVal.toFixed(3)+'t, ST['+ck.trsCols+']='+ck.stTrs.toFixed(3)+'t, Δ='+(sapTrsVal-ck.stTrs).toFixed(3)+'t'});
        if(Math.abs(sapInitVal - ck.stInit) > 0.01)
          diffs.push({date:checkDate, sloc:ck.sl, mat:ck.mat, field:'INIT ['+ck.initCol+']',
            desc:checkDate+' '+ck.name+' Init: SAP='+sapInitVal.toFixed(3)+'t, ST['+ck.initCol+']='+ck.stInit.toFixed(3)+'t, Δ='+(sapInitVal-ck.stInit).toFixed(3)+'t'});
        if(ck.stEnd!=null && Math.abs(sapEndVal - ck.stEnd) > 0.01)
          diffs.push({date:checkDate, sloc:ck.sl, mat:ck.mat, field:'END',
            desc:checkDate+' '+ck.name+' End: SAP='+sapEndVal.toFixed(3)+'t, ST End(Init+Trs−GI)='+ck.stEnd.toFixed(3)+'t, Δ='+(sapEndVal-ck.stEnd).toFixed(3)+'t'});
        if(rd && ck.rdSum!=null){
          const rdT = ck.rdSum/1000;
          if(Math.abs(sapGIval - rdT) > 0.01)
            diffs.push({date:checkDate, sloc:ck.sl, mat:ck.mat, field:'RAW [O/P]',
              desc:checkDate+' '+ck.name+' GI: SAP='+sapGIval.toFixed(3)+'t, RawData='+rdT.toFixed(3)+'t, Δ='+(sapGIval-rdT).toFixed(3)+'t'});
        }
      });
      if(!rd)
        diffs.push({date:checkDate, sloc:'-', mat:'-', field:'RAW',
          desc:checkDate+' ⚠ Cannot read Raw Data detail for this date'});
    }
    return { noSAP:false, diffs };
  }

  /* ═════════════════════════════════════════════════════════
     FILL — ST Data row
     ═════════════════════════════════════════════════════════ */
  function fillSTDataRow(sXml, dateISO, wms, gi, sst){
    const toT = v => Math.round(v)/1000;
    const rows = parseRows(sXml);
    const found = findDateRow(rows, dateISO, sst);
    if(!found) return { ok:false, msg:'Cannot find date '+dateISO+' in ST Data sheet' };
    const tRow = found.row;

    const v={};
    // TK-3501 (SLoc 2100) C3
    v.C = toT(wms['2100'].fromCav.C3 - wms['2100'].toCav.C3);
    v.D = toT(Math.max(0, wms['2100'].tkXfer.C3));
    v.E = toT(Math.abs(Math.min(0, wms['2100'].tkXfer.C3)));
    v.F = toT(gi['2100'].C3);
    // TK-3501 C4
    v.H = toT(wms['2100'].fromCav.C4 - wms['2100'].toCav.C4);
    v.I = toT(Math.max(0, wms['2100'].tkXfer.C4));
    v.J = toT(Math.abs(Math.min(0, wms['2100'].tkXfer.C4)));
    v.K = toT(gi['2100'].C4);
    // TK-3502 (SLoc 2101) C3
    v.M = toT(wms['2101'].fromCav.C3 - wms['2101'].toCav.C3);
    v.N = toT(Math.max(0, wms['2101'].tkXfer.C3));
    v.O = toT(Math.abs(Math.min(0, wms['2101'].tkXfer.C3)));
    v.P = toT(gi['2101'].C3);
    // TK-3502 C4
    v.R = toT(wms['2101'].fromCav.C4 - wms['2101'].toCav.C4);
    v.S = toT(Math.max(0, wms['2101'].tkXfer.C4));
    v.T = toT(Math.abs(Math.min(0, wms['2101'].tkXfer.C4)));
    v.U = toT(gi['2101'].C4);

    // Preserve row attributes
    const rowAttrs = tRow.xml.match(/^<row\b([^>]*?)[\s>\/]/);
    let rowAttrStr = rowAttrs ? rowAttrs[1] : '';
    if(!/\br="/.test(rowAttrStr)) rowAttrStr += ' r="'+tRow.num+'"';

    // Keep cells A (date), B/G/L/Q (init stock formulas)
    const keepCols=['A','B','G','L','Q'];
    const keptCells={};
    keepCols.forEach(col=>{
      const re = new RegExp('<c\\s+r="'+col+tRow.num+'"[^>]*(?:\\/>|>[\\s\\S]*?<\\/c>)');
      const m = tRow.xml.match(re);
      if(m) keptCells[col] = m[0];
    });
    if(!keptCells['A']) keptCells['A'] = '<c r="A'+tRow.num+'"><v>'+isoToSerial(dateISO)+'</v></c>';

    // Map per-col styles
    const sAttrMap={};
    const sRe=/<c\s+r="([A-Z]+)\d+"([^>]*)/g; let sM;
    while((sM=sRe.exec(tRow.xml))!==null){
      const sm2 = sM[2].match(/\bs="(\d+)"/);
      if(sm2) sAttrMap[sM[1]] = sm2[1];
    }
    const allCols=['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U'];
    let cellsXml='';
    allCols.forEach(col=>{
      if(keptCells[col]) cellsXml += keptCells[col];
      else if(v[col] !== undefined){
        const sA = sAttrMap[col] ? ' s="'+sAttrMap[col]+'"' : '';
        cellsXml += '<c r="'+col+tRow.num+'"'+sA+'><v>'+v[col]+'</v></c>';
      }
    });
    const newRowXml = '<row'+rowAttrStr+'>'+cellsXml+'</row>';
    sXml = sXml.substring(0, tRow.start) + newRowXml + sXml.substring(tRow.end);
    return { ok:true, xml:sXml, rowNum:tRow.num };
  }

  /* ═════════════════════════════════════════════════════════
     FILL — Raw Data sheet (append TL rows for giDate)
     V4-18 has no vessel module yet (skip vessel rows)
     Column layout (same as V406):
       B=Date C=GIDate D=DO E=Cust F=Trade G=LPGType H=Scale I=Turn
       J=Tank K=Lot L=%C3 M=%C4 N=NetWt O=C3 P=C4 Q=FQ R=Diff
       S=TruckWt T=1stTime U=GrossWt V=2ndTime W=PressIn X=PressOut
       Y=Eng Z=Dest AA=Note AB=Error AC=Seal AD=Weigher AE=CustWMS
       AF=Truck AG=Rmooc AH=Driver AI=CW AJ=MaxTol
     ═════════════════════════════════════════════════════════ */
  async function fillRawData(giDateISO){
    const sh = await findSheet(state.zip, /Raw\s*Data/i);
    if(!sh){ log('⚠ Sheet "Raw Data" not found — skip','warn'); return; }
    log('── Raw Data ──','info');

    const tlRows = collectTL(giDateISO);
    const vsRows = collectVS(giDateISO);   /* v4: vessel rows for this giDate */
    if(!tlRows.length && !vsRows.length){ log('ℹ Raw Data: 0 rows (TL+Vessel) for '+giDateISO,'info'); return; }

    // Sanity check: C3+C4 ≈ Net Weight
    const wtWarns=[];
    tlRows.forEach(r=>{
      const nw=parseFloat(String(r.lpgQty||'').replace(/,/g,''))||0;
      const c3=parseFloat(String(r.c3Kg||'').replace(/,/g,''))||0;
      const c4=parseFloat(String(r.c4Kg||'').replace(/,/g,''))||0;
      if(nw>0 && Math.abs((c3+c4)-nw)>1) wtWarns.push(String(r.doNo)+' | '+(r.cust||'')+' | NW='+nw+' C3+C4='+(c3+c4));
    });
    if(wtWarns.length){
      log('⚠ C3+C4 ≠ Net Weight: '+wtWarns.length+' DOs','warn');
      if(!confirm('⚠ C3 + C4 ≠ Net Weight:\n\n'+wtWarns.join('\n')+'\n\nOK to continue, Cancel to abort.')) return;
    }

    // Cross-check WMS GI presence
    const wmsMap={};
    const wgRows=(typeof WG!=='undefined' && WG.ROWS) ? WG.ROWS : {};
    Object.values(wgRows).forEach(w=>{ if(w&&w.delivId) wmsMap[normDO(w.delivId)] = w; });
    const doWarns=[];
    tlRows.forEach(r=>{
      const dn=normDO(r.doNo); if(!dn) return;
      const w=wmsMap[dn];
      if(!w) doWarns.push(String(r.doNo)+' | '+(r.cust||'')+' | MISSING in WMS GI');
      else if(!parseFloat(String(w.pickKg||'').replace(/,/g,''))) doWarns.push(String(r.doNo)+' | '+(r.cust||'')+' | Pick = 0');
    });
    if(doWarns.length){
      log('⚠ WMS GI issues: '+doWarns.length+' DOs','warn');
      if(!confirm('⚠ WMS GI:\n\n'+doWarns.join('\n')+'\n\nOK to continue, Cancel to abort.')) return;
    }

    const sstF = state.zip.file('xl/sharedStrings.xml');
    let sstXml = sstF ? await sstF.async('string') : '';
    const sst = parseSST(sstXml);
    let sXml = await state.zip.file(sh.path).async('string');
    const rows = parseRows(sXml);

    // SST helper
    const _sstNew=[];
    function sstIdx(str){
      for(let i=0;i<sst.length;i++){ if(sst[i]===str) return i; }
      for(let i=0;i<_sstNew.length;i++){ if(_sstNew[i]===str) return sst.length+i; }
      _sstNew.push(str);
      return sst.length+_sstNew.length-1;
    }

    // Check duplicate GI Date in col C
    const dateSerial = isoToSerial(giDateISO);
    let existingGI=false;
    for(let i=0;i<rows.length;i++){
      const cM = rows[i].xml.match(/<c\s+r="C\d+"[^>]*>[\s\S]*?<\/c>/);
      if(!cM) continue;
      const cv = cellVal(cM[0], sst);
      if(cv==String(dateSerial)||cv===giDateISO){ existingGI=true; break; }
    }
    if(existingGI){
      log('⚠ GI Date '+giDateISO+' already exists in Raw Data','warn');
      if(!confirm('⚠ GI Date '+giDateISO+' ALREADY EXISTS in Raw Data.\n\nOK to continue appending, Cancel to abort.')) return;
    }

    // Find last data row (col C has a date)
    let lastDataRow = 13;
    for(let i=rows.length-1;i>=0;i--){
      const r=rows[i];
      const cM=r.xml.match(/<c\s+r="C\d+"[^>]*>[\s\S]*?<\/c>/);
      if(cM){
        const cv=cellVal(cM[0],sst);
        if(cv && cv!=='GI Date'){ lastDataRow=r.num; break; }
      }
    }
    const startRow = lastDataRow+1;
    log('ℹ Raw Data: writing from row '+startRow,'info');

    // Style template from row above
    let aRow=null;
    for(let i=0;i<rows.length;i++){ if(rows[i].num>=startRow-1){ aRow=rows[i]; break; } }
    if(!aRow && rows.length) aRow=rows[rows.length-1];
    const sAttrMap={};
    if(aRow){
      const sRe=/<c\s+r="([A-Z]+)\d+"([^>]*)/g; let sM;
      while((sM=sRe.exec(aRow.xml))!==null){
        const sm2=sM[2].match(/\bs="(\d+)"/);
        if(sm2) sAttrMap[sM[1]]=sm2[1];
      }
    }
    /* v4-fix: write STRING cells as inline strings (t="inlineStr"), KHÔNG dùng
       shared strings. Trước đây dùng sstIdx + sửa uniqueCount → nếu parseSST đếm
       thiếu (vd <si/> rỗng) thì index lệch → Excel "Removed Records: Cell
       information" + hiển thị sai chuỗi. Inline string tự chứa, an toàn tuyệt đối
       (giống fillSummary). */
    function _inlineStrCell(col, rn, sA, val){
      const sv = String(val).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return '<c r="'+col+rn+'"'+sA+' t="inlineStr"><is><t xml:space="preserve">'+sv+'</t></is></c>';
    }
    function buildCellXml(col, rn, val, isStr){
      const sA = sAttrMap[col] ? ' s="'+sAttrMap[col]+'"' : '';
      if(val===''||val===null||val===undefined) return '';
      if(isStr) return _inlineStrCell(col, rn, sA, val);
      if(typeof val==='number') return '<c r="'+col+rn+'"'+sA+'><v>'+val+'</v></c>';
      return _inlineStrCell(col, rn, sA, val);
    }

    let newXml='';
    let rn=startRow;
    const colMap=['B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','AA','AB','AC','AD','AE','AF','AG','AH','AI','AJ'];

    tlRows.forEach(r=>{
      const nw=parseFloat(String(r.lpgQty||'').replace(/,/g,''))||0;
      const c3=parseFloat(String(r.c3Kg||'').replace(/,/g,''))||0;
      const c4=parseFloat(String(r.c4Kg||'').replace(/,/g,''))||0;
      const c3pct = nw>0 ? parseFloat((c3/nw).toFixed(2)) : 0;
      const c4pct = parseFloat((1-c3pct).toFixed(2));
      const fqVal = parseFloat(String(r.fq||'').replace(/,/g,''))||0;
      const diff  = fqVal>0 ? parseFloat((nw/fqVal).toFixed(4)) : 0;
      const dateISOr = anyToISO(r.date) || giDateISO;
      const dateSerial2 = isoToSerial(dateISOr);
      const vals=[
        dateSerial2,      // B: Date
        dateSerial,       // C: GI Date
        String(r.doNo||''),
        r.cust||'',
        r.trade||'',
        r.type||'LPG',
        r.scaleNo||'',
        r.turn||'',
        r.ltank||'',
        r.lot||'',
        c3pct,
        c4pct,
        nw,
        c3,
        c4,
        fqVal||'',
        diff||'',
        r.truckWt||'',
        r.timeIn||'',
        r.grossWt||'',
        r.timeOut||'',
        r.pressIn||'',
        r.pressOut||'',
        r.eng||'',
        r.dest||'',
        r.note||'',
        r.error||'',
        r.seal||'',
        r.weigher||'',
        r.custFull||'',
        r.truck||'',
        r.rmooc||'',
        r.driver||'',
        r.cw||'',
        r.maxTol||''
      ];
      let c='';
      for(let ci=0;ci<vals.length;ci++){
        const v=vals[ci];
        if(v===''||v===null||v===undefined) continue;
        const isStr=(typeof v==='string' && isNaN(parseFloat(v)));
        c += buildCellXml(colMap[ci], rn, v, isStr);
      }
      newXml += '<row r="'+rn+'">'+c+'</row>';
      rn++;
    });

    // Vessel Data rows — same column layout; scale/turn/weights blank, vessel name → AF (V406 parity)
    vsRows.forEach(r=>{
      const nw=parseFloat(String(r.lpg||'').replace(/,/g,''))||0;
      const c3=parseFloat(String(r.c3||'').replace(/,/g,''))||0;
      const c4=parseFloat(String(r.c4||'').replace(/,/g,''))||0;
      const c3pct = nw>0 ? parseFloat((c3/nw).toFixed(2)) : 0;
      const c4pct = parseFloat((1-c3pct).toFixed(2));
      const dateISOr = anyToISO(r.date) || giDateISO;
      const dateSerial2 = isoToSerial(dateISOr);
      const vals=[
        dateSerial2, dateSerial, String(r.doNo||''), r.customer||'', r.item||'', r.type||'LPG', // B-G
        '', '',                            // H Scale, I Turn
        r.tank||'', r.lot||'',             // J Tank, K Lot
        c3pct, c4pct, nw, c3, c4,          // L %C3, M %C4, N Net, O C3, P C4
        '', '', '',                        // Q FQ, R Diff, S TruckWt
        r.time||'',                        // T 1stTime
        '', '', '', '', '',                // U Gross, V 2ndTime, W PressIn, X PressOut, Y Eng
        r.dest||'',                        // Z Dest
        '', '', '', '', '',                // AA Note, AB Error, AC Seal, AD Weigher, AE CustWMS
        r.vessel||'',                      // AF (vessel name)
        '', '', '', ''                     // AG Rmooc, AH Driver, AI CW, AJ MaxTol
      ];
      let c='';
      for(let ci=0;ci<vals.length;ci++){
        const v=vals[ci];
        if(v===''||v===null||v===undefined) continue;
        const isStr=(typeof v==='string' && isNaN(parseFloat(v)));
        c += buildCellXml(colMap[ci], rn, v, isStr);
      }
      newXml += '<row r="'+rn+'">'+c+'</row>';
      rn++;
    });

    // Remove any existing rows ≥ startRow (template placeholder cleanup)
    const cleanRe = new RegExp('<row[^>]*\\br="(\\d+)"[^>]*>[\\s\\S]*?</row>', 'g');
    const removeRanges=[];
    let cleanMatch;
    while((cleanMatch=cleanRe.exec(sXml))!==null){
      const rowNum=parseInt(cleanMatch[1]);
      if(rowNum>=startRow) removeRanges.push({ start:cleanMatch.index, end:cleanMatch.index+cleanMatch[0].length, row:rowNum });
    }
    for(let ri=removeRanges.length-1; ri>=0; ri--){
      sXml = sXml.substring(0, removeRanges[ri].start) + sXml.substring(removeRanges[ri].end);
    }
    if(removeRanges.length) log('ℹ Raw Data: removed '+removeRanges.length+' existing rows ≥ '+startRow+' (placeholder cleanup)','info');

    // Insert before </sheetData>
    const insertPos = sXml.lastIndexOf('</sheetData>');
    if(insertPos<0){ log('❌ Raw Data: cannot find </sheetData>','er'); return; }
    sXml = sXml.substring(0, insertPos) + newXml + sXml.substring(insertPos);

    /* Report date → B1 & V1 (giữ nguyên style/định dạng date sẵn có của ô,
       chỉ thay value bằng Excel serial; bỏ t="s" nếu ô đang là string). */
    function setHeaderDateCell(ref){
      const re = new RegExp('<c\\s+r="'+ref+'"([^>]*?)(?:/>|>[\\s\\S]*?</c>)');
      const m = sXml.match(re);
      if(m){
        const attrs = (m[1]||'').replace(/\s+t="[^"]*"/g,'');   // keep s= (style), drop t= (type)
        sXml = sXml.replace(re, '<c r="'+ref+'"'+attrs+'><v>'+dateSerial+'</v></c>');
        log('ℹ Raw Data: '+ref+' = report date ('+giDateISO+')','info');
      } else {
        log('⚠ Raw Data: cell '+ref+' not found in row 1 — date not written','warn');
      }
    }
    setHeaderDateCell('B1');
    setHeaderDateCell('V1');

    state.zip.file(sh.path, sXml);

    // Append new shared strings
    if(_sstNew.length && sstXml){
      let newSI='';
      _sstNew.forEach(s=>{ newSI += '<si><t>'+xmlEsc(s)+'</t></si>'; });
      const sstInsert = sstXml.lastIndexOf('</sst>');
      if(sstInsert>=0){
        sstXml = sstXml.substring(0, sstInsert) + newSI + sstXml.substring(sstInsert);
        const totalCount = sst.length + _sstNew.length;
        sstXml = sstXml.replace(/count="(\d+)"/g, 'count="'+totalCount+'"');
        sstXml = sstXml.replace(/uniqueCount="(\d+)"/g, 'uniqueCount="'+totalCount+'"');
        state.zip.file('xl/sharedStrings.xml', sstXml);
      }
    }
    log('✅ Raw Data: '+(rn-startRow)+' rows ('+tlRows.length+' TL · '+vsRows.length+' Vessel) from row '+startRow,'ok');
  }

  /* ═════════════════════════════════════════════════════════
     FILL — Summary Data sheet (slot-fill)
     Pre-existing slot rows R7..TotalRow-1. Each row mapped to a
     unique (customer,trade,type) group. Remaining slots hidden.
     ═════════════════════════════════════════════════════════ */
  async function fillSummary(giDateISO){
    const sh = await findSheet(state.zip, /Summary\s*Data/i);
    if(!sh){ log('⚠ Sheet "Summary Data" not found — skip','warn'); return; }
    log('── Summary Data ──','info');

    // Group TL rows + Vessel rows (vessel → gi.ship)
    const tlRows = collectTL(giDateISO);
    const vsRows = collectVS(giDateISO);
    if(!tlRows.length && !vsRows.length){ log('ℹ Summary: 0 rows (TL+Vessel) for '+giDateISO,'info'); return; }
    const groups={};
    tlRows.forEach(r=>{
      const nw = parseFloat(String(r.lpgQty||'').replace(/,/g,''))||0;
      let c3 = parseFloat(String(r.c3Kg||'').replace(/,/g,''))||0;
      let c4 = parseFloat(String(r.c4Kg||'').replace(/,/g,''))||0;
      if(!c3 && !c4 && nw>0){ c3=nw/2; c4=nw/2; }
      const tank  = String(r.ltank||'').trim();
      const sloc  = tank.includes('3501')?'2100':tank.includes('3502')?'2101':'';
      const isPure= /pure|propane|butane/i.test(r.type||'');
      const price = parseFloat(String(r.price||'').replace(/,/g,''))||null;
      const cust  = r.cust || '';
      const key   = cust+'|'+(r.trade||'')+'|'+(r.type||'');
      if(!groups[key]) groups[key] = {
        cust, trade:r.trade||'', type:r.type||'', trips:0, loadQty:0, price, isVessel:false,
        _tripSet:new Set(),
        gi:{tk3501:{c3:0,c4:0}, tk3502:{c3:0,c4:0}, ship:{c3:0,c4:0}, pure:{c3:0,c4:0}}
      };
      const g = groups[key];
      // Trip key: doNo+truck+scaleNo+turn (best-effort distinct trip)
      const tk = String(r.doNo||'')+'|'+String(r.truck||'')+'|'+String(r.scaleNo||'')+'|'+String(r.turn||'');
      g._tripSet.add(tk);
      g.loadQty += nw;
      if(!g.price && price) g.price = price;
      if(isPure){ g.gi.pure.c3 += c3; g.gi.pure.c4 += c4; }
      else if(sloc==='2100'){ g.gi.tk3501.c3 += c3; g.gi.tk3501.c4 += c4; }
      else if(sloc==='2101'){ g.gi.tk3502.c3 += c3; g.gi.tk3502.c4 += c4; }
      else { g.gi.tk3501.c3 += c3; g.gi.tk3501.c4 += c4; }
    });
    // Vessel rows → ship GI column (grouped by cust|trade|type, V406 parity)
    vsRows.forEach(r=>{
      const nw = parseFloat(String(r.lpg||'').replace(/,/g,''))||0;
      let c3 = parseFloat(String(r.c3||'').replace(/,/g,''))||0;
      let c4 = parseFloat(String(r.c4||'').replace(/,/g,''))||0;
      if(!c3 && !c4 && nw>0){ c3=nw/2; c4=nw/2; }
      const price = parseFloat(String(r.price||'').replace(/,/g,''))||null;
      const cust  = r.customer || '';
      const key   = cust+'|'+(r.item||'')+'|'+(r.type||'');
      if(!groups[key]) groups[key] = {
        cust, trade:r.item||'', type:r.type||'', trips:0, loadQty:0, price, isVessel:true,
        _tripSet:new Set(),
        gi:{tk3501:{c3:0,c4:0}, tk3502:{c3:0,c4:0}, ship:{c3:0,c4:0}, pure:{c3:0,c4:0}}
      };
      const g = groups[key];
      g._tripSet.add('VS|'+String(r.doNo||'')+'|'+String(r.vessel||'')+'|'+String(r.lot||''));
      g.loadQty += nw;
      if(!g.price && price) g.price = price;
      g.gi.ship.c3 += c3; g.gi.ship.c4 += c4;
    });
    Object.values(groups).forEach(g=>{ g.trips = g._tripSet.size; });
    /* Vessel groups điền TRƯỚC, rồi mới tới TL; trong mỗi nhóm sort theo cust/trade. */
    const gList = Object.values(groups).sort((a,b)=>
      ((b.isVessel?1:0)-(a.isVessel?1:0)) || (a.cust.localeCompare(b.cust)) || (a.trade.localeCompare(b.trade)));
    log('ℹ Summary: '+gList.length+' groups, '+tlRows.length+' TL + '+vsRows.length+' Vessel rows','info');

    const sstF = state.zip.file('xl/sharedStrings.xml');
    const sstXml = sstF ? await sstF.async('string') : '';
    const sst = parseSST(sstXml);
    let sXml = await state.zip.file(sh.path).async('string');
    let rows = parseRows(sXml);

    // Find Total row (col B === 'Total')
    let totalRow=null, totalRowNum=-1;
    for(let i=0;i<rows.length;i++){
      const cm=rows[i].xml.match(/<c\s+r="B\d+"[^>]*>[\s\S]*?<\/c>/);
      if(cm){ const cv=cellVal(cm[0],sst); if(cv==='Total'){ totalRow=rows[i]; totalRowNum=rows[i].num; break; } }
    }
    if(!totalRow){ log('❌ Summary: cannot find Total row','er'); return; }
    const slotCount = totalRowNum-7;
    if(slotCount<1){ log('❌ Summary: invalid layout, Total row at '+totalRowNum,'er'); return; }

    let fillCount=gList.length;
    if(fillCount>slotCount){
      const shortBy=fillCount-slotCount;
      log('⚠ Summary: '+fillCount+' groups but only '+slotCount+' standby slots (short '+shortBy+'). Filling first '+slotCount+'. Add blank rows before Total in template and retry.','warn');
      if(typeof toast==='function') toast('⚠ Summary missing '+shortBy+' standby rows — only '+slotCount+'/'+fillCount,'er');
      fillCount=slotCount;
    }

    function extractSlotMeta(rowXml){
      const meta={styleByCol:{}, rowAttr:'', colAFull:''};
      const sRe=/<c\s+r="([A-Z]+)\d+"([^>]*?)(?:\/>|>)/g; let sM;
      while((sM=sRe.exec(rowXml))!==null){
        const sm=sM[2].match(/\bs="(\d+)"/);
        if(sm) meta.styleByCol[sM[1]] = sm[1];
      }
      const aM=rowXml.match(/<c\s+r="A\d+"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/);  /* non-greedy: KHÔNG được nuốt "/" của ô self-closing rồi tràn sang cột B */
      if(aM) meta.colAFull=aM[0];
      const raM=rowXml.match(/^<row\b([^>]*?)>/);
      if(raM) meta.rowAttr = raM[1].replace(/\br="\d+"/,'').replace(/\s*\bhidden="[^"]*"/,'').trim();
      return meta;
    }
    function bcStyled(col, rn, val, isStr, styleByCol){
      const sA=styleByCol[col]?' s="'+styleByCol[col]+'"':'';
      if(isStr){
        const sv = String(val==null?'':val).replace(/&/g,'&amp;').replace(/</g,'&lt;');
        return '<c r="'+col+rn+'"'+sA+' t="inlineStr"><is><t>'+sv+'</t></is></c>';
      }
      if(val===''||val===null||val===undefined||val===0) return sA ? '<c r="'+col+rn+'"'+sA+'/>' : '';
      return '<c r="'+col+rn+'"'+sA+'><v>'+val+'</v></c>';
    }
    function retargetColA(colAXml, rn){
      if(!colAXml) return '';
      return colAXml.replace(/r="A\d+"/, 'r="A'+rn+'"');
    }
    function buildSlotRow(rn, meta, g, hidden){
      let c = retargetColA(meta.colAFull, rn);
      const sb = meta.styleByCol;
      if(g){
        const tk1t=g.gi.tk3501.c3+g.gi.tk3501.c4;
        const tk2t=g.gi.tk3502.c3+g.gi.tk3502.c4;
        const shpt=g.gi.ship.c3+g.gi.ship.c4;
        const purt=g.gi.pure.c3+g.gi.pure.c4;
        c+=bcStyled('B',rn,g.cust,true,sb);
        c+=bcStyled('C',rn,g.trade,true,sb);
        c+=bcStyled('D',rn,g.type,true,sb);
        c+=bcStyled('E',rn,g.trips,false,sb);
        c+=bcStyled('F',rn,g.loadQty,false,sb);
        c+=bcStyled('G',rn,g.price||'',false,sb);
        c+=bcStyled('H',rn,g.gi.tk3501.c3,false,sb);
        c+=bcStyled('I',rn,g.gi.tk3501.c4,false,sb);
        c+=bcStyled('J',rn,tk1t,false,sb);
        c+=bcStyled('K',rn,g.gi.tk3502.c3,false,sb);
        c+=bcStyled('L',rn,g.gi.tk3502.c4,false,sb);
        c+=bcStyled('M',rn,tk2t,false,sb);
        c+=bcStyled('N',rn,g.gi.ship.c3,false,sb);
        c+=bcStyled('O',rn,g.gi.ship.c4,false,sb);
        c+=bcStyled('P',rn,shpt,false,sb);
        c+=bcStyled('Q',rn,g.gi.pure.c3,false,sb);
        c+=bcStyled('R',rn,g.gi.pure.c4,false,sb);
        c+=bcStyled('S',rn,purt,false,sb);
      } else {
        const cols=['B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S'];
        for(let k=0;k<cols.length;k++) c+=bcStyled(cols[k],rn,'',false,sb);
      }
      const rAttr = meta.rowAttr ? (' '+meta.rowAttr) : '';
      const hAttr = hidden ? ' hidden="1"' : '';
      return '<row r="'+rn+'"'+rAttr+hAttr+'>'+c+'</row>';
    }

    const slotByNum={};
    for(let i=0;i<rows.length;i++){
      const rn=rows[i].num;
      if(rn>=7 && rn<totalRowNum) slotByNum[rn] = rows[i];
    }
    let fallbackMeta=null;
    if(slotByNum[7]) fallbackMeta = extractSlotMeta(slotByNum[7].xml);
    else {
      for(let rn2=8; rn2<totalRowNum; rn2++){
        if(slotByNum[rn2]){ fallbackMeta = extractSlotMeta(slotByNum[rn2].xml); break; }
      }
    }
    if(!fallbackMeta){ log('❌ Summary: no slot rows found between R7 and Total','er'); return; }

    const missingSlots=[];
    for(let rn=totalRowNum-1; rn>=7; rn--){
      const gi=rn-7;
      const g=(gi<fillCount) ? gList[gi] : null;
      const hideIt=(g==null);
      const slot=slotByNum[rn];
      if(slot){
        const meta = extractSlotMeta(slot.xml);
        const newXml = buildSlotRow(rn, meta, g, hideIt);
        sXml = sXml.substring(0, slot.start) + newXml + sXml.substring(slot.end);
      } else {
        missingSlots.push({rn, g, hide:hideIt});
      }
    }
    if(missingSlots.length){
      rows = parseRows(sXml);
      let totAfter=null;
      for(let i=0;i<rows.length;i++){
        const cmT=rows[i].xml.match(/<c\s+r="B\d+"[^>]*>[\s\S]*?<\/c>/);
        if(cmT){ const cvT=cellVal(cmT[0],sst); if(cvT==='Total'){ totAfter=rows[i]; break; } }
      }
      if(totAfter){
        missingSlots.sort((a,b)=>a.rn-b.rn);
        let insXml='';
        missingSlots.forEach(ms=>{ insXml += buildSlotRow(ms.rn, fallbackMeta, ms.g, ms.hide); });
        sXml = sXml.substring(0, totAfter.start) + insXml + sXml.substring(totAfter.start);
      }
    }

    // Update Total row IN PLACE (same row number)
    rows = parseRows(sXml);
    let curTotal=null;
    for(let i=0;i<rows.length;i++){
      const cm4 = rows[i].xml.match(/<c\s+r="B\d+"[^>]*>[\s\S]*?<\/c>/);
      if(cm4){ const cv4=cellVal(cm4[0],sst); if(cv4==='Total'){ curTotal=rows[i]; break; } }
    }
    if(!curTotal){ log('❌ Summary: lost Total row after manipulation','er'); return; }

    const totals={trips:0, loadQty:0, tk3501:{c3:0,c4:0}, tk3502:{c3:0,c4:0}, ship:{c3:0,c4:0}, pure:{c3:0,c4:0}};
    let totalPriceWeight=0, totalPriceSum=0;
    for(let gj=0;gj<fillCount;gj++){
      const g=gList[gj];
      totals.trips+=g.trips; totals.loadQty+=g.loadQty;
      totals.tk3501.c3+=g.gi.tk3501.c3; totals.tk3501.c4+=g.gi.tk3501.c4;
      totals.tk3502.c3+=g.gi.tk3502.c3; totals.tk3502.c4+=g.gi.tk3502.c4;
      totals.ship.c3+=g.gi.ship.c3;     totals.ship.c4+=g.gi.ship.c4;
      totals.pure.c3+=g.gi.pure.c3;     totals.pure.c4+=g.gi.pure.c4;
      if(g.price && g.loadQty){ totalPriceSum += g.price*g.loadQty; totalPriceWeight += g.loadQty; }
    }
    const avgPrice = totalPriceWeight>0 ? totalPriceSum/totalPriceWeight : 0;

    const tAttrMap={};
    let tRowAttr='';
    const tRe2=/<c\s+r="([A-Z]+)\d+"([^>]*?)(?:\/>|>)/g; let tM2;
    while((tM2=tRe2.exec(curTotal.xml))!==null){ const tm3=tM2[2].match(/\bs="(\d+)"/); if(tm3) tAttrMap[tM2[1]]=tm3[1]; }
    const traM=curTotal.xml.match(/^<row\b([^>]*?)>/);
    if(traM) tRowAttr = traM[1].replace(/\br="\d+"/,'').replace(/\s*\bhidden="[^"]*"/,'').trim();
    let tAFull='';
    const tAM=curTotal.xml.match(/<c\s+r="A\d+"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/);  /* non-greedy (self-closing safe) */
    if(tAM) tAFull=tAM[0];

    function bct(col, rn, val, isStr){
      const sA = tAttrMap[col] ? ' s="'+tAttrMap[col]+'"' : '';
      if(isStr){
        const sv = String(val==null?'':val).replace(/&/g,'&amp;').replace(/</g,'&lt;');
        return '<c r="'+col+rn+'"'+sA+' t="inlineStr"><is><t>'+sv+'</t></is></c>';
      }
      if(val===''||val===null||val===undefined||val===0) return sA?'<c r="'+col+rn+'"'+sA+'/>':'';
      return '<c r="'+col+rn+'"'+sA+'><v>'+val+'</v></c>';
    }
    const trn=totalRowNum;
    let tc = tAFull;
    tc += bct('B',trn,'Total',true);
    tc += bct('C',trn,'',false);
    tc += bct('D',trn,'',false);
    tc += bct('E',trn,totals.trips,false);
    tc += bct('F',trn,totals.loadQty,false);
    tc += bct('G',trn,avgPrice?Math.round(avgPrice*1000)/1000:'',false);
    tc += bct('H',trn,totals.tk3501.c3,false);
    tc += bct('I',trn,totals.tk3501.c4,false);
    tc += bct('J',trn,totals.tk3501.c3+totals.tk3501.c4,false);
    tc += bct('K',trn,totals.tk3502.c3,false);
    tc += bct('L',trn,totals.tk3502.c4,false);
    tc += bct('M',trn,totals.tk3502.c3+totals.tk3502.c4,false);
    tc += bct('N',trn,totals.ship.c3,false);
    tc += bct('O',trn,totals.ship.c4,false);
    tc += bct('P',trn,totals.ship.c3+totals.ship.c4,false);
    tc += bct('Q',trn,totals.pure.c3,false);
    tc += bct('R',trn,totals.pure.c4,false);
    tc += bct('S',trn,totals.pure.c3+totals.pure.c4,false);
    const newTotalXml = '<row r="'+trn+'"'+(tRowAttr?' '+tRowAttr:'')+'>'+tc+'</row>';
    sXml = sXml.substring(0, curTotal.start) + newTotalXml + sXml.substring(curTotal.end);

    // Update titles B2 & B3 — GIỮ NGUYÊN style (s=) của ô (B2 là merged cell)
    const dp=giDateISO.split('-');
    const _xmlEsc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    function setTitleCell(ref, str){
      const re = new RegExp('<c\\s+r="'+ref+'"([^>]*?)(?:/>|>[\\s\\S]*?</c>)');
      const m = sXml.match(re);
      if(!m){ log('⚠ Summary: cell '+ref+' not found — title not written','warn'); return; }
      const sm = (m[1]||'').match(/\bs="(\d+)"/);   // preserve existing style/format
      const sA = sm ? ' s="'+sm[1]+'"' : '';
      sXml = sXml.replace(re, '<c r="'+ref+'"'+sA+' t="inlineStr"><is><t xml:space="preserve">'+_xmlEsc(str)+'</t></is></c>');
    }
    setTitleCell('B2', '['+dp[1]+'/'+dp[2]+' 탱크로리 출하 일보] ');
    setTitleCell('B3', '['+dp[1]+'/'+dp[2]+' Daily summary]');

    // Update SUBTOTAL/SUM ranges to full slot range
    const lastDataR = totalRowNum-1;
    const allSumCols=['D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S'];
    allSumCols.forEach(cl=>{
      sXml = sXml.replace(new RegExp('SUBTOTAL\\(9,\\$'+cl+'\\$7:\\$'+cl+'\\$\\d+\\)','g'), 'SUBTOTAL(9,$'+cl+'$7:$'+cl+'$'+lastDataR+')');
      sXml = sXml.replace(new RegExp('SUM\\(\\$'+cl+'\\$7:\\$'+cl+'\\$\\d+\\)','g'),         'SUM($'+cl+'$7:$'+cl+'$'+lastDataR+')');
      sXml = sXml.replace(new RegExp('SUM\\('+cl+'7:'+cl+'\\d+\\)','g'),                     'SUM('+cl+'7:'+cl+lastDataR+')');
    });

    state.zip.file(sh.path, sXml);
    log('✅ Summary: filled '+fillCount+'/'+slotCount+' standby rows (R7-R'+(7+fillCount-1)+'), hidden '+(slotCount-fillCount)+' empty, Total at R'+totalRowNum,'ok');
  }

  /* ═════════════════════════════════════════════════════════
     PRE-CHECK MODAL
     ═════════════════════════════════════════════════════════ */
  function closePreCheck(){
    const m=document.getElementById('rpc-modal-bg');
    if(m) m.remove();
  }
  async function preCheck(){
    const giDate = document.getElementById('rpt-date')?.value;
    if(!giDate){ toast('⚠ No date selected','er'); return; }
    const prevDate = isoDayBefore(giDate);
    const toT = v => Math.round(v)/1000;
    const fmT = v => { const t=toT(v); return t?t.toFixed(3):'0'; };
    const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');

    // Collect
    const wmsGI_DOs = collectWmsGI(giDate);
    const tlRows    = collectTL(giDate).map(r=>({
      doNo: String(r.doNo||'').trim(),
      netKg: parseFloat(String(r.lpgQty||'').replace(/,/g,''))||0,
      c3Kg : parseFloat(String(r.c3Kg ||'').replace(/,/g,''))||0,
      c4Kg : parseFloat(String(r.c4Kg ||'').replace(/,/g,''))||0,
      tank : r.ltank||'',
      cust : r.cust||''
    }));
    const stCol = collectWmsST(giDate);
    const wms = stCol.wms, wmsSTcount = stCol.count;

    // SAP previous-day end
    const sapInit = {'2100':{C3:0,C4:0},'2101':{C3:0,C4:0}};
    let sapHas=false;
    collectSAPraw(prevDate).forEach(r=>{
      if(r.sloc!=='2100'&&r.sloc!=='2101') return;
      if(r.batch!=='D'&&r.batch!=='E') return;
      sapInit[r.sloc][r.mat] += (r.end||0); sapHas=true;
    });

    // Cross-check WMS GI ↔ TL Data
    const giVsTl=[];
    const tlDoMap={};
    tlRows.forEach(r=>{
      r.doNo.split(/[\s\/,]+/).map(d=>normDO(d)).forEach(d=>{ if(d) tlDoMap[d]=r; });
    });
    wmsGI_DOs.forEach(w=>{
      const dn=normDO(w.doNo), tl=tlDoMap[dn];
      const diff = tl ? Math.abs(w.pickKg - tl.netKg) : 0;
      const st = tl ? (diff>50?'warn':'ok') : 'miss';
      giVsTl.push({ doNo:w.doNo, cust:w.customer, wmsKg:w.pickKg,
        tlKg: tl?tl.netKg:null, c3ok: tl?(tl.c3Kg>0):false, c4ok: tl?(tl.c4Kg>0):false,
        diff, st });
    });
    tlRows.forEach(r=>{
      const found = r.doNo.split(/[\s\/,]+/).some(d=>wmsGI_DOs.some(w=>normDO(w.doNo)===normDO(d)));
      if(!found) giVsTl.push({ doNo:r.doNo, cust:r.cust, wmsKg:null, tlKg:r.netKg, c3ok:r.c3Kg>0, c4ok:r.c4Kg>0, diff:0, st:'tl_only' });
    });

    // GI by tank
    const giByTank={'2100':{C3:0,C4:0},'2101':{C3:0,C4:0}};
    tlRows.forEach(r=>{
      const sl=tankToSloc(r.tank); if(!sl) return;
      let c3=r.c3Kg, c4=r.c4Kg;
      if(!c3&&!c4&&r.netKg>0){ c3=r.netKg/2; c4=r.netKg/2; }
      giByTank[sl].C3+=c3; giByTank[sl].C4+=c4;
    });

    const nOk     = giVsTl.filter(r=>r.st==='ok').length;
    const nWarn   = giVsTl.filter(r=>r.st==='warn').length;
    const nMiss   = giVsTl.filter(r=>r.st==='miss').length;
    const nTlOnly = giVsTl.filter(r=>r.st==='tl_only').length;
    const noC3C4  = tlRows.filter(r=>!r.c3Kg&&!r.c4Kg&&r.netKg>0).length;

    // Build HTML
    let h='';

    // Summary cards
    h+='<div class="rpc-summary">';
    h+='<div class="rpc-scard '+(wmsGI_DOs.length?'ok':'err')+'"><div class="rpc-scard-title">📦 WMS GI</div><div class="rpc-scard-val">'+(wmsGI_DOs.length||'0')+' DOs</div><div class="rpc-scard-sub">'+(wmsGI_DOs.length?'Data ready':'⚠ MISSING — paste WMS GI')+'</div></div>';
    h+='<div class="rpc-scard '+(wmsSTcount?'ok':'err')+'"><div class="rpc-scard-title">🔄 WMS ST</div><div class="rpc-scard-val">'+(wmsSTcount?wmsSTcount+' entries':'MISSING')+'</div><div class="rpc-scard-sub">'+(wmsSTcount?'Data ready':'⚠ MISSING — paste WMS ST')+'</div></div>';
    h+='<div class="rpc-scard '+(tlRows.length?(noC3C4?'warn':'ok'):'err')+'"><div class="rpc-scard-title">⚖️ TL Data</div><div class="rpc-scard-val">'+tlRows.length+' rows</div><div class="rpc-scard-sub">'+(noC3C4?'⚠ '+noC3C4+' rows missing C3/C4 (50:50 fallback)':'C3/C4 complete')+'</div></div>';
    h+='<div class="rpc-scard '+(sapHas?'ok':'err')+'"><div class="rpc-scard-title">📊 SAP ('+prevDate+')</div><div class="rpc-scard-val">'+(sapHas?'✅ Has':'MISSING')+'</div><div class="rpc-scard-sub">'+(sapHas?'3501: '+fmT(sapInit['2100'].C3)+'/'+fmT(sapInit['2100'].C4)+' · 3502: '+fmT(sapInit['2101'].C3)+'/'+fmT(sapInit['2101'].C4)+' tons':'⚠ Init Stock = 0')+'</div></div>';
    h+='</div>';

    // WMS GI ↔ TL Data
    h+='<div class="rpc-section"><div class="rpc-stitle">📦 WMS GI ↔ TL DATA</div>';
    if(giVsTl.length){
      h+='<table class="rpc-tbl"><thead><tr><th>DO No.</th><th>Customer</th><th>WMS Pick (kg)</th><th>TL Net (kg)</th><th>Δ</th><th>C3/C4</th><th>Status</th></tr></thead><tbody>';
      giVsTl.forEach(r=>{
        const badge = r.st==='ok'?'<span class="rpc-badge ok">✓ OK</span>'
                    : r.st==='warn'?'<span class="rpc-badge warn">⚠ Δ&gt;50</span>'
                    : r.st==='miss'?'<span class="rpc-badge err">✗ MISSING TL</span>'
                    : '<span class="rpc-badge warn">⚠ TL Only</span>';
        const c3c4 = r.tlKg!==null ? (r.c3ok&&r.c4ok?'<span class="rpc-ok">✓</span>':'<span class="rpc-warn">⚠ 50:50</span>') : '—';
        h+='<tr><td style="font-weight:600">'+esc(r.doNo)+'</td><td>'+esc(r.cust)+'</td>';
        h+='<td class="num">'+(r.wmsKg!==null?Math.round(r.wmsKg).toLocaleString():'<span class="rpc-miss">—</span>')+'</td>';
        h+='<td class="num">'+(r.tlKg!==null?Math.round(r.tlKg).toLocaleString():'<span class="rpc-miss">—</span>')+'</td>';
        h+='<td class="num '+(r.diff>50?'rpc-warn':'')+'">'+Math.round(r.diff).toLocaleString()+'</td>';
        h+='<td style="text-align:center">'+c3c4+'</td><td>'+badge+'</td></tr>';
      });
      h+='</tbody></table>';
    } else h+='<div style="padding:10px;color:var(--ink-3);font-style:italic;text-align:center">No data</div>';
    h+='</div>';

    // GI by tank
    h+='<div class="rpc-section"><div class="rpc-stitle">⚖️ GI BY TANK → ST DATA (tons)</div>';
    h+='<table class="rpc-tbl"><thead><tr><th>Tank</th><th>C3 Cavern (net)</th><th>C4 Cavern (net)</th><th>C3 GI</th><th>C4 GI</th><th>ST Source</th></tr></thead><tbody>';
    ['2100','2101'].forEach(sl=>{
      const tkN=sl==='2100'?'TK-3501':'TK-3502';
      const src=wmsSTcount?'WMS ST':'⚠ MISSING';
      h+='<tr><td style="font-weight:700">'+tkN+'</td>';
      h+='<td class="num">'+fmT(wms[sl].fromCav.C3-wms[sl].toCav.C3)+'</td>';
      h+='<td class="num">'+fmT(wms[sl].fromCav.C4-wms[sl].toCav.C4)+'</td>';
      h+='<td class="num">'+fmT(giByTank[sl].C3)+'</td>';
      h+='<td class="num">'+fmT(giByTank[sl].C4)+'</td>';
      h+='<td><span class="rpc-badge '+(wmsSTcount?'ok':'err')+'">'+src+'</span></td></tr>';
    });
    h+='</tbody></table></div>';

    // Vessel Data → Cavern GI (vào Raw Data + Summary cột Ship)
    const vsRows = collectVS(giDate);
    const vn = v => parseFloat(String(v==null?'':v).replace(/,/g,''))||0;
    h+='<div class="rpc-section"><div class="rpc-stitle">🚢 VESSEL DATA → CAVERN GI (tons)</div>';
    if(vsRows.length){
      h+='<table class="rpc-tbl"><thead><tr><th>DO No.</th><th>Vessel</th><th>Customer</th><th>Trade</th><th>Tank</th><th>C3 (t)</th><th>C4 (t)</th><th>Net (t)</th></tr></thead><tbody>';
      let vC3=0,vC4=0,vNet=0;
      vsRows.forEach(r=>{
        const c3=vn(r.c3), c4=vn(r.c4), net=vn(r.lpg!=null&&r.lpg!==''?r.lpg:(c3+c4));
        vC3+=c3; vC4+=c4; vNet+=net;
        h+='<tr><td style="font-weight:600">'+esc(r.doNo)+'</td><td>'+esc(r.vessel)+'</td><td>'+esc(r.customer)+'</td><td>'+esc(r.item)+'</td><td>'+esc(r.tank)+'</td>';
        h+='<td class="num">'+fmT(c3)+'</td><td class="num">'+fmT(c4)+'</td><td class="num">'+fmT(net)+'</td></tr>';
      });
      h+='<tr style="font-weight:700;background:#f5f0ff"><td colspan="5">TOTAL · '+vsRows.length+' shipment'+(vsRows.length>1?'s':'')+'</td>';
      h+='<td class="num">'+fmT(vC3)+'</td><td class="num">'+fmT(vC4)+'</td><td class="num">'+fmT(vNet)+'</td></tr>';
      h+='</tbody></table>';
      h+='<div class="rpc-note ok">✅ '+vsRows.length+' chuyến tàu sẽ được ghi vào sheet Raw Data và gộp vào Summary (cột Ship).</div>';
    } else {
      h+='<div class="rpc-note warn">ℹ Không có chuyến tàu (Vessel Data) nào có GI Date = '+giDate+'. Nếu hôm nay có nhập tàu, kiểm tra tab 🚢 VESSEL (nhớ điền GI Date).</div>';
    }
    h+='</div>';

    // SAP 5-day cross-check (needs file loaded)
    if(sapHas && state.zip){
      const sapVerify = await verifySAP5Days(giDate);
      h+='<div class="rpc-section"><div class="rpc-stitle">📊 SAP CROSS-CHECK (last 5 days)</div>';
      if(sapVerify.diffs && sapVerify.diffs.length){
        h+='<table class="rpc-tbl"><thead><tr><th>Date</th><th>SLoc</th><th>Mat</th><th>Item</th><th>Description</th></tr></thead><tbody>';
        sapVerify.diffs.forEach(d=>{
          h+='<tr><td>'+(d.date||'')+'</td><td>'+(d.sloc||'')+'</td><td>'+(d.mat||'')+'</td><td>'+(d.field||'')+'</td><td class="rpc-err">'+esc(d.desc||'')+'</td></tr>';
        });
        h+='</tbody></table>';
      } else h+='<div class="rpc-note ok">✅ All 5 days match</div>';
      h+='</div>';
    } else if(sapHas && !state.zip){
      h+='<div class="rpc-section"><div class="rpc-stitle">📊 SAP CROSS-CHECK</div><div class="rpc-note warn">⚠ Load the Excel report file to enable SAP 5-day cross-check</div></div>';
    }

    // SAP cross-check export date
    const sapToday={'2100':{gi_C3:0,gi_C4:0,trs_C3:0,trs_C4:0,init_C3:0,init_C4:0,end_C3:0,end_C4:0},
                    '2101':{gi_C3:0,gi_C4:0,trs_C3:0,trs_C4:0,init_C3:0,init_C4:0,end_C3:0,end_C4:0}};
    let hasSapToday=false;
    collectSAPraw(giDate).forEach(r=>{
      if(r.sloc!=='2100'&&r.sloc!=='2101') return;
      if(r.batch!=='D'&&r.batch!=='E') return;
      hasSapToday=true;
      sapToday[r.sloc]['gi_'+r.mat]+=Math.abs(r.gi||0);
      sapToday[r.sloc]['trs_'+r.mat]+=(r.trs||0);
      sapToday[r.sloc]['init_'+r.mat]+=(r.init||0);
      sapToday[r.sloc]['end_'+r.mat]+=(r.end||0);
    });
    if(hasSapToday){
      h+='<div class="rpc-section"><div class="rpc-stitle" style="color:var(--blue)">🔒 SAP CROSS-CHECK EXPORT DATE ('+giDate+') — REFERENCE DATA</div>';
      h+='<div class="rpc-note info">⚠ <b>SAP is the most accurate data source.</b> If there is a discrepancy between SAP and calculated data (WMS/TL), recheck before exporting.</div>';
      const sapChecks=[
        {sl:'2100',mat:'C3',tank:'TK-3501'},
        {sl:'2100',mat:'C4',tank:'TK-3501'},
        {sl:'2101',mat:'C3',tank:'TK-3502'},
        {sl:'2101',mat:'C4',tank:'TK-3502'}
      ];
      const sapDiffsToday=[];
      h+='<table class="rpc-tbl"><thead><tr><th>Tank</th><th>Mat</th><th>Item</th><th>SAP (ref)</th><th>System</th><th>Δ (t)</th><th>Status</th></tr></thead><tbody>';
      sapChecks.forEach(ck=>{
        const sapGI_kg = sapToday[ck.sl]['gi_'+ck.mat];
        const tlGI_kg  = giByTank[ck.sl][ck.mat];
        const giDiffKg = Math.abs(sapGI_kg-tlGI_kg);
        const giSt     = giDiffKg>50?'warn':'ok';
        if(giDiffKg>50) sapDiffsToday.push(ck.tank+' '+ck.mat+' GI: SAP='+fmT(sapGI_kg)+'t vs TL='+fmT(tlGI_kg)+'t (Δ='+fmT(giDiffKg)+'t)');
        h+='<tr><td style="font-weight:700">'+ck.tank+'</td><td>'+ck.mat+'</td><td>GI Tanlorry</td>';
        h+='<td class="num" style="font-weight:700;color:var(--navy)">'+fmT(sapGI_kg)+'</td>';
        h+='<td class="num">'+fmT(tlGI_kg)+'</td>';
        h+='<td class="num '+(giSt==='warn'?'rpc-warn':'')+'">'+fmT(giDiffKg)+'</td>';
        h+='<td>'+(giSt==='ok'?'<span class="rpc-badge ok">✓ OK</span>':'<span class="rpc-badge err">❌ MISMATCH</span>')+'</td></tr>';

        const sapTrs_kg = sapToday[ck.sl]['trs_'+ck.mat];
        const wmsCav_kg = (wms[ck.sl].fromCav[ck.mat]-wms[ck.sl].toCav[ck.mat])+wms[ck.sl].tkXfer[ck.mat];
        const trsDiffKg = Math.abs(sapTrs_kg-wmsCav_kg);
        const trsSt     = trsDiffKg>50?'warn':'ok';
        if(trsDiffKg>50) sapDiffsToday.push(ck.tank+' '+ck.mat+' Transfer: SAP='+fmT(sapTrs_kg)+'t vs WMS='+fmT(wmsCav_kg)+'t (Δ='+fmT(trsDiffKg)+'t)');
        h+='<tr><td></td><td>'+ck.mat+'</td><td>Transfer (net)</td>';
        h+='<td class="num" style="font-weight:700;color:var(--navy)">'+fmT(sapTrs_kg)+'</td>';
        h+='<td class="num">'+fmT(wmsCav_kg)+'</td>';
        h+='<td class="num '+(trsSt==='warn'?'rpc-warn':'')+'">'+fmT(trsDiffKg)+'</td>';
        h+='<td>'+(trsSt==='ok'?'<span class="rpc-badge ok">✓ OK</span>':'<span class="rpc-badge err">❌ MISMATCH</span>')+'</td></tr>';

        if(sapHas){
          const sapInitKg = sapToday[ck.sl]['init_'+ck.mat];
          const prevEndKg = sapInit[ck.sl][ck.mat];
          const initDiffKg = Math.abs(sapInitKg-prevEndKg);
          const initSt     = initDiffKg>50?'warn':'ok';
          if(initDiffKg>50) sapDiffsToday.push(ck.tank+' '+ck.mat+' Init: SAP('+giDate+')='+fmT(sapInitKg)+'t vs SAP End('+prevDate+')='+fmT(prevEndKg)+'t (Δ='+fmT(initDiffKg)+'t)');
          h+='<tr><td></td><td>'+ck.mat+'</td><td>Init Stock</td>';
          h+='<td class="num" style="font-weight:700;color:var(--navy)">'+fmT(sapInitKg)+'</td>';
          h+='<td class="num">'+fmT(prevEndKg)+' <span style="font-size:9px;color:var(--ink-3)">(SAP end '+prevDate+')</span></td>';
          h+='<td class="num '+(initSt==='warn'?'rpc-warn':'')+'">'+fmT(initDiffKg)+'</td>';
          h+='<td>'+(initSt==='ok'?'<span class="rpc-badge ok">✓ OK</span>':'<span class="rpc-badge err">❌ MISMATCH</span>')+'</td></tr>';
        }
        const sapEndKg = sapToday[ck.sl]['end_'+ck.mat];
        h+='<tr style="border-bottom:2px solid var(--line)"><td></td><td>'+ck.mat+'</td><td>End Stock</td>';
        h+='<td class="num" style="font-weight:700;color:var(--navy)">'+fmT(sapEndKg)+'</td>';
        h+='<td class="num" colspan="3" style="color:var(--ink-3);font-size:10px">SAP End = Init + Transfer − GI</td></tr>';
      });
      h+='</tbody></table>';
      if(sapDiffsToday.length){
        h+='<div class="rpc-note err"><b>❌ DETECTED '+sapDiffsToday.length+' MISMATCHES WITH SAP (reference):</b><br>';
        sapDiffsToday.forEach(d=>{ h+='• '+esc(d)+'<br>'; });
        h+='<br><b style="color:var(--red)">→ RECHECK WMS/TL data before exporting!</b></div>';
      } else {
        h+='<div class="rpc-note ok">✅ All export-date data MATCHES SAP</div>';
      }
      h+='</div>';
    }

    // Warnings summary
    const warns=[];
    if(!wmsGI_DOs.length) warns.push('❌ MISSING WMS GI — GI data inaccurate');
    if(!wmsSTcount)       warns.push('❌ MISSING WMS ST — Cavern/Transfer = 0');
    if(!sapHas)           warns.push('⚠ MISSING SAP for '+prevDate+' — Init Stock = 0');
    if(!hasSapToday)      warns.push('⚠ MISSING SAP for '+giDate+' — cannot cross-check export date');
    if(nMiss)             warns.push('⚠ '+nMiss+' DOs in WMS GI not found in TL Data');
    if(nTlOnly)           warns.push('⚠ '+nTlOnly+' DOs only in TL Data (no WMS GI)');
    if(noC3C4)            warns.push('⚠ '+noC3C4+' TL rows missing C3/C4 — using 50:50 fallback');
    if(warns.length){
      h+='<div class="rpc-section"><div class="rpc-stitle" style="color:var(--red)">⚠ WARNINGS</div>';
      h+='<div class="rpc-note err" style="color:var(--red)">';
      warns.forEach(w=>{ h+=esc(w)+'<br>'; });
      h+='</div></div>';
    }

    // Modal
    let modal='<div class="rpc-bg" id="rpc-modal-bg" onclick="if(event.target===this) rptClosePreCheck()">';
    modal+='<div class="rpc-modal">';
    modal+='<div class="rpc-hdr"><span style="font-size:22px">📋</span><span class="rpc-hdr-title">PRE-EXPORT DATA CHECK</span><span class="rpc-hdr-date">'+giDate+'</span></div>';
    modal+='<div class="rpc-body">'+h+'</div>';
    modal+='<div class="rpc-footer"><button class="rpc-btn" onclick="rptClosePreCheck()">✕ Close</button><button class="rpc-btn go" onclick="rptClosePreCheck();rptExecuteExport()">⚡ EXPORT REPORT</button></div>';
    modal+='</div></div>';
    document.body.insertAdjacentHTML('beforeend', modal);
  }

  /* ═════════════════════════════════════════════════════════
     EXECUTE EXPORT
     ═════════════════════════════════════════════════════════ */
  async function executeExport(){
    if(!state.zip){ toast('❌ No report file selected — pick one first','er'); return; }
    if(state.fileHandle){
      const ok=await reload();
      if(ok) log('🔄 Refreshed: '+state.fileName,'info');
    }
    const giDate = document.getElementById('rpt-date').value;
    if(!giDate){ toast('⚠ No date selected','er'); return; }

    log('═══════════════════════════════════════','info');
    log('📋 EXPORTING REPORT FOR '+giDate,'info');
    log('═══════════════════════════════════════','info');

    // Pre-check: WMS GI
    const wmsGI = collectWmsGI(giDate);
    if(!wmsGI.length){
      log('❌ WMS GI: NO data for '+giDate+' (0 DOs)','er');
      if(!confirm('⚠ NO WMS GI for '+giDate+'.\n\nGI data will be inaccurate.\nOK to continue, Cancel to abort.')) return;
    } else {
      log('✅ WMS GI: '+wmsGI.length+' DOs for '+giDate,'ok');
    }

    // Collect WMS ST + GI
    const stCol = collectWmsST(giDate);
    const wms = stCol.wms;
    const wmsSTcount = stCol.count;
    if(!wmsSTcount) log('⚠ WMS ST: no data for '+giDate,'warn');

    const gi = collectGIbyTank(giDate);

    const toT = v=>Math.round(v)/1000;
    log('── ST Data values (tons) ──','info');
    log('TK-3501 C3: cav='+toT(wms['2100'].fromCav.C3-wms['2100'].toCav.C3)+' xIn='+toT(Math.max(0,wms['2100'].tkXfer.C3))+' xOut='+toT(Math.abs(Math.min(0,wms['2100'].tkXfer.C3)))+' GI='+toT(gi['2100'].C3),'info');
    log('TK-3501 C4: cav='+toT(wms['2100'].fromCav.C4-wms['2100'].toCav.C4)+' xIn='+toT(Math.max(0,wms['2100'].tkXfer.C4))+' xOut='+toT(Math.abs(Math.min(0,wms['2100'].tkXfer.C4)))+' GI='+toT(gi['2100'].C4),'info');
    log('TK-3502 C3: cav='+toT(wms['2101'].fromCav.C3-wms['2101'].toCav.C3)+' xIn='+toT(Math.max(0,wms['2101'].tkXfer.C3))+' xOut='+toT(Math.abs(Math.min(0,wms['2101'].tkXfer.C3)))+' GI='+toT(gi['2101'].C3),'info');
    log('TK-3502 C4: cav='+toT(wms['2101'].fromCav.C4-wms['2101'].toCav.C4)+' xIn='+toT(Math.max(0,wms['2101'].tkXfer.C4))+' xOut='+toT(Math.abs(Math.min(0,wms['2101'].tkXfer.C4)))+' GI='+toT(gi['2101'].C4),'info');

    // SAP 5-day cross-check
    const sapVerify = await verifySAP5Days(giDate);
    if(sapVerify.noFile){
      log('⚠ SAP cross-check: report file not loaded','warn');
    } else if(sapVerify.noSAP){
      log('⚠ SAP: no data available → cannot cross-check','warn');
      if(!confirm('⚠ NO SAP data for cross-check.\n\nOK to skip check, Cancel to abort.')) return;
    } else if(sapVerify.diffs.length){
      log('❌ SAP CROSS-CHECK: '+sapVerify.diffs.length+' discrepancies in last 5 days','er');
      sapVerify.diffs.forEach(d=>log('   '+d.desc,'er'));
    } else {
      log('✅ SAP 5-day cross-check: OK','ok');
    }

    // SAP cross-check export-date
    const sapTodayCheck={'2100':{gi_C3:0,gi_C4:0,trs_C3:0,trs_C4:0},'2101':{gi_C3:0,gi_C4:0,trs_C3:0,trs_C4:0}};
    let hasSapToday=false;
    collectSAPraw(giDate).forEach(r=>{
      if(r.sloc!=='2100'&&r.sloc!=='2101') return;
      if(r.batch!=='D'&&r.batch!=='E') return;
      hasSapToday=true;
      sapTodayCheck[r.sloc]['gi_'+r.mat]+=Math.abs(r.gi||0);
      sapTodayCheck[r.sloc]['trs_'+r.mat]+=(r.trs||0);
    });
    if(hasSapToday){
      log('── SAP cross-check export-date '+giDate+' ──','info');
      const sapTodayDiffs=[];
      [{sl:'2100',mat:'C3',tk:'TK-3501'},{sl:'2100',mat:'C4',tk:'TK-3501'},
       {sl:'2101',mat:'C3',tk:'TK-3502'},{sl:'2101',mat:'C4',tk:'TK-3502'}].forEach(ck=>{
        const sapGI = sapTodayCheck[ck.sl]['gi_'+ck.mat];
        const tlGI  = gi[ck.sl][ck.mat];
        if(Math.abs(sapGI-tlGI)>50){
          const msg=ck.tk+' '+ck.mat+' GI: SAP='+toT(sapGI)+'t, TL='+toT(tlGI)+'t, Δ='+toT(sapGI-tlGI)+'t';
          sapTodayDiffs.push(msg); log('❌ '+msg,'er');
        }
        const sapTrs = sapTodayCheck[ck.sl]['trs_'+ck.mat];
        const wmsTrs = (wms[ck.sl].fromCav[ck.mat]-wms[ck.sl].toCav[ck.mat])+wms[ck.sl].tkXfer[ck.mat];
        if(Math.abs(sapTrs-wmsTrs)>50){
          const msg2=ck.tk+' '+ck.mat+' Transfer: SAP='+toT(sapTrs)+'t, WMS='+toT(wmsTrs)+'t, Δ='+toT(sapTrs-wmsTrs)+'t';
          sapTodayDiffs.push(msg2); log('❌ '+msg2,'er');
        }
      });
      if(sapTodayDiffs.length){
        log('❌ SAP export-date: '+sapTodayDiffs.length+' discrepancies — SAP is the reference!','er');
        if(!confirm('❌ SAP FOR EXPORT DATE ('+giDate+') HAS DISCREPANCIES:\n\n'+sapTodayDiffs.join('\n')+'\n\n⚠ SAP is the most accurate data!\nOK to continue, Cancel to abort and check.')) return;
      } else {
        log('✅ SAP export-date '+giDate+': all match','ok');
      }
    } else {
      log('⚠ SAP: no data for export-date '+giDate+' — cannot cross-check','warn');
    }

    // Fill ST Data
    const stSheet = await findSheet(state.zip, /^ST\s*Data$/i);
    if(!stSheet){ log('❌ Cannot find sheet "ST Data"','er'); return; }
    const sstF = state.zip.file('xl/sharedStrings.xml');
    const sstXml = sstF ? await sstF.async('string') : '';
    const sst = parseSST(sstXml);
    let sXml = await state.zip.file(stSheet.path).async('string');
    const stRes = fillSTDataRow(sXml, giDate, wms, gi, sst);
    if(!stRes.ok){ log('❌ '+stRes.msg,'er'); return; }
    sXml = stRes.xml;
    log('✅ ST Data: filled date '+giDate+' (row '+stRes.rowNum+')','ok');
    state.zip.file(stSheet.path, sXml);

    // Fill Raw Data
    await fillRawData(giDate);
    // Fill Summary Data
    await fillSummary(giDate);

    // Force Excel recalc, drop calcChain
    const wbFile = state.zip.file('xl/workbook.xml');
    if(wbFile){
      let wbXml = await wbFile.async('string');
      if(wbXml.indexOf('fullCalcOnLoad')===-1){
        if(wbXml.indexOf('<calcPr')!==-1) wbXml = wbXml.replace(/<calcPr\b/, '<calcPr fullCalcOnLoad="1"');
        else wbXml = wbXml.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
        state.zip.file('xl/workbook.xml', wbXml);
        log('✅ Force recalc: fullCalcOnLoad=1 added','ok');
      }
    }
    state.zip.remove('xl/calcChain.xml');

    log('⏳ Generating file…','info');
    const blob = await state.zip.generateAsync({
      type:'blob',
      mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      compression:'DEFLATE',
      compressionOptions:{ level:6 }
    });
    const baseName = state.fileName.replace(/\.xlsx$/i,'').replace(/_\d{4}-\d{2}-\d{2}(_\d{4}-\d{2}-\d{2})*$/,'');
    const dlName   = baseName + '_' + giDate + '.xlsx';

    let saved=false;
    if(window.showSaveFilePicker){
      try{
        const pickerOpts = {
          suggestedName: dlName,
          types: [{ description:'Excel Workbook', accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx']} }]
        };
        if(state.fileHandle) pickerOpts.startIn = state.fileHandle;
        const saveHandle = await window.showSaveFilePicker(pickerOpts);
        const w = await saveHandle.createWritable();
        await w.write(blob); await w.close();
        log('💾 Saved: '+saveHandle.name+' ('+Math.round(blob.size/1024)+' KB) — source untouched','ok');
        saved=true;
      }catch(e){
        if(e.name==='AbortError'){ log('⚠ Save dialog cancelled','warn'); toast('⚠ File save cancelled','er'); return; }
        log('⚠ Save dialog error: '+e.message+' → fallback download','warn');
      }
    }
    if(!saved){
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a'); a.href=url; a.download=dlName; a.click();
      URL.revokeObjectURL(url);
      log('💾 Downloaded: '+dlName+' ('+Math.round(blob.size/1024)+' KB) — source untouched','ok');
    }
    log('═══ DONE ═══','ok');
    toast('📋 Report '+giDate+' — OK!','ok');
  }

  /* ─────────── INIT ─────────── */
  function init(){
    const dt=document.getElementById('rpt-date');
    const dtSc=document.getElementById('sc-rpt-date');
    if(dt  && !dt.value)  dt.value  = isoToday();
    if(dtSc&& !dtSc.value)dtSc.value= isoToday();
  }

  /* ─────────── PUBLIC API ─────────── */
  return { init, pickFile, setDate, preCheck, closePreCheck, executeExport, log, clearLog,
           get state(){ return state; } };
})();

/* ── onclick handlers (global) ── */
window.rptPickFile      = ()=>RPT.pickFile();
window.rptSetDate       = (w)=>RPT.setDate(w);
window.rptPreCheck      = ()=>RPT.preCheck();
window.rptClosePreCheck = ()=>RPT.closePreCheck();
window.rptExecuteExport = ()=>RPT.executeExport();
window.rptClearLog      = ()=>RPT.clearLog();

/* ── In-Scale Report Engine shortcut (v4.28.1) ──
   The full Report Engine lives on the Report tab. The Scale Row-1 cluster
   #4 is a compact shortcut: own DOM (sc-rpt-* IDs), own buttons that
   delegate to the same rpt* window globals. State stays in sync through
   RPT.updateUI() (filename / badge / export-enabled) and RPT.setDate()
   (quick-buttons mirror to both inputs). When the operator types a date
   directly into the Scale shortcut input, scRptSyncDate() mirrors it
   into #rpt-date so RPT.executeExport / RPT.preCheck (which read by ID
   from the Report tab) pick up the correct value.

   The earlier v4.22.19 DOM-relocator (moveReportShellToScale /
   moveReportShellToReportTab) is retired; .rpt-shell stays at
   #page-report. The window.move* functions are kept as no-op shims for
   backward-compat with any stale call sites. */
window.scRptSyncDate = function(v){
  const dt=document.getElementById('rpt-date');
  if(dt) dt.value=v||'';
};
window.moveReportShellToScale     = function(){};
window.moveReportShellToReportTab = function(){};
window.openScaleReportModal       = function(){};
window.closeScaleReportModal      = function(){};

/* ── Scale → KTPTVC modal (v4.30.0) ──
   Opens the KTPTVC selection table in a modal overlay so the operator
   stays on Scale instead of switching to the Print tab. Implementation:
   DOM-relocation — move #pf-sub-kt INTO #kt-modal-host on open, return
   it to its original parent on close. This preserves every existing kt-*
   id and JS function (ktLoad, ktSelectAll, ktPrint, ktSortByEng) with
   zero duplication. The print page's pf-tab-kt also routes through this
   modal so both entry points show the same UI. */
let _ktOrigParent = null;
let _ktOrigNext = null;
window.scOpenKtptvc = function(){
  const pane = document.getElementById('pf-sub-kt');
  const host = document.getElementById('kt-modal-host');
  const bg   = document.getElementById('kt-modal');
  if(!pane || !host || !bg){ console.warn('[KT] modal pieces missing'); return; }
  /* Stash original location once */
  if(!_ktOrigParent){
    _ktOrigParent = pane.parentNode;
    _ktOrigNext   = pane.nextSibling;
  }
  /* Move pane into modal (no clone — preserves IDs / state / listeners) */
  if(pane.parentNode !== host) host.appendChild(pane);
  /* Make the pane visible regardless of pfSwitch state. NB: .pf-sub defaults to
     display:none and only .pf-sub.on is shown, so clearing the inline style would
     hide it again — force flex (matches .pf-sub.on) so the toolbar + table render. */
  pane.style.display = 'flex';
  bg.classList.add('on');
  /* Trigger initial load if date already set, otherwise default to today */
  try{
    const di = document.getElementById('kt-date');
    if(di && !di.value){
      const d=new Date(), p=n=>String(n).padStart(2,'0');
      di.value = d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
    }
    if(typeof ktLoad === 'function') ktLoad();
  }catch(_){}
};
window.scCloseKtptvc = function(){
  const pane = document.getElementById('pf-sub-kt');
  const bg   = document.getElementById('kt-modal');
  if(bg) bg.classList.remove('on');
  /* Return pane to its print-page home so the Print tab still works */
  if(pane && _ktOrigParent){
    /* Drop the inline display we forced on open so the print page's pfSwitch
       (.pf-sub / .pf-sub.on) governs visibility there again. */
    pane.style.display = '';
    if(_ktOrigNext && _ktOrigNext.parentNode === _ktOrigParent){
      _ktOrigParent.insertBefore(pane, _ktOrigNext);
    } else {
      _ktOrigParent.appendChild(pane);
    }
  }
};

/* ============================================================
   NOTIF · NOTIFICATIONS MODAL (v4.30.0)
   ────────────────────────────────────────────────────────────
   Single popup that consolidates Engineer-facing notifications:
     tankmix — pending tank mixes (driven by MIXNOTIFY.render →
               _syncBadge → NOTIF.setCount('tankmix', n))
     cert    — placeholder for expired/missing cert summaries
     sync    — placeholder for WG/WS/TL sync warnings
     all     — total count (sum of the others)
   The Engineer-Notification button in Row 1 Cluster 2 opens it;
   its badge counter follows _counts.all. The Sale-Notification
   button is a stub for now (openSale() is a no-op toast). */
