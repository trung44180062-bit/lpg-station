/* ============================================================
 * fcst.test.js — v4.120 · DỰ BÁO TỒN KHO, TÁCH LÔ D VÀ E
 *   node tests/fcst.test.js
 *
 * Kiểm năm chỗ dễ sai nhất:
 *   A. CHỈ LÔ D VÀ E — lô P/X tuyệt đối KHÔNG được cộng vào tồn.
 *   B. LUẬT NGÀY — trừ MỌI kế hoạch có ngày SAU ngày SAP. SAP 30/8 thì trừ
 *      cả Today 31/8 lẫn Tomorrow 1/9; vừa dán SAP 31/8 thì Today 31/8 rơi
 *      ra khỏi phép tính (số SAP đã gồm hàng bán ngày đó).
 *   C. HƯỚNG BÁN — đơn export trừ lô E, đơn nội địa trừ lô D, đơn không
 *      ghi trade type thì tính về D NHƯNG phải kể tên ra.
 *   D. GHÉP LOT cho từng tỉ lệ bán: lot trong bồn → lịch sử → tạm tính.
 *   E. TÀU + HEATER tạm tính — rút lô D, không có trong Sale Plan.
 *   F. BÁN LỐ — xét THEO TỪNG LÔ và TỪNG CẤU TỬ.
 *
 * DOM giả + Firebase giả, KHÔNG cần jsdom (máy người dùng không cài được).
 * ============================================================ */
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..');
const HTML=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const IDS=new Set([...HTML.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));

const missing=new Set(), CACHE={};
function mk(id){
  return { id, innerHTML:'', textContent:'', value:'', title:'', style:{},
    className:'', dataset:{},
    classList:{ _s:new Set(), add(c){this._s.add(c)}, remove(c){this._s.delete(c)},
                contains(c){return this._s.has(c)} },
    getBoundingClientRect(){ return { top:0, bottom:40, left:10, right:900 }; },
    contains(){ return false; }, querySelector(){ return null; } };
}
global.window=global;
global.document={
  getElementById(id){ if(!IDS.has(id)) missing.add(id); return CACHE[id]||(CACHE[id]=mk(id)); },
  querySelector(){ return null; }, querySelectorAll(){ return []; },
  addEventListener(){}, hidden:false, activeElement:null
};
global.escapeHtml=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TOASTS=[]; global.toast=(m,t)=>TOASTS.push(String(t||'')+'|'+String(m||''));
global.canWrite=()=>true;
global.CURRENT_USER={ name:'Kiem thu' };
const PUSHED=[];
global.firebase={ database:()=>({ ref:(p)=>{
  if(p===undefined) return { update(pay){ PUSHED.push(pay); return Promise.resolve(); } };
  return { on:()=>{}, once:()=>Promise.resolve({val:()=>null}), off:()=>{} };
} }) };

/* _pfDeriveType lấy NGUYÊN VĂN từ wgcheck.js — không chép tay. */
(function(){
  const src=fs.readFileSync(path.join(ROOT,'js','checks','wgcheck.js'),'utf8');
  const i=src.indexOf('function _pfDeriveType(');
  const j=src.indexOf('\n}\n', i);
  if(i<0||j<0){ console.log('❌ không cắt được _pfDeriveType khỏi wgcheck.js'); process.exit(1); }
  eval(src.slice(i, j+3));
  global._pfDeriveType=_pfDeriveType;
})();

/* ── SAP giả — cột `batch` là CHỮ LÔ, giống hệt dữ liệu thật ────────
   30/08  1100: D 3.000/2.000 · E 1.000/1.000 · P 4.000/0 · X 2.000/0
          2100: D 400/400 · E 100/100        2101: D 300/300 · E 200/200
   31/08  bản dán muộn hơn, số nhỏ hơn                                */
