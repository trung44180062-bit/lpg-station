/* ============================================================
 * bond.test.js — KHO NGOẠI QUAN GỘP VÀO TAB SAP (v4.106)
 *   node tests/bond.test.js        (chạy từ thư mục gốc repo)
 *
 * Chạy trên DỮ LIỆU THẬT: tests/bond-realdb.json = bản xuất Firebase
 * 20/08/2026, gồm nguyên node sap_ (272 dòng, 11/08→18/08) và knq_bonded.
 *
 * Kiểm:
 *  [1] ẢNH CHỤP SAP  — chọn đúng ngày ≤ D-1, thiếu thì lùi + bật cờ behind
 *  [2] ⭐ SAP KHÔNG ĐỘNG VÀO P/X SUỐT THÁNG — tiền đề của cả cách tính
 *  [3] TRỪ LÙI FIFO  — P/X từ End Stock, D/E lấy thẳng, lô chỉ rút từ ngày
 *      trong chính mã batch trở đi
 *  [4] CỜ MÀU        — gone / zero / new / low
 *  [5] THÔNG TIN USER— ghi từng ô, VASSCM tự điền ngày, xoá dòng
 *  [6] 💾 LƯU KỲ     — ảnh chụp, mở lại chỉ đọc, xoá
 *  [7] 🔁 CHUYỂN DỮ LIỆU từ tab KNQ cũ theo mã batch
 *  [8] KỲ KHÁC THÁNG — tháng 9 không đụng dữ liệu tháng 8
 * ============================================================ */
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..');
global.window=global;
global.document={ getElementById:()=>null, querySelector:()=>null };
global.toast=()=>{}; global.confirm=()=>true; global.canWrite=()=>true;
global.CURRENT_USER={ name:'Kiểm thử' };

const DB=JSON.parse(fs.readFileSync(path.join(__dirname,'bond-realdb.json'),'utf8'));

/* ── Firebase giả: giữ nguyên hình dạng ref().ref(path) mà bond.js dùng ── */
let PUSHED=null;
const FBDATA={ knq_info:{}, knq_period:{}, 'knq_bonded/use':DB.knq_bonded.use||{} };
function node(p){
  return {
    once:()=>Promise.resolve({ val:()=>FBDATA[p]!==undefined?FBDATA[p]:null }),
    on:()=>{}, off:()=>{}
  };
}
global.firebase={ database:()=>({
  ref:(p)=>{
    if(p===undefined) return { update(map){ PUSHED=map;
      Object.keys(map).forEach(k=>{
        const seg=k.split('/');
        if(seg[0]==='knq_info'||seg[0]==='knq_period'){
          const bag=FBDATA[seg[0]];
          if(seg.length===2){ if(map[k]===null) delete bag[seg[1]]; else bag[seg[1]]=map[k]; }
          else{ bag[seg[1]]=bag[seg[1]]||{}; bag[seg[1]][seg[2]]=map[k]; }
        }
      });
      return Promise.resolve(); } };
    return node(p);
  }
}) };

/* ── SP giả: đúng API bond.js gọi, dựng từ node sap_ thật ── */
const SAPROWS=Object.values(DB.sap_);
global.SP={
  batch1100(from,to){
    const rows=[];
    SAPROWS.forEach(r=>{
      if(String(r.sloc||'')!=='1100' || !r.bcode) return;
      const d=String(r.date||''); if(!d) return;
      if(from&&d<from) return; if(to&&d>to) return;
      rows.push({ mat:r.mat, batch:String(r.bcode).toUpperCase(), date:d,
        init:+r.init||0, gr:+r.gr||0, gi:+r.gi||0, trs:+r.trs||0, end:+r.end||0 });
    });
    return { rows, legacy:0, dates:[] };
  },
  dates1100(){
    const s={}; SAPROWS.forEach(r=>{ if(String(r.sloc||'')==='1100'&&r.date) s[r.date]=1; });
    return Object.keys(s).sort();
  }
};

eval(fs.readFileSync(path.join(ROOT,'js','features','bond.js'),'utf8'));
const S=BOND._state;
let fail=0;
function chk(n,c,x){ console.log((c?'  ✅ ':'  ❌ ')+n+(x?('  '+x):'')); if(!c) fail++; }
const K=v=>Math.round(Number(v||0));
const fmt=v=>Math.round(Number(v||0)).toLocaleString('en-US');

/* nạp OL1 + đánh dấu đã load để không đụng Firebase giả nữa */
Object.keys(DB.knq_bonded.use||{}).forEach(d=>{ S.USE[d]=DB.knq_bonded.use[d]; });
S.markLoaded();

/* ⚠ D-1 phụ thuộc ngày chạy test. Dữ liệu SAP dừng ở 18/08/2026 nên mọi
   kiểm tra dưới đây ghim kỳ 2026-08; _wantDay() của kỳ đã qua = 31/08. */
S.setMonth('2026-08');

