/* ============================================================
 * knq.test.js — module KNQ v4.96 (get in / get out, 2 bảng C3 + C4, 16 cột)
 * ------------------------------------------------------------
 *   node tests/knq.test.js        (chạy từ thư mục gốc repo)
 *
 * ĐƠN VỊ = KG ở mọi ô (theo chốt của người dùng).
 * Kiểm:
 *   1  cấu trúc 1 GET IN ↔ nhiều GET OUT, mỗi get out 1 mã batch duy nhất
 *   2  số dư còn lại của từng chuyến (cột "Còn lại của chuyến")
 *   3  D/E — khớp batch SAP CÙNG MÃ → chép tồn SAP vào "Thực còn"
 *   4  P/X — trừ lùi FIFO theo bảng FEED OL1 (vào trước dùng trước)
 *   5  dự báo hết batch bằng PLAN X đã import
 *   6  tách bảng theo Mat · tick ✔ Xong · an toàn ghi Firebase
 *   7b bảng KHÔNG lọc theo tháng · 7c kỳ trừ lùi + 📌 Chốt kỳ
 *   8  TỔNG P+X gõ tay · P = TỔNG − X · ngày trống tạm tính 2.000 T
 *   8b dán cả cột từ Excel (Ctrl+V) · 9 import file C3 usage: actual → plan
 *   10 v4.96 — NGÀY DÙNG BATCH LẤY TỪ MÃ BATCH (260714X001 ⇒ 14/07/2026),
 *      cột HQ Approved Qty chỉ tham chiếu, VASSCM + ✔ Done ép Actual Left = 0
 * Số liệu SAP lấy từ ZMMFR022 SLoc 1100 tải 17/08/2026 (fixtures).
 * ============================================================ */
const fs=require('fs'), path=require('path');
global.window=global;
global.document={ getElementById:()=>null, querySelector:()=>null };
global.toast=()=>{};
global.confirm=()=>true;
global.canWrite=()=>true;
/* stub Firebase dựng TRƯỚC khi module chạm _ref() — ref bị cache, thay stub
   giữa chừng sẽ không bắt được map của save(). */
let captured=null;
global.firebase={ database:()=>({ ref:()=>({
  update(map){ captured=map; return Promise.resolve(); },
  child(){ return { once:()=>Promise.resolve({val:()=>null}), remove:()=>Promise.resolve() }; }
}) }) };
eval(fs.readFileSync(path.join(__dirname,'..','js','features','knq.js'),'utf8'));

const F=JSON.parse(fs.readFileSync(path.join(__dirname,'knq.fixtures.json'),'utf8'));
/* SP giả — trả đúng shape của SP.batch1100() (sp.js v4.89) */
global.SP={
  batch1100:()=>({ rows:F.sapSnapshot, legacy:0,
    dates:[...new Set(F.sapSnapshot.map(r=>r.date))].sort() }),
  dates1100:()=>[...new Set(F.sapSnapshot.map(r=>r.date))].sort()
};

const S=KNQ._state;
let fail=0;
function chk(n,c,x){ console.log((c?'  ✅ ':'  ❌ ')+n+(x?('  '+x):'')); if(!c) fail++; }
const K=v=>Math.round(Number(v||0));
KNQ.init();

/* helper — tạo 1 chuyến + các dòng get out của nó */
function gi(mat,f){
  KNQ.addGi(mat);
  const ids=Object.keys(S.GI), id=ids[ids.length-1];
  Object.keys(f).forEach(k=>KNQ.setGi(id,k,f[k]));
  return id;
}
function go(giId,f){
  KNQ.addGo(giId);
  const ids=Object.keys(S.GO), id=ids[ids.length-1];
  Object.keys(f).forEach(k=>KNQ.setGo(id,k,f[k]));
  return id;
}

/* ---------- 1. cấu trúc GET IN ↔ GET OUT ---------- */
console.log('\n[1] 1 CHUYẾN TÀU = 1 GET IN + NHIỀU GET OUT');
const MAPLE=gi('C3',{ no:'VVIII', vendor:'Wanhua', vessel:'MAPLE GAS', regDate:'2026-07-24',
  decl:'108462739342', date:'2026-08-03', price:'693.34', qtyKg:'45826000' });
chk('dòng GET IN nhận đủ thông tin như file XNK',
    S.GI[MAPLE].vessel==='MAPLE GAS' && S.GI[MAPLE].decl==='108462739342' &&
    S.GI[MAPLE].qtyKg===45826000 && S.GI[MAPLE].mat==='C3');
chk('Thành tiền tự tính = đơn giá × tấn',
    (KNQ.recalc(), K(S.GI[MAPLE].amount)===K(693.34*45826)), String(K(S.GI[MAPLE].amount)));

const E1=go(MAPLE,{ time:'2nd time', regDate:'2026-08-03', decl:'108495949660', date:'2026-08-04',
  batch:'260804E001', sapKg:'2000000', price:'693.34', qtyKg:'2000000' });
const X4=go(MAPLE,{ time:'2nd time', regDate:'2026-08-03', decl:'108495942660', date:'2026-08-04',
  batch:'260804X001', sapKg:'5000000', price:'693.34', qtyKg:'5000000' });
const D1=go(MAPLE,{ time:'2nd time', regDate:'2026-08-03', decl:'108495933010', date:'2026-08-06',
  batch:'260806D001', sapKg:'1828399', price:'693.34', qtyKg:'2500000' });
const P4=go(MAPLE,{ time:'1st time', regDate:'2026-07-30', decl:'108482442460', date:'2026-08-10',
  batch:'260731P001', sapKg:'14200000', price:'693.34', qtyKg:'14200000' });
chk('4 dòng get out gắn đúng vào chuyến MAPLE GAS', KNQ.childrenOf(MAPLE).length===4);
chk('gõ mã batch → tự suy ra loại lô P/X/D/E',
    S.GO[E1].letter==='E'&&S.GO[X4].letter==='X'&&S.GO[D1].letter==='D'&&S.GO[P4].letter==='P');
KNQ.setGo(D1,'sapKg','abc');
chk('ô số gõ chữ → thành RỖNG, không thành 0', S.GO[D1].sapKg==='');
KNQ.setGo(D1,'sapKg','1828399');
const dupId=go(MAPLE,{ decl:'999', date:'2026-08-06', batch:'260804X001', sapKg:'1' });
chk('trùng mã batch trong cùng Mat vẫn ghi nhưng có cảnh báo (mỗi get out 1 mã duy nhất)',
    S.GO[dupId].batch==='260804X001');
KNQ.delGo(dupId);
chk('xoá dòng get out', !S.GO[dupId]);

/* ---------- 2. số dư còn lại của chuyến ---------- */
console.log('\n[2] CÒN LẠI CỦA CHUYẾN — trừ dần theo NGÀY NẰM TRONG MÃ BATCH');
KNQ.recalc();
const ch=KNQ.childrenOf(MAPLE);
/* v4.96: ngày hiệu lực đọc từ mã batch, KHÔNG còn đọc ô "ngày nhập/xuất".
   260731P001 (31/07) đứng trước 260804* (04/08) rồi 260806* (06/08). */
chk('get out sắp theo ngày trong mã batch',
    ch.map(r=>S.batchDate(r.batch)).join(',')==='2026-07-31,2026-08-04,2026-08-04,2026-08-06',
    ch.map(r=>S.batchDate(r.batch)).join(','));
chk('số dư dòng cuối = 45 826 000 − (2 000 000+5 000 000+2 500 000+14 200 000) = 22 126 000 kg',
    K(ch[3].balKg)===22126000, String(K(ch[3].balKg)));
chk('số dư của chuyến khớp dòng get out cuối', K(S.GI[MAPLE].balKg)===K(ch[3].balKg));

/* ---------- 3. D/E lấy tồn từ SAP theo mã batch ---------- */
console.log('\n[3] ⬇ CẬP NHẬT D/E TỪ SAP — khớp theo MÃ BATCH đã gõ');
const GLOBE=gi('C4',{ no:'III', vessel:'GLOBE POLARIS', decl:'108502636212', date:'2026-08-11',
  price:'743', qtyKg:'25616800' });
const D4=go(GLOBE,{ time:'1st time', regDate:'2026-08-11', decl:'108518936150', date:'2026-08-12',
  batch:'260806D001', sapKg:'1161827', qtyKg:'1000000' });
