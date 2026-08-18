/* ============================================================
 * knq-real-c3.smoke.js — chạy IMPORT trên ĐÚNG FILE THẬT của khách
 *   "2. C3 usage for export production_Update Aug 14.xlsx"
 *   sheet "일자별 C3사용량 (예상 및 실적)"
 * AOA lấy nguyên xi từ file (dump sang JSON), sau đó cho KNQ đọc như
 * lúc người dùng bấm 📥 Import Excel.
 *   node tests/knq-real-c3.smoke.js
 * (AOA thật lưu ở tests/knq-c3-real.aoa.json — dump nguyên xi từ file khách)
 * ============================================================ */
const fs=require('fs'), path=require('path');
global.window=global;
global.document={ getElementById:()=>null, querySelector:()=>null };
global.toast=(m)=>console.log('   toast:',m);
global.confirm=()=>true; global.canWrite=()=>true;
global.firebase={ database:()=>({ ref:()=>({ update:()=>Promise.resolve(),
  child(){ return { once:()=>Promise.resolve({val:()=>null}), remove:()=>Promise.resolve() }; } }) }) };
eval(fs.readFileSync(path.join(__dirname,'..','js','features','knq.js'),'utf8'));

const D=JSON.parse(fs.readFileSync(process.argv[2]||path.join(__dirname,'knq-c3-real.aoa.json'),'utf8'));
global.XLSX={ read:()=>({ SheetNames:D.names, Sheets:Object.fromEntries(D.names.map(n=>[n,{}])) }),
  utils:{ sheet_to_json:()=>D.aoa } };
global.FileReader=function(){ this.readAsArrayBuffer=()=>this.onload({target:{result:new Uint8Array(1)}}); };

const S=KNQ._state;
S.setMonth('2026-08');
KNQ.fileChosen({ files:[{ name:'2. C3 usage for export production_Update Aug 14.xlsx' }] });
const imp=S.imp();
console.log('\nSHEET  :',imp.sheet);
console.log('THÁNG  :',imp.month,' · cột ngày đầy đủ:',imp.dCol,' · cột ngày 1–31:',imp.dayCol);
console.log('ACTUAL :',imp.aCol,'—',String(imp.head[imp.aCol]).slice(0,60));
console.log('PLAN   :',imp.pCol,'—',String(imp.head[imp.pCol]).slice(0,60));
KNQ.impApply();
console.log('\nNGÀY        X (tấn)   NGUỒN   PLAN X (tấn)   P = 2000 − X');
Object.keys(S.USE).sort().forEach(d=>{
  const u=S.USE[d];
  const t=v=>(v===''||v==null)?'      —':(v/1000).toFixed(3).padStart(9);
  console.log(d, t(u.x), (u.xs==='a'?'ACTUAL':u.xs==='p'?' PLAN ':'  —  '), t(u.xp),
              t(S.useOf(d,'P','act')));
});
const a=Object.keys(S.USE).filter(d=>S.USE[d].xs==='a').length;
const p=Object.keys(S.USE).filter(d=>S.USE[d].xs==='p').length;
const sum=Object.keys(S.USE).reduce((s,d)=>s+(+S.USE[d].x||0),0);
console.log('\nTổng: '+a+' ngày ACTUAL · '+p+' ngày PLAN · X cả tháng = '+(sum/1000).toFixed(3)+' T');
