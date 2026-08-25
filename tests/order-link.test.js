/* ============================================================
 * order-link.test.js — plan.js v4.109: 🔗 LINK ORDERS
 * ------------------------------------------------------------
 *   node tests/order-link.test.js      (chạy từ thư mục gốc repo)
 * Bảo đảm:
 *   • Nhóm ALT (một trong N xe sẽ vào lấy) chỉ tính MỘT đơn, lấy qty
 *     LỚN NHẤT — đây chính là lỗi 3 xe × 25 MT bị cộng thành 75 MT.
 *   • Nhóm MDO (một xe nhiều DO) vẫn cộng đủ, không bị trừ oan.
 *   • Xe nào vào station trước thì thành đại diện của nhóm ALT, và
 *     LOADED nhảy đúng bằng qty của nhóm chứ không phải của cả 3 dòng.
 *   • lnkSyncAlt park các dòng thua, tự gỡ khi xe kia rời station, và
 *     KHÔNG đụng tới dòng người dùng tự bấm cancel.
 *   • Không có chuỗi tiếng Việt nào lọt vào giao diện mới (chốt ngôn ngữ
 *     của V4: giao diện tiếng Anh, chú thích mã tiếng Việt).
 *   • Cột ACTUAL + mọi số MT hiện 3 số thập phân (đọc được tới kg).
 * ============================================================ */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'features', 'plan.js'), 'utf8');

/* ---------- DOM / môi trường giả (đủ để nạp module, không dựng bảng) ---------- */
const DOM = {};
function el(id){
  const e = { id, value:'', textContent:'', innerHTML:'', _cls:{}, style:{},
    addEventListener(){}, focus(){}, appendChild(){}, remove(){},
    querySelector:()=>null, querySelectorAll:()=>[], children:[] };
  e.classList = { add(c){ e._cls[c]=1; }, remove(c){ delete e._cls[c]; },
                  contains(c){ return !!e._cls[c]; },
                  toggle(c,v){ if(v===undefined) v=!e._cls[c]; if(v) e._cls[c]=1; else delete e._cls[c]; } };
  return e;
}
global.window = global;
global.document = {
  getElementById(id){ if(!DOM[id]) DOM[id]=el(id); return DOM[id]; },
  createElement(){ return el('_new'); },
  querySelector:()=>null, querySelectorAll:()=>[],
  body:{ appendChild(){} }, head:{ appendChild(){} }, hidden:true,
  addEventListener(){}, removeEventListener(){}
};
global.localStorage = { getItem:()=>null, setItem(){}, removeItem(){} };
global.toast = ()=>{};
global.confirm = ()=>true;
global.canWrite = ()=>true;
global.logAudit = ()=>{};
global.escapeHtml = s=>String(s==null?'':s);
global.CURRENT_USER = { name:'test' };
global.isTempOid = v=>/^[A-Z]{3}\d{6,}$/.test(String(v||''));
global.cleanDO = v=>String(v||'').trim();
global.lastEditFormatter = ()=>'';
global.Tabulator = function(){ return { on(){}, destroy(){}, replaceData(){}, redraw(){}, getRow:()=>null, getRows:()=>[] }; };
global.setInterval = ()=>0;

/* Trạm cân giả: computeStatusFromState đọc DB_SC.stations để ra 'loading'. */
global.DB_SC = { stations:{} };
global.dosOverlap = (a,b)=>String(a||'').split(/\s+/).some(x=>x && String(b||'').split(/\s+/).includes(x));
/* TL giả: có dòng nào khớp key thì đơn coi như 'done'. */
const TLIDX = { byKey:new Map() };
global.TL = { getIndex:()=>TLIDX };

/* Firebase giả: ghi lại payload thay vì gọi mạng. FB_DB nằm TRONG module
   (let FB_DB = null) và chỉ được gán trong attachFirebase, nên test phải gọi
   TP.init() với một firebase giả — nếu không lnkSyncAlt sẽ thoát sớm. */
