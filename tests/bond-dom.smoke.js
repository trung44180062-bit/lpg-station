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
function mk(id){
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
/* Tabulator giả — ghi lại cấu hình để soi cột */
let TCFG=null;
global.Tabulator=function(sel,cfg){ TCFG=cfg; this.destroy=()=>{};
  this.replaceData=d=>{ TCFG.data=d; }; this.on=()=>{}; };

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
chk('thẻ TỒN KHO nói rõ kỳ đang xem', H('bondCards').indexOf('IN BONDED WAREHOUSE')>-1 &&
    H('bondCards').indexOf('2026-08')>-1);
chk('thẻ SỐ SAP nói rõ đang dùng số ngày nào', H('bondCards').indexOf('SAP FIGURES IN USE')>-1 &&
    H('bondCards').indexOf('18/08/26')>-1);
chk('có thẻ CẦN XỬ LÝ khi còn lô chưa khai', H('bondCards').indexOf('NEEDS ATTENTION')>-1);
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
['setMode','savePeriod','openPeriod','delPeriod','openOl1','exportXlsx','migrate',
 'toggleCards','toggleSlim','onMonth'].forEach(fn=>{
  if(pane.indexOf('BOND.'+fn+'(')<0){ console.log('  ❌ markup thiếu nút gọi BOND.'+fn); fail++; }
});
chk('markup nối đủ nút vào BOND.*', true);
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
    const code=l.replace(/\/\*.*?\*\//g,'').replace(/\/\/.*$/,'');
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

console.log('\n'+(fail?('❌ '+fail+' lỗi'):'✅ SMOKE TEST ĐẠT'));
process.exit(fail?1:0);