const ZERO=go(MAPLE,{ time:'1st time', regDate:'2026-07-30', decl:'108482451341', date:'2026-08-06',
  batch:'260731D001', sapKg:'2400000', qtyKg:'2400000' });
const BAD=go(MAPLE,{ decl:'999', date:'2026-08-06', batch:'260101D999', sapKg:'100000', qtyKg:'100000' });
KNQ.pullSap();
KNQ.recalc();
chk('C3 260806D001 → Thực còn 1 426 694 kg (tồn SAP)', K(S.GO[D1].remainKg)===1426694, String(K(S.GO[D1].remainKg)));
chk('C4 260806D001 → khớp RIÊNG theo Mat: 1 030 053 kg', K(S.GO[D4].remainKg)===1030053, String(K(S.GO[D4].remainKg)));
chk('Đã dùng = Tồn SAP gõ tay − Thực còn = 401 705 kg', K(S.GO[D1].usedKg)===1828399-1426694, String(K(S.GO[D1].usedKg)));
chk('batch SAP đã rỗng → Thực còn 0, trạng thái HẾT cần khai HQ',
    S.GO[ZERO].remainKg===0 && S.GO[ZERO].st==='zero', S.GO[ZERO].st);
chk('mã batch không có trong SAP → không bịa số, có cảnh báo',
    S.GO[BAD].sapT===undefined && /SAP/.test(S.GO[BAD].warn||''), S.GO[BAD].warn);
chk('ghi nhận ngày SAP đã lấy về', S.sapAsOf()==='2026-08-17', S.sapAsOf());

/* ---------- 4. FIFO cho P/X theo FEED OL1 ---------- */
console.log('\n[4] P/X — TRỪ LÙI FIFO THEO BẢNG FEED OL1');
const BERGE=gi('C3',{ no:'VVIII', vessel:'BERGE NANTONG', decl:'108360769902', date:'2026-07-01',
  price:'683.15', qtyKg:'45889300' });
const X1=go(BERGE,{ time:'2nd time', regDate:'2026-07-13', decl:'108427677260', date:'2026-07-14',
  batch:'260714X001', sapKg:'1172329', qtyKg:'3000000' });
const X2=go(BERGE,{ time:'2nd time', regDate:'2026-07-20', decl:'108448137010', date:'2026-07-21',
  batch:'260721X001', sapKg:'5000000', qtyKg:'5000000' });
/* lượng dùng X thực tế 01→05/08 — sheet Feed OL1, gõ theo TẤN nên ×1000 = kg */
const XUSE={ '2026-08-01':537.413, '2026-08-02':0, '2026-08-03':364.499,
             '2026-08-04':697.652, '2026-08-05':475.26 };
Object.keys(XUSE).forEach(d=>KNQ.setUse(d,'x',String(XUSE[d])));   /* đơn vị modal mặc định = Tấn */
KNQ.recalc();
chk('gõ 537.413 (Tấn) → lưu 537 413 kg', K(S.USE['2026-08-01'].x)===537413, String(S.USE['2026-08-01'].x));
chk('batch X cũ nhất hết đúng ngày 04/08 (vào trước dùng trước)',
    S.GO[X1].remainKg===0 && S.GO[X1].zeroDate==='2026-08-04', S.GO[X1].zeroDate);
chk('batch X kế tiếp còn 4 097 505 kg', K(S.GO[X2].remainKg)===4097505, String(K(S.GO[X2].remainKg)));
chk('batch X ra kho 04/08 chưa tới lượt → còn nguyên 5 000 000 kg',
    K(S.GO[X4].remainKg)===5000000 && S.GO[X4].st==='wait', String(K(S.GO[X4].remainKg)));
chk('tổng đã bơm X = 2 074 824 kg (đúng dòng Total của file)',
    K([X1,X2,X4].reduce((s,i)=>s+S.GO[i].usedKg,0))===2074824,
    String(K([X1,X2,X4].reduce((s,i)=>s+S.GO[i].usedKg,0))));
chk('nút cập nhật SAP KHÔNG đè số của P/X',
    (KNQ.pullSap(),KNQ.recalc(),K(S.GO[X2].remainKg)===4097505), String(K(S.GO[X2].remainKg)));
/* OL1 của KỲ KHÁC không được lấn sang kỳ đang xem — nếu không sẽ đếm đôi
   với phần đã nằm trong tồn đầu kỳ */
KNQ.setUse('2026-07-15','x','100');
KNQ.recalc();
chk('OL1 ngày 15/07 KHÔNG lấn vào kỳ tháng 8', K(S.GO[X2].remainKg)===4097505,
    String(K(S.GO[X2].remainKg)));
KNQ.delUseRow('2026-07-15'); KNQ.recalc();
chk('xoá ngày đó đi số vẫn nguyên', K(S.GO[X2].remainKg)===4097505);

/* v4.96 — batch P4 = 260731P001 ⇒ được dùng từ 31/07, nên nó nhận trừ NGAY
   TỪ 01/08 (đầu kỳ) chứ không chờ tới 10/08 như ô "ngày nhập/xuất" cũ.
   P mỗi ngày = TỔNG − X; ngày chỉ có X thì TỔNG tạm tính 2.000 T.
     01/08 2 000 000−537 413 = 1 462 587      04/08 2 000 000−697 652 = 1 302 348
     02/08 2 000 000−      0 = 2 000 000      05/08 2 000 000−475 260 = 1 524 740
     03/08 2 000 000−364 499 = 1 635 501
     11/08 1 202 287 · 12/08 532 801  (schema cũ {p} → TỔNG = p)
   Cộng lại 9 660 264 ⇒ còn 14 200 000 − 9 660 264 = 4 539 736 kg */
KNQ.setUse('2026-08-11','p','1202.287');
KNQ.setUse('2026-08-12','p','532.801');
KNQ.recalc();
chk('P trừ độc lập với X — batch P (260731P001) còn 4 539 736 kg',
    K(S.GO[P4].remainKg)===4539736, String(K(S.GO[P4].remainKg)));

/* ---------- 5. dự báo bằng PLAN X ---------- */
console.log('\n[5] DỰ BÁO HẾT BATCH BẰNG PLAN X ĐÃ IMPORT');
/* dùng ngày hệ thống để test không phụ thuộc lúc chạy */
const _d=new Date();
const TODAY=_d.getFullYear()+'-'+String(_d.getMonth()+1).padStart(2,'0')+'-'+String(_d.getDate()).padStart(2,'0');
const plus=(iso,k)=>{ const t=Date.parse(iso+'T00:00:00Z')+k*86400000, x=new Date(t);
  return x.getUTCFullYear()+'-'+String(x.getUTCMonth()+1).padStart(2,'0')+'-'+String(x.getUTCDate()).padStart(2,'0'); };
/* v4.99 — lượt chiếu bắt đầu ngay TỪ HÔM NAY (mốc số thật là HÔM QUA), nên
   batch cạn sớm hơn bản cũ đúng 1 ngày: 10 → 9. */
chk('chưa import plan X → vẫn chiếu tạm bằng bình quân 7 ngày gần nhất',
    !!S.GO[X2].eta && S.GO[X2].etaDays===9, S.GO[X2].eta+' ('+S.GO[X2].etaDays+' ngày)');
const etaAvg=S.GO[X2].eta;
for(let k=1;k<=40;k++){
  const d=plus(TODAY,k);
  const u=S.USE[d]||{p:'',x:'',xp:'',note:''}; u.xp=1400000; S.USE[d]=u;
}
KNQ.recalc();
chk('import plan X → ngày dự kiến hết đổi theo plan, không còn theo bình quân',
    !!S.GO[X2].eta && S.GO[X2].eta!==etaAvg, S.GO[X2].eta+' (trước: '+etaAvg+')');
chk('số ngày còn lại là số dương', S.GO[X2].etaDays>0, String(S.GO[X2].etaDays));
chk('ngày dự kiến nằm trong tương lai, không phải quá khứ', S.GO[X2].eta>TODAY, S.GO[X2].eta);
/* plan chỉ được nạp cho ngày MAI trở đi (k=1..40); hôm nay không có plan nên
   vẫn chiếu bằng bình quân → tổng cộng vẫn 3 ngày. */
chk('4 097 505 kg / 1 400 000 kg mỗi ngày → hết sau 3 ngày', S.GO[X2].etaDays===3, String(S.GO[X2].etaDays));
chk('batch D/E không có lượng dùng hằng ngày → không chiếu bừa', !S.GO[D1].eta);
chk('"Thực còn" KHÔNG bị phần chiếu tương lai ăn mất',
    K(S.GO[X2].remainKg)===4097505, String(K(S.GO[X2].remainKg)));
