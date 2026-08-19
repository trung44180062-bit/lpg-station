/* ═══════════════════════════════════════════════════════════════════════
   v4.101 — KIỂM CHỨNG ĐẦU–CUỐI: TUẦN HOÀN ỐNG CÓ BỊ TÍNH 2 LẦN KHÔNG?
   (cần jsdom:  npm i jsdom && node tests/mixplan-circ-e2e.test.js)

   Câu hỏi của kỹ sư:
     ① Đã tích tuần hoàn ở ★ MIX TỈ LỆ ĐẶC BIỆT ngoài panel, bấm 📋 PLAN thì
        planner có biết không?
     ② Panel tính tuần hoàn + planner tính tuần hoàn → có thành 2 lần không?
     ③ Số "bơm thêm sau khi bán để về tỉ lệ thường" đã kể tuần hoàn chưa?

   Trả lời bằng số: tuần hoàn xuất hiện ở HAI GIAI ĐOẠN KHÁC NHAU của cùng
   một mẻ, KHÔNG chồng lên nhau:
     • Giai đoạn TRỘN  (panel) : ống đang chứa hàng tỉ lệ CŨ (cr) → back-solve
       tỉ lệ pha trong bồn trEff sao cho tỉ lệ CUỐI = số đã nhập.
     • Giai đoạn HỒI PHỤC (plan): trộn xong thì ống chứa hàng tỉ lệ ĐẶC BIỆT
       (s) → khi kéo bồn về tỉ lệ thường t phải chỉnh cả phần trong ống.
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
w.confirm = ()=> true; w.alert = ()=>{}; w.prompt = ()=> 'CONFIRM';
w.logAudit = ()=>{}; w.canWrite = ()=> true;
w.URL.createObjectURL = ()=> 'blob:x'; w.URL.revokeObjectURL = ()=>{};
const bundle = ['js/features/eng.js','js/features/mixctrl.js']
  .map(f=>fs.readFileSync(path.join(ROOT,f),'utf8')).join('\n;\n') + '\n;window.ENG=ENG;window.MC=MC;';
try{ w.eval(bundle); }catch(e){ console.log('❌ LOAD BUNDLE → '+e.message); process.exit(1); }
try{ w.MC.init(); }catch(_){}

let fail = 0;
const ok = (l,c)=>{ console.log((c?'  ✅ ':'  ❌ ')+l); if(!c) fail++; };
const near = (l,got,want,tol)=>{ const c = Math.abs(got-want) <= tol;
  console.log((c?'  ✅ ':'  ❌ ')+l+' → '+got+(c?'':'   (mong đợi ≈ '+want+' ±'+tol+')')); if(!c) fail++; };
const $ = id => w.document.getElementById(id);
const set = (id,v)=>{ const e=$(id); if(!e) throw new Error('thiếu #'+id); e.value = String(v); };
const num = id => parseFloat($(id).value);

/* ── Kịch bản thật: TK-3501 còn 60 m³ tỉ lệ thường 53.5 %, trộn lô đặc
      biệt 30:70, ống 74 m³, bán 100 tấn, muốn về 55 % sau khi bán ─────── */
const CR = 53.5, S = 30, T = 55, VP = 74, IV = 60, SELL = 100, M = 570;

set('mc-iv1', IV);
set('mc-cr1', CR);
set('mc-spvpipe1', VP);
w.MC.toggleSP('1');                       // bật ★ MIX TỈ LỆ ĐẶC BIỆT
set('mc-tr1', S);                         // = tỉ lệ C3 CUỐI CÙNG sau tuần hoàn

console.log('\n── ① Planner có nhận trạng thái tuần hoàn của panel không? ──');
w.MC.spPlanOpen('1');
ok('tick tuần hoàn tự BẬT theo panel',      $('spp-circ').checked === true);
near('PIPE VOL lấy đúng số của panel',      num('spp-vpipe'), VP, 0);
near('tỉ lệ đặc biệt lấy đúng từ panel',    num('spp-special'), S, 0);
near('tỉ lệ thường mặc định',               num('spp-norm'), 55, 0);

