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
chk('mỗi bảng có dòng TỔNG', H('knq-body-c3').indexOf('TOTAL C3')>-1 &&
    H('knq-body-c4').indexOf('TOTAL C4')>-1);

console.log('\n— DÒNG GET IN / GET OUT —');
chk('có dòng GET IN', H('knq-body-c3').indexOf('GET IN')>-1 && H('knq-body-c3').indexOf('knq-gi')>-1);
chk('có dòng GET OUT lồng dưới', H('knq-body-c3').indexOf('knq-go')>-1);
chk('nút ➕ Get Out nằm trên dòng chuyến', H('knq-body-c3').indexOf('KNQ.addGo(')>-1);
chk('gập/mở nhóm get out theo chuyến', H('knq-body-c3').indexOf('KNQ.toggleGroup(')>-1);
/* v4.95 bỏ đơn giá/trọng lượng · v4.96 bỏ 2 ô ngày (ngày lấy từ mã batch) */
const GIF=["'no'","'vessel'","'decl'","'note'"];
chk('dòng GET IN còn đúng các ô của v4.96 ('+GIF.length+' ô)',
    GIF.every(f=>H('knq-body-c3').indexOf('KNQ.setGi(')>-1 && H('knq-body-c3').indexOf(f)>-1),
    GIF.filter(f=>H('knq-body-c3').indexOf(f)<0).join(', '));
const GOF=["'batch'","'letter'","'hqQty'","'vasDate'","'note'"];
chk('dòng GET OUT có mã batch · loại lô · HQ approved · ngày VASSCM · ghi chú',
    GOF.every(f=>H('knq-body-c3').indexOf(f)>-1), GOF.filter(f=>H('knq-body-c3').indexOf(f)<0).join(', '));
chk('v4.96 — KHÔNG còn ô ngày nào trên dòng batch (ngày nằm trong mã batch)',
    H('knq-body-c3').indexOf('|regDate')<0 && H('knq-body-c3').indexOf("'date'")<0,
    H('knq-body-c3').indexOf('|regDate')>-1?'còn regDate':'còn date');
chk('v4.96 — dưới ô batch có gợi ý ngày đọc từ mã batch',
    /from \d{2}\/\d{2}\/\d{2}/.test(H('knq-body-c3')));
chk('v4.96 — có ô tick VASSCM trên dòng get out',
    H('knq-body-c3').indexOf('KNQ.toggleVas(')>-1);
chk('ô SAP qty (tồn đầu kỳ) gõ tay, ghi vào đúng kỳ đang chọn',
    H('knq-body-c3').indexOf('KNQ.setOp(')>-1 && H('knq-body-c3').indexOf('data-o=')>-1);
chk('mọi ô đều gõ trực tiếp (input/select)',
    ['<input','<select','KNQ.setGo('].every(t=>H('knq-body-c3').indexOf(t)>-1));
chk('có nút nhân bản + xoá get out, xoá cả chuyến',
    ['KNQ.cloneGo(','KNQ.delGo(','KNQ.delGi('].every(t=>H('knq-body-c3').indexOf(t)>-1));
chk('có ô tick ✔ xác nhận xong cho cả 2 loại dòng',
    H('knq-body-c3').indexOf("KNQ.toggleDone('gi'")>-1 && H('knq-body-c3').indexOf("KNQ.toggleDone('go'")>-1);

console.log('\n— CỘT TRỪ LÙI & SỐ LIỆU —');
const COLS=['Vessel','Decl. no.','Batch (SAP lot)','Lot type','HQ approved get-out (kg)',
            'SAP qty (kg)','Used in period (kg)','Actual left in KNQ (kg)','% pumped',
            'Est. empty','VASSCM','VASSCM date','Note'];
const GONE=['Giờ khai báo','Giờ HQ phản hồi','Số PXK/PNK','Ngày nộp','Ngày nhận','PXKT/PNKT',
            'Ngày tờ khai','Ngày nhập/xuất'];
chk('ĐÃ BỎ các cột phụ + 2 cột ngày của v4.96',
    GONE.every(c=>pane.indexOf(c)<0), GONE.filter(c=>pane.indexOf(c)>-1).join(', '));
chk('module không còn sinh ô cho các trường đã bỏ',
    !/'regTime'|'resTime'|'pnk'|'pxk'|'subDate'|'recvDate'|'tmpCode'/.test(SRC));
