/* ============================================================
 * order-link-dom.smoke.js — plan.js v4.109
 * ------------------------------------------------------------
 *   node tests/order-link-dom.smoke.js     (chạy từ thư mục gốc repo)
 * Mở THẬT hộp thoại 🔗 Link Orders trong một DOM giả để bắt
 * ReferenceError / lỗi dựng HTML — thứ mà test thuần logic
 * (order-link.test.js) không đụng tới. Kiểm nguyên vòng đời:
 * mở hộp thoại → tick 3 dòng → link ALT → tổng về 25 MT → gỡ link
 * → tổng trở lại 75 MT.
 * ============================================================ */
/* smoke: mở hộp thoại 🔗 Link Orders trong DOM giả — bắt ReferenceError */
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..');
const SRC=fs.readFileSync(path.join(ROOT,'js','features','plan.js'),'utf8');
const DOM={};
function el(id){const e={id,value:'',textContent:'',innerHTML:'',_cls:{},style:{},children:[],
  addEventListener(){},focus(){},appendChild(){},remove(){},querySelector:()=>null,querySelectorAll:()=>[]};
  e.classList={add(c){e._cls[c]=1;},remove(c){delete e._cls[c];},contains(c){return !!e._cls[c];},toggle(){}};return e;}
global.window=global;
const CREATED=[];
const REAL=new Set(['tpLinkBody','tpLinkFoot']);
global.document={getElementById(id){ if(!DOM[id]) DOM[id]=el(id); return DOM[id]; },
  createElement(){const e=el('_new');CREATED.push(e);return e;},
  querySelector:()=>null,querySelectorAll:()=>[],body:{appendChild(n){DOM[n.id]=n;}},head:{appendChild(){}},
  hidden:true,addEventListener(){}};
global.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
global.toast=(m,t)=>console.log('  toast:',t||'',m);
global.confirm=()=>true; global.canWrite=()=>true; global.logAudit=()=>{};
global.escapeHtml=s=>String(s==null?'':s);
global.CURRENT_USER={name:'t'};
global.isTempOid=v=>/^[A-Z]{3}\d{6,}$/.test(String(v||''));
global.cleanDO=v=>String(v||'').trim();
global.lastEditFormatter=()=>'';
global.Tabulator=function(){return{on(){},destroy(){},replaceData(){},redraw(){},getRow:()=>null,getRows:()=>[]};};
global.setInterval=()=>0;
global.DB_SC={stations:{}};
global.dosOverlap=()=>false;
global.TL={getIndex:()=>({byKey:new Map()})};
const th={then(f){f&&f();return th;},catch(){return th;},finally(f){f&&f();return th;}};
function ref(){return{on(){},once(){return{then(f){f&&f({val:()=>({})});return th;},catch(){return th;},finally(f){f&&f();return th;}};},update(){return th;},child(){return ref();}};}
global.firebase={database(){return{ref(){return ref();}};}};
const {TP}=eval(SRC+'\n;({TP:TP,TMR:TMR})');
TP.init();
/* 3 dòng cùng khách, 25 MT */
['A','B','C'].forEach((k,i)=>{ TP.PLAN['O'+k]={_oid:'O'+k,doNum:'900000'+i,customer:'ACME',plate:'51C-'+i,
  driver:'D'+i,qty:'25',tolerance:'25.3',_forDate:'2026-08-25',_seq:i,_autoSync:true,_status:'',allowLoad:'OK'}; });
/* DOM giả cho hộp thoại: openLink tạo bg rồi tìm body/foot theo id */
TP.openLink();
let fail=0;
function ok(name,cond,extra){ if(cond) console.log('  ✓ '+name);
  else { fail++; console.log('  ✗ '+name+(extra?'  →  '+extra:'')); } }
const body=DOM['tpLinkBody'].innerHTML, foot=DOM['tpLinkFoot'].innerHTML;
ok('hộp thoại dựng được 3 dòng kế hoạch', (body.match(/class="lnk-row/g)||[]).length===3);
ok('phần chú thích ALT / MULTI-DO có mặt', /Alternate trucks/.test(body) && /Multi-DO/.test(body));
ok('chân hộp thoại có đủ 2 nút link', /lnk-btn alt/.test(foot) && /lnk-btn mdo/.test(foot));
ok('chưa tick thì 2 nút bị khoá', (foot.match(/disabled/g)||[]).length===2);
TP.lnkToggleSel('OA',true); TP.lnkToggleSel('OB',true); TP.lnkToggleSel('OC',true);
ok('tick 3 dòng thì nút mở khoá', !/disabled/.test(DOM['tpLinkFoot'].innerHTML));
TP.lnkApply('alt');
const t1=TP.lnkTotals(Object.values(TP.PLAN));
ok('link ALT xong: PLAN 25 MT', t1.planMT===25, 'got '+t1.planMT);
ok('link ALT xong: 1 đơn', t1.planCnt===1, 'got '+t1.planCnt);
ok('dòng đại diện có chip ★', /★/.test(TP.lnkBadgeHtml(TP.PLAN['OA'])));
TP.openLink();   /* vẽ lại ngay (bản vẽ lại sau lnkApply chạy qua setTimeout) */
const body2=DOM['tpLinkBody'].innerHTML;
ok('hộp thoại có mục "Existing groups"', /Existing groups/.test(body2));
ok('nhóm hiện đúng nhãn ALTERNATE TRUCKS', /ALTERNATE TRUCKS/.test(body2));
ok('có nút ✂ Unlink', /Unlink/.test(body2));
ok('dòng đã link bị khoá ô tick', /lnk-row linked/.test(body2) && /disabled/.test(body2));
TP.lnkUnlink(TP.lnkGid(TP.PLAN['OA']));
ok('gỡ link xong: PLAN trở lại 75 MT', TP.lnkTotals(Object.values(TP.PLAN)).planMT===75);
console.log('\n'+(fail?('❌ '+fail+' SMOKE FAILED'):'✅ SMOKE OK')+'\n');
process.exit(fail?1:0);
