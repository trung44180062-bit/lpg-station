/* ═══════════════════════════════════════════════════════════════════════
   v4.86 — TEST PHƯƠNG PHÁP ② TÍNH FILLED C3/C4 THEO COQ
   Trích hàm thuần từ source rồi eval, nên test chạy trên code THẬT.
     node tests/coq-method.test.js        (cwd = lpg-station-v4-modular)

   Số liệu chuẩn: file Cal.xlsx do bộ phận CA cung cấp — LOT 342.
     INIT VOL 60.23 m³ · FINAL VOL 572.273 m³
     COQ đầu  ρ 0.5415 ton/m³ · C3 50.46 %wt
     COQ cuối ρ 0.5425 ton/m³ · C3 50.25 %wt
     → Excel: Filled C3 139.5479 · Filled C4 138.2957 ton
   ═══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const mcSrc = fs.readFileSync('js/features/mixctrl.js', 'utf8');

function grab(src, name){
  const i = src.indexOf('function ' + name + '(');
  if(i < 0) throw new Error('không tìm thấy ' + name);
  let d = 0;
  for(let k = src.indexOf('{', i); k < src.length; k++){
    if(src[k] === '{') d++;
    else if(src[k] === '}'){ d--; if(!d) return src.slice(i, k + 1); }
  }
  throw new Error('không đóng ngoặc: ' + name);
}
/* cột mở rộng — phải khớp mixctrl.js / eng.js */
const A_IDEN = 63, A_IW3 = 64, A_ISRC = 65, A_QC3 = 66, A_QC4 = 67, A_MTH = 68;
global.ENG = { ROWS: [] };
eval(grab(mcSrc, '_pfrac'));
eval(grab(mcSrc, '_pw3'));
const W3_TOL = 0.05;
eval(grab(mcSrc, '_w3Diag'));
eval(grab(mcSrc, '_w3Why'));
eval(grab(mcSrc, '_pw3any'));
eval(grab(mcSrc, '_w3Diag'));
eval(grab(mcSrc, '_w3Why'));
eval(grab(mcSrc, '_r3'));
eval(grab(mcSrc, 'altCore'));
eval(grab(mcSrc, '_lotKeyOf'));
eval(grab(mcSrc, '_prevCoq'));
eval(grab(mcSrc, 'altFromRow'));

let fail = 0, run = 0;
function near(label, got, want, tol){
  run++;
  const ok = got !== null && got !== undefined && Math.abs(got - want) <= tol;
  if(!ok) fail++;
  console.log((ok ? '  ✅ ' : '  ❌ ') + label + ' → ' + got + (ok ? '' : '   (mong đợi ≈ ' + want + ' ±' + tol + ')'));
}
function eq(label, got, want){
  run++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if(!ok) fail++;
  console.log((ok ? '  ✅ ' : '  ❌ ') + label + ' → ' + JSON.stringify(got) + (ok ? '' : '   (mong đợi ' + JSON.stringify(want) + ')'));
}
function truthy(label, v){
  run++;
  if(!v) fail++;
  console.log((v ? '  ✅ ' : '  ❌ ') + label);
}
const row = () => new Array(69).fill('');

console.log('\n── 1. PARSER Pro/Bu %Wt ─────────────────────────────────');
eq('"50.31/49.69" → phân số',       _pfrac('50.31/49.69').map(x=>+x.toFixed(6)), [0.5031, 0.4969]);
eq('"52.96 / 45.62" chuẩn hoá về 1', _pfrac('52.96 / 45.62').map(x=>+x.toFixed(6)),
   [+(52.96/98.58).toFixed(6), +(45.62/98.58).toFixed(6)]);
eq('dấu phẩy thập phân',             _pfrac('50,25/49,75').map(x=>+x.toFixed(6)), [0.5025, 0.4975]);
eq('chuỗi rỗng → null',              _pfrac(''), null);
eq('%wt đơn 50.46 → 0.5046',         _pw3('50.46'), 0.5046);
eq('%wt đã là phân số 0.5046',       _pw3('0.5046'), 0.5046);

