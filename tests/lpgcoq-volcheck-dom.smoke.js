/* ═══════════════════════════════════════════════════════════════════════
   v4.107/4.108 — SMOKE TEST TRÊN DOM THẬT (cần jsdom)
   Kiểm hai thay đổi mới:

   A. TANK LOG — cột "Filled LPG" nay là Σ (C3 ◈COQ + C4 ◈COQ)
      • lot CÓ kết quả COQ → cột LPG = tổng hai cột COQ, KHÔNG phải ô [15]
      • lot CHƯA có COQ    → lùi về số GC, ô mang lớp `lpg-gc` để nhìn ra
      • Σ TỔNG dưới chân bảng cộng theo đúng con số đang hiện
      • hai cột Filled C3 / Filled C4 (GC) đã hạ nổi bật (không nền màu)

   B. SCALE — nút 📏 trên thẻ tank vẫn đúng chỗ và trỏ sang bảng mới
      (bảng spot-check của v4.107 đã được thay bằng ⚖ Stock-transfer
       reconciliation ở v4.108 — xem tests/stx-recon-dom.smoke.js)

     npm i jsdom && node tests/lpgcoq-volcheck-dom.smoke.js
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
w.confirm = ()=> true;
w.alert = ()=>{};
w.logAudit = ()=>{}; w.canWrite = ()=> true;
w.CURRENT_USER = { name:'test' };
w.URL.createObjectURL = ()=> 'blob:x'; w.URL.revokeObjectURL = ()=>{};

const bundle = ['js/features/eng.js', 'js/features/mixctrl.js', 'js/features/inv.js']
  .map(f=>fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n')
  + '\n;window.ENG=ENG;window.MC=MC;window.INV=INV;';
try{ w.eval(bundle); }catch(e){ console.log('❌ LOAD BUNDLE → ' + e.message); process.exit(1); }
try{ w.MC.init(); }catch(_){}
try{ w.ENG.init(); }catch(_){}

let fail = 0;
const ok   = (l, c, v)=>{ console.log((c ? '  ✅ ' : '  ❌ ') + l + (v === undefined ? '' : ' → ' + v)); if(!c) fail++; };
const near = (l, got, want, tol)=> ok(l, Math.abs(got - want) <= tol, got + ' (mong ' + want + ')');
const $    = id => w.document.getElementById(id);
const num  = s => parseFloat(String(s || '').replace(/,/g, ''));

/* dựng một dòng Tank Log 69 cột */
function mkRow(o){
  const r = new Array(69).fill('');
  r[1] = o.lot; r[2] = o.tank; r[3] = '20/08/26'; r[27] = o.qual || 'Pass';
  r[10] = o.iv || 0; r[6] = o.fv || 0;
  r[13] = o.gc3 === undefined ? '' : o.gc3;
  r[14] = o.gc4 === undefined ? '' : o.gc4;
  r[15] = o.glpg === undefined ? '' : o.glpg;
  r[33] = o.den === undefined ? '' : o.den;
  r[45] = o.w3raw === undefined ? '' : o.w3raw;
  if(o.qc3 !== undefined) r[66] = o.qc3;
  if(o.qc4 !== undefined) r[67] = o.qc4;
  return r;
}

/* ═════════ A. CỘT LPG TRÊN TANK LOG ═════════ */
console.log('\n── A1. Lot CÓ kết quả COQ → LPG = C3◈COQ + C4◈COQ ──');
const withCoq = mkRow({ lot:'LPG-2026-901', tank:'TK-3501',
  iv:336, fv:563.445, den:0.5420, w3raw:'50.5/49.5',
  gc3:100.000, gc4:10.000, glpg:110.000,      // số GC CỐ TÌNH lệch số COQ
  qc3:106.276, qc4:9.608 });
w.ENG.upsertRow(withCoq);
const L1 = w.ENG.lpgOf(withCoq);
near('lpgOf = 106.276 + 9.608', L1.v, 115.884, 1e-9);
ok('nguồn ghi là coq', L1.src === 'coq', L1.src);
ok('KHÔNG lấy ô [15] của GC (110.000)', Math.abs(L1.v - 110) > 1, L1.v);

console.log('\n── A2. Lot CHƯA có COQ → lùi về số GC, có cờ ᴳᶜ ──');
const noCoq = mkRow({ lot:'LPG-2026-902', tank:'TK-3502',
  iv:50, fv:500, gc3:80.000, gc4:20.000, glpg:100.000 });
