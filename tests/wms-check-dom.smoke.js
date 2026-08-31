/* ═══════════════════════════════════════════════════════════════════════
   v4.117 — 🔍 WMS STOCK CHECK (cần jsdom)

   Kiểm trên DOM thật của index.html:
     A. CÔNG THỨC   actual = m³ × ρ × 1000 ; C3 = actual × %wt ; C4 = phần còn lại
     B. LOT         mặc định lấy LOT MỚI NHẤT của chính bồn đó (không phải
                    thông báo trộn, không phải thẻ tank), gõ tay thì đè
     C. NỀN COQ     lấy ρ/%wt CUỐI MẺ của lot; gõ đè được; thiếu thì nêu đích danh
     D. ⭐ CHIỀU CHUYỂN KHO — phần dễ làm sai nhất:
          WMS CAO hơn thực tế ⇒ GIẢM ⇒ bồn ➜ hầm 1100
          WMS THẤP hơn thực tế ⇒ TĂNG ⇒ hầm 1100 ➜ bồn
          số lượng LUÔN dương, chiều nằm ở câu chữ
     E. GIỮ SỐ      đóng/mở lại bảng không mất số đã gõ; ✕ clear mới xoá
     F. DOM         nút 🔍 trên thẻ tank, modal đóng được bằng INV.closeAll,
                    toàn bộ chữ hiển thị là TIẾNG ANH (không dấu tiếng Việt)

     npm i jsdom && node tests/wms-check-dom.smoke.js
   ═══════════════════════════════════════════════════════════════════════ */
const fs = require('fs'), path = require('path');
let JSDOM;
try{ JSDOM = require('jsdom').JSDOM; }
catch(_){ console.log('⚠ BỎ QUA: chưa cài jsdom. Chạy `npm i jsdom` rồi thử lại.'); process.exit(0); }

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts:'outside-only', pretendToBeVisual:true, url:'http://localhost/' });
const w = dom.window;
const LOG = [];
w.firebase = undefined;
w.toast = (m,t)=> LOG.push('['+t+'] '+m);
w.confirm = ()=> true; w.alert = ()=>{};
w.logAudit = ()=>{}; w.canWrite = ()=> true;
w.CURRENT_USER = { name:'test' };
w.escapeHtml = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
w.normalizeDate = s => s;
w.lastEditFormatter = ()=> '';
w.URL.createObjectURL = ()=> 'blob:x'; w.URL.revokeObjectURL = ()=>{};

const FILES = ['js/features/eng.js','js/features/mixctrl.js','js/features/inv.js'];
let bundle = FILES.map(f=>fs.readFileSync(path.join(ROOT,f),'utf8')).join('\n;\n');
bundle += '\n;window.ENG=ENG;window.MC=MC;window.INV=INV;';
try{ w.eval(bundle); }catch(e){ console.log('❌ LOAD BUNDLE → '+e.message); process.exit(1); }
try{ w.MC.init(); }catch(_){}
try{ w.ENG.init(); }catch(_){}

let fail = 0;
const ok   = (l,c,v)=>{ console.log((c?'  ✅ ':'  ❌ ')+l+(v===undefined?'':' → '+v)); if(!c) fail++; };
const near = (l,got,want,tol)=> ok(l, Math.abs(got-want) <= tol, got+' (mong '+want+')');
const $    = id => w.document.getElementById(id);

/* dòng Tank Log tối thiểu — chỉ cần lot/bồn/thể tích/nền COQ cuối mẻ */
function mkRow(o){
  const r = new Array(73).fill('');
  r[1]=o.lot; r[2]=o.tank; r[3]=o.date||'09/08/26';
  r[4]=o.start||'19:00'; r[5]=o.finish||'23:00'; r[27]='Pass';
  r[10]=o.iv===undefined?'':o.iv; r[6]=o.fv===undefined?'':o.fv;
  r[33]=o.den===undefined?'':o.den; r[45]=o.w3===undefined?'':o.w3;
  r[63]=o.iden===undefined?'':o.iden; r[64]=o.iw3===undefined?'':o.iw3;
  return r;
}
/* Hai lot của TK-3501: 900 (cũ) và 901 (mới nhất, nền khác hẳn) + 1 lot của 3502 */
w.ENG.ROWS.length = 0;
w.ENG.ROWS.push(mkRow({ lot:'LPG-2026-900', tank:'TK-3501', iv:0,   fv:100, den:0.5000, w3:'50', iden:0.5, iw3:'50' }));
w.ENG.ROWS.push(mkRow({ lot:'LPG-2026-901', tank:'TK-3501', iv:100, fv:200, den:0.5400, w3:'40', iden:0.5, iw3:'50' }));
w.ENG.ROWS.push(mkRow({ lot:'LPG-2026-902', tank:'TK-3502', iv:0,   fv:150, den:0.6000, w3:'30', iden:0.6, iw3:'30' }));
w.ENG.ROWS.push(mkRow({ lot:'LPG-2026-903', tank:'TK-3501' }));   /* lot chưa có COQ */

