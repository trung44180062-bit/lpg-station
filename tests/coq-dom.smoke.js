/* ═══════════════════════════════════════════════════════════════════════
   v4.86 — SMOKE TEST TRÊN DOM THẬT (cần jsdom)
   Nạp index.html + eng.js + mixctrl.js vào jsdom rồi bấm thử từng nút:
     • phương pháp ② tra bảng density đã BIẾN MẤT hoàn toàn khỏi UI
     • trạng thái ĐẦU của cách COQ chạy AUTO, khoá ô nhập, MANUAL thì
       AUTO không ghi đè nữa
     • MC.altCalc chạy trên đúng các ô nhập của form TK-3501
     • bảng so sánh chỉ còn 2 dòng GC / COQ và chọn được số gửi Scale
     • Tank Log render đủ 52 cột (khớp thead & tfoot), chip phương pháp
     • cờ Stock Transfer KHÔNG bị mất khi ghi đè dòng (ROW_W vẫn 69)
     • modal ◈ COQ AUDIT liệt kê đúng lot thiếu số và back-fill được
     npm i jsdom && node tests/coq-dom.smoke.js
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
const ALERTS = [];
const CONFIRMS = [];
w.confirm = m=>{ CONFIRMS.push(String(m)); return true; };
w.alert = m=> ALERTS.push(String(m));
w.prompt = ()=> 'CONFIRM';
w.logAudit = ()=>{}; w.canWrite = ()=> true;
w.URL.createObjectURL = ()=> 'blob:x'; w.URL.revokeObjectURL = ()=>{};

const files = ['js/features/eng.js', 'js/features/mixctrl.js'];
const bundle = files.map(f=>fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n')
  + '\n;window.ENG=ENG;window.MC=MC;';
try{ w.eval(bundle); }catch(e){ console.log('❌ LOAD BUNDLE → ' + e.message); process.exit(1); }

let fail = 0;
const ok = (l, c)=>{ console.log((c ? '  ✅ ' : '  ❌ ') + l); if(!c) fail++; };
const $  = id => w.document.getElementById(id);
const set = (id, v)=>{ const e = $(id); if(!e) throw new Error('thiếu #' + id); e.value = v; };

console.log('\n── 1. Bảng density đã được gỡ sạch ──');
ok('không còn module DENS', typeof w.DENS === 'undefined');
ok('không còn modal bảng density', !$('dens-backdrop'));
ok('không còn ô MID VOL / temp / pres',
   !$('dt1-mid') && !$('dt1-t3') && !$('dt1-p3') && !$('dt2-t4') && !$('dt2-p4'));
ok('index.html không còn gọi DENS.', html.indexOf('DENS.') < 0);
ok('index.html không còn nạp density.js', html.indexOf('src="js/data/density.js') < 0);
ok('không còn cột ▣Table trên thead', html.indexOf('▣Table') < 0);
ok('thead Tank Log còn đúng 52 cột',
   (function(){
     const t = w.document.querySelector('#engTbl thead tr');
     return t && t.querySelectorAll('th').length === 52;
   })());

console.log('\n── 2. AUTO trạng thái ĐẦU của cách COQ ──');
w.ENG.init && (function(){ try{ w.ENG.init(); }catch(_){} })();
const mkRow = ()=> new Array(69).fill('');
const prev = mkRow();
prev[1] = 'LPG-2026-341'; prev[2] = 'TK-3501'; prev[3] = '19/05/26'; prev[27] = 'Pass';
prev[33] = 0.5415; prev[45] = '50.46/49.54';
w.ENG.upsertRow(prev);
w.MC.init && (function(){ try{ w.MC.init(); }catch(_){} })();
set('mc-l1', '342');
w.MC.autoFillIcq('1', true);
ok('AUTO tự điền ρ COQ đầu = 0.5415', String($('dt1-idn').value) === '0.5415');
ok('AUTO tự điền %wt C3 đầu = 50.46', String($('dt1-iw3').value) === '50.46');
ok('ô nhập bị khoá khi AUTO', $('dt1-idn').readOnly === true);
ok('badge hiện AUTO', $('dt1-icqm').textContent === 'AUTO');
ok('ghi rõ lấy từ lot nào', $('dt1-isrc').textContent.indexOf('LPG-2026-341') >= 0);
w.MC.toggleIcqMode('1');
ok('chuyển MANUAL → mở khoá ô', $('dt1-idn').readOnly === false);
set('dt1-idn', '0.5390');
w.MC.autoFillIcq('1');           // không loud → MANUAL thì phải bỏ qua
ok('MANUAL thì AUTO không ghi đè', String($('dt1-idn').value) === '0.5390');
w.MC.toggleIcqMode('1');
ok('về AUTO → nạp lại từ lot trước', String($('dt1-idn').value) === '0.5415');

console.log('\n── 3. MC.altCalc trên form thật ──');
set('mc-iv1', '60.23'); set('gc1-fvol', '572.273'); set('gc1-den', '0.5425');
set('gc1-frw', '50.25/49.75');
const R = w.MC.altCalc('1', true);
ok('cách COQ không lỗi', !R.coq.error);
ok('Filled C3 COQ ≈ 139.548', Math.abs(R.coq.fC3 - 139.548) < 0.001);
ok('Filled C4 COQ ≈ 138.296', Math.abs(R.coq.fC4 - 138.296) < 0.001);
ok('không còn nhánh dens trong kết quả', R.dens === undefined);

console.log('\n── 4. Bảng so sánh chỉ còn 2 phương pháp ──');
[['ch4','0.02'],['c2h6','1.18'],['c3h8','52.82'],['ic4','6.30'],['nc4','39.35'],
 ['bd13','0.02'],['c5','0.27'],['olef','0.08']].forEach(p=> set('gc1-' + p[0], p[1]));
w.MC.gcCalcInline('1');
w.MC.altCalc('1');
const cmp = $('mc-cmp1').innerHTML;
ok('đúng 2 radio chọn', (cmp.match(/name="mcnm1"/g) || []).length === 2);
ok('không còn dòng Density table', cmp.indexOf('Density table') < 0 && cmp.indexOf('m-dens') < 0);
ok('có dòng ⇒ SCALE', cmp.indexOf('⇒ SCALE') >= 0);
ok('mặc định chọn COQ (số chính thức)', cmp.indexOf('m-coq m-sel') >= 0);
w.MC.pickNotifyMethod('1', 'gc');
ok('chọn lại GC được', $('mc-cmp1').innerHTML.indexOf('m-gc m-sel') >= 0);

console.log('\n── 5. ENG: cột & chip phương pháp ──');
const row = mkRow();
row[1] = 'LPG-2026-342'; row[2] = 'TK-3501'; row[3] = '20/05/26'; row[4] = '08:00'; row[5] = '14:00';
row[6] = 572.273; row[7] = 310.46; row[10] = 60.23; row[13] = 131.049; row[14] = 127.846; row[15] = 258.895;
row[27] = 'Pass'; row[33] = 0.5425; row[45] = '50.25/49.75';
row[63] = 0.5415; row[64] = 50.46; row[66] = 139.548; row[67] = 138.296;
w.ENG.upsertRow(row);
const tb = $('engTbody');
ok('bảng render 2 dòng', (tb.innerHTML.match(/<tr/g) || []).length === 2);
ok('mỗi dòng có đúng 52 ô (khớp thead)', tb.querySelector('tr').querySelectorAll('td').length === 52);
ok('hiện số cách COQ 139.548', tb.innerHTML.indexOf('139.548') >= 0);
ok('không còn ô td-dens (cột Density gốc vẫn giữ)', tb.innerHTML.indexOf('"td-r td-dens"') < 0);
let span = 0;
$('engTfoot').querySelector('tr').querySelectorAll('td').forEach(td=> span += parseInt(td.getAttribute('colspan') || 1));
ok('tfoot cộng đủ 52 cột', span === 52);

const idx = w.ENG.ROWS.findIndex(r=> String(r[1]) === 'LPG-2026-342');
ok('chip mặc định là GC', w.ENG.methodOf(w.ENG.ROWS[idx]) === 'gc');
w.ENG.cycleMethod(idx);
ok('xoay phương pháp → COQ', w.ENG.methodOf(w.ENG.ROWS[idx]) === 'coq');
ok('số gửi Scale đổi theo COQ', Math.abs(w.ENG.filledBy(w.ENG.ROWS[idx]).c3 - 139.548) < 1e-6);
w.ENG.cycleMethod(idx);
ok('xoay vòng về GC', w.ENG.methodOf(w.ENG.ROWS[idx]) === 'gc');

console.log('\n── 6. Lot cũ lưu phương pháp "dens" phải tự lùi về GC ──');
const legacy = mkRow();
legacy[1] = 'LPG-2026-340'; legacy[2] = 'TK-3502'; legacy[13] = 100; legacy[14] = 100;
legacy[61] = 98; legacy[62] = 99; legacy[68] = 'dens';
w.ENG.upsertRow(legacy);
const lIdx = w.ENG.ROWS.findIndex(r=> String(r[1]) === 'LPG-2026-340');
ok('methodOf("dens") → gc', w.ENG.methodOf(w.ENG.ROWS[lIdx]) === 'gc');
ok('số gửi Scale lấy cột GC chứ không lấy cột bảng',
   Math.abs(w.ENG.filledBy(w.ENG.ROWS[lIdx]).c3 - 100) < 1e-9);

console.log('\n── 7. Cờ Stock Transfer không bị mất khi ghi lại ──');
w.ENG.setStockTransfer('LPG-2026-342', 'TK-3501', true, 'tester');
ok('đã tick ST', String(w.ENG.ROWS[idx][53]) === '1');
const again = w.ENG.ROWS[idx].slice(0, 69);
again[53] = ''; again[54] = ''; again[55] = '';
w.ENG.upsertRow(again, { rid: w.ENG.ROWS[idx]._rid });
ok('ghi lại dòng KHÔNG xoá mất cờ ST', String(w.ENG.ROWS[idx][53]) === '1');

console.log('\n── 8. Modal sửa dòng ──');
w.ENG.openEdit(w.ENG.ROWS[idx]._rid);
const pick = $('engMethodPick').innerHTML;
ok('đúng 2 nút phương pháp', (pick.match(/eng-mpick-btn/g) || []).length === 2);
ok('không còn nút p-dens', pick.indexOf('p-dens') < 0);
const grid = $('engEditGrid').innerHTML;
ok('không còn nhóm DENSITY-TABLE INPUT', grid.indexOf('DENSITY-TABLE INPUT') < 0);
ok('không còn ô 56–62', ['56','57','58','59','60','61','62']
   .every(c=> grid.indexOf('data-col="' + c + '"') < 0));
ok('vẫn còn ô trạng thái đầu 63/64/65 và kết quả 66/67',
   ['63','64','65','66','67'].every(c=> grid.indexOf('data-col="' + c + '"') >= 0));
/* Không được rơi mất ô nào. Ngoại lệ hợp lệ: [0] STT · [24][25] bản sao %C3/%C4
   · [53..55] cờ ST · [56..62] đã nghỉ hưu · [68] chọn bằng nút riêng. */