/* ⭐ GHIM LUÔN "HÔM NAY" = 24/08/2026.
   Ảnh chụp Firebase đứng yên, nhưng lượt CHIẾU TỚI TƯƠNG LAI đo từ đồng hồ
   thật ⇒ càng để lâu, lô càng bị chiếu cạn thêm. Sáng 26/08 hai mục "còn N
   ngày" và "lùi xa ra vì X=0" đỏ lên dù mã không đổi một chữ: lô 260812X001
   dự kiến hết ĐÚNG hôm đó (etaDays=0) và tuột khỏi cửa sổ HORIZON.
   Không ghim thì bộ test đo cả thời gian trôi, không còn nói về mã nữa. */
S.pinToday('2026-08-24');

/* ---------- [1] ẢNH CHỤP SAP ---------- */
console.log('\n[1] CHỌN NGÀY SAP');
let rows=BOND.recalc();
chk('lấy ngày SAP mới nhất ≤ mốc của kỳ', S.sapDay()==='2026-08-18', S.sapDay());
chk('dựng đúng số lô của ngày đó', rows.length>0, rows.length+' lô');
chk('mọi dòng đều mang ngày SAP đang dùng',
    rows.filter(r=>r.inSap).every(r=>r.date==='2026-08-18'));

S.setMonth('2026-07');
BOND.recalc();
chk('kỳ 07 chưa có số SAP nào ≤ 31/07 ⇒ lùi về ngày sớm nhất + bật cờ behind',
    S.sapDay()==='2026-08-11' && S.behind()===true, S.sapDay()+' behind='+S.behind());
S.setMonth('2026-08');

/* ---------- [2] TIỀN ĐỀ: SAP KHÔNG ĐỘNG VÀO P/X ---------- */
console.log('\n[2] ⭐ TIỀN ĐỀ — SAP KHÔNG ĐỘNG VÀO LÔ P/X SUỐT THÁNG');
const hist={};
SAPROWS.forEach(r=>{ if(String(r.sloc)!=='1100'||!r.bcode) return;
  const k=r.mat+'|'+r.bcode; (hist[k]=hist[k]||{})[r.date]=r.end; });
let pxMove=0, deMove=0;
Object.keys(hist).forEach(k=>{
  const L=k.split('|')[1][6], v=new Set(Object.values(hist[k]));
  if(v.size>1){ if(L==='P'||L==='X') pxMove++; else deMove++; }
});
chk('⭐ KHÔNG lô P/X nào đổi số qua 8 ngày (nền của cách tính)', pxMove===0, pxMove+' lô đổi');
chk('…trong khi D/E thì đổi hằng ngày', deMove>0, deMove+' lô D/E đổi');

/* ---------- [3] TRỪ LÙI ---------- */
console.log('\n[3] TRỪ LÙI FIFO THEO FEED OL1');
rows=BOND.recalc();
const by=c=>rows.find(r=>r.bcode===c&&r.mat==='C3');
const byM=(c,m)=>rows.find(r=>r.bcode===c&&r.mat===m);

chk('D/E lấy THẲNG End Stock của SAP, không trừ lùi',
    byM('260806D001','C4').left===byM('260806D001','C4').end,
    fmt(byM('260806D001','C4').left)+' kg');
chk('…và không có số "đã dùng" (SAP tự lo)', byM('260806D001','C4').used==null);

chk('⭐ lô X vào sớm nhất bị rút cạn trước (FIFO)',
    by('260714X001').left===0 && by('260721X001').left===0,
    '260714X001 '+fmt(by('260714X001').left)+' · 260721X001 '+fmt(by('260721X001').left));
chk('⭐ lô X đang bơm dở còn số lẻ',
    by('260812X001').left>0 && by('260812X001').left<by('260812X001').end,
    fmt(by('260812X001').left)+' / '+fmt(by('260812X001').end));
chk('⭐ lô X khai 18/08 CHƯA bị rút (ngày trong mã batch = 18/08)',
    by('260818X001').left===by('260818X001').end && by('260818X001').used===0,
    fmt(by('260818X001').left)+' kg');

chk('⭐ lô P vào sớm bị rút cạn', by('260721P001').left===0 && by('260729P001').left===0);
chk('⭐ lô P đang bơm dở còn số lẻ',
    by('260731P001').left>0 && by('260731P001').left<by('260731P001').end,
    fmt(by('260731P001').left)+' kg');
chk('lô P khai 05/08 và 12/08 chưa tới lượt',
    by('260805P001').used===0 && by('260812P001').used===0);

const sumX=rows.filter(r=>r.letter==='X'&&r.mat==='C3');
const usedX=sumX.reduce((a,r)=>a+K(r.used),0);
const o=S.ol1Sum();
chk('⭐ TỔNG đã dùng của X khớp đúng Σ FEED OL1 cột X',
    Math.abs(usedX-Math.round(o.x))<=1, fmt(usedX)+' vs OL1 '+fmt(o.x));
