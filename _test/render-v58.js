/* ============================================================
   Kiểm thử DỰNG GIAO DIỆN bản v58 (không cần trình duyệt)
   Chạy: node _test/render-v58.js   (từ thư mục LPGT-CongCa-Web)
   ------------------------------------------------------------
   Sandbox không cài được chromium/jsdom (CDN bị chặn), nên dùng một
   DOM giả tối thiểu: mỗi phần tử chỉ có innerHTML / classList / style /
   value. Đủ để GỌI THẬT các hàm render mới và bắt lỗi cú pháp, sai tên
   biến, thiếu hàm — những lỗi hay làm trắng trang mà mắt đọc code khó thấy.
   ============================================================ */
const fs=require('fs'),vm=require('vm');

/* ---------- DOM giả ---------- */
const els={};
function mkEl(id){
  const cl=new Set();
  return {id,innerHTML:'',textContent:'',value:'',checked:false,
    options:{length:1},dataset:{},style:{},
    classList:{add:c=>cl.add(c),remove:c=>cl.delete(c),
      toggle:(c,on)=>{on?cl.add(c):cl.delete(c);},contains:c=>cl.has(c)},
    scrollIntoView(){},appendChild(){},setAttribute(){},focus(){}};
}
const doc={
  getElementById:id=>els[id]||(els[id]=mkEl(id)),
  querySelectorAll:()=>[],querySelector:()=>null,
  createElement:()=>mkEl('tmp'),addEventListener(){},
  documentElement:{setAttribute(){}}
};

const ctx={console,setTimeout:(f)=>0,clearTimeout(){},Date,Math,JSON,process,
  document:doc,localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  matchMedia:()=>({matches:true}),confirm:()=>true,prompt:()=>'',alert(){}};
ctx.window=ctx;ctx.globalThis=ctx;ctx.APP_CFG={};
vm.createContext(ctx);

const src=f=>fs.readFileSync(f,'utf8');
const acc=src('js/10-account.js');
const cut=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
const stub=`
  var t=s=>s, t2=s=>s, LANG='vi', toast=()=>{}, save=()=>{S.rev=Date.now();};
  var _me='e1', meId=()=>_me;
  function addDaysIso(iso,n){const d=new Date(iso+'T00:00:00');d.setDate(d.getDate()+n);return isoOf(d);}
  function mondayOf(iso){const d=new Date(iso+'T00:00:00');const wd=(d.getDay()+6)%7;d.setDate(d.getDate()-wd);return isoOf(d);}
  function shortName(n){const p=String(n||'').trim().split(/\\s+/);return p.slice(-2).join(' ');}
  function newNotif(o){const id=uid();S.notifs[id]=Object.assign({id,status:'pending',createdAt:Date.now()},o);return id;}
  function openDaySheet(){} function openCell(){} function fillMonthSelects(){}
  function repMpPanel(){return '';} function refreshMealBadge(){}
  function reqsOfDay(){return[];} function reqDays(){return[];}
  function crewOfDay(){return[];} function crewGroupInfo(){return{code:'',label:'',col:'#000'};}
`;
vm.runInContext([src('js/01-core.js'),stub,src('js/04-schedule.js'),src('js/05-roster.js'),
  src('js/06-calendar.js'),src('js/07-manpower.js'),src('js/08-requests.js'),
  src('js/20-events.js'),
  /* revokeSchedChange nằm giữa js/13-portal.js (file nặng DOM) → lấy đúng hàm đó */
  cut(src('js/13-portal.js'),'function revokeSchedChange','/* Nhân viên XÁC NHẬN'),
  cut(acc,'function calcStats','const rnd1=')+'const rnd1=v=>Math.round(v*10)/10;'
].join('\n;\n'),ctx,{filename:'render-v58'});