console.log('\n── 2. ĐỐI CHIẾU Cal.xlsx LOT 342 ────────────────────────');
const REF = altCore({ iv:60.23, fvol:572.273, iDen:0.5415, iW3:0.5046, fDen:0.5425, fW3:0.5025 });
truthy('tính được (không lỗi)', !REF.coq.error);
near('Filled C3 = 139.5479 ton', REF.coq.fC3, 139.5479, 0.0006);
near('Filled C4 = 138.2957 ton', REF.coq.fC4, 138.2957, 0.0006);
near('Filled LPG = tổng 2 cấu tử', REF.coq.fLPG, 139.5479 + 138.2957, 0.002);
near('khối lượng đầu  = 60.23 × 0.5415',  REF.coq.mIni, 60.23 * 0.5415, 0.001);
near('khối lượng cuối = 572.273 × 0.5425', REF.coq.mFin, 572.273 * 0.5425, 0.001);
near('C3 đầu + C4 đầu = khối lượng đầu',  REF.coq.c3Ini + REF.coq.c4Ini, REF.coq.mIni, 0.002);
near('C3 cuối + C4 cuối = khối lượng cuối', REF.coq.c3Fin + REF.coq.c4Fin, REF.coq.mFin, 0.002);
truthy('không có cảnh báo bất thường', REF.coq.msgs.length === 0);

console.log('\n── 3. CÂN BẰNG KHỐI LƯỢNG (bất biến) ────────────────────');
/* Filled LPG phải LUÔN bằng khối lượng cuối trừ khối lượng đầu */
[[0, 570, 0, null, 0.5430, 0.5500],
 [120.5, 585, 0.5390, 0.4800, 0.5440, 0.5210],
 [336.0, 563.445, 0.5640, 0.2803, 0.5425, 0.5397]].forEach((t, i)=>{
  const r = altCore({ iv:t[0], fvol:t[1], iDen:t[2], iW3:t[3], fDen:t[4], fW3:t[5] });
  truthy('case '+(i+1)+' tính được', !r.coq.error);
  if(r.coq.error) return;
  near('case '+(i+1)+' ΣFilled = M_cuối − M_đầu',
       r.coq.fLPG, r.coq.mFin - r.coq.mIni, 0.003);
});

console.log('\n── 4. THIẾU DỮ LIỆU → BÁO ĐÍCH DANH, KHÔNG ĐOÁN ─────────');
let m;
m = altCore({ iv:100, fvol:0, iDen:0.54, iW3:0.5, fDen:0.5425, fW3:0.5 });
eq('thiếu FINAL VOL',   m.coq.need, ['FINAL VOL (m³)']);
m = altCore({ iv:100, fvol:570, iDen:0.54, iW3:0.5, fDen:0, fW3:0.5 });
eq('thiếu ρ COQ lot này', m.coq.need, ['COQ Density of this lot']);
m = altCore({ iv:100, fvol:570, iDen:0.54, iW3:0.5, fDen:0.5425, fW3:null });
eq('thiếu Pro/Bu %Wt',  m.coq.need, ['COQ Pro/Bu %Wt of this lot is empty']);
m = altCore({ iv:100, fvol:570, iDen:0, iW3:null, fDen:0.5425, fW3:0.5 });
eq('thiếu cả trạng thái đầu', m.coq.need,
   ['INITIAL COQ density (previous lot)', 'INITIAL C3 %wt (previous lot) is empty']);
truthy('có lỗi thì KHÔNG trả ra số', m.coq.fC3 === undefined);
/* bồn rỗng hoàn toàn thì KHÔNG cần trạng thái đầu */
m = altCore({ iv:0, fvol:570, iDen:0, iW3:null, fDen:0.5425, fW3:0.5 });
truthy('INIT VOL = 0 vẫn tính được', !m.coq.error);
near('INIT VOL = 0 → Filled C3 = nửa khối lượng cuối', m.coq.fC3, 570*0.5425*0.5, 0.002);

console.log('\n── 5. CẢNH BÁO HỢP LÝ ───────────────────────────────────');
m = altCore({ iv:400, fvol:300, iDen:0.5425, iW3:0.50, fDen:0.5425, fW3:0.50 });
truthy('FINAL < INIT → cảnh báo', m.coq.msgs.some(t=>/BELOW INIT VOL/.test(t)));
truthy('FINAL < INIT → cấu tử âm cũng được cảnh báo', m.coq.msgs.some(t=>/NEGATIVE/.test(t)));
m = altCore({ iv:100, fvol:570, iDen:0.5425, iW3:0.50, fDen:0.90, fW3:0.50 });
truthy('ρ ngoài dải 0.45–0.65 → cảnh báo', m.coq.msgs.some(t=>/outside the normal/.test(t)));

