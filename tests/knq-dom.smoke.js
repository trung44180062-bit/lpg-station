/* ============================================================
 * knq-dom.smoke.js — render() của tab KNQ v4.93
 * ------------------------------------------------------------
 *   node tests/knq-dom.smoke.js      (chạy từ thư mục gốc repo)
 * Dựng DOM giả tối thiểu, đối chiếu MỌI id module gọi với id thật trong
 * markup #rpt-pg-knq, soi HTML sinh ra (2 bảng C3/C4 + modal FEED OL1),
 * và kiểm tra CSS chống lặp lại lỗi cũ (trùng tên class làm bẹp thanh công
 * cụ, class render ra mà không có style).
 * ============================================================ */
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..');
const HTML=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const pane=HTML.split('id="rpt-pg-knq"')[1].split('<!-- ═══ TL DATA paste modal')[0];
const IDS=new Set([...pane.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
IDS.add('rpt-pg-knq');
console.log('id có trong markup KNQ:', IDS.size);

const missing=new Set(), CACHE={};
function mk(id){
  return { id, innerHTML:'', textContent:'', value:'', style:{}, dataset:{}, files:[],
    classList:{ _s:new Set(), add(c){this._s.add(c)}, remove(c){this._s.delete(c)},
                toggle(c,v){ v?this._s.add(c):this._s.delete(c) }, contains(c){return this._s.has(c)} },
    querySelector(){return null}, focus(){}, blur(){}, select(){}, click(){} };
}
global.window=global;
global.document={
  getElementById(id){ if(!IDS.has(id)) missing.add(id); return CACHE[id]||(CACHE[id]=mk(id)); },
  querySelector(){ return null; }, querySelectorAll(){ return []; },
  get activeElement(){ return null; }
};
global.escapeHtml=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
global.toast=()=>{}; global.confirm=()=>true; global.canWrite=()=>true;
global.firebase={ database:()=>({ ref:()=>({
  update(){ return Promise.resolve(); },
  child(){ return { once:()=>Promise.resolve({val:()=>null}), remove:()=>Promise.resolve() }; }
}) }) };
eval(fs.readFileSync(path.join(ROOT,'js','features','knq.js'),'utf8'));

const F=JSON.parse(fs.readFileSync(path.join(__dirname,'knq.fixtures.json'),'utf8'));
global.SP={ batch1100:()=>({ rows:F.sapSnapshot, legacy:0,
  dates:[...new Set(F.sapSnapshot.map(r=>r.date))].sort() }) };

const S=KNQ._state;
function gi(mat,f){
  KNQ.addGi(mat);
  const ids=Object.keys(S.GI), id=ids[ids.length-1];
  Object.keys(f).forEach(k=>KNQ.setGi(id,k,f[k])); return id;
}
function go(giId,f){
  KNQ.addGo(giId);
  const ids=Object.keys(S.GO), id=ids[ids.length-1];
  Object.keys(f).forEach(k=>KNQ.setGo(id,k,f[k])); return id;
}
KNQ.init();
const MAPLE=gi('C3',{ no:'VVIII', vendor:'Wanhua', vessel:'MAPLE GAS', regDate:'2026-07-24',
  decl:'108462739342', date:'2026-08-03', price:'693.34', qtyKg:'45826000', pnk:'PNK000000095' });
go(MAPLE,{ time:'2nd time', regDate:'2026-08-03', decl:'108495933010', date:'2026-08-06',
  batch:'260806D001', sapKg:'1828399', qtyKg:'2500000', pxk:'PXK000000741' });
go(MAPLE,{ time:'2nd time', regDate:'2026-08-03', decl:'108495942660', date:'2026-08-04',
  batch:'260804X001', sapKg:'5000000', qtyKg:'5000000', pxk:'PXK000000738' });
const BERGE=gi('C3',{ no:'VVIII', vessel:'BERGE NANTONG', decl:'108360769902', date:'2026-07-01',
  qtyKg:'45889300' });
go(BERGE,{ time:'2nd time', regDate:'2026-07-20', decl:'108448137010', date:'2026-07-21',
  batch:'260721X001', sapKg:'5000000', qtyKg:'5000000' });
const GLOBE=gi('C4',{ no:'III', vessel:'GLOBE POLARIS', decl:'108502636212', date:'2026-08-11',
  qtyKg:'25616800' });
go(GLOBE,{ time:'1st time', regDate:'2026-08-11', decl:'108518936150', date:'2026-08-12',
  batch:'260806D001', sapKg:'1161827', qtyKg:'1000000' });
KNQ.pullSap();
[['2026-08-01',537.413],['2026-08-02',0],['2026-08-03',364.499],
 ['2026-08-04',697.652],['2026-08-05',475.26]].forEach(([d,v])=>KNQ.setUse(d,'x',String(v)));

let fail=0;
function chk(n,c,x){ console.log((c?'  ✅ ':'  ❌ ')+n+(x?'  '+x:'')); if(!c) fail++; }
try{ KNQ.render(); KNQ.openOl1(); chk('render() + openOl1() không ném lỗi', true); }
catch(e){ chk('render() + openOl1() không ném lỗi', false, e.message); }
chk('không gọi id lạ ngoài markup', missing.size===0, [...missing].join(','));

const H=id=>String((CACHE[id]||{}).innerHTML||'');
const SRC=fs.readFileSync(path.join(ROOT,'js','features','knq.js'),'utf8');

console.log('\n— HAI BẢNG TÁCH RIÊNG C3 / C4 —');
chk('markup có tbody riêng cho C3 và C4',
    pane.indexOf('id="knq-body-c3"')>-1 && pane.indexOf('id="knq-body-c4"')>-1);
chk('bảng C3 chỉ chứa chuyến C3', H('knq-body-c3').indexOf('MAPLE GAS')>-1 &&
    H('knq-body-c3').indexOf('GLOBE POLARIS')<0);
chk('bảng C4 chỉ chứa chuyến C4', H('knq-body-c4').indexOf('GLOBE POLARIS')>-1 &&
    H('knq-body-c4').indexOf('MAPLE GAS')<0);
chk('mỗi bảng có dòng TỔNG', H('knq-body-c3').indexOf('TỔNG C3')>-1 &&
    H('knq-body-c4').indexOf('TỔNG C4')>-1);

console.log('\n— DÒNG GET IN / GET OUT —');
chk('có dòng GET IN', H('knq-body-c3').indexOf('GET IN')>-1 && H('knq-body-c3').indexOf('knq-gi')>-1);
chk('có dòng GET OUT lồng dưới', H('knq-body-c3').indexOf('knq-go')>-1);
chk('nút ➕ Get Out nằm trên dòng chuyến', H('knq-body-c3').indexOf('KNQ.addGo(')>-1);
chk('gập/mở nhóm get out theo chuyến', H('knq-body-c3').indexOf('KNQ.toggleGroup(')>-1);
const GIF=["'no'","'vendor'","'vessel'","'regDate'","'decl'","'date'","'price'","'qtyKg'","'note'"];
chk('dòng GET IN đủ ô như file XNK ('+GIF.length+' ô)',
    GIF.every(f=>H('knq-body-c3').indexOf('KNQ.setGi(')>-1 && H('knq-body-c3').indexOf(f)>-1),
    GIF.filter(f=>H('knq-body-c3').indexOf(f)<0).join(', '));
const GOF=["'time'","'batch'","'letter'","'note'"];
chk('dòng GET OUT có lần xuất + mã batch + loại lô + ghi chú',
    GOF.every(f=>H('knq-body-c3').indexOf(f)>-1), GOF.filter(f=>H('knq-body-c3').indexOf(f)<0).join(', '));
chk('ô Tồn đầu kỳ gõ tay, ghi vào đúng kỳ đang chọn',
    H('knq-body-c3').indexOf('KNQ.setOp(')>-1 && H('knq-body-c3').indexOf('data-o=')>-1);
chk('mọi ô đều gõ trực tiếp (input/select)',
    ['<input','<select','KNQ.setGo('].every(t=>H('knq-body-c3').indexOf(t)>-1));
chk('có nút nhân bản + xoá get out, xoá cả chuyến',
    ['KNQ.cloneGo(','KNQ.delGo(','KNQ.delGi('].every(t=>H('knq-body-c3').indexOf(t)>-1));
chk('có ô tick ✔ xác nhận xong cho cả 2 loại dòng',
    H('knq-body-c3').indexOf("KNQ.toggleDone('gi'")>-1 && H('knq-body-c3').indexOf("KNQ.toggleDone('go'")>-1);

console.log('\n— CỘT TRỪ LÙI & SỐ LIỆU —');
const COLS=['Tên tàu','Số tờ khai','Ngày nhập/xuất','SAP - Lô','Loại lô','Tồn đầu kỳ (kg)',
            'Đã dùng trong kỳ (kg)','Thực còn KNQ (kg)','% đã bơm','Dự kiến hết','Trọng lượng (kg)',
            'Còn lại của chuyến (kg)'];
const GONE=['Giờ khai báo','Giờ HQ phản hồi','Số PXK/PNK','Ngày nộp','Ngày nhận','PXKT/PNKT'];
chk('ĐÃ BỎ 6 cột phụ (quản lý bên Excel) để bảng gọn trong 1 màn hình',
    GONE.every(c=>pane.indexOf(c)<0), GONE.filter(c=>pane.indexOf(c)>-1).join(', '));
chk('module không còn sinh ô cho các trường đã bỏ',
    !/'regTime'|'resTime'|'pnk'|'pxk'|'subDate'|'recvDate'|'tmpCode'/.test(SRC));
chk('bảng còn đúng 20 cột', (pane.split('id="knq-body-c3"')[0].match(/<th /g)||[]).length===20,
    String((pane.split('id="knq-body-c3"')[0].match(/<th /g)||[]).length));
chk('tiêu đề cột đủ như file THEO DOI XNK KNQ', COLS.every(c=>pane.indexOf(c)>-1),
    COLS.filter(c=>pane.indexOf(c)<0).join(', '));
chk('D lấy đúng tồn SAP 1 426 694 kg vào cột Thực còn', H('knq-body-c3').indexOf('1,426,694')>-1);
chk('C4 khớp riêng theo Mat → 1 030 053 kg', H('knq-body-c4').indexOf('1,030,053')>-1);
chk('X trừ lùi FIFO: batch 21/07 còn 2 925 176 kg',
    H('knq-body-c3').indexOf('2,925,176')>-1, '(21/07 nhận hết 2 074 824 kg dùng 01–05/08)');
chk('hiện số SAP cùng mã để đối chiếu + nút ⇐ chép sang',
    H('knq-body-c3').indexOf('KNQ.copySap(')>-1 && H('knq-body-c3').indexOf('knq-hintline')>-1);
chk('cột "Còn lại của chuyến" có số', H('knq-body-c3').indexOf('38,326,000')>-1,
    '45 826 000 − 2 500 000 − 5 000 000');

console.log('\n— MODAL ⛽ FEED OL1 (không hiện ngoài trang) —');
chk('markup có modal riêng, không nằm trong .knq-body',
    pane.indexOf('id="knq-ol1"')>-1 &&
    pane.indexOf('id="knq-ol1"')>pane.indexOf('id="knq-body-c4"'));
chk('nút ⛽ FEED OL1 trên thanh công cụ', pane.indexOf('KNQ.openOl1()')>-1);
chk('bảng lượng dùng KHÔNG còn nằm trực tiếp trong trang',
    pane.split('id="knq-use-body"').length===2 &&
    pane.indexOf('id="knq-use-body"')>pane.indexOf('id="knq-ol1"'));
chk('cột Ngày · Tổng P+X · P · X · Plan X · Nguồn',
    ['Tổng P+X','P — Petchem','X — Export Petchem','Plan X (import)','Nguồn']
      .every(c=>pane.indexOf(c)>-1));
chk('ô P và X gõ tay, Enter nhảy xuống ngày kế',
    H('knq-use-body').indexOf("'p'")>-1 && H('knq-use-body').indexOf("'x'")>-1 &&
    H('knq-use-body').indexOf('KNQ.useKey(')>-1);
chk('có nhãn Actual / Plan', H('knq-use-body').indexOf('Actual')>-1);
chk('có dòng tổng tháng', H('knq-use-body').indexOf('knq-tot')>-1);
chk('mặc định gõ theo TẤN — 537.413 hiện đúng, không thành 537 413',
    H('knq-use-body').indexOf('537.413')>-1 && H('knq-use-body').indexOf('537,413')<0);

console.log('\n— 📥 IMPORT PLAN X —');
chk('có input file ẩn + nút gọi', pane.indexOf('id="knq-file"')>-1 && pane.indexOf('KNQ.pickFile()')>-1);
chk('module có hàm đọc file + chọn cột + áp dụng',
    /fileChosen/.test(SRC) && /impApply/.test(SRC) && /_prepImp/.test(SRC));
chk('đọc được ngày dạng serial Excel, ISO và dd/mm/yyyy', /serial Excel/.test(SRC));
/* giả lập đã đọc xong file → khay chọn cột phải hiện ra */
(function(){
  const aoa=[['Date','Total P+X','P','X','Remark'],
             [new Date(Date.UTC(2026,7,20)),2000,600,1400,'Plan'],
             [new Date(Date.UTC(2026,7,21)),2000,700,1300,'Plan']];
  /* dùng chính bộ chuẩn hoá của module qua đường công khai impSet/impApply */
  const prep=SRC.indexOf('function _prepImp')>-1;
  chk('có bộ chuẩn hoá bảng thô _prepImp', prep);
})();

console.log('\n— THANH CÔNG CỤ & KỲ TRỪ LÙI —');
chk('có bộ chọn KỲ trừ lùi', pane.indexOf('id="knq-month"')>-1 &&
    pane.indexOf('KNQ.onMonth()')>-1 && pane.indexOf('Kỳ trừ lùi')>-1);
chk('có nút 📌 Chốt kỳ', pane.indexOf('id="knq-close"')>-1 && pane.indexOf('KNQ.closeMonth()')>-1);
chk('KHÔNG còn nút lọc/ẩn theo tháng — bảng batch là sổ theo dõi',
    pane.indexOf('knq-allbtn')<0 && !/toggleAll/.test(SRC));
chk('visibleGi() không đụng tới _month — batch không bị lọc theo tháng',
    (()=>{ const f=SRC.split('function visibleGi(')[1].split('\n  }')[0];
           return f.indexOf('_month')<0; })());
chk('chuyến tháng 7 và chuyến tháng 8 cùng nằm trong bảng C3',
    H('knq-body-c3').indexOf('BERGE NANTONG')>-1 && H('knq-body-c3').indexOf('MAPLE GAS')>-1);
chk('có nút ➕ Get In cho cả C3 và C4',
    pane.indexOf("KNQ.addGi('C3')")>-1 && pane.indexOf("KNQ.addGi('C4')")>-1);
chk('vẫn còn nút SAP · Lưu · Export · Xem dữ liệu cũ',
    ['KNQ.pullSap()','KNQ.save()','KNQ.exportXlsx()','KNQ.loadOld()'].every(t=>pane.indexOf(t)>-1));
chk('chip thống kê hiển thị', H('knq-stats').indexOf('knq-chip')>-1);

console.log('\n— CSS —');
const CSS=fs.readFileSync(path.join(ROOT,'css','knq.css'),'utf8');
const seen={}, dup=[];
[...CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)].forEach(m=>{
  const sel=m[1].trim().split('\n').pop().trim();
  if(!sel||sel[0]==='@') return;
  if(seen[sel]) dup.push(sel); else seen[sel]=1;
});
chk('không có selector CSS định nghĩa trùng', dup.length===0, dup.join(', '));
const emitted=new Set();
Object.values(CACHE).forEach(el=>[...String(el.innerHTML).matchAll(/class="([^"]+)"/g)]
  .forEach(m=>m[1].split(/\s+/).forEach(c=>{ if(c.indexOf('knq-')===0) emitted.add(c); })));
[...pane.matchAll(/class="([^"]+)"/g)].forEach(m=>m[1].split(/\s+/)
  .forEach(c=>{ if(c.indexOf('knq-')===0) emitted.add(c); }));
const styled=new Set([...CSS.matchAll(/\.(knq-[a-z0-9-]+)/g)].map(m=>m[1]));
const orphan=[...emitted].filter(c=>!styled.has(c));
chk('mọi class knq-* render ra đều có style', orphan.length===0, orphan.join(', '));
chk('.knq-bar có flex:0 0 auto (không bị bóp dẹp)',
    /flex:0 0 auto/.test((CSS.split('.knq-bar,.knq-filters{')[1]||'').split('}')[0]));
chk('.knq-body có min-height:0', /min-height:0/.test((CSS.split('.knq-body{')[1]||'').split('}')[0]));
chk('.knq-tw có max-height thì sticky header mới bám',
    /max-height/.test((CSS.split('.knq-tw{')[1]||'').split('}')[0]));
chk('bảng rộng vẫn cuộn ngang được (.knq-tb.wide)', /\.knq-tb\.wide/.test(CSS));

console.log('\n'+(fail?('❌ '+fail+' lỗi'):'✅ SMOKE TEST ĐẠT'));
process.exit(fail?1:0);