chk('batch X kế tiếp cũng nhận được ngày dự kiến hết sau khi batch trước cạn',
    !!S.GO[X4].eta && S.GO[X4].eta>S.GO[X2].eta, (S.GO[X4].eta||'(trống)'));

/* ---------- 6. lọc tháng · tick Xong · Firebase ---------- */
console.log('\n[6] TÁCH BẢNG THEO MAT · TICK ✔ XONG · AN TOÀN GHI FIREBASE');
KNQ.recalc();
const visC3=KNQ.visibleGi('C3').map(g=>g._id);
chk('bảng C3 chỉ chứa chuyến C3', visC3.indexOf(GLOBE)<0 && visC3.indexOf(MAPLE)>-1);
chk('bảng C4 tách riêng', KNQ.visibleGi('C4').map(g=>g._id).join()===GLOBE);
chk('chuyến tháng 7 còn tồn vẫn được gánh sang tháng 8', visC3.indexOf(BERGE)>-1);

KNQ.toggleDone('go',ZERO,{checked:true});
KNQ.recalc();
chk('tick ✔ → trạng thái "Đã xong" + ghi ngày khai HQ',
    S.GO[ZERO].st==='done' && !!S.GO[ZERO].hqDate);

captured=null;
KNQ.save();
const paths=Object.keys(captured||{});
chk('save() gửi được '+paths.length+' path', paths.length>0);
const overlap=[];
paths.forEach(a=>paths.forEach(b=>{ if(a!==b&&b.indexOf(a+'/')===0) overlap.push(a+' ⊃ '+b); }));
chk('không có path cha chứa path con (Firebase sẽ ném lỗi)', overlap.length===0, overlap.slice(0,3).join(' , '));
const kz='go/'+ZERO;
chk('dòng đã tick Xong lưu st="done"',
    (captured[kz+'/st']||(captured[kz]&&captured[kz].st))==='done');
const ko='go/'+X2;
const vo=captured[ko+'/st']||(captured[ko]&&captured[ko].st);
chk('dòng chưa tick vẫn lưu st="open" → còn tải về để nhắc khai HQ',
    vo===undefined||vo==='open', String(vo));
chk('có ghi cả node gi/ lẫn go/', paths.some(p=>p.indexOf('gi/')===0) && paths.some(p=>p.indexOf('go/')===0));
chk('bảng FEED OL1 lưu ở node use/', paths.some(p=>p.indexOf('use/')===0));
captured=null; KNQ.save();
chk('Lưu lần 2 (không đổi gì) không ghi lại Firebase', captured===null,
    captured?('vẫn ghi '+Object.keys(captured).length+' path'):'');

/* ---------- 7. xoá chuyến kéo theo get out ---------- */
console.log('\n[7] XOÁ CHUYẾN KÉO THEO CÁC DÒNG GET OUT');
const n0=KNQ.childrenOf(GLOBE).length;
KNQ.delGi(GLOBE);
chk('xoá GET IN thì '+n0+' dòng GET OUT con cũng biến mất',
    !S.GI[GLOBE] && Object.values(S.GO).every(r=>r.giId!==GLOBE));

/* ---------- 7b. BẢNG BATCH KHÔNG LỌC THEO THÁNG ---------- */
console.log('\n[7b] HÀNG VÀO KHO TỪ THÁNG TRƯỚC VẪN NẰM TRONG BỘ TRỪ LÙI');
const NEW=gi('C3',{});
chk('Get In mới KHÔNG tự điền sẵn ngày', S.GI[NEW].date==='', '"'+S.GI[NEW].date+'"');
KNQ.setGi(NEW,'vessel','BERGE NANTONG');
KNQ.setGi(NEW,'date','2026-06-29');            /* thao tác từng làm mất dòng */
chk('đổi ngày sang 29/06 (kỳ khác) — dòng VẪN CÒN',
    KNQ.visibleGi('C3').some(g=>g._id===NEW), 'kỳ = '+S.month());
chk('chuyến tháng 7 chưa tick ✔ Xong vẫn nằm trong bảng',
    KNQ.visibleGi('C3').some(g=>g._id===BERGE));
const NEXT=gi('C3',{ vessel:'TÀU THÁNG 9', date:'2026-09-05' });
chk('chuyến của tháng sau cũng hiện — bảng là sổ theo dõi, không phải bộ lọc',
    KNQ.visibleGi('C3').some(g=>g._id===NEXT));
KNQ.delGi(NEXT); KNQ.delGi(NEW);
KNQ.recalc();
chk('batch chỉ rời bảng khi tick ✔ Xong (st=done, lần sau không tải về)',
    (KNQ.toggleDone('go',ZERO,{checked:true}),KNQ.recalc(),S.GO[ZERO].st==='done'));

/* ---------- 7c. KỲ TRỪ LÙI + 📌 CHỐT KỲ ---------- */
console.log('\n[7c] KỲ TRỪ LÙI · TỒN ĐẦU KỲ · 📌 CHỐT KỲ');
/* X2 ra kho 21/07, khai tồn 5 000 000 kg; OL1 kỳ 8 dùng 2 074 824 kg */
chk('batch ra kho từ THÁNG 7 vẫn được trừ bằng OL1 của KỲ THÁNG 8',
    K(S.GO[X2].remainKg)===4097505, String(K(S.GO[X2].remainKg)));
chk('chưa chốt kỳ nào → tồn đầu kỳ = đúng số người dùng khai',
    K(S.GO[X2].baseKg)===5000000 && S.GO[X2]._opFrom==='khai', String(K(S.GO[X2].baseKg)));

/* --- lùi về kỳ 7 để diễn lại đúng vòng đời: dùng dở kỳ 7 → chốt → sang kỳ 8 --- */
S.setMonth('2026-07');
KNQ.setUse('2026-07-18','x','100');             /* 18/07: chỉ X1 (ra kho 14/07) đủ điều kiện */
KNQ.recalc();
chk('batch chỉ nhận trừ TỪ NGÀY RA KHO của chính nó — 18/07 chưa đụng X2 (ra kho 21/07)',
    K(S.GO[X1].remainKg)===1072329 && K(S.GO[X2].remainKg)===5000000,
    K(S.GO[X1].remainKg)+' / '+K(S.GO[X2].remainKg));
KNQ.setUse('2026-07-25','x','200');            /* tổng kỳ 7 = 300 000 kg */
KNQ.recalc();
chk('kỳ 7 chỉ trừ ngày của kỳ 7 — X1 còn 872 329 kg',
    K(S.GO[X1].remainKg)===872329, String(K(S.GO[X1].remainKg)));
chk('OL1 của kỳ 8 KHÔNG bị trừ vào kỳ 7 (không lấn kỳ)',
    K(S.GO[X2].remainKg)===5000000, String(K(S.GO[X2].remainKg)));
const doneBefore=Object.values(S.GO).filter(r=>r.hqDone).length;
KNQ.closeMonth();                               /* 📌 chốt kỳ 7 → mở kỳ 8 */
chk('chốt xong, kỳ hiện tại nhảy sang 2026-08', S.month()==='2026-08', S.month());
KNQ.recalc();
chk('tồn đầu kỳ 8 của X1 = thực còn cuối kỳ 7 (872 329)',
    K(S.GO[X1].baseKg)===872329 && S.GO[X1]._opFrom==='' , String(K(S.GO[X1].baseKg)));
chk('X2 mang sang nguyên 5 000 000 kg', K(S.GO[X2].baseKg)===5000000, String(K(S.GO[X2].baseKg)));
chk('kỳ 8 trừ tiếp trên tồn MANG SANG: X1 hết, X2 còn 3 797 505 kg',
    K(S.GO[X1].remainKg)===0 && K(S.GO[X2].remainKg)===3797505,
    K(S.GO[X1].remainKg)+' / '+K(S.GO[X2].remainKg));
chk('đã dùng trong kỳ 8 của X2 = 1 202 495 kg (không cộng dồn kỳ 7)',
    K(S.GO[X2].usedKg)===1202495, String(K(S.GO[X2].usedKg)));
chk('batch đã tick ✔ Xong KHÔNG được mang tồn sang kỳ mới',
    doneBefore>0 && !(S.GO[ZERO].op && S.GO[ZERO].op['2026-08']!=null));