const SKIP = new Set([0, 24, 25, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 68]);
const missing = Array.from({length:69}, (_, i)=> i)
  .filter(i=> !SKIP.has(i) && grid.indexOf('data-col="' + i + '"') < 0);
ok('không rơi mất ô nào' + (missing.length ? ' — thiếu ' + missing.join(',') : ''), missing.length === 0);
ok('đúng 2 thẻ kết quả', (grid.match(/class="eng-rb /g) || []).length === 2);
w.ENG.closeEdit();

console.log('\n── 9. ◈ COQ AUDIT ──');
/* Lot thiếu Pro/Bu %Wt → không thể tính, phải báo NO COQ */
const noCoq = mkRow();
noCoq[1] = 'LPG-2026-343'; noCoq[2] = 'TK-3501'; noCoq[6] = 570; noCoq[10] = 100;
noCoq[13] = 120; noCoq[14] = 130; noCoq[27] = 'Pass';
w.ENG.upsertRow(noCoq);
/* Lot đủ COQ nhưng CHƯA có [66]/[67] và chưa có trạng thái đầu → back-fill được
   (lot 342 cùng bồn, cũ hơn, đã Pass và có đủ ρ + %wt) */
const fixable = mkRow();
fixable[1] = 'LPG-2026-344'; fixable[2] = 'TK-3501'; fixable[3] = '22/05/26';
fixable[6] = 575.0; fixable[10] = 80.0; fixable[13] = 140; fixable[14] = 140;
fixable[27] = 'Pass'; fixable[33] = 0.5430; fixable[45] = '51.00/49.00';
w.ENG.upsertRow(fixable);

const scan = w.ENG.coqScan();
const byLot = {}; scan.forEach(x=> byLot[x.lot] = x);
ok('lot 342 đã có số → SAVED', byLot['LPG-2026-342'].state === 'ok');
ok('lot 343 thiếu chứng thư → NO COQ', byLot['LPG-2026-343'].state === 'nocoq');
ok('lot 343 nêu đích danh ô thiếu',
   byLot['LPG-2026-343'].need.join(' ').indexOf('Pro/Bu') >= 0);
ok('lot 344 đủ dữ liệu → CAN BACK-FILL', byLot['LPG-2026-344'].state === 'fix');
ok('lot 344 tự lấy trạng thái đầu từ lot 342',
   Math.abs(byLot['LPG-2026-344'].resolved.iDen - 0.5425) < 1e-9);

w.ENG.coqAudit();
ok('modal audit mở', $('engCoqAuditBg').classList.contains('on'));
const au = $('engCoqAuditBg').innerHTML;
ok('audit liệt kê đủ lot', ['342','343','344'].every(n=> au.indexOf('LPG-2026-' + n) >= 0));
ok('audit có nút back-fill', au.indexOf('BACK-FILL') >= 0);
ok('audit có công thức để giải trình', au.indexOf('FINAL VOL') >= 0);

w.ENG.coqBackfill();
const fIdx = w.ENG.ROWS.findIndex(r=> String(r[1]) === 'LPG-2026-344');
const fr = w.ENG.ROWS[fIdx];
/* 575×0.5430×0.51 − 80×0.5425×0.5025 = 159.23475 − 21.8085 = 137.42625 */
ok('back-fill ghi Filled C3 COQ',
   Math.abs(parseFloat(fr[66]) - (575*0.5430*0.51 - 80*0.5425*0.5025)) < 0.002);
ok('back-fill ghi Filled C4 COQ', Math.abs(parseFloat(fr[67]) - (575*0.5430*0.49 - 80*0.5425*0.4975)) < 0.002);
ok('back-fill ghi trạng thái đầu', Math.abs(parseFloat(fr[63]) - 0.5425) < 1e-9);
ok('back-fill ghi nguồn', String(fr[65]).indexOf('LPG-2026-342') >= 0);
ok('back-fill KHÔNG đụng cột GC', parseFloat(fr[13]) === 140 && parseFloat(fr[14]) === 140);
ok('lot thiếu chứng thư vẫn để trống', String(w.ENG.ROWS.find(r=>String(r[1])==='LPG-2026-343')[66]) === '');
w.ENG.closeCoqAudit();
ok('đóng modal audit', !$('engCoqAuditBg').classList.contains('on'));

console.log('\n── 10. Nút ◈ CALC COQ trong modal sửa dòng ──');
/* Dữ liệu thật lot 355/356 — Pro/Bu %Wt ghi kiểu MỘT SỐ ("25.3" / "50.5") */
const r355 = mkRow();
r355[1]='LPG-2026-355'; r355[2]='TK-3502'; r355[3]='17/08/26'; r355[27]='Pass';
r355[10]=58.945; r355[6]=425.661; r355[7]=239.86; r355[33]=0.564;
r355[44]='28.03'; r355[45]='25.3';
w.ENG.upsertRow(r355);
const r356 = mkRow();
r356[1]='LPG-2026-356'; r356[2]='TK-3502'; r356[3]='18/08/26'; r356[27]='Pass';
r356[10]=336.000; r356[6]=563.445; r356[7]=305.669; r356[33]=0.542;
r356[13]=100.898; r356[14]=8.168; r356[15]=109.066;
r356[44]='53.97'; r356[45]='50.5';
w.ENG.upsertRow(r356);
const i356 = w.ENG.ROWS.findIndex(r=> String(r[1]) === 'LPG-2026-356');
ok('356 vào bảng chưa có số COQ', String(w.ENG.ROWS[i356][66]) === '');

w.ENG.openEdit(w.ENG.ROWS[i356]._rid);
ok('khối diễn giải ban đầu chưa hiện', !$('engCoqInfo') || $('engCoqInfo').style.display === 'none');
w.ENG.calcCoqOnly();
const R356 = w.ENG.ROWS[i356];
ok('◈ CALC COQ ghi Filled C3',
   Math.abs(parseFloat(R356[66]) - (563.445*0.542*0.505 - 336*0.564*0.253)) < 0.002);
ok('◈ CALC COQ ghi Filled C4',
   Math.abs(parseFloat(R356[67]) - (563.445*0.542*0.495 - 336*0.564*0.747)) < 0.002);
ok('ghi trạng thái đầu ρ = 0.564', Math.abs(parseFloat(R356[63]) - 0.564) < 1e-9);
ok('ghi trạng thái đầu %wt = 25.3', Math.abs(parseFloat(R356[64]) - 25.3) < 1e-6);
ok('ghi nguồn = lot 355', String(R356[65]).indexOf('LPG-2026-355') >= 0);
ok('KHÔNG đụng cột GC', parseFloat(R356[13]) === 100.898 && parseFloat(R356[14]) === 8.168);
ok('KHÔNG đổi Quality', String(R356[27]) === 'Pass');
ok('KHÔNG tự đổi ⇒Scale sang COQ', w.ENG.methodOf(R356) === 'gc');
const info = $('engCoqInfo');
ok('hiện khối diễn giải', !!info && info.className.indexOf('lv-ok') >= 0);
ok('diễn giải có đủ 3 dòng (đầu / cuối / filled)',
   (info.innerHTML.match(/<tr/g) || []).length >= 3);
ok('diễn giải có so sánh với GC', info.innerHTML.indexOf('vs ① GC') >= 0);
ok('bảng Tank Log hiện số COQ mới', $('engTbody').innerHTML.indexOf('106.276') >= 0);

/* Thiếu dữ liệu → nêu đích danh, KHÔNG ghi gì */
const bad = mkRow();
bad[1]='LPG-2026-360'; bad[2]='TK-3501'; bad[27]='Pass'; bad[10]=50; bad[6]=560; bad[33]=0.543;
w.ENG.upsertRow(bad);
const iBad = w.ENG.ROWS.findIndex(r=> String(r[1]) === 'LPG-2026-360');
w.ENG.openEdit(w.ENG.ROWS[iBad]._rid);
w.ENG.calcCoqOnly();
ok('thiếu %Wt → không ghi kết quả', String(w.ENG.ROWS[iBad][66]) === '');
ok('thiếu %Wt → báo đỏ', $('engCoqInfo').className.indexOf('lv-bad') >= 0);
ok('thiếu %Wt → gọi tên ô', $('engCoqInfo').innerHTML.indexOf('Pro/Bu %Wt') >= 0);
/* Gõ %Wt vào ô rồi bấm lại → ra ngay, không cần SAVE trước */
const inp45 = w.document.querySelector('#engEditModal input[data-col="45"]');
ok('modal có ô Pro/Bu %Wt', !!inp45);
inp45.value = '50';
w.ENG.calcCoqOnly();
ok('gõ thẳng vào ô rồi CALC là ra số', parseFloat(w.ENG.ROWS[iBad][66]) > 0);
ok('ô vừa gõ được lưu vào dòng', String(w.ENG.ROWS[iBad][45]) === '50');
w.ENG.closeEdit();
ok('đóng modal thì ẩn khối diễn giải', $('engCoqInfo').style.display === 'none');

console.log('\n── 11. Cảnh báo dữ liệu COQ (v4.87) ──');
/* a) Lot Pass mà cột COQ trống → cờ ⚠ ngay trên bảng, hover ra ô còn thiếu */
const flag = mkRow();
flag[1]='LPG-2026-361'; flag[2]='TK-3501'; flag[3]='20/08/26'; flag[27]='Pass';
flag[10]=80; flag[6]=560; flag[33]=0.543; flag[13]=120; flag[14]=130;   // thiếu %Wt
w.ENG.upsertRow(flag);
const nFlag = h => (h.match(/td-cq-miss/g) || []).length;
const tbHtml = $('engTbody').innerHTML;
const flagBefore = nFlag(tbHtml);
ok('bảng gắn cờ ⚠ cho lot Pass thiếu COQ', flagBefore > 0);
ok('tooltip nêu đích danh ô thiếu', tbHtml.indexOf('Pro/Bu %Wt is empty') >= 0);

/* b) Mở dòng đó → khối đỏ hiện ngay, KHÔNG bật hộp thoại */
ALERTS.length = 0;
const iFlag = w.ENG.ROWS.findIndex(r=> String(r[1]) === 'LPG-2026-361');
w.ENG.openEdit(w.ENG.ROWS[iFlag]._rid);
ok('mở dòng là thấy ngay khối đỏ', $('engCoqInfo').className.indexOf('lv-bad') >= 0);
ok('khối đỏ gọi tên ô Pro/Bu %Wt', $('engCoqInfo').innerHTML.indexOf('Pro/Bu %Wt') >= 0);
ok('mở dòng KHÔNG bật hộp thoại', ALERTS.length === 0);

/* c) Bấm ◈ CALC COQ khi thiếu → hộp thoại + không ghi gì */
ALERTS.length = 0;
w.ENG.calcCoqOnly();
ok('◈ CALC COQ thiếu dữ liệu → bật hộp thoại', ALERTS.length === 1);
ok('hộp thoại nêu đích danh ô', /Pro\/Bu %Wt is empty/.test(ALERTS[0]));
ok('hộp thoại nói rõ chưa ghi gì', /Chưa ghi gì vào dòng/.test(ALERTS[0]));
ok('thật sự không ghi', String(w.ENG.ROWS[iFlag][66]) === '');

/* d) Gõ %Wt có tổng ≠ 100 → TỪ CHỐI tính, KHÔNG tự nắn số */
ALERTS.length = 0;
const in45 = w.document.querySelector('#engEditModal input[data-col="45"]');
in45.value = '50.5/48.5';
w.ENG.calcCoqOnly();
ok('tổng 99 % → vẫn từ chối tính', String(w.ENG.ROWS[iFlag][66]) === '');
ok('báo đúng tổng thực tế 99.00 %', /adds up to 99\.00 %/.test(ALERTS[0] || ''));
ok('khẳng định KHÔNG tự sửa số chứng thư', /will NOT adjust/.test(ALERTS[0] || ''));

/* e) Sửa lại cho tổng = 100 → tính ra ngay */
ALERTS.length = 0;
in45.value = '50.5/49.5';
w.ENG.calcCoqOnly();
ok('tổng 100 % → tính được', parseFloat(w.ENG.ROWS[iFlag][66]) > 0);
ok('dùng đúng 50.5 % (không phải 50.5/99)',
   Math.abs(parseFloat(w.ENG.ROWS[iFlag][66]) - (560*0.543*0.505 - 80*0.5425*0.5046)) < 0.5);
ok('tính được thì không còn hộp thoại lỗi', ALERTS.length === 0);
ok('khối diễn giải chuyển sang xanh', $('engCoqInfo').className.indexOf('lv-ok') >= 0);
ok('lot vừa sửa bỏ được cờ ⚠', nFlag($('engTbody').innerHTML) === flagBefore - 1);
w.ENG.closeEdit();

/* f) Import COQ vào modal mà thiếu dữ liệu → cảnh báo ngay (không đợi CALC) */
ALERTS.length = 0;
const bare = mkRow();
bare[1]='LPG-2026-362'; bare[2]='TK-3501'; bare[27]='Pass'; bare[10]=70; bare[13]=100; bare[14]=100;
w.ENG.upsertRow(bare);
const iBare = w.ENG.ROWS.findIndex(r=> String(r[1]) === 'LPG-2026-362');
w.ENG.openEdit(w.ENG.ROWS[iBare]._rid);
ALERTS.length = 0;
const probs = w.ENG.coqCheckModal('IMPORT COQ TEST', 'LPG-2026-362');
ok('kiểm tra sau import nêu ≥2 mục thiếu', probs.length >= 2);
ok('… và bật hộp thoại ngay', ALERTS.length === 1);
ok('nhắc COQ là số liệu CHÍNH THỨC', /CHÍNH TH/.test(ALERTS[0]));
w.ENG.closeEdit();

/* g) MC: cổng kiểm tra dùng chung cho Tank Mix */
set('gc1-frw', '50.5/48.5');
const gate = w.MC.coqGate('1');
ok('MC.coqGate chặn khi tổng %Wt ≠ 100', !gate.ok);
ok('MC.coqGate nêu đúng lý do', gate.problems.join(' ').indexOf('adds up to 99.00') >= 0);
set('gc1-frw', '50.25/49.75');
ok('MC.coqGate thông khi tổng = 100', w.MC.coqGate('1').ok);

console.log('\n─────────────────────────────────────');
console.log(fail ? '❌ ' + fail + ' assert FAIL' : '✅ TẤT CẢ ASSERT PASS');
process.exit(fail ? 1 : 0);