const SAP=[];
function sap(date,sloc,batch,mat,end){ SAP.push({ date:date, sloc:sloc, batch:batch, mat:mat, end:end }); }
[['C3',3000000],['C4',2000000]].forEach(([m,v])=>sap('2026-08-30','1100','D',m,v));
[['C3',1000000],['C4',1000000]].forEach(([m,v])=>sap('2026-08-30','1100','E',m,v));
sap('2026-08-30','1100','P','C3',4000000);          /* KHÔNG được tính */
sap('2026-08-30','1100','X','C3',2000000);          /* KHÔNG được tính */
[['C3',400000],['C4',400000]].forEach(([m,v])=>sap('2026-08-30','2100','D',m,v));
[['C3',100000],['C4',100000]].forEach(([m,v])=>sap('2026-08-30','2100','E',m,v));
[['C3',300000],['C4',300000]].forEach(([m,v])=>sap('2026-08-30','2101','D',m,v));
[['C3',200000],['C4',200000]].forEach(([m,v])=>sap('2026-08-30','2101','E',m,v));
[['C3',2500000],['C4',1800000]].forEach(([m,v])=>sap('2026-08-31','1100','D',m,v));
[['C3',900000],['C4',900000]].forEach(([m,v])=>sap('2026-08-31','1100','E',m,v));
let SAPON={ '2026-08-30':1 };
global.SP={ get ROWS(){ const o={}; SAP.forEach((r,i)=>{ if(SAPON[r.date]) o['r'+i]=r; }); return o; } };

/* ── Tank Log giả — [44] Pro/Bu %Vol · [45] Pro/Bu %Wt ── */
function mkRow(lot,tank,date,vol,wt){
  const r=new Array(73).fill('');
  r[1]=lot; r[2]=tank; r[3]=date; r[44]=vol; r[45]=wt; return r;
}
const ROWS=[
  mkRow('LPG-2026-880','TK-3501','10/08/26','25.0/75.0','20.00/80.00'),  /* mẻ 25:75 CŨ */
  mkRow('LPG-2026-900','TK-3501','28/08/26','52.0/48.0','48.00/52.00'),
  mkRow('LPG-2026-901','TK-3502','29/08/26','54.0/46.0','50.00/50.00')
];
global.ENG={ get ROWS(){ return ROWS; },
  parseW3(v){ const t=String(v==null?'':v).trim(); if(!t) return null;
    const m=t.match(/(-?\d+(?:[.,]\d+)?)\s*\/\s*(-?\d+(?:[.,]\d+)?)/);
    if(m){ const a=parseFloat(m[1]), b=parseFloat(m[2]);
      if(!isFinite(a)||!isFinite(b)||Math.abs(a+b-100)>0.05) return null; return a/100; }
    const x=parseFloat(t); return (!isFinite(x)||x<=0||x>100)?null:(x>1.5?x/100:x); } };
global.SCALE={ getTkCfg(){ return { tk1:{ lot:'LPG-2026-900' }, tk2:{ lot:'LPG-2026-901' } }; } };

/* ── Today / Tomorrow Plan giả ───────────────────────────── */
const TPROWS={}, TMRROWS={};
function planMod(store){
  return { get PLAN(){ return store; }, lnkCollapse(rows){ return rows; },
           getEffectiveStatus(r){ return String(r._status||''); } };
}
global.TP=planMod(TPROWS);
global.TMR=planMod(TMRROWS);
function order(store,id,date,type,qty,st,extra){
  store[id]=Object.assign({ _oid:id, _forDate:date, type:type, qty:qty, _status:st||'' }, extra||{});
}

eval(fs.readFileSync(path.join(ROOT,'js','features','fcst.js'),'utf8'));
const S=FCST._state;
let fail=0;
const chk=(n,c,x)=>{ console.log((c?'  ✅ ':'  ❌ ')+n+(x?('  → '+x):'')); if(!c) fail++; };
const near=(n,got,want,tol)=>chk(n, Math.abs(got-want)<=tol, got+' (mong '+want+')');
const H=id=>String((CACHE[id]||{}).innerHTML||'');
const T=kg=>kg/1000;
S.pinToday('2026-08-31');

