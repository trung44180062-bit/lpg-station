/* Harness kiểm tra logic tính suất cơm tăng ca (js/19-meal.js)
   Chạy trong vm với stub DOM tối thiểu. */
const fs=require('fs'), vm=require('vm'), path=require('path');
const DIR=process.argv[2];
const rd=f=>fs.readFileSync(path.join(DIR,'js',f),'utf8');

const sandbox={console, Date, Math, JSON, Set, Map, Object, Array, String, Number, RegExp,
  isNaN, parseInt, parseFloat, setTimeout, clearTimeout};
sandbox.window=sandbox;
sandbox.document={querySelectorAll:()=>[],getElementById:()=>null,createElement:()=>({style:{}}),body:{}};
sandbox.navigator={};
sandbox.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
vm.createContext(sandbox);

vm.runInContext(rd('01-core.js'),sandbox,{filename:'01-core.js'});

/* ---- stub các hàm 19-meal.js cần mà nằm ở module khác ---- */
vm.runInContext(`
function baseShiftOf(code){
  if(code==='D'||code==='SD'||code==='OTD')return 'D';
  if(code==='N'||code==='SN'||code==='OTN')return 'N';
  if(code==='O'||code==='SO')return 'O';
  return null;
}
function reqDays(r){
  return (r.days||[]).map(d=>({iso:d.iso,code:d.code||'',timeIn:d.timeIn||'',
    timeOut:d.timeOut||'',isoEnd:d.isoEnd||'',hours:d.hours||0,preset:d.preset||''}));
}
function addDaysIso(iso,n){const d=new Date(iso+'T00:00:00');d.setDate(d.getDate()+n);return isoOf(d);}
function shortName(n){return n;}
function t(s){return s;} function t2(s){return s;}
function i18nApply(){}
function daysOfPeriod(){return [];} function curSchedMonth(){return '2026-08';}
function meId(){return 'e1';}
`,sandbox,{filename:'stubs.js'});

vm.runInContext(rd('19-meal.js'),sandbox,{filename:'19-meal.js'});
/* `let S` trong vm không gắn vào global object → phơi ra cho harness */
vm.runInContext('window.S=S;',sandbox);

/* ================= DỮ LIỆU GIẢ ================= */
const D='2026-08-10';           // ngày thử
const NEXT='2026-08-11', PREV='2026-08-09';
function reset(){
  sandbox.S.employees=[
    {id:'e1',name:'Kỹ sư A',team:'A',pos:'field_eng',active:true,shiftType:'shift8'},
    {id:'e2',name:'Boardman B',team:'A',pos:'boardman',active:true,shiftType:'shift8'},
    {id:'e3',name:'Oper C',team:'A',pos:'operator',active:true,shiftType:'shift8'},
    {id:'e4',name:'VP D',team:'Office',pos:'office',active:true,shiftType:'office5'}
  ];
  sandbox.S.base={};sandbox.S.over={};sandbox.S.requests={};
  sandbox.S.rev=(sandbox.S.rev||0)+1;          // đổi dữ liệu → bump rev
  vm.runInContext('mealResetCache()',sandbox); // và xoá chỉ mục OT
}
function bump(){sandbox.S.rev++;vm.runInContext('mealResetCache()',sandbox);}
function setBase(id,iso,code){(sandbox.S.base[id]=sandbox.S.base[id]||{})[iso]=code;bump();}
function addOtReq(id,rows,status){
  const rid='r'+(Object.keys(sandbox.S.requests).length+1);
  sandbox.S.requests[rid]={id:rid,type:'ot',empId:id,status:status||'approved',days:rows};
  bump();
  return rid;
}
const key=x=>(x.d<0?'-':'')+x.iso+'|'+x.v;
/* Chênh lệch của một người quanh ngày iso (quét cả hôm trước để bắt ca đêm) */
function meals(id,iso,incl){
  const src=[vm.runInContext('addDaysIso',sandbox)(iso,-1),iso];
  return vm.runInContext('mealDiffOf',sandbox)(id,src,incl!==false).map(key).sort();
}
/* Chỉ phần phải ĐẶT THÊM (bỏ qua phần báo bớt) */
function addOnly(id,iso,incl){return meals(id,iso,incl).filter(k=>k[0]!=='-');}

