/* ============================================================
 * sp-bcode.test.js — sp.js v4.89: TÁCH BATCH ở SLoc 1100
 * ------------------------------------------------------------
 *   node tests/sp-bcode.test.js      (chạy từ thư mục gốc repo)
 * Bảo đảm:
 *   • SLoc 1100 tách theo MÃ BATCH ĐẦY ĐỦ (bcode), các SLoc khác giữ
 *     nguyên cách gộp về 1 ký tự → alloc/cav/rpt không đổi kết quả.
 *   • Tổng theo ký tự batch KHÔNG đổi sau khi tách (chỉ nhiều dòng hơn).
 *   • Dòng 1100 kiểu cũ (không bcode) bị phát hiện để xoá, tránh đếm đôi.
 *   • SP.batch1100(from,to) trả đúng dữ liệu cho tab KNQ.
 * ============================================================ */
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..');

/* ---- DOM / môi trường giả tối thiểu để nạp được sp.js ---- */
function el(){ return { value:'', textContent:'', innerHTML:'', classList:{add(){},remove(){},toggle(){}},
  addEventListener(){}, focus(){}, style:{} }; }
global.window=global;
global.document={ getElementById:()=>el(), querySelector:()=>null, querySelectorAll:()=>[] };
global.localStorage={ getItem:()=>null, setItem(){}, removeItem(){} };
global.toast=()=>{}; global.canWrite=()=>true;
global.escapeHtml=s=>String(s==null?'':s);
global.CURRENT_USER={name:'test'};
global.Tabulator=function(){ return { on(){}, destroy(){} }; };
/* sp.js không gán ra window → lấy giá trị trả về của eval */
global.SP=eval(fs.readFileSync(path.join(ROOT,'js','data','sp.js'),'utf8')+'\n;SP');

let fail=0;
function chk(n,c,x){ console.log((c?'  ✅ ':'  ❌ ')+n+(x?'  '+x:'')); if(!c) fail++; }

/* ---- dữ liệu SAP thật ----
   sapRawMulti : ZMMFR022 01–02/08 đủ các SLoc → chứng minh SLoc khác 1100 không đổi
   sapRaw1100  : ZMMFR022 tải 17/08, chỉ SLoc 1100 → bản snapshot dùng hằng ngày */
const F=JSON.parse(fs.readFileSync(path.join(__dirname,'knq.fixtures.json'),'utf8'));
const pad=rs=>rs.map(r=>{ const a=[]; for(let i=0;i<22;i++) a.push(r[i]==null?'':String(r[i])); return a; });
const tsv=pad(F.sapRawMulti);
const tsv1100=pad(F.sapRaw1100);
const tsv0819=pad(F.sapRaw1100_0819);   /* ZMMFR022 tải 19/08 10:00, chỉ SLoc 1100 */

console.log('\n[1] TÁCH BATCH THEO SLoc');
const p=SP._parseSap(tsv);
const at1100=p.rows.filter(r=>r.sloc==='1100');
const other =p.rows.filter(r=>r.sloc!=='1100');
chk('mọi dòng SLoc 1100 đều có mã batch đầy đủ (bcode)',
    at1100.length>0 && at1100.every(r=>/^\d{6}[DEPX]\d*$/.test(r.bcode)), at1100.length+' dòng');
chk('SLoc khác 1100 KHÔNG có bcode (giữ nguyên cách gộp cũ)',
    other.length>0 && other.every(r=>!r.bcode), other.length+' dòng');
chk('bcode luôn khớp ký tự batch đã gộp',
    at1100.every(r=>r.bcode[6]===r.batch));

