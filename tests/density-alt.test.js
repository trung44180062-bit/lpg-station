/* ═══════════════════════════════════════════════════════════════════════
   v4.85 — TEST 2 CÁCH TÍNH FILLED C3/C4 BỔ SUNG + BẢNG TRA DENSITY
   Trích hàm thuần từ source rồi eval, nên test chạy trên code THẬT.
     node tests/density-alt.test.js        (cwd = lpg-station-v4-modular)

   Số liệu chuẩn: file Cal.xlsx do bộ phận CA cung cấp — LOT 342.
     Init vol 60.23 · End C4 301.34 · End C3 (final) 572.273 m³
     C4: 27.3 °C / 1.98 kg/cm²G      C3: 11.5 °C / 6.22 kg/cm²G
     COQ đầu  ρ 0.5415 · C3 50.46 %wt      COQ cuối ρ 0.5425 · C3 50.25 %wt
   ═══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const densSrc = fs.readFileSync('js/data/density.js', 'utf8');
const mcSrc   = fs.readFileSync('js/features/mixctrl.js', 'utf8');

/* ---- shim tối thiểu để nạp density.js ngoài trình duyệt ---- */
global.window = global;
global.localStorage = { getItem(){ return null; }, setItem(){}, removeItem(){} };
global.document = { getElementById(){ return null; } };
eval(densSrc);
const DENS = global.DENS;

/* ---- trích các hàm thuần của MC ---- */
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
eval(grab(mcSrc, '_pfrac'));
eval(grab(mcSrc, '_pw3'));
eval(grab(mcSrc, '_r3'));
eval(grab(mcSrc, 'altCore'));

let fail = 0, run = 0;
function near(label, got, want, tol){
  run++;
  const ok = got !== null && got !== undefined && Math.abs(got - want) <= tol;
  if(!ok) fail++;
  console.log((ok ? '  ✅ ' : '  ❌ ') + label + ' → ' + got + (ok ? '' : '   (mong đợi ≈ ' + want + ' ±' + tol + ')'));
}
function eq(label, got, want){
  run++;
  const ok = (Array.isArray(got) || Array.isArray(want))
    ? JSON.stringify(got) === JSON.stringify(want)
    : got === want;
  if(!ok) fail++;
  console.log((ok ? '  ✅ ' : '  ❌ ') + label + ' → ' + JSON.stringify(got) + (ok ? '' : '   (mong đợi ' + JSON.stringify(want) + ')'));
}
function truthy(label, v){
  run++;
  if(!v) fail++;
  console.log((v ? '  ✅ ' : '  ❌ ') + label);
}

console.log('\n── 1. BẢNG TRA DENSITY ─────────────────────────────────');
/* Giá trị nguyên bản trong file Excel phải khớp tuyệt đối */
eq('C3 @25°C = 492.1 kg/m³', DENS.lookup('c3', 25).rho, 492.1);
eq('C4 @20°C = 571.9 kg/m³', DENS.lookup('c4', 20).rho, 571.9);
/* Dòng 9°C của file gốc bị copy trùng dòng 8°C — bản trong phần mềm đã vá */
eq('C3 @9°C đã vá (KHÔNG còn 517.5)', DENS.lookup('c3', 9).rho, 516.1);
truthy('C3 @9°C nằm đúng giữa 8 và 10°C',
  DENS.lookup('c3', 9).rho < DENS.lookup('c3', 8).rho &&
  DENS.lookup('c3', 9).rho > DENS.lookup('c3', 10).rho);
/* Nội suy tuyến tính */
near('C4 @27.3°C nội suy', DENS.lookup('c4', 27.3).rho, 563.14, 0.01);
near('C3 @11.5°C nội suy', DENS.lookup('c3', 11.5).rho, 512.45, 0.01);
/* rhoT phải giữ đủ số lẻ — v4.85 làm tròn về 0.563 làm hụt 0.03 t/mẻ */
near('ton/m³ của C4 @27.3°C giữ đủ số lẻ', DENS.lookup('c4', 27.3).rhoT, 0.56314, 1e-6);
near('ton/m³ của C3 @11.5°C giữ đủ số lẻ', DENS.lookup('c3', 11.5).rhoT, 0.51245, 1e-6);
truthy('rhoT khớp đúng rho/1000',
  Math.abs(DENS.lookup('c3', 11.5).rhoT - DENS.lookup('c3', 11.5).rho/1000) < 1e-9);
