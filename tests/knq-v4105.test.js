/* ============================================================
 * knq-v4105.test.js — v4.105
 *   node tests/knq-v4105.test.js      (chạy từ thư mục gốc repo)
 *
 * Ba việc mới, mỗi việc một mục:
 *   [1] ♻ MỞ KHOÁ TRẠNG THÁI — cờ đóng bền (pxDone / hqDone) nằm trên
 *       Firebase nên xoá dòng rồi khai lại KHÔNG gỡ được. Nút ♻ phải gỡ
 *       cả 3 thứ: pxDone · hqDone · st='done' → 'open', và lô quay lại
 *       bộ trừ lùi. Kỳ ĐÃ chốt sổ thì KHÔNG được đụng vào.
 *   [2] ☑ AUTO RUN-DOWN — ô SAP qty trống ⇒ tồn đầu kỳ null ⇒ lô đứng
 *       ngoài hàng đợi FIFO (đúng cảnh "xoá hết nhập lại, số không tự
 *       tính"). Bật cờ thì lấy tồn dự phòng HQ get-out → End Stock SAP
 *       → KL tờ khai, và trừ lùi theo FEED OL1 y như lô có số khai.
 *   [3] ⚖ ĐỐI CHIẾU SAP ↔ KNQ — chia đúng 3 nhóm và áp số SAP sang KNQ:
 *       P/X ghi vào SAP qty (điểm xuất phát FIFO), D/E ghi vào Actual
 *       left; lô SAP chưa khai ⇒ tạo dòng get-out mới; lô KNQ thừa CHỈ
 *       đóng dấu ghi chú, KHÔNG BAO GIỜ tự xoá.
 * ============================================================ */
const fs=require('fs'), path=require('path');
global.window=global;
global.document={ getElementById:()=>null, querySelector:()=>null };
global.toast=()=>{};
global.confirm=()=>true;
global.canWrite=()=>true;
let captured=null;
global.firebase={ database:()=>({ ref:()=>({
  update(map){ captured=map; return Promise.resolve(); },
  child(){ return { once:()=>Promise.resolve({val:()=>null}), remove:()=>Promise.resolve() }; }
}) }) };
eval(fs.readFileSync(path.join(__dirname,'..','js','features','knq.js'),'utf8'));

const S=KNQ._state;
let fail=0;
function chk(n,c,x){ console.log((c?'  ✅ ':'  ❌ ')+n+(x?('  '+x):'')); if(!c) fail++; }
const K=v=>Math.round(Number(v||0));

/* SAP giả — mốc 17/08/2026, đủ 4 loại lô + 1 mã SAP CÓ mà KNQ chưa khai */
const SAP=[
  { mat:'C3', batch:'260801P001', date:'2026-08-17', end: 900000 },
  { mat:'C3', batch:'260801X001', date:'2026-08-17', end: 400000 },
  { mat:'C3', batch:'260801D001', date:'2026-08-17', end: 250000 },
  { mat:'C3', batch:'260801E001', date:'2026-08-17', end:  50000 },
  { mat:'C3', batch:'260815X009', date:'2026-08-17', end: 777000 }   /* KNQ chưa khai */
];
global.SP={ batch1100:()=>({ rows:SAP, legacy:0, dates:['2026-08-17'] }),
            dates1100:()=>['2026-08-17'] };

KNQ.init();
S.setPeriod('2026-08'); S.setMonth('2026-08');

function gi(mat,f){ KNQ.addGi(mat); const k=Object.keys(S.GI), id=k[k.length-1];
  Object.keys(f).forEach(x=>KNQ.setGi(id,x,f[x])); return id; }
function go(g,f){ KNQ.addGo(g); const k=Object.keys(S.GO), id=k[k.length-1];
  Object.keys(f).forEach(x=>KNQ.setGo(id,x,f[x])); return id; }

const V=gi('C3',{ vessel:'GLOBE POLARIS', decl:'108502630131', qtyKg:'20000000' });
/* P có số khai · X KHÔNG có số khai (chỉ có HQ approved) · D · E */
const P1=go(V,{ decl:'D-P1', batch:'260801P001', sapKg:'3000000', hqQty:'3000000' });
const X1=go(V,{ decl:'D-X1', batch:'260801X001', hqQty:'4750' });          /* sapKg TRỐNG */
const D1=go(V,{ decl:'D-D1', batch:'260801D001', sapKg:'250000' });
const E1=go(V,{ decl:'D-E1', batch:'260801E001', hqQty:'280' });           /* sapKg TRỐNG */
const Z1=go(V,{ decl:'D-Z1', batch:'260801X777', hqQty:'1000' });          /* SAP KHÔNG có */

/* FEED OL1 — kỳ 2026-08, mỗi ngày TỔNG 1.000 T, X 100 T */
for(let d=1; d<=17; d++){
  const iso='2026-08-'+String(d).padStart(2,'0');
  S.USE[iso]={ t:1000000, x:100000 };
}