chk('batch ra kho TRONG kỳ 8 (X4) không nhận op, vẫn lấy số khai',
    !(S.GO[X4].op && S.GO[X4].op['2026-08']!=null) && K(S.GO[X4].baseKg)===5000000);
chk('quay lại kỳ 7 thì số của kỳ 7 KHÔNG đổi — lịch sử được giữ',
    (S.setMonth('2026-07'),KNQ.recalc(),K(S.GO[X1].remainKg)===872329), String(K(S.GO[X1].remainKg)));
S.setMonth('2026-08'); KNQ.recalc();
chk('op lưu dạng map lồng theo kỳ, key không chứa dấu /',
    S.GO[X1].op && S.GO[X1].op['2026-08']!=null && Object.keys(S.GO[X1].op).every(k=>k.indexOf('/')<0),
    JSON.stringify(S.GO[X1].op));

/* ---------- 8. TỔNG P+X GÕ TAY · P = TỔNG − X · TẠM TÍNH 2.000 T ---------- */
console.log('\n[8] TỔNG P+X GÕ TAY · P TỰ TÍNH · NGÀY TRỐNG TẠM TÍNH 2.000 TẤN');
const DEF=S.DEF_TOT_KG, uOf=S.useOf, tOf=S.totOf;
chk('mức tạm tính = 2.000 tấn/ngày', DEF===2000000, String(DEF));
KNQ.setUse('2026-08-06','t','1900');            /* Tấn */
KNQ.setUse('2026-08-06','x','552.997');
chk('gõ TỔNG 1 900 T → lưu 1 900 000 kg', S.USE['2026-08-06'].t===1900000, String(S.USE['2026-08-06'].t));
chk('P tự tính = TỔNG − X = 1 347 003 kg', uOf('2026-08-06','P','act')===1347003,
    String(uOf('2026-08-06','P','act')));
chk('X vẫn đúng số đã gõ', uOf('2026-08-06','X','act')===552997, String(uOf('2026-08-06','X','act')));
KNQ.setUse('2026-08-07','x','654.896');          /* có X, CHƯA gõ TỔNG */
chk('ngày chưa gõ TỔNG → tạm tính 2.000 T, P = 2 000 000 − 654 896',
    tOf(S.USE['2026-08-07'])===null && uOf('2026-08-07','P','act')===1345104,
    String(uOf('2026-08-07','P','act')));
chk('ngày KHÔNG có dòng trong bảng thì không tạm tính gì cả',
    uOf('2026-09-30','P','act')===0 && uOf('2026-09-30','X','act')===0);
KNQ.setUse('2026-08-06','x','2500');             /* X > TỔNG */
chk('X lớn hơn TỔNG → P về 0, không âm', uOf('2026-08-06','P','act')===0,
    String(uOf('2026-08-06','P','act')));
KNQ.setUse('2026-08-06','x','552.997');
/* dữ liệu cũ (schema {p,x}) vẫn đọc được */
S.USE['2026-07-20']={ p:1000000, x:400000, xp:'', note:'' };
chk('dữ liệu cũ chỉ có P và X → quy về TỔNG = 1 400 000 kg',
    tOf(S.USE['2026-07-20'])===1400000, String(tOf(S.USE['2026-07-20'])));
chk('… và P đọc lại đúng 1 000 000 kg', uOf('2026-07-20','P','act')===1000000,
    String(uOf('2026-07-20','P','act')));
delete S.USE['2026-07-20'];

/* ---------- 8b. 📋 DÁN NHIỀU DÒNG TỪ EXCEL ---------- */
console.log('\n[8b] 📋 DÁN CẢ CỘT TỪ EXCEL (Ctrl+V) VÀO Ô ĐẦU TIÊN');
const evOf=txt=>({ clipboardData:{ getData:()=>txt }, preventDefault(){} });
KNQ.usePaste(evOf('1800\t500\n1850\t520\n1900\t540'),'2026-08-21','t');
chk('dán 2 cột vào ô TỔNG → điền cả TỔNG lẫn X, xuôi 3 ngày',
    S.USE['2026-08-21'].t===1800000 && S.USE['2026-08-21'].x===500000 &&
    S.USE['2026-08-23'].t===1900000 && S.USE['2026-08-23'].x===540000,
    JSON.stringify([S.USE['2026-08-21'],S.USE['2026-08-23']]));
chk('ngày chưa có trong bảng được tạo luôn khi dán', !!S.USE['2026-08-22']);
KNQ.usePaste(evOf('600\n610\n620'),'2026-08-21','x');
chk('dán 1 cột vào ô X chỉ đụng cột X, TỔNG giữ nguyên',
    S.USE['2026-08-21'].x===600000 && S.USE['2026-08-21'].t===1800000,
    JSON.stringify(S.USE['2026-08-21']));
chk('số dán tay được đánh dấu nguồn "gõ tay" (import không đè)', S.USE['2026-08-21'].xs==='m');
KNQ.usePaste(evOf('700\n710\n720\n730\n740\n750\n760\n770\n780\n790\n800\n810'),'2026-08-30','x');
chk('dán tràn sang tháng sau thì DỪNG, không ghi bậy sang tháng 9',
    S.USE['2026-08-31'].x===710000 && !(S.USE['2026-09-01']||{}).x,
    String(S.USE['2026-08-31'].x)+' / 01-09: '+String((S.USE['2026-09-01']||{}).x));
['2026-08-21','2026-08-22','2026-08-23','2026-08-30','2026-08-31'].forEach(d=>KNQ.delUseRow(d));

/* ---------- 9. 📥 IMPORT FILE C3 USAGE (KH) — ACTUAL rồi PLAN ---------- */
console.log('\n[9] 📥 IMPORT — LẤY ACTUAL TỚI NGÀY THIẾU SỐ RỒI CHUYỂN SANG PLAN');
/* AOA đúng bố cục sheet "일자별 C3사용량 (예상 및 실적)":
   không có cột ngày đầy đủ, chỉ có cột 월 (tháng) và 일자 (ngày 1..31);
   cột 7 = plan (계획으로 추정), cột 9 = actual (실적 기준). */
const HEAD=['월 Month','일자 Date','Code',
  '7월 말 재고 July end stock (MT)','8월 통관 수량 Declared qty in Aug (MT)',
  '수출용 PP 생산계획 Ex.PP Production plan (MT)',
  '관세유예 C3사용량 C3 EXP Usage qty (생산 계획으로 추정) (Estimated base on production plan) (MT)',
  '수출용 PP 생산 실적 Actual Ex.PP Production qty (MT)',
  '관세유예 C3사용량 Actual C3 EXP Usage qty (생산 실적 기준) (Base on actual production) (MT)',
  '8월 재고 Aug end stock (MT)'];
const PLAN={1:364.137,2:363.612,3:826.427,4:693.736,5:116.262,6:440.128,7:830.795,8:830.902,
  9:709.215,10:420.701,11:709.131,12:965.96,13:949.114,14:655.616,15:249.888,16:655.566,
  17:1325.294,18:1379.688,19:1416.316,20:299.557,21:787.359,22:794.777,23:1166.014,24:1551.004,
  25:1695.558,26:1166.901,27:485.016,28:181.01,29:453.13,30:589.537,31:589.537};
const ACT={1:537.413,2:0,3:364.499,4:697.652,5:475.26,6:552.997,7:654.896,8:298.649,
  9:438.874,10:704.488,11:670.413,12:1280.999,
  14:999};                       /* BẪY: ngày 13 trống nhưng 14 có số → vẫn phải lấy PLAN */
const AOA2=[['일자별 C3사용량 (8월 예상 및 실적)'],HEAD];
for(let d=1;d<=31;d++) AOA2.push([8,d,String(800+d),null,null,400,PLAN[d],null,
  (ACT[d]===undefined?null:ACT[d]),13496.188]);
AOA2.push(['Total',null,null,null,14000,22925,23661.888,6027,6676.14,13496.188]);
global.XLSX={ read:()=>({SheetNames:['일자별 C3사용량 (예상 및 실적)','8월 예상 BOM'],
    Sheets:{'일자별 C3사용량 (예상 및 실적)':{},'8월 예상 BOM':{}}}),
  utils:{ sheet_to_json:()=>AOA2 } };
