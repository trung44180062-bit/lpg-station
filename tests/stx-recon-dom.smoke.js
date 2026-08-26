/* ═══════════════════════════════════════════════════════════════════════
   v4.108 — ⚖ STOCK-TRANSFER RECONCILIATION (cần jsdom)

   Kiểm bốn thứ, trên DOM thật của index.html:

   A. LUẬT NGÀY SAP theo giờ FINISH (ENG/INV.stxSapDate)
      finish ≥ 19:00        → End Stock NGÀY FINISH
      finish <  08:00       → End Stock NGÀY FINISH − 1 (ca đêm hôm trước)
      08:00 ≤ finish < 19:00 → KHÔNG tự lấy, nêu lý do
      Đúng ca vận hành mô tả: 3501 xong 23:00 ngày 9, 3502 xong 01:00 ngày 10
      ⇒ CẢ HAI lấy End Stock NGÀY 9.

   B. SP.tankEnd — cộng End Stock của một bồn tại một ngày, tách C3/C4,
      ngày chưa có số thì has=false (khác hẳn "tồn 0").

   C. TÁCH C3/C4 THỰC TẾ + 4 cột mới trên Tank Log
      Open + Filled = End, đúng tới từng kg.

   D. BẢNG ĐỐI CHIẾU — công thức đề xuất và mọi nhãn nguồn
      Suggested = actual closing − system opening.
      Kịch bản của vận hành: thực 10 t mỗi loại, hệ thống 20 t, COQ 100 t
      ⇒ đề xuất 90 t.

     npm i jsdom && node tests/stx-recon-dom.smoke.js
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
/* sp.js kéo theo cả module CT + listener DOM ở đuôi file → chỉ lấy đúng
   thân IIFE của SP, đủ để gọi SP.tankEnd với ROWS bơm vào bằng tay. */
const spSrc = fs.readFileSync(path.join(ROOT,'js/data/sp.js'),'utf8');
const spStart = spSrc.indexOf('const SP = (function(){');
const spEnd   = spSrc.indexOf('/* SAP shims */');
if(spStart < 0 || spEnd < 0){ console.log('❌ không cắt được module SP khỏi sp.js'); process.exit(1); }
bundle += '\n;\n' + spSrc.slice(spStart, spEnd);
bundle += '\n;window.ENG=ENG;window.MC=MC;window.INV=INV;window.SP=SP;';
try{ w.eval(bundle); }catch(e){ console.log('❌ LOAD BUNDLE → '+e.message); process.exit(1); }
try{ w.MC.init(); }catch(_){}
try{ w.ENG.init(); }catch(_){}

let fail = 0;
const ok   = (l,c,v)=>{ console.log((c?'  ✅ ':'  ❌ ')+l+(v===undefined?'':' → '+v)); if(!c) fail++; };
const near = (l,got,want,tol)=> ok(l, Math.abs(got-want) <= tol, got+' (mong '+want+')');
const $    = id => w.document.getElementById(id);
const num  = s => parseFloat(String(s||'').replace(/[^\d.\-−]/g,'').replace('−','-'));

function mkRow(o){
  const r = new Array(69).fill('');
  r[1]=o.lot; r[2]=o.tank; r[3]=o.date||'09/08/26'; r[27]=o.qual||'Pass';
  r[4]=o.start||''; r[5]=o.finish||'';
  r[10]=o.iv===undefined?'':o.iv; r[6]=o.fv===undefined?'':o.fv;
  r[33]=o.den===undefined?'':o.den; r[45]=o.w3===undefined?'':o.w3;
  r[63]=o.iden===undefined?'':o.iden; r[64]=o.iw3===undefined?'':o.iw3;
  if(o.qc3!==undefined) r[66]=o.qc3;
  if(o.qc4!==undefined) r[67]=o.qc4;
  return r;
}

/* ═════════ A. LUẬT NGÀY SAP ═════════ */
console.log('\n── A. Ngày SAP suy từ giờ FINISH ──');
const SD = w.INV.stxSapDate;
let d;
d = SD('09/08/26','19:30','23:00');
ok('3501 xong 23:00 ngày 9 → tự lấy SAP', d.ok === true);
ok('… đúng NGÀY 9',                        d.sapDate === '2026-08-09', d.sapDate);
ok('… ngày kết thúc vẫn là 9',             d.finishDate === '2026-08-09', d.finishDate);
d = SD('09/08/26','21:00','01:00');
ok('3502 bắt đầu 21:00 ngày 9, xong 01:00 → nhận ra qua đêm', d.overnight === true);
ok('… ngày kết thúc là NGÀY 10',           d.finishDate === '2026-08-10', d.finishDate);
ok('… nhưng SAP vẫn lấy NGÀY 9',           d.sapDate === '2026-08-09', d.sapDate);
d = SD('10/08/26','00:30','01:00');
ok('dòng ghi thẳng ngày 10, xong 01:00 → SAP vẫn ngày 9', d.sapDate === '2026-08-09', d.sapDate);
d = SD('09/08/26','07:00','07:59');
ok('xong 07:59 (trước giờ mở cửa) → vẫn tự lấy', d.ok === true);
ok('… và lùi về ngày 8',                    d.sapDate === '2026-08-08', d.sapDate);
d = SD('09/08/26','06:00','08:00');
ok('xong đúng 08:00 → KHÔNG tự lấy nữa',    d.ok === false);
ok('… nêu rõ vì đang trong giờ làm việc',   /operating hours/.test(d.why), d.why);
d = SD('09/08/26','14:00','18:59');
ok('xong 18:59 → vẫn trong giờ, không tự lấy', d.ok === false);
d = SD('09/08/26','14:00','19:00');
ok('xong đúng 19:00 → tự lấy lại',          d.ok === true);
ok('… đúng ngày 9',                         d.sapDate === '2026-08-09', d.sapDate);
d = SD('09/08/26','14:00','');
ok('thiếu giờ finish → không đoán',         d.ok === false);
ok('… nói rõ thiếu FINISH time',            /FINISH time/.test(d.why), d.why);
d = SD('','','23:00');
ok('thiếu ngày → không đoán',               d.ok === false);
/* ĐỔI THÁNG / ĐỔI NĂM — dòng ghi ngày 01, kết thúc 01:00 và KHÔNG qua đêm
   (bắt đầu 00:30 cùng ngày) ⇒ phải lùi sang ngày cuối của tháng/năm trước. */
ok('dòng 01/09 xong 01:00 → SAP lùi sang 31/08',
   SD('01/09/26','00:30','01:00').sapDate === '2026-08-31', SD('01/09/26','00:30','01:00').sapDate);
ok('dòng 01/01/27 xong 02:00 → SAP lùi sang 31/12/26',
   SD('01/01/27','00:30','02:00').sapDate === '2026-12-31', SD('01/01/27','00:30','02:00').sapDate);
ok('dòng 01/03 xong 03:00 → lùi sang 28/02 (2026 không nhuận)',
   SD('01/03/26','00:30','03:00').sapDate === '2026-02-28', SD('01/03/26','00:30','03:00').sapDate);
/* Ngược lại: bắt đầu 23:00 ngày 01/09 thì kết thúc đã sang 02/09, SAP = 01/09 */
ok('bắt đầu 23:00 ngày 01/09, xong 01:00 → SAP là 01/09 (không lùi sang tháng 8)',
   SD('01/09/26','23:00','01:00').sapDate === '2026-09-01', SD('01/09/26','23:00','01:00').sapDate);