let pass=0,fail=0;
function chk(name,got,want){
  const g=JSON.stringify(got), w=JSON.stringify(want);
  if(g===w){pass++;console.log('  ✓ '+name);}
  else{fail++;console.log('  ✗ '+name+'\n      được : '+g+'\n      mong : '+w);}
}

console.log('\n=== A. SUẤT CHUẨN THEO CA (bếp đã book) ===');
reset();
const baseMeals=(code)=>vm.runInContext('mealsInWin',sandbox)(D,vm.runInContext('baseShiftWin',sandbox)(code)).map(key).sort();
chk('ca D 08–20 → trưa + tối',            baseMeals('D'), [D+'|dn',D+'|ln']);
chk('ca N 20–08 → khuya + sáng hôm sau',  baseMeals('N'), [D+'|ng',NEXT+'|bf']);
chk('ca O 08–17 → trưa',                  baseMeals('O'), [D+'|ln']);
chk('ca R → không suất nào',              baseMeals('R'), []);
chk('AL8 (nghỉ phép) → không suất nào',   baseMeals('AL8'), []);
chk('SD (đổi sang ca D) → trưa + tối',    baseMeals('SD'), [D+'|dn',D+'|ln']);

console.log('\n=== B. SUẤT THÊM DO TĂNG CA ===');
reset();setBase('e1',D,'O');
addOtReq('e1',[{iso:D,code:'OT3',timeIn:'17:00',timeOut:'20:00'}]);
chk('ca O + OT 17–20 → thêm 1 bữa tối', addOnly('e1',D), [D+'|dn']);

reset();setBase('e1',D,'O');
addOtReq('e1',[{iso:D,code:'OTL',timeIn:'12:00',timeOut:'13:00'}]);
chk('ca O + OT nghỉ trưa 12–13 → KHÔNG thêm (trưa đã book)', addOnly('e1',D), []);

reset();setBase('e1',D,'R');
addOtReq('e1',[{iso:D,code:'OTL',timeIn:'12:00',timeOut:'13:00'}]);
chk('ngày nghỉ R + OT 12–13 → thêm 1 bữa trưa', addOnly('e1',D), [D+'|ln']);

reset();setBase('e1',D,'D');
addOtReq('e1',[{iso:D,code:'OTN',timeIn:'20:00',timeOut:'24:00'}]);
chk('ca D + OT 20–24 → thêm 1 bữa khuya', addOnly('e1',D), [D+'|ng']);

reset();setBase('e1',D,'R');
addOtReq('e1',[{iso:D,code:'OTD',timeIn:'08:00',timeOut:'20:00'}]);
chk('ngày nghỉ R + OT cả ca ngày → thêm trưa + tối', addOnly('e1',D), [D+'|dn',D+'|ln']);

reset();setBase('e1',D,'R');
addOtReq('e1',[{iso:D,code:'OTN',timeIn:'20:00',timeOut:'08:00',isoEnd:NEXT}]);
chk('ngày nghỉ R + OT ca đêm → thêm khuya + sáng hôm sau', addOnly('e1',D), [D+'|ng',NEXT+'|bf']);

reset();setBase('e1',PREV,'N');setBase('e1',D,'R');
addOtReq('e1',[{iso:D,code:'OTL',timeIn:'06:00',timeOut:'10:00'}]);
chk('ca N hôm trước vắt sang: OT 06–10 hôm nay KHÔNG tính lại bữa sáng', addOnly('e1',D), []);

reset();setBase('e1',D,'D');
addOtReq('e1',[{iso:D,code:'OT2',timeIn:'20:00',timeOut:'22:30'}]);
chk('OT 20:00–22:30 (chạm mốc 22:00) → thêm 1 khuya', addOnly('e1',D), [D+'|ng']);

reset();setBase('e1',D,'D');
addOtReq('e1',[{iso:D,code:'OT2',timeIn:'20:00',timeOut:'22:00'}]);
chk('OT 20:00–22:00 (kết thúc ĐÚNG mốc 22:00) → KHÔNG có suất', addOnly('e1',D), []);