global.FileReader=function(){ this.readAsArrayBuffer=()=>this.onload({target:{result:new Uint8Array(1)}}); };
S.setMonth('2026-08');
KNQ.fileChosen({ files:[{ name:'2. C3 usage for export production.xlsx' }] });
const imp=S.imp();
chk('đọc được file, dựng khay chọn cột', !!imp && imp.body.length===32, imp?String(imp.body.length):'—');
chk('tự chọn sheet C3 사용량, bỏ qua sheet BOM',
    imp.sheet==='일자별 C3사용량 (예상 및 실적)', imp.sheet);
chk('file không có cột ngày đầy đủ → nhận ra cột NGÀY 1–31 (cột 2)',
    imp.dCol===-1 && imp.dayCol===1, 'dCol='+imp.dCol+' · dayCol='+imp.dayCol);
chk('đọc "8월" ở tiêu đề → áp vào tháng 2026-08', imp.month==='2026-08', imp.month);
chk('đoán ĐÚNG cột ACTUAL = 9 (실적 기준), không nhầm sang cột PP',
    imp.aCol===8, 'cột '+(imp.aCol+1)+' — '+(imp.head[imp.aCol]||'').slice(0,30));
chk('đoán ĐÚNG cột PLAN = 7 (계획으로 추정), không nhầm cột tồn kho / tổng',
    imp.pCol===6, 'cột '+(imp.pCol+1)+' — '+(imp.head[imp.pCol]||'').slice(0,30));
chk('mặc định đơn vị Tấn', imp.unit==='T');
const pre=S.impRows();
chk('xem trước: 12 ngày actual, 19 ngày plan (ngày 13 trở đi)',
    pre.filter(o=>o.src==='a').length===12 && pre.filter(o=>o.src==='p').length===19,
    pre.filter(o=>o.src==='a').length+' / '+pre.filter(o=>o.src==='p').length);
chk('dòng Total không có ngày → bị bỏ, không đè lên ngày nào', pre.length===31, String(pre.length));
KNQ.impApply();
chk('ngày 12/08 lấy ACTUAL 1 280.999 T → 1 280 999 kg',
    K(S.USE['2026-08-12'].x)===1280999 && S.USE['2026-08-12'].xs==='a', String(S.USE['2026-08-12'].x));
const p02=pre.filter(o=>o.d==='2026-08-02')[0]||{};
chk('ngày 02/08 actual = 0 vẫn là SỐ THẬT, không coi là trống → không chuyển sang plan',
    p02.v===0 && p02.src==='a', JSON.stringify(p02));
chk('ngày 13/08 thiếu actual → chuyển sang PLAN 949.114 T',
    K(S.USE['2026-08-13'].x)===949114 && S.USE['2026-08-13'].xs==='p', String(S.USE['2026-08-13'].x));
chk('ngày 14/08 CÓ actual nhưng đã qua mốc → vẫn lấy PLAN 655.616 T (không quay lại)',
    K(S.USE['2026-08-14'].x)===655616 && S.USE['2026-08-14'].xs==='p', String(S.USE['2026-08-14'].x));
chk('ngày 17/08 plan 1 325.294 T → 1 325 294 kg', K(S.USE['2026-08-17'].x)===1325294,
    String(S.USE['2026-08-17'].x));
chk('cột Plan X vẫn giữ plan gốc của MỌI ngày, kể cả ngày lấy actual',
    K(S.USE['2026-08-01'].xp)===364137 && K(S.USE['2026-08-17'].xp)===1325294,
    String(S.USE['2026-08-01'].xp));
chk('KHÔNG đè số X đã gõ tay (01/08 giữ 537 413 kg dù file ghi khác)',
    K(S.USE['2026-08-01'].x)===537413 && S.USE['2026-08-01'].xs==='m', String(S.USE['2026-08-01'].x));
chk('P của ngày lấy plan tự tính theo TỔNG tạm tính 2.000 T',
    uOf('2026-08-17','P','act')===2000000-1325294, String(uOf('2026-08-17','P','act')));
chk('khay chọn cột đóng lại sau khi áp dụng', S.imp()===null);
/* bật "đè cả số đã gõ tay" */
KNQ.fileChosen({ files:[{ name:'2. C3 usage.xlsx' }] });
KNQ.impSet('ow',true);
KNQ.impApply();
chk('tick "đè cả số đã gõ tay" → 01/08 nhận số của file',
    K(S.USE['2026-08-01'].x)===537413 && S.USE['2026-08-01'].xs==='a', String(S.USE['2026-08-01'].xs));
chk('… và 02/08 ghi đúng số 0 của cột actual',
    S.USE['2026-08-02'].x===0 && S.USE['2026-08-02'].xs==='a', String(S.USE['2026-08-02'].x));
KNQ.recalc();
chk('sau import, trừ lùi FIFO vẫn chạy — batch X có số dùng trong kỳ',
    S.GO[X2].usedKg>0, String(K(S.GO[X2].usedKg)));


/* ---------- 10. v4.96 — MÃ BATCH LÀ NGÀY · HQ QTY · VASSCM · DONE ---------- */
console.log('\n[10] v4.96 — NGÀY TỪ MÃ BATCH · HQ APPROVED QTY · VASSCM · ✔ DONE');
chk('mã batch → ngày: 260714X001 ⇒ 2026-07-14', S.batchDate('260714X001')==='2026-07-14',
    S.batchDate('260714X001'));
chk('mã batch → ngày: 260806D001 ⇒ 2026-08-06', S.batchDate('260806D001')==='2026-08-06');
chk('mã batch sai định dạng → rỗng, không đoán bừa',
    S.batchDate('ABC')==='' && S.batchDate('261399P001')==='' && S.batchDate('')==='' ,
    '"'+S.batchDate('261399P001')+'"');
chk('ngày trong mã batch THẮNG ô date cũ (P4: date 10/08, batch 31/07)',
    S.GO[P4].date==='2026-08-10' && S.outDate(S.GO[P4])==='2026-07-31', S.outDate(S.GO[P4]));
chk('dòng chưa có mã batch → lui về ô date cũ',
    S.outDate({batch:'',date:'2026-05-05'})==='2026-05-05');

/* HQ Approved Qty — gõ tay, CHỈ THAM CHIẾU, không đụng vào tính toán */
const beforeHq=K(S.GO[X2].remainKg);
KNQ.setGo(X2,'hqQty','9999999');
KNQ.recalc();
chk('HQ Approved Qty lưu được', K(S.GO[X2].hqQty)===9999999, String(S.GO[X2].hqQty));
chk('HQ Approved Qty KHÔNG ảnh hưởng trừ lùi', K(S.GO[X2].remainKg)===beforeHq,
    K(S.GO[X2].remainKg)+' vs '+beforeHq);
KNQ.setGo(X2,'hqQty','abc');
chk('HQ Approved Qty gõ chữ → RỖNG chứ không thành 0', S.GO[X2].hqQty==='');

/* VASSCM — tick tự điền ngày, bỏ tick thì xoá ngày */
const VT=go(BERGE,{ decl:'777', batch:'260714X009', sapKg:'1000' });
KNQ.toggleVas(VT,{checked:true});
chk('tick VASSCM tự điền ngày hôm nay', S.GO[VT].vas===true && !!S.GO[VT].vasDate,
    String(S.GO[VT].vasDate));
KNQ.toggleVas(VT,{checked:false});
chk('bỏ tick VASSCM → xoá ngày', S.GO[VT].vas===false && S.GO[VT].vasDate==='');

/* trạng thái: bơm hết mà CHƯA khai VASSCM = 'zero'; khai rồi = 'ready' */
const VZ=go(BERGE,{ decl:'778', batch:'260714X008', sapKg:'0' });
KNQ.recalc();
chk('bơm hết + chưa khai VASSCM → trạng thái "VASSCM pending"', S.GO[VZ].st==='zero', S.GO[VZ].st);
KNQ.toggleVas(VZ,{checked:true}); KNQ.recalc();
chk('bơm hết + đã khai VASSCM → trạng thái "ready to close"', S.GO[VZ].st==='ready', S.GO[VZ].st);

/* ✔ DONE ép Actual Left về 0 dù FIFO còn dư.
   Dùng 1 batch D (không bị FIFO của OL1 đụng tới) để số còn lại ổn định. */
const VD=go(BERGE,{ decl:'779', batch:'260714D007', sapKg:'3000000' });
KNQ.recalc();
const stillLeft=K(S.GO[VD].remainKg);
chk('trước khi tick Done batch vẫn còn hàng', stillLeft===3000000, String(stillLeft));
KNQ.toggleVas(VD,{checked:true});
KNQ.toggleDone('go',VD,{checked:true});
KNQ.recalc();
chk('✔ Done (đã bơm xong + đã khai VASSCM) ⇒ Actual Left = 0',
    K(S.GO[VD].remainKg)===0 && S.GO[VD].st==='done', String(K(S.GO[VD].remainKg)));
