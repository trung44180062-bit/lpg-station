/* ============================================================
 * knq.test.js — module KNQ v4.93a (get in / get out, 2 bảng C3 + C4, 20 cột)
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
console.log('\n[2] CÒN LẠI CỦA CHUYẾN — trừ dần theo thứ tự ngày xuất kho');
KNQ.recalc();
const ch=KNQ.childrenOf(MAPLE);
chk('get out sắp theo ngày xuất kho', ch.map(r=>r.date).join(',')==='2026-08-04,2026-08-04,2026-08-06,2026-08-10',
    ch.map(r=>r.date).join(','));
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

/* batch P ra kho 10/08 → chỉ nhận trừ từ 10/08 trở đi */
KNQ.setUse('2026-08-11','p','1202.287');
KNQ.setUse('2026-08-12','p','532.801');
KNQ.recalc();
chk('P trừ độc lập với X — batch P còn 14 200 000 − 1 735 088 = 12 464 912 kg',
    K(S.GO[P4].remainKg)===12464912, String(K(S.GO[P4].remainKg)));

/* ---------- 5. dự báo bằng PLAN X ---------- */
console.log('\n[5] DỰ BÁO HẾT BATCH BẰNG PLAN X ĐÃ IMPORT');
/* dùng ngày hệ thống để test không phụ thuộc lúc chạy */
const _d=new Date();
const TODAY=_d.getFullYear()+'-'+String(_d.getMonth()+1).padStart(2,'0')+'-'+String(_d.getDate()).padStart(2,'0');
const plus=(iso,k)=>{ const t=Date.parse(iso+'T00:00:00Z')+k*86400000, x=new Date(t);
  return x.getUTCFullYear()+'-'+String(x.getUTCMonth()+1).padStart(2,'0')+'-'+String(x.getUTCDate()).padStart(2,'0'); };
chk('chưa import plan X → vẫn chiếu tạm bằng bình quân 7 ngày gần nhất',
    !!S.GO[X2].eta && S.GO[X2].etaDays===10, S.GO[X2].eta+' ('+S.GO[X2].etaDays+' ngày)');
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

console.log('\n'+(fail?('❌ '+fail+' KIỂM TRA THẤT BẠI'):'✅ TẤT CẢ KIỂM TRA ĐỀU ĐẠT'));
process.exit(fail?1:0);