/* Density phải giảm đơn điệu theo nhiệt độ trên toàn bảng */
['c3','c4'].forEach(k=>{
  const t = DENS.TABLE[k];
  let mono = true, monoP = true;
  for(let i = 1; i < t.length; i++){
    if(t[i][2] >= t[i-1][2]) mono = false;
    if(t[i][1] <= t[i-1][1]) monoP = false;
  }
  truthy(k.toUpperCase() + ': density giảm đơn điệu khi nhiệt độ tăng', mono);
  truthy(k.toUpperCase() + ': áp suất hơi tăng đơn điệu khi nhiệt độ tăng', monoP);
});
/* Ngoài dải phải bật cờ ngoại suy, không được ném lỗi */
truthy('ngoài dải bảng → cờ ext', DENS.lookup('c3', 99).ext === true);
truthy('trong dải bảng → không ext', DENS.lookup('c3', 20).ext === false);
truthy('20°C thuộc dải dữ liệu gốc', DENS.lookup('c3', 20).outSrc === false);
truthy('40°C ngoài dải dữ liệu gốc', DENS.lookup('c3', 40).outSrc === true);

console.log('\n── 2. ĐỐI CHIẾU NHIỆT ĐỘ ↔ ÁP SUẤT ────────────────────');
const ck4 = DENS.crossCheck('c4', 27.3, 1.98);
near('C4 lot 342: nhiệt độ suy từ áp kế', ck4.impliedT, 26.8, 0.4);
truthy('C4 lot 342: lệch trong ngưỡng → không cảnh báo nặng', ck4.level !== 'bad');
const ck3 = DENS.crossCheck('c3', 11.5, 6.22);
near('C3 lot 342: nhiệt độ suy từ áp kế', ck3.impliedT, 13.0, 0.4);
truthy('C3 lot 342: lệch ~1.5°C → chưa tới ngưỡng cảnh báo 2°C', ck3.level === 'ok');
/* dựng một sai lệch lớn có chủ đích */
const ckBad = DENS.crossCheck('c3', 11.5, 10.0);
eq('lệch lớn giữa nhiệt kế và áp kế → level = bad', ckBad.level, 'bad');
truthy('cảnh báo có nêu rõ số liệu', /gauge/.test(ckBad.msg));

console.log('\n── 3. CÁCH 1 — TRA BẢNG DENSITY (LOT 342) ──────────────');
const INP = {
  ord:'C4', iv:60.23, mid:301.34, fvol:572.273,
  t3:11.5, p3:6.22, t4:27.3, p4:1.98,
  iDen:0.5415, iW3:0.5046, fDen:0.5425, fW3:0.5025
};
const R = altCore(INP);
truthy('cách 1 tính được (không lỗi)', !R.dens.error);
eq('thứ tự bơm C4 → C3', R.dens.order, 'C4 → C3');
near('thể tích C4 = 301.34 − 60.23', R.dens.volC4, 241.11, 0.001);
near('thể tích C3 = 572.273 − 301.34', R.dens.volC3, 270.933, 0.001);
near('Filled C4 (bảng)', R.dens.fC4, 241.11 * 0.56314, 0.01);
near('Filled C3 (bảng)', R.dens.fC3, 270.933 * 0.51245, 0.01);
/* Excel dùng density làm tròn tay 0.569 / 0.515 nên lệch ~1%; kết quả của
   phần mềm phải nằm trong ±2 % so với con số Excel để coi là cùng phương pháp. */
near('so với Excel cách 1 — C4 137.19 (±2%)', R.dens.fC4, 137.19, 137.19 * 0.02);
near('so với Excel cách 1 — C3 139.53 (±2%)', R.dens.fC3, 139.53, 139.53 * 0.02);