chk('✔ Done ⇒ đã dùng = trọn tồn đầu kỳ, % = 100',
    K(S.GO[VD].usedKg)===K(S.GO[VD].baseKg) && S.GO[VD].pct===1, String(S.GO[VD].pct));
KNQ.toggleDone('go',VD,{checked:false});
KNQ.recalc();
chk('bỏ tick Done ⇒ Actual Left quay lại số cũ', K(S.GO[VD].remainKg)===stillLeft,
    String(K(S.GO[VD].remainKg)));


/* ---------- 11. v4.99 — KNQ CHỐT SỐ THEO NGÀY HÔM QUA (D-1) ---------- */
console.log('\n[11] v4.99 — NGÀY DỮ LIỆU = HÔM QUA · ĐỐI CHIẾU SAP');
const _dd=new Date();
const TD=_dd.getFullYear()+'-'+String(_dd.getMonth()+1).padStart(2,'0')+'-'+String(_dd.getDate()).padStart(2,'0');
const YD=(function(){ const t=Date.parse(TD+'T00:00:00Z')-86400000, x=new Date(t);
  return x.getUTCFullYear()+'-'+String(x.getUTCMonth()+1).padStart(2,'0')+'-'+String(x.getUTCDate()).padStart(2,'0'); })();
chk('_asOf() = hôm qua, KHÔNG phải hôm nay', S.asOf()===YD && S.asOf()!==TD, S.asOf());

/* Dựng kỳ riêng của THÁNG HIỆN TẠI để kiểm mốc D-1 mà không đụng dữ liệu trên */
(function(){
  const M=TD.slice(0,7);
  /* dùng Mat C4: hàng đợi (C4 × P) không có batch nào khác nên batch này
     nhận trọn lượng P hằng ngày, thay đổi phản ánh 1-1 vào "đã bơm" */
  const V=gi('C4',{ no:'D1', vessel:'D-1 CHECK', decl:'d1c' });
  /* mã batch dùng được từ mùng 1 tháng này · tồn CỰC LỚN để không bao giờ cạn */
  const code=M.slice(2,4)+M.slice(5,7)+'01P900';
  const B=go(V,{ decl:'d1x', batch:code, sapKg:'999999999' });
  KNQ._state.setMonth(M);
  KNQ.setUse(YD,'t','1000'); KNQ.setUse(YD,'x','0');   /* hôm qua: P = 1 000 T */
  KNQ.setUse(TD,'t','1000'); KNQ.setUse(TD,'x','0');   /* hôm nay: P = 1 000 T */
  KNQ.recalc();
  const u0=K(S.GO[B].usedKg);
  chk('batch nhận trừ lùi và chưa cạn', u0>0 && K(S.GO[B].remainKg)>0, u0+' kg');

  /* HÔM NAY: đổi số thế nào cũng KHÔNG được đụng vào "đã bơm" */
  KNQ.setUse(TD,'t','9999');
  KNQ.recalc();
  chk('tăng vọt TỔNG P+X của HÔM NAY ⇒ "đã bơm" KHÔNG đổi (hôm nay đang bơm dở)',
      K(S.GO[B].usedKg)===u0, u0+' → '+K(S.GO[B].usedKg));
  KNQ.delUseRow(TD); KNQ.recalc();
  chk('xoá hẳn dòng OL1 của HÔM NAY ⇒ vẫn KHÔNG đổi',
      K(S.GO[B].usedKg)===u0, u0+' → '+K(S.GO[B].usedKg));

  /* HÔM QUA: đổi 1 000 → 2 000 T thì "đã bơm" phải tăng đúng 1 000 000 kg */
  KNQ.setUse(YD,'t','2000'); KNQ.recalc();
  chk('đổi TỔNG P+X của HÔM QUA +1 000 T ⇒ "đã bơm" tăng đúng 1 000 000 kg',
      K(S.GO[B].usedKg)===u0+1000000, u0+' → '+K(S.GO[B].usedKg));
  KNQ.setUse(YD,'t','1000'); KNQ.recalc();

  /* ── ĐỐI CHIẾU SAP — ⭐ v4.103: CHỈ D/E ──────────────────────
     SAP khai lô P/X MỖI THÁNG MỘT LẦN nên End Stock của SAP đứng yên cả kỳ,
     còn Actual left KNQ trừ lùi hằng ngày theo FEED OL1 ⇒ lệch là ĐƯƠNG
     NHIÊN, không được báo lỗi. Chỉ D/E (SAP cập nhật theo ngày) mới đối chiếu. */
  S.GO[B].sapEnd=K(S.GO[B].remainKg)-250000;      /* lô P, lệch hẳn 250 T */
  KNQ.recalc();
  chk('⭐ lô P lệch SAP vẫn KHÔNG bị coi là sai (SAP khai P/X 1 tháng/lần)',
      S.GO[B].sapOk===null && S.GO[B].sapDiff===null,
      JSON.stringify([S.GO[B].sapOk,S.GO[B].sapDiff]));
  /* lô D cùng chuyến — đây mới là chỗ được phép đối chiếu */
  const BD=go(V,{ decl:'d1d', batch:M.slice(2,4)+M.slice(5,7)+'01D900', sapKg:'4000000' });
  S.GO[BD].sapT=3000000; S.GO[BD].sapEnd=3000000;
  KNQ.recalc();
  chk('lô D: Actual left lấy thẳng số SAP ⇒ khớp, sapOk = true (✓ SAP)',
      S.GO[BD].sapOk===true && S.GO[BD].sapDiff===0 && K(S.GO[BD].remainKg)===3000000,
      JSON.stringify([S.GO[BD].sapOk,S.GO[BD].sapDiff,K(S.GO[BD].remainKg)]));
  S.GO[BD].sapEnd=3000000-250000;
  KNQ.recalc();
  chk('lô D lệch SAP ⇒ sapOk = false, sapDiff = +250 000 (chưa quét SAP mới)',
      S.GO[BD].sapOk===false && S.GO[BD].sapDiff===250000, String(S.GO[BD].sapDiff));
  chk('batch đã tick ✔ Done thì KHÔNG đối chiếu SAP nữa',
      (KNQ.toggleVas(BD,{checked:true}), KNQ.toggleDone('go',BD,{checked:true}), KNQ.recalc(),
       S.GO[BD].sapOk===null));
  KNQ.toggleDone('go',BD,{checked:false}); KNQ.delGo(BD);

  /* ── TỔNG FEED OL1 (v4.103) ─────────────────────────────────
     Tổng THỰC chỉ được đếm tới D-1; ngày hôm nay là số dở dang. */
  KNQ.setUse(YD,'t','1000'); KNQ.setUse(YD,'x','300');
  KNQ.setUse(TD,'t','9999'); KNQ.setUse(TD,'x','999');
  const sAct=S.ol1Sum(YD,YD,'act');
  chk('_ol1Sum() cộng đúng TOTAL / P / X của một ngày',
      K(sAct.t)===1000000 && K(sAct.x)===300000 && K(sAct.p)===700000,
      JSON.stringify([K(sAct.t),K(sAct.p),K(sAct.x)]));
  chk('tổng THỰC tới D-1 KHÔNG ăn số của hôm nay',
      K(S.ol1Sum(M+'-01',YD,'act').t)<K(S.ol1Sum(M+'-01',TD,'act').t));
  KNQ.delUseRow(TD);
  KNQ.delGi(V); KNQ._state.setMonth('2026-08');
})();