console.log('\n[2] TỔNG KHÔNG ĐỔI SAU KHI TÁCH (alloc/cav/rpt vẫn đúng)');
/* gộp lại theo date|sloc|mat|batch rồi so với cách gộp cũ */
function aggByLetter(rows){
  const a={};
  rows.forEach(r=>{ const k=r.date+'|'+r.sloc+'|'+r.mat+'|'+r.batch;
    if(!a[k]) a[k]={init:0,gr:0,gi:0,trs:0,end:0};
    ['init','gr','gi','trs','end'].forEach(f=>a[k][f]+=r[f]); });
  return a;
}
const now=aggByLetter(p.rows);
/* cách gộp CŨ = tự tính lại từ TSV, không phân biệt mã batch */
const old={};
tsv.forEach(c=>{
  const MAT={'20008511':'C3','20008512':'C4'}[String(c[2]).trim()]; if(!MAT) return;
  const sloc=String(c[4]).trim(); if(!{'1100':1,'2100':1,'2101':1,'B100':1}[sloc]) return;
  const d=String(c[6]).slice(0,10); if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
  const b=String(c[7]).trim().toUpperCase(); const L=(b.length>=7&&'DEPX'.includes(b[6]))?b[6]:(b.length===1&&'DEPX'.includes(b)?b:'');
  if(!L) return;
  const k=d+'|'+sloc+'|'+MAT+'|'+L;
  if(!old[k]) old[k]={init:0,gr:0,gi:0,trs:0,end:0};
  const num=v=>{ let s=String(v||0).replace(/,/g,''); if(s.length>1&&s.slice(-1)==='-') s='-'+s.slice(0,-1); return parseFloat(s)||0; };
  ['init','gr','gi','trs','end'].forEach((f,i)=>{ old[k][f]+=num(c[[8,11,13,15,17][i]]); });
});
const keys=Object.keys(old);
const diff=keys.filter(k=>{
  const a=now[k]||{}, b=old[k];
  return ['init','gr','gi','trs','end'].some(f=>Math.abs((a[f]||0)-Math.round(b[f]))>1);
});
chk('tổng theo date|sloc|mat|ký-tự-batch giữ nguyên trên '+keys.length+' khoá', diff.length===0, diff.slice(0,3).join(' , '));
chk('SLoc 1100 sinh nhiều dòng hơn trước (đúng như thiết kế)',
    at1100.length > keys.filter(k=>k.split('|')[1]==='1100').length,
    at1100.length+' dòng / '+keys.filter(k=>k.split('|')[1]==='1100').length+' khoá cũ');

console.log('\n[3] KHOÁ SO SÁNH & DỌN DÒNG GỘP CŨ');
const r1=at1100[0];
chk('compKey của 2 batch khác mã ở cùng ngày/sloc/mat là KHÁC nhau',
    SP._compKey({date:'2026-08-01',sloc:'1100',mat:'C3',batch:'P',bcode:'260721P001'})!==
    SP._compKey({date:'2026-08-01',sloc:'1100',mat:'C3',batch:'P',bcode:'260729P001'}));
chk('compKey của SLoc khác 1100 không đổi so với trước (bcode rỗng)',
    SP._compKey({date:'2026-08-01',sloc:'2100',mat:'C3',batch:'D'})==='2026-08-01|2100|C3|D|');
/* nạp 1 dòng "kiểu cũ" vào ROWS rồi kiểm tra bị phát hiện */
const R=SP.ROWS;
R.__legacy={ _rid:'__legacy', date:r1.date, sloc:'1100', mat:r1.mat, batch:r1.batch, init:1, gr:0, gi:0, trs:0, end:1 };
R.__keep  ={ _rid:'__keep',   date:r1.date, sloc:'2100', mat:r1.mat, batch:r1.batch, init:1, gr:0, gi:0, trs:0, end:1 };
const leg=SP._findLegacy1100(p.rows);
chk('phát hiện đúng dòng 1100 gộp cũ để xoá', leg.length===1 && leg[0]._rid==='__legacy',
    leg.map(x=>x._rid).join(','));
chk('KHÔNG đụng vào dòng của SLoc khác', !leg.some(x=>x._rid==='__keep'));
delete R.__legacy; delete R.__keep;