/* ═════════ B. SP.tankEnd ═════════ */
console.log('\n── B. SP.tankEnd — End Stock của bồn tại một ngày ──');
const R = w.SP.ROWS;
const put = (rid,o)=>{ R[rid] = Object.assign({_rid:rid}, o); };
put('r1', { date:'2026-08-09', sloc:'2100', mat:'C3', batch:'D', end:120000, init:1, gr:0, gi:0, trs:0 });
put('r2', { date:'2026-08-09', sloc:'2100', mat:'C3', batch:'E', end:  8000 });
put('r3', { date:'2026-08-09', sloc:'2100', mat:'C4', batch:'D', end:200000 });
put('r4', { date:'2026-08-09', sloc:'2101', mat:'C3', batch:'D', end: 50000 });
put('r5', { date:'2026-08-09', sloc:'2101', mat:'C4', batch:'D', end: 60000 });
put('r6', { date:'2026-08-08', sloc:'2100', mat:'C3', batch:'D', end:999999 });
put('r7', { date:'2026-08-09', sloc:'1100', mat:'C3', batch:'P', end:777777 });
let te = w.SP.tankEnd('2100','2026-08-09');
ok('có số cho ngày đã dán',      te.has === true);
near('C3 = 120 000 + 8 000',     te.c3, 128000, 0);
near('C4 = 200 000',             te.c4, 200000, 0);
near('LPG = C3 + C4',            te.lpg, 328000, 0);
ok('liệt kê đủ batch đã cộng',   te.batches.join('+') === 'D+E', te.batches.join('+'));
ok('KHÔNG lẫn SLoc 1100 (kho ngoại quan)', te.c3 !== 777777 + 128000);
ok('KHÔNG lẫn ngày khác',        te.c3 !== 999999 + 128000);
te = w.SP.tankEnd('2101','2026-08-09');
near('bồn 2 đọc riêng — C3',     te.c3, 50000, 0);
te = w.SP.tankEnd('2100','2026-08-07');
ok('ngày chưa dán → has=false', te.has === false);
ok('… và KHÔNG trả về tồn 0 như số thật', te.c3 === 0 && te.rows === 0);
ok('thiếu tham số → has=false',  w.SP.tankEnd('','2026-08-09').has === false);
ok('tankEndDates liệt kê đúng ngày',
   w.SP.tankEndDates('2100').join(',') === '2026-08-08,2026-08-09', w.SP.tankEndDates('2100').join(','));
/* mốc DÁN/TẠO số SAP — lấy dòng mới nhất trong nhóm đang cộng */
put('r1', { date:'2026-08-09', sloc:'2100', mat:'C3', batch:'D', end:120000, lastAt:1000, lastBy:'An' });
put('r2', { date:'2026-08-09', sloc:'2100', mat:'C3', batch:'E', end:  8000, lastAt:5000, lastBy:'Trung' });
put('r3', { date:'2026-08-09', sloc:'2100', mat:'C4', batch:'D', end:200000, lastAt:3000, lastBy:'An' });
te = w.SP.tankEnd('2100','2026-08-09');
ok('trả mốc dán MỚI NHẤT', te.lastAt === 5000, te.lastAt);
ok('… kèm người dán của đúng dòng đó', te.lastBy === 'Trung', te.lastBy);
ok('dòng chưa có mốc → lastAt = 0, không bịa',
   w.SP.tankEnd('2101','2026-08-09').lastAt === 0);

/* ═════════ C. TÁCH C3/C4 THỰC TẾ + CỘT MỚI ═════════ */
console.log('\n── C. Open / Filled / End khép kín trên Tank Log ──');
const row1 = mkRow({ lot:'LPG-2026-366', tank:'TK-3501', date:'09/08/26',
  start:'19:30', finish:'23:00',
  iv:336, fv:563.445, den:0.542, w3:'50.5', iden:0.564, iw3:'25.3',
  qc3:106.276, qc4:9.608 });
w.ENG.upsertRow(row1);
const s1 = w.ENG.actualSplit(row1);
near('Open C3 = 336 × 0.564 × 25.3 %',  s1.openC3, 336*0.564*0.253, 1e-9);
near('Open C4 = phần còn lại',          s1.openC4, 336*0.564*0.747, 1e-9);
near('End  C3 = 563.445 × 0.542 × 50.5 %', s1.endC3, 563.445*0.542*0.505, 1e-9);
near('Open + Filled = End (C3)',        s1.openC3 + s1.fillC3, s1.endC3, 1e-9);
near('Open + Filled = End (C4)',        s1.openC4 + s1.fillC4, s1.endC4, 1e-9);
/* Cột [66]/[67] của lot thật được lưu ở 3 số lẻ, nên so ở mức 1 kg */
near('Filled C3 khớp cột [66] đã lưu (±1 kg)',  s1.fillC3, 106.276, 1e-3);
near('Filled C4 khớp cột [67] đã lưu (±1 kg)',  s1.fillC4, 9.608, 1e-3);
/* bồn rỗng: INIT VOL = 0 là số THẬT, không phải thiếu dữ liệu */
const rowEmpty = mkRow({ lot:'LPG-2026-370', tank:'TK-3502', iv:0, fv:500, den:0.55, w3:'45' });
const sE = w.ENG.actualSplit(rowEmpty);
ok('INIT VOL = 0 → tồn đầu = 0, vẫn tính được', sE.openOk === true && sE.openC3 === 0);
near('… Filled = đúng toàn bộ tồn cuối', sE.fillLpg, 500*0.55, 1e-9);
/* thiếu nền COQ → KHÔNG đoán */
const rowNo = mkRow({ lot:'LPG-2026-371', tank:'TK-3502', iv:100, fv:500, den:'', w3:'' });
const sN = w.ENG.actualSplit(rowNo);
ok('thiếu ρ/%wt → không tính, không bịa số', sN.endOk === false && sN.endC3 === null);
ok('… nêu đích danh ô còn thiếu', sN.miss.length > 0, sN.miss.join(' · '));

console.log('\n── C2. Bốn cột mới trên bảng Tank Log ──');
w.ENG.render();
const th = w.document.querySelectorAll('#engTbl thead th');
const hdr = Array.from(th).map(x=>x.textContent.trim());
ok('có cột Open C3 ◈', hdr.indexOf('Open C3 ◈') >= 0);
ok('có cột Open C4 ◈', hdr.indexOf('Open C4 ◈') >= 0);
ok('có cột End C3 ◈',  hdr.indexOf('End C3 ◈')  >= 0);
ok('có cột End C4 ◈',  hdr.indexOf('End C4 ◈')  >= 0);
ok('thứ tự Open → ◈COQ → End đọc thành câu chuyện',
   hdr.indexOf('Open C3 ◈') < hdr.indexOf('C3 ◈COQ') && hdr.indexOf('C3 ◈COQ') < hdr.indexOf('End C3 ◈'),
   hdr.slice(hdr.indexOf('Open C3 ◈'), hdr.indexOf('End C4 ◈')+1).join(' | '));
const tr366 = Array.from(w.document.querySelectorAll('#engTbl tbody tr'))
  .find(x=>x.children[2] && x.children[2].textContent.trim()==='LPG-2026-366');
