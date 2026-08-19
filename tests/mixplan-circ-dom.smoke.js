/* ═══════════════════════════════════════════════════════════════════════
   v4.101 — SMOKE TEST TRÊN DOM THẬT (cần jsdom)
   Nạp index.html + eng.js + mixctrl.js rồi bấm thử ★ SPECIAL RATIO MIX
   PLANNER đúng như kỹ sư thao tác:
     • modal PLAN có ô chọn 🔁 TUẦN HOÀN ĐƯỜNG ỐNG, MẶC ĐỊNH BẬT
     • ô PIPE VOL mặc định 74 m³, lấy theo panel nếu panel đã có số khác
     • bỏ tick → MAX SAFE MIX to hơn (tính lạc quan như bản cũ)
     • → SET TARGET VOL ghi đúng số vào ô TARGET VOL của panel
     • ô Density của modal sửa dòng Tank Log giữ đủ 4 số thập phân
     npm i jsdom && node tests/mixplan-circ-dom.smoke.js
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
w.URL.createObjectURL = ()=> 'blob:x'; w.URL.revokeObjectURL = ()=>{};

const bundle = ['js/features/eng.js', 'js/features/mixctrl.js']
  .map(f=>fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n')
  + '\n;window.ENG=ENG;window.MC=MC;';
try{ w.eval(bundle); }catch(e){ console.log('❌ LOAD BUNDLE → ' + e.message); process.exit(1); }
try{ w.MC.init(); }catch(_){}

let fail = 0;
const ok = (l, c)=>{ console.log((c ? '  ✅ ' : '  ❌ ') + l); if(!c) fail++; };
const $  = id => w.document.getElementById(id);
const set = (id, v)=>{ const e = $(id); if(!e) throw new Error('thiếu #' + id); e.value = v; };
const v0 = ()=> parseFloat($('spp-res').dataset.v0);

console.log('\n── 1. Ô chọn tuần hoàn có mặt và MẶC ĐỊNH BẬT ──');
ok('có checkbox #spp-circ',  !!$('spp-circ'));
ok('có ô #spp-vpipe',        !!$('spp-vpipe'));
set('mc-tr1', '30');                   // FINAL TARGET C3 % = 30 (lệch tỉ lệ)
w.MC.spPlanOpen('1');
ok('modal mở',               $('spp-modal').classList.contains('on'));
ok('tuần hoàn mặc định BẬT', $('spp-circ').checked === true);
ok('PIPE VOL mặc định 74',   parseFloat($('spp-vpipe').value) === 74);
ok('tỉ lệ đặc biệt lấy từ panel = 30', parseFloat($('spp-special').value) === 30);

console.log('\n── 2. Có / không tuần hoàn cho hai con số khác nhau ──');
set('spp-sell', '100');
w.MC.spPlanCalc();
const withCirc = v0();
ok('có ra MAX SAFE MIX', withCirc > 0);
ok('ghi rõ đang tính CÓ tuần hoàn', /có tuần hoàn/i.test($('spp-res').innerHTML));
$('spp-circ').checked = false;
w.MC.spPlanCalc();
const noCirc = v0();
ok('bỏ tick → số LỚN hơn (lạc quan hơn)', noCirc > withCirc + 0.05);
ok('ghi rõ KHÔNG tuần hoàn', /KHÔNG tuần hoàn/.test($('spp-circ-note').innerHTML));
$('spp-circ').checked = true;
w.MC.spPlanCalc();
ok('bật lại → về đúng số cũ', Math.abs(v0() - withCirc) < 1e-9);

console.log('\n── 3. Đổi PIPE VOL đổi kết quả ──');
set('spp-vpipe', '100');
w.MC.spPlanCalc();
ok('ống to hơn → mix được ít hơn', v0() < withCirc - 0.05);
set('spp-vpipe', '74');
w.MC.spPlanCalc();

console.log('\n── 4. → SET TARGET VOL ghi vào panel ──');
const want = v0();
w.MC.spPlanApply();
ok('TARGET VOL của panel = MAX SAFE MIX', Math.abs(parseFloat($('mc-tv1').value) - want) < 0.05);
ok('modal đã đóng', !$('spp-modal').classList.contains('on'));
ok('toast nêu trạng thái tuần hoàn', LOG.some(x=>/có tuần hoàn/.test(x)));

console.log('\n── 5. Panel đã bật SPECIAL RATIO thì planner theo panel ──');
set('mc-spvpipe1', '80');
w.MC.toggleSP('1');            // bật ★ MIX TỈ LỆ ĐẶC BIỆT trên panel
w.MC.spPlanOpen('1');
ok('PIPE VOL lấy theo panel = 80', parseFloat($('spp-vpipe').value) === 80);
ok('vẫn mặc định có tuần hoàn', $('spp-circ').checked === true);
w.MC.spPlanClose();

console.log('\n── 6. Density trong modal sửa dòng Tank Log giữ 4 số ──');
try{ w.ENG.init(); }catch(_){}
const r = new Array(69).fill('');
r[1] = 'LPG-2026-499'; r[2] = 'TK-3501'; r[3] = '19/08/26'; r[27] = 'Pass';
r[10] = 60.23; r[6] = 572.273; r[33] = 0.5405; r[45] = '50.25/49.75'; r[63] = 0.5415;
w.ENG.upsertRow(r);
const hit = (w.ENG.ROWS || []).find(x=>String(x[1]) === 'LPG-2026-499');
ok('dòng đã vào Tank Log', !!hit);
w.ENG.render();
const cell = w.document.querySelector('#engTbl tbody .td-density');
ok('bảng hiện đủ 0.5405', cell && cell.textContent.trim() === '0.5405');
/* mở modal sửa dòng rồi bấm 💾 SAVE NGAY, không sửa gì — số phải y nguyên.
   Đây đúng là đường đi làm mất số lẻ trước v4.101. */
w.ENG.openEdit(hit._rid);
const inp = w.document.querySelector('#engEditModal input[data-col="33"]');
ok('ô Density trong modal hiện 0.5405', inp && inp.value === '0.5405');
const inp63 = w.document.querySelector('#engEditModal input[data-col="63"]');
ok('ô ρ COQ đầu hiện 0.5415', inp63 && inp63.value === '0.5415');
w.ENG.saveEdit();
const after = (w.ENG.ROWS || []).find(x=>String(x[1]) === 'LPG-2026-499');
ok('SAVE xong vẫn là 0.5405 (không rơi về 0.54)', after && Math.abs(after[33] - 0.5405) < 1e-12);
ok('ρ COQ đầu cũng giữ 0.5415', after && Math.abs(after[63] - 0.5415) < 1e-12);

console.log('\n' + (fail ? '❌ ' + fail + ' assert THẤT BẠI' : '✅ TẤT CẢ ASSERT PASS') + '\n');
process.exit(fail ? 1 : 0);