w.ENG.upsertRow(noCoq);
const L2 = w.ENG.lpgOf(noCoq);
near('lpgOf lùi về ô [15] = 100', L2.v, 100, 1e-9);
ok('nguồn ghi là gc', L2.src === 'gc', L2.src);
/* [15] trống thì cộng [13]+[14] */
const noCoqNoSum = mkRow({ lot:'LPG-2026-903', tank:'TK-3502', gc3:11.5, gc4:8.25 });
near('[15] trống → cộng [13]+[14]', w.ENG.lpgOf(noCoqNoSum).v, 19.75, 1e-9);
/* trống hoàn toàn → null, không phải 0 */
ok('dòng trống trơn → null (ô để trống, không in số 0)',
   w.ENG.lpgOf(mkRow({ lot:'LPG-2026-904', tank:'TK-3501' })).v === null);

console.log('\n── A3. Bảng vẽ ra đúng số + đúng lớp CSS ──');
w.ENG.render();
const rowOf = lot => Array.from(w.document.querySelectorAll('#engTbl tbody tr'))
  .find(tr => tr.children[2] && tr.children[2].textContent.trim() === lot);
const tr1 = rowOf('LPG-2026-901'), tr2 = rowOf('LPG-2026-902');
ok('dòng 901 có trên bảng', !!tr1);
ok('dòng 902 có trên bảng', !!tr2);
const lpgCell = tr => tr.querySelector('.td-fill-lpg');
near('ô LPG dòng 901 hiện 115.884', num(lpgCell(tr1).textContent), 115.884, 1e-9);
ok('dòng 901 KHÔNG mang cờ lpg-gc', !lpgCell(tr1).classList.contains('lpg-gc'));
near('ô LPG dòng 902 hiện 100.000', num(lpgCell(tr2).textContent), 100, 1e-9);
ok('dòng 902 MANG cờ lpg-gc', lpgCell(tr2).classList.contains('lpg-gc'));
ok('tooltip dòng 902 nói rõ đang lùi về GC', /chưa có kết quả COQ/i.test(lpgCell(tr2).getAttribute('title')));

console.log('\n── A4. Σ TỔNG cộng theo đúng con số đang hiện ──');
const tfLpg = w.document.querySelector('#engTfoot .td-fill-lpg');
ok('có ô Σ LPG dưới chân bảng', !!tfLpg);
/* trên bảng chỉ có 2 dòng: 115.884 (theo COQ) + 100 (lùi về GC) */
near('Σ LPG = 115.884 (COQ) + 100 (GC)', num(tfLpg.textContent), 215.884, 5e-4);
const chip = w.document.querySelector('#engStats .eng-tot-chip');
ok('chip Σ nêu số lot đang lùi về GC', /lot ᴳᶜ/.test(chip.innerHTML), chip.textContent.trim());
/* ΣC3 và ΣC4 trên chip cũng phải theo nền COQ, và khép lại đúng ΣLPG */
const mC3 = chip.innerHTML.match(/ΣC3 <b>([\d.,]+)<\/b>/);
const mC4 = chip.innerHTML.match(/ΣC4 <b>([\d.,]+)<\/b>/);
near('ΣC3 = 106.276 (COQ) + 80 (GC)', num(mC3[1]), 186.276, 5e-4);
near('ΣC4 = 9.608 (COQ) + 20 (GC)',   num(mC4[1]), 29.608, 5e-4);
near('ΣC3 + ΣC4 = ΣLPG (không lệch nền)',
     num(mC3[1]) + num(mC4[1]), num(tfLpg.textContent), 2e-3);