ok('dòng 366 có trên bảng', !!tr366);
const cells = Array.from(tr366.children).map(x=>x.textContent.trim());
near('ô Open C3 in đúng số', num(cells[hdr.indexOf('Open C3 ◈')]), s1.openC3, 5e-4);
near('ô End C4 in đúng số',  num(cells[hdr.indexOf('End C4 ◈')]),  s1.endC4,  5e-4);
/* số cột phải khớp giữa thead / tbody / tfoot */
const nTd = tr366.children.length;
const nTf = Array.from(w.document.querySelectorAll('#engTfoot td'))
  .reduce((a,c)=>a+(parseInt(c.getAttribute('colspan'))||1),0);
ok('thead = tbody = tfoot (không lệch cột)', th.length === nTd && th.length === nTf,
   th.length+' / '+nTd+' / '+nTf);
/* dòng thiếu nền COQ để trống, không in 0 */
w.ENG.upsertRow(rowNo);
w.ENG.render();
const trNo = Array.from(w.document.querySelectorAll('#engTbl tbody tr'))
  .find(x=>x.children[2] && x.children[2].textContent.trim()==='LPG-2026-371');
const cNo = trNo.children[hdr.indexOf('End C3 ◈')];
ok('lot thiếu COQ → ô để dấu ·, KHÔNG in 0', cNo.textContent.trim() === '·', cNo.textContent.trim());
ok('… tooltip nêu đích danh ô thiếu', /missing/i.test(cNo.getAttribute('title')||''));
ok('Σ TỔNG KHÔNG cộng dồn cột tồn tại mốc',
   Array.from(w.document.querySelectorAll('#engTfoot .td-split')).every(x=>x.textContent.trim()==='—'));

/* ═════════ D. BẢNG ĐỐI CHIẾU ═════════ */
console.log('\n── D. Bảng đối chiếu — kịch bản của vận hành ──');
/* thực tồn đầu 10 t mỗi loại · COQ nạp 100 t mỗi loại · hệ thống đang 20 t
   ⇒ tồn cuối thực 110 t ⇒ đề xuất chuyển 110 − 20 = 90 t mỗi loại */
const DEN = 0.5, W3 = 0.5;                 // ρ 0.5 t/m³, 50 %wt C3 → chia đôi
const IV  = 20 / DEN;                      // 20 t LPG = 10 t C3 + 10 t C4
const FV  = 220 / DEN;                     // 220 t LPG = 110 t mỗi loại
const demo = mkRow({ lot:'LPG-2026-900', tank:'TK-3501', date:'09/08/26',
  start:'19:00', finish:'23:00', iv:IV, fv:FV,
  den:DEN, w3:'50', iden:DEN, iw3:'50', qc3:100, qc4:100 });
w.ENG.upsertRow(demo);
/* SAP ngày 9 của bồn 1 = 20 t mỗi loại */
Object.keys(R).forEach(k=>delete R[k]);
put('d1', { date:'2026-08-09', sloc:'2100', mat:'C3', batch:'D', end:20000 });
put('d2', { date:'2026-08-09', sloc:'2100', mat:'C4', batch:'D', end:20000 });
w.SCALE = { getTkCfg: ()=>({ tk1:{ lot:'LPG-2026-900' }, tk2:{ lot:'' } }) };
w.MIXNOTIFY = { PENDING:{} };

w.INV.openStx(1);
ok('bảng mở',                    $('stxModal').classList.contains('on'));
ok('có đủ hai vùng bồn',         !!$('stxPane2100') && !!$('stxPane2101'));
ok('bồn vừa bấm đứng trước',     $('stxGrid').children[0].id === 'stxPane2100');
const ctx = w.INV.stxCtx('2100');
ok('bắt đúng lot từ thẻ tank',   ctx.lot === 'LPG-2026-900' && ctx.lotSrc === 'scale', ctx.lot+' / '+ctx.lotSrc);
ok('nhãn nguồn lot hiện trên bảng', /tank card/.test($('stxLotSrc2100').textContent),
   $('stxLotSrc2100').textContent);

console.log('\n   · System opening tự nạp từ SAP');
near('ô C3 tự điền 20 000 kg', parseFloat($('stxSys32100').value), 20000, 0);
near('ô C4 tự điền 20 000 kg', parseFloat($('stxSys42100').value), 20000, 0);
const src = $('stxSrc2100');
ok('nhãn nguồn ghi rõ SAP End Stock', /SAP End Stock/.test(src.textContent), src.textContent.trim().slice(0,80));
ok('… kèm đúng ngày 09/08/26',        /09\/08\/26/.test(src.textContent));
ok('… và giải thích vì sao lấy ngày đó', /after 19:00/.test(src.textContent));
ok('… ghi rõ đây là End Stock CỦA ngày nào', /End Stock of 09\/08\/26/.test(src.textContent));
ok('chưa có mốc dán → nói thẳng là thiếu, không im lặng',
   /no paste timestamp/.test(src.textContent), src.textContent.trim().slice(-70));
/* bơm mốc dán vào rồi vẽ lại — phải hiện ngày giờ + người dán */
R.d1.lastAt = new w.Date(2026, 7, 10, 7, 42).getTime(); R.d1.lastBy = 'Trung';
R.d2.lastAt = new w.Date(2026, 7, 10, 7, 42).getTime(); R.d2.lastBy = 'Trung';
w.INV.renderStx(true);
ok('in mốc SAP được dán lúc nào', /pasted 10\/08\/26 07:42/.test($('stxSrc2100').textContent),
   $('stxSrc2100').textContent.trim().slice(-70));
ok('… kèm tên người dán', /by Trung/.test($('stxSrc2100').textContent));
ok('nhãn mang lớp s-sap để đổi màu',  src.className.indexOf('s-sap') >= 0, src.className);

console.log('\n   · Con số đề xuất');
const foot = $('stxFoot2100').textContent;
const vals = Array.from($('stxFoot2100').querySelectorAll('.stx-sug-vals b')).map(x=>num(x.textContent));
near('đề xuất C3 = 90 000 kg',  vals[0], 90000, 1);
near('đề xuất C4 = 90 000 kg',  vals[1], 90000, 1);
near('đề xuất LPG = 180 000 kg',vals[2], 180000, 1);
ok('nói rõ số COQ là 100 000',  /100,000/.test(foot), foot.replace(/\s+/g,' ').slice(0,180));
ok('nói rõ phải điều chỉnh −10 000', /−10,000/.test(foot));
ok('ghi công thức đang dùng',   /actual closing − system opening/.test(foot));

console.log('\n   · Bảng số: actual / system / gap');
const body = $('stxBody2100').textContent.replace(/\s+/g,' ');
ok('có khối ACTUAL',  /ACTUAL — from measured volume × COQ basis/.test(body));
ok('có khối SYSTEM',  /SYSTEM — what SAP holds for this tank/.test(body));
ok('có khối GAP',     /GAP — actual minus system/.test(body));
ok('in tồn đầu thực tế 10 000 kg', /10,000/.test(body), body.slice(0,150));
ok('in tồn cuối thực tế 110 000 kg', /110,000/.test(body));
ok('nêu nguồn Filled là cột ◈COQ của Tank Log', /Tank Log C3\/C4 ◈COQ/.test(body));
/* Gap phải đúng −10 000 mỗi loại */
const gapRow = Array.from($('stxBody2100').querySelectorAll('tr.g'))[0];
ok('gap tồn đầu = −10 000 mỗi loại',
   num(gapRow.children[2].textContent) === -10000 && num(gapRow.children[3].textContent) === -10000,
   gapRow.children[2].textContent+' / '+gapRow.children[3].textContent);

