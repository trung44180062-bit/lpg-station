/* ============================================================
 * bond-archive.test.js — v4.118 · SỔ THEO DÕI LÔ + KHO LƯU TRỮ
 *   node tests/bond-archive.test.js
 *
 * Kiểm đúng hai yêu cầu vận hành:
 *  A. LÔ KHÔNG ĐƯỢC BIẾN MẤT THEO SAP.
 *     Mã batch từng có trong SAP rồi những ngày sau không còn — hoặc còn mà
 *     về 0 — mà CHƯA tích VASSCM thì phải luôn hiện, ghim lên đầu bảng, màu
 *     cảnh báo, kể cả khi chưa ai gõ một chữ nào cho lô đó.
 *  B. KHO LƯU TRỮ.
 *     Lô đã tích VASSCM VÀ đã rời SAP thì chờ 7 ngày rồi tự dời sang
 *     Firebase; không nạp về khi mở app; gọi về theo tháng (tháng của NGÀY
 *     VASSCM); xoá theo tháng / theo năm; hiện số lô đang lưu.
 *
 * Dùng lại khuôn DOM giả của bond-dom.smoke.js — không cần jsdom.
 * ============================================================ */
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..');
const HTML=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const pane=HTML.split('id="sub-sap"')[1].split('<!-- Customer sub-pane')[0];
const IDS=new Set([...pane.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));

const missing=new Set(), CACHE={};
const HOLDER={ scrollTop:0, scrollLeft:0 };
function mk(id){
  const base={ id, innerHTML:'', textContent:'', value:'', title:'', style:{}, dataset:{},
    classList:{ _s:new Set(), add(c){this._s.add(c)}, remove(c){this._s.delete(c)},
                toggle(c,v){ v?this._s.add(c):this._s.delete(c) }, contains(c){return this._s.has(c)} },
    querySelector(){ return null; }, focus(){}, blur(){} };
  if(id==='bondGrid') base.querySelector=sel=>(sel==='.tabulator-tableholder'?HOLDER:null);
  return base;
}
global.window=global;
global.document={
  getElementById(id){ if(!IDS.has(id)) missing.add(id); return CACHE[id]||(CACHE[id]=mk(id)); },
  querySelector(){ return null; }, querySelectorAll(){ return []; }
};
global.escapeHtml=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TOASTS=[];
global.toast=(m,t)=>TOASTS.push(String(t||'')+'|'+String(m||''));
let CONFIRM=true; const ASKED=[];
global.confirm=m=>{ ASKED.push(String(m)); return (typeof CONFIRM==='function')?CONFIRM(m):CONFIRM; };
global.canWrite=()=>true;
global.CURRENT_USER={ name:'Kiem thu' };

/* ── Firebase giả: ghi lại MỌI payload update(), và trả dữ liệu cho once() ── */
const PUSHED=[]; const ONCE={};
global.firebase={ database:()=>({ ref:(p)=>{
  if(p===undefined) return { update(pay){ PUSHED.push(pay); return Promise.resolve(); } };
  return { once:()=>Promise.resolve({ val:()=>(ONCE[p]===undefined?null:ONCE[p]) }),
           on:()=>{}, off:()=>{} };
} }) };

/* ── Tabulator giả ── */
let TCFG=null;
const ROWOBJ=(d,i)=>({ getData:()=>d, getPosition:()=>i+1,
  getElement:()=>({ classList:{ _s:new Set(),
    add(c){this._s.add(c)}, remove(c){this._s.delete(c)}, contains(c){return this._s.has(c)},
    [Symbol.iterator](){ return this._s[Symbol.iterator](); } } }) });
global.Tabulator=function(sel,cfg){
  TCFG=cfg;
  this.destroy=()=>{};
  this.replaceData=d=>{ TCFG.data=d; return Promise.resolve(); };
  this.updateData=d=>{ TCFG.data=d; return Promise.resolve(); };
  this.getRows=()=>(TCFG.data||[]).map(ROWOBJ);
  this.getData=()=>TCFG.data||[];
  this.on=(ev,fn)=>{ if(ev==='tableBuilt') fn(); };
};