const usedP=rows.filter(r=>r.letter==='P'&&r.mat==='C3').reduce((a,r)=>a+K(r.used),0);
chk('⭐ TỔNG đã dùng của P khớp đúng Σ FEED OL1 cột P',
    Math.abs(usedP-Math.round(o.p))<=1, fmt(usedP)+' vs OL1 '+fmt(o.p));
chk('Σ OL1 đếm đúng số ngày trong kỳ tới mốc SAP', o.n===18, o.n+' ngày · '+o.def+' ngày tạm tính');

/* ---------- [4] TRẠNG THÁI LÔ ---------- */
console.log('\n[4] TÌNH TRẠNG TỪNG LÔ');
chk('lô hết mà CHƯA tích VASSCM ⇒ "emptied" (còn việc phải làm, không làm mờ)',
    by('260714X001').st==='emptied', by('260714X001').st);
S.INFO['C3_260714X001']={ vas:true };
rows=BOND.recalc();
chk('⭐ tích VASSCM xong ⇒ chuyển sang "zero" (làm mờ đi, hết nhắc)',
    by('260714X001').st==='zero', by('260714X001').st);
delete S.INFO['C3_260714X001'];
rows=BOND.recalc();
chk('lô luôn bằng 0, chưa từng có hàng ⇒ "zero" chứ KHÔNG đòi VASSCM',
    byM('260721D001','C3').st==='zero', byM('260721D001','C3').st);

console.log('  — đang bơm —');
chk('⭐ D/E: cột Trs ÂM ⇒ ĐANG BƠM (bằng chứng trực tiếp từ SAP)',
    byM('260806D001','C4').st==='pumping' && byM('260806D001','C4').pumping===true,
    'trs='+fmt(byM('260806D001','C4').trs));
chk('⭐ P/X: ĐÚNG MỘT lô đang bơm cho mỗi (Mat × loại lô) — đầu hàng đợi FIFO',
    rows.filter(r=>r.letter==='X'&&r.mat==='C3'&&r.pumping).length===1 &&
    rows.filter(r=>r.letter==='P'&&r.mat==='C3'&&r.pumping).length===1);
chk('…và đúng là lô còn hàng sớm nhất trong hàng đợi',
    rows.find(r=>r.letter==='X'&&r.mat==='C3'&&r.pumping).bcode==='260812X001',
    rows.find(r=>r.letter==='X'&&r.mat==='C3'&&r.pumping).bcode);
chk('lô chưa tới lượt mang trạng thái "wait"',
    by('260818X002').st==='wait', by('260818X002').st);

/* ⭐ DẤU HIỆU THỨ HAI CHO D/E — End Stock < HQ approved.
   260812D001 (C3) có End 800.000, GI và Trs đều bằng 0 ⇒ theo dấu hiệu cũ
   thì nằm im ở "wait". Nhưng nếu hải quan duyệt 1.000.000 thì 200.000 kg
   đã ra khỏi lô rồi — lô đang chảy dở, chỉ là SAP không ghi bút toán đúng
   ngày này. Đây chính là ngày giữa của một lô bơm dài. */
const HQK='C3_260812D001';
chk('trước khi khai HQ approved thì lô vẫn là "wait"',
    byM('260812D001','C3').st==='wait', byM('260812D001','C3').st);
S.INFO[HQK]={ hqQty:1000000 };
rows=BOND.recalc();
chk('⭐ D/E: End Stock < HQ approved ⇒ ĐANG BƠM dù GI và Trs đều bằng 0',
    byM('260812D001','C3').st==='pumping' && byM('260812D001','C3').pumpWhy==='hq',
    'end='+fmt(byM('260812D001','C3').end)+' < hq=1,000,000');
S.INFO[HQK]={ hqQty:800000 };
rows=BOND.recalc();
chk('…End Stock BẰNG ĐÚNG HQ approved ⇒ lô còn nguyên, KHÔNG phải đang bơm',
    byM('260812D001','C3').st==='wait', byM('260812D001','C3').st);
S.INFO[HQK]={ hqQty:600000 };
rows=BOND.recalc();
chk('…HQ approved NHỎ HƠN End (gõ nhầm / lô nhập thêm) ⇒ không suy diễn gì',
    byM('260812D001','C3').st==='wait', byM('260812D001','C3').st);
S.INFO[HQK]={ hqQty:'' };
rows=BOND.recalc();
chk('⭐ ô HQ approved TRỐNG ⇒ BỎ QUA luật này, giữ nguyên cách nhận diện cũ',
    byM('260812D001','C3').st==='wait', byM('260812D001','C3').st);
S.INFO[HQK]={ hqQty:0 };
rows=BOND.recalc();
chk('…HQ approved = 0 cũng coi như chưa khai',
    byM('260812D001','C3').st==='wait', byM('260812D001','C3').st);
delete S.INFO[HQK];

/* Lô ĐÃ HẾT thì HQ approved to cỡ nào cũng không được kéo ngược về "đang bơm" —
   hết là hết, việc còn lại là VASSCM. */