console.log('\n── 6. altFromRow — TỰ DÒ TRẠNG THÁI ĐẦU TỪ LOT TRƯỚC ────');
/* Lot trước cùng bồn, Pass, có đủ ρ [33] và Pro/Bu %Wt [45] */
const prev = row();
prev[1]='LPG-2026-354'; prev[2]='TK-3502'; prev[27]='Pass'; prev[33]=0.5415; prev[45]='50.46/49.54';
/* Lot khác bồn — KHÔNG được lấy nhầm */
const other = row();
other[1]='LPG-2026-355'; other[2]='TK-3501'; other[27]='Pass'; other[33]=0.9999; other[45]='90.00/10.00';
/* Lot đang xét: chưa có [63]/[64] */
const cur = row();
cur[1]='LPG-2026-356'; cur[2]='TK-3502'; cur[10]=60.23; cur[6]=572.273; cur[33]=0.5425; cur[45]='50.25/49.75';
global.ENG.ROWS = [prev, other, cur];

let a = altFromRow(cur);
truthy('dòng thiếu trạng thái đầu vẫn tính được', !a.coq.error);
near('lấy đúng ρ của lot trước', a.resolved.iDen, 0.5415, 1e-9);
near('lấy đúng %wt C3 của lot trước', a.resolved.iW3, 0.5046, 1e-9);
near('Filled C3 khớp Cal.xlsx', a.coq.fC3, 139.5479, 0.0006);
near('Filled C4 khớp Cal.xlsx', a.coq.fC4, 138.2957, 0.0006);
truthy('nguồn ghi rõ lot nào', /LPG-2026-354/.test(a.resolved.iSrc));

/* KHÔNG được lấy lot MỚI hơn làm trạng thái đầu */
const newer = row();
newer[1]='LPG-2026-357'; newer[2]='TK-3502'; newer[27]='Pass'; newer[33]=0.5000; newer[45]='10.00/90.00';
global.ENG.ROWS = [prev, newer, cur];
a = altFromRow(cur);
near('bỏ qua lot mới hơn', a.resolved.iDen, 0.5415, 1e-9);

/* Lot Fail không được dùng làm trạng thái đầu */
const failLot = row();
failLot[1]='LPG-2026-355'; failLot[2]='TK-3502'; failLot[27]='Fail'; failLot[33]=0.4000; failLot[45]='10.00/90.00';
global.ENG.ROWS = [prev, failLot, cur];
a = altFromRow(cur);
near('bỏ qua lot Fail', a.resolved.iDen, 0.5415, 1e-9);

/* Ô đã có sẵn trên dòng thì ƯU TIÊN, không đè bằng lot trước */
const cur2 = cur.slice();
cur2[A_IDEN] = 0.5390; cur2[A_IW3] = 48.00;
global.ENG.ROWS = [prev, cur2];
a = altFromRow(cur2);
near('ưu tiên ρ đã lưu trên dòng', a.resolved.iDen, 0.5390, 1e-9);
near('ưu tiên %wt đã lưu trên dòng', a.resolved.iW3, 0.48, 1e-9);

/* Không có lot trước nào đủ dữ liệu → báo thiếu, KHÔNG tự bịa số 0 */
global.ENG.ROWS = [cur];
a = altFromRow(cur);
truthy('không có lot trước → báo lỗi', !!a.coq.error);
truthy('nêu rõ thiếu trạng thái đầu', /INITIAL/.test(a.coq.error));

console.log('\n── 7. CHỐNG LỖI LÀM TRÒN ────────────────────────────────');
/* %wt phải được giữ tới 4 chữ số; không được làm tròn về 2 rồi mới nhân */
const p = altCore({ iv:60.23, fvol:572.273, iDen:0.5415, iW3:0.504612, fDen:0.5425, fW3:0.502537 });
truthy('%wt lẻ vẫn tính', !p.coq.error);
truthy('kết quả khác khi %wt đổi ở chữ số thứ 5', Math.abs(p.coq.fC3 - 139.5479) > 0.0005);

console.log('\n── 8. Pro/Bu %Wt kiểu "50.5" (CHỈ propane) — lỗi thật của lot 355/356 ──');
eq('cặp "50.31/49.69"',      _pw3any('50.31/49.69'), 0.5031);
eq('một số "50.5" → 0.505',  _pw3any('50.5'), 0.505);
eq('một số "25.3" → 0.253',  _pw3any('25.3'), 0.253);
eq('phân số "0.505"',        _pw3any('0.505'), 0.505);
eq('rỗng → null',            _pw3any(''), null);
eq('rác → null',             _pw3any('n/a'), null);

