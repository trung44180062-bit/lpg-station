/* Harness kiểm tra logic bản v58: ca kép · thu hồi thông báo · sự kiện.
   Chạy: node _test/harness-v58.js  (từ thư mục LPGT-CongCa-Web)
   Cách làm: nối các file JS thuần logic lại rồi chạy CHUNG một scope với
   phần kiểm thử — vì `let S` / `const ...` ở 01-core.js là khai báo lexical,
   không gắn vào globalThis nên không với tới được từ ngoài vm. */
const fs=require('fs'),vm=require('vm');
const ctx={console,setTimeout,clearTimeout,Date,Math,JSON,
  localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
  document:{getElementById:()=>null,querySelectorAll:()=>[],querySelector:()=>null,
            createElement:()=>({}),addEventListener:()=>{}},
  matchMedia:()=>({matches:false}),
  confirm:()=>true,prompt:()=>'',alert:()=>{},process};
ctx.window=ctx;ctx.globalThis=ctx;ctx.APP_CFG={};
vm.createContext(ctx);
const src=f=>fs.readFileSync(f,'utf8');
const acc=src('js/10-account.js');
const calcStatsSrc=acc.slice(acc.indexOf('function calcStats'),acc.indexOf('const rnd1=',acc.indexOf('function calcStats')))
  +'const rnd1=v=>Math.round(v*10)/10;';
const tests=src('_test/harness-v58.tests.js');
const port=src('js/13-portal.js');
const revokeSrc=port.slice(port.indexOf('function revokeSchedChange'),
                           port.indexOf('/* Nhân viên XÁC NHẬN',port.indexOf('function revokeSchedChange')));
const stub=`
  var t=s=>s, t2=s=>s, LANG='vi';
  var toast=()=>{};
  /* vài helper ngày tháng nằm trong 13-portal.js (file nặng DOM) — chép lại đúng bản gốc */
  function addDaysIso(iso,n){const d=new Date(iso+'T00:00:00');d.setDate(d.getDate()+n);return isoOf(d);}
  function mondayOf(iso){const d=new Date(iso+'T00:00:00');const wd=(d.getDay()+6)%7;d.setDate(d.getDate()-wd);return isoOf(d);}
  function newNotif(o){const id=uid();S.notifs[id]=Object.assign({id,status:'pending',createdAt:Date.now()},o);return id;}
  var _me='', meId=()=>_me;
  var save=()=>{S.rev=Date.now();};
`;
const all=[src('js/01-core.js'),stub,src('js/04-schedule.js'),src('js/07-manpower.js'),
  src('js/08-requests.js'),src('js/19-meal.js'),src('js/20-events.js'),
  calcStatsSrc,revokeSrc,tests].join('\n;\n');
vm.runInContext(all,ctx,{filename:'harness-v58'});