/* ── SAP giả — dựng đúng kịch bản vận hành mô tả ─────────────────
   ngày 10 → 18/08. Bốn mã batch:
     C3 260810P001  có đủ mọi ngày, còn hàng          → chạy bình thường
     C3 260811X001  chỉ có tới 14/08 rồi BIẾN MẤT     → chưa VASSCM ⇒ phải ghim
     C4 260812D001  có đủ mọi ngày nhưng End = 0      → chưa VASSCM ⇒ phải ghim
     C4 260813E001  chỉ có tới 12/08 rồi biến mất     → ĐÃ VASSCM   ⇒ lưu trữ  */
const DAYS=[]; for(let d=10; d<=18; d++) DAYS.push('2026-08-'+String(d).padStart(2,'0'));
const SAP=[];
DAYS.forEach(d=>{
  SAP.push({ date:d, mat:'C3', bcode:'260810P001', init:900000, gr:0, gi:0, trs:0, end:500000 });
  if(d<='2026-08-14')
    SAP.push({ date:d, mat:'C3', bcode:'260811X001', init:400000, gr:0, gi:0, trs:0, end:120000 });
  SAP.push({ date:d, mat:'C4', bcode:'260812D001', init:300000, gr:0, gi:0, trs:0,
             end:(d==='2026-08-18'?0:200000) });
  if(d<='2026-08-12')
    SAP.push({ date:d, mat:'C4', bcode:'260813E001', init:250000, gr:0, gi:0, trs:0, end:80000 });
});
global.SP={
  batch1100(from,to){ const rows=[];
    SAP.forEach(r=>{ const d=r.date; if(from&&d<from) return; if(to&&d>to) return;
      rows.push({ mat:r.mat, batch:r.bcode, date:d, init:r.init, gr:r.gr, gi:r.gi, trs:r.trs, end:r.end }); });
    return { rows, legacy:0, dates:[] }; },
  dates1100(){ return DAYS.slice(); },
  rebuildTableData(){}, get table(){ return null; }
};

eval(fs.readFileSync(path.join(ROOT,'js','features','bond.js'),'utf8'));
const S=BOND._state;
let fail=0;
const chk=(n,c,x)=>{ console.log((c?'  ✅ ':'  ❌ ')+n+(x?('  → '+x):'')); if(!c) fail++; };
const H=id=>String((CACHE[id]||{}).innerHTML||'');
const ALL=()=>S.all();
const row=b=>ALL().find(r=>r.bcode===b);
const wait=()=>new Promise(r=>setTimeout(r,15));
const allPushed=()=>Object.assign({},...PUSHED);

/* Hôm nay 19/08 ⇒ D-1 = 18/08 = ngày SAP mới nhất. Ghim ngày để bộ test
   không đổi kết quả theo đồng hồ thật (bẫy đã dính ở bond.test.js). */
S.pinToday('2026-08-19');
S.setMonth('2026-08');
S.markLoaded();