const setIn = (id, v)=>{ const el=$(id); el.value = v; };
function type(sloc, vals){
  if('lot' in vals) setIn('wmsxLot'+sloc, vals.lot);
  if('vol' in vals) setIn('wmsxVol'+sloc, vals.vol);
  if('c3'  in vals) setIn('wmsxC3'+sloc,  vals.c3);
  if('c4'  in vals) setIn('wmsxC4'+sloc,  vals.c4);
  if('den' in vals) setIn('wmsxDen'+sloc, vals.den);
  if('w3'  in vals) setIn('wmsxW3'+sloc,  vals.w3);
  w.INV.wmsEdit(sloc);
}

/* ═════════ A + B + C. LOT MẶC ĐỊNH, NỀN COQ, CÔNG THỨC ═════════ */
console.log('\n── A/B/C. Lot mặc định · nền COQ · công thức ──');
w.INV.openWms(1);
ok('modal mở',                       $('stxWmsModal').classList.contains('on'));
let F = w.INV.wmsFigures('2100');
/* Lot 903 là lot MỚI NHẤT của TK-3501 nhưng CHƯA có kết quả COQ. Phần mềm
   phải giữ nguyên nó (đó mới là thứ đang nằm trong bồn) và nói rõ thiếu gì,
   TUYỆT ĐỐI không lặng lẽ mượn ρ của lot cũ. */
ok('lot mặc định là lot MỚI NHẤT của bồn', F.lot === 'LPG-2026-903', F.lot);
ok('… và nói rõ nguồn là latest',     F.lotSrc === 'latest', F.lotSrc);
ok('lot mới nhất chưa có COQ → không tính, không mượn nền lot cũ', F.ok === false);
ok('… nêu thiếu density',             /density/.test(F.miss.join('|')), F.miss.join('|'));
ok('… và mách CALC COQ',              /CALC COQ/.test($('wmsxOut2100').innerHTML));
ok('… có mách lot gần nhất CÓ nền COQ là 901',
   /LPG-2026-901/.test($('wmsxOut2100').innerHTML));
ok('… kèm câu cấm mượn nền lot đó',   /do NOT borrow its basis/.test($('wmsxOut2100').innerHTML));

type('2100', { lot:'901' });
F = w.INV.wmsFigures('2100');
ok('gõ SỐ TRẦN "901" ra đúng lot đầy đủ', F.lot === 'LPG-2026-901', F.lot);
ok('… nguồn đổi thành typed',         F.lotSrc === 'typed', F.lotSrc);
near('ρ lấy nền CUỐI mẻ của lot đó',  F.den, 0.5400, 1e-9);
near('%wt C3 lấy nền cuối mẻ',        F.w3,  0.40,   1e-9);
ok('chưa gõ thể tích thì chưa tính',  F.ok === false);
ok('… và nêu đích danh thứ còn thiếu', /volume/.test(F.miss.join('|')), F.miss.join('|'));

type('2100', { vol:'100' });
F = w.INV.wmsFigures('2100');
ok('gõ 100 m³ → tính được',           F.ok === true);
near('actual LPG = 100 × 0.54 × 1000', F.aL,  54000, 0.5);
near('actual C3  = 54000 × 40 %',      F.aC3, 21600, 0.5);
near('actual C4  = phần còn lại',      F.aC4, 32400, 0.5);
ok('C3 + C4 = LPG (không hụt kg nào)', Math.abs(F.aC3 + F.aC4 - F.aL) < 1e-6);
ok('chưa gõ WMS thì chưa có độ vênh',  F.dC3 === null && F.hasWms === false);
ok('bảng nhắc gõ WMS',                 /Type the/.test($('wmsxOut2100').innerHTML));

type('2100', { lot:'900' });
F = w.INV.wmsFigures('2100');
ok('đổi sang lot 900 → nền COQ đổi theo', Math.abs(F.den - 0.5000) < 1e-9, String(F.den));
near('… actual đổi theo: 100 × 0.5 × 1000 × 50 %', F.aC3, 25000, 0.5);