console.log('\n   · Sửa tay đè lên số SAP');
$('stxSys32100').value = '15000';
w.INV.stxSysEdit('2100');
const vals2 = Array.from($('stxFoot2100').querySelectorAll('.stx-sug-vals b')).map(x=>num(x.textContent));
near('hệ thống còn 15 000 → đề xuất C3 lên 95 000', vals2[0], 95000, 1);
ok('nhãn nguồn đổi sang Manual entry', /Manual entry/.test($('stxSrc2100').textContent));
ok('… và vẫn nhắc số SAP gốc để đối chiếu', /20,000/.test($('stxSrc2100').textContent));
ok('… gõ tay vẫn giữ mốc dán SAP', /pasted 10\/08\/26 07:42/.test($('stxSrc2100').textContent));
ok('ô nhập KHÔNG bị huỷ khi vẽ lại (giữ được con trỏ)',
   $('stxSys32100') && $('stxSys32100').value === '15000');
ok('có nút ⟳ để quay lại số SAP', /⟳ reload/.test($('stxSrc2100').innerHTML));
w.INV.stxSysReset('2100');
near('bấm ⟳ → về lại 20 000', parseFloat($('stxSys32100').value), 20000, 0);

console.log('\n   · Giờ finish trong giờ làm việc → bắt gõ tay');
const inHours = mkRow({ lot:'LPG-2026-901', tank:'TK-3501', date:'09/08/26',
  start:'09:00', finish:'14:30', iv:IV, fv:FV, den:DEN, w3:'50', iden:DEN, iw3:'50', qc3:100, qc4:100 });
w.ENG.upsertRow(inHours);
$('stxLot2100').value = '901';
w.INV.stxLotChange('2100');
ok('ô System opening bị bỏ trống',    $('stxSys32100').value === '');
ok('nói rõ phải gõ tay',              /Enter it manually/.test($('stxSrc2100').textContent));
ok('… nêu đúng lý do trong giờ làm việc', /operating hours/.test($('stxSrc2100').textContent));
ok('chưa có số hệ thống → chưa đưa ra đề xuất',
   /Enter the system opening stock/.test($('stxFoot2100').textContent.replace(/\s+/g,' ')));
ok('nhãn lot chuyển sang typed in',   /typed in/.test($('stxLotSrc2100').textContent));

console.log('\n   · Ngoài giờ nhưng SAP chưa dán ngày đó');
const noSap = mkRow({ lot:'LPG-2026-902', tank:'TK-3501', date:'15/08/26',
  start:'20:00', finish:'23:30', iv:IV, fv:FV, den:DEN, w3:'50', iden:DEN, iw3:'50', qc3:100, qc4:100 });
w.ENG.upsertRow(noSap);
$('stxLot2100').value = '902';
w.INV.stxLotChange('2100');
ok('báo SAP chưa có số cho ngày đó', /is not loaded/.test($('stxSrc2100').textContent),
   $('stxSrc2100').textContent.trim().slice(0,110));
ok('… nêu đúng ngày cần dán 15/08/26', /15\/08\/26/.test($('stxSrc2100').textContent));
ok('… và KHÔNG lặng lẽ điền 0',      $('stxSys32100').value === '');
ok('… nêu ngày SAP mới nhất đang có để đối chiếu',
   /Latest SAP day loaded/.test($('stxSrc2100').textContent));
ok('… và dặn KHÔNG dùng ngày đó thay thế',
   /do NOT use it as the opening balance/.test($('stxSrc2100').textContent));

console.log('\n   · Lot chưa có nền COQ');
const noCoq = mkRow({ lot:'LPG-2026-903', tank:'TK-3501', date:'09/08/26',
  start:'20:00', finish:'23:00', iv:100, fv:500 });
w.ENG.upsertRow(noCoq);
$('stxLot2100').value = '903';
w.INV.stxLotChange('2100');
ok('nói rõ chưa có nền COQ',   /no COQ basis yet/.test($('stxBody2100').textContent));
ok('… nêu đích danh ô thiếu',  /Missing:/.test($('stxBody2100').textContent),
   $('stxBody2100').textContent.replace(/\s+/g,' ').slice(0,140));
ok('… chỉ đường sang ◈ CALC COQ', /CALC COQ/.test($('stxBody2100').textContent));

console.log('\n   · Thông báo finish-mixing được ưu tiên chọn lot');
$('stxLot2100').value = '';
w.INV.stxLotChange('2100');          /* bỏ lot gõ tay để quay về nguồn tự động */
w.MIXNOTIFY = { PENDING:{ 'TK-3501_LPG-2026-900':{
  lot:'LPG-2026-900', c3:100000, c4:100000, tkName:'TK-3501', _ts:1 } } };
w.INV.renderStx(true);
const ctx2 = w.INV.stxCtx('2100');
ok('lot lấy từ thông báo đang treo', ctx2.lot === 'LPG-2026-900' && ctx2.lotSrc === 'notify',
   ctx2.lot+' / '+ctx2.lotSrc);
ok('bảng ghi rõ nguồn là mix notification', /mix notification/.test($('stxLotSrc2100').textContent));
ok('hiện luôn con số đang gửi Check Booth', /NOTIFIED TO CHECK BOOTH/.test($('stxMeta2100').textContent));
/* thông báo lệch số COQ → phải cảnh báo */
w.MIXNOTIFY.PENDING['TK-3501_LPG-2026-900'].c3 = 88888;
w.INV.renderStx(true);
ok('thông báo lệch cột ◈COQ → cảnh báo', /differs from the COQ columns/.test($('stxMeta2100').textContent));

console.log('\n   · Đề xuất âm thì phải cảnh báo, không im lặng');
Object.keys(R).forEach(k=>delete R[k]);
put('n1', { date:'2026-08-09', sloc:'2100', mat:'C3', batch:'D', end:900000 });
put('n2', { date:'2026-08-09', sloc:'2100', mat:'C4', batch:'D', end:900000 });
w.MIXNOTIFY = { PENDING:{} };
$('stxLot2100').value = '900';
w.INV.stxLotChange('2100');
ok('hệ thống nhiều hơn tồn thực → cảnh báo số âm',
   /A suggested figure is NEGATIVE/.test($('stxFoot2100').textContent));

console.log('\n── E. Toàn bộ chữ hiển thị của bảng là TIẾNG ANH ──');
const paneTxt = ($('stxPane2100').textContent + ' ' + $('stxPane2101').textContent
               + ' ' + w.document.querySelector('.stx-legend').textContent
               + ' ' + w.document.querySelector('#stxModal .modal-hdr').textContent
               + ' ' + w.document.querySelector('#stxModal .modal-foot').textContent);
const viet = paneTxt.match(/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/gi);
ok('không còn chữ tiếng Việt nào trong bảng', !viet, viet ? viet.join('') : 'sạch');
const copyBtn = w.document.querySelector('#stxModal .modal-foot .btn-green');
ok('nút copy bằng tiếng Anh', /Copy/.test(copyBtn.textContent), copyBtn.textContent.trim());