console.log('\n=== C. NHIỀU LẦN OT / KHÔNG TRÙNG SUẤT ===');
reset();setBase('e1',D,'R');
addOtReq('e1',[{iso:D,code:'OTL',timeIn:'11:00',timeOut:'14:00'}]);
addOtReq('e1',[{iso:D,code:'OT2',timeIn:'11:30',timeOut:'19:00'}]);
chk('2 lần OT cùng phủ 12:00 → chỉ 1 suất trưa (+ 1 tối)', addOnly('e1',D), [D+'|dn',D+'|ln']);

console.log('\n=== D. ĐƠN CHỜ DUYỆT ===');
reset();setBase('e1',D,'O');
addOtReq('e1',[{iso:D,code:'OT3',timeIn:'17:00',timeOut:'20:00'}],'pending');
chk('đơn pending — có tính  → 1 suất tối', addOnly('e1',D,true), [D+'|dn']);
chk('đơn pending — bỏ tính  → 0 suất',      addOnly('e1',D,false), []);
reset();setBase('e1',D,'O');
addOtReq('e1',[{iso:D,code:'OT3',timeIn:'17:00',timeOut:'20:00'}],'rejected');
chk('đơn bị từ chối → 0 suất', addOnly('e1',D,true), []);

console.log('\n=== E. Ô LỊCH OT ĐIỀN TAY (không có đơn) ===');
reset();setBase('e1',D,'O');
sandbox.S.over['e1']={[D]:{code:'OT3',hours:3}};bump();
chk('ô lịch OT3 điền tay → suy khung 17–20 → 1 bữa tối', addOnly('e1',D), [D+'|dn']);

console.log('\n=== F. TỔNG HỢP CẢ TỔ (mealPlan) ===');
reset();
['e1','e2','e3'].forEach(id=>setBase(id,D,'D'));
setBase('e4',D,'O');
addOtReq('e1',[{iso:D,code:'OTN',timeIn:'20:00',timeOut:'23:00'}]);
addOtReq('e3',[{iso:D,code:'OTN',timeIn:'20:00',timeOut:'23:00'}]);
addOtReq('e4',[{iso:D,code:'OT3',timeIn:'17:00',timeOut:'20:00'}]);
const P=vm.runInContext('mealPlan',sandbox)({from:D,to:D,inclPending:true});
chk('tổng suất thêm cả tổ = 3', P.total, 3);
chk('ngày D: khuya 2 suất', P.byDay[D].ng.length, 2);
chk('ngày D: tối 1 suất',   P.byDay[D].dn.length, 1);
const Pa=vm.runInContext('mealPlan',sandbox)({from:D,to:D,team:'A',inclPending:true});
chk('lọc nhóm A → 2 suất', Pa.total, 2);
const Pm=vm.runInContext('mealPlan',sandbox)({from:D,to:D,onlyMe:true,inclPending:true});
chk('chỉ mình tôi (e1) → 1 suất', Pm.total, 1);

console.log('\n=== G. NHÓM VỊ TRÍ KỸ SƯ / OPERATOR ===');
reset();
const pg=vm.runInContext('posGroupOf',sandbox), sp=vm.runInContext('splitEO',sandbox);
chk('field_eng → eng',  pg({pos:'field_eng'}), 'eng');
chk('boardman → eng',   pg({pos:'boardman'}),  'eng');
chk('operator → oper',  pg({pos:'operator'}),  'oper');
chk('office → other',   pg({pos:'office'}),    'other');
chk('chữ tự do "Field Engineer" → eng', pg({pos:'Field Engineer'}), 'eng');
chk('chữ tự do "DCS Board man" → eng',  pg({pos:'DCS Board man'}),  'eng');
chk('chưa khai vị trí, role=eng → eng', pg({role:'eng'}), 'eng');
const g=sp(sandbox.S.employees);
chk('splitEO: 2 kỹ sư / 1 oper / 1 khác',
  [g.eng.length,g.oper.length,g.other.length], [2,1,1]);