console.log('\n── 4. CÁCH 2 — THEO COQ (LOT 342) ──────────────────────');
truthy('cách 2 tính được (không lỗi)', !R.coq.error);
near('khối lượng đầu = 60.23 × 0.5415', R.coq.mIni, 32.615, 0.002);
near('khối lượng cuối = 572.273 × 0.5425', R.coq.mFin, 310.458, 0.002);
near('C3 đầu', R.coq.c3Ini, 16.457, 0.002);
near('C4 đầu', R.coq.c4Ini, 16.157, 0.002);
near('C3 cuối', R.coq.c3Fin, 156.005, 0.002);
near('C4 cuối', R.coq.c4Fin, 154.453, 0.002);
/* ĐÚNG như ô E23/F23 của Cal.xlsx — lưu ý nhãn trong file Excel bị đảo:
   ô ghi "Mass C4 Filling" thực ra là hiệu của cột C3, và ngược lại. */
near('Filled C3 (COQ) = 139.548', R.coq.fC3, 139.548, 0.002);
near('Filled C4 (COQ) = 138.296', R.coq.fC4, 138.296, 0.002);
near('Tổng LPG (COQ)', R.coq.fLPG, 277.844, 0.004);

console.log('\n── 5. PHÂN TÍCH CHUỖI Pro/Bu %Wt ───────────────────────');
eq('"50.31/49.69" → [0.5031, 0.4969]', _pfrac('50.31/49.69').map(x=>+x.toFixed(4)), [0.5031, 0.4969]);
eq('có khoảng trắng "50.25 / 49.75"', _pfrac('50.25 / 49.75').map(x=>+x.toFixed(4)), [0.5025, 0.4975]);
eq('dạng phân số "0.5/0.5"', _pfrac('0.5/0.5'), [0.5, 0.5]);
eq('chuỗi rác → null', _pfrac('pass'), null);
eq('rỗng → null', _pfrac(''), null);
eq('%wt đơn "50.46" → 0.5046', _pw3('50.46'), 0.5046);
eq('%wt dạng phân số "0.5046" giữ nguyên', _pw3('0.5046'), 0.5046);
eq('%wt rỗng → null', _pw3(''), null);

console.log('\n── 6. CHẶN DỮ LIỆU SAI ─────────────────────────────────');
truthy('thiếu MID VOL → báo lỗi cách 1',
  /MID VOL/.test(altCore(Object.assign({}, INP, { mid:0 })).dens.error || ''));
truthy('MID VOL < INIT VOL → báo lỗi',
  /is below INIT VOL/.test(altCore(Object.assign({}, INP, { mid:50 })).dens.error || ''));
truthy('FINAL VOL < MID VOL → báo lỗi',
  /is below MID VOL/.test(altCore(Object.assign({}, INP, { fvol:200 })).dens.error || ''));
truthy('thiếu nhiệt độ C3 → báo lỗi',
  /C3 temperature/.test(altCore(Object.assign({}, INP, { t3:null })).dens.error || ''));
truthy('thiếu %wt COQ cuối → báo lỗi cách 2',
  /Pro\/Bu %Wt/.test(altCore(Object.assign({}, INP, { fW3:null })).coq.error || ''));
truthy('thiếu ρ COQ đầu (khi bồn có đáy) → báo lỗi cách 2',
  /INITIAL COQ density/.test(altCore(Object.assign({}, INP, { iDen:0 })).coq.error || ''));
/* bồn rỗng hoàn toàn thì không cần trạng thái đầu */
truthy('bồn rỗng (init vol = 0) vẫn tính được cách 2',
  !altCore(Object.assign({}, INP, { iv:0, iDen:0, iW3:null })).coq.error);
/* thứ tự bơm ngược lại thì 2 đoạn thể tích phải hoán đổi */
const RC3 = altCore(Object.assign({}, INP, { ord:'C3' }));
near('bơm C3 trước → thể tích C3 = 241.11', RC3.dens.volC3, 241.11, 0.001);
near('bơm C3 trước → thể tích C4 = 270.933', RC3.dens.volC4, 270.933, 0.001);
/* kết quả âm phải được cảnh báo chứ không im lặng */
const RNeg = altCore(Object.assign({}, INP, { iDen:6.0 }));
truthy('kết quả âm → có cảnh báo', (RNeg.coq.msgs || []).some(m=>/NEGATIVE/.test(m)));

console.log('\n════════════════════════════════════════════════════════');
console.log(fail ? '❌ ' + fail + '/' + run + ' KIỂM TRA THẤT BẠI'
                 : '✅ TẤT CẢ ' + run + ' KIỂM TRA ĐỀU ĐẠT');
process.exit(fail ? 1 : 0);