console.log('\n[4] API CHO TAB KNQ');
p.rows.filter(r=>r.sloc==='1100').forEach((r,i)=>{ R['t'+i]=Object.assign({_rid:'t'+i},r); });
const all=SP.batch1100();
chk('batch1100() trả '+all.rows.length+' dòng, 0 dòng gộp cũ', all.rows.length===at1100.length && all.legacy===0);
chk('dates1100() trả 2 ngày 01–02/08', SP.dates1100().length===2, SP.dates1100().join(','));
const rng=SP.batch1100('2026-08-02','2026-08-02');
chk('lọc theo ngày đúng',
    rng.rows.length>0 && rng.rows.every(r=>r.date==='2026-08-02') && rng.dates.length===1,
    rng.rows.length+' dòng · '+rng.dates.join(','));
chk('mã batch trả về là mã ĐẦY ĐỦ (KNQ trừ lùi được)',
    rng.rows.some(r=>/^\d{6}[DEPX]\d+$/.test(r.batch)));
/* thêm 1 dòng 1100 kiểu cũ → phải bị đếm vào legacy và KHÔNG lọt vào rows */
R.__old={ _rid:'__old', date:'2026-08-02', sloc:'1100', mat:'C3', batch:'P', init:9, gr:0, gi:0, trs:0, end:9 };
const mixed=SP.batch1100();
chk('dòng 1100 chưa tách batch bị loại và đếm vào legacy',
    mixed.legacy===1 && mixed.rows.length===at1100.length);
delete R.__old;

console.log('\n[5] BẢN SNAPSHOT ZMMFR022 CHỈ SLoc 1100 (tải 17/08)');
const snap=SP._parseSap(tsv1100);
chk('đọc '+snap.rows.length+' batch, tất cả đều có mã đầy đủ',
    snap.rows.length===26 && snap.rows.every(r=>/^\d{6}[DEPX]\d+$/.test(r.bcode)), snap.rows.length+' dòng');
chk('bỏ đúng 2 dòng tổng không có mã batch (32 dòng file → 26 batch + header + 5 dòng bỏ)',
    snap.rows.length < tsv1100.length-1);
chk('giữ nguyên Trs âm của 260806D001', (()=>{
  const r=snap.rows.find(x=>x.bcode==='260806D001'&&x.mat==='C3');
  return r && r.trs===-142457 && r.end===1426694; })());
chk('C3 19 batch · C4 7 batch',
    snap.rows.filter(r=>r.mat==='C3').length===19 && snap.rows.filter(r=>r.mat==='C4').length===7,
    snap.rows.filter(r=>r.mat==='C3').length+' / '+snap.rows.filter(r=>r.mat==='C4').length);


/* ---------- 6. v4.98 — BẢN 19/08 + SIẾT KHUÔN MÃ BATCH 1100 ---------- */
console.log('\n[6] v4.98 — BẢN ZMMFR022 19/08 (chỉ SLoc 1100) & SIẾT KHUÔN MÃ');
const s19=SP._parseSap(tsv0819);
chk('đọc đúng 31 batch của bản 19/08, KHÔNG gộp về P/X/D/E',
    s19.rows.length===31 && s19.n1100===31, s19.rows.length+' dòng · n1100='+s19.n1100);
chk('mọi dòng đều là SLoc 1100 và có mã batch đầy đủ',
    s19.rows.every(r=>r.sloc==='1100'&&/^\d{6}[DEPX]\d+$/.test(r.bcode)));
chk('mã batch KHÔNG bị trùng trong cùng (mat)', (function(){
  const seen={}; let dup=0;
  s19.rows.forEach(r=>{ const k=r.mat+'|'+r.bcode; if(seen[k]) dup++; seen[k]=1; });
  return dup===0;
})());
chk('C3 23 batch · C4 8 batch',
    s19.rows.filter(r=>r.mat==='C3').length===23 && s19.rows.filter(r=>r.mat==='C4').length===8,
    s19.rows.filter(r=>r.mat==='C3').length+' / '+s19.rows.filter(r=>r.mat==='C4').length);