console.log('\n=== H. TIỆN ÍCH ===');
const wl=vm.runInContext('winLabel',sandbox);
chk('winLabel 17–20',      wl([1020,1200]), '17:00–20:00');
chk('winLabel qua đêm',    wl([1200,1920]), '20:00–08:00 (+1)');
const ow=vm.runInContext('otWinFromRow',sandbox);
chk('otWinFromRow bỏ trống ngày kết thúc, 20:00→08:00', ow({iso:D,timeIn:'20:00',timeOut:'08:00'}), [1200,1920]);
chk('otWinFromRow không có giờ, mã OT2 → mẫu 18–20',    ow({iso:D,code:'OT2'}), [1080,1200]);

console.log('\n=== I. SO LỊCH CHUẨN ↔ LỊCH THỰC TẾ (đặt thêm / báo bớt) ===');
function setOver(id,iso,code){(sandbox.S.over[id]=sandbox.S.over[id]||{})[iso]={code};bump();}

reset();setBase('e1',D,'D');setOver('e1',D,'AL8');
chk('chuẩn D → nghỉ phép AL8: BỚT trưa + tối', meals('e1',D), ['-'+D+'|dn','-'+D+'|ln']);

reset();setBase('e1',D,'R');setOver('e1',D,'SD');
chk('chuẩn R → vào trực thay ca D: THÊM trưa + tối', meals('e1',D), [D+'|dn',D+'|ln']);

reset();setBase('e1',D,'D');setOver('e1',D,'SN');
chk('chuẩn D → đổi sang ca N: bớt trưa+tối, thêm khuya + sáng hôm sau',
  meals('e1',D), ['-'+D+'|dn','-'+D+'|ln',D+'|ng',NEXT+'|bf'].sort());

reset();setBase('e1',D,'N');setOver('e1',D,'AL8');
chk('chuẩn N → nghỉ phép: bớt khuya hôm nay + sáng HÔM SAU',
  meals('e1',D), ['-'+D+'|ng','-'+NEXT+'|bf'].sort());

reset();setBase('e1',D,'D');
chk('không có gì đổi → không báo bếp gì', meals('e1',D), []);

reset();setBase('e1',D,'D');setOver('e1',D,'AL4');
chk('chuẩn D → nghỉ phép nửa ngày AL4 cũng bớt cả 2 suất', meals('e1',D), ['-'+D+'|dn','-'+D+'|ln']);

reset();setBase('e1',D,'O');setOver('e1',D,'O');
addOtReq('e1',[{iso:D,code:'OT3',timeIn:'17:00',timeOut:'20:00'}]);
chk('ca O giữ nguyên + tăng ca 17–20 → chỉ THÊM 1 tối', meals('e1',D), [D+'|dn']);

reset();setBase('e1',D,'R');setOver('e1',D,'SD');
addOtReq('e1',[{iso:D,code:'OTN',timeIn:'20:00',timeOut:'23:00'}]);
chk('chuẩn R → trực thay ca D rồi tăng ca tới 23h: thêm trưa+tối+khuya',
  meals('e1',D), [D+'|dn',D+'|ln',D+'|ng'].sort());

console.log('\n=== J. mealPlan ĐẾM HAI CHIỀU ===');
reset();
setBase('e1',D,'D');setOver('e1',D,'AL8');          // bớt 2
setBase('e2',D,'R');setOver('e2',D,'SD');           // thêm 2
setBase('e3',D,'O');
addOtReq('e3',[{iso:D,code:'OT3',timeIn:'17:00',timeOut:'20:00'}]);   // thêm 1
const Q=vm.runInContext('mealPlan',sandbox)({from:D,to:D,inclPending:true});
chk('đặt thêm = 3', Q.add, 3);
chk('báo bớt = 2',  Q.cut, 2);
const cellFn=vm.runInContext('mealCell',sandbox);
chk('ô trưa: +1 thêm / -1 bớt', [cellFn(Q,D,'ln').add,cellFn(Q,D,'ln').cut], [1,1]);
chk('ô tối : +2 thêm / -1 bớt', [cellFn(Q,D,'dn').add,cellFn(Q,D,'dn').cut], [2,1]);
chk('dòng chi tiết ghi ca chuẩn → ca thực tế',
  Q.rows.some(r=>r.planCode==='D'&&r.realCode==='AL8'&&r.d<0), true);

console.log('\n──────────────────────────────');
console.log(pass+' đạt · '+fail+' hỏng');
process.exit(fail?1:0);