type('2100', { lot:'903', den:'0.6000', w3:'25' });
F = w.INV.wmsFigures('2100');
ok('gõ đè ρ + %wt → tính lại được',    F.ok === true);
ok('… đánh dấu là nền GÕ TAY',         F.denSrc === 'typed' && F.w3Src === 'typed');
near('… actual C3 = 100 × 0.6 × 1000 × 25 %', F.aC3, 15000, 0.5);
ok('… bảng nói rõ đang dùng nền gõ tay', /Typed basis in use/.test($('wmsxBasis2100').innerHTML));
ok('%wt gõ dạng 0.25 hiểu như 25 %',
   (function(){ type('2100',{w3:'0.25'}); return Math.abs(w.INV.wmsFigures('2100').w3 - 0.25) < 1e-9; })());

/* ═════════ D. ⭐ CHIỀU CHUYỂN KHO ═════════ */
console.log('\n── D. Chiều chuyển kho (bồn ⇄ hầm 1100) ──');
w.INV.wmsClear('2100');
/* lot 901: 100 m³ × 0.54 × 1000 = 54.000 kg · 40 %wt ⇒ 21.600 C3 / 32.400 C4 */
type('2100', { lot:'901', vol:'100', c3:'23000', c4:'32000' });
F = w.INV.wmsFigures('2100');
near('C3: thực 21.600 − WMS 23.000',   F.dC3, -1400, 0.5);
near('C4: thực 32.400 − WMS 32.000',   F.dC4,   400, 0.5);

let A = w.INV.wmsAction('C3','2100', F.dC3);
ok('C3 lệch ÂM → chiều down (giảm WMS)', A.dir === 'down', A.dir);
ok('… số lượng in ra DƯƠNG 1.400',       A.qty === 1400, String(A.qty));
ok('… tiêu đề nói WMS TOO HIGH',         /TOO HIGH/.test(A.head), A.head);
ok('… và nói phải bring it DOWN',        /bring it DOWN/i.test(A.head));
ok('… câu lệnh: OUT of the tank INTO the cavern', /OUT of the tank and INTO the cavern/.test(A.txt));
ok('… nêu đích danh TK-3501 (SLoc 2100)', /TK-3501 \(SLoc 2100\)/.test(A.txt));
ok('… nêu đích danh Cavern (SLoc 1100)',  /Cavern \(SLoc 1100\)/.test(A.txt));
ok('… KHÔNG in dấu trừ vào số gõ SAP',    A.txt.indexOf('-1') < 0 && A.txt.indexOf('−') < 0);
ok('… thứ tự trong câu là BỒN trước, HẦM sau',
   A.txt.indexOf('TK-3501 (SLoc 2100)') < A.txt.indexOf('Cavern (SLoc 1100)'));

A = w.INV.wmsAction('C4','2100', F.dC4);
ok('C4 lệch DƯƠNG → chiều up (tăng WMS)', A.dir === 'up', A.dir);
ok('… số lượng 400',                      A.qty === 400, String(A.qty));
ok('… tiêu đề nói WMS TOO LOW',           /TOO LOW/.test(A.head), A.head);
ok('… và nói phải bring it UP',           /bring it UP/i.test(A.head));
ok('… câu lệnh: OUT of the cavern INTO the tank', /OUT of the cavern and INTO the tank/.test(A.txt));
ok('… thứ tự trong câu là HẦM trước, BỒN sau',
   A.txt.indexOf('Cavern (SLoc 1100)') < A.txt.indexOf('TK-3501 (SLoc 2100)'));

A = w.INV.wmsAction('C3','2100', 0.4);
ok('lệch dưới 1 kg → bảo ĐỪNG chuyển gì', A.dir === 'ok', A.dir);
ok('… nói rõ post nothing',               /post nothing/i.test(A.head), A.head);

const out = $('wmsxOut2100').innerHTML;
ok('bảng in cả hai câu lệnh C3 và C4',    /d-down/.test(out) && /d-up/.test(out));
ok('bảng nhắc post THÀNH HAI DÒNG riêng', /two separate lines/.test(out));
ok('bảng in mũi tên chiều chuyển',        /➜/.test(out));
ok('bảng nói kết quả sau khi post',       /equals the measured stock/.test(out));

