/* ═══════════════════════════════════════════════════════════════════════
   v4.101 — TEST: TUẦN HOÀN ĐƯỜNG ỐNG TRONG ★ SPECIAL RATIO MIX PLANNER
   + TEST: TỶ TRỌNG GIỮ ĐỦ 4 SỐ THẬP PHÂN KHI LƯU TANK LOG

   Chạy:  node tests/mixplan-circ.test.js      (cwd = lpg-station-v4-modular)

   Trích hàm THẬT từ js/features/mixctrl.js và js/features/eng.js rồi eval,
   nên test bám đúng code đang chạy chứ không chép lại công thức.

   Ý nghĩa vận hành của phần tuần hoàn:
     Sau mẻ trộn lệch tỉ lệ, 74 m³ hàng nằm trong đường ống CŨNG mang tỉ lệ
     đặc biệt s. Khi đưa bồn về tỉ lệ thường t thì cả hệ (bồn + ống) phải về
     t, tức phải chỉnh (Vr + Vp) chứ không chỉ Vr → tốn thêm chỗ trong bồn →
     MAX SAFE MIX PHẢI NHỎ HƠN so với khi bỏ tick tuần hoàn.
   ═══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const mcSrc  = fs.readFileSync('js/features/mixctrl.js', 'utf8');
const engSrc = fs.readFileSync('js/features/eng.js', 'utf8');

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

/* ── DOM giả tối thiểu cho planner ───────────────────────────────────── */
const F = {};                                   // id → giá trị ô input
const EL = {};                                  // id → element giả
function el(id){
  if(EL[id]) return EL[id];
  const e = {
    id, dataset:{}, classList:{ _s:new Set(),
      add(c){this._s.add(c);}, remove(c){this._s.delete(c);},
      toggle(c,on){ on ? this._s.add(c) : this._s.delete(c); },
      contains(c){return this._s.has(c);} },
    closest(){ return null; },
    get value(){ return F[id] == null ? '' : String(F[id]); },
    set value(v){ F[id] = v; },
    innerHTML:'', checked:false
  };
  return (EL[id] = e);
}
global._gid  = id => (id in F || id in EL) ? el(id) : null;
global._gv   = id => { const e = global._gid(id); return e ? e.value : ''; };
global._gnum = id => { const v = parseFloat(String(global._gv(id)||'').replace(/,/g,'')); return isNaN(v)?0:v; };
global.MC_D       = { c3l:0.483, c4l:0.560 };
global.MC_TARGET  = 570;
global.MC_WARN    = 585;
global.MC_TV      = 696.91;
global.MC_VPIPE_DEF = 74;
global._mcHardCap = () => 696.91 * 0.9;
global._mcWarnLvl = () => 585;
eval(grab(mcSrc, '_fmt'));
global._fmt = _fmt;
let _sppTank = null;
eval(grab(mcSrc, 'spPlanCalc'));

/* ── tiện ích chạy planner ───────────────────────────────────────────── */
function plan(o){
  ['spp-res','spp-circ','spp-circ-note'].forEach(id=>{ F[id] = F[id] || ''; el(id); });
  el('spp-res').dataset = {};
  F['spp-special'] = o.s;
  F['spp-norm']    = o.t;
  F['spp-sell']    = o.sell;
  F['spp-resv']    = o.resv != null ? o.resv : 0;
  F['spp-fail']    = o.fail != null ? o.fail : 0;
  F['spp-max']     = o.max  != null ? o.max  : 570;
  F['spp-vpipe']   = o.vp   != null ? o.vp   : 74;
  el('spp-circ').checked = !!o.circ;
  spPlanCalc();
  return {
    v0:   parseFloat(el('spp-res').dataset.v0),
    html: el('spp-res').innerHTML,
    note: el('spp-circ-note').innerHTML
  };
}

let fail = 0, run = 0;
function near(label, got, want, tol){
  run++;
  const ok = got != null && Math.abs(got - want) <= tol;
  if(!ok) fail++;
  console.log((ok?'  ✅ ':'  ❌ ') + label + ' → ' + got + (ok?'':'   (mong đợi ≈ '+want+' ±'+tol+')'));
}
function truthy(label, v){
  run++; if(!v) fail++;
  console.log((v?'  ✅ ':'  ❌ ') + label);
}

/* ═══ 1. BỎ TICK TUẦN HOÀN = ĐÚNG BẰNG CÔNG THỨC CŨ ═══════════════════ */
console.log('\n── 1. KHÔNG tuần hoàn → giữ nguyên kết quả bản cũ ───────');
{
  const s = 0.30, t = 0.535, M = 570, sellT = 100;
  const rho = s*0.483 + (1-s)*0.560;
  const Vs  = sellT/rho;
  const k   = (1-s)/(1-t);
  const V0old = Math.min(M, Vs + M/k);
  const r = plan({ s:30, t:53.5, sell:100, circ:false });
  near('MAX SAFE MIX khớp công thức cũ', r.v0, +V0old.toFixed(1), 0.15);
  truthy('có ghi chú "KHÔNG tuần hoàn"', /KHÔNG tuần hoàn/.test(r.note));
}

