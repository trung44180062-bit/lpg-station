/* ═══════════════════════════════════════════════════════════════════════
   v4.84 — LOADNOTIFY test harness (node, không cần jsdom)
   Nạp module THẬT (js/integrations/loadnotify.js) rồi kiểm 3 điều quan
   trọng nhất, đúng thứ tự rủi ro:

     [1] BỘ LỌC — chỉ hàng ≠ 50:50 mới được vào hàng đợi.
         Sai chiều "gửi thiếu" = mất cảnh báo hàng đặc biệt.
         Sai chiều "gửi thừa" = spam nhóm vận hành rồi bị mute, đến lúc
         có hàng 30:70 thật thì không ai đọc nữa. Cả hai đều đắt.

     [2] KHOÁ CHỐNG TRÙNG — cùng một lượt cân phải ra CÙNG một khoá,
         khác lượt phải ra khoá khác, và khoá phải hợp lệ với Firebase
         (không chứa . $ # [ ] /). Sai chỗ này là tin bắn 2 lần.

     [3] THÂN TIN — có đủ mọi trường vận hành cần, toàn tiếng Anh.

   Chạy:  node tests/loadnotify.test.js      (cwd = lpg-station-v4-modular)
   ═══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');

/* _pfDeriveType sống ở wgcheck.js dạng hàm global. Trích ra rồi nạp vào
   global để loadnotify.js gọi được — y hệt lúc chạy trên trình duyệt. */
function grab(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('không tìm thấy ' + name);
  let d = 0;
  const j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  throw new Error('không đóng ngoặc: ' + name);
}
const wg = fs.readFileSync('js/checks/wgcheck.js', 'utf8');
global._pfDeriveType = eval('(' + grab(wg, '_pfDeriveType') + ')');

/* Môi trường tối thiểu để module nạp được ngoài trình duyệt. */
global.window = global;
global.document = { getElementById: id => ({ value: id === 'scEngineer' ? 'Tran Van Eng' : 'Le Thi Booth' }) };
global.CURRENT_USER = { name: 'Hoang Trung', email: 'trung@hsvc' };
global.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = v; } };

const LN = require('../js/integrations/loadnotify.js');

let fail = 0;
function eq(label, got, want) {
  const ok = got === want;
  if (!ok) fail++;
  console.log((ok ? '  ok  ' : ' FAIL ') + label.padEnd(52) + ' → ' + JSON.stringify(got) +
              (ok ? '' : '  (mong đợi ' + JSON.stringify(want) + ')'));
}
function truthy(label, got) { eq(label, !!got, true); }

/* ── [1] BỘ LỌC LOẠI HÀNG ────────────────────────────────────────────── */
console.log('\n[1] isSpecial — chỉ hàng KHÁC 50:50 mới bắn Zalo');
eq('50:50            → im lặng', LN.isSpecial('50:50'), false);
eq('LPG 50:50        → im lặng', LN.isSpecial('LPG 50:50'), false);
eq('C3:50/C4:50      → im lặng', LN.isSpecial('C3:50/C4:50'), false);
/* Sale Plan bỏ trống cột Type: app mặc định 50:50 khi in phiếu ⇒ theo
   quyết định vận hành 2026-08-05, KHÔNG gửi. */
eq('"" (Type bỏ trống) → im lặng', LN.isSpecial(''), false);
eq('undefined        → im lặng', LN.isSpecial(undefined), false);
/* Regression v4.63/v4.67: tên địa danh "Bình Thuận" từng bị hiểu là Pure */
eq('DES Binh Thuan 50:50 → im lặng', LN.isSpecial('DES Binh Thuan 50:50'), false);
eq('DES Ninh Thuan   → im lặng', LN.isSpecial('DES Ninh Thuan'), false);

eq('30:70            → GỬI', LN.isSpecial('30:70'), true);
eq('C3:20/C4:80      → GỬI', LN.isSpecial('C3:20/C4:80'), true);
eq('Cargo SPOT 40:60 → GỬI', LN.isSpecial('Cargo July SPOT 40:60'), true);
eq('Pure Propane     → GỬI', LN.isSpecial('Pure Propane'), true);
eq('Pure Butane      → GỬI', LN.isSpecial('Pure Butane'), true);

console.log('\n[1b] prodRatio — nhãn tỉ lệ in ra trong tin');
eq('30:70',        LN.prodRatio('30:70'),            '30:70');
eq('C3:20/C4:80',  LN.prodRatio('C3:20/C4:80'),      '20:80');
eq('Pure Propane', LN.prodRatio('Pure Propane'),     'Pure C3');
eq('Pure C4',      LN.prodRatio('Pure Butane'),      'Pure C4');