S.INFO['C3_260721D001']={ hqQty:1800000 };
rows=BOND.recalc();
chk('⭐ lô End = 0 dù HQ approved lớn vẫn KHÔNG thành "đang bơm"',
    byM('260721D001','C3').st!=='pumping', byM('260721D001','C3').st);
chk('…và KHÔNG mang số 0 đi so với HQ approved (cờ pumping cũng không bật)',
    byM('260721D001','C3').pumping===false && !byM('260721D001','C3').pumpWhy,
    'pumping='+byM('260721D001','C3').pumping);
delete S.INFO['C3_260721D001'];

/* P/X vẫn chỉ suy từ hàng đợi FIFO — SAP đứng yên cả tháng nên End Stock của
   chúng là tồn ĐẦU KỲ, đem so với HQ approved là vô nghĩa. */
S.INFO['C3_260818X002']={ hqQty:99000000 };
rows=BOND.recalc();
chk('⭐ P/X KHÔNG áp luật HQ approved — vẫn chỉ theo hàng đợi FIFO',
    by('260818X002').st==='wait', by('260818X002').st);
delete S.INFO['C3_260818X002'];
rows=BOND.recalc();

console.log('  — lô mới —');
chk('⭐ ảnh chụp ngày liền trước = 17/08 (mốc nhận ra lô mới)',
    S.prevDay()==='2026-08-17', S.prevDay());
const news=rows.filter(r=>r.isNew).map(r=>r.mat+' '+r.bcode).sort();
chk('⭐ 5 lô khai 18/08 đều là LÔ MỚI (17/08 chưa có)',
    ['260818E001','260818E002','260818X001','260818X002'].every(c=>news.some(n=>n.indexOf(c)>-1)),
    news.join(' · '));
chk('…và lô đã có từ trước KHÔNG bị đánh dấu mới', !by('260714X001').isNew);

console.log('  — SAP không còn / thiếu thông tin —');
S.INFO['C3_260714X999']={ vessel:'TÀU MA', vno:'IX' };
rows=BOND.recalc();
const ghost=rows.find(r=>r.bcode==='260714X999');
chk('⭐ lô đã khai mà SAP KHÔNG có ⇒ vẫn hiện, trạng thái "gone"',
    !!ghost && ghost.st==='gone' && ghost.inSap===false);
chk('…và không bịa ra số nào cho nó', ghost.end==null && ghost.left==null);
delete S.INFO['C3_260714X999'];
rows=BOND.recalc();
chk('lô chưa khai tàu/tờ khai ⇒ cờ noInfo (độc lập với trạng thái)',
    rows.filter(r=>r.noInfo).length>0 && rows.every(r=>r.noInfo===!r.hasInfo),
    rows.filter(r=>r.noInfo).length+' lô');
chk('lô đang bơm còn dưới 200 T ⇒ cờ low',
    rows.filter(r=>r.low).every(r=>r.left<S.LOW_KG && r.left>0.5 && r.st==='pumping'));

/* ---------- [4d] DỰ KIẾN HẾT — LƯỢT CHIẾU TỚI TƯƠNG LAI ---------- */
console.log('\n[4d] DỰ KIẾN HẾT (chiếu bằng FEED OL1 + mức tạm tính 2.000 T)');
rows=BOND.recalc();
chk('lô đã hết THẬT ⇒ eta là ngày thật, KHÔNG đánh dấu chiếu',
    by('260714X001').eta && by('260714X001').projected===false,
    by('260714X001').eta);
const hX=by('260812X001');
chk('⭐ lô X đang bơm CÓ ngày dự kiến hết', !!hX.eta && hX.projected===true, hX.eta);
chk('…và ngày đó phải SAU mốc SAP 18/08', hX.eta>'2026-08-18', hX.eta);
chk('…kèm số ngày đếm ngược', hX.etaDays!=null && hX.etaDays>0, 'còn '+hX.etaDays+' ngày');
chk('⭐ lô chưa tới lượt cũng có dự kiến, và PHẢI muộn hơn lô trước nó',
    by('260818X001').eta>hX.eta, hX.bcode+' '+hX.eta+' → 260818X001 '+by('260818X001').eta);
chk('lô P đang bơm cũng có dự kiến', !!by('260731P001').eta && by('260731P001').projected===true,
    by('260731P001').eta);
chk('lô D/E KHÔNG chiếu (số lấy thẳng từ SAP hằng ngày)',
    !byM('260806D001','C4').eta);

/* ⭐ ĐÂY LÀ CHỖ NGƯỜI DÙNG BÁO MẤT: ngày tương lai TỔNG = 0 hoặc trống thì
   phải chạy mức tạm tính, nếu không lô "không bao giờ hết". */
/* ⚠ recalc() dựng OBJECT MỚI mỗi lần — phải gán lại `rows`, đọc mảng cũ là
   nhìn nhầm số của lượt trước (đã dính lúc viết test này). */
const etaBase=hX.eta;
/* Cả THÁNG tương lai để TỔNG=0 — đúng cảnh người dùng gặp. Không có mức tạm
   tính thì P không bị trừ tiếp và lô P "không bao giờ hết". */