console.log('  · PHẦN MỀM KHÔNG ĐƯỢC TỰ SỬA SỐ CỦA CHỨNG THƯ');
eq('"50.5/49.5" tổng 100 → hợp lệ',  _w3Diag('50.5/49.5').state, 'ok');
near('"50.5/49.5" → 0.505 (a/100, KHÔNG phải a/(a+b))', _w3Diag('50.5/49.5').w3, 0.505, 1e-12);
eq('"50.5" một số → hợp lệ',         _w3Diag('50.5').state, 'ok');
eq('"50.5/48.5" tổng 99 → KHÔNG hợp lệ', _w3Diag('50.5/48.5').state, 'badsum');
eq('tổng 99 thì KHÔNG trả ra số nào', _w3Diag('50.5/48.5').w3, null);
near('sai lệch trong ±0.05 điểm % vẫn nhận', _w3Diag('50.52/49.5').w3, 0.5052, 1e-12);
eq('"52.96/45.62" (%Vol nhét nhầm ô %Wt) bị chặn', _w3Diag('52.96/45.62').state, 'badsum');
eq('"abc" → bad',                    _w3Diag('abc').state, 'bad');
eq('"120" → bad (không thể >100 %)', _w3Diag('120').state, 'bad');
truthy('câu giải thích nêu rõ tổng thực tế', /adds up to 99\.00 %/.test(_w3Why(_w3Diag('50.5/48.5'))));
truthy('câu giải thích khẳng định không tự sửa', /will NOT adjust/.test(_w3Why(_w3Diag('50.5/48.5'))));
const wOff = altCore({ iv:100, fvol:570, iDen:0.5425, iW3:0.5, fDen:0.5425,
                       fW3:_pw3any('50.5/48.5'), fW3raw:'50.5/48.5' });
truthy('tổng ≠ 100 → altCore TỪ CHỐI tính', !!wOff.coq.error);
truthy('… và nói đích danh lý do', /adds up to 99\.00/.test(wOff.coq.need.join(' ')));

console.log('  · phép trừ chạy trên số đầy đủ, KHÔNG làm tròn số trung gian');
const ex = altCore({ iv:336.000, fvol:563.445, iDen:0.564, iW3:0.253, fDen:0.542, fW3:0.505 });
near('Filled C3 = tính tay chính xác', ex.coq.fC3, 563.445*0.542*0.505 - 336*0.564*0.253, 5e-4);
near('Filled C4 = tính tay chính xác', ex.coq.fC4, 563.445*0.542*0.495 - 336*0.564*0.747, 5e-4);
near('Σ = M_cuối − M_đầu chính xác',   ex.coq.fLPG, 563.445*0.542 - 336*0.564, 5e-4);

/* Dựng đúng dữ liệu thật trên màn hình EDIT MIX DATA ngày 18/08/2026 */
const l355 = row();
l355[1]='LPG-2026-355'; l355[2]='TK-3502'; l355[27]='Pass';
l355[10]=58.945; l355[6]=425.661; l355[33]=0.564;
l355[44]='28.03'; l355[45]='25.3';                 // ⚠ MỘT SỐ, không có dấu "/"
const l356 = row();
l356[1]='LPG-2026-356'; l356[2]='TK-3502'; l356[27]='Pass';
l356[10]=336.000; l356[6]=563.445; l356[33]=0.542;
l356[44]='53.97'; l356[45]='50.5';                 // ⚠ MỘT SỐ
global.ENG.ROWS = [l355, l356];

const a356 = altFromRow(l356);
truthy('356 nay TÍNH ĐƯỢC (trước v4.86.1 báo thiếu Pro/Bu %Wt)', !a356.coq.error);
near('356 lấy trạng thái đầu từ lot 355 · ρ 0.564', a356.resolved.iDen, 0.564, 1e-9);
near('356 lấy %wt đầu 25.3 %',                      a356.resolved.iW3, 0.253, 1e-9);
/* 563.445×0.542 = 305.3872  · 336×0.564 = 189.504
   C3 = 305.3872×0.505 − 189.504×0.253 = 154.2216 − 47.9445 = 106.277
   C4 = 305.3872×0.495 − 189.504×0.747 = 151.1667 − 141.5595 =   9.607 */
near('356 Filled C3', a356.coq.fC3, 563.445*0.542*0.505 - 336*0.564*0.253, 0.002);
near('356 Filled C4', a356.coq.fC4, 563.445*0.542*0.495 - 336*0.564*0.747, 0.002);
near('356 ΣFilled = M_cuối − M_đầu', a356.coq.fLPG, 563.445*0.542 - 336*0.564, 0.003);
truthy('356 nguồn ghi rõ lot 355', /LPG-2026-355/.test(a356.resolved.iSrc));

console.log('\n────────────────────────────────────────────────────────');
console.log(fail ? '❌ ' + fail + '/' + run + ' assert FAIL' : '✅ TẤT CẢ ' + run + ' assert PASS');
process.exit(fail ? 1 : 0);
