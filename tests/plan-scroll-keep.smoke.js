/* ============================================================
 * plan-scroll-keep.smoke.js — plan.js v4.124
 * ------------------------------------------------------------
 *   node tests/plan-scroll-keep.smoke.js     (chạy từ thư mục gốc repo)
 *
 * BỆNH ĐANG VÁ: đổi trạng thái một dòng ⇒ renderLedger() ghi đè
 * host.innerHTML ⇒ khung cuộn .pv-scroll bị thay mới ⇒ scrollTop
 * về 0 ⇒ màn hình văng lên đầu bảng, nhân viên dễ bấm nhầm dòng.
 *
 * Test dựng một DOM giả CÓ CHIỀU CAO: mỗi dòng cao 24px, khung
 * cuộn nằm ở toạ độ top = 100. Cuộn xuống dòng thứ 10, gọi
 * renderLedger() rồi kiểm scrollTop có đứng yên không — và kiểm
 * cả trường hợp bảng ĐỔI CHIỀU CAO (mất bớt dòng phía trên), lúc
 * đó neo theo data-oid phải bù lại chứ không được nhớ số thô.
 * ============================================================ */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC  = fs.readFileSync(path.join(ROOT, 'js', 'features', 'plan.js'), 'utf8');

const ROW_H = 24, SC_TOP = 100;

/* ── phần tử giả tối thiểu ────────────────────────────────── */
function el(id){
  const e = { id, value:'', textContent:'', innerHTML:'', _cls:{}, style:{}, children:[],
    parentElement:null, scrollTop:0, scrollLeft:0, nodeType:1,
    addEventListener(){}, focus(){}, appendChild(){}, remove(){},
    getBoundingClientRect(){ return { top:0, left:0, bottom:0, right:0 }; },
    querySelector:()=>null, querySelectorAll:()=>[] };
  e.classList = { add(c){ e._cls[c]=1; }, remove(c){ delete e._cls[c]; },
                  contains(c){ return !!e._cls[c]; }, toggle(){} };
  return e;
}

/* Khung cuộn giả: chiều cao dòng cố định, vị trí dòng suy ra từ scrollTop. */
const scroll = el('_pvscroll');
scroll._oids = [];
scroll.getBoundingClientRect = ()=>({ top:SC_TOP, left:0, bottom:SC_TOP+400, right:900 });
function rowEl(oid, idx){
  const r = el('_row_' + oid);
  r.getAttribute = a => (a === 'data-oid' ? oid : null);
  r.getBoundingClientRect = ()=>({ top: SC_TOP + idx*ROW_H - scroll.scrollTop,
                                   left:0, bottom:0, right:0 });
  return r;
}
scroll.querySelectorAll = sel => (/tr\.pv-row/.test(sel)
  ? scroll._oids.map((o,i)=>rowEl(o,i)) : []);
scroll.querySelector = sel => {
  const m = /data-oid="([^"]+)"/.exec(sel || '');
  if(!m) return null;
  const i = scroll._oids.indexOf(m[1]);
  return i < 0 ? null : rowEl(m[1], i);
};

/* Host #tpLedger: mỗi lần bị ghi innerHTML thì rút lại danh sách oid
   từ chính chuỗi HTML vừa dựng — đúng như trình duyệt làm. */
const DOM = {};
const host = el('tpLedger');
host.parentElement = null;
Object.defineProperty(host, 'innerHTML', {
  get(){ return host._html || ''; },
  set(v){ host._html = v;
    /* ĐÚNG NHƯ TRÌNH DUYỆT: gán innerHTML là vứt bỏ cả cây con cũ và dựng
       .pv-scroll MỚI — phần tử mới thì scrollTop/scrollLeft = 0. Chính chỗ
       này mới là con "bọ" làm bảng nhảy lên đầu, nên bản giả phải mô phỏng. */
    scroll.scrollTop = 0; scroll.scrollLeft = 0;
    scroll._oids = (String(v).match(/data-oid="([^"]*)"/g) || [])
      .map(s => s.slice(10, -1)); }
});
host.querySelector = sel => (/pv-scroll/.test(sel) ? scroll : null);
DOM['tpLedger'] = host;

global.window = global;
global.pageYOffset = 0; global.pageXOffset = 0;
global.scrollTo = ()=>{};
global.CSS = { escape: s => String(s) };
global.document = {
  getElementById(id){ if(!DOM[id]) DOM[id] = el(id); return DOM[id]; },
  createElement(){ return el('_new'); },
  querySelector:()=>null, querySelectorAll:()=>[],
  body:{ appendChild(n){ DOM[n.id] = n; } }, head:{ appendChild(){} },
  hidden:true, addEventListener(){} };
global.localStorage = { getItem:k => (/planview/.test(k) ? 'ledger' : null),
                        setItem(){}, removeItem(){} };
global.toast = ()=>{};
global.confirm = ()=>true; global.canWrite = ()=>true; global.logAudit = ()=>{};
global.escapeHtml = s => String(s == null ? '' : s);
global.CURRENT_USER = { name:'t' };
global.isTempOid = v => /^[A-Z]{3}\d{6,}$/.test(String(v||''));
global.cleanDO = v => String(v||'').trim();
global.lastEditFormatter = ()=>'';
global.Tabulator = function(){ return { on(){}, destroy(){}, replaceData(){}, redraw(){},
  getRow:()=>null, getRows:()=>[] }; };