const futDays=Object.keys(S.USE).filter(d=>d>'2026-08-18');
const keepAll={}; futDays.forEach(d=>{ keepAll[d]=S.USE[d]; S.USE[d]={ t:0, x:0 }; });
rows=BOND.recalc();
chk('⭐ cả tháng tương lai TỔNG=0 và X=0 ⇒ lô P VẪN tính ra ngày hết (mức tạm tính 2.000 T dồn hết cho P)',
    !!by('260805P001').eta && by('260805P001').projected===true,
    by('260805P001').eta||'(trống)');
/* X=0 suốt ⇒ lô X không bị rút trong tháng, phải MUỘN hơn hẳn số gốc */
chk('…còn lô X thì lùi xa ra vì X=0 suốt tháng',
    by('260812X001').eta>etaBase, etaBase+' → '+(by('260812X001').eta||'(trống)'));
/* đẩy plan X lên 3.000 T/ngày ⇒ lô X phải hết sớm hơn hẳn */
futDays.forEach(d=>{ S.USE[d]={ t:0, x:3000000 }; });
rows=BOND.recalc();
chk('⭐ đẩy plan X lên 3.000 T/ngày ⇒ lô X hết SỚM hơn hẳn',
    by('260812X001').eta<etaBase, etaBase+' → '+by('260812X001').eta);
futDays.forEach(d=>{ S.USE[d]=keepAll[d]; });
rows=BOND.recalc();
chk('trả lại dữ liệu gốc thì eta về đúng như cũ', by('260812X001').eta===etaBase,
    by('260812X001').eta);

/* ngày ĐÃ QUA gõ 0 là số THẬT — nhà máy dừng, KHÔNG được tự nhét 2.000 vào */
const PAST='2026-08-10';
const keep2=S.USE[PAST];
const usedBefore=K(by('260731P001').used);
S.USE[PAST]={ t:0, x:0 };
rows=BOND.recalc();
chk('⭐ ngày ĐÃ QUA gõ 0 ⇒ tôn trọng số thật, "đã dùng" GIẢM đi',
    K(by('260731P001').used)<usedBefore,
    fmt(usedBefore)+' → '+fmt(by('260731P001').used));
S.USE[PAST]=keep2;
rows=BOND.recalc();
chk('…và trả lại thì "đã dùng" về đúng số cũ', K(by('260731P001').used)===usedBefore);

/* mọi lô P/X CÒN HÀNG phải có eta — không có nghĩa là lượt chiếu bị đứt */
const noEta=rows.filter(r=>r.inSap && (r.letter==='P'||r.letter==='X') &&
  r.left>0.5 && !r.eta);
chk('⭐ mọi lô P/X còn hàng đều tính ra được ngày hết',
    noEta.length===0, noEta.map(r=>r.mat+' '+r.bcode).join(', '));
const etaOrder=rows.filter(r=>r.mat==='C3'&&r.letter==='X'&&r.eta).map(r=>r.eta);
chk('⭐ ngày hết tăng dần theo thứ tự FIFO (vào trước hết trước)',
    String(etaOrder)===String([...etaOrder].sort()), etaOrder.join(' → '));

/* ---------- [4b] SẮP XẾP ---------- */
console.log('\n[4b] SẮP XẾP  C3→C4 · D→E→P→X · cũ trên mới dưới');
const MO={C3:0,C4:1}, LO={D:0,E:1,P:2,X:3};
let bad='';
for(let i=1;i<rows.length;i++){
  const a=rows[i-1], b=rows[i];
  const ka=[MO[a.mat],LO[a.letter],a.bdate||'9999',a.bcode];
  const kb=[MO[b.mat],LO[b.letter],b.bdate||'9999',b.bcode];
  if(String(ka)>String(kb)){ bad=a.mat+a.bcode+' > '+b.mat+b.bcode; break; }
}
chk('⭐ thứ tự đúng trên toàn bảng', bad==='', bad);
chk('C3 đứng trước C4', rows.findIndex(r=>r.mat==='C4')>rows.map(r=>r.mat).lastIndexOf('C3'));
const c3=rows.filter(r=>r.mat==='C3').map(r=>r.letter);
chk('trong C3: D → E → P → X', String(c3)===String([...c3].sort((x,y)=>LO[x]-LO[y])), c3.join(''));
const c3x=rows.filter(r=>r.mat==='C3'&&r.letter==='X').map(r=>r.bcode);
chk('⭐ trong loại lô X: CŨ TRÊN, MỚI DƯỚI (= thứ tự rút hàng)',
    String(c3x)===String([...c3x].sort()), c3x.join(' → '));

/* ---------- [4c] THANH LỌC ---------- */
console.log('\n[4c] THANH LỌC');
const nAll=S.all().length;
S.setFilter('','C4','',''); BOND.recalc();
chk('lọc Mat = C4', S.rows().length>0 && S.rows().every(r=>r.mat==='C4'),
    S.rows().length+'/'+nAll);