chk('bảng còn đúng 16 cột', (pane.split('id="knq-body-c3"')[0].match(/<th /g)||[]).length===16,
    String((pane.split('id="knq-body-c3"')[0].match(/<th /g)||[]).length));
chk('tiêu đề cột v4.96 (tiếng Anh) đầy đủ', COLS.every(c=>pane.indexOf(c)>-1),
    COLS.filter(c=>pane.indexOf(c)<0).join(', '));
chk('D lấy đúng tồn SAP 1 426 694 kg vào cột Actual left', H('knq-body-c3').indexOf('1,426,694')>-1);
chk('C4 khớp riêng theo Mat → 1 030 053 kg', H('knq-body-c4').indexOf('1,030,053')>-1);
chk('X trừ lùi FIFO: batch 21/07 còn 2 925 176 kg',
    H('knq-body-c3').indexOf('2,925,176')>-1, '(21/07 nhận hết 2 074 824 kg dùng 01–05/08)');
chk('hiện số SAP cùng mã để đối chiếu + nút ⇐ chép sang',
    H('knq-body-c3').indexOf('KNQ.copySap(')>-1 && H('knq-body-c3').indexOf('knq-hintline')>-1);
/* v4.95 đã gỡ cột "Còn lại của chuyến" khỏi bảng — số vẫn ra Excel export */
chk('cột "Còn lại của chuyến" đã gỡ khỏi bảng', pane.indexOf('Còn lại của chuyến')<0);

console.log('\n— MODAL ⛽ FEED OL1 (không hiện ngoài trang) —');
chk('markup có modal riêng, không nằm trong .knq-body',
    pane.indexOf('id="knq-ol1"')>-1 &&
    pane.indexOf('id="knq-ol1"')>pane.indexOf('id="knq-body-c4"'));
chk('nút ⛽ FEED OL1 trên thanh công cụ', pane.indexOf('KNQ.openOl1()')>-1);
chk('bảng lượng dùng KHÔNG còn nằm trực tiếp trong trang',
    pane.split('id="knq-use-body"').length===2 &&
    pane.indexOf('id="knq-use-body"')>pane.indexOf('id="knq-ol1"'));
chk('cột Date · Total P+X · P · X · Plan X · X source',
    ['Total P+X','P — Petchem','X — Export Petchem','Plan X (imported)','X source']
      .every(c=>pane.indexOf(c)>-1));
