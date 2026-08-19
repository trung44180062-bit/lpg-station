/* ============================================================
 * knq-realdb.smoke.js — KIỂM CHỨNG BẰNG DỮ LIỆU THẬT CỦA APP
 * ------------------------------------------------------------
 *   node tests/knq-realdb.smoke.js      (chạy từ thư mục gốc repo)
 * Cần tests/knq-realdb.json = bản export Realtime Database. Không có file
 * thì test tự bỏ qua (để CI không đỏ).
 *
 * Khoá chặt lỗi v4.104: bản cũ để tick ✔ Done đóng lô P/X ⇒ st='done' ⇒
 * lần sau KHÔNG tải về, trong khi SAP vẫn còn hàng. Trong bản export
 * 19/08/2026 có ĐÚNG 5 lô như vậy, tổng 13 695 432 kg. _rescuePX() phải
 * kéo đủ cả 5 về, và thứ tự FIFO phải được khôi phục (các lô sau không còn
 * bị trừ oan).
 * ============================================================ */
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..');
global.window=global;
global.document={ getElementById:()=>null, querySelector:()=>null, querySelectorAll:()=>[], get activeElement(){return null;} };
global.toast=(m,t)=>console.log('   ['+(t||'')+'] '+m);
global.confirm=()=>true; global.canWrite=()=>true;
const DBF=path.join(__dirname,'knq-realdb.json');
if(!fs.existsSync(DBF)){ console.log('⏭  bỏ qua — chưa có tests/knq-realdb.json (export Firebase)'); process.exit(0); }
const DB=JSON.parse(fs.readFileSync(DBF,'utf8'));
const K=DB.knq_bonded;
function snap(v){ return { val:()=>v, key:null }; }
function mkRef(node){
  return {
    once:()=>Promise.resolve(snap(node)),
    orderByChild:(f)=>({ equalTo:(v)=>({ once:()=>{
      const o={}; Object.keys(node||{}).forEach(k=>{ if((node[k]||{})[f]===v || (v==='open'&&!(node[k]||{}).st)) o[k]=node[k]; });
      return Promise.resolve(snap(o)); }, on:()=>{} }) }),
    orderByKey:()=>({ startAt:()=>({ once:()=>Promise.resolve(snap(node)), on:()=>{} }) }),
    child:(p)=>{ let n=node; String(p).split('/').forEach(seg=>{ n=(n||{})[seg]; }); return mkRef(n); },
    on:()=>{}, remove:()=>Promise.resolve(), update:()=>Promise.resolve()
  };
}
const rootRef=mkRef(K);
rootRef.update=(m)=>{ global.LASTMAP=m; return Promise.resolve(); };
global.firebase={ database:()=>({ ref:()=>rootRef }) };
eval(fs.readFileSync(path.join(ROOT,'js','features','knq.js'),'utf8'));

/* SAP thật của ngày 18/08 lấy chính từ sapEnd đã sync trong DB */
const sapRows=[];
Object.values(K.go).forEach(r=>{ if(r.batch&&r.sapEnd!=null&&r.sapDate)
  sapRows.push({ mat:r.mat||'C3', batch:r.batch, date:r.sapDate, end:Number(r.sapEnd) }); });
global.SP={ batch1100:()=>({ rows:sapRows, legacy:0 }) };

let fail=0;
const chk=(n,c,x)=>{ console.log((c?'  ✅ ':'  ❌ ')+n+(x?('  '+x):'')); if(!c) fail++; };
const S=KNQ._state, R=v=>Math.round(Number(v||0));
const fmt=v=>R(v).toLocaleString('en-US');

KNQ.init();
KNQ.onTabEnter();
setTimeout(()=>{
  const St=KNQ.recalc();
  const px=St.gos.filter(r=>r.letter==='P'||r.letter==='X');
  const lost=['260714X001','260721P001','260721X001','260729P001','260729P002'];
  console.log('\n— DỮ LIỆU THẬT: 5 lô P/X từng bị đóng nhầm —');
  let sum=0;
  lost.forEach(b=>{
    const r=px.find(x=>x.batch===b);
    if(!r){ chk('lô '+b+' được kéo trở lại bộ dữ liệu', false, 'KHÔNG THẤY'); return; }
    sum+=Number(r.sapEnd||0);
    chk('lô '+b+' trở lại · SAP còn '+fmt(r.sapEnd)+' kg · st='+r.st,
        r.st!=='done' && !r.pxDone, 'left '+fmt(r.remainKg));
  });
  console.log('\n  Tổng SAP của 5 lô: '+fmt(sum)+' kg');
  chk('đúng 13 695 432 kg đã được cứu về', R(sum)===13695432, fmt(sum));

  const openPX=px.filter(r=>r.st!=='done');
  chk('không còn lô P/X nào bị đánh done trong khi SAP còn hàng',
      px.every(r=>r.st!=='done' || !(Number(r.sapEnd)>0)),
      px.filter(r=>r.st==='done'&&Number(r.sapEnd)>0).map(r=>r.batch).join(','));

  const left=St.gos.filter(r=>r.st!=='done').reduce((a,r)=>a+(r.remainKg||0),0);
  console.log('\n  Actual left toàn kho (mọi lô đang mở): '+fmt(left)+' kg');
  console.log('  Số lô đang mở: '+St.gos.filter(r=>r.st!=='done').length+' / '+St.gos.length);
  console.log('  Đang bơm ra (head): '+St.gos.filter(r=>r.head).map(r=>r.mat+' '+r.batch+' '+fmt(r.remainKg)).join(' | '));
  console.log('  Dưới 200 T: '+St.gos.filter(r=>r.low&&r.st!=='done').map(r=>r.batch+' '+fmt(r.remainKg)).join(' | '));
  console.log('\n'+(fail?('❌ '+fail+' lỗi'):'✅ DỮ LIỆU THẬT KHỚP'));
  process.exit(fail?1:0);
},600);