S.setFilter('','','X',''); BOND.recalc();
chk('lọc loại lô = X', S.rows().every(r=>r.letter==='X'), S.rows().length+' lô');
S.setFilter('','','','pumping'); BOND.recalc();
chk('lọc tình trạng = đang bơm', S.rows().length>0 && S.rows().every(r=>r.st==='pumping'),
    S.rows().length+' lô');
S.setFilter('','','','new'); BOND.recalc();
chk('lọc "lô mới nhập"', S.rows().length>0 && S.rows().every(r=>r.isNew), S.rows().length+' lô');
S.setFilter('260818','','',''); BOND.recalc();
chk('gõ mã batch vào ô tìm', S.rows().length>0 && S.rows().every(r=>r.bcode.indexOf('260818')>-1),
    S.rows().length+' lô');
S.setFilter('','C3','X','pumping'); BOND.recalc();
chk('các bộ lọc AND với nhau', S.rows().length===1 && S.rows()[0].bcode==='260812X001',
    S.rows().map(r=>r.bcode).join(','));
S.setFilter('','','',''); rows=BOND.recalc();
chk('xoá lọc thì về đủ', S.rows().length===nAll, nAll+' lô');
chk('⭐ thẻ thống kê luôn tính trên TOÀN BỘ lô, không theo phần đang lọc',
    S.all().length===nAll);

/* ---------- [5] THÔNG TIN NGƯỜI DÙNG ---------- */
console.log('\n[5] GHI THÔNG TIN NGƯỜI DÙNG');
BOND.setInfo('C3_260818X001','vessel','GLOBE POLARIS');
chk('ghi vào bộ nhớ', S.INFO['C3_260818X001'].vessel==='GLOBE POLARIS');
chk('đẩy ĐÚNG MỘT ô lên Firebase (không đẩy cả bảng)',
    PUSHED['knq_info/C3_260818X001/vessel']==='GLOBE POLARIS' &&
    Object.keys(PUSHED).filter(k=>!/lastBy|lastAt/.test(k)).length===1,
    Object.keys(PUSHED).join(', '));
BOND.setInfo('C3_260818X001','hqQty','4,750,000');
chk('HQ approved nhận số có dấu phẩy', S.INFO['C3_260818X001'].hqQty===4750000);
BOND.setInfo('C3_260818X001','vas',true);
chk('tick VASSCM tự điền ngày hôm nay', !!S.INFO['C3_260818X001'].vasDate);
BOND.setInfo('C3_260818X001','vas',false);
chk('bỏ tick thì xoá ngày', S.INFO['C3_260818X001'].vasDate==='');
rows=BOND.recalc();
chk('lô đã khai thông tin thì hết cờ new',
    by('260818X001').flag!=='new', by('260818X001').flag||'(không cờ)');
BOND.delRow('C3_260818X001');
chk('xoá dòng = xoá bản ghi thông tin', S.INFO['C3_260818X001']===undefined);
rows=BOND.recalc();
chk('⭐ …nhưng SAP còn mã thì dòng HIỆN LẠI ở dạng chưa khai (SAP mới là chủ)',
    !!by('260818X001') && by('260818X001').flag==='new');

/* ---------- [5b] IMPORT FEED OL1 TỪ EXCEL ---------- */
console.log('\n[5b] 📥 IMPORT X TỪ EXCEL — GHÉP ACTUAL → PLAN');
S.setMonth('2026-08');
/* bảng thô kiểu file KH: cột ngày 1..31, cột PLAN và ACTUAL riêng.
   ACTUAL chỉ có tới ngày 5 — từ ngày 6 trở đi phải tự chuyển sang PLAN. */
const AOA=[['일자별 C3사용량 (예상 및 실적) 8월'],
           ['일자','관세유예 C3사용량 (생산 계획)','관세유예 C3사용량 (실적)','생산량']];
for(let i=1;i<=31;i++) AOA.push([i, 100+i, (i<=5? (200+i) : null), 9999]);
const imp=S.prepImp(AOA,'KH.xlsx','sheet1',['sheet1']);
chk('nhận ra cột NGÀY 1–31 (file không có ngày đầy đủ)', imp.dayCol===0 && imp.dCol<0,
    'dayCol='+imp.dayCol+' dCol='+imp.dCol);
chk('⭐ chấm điểm tiêu đề ⇒ tách đúng cột PLAN và cột ACTUAL',
    imp.pCol===1 && imp.aCol===2, 'plan@'+imp.pCol+' actual@'+imp.aCol);
chk('…và KHÔNG nhầm sang cột 생산량 (sản lượng)', imp.aCol!==3 && imp.pCol!==3);
chk('⭐ đọc được tháng "8월" từ tiêu đề', imp.month==='2026-08', imp.month);
S.setImp(imp);            /* nạp vào module rồi soi danh sách ngày */
const IR=S.impRows();
chk('dựng đủ 31 ngày', IR.length===31, IR.length+' ngày');
chk('⭐ 5 ngày đầu lấy ACTUAL', IR.slice(0,5).every(o=>o.src==='a'&&o.v===o.a),
    IR.slice(0,5).map(o=>o.d.slice(8)+':'+o.src).join(' '));
