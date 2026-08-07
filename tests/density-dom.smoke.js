/* ═══════════════════════════════════════════════════════════════════════
   v4.85 — SMOKE TEST TRÊN DOM THẬT (cần jsdom)
   Nạp index.html + 3 module vào jsdom rồi bấm thử từng nút, kiểm tra:
     • modal bảng density mở/đóng/đổi tab/đánh dấu chưa lưu
     • trạng thái ĐẦU của cách 2 chạy AUTO như ô CURRENT C3 %, khoá ô nhập,
       chuyển MANUAL thì AUTO không ghi đè nữa
     • MC.altCalc chạy trên đúng các ô nhập của form TK-3501
     • chọn phương pháp gửi Scale ngay trên bảng so sánh của Tank Mix
     • Tank Log render đủ 54 cột (khớp thead & tfoot), chip phương pháp
     • xoay vòng phương pháp đổi đúng con số sẽ gửi sang Scale
     • cờ Stock Transfer KHÔNG bị mất khi ghi đè dòng (ROW_W nới lên 69)
     • modal sửa dòng có đủ 12 ô nhập mới + 3 nút chọn phương pháp
     npm i jsdom && node tests/density-dom.smoke.js
   ═══════════════════════════════════════════════════════════════════════ */
const fs = require('fs'), path = require('path');
let JSDOM;
try{ JSDOM = require('jsdom').JSDOM; }
catch(_){
  console.log('⚠ BỎ QUA: chưa cài jsdom. Chạy `npm i jsdom` rồi thử lại.');
  process.exit(0);
}
const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts:'outside-only', pretendToBeVisual:true, url:'http://localhost/' });
const w = dom.window;
const LOG = [];
w.firebase = undefined;
w.toast = (m, t)=> LOG.push('toast[' + t + '] ' + m);
w.confirm = ()=> true; w.alert = ()=>{}; w.prompt = ()=> 'CONFIRM';
w.logAudit = ()=>{}; w.canWrite = ()=> true;

/* các module dùng `const X = (function(){…})()` ở top level — trong <script>
   thật đó là binding toàn cục, nên phải nối chung 1 lần eval rồi gắn ra window. */