console.log('\n— A. CHỈ CỘNG LÔ D VÀ E, BỎ HẲN P / X —');
let R=FCST.calc();
chk('lay dung ngay SAP moi nhat', R.sapDay==='2026-08-30', R.sapDay);
near('D · C3 = 3.000 + 400 + 300', T(R.stock.D.c3), 3700, 0.001);
near('D · C4 = 2.000 + 400 + 300', T(R.stock.D.c4), 2700, 0.001);
near('E · C3 = 1.000 + 100 + 200', T(R.stock.E.c3), 1300, 0.001);
near('E · C4 = 1.000 + 100 + 200', T(R.stock.E.c4), 1300, 0.001);
chk('⭐ lo P va X KHONG duoc cong vao D hay E',
    T(R.stock.D.c3)===3700 && T(R.stock.E.c3)===1300);
near('… ma duoc de rieng de bang chi tiet giai thich', T(R.stock.excl.c3), 6000, 0.001);
chk('… ke ten tung lo bi bo ra', !!R.stock.exclLet['P'] && !!R.stock.exclLet['X'],
    Object.keys(R.stock.exclLet).join(','));
chk('tach rieng tung kho de doi chieu',
    T(R.stock.per['1100'].D.c3)===3000 && T(R.stock.per['2101'].E.c4)===200);
chk('chua co plan nao sau ngay SAP ⇒ chua tru gi',
    R.planMT===0 && T(R.left.D.c3)===3700 && T(R.left.E.c4)===1300);

console.log('\n— B. LUẬT NGÀY: TRỪ MỌI PLAN CÓ NGÀY SAU NGÀY SAP —');
order(TPROWS,'t1','2026-08-31','LPG Domestic (C3:50/C4:50)',100);
order(TPROWS,'t2','2026-08-31','LPG Domestic (C3:50/C4:50)',50,'done');
order(TMRROWS,'m1','2026-09-01','LPG Export (C3:50/C4:50)',200);
order(TPROWS,'old','2026-08-29','LPG Domestic (C3:50/C4:50)',999);
R=FCST.calc();
chk('SAP 30/8 ⇒ tru CA Today 31/8 LAN Tomorrow 1/9',
    R.days.map(d=>d.iso).join(',')==='2026-08-31,2026-09-01', R.days.map(d=>d.iso).join(','));
chk('… plan cua ngay TRUOC moc SAP bi bo qua', R.planMT===350, String(R.planMT));
chk('… don da can xong vao khoi DA BAN', R.loadMT===50, String(R.loadMT));
SAPON['2026-08-31']=1;
R=FCST.calc();
chk('⭐ vua dan SAP 31/8 ⇒ Today 31/8 ROI KHOI phep tinh',
    R.days.map(d=>d.iso).join(',')==='2026-09-01', R.days.map(d=>d.iso).join(','));
near('… va moc tinh chuyen sang so SAP moi (D·C3)', T(R.stock.D.c3), 2500, 0.001);
chk('… chi con tru dung Tomorrow Plan', R.planMT===200, String(R.planMT));
delete SAPON['2026-08-31'];

console.log('\n— C. ĐƠN EXPORT TRỪ LÔ E, NỘI ĐỊA TRỪ LÔ D —');
R=FCST.calc();
near('don noi dia 150 T × 50 %wt ⇒ D · C3 = 75 t', T(R.plan.D.c3), 75, 1e-9);
near('… va D · C4 = 75 t',                          T(R.plan.D.c4), 75, 1e-9);
near('don xuat khau 200 T ⇒ E · C3 = 100 t',        T(R.plan.E.c3), 100, 1e-9);
chk('⭐ hang xuat khau KHONG dung vao lo D', T(R.plan.D.c3)===75);
near('con lai D · C3 = 3.700 − 75', T(R.left.D.c3), 3625, 1e-9);
near('con lai E · C3 = 1.300 − 100', T(R.left.E.c3), 1200, 1e-9);
chk('doc huong tu chu EXPORT trong cot Type', S.rowDir({type:'LPG Export July'}).dir==='E');
chk('doc huong tu chu DOMESTIC', S.rowDir({type:'LPG Domestic'}).dir==='D');
chk('doc duoc ca chu XK / XUAT', S.rowDir({type:'Hang XK'}).dir==='E');
chk('Type khong ghi thi doc sang Note', S.rowDir({type:'LPG',note:'xuat khau'}).dir==='E');
chk('… roi moi den ten khach', S.rowDir({type:'LPG',customer:'ABC EXPORT CO'}).dir==='E');
const u=S.rowDir({type:'LPG',note:'',customer:'CTY ABC'});
chk('⭐ khong noi ra huong ⇒ tinh ve NOI DIA nhung GAN CO', u.dir==='D' && u.sure===false);
order(TPROWS,'u1','2026-08-31','LPG',40,'',{ customer:'CTY MO HO' });
R=FCST.calc();
chk('… don mo ho duoc dem rieng', R.unsureMT===40, String(R.unsureMT));
chk('… va ke ten ra de con sua', R.unsure.length===1 && /MO HO/.test(R.unsure[0].cust));
near('… nhung van tru vao lo D', T(R.plan.D.c3), 75+20, 1e-9);
FCST.render();
/* v4.123 — KHONG con chip canh bao: don khong ghi Export thi DUNG LA hang
   noi dia = lo D, day la LUAT chu khong phai phong doan. */