/* ─────────────────────────────────────────────────────────── */
console.log('\n[1] ♻ MỞ KHOÁ TRẠNG THÁI LÔ');
/* ép lô P1 vào đúng cảnh người dùng gặp: cờ đóng bền còn nguyên */
S.GO[P1].pxDone=true;
KNQ.recalc();
chk('lô P/X mang cờ pxDone ⇒ trạng thái done, ĐỨNG NGOÀI bộ trừ lùi',
    S.GO[P1].st==='done' && S.closedRow(S.GO[P1]));
chk('…và Actual left không được trừ lùi nữa', K(S.GO[P1].usedKg)===0, K(S.GO[P1].usedKg)+' kg used');

KNQ.reopen(P1);
KNQ.recalc();
chk('⭐ ♻ Re-open gỡ cờ pxDone', S.GO[P1].pxDone===false);
chk('⭐ …và cờ st đẩy lên Firebase quay về "open" (lần sau vẫn tải về)',
    S.GO[P1]._svSt==='open', JSON.stringify(S.dirty()['go/'+P1+'/st']));
chk('⭐ …lô quay lại bộ trừ lùi, có số Used in period',
    S.GO[P1].st!=='done' && S.GO[P1].usedKg>0, K(S.GO[P1].usedKg)+' kg used');

/* D/E đóng bằng tay cũng mở lại được */
S.GO[D1].hqDone=true; S.GO[D1].hqDate='2026-08-10';
KNQ.recalc();
chk('lô D tick ✔ Done ⇒ done', S.GO[D1].st==='done');
KNQ.reopen(D1);
KNQ.recalc();
chk('⭐ ♻ Re-open gỡ cả hqDone lẫn hqDate của lô D/E',
    S.GO[D1].hqDone===false && S.GO[D1].hqDate==='');

/* KỲ ĐÃ CHỐT SỔ thì KHÔNG được đụng */
S.GO[P1].pxDone=true;
S.setClosed({ '2026-08':{ at:'x', by:'y' } });
KNQ.reopen(P1);
chk('⭐ lô thuộc kỳ ĐÃ ĐÓNG ⇒ ♻ TỪ CHỐI mở, cờ giữ nguyên', S.GO[P1].pxDone===true);
S.setClosed({});
KNQ.reopen(P1);
chk('kỳ mở lại bình thường thì ♻ chạy', S.GO[P1].pxDone===false);

/* mở hàng loạt */
S.GO[P1].pxDone=true; S.GO[D1].hqDone=true;
KNQ.reopenAll();
chk('⭐ ♻ Re-open hàng loạt gỡ mọi cờ đóng cùng lúc',
    S.GO[P1].pxDone===false && S.GO[D1].hqDone===false);

/* ─────────────────────────────────────────────────────────── */
console.log('\n[2] ☑ AUTO RUN-DOWN — LÔ THIẾU SAP QTY VẪN TRỪ LÙI');
S.setRdAllRaw(false);
KNQ.recalc();
chk('TẮT: lô X không có SAP qty ⇒ tồn đầu kỳ null, không có số',
    S.GO[X1].baseKg==null && S.GO[X1].usedKg==null, String(S.GO[X1].baseKg));
chk('TẮT: lô E cũng vậy', S.GO[E1].baseKg==null);
chk('lô P CÓ số khai thì vẫn chạy như cũ', S.GO[P1].baseKg===3000000);

S.setRdAllRaw(true);
KNQ.recalc();
chk('⭐ BẬT: lô X lấy tồn đầu kỳ dự phòng = HQ approved get-out',
    S.GO[X1].baseKg===4750 && S.GO[X1]._opFrom==='hq', K(S.GO[X1].baseKg)+' kg');
chk('⭐ …và ĐƯỢC TRỪ LÙI theo FEED OL1 (X 100 T/ngày ⇒ cạn ngay ngày đầu)',
    S.GO[X1].usedKg>0, 'used '+K(S.GO[X1].usedKg)+' · left '+K(S.GO[X1].remainKg));
chk('⭐ …cờ _rdBase bật để giao diện nói rõ "assumed"', S.GO[X1]._rdBase===true);
chk('⭐ lô E (D/E) cũng có tồn đầu kỳ dự phòng', S.GO[E1].baseKg===280);
chk('số khai THẬT luôn thắng số dự phòng', S.GO[P1].baseKg===3000000 && !S.GO[P1]._rdBase);
chk('lô ĐÃ ĐÓNG thì KHÔNG được suy tồn đầu kỳ',
    (S.GO[Z1].pxDone=true, KNQ.recalc(), S.GO[Z1]._rdBase===false));
S.GO[Z1].pxDone=false;