/* bồn 2 tính độc lập */
type('2101', { vol:'150', c3:'27000', c4:'63000' });   /* 150×0.6×1000 = 90.000 · 30 % */
const F2 = w.INV.wmsFigures('2101');
ok('bồn 2 lấy lot của CHÍNH nó',          F2.lot === 'LPG-2026-902', F2.lot);
near('bồn 2 actual C3 = 27.000',          F2.aC3, 27000, 0.5);
ok('bồn 2 khớp cả hai loại → không phải chuyển gì',
   w.INV.wmsAction('C3','2101',F2.dC3).dir === 'ok' && w.INV.wmsAction('C4','2101',F2.dC4).dir === 'ok');
ok('… bồn 1 vẫn giữ nguyên số của nó',    w.INV.wmsFigures('2100').wmsC3 === 23000);

/* ═════════ E. GIỮ SỐ TRONG RAM ═════════ */
console.log('\n── E. Số gõ sống qua lần đóng/mở bảng ──');
w.INV.closeAll();
ok('bấm × đóng được modal (id có tiền tố stx)', !$('stxWmsModal').classList.contains('on'));
$('wmsxVol2100').value = '';                     /* giả lập DOM bị đụng vào */
w.INV.openWms(2);
ok('mở lại → ô thể tích được đổ lại từ RAM', $('wmsxVol2100').value === '100', $('wmsxVol2100').value);
ok('… ô WMS C3 cũng còn',                    $('wmsxC32100').value === '23000');
ok('… và kết quả vẫn tính đúng',             w.INV.wmsFigures('2100').ok === true);
ok('bồn được bấm (2) đứng TRƯỚC trong lưới',
   $('wmsxGrid').firstElementChild.id === 'wmsxPane2101', $('wmsxGrid').firstElementChild.id);
w.INV.wmsClear('2100');
ok('✕ clear mới xoá — và xoá sạch',          $('wmsxVol2100').value === '' && $('wmsxC32100').value === '');
ok('… bồn 2101 KHÔNG bị xoá lây',            $('wmsxVol2101').value === '150');

/* ═════════ F. DOM · nút · ngôn ngữ ═════════ */
console.log('\n── F. Nút trên thẻ tank · ngôn ngữ ──');
const scx2 = fs.readFileSync(path.join(ROOT,'js/features/scx2.js'),'utf8');
ok('scx2 có nút mở WMS check',            /INV\.openWms\(/.test(scx2));
ok('… nút nằm trong cụm scx2-tkx-acts',   scx2.indexOf('scx2-tkx-wms') > scx2.indexOf('scx2-tkx-acts'));
ok('… và KHÔNG đụng nút 📏 cũ',            /INV\.openStx\(/.test(scx2));
ok('index.html nạp inv.js bản 4117',      /inv\.js\?v=4117/.test(html));
ok('index.html nạp core.css bản 4117',    /core\.css\?v=4117/.test(html));

/* Quét dấu tiếng Việt trong CHỮ HIỂN THỊ — giao diện V4 là tiếng Anh.
   Chỉ quét phần modal đã dựng ra và phần chú thích trong markup thì bỏ qua. */
const DIA = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
const shown = [$('wmsxOut2100').innerHTML, $('wmsxOut2101').innerHTML,
               $('wmsxBasis2101').innerHTML, $('wmsxLotSrc2101').textContent,
               w.INV.wmsAction('C3','2100',-500).txt, w.INV.wmsAction('C3','2100',500).txt,
               w.INV.wmsAction('C3','2100',0).txt].join(' ');
ok('chữ hiển thị không có dấu tiếng Việt', !DIA.test(shown),
   (shown.match(DIA)||[''])[0]);
const modalHtml = html.slice(html.indexOf('<div class="modal-bg" id="stxWmsModal">'),
                             html.indexOf('<div id="toast"></div>'));
const noComment = modalHtml.replace(/<!--[\s\S]*?-->/g,'');
ok('markup modal (bỏ chú thích) cũng thuần tiếng Anh', !DIA.test(noComment),
   (noComment.match(DIA)||[''])[0]);
ok('legend nói rõ cả hai chiều',
   /BRING WMS DOWN/.test(noComment) && /BRING WMS UP/.test(noComment));
ok('legend nói rõ không lưu gì',          /Nothing here is saved/.test(noComment));

console.log(fail ? ('\n❌ '+fail+' assert HỎNG') : '\n✅ TẤT CẢ ĐỀU PASS');
process.exit(fail ? 1 : 0);