/* ═════════ F. v4.111 — 4 CỘT ĐỐI CHIẾU CHUYỂN KHO TRÊN TANK LOG ═════════ */
console.log('\n── F. Bốn cột Gap / Adj ST trên bảng Tank Log ──');
w.ENG.render();
const th2  = w.document.querySelectorAll('#engTbl thead th');
const hdr2 = Array.from(th2).map(x=>x.textContent.trim());
ok('có cột Gap C3 (kg)',    hdr2.indexOf('Gap C3 (kg)') >= 0);
ok('có cột Gap C4 (kg)',    hdr2.indexOf('Gap C4 (kg)') >= 0);
ok('có cột Adj ST C3 (kg)', hdr2.indexOf('Adj ST C3 (kg)') >= 0);
ok('có cột Adj ST C4 (kg)', hdr2.indexOf('Adj ST C4 (kg)') >= 0);
ok('bốn cột đứng NGAY SAU cờ ST và trước Vol (m³)',
   hdr2.indexOf('ST') < hdr2.indexOf('Gap C3 (kg)')
   && hdr2.indexOf('Adj ST C4 (kg)') < hdr2.indexOf('Vol (m³)'),
   hdr2.slice(hdr2.indexOf('ST'), hdr2.indexOf('Vol (m³)')+1).join(' | '));
ok('ROW_W đã nới lên 73 (mảng dòng đủ chỗ cho 4 ô mới)',
   w.ENG.STX_COLS.gap3 === 69 && w.ENG.STX_COLS.adj4 === 72,
   JSON.stringify(w.ENG.STX_COLS));
const tr900 = Array.from(w.document.querySelectorAll('#engTbl tbody tr'))
  .find(x=>x.children[2] && x.children[2].textContent.trim()==='LPG-2026-900');
ok('dòng 900 có trên bảng', !!tr900);
const nTd2 = tr900.children.length;
const nTf2 = Array.from(w.document.querySelectorAll('#engTfoot td'))
  .reduce((a,c)=>a+(parseInt(c.getAttribute('colspan'))||1),0);
ok('thead = tbody = tfoot (không lệch cột sau khi thêm 4 cột)',
   th2.length === nTd2 && th2.length === nTf2, th2.length+' / '+nTd2+' / '+nTf2);
ok('lot chưa đối chiếu → ô in dấu ·, KHÔNG in 0',
   tr900.children[hdr2.indexOf('Gap C3 (kg)')].textContent.trim() === '·',
   tr900.children[hdr2.indexOf('Gap C3 (kg)')].textContent.trim());
ok('… tooltip nói rõ là CHƯA đối chiếu, không phải lệch 0',
   /Chưa đối chiếu/.test(tr900.children[hdr2.indexOf('Adj ST C3 (kg)')].getAttribute('title')||''));

/* ═════════ G. NÚT 💾 SAVE — ghi kết quả vào Tank Log ═════════ */
console.log('\n── G. 💾 Save to Tank Log ──');
Object.keys(R).forEach(k=>delete R[k]);
put('g1', { date:'2026-08-09', sloc:'2100', mat:'C3', batch:'D', end:20000 });
put('g2', { date:'2026-08-09', sloc:'2100', mat:'C4', batch:'D', end:20000 });
w.MIXNOTIFY = { PENDING:{} };
w.INV.openStx(1);
$('stxLot2100').value = '900';
w.INV.stxLotChange('2100');
w.INV.stxSysReset('2100');                 /* bỏ mọi số gõ tay còn sót */
const Fg = w.INV.stxFigures('2100');
ok('stxFigures tính được',           Fg.ok === true && Fg.hasSys === true);
near('… gap tồn đầu C3 = −10 000',   Fg.gapC3, -10000, 1);
near('… số chuyển kho điều chỉnh C3 = 90 000', Fg.xC3, 90000, 1);
ok('có nút 💾 Save to Tank Log trên bảng',
   /Save to Tank Log/.test($('stxFoot2100').textContent));
ok('trước khi lưu, bảng nói rõ CHƯA lưu',
   /Not saved to the Tank Log yet/.test($('stxFoot2100').textContent));
w.INV.stxSave('2100');
const rowSaved = w.ENG.findRowByLotTank('LPG-2026-900','TK-3501');
ok('tìm lại được dòng lot 900', !!rowSaved);
near('ô [69] Gap C3  = −10 000', parseFloat(rowSaved[69]), -10000, 1);
near('ô [70] Gap C4  = −10 000', parseFloat(rowSaved[70]), -10000, 1);
near('ô [71] Adj ST C3 = 90 000', parseFloat(rowSaved[71]),  90000, 1);
near('ô [72] Adj ST C4 = 90 000', parseFloat(rowSaved[72]),  90000, 1);
const rec = w.ENG.stxReconOf(rowSaved);
ok('ENG.stxReconOf đọc lại đúng', rec.has === true && Math.round(rec.adj3) === 90000);
ok('Firebase không có → báo lỗi thẳng, không im lặng',
   LOG.some(x=>/Could not save to the Tank Log/.test(x)), LOG[LOG.length-1]);
w.ENG.render();
const tr900b = Array.from(w.document.querySelectorAll('#engTbl tbody tr'))
  .find(x=>x.children[2] && x.children[2].textContent.trim()==='LPG-2026-900');
ok('bảng Tank Log in gap có dấu − (U+2212, giống bảng đối chiếu)',
   tr900b.children[hdr2.indexOf('Gap C3 (kg)')].textContent.trim() === '−10,000',
   tr900b.children[hdr2.indexOf('Gap C3 (kg)')].textContent.trim());
ok('bảng Tank Log in số chuyển kho đã điều chỉnh',
   tr900b.children[hdr2.indexOf('Adj ST C3 (kg)')].textContent.trim() === '90,000',
   tr900b.children[hdr2.indexOf('Adj ST C3 (kg)')].textContent.trim());
w.INV.renderStx(true);
ok('bảng đối chiếu đổi sang trạng thái ĐÃ LƯU',
   /✔ Saved on this lot/.test($('stxFoot2100').textContent), $('stxFoot2100').textContent.slice(-90));
/* thiếu tồn đầu hệ thống thì KHÔNG được lưu bừa */
Object.keys(R).forEach(k=>delete R[k]);
$('stxLot2100').value = '901';            /* lot xong 14:30 — trong giờ làm việc */
w.INV.stxLotChange('2100');
const nLog = LOG.length;
w.INV.stxSave('2100');
ok('chưa có tồn đầu hệ thống → TỪ CHỐI lưu và nói rõ',
   LOG.slice(nLog).some(x=>/Enter the system opening stock first/.test(x)),
   LOG.slice(nLog).join(' | '));
const row901 = w.ENG.findRowByLotTank('LPG-2026-901','TK-3501');
ok('… và KHÔNG ghi gì vào dòng đó', String(row901[69]) === '' && String(row901[71]) === '');

/* Tính lại + SAVE lot (đường MC/paste đi qua) KHÔNG được xoá số đã đối chiếu */
console.log('\n   · upsertRow không được xoá 4 ô đã đối chiếu');
const again = mkRow({ lot:'LPG-2026-900', tank:'TK-3501', date:'09/08/26',
  start:'19:00', finish:'23:00', iv:IV, fv:FV,
  den:DEN, w3:'50', iden:DEN, iw3:'50', qc3:100, qc4:100 });