chk('⭐ khong con chip "unclassified" tren dai so', !/unclassified/.test(H('fcstBar')));
FCST.toggle();
chk('… va bang chi tiet cung khong con dau "assumed"', !/assumed/.test(H('fcstPanel')));
chk('… nhung phan giai thich noi ro luat', /everything else is domestic/.test(H('fcstPanel')));
FCST.toggle(0);
delete TPROWS['u1'];

console.log('\n— D. GHÉP LOT: LOT TRONG BỒN → LỊCH SỬ → TẠM TÍNH —');
R=FCST.calc();
let g=R.days[0].rows.find(r=>r.ratio==='50:50' && r.dir==='D');
chk('don 50:50 lay lot DANG TRONG BON', g.pick.src==='tank', g.pick.src);
chk('… uu tien lot MOI NHAT trong so cac lot khop',
    g.pick.lot==='LPG-2026-901', g.pick.lot+' ('+g.pick.vol.toFixed(1)+' %vol)');
near('… %wt lay dung cua lot do', g.pick.w3, 0.50, 1e-9);
order(TPROWS,'t3','2026-08-31','LPG Domestic (C3:25/C4:75)',40);
R=FCST.calc();
g=R.days[0].rows.find(r=>r.ratio==='25:75');
chk('don 25:75 khong bon nao dang giu ⇒ do LICH SU Tank Log', g.pick.src==='hist', g.pick.src);
chk('… tim ra dung me cu cung ti le', g.pick.lot==='LPG-2026-880', g.pick.lot);
near('… 40 T × 20 %wt = 8 t C3', T(g.c3), 8, 1e-9);
order(TPROWS,'t4','2026-08-31','LPG Domestic (C3:70/C4:30)',30);
R=FCST.calc();
g=R.days[0].rows.find(r=>r.ratio==='70:30');
chk('ti le chua tung tron bao gio ⇒ TAM TINH', g.pick.src==='est', g.pick.src);
near('… tam lay %wt = dung ti le ban', g.pick.w3, 0.70, 1e-9);
near('… va dem rieng phan uoc tinh', R.estMT, 30, 1e-9);
order(TPROWS,'p1','2026-08-31','LPG Domestic Pure Propane',10);
order(TPROWS,'p2','2026-08-31','Pure C4 Export',20);
R=FCST.calc();
const gp3=R.days[0].rows.find(r=>r.ratio==='Pure C3');
const gp4=R.days[0].rows.find(r=>r.ratio==='Pure C4');
chk('Pure Propane noi dia ⇒ ra C3 het, tru lo D',
    gp3 && gp3.dir==='D' && T(gp3.c3)===10 && T(gp3.c4)===0);
chk('Pure Butane xuat khau ⇒ ra C4 het, tru lo E',
    gp4 && gp4.dir==='E' && T(gp4.c4)===20 && T(gp4.c3)===0);

console.log('\n— E. TÀU + HEATER TẠM TÍNH (rút lô D, không có trong plan) —');
PUSHED.length=0;
FCST.setExtra('2026-08-31','shipC3',120000);
FCST.setExtra('2026-08-31','htrC3',30000);
FCST.setExtra('2026-08-31','shipC4',60000);
R=FCST.calc();
near('cong don tau + heater vao mot khoan tru rieng', T(R.other.c3), 150, 1e-9);
near('… ca phan C4',                                  T(R.other.c4), 60, 1e-9);
chk('⭐ chi tru vao lo D, KHONG dung toi lo E',
    Math.abs(T(R.stock.D.c3)-T(R.plan.D.c3)-150-T(R.left.D.c3))<1e-6 &&
    Math.abs(T(R.stock.E.c3)-T(R.plan.E.c3)-T(R.left.E.c3))<1e-6);