global.setInterval = ()=>0;
global.setTimeout = (f)=>{ return 0; };   /* bỏ qua lượt hoãn — test đồng bộ */
global.DB_SC = { stations:{} };
global.dosOverlap = ()=>false;
global.TL = { getIndex:()=>({ byKey:new Map() }), ROWS:[] };
const th = { then(f){ f && f(); return th; }, catch(){ return th; }, finally(f){ f && f(); return th; } };
function ref(){ return { on(){}, once(){ return { then(f){ f && f({ val:()=>({}) }); return th; },
  catch(){ return th; }, finally(f){ f && f(); return th; } }; }, update(){ return th; }, child(){ return ref(); } }; }
global.firebase = { database(){ return { ref(){ return ref(); } }; } };

const { TP } = eval(SRC + '\n;({TP:TP,TMR:TMR})');
TP.init();

/* 30 đơn cùng một khách để bảng đủ dài mà cuộn. */
const OIDS = [];
for(let i = 0; i < 30; i++){
  const oid = 'O' + String(i).padStart(2, '0');
  OIDS.push(oid);
  TP.PLAN[oid] = { _oid:oid, doNum:'90000' + (100+i), customer:'ACME', plate:'51C-' + i,
    driver:'D' + i, qty:'25', tolerance:'25.3', _forDate:'2026-08-25', _seq:i,
    _autoSync:true, _status:'', allowLoad:'OK', allowGate:'OK' };
}

let fail = 0;
function ok(name, cond, extra){
  if(cond) console.log('  ✓ ' + name);
  else { fail++; console.log('  ✗ ' + name + (extra ? '  →  ' + extra : '')); }
}

console.log('plan-scroll-keep.smoke — giữ vị trí cuộn khi đổi trạng thái');

/* ── 1. vẽ lần đầu ─────────────────────────────────────────── */
TP.renderLedger();
ok('ledger dựng đủ 30 dòng có data-oid', scroll._oids.length === 30,
   'thấy ' + scroll._oids.length);
ok('mỗi dòng mang đúng oid làm mốc neo', scroll._oids[9] === 'O09', scroll._oids[9]);

/* ── 2. cuộn xuống dòng 10 rồi vẽ lại (không đổi chiều cao) ── */
scroll.scrollTop = 10 * ROW_H;          /* dòng O10 nằm sát mép trên */
TP.renderLedger();
ok('vẽ lại: KHÔNG nhảy về đầu bảng', scroll.scrollTop !== 0, 'scrollTop=' + scroll.scrollTop);
ok('vẽ lại: đứng nguyên tại dòng O10', scroll.scrollTop === 10 * ROW_H,
   'scrollTop=' + scroll.scrollTop);

/* ── 3. cuộn lệch nửa dòng — vẫn phải giữ y nguyên ─────────── */
scroll.scrollTop = 10 * ROW_H + 7;
TP.renderLedger();
ok('giữ được cả phần lẻ khi cuộn lệch nửa dòng', scroll.scrollTop === 10 * ROW_H + 7,
   'scrollTop=' + scroll.scrollTop);

/* ── 4. giữ luôn cuộn ngang (bảng rộng) ────────────────────── */
scroll.scrollLeft = 180;
TP.renderLedger();
ok('giữ nguyên cuộn ngang', scroll.scrollLeft === 180, 'scrollLeft=' + scroll.scrollLeft);
scroll.scrollLeft = 0;

/* ── 5. BẢNG ĐỔI CHIỀU CAO: 3 dòng phía trên bị lọc mất ─────
   Nhớ scrollTop thô sẽ lệch 3 dòng; neo theo oid phải bù lại. */
scroll.scrollTop = 10 * ROW_H;
['O00','O01','O02'].forEach(o => { delete TP.PLAN[o]; });
TP.renderLedger();
ok('mất 3 dòng phía trên: dòng đang xem vẫn ở nguyên mép trên',
   scroll.scrollTop === 7 * ROW_H, 'scrollTop=' + scroll.scrollTop + ' (mong ' + (7*ROW_H) + ')');
ok('dòng neo O10 vẫn là dòng thứ 7 sau khi lọc', scroll._oids[7] === 'O10', scroll._oids[7]);

/* ── 6. dòng neo BIẾN MẤT (bị lọc) → lùi về scrollTop cũ, không về 0 */
scroll.scrollTop = 7 * ROW_H;
delete TP.PLAN['O10'];
TP.renderLedger();
ok('dòng neo bị xoá: vẫn không văng về đầu bảng', scroll.scrollTop === 7 * ROW_H,
   'scrollTop=' + scroll.scrollTop);

/* ── 7. đổi trạng thái thật qua ledgerPickStatus / setManualStatus ── */
scroll.scrollTop = 12 * ROW_H;
const before = scroll.scrollTop;
TP.setManualStatus ? TP.setManualStatus('O15', 'cancel') : TP.renderLedger();
ok('đổi trạng thái 1 dòng: màn hình đứng yên', scroll.scrollTop === before,
   'scrollTop=' + scroll.scrollTop);

console.log(fail ? '\n' + fail + ' kiểm tra HỎNG' : '\nTẤT CẢ ĐỀU ĐẠT');
process.exit(fail ? 1 : 0);