console.log('\n── ② Panel + plan có tính tuần hoàn 2 lần không? ──');
set('spp-sell', SELL); set('spp-norm', T); set('spp-fail', 0); set('spp-resv', 0); set('spp-max', M);
w.MC.spPlanCalc();
const V0 = parseFloat($('spp-res').dataset.v0);
w.MC.spPlanApply();
near('TARGET VOL panel = MAX SAFE MIX', num('mc-tv1'), V0, 0.05);
w.MC.calcOne('1');
const trEff = num('mc-sptr1') / 100;      // tỉ lệ pha TRONG BỒN do panel back-solve
const s = S/100, t = T/100, cr = CR/100;
/* Giai đoạn TRỘN — ống chứa hàng tỉ lệ CŨ cr, tính đúng MỘT lần */
/* ô "Blend target" chỉ HIỂN THỊ 2 số lẻ (0.005 điểm %) — phép tính bên
   trong dùng số đầy đủ, nên dung sai ở đây theo đúng bước hiển thị */
near('tỉ lệ CUỐI sau tuần hoàn = đúng số đã nhập',
     (trEff*V0 + cr*VP) / (V0 + VP), s, 5e-5);
near('blend trong bồn khớp công thức back-solve',
     trEff, (s*(V0+VP) - cr*VP)/V0, 5e-5);
/* Bồn dừng ở đúng V0 — ống KHÔNG bị cộng thêm vào thể tích bồn */
const stop = (function(){
  const m = $('mc-r1').innerHTML.match(/STOP C3[\s\S]*?>([\d.,]+)<\/span><span[^>]*>m³/);
  return m ? parseFloat(m[1].replace(/,/g,'')) : NaN;
})();
near('STOP cuối = V0 (không cộng thêm 74 m³ của ống)', stop, V0, 0.15);
ok('V0 vẫn nằm dưới mức mix nhắm tới', V0 <= M + 1e-9);

console.log('\n── ③ Số bơm thêm sau khi bán đã kể tuần hoàn chưa? ──');
const rho = s*0.483 + (1-s)*0.560;
const Vs  = SELL/rho;                     // thể tích bán ra
const Vr  = V0 - Vs;                      // còn lại trong bồn @ s
const a   = (t-s)/(1-t);                  // bơm C3 vì s < t
const addA = (Vr + VP) * a;               // planner Option A (v4.101)
const oldA = Vr * a;                      // công thức cũ — bỏ quên ống
/* con số planner in ra trong bảng OPTION A */
const cellA = ($('spp-res') && $('spp-res').innerHTML) || '';
w.MC.spPlanOpen('1'); set('spp-sell', SELL); set('spp-norm', T); set('spp-fail', 0);
set('spp-resv', 0); set('spp-max', M); set('spp-vpipe', VP); $('spp-circ').checked = true;
w.MC.spPlanCalc();
const shown = (function(){
  const m = $('spp-res').innerHTML.match(/<b>([\d.,]+)<\/b> m³ C3/);
  return m ? parseFloat(m[1].replace(/,/g,'')) : NaN;
})();
near('OPTION A in ra = (còn lại + ống) × a', shown, addA, 0.15);
ok('lớn hơn công thức cũ (đã kể phần ống)', shown > oldA + 0.05);
/* nghiệm lại: bơm addA thì CẢ HỆ về đúng t */
near('sau khi bơm, cả bồn + ống về đúng tỉ lệ thường',
     (s*(Vr+VP) + addA) / (Vr + VP + addA), t, 1e-9);
ok('bồn dừng ở '+(Vr+addA).toFixed(2)+' m³ — KHÔNG vượt mức nhắm tới '+M,
   Vr + addA <= M + 1e-9);

console.log('\n── ④ Bỏ tick trong plan KHÔNG đụng tới tuần hoàn của panel ──');
(async ()=>{
  $('spp-circ').checked = false;
  w.MC.spPlanCalc();
  w.MC.spPlanApply();
  near('panel vẫn giữ pipe 74 m³', num('mc-spvpipe1'), VP, 0);
  w.MC.calcOne('1');
  near('panel vẫn back-solve theo tuần hoàn như cũ',
       (num('mc-sptr1')/100*num('mc-tv1') + cr*VP) / (num('mc-tv1') + VP), s, 5e-5);
  await new Promise(r=>setTimeout(r, 900));      // toast cảnh báo phát sau 700 ms
  ok('có toast cảnh báo plan lệch panel', LOG.some(x=>/PLAN tính KHÔNG tuần hoàn/.test(x)));

  console.log('\n'+(fail ? '❌ '+fail+' assert THẤT BẠI' : '✅ TẤT CẢ ASSERT PASS')+'\n');
  process.exit(fail ? 1 : 0);
})();