w.ENG.upsertRow(again);
const rowAgain = w.ENG.findRowByLotTank('LPG-2026-900','TK-3501');
near('SAVE lại lot vẫn GIỮ gap C3', parseFloat(rowAgain[69]), -10000, 1);
near('SAVE lại lot vẫn GIỮ số chuyển kho đã điều chỉnh C3', parseFloat(rowAgain[71]), 90000, 1);

/* ═════════ H. LOT ĐANG TÍNH HIỆN CẠNH TÊN BỒN ═════════ */
console.log('\n── H. Lot đang tính đứng cùng hàng với TK-3501 ──');
Object.keys(R).forEach(k=>delete R[k]);
put('h1', { date:'2026-08-09', sloc:'2100', mat:'C3', batch:'D', end:20000 });
put('h2', { date:'2026-08-09', sloc:'2100', mat:'C4', batch:'D', end:20000 });
$('stxLot2100').value = '900';
w.INV.stxLotChange('2100');
const lotNow = $('stxLotNow2100');
ok('có chip LOT trong khối tiêu đề', !!lotNow);
ok('chip nằm CÙNG HÀNG với tên bồn TK-3501',
   lotNow.parentElement === w.document.querySelector('#stxPane2100 .stx-hdr'),
   lotNow.parentElement ? lotNow.parentElement.className : '—');
ok('gõ số trần "900" vẫn in ra LOT ĐẦY ĐỦ của Tank Log',
   /LPG-2026-900/.test(lotNow.textContent), lotNow.textContent.trim());
ok('… và đứng SAU tên bồn, TRƯỚC ô nhập lot',
   Array.from(lotNow.parentElement.children).indexOf(w.document.querySelector('#stxPane2100 .stx-hdr .nm'))
   < Array.from(lotNow.parentElement.children).indexOf(lotNow));
ok('tooltip nói rõ mọi số bên dưới thuộc lot này',
   /belongs to lot LPG-2026-900/.test(lotNow.title||''), lotNow.title);
$('stxLot2100').value = '';
w.INV.stxLotChange('2100');
w.INV.renderStx(true);
ok('lot lấy tự động vẫn được in ra chip (không để trống)',
   /LPG-2026-/.test($('stxLotNow2100').textContent), $('stxLotNow2100').textContent.trim());

/* ═════════ I. Ô THÔNG BÁO TANK MIX ═════════ */
console.log('\n── I. Thông báo Tank Mix: opening · gap · số đã adjust ──');
/* Nạp module thật. Đổi `const MIXNOTIFY` thành `window.MIXNOTIFY` để nó
   nằm ở global — không thì binding const của eval che mất window và INV
   lại đọc nhầm object giả của các phần test trước. */
const mnSrc = fs.readFileSync(path.join(ROOT,'js/features/mixnotify.js'),'utf8')
  .replace('const MIXNOTIFY = (function(){', 'window.MIXNOTIFY = (function(){')
  .replace('window.MIXNOTIFY = MIXNOTIFY;', '');
try{ w.eval(mnSrc); }catch(e){ console.log('❌ LOAD mixnotify.js → '+e.message); process.exit(1); }
ok('nạp được module MIXNOTIFY thật', typeof w.MIXNOTIFY.render === 'function');

/* v4.114 — INV chỉ vẽ lại ô thông báo KHI modal 🔔 đang mở (vẽ một modal
   đóng là công toi: 4 thẻ, mỗi thẻ quét lại Tank Log, mỗi lần gõ một chữ
   số). Test phải mở nó ra thì mới thấy được chiều đồng bộ ngược. */
$('notif-modal').classList.add('on');
const PK = 'TK-3501_LPG-2026-900';
w.MIXNOTIFY.PENDING[PK] = { _pk:PK, lot:'LPG-2026-900', c3:100000, c4:100000,
                            tkName:'TK-3501', key:'tk1', _ts:1 };
w.INV.stxSysReset('2100');
w.MIXNOTIFY.render();
const cell = w.document.querySelectorAll('#notif-tankmix-host .sc-r5-cell')[0];
const cTxt = () => cell.textContent.replace(/\s+/g,' ');
ok('thẻ hiện tên bồn + lot',      /TK-3501/.test(cTxt()) && /LOT 900/.test(cTxt()), cTxt().slice(0,70));
ok('vẫn hiện con số đang báo cho Check Booth', /NOTIFIED \(COQ\)/.test(cTxt()));
ok('có dòng SYSTEM OPENING',      /SYSTEM OPENING/.test(cTxt()));
ok('có dòng GAP AT OPENING',      /GAP AT OPENING/.test(cTxt()));
ok('có dòng ADJUSTED TRANSFER',   /ADJUSTED TRANSFER/.test(cTxt()));
const nIn3 = cell.querySelector('input.ntx-inp.c3');
const nIn4 = cell.querySelector('input.ntx-inp.c4');
ok('tồn đầu hệ thống SỬA ĐƯỢC ngay tại ô thông báo', !!nIn3 && !!nIn4);
near('… tự điền 20 000 kg từ SAP', parseFloat(nIn3.value), 20000, 0);
ok('gap in ra −10,000',      /−10,000/.test(cTxt()), cTxt().slice(0,220));
ok('số chuyển kho đã adjust in ra 90,000', /90,000/.test(cTxt()));
ok('nói rõ nên post số nào thay cho số đã báo', /Post/.test(cTxt()));
ok('nói rõ ✅ sẽ ghi vào Tank Log',
   /writes the gap and this quantity onto the lot in the Tank Log/.test(cTxt()));

console.log('\n   · Sửa ở thông báo = sửa ở bảng đối chiếu');
nIn3.value = '15000';
w.MIXNOTIFY.sysEdit(PK);
ok('ô System opening của BẢNG đổi theo ngay', $('stxSys32100').value === '15000', $('stxSys32100').value);
const vals3 = Array.from($('stxFoot2100').querySelectorAll('.stx-sug-vals b')).map(x=>num(x.textContent));
near('… bảng đề xuất lên 95 000',   vals3[0], 95000, 1);
ok('bảng ghi nguồn là Manual entry', /Manual entry/.test($('stxSrc2100').textContent));
ok('… và nói rõ hai chỗ dùng chung một số',
   /editing it in either place changes both/i.test($('stxSrc2100').textContent));
w.MIXNOTIFY.render();
ok('thẻ thông báo cũng lên 95,000', /95,000/.test(cTxt()));
/* và ngược lại: gõ ở bảng → thẻ thông báo đổi theo */
$('stxSys32100').value = '12000';
w.INV.stxSysEdit('2100');
ok('gõ ở BẢNG → ô của thông báo đổi theo',
   w.document.querySelector('#notif-tankmix-host input.ntx-inp.c3').value === '12000',
   w.document.querySelector('#notif-tankmix-host input.ntx-inp.c3').value);

console.log('\n   · ✅ xác nhận ghi kết quả đối chiếu vào Tank Log');
w.INV.stxSysReset('2100');
w.MIXNOTIFY.render();
/* Chính là đường mà MIXNOTIFY.confirm đi qua */
let cbOk = null;
w.INV.stxSaveFor('TK-3501', 'LPG-2026-900', (o)=>{ cbOk = o; }, true);
const rowC = w.ENG.findRowByLotTank('LPG-2026-900','TK-3501');
near('✅ ghi gap C3 vào Tank Log',        parseFloat(rowC[69]), -10000, 1);
near('✅ ghi số chuyển kho đã adjust C3', parseFloat(rowC[71]),  90000, 1);
ok('callback có được gọi (confirm biết lúc nào ghi xong)', cbOk !== null);
ok('MIXNOTIFY.confirm gọi được', typeof w.MIXNOTIFY.confirm === 'function');