const files = ['js/data/density.js', 'js/features/eng.js', 'js/features/mixctrl.js'];
const bundle = files.map(f=>fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n')
  + '\n;window.DENS=DENS;window.ENG=ENG;window.MC=MC;';
try{ w.eval(bundle); }catch(e){ console.log('❌ LOAD BUNDLE → ' + e.message); process.exit(1); }

let fail = 0;
const ok = (l, c)=>{ console.log((c ? '  ✅ ' : '  ❌ ') + l); if(!c) fail++; };
const $  = id => w.document.getElementById(id);
const set = (id, v)=>{ const e = $(id); if(!e) throw new Error('thiếu #' + id); e.value = v; };

console.log('\n── 1. DENS trong DOM thật ──');
ok('DENS tồn tại', typeof w.DENS === 'object');
w.DENS.init();
w.DENS.open();
ok('modal mở', $('dens-backdrop').classList.contains('on'));
ok('bảng C3 render ra dòng', ($('dens-body').innerHTML.match(/<tr/g) || []).length > 50);
ok('có dòng ngoài dải tô cảnh báo', $('dens-body').innerHTML.indexOf('dens-ext') >= 0);
ok('meta hiển thị', $('dens-meta').innerHTML.length > 10);
w.DENS.tab('c4');
ok('đổi tab C4 ok', $('dens-tab-c4').className.indexOf('on') >= 0);
ok('C4 @2°C = 592.5', $('dens-body').innerHTML.indexOf('592.5') >= 0);
w.DENS.addRow();
ok('thêm dòng → đánh dấu chưa lưu', $('dens-meta').innerHTML.indexOf('UNSAVED') >= 0);
w.DENS.close();
ok('đóng modal', !$('dens-backdrop').classList.contains('on'));

console.log('\n── 2. AUTO trạng thái ĐẦU của cách 2 ──');
/* dựng 1 lot CŨ hơn trong Tank Log để AUTO có nguồn mà lấy */
const prev = new Array(69).fill('');
prev[1] = 'LPG-2026-341'; prev[2] = 'TK-3501'; prev[27] = 'Pass';
prev[33] = 0.5415; prev[45] = '50.46/49.54';
w.ENG.upsertRow(prev);
set('mc-l1', '342');
ok('2 ô ĐẦU bị khoá ở chế độ AUTO', $('dt1-idn').readOnly === true && $('dt1-iw3').readOnly === true);
ok('badge hiện AUTO', $('dt1-icqm').textContent === 'AUTO');
w.MC.autoFillIcq('1');
ok('AUTO tự điền ρ COQ đầu = 0.5415', String($('dt1-idn').value) === '0.5415');
ok('AUTO tự điền %wt C3 đầu = 50.46', String($('dt1-iw3').value) === '50.46');
ok('ghi rõ nguồn là lot 341', $('dt1-isrc').textContent.indexOf('LPG-2026-341') >= 0);
w.MC.toggleIcqMode('1');
ok('chuyển MANUAL → badge đổi', $('dt1-icqm').textContent === 'MANUAL');
ok('MANUAL → ô mở khoá', $('dt1-idn').readOnly === false);
set('dt1-idn', '0.6000');
w.MC.autoFillIcq('1');
ok('MANUAL thì AUTO KHÔNG ghi đè', String($('dt1-idn').value) === '0.6000');
w.MC.toggleIcqMode('1');
ok('về AUTO → nạp lại từ lot trước', String($('dt1-idn').value) === '0.5415');
ok('về AUTO → ô khoá lại', $('dt1-idn').readOnly === true);

console.log('\n── 3. MC.altCalc trên form thật (TK-3501) ──');
/* chỉ nhập phần engineer phải nhập; trạng thái ĐẦU đã do AUTO lo ở trên */
set('mc-iv1', '60.23'); set('gc1-fvol', '572.273'); set('gc1-den', '0.5425');
set('gc1-frw', '50.25/49.75');
set('dt1-mid', '301.34'); set('dt1-t3', '11.5'); set('dt1-p3', '6.22');
set('dt1-t4', '27.3'); set('dt1-p4', '1.98');
const R = w.MC.altCalc('1');
ok('cách 1 không lỗi', !R.dens.error);
ok('cách 2 không lỗi', !R.coq.error);
ok('Filled C3 bảng ≈138.84 (ρ giữ đủ số lẻ)', Math.abs(R.dens.fC3 - 138.840) < 0.01);
ok('Filled C4 COQ ≈138.296 (khớp Cal.xlsx, ĐẦU lấy tự động)', Math.abs(R.coq.fC4 - 138.296) < 0.002);
ok('bảng so sánh hiện ra', $('mc-cmp1').style.display === '' && $('mc-cmp1').innerHTML.indexOf('METHOD') >= 0);
ok('có đủ 3 dòng phương pháp',
   ['m-gc','m-dens','m-coq'].every(c=>$('mc-cmp1').innerHTML.indexOf(c) >= 0));
ok('chú thích nêu thứ tự bơm', $('mc-cmp1').innerHTML.indexOf('C4 → C3') >= 0);

console.log('\n── 4. Chọn phương pháp gửi Scale NGAY ở Tank Mix ──');
/* nhập GC thật để cả 3 phương pháp đều có số */
[['ch4','0.02'],['c2h6','1.18'],['c3h8','52.82'],['ic4','6.30'],['nc4','39.35'],
 ['bd13','0.02'],['c5','0.27'],['olef','0.08']].forEach(p=> set('gc1-' + p[0], p[1]));
w.MC.gcCalcInline('1');
w.MC.altCalc('1');
const cmp = $('mc-cmp1').innerHTML;
ok('bảng so sánh có cột ⇒ SCALE', cmp.indexOf('⇒ SCALE') >= 0);
ok('có radio chọn cho từng phương pháp', (cmp.match(/name="mcnm1"/g) || []).length === 3);
ok('mặc định GC được chọn', cmp.indexOf('m-gc m-sel') >= 0);
ok('có dòng nhắc Check Booth sẽ nhận số nào', cmp.indexOf('Check Booth') >= 0);
w.MC.pickNotifyMethod('1', 'coq');
ok('chọn COQ → dòng COQ được đánh dấu', $('mc-cmp1').innerHTML.indexOf('m-coq m-sel') >= 0);
w.MC.pickNotifyMethod('1', 'gc');
ok('chọn lại GC được', $('mc-cmp1').innerHTML.indexOf('m-gc m-sel') >= 0);

console.log('\n── 5. ENG: cột & chip phương pháp ──');
const row = new Array(69).fill('');
row[1] = 'LPG-2026-342'; row[2] = 'TK-3501'; row[3] = '20/05/26'; row[4] = '08:00'; row[5] = '14:00';
row[6] = 572.273; row[7] = 310.46; row[10] = 60.23; row[13] = 131.049; row[14] = 127.846; row[15] = 258.895;
row[27] = 'Pass'; row[33] = 0.5425; row[45] = '50.25/49.75';
row[61] = 138.840; row[62] = 135.779; row[66] = 139.548; row[67] = 138.296;
w.ENG.upsertRow(row);
const tb = $('engTbody');
ok('bảng render 2 dòng (lot 341 + 342)', (tb.innerHTML.match(/<tr/g) || []).length === 2);
ok('mỗi dòng có đúng 54 ô (khớp thead)', tb.querySelector('tr').querySelectorAll('td').length === 54);
ok('chip mặc định là GC', tb.innerHTML.indexOf('eng-mth-gc') >= 0);
ok('chip có dấu ▾ khi còn phương pháp khác', tb.innerHTML.indexOf('▾') >= 0);
ok('hiện số cách bảng 138.840', tb.innerHTML.indexOf('138.840') >= 0);
ok('hiện số cách COQ 139.548', tb.innerHTML.indexOf('139.548') >= 0);
let span = 0;
$('engTfoot').querySelector('tr').querySelectorAll('td').forEach(td=> span += parseInt(td.getAttribute('colspan') || 1));
ok('tfoot cộng đủ 54 cột', span === 54);

const idx = w.ENG.ROWS.findIndex(r=> String(r[1]) === 'LPG-2026-342');
w.ENG.cycleMethod(idx);
ok('xoay phương pháp → BẢNG', w.ENG.methodOf(w.ENG.ROWS[idx]) === 'dens');
ok('số gửi Scale đổi theo BẢNG', Math.abs(w.ENG.filledBy(w.ENG.ROWS[idx]).c3 - 138.840) < 1e-6);
w.ENG.cycleMethod(idx);
ok('xoay tiếp → COQ', w.ENG.methodOf(w.ENG.ROWS[idx]) === 'coq');
ok('số gửi Scale đổi theo COQ', Math.abs(w.ENG.filledBy(w.ENG.ROWS[idx]).c3 - 139.548) < 1e-6);
w.ENG.cycleMethod(idx);
ok('xoay vòng về GC', w.ENG.methodOf(w.ENG.ROWS[idx]) === 'gc');

console.log('\n── 6. ENG: lot mới có 1 phương pháp thì mở ô sửa để bổ sung ──');
const pIdx = w.ENG.ROWS.findIndex(r=> String(r[1]) === 'LPG-2026-341');
LOG.length = 0;
w.ENG.cycleMethod(pIdx);            // confirm() đã stub = true → mở modal
ok('lot thiếu dữ liệu → mở modal sửa dòng', $('engEditBg').classList.contains('on'));
ok('không đổi bừa phương pháp', w.ENG.methodOf(w.ENG.ROWS[pIdx]) === 'gc');
w.ENG.closeEdit();

console.log('\n── 7. ENG: cờ Stock Transfer không bị mất khi ghi lại ──');
w.ENG.setStockTransfer('LPG-2026-342', 'TK-3501', true, 'tester');
ok('đã tick ST', String(w.ENG.ROWS[idx][53]) === '1');
const again = w.ENG.ROWS[idx].slice(0, 69);
again[53] = ''; again[54] = ''; again[55] = '';
w.ENG.upsertRow(again, { rid: w.ENG.ROWS[idx]._rid });
ok('ghi lại dòng KHÔNG xoá mất cờ ST', String(w.ENG.ROWS[idx][53]) === '1');

console.log('\n── 8. ENG: modal sửa dòng + 3 nút chọn phương pháp ──');
w.ENG.openEdit(w.ENG.ROWS[idx]._rid);
const pick = $('engMethodPick').innerHTML;
ok('3 nút phương pháp render', (pick.match(/eng-mpick-btn/g) || []).length === 3);
ok('nút GC đang được chọn', pick.indexOf('p-gc on') >= 0);
ok('không nút nào bị khoá (đủ số cả 3)', pick.indexOf('disabled') < 0);
const grid = $('engEditGrid').innerHTML;
ok('modal có đủ 12 ô nhập mới',
   ['56','57','58','59','60','61','62','63','64','65','66','67']
     .every(c=> grid.indexOf('data-col="' + c + '"') >= 0));
/* Sau khi gom nhóm, KHÔNG được rơi mất ô nào so với bản phẳng cũ.
   Ngoại lệ hợp lệ: [0] số thứ tự · [24][25] bản sao của %C3/%C4 (cột 8/9,
   xưa nay chưa từng cho sửa) · [53..55] cờ Stock Transfer (tick ở bảng)
   · [68] phương pháp gửi Scale (chọn bằng 3 nút bên dưới). */
const SKIP = new Set([0, 24, 25, 53, 54, 55, 68]);
const missing = Array.from({length:69}, (_, i)=> i)
  .filter(i=> !SKIP.has(i) && grid.indexOf('data-col="' + i + '"') < 0);
ok('không rơi mất ô nào khi gom nhóm' + (missing.length ? ' — thiếu ' + missing.join(',') : ''),
   missing.length === 0);
ok('có tiêu đề nhóm', ['IDENTIFICATION','MIXING INPUT','DENSITY-TABLE INPUT',
   'GC ANALYSIS','COQ CERTIFICATE','INITIAL COQ STATE','FILLED RESULTS'].every(x=> grid.indexOf(x) >= 0));
ok('3 thẻ kết quả nằm cạnh nhau', (grid.match(/class="eng-rb /g) || []).length === 3);
ok('thẻ kết quả có ô C3/C4 của cả 3 cách',
   ['13','14','15','61','62','66','67'].every(c=> grid.indexOf('data-col="'+c+'" data-type="num" type="text" \nclass') >= 0
       || grid.indexOf('data-col="'+c+'"') >= 0));
ok('nhãn đã sang tiếng Anh (không còn dấu tiếng Việt ở nhãn mới)',
   grid.indexOf('BẢNG') < 0 && grid.indexOf('ĐẦU') < 0 && grid.indexOf('Nguồn') < 0);
w.ENG.pickMethod('coq');
ok('bấm nút COQ → lưu vào dòng', w.ENG.methodOf(w.ENG.ROWS[idx]) === 'coq');
w.ENG.closeEdit();

console.log('\n── 9. ENG: xuất CSV khớp số cột ──');
const engSrc = fs.readFileSync(path.join(ROOT, 'js/features/eng.js'), 'utf8');
const cols = (engSrc.match(/const headers = \[([\s\S]*?)\];/)[1].match(/'/g) || []).length / 2;
ok('CSV header đủ 69 cột (đang ' + cols + ')', cols === 69);

console.log('\n────────────────────────────────');
console.log(fail ? '❌ ' + fail + ' LỖI' : '✅ SMOKE TEST TOÀN BỘ ĐẠT');
process.exit(fail ? 1 : 0);