chk('bỏ đúng 3 dòng tổng của SAP (batch rỗng), không cộng nhầm vào batch nào',
    s19.rows.length===31 && (s19.bad1100||[]).length===0, JSON.stringify(s19.bad1100));
chk('giữ nguyên Trs âm 260731E001 C3: 338 814 → 274 968', (function(){
  const r=s19.rows.find(x=>x.bcode==='260731E001'&&x.mat==='C3');
  return r && r.init===338814 && r.trs===-63846 && r.end===274968; })());
chk('giữ nguyên Trs âm 260728E001 C4: 323 644 → 262 300', (function(){
  const r=s19.rows.find(x=>x.bcode==='260728E001'&&x.mat==='C4');
  return r && r.trs===-61344 && r.end===262300; })());
chk('hai batch cùng ngày cùng chữ E vẫn TÁCH riêng (260818E001 / E002)', (function(){
  const a=s19.rows.find(x=>x.bcode==='260818E001'&&x.mat==='C3');
  const b=s19.rows.find(x=>x.bcode==='260818E002'&&x.mat==='C3');
  return a&&b&&a.end===280000&&b.end===20000; })(), 'gộp lại sẽ ra 300 000 — sai');
/* đối chiếu với tổng cộng tay trên chính file xlsx (bỏ 3 dòng tổng của SAP) */
chk('tổng End khớp file: C3 59 861 363 · C4 4 420 102 · LPG 64 281 465 kg', (function(){
  const t=m=>s19.rows.filter(r=>r.mat===m).reduce((a,r)=>a+r.end,0);
  return t('C3')===59861363 && t('C4')===4420102 && t('C3')+t('C4')===64281465;
})(), (function(){const t=m=>s19.rows.filter(r=>r.mat===m).reduce((a,r)=>a+r.end,0);
  return t('C3')+' / '+t('C4');})());

/* siết khuôn: mã 1100 sai định dạng bị LOẠI, không được rơi vào rổ gộp */
chk('isBcode nhận đúng khuôn YYMMDD+P/X/D/E+nnn',
    SP._isBcode('260714X001') && SP._isBcode('260818E002') &&
    !SP._isBcode('P') && !SP._isBcode('260714Z001') && !SP._isBcode('26071X001') &&
    !SP._isBcode('') && !SP._isBcode('260714X'));