console.log('\n── A5. Hai cột Filled C3 / C4 (GC) đã hạ nổi bật ──');
const css = fs.readFileSync(path.join(ROOT, 'css/core.css'), 'utf8');
ok('td-fill-c3 bỏ nền màu', /\.eng-tbl \.td-fill-c3\{background:transparent;/.test(css));
ok('td-fill-c4 bỏ nền màu', /\.eng-tbl \.td-fill-c4\{background:transparent;/.test(css));
ok('td-fill-lpg VẪN nổi bật', /\.eng-tbl \.td-fill-lpg\{background:#fef0f1;/.test(css));
ok('tiêu đề cột ghi rõ (GC)', /Filled C3 <i[^>]*>\(GC\)/.test(html));

console.log('\n── A6. THỨ BẬC ĐỌC: ◈COQ bật nhất, Open/End dịu lại ──');
/* User chốt 24/08: cặp C3/C4 ◈COQ là SỐ CHÍNH THỨC nên phải nổi nhất bảng;
   Open/End chỉ để đối chiếu nên không được tranh mắt. Khoá lại bằng test để
   lần sau sửa CSS không vô tình đảo ngược thứ bậc. */
const wOf = sel => { const m = css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
                       + '\\{[^}]*font-weight:(\\d+)')); return m ? parseInt(m[1]) : null; };
const cqW = wOf('.eng-tbl td.td-cq2'), spW = wOf('.eng-tbl .td-split');
ok('◈COQ in đậm hơn hẳn Open/End', cqW !== null && spW !== null && cqW >= 700 && spW <= 500,
   '◈COQ ' + cqW + ' vs split ' + spW);
ok('◈COQ có cỡ chữ riêng, to hơn cột thường', /\.eng-tbl td\.td-cq2\{[^}]*font-size:11px/.test(css));
ok('cặp ◈COQ có viền hai bên để đọc thành một khối',
   /\.eng-tbl td\.td-cq2\.cq-l\{border-left:2px/.test(css)
   && /\.eng-tbl td\.td-cq2\.cq-r\{border-right:2px/.test(css));
ok('Open/End nền gần như trắng, không tranh mắt',
   /\.eng-tbl \.td-split-o\{background:#f7fbfa/.test(css)
   && /\.eng-tbl \.td-split-e\{background:#faf8fd/.test(css));
/* trên DOM thật: đúng ô nào mang lớp viền */
w.ENG.render();
const trQ = rowOf('LPG-2026-901');
const cq = Array.from(trQ.querySelectorAll('.td-cq2'));
ok('ô C3 ◈COQ mang viền trái', cq[0] && cq[0].classList.contains('cq-l'));
ok('ô C4 ◈COQ mang viền phải', cq[1] && cq[1].classList.contains('cq-r'));
ok('… và KHÔNG dán nhầm lên cột Open/End',
   Array.from(trQ.querySelectorAll('.td-split')).every(td =>
     !td.classList.contains('cq-l') && !td.classList.contains('cq-r')));
const tfQ = Array.from(w.document.querySelectorAll('#engTfoot .td-cq2'));
ok('hàng Σ TỔNG cũng có viền cho khớp',
   tfQ.length === 2 && tfQ[0].classList.contains('cq-l') && tfQ[1].classList.contains('cq-r'));
/* tiêu đề cột phải theo cùng thứ bậc */
ok('tiêu đề ◈COQ dùng nền đậm #fdf0d0', /C3 ◈COQ/.test(html) && /background:#fdf0d0/.test(html));
ok('tiêu đề Open/End để font-weight:500 (nhẹ hơn tiêu đề thường)',
   (html.match(/Open C3 ◈|Open C4 ◈|End C3 ◈|End C4 ◈/g) || []).length === 4
   && (html.match(/font-weight:500" title="Reference —/g) || []).length === 4);

/* ═════════ B. Nút 📏 trên thẻ tank ═════════
   v4.107 nút này mở bảng "spot check theo thể tích đo". v4.108 người dùng
   CHỐT đổi hẳn bảng đó thành ⚖ Stock-transfer reconciliation — phần kiểm
   tra bảng mới nằm ở tests/stx-recon-dom.smoke.js. Ở đây chỉ giữ đúng một
   việc: nút vẫn nằm trong cụm nút của thẻ tank và trỏ đúng chỗ. */
console.log('\n── B. Nút 📏 trong cụm nút của thẻ tank ──');
const scx2 = fs.readFileSync(path.join(ROOT, 'js/features/scx2.js'), 'utf8');
ok('scx2 vẫn có nút 📏',              /scx2-tkx-vc/.test(scx2));
ok('nút trỏ sang bảng đối chiếu mới', /INV\.openStx\(/.test(scx2));
ok('nút nằm trong cụm scx2-tkx-acts', scx2.indexOf('scx2-tkx-vc') > scx2.indexOf('scx2-tkx-acts'));
ok('bảng cũ (spot check) đã gỡ khỏi index.html', html.indexOf('invVcModal') < 0);
ok('bảng mới có mặt trong index.html',           html.indexOf('id="stxModal"') >= 0);

console.log('\n─────────────────────────────────────');
console.log(fail ? ('❌ ' + fail + ' assert THẤT BẠI') : '✅ TẤT CẢ ASSERT PASS');
process.exit(fail ? 1 : 0);
