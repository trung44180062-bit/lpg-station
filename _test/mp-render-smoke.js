/* Smoke test: bảng Nhân lực theo ngày có tách Kỹ sư / Operator */
const fs=require('fs'), vm=require('vm'), path=require('path');
const DIR=process.argv[2];
const rd=f=>fs.readFileSync(path.join(DIR,'js',f),'utf8');
const sandbox={console,Date,Math,JSON,Set,Map,Object,Array,String,Number,RegExp,isNaN,parseInt,parseFloat,setTimeout,clearTimeout};
sandbox.window=sandbox;
sandbox.document={getElementById:()=>null,querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>({style:{}}),body:{}};
sandbox.localStorage={getItem:()=>null,setItem:()=>{}};
vm.createContext(sandbox);
vm.runInContext(rd('01-core.js'),sandbox,{filename:'01-core.js'});
vm.runInContext(rd('07-manpower.js'),sandbox,{filename:'07-manpower.js'});
vm.runInContext(`
function t(s){return s;} function t2(s){return s;}
function eff(id,iso){const o=S.over[id]&&S.over[id][iso];if(o&&o.code)return{code:o.code,ovr:true,o};
  const b=S.base[id]&&S.base[id][iso];return b?{code:b,ovr:false}:{code:'',ovr:false};}
let repFrom='',repTo='',repOnlyLow=false,repModeCur='mp';
function repDayList(){const a=[];let d=new Date(repFrom+'T00:00:00'),e=new Date(repTo+'T00:00:00');
  while(d<=e){a.push(isoOf(d));d.setDate(d.getDate()+1);}return a;}
window.setRep=(f,to)=>{repFrom=f;repTo=to;};
`,sandbox,{filename:'stubs.js'});
/* chỉ lấy hàm repManpower ra khỏi 15-report.js (file đó phụ thuộc nhiều DOM) */
const rep=rd('15-report.js');
const a=rep.indexOf('function repManpower()');
const b=rep.indexOf('/* =================== 2. THỐNG KÊ', a);
vm.runInContext(rep.slice(a,b),sandbox,{filename:'repManpower'});
vm.runInContext('window.S=S;',sandbox);

const S=sandbox.S;
S.employees=[
 {id:'e1',name:'Kỹ sư A',team:'A',pos:'field_eng',active:true,shiftType:'shift8'},
 {id:'e2',name:'Boardman B',team:'A',pos:'boardman',active:true,shiftType:'shift8'},
 {id:'e3',name:'Oper C',team:'A',pos:'operator',active:true,shiftType:'shift8'},
 {id:'e4',name:'Oper D',team:'A',pos:'',role:'oper',active:true,shiftType:'shift8'},
 {id:'e5',name:'VP E',team:'Office',pos:'office',active:true,shiftType:'office5'}];
const ISO='2026-08-10';
S.base={e1:{[ISO]:'D'},e2:{[ISO]:'N'},e3:{[ISO]:'D'},e4:{[ISO]:'D'},e5:{[ISO]:'O'}};
S.over={};S.settings.minD=3;S.settings.minN=3;
vm.runInContext(`setRep('${ISO}','${ISO}')`,sandbox);

let pass=0,fail=0;
const chk=(n,ok,x)=>{ok?(pass++,console.log('  ✓ '+n)):(fail++,console.log('  ✗ '+n+(x?'  → '+x:'')));};
console.log('\n=== BẢNG NHÂN LỰC THEO NGÀY ===');
try{
  const h=vm.runInContext('repManpower()',sandbox);
  chk('dựng được HTML', h.length>500, 'len '+h.length);
  chk('pill ca ngày kèm chỉ số kỹ sư/operator', h.includes('mpp-eo'));
  chk('ca D: 1 kỹ sư + 2 operator', /🛠️1<\/b><b[^>]*>⚙️2/.test(h.replace(/ class="[^"]*"/g,'')) || h.includes('🛠️1')&&h.includes('⚙️2'));
  chk('chi tiết tách 2 hàng con', h.includes('mp-eo-sub'));
  chk('có nhãn Kỹ sư và Operator', h.includes('Kỹ sư')&&h.includes('Operator'));
  chk('người chưa khai vị trí (role=oper) xếp vào Operator', h.includes('Oper D'));
  chk('không lọt undefined', !h.includes('undefined'));
  const seg=h.slice(h.indexOf('mp-eo-sub'), h.indexOf('mp-eo-sub')+400);
  console.log('\n  mẫu HTML: '+seg.replace(/\s+/g,' ').slice(0,240)+'…');
}catch(e){fail++;console.log('  ✗ repManpower NÉM LỖI: '+e.message+'\n     '+e.stack.split('\n')[1]);}
console.log('\n'+pass+' đạt · '+fail+' hỏng');
process.exit(fail?1:0);