chk('… ghi len Firebase theo NGAY', !!(PUSHED[0]||{})['fcst_extra/2026-08-31'],
    Object.keys(PUSHED[0]||{}).join(' '));
chk('… luu ca nguoi go', ((PUSHED[PUSHED.length-1]||{})['fcst_extra/2026-08-31']||{}).by==='Kiem thu');
FCST.setExtra('2026-08-31','shipC3','');
R=FCST.calc();
near('xoa trang mot o thi tru di dung o do', T(R.other.c3), 30, 1e-9);
FCST.setExtra('2026-08-31','htrC3','');
FCST.setExtra('2026-08-31','shipC4','');
chk('xoa het thi bo han ban ghi cua ngay do',
    (PUSHED[PUSHED.length-1]||{})['fcst_extra/2026-08-31']===null);
chk('… va khoan tru ve 0', T(FCST.calc().other.c3)===0);
FCST.setExtra('2026-08-31','shipC3',120000);
/* ngay chua co don nao nhung da go tam tinh thi VAN phai hien */
FCST.setExtra('2026-09-05','shipC4',50000);
R=FCST.calc();
chk('ngay chi co so tam tinh, chua co don ⇒ van hien ra',
    R.days.some(d=>d.iso==='2026-09-05'), R.days.map(d=>d.iso).join(','));
near('… va van duoc tru', T(R.other.c4), 50, 1e-9);
FCST.setExtra('2026-09-05','shipC4','');

console.log('\n— F. BÁN LỐ — XÉT THEO TỪNG LÔ, TỪNG CẤU TỬ —');
R=FCST.calc();
chk('binh thuong thi khong bao gi', R.over.length===0, JSON.stringify(R.over));
order(TMRROWS,'big','2026-09-01','LPG Export (C3:50/C4:50)',3000);
R=FCST.calc();
chk('⭐ lo E ban lo ⇒ bat co', R.over.length>0, JSON.stringify(R.over.map(o=>o.let_+o.mat)));
chk('… goi dung ten lo E chu khong phai D',
    R.over.every(o=>o.let_==='E'), R.over.map(o=>o.let_).join(','));
chk('… va lo D van con duong', R.left.D.c3>0 && R.left.D.c4>0);
FCST.render();
const bar=H('fcstBar');
chk('dai so hien chu OVERSOLD kem ten lo va cau tu', /OVERSOLD/.test(bar) && /E·C3/.test(bar), 
    (bar.match(/OVERSOLD[^<]*/)||[''])[0]);
chk('⭐ dai so tach thanh HAI KHOI, mot khoi mot lo',
    /fc-b b-D/.test(bar) && /fc-b b-E/.test(bar));
chk('⭐ dai so noi ro dang du doan ton cua NGAY NAO',
    /STOCK FORECAST/.test(bar) && /SAP 30\/08\/26/.test(bar) &&
    /left after 31\/08\/26 \+ 01\/09\/26/.test(bar),
    (bar.match(/→ left after [^<]*/)||[''])[0]);
chk('⭐ xep NGANG: hang la cau tu, cot la tung buoc tinh (cao dung 3 dong)',
    /<tr class="hd">/.test(bar) && /<tr class="m3">/.test(bar) && /<tr class="m4">/.test(bar) &&
    (bar.match(/<tr /g)||[]).length===6, String((bar.match(/<tr /g)||[]).length)+' hang cho 2 khoi');
chk('… moi khoi doc tu tren xuong la ca phep tinh',
    /STOCK 30\/08\/26/.test(bar) && /SOLD/.test(bar) && /TO SELL/.test(bar) &&
    /VES\/HTR/.test(bar) && /= LEFT/.test(bar));
chk('… khoi E danh dau la ban lo, khoi D thi khong',
    /fc-b b-E bad/.test(bar) && !/fc-b b-D bad/.test(bar));