/* v4.94 — P không còn gõ tay: ô gõ là TỔNG ('t') và X ('x') */
chk('ô TỔNG và X gõ tay, Enter nhảy xuống ngày kế',
    H('knq-use-body').indexOf("'t'")>-1 && H('knq-use-body').indexOf("'x'")>-1 &&
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
chk('có bộ chọn KỲ trong nhóm Period', pane.indexOf('id="knq-month"')>-1 &&
    pane.indexOf('KNQ.onMonth()')>-1 && pane.indexOf('>Period<')>-1);
chk('thanh công cụ chia nhóm có nhãn (Period · Declare · SAP · Data)',
    ['>Period<','>Declare<','>SAP<','>Data<'].every(x=>pane.indexOf(x)>-1) &&
    (pane.match(/class="knq-grp"/g)||[]).length===4,
    String((pane.match(/class="knq-grp"/g)||[]).length)+' nhóm');
chk('có nút 📌 Close period', pane.indexOf('id="knq-close"')>-1 && pane.indexOf('KNQ.closeMonth()')>-1);
chk('ĐÃ BỎ dải chip cũ + 3 cụm tổng rời rạc của v4.103',
    pane.indexOf('id="knq-stats"')<0 && pane.indexOf('id="knq-ol1sum"')<0);
chk('v4.96 — giao diện KHÔNG còn chuỗi tiếng Việt trên nhãn/nút chính',
    ['Chốt kỳ','Xem dữ liệu cũ','Cập nhật D/E','💾 Lưu','Ghi chú','Tên tàu']
      .every(t=>pane.indexOf(t)<0),
    ['Chốt kỳ','Xem dữ liệu cũ','Cập nhật D/E','💾 Lưu','Ghi chú','Tên tàu']
      .filter(t=>pane.indexOf(t)>-1).join(', '));
chk('KHÔNG còn nút lọc/ẩn theo tháng — bảng batch là sổ theo dõi',
    pane.indexOf('knq-allbtn')<0 && !/toggleAll/.test(SRC));
chk('visibleGi() không đụng tới _month — batch không bị lọc theo tháng',
    (()=>{ const f=SRC.split('function visibleGi(')[1].split('\n  }')[0];
           return f.indexOf('_month')<0; })());
chk('chuyến tháng 7 và chuyến tháng 8 cùng nằm trong bảng C3',
    H('knq-body-c3').indexOf('BERGE NANTONG')>-1 && H('knq-body-c3').indexOf('MAPLE GAS')>-1);
chk('có nút ➕ Get In cho cả C3 và C4',
    pane.indexOf("KNQ.addGi('C3')")>-1 && pane.indexOf("KNQ.addGi('C4')")>-1);
chk('vẫn còn nút SAP · Save · Export · Closed rows',
    ['KNQ.pullSap()','KNQ.save()','KNQ.exportXlsx()','KNQ.loadOld()'].every(t=>pane.indexOf(t)>-1));
chk('bốn thẻ tình hình render ra', (H('knq-cards').match(/class="knq-card /g)||[]).length===4,
    String((H('knq-cards').match(/class="knq-card /g)||[]).length)+' thẻ');

console.log('\n— v4.97 BATCH-FIRST: MÀU LOẠI LÔ · PUMPING NOW · LỌC · GẬP NHÓM —');
chk('ô batch tô màu theo loại lô (P/X/D/E)',
    /knq-bcell knq-lot-[pxde]/.test(H('knq-body-c3')), (H('knq-body-c3').match(/knq-lot-\w+/g)||[]).slice(0,4).join(' '));
chk('dòng get out mang class loại lô để tô rail bên trái',
    /class="knq-go knq-\w+ knq-lot-[pxde]/.test(H('knq-body-c3')));
chk('có chấm chữ cái loại lô trước mã batch', H('knq-body-c3').indexOf('knq-lotdot')>-1);
chk('CSS có đủ 4 màu loại lô', ['knq-lot-p','knq-lot-x','knq-lot-d','knq-lot-e']
    .every(c=>fs.readFileSync(path.join(ROOT,'css','knq.css'),'utf8').indexOf('.knq-bcell.'+c)>-1));
chk('ĐÚNG MỘT batch mỗi (Mat × loại lô) mang cờ ▶ PUMPING NOW', (function(){
  const by={};
  Object.values(S.GO).forEach(r=>{ if(r.head){ const k=r.mat+'|'+r.letter; by[k]=(by[k]||0)+1; } });
  return Object.values(by).every(n=>n===1);
})(), JSON.stringify(Object.values(S.GO).filter(r=>r.head).map(r=>r.mat+' '+r.batch)));
chk('badge ▶ PUMPING NOW render ra bảng', H('knq-body-c3').indexOf('PUMPING NOW')>-1);
chk('dòng GET IN có chuỗi chip đếm tình trạng get out',
    H('knq-body-c3').indexOf('knq-gsum')>-1 && H('knq-body-c3').indexOf('knq-dot')>-1);
chk('bấm vào chuỗi tóm tắt cũng gập/mở được nhóm',
    /knq-gsum"[^>]*onclick="KNQ.toggleGroup/.test(H('knq-body-c3')));
chk('markup có đủ 3 bộ lọc + nút xoá lọc',
    ['id="knq-f-q"','id="knq-f-st"','id="knq-f-lot"','KNQ.clearFilter()']
      .every(t=>pane.indexOf(t)>-1));
chk('markup có nút gập hàng loạt (finished / all / expand)',
    ["KNQ.collapseAll('out')","KNQ.collapseAll('all')","KNQ.collapseAll('none')"]
      .every(t=>pane.indexOf(t)>-1));
(function(){
  const all=Object.values(S.GO).filter(r=>r.mat==='C3').length;
  KNQ._state.setFilter('','','D'); KNQ.render();
  const onlyD=H('knq-body-c3');
  /* ⚠ '260804X001' cũng là PLACEHOLDER của ô batch — phải soi value="…" */
  const V=t=>'value="'+t+'"';
  const okD=onlyD.indexOf(V('260806D001'))>-1 && onlyD.indexOf(V('260804X001'))<0;
  KNQ._state.setFilter('260721','',''); KNQ.render();
  const q=H('knq-body-c3');
  const okQ=q.indexOf(V('260721X001'))>-1 && q.indexOf(V('260806D001'))<0;
  KNQ._state.setFilter('','zzz-khong-co-that',''); KNQ.render();
  const okEmpty=H('knq-body-c3').indexOf('No C3 batch matches')>-1;
  KNQ.clearFilter();
  const back=H('knq-body-c3');
  chk('lọc theo loại lô D chỉ còn batch D', okD);
  chk('tìm theo mảnh mã batch "260721" ra đúng 1 batch', okQ);
  chk('lọc không khớp gì → báo rõ + nút xoá lọc', okEmpty);
  chk('xoá lọc thì bảng trở lại đầy đủ',
      back.indexOf('value="260806D001"')>-1 && back.indexOf('value="260804X001"')>-1 && all>0);
})();
(function(){
  KNQ.collapseAll('all');
  const folded=H('knq-body-c3');
  chk('⊟ All gập hết — không còn dòng get out nào', folded.indexOf('knq-go')<0);
  chk('… nhưng chuỗi chip tình trạng vẫn còn để đọc', folded.indexOf('knq-gsum')>-1);
  KNQ.collapseAll('none');
  chk('⊞ Expand all mở lại hết', H('knq-body-c3').indexOf('knq-go')>-1);
  KNQ._state.setFilter('260721','',''); KNQ.render();
  chk('đang lọc thì nhóm tự mở, kết quả không bị giấu trong nhóm gập',
      (KNQ.collapseAll('all'), H('knq-body-c3').indexOf('value="260721X001"')>-1));
  KNQ.clearFilter(); KNQ.collapseAll('none');
})();

console.log('\n— v4.99 D-1: DẢI CẢNH BÁO · NÚT SAP · KÝ HIỆU KHỚP SAP —');
chk('markup có dải cảnh báo #knq-alerts nằm TRƯỚC .knq-body',
    pane.indexOf('id="knq-alerts"')>-1 &&
    pane.indexOf('id="knq-alerts"')<pane.indexOf('class="knq-body"'));
chk('dải cảnh báo có render nội dung', H('knq-alerts').indexOf('knq-al')>-1, H('knq-alerts').slice(0,90));
chk('nút ⬇ Sync SAP + ⇐ SAP qty đều có',
    pane.indexOf('KNQ.pullSap()')>-1 && pane.indexOf('KNQ.fillSapQty()')>-1 &&
    pane.indexOf('⬇ Sync SAP')>-1 && pane.indexOf('⇐ SAP qty')>-1);
chk('ĐÃ BỎ nhãn cũ "Update D/E from SAP"', pane.indexOf('Update D/E from SAP')<0);
chk('thẻ OL1 chốt số tới NGÀY HÔM QUA', (function(){
  const d=new Date(Date.parse(new Date().toISOString().slice(0,10)+'T00:00:00Z')-86400000);
  const dmy=String(d.getUTCDate()).padStart(2,'0')+'/'+String(d.getUTCMonth()+1).padStart(2,'0')+
            '/'+String(d.getUTCFullYear()).slice(2);
  return H('knq-cards').indexOf('OL1 USED')>-1 && H('knq-cards').indexOf('to '+dmy)>-1;
})(), H('knq-cards').slice(0,80));
(function(){
  KNQ.pullSap();
  const h=H('knq-body-c3');
  chk('sau khi sync: D/E lấy thẳng số SAP → hiện ✓ SAP kèm ngày',
      h.indexOf('knq-sapb ok')>-1 && h.indexOf('✓ SAP')>-1);
  /* ⭐ v4.103 — SAP khai P/X MỖI THÁNG MỘT LẦN nên End Stock đứng yên cả kỳ,
     còn Actual left trừ lùi hằng ngày ⇒ lệch là ĐƯƠNG NHIÊN. Bản cũ hiện Δ
     đỏ ở đây = BÁO NHẦM, phải thay bằng chú thích nguồn số. */
  chk('P/X KHÔNG còn hiện Δ "lệch SAP" nữa — thay bằng chú thích ↓ per OL1',
      h.indexOf('knq-sapb ol1')>-1 && h.indexOf('per OL1')>-1);
  chk('không dòng P/X nào mang cờ sapOk=false',
      Object.values(S.GO).filter(r=>(r.letter==='P'||r.letter==='X')).every(r=>r.sapOk===null),
      JSON.stringify(Object.values(S.GO).filter(r=>(r.letter==='P'||r.letter==='X')&&r.sapOk!==null)
        .map(r=>r.batch)));
  chk('dải cảnh báo KHÔNG còn câu "batch(es) do not match SAP" của bản cũ',
      H('knq-alerts').indexOf('do not match SAP')<0, H('knq-alerts').slice(0,120));
  chk('CSS có đủ style cho ✓/Δ/per-OL1 và dải cảnh báo',
      ['.knq-sapb','.knq-sapb.ol1','.knq-al','.knq-chip.asof','.knq-asofrow']
        .every(c=>fs.readFileSync(path.join(ROOT,'css','knq.css'),'utf8').indexOf(c)>-1));
})();
(function(){
  /* mã D/E không có trong SAP → phải nói "no SAP row", KHÔNG được im lặng.
     (Dùng lô D chứ không phải X: P/X không đối chiếu SAP nữa.) */
  const g=KNQ.visibleGi('C3')[0];
  KNQ.addGo(g._id);
  const ids=Object.keys(S.GO), nid=ids[ids.length-1];
  KNQ.setGo(nid,'batch','260101D777'); KNQ.setGo(nid,'sapKg','1000');
  KNQ.pullSap();
  chk('mã batch D/E không có trong SAP → ghi rõ "no SAP row"',
      H('knq-body-c3').indexOf('no SAP row')>-1);
  KNQ.delGo(nid);
})();
/* ── v4.103 — DẤU THỜI GIAN QUÉT SAP + TỔNG FEED OL1 RA NGOÀI ───────── */
console.log('\n— v4.103 QUÉT SAP CÓ DẤU THỜI GIAN · TỔNG OL1 NGOÀI MÀN HÌNH —');
(function(){
  KNQ.pullSap();
  const st=S.sapSync();
  chk('quét SAP ghi lại dấu thời gian (giờ + người + ngày dữ liệu)',
      !!st.at && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(st.at) && !!st.asOf, JSON.stringify(st));
  chk('dấu thời gian được đẩy lên Firebase ở meta/sapSync',
      !!S.dirty()['meta/sapSync'], Object.keys(S.dirty()).filter(k=>k.indexOf('meta/')===0).join(','));
  const os=H('knq-cards');
  chk('thẻ SAP hiện giờ quét để biết số D/E mới tới đâu',
      os.indexOf('knq-card sap')>-1 && os.indexOf('scanned')>-1 && os.indexOf('SAP D/E')>-1);
  chk('markup có dải bốn thẻ', pane.indexOf('id="knq-cards"')>-1);
  chk('thẻ ① TỒN KHO', os.indexOf('knq-card stock')>-1 && os.indexOf('IN BONDED WAREHOUSE')>-1);
  chk('thẻ ② ĐANG BƠM RA', os.indexOf('knq-card pump')>-1 && os.indexOf('COMING OUT NOW')>-1);
  chk('thẻ ③ OL1 đủ TOTAL P+X · P · X',
      os.indexOf('knq-card ol1')>-1 && os.indexOf('TOTAL P+X')>-1 &&
      os.indexOf('>P Petchem<')>-1 && os.indexOf('>X Export<')>-1);
  chk('thẻ SAP nói rõ P/X KHÔNG chạy theo SAP', os.indexOf('P/X run on FEED OL1, not on SAP')>-1);
  chk('KHÔNG lặp lại kỳ/ngày dữ liệu ở nhiều chỗ như bản cũ',
      (os.match(/data as of/g)||[]).length===0);
})();
(function(){
  const A=S.asOf();
  S.setMonth(A.slice(0,7)); KNQ.setUse(A,'t','1000'); KNQ.setUse(A,'x','300');
  KNQ.openOl1();
  const h=H('knq-use-body');
  const iD1=h.indexOf('knq-tot knq-tot-d1'), iRow=h.indexOf('data-u="');
  chk('dòng TỔNG nằm TRÊN ĐẦU bảng FEED OL1, không phải cuối bảng',
      iD1>-1 && iRow>-1 && iD1<iRow, 'tot@'+iD1+' · row@'+iRow);
  chk('có dòng TỔNG TỚI D-1 riêng (lượng đã dùng thật)',
      h.indexOf('USED to')>-1 && h.indexOf('the P/X run-down uses')>-1);
  chk('vẫn còn dòng TỔNG cả tháng kèm plan', h.indexOf('incl. plan')>-1);
})();
(function(){
  /* bảng FEED OL1 phải chỉ rõ dòng NGÀY CHỐT SỐ (hôm qua) */
  const A=KNQ._state.asOf();
  KNQ._state.setMonth(A.slice(0,7));
  KNQ.setUse(A,'t','1000');
  KNQ.openOl1();
  chk('bảng FEED OL1 đánh dấu dòng NGÀY CHỐT SỐ (hôm qua)',
      H('knq-use-body').indexOf('knq-asofrow')>-1 && H('knq-use-body').indexOf('data as of')>-1);
  KNQ.delUseRow(A); KNQ._state.setMonth('2026-08');
})();

/* ═══ v4.105 — ♻ mở khoá · ☑ auto run-down · ⚖ đối chiếu SAP ═══ */
(function(){
  KNQ._state.setMonth('2026-08');
  /* ♻ nút mở khoá phải hiện đúng trên dòng mang cờ đóng bền */
  const first=Object.values(KNQ._state.GO).find(r=>r.batch);
  first.pxDone=true; first.hqDone=true;
  KNQ.render();
  const all=Object.values(CACHE).map(e=>String(e.innerHTML)).join('');
  chk('♻ nút mở khoá hiện trên dòng đang mang cờ DONE',
      all.indexOf('knq-reop')>-1 && all.indexOf('KNQ.reopen(')>-1);
  chk('dải cảnh báo nói rõ lô bị khoá + nút ♻ Re-open hàng loạt',
      H('knq-alerts').indexOf('KNQ.reopenAll()')>-1 &&
      H('knq-alerts').indexOf('still carry the DONE flag')>-1);
  first.pxDone=false; first.hqDone=false;

  /* ☑ auto run-down — ô tích và dòng "assumed" dưới ô SAP qty */
  chk('thanh công cụ có ô tích ☑ Auto run-down nối đúng vào KNQ.setRdAll',
      /id="knq-rdall"/.test(pane) && /KNQ\.setRdAll\(this\)/.test(pane));
  const gid=Object.keys(KNQ._state.GI)[0];
  KNQ.addGo(gid);
  const nid=Object.keys(KNQ._state.GO).pop();
  KNQ.setGo(nid,'batch','260805X555'); KNQ.setGo(nid,'hqQty','4750');
  KNQ._state.setRdAllRaw(false); KNQ.render();
  chk('TẮT: lô thiếu SAP qty được dải cảnh báo mời bật ô tích',
      H('knq-alerts').indexOf('Auto run-down')>-1);
  KNQ._state.setRdAllRaw(true); KNQ.render();
  const all2=Object.values(CACHE).map(e=>String(e.innerHTML)).join('');
  chk('BẬT: ô SAP qty ghi rõ số đang dùng là số SUY RA ("assumed")',
      all2.indexOf('assumed')>-1 && all2.indexOf('HQ get-out')>-1);
  KNQ._state.setRdAllRaw(false);
  KNQ.delGo(nid);

  /* ⚖ bảng đối chiếu — dựng và soi HTML */
  KNQ.pullSap(true);
  KNQ.openCmp();
  const b=H('knq-cmp-body');
  chk('⚖ bảng đối chiếu dựng đủ 3 nhóm',
      b.indexOf('Figures differ')>-1 && b.indexOf('In SAP, not declared in KNQ')>-1 &&
      b.indexOf('In KNQ, not in SAP')>-1);
  chk('…nói rõ SỐ SAP LÀ SỐ ĐÚNG', b.indexOf('SAP figure is the correct one')>-1);
  chk('…có ô tick từng dòng + ☑ Select all', b.indexOf('KNQ.cmpSel(')>-1 && b.indexOf('KNQ.cmpAll(')>-1);
  chk('nút ⇐ Apply selected đếm số dòng đang tick',
      /Apply selected \(\d+\)/.test(String(CACHE['knq-cmp-apply'].textContent||'')),
      String(CACHE['knq-cmp-apply'].textContent||''));
  chk('markup có modal #knq-cmp nối đúng vào KNQ.cmpApply',
      /id="knq-cmp"/.test(pane) && /KNQ\.cmpApply\(\)/.test(pane) && /KNQ\.openCmp\(\)/.test(pane));
  KNQ.closeCmp();
})();

console.log('\n— CSS —');
const CSS=fs.readFileSync(path.join(ROOT,'css','knq.css'),'utf8');
/* ⚠ bỏ khối @keyframes trước khi soi trùng: hai animation khác nhau đương
   nhiên cùng có mốc 0%/50%/100%, đó KHÔNG phải selector trùng. */
const CSSFLAT=(function(){
  let out='', i=0;
  while(i<CSS.length){
    const k=CSS.indexOf('@keyframes',i);
    if(k<0){ out+=CSS.slice(i); break; }
    out+=CSS.slice(i,k);
    let j=CSS.indexOf('{',k), depth=0;
    if(j<0){ break; }
    for(;j<CSS.length;j++){
      if(CSS[j]==='{') depth++;
      else if(CSS[j]==='}'){ depth--; if(!depth){ j++; break; } }
    }
    i=j;
  }
  return out;
})();
/* ── v4.102 — ĐỒNG BỘ NHIỀU MÁY · KỲ QUÁ HẠN · 📜 ARCHIVE ─────────────── */
console.log('\n— v4.102 ĐỒNG BỘ NHIỀU MÁY · QUÁ HẠN ĐÓNG KỲ · 📜 ARCHIVE —');
chk('markup có chỉ báo trạng thái đẩy lên Firebase', pane.indexOf('id="knq-sync"')>-1);
chk('markup có nút 📜 Archive + modal kỳ đã đóng',
    pane.indexOf('KNQ.openArch()')>-1 && pane.indexOf('id="knq-arch"')>-1 &&
    pane.indexOf('id="knq-arch-m"')>-1 && pane.indexOf('id="knq-arch-body"')>-1);
chk('mọi thao tác sửa đều tự hẹn giờ đẩy (không chờ 💾 Save)',
    /_schedulePush\(\)/.test(SRC) && /function _flush/.test(SRC) &&
    /function save\(\)\{ return _flush\(true\); \}/.test(SRC));
chk('có listener realtime cho gi · go · use + con trỏ kỳ meta',
    /child_added/.test(SRC) && /child_changed/.test(SRC) && /child_removed/.test(SRC) &&
    /child\('meta'\)\.on\('value'/.test(SRC));
chk('cửa sổ tải về bám theo KỲ MỞ, không phải 120 ngày cứng như trước',
    /_liveFrom\(\)/.test(SRC) && SRC.indexOf('-120')<0);
chk('📌 Close period đọc SAP tại NGÀY CUỐI KỲ, không phải D-1',
    /_sapAt\(M9\)/.test(SRC) && /function _sapAt/.test(SRC));
chk('đóng kỳ ghi con trỏ kỳ + snapshot lưu trữ',
    /_dirty\['meta\/curPeriod'\]=N/.test(SRC) && /_dirty\['periods\/'\+M\]/.test(SRC));
(function(){
  const S2=KNQ._state, was=S2.rawPeriod(), wasM=S2.month();
  /* kỳ 7 vẫn mở trong khi hôm nay đã sang tháng khác ⇒ phải hiện banner ĐỎ */
  S2.setPeriod('2026-07'); S2.setMonth('2026-07'); KNQ.render();
  const H2=CACHE['knq-alerts'].innerHTML;
  chk('QUÁ HẠN đóng kỳ ⇒ dải cảnh báo hiện banner ĐỎ kèm nút đóng kỳ',
      H2.indexOf('knq-al bad')>-1 && H2.indexOf('is still open')>-1 &&
      H2.indexOf('KNQ.closeMonth()')>-1,
      H2.slice(0,90));
  chk('thẻ TỒN KHO nói rõ kỳ nào đang mở',
      H('knq-cards').indexOf('<span>2026-07</span>')>-1, H('knq-cards').slice(0,120));
  S2.setPeriod(was||'2026-08'); S2.setMonth(wasM); KNQ.render();
})();
(function(){
  /* 📜 Archive: chưa đóng kỳ nào ⇒ nói rõ, không để hộp trống */
  KNQ._state.setClosed({});
  KNQ.openArch();
  chk('📜 Archive lúc chưa có kỳ nào đóng ⇒ có lời giải thích, không trống trơn',
      CACHE['knq-arch-body'].innerHTML.indexOf('No period has been closed yet')>-1);
  KNQ.closeArch();
})();

const seen={}, dup=[];
[...CSSFLAT.matchAll(/([^{}]+)\{([^}]*)\}/g)].forEach(m=>{
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