(async function(){

console.log('\n— A. SỔ THEO DÕI TỰ GHI LÔ ĐANG THẤY TRONG SAP —');
BOND.render();
const w0=allPushed();
chk('lo dang co trong SAP duoc ghi vao so theo doi',
    !!w0['knq_watch/C3_260810P001'], Object.keys(w0).filter(k=>k.indexOf('knq_watch/')===0).join(' '));
chk('… so ghi dung NGAY SAP moi nhat',
    (w0['knq_watch/C3_260810P001']||{}).last==='2026-08-18');
chk('… va ghi so End cua ngay do', (w0['knq_watch/C3_260810P001']||{}).end===500000);
chk('… lo KHONG con trong SAP ngay 18 thi khong duoc ghi moi',
    !w0['knq_watch/C4_260813E001']);
const n1=PUSHED.length;
BOND.render();
chk('ve lai lan nua KHONG de them luot ghi (so khong doi)', PUSHED.length===n1, PUSHED.length+' luot');

console.log('\n— B. LÔ RỜI SAP MÀ CHƯA VASSCM: KHÔNG ĐƯỢC BIẾN MẤT —');
/* Giả lập phiên trước đã ghi sổ hai lô nay không còn trong SAP ngày 18 */
S.WATCH['C3_260811X001']={ mat:'C3', bcode:'260811X001', first:'2026-08-11', last:'2026-08-14', end:120000 };
S.WATCH['C4_260813E001']={ mat:'C4', bcode:'260813E001', first:'2026-08-12', last:'2026-08-12', end:80000 };
BOND.render();
const gone=row('260811X001');
chk('lo da roi SAP van hien tren bang du CHUA AI GO gi', !!gone);
chk('… mang trang thai gone', gone && gone.st==='gone', gone&&gone.st);
chk('… duoc GHIM len dau', gone && gone.pin===true);
chk('… nho ngay cuoi con thay trong SAP', gone && gone.lastSeen==='2026-08-14', gone&&gone.lastSeen);
chk('… va giu so End cuoi cung da biet', gone && Number(gone.end)===120000);
chk('… danh dau la dung tu so theo doi', gone && gone.watched===true);

const zero=row('260812D001');
chk('lo CON trong SAP nhung End = 0 va chua VASSCM ⇒ emptied',
    zero && zero.st==='emptied', zero&&zero.st);
chk('… cung duoc GHIM len dau', zero && zero.pin===true);

const order=ALL().map(r=>r.bcode);
const pins=ALL().filter(r=>r.pin).length;
chk('moi dong ghim dung TRUOC moi dong khong ghim',
    ALL().slice(0,pins).every(r=>r.pin) && ALL().slice(pins).every(r=>!r.pin), order.join(' · '));
chk('lo dang chay binh thuong KHONG bi ghim', row('260810P001').pin===false);

console.log('\n— C. TÍCH VASSCM LÀ ĐƯỜNG RA DUY NHẤT —');
S.INFO['C4_260813E001']={ vas:true, vasDate:'2026-08-12', vessel:'MAPLE GAS', dOut:'GO-77' };
/* ⚠ Lượt vẽ NGAY SAU ĐÂY đã đủ điều kiện lưu trữ (archDue = hôm nay) nên
   nó cũng chính là lượt ghi kho lưu trữ — mục E đọc lại PUSHED từ đây, chứ
   xoá PUSHED ở đầu mục E là xoá mất đúng cái cần soi. */
PUSHED.length=0;
BOND.render();
const arc=row('260813E001');
chk('lo da roi SAP + da VASSCM ⇒ archiving', arc && arc.st==='archiving', arc&&arc.st);
chk('… KHONG con bi ghim (het viec phai lam)', arc && arc.pin===false);
chk('… hen ngay luu tru = ngay cuoi thay trong SAP + 7',
    arc && arc.archDue==='2026-08-19', arc&&arc.archDue);
chk('hang so cho dung 7 ngay', S.ARCH_WAIT_DAYS===7);
chk('⭐ lo CHUA VASSCM khong bao gio duoc hen luu tru', !row('260811X001').archDue);
chk('… va _archDueOf tu choi luon', S.archDueOf({ inSap:false, vas:false, lastSeen:'2026-01-01' })==='');

console.log('\n— D. THÁNG GOM = THÁNG CỦA NGÀY VASSCM —');
chk('co ngay VASSCM ⇒ gom theo thang do',
    S.archYm({ vasDate:'2026-08-12', bdate:'2026-07-14' })==='2026-08');
chk('thieu ngay VASSCM ⇒ lui ve thang trong ma batch',
    S.archYm({ vasDate:'', bdate:'2026-07-14' })==='2026-07');
chk('thieu ca hai ⇒ thang hien tai, khong bao gio rong',
    S.archYm({ vasDate:'', bdate:'' })==='2026-08');

console.log('\n— E. TỰ DỜI SANG KHO LƯU TRỮ KHI ĐẾN HẠN —');
await wait();                        /* archDue 19/08, hom nay 19/08 ⇒ toi han */
const p=allPushed();
chk('ghi ban luu tru vao dung thang cua ngay VASSCM',
    !!p['knq_arch/2026-08/C4_260813E001'], Object.keys(p).join(' '));
const rec=p['knq_arch/2026-08/C4_260813E001']||{};
chk('… ban luu giu nguyen phan chu da khai', rec.vessel==='MAPLE GAS' && rec.dOut==='GO-77');
chk('… giu ngay SAP cuoi cung va so End cuoi cung',
    rec.lastSap==='2026-08-12' && Number(rec.lastEnd)===80000);
chk('… ghi ro ai luu, luc nao, bang duong nao',
    !!rec.archAt && rec.archBy==='Kiem thu' && rec.archHow==='auto');
chk('ghi CHI MUC rieng de dem ma khong phai keo du lieu ve',
    p['knq_arch_idx/2026-08/C4_260813E001']==='260813E001');
chk('… va xoa ban ghi thong tin + dong so theo doi trong CUNG mot luot ghi',
    p['knq_info/C4_260813E001']===null && p['knq_watch/C4_260813E001']===null);
chk('ca cum nam trong MOT payload update() (nguyen khoi, khong nua voi)',
    PUSHED.some(x=>x['knq_arch/2026-08/C4_260813E001'] && x['knq_info/C4_260813E001']===null));
chk('lo da luu tru BIEN KHOI bang chinh', !row('260813E001'));
chk('… nhung lo CHUA VASSCM thi van con nguyen tren bang', !!row('260811X001'));
chk('so lo trong kho dem duoc tu chi muc', S.arcTotal()===1, String(S.arcTotal()));
chk('nut Archive hien dung con so', (CACHE['bondArcN']||{}).textContent==='1',
    (CACHE['bondArcN']||{}).textContent);

console.log('\n— F. CHƯA TỚI HẠN THÌ CHỜ, KHÔNG DỜI SỚM —');
S.WATCH['C3_260814X002']={ mat:'C3', bcode:'260814X002', first:'2026-08-14', last:'2026-08-16', end:0 };
S.INFO['C3_260814X002']={ vas:true, vasDate:'2026-08-16' };
PUSHED.length=0;
BOND.render();
await wait();
const wait4=row('260814X002');
chk('lo vua xong dung lai trong bang', !!wait4 && wait4.st==='archiving');
chk('… dem nguoc dung so ngay con lai', wait4 && wait4.archDays===4, wait4&&String(wait4.archDays));
chk('… va CHUA bi day sang kho', !allPushed()['knq_arch/2026-08/C3_260814X002']);
chk('_archPending dem lo dang cho', S.archPending().length===1);
chk('_archDue chua co ai toi han', S.archDue().length===0);

console.log('\n— G. KHÔNG GHI SỔ / LƯU TRỮ KHI SỐ SAP CHƯA ĐÁNG TIN —');
S.pinToday('2026-08-25');            /* D-1 = 24/08, SAP moi nhat moi toi 18/08 */
PUSHED.length=0;
BOND.render();
await wait();
chk('SAP tut lai phia sau ⇒ KHONG tu luu tru gi',
    !Object.keys(allPushed()).some(k=>k.indexOf('knq_arch/')===0), Object.keys(allPushed()).join(' '));
S.pinToday('2026-08-19');
S.setArch({ M:'2026-07', rows:[], meta:{} });
chk('dang xem ky da luu ⇒ khoa luon ca so theo doi', S.watchOk()===false);
S.setArch(null);
BOND.render();
chk('dong ky da luu thi mo khoa lai', S.watchOk()===true);

console.log('\n— H. GỌI VỀ THEO THÁNG (KHÔNG NẠP SẴN) —');
S.setAidx({ '2026-08':{ 'C4_260813E001':'260813E001' },
            '2026-07':{ 'C3_260701P001':'260701P001', 'C3_260702P001':'260702P001' },
            '2025-12':{ 'C4_251201D001':'251201D001' } });
BOND.openArch();
chk('bang kho luu tru mo ra', (CACHE['bondArc']||{}).classList.contains('on'));
chk('… tong so lo hien dung', S.arcTotal()===4, String(S.arcTotal()));
chk('… liet ke du cac thang co du lieu', S.arcMonths().join(',')==='2026-08,2026-07,2025-12',
    S.arcMonths().join(','));
const ab=H('bondArcBody');
chk('… gom theo NAM va co nut xoa ca nam',
    /2026/.test(ab) && /2025/.test(ab) && /delArchYear\('2026'\)/.test(ab));
chk('… moi thang co nut goi ve va nut xoa',
    /loadArchMonth\('2026-07'\)/.test(ab) && /delArchMonth\('2026-07'\)/.test(ab));
chk('… noi ro du lieu KHONG duoc nap luc mo app', /never loaded when the app starts/.test(ab));
chk('… va noi ro lo chua VASSCM khong bao gio vao kho', /never archived/.test(ab));
ONCE['knq_arch/2026-07']={ 'C3_260701P001':{ mat:'C3', bcode:'260701P001', vessel:'GLOBE POLARIS',
    vasDate:'2026-07-20', lastSap:'2026-07-19', lastEnd:0, hqQty:4750000, archAt:'2026-07-27 08:00' },
  'C3_260702P001':{ mat:'C3', bcode:'260702P001', vessel:'FUTURE EXPLORER', vasDate:'2026-07-22' } };
BOND.loadArchMonth('2026-07');
await wait();
const av=H('bondArcBody');
chk('goi ve thang 07 doc dung node knq_arch/2026-07', /GLOBE POLARIS/.test(av));
chk('… hien ca hai lo', /260701P001/.test(av) && /260702P001/.test(av));
chk('… co cot ngay SAP cuoi va ngay VASSCM', /Last in SAP/.test(av) && /VASSCM/.test(av));
chk('… bang chi doc, khong co o nhap nao', av.indexOf('<input')<0);

console.log('\n— I. XOÁ THEO THÁNG / THEO NĂM —');
PUSHED.length=0; CONFIRM=true;
BOND.delArchMonth('2025-12');
await wait();
const dm=allPushed();
chk('xoa thang: bo ca du lieu LAN chi muc',
    dm['knq_arch/2025-12']===null && dm['knq_arch_idx/2025-12']===null);
chk('… hoi lai truoc khi xoa, va noi ro la xoa vinh vien',
    /FOR GOOD/.test(ASKED[ASKED.length-1]||''));
chk('… tong so lo giam dung', S.arcTotal()===3, String(S.arcTotal()));
PUSHED.length=0;
BOND.delArchYear('2026');
await wait();
const dy=allPushed();
chk('xoa nam: quet moi thang cua nam do',
    dy['knq_arch/2026-08']===null && dy['knq_arch/2026-07']===null &&
    dy['knq_arch_idx/2026-08']===null && dy['knq_arch_idx/2026-07']===null);
chk('… hop hoi neu ro so thang va so lo sap mat',
    /2 month\(s\) · 3 finished batch/.test(ASKED[ASKED.length-1]||''), ASKED[ASKED.length-1].slice(0,90));
chk('… kho rong sau khi xoa', S.arcTotal()===0);
CONFIRM=false;
PUSHED.length=0;
S.setAidx({ '2026-08':{ 'C4_260813E001':'260813E001' } });
BOND.delArchMonth('2026-08');
await wait();
chk('bam Cancel thi KHONG xoa gi', PUSHED.length===0 && S.arcTotal()===1);
CONFIRM=true;

console.log('\n— J. XOÁ DÒNG KHÔNG PHÁ ĐƯỢC LƯỚI AN TOÀN —');
CONFIRM=m=>/DELETE ROW/.test(m);          /* dong y xoa dong, TU CHOI bo theo doi */
PUSHED.length=0;
BOND.render();
BOND.delRow('C3_260811X001');
await wait();
chk('xoa dong chi bo phan chu da go', allPushed()['knq_info/C3_260811X001']===null);
chk('⭐ KHONG bo khoi so theo doi khi nguoi dung tu choi',
    allPushed()['knq_watch/C3_260811X001']===undefined);
chk('… nen dong quay lai ngay, van ghim', !!row('260811X001') && row('260811X001').pin===true);
chk('… va hop thoai noi ro vi sao no quay lai',
    ASKED.some(a=>/comes straight back, still pinned/.test(a)));
CONFIRM=true;                              /* dong y ca hai cau hoi */
PUSHED.length=0;
BOND.delRow('C3_260811X001');
await wait();
chk('nguoi dung chu dong xac nhan lan hai thi moi bo khoi so',
    allPushed()['knq_watch/C3_260811X001']===null);
chk('… va loi canh bao noi ro se khong con nhac VASSCM nua',
    /no VASSCM reminder will ever be raised/.test(ASKED[ASKED.length-1]||''));

console.log('\n— K. CẢNH BÁO + THẺ + GIAO DIỆN —');
S.WATCH['C3_260811X001']={ mat:'C3', bcode:'260811X001', first:'2026-08-11', last:'2026-08-14', end:120000 };
BOND.render();
const al=S.alerts().map(a=>a[1]).join(' ');
chk('canh bao goi ten lo da roi SAP ma chua VASSCM', /260811X001/.test(al));
chk('… noi ro no duoc ghim va se khong bien mat',
    /pinned to the top of the table/.test(al) && /cannot be missed/.test(al));
chk('… muc nang nhat (bad) de chuong do len',
    S.alerts().some(a=>a[0]==='bad' && /NO LONGER in the SAP data/.test(a[1])));
chk('lo End = 0 chua VASSCM cung duoc neu ten', /260812D001/.test(al));
BOND.toggleCards();
BOND.render();
const cards=H('bondCards');
chk('the NEEDS ATTENTION noi so lo dang bi ghim', /pinned to the top of the table/.test(cards));
chk('co the ARCHIVE', /ARCHIVE/.test(cards));
chk('… noi ro khong nap gi cho toi khi goi ve',
    /nothing is loaded until you ask for a month/i.test(cards));

chk('render() khong goi id nao vang trong markup tab SAP', missing.size===0, [...missing].join(', '));
const DIA=/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
const shown=[H('bondArcBody'),H('bondCards'),al].join(' ');
chk('chu hien thi thuan tieng Anh (khong dau tieng Viet)', !DIA.test(shown),
    (shown.match(DIA)||[''])[0]);
const markup=HTML.slice(HTML.indexOf('<div class="bond-modal" id="bondArc">'),
                        HTML.indexOf('<div class="bond-modal" id="bondOl1">'));
chk('markup modal kho luu tru co trong index.html', markup.length>500);
chk('… va cung thuan tieng Anh', !DIA.test(markup.replace(/<!--[\s\S]*?-->/g,'')));
const CSS=fs.readFileSync(path.join(ROOT,'css','bond.css'),'utf8');
['bond-r-pin','bond-arcn','bond-arc-tbl','bond-arc-y','bond-mk.arc','bond-chip.c-archiving']
  .forEach(c=>chk('css co '+c, CSS.indexOf(c)>=0));
chk('index.html nap bond.js/bond.css ban 4118',
    /bond\.js\?v=4118/.test(HTML) && /bond\.css\?v=4118/.test(HTML));

console.log(fail?('\n❌ '+fail+' assert HỎNG'):'\n✅ TẤT CẢ ĐỀU PASS');
process.exit(fail?1:0);
})();
