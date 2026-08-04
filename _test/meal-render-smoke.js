/* Smoke test: dựng HTML popup Đặt cơm + các hàm xuất, không cần trình duyệt */
const fs=require('fs'), vm=require('vm'), path=require('path');
const DIR=process.argv[2];
const rd=f=>fs.readFileSync(path.join(DIR,'js',f),'utf8');
const store={};
const mkEl=id=>store[id]||(store[id]={id,innerHTML:'',textContent:'',style:{},
  classList:{_s:new Set(),add(c){this._s.add(c)},remove(c){this._s.delete(c)},
             toggle(c,v){v?this._s.add(c):this._s.delete(c)},contains(c){return this._s.has(c)}},
  options:{length:1},value:''});
const sandbox={console,Date,Math,JSON,Set,Map,Object,Array,String,Number,RegExp,
  isNaN,parseInt,parseFloat,setTimeout,clearTimeout};
sandbox.window=sandbox;
sandbox.document={getElementById:mkEl,querySelectorAll:()=>[],querySelector:()=>null,
  createElement:()=>({style:{},select(){}}),body:{appendChild(){},removeChild(){}}};
sandbox.navigator={};
sandbox.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
vm.createContext(sandbox);
vm.runInContext(rd('01-core.js'),sandbox,{filename:'01-core.js'});
vm.runInContext(`
function baseShiftOf(c){return (c==='D'||c==='SD'||c==='OTD')?'D':(c==='N'||c==='SN'||c==='OTN')?'N':(c==='O'||c==='SO')?'O':null;}
function reqDays(r){return (r.days||[]).map(d=>({iso:d.iso,code:d.code||'',timeIn:d.timeIn||'',timeOut:d.timeOut||'',isoEnd:d.isoEnd||'',hours:d.hours||0}));}
function addDaysIso(iso,n){const d=new Date(iso+'T00:00:00');d.setDate(d.getDate()+n);return isoOf(d);}
function shortName(n){return n;}
function t(s){return s;} function t2(s){return s;}
function i18nApply(){}
function curSchedMonth(){return '2026-08';}
function daysOfPeriod(){const a=[];let d=new Date('2026-07-21T00:00:00');const e=new Date('2026-08-20T00:00:00');while(d<=e){a.push(isoOf(d));d.setDate(d.getDate()+1);}return a;}
function meId(){return 'e1';}
`,sandbox,{filename:'stubs.js'});
vm.runInContext(rd('19-meal.js'),sandbox,{filename:'19-meal.js'});
vm.runInContext('window.S=S;',sandbox);

const S=sandbox.S;
S.employees=[
 {id:'e1',name:'Nguyễn Văn A',team:'A',pos:'field_eng',active:true,shiftType:'shift8'},
 {id:'e2',name:'Trần Văn B',team:'A',pos:'boardman',active:true,shiftType:'shift8'},
 {id:'e3',name:'Lê Văn C',team:'B',pos:'operator',active:true,shiftType:'shift8'},
 {id:'e4',name:'Phạm Văn D',team:'Office',pos:'office',active:true,shiftType:'office5'}];
S.base={};S.over={};S.requests={};
const today=vm.runInContext('todayIso()',sandbox);
const add=(iso,n)=>vm.runInContext('addDaysIso',sandbox)(iso,n);
['e1','e2'].forEach(id=>{S.base[id]={};for(let i=0;i<8;i++)S.base[id][add(today,i)]='D';});
S.base.e3={};for(let i=0;i<8;i++)S.base.e3[add(today,i)]='N';
S.base.e4={};for(let i=0;i<8;i++)S.base.e4[add(today,i)]='O';
S.requests.r1={id:'r1',type:'ot',empId:'e1',status:'approved',days:[{iso:today,code:'OTN',timeIn:'20:00',timeOut:'23:30'}]};
S.requests.r2={id:'r2',type:'ot',empId:'e4',status:'pending', days:[{iso:add(today,1),code:'OT3',timeIn:'17:00',timeOut:'20:00'}]};
S.requests.r3={id:'r3',type:'ot',empId:'e3',status:'approved',days:[{iso:add(today,2),code:'OTD',timeIn:'08:00',timeOut:'20:00'}]};
S.over.e2={};S.over.e2[add(today,1)]={code:'AL8'};   // chuẩn D → nghỉ phép: phải BÁO BỚT
S.rev=Date.now();
vm.runInContext('mealResetCache()',sandbox);

let pass=0,fail=0;
const chk=(n,ok,extra)=>{ok?(pass++,console.log('  ✓ '+n)):(fail++,console.log('  ✗ '+n+(extra?'  → '+extra:'')));};