/* ---------- dữ liệu giả ---------- */
vm.runInContext(`
S.employees=[
 {id:'e1',name:'Nguyễn Văn A',team:'A',pos:'operator',shiftType:'type1',active:true},
 {id:'e2',name:'Trần Văn B', team:'A',pos:'field_eng',shiftType:'type1',active:true},
 {id:'e3',name:'Lê Văn C',   team:'B',pos:'operator',shiftType:'type1',active:true},
 {id:'e4',name:'Phạm Thị D', team:'Office',pos:'office',shiftType:'admin',active:true}];
S.base={};
const D0='2026-08-03';
for(let i=0;i<14;i++){const iso=addDaysIso(D0,i);
  S.base.e1=S.base.e1||{};S.base.e2=S.base.e2||{};S.base.e3=S.base.e3||{};S.base.e4=S.base.e4||{};
  S.base.e1[iso]=['O','O','D','D','N','N','R','R'][i%8];
  S.base.e2[iso]=['D','D','N','N','R','R','O','O'][i%8];
  S.base.e3[iso]=['N','N','R','R','O','O','D','D'][i%8];
  S.base.e4[iso]='O';}
S.over={e1:{'2026-08-05':{code:'O+N',by:'admin',at:Date.now(),hours:20}}};
S.notifs={};S.events={ev1:{id:'ev1',title:'Nhập tàu LPG',from:'2026-08-07',to:'2026-08-09',
  scope:'all',teams:[],notify:true,note:'Tàu cập cầu 06:00'}};
S.meta={schedFrom:'2026-07-21',schedTo:'2026-08-20'};
S.rev=2;evResetCache();
mgr=true;adm=true;noSelf=false;calMode='real';
`,ctx);

let pass=0,fail=0;
function check(name,fn,must){
  try{
    const out=fn();
    if(must&&must.some(m=>!String(out||'').includes(m))){
      fail++;console.log('  ✗',name,'→ thiếu:',must.filter(m=>!String(out||'').includes(m)).join(' | '));
    }else{pass++;console.log('  ✓',name);}
  }catch(e){fail++;console.log('  ✗',name,'→ LỖI:',e.message);}
}
const G=expr=>vm.runInContext(expr,ctx);

console.log('\n[A] Nhãn & màu ca kép');
check('chip("O+N") vẽ 2 nửa',()=>G('chip("O+N")'),['cc combo','<i>O</i>','<i>N</i>','--cca']);
check('chip("D") vẫn như cũ',()=>G('chip("D")'),['class="cc"','>D<']);
check('cellStyle("O+N") nền chia đôi',()=>G('cellStyle("O+N")'),['linear-gradient']);
check('cellStyle("N") không đổi',()=>G('cellStyle("N")'),['#C6E0B4']);

console.log('\n[B] Lịch tuần điện thoại');
check('renderCalWeekGrid chạy được',()=>{G('calWkMon="2026-08-03";calWkTeams=null;renderCalWeekGrid();');
  return els.calWkGrid.innerHTML;},
  ['cwg-nav','cwg-teams','Tuần','cwg-row hd','cwg-grp']);
check('mặc định mở đúng nhóm của người đăng nhập (A)',()=>els.calWkGrid.innerHTML,
  ['Nhóm A']);
/* chip nhóm luôn liệt kê đủ nhóm; cái phải kiểm là LƯỚI (cwg-grp) chỉ có nhóm A */
const grpHeads=()=>[...els.calWkGrid.innerHTML.matchAll(/class="cwg-grp"[^>]*>([^<]+)/g)].map(m=>m[1].trim());
check('lưới chỉ dựng nhóm A khi chưa bấm thêm',()=>grpHeads().join('|'),['Nhóm A']);
check('chưa kéo nhóm B vào lưới',()=>grpHeads().some(x=>x.includes('B'))?'':'ok',['ok']);
check('xem thêm nhóm khác → lưới có cả 2',()=>{G('calWkToggleTeam("B");');return grpHeads().join('|');},
  ['Nhóm A','Nhóm B']);
check('chuyển tuần',()=>{G('calWkShift(1);');return els.calWkGrid.innerHTML;},['10/08']);
check('ngày có sự kiện được đánh dấu',()=>{G('calWkMon="2026-08-03";renderCalWeekGrid();');
  return els.calWkGrid.innerHTML;},['ev','📌','Nhập tàu LPG']);