/* ═══ 2. CÓ TUẦN HOÀN → MIX ĐƯỢC ÍT HƠN ══════════════════════════════ */
console.log('\n── 2. CÓ tuần hoàn → MAX SAFE MIX nhỏ hơn (an toàn hơn) ─');
{
  const off = plan({ s:30, t:53.5, sell:100, circ:false });
  const on  = plan({ s:30, t:53.5, sell:100, circ:true, vp:74 });
  truthy('bật tuần hoàn cho số nhỏ hơn', on.v0 < off.v0 - 0.05);
  /* VrMax = (M − Vp·a)/k ; a = (t−s)/(1−t) ; k = 1+a */
  const s=0.30, t=0.535, M=570, a=(t-s)/(1-t), k=1+a;
  const rho = s*0.483 + (1-s)*0.560, Vs = 100/rho;
  const want = Math.min(M, Vs + (M - 74*a)/k);
  near('khớp VrMax = (M − Vp·a)/k', on.v0, +want.toFixed(1), 0.15);
  near('chênh lệch đúng bằng phần ống ăn mất', off.v0 - on.v0, 74*a/k, 0.2);
  truthy('ghi chú nêu m³ chỗ bị mất', /tốn thêm/.test(on.note));
  truthy('bảng ghi rõ đang tính CÓ tuần hoàn', /có tuần hoàn/i.test(on.html));
}

/* ═══ 3. TỈ LỆ 70:30 — chiều ngược lại (bơm C4) ══════════════════════ */
console.log('\n── 3. Tỉ lệ đặc biệt 70:30 → hồi phục bằng C4 ───────────');
{
  /* bán 60 t: giới hạn hồi phục mới là ràng buộc (bán nhiều thì trần bồn
     chặn trước, hai phương án cùng cho 570 m³ nên không so sánh được) */
  const on  = plan({ s:70, t:53.5, sell:60, circ:true, vp:74 });
  const off = plan({ s:70, t:53.5, sell:60, circ:false });
  const s=0.70, t=0.535, M=570, a=(s-t)/t, k=1+a;
  const rho = s*0.483 + (1-s)*0.560, Vs = 60/rho;
  const want = Math.min(M, Vs + (M - 74*a)/k);
  near('khớp công thức bơm C4', on.v0, +want.toFixed(1), 0.15);
  truthy('vẫn nhỏ hơn khi không tuần hoàn', on.v0 < off.v0 - 0.05);
  truthy('OPTION A ghi bơm C4', /pump C4 only/.test(on.html));
}

/* ═══ 4. s = t → tuần hoàn không đổi gì ══════════════════════════════ */
console.log('\n── 4. Tỉ lệ đặc biệt = tỉ lệ thường → không đổi ─────────');
{
  const on  = plan({ s:53.5, t:53.5, sell:100, circ:true, vp:74 });
  const off = plan({ s:53.5, t:53.5, sell:100, circ:false });
  near('hai kết quả bằng nhau', on.v0, off.v0, 0.001);
}

/* ═══ 5. OPTION B — bơm 2 sản phẩm về đúng M ═════════════════════════ */
console.log('\n── 5. OPTION B: cả hệ bồn + ống về tỉ lệ thường ─────────');
{
  /* kiểm tra cân bằng khối lượng của công thức trong source:
     x = t(M+Vp) − s(Vr+Vp) ; y = (1−t)(M+Vp) − (1−s)(Vr+Vp) */
  const s=0.30, t=0.535, M=570, Vp=74, Vr=120;
  const x = t*(M+Vp) - s*(Vr+Vp);
  const y = (1-t)*(M+Vp) - (1-s)*(Vr+Vp);
  near('x + y = M − Vr (bồn về đúng M)', x + y, M - Vr, 1e-9);
  near('C3 cả hệ về đúng t', (s*(Vr+Vp) + x)/(M+Vp), t, 1e-12);
  near('C4 cả hệ về đúng 1−t', ((1-s)*(Vr+Vp) + y)/(M+Vp), 1-t, 1e-12);
}

/* ═══ 6. TỶ TRỌNG 4 SỐ THẬP PHÂN KHI LƯU TANK LOG ════════════════════ */
console.log('\n── 6. Density không bị cắt còn 2 số khi SAVE ────────────');
{
  const A_IDEN = 63, A_IW3 = 64;
  eval(grab(engSrc, '_fmtEditNum'));
  const back = (v, col) => parseFloat(_fmtEditNum(v, col));   // ô modal → lưu lại
  near('ρ 0.5405 (cột 33) giữ nguyên',        back(0.5405, 33), 0.5405, 0);
  near('ρ 0.5425 (cột 33) giữ nguyên',        back(0.5425, 33), 0.5425, 0);
  near('ρ đầu 0.5415 (cột 63) giữ nguyên',    back(0.5415, A_IDEN), 0.5415, 0);
  near('%wt đầu 50.4625 (cột 64) giữ nguyên', back(50.4625, A_IW3), 50.4625, 0);
  truthy('cột thể tích vẫn 3 số như cũ', _fmtEditNum(572.2734, 6) === '572.273');
  /* chính là lỗi cũ: toFixed(3) nuốt mất số thứ 4 */
  truthy('bản cũ THẬT SỰ sai (0.5405 → 0.54)',
         String(parseFloat((0.5405).toFixed(3))) === '0.54');
}

console.log('\n' + (fail ? '❌ ' + fail + '/' + run + ' phép kiểm THẤT BẠI'
                         : '✅ ' + run + '/' + run + ' phép kiểm ĐẠT') + '\n');
process.exit(fail ? 1 : 0);