console.log('\n=== DỰNG GIAO DIỆN POPUP ===');
try{
  vm.runInContext('openMealPlan()',sandbox);
  const h=store.mealBody.innerHTML;
  chk('renderMealBox chạy không lỗi', !!h && h.length>500, 'độ dài '+(h||'').length);
  chk('có tiêu đề Cơm phát sinh', h.includes('Cơm phát sinh'));
  chk('có đủ 4 thẻ bữa ăn', ['Ăn sáng','Ăn trưa','Ăn tối','Ăn khuya'].every(x=>h.includes(x)));
  chk('có bảng ngày × bữa', h.includes('meal-tbl'));
  chk('có nút cộng/trừ tay', h.includes('mealAdjBump'));
  chk('có nút Copy / Xuất Excel', h.includes('mealCopy()')&&h.includes('mealExport()'));
  chk('không lọt chuỗi "undefined"', !h.includes('undefined'), 'HTML chứa undefined');
  chk('không lọt "[object Object]"', !h.includes('[object Object]'));
}catch(e){fail++;console.log('  ✗ renderMealBox NÉM LỖI: '+e.message+'\n'+e.stack.split('\n')[1]);}

console.log('\n=== BUNG CHI TIẾT MỘT NGÀY ===');
try{
  vm.runInContext(`mealToggleDay('${today}')`,sandbox);
  const h=store.mealBody.innerHTML;
  chk('bung ngày hôm nay không lỗi', h.includes('meal-det'));
  chk('hiện tên người ăn thêm', h.includes('Nguyễn Văn A'));
}catch(e){fail++;console.log('  ✗ mealToggleDay NÉM LỖI: '+e.message);}

console.log('\n=== SỬA TAY SỐ SUẤT ===');
try{
  vm.runInContext(`mealAdjBump('${today}','ln',1)`,sandbox);
  chk('cộng tay 1 suất trưa', vm.runInContext(`mealAdjGet('${today}','ln')`,sandbox)===1);
  vm.runInContext(`mealAdjBump('${today}','ng',-5)`,sandbox);
  const auto=vm.runInContext(`mealCell(mealPlanCache,'${today}','ng').add`,sandbox);
  chk('trừ tay không cho âm quá số tự tính', vm.runInContext(`mealAdjGet('${today}','ng')`,sandbox)===-auto);
  const h=store.mealBody.innerHTML;
  chk('có nút Bỏ sửa tay sau khi sửa', h.includes('Bỏ sửa tay'));
}catch(e){fail++;console.log('  ✗ sửa tay NÉM LỖI: '+e.message);}

console.log('\n=== TÓM TẮT VĂN BẢN (gửi bếp) ===');
try{
  const txt=vm.runInContext('mealSummaryText()',sandbox);
  chk('sinh được tóm tắt', txt.includes('COM PHAT SINH'));
  chk('có mục CAN DAT THEM', txt.includes('CAN DAT THEM'));
  chk('có mục CAN BOT', txt.includes('CAN BOT'));
  console.log('\n----- bản xem thử -----\n'+txt+'\n-----------------------');
}catch(e){fail++;console.log('  ✗ mealSummaryText NÉM LỖI: '+e.message);}

console.log('\n=== LỌC / PHẠM VI ===');
try{
  vm.runInContext("mealSet('pend',false)",sandbox);
  const a=vm.runInContext('mealPlanCache.total',sandbox);
  vm.runInContext("mealSet('pend',true)",sandbox);
  const b=vm.runInContext('mealPlanCache.total',sandbox);
  chk('bỏ đơn chờ duyệt thì tổng giảm', b>a, a+' → '+b);
  vm.runInContext("mealSet('me',true)",sandbox);
  chk('chỉ mình tôi vẫn dựng được', store.mealBody.innerHTML.length>500);
  vm.runInContext("mealSet('me',false)",sandbox);
  vm.runInContext('mealQuick(7)',sandbox);
  chk('nút 7 ngày đặt đúng khoảng', vm.runInContext('mealTo',sandbox)===add(today,6));
  vm.runInContext('mealPeriodRest()',sandbox);
  chk('nút Hết kỳ không lỗi', vm.runInContext('mealTo',sandbox)>=today);
}catch(e){fail++;console.log('  ✗ lọc NÉM LỖI: '+e.message);}

console.log('\n=== BADGE ===');
try{
  const n=vm.runInContext('mealBadgeCount()',sandbox);
  chk('badge đếm ra số ≥ 0', typeof n==='number'&&n>=0, 'n='+n);
}catch(e){fail++;console.log('  ✗ badge NÉM LỖI: '+e.message);}

console.log('\n=== BÁO BỚT (chuẩn có, thực tế không) ===');
try{
  vm.runInContext("mealFrom=todayIso();mealTo=addDaysIso(todayIso(),6);renderMealBox()",sandbox);
  const P=vm.runInContext('mealPlanCache',sandbox);
  chk('có ghi nhận suất phải bớt', P.cut>0, 'cut='+P.cut);
  const h=store.mealBody.innerHTML;
  chk('bảng hiện số âm màu đỏ', h.includes('mcut')||h.includes('mc-cut'));
  const txt=vm.runInContext('mealSummaryText()',sandbox);
  chk('tóm tắt có mục CAN BOT', txt.includes('CAN BOT'));
  console.log('\n----- bản xem thử -----\n'+txt+'\n-----------------------');
}catch(e){fail++;console.log('  ✗ badge NÉM LỖI: '+e.message);}

console.log('\n──────────────────────────────');
console.log(pass+' đạt · '+fail+' hỏng');
process.exit(fail?1:0);