console.log('\n   · Chữ trên thẻ thông báo là TIẾNG ANH');
const nViet = cTxt().match(/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/gi);
ok('không còn chữ tiếng Việt trên thẻ thông báo', !nViet, nViet ? nViet.join('') : 'sạch');


/* ═════════ J. v4.113 — BẢN NHÁP TỒN ĐẦU LƯU TẠM TRÊN FIREBASE ═════════
   Nỗi lo của vận hành: nhân viên gõ tồn đầu hệ thống ở ô thông báo nhưng
   chưa kịp ✅, bồn lại trộn xong mẻ mới và đẩy thông báo lot mới vào →
   số của lot cũ có mất không? Bốn thứ phải đúng:
     ① thông báo /mix_notify khoá theo TỪNG LOT nên không cái nào đè cái nào
     ② số gõ tay cũng khoá theo BỒN + LOT (v4.113; trước đây một ô/bồn)
     ③ số đó được ghi tạm lên /stx_draft nên sống sót qua F5 / đổi máy
     ④ lưu vào Tank Log xong thì bản nháp bị XOÁ, không tích lại            */
console.log('\n── J. Bản nháp tồn đầu hệ thống (v4.113) ──');
{
  /* Firebase giả — chỉ đủ cho INV.attachFirebase + node stx_draft */
  const FBDB = { stx_draft:Object.create(null) };
  let draftCb = null;
  const P = ()=>{ const t = { then(f){ if(f) f(); return t; }, catch(){ return t; },
                              finally(f){ if(f) f(); return t; } }; return t; };
  const ENGDB = Object.create(null);
  function refFor(path){
    const p = String(path||'');
    return {
      on(ev, cb){
        if(p === 'stx_draft'){ draftCb = cb; cb({ val:()=>FBDB.stx_draft }); }
        else if(ev === 'value') cb({ val:()=>null });
      },
      child(k){ return {
        set(v){ if(p === 'stx_draft') FBDB.stx_draft[k] = v; else ENGDB[k] = v; return P(); },
        remove(){ if(p === 'stx_draft') delete FBDB.stx_draft[k]; else delete ENGDB[k]; return P(); }
      }; }
      /* CỐ Ý không có orderByChild/once: ENG._initialLoadAndAttach sẽ ném lỗi
         và bị chính init() bắt — nhưng _fbRef đã được gán TRƯỚC đó, nên lệnh
         ghi dòng Tank Log vẫn chạy được. Đúng thứ test này cần. */
    };
  }
  w.firebase = { database(){ return { ref:(pth)=>refFor(pth) }; } };
  try{ w.ENG.init(); }catch(e){ console.log('  (ENG.init: '+e.message+')'); }
  try{ w.INV.init(); }catch(e){ console.log('  (INV.init: '+e.message+')'); }
  ok('INV gắn được listener bản nháp', draftCb !== null);
  ok('ENG ghi được xuống Firebase giả (để thử đường lưu THÀNH CÔNG)',
     !!(w.ENG.ROWS.length));

  /* SAP + hai lot của CÙNG một bồn */
  Object.keys(R).forEach(k=>delete R[k]);
  put('j1', { date:'2026-08-09', sloc:'2100', mat:'C3', batch:'D', end:20000 });
  put('j2', { date:'2026-08-09', sloc:'2100', mat:'C4', batch:'D', end:20000 });
  const lotB = mkRow({ lot:'LPG-2026-905', tank:'TK-3501', date:'09/08/26',
    start:'19:00', finish:'23:00', iv:IV, fv:FV,
    den:DEN, w3:'50', iden:DEN, iw3:'50', qc3:100, qc4:100 });
  w.ENG.upsertRow(lotB);
  w.MIXNOTIFY = { PENDING:{} };

  /* gõ tay cho LOT 900 — chạy ngay, khỏi chờ 700 ms gộp ghi */
  const _st = w.setTimeout;
  w.setTimeout = f => { try{ f(); }catch(_){} return 0; };
  w.INV.stxSetSys('2100', 'LPG-2026-900', 15000, 15000);
  w.setTimeout = _st;

  const keys = Object.keys(FBDB.stx_draft);
  ok('⭐ số gõ tay được ghi tạm lên Firebase', keys.length === 1, keys.join(','));
  ok('… khoá đọc được, gồm cả bồn lẫn LOT', keys[0] === 'TK-3501_LPG-2026-900', keys[0]);
  ok('… lưu đủ bồn / lot / hai con số',
     FBDB.stx_draft[keys[0]].sloc === '2100' && FBDB.stx_draft[keys[0]].lot === 'LPG-2026-900'
     && FBDB.stx_draft[keys[0]].c3 === 15000);
  ok('… kèm người gõ và thời điểm', !!FBDB.stx_draft[keys[0]].ts);

  /* BỒN TRỘN XONG MẺ MỚI — thông báo lot 905 đẩy vào, người ta gõ cho lot đó */
  w.setTimeout = f => { try{ f(); }catch(_){} return 0; };
  w.INV.stxSetSys('2100', 'LPG-2026-905', 8000, 8000);
  w.setTimeout = _st;
  ok('⭐ lot MỚI KHÔNG đè bản nháp của lot cũ', Object.keys(FBDB.stx_draft).length === 2,
     Object.keys(FBDB.stx_draft).join(' | '));
  const f900 = w.INV.stxFigures('2100', 'LPG-2026-900');
  const f905 = w.INV.stxFigures('2100', 'LPG-2026-905');
  near('… lot 900 vẫn giữ đúng 15 000', f900.sysC3, 15000, 0);
  near('… lot 905 giữ số của riêng nó',  f905.sysC3,  8000, 0);
  ok('… và hai lot cho ra hai con số đề xuất khác nhau', f900.xC3 !== f905.xC3,
     f900.xC3 + ' / ' + f905.xC3);

  /* MÁY KHÁC / SAU F5: dựng lại từ Firebase */
  const snapshot = JSON.parse(JSON.stringify(FBDB.stx_draft));
  Object.keys(FBDB.stx_draft).forEach(k=>delete FBDB.stx_draft[k]);
  draftCb({ val:()=>({}) });                        /* server bảo "trống" */
  ok('server trống ⇒ RAM cũng bỏ theo', w.INV.stxFigures('2100','LPG-2026-900').sysManual === false);
  Object.assign(FBDB.stx_draft, snapshot);
  draftCb({ val:()=>FBDB.stx_draft });              /* nạp lại như sau F5 */
  const back = w.INV.stxFigures('2100', 'LPG-2026-900');
  ok('⭐ nạp lại từ Firebase là có số ngay', back.sysManual === true);
  near('… đúng con số đã gõ', back.sysC3, 15000, 0);

  /* LƯU VÀO TANK LOG ⇒ BẢN NHÁP PHẢI BIẾN MẤT */
  w.setTimeout = f => { try{ f(); }catch(_){} return 0; };
  w.INV.stxSaveFor('TK-3501', 'LPG-2026-900', null, true);
  w.setTimeout = _st;
  ok('⭐ lưu vào Tank Log THÀNH CÔNG thì XOÁ bản nháp',
     !FBDB.stx_draft['TK-3501_LPG-2026-900'], Object.keys(FBDB.stx_draft).join(' | '));
  ok('… bản nháp của lot KHÁC không bị đụng tới', !!FBDB.stx_draft['TK-3501_LPG-2026-905']);
  const rowJ = w.ENG.findRowByLotTank('LPG-2026-900','TK-3501');
  near('… và số đã nằm trong Tank Log', parseFloat(rowJ[71]), 110000 - 15000, 1);

  /* ⟳ reload cũng phải dọn bản nháp, không thì lần sau nó quay lại */
  $('stxLot2100').value = '905';
  w.INV.stxLotChange('2100');
  w.setTimeout = f => { try{ f(); }catch(_){} return 0; };
  w.INV.stxSysReset('2100');
  w.setTimeout = _st;
  ok('⭐ bấm ⟳ reload cũng xoá bản nháp trên server',
     !FBDB.stx_draft['TK-3501_LPG-2026-905'], Object.keys(FBDB.stx_draft).join(' | '));

  /* Nháp quá hạn bị dọn khi nạp — không để tích lại theo thời gian */
  FBDB.stx_draft['TK-3502_LPG-2025-1'] = { sloc:'2101', lot:'LPG-2025-1', c3:1, c4:1,
    by:'old', ts: Date.now() - 60*24*3600*1000 };
  FBDB.stx_draft['TK-3502_LPG-2026-910'] = { sloc:'2101', lot:'LPG-2026-910', c3:2, c4:2,
    by:'now', ts: Date.now() };
  draftCb({ val:()=>FBDB.stx_draft });
  ok('⭐ nháp quá hạn 30 ngày bị dọn', !FBDB.stx_draft['TK-3502_LPG-2025-1'],
     Object.keys(FBDB.stx_draft).join(' | '));
  ok('… nháp còn hạn thì GIỮ nguyên', !!FBDB.stx_draft['TK-3502_LPG-2026-910']);
  Object.keys(FBDB.stx_draft).forEach(k=>delete FBDB.stx_draft[k]);
  draftCb({ val:()=>FBDB.stx_draft });
}