/* ── [2] KHOÁ CHỐNG TRÙNG ────────────────────────────────────────────── */
console.log('\n[2] buildKey — cùng lượt cân ⇒ cùng khoá (R6 chống bắn 2 lần)');
const stA = { doNum: '3200123456', turn: 3, plate: '51C-123.45' };
const k1 = LN.buildKey(2, stA);
const k2 = LN.buildKey(2, { doNum: '3200123456', turn: 3, plate: '51C-999.99' });
eq('assign lại cùng station+turn+DO → CÙNG khoá', k1, k2);
eq('khác station → khác khoá', LN.buildKey(3, stA) !== k1, true);
eq('khác turn    → khác khoá', LN.buildKey(2, { doNum: '3200123456', turn: 4 }) !== k1, true);
eq('khác DO      → khác khoá', LN.buildKey(2, { doNum: '3200999999', turn: 3 }) !== k1, true);

console.log('\n[2b] khoá phải HỢP LỆ với Firebase (cấm  .  $  #  [  ]  / )');
const dirty = LN.buildKey('1', { doNum: 'TMP/2026.08#05[x]$y', turn: 1 });
eq('không còn ký tự cấm', /[.$#\[\]\/]/.test(dirty), false);
eq('không rỗng', dirty.length > 0, true);
console.log('       khoá mẫu: ' + k1);
console.log('       khoá bẩn : ' + dirty);
/* DO trống (đơn chưa có DO, chỉ có _oid) vẫn phải ra khoá dùng được */
truthy('DO trống vẫn ra khoá', LN.buildKey('1', { turn: 1 }).length > 5);

/* ── [3] THÂN TIN ────────────────────────────────────────────────────── */
console.log('\n[3] buildLines — tin tiếng Anh, đủ trường vận hành');
const st = {
  type: 'LPG C3:30/C4:70 EXPORT', customer: 'KOREA GAS CORP', doNum: '3200123456',
  qty: '24.5', tank: 'TK-3502', batch: 'LPG-2026-TL-25', plate: '51C-123.45',
  rmooc: '51R-678.90', driver: 'Nguyen Van A', turn: 3, tolerance: '0.5',
  note: 'COQ pending'
};
const body = LN.buildLines(2, st, {}).join('\n');
console.log('──── TIN SẼ GỬI ────');
console.log('⚠️ SPECIAL PRODUCT — NOT 50:50\n\n' + body + '\n\n➡ Check tank / lot / COQ before weighing.');
console.log('────────────────────');

[['tỉ lệ',        'PRODUCT TYPE : 30:70'],
 ['cảnh báo',     'NOT 50:50'],
 ['hợp đồng',     'LPG C3:30/C4:70 EXPORT'],
 ['khách hàng',   'KOREA GAS CORP'],
 ['DO',           '3200123456'],
 ['sản lượng',    '24.5 ton'],
 ['tank',         'TK-3502'],
 ['lot',          'LPG-2026-TL-25'],
 ['xe',           '51C-123.45'],
 ['rmooc',        '51R-678.90'],
 ['tài xế',       'Nguyen Van A'],
 ['turn',         'Turn 3'],
 ['station',      'Station 2'],
 ['dung sai',     'Max tolerance: 0.5'],
 ['engineer',     'Tran Van Eng'],
 ['check booth',  'Le Thi Booth'],
 ['ghi chú',      'COQ pending'],
 ['người assign', 'Hoang Trung']
].forEach(([lbl, needle]) => eq('có ' + lbl, body.indexOf(needle) >= 0, true));

console.log('\n[3b] trường thiếu → hiện "—", KHÔNG hiện undefined/null');
const thin = LN.buildLines(1, { type: 'Pure Propane', turn: 1 }, {}).join('\n');
eq('không có chữ "undefined"', /undefined/.test(thin), false);
eq('không có chữ "null"',      /null/.test(thin), false);
eq('có dấu — thay chỗ trống',  thin.indexOf('—') >= 0, true);

/* ── [4] CÔNG TẮC TẮT ────────────────────────────────────────────────── */
console.log('\n[4] công tắc tắt — tắt là app chạy y như trước');
eq('mặc định BẬT', LN.isOn(), true);
LN.setOn(false); eq('sau setOn(false)', LN.isOn(), false);
LN.setOn(true);  eq('sau setOn(true) ', LN.isOn(), true);

console.log('\n' + (fail ? '❌ ' + fail + ' TEST HỎNG' : '✅ TẤT CẢ TEST PASS'));
process.exit(fail ? 1 : 0);