chk('… hang VESSEL+HTR o khoi E in dau gach (chi rut lo D)',
    (bar.split('fc-b b-E')[1]||'').indexOf('dash')>0);
chk('… dai so doi sang mau canh bao', (CACHE['fcstBar']||{}).className==='fc-bar bad',
    (CACHE['fcstBar']||{}).className);
FCST.toggle();
const pan=H('fcstPanel');
chk('bang chi tiet noi thang rui ro bom nham hang chua thong quan',
    /NOT cleared customs/.test(pan) && /uncleared product/.test(pan));
chk('… noi ro vi sao bo lo P / X ra', /FEED OL1/.test(pan) && /left out on purpose/i.test(pan));
chk('… co bon cot D·C3 D·C4 E·C3 E·C4', /D · C3/.test(pan) && /E · C4/.test(pan));
chk('… co o nhap tau va heater', /Vessel C3/.test(pan) && /Heater C3/.test(pan) && /FCST.setExtra/.test(pan));
chk('… co o chon lot cho tung ti le', /FCST.setLot/.test(pan));
chk('… gan nhan lo D / E cho tung nhom don', /fc-let l-D/.test(pan) && /fc-let l-E/.test(pan));
delete TMRROWS['big'];

console.log('\n— G. BẢNG ĐẦY ĐỦ TRONG TAB SAP —');
FCST.render();
const full=H('fcstFull');
chk('tab SAP co bang tinh day du', full.length>1000, String(full.length)+' ky tu');
chk('… dung CHUNG mot ban tinh voi tam tha xuong (cung noi dung)',
    /Customs-cleared stock/.test(full) && /LEFT after the whole plan/.test(full));
chk('⭐ ba con so quan trong duoc dua len dau, chu TO',
    /fc-keys/.test(full) && /fc-b b-D big/.test(full) && /fc-b b-E big/.test(full));
chk('… va bang tong ket danh dau dong tra loi cau hoi',
    /fc-key/.test(full) && /coming off the plan/.test(full));
chk('… co o nhap tau / heater rieng, id KHONG dung voi tam tha xuong',
    /id="fcx-f-2026-08-31-shipC3"/.test(full) && /id="fcx-p-2026-08-31-shipC3"/.test(H('fcstPanel')));
chk('… co dong pham vi dang tinh', /SAP 30\/08\/26/.test((CACHE['fcstFullScope']||{}).textContent||''),
    (CACHE['fcstFullScope']||{}).textContent);
/* bỏ chú thích trước khi soi — trong chú thích vẫn nhắc tên bảng cũ để
   người đọc mã sau này biết chỗ đó từng là gì */
const HTML_NC=HTML.replace(/<!--[\s\S]*?-->/g,'');
chk('bang SAP STOCK SUMMARY cu da bo khoi markup',
    HTML_NC.indexOf('SAP STOCK SUMMARY')<0 && HTML_NC.indexOf('spAnTbody')<0 &&
    HTML_NC.indexOf('sp-an-tbl')<0);
chk('SP.renderAnalysis chi con la cau noi sang FCST',
    /FCST\.schedule/.test(fs.readFileSync(path.join(ROOT,'js','data','sp.js'),'utf8')
      .split('function renderAnalysis(){')[1].split('}')[0]));

console.log('\n— G2. ĐANG GÕ THÌ KHÔNG ĐƯỢC DỰNG LẠI —');
document.activeElement={ id:'fcx-f-2026-08-31-shipC3' };
CACHE['fcstPanel'].innerHTML='ĐANG GÕ';
CACHE['fcstFull'].innerHTML='ĐANG GÕ';
FCST.render();
chk('⭐ o nhap dang focus ⇒ bo qua luot ve (khong mat con tro)',
    H('fcstPanel')==='ĐANG GÕ' && H('fcstFull')==='ĐANG GÕ');
document.activeElement=null;
FCST.render();
chk('… roi o thi ve lai binh thuong', H('fcstPanel').length>500 && H('fcstFull').length>500);