(function(){
  const rowsBad=[
    ['32','3262','20008511','PROPANE','1100','3000','2026-08-19','260714X001','1000','0','0','0','0','0','0','0','0','1000','0','KG','USDV',''],
    ['32','3262','20008511','PROPANE','1100','3000','2026-08-19','P',        '9999','0','0','0','0','0','0','0','0','9999','0','KG','USDV',''],
    ['32','3262','20008511','PROPANE','1100','3000','2026-08-19','X',        '5555','0','0','0','0','0','0','0','0','5555','0','KG','USDV',''],
    /* mã không suy ra nổi ký tự batch → bị bỏ, y như TRƯỚC v4.98 (không phải lỗi mới) */
    ['32','3262','20008511','PROPANE','1100','3000','2026-08-19','LUNG-TUNG','4444','0','0','0','0','0','0','0','0','4444','0','KG','USDV',''],
    ['32','3262','20008511','PROPANE','2100','3000','2026-08-19','P',        '7777','0','0','0','0','0','0','0','0','7777','0','KG','USDV','']
  ];
  const bp=SP._parseSap(rowsBad);
  const at1100=bp.rows.filter(r=>r.sloc==='1100');
  /* ⚠ mã lạ KHÔNG bị bỏ — bỏ là hụt tổng SLoc 1100 của Daily Stock.
     Bắt buộc: mỗi mã nằm ở bcode riêng ⇒ không bao giờ cộng chung. */
  chk('mã 1100 lạ vẫn GIỮ DÒNG (không hụt tổng) và đếm vào bad1100',
      at1100.length===3 && bp.bad1100.length===2,
      at1100.length+' dòng 1100 · bad='+bp.bad1100.length);
  chk('… mỗi mã nằm ở bcode RIÊNG: X đúng khuôn và X trần KHÔNG cộng chung',
      at1100.filter(r=>r.batch==='X').length===2 &&
      at1100.filter(r=>r.batch==='X').map(r=>r.bcode).sort().join(',')==='260714X001,X',
      at1100.filter(r=>r.batch==='X').map(r=>r.bcode).sort().join(','));
  chk('tổng End SLoc 1100 giữ nguyên 1000+9999+5555 = 16 554',
      at1100.reduce((a,r)=>a+r.end,0)===16554, String(at1100.reduce((a,r)=>a+r.end,0)));
  chk('mã không suy ra nổi ký tự batch vẫn bị bỏ — y như trước v4.98',
      !at1100.some(r=>r.bcode==='LUNG-TUNG'));
  chk('SLoc 2100 vẫn gộp về 1 ký tự như cũ, không bị siết khuôn',
      bp.rows.some(r=>r.sloc==='2100'&&r.batch==='P'&&!r.bcode&&r.end===7777));
  chk('bad1100 nêu rõ ngày · mat · mã lạ · ký tự suy ra, để soát bên SAP',
      bp.bad1100.every(b=>b.date==='2026-08-19'&&b.mat==='C3') &&
      bp.bad1100.map(b=>b.raw+':'+b.batch).join(',')==='P:P,X:X',
      bp.bad1100.map(b=>b.raw+':'+b.batch).join(','));
})();

/* dọn dòng gộp cũ — nới theo ngày+mat */
(function(){
  const legacyRow={_rid:'__L1',date:'2026-08-19',sloc:'1100',mat:'C3',batch:'X',bcode:'',init:1,gr:0,gi:0,trs:0,end:1};
  const legacyOther={_rid:'__L2',date:'2026-08-19',sloc:'1100',mat:'C3',batch:'D',bcode:'',init:2,gr:0,gi:0,trs:0,end:2};
  const legacyOldDay={_rid:'__L3',date:'2026-01-01',sloc:'1100',mat:'C3',batch:'X',bcode:'',init:3,gr:0,gi:0,trs:0,end:3};
  const keepOther={_rid:'__K1',date:'2026-08-19',sloc:'2100',mat:'C3',batch:'D',bcode:'',init:4,gr:0,gi:0,trs:0,end:4};
  [legacyRow,legacyOther,legacyOldDay,keepOther].forEach(r=>{ SP.ROWS[r._rid]=r; });
  const found=SP._findLegacy1100(s19.rows).map(r=>r._rid).sort();
  chk('dòng gộp cũ CÙNG NGÀY+MAT bị dọn kể cả khác ký tự batch',
      found.join(',')==='__L1,__L2', found.join(','));
  chk('ngày chưa có bản tách thì GIỮ LẠI, không xoá bừa', found.indexOf('__L3')<0);
  chk('SLoc khác 1100 không bao giờ bị đụng tới', found.indexOf('__K1')<0);
  chk('_allLegacy1100() đếm mọi dòng 1100 còn gộp, kể cả ngày chưa tách',
      SP._allLegacy1100().length===3, String(SP._allLegacy1100().length));
  ['__L1','__L2','__L3','__K1'].forEach(k=>{ delete SP.ROWS[k]; });
})();

console.log('\n'+(fail?('❌ '+fail+' KIỂM TRA THẤT BẠI'):'✅ TẤT CẢ KIỂM TRA ĐỀU ĐẠT'));
process.exit(fail?1:0);
