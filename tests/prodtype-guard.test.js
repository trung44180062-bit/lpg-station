/* ═══════════════════════════════════════════════════════════════════════
   v4.83 — PRODUCT TYPE GUARD test harness (node, không cần jsdom)
   Trích hàm thuần từ source rồi eval, nên test luôn chạy trên code THẬT.
     node tests/prodtype-guard.test.js      (cwd = lpg-station-v4-modular)
   ═══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const wg = fs.readFileSync('js/checks/wgcheck.js', 'utf8');
const sc = fs.readFileSync('js/features/scale.js', 'utf8');

function grab(src, name){
  const i = src.indexOf('function ' + name + '(');
  if(i < 0) throw new Error('không tìm thấy ' + name);
  let d = 0, j = src.indexOf('{', i);
  for(let k = j; k < src.length; k++){
    if(src[k] === '{') d++;
    else if(src[k] === '}'){ d--; if(!d) return src.slice(i, k + 1); }
  }
  throw new Error('không đóng ngoặc: ' + name);
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

eval(grab(wg, '_pfDeriveType'));
eval(grab(sc, '_scProdRatio'));
eval(grab(sc, '_scIsSpecialType'));
eval(grab(sc, '_scTypeChip'));

let fail = 0;
function eq(label, got, want){
  const ok = got === want;
  if(!ok) fail++;
  console.log((ok ? '  ok  ' : ' FAIL ') + label.padEnd(46) + ' → ' + JSON.stringify(got)
            + (ok ? '' : '  (mong đợi ' + JSON.stringify(want) + ')'));
}

console.log('\n[1] _scProdRatio — chuẩn hoá tỉ lệ từ cột Type của Sale Plan');
eq('"50:50"',                 _scProdRatio('50:50'),                 '50:50');
eq('"LPG 50:50"',             _scProdRatio('LPG 50:50'),             '50:50');
eq('"C3:50/C4:50"',           _scProdRatio('C3:50/C4:50'),           '50:50');
eq('"30:70"',                 _scProdRatio('30:70'),                 '30:70');
eq('"C3:20/C4:80"',           _scProdRatio('C3:20/C4:80'),           '20:80');
eq('"Cargo July SPOT 40:60"', _scProdRatio('Cargo July SPOT 40:60'), '40:60');
eq('"Pure Propane"',          _scProdRatio('Pure Propane'),          'Pure C3');
eq('"Pure C4"',               _scProdRatio('Pure C4'),               'Pure C4');
eq('"Domestic" (không ghi tỉ lệ)', _scProdRatio('Domestic'),         '50:50');
/* v4.63/v4.67 regression: tên địa danh KHÔNG được hiểu là hàng Pure */
eq('"DES Binh Thuan 50:50"',  _scProdRatio('DES Binh Thuan 50:50'),  '50:50');
eq('"" (bỏ trống)',           _scProdRatio(''),                      '');

console.log('\n[2] _scIsSpecialType — chỉ 50:50 (và ô trống) là hàng phổ thông');
eq('50:50 → normal',       _scIsSpecialType('50:50'),        false);
eq('Binh Thuan → normal',  _scIsSpecialType('DES Binh Thuan'), false);
eq('"" → normal',          _scIsSpecialType(''),             false);
eq('30:70 → SPECIAL',      _scIsSpecialType('30:70'),        true);
eq('20:80 → SPECIAL',      _scIsSpecialType('C3:20/C4:80'),  true);
eq('Pure C3 → SPECIAL',    _scIsSpecialType('Pure Propane'), true);
eq('Pure C4 → SPECIAL',    _scIsSpecialType('Pure Butane'),  true);

console.log('\n[3] _scTypeChip — màu chữ khác nhau giữa 50:50 và loại khác');
eq('50:50 KHÔNG có class special',
   /class="sc-ptype"/.test(_scTypeChip('50:50', 'sc-ptype')), true);
eq('30:70 CÓ class special',
   /class="sc-ptype special"/.test(_scTypeChip('30:70', 'sc-ptype')), true);
eq('30:70 có icon ⚠',
   _scTypeChip('30:70', 'sc-ptype').indexOf('⚠ 30:70') > 0, true);
eq('ô trống → chip mờ "50:50 ?"',
   /class="sc-ptype unknown"[\s\S]*50:50 \?/.test(_scTypeChip('', 'sc-ptype')), true);

console.log('\n[4] Luồng assign — 50:50 một click, loại khác phải xác nhận 2 lần');
const armed = {};
let confirms = 0;
function scAssignToStation(stId, row){          /* gate v4.83 rút gọn */
  if(_scIsSpecialType(row.type) && !row._typeOK){
    confirms++;
    row._typeOK = true;                          /* giả lập staff bấm OK */
  }
  return 'ASSIGNED';
}
function assignFromSearch(stId, idx, row, warn){
  const isSp = _scIsSpecialType(row.type);
  if((!warn || !warn.hasWarn) && !isSp) return scAssignToStation(stId, row);
  if(armed[stId] === idx){
    armed[stId] = null;
    if(isSp) row._typeOK = true;                 /* click 2 = xác nhận */
    return scAssignToStation(stId, row);
  }
  armed[stId] = idx;
  return 'ARMED';
}
confirms = 0;
eq('search 50:50 → assign ngay', assignFromSearch(1, 0, {type:'50:50'}, null), 'ASSIGNED');
eq('  … không hỏi confirm', confirms, 0);

const r30 = {type:'30:70'};
eq('search 30:70 click 1 → nhấp nháy', assignFromSearch(2, 0, r30, null), 'ARMED');
eq('search 30:70 click 2 → assign',    assignFromSearch(2, 0, r30, null), 'ASSIGNED');
eq('  … KHÔNG hỏi confirm lần nữa (đã xác nhận bằng click 2)', confirms, 0);

confirms = 0;
eq('queue/waitPop Pure C4 → hỏi confirm', scAssignToStation(9, {type:'Pure Butane'}), 'ASSIGNED');
eq('  … số lần confirm', confirms, 1);
confirms = 0;
eq('queue/waitPop 50:50 → không hỏi', scAssignToStation(9, {type:'LPG 50:50'}), 'ASSIGNED');
eq('  … số lần confirm', confirms, 0);

console.log(fail ? '\n*** ' + fail + ' TEST HỎNG\n' : '\n✔ TẤT CẢ TEST PASS\n');
process.exit(fail ? 1 : 0);