/* thứ tự dự phòng: HQ → End Stock SAP → KL tờ khai */
chk('thứ tự dự phòng ① HQ approved get-out', S.rdFallback({hqQty:11,sapEnd:22,qtyKg:33}).src==='hq');
chk('thứ tự dự phòng ② End Stock SAP',       S.rdFallback({sapEnd:22,qtyKg:33}).src==='sap');
chk('thứ tự dự phòng ③ KL tờ khai',          S.rdFallback({qtyKg:33}).src==='decl');
chk('không có gì để suy ⇒ null',             S.rdFallback({})===null);

/* ─────────────────────────────────────────────────────────── */
console.log('\n[3] ⚖ ĐỐI CHIẾU SAP ↔ KNQ');
KNQ.pullSap(true);                       /* nạp SAPB, không mở modal */
KNQ.recalc();
const c=S.buildCmp();
chk('quét được mốc SAP 17/08/2026', c.asOf==='2026-08-17', c.asOf);
const has=(g,b)=>c[g].some(o=>o.batch===b);
chk('⭐ nhóm ①  SAP CÓ · KNQ CHƯA KHAI  bắt đúng 260815X009',
    has('miss','260815X009'), c.miss.map(o=>o.batch).join(','));
chk('⭐ nhóm ②  KNQ CÓ · SAP KHÔNG CÓ   bắt đúng 260801X777',
    has('extra','260801X777'), c.extra.map(o=>o.batch).join(','));
chk('⭐ nhóm ③  LỆCH SỐ  so P/X ở ô SAP qty',
    c.diff.some(o=>o.batch==='260801P001' && o.lab==='SAP qty'),
    JSON.stringify(c.diff.filter(o=>o.batch==='260801P001').map(o=>[o.knq,o.sap,o.diff])));
chk('…và so D/E ở ô Actual left',
    c.diff.every(o=>(o.letter==='D'||o.letter==='E') ? o.lab==='Actual left' : true));
chk('lô đã đóng KHÔNG nằm trong bảng đối chiếu',
    (S.GO[E1].hqDone=true, KNQ.recalc(),
     !S.buildCmp().diff.concat(S.buildCmp().extra).some(o=>o.batch==='260801E001')));
S.GO[E1].hqDone=false;

/* ÁP SỐ */
const nGoTruoc=Object.keys(S.GO).length;
const c2=S.buildCmp();
KNQ.openCmp(); /* nạp _cmp; document.getElementById trả null nên chỉ set state */
const cur=S.cmp();
chk('mở bảng ⇒ dòng LỆCH và dòng SAP-chưa-khai tick sẵn…',
    cur.diff.every(o=>o.sel) && cur.miss.every(o=>o.sel));
chk('…còn nhóm "KNQ thừa" thì KHÔNG tick sẵn (chỉ đóng dấu ghi chú, phải cố ý)',
    cur.extra.every(o=>!o.sel));
KNQ.cmpAll('extra',true);
chk('☑ Select all tick được cả nhóm', S.cmp().extra.every(o=>o.sel));
const pBefore=S.GO[P1].sapKg;
KNQ.cmpApply();
KNQ.recalc();
chk('⭐ P/X: số SAP ghi vào SAP qty (điểm xuất phát FIFO)',
    S.GO[P1].sapKg===900000, pBefore+' → '+S.GO[P1].sapKg);
chk('⭐ D/E: số SAP ghi vào Actual left (sapT)', S.GO[D1].sapT===250000, String(S.GO[D1].sapT));
chk('⭐ lô SAP chưa khai ⇒ TẠO dòng get-out mới',
    Object.values(S.GO).some(r=>r.batch==='260815X009'),
    (Object.keys(S.GO).length-nGoTruoc)+' dòng mới');
const nw=Object.values(S.GO).find(r=>r.batch==='260815X009');
chk('…dòng mới lấy End Stock SAP làm SAP qty', nw && nw.sapKg===777000, String(nw&&nw.sapKg));
chk('…và được gắn vào chuyến giữ chỗ "— from SAP —"',
    nw && S.GI[nw.giId] && S.GI[nw.giId].vessel==='— from SAP —');
chk('⭐ lô KNQ thừa KHÔNG BỊ XOÁ, chỉ đóng dấu ghi chú',
    !!S.GO[Z1] && /not in SAP/.test(S.GO[Z1].note||''), (S.GO[Z1]||{}).note);
KNQ.recalc();
const c3=S.buildCmp();
chk('áp xong: không còn dòng nào lệch', c3.diff.length===0, c3.diff.map(o=>o.batch).join(','));
chk('…và không còn lô SAP nào chưa khai', c3.miss.length===0);

console.log(fail?('\n❌ '+fail+' KIỂM TRA HỎNG'):'\n✅ TẤT CẢ KIỂM TRA ĐỀU ĐẠT');
process.exit(fail?1:0);
