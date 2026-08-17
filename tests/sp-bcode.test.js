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

console.log('\n'+(fail?('❌ '+fail+' KIỂM TRA THẤT BẠI'):'✅ TẤT CẢ KIỂM TRA ĐỀU ĐẠT'));
process.exit(fail?1:0);