const WRITES = [];
const _thenable = { then(f){ f && f(); return this; }, catch(){ return this; },
                    finally(f){ f && f(); return this; } };
function _fbRef(){
  return { on(){}, off(){},
    once(){ return { then(f){ f && f({ val:()=>({}) }); return _thenable; },
                     catch(){ return _thenable; }, finally(f){ f && f(); return _thenable; } }; },
    update(p){ WRITES.push(p); return _thenable; },
    set(){ return _thenable; }, remove(){ return _thenable; },
    child(){ return _fbRef(); } };
}
global.firebase = { database(){ return { ref(){ return _fbRef(); } }; } };

const { TP } = eval(SRC + '\n;({TP:TP, TMR:TMR})');
TP.init();          /* gán FB_DB bên trong module bằng firebase giả ở trên */

/* ---------- tiện ích ---------- */
let fail = 0;
function ok(name, cond, extra){
  if(cond) console.log('  ✓ ' + name);
  else { fail++; console.log('  ✗ ' + name + (extra ? '  →  ' + extra : '')); }
}
function eq(name, got, want){ ok(name, got === want, 'got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)); }

function reset(){
  Object.keys(TP.PLAN).forEach(k=>delete TP.PLAN[k]);
  DB_SC.stations = {};
  TLIDX.byKey = new Map();
  WRITES.length = 0;
}
let _seq = 0;
function row(o){
  const r = Object.assign({
    _oid:'X'+(++_seq), doNum:'', customer:'ACME', plate:'', driver:'D', qty:'25',
    tolerance:'25.3', _forDate:'2026-08-25', _seq:_seq, _autoSync:true, _status:'',
    allowGate:'OK', allowLoad:'OK'
  }, o||{});
  TP.PLAN[r._oid] = r;
  return r;
}
function link(rows, kind){
  const gid = 'G' + kind + (++_seq);
  rows.forEach(r=>{ r._lnkG = gid; r._lnkK = kind; });
  return gid;
}
const rows = ()=>Object.values(TP.PLAN);

/* ══════════════════════════════════════════════════════════════ */
console.log('\n── 1. Nhóm ALT chỉ được tính MỘT lần ──');
reset();
{
  const a = row({plate:'51C-111.11', qty:'25', doNum:'9000001'});
  const b = row({plate:'51C-222.22', qty:'25', doNum:'9000002'});
  const c = row({plate:'51C-333.33', qty:'25', doNum:'9000003'});
  let t = TP.lnkTotals(rows());
  eq('chưa link: PLAN cộng cả 3 dòng (đúng như lỗi đang gặp)', t.planMT, 75);
  eq('chưa link: đếm 3 đơn', t.planCnt, 3);

  link([a,b,c], 'alt');
  t = TP.lnkTotals(rows());
  eq('đã link ALT: PLAN chỉ còn 25 MT', t.planMT, 25);
  eq('đã link ALT: chỉ còn 1 đơn', t.planCnt, 1);
  eq('đã link ALT: REMAIN 25 MT', t.remainMT, 25);
  eq('đã link ALT: báo đã loại 2 dòng', t.altSaved, 2);
}

console.log('\n── 2. ALT qty lệch nhau ⇒ lấy dòng LỚN NHẤT ──');
reset();
{
  const a = row({qty:'20'}), b = row({qty:'25'}), c = row({qty:'24'});
  link([a,b,c], 'alt');
  eq('PLAN = qty lớn nhất', TP.lnkTotals(rows()).planMT, 25);
  eq('đại diện là dòng 25 MT', TP.lnkCollapse(rows())[0]._oid, b._oid);
}

console.log('\n── 3. Nhóm MULTI-DO vẫn cộng ĐỦ ──');
reset();
{
  const a = row({plate:'51C-111.11', qty:'10', doNum:'9000011'});
  const b = row({plate:'51C-111.11', qty:'15', doNum:'9000012'});
  link([a,b], 'mdo');
  const t = TP.lnkTotals(rows());
  eq('MDO: PLAN cộng đủ 25 MT', t.planMT, 25);
  eq('MDO: vẫn là 2 đơn (2 DO đều bán thật)', t.planCnt, 2);
  eq('MDO: không loại dòng nào', t.altSaved, 0);
}

console.log('\n── 4. Xe vào station ⇒ đại diện + LOADED đúng ──');
reset();
{
  const a = row({plate:'51C-111.11', qty:'25', doNum:'9000021'});
  const b = row({plate:'51C-222.22', qty:'25', doNum:'9000022'});
  const c = row({plate:'51C-333.33', qty:'25', doNum:'9000023'});
  link([a,b,c], 'alt');
  DB_SC.stations['1'] = { status:'loading', _oid:b._oid, doNum:b.doNum };
  eq('đại diện chuyển sang xe đang nạp', TP.lnkCollapse(rows())[0]._oid, b._oid);
  const t = TP.lnkTotals(rows());
  eq('LOADED = 25 MT (không phải 75)', t.loadedMT, 25);
  eq('PLAN vẫn 25 MT', t.planMT, 25);
  eq('REMAIN về 0', t.remainMT, 0);
}

console.log('\n── 5. lnkSyncAlt: park dòng thua, tự gỡ khi xe rời station ──');
reset();
{
  const a = row({doNum:'9000031'}), b = row({doNum:'9000032'}), c = row({doNum:'9000033'});
  link([a,b,c], 'alt');
  DB_SC.stations['1'] = { status:'loading', _oid:b._oid, doNum:b.doNum };
  TP.lnkSyncAlt();
  ok('có ghi Firebase một lần', WRITES.length === 1, 'writes=' + WRITES.length);
  ok('dòng a bị park', a._altSkip === true && a._status === 'cancel');
  ok('dòng c bị park', c._altSkip === true && c._status === 'cancel');
  ok('xe đang nạp KHÔNG bị đụng', !b._altSkip && b._status === '');
  eq('sau khi park, PLAN vẫn 25 MT', TP.lnkTotals(rows()).planMT, 25);

  WRITES.length = 0;
  TP.lnkSyncAlt();
  eq('gọi lại mà không có gì đổi ⇒ KHÔNG ghi Firebase', WRITES.length, 0);

  delete DB_SC.stations['1'];
  WRITES.length = 0;
  TP.lnkSyncAlt();
  ok('xe rời station ⇒ dòng a được gỡ park', !a._altSkip && a._autoSync === true && a._status === '');
  ok('xe rời station ⇒ dòng c được gỡ park', !c._altSkip && c._autoSync === true);
  eq('gỡ park có ghi Firebase', WRITES.length, 1);
}

console.log('\n── 6. Cancel do người dùng bấm tay KHÔNG bị đụng ──');
reset();
{
  const a = row({doNum:'9000041'}), b = row({doNum:'9000042'});
  link([a,b], 'alt');
  a._autoSync = false; a._status = 'cancel';         /* người dùng tự huỷ, không có _altSkip */
  DB_SC.stations['1'] = { status:'loading', _oid:b._oid, doNum:b.doNum };
  WRITES.length = 0;
  TP.lnkSyncAlt();
  ok('dòng người dùng huỷ không bị gắn cờ _altSkip', !a._altSkip);
  delete DB_SC.stations['1'];
  TP.lnkSyncAlt();
  ok('và cũng KHÔNG bị phần mềm tự bỏ huỷ', a._status === 'cancel' && a._autoSync === false);
}

console.log('\n── 7. Đơn đã cân xong (TL có dòng) giữ vai đại diện ──');
reset();
{
  const a = row({doNum:'9000051'}), b = row({doNum:'9000052'});
  link([a,b], 'alt');
  TLIDX.byKey.set(b.doNum, new Map([['r1', 24735]]));
  eq('đại diện là đơn đã done', TP.lnkCollapse(rows())[0]._oid, b._oid);
  const t = TP.lnkTotals(rows());
  eq('LOADED = 25 MT theo kế hoạch', t.loadedMT, 25);
  eq('đếm 1 đơn done', t.doneCnt, 1);
}

console.log('\n── 8. Chip 🔗 hiện đúng ──');
reset();
{
  const a = row({doNum:'9000061'}), b = row({doNum:'9000062'});
  link([a,b], 'alt');
  const h = TP.lnkBadgeHtml(a) + TP.lnkBadgeHtml(b);
  ok('có chip ALT cho cả hai dòng', (h.match(/>🔗 ALT /g)||[]).length === 2, h);
  ok('đúng một dòng được đánh dấu đại diện ★', (h.match(/★/g)||[]).length === 1, h);
  const c = row({doNum:'9000063'}), d = row({doNum:'9000064'});
  link([c,d], 'mdo');
  ok('nhóm MDO có chip riêng', TP.lnkBadgeHtml(c).indexOf('MDO') > -1);
  ok('dòng không link thì không có chip', TP.lnkBadgeHtml(row({})) === '');
}

console.log('\n── 9. Định dạng 3 số thập phân (đọc được tới kg) ──');
{
  const SCALE_SRC = fs.readFileSync(path.join(ROOT, 'js', 'features', 'scale.js'), 'utf8');
  ok('plan.js _fmtMT dùng 3 số thập phân',
     /_fmtMT\(v\)\{[\s\S]{0,400}?minimumFractionDigits: 3, maximumFractionDigits: 3/.test(SRC));
  ok('plan.js actualFormatter dùng toFixed(3)',
     /function actualFormatter\(cell\)\{[\s\S]{0,600}?toFixed\(3\)/.test(SRC));
  ok('scale.js PLAN card dùng 3 số thập phân',
     /const fmtMt = v => v > 0[\s\S]{0,200}?minimumFractionDigits: 3, maximumFractionDigits: 3/.test(SCALE_SRC));
  ok('scale.js PLAN card đi qua TP.lnkTotals', /TP\.lnkTotals\(todayRows\)/.test(SCALE_SRC));
}

console.log('\n── 10. Giao diện mới phải là TIẾNG ANH ──');
{
  const VN = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
  /* Lấy vùng mã của hộp thoại Link + popup hỏi cách in, bỏ chú thích, rồi
     quét mọi chuỗi trong dấu nháy. */
  function strings(src, from, to){
    const i = src.indexOf(from), j = src.indexOf(to, i);
    if(i < 0 || j < 0) return null;
    const body = src.slice(i, j)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    return body.match(/'(?:[^'\\]|\\.)*'/g) || [];
  }
  const planUI = strings(SRC, 'function _lnkEnsureModal', 'function lnkUnlink');
  ok('tìm được vùng mã hộp thoại Link', !!planUI);
  const badPlan = (planUI||[]).filter(s=>VN.test(s));
  ok('hộp thoại 🔗 Link Orders không có chuỗi tiếng Việt', badPlan.length === 0, badPlan.join(' | '));

  const SCALE_SRC = fs.readFileSync(path.join(ROOT, 'js', 'features', 'scale.js'), 'utf8');
  /* v4.110 — _mdoMaxTol đã chuyển lên TRƯỚC _lnkPttAsk, mốc kết thúc nay là
     mdoAssign (đường gộp+assign dùng chung). tests/mdo-print.test.js quét kỹ
     hơn cho cả cụm popup này. */
  const scaleUI = strings(SCALE_SRC, 'function _lnkPttAsk', 'function mdoAssign');
  ok('tìm được vùng mã popup hỏi cách in', !!scaleUI);
  const badScale = (scaleUI||[]).filter(s=>VN.test(s));
  ok('popup hỏi in gộp/tách không có chuỗi tiếng Việt', badScale.length === 0, badScale.join(' | '));
}

console.log('\n' + (fail ? '❌ ' + fail + ' test FAILED' : '✅ ALL PASS') + '\n');
process.exit(fail ? 1 : 0);