console.log('\n— H. CHƯA CÓ SỐ SAP —');
const keep=Object.assign({},SAPON);
Object.keys(SAPON).forEach(k=>delete SAPON[k]);
FCST.render();
chk('khong co SAP ⇒ khong doan bua', FCST.calc().ok===false);
chk('… va noi ro phai dan ZMMFR022 o dau', /ZMMFR022/.test(H('fcstBar')));
Object.assign(SAPON,keep);

console.log('\n— I. GIAO DIỆN + NGÔN NGỮ —');
FCST.render(); FCST.toggle(); FCST.toggle(); FCST.toggle();
chk('render() khong goi id nao vang trong index.html', missing.size===0, [...missing].join(', '));
chk('markup co dai so va tam chi tiet', IDS.has('fcstBar') && IDS.has('fcstPanel'));
const DIA=/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
const shown=[H('fcstBar'),H('fcstPanel')].join(' ');
chk('chu hien thi thuan tieng Anh', !DIA.test(shown), (shown.match(DIA)||[''])[0]);
const CSS=fs.readFileSync(path.join(ROOT,'css','core.css'),'utf8');
['.fc-bar','.fc-m td.neg','.fc-panel','.fc-let.l-E','.fc-x input','.fc-b.b-D','.fc-b.b-E',
  '.fc-fullwrap','.fc-full','.fc-warn.bad','.fc-m td.lf','.fc-b.big','.fc-keys',
  '.fc-tbl tr.fc-key td','.fc-cap b','.fc-cap u']
  .forEach(c=>chk('css co '+c, CSS.indexOf(c)>=0));
chk('index.html nap fcst.js + core.css + sp.js ban 4124',
    /fcst\.js\?v=4124/.test(HTML) && /core\.css\?v=4124/.test(HTML) && /sp\.js\?v=4124/.test(HTML));
chk('⭐ bang ben tab SAP MAC DINH AN (da co san ben Scale)',
    /class="fc-fullwrap collapsed"/.test(HTML) && />Show forecast</.test(HTML) &&
    /let _analysisVisible = false/.test(fs.readFileSync(path.join(ROOT,'js','data','sp.js'),'utf8')));
chk('… bam Show thi ve ngay (renderFull bo qua khi dang collapsed)',
    /FCST\.renderFull\(\)/.test(fs.readFileSync(path.join(ROOT,'js','data','sp.js'),'utf8')));
chk('tab SAP co bo loc theo Mat', /id="spMatFilter"/.test(HTML) &&
    /C3 · Propane/.test(HTML) && /C4 · Butane/.test(HTML));
const SPJS=fs.readFileSync(path.join(ROOT,'js','data','sp.js'),'utf8');
chk('… loc Mat AND voi moi bo loc con lai',
    /if\(matFilter\)\s+arr=arr\.filter/.test(SPJS));
chk('… co trong nhan pham vi cua dai Σ TỔNG', /parts\.push\('⚗ '\+matFilter\)/.test(SPJS));
chk('… va bi ✕ Reset xoa cung cac bo loc khac', /matFilter=''/.test(SPJS) &&
    /'spMatFilter'/.test(SPJS));
chk('… co listener doi bo loc', /spMatFilter'\)\.addEventListener/.test(SPJS));
const BOOT=fs.readFileSync(path.join(ROOT,'js','boot.js'),'utf8');
chk('boot khoi dong FCST SAU SCX2', BOOT.indexOf('FCST.init()')>BOOT.indexOf('SCX2.init()'));
const SCJS=fs.readFileSync(path.join(ROOT,'js','features','scale.js'),'utf8');
chk('SCALE ve lai dai so moi khi plan / ton doi', /FCST\.schedule\(\)/.test(SCJS));
const CAV=fs.readFileSync(path.join(ROOT,'js','features','cav.js'),'utf8');
chk('⚠ bo tu khoa huong ban van khop voi cav.js (Daily Stock)',
    /EX\|EXPORT\|수출\|XK\|XUAT/.test(CAV) &&
    /EX\|EXPORT\|수출\|XK\|XUAT/.test(fs.readFileSync(path.join(ROOT,'js','features','fcst.js'),'utf8')));

console.log(fail?('\n❌ '+fail+' assert HỎNG'):'\n✅ TẤT CẢ ĐỀU PASS');
process.exit(fail?1:0);