chk('⭐ từ ngày 6 trở đi chuyển hẳn sang PLAN', IR.slice(5).every(o=>o.src==='p'&&o.v===o.p),
    IR.slice(5,9).map(o=>o.d.slice(8)+':'+o.src).join(' '));
chk('⭐ KHÔNG quay lại actual dù cột actual có số lẻ tẻ về sau',
    IR.filter(o=>o.src==='a').length===5);

/* gõ tay một ngày rồi import — mặc định KHÔNG được đè */
BOND.setUse('2026-08-03','x','777');
chk('gõ tay ⇒ đánh dấu nguồn "m"', S.USE['2026-08-03'].xs==='m', S.USE['2026-08-03'].xs);
const keptVal=S.USE['2026-08-03'].x;
S.setImp(imp); imp.ow=false; BOND.impApply();
chk('⭐ import KHÔNG đè lên ngày đã gõ tay',
    S.USE['2026-08-03'].x===keptVal && S.USE['2026-08-03'].xs==='m',
    fmt(S.USE['2026-08-03'].x));
chk('⭐ ngày khác nhận số ACTUAL, đổi đơn vị tấn → kg',
    S.USE['2026-08-01'].x===201000 && S.USE['2026-08-01'].xs==='a',
    fmt(S.USE['2026-08-01'].x)+' xs='+S.USE['2026-08-01'].xs);
chk('⭐ ngày sau mốc nhận số PLAN', S.USE['2026-08-10'].x===110000 && S.USE['2026-08-10'].xs==='p',
    fmt(S.USE['2026-08-10'].x)+' xs='+S.USE['2026-08-10'].xs);
chk('⭐ cột plan gốc luôn được giữ ở xp để đối chiếu',
    S.USE['2026-08-01'].xp===101000, fmt(S.USE['2026-08-01'].xp));
/* bật overwrite thì mới đè */
S.setImp(imp); imp.ow=true; BOND.impApply();
chk('tích "overwrite" thì ngày gõ tay MỚI bị đè',
    S.USE['2026-08-03'].x===203000 && S.USE['2026-08-03'].xs==='a',
    fmt(S.USE['2026-08-03'].x));

/* ngày đầy đủ + đơn vị kg */
const AOA2=[['Date','Actual C3 usage','Plan C3 usage'],
            ['2026-09-01',1000,2000],['2026-09-02',null,2500],['2026-09-03',null,2600]];
const imp2=S.prepImp(AOA2,'x.xlsx','',[]);
chk('file có NGÀY ĐẦY ĐỦ thì dùng cột ngày, không cần cột 1–31',
    imp2.dCol===0 && imp2.dayCol<0, 'dCol='+imp2.dCol);
chk('_toIso đọc được cả chuỗi ISO, dd/mm/yyyy và serial Excel',
    S.toIso('2026-08-18')==='2026-08-18' && S.toIso('18/08/2026')==='2026-08-18' &&
    S.toIso(46252)==='2026-08-18',
    S.toIso(46252));
S.setImp(imp2);
const IR2=S.impRows();
chk('⭐ ngày 1 actual, ngày 2–3 chuyển plan', IR2[0].src==='a'&&IR2[1].src==='p'&&IR2[2].src==='p');

/* ngày ĐÃ QUA còn chạy số PLAN ⇒ phải cảnh báo, vì trừ lùi đang dùng số kế hoạch */
S.USE['2026-08-10']=Object.assign({},S.USE['2026-08-10'],{xs:'p'});
const os=S.ol1Sum();
chk('⭐ đếm được ngày ĐÃ QUA còn mang cờ PLAN (chưa import actual)',
    os.plan.indexOf('2026-08-10')>-1, os.plan.length+' ngày');
S.USE['2026-08-10']=Object.assign({},S.USE['2026-08-10'],{xs:'a'});
chk('…import actual vào thì hết đếm', S.ol1Sum().plan.indexOf('2026-08-10')<0);

/* nhãn nguồn hiển thị */
chk('nhãn nguồn: Actual / Plan / Keyed đúng ba màu',
    /bond-src a/.test(S.srcTag({x:1,xs:'a'})) &&
    /bond-src p/.test(S.srcTag({x:1,xs:'p'})) &&
    /bond-src m/.test(S.srcTag({x:1,xs:'m'})));
chk('ô X trống mà có plan ⇒ hiện Plan mờ', /bond-src p dim/.test(S.srcTag({xp:5})));
chk('không có gì ⇒ gạch ngang', /bond-dim/.test(S.srcTag({})));

/* trả dữ liệu OL1 về nguyên trạng cho các mục sau */
Object.keys(DB.knq_bonded.use||{}).forEach(d=>{ S.USE[d]=DB.knq_bonded.use[d]; });
Object.keys(S.USE).forEach(d=>{ if(!(DB.knq_bonded.use||{})[d]) delete S.USE[d]; });
rows=BOND.recalc();