check('ô ca kép hiện trong lưới',()=>{G('calWkMon="2026-08-03";calWkTeams=["A"];renderCalWeekGrid();');
  return els.calWkGrid.innerHTML;},['cc combo']);

console.log('\n[C] Ma trận máy tính');
check('renderMatrix chạy + đánh dấu ngày sự kiện',()=>{
  doc.getElementById('calMonth').value='2026-08';
  doc.getElementById('calRange').value='month';
  doc.getElementById('calGroupFilter').value='__all';
  doc.getElementById('realDiffOnly').checked=false;
  G('renderMatrix(REAL);');return doc.getElementById('mtxBox').innerHTML;},
  ['<table class="mtx"','evday','linear-gradient']);

console.log('\n[D] Màn quản lý sự kiện');
check('renderEventMgr chạy được',()=>{G('evYm="2026-08";evSel={};evEditId="";renderEventMgr();');
  return els.evBody.innerHTML;},
  ['ev-mini','ev-scope','ev-list','Nhập tàu LPG','Tên sự kiện']);
check('mở sửa một sự kiện có sẵn',()=>{G('evEdit("ev1");');return els.evBody.innerHTML;},
  ['Lưu thay đổi','value="Nhập tàu LPG"']);
check('chọn ngày cập nhật đếm',()=>{G('evSel={};evToggleDay("2026-08-12");evToggleDay("2026-08-14");evSelRange();');
  return els.evBody.innerHTML;},['<b>3</b>']);
check('phạm vi "chọn nhóm" hiện danh sách nhóm',()=>{G('evSetScope("teams");');
  return els.evBody.innerHTML;},['ev-teams','Nhóm A','Nhóm B']);
check('lưu sự kiện mới + gửi thông báo',()=>{
  G('evEditId="";evTitle="Bảo dưỡng bơm";evScope="all";evNotify=true;evSave();');
  const n=G('Object.values(S.notifs).filter(x=>x.kind==="event").length');
  return n===4?'ok':'gửi '+n;},['ok']);
check('xoá sự kiện thu hồi thông báo',()=>{
  const id=G('Object.values(S.events).find(e=>e.title==="Bảo dưỡng bơm").id');
  G(`evDelete(${JSON.stringify(id)})`);
  const n=G('Object.values(S.notifs).filter(x=>x.kind==="event").length');
  return n===0?'ok':'còn '+n;},['ok']);

console.log('\n[E] Sửa ô lịch & thu hồi thông báo');
check('đổi ca người khác → sinh thông báo',()=>{
  G('S.notifs={};_me="admin1";curCell={empId:"e2",iso:"2026-08-06"};setCell("OTN");');
  const n=G('Object.values(S.notifs).filter(x=>x.kind==="schedChange"&&x.status==="pending").length');
  return n===1?'ok':'có '+n;},['ok']);
check('trả về ca chuẩn → thu hồi lặng lẽ',()=>{
  G('curCell={empId:"e2",iso:"2026-08-06"};setCell(null);');
  const n=G('Object.keys(S.notifs).length');
  return n===0?'ok':'còn '+n;},['ok']);
check('gán đúng mã chuẩn cũng coi là trả về chuẩn',()=>{
  G('S.notifs={};curCell={empId:"e2",iso:"2026-08-06"};setCell("OTN");');
  const std=G('S.base.e2["2026-08-06"]');
  G(`curCell={empId:"e2",iso:"2026-08-06"};setCell(${JSON.stringify(std)});`);
  const n=G('Object.keys(S.notifs).length');
  return n===0?'ok':'còn '+n;},['ok']);
check('ghi ca kép → thông báo mang mã ghép',()=>{
  G('S.notifs={};curCell={empId:"e2",iso:"2026-08-06"};setCell("D+N");');
  return G('Object.values(S.notifs)[0].newCode');},['D+N']);

console.log('\n'+(fail?'❌ ':'✅ ')+pass+' đạt / '+fail+' hỏng');
process.exit(fail?1:0);
