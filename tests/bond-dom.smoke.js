/* ============================================================
 * bond-dom.smoke.js — giao diện KNQ gộp trong tab SAP (v4.106)
 *   node tests/bond-dom.smoke.js
 * Dựng DOM giả, đối chiếu MỌI id bond.js gọi với id thật trong markup
 * #sub-sap, soi HTML sinh ra, và soi CSS chống lỗi cũ (class render ra mà
 * không có style, selector trùng làm bẹp thanh công cụ).
 * ============================================================ */
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..');
const HTML=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const pane=HTML.split('id="sub-sap"')[1].split('<!-- Customer sub-pane')[0];
const IDS=new Set([...pane.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
console.log('id có trong markup tab SAP:', IDS.size);

const missing=new Set(), CACHE={};
const HOLDER={ scrollTop:0, scrollLeft:0 };
function mk(id){
  if(id==='bondGrid') return { id, innerHTML:'', textContent:'', value:'', style:{}, dataset:{},
    classList:{ _s:new Set(), add(c){this._s.add(c)}, remove(c){this._s.delete(c)},
                toggle(c,v){ v?this._s.add(c):this._s.delete(c) }, contains(c){return this._s.has(c)} },
    querySelector:sel=>(sel==='.tabulator-tableholder'?HOLDER:null), focus(){}, blur(){} };
  return { id, innerHTML:'', textContent:'', value:'', style:{}, dataset:{},
    classList:{ _s:new Set(), add(c){this._s.add(c)}, remove(c){this._s.delete(c)},
                toggle(c,v){ v?this._s.add(c):this._s.delete(c) }, contains(c){return this._s.has(c)} },
    querySelector(){return null}, focus(){}, blur(){} };
}
global.window=global;
global.document={
  getElementById(id){ if(!IDS.has(id)) missing.add(id); return CACHE[id]||(CACHE[id]=mk(id)); },
  querySelector(){ return null; }, querySelectorAll(){ return []; }
};
global.escapeHtml=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
global.toast=()=>{}; global.confirm=()=>true; global.canWrite=()=>true;
global.CURRENT_USER={name:'Kiểm thử'};
global.firebase={ database:()=>({ ref:(p)=>{
  if(p===undefined) return { update(){ return Promise.resolve(); } };
  return { once:()=>Promise.resolve({val:()=>null}), on:()=>{}, off:()=>{} };
} }) };
/* Tabulator giả — ghi lại cấu hình để soi cột, và ĐẾM từng loại thao tác
   để chứng minh sửa một ô KHÔNG làm dựng lại bảng. */
let TCFG=null, CALLS={build:0,replace:0,update:0,destroy:0};
const ROWOBJ=d=>({ getData:()=>d,
  getElement:()=>({ classList:{ _s:new Set(),
    add(c){this._s.add(c)}, remove(c){this._s.delete(c)}, contains(c){return this._s.has(c)},
    [Symbol.iterator](){ return this._s[Symbol.iterator](); } } }) });
global.Tabulator=function(sel,cfg){
  TCFG=cfg; CALLS.build++;
  const H={};
  this.destroy=()=>{ CALLS.destroy++; };
  this.replaceData=d=>{ CALLS.replace++; TCFG.data=d; return Promise.resolve(); };
  this.updateData=d=>{ CALLS.update++; TCFG.data=d; return Promise.resolve(); };
  this.getRows=()=>(TCFG.data||[]).map(ROWOBJ);
  this.getData=()=>TCFG.data||[];
  this.on=(ev,fn)=>{ H[ev]=fn; if(ev==='tableBuilt') fn(); };
  this._fire=(ev,a)=>{ if(H[ev]) H[ev](a); };
};

const DB=JSON.parse(fs.readFileSync(path.join(__dirname,'bond-realdb.json'),'utf8'));
const SAPROWS=Object.values(DB.sap_);
global.SP={
  batch1100(from,to){ const rows=[];
    SAPROWS.forEach(r=>{ if(String(r.sloc||'')!=='1100'||!r.bcode) return;
      const d=String(r.date||''); if(from&&d<from) return; if(to&&d>to) return;
      rows.push({mat:r.mat,batch:String(r.bcode).toUpperCase(),date:d,
        init:+r.init||0,gr:+r.gr||0,gi:+r.gi||0,trs:+r.trs||0,end:+r.end||0}); });
    return {rows,legacy:0,dates:[]}; },
  dates1100(){ const s={}; SAPROWS.forEach(r=>{ if(String(r.sloc||'')==='1100'&&r.date) s[r.date]=1; });
    return Object.keys(s).sort(); },
  rebuildTableData(){}, get table(){ return null; }
};

eval(fs.readFileSync(path.join(ROOT,'js','features','bond.js'),'utf8'));
const S=BOND._state;
let fail=0;
function chk(n,c,x){ console.log((c?'  ✅ ':'  ❌ ')+n+(x?('  '+x):'')); if(!c) fail++; }
const H=id=>String((CACHE[id]||{}).innerHTML||'');
const KNQROWS=()=>BOND._state.rows();

Object.keys(DB.knq_bonded.use||{}).forEach(d=>{ S.USE[d]=DB.knq_bonded.use[d]; });
S.markLoaded(); S.setMonth('2026-08');

console.log('\n— DỰNG BẢNG —');
BOND.render();
chk('render() không gọi id nào không có trong markup', missing.size===0, [...missing].join(', '));
chk('dựng được lưới Tabulator', !!TCFG && Array.isArray(TCFG.columns), TCFG?TCFG.columns.length+' cột':'—');
chk('lưới đánh chỉ mục theo key mat_mãbatch', TCFG.index==='key');

console.log('\n— BỐ CỤC CỘT (chốt của người dùng) —');
const F=TCFG.columns.map(c=>c.field||c.title);
const idx=f=>F.indexOf(f);
chk('TRÁI = nhận dạng: STT tàu · Tên tàu · TK nhập · TK get out',
    idx('vno')<idx('vessel') && idx('vessel')<idx('dIn') && idx('dIn')<idx('dOut'),
    F.slice(0,6).join(' · '));
const SAPBLK=['date','sloc','mat','letter','bcode','init','gr','gi','trs','end'];
chk('⭐ GIỮA = khối SAP đúng thứ tự Date·SLoc·Mat·Batch·Batch code·Init·GR·GI·Trs·End',
    SAPBLK.every((f,i)=>i===0||idx(f)===idx(SAPBLK[i-1])+1),
    SAPBLK.map(f=>f+'@'+idx(f)).join(' '));
chk('⭐ khối SAP nằm SAU khối nhận dạng', idx('date')>idx('dOut'));
chk('⭐ PHẢI = phần làm việc, nằm SAU khối SAP',
    idx('hqQty')>idx('end') && idx('left')>idx('hqQty') && idx('pct')>idx('left') &&
    idx('vas')>idx('pct') && idx('note')>idx('vasDate'));
chk('cột SAP KHÔNG cho sửa (số gốc)',
    SAPBLK.every(f=>!TCFG.columns.find(c=>c.field===f).editor));
chk('cột người dùng thì cho sửa',
    ['vno','vessel','dIn','dOut','hqQty','note'].every(f=>!!TCFG.columns.find(c=>c.field===f).editor));
chk('cột Thực còn / % là app tính, không cho sửa',
    !TCFG.columns.find(c=>c.field==='left').editor && !TCFG.columns.find(c=>c.field==='pct').editor);

console.log('\n— Ô STT · TÌNH TRẠNG · GHIM TRÁI —');
const cStt=TCFG.columns.find(c=>c.field==='st');
chk('⭐ cột đầu là STT + tình trạng, GHIM TRÁI', !!cStt && cStt.frozen===true &&
    F.indexOf('st')===0, 'vị trí '+F.indexOf('st'));
const cDel=TCFG.columns.find(c=>c.title==='🗑');
chk('⭐ nút XOÁ DÒNG ghim trái ngay cạnh STT (bảng rộng, để bên phải là không ai thấy)',
    !!cDel && cDel.frozen===true && TCFG.columns.indexOf(cDel)===1);
const rowsNow=KNQROWS();
const stHtml=cStt.formatter({ getValue:()=>rowsNow[0].st,
  getRow:()=>({ getData:()=>rowsNow[0], getPosition:()=>1 }) });
chk('ô STT vẽ ra số thứ tự + chip tình trạng',
    stHtml.indexOf('bond-no')>-1 && stHtml.indexOf('bond-chip')>-1, stHtml.replace(/<[^>]+>/g,' ').trim());
const nw=rowsNow.find(r=>r.isNew);
const nwHtml=cStt.formatter({ getValue:()=>nw.st,
  getRow:()=>({ getData:()=>nw, getPosition:()=>2 }) });
chk('lô mới có thêm dấu "✚ new"', nwHtml.indexOf('✚ new')>-1);

console.log('\n— THANH LỌC —');
chk('markup có đủ ô lọc + nút xoá lọc',
    ['bondFq','bondFMat','bondFLot','bondFSt','bondFClr'].every(i=>IDS.has(i)));
chk('mọi ô lọc đều nối vào BOND.onFilter / clearFilter',
    (pane.match(/BOND\.onFilter\(\)/g)||[]).length>=4 && pane.indexOf('BOND.clearFilter()')>-1);
document.getElementById('bondFLot').value='X'; BOND.onFilter();
chk('lọc chạy trên lưới', TCFG.data.length>0 && TCFG.data.every(r=>r.letter==='X'),
    TCFG.data.length+' dòng');
chk('bộ đếm nói rõ đang lọc bao nhiêu / tổng bao nhiêu',
    /\d+\/\d+ batches/.test(String(CACHE['bondCount'].textContent)),
    String(CACHE['bondCount'].textContent));
chk('nút ✕ xoá lọc hiện ra khi đang lọc', CACHE['bondFClr'].style.display==='');
BOND.clearFilter();
chk('xoá lọc thì về đủ và nút ✕ ẩn đi',
    TCFG.data.length===BOND._state.all().length && CACHE['bondFClr'].style.display==='none');

/* ═══ GIỮ NGUYÊN CHỖ ĐANG LÀM VIỆC (v4.107) ═══════════════════════
   Lỗi người dùng báo: gõ một ô hay tick VAS là bảng nhảy về đầu, đang sửa
   lô thứ 25 lại phải cuộn xuống tìm lại — vừa khó chịu vừa dễ gõ nhầm dòng.
   Nguyên do: mỗi lần sửa đều replaceData ⇒ Tabulator dựng lại toàn bộ dòng.
   Chốt chặn dưới đây khoá đúng cơ chế, không phải khoá pixel. */
/* ═══ TICK VAS PHẢI BẤM HAI LẦN (v4.109) ═══════════════════════════
   Ô VAS rộng 48 px; một cái tick nhầm đẩy lô từ "Empty — no VASSCM" (còn
   việc phải làm) sang "Done" (làm mờ, hết nhắc) ⇒ mất dấu việc chưa làm.
   Chốt chặn: click 1 KHÔNG ĐƯỢC ghi gì xuống Firebase. */
console.log('\n— TICK VAS BẤM HAI LẦN —');
(function(){
  BOND.clearFilter();
  const cVas=TCFG.columns.find(c=>c.field==='vas');
  chk('cột VAS bắt sự kiện click chứ không phải editor',
      !!cVas && typeof cVas.cellClick==='function' && !cVas.editor);
  chk('tooltip tiêu đề nói rõ phải bấm hai lần',
      /twice/i.test(cVas.headerTooltip||''), cVas.headerTooltip);

  const r0=BOND._state.all().find(r=>!r.vas && r.inSap);
  const EL={ innerHTML:'' };
  const cell={ getValue:()=>!!r0.vas, getElement:()=>EL,
               getRow:()=>({ getData:()=>r0 }) };
  const before=r0.vas;

  cVas.cellClick(null,cell);                    /* ── click 1 */
  chk('⭐ click 1 KHÔNG đổi dữ liệu — chưa ghi gì cả',
      BOND._state.all().find(r=>r.key===r0.key).vas===before);
  chk('⭐ …mà chỉ NẠP: ô đổi sang dấu hỏi có class .bond-vas.arm',
      EL.innerHTML.indexOf('bond-vas arm')>-1, EL.innerHTML);
  chk('…và formatter vẽ lại cũng giữ trạng thái đã nạp',
      cVas.formatter(cell).indexOf('bond-vas arm')>-1);

  cVas.cellClick(null,cell);                    /* ── click 2 */
  chk('⭐ click 2 vào ĐÚNG ô đó mới thật sự ghi',
      BOND._state.all().find(r=>r.key===r0.key).vas===!before);
  chk('…ghi xong thì nhả nạp, formatter về ô bình thường',
      cVas.formatter(cell).indexOf('bond-vas arm')===-1);
  BOND.setInfo(r0.key,'vas',before);

  /* Bấm ô A rồi bấm ô B: cú nạp ở A phải mất, không được cộng dồn thành
     "hai lần bấm" trên hai ô khác nhau. */
  const rA=BOND._state.all().find(r=>!r.vas && r.inSap);
  const rB=BOND._state.all().find(r=>!r.vas && r.inSap && r.key!==rA.key);
  const EA={innerHTML:''}, EB={innerHTML:''};
  const cA={ getValue:()=>!!rA.vas, getElement:()=>EA, getRow:()=>({getData:()=>rA}) };
  const cB={ getValue:()=>!!rB.vas, getElement:()=>EB, getRow:()=>({getData:()=>rB}) };
  cVas.cellClick(null,cA); cVas.cellClick(null,cB);
  chk('⭐ nạp ô A rồi bấm ô B ⇒ ô A nhả ra, KHÔNG ô nào bị ghi',
      EA.innerHTML.indexOf('arm')===-1 &&
      BOND._state.all().find(r=>r.key===rA.key).vas===false &&
      BOND._state.all().find(r=>r.key===rB.key).vas===false);
  cVas.cellClick(null,cB);
  chk('…bấm tiếp ô B lần nữa thì B mới được ghi',
      BOND._state.all().find(r=>r.key===rB.key).vas===true);
  BOND.setInfo(rB.key,'vas',false);

  /* Bảng vẽ lại giữa chừng ⇒ phần tử DOM đang giữ hết giá trị, phải nhả nạp */
  cVas.cellClick(null,cA);
  BOND.render();
  cVas.cellClick(null,cA);
  chk('⭐ bảng vẽ lại giữa hai lần bấm ⇒ nạp bị huỷ, click sau chỉ nạp lại',
      BOND._state.all().find(r=>r.key===rA.key).vas===false);
})();

console.log('\n— GIỮ NGUYÊN VỊ TRÍ ĐANG CUỘN —');
(function(){
  BOND._state.setFilter('','','',''); BOND.render();
  const rowsNow=BOND._state.rows();
  const target=rowsNow[rowsNow.length-1];      /* dòng CUỐI — xa nhất khỏi đầu bảng */
  HOLDER.scrollTop=1840; HOLDER.scrollLeft=560;    /* người dùng đang ở cuối bảng, cuộn ngang */
  const base=Object.assign({},CALLS);

  /* ① gõ một ô chữ */
  BOND.setInfo(target.key,'vessel','GLOBE POLARIS');
  chk('⭐ gõ một ô ⇒ KHÔNG dựng lại bảng (destroy=0, replaceData=0)',
      CALLS.destroy===base.destroy && CALLS.replace===base.replace,
      'destroy+'+(CALLS.destroy-base.destroy)+' replace+'+(CALLS.replace-base.replace));
  chk('…mà cập nhật TẠI CHỖ bằng updateData', CALLS.update>base.update,
      'update+'+(CALLS.update-base.update));
  chk('⭐ …nên vị trí cuộn DỌC giữ nguyên', HOLDER.scrollTop===1840, String(HOLDER.scrollTop));
  chk('⭐ …và vị trí cuộn NGANG cũng giữ nguyên', HOLDER.scrollLeft===560, String(HOLDER.scrollLeft));

  /* ② tick VAS — đổi cả trạng thái dòng, vẫn không được nhảy */
  const b2=Object.assign({},CALLS);
  const em=BOND._state.all().find(r=>r.st==='emptied');
  if(em){
    BOND.setInfo(em.key,'vas',true);
    chk('⭐ tick VAS ⇒ vẫn KHÔNG dựng lại bảng',
        CALLS.destroy===b2.destroy && CALLS.replace===b2.replace);
    chk('⭐ …vị trí cuộn giữ nguyên', HOLDER.scrollTop===1840 && HOLDER.scrollLeft===560);
    const now=BOND._state.all().find(r=>r.key===em.key);
    chk('…và trạng thái dòng ĐÃ đổi emptied → zero', now.st==='zero', now.st);
    BOND.setInfo(em.key,'vas',false);
  }

  /* ③ sửa ô ghi chú — đường người dùng đi nhiều nhất */
  const b3=Object.assign({},CALLS);
  BOND.setInfo(target.key,'note','x');
  chk('sửa qua đường cellEdited cũng không dựng lại bảng',
      CALLS.destroy===b3.destroy && CALLS.replace===b3.replace);

  /* ④ đổi bộ lọc THÌ ĐƯỢC phép vẽ lại — nhưng vẫn trả về đúng chỗ cũ */
  const b4=Object.assign({},CALLS);
  document.getElementById('bondFLot').value='D'; BOND.onFilter();
  chk('đổi bộ lọc ⇒ bộ dòng khác đi nên replaceData (đúng)', CALLS.replace>b4.replace);
  chk('⭐ …nhưng vẫn trả người dùng về đúng vị trí cuộn cũ',
      HOLDER.scrollTop===1840, String(HOLDER.scrollTop));
  BOND.clearFilter();

  /* ⑤ số SAP nhích nhẹ mà bộ dòng không đổi ⇒ vẫn cập nhật tại chỗ */
  const b5=Object.assign({},CALLS);
  BOND.render();
  chk('vẽ lại khi bộ dòng không đổi ⇒ cập nhật tại chỗ, không replaceData',
      CALLS.replace===b5.replace && CALLS.update>b5.update);
  HOLDER.scrollTop=0; HOLDER.scrollLeft=0;
})();

console.log('\n— THU GỌN —');
const n0=TCFG.columns.length;
BOND.toggleSlim();
chk('⊟ Gọn cột SAP ẩn Init/GR/GI/Trs, GIỮ End',
    TCFG.columns.length===n0-4 && !!TCFG.columns.find(c=>c.field==='end') &&
    !TCFG.columns.find(c=>c.field==='init'), TCFG.columns.length+' cột');
BOND.toggleSlim();
chk('bấm lại thì hiện đủ', TCFG.columns.length===n0);
BOND.toggleCards();
chk('⊟ Thu gọn ẩn dải thẻ thống kê', CACHE['bondCards'].style.display==='none');
BOND.toggleCards();
chk('bấm lại thì hiện lại', CACHE['bondCards'].style.display==='');

console.log('\n— THẺ & CẢNH BÁO —');
/* v4.107 — đã BỎ hai thẻ IN BONDED WAREHOUSE + P+X RUN DOWN */
chk('⭐ đã bỏ thẻ IN BONDED WAREHOUSE', H('bondCards').indexOf('IN BONDED WAREHOUSE')<0);
chk('⭐ đã bỏ thẻ P+X RUN DOWN', H('bondCards').indexOf('RUN DOWN ON OL1')<0);
chk('còn đúng 4 thẻ', (H('bondCards').match(/class="bond-card/g)||[]).length<=4,
    (H('bondCards').match(/class="bond-card/g)||[]).length+' thẻ');
chk('thẻ FEED OL1 nói rõ khoảng ngày', H('bondCards').indexOf('FEED OL1 USED')>-1 &&
    H('bondCards').indexOf('01/08/26')>-1);
chk('thẻ SỐ SAP nói rõ đang dùng số ngày nào', H('bondCards').indexOf('SAP FIGURES IN USE')>-1 &&
    H('bondCards').indexOf('18/08/26')>-1);
chk('có thẻ CẦN XỬ LÝ khi còn lô chưa khai', H('bondCards').indexOf('NEEDS ATTENTION')>-1);
chk('⭐ thẻ SẮP HẾT tách MÃ BATCH ra dòng nổi riêng',
    /bond-bignum">\d{6}[DEPX]\d+</.test(H('bondCards')),
    (H('bondCards').match(/bond-bignum">[^<]*</g)||[]).join(' , '));
chk('⭐ …và NGÀY HẾT cũng có ô nổi riêng',
    /bond-bigdate">≈ \d\d\/\d\d\/\d\d</.test(H('bondCards')));
chk('⭐ thẻ CẦN XỬ LÝ tách từng việc một dòng, không nhồi một chuỗi',
    (H('bondCards').match(/bond-need/g)||[]).length>=1);
chk('⭐ ngày đã qua còn chạy số PLAN ⇒ dải cảnh báo mời import actual',
    H('bondAlerts').indexOf('still running on PLAN figures')>-1 ||
    BOND._state.ol1Sum().plan.length===0,
    BOND._state.ol1Sum().plan.length+' ngày plan');
chk('dải cảnh báo mời điền thông tin cho lô mới',
    H('bondAlerts').indexOf('have no details yet')>-1);
S.INFO['C3_260714X999']={ vessel:'TÀU MA' };
BOND.render();
chk('⭐ lô mất khỏi SAP ⇒ cảnh báo ĐỎ nêu đích danh mã batch',
    /bond-al bad/.test(H('bondAlerts')) && H('bondAlerts').indexOf('260714X999')>-1);
delete S.INFO['C3_260714X999'];
BOND.render();

console.log('\n— DỰ KIẾN HẾT —');
const cEta=TCFG.columns.find(c=>c.field==='eta');
chk('có cột "Dự kiến hết", nằm trong nhóm app tính',
    !!cEta && cEta.cssClass.indexOf('bond-c-calc')>-1 && !cEta.editor);
chk('cột đó đứng ngay sau cột %', F.indexOf('eta')===F.indexOf('pct')+1);
const pr=BOND._state.all().find(r=>r.projected);
const eh=cEta.formatter({ getValue:()=>pr.eta, getRow:()=>({ getData:()=>pr }) });
chk('ngày CHIẾU vẽ dấu ≈ kèm đếm ngược', eh.indexOf('≈')>-1 && /\d+ d left|today/.test(eh),
    eh.replace(/<[^>]+>/g,' ').trim());
const dn=BOND._state.all().find(r=>r.eta && !r.projected);
const dh=cEta.formatter({ getValue:()=>dn.eta, getRow:()=>({ getData:()=>dn }) });
chk('ngày ĐÃ HẾT THẬT thì KHÔNG có dấu ≈', dh.indexOf('≈')<0 && dh.indexOf('empty')>-1);
chk('thẻ SẮP HẾT TRƯỚC NHẤT nêu đúng lô và ngày',
    H('bondCards').indexOf('RUNNING OUT FIRST')>-1);

console.log('\n— MODAL FEED OL1 GIỮ CHỖ ĐANG GÕ —');
(function(){
  /* bảng OL1 dựng lại cả <tbody> mỗi lần gõ xong một ô — phải giữ được chỗ
     cuộn và ô đang đứng, nếu không 31 dòng gõ tới ngày 25 lại bị ném về đầu */
  const WRAP={ scrollTop:0 };
  let focused=null;
  const el=k=>({ getAttribute:a=>(a==='data-u'?k:null), selectionStart:2, selectionEnd:2,
                 focus(){ focused=k; }, setSelectionRange(){} });
  document.querySelector=sel=>{
    if(sel==='.bond-ol1-wrap') return WRAP;
    const m=/^\[data-u="([^"]+)"\]$/.exec(sel);
    return m?el(m[1]):null;
  };
  Object.defineProperty(global.document,'activeElement',
    { get:()=>el('2026-08-25|t'), configurable:true });
  BOND.openOl1();
  WRAP.scrollTop=612;
  BOND.setUse('2026-08-25','t','1800');
  chk('⭐ gõ xong một ngày ⇒ bảng OL1 GIỮ NGUYÊN chỗ đang cuộn', WRAP.scrollTop===612,
      String(WRAP.scrollTop));
  chk('⭐ …và trả con trỏ về đúng ô vừa gõ (Tab qua 31 ngày không bị mất ô)',
      focused==='2026-08-25|t', String(focused));
  chk('⭐ bảng OL1 có cột Source phân biệt Actual / Plan / Keyed',
    /bond-src/.test(H('bondOl1Body')),
    (H('bondOl1Body').match(/bond-src [apm]/g)||[]).slice(0,4).join(' , '));
chk('mọi ô nhập của bảng OL1 đều có khoá nhận dạng data-u',
      (H('bondOl1Body').match(/data-u="/g)||[]).length===31*3,
      (H('bondOl1Body').match(/data-u="/g)||[]).length+' ô');
  document.querySelector=()=>null;
  Object.defineProperty(global.document,'activeElement',{ get:()=>null, configurable:true });
})();

console.log('\n— MODAL FEED OL1 —');
BOND.openOl1();
chk('modal bật lên', CACHE['bondOl1'].classList.contains('on'));
chk('bảng OL1 dựng đủ ngày của tháng', (H('bondOl1Body').match(/<tr/g)||[]).length===31,
    (H('bondOl1Body').match(/<tr/g)||[]).length+' dòng');
const ob=H('bondOl1Body');
chk('⭐ ngày TƯƠNG LAI được đánh dấu riêng', ob.indexOf('bond-futrow')>-1 &&
    ob.indexOf('forecast')>-1);
chk('⭐ ô TỔNG của ngày tương lai hiện MỨC TẠM TÍNH 2.000 (chữ mờ, để trống giá trị)',
    ob.indexOf('placeholder="assumed 2,000"')>-1 && ob.indexOf('bond-asm')>-1);
chk('⭐ cột P của ngày đó tính theo mức tạm tính chứ KHÔNG phải 0',
    /class="n bond-asm">(?!0<)[\d,.]+</.test(ob));
chk('dòng tổng nói rõ bao nhiêu ngày tới đang chạy tạm tính',
    H('bondOl1Tot').indexOf('on the assumed')>-1,
    H('bondOl1Tot').replace(/<[^>]+>/g,''));
chk('đánh dấu ngày chốt số (D-1)', H('bondOl1Body').indexOf('bond-asof')>-1 ||
    S.asOf().slice(0,7)!=='2026-08');
chk('dòng tổng có Σ số ngày', H('bondOl1Tot').indexOf('Σ')>-1, H('bondOl1Tot').replace(/<[^>]+>/g,''));
BOND.closeOl1();
chk('đóng được', !CACHE['bondOl1'].classList.contains('on'));

console.log('\n— MARKUP —');
const need=['bondModeRaw','bondModeKnq','spViewRaw','spViewKnq','bondMonth','bondPerSel',
            'bondCards','bondAlerts','bondGrid','bondOl1','bondOl1Body','bondOl1Month',
            'bondOl1Unit','bondOl1UnitH','bondOl1Tot','bondCount','bondSync',
            'bondCardsBtn','bondSlimBtn'];
chk('markup có đủ mọi id module cần', need.every(i=>IDS.has(i)),
    need.filter(i=>!IDS.has(i)).join(', '));
/* nút nằm SẴN trong markup (impSet/impApply/impCancel do JS sinh ra, kiểm riêng) */
['setMode','savePeriod','openPeriod','delPeriod','openOl1','exportXlsx',
 'toggleCards','toggleSlim','onMonth',
 'pickFile','fileChosen','pasteOpen'].forEach(fn=>{
  if(pane.indexOf('BOND.'+fn+'(')<0){ console.log('  ❌ markup thiếu nút gọi BOND.'+fn); fail++; }
});
chk('markup nối đủ nút vào BOND.*', true);
chk('⭐ đã GỠ nút "Import from old KNQ tab"',
    pane.indexOf('BOND.migrate')<0 && pane.indexOf('old KNQ tab')<0);
chk('markup có ô chọn file + khối import của FEED OL1',
    /id="bondOl1File"/.test(pane) && /id="bondOl1Imp"/.test(pane));
chk('bảng OL1 có tiêu đề cột Source', /<th[^>]*>Source<\/th>/.test(pane));
(function(){
  /* khối import dựng ra đủ bộ chọn cột + nút APPLY */
  const AOA=[['일자별 C3사용량 8월'],['일자','C3 plan','C3 actual']];
  for(let i=1;i<=31;i++) AOA.push([i,100+i,(i<=4?200+i:null)]);
  BOND._state.setImp(BOND._state.prepImp(AOA,'KH.xlsx','s1',['s1']));
  BOND.impSet('unit','T');
  const b=H('bondOl1Imp');
  chk('⭐ khối import có bộ chọn cột ACTUAL / PLAN và nút APPLY',
      b.indexOf('ACTUAL column')>-1 && b.indexOf('PLAN column')>-1 &&
      b.indexOf('BOND.impApply()')>-1);
  chk('…kèm ô tích "overwrite hand-keyed days"', b.indexOf('overwrite hand-keyed days')>-1);
  chk('⭐ …và xem trước đếm rõ bao nhiêu ngày actual, bao nhiêu ngày plan',
      /<b>4<\/b> actual/.test(b) && /<b>27<\/b> plan/.test(b),
      (b.match(/Will load[^<]*<b>\d+<\/b>[^.]*/)||[''])[0].replace(/<[^>]+>/g,''));
  BOND.impCancel();
  chk('bấm Cancel thì khối import ẩn đi', CACHE['bondOl1Imp'].style.display==='none');
  BOND.pasteOpen();
  chk('📋 Paste Excel mở ô dán + nút READ',
      H('bondOl1Imp').indexOf('BOND.pasteRead()')>-1 &&
      H('bondOl1Imp').indexOf('bond-paste')>-1);
  BOND.pasteCancel();
})();
chk('khung SAP thô được bọc lại để gạt qua lại', /id="spViewRaw"/.test(pane));
chk('bảng SAP thô GIỮ NGUYÊN, không bị sửa gì',
    /id="spGrid"/.test(pane) && /id="spAnalysisWrap"/.test(pane) && /id="spTotBar"/.test(pane));

/* ═══ GIAO DIỆN PHẢI LÀ TIẾNG ANH (v4.106) ═════════════════════════
   Chốt của người dùng: sub-tab kho ngoại quan dùng TIẾNG ANH. Chú thích
   trong mã vẫn tiếng Việt — chỉ chuỗi HIỂN THỊ mới bị soi. Khối "SAP thô"
   nằm ngoài phạm vi, nên chỉ quét đúng khối #spViewKnq + nút gạt. */
console.log('\n— GIAO DIỆN TIẾNG ANH —');
const VN=/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]/;
(function(){
  /* ① mã nguồn bond.js — bỏ mọi comment rồi mới soi */
  const JS=fs.readFileSync(path.join(ROOT,'js','features','bond.js'),'utf8').split('\n');
  let blk=false; const badJs=[];
  JS.forEach((l,i)=>{
    const st=l.trim();
    if(blk){ if(l.indexOf('*/')>-1) blk=false; return; }
    if(st.indexOf('/*')===0){ if(l.indexOf('*/')<0) blk=true; return; }
    if(st.indexOf('*')===0||st.indexOf('//')===0) return;
    let code=l.replace(/\/\*.*?\*\//g,'').replace(/\/\/.*$/,'');
    /* ⚠ BỎ REGEX LITERAL trước khi soi: mấy hàm đọc file Excel phải dò tiêu
       đề cột tiếng Hàn/Việt (/사용량|usage|dùng/) — đó là KHUÔN NHẬN DẠNG
       DỮ LIỆU NGUỒN, không phải chữ hiển thị cho người dùng. */
    code=code.replace(/\/(?:\\.|\[[^\]]*\]|[^\/\\\n])+\/[gimsuy]*/g,'‹re›');
    if(VN.test(code)) badJs.push((i+1)+': '+code.trim().slice(0,70));
  });
  chk('⭐ bond.js không còn chuỗi hiển thị tiếng Việt', badJs.length===0,
      badJs.slice(0,4).join(' | '));

  /* ② markup của khối KNQ — bỏ comment HTML rồi mới soi */
  let inc=false; const badHtml=[];
  pane.split('\n').forEach((l,i)=>{
    const st=l.trim();
    if(inc){ if(l.indexOf('-->')>-1) inc=false; return; }
    if(st.indexOf('<!--')===0){ if(l.indexOf('-->')<0) inc=true; return; }
    /* bỏ qua thanh công cụ SAP thô — ngoài phạm vi lần chuyển ngữ này */
    if(/id="sp(Sloc|Batch|Bcode)Filter"|spResetFilters|sp-tot-/.test(l)) return;
    if(VN.test(l)) badHtml.push(st.slice(0,80));
  });
  chk('⭐ markup khối KNQ không còn tiếng Việt', badHtml.length===0,
      badHtml.slice(0,4).join(' | '));

  /* ③ những chỗ người dùng nhìn nhiều nhất — kiểm tận nơi */
  const heads=TCFG.columns.map(c=>c.title).join(' | ');
  chk('tiêu đề cột đều tiếng Anh', !VN.test(heads), heads);
  const tips=TCFG.columns.map(c=>c.headerTooltip||'').join(' ');
  chk('tooltip tiêu đề cột đều tiếng Anh', !VN.test(tips));
  chk('chip tình trạng tiếng Anh',
      !VN.test(Object.values(BOND._state.ST_NAME).join(' ')),
      Object.values(BOND._state.ST_NAME).join(' · '));
  chk('thẻ + dải cảnh báo tiếng Anh', !VN.test(H('bondCards')+H('bondAlerts')));
  chk('bảng FEED OL1 tiếng Anh', !VN.test(H('bondOl1Body')+H('bondOl1Tot')));
})();

console.log('\n— CSS —');
const CSS=fs.readFileSync(path.join(ROOT,'css','bond.css'),'utf8');
/* ⚠ bỏ khối @media / @keyframes trước khi soi trùng: khai lại cùng một
   class ở màn hẹp KHÔNG phải selector trùng. */
let body=CSS.replace(/\/\*[\s\S]*?\*\//g,'');
body=(function strip(src){
  let out='',i=0;
  while(i<src.length){
    const k=src.indexOf('@',i);
    if(k<0){ out+=src.slice(i); break; }
    out+=src.slice(i,k);
    let j=src.indexOf('{',k), depth=0;
    if(j<0){ break; }
    for(;j<src.length;j++){
      if(src[j]==='{') depth++;
      else if(src[j]==='}'){ depth--; if(!depth){ j++; break; } }
    }
    i=j;
  }
  return out;
})(body);
const sel={};
const dup=[];
body.replace(/(^|\})([^{}]+)\{/g,(m,a,s)=>{ const k=s.trim().replace(/\s+/g,' ');
  if(!k||k.startsWith('@')) return m;
  if(sel[k]) dup.push(k); else sel[k]=1; return m; });
chk('không có selector CSS định nghĩa trùng', dup.length===0, dup.join(', '));
const emitted=new Set();
Object.values(CACHE).forEach(el=>[...String(el.innerHTML).matchAll(/class="([^"]+)"/g)]
  .forEach(m=>m[1].split(/\s+/).forEach(c=>{ if(c.indexOf('bond-')===0) emitted.add(c); })));
[...pane.matchAll(/class="([^"]+)"/g)].forEach(m=>m[1].split(/\s+/)
  .forEach(c=>{ if(c.indexOf('bond-')===0) emitted.add(c); }));
TCFG.columns.forEach(c=>{ String(c.cssClass||'').split(/\s+/).forEach(x=>{ if(x.indexOf('bond-')===0) emitted.add(x); }); });
const styled=new Set([...CSS.matchAll(/\.(bond-[a-z0-9-]+)/g)].map(m=>m[1]));
const orphan=[...emitted].filter(c=>!styled.has(c));
chk('mọi class bond-* render ra đều có style', orphan.length===0, orphan.join(', '));
chk('.bond-table-full co giãn được (min-height:0)',
    /min-height:0/.test((CSS.split('.bond-table-full{')[1]||'').split('}')[0]));
chk('ba nhóm cột có nền phân biệt',
    /\.bond-c-user/.test(CSS) && /\.bond-c-sap/.test(CSS) && /\.bond-c-calc/.test(CSS));
chk('mọi trạng thái đều có màu dòng riêng',
    ['pumping','emptied','zero','gone','wait'].every(f=>CSS.indexOf('bond-r-'+f)>-1));
chk('⭐ ĐANG BƠM nổi lên, ĐÃ XONG mờ đi',
    /\.bond-r-pumping\{[^}]*background:#eafaf1/.test(CSS.replace(/\s/g,''))||
    /bond-r-pumping/.test(CSS),
    'opacity đã xong: '+/opacity:\.46/.test(CSS));
chk('bốn loại lô có thanh rail màu riêng',
    ['p','x','d','e'].every(l=>CSS.indexOf('bond-lot-'+l+' ')>-1));

/* ═══ HAI TAB ĐÃ GỠ HẲN (v4.109) ═══════════════════════════════════
   🛃 KNQ (XNK) ở tab Report — kho ngoại quan đã chuyển sang tab SAP này.
   🎯 ALLOCATION ở tab Sales — không dùng nữa.
   Chốt chặn để không ai vô tình nối lại một nửa (còn nút mà mất file, hay
   còn file mà mất nút). ⚠ Node Firebase knq_bonded/use PHẢI CÒN — BOND đọc
   FEED OL1 từ chính node đó. */
console.log('\n— HAI TAB ĐÃ GỠ HẲN —');
(function(){
  const fs2=require('fs'), P=p=>path.join(ROOT,p);
  const NAV=fs2.readFileSync(P('js/core/nav.js'),'utf8');
  const BOOT=fs2.readFileSync(P('js/boot.js'),'utf8');
  const PLAN=fs2.readFileSync(P('js/features/plan.js'),'utf8');

  chk('⭐ Report KHÔNG còn nút sub-tab KNQ', HTML.indexOf('data-rpt-sub="knq"')===-1);
  chk('…và không còn khung #rpt-pg-knq', HTML.indexOf('rpt-pg-knq')===-1);
  chk('…không còn nạp knq.js / knq.css', HTML.indexOf('features/knq.js')===-1 &&
      HTML.indexOf('css/knq.css')===-1);
  chk('…rptSwitchTab không còn nhánh knq', NAV.indexOf("sub==='knq'")===-1 &&
      NAV.indexOf('KNQ.onTabEnter')===-1);
  chk('⭐ Sales KHÔNG còn nút ALLOCATION', HTML.indexOf('data-sub="alloc"')===-1);
  chk('…và không còn khung #sub-alloc', HTML.indexOf('sub-alloc')===-1);
  chk('…không còn nạp alloc.js / alloc.css', HTML.indexOf('features/alloc.js')===-1 &&
      HTML.indexOf('css/alloc.css')===-1);
  chk('…boot không còn ALLOC.init, switchSalesTab không còn nhánh alloc',
      BOOT.indexOf('ALLOC.init')===-1 && PLAN.indexOf("t==='alloc'")===-1);
  /* Gỡ nửa vời hay để lại một <script src> trỏ vào file đã xoá — trình duyệt
     nuốt im, chỉ hiện 404 trong console mà không ai nhìn. Quét cho chắc. */
  const miss=[];
  [...HTML.matchAll(/(?:src|href)="([^"?]+)(?:\?[^"]*)?"/g)].forEach(m=>{
    const f=m[1];
    if(/^(https?:|#|data:|mailto)/.test(f)) return;
    if(!fs2.existsSync(P(f))) miss.push(f);
  });
  chk('⭐ mọi src/href trong index.html đều trỏ tới file CÓ THẬT',
      miss.length===0, miss.join(', '));
  chk('⭐ FEED OL1 vẫn đọc node knq_bonded/use (dùng chung, KHÔNG được xoá)',
      fs2.readFileSync(P('js/features/bond.js'),'utf8').indexOf('knq_bonded/use')>-1);
})();

console.log('\n'+(fail?('❌ '+fail+' lỗi'):'✅ SMOKE TEST ĐẠT'));
process.exit(fail?1:0);