/* ---------- [6] LƯU KỲ ---------- */
console.log('\n[6] 💾 LƯU KỲ');
BOND.savePeriod();
chk('ghi ảnh chụp vào knq_period/<kỳ>', !!FBDATA.knq_period['2026-08']);
const snap=FBDATA.knq_period['2026-08'];
chk('ảnh chụp có đủ số lô', Object.keys(snap.rows).length===S.all().length,
    Object.keys(snap.rows).length+' lô');
chk('ảnh chụp ghi rõ mốc SAP đã dùng', snap.sapDate==='2026-08-18', snap.sapDate);
chk('ảnh chụp kèm tổng FEED OL1 của kỳ',
    Math.abs(snap.ol1.x-Math.round(o.x))<=1, fmt(snap.ol1.x));
chk('ảnh chụp giữ CẢ số trừ lùi, không phải chỉ số SAP',
    snap.rows['C3_260714X001'].left===0 && snap.rows['C3_260714X001'].end===1172329);
S.setArch({ M:'2026-08', rows:Object.keys(snap.rows).map(k=>Object.assign({key:k},snap.rows[k])), meta:snap });
chk('mở kỳ đã lưu ⇒ recalc trả thẳng ảnh chụp, KHÔNG tính lại',
    BOND.recalc().length===Object.keys(snap.rows).length);
BOND.setInfo('C3_260721P001','note','thử sửa');
chk('⭐ đang xem kỳ đã lưu thì KHÔNG sửa được',
    (S.INFO['C3_260721P001']||{}).note===undefined);
BOND.closePeriod();
chk('đóng kỳ đã lưu ⇒ quay lại số sống', S.arch()===null && BOND.recalc().length===rows.length);
chk('⭐ 💾 Lưu kỳ chụp TOÀN BỘ chứ không chỉ phần đang lọc',
    Object.keys(snap.rows).length===S.all().length);

/* ---------- [7] CHUYỂN DỮ LIỆU TỪ TAB KNQ CŨ ---------- */
console.log('\n[7] 🔁 CHUYỂN THÔNG TIN TỪ TAB KNQ CŨ');
const gi=DB.knq_bonded.gi||{}, go=DB.knq_bonded.go||{};
FBDATA['knq_bonded/gi']=gi; FBDATA['knq_bonded/go']=go;
let done=false;
/* migrate() chạy bất đồng bộ — mô phỏng lại đúng phép ghép để kiểm logic */
const mapped={};
Object.values(go).forEach(r=>{
  const b=String(r.batch||'').toUpperCase(), m=String(r.mat||'');
  if(!b||!m) return;
  const g=gi[r.giId]||{};
  mapped[m+'_'+b]={ vno:g.no||'', vessel:g.vessel||'', dIn:g.decl||'', dOut:r.decl||'' };
});
chk('ghép được thông tin cho toàn bộ lô của tab cũ', Object.keys(mapped).length===23,
    Object.keys(mapped).length+' lô');
chk('lô 260818X001 lấy đúng tàu GLOBE POLARIS + tờ khai nhập',
    mapped['C3_260818X001'].vessel==='GLOBE POLARIS' &&
    mapped['C3_260818X001'].dIn==='108502630131' &&
    mapped['C3_260818X001'].vno==='XVIII',
    JSON.stringify(mapped['C3_260818X001']));
chk('hai lô CÙNG mã batch khác Mat KHÔNG bị lẫn (260804E001 C3 vs C4)',
    mapped['C3_260804E001'].vessel==='MAPLE GAS' &&
    mapped['C4_260804E001'].vessel==='FUTURE EXPLORER');
const inSap=new Set(rows.filter(r=>r.inSap).map(r=>r.key));
const orphan=Object.keys(mapped).filter(k=>!inSap.has(k));
chk('mọi lô của tab cũ đều khớp một dòng SAP ngày 18/08', orphan.length===0, orphan.join(', '));

/* ---------- [8] KỲ KHÁC THÁNG ---------- */
console.log('\n[8] KỲ THÁNG 9 KHÔNG ĐỤNG DỮ LIỆU THÁNG 8');
S.setMonth('2026-09');
const r9=BOND.recalc();
const o9=S.ol1Sum();
chk('Σ FEED OL1 của kỳ 09 = 0 (chưa nhập ngày nào của tháng 9)', Math.round(o9.t)===0,
    fmt(o9.t)+' kg · '+o9.n+' ngày');
const x9=r9.find(r=>r.bcode==='260714X001'&&r.mat==='C3');
chk('⭐ lô X không bị trừ gì trong kỳ 09 — đúng ý "tháng 9 không dùng số tháng 8"',
    x9 && x9.used===0 && x9.left===x9.end, x9?fmt(x9.left):'—');
S.setMonth('2026-08');

console.log(fail?('\n❌ '+fail+' KIỂM TRA HỎNG'):'\n✅ TẤT CẢ KIỂM TRA ĐỀU ĐẠT');
process.exit(fail?1:0);