/* ---------- 12. v4.102 — ĐỒNG BỘ NHIỀU MÁY · KỲ QUÁ HẠN · ĐÓNG KỲ THEO SAP ---------- */
console.log('\n[12] v4.102 — KỲ MỞ / KỲ ĐÃ ĐÓNG · TRỪ LÙI VƯỢT THÁNG · 📌 CLOSE PERIOD LẤY SỐ SAP');
(function(){
  const OLD_MONTH=S.month(), OLD_P=S.rawPeriod(), OLD_CL=S.closed();

  /* ── 12.1 CỬA SỔ ĐỒNG BỘ: kỳ cũ nằm ngoài, không tải về ── */
  S.setPeriod('2026-08'); S.setClosed({});
  chk('cửa sổ đồng bộ bắt đầu trước đầu kỳ mở 31 ngày (kỳ cũ KHÔNG tải về)',
      S.liveFrom()==='2026-07-01', S.liveFrom());
  chk('kỳ MỞ và kỳ SAU nó là dữ liệu sống, kỳ TRƯỚC là lưu trữ',
      S.isOpenP('2026-08') && S.isOpenP('2026-09') && !S.isOpenP('2026-07'));

  /* ── 12.2 QUÁ HẠN ĐÓNG KỲ ⇒ TRỪ LÙI KHÔNG DỪNG Ở CUỐI THÁNG ──
     Dựng riêng 1 hàng đợi (C4 × X) để không ai tranh FIFO. Kỳ 7 là kỳ ĐANG
     MỞ (chưa ai bấm 📌), hôm nay đã là tháng 8 ⇒ OL1 của 05/08 vẫn phải
     được trừ vào batch của kỳ 7. */
  const V=gi('C4',{ no:'OD', vessel:'OVERDUE TEST', decl:'od' });
  /* tồn cực lớn để không bao giờ cạn — đo bằng ĐỘ CHÊNH, không phải số tuyệt
     đối, vì bảng FEED OL1 của cả file test dùng chung */
  const B=go(V,{ decl:'od1', batch:'260701X900', sapKg:'999999999' });
  KNQ.setUse('2026-08-05','t','0'); KNQ.setUse('2026-08-05','x','1000');   /* SANG THÁNG 8 */

  S.setPeriod('2026-08'); S.setMonth('2026-07'); KNQ.recalc();
  const uClosed=K(S.GO[B].usedKg);        /* kỳ 7 ĐÃ ĐÓNG ⇒ kẹp ở 31/07 */
  S.setPeriod('2026-07'); S.setMonth('2026-07'); KNQ.recalc();
  const uOpen=K(S.GO[B].usedKg);          /* kỳ 7 vẫn MỞ ⇒ chạy tới hôm qua */
  chk('kỳ 7 đang MỞ dù đã sang tháng 8 ⇒ _overdue() = true', S.overdue()===true);
  chk('QUÁ HẠN: số KHÔNG đứng lại — vẫn trừ tiếp bằng OL1 của tháng 8',
      uOpen>uClosed, uClosed+' → '+uOpen);
  /* gõ thêm 1 500 T vào một ngày CỦA THÁNG 8 ⇒ kỳ MỞ phải tăng đúng ngần ấy */
  KNQ.setUse('2026-08-05','x','2500');
  S.setPeriod('2026-07'); KNQ.recalc();
  chk('thêm 1 500 T vào ngày 05/08 ⇒ kỳ 7 (đang mở) trừ thêm ĐÚNG 1 500 000 kg',
      K(S.GO[B].usedKg)===uOpen+1500000, uOpen+' → '+K(S.GO[B].usedKg));
  S.setPeriod('2026-08'); KNQ.recalc();
  chk('cùng số đó, kỳ 7 ĐÃ ĐÓNG thì lịch sử ĐỨNG YÊN ở 31/07',
      K(S.GO[B].usedKg)===uClosed, uClosed+' → '+K(S.GO[B].usedKg));

  /* ── 12.3 _sapAt(): End Stock tại MỘT NGÀY BẤT KỲ ──
     Fixture SAP chỉ có dòng ngày 17/08/2026. */
  chk('_sapAt() trước ngày SAP có số ⇒ không đọc được (đúng cảnh SAP còn trễ)',
      S.sapAt('2026-07-31').ok===false, S.sapAt('2026-07-31').err);
  const sA=S.sapAt('2026-08-31');
  chk('_sapAt() sau đó ⇒ lấy dòng gần nhất ≤ ngày yêu cầu', sA.ok===true && sA.asOf==='2026-08-17', sA.asOf);
  chk('_sapAt() tra được End Stock theo mã batch',
      sA.map.C3['260714X001'] && sA.map.C3['260714X001'].endKg===1172329,
      JSON.stringify(sA.map.C3['260714X001']||null));

  /* ── 12.4 📌 CLOSE PERIOD ĐÈ SỐ SAP VÀO TỒN ĐẦU KỲ MỚI ──
     Batch mang đúng mã có trong SAP; app tự tính ra một số KHÁC ⇒ sau khi
     đóng kỳ, tồn đầu kỳ 9 phải bằng SỐ SAP chứ không phải số app. */
  const V2=gi('C3',{ no:'CS', vessel:'CLOSE SAP', decl:'cs' });
  const B2=go(V2,{ decl:'cs1', batch:'260714X001', sapKg:'9000000' });
  S.setPeriod('2026-08'); S.setMonth('2026-08'); S.setClosed({});
  KNQ.recalc();
  const appLeft=K(S.GO[B2].remainKg);
  chk('trước khi đóng kỳ, app tính ra số KHÁC số SAP (mới có cái để so)',
      appLeft!==1172329, appLeft+' vs SAP 1 172 329');
  captured=null;
  KNQ.closeMonth();
  chk('đóng kỳ 8 ⇒ kỳ hiện tại nhảy sang 2026-09', S.curPeriod()==='2026-09', S.curPeriod());
  chk('⭐ tồn đầu kỳ 9 LẤY SỐ SAP (đè số app tính)',
      S.GO[B2].op && K(S.GO[B2].op['2026-09'])===1172329,
      JSON.stringify(S.GO[B2].op||null));
  chk('lô KHÔNG có số SAP ở ngày đó thì lui về số app tự tính',
      S.GO[B].op && K(S.GO[B].op['2026-09'])===K(S.GO[B].remainKg),
      K(S.GO[B].op?S.GO[B].op['2026-09']:0)+' / '+K(S.GO[B].remainKg));

  /* ── 12.5 ĐÓNG KỲ ĐẨY THẲNG LÊN FIREBASE (mọi máy nhảy kỳ theo) ── */
  const paths=Object.keys(captured||{});
  chk('đóng kỳ ĐẨY NGAY, không chờ 💾 Save', paths.length>0, paths.length+' path');
  chk('ghi con trỏ kỳ meta/curPeriod = 2026-09', captured['meta/curPeriod']==='2026-09',
      String(captured['meta/curPeriod']));
  chk('ghi sổ kỳ đã đóng meta/closed/2026-08',
      !!captured['meta/closed/2026-08'] && captured['meta/closed/2026-08'].sapAsOf==='2026-08-17',
      JSON.stringify(captured['meta/closed/2026-08']||null));
  const AR=captured['periods/2026-08'];
  chk('ghi snapshot LƯU TRỮ periods/2026-08 (kỳ cũ ở lại Firebase)', !!AR);
  chk('snapshot ghi rõ số nào từ SAP, số nào từ app',
      AR && AR.rows[B2] && AR.rows[B2].src==='sap' && K(AR.rows[B2].carry)===1172329 &&
      AR.rows[B] && AR.rows[B].src==='app',
      AR?JSON.stringify({b2:AR.rows[B2].src,b:AR.rows[B].src}):'—');
  chk('snapshot kèm luôn FEED OL1 của kỳ đó', AR && AR.use && AR.use['2026-08-05']!=null);
  chk('không còn key nào chứa dấu / trong payload lồng',
      AR && Object.keys(AR.rows).every(k=>k.indexOf('/')<0) &&
      Object.keys(AR.use).every(k=>k.indexOf('/')<0));

  /* ── 12.6 KỲ ĐÃ ĐÓNG KHÔNG ĐÓNG LẠI ĐƯỢC ── */
  S.setMonth('2026-08'); captured=null;
  KNQ.closeMonth();
  chk('kỳ đã đóng thì bấm 📌 lần nữa KHÔNG ghi gì thêm', captured===null);

  /* ── 12.7 SỐ TỪ XA KHÔNG ĐƯỢC ĐÈ Ô ĐANG GÕ DỞ ── */
  S.setMonth('2026-09'); S.setPeriod('2026-09');
  const R=go(V2,{ decl:'mg1', batch:'260901X777' });
  const D=S.dirty();
  /* dòng MỚI TINH chưa đẩy lần nào ⇒ giữ nguyên vẹn bản của mình */
  chk('dòng mới tinh chưa đẩy: bản ghi từ máy khác KHÔNG đè lên được',
      S.dirtyOver('go/'+R,{ decl:'của máy khác' }).decl==='mg1',
      S.dirtyOver('go/'+R,{ decl:'của máy khác' }).decl);
  /* giờ giả lập: dòng ĐÃ nằm trên Firebase, chỉ còn MỘT ô đang gõ dở */
  delete D['go/'+R];
  D['go/'+R+'/sapKg']='123';
  const merged=S.dirtyOver('go/'+R,{ sapKg:999999, note:'từ máy khác' });
  chk('bản ghi từ máy khác về: ô đang gõ dở GIỮ số của mình…',
      String(merged.sapKg)==='123', String(merged.sapKg));
  chk('…nhưng field khác vẫn nhận số mới từ máy kia', merged.note==='từ máy khác',
      String(merged.note));

  KNQ.delGi(V); KNQ.delGi(V2);
  KNQ.delUseRow('2026-08-05');
  S.setPeriod(OLD_P); S.setClosed(OLD_CL); S.setMonth(OLD_MONTH);
})();