/* ═════════ K. v4.114 — GÕ TỒN ĐẦU HỆ THỐNG KHÔNG ĐƯỢC "ĐƠ" ═════════════
   User báo: "nhập tay số opening stock của WMS, mỗi số nhập vào lại đơ ra
   ngay". Nguyên nhân: `oninput` gọi renderStx → ghi đè body.innerHTML, mà
   trước đó phải KÉO hai ô <input> ra kho ẩn rồi gắn lại. Element vẫn sống,
   nhưng CHUYỂN một element đang focus sang cha khác là trình duyệt CẮT
   FOCUS ⇒ gõ đúng một chữ số rồi ô chết.                                */
console.log('\n── K. Gõ tồn đầu hệ thống (v4.114) ──');
{
  Object.keys(R).forEach(k=>delete R[k]);
  put('k1', { date:'2026-08-09', sloc:'2100', mat:'C3', batch:'D', end:20000 });
  put('k2', { date:'2026-08-09', sloc:'2100', mat:'C4', batch:'D', end:20000 });
  w.MIXNOTIFY.PENDING && Object.keys(w.MIXNOTIFY.PENDING).forEach(k=>delete w.MIXNOTIFY.PENDING[k]);
  w.INV.openStx(1);
  $('stxLot2100').value = '900';
  w.INV.stxLotChange('2100');
  w.INV.stxSysReset('2100');

  const e3 = $('stxSys32100');
  ok('ô nhập KHÔNG còn là type=number', e3.getAttribute('type') === 'text',
     e3.getAttribute('type'));
  ok('… và khai inputmode để bàn phím số vẫn hiện trên máy tính bảng',
     e3.getAttribute('inputmode') === 'decimal');

  const tblBefore = $('stxBody2100').querySelector('.stx-tbl');
  const parentBefore = e3.parentNode;
  ok('bảng đã dựng, ô nhập nằm trong bảng', !!tblBefore && !!parentBefore);

  /* gõ từng chữ số như người thật */
  e3.focus();
  ok('ô đang được focus trước khi gõ', w.document.activeElement === e3);
  ['1','15','150','1500','15000'].forEach(v=>{ e3.value = v; w.INV.stxSysEdit('2100'); });

  ok('⭐ gõ xong 5 chữ số ô VẪN còn focus (không bị cắt)',
     w.document.activeElement === e3, 'activeElement = ' + (w.document.activeElement||{}).id);
  ok('… và giữ nguyên con số đang gõ', e3.value === '15000', e3.value);
  ok('⭐ bảng KHÔNG bị dựng lại (ô nhập không hề bị chuyển chỗ)',
     $('stxBody2100').querySelector('.stx-tbl') === tblBefore && e3.parentNode === parentBefore);

  /* nhưng mọi con số phụ thuộc vẫn phải chạy theo */
  const tb = $('stxBody2100');
  const cell = k => (tb.querySelector('[data-c="'+k+'"]')||{}).textContent || '';
  ok('tổng tồn đầu hệ thống cập nhật theo (15 000 gõ tay + 20 000 SAP)',
     /35,000/.test(cell('sopen-t')), cell('sopen-t'));
  ok('gap tồn đầu cập nhật theo',           /−5,000/.test(cell('gopen-3')), cell('gopen-3'));
  ok('nhãn nguồn đổi sang manual entry',    /manual entry/.test(cell('sopen-note')), cell('sopen-note'));
  const vals = Array.from($('stxFoot2100').querySelectorAll('.stx-sug-vals b')).map(x=>num(x.textContent));
  near('con số đề xuất C3 chạy theo ngay', vals[0], 110000-15000, 1);
  ok('nút 💾 Save vẫn còn ở chân bảng', /Save to Tank Log/.test($('stxFoot2100').textContent));

  /* dán "20,000" / gõ "20 000" đều phải ra 20000 */
  e3.value = '20,000'; w.INV.stxSysEdit('2100');
  near('dán "20,000" hiểu là 20 000', w.INV.stxFigures('2100').sysC3, 20000, 0);
  e3.value = '20 000'; w.INV.stxSysEdit('2100');
  near('gõ "20 000" cũng hiểu là 20 000', w.INV.stxFigures('2100').sysC3, 20000, 0);

  /* một lượt vẽ ĐẦY ĐỦ (máy khác đẩy về) không được nhảy vào sửa ô đang gõ */
  e3.value = '18';                 /* đang gõ dở, chưa gọi oninput */
  e3.focus();
  w.INV.renderStx(true);
  ok('⭐ lượt vẽ đầy đủ KHÔNG ghi đè ô đang gõ', e3.value === '18', e3.value);
  ok('… và trả lại focus cho đúng ô đó', w.document.activeElement === e3,
     'activeElement = ' + (w.document.activeElement||{}).id);

  /* ô KHÔNG focus thì vẫn được nạp lại bình thường */
  const e4 = $('stxSys42100');
  e4.value = '';
  w.INV.stxSysReset('2100');
  near('ô không focus vẫn tự nạp lại số SAP', parseFloat(e4.value), 20000, 0);
}

console.log('\n─────────────────────────────────────');
console.log(fail ? ('❌ '+fail+' assert THẤT BẠI') : '✅ TẤT CẢ ASSERT PASS');
process.exit(fail ? 1 : 0);