/* ---------- 13. v4.104 — VÒNG ĐỜI LÔ P/X · D/E GIẢM DẦN · SẮP CẠN ---------- */
console.log('\n[13] v4.104 — ⭐ LÔ P/X CHỈ ĐÓNG KHI 📌 CLOSE PERIOD THẤY SAP = 0');
(function(){
  const OLD_M=S.month(), OLD_P=S.rawPeriod(), OLD_CL=S.closed();
  S.setPeriod('2026-08'); S.setMonth('2026-08'); S.setClosed({});

  /* Hàng đợi riêng (C4 × X) để không ai tranh FIFO */
  const V=gi('C4',{ no:'PX', vessel:'PX LIFECYCLE', decl:'pxl' });
  const B=go(V,{ decl:'px1', batch:'260801X910', sapKg:'999999999' });
  KNQ.recalc();
  const left0=K(S.GO[B].remainKg);
  chk('lô X đang chạy, còn hàng', left0>0, left0+' kg');

  /* ── 13.1 TICK ✔ DONE KHÔNG ĐƯỢC PHÉP ĐÓNG LÔ P/X ────────────
     Đây chính là lỗi làm mất 13,7 triệu kg: bản cũ ép Actual left = 0,
     đặt st='done' rồi lần sau không tải về dù SAP vẫn còn hàng. */
  KNQ.toggleDone('go',B,{checked:true});
  KNQ.recalc();
  chk('⭐ tick ✔ Done trên lô X KHÔNG ép Actual left về 0',
      K(S.GO[B].remainKg)===left0, left0+' → '+K(S.GO[B].remainKg));
  chk('⭐ …và KHÔNG đặt trạng thái done (lô vẫn nằm trong bộ trừ lùi)',
      S.GO[B].st!=='done' && !S.GO[B].hqDone, S.GO[B].st+' / hqDone='+S.GO[B].hqDone);
  captured=null; KNQ.save();
  chk('⭐ …và KHÔNG ghi st="done" lên Firebase (lần sau vẫn tải về)',
      !captured || (captured['go/'+B+'/st']!=='done' &&
        !(captured['go/'+B] && captured['go/'+B].st==='done')),
      JSON.stringify(captured&&(captured['go/'+B+'/st']||(captured['go/'+B]||{}).st)));

  /* lô D thì tick ✔ Done vẫn đóng bình thường — SAP cập nhật theo ngày */
  const BD=go(V,{ decl:'pxd', batch:'260801D910', sapKg:'500000' });
  S.GO[BD].sapT=500000;
  KNQ.recalc();
  KNQ.toggleDone('go',BD,{checked:true});
  KNQ.recalc();
  chk('lô D: tick ✔ Done vẫn đóng được như cũ (SAP cập nhật theo ngày)',
      S.GO[BD].st==='done' && K(S.GO[BD].remainKg)===0);
  KNQ.toggleDone('go',BD,{checked:false});

  /* ── 13.2 CHỈ 📌 CLOSE PERIOD MỚI ĐÓNG ĐƯỢC LÔ P/X ─────────── */
  /* ⚠ mã 260714X001 nằm trong SAP dưới Mat C3 — phải khai trên chuyến C3,
     khai nhầm sang C4 thì _sapAt() tra không ra (SAP khớp cả Mat lẫn mã). */
  const V3=gi('C3',{ no:'PX3', vessel:'PX SAP CODE', decl:'pxs' });
  const B0=go(V3,{ decl:'px0', batch:'260714X001', sapKg:'3000000' });  /* SAP end = 1 172 329 */
  KNQ.recalc();
  captured=null;
  KNQ.closeMonth();                       /* SAP fixture: 260714X001 end = 1 172 329 > 0 */
  chk('đóng kỳ: lô P/X còn hàng trong SAP ⇒ MANG SANG, không đóng',
      !S.GO[B0].pxDone && S.GO[B0].op && K(S.GO[B0].op['2026-09'])===1172329,
      JSON.stringify(S.GO[B0].op||null));
  chk('lô KHÔNG có số SAP ⇒ mang sang bằng số app tự tính',
      !S.GO[B].pxDone && S.GO[B].op && S.GO[B].op['2026-09']!=null,
      JSON.stringify(S.GO[B].op||null));

  /* giờ cho SAP về 0 → đóng kỳ phải ĐÓNG hẳn lô đó */
  S.setPeriod('2026-09'); S.setMonth('2026-09'); S.setClosed({});
  const B9=go(V,{ decl:'px9', batch:'260901X911', sapKg:'0' });
  KNQ.recalc();
  captured=null;
  KNQ.closeMonth();
  chk('⭐ đóng kỳ: lô P/X ở mức 0 ⇒ ĐÓNG HẲN (pxDone + st=done)',
      S.GO[B9].pxDone===true &&
      (captured['go/'+B9+'/st']==='done' || (captured['go/'+B9]||{}).st==='done'),
      JSON.stringify([S.GO[B9].pxDone, captured['go/'+B9+'/st']]));
  KNQ.recalc();
  chk('lô đã đóng kỳ thì rời hẳn bộ trừ lùi', S.GO[B9].st==='done');
  chk('…và mở lại được đúng cách: bỏ cờ pxDone ⇒ quay lại bộ dữ liệu',
      (S.GO[B9].pxDone=false, KNQ.recalc(), S.GO[B9].st!=='done'), S.GO[B9].st);

  /* ── 13.3 D/E GIẢM DẦN QUA CÁC LẦN SYNC ⇒ ĐANG BƠM RA ─────── */
  const BH=go(V,{ decl:'pxh', batch:'260901D911', sapKg:'3000000' });
  S.GO[BH].sapT=2400000;
  S.GO[BH].sapH={ '2026-08-16':3000000, '2026-08-17':2700000, '2026-08-18':2400000 };
  KNQ.recalc();
  chk('⭐ D/E: SAP tụt giữa hai lần quét ⇒ nhận diện ĐANG BƠM RA',
      S.GO[BH].head===true && K(S.GO[BH].drop)===300000 && S.GO[BH].dropFrom==='2026-08-17',
      JSON.stringify([S.GO[BH].head,K(S.GO[BH].drop),S.GO[BH].dropFrom]));
  chk('…kèm tốc độ rút kg/ngày', K(S.GO[BH].dropRate)===300000, String(K(S.GO[BH].dropRate)));
  S.GO[BH].sapH={ '2026-08-17':2400000, '2026-08-18':2400000 };
  KNQ.recalc();
  chk('SAP đứng yên ⇒ KHÔNG coi là đang bơm', !S.GO[BH].drop);

  /* ── 13.4 CẢNH BÁO SẮP CẠN DƯỚI 200 TẤN ────────────────────── */
  S.GO[BH].sapT=199999; S.GO[BH].sapH=null; KNQ.recalc();
  chk('⭐ còn dưới 200 tấn ⇒ bật cờ sắp cạn', S.GO[BH].low===true, K(S.GO[BH].remainKg)+' kg');
  S.GO[BH].sapT=200001; KNQ.recalc();
  chk('trên 200 tấn ⇒ không cảnh báo', !S.GO[BH].low);
  S.GO[BH].sapT=0; KNQ.recalc();
  chk('cạn hẳn (0) thì KHÔNG phải "sắp cạn" nữa', !S.GO[BH].low);

  KNQ.delGi(V); KNQ.delGi(V3);
  S.setPeriod(OLD_P); S.setClosed(OLD_CL); S.setMonth(OLD_M);
})();

console.log('\n'+(fail?('❌ '+fail+' KIỂM TRA THẤT BẠI'):'✅ TẤT CẢ KIỂM TRA ĐỀU ĐẠT'));
process.exit(fail?1:0);
