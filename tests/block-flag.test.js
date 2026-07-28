/* ============================================================
 * tests/block-flag.test.js  (v4.80)
 * ------------------------------------------------------------
 * Kiểm tra cột ⛔ BLOCK ("cấm nhận hàng") xuyên suốt FCHECK:
 *   1) xe bị cấm  → checkOrder().blocked, cellWarn badge, orderWarning
 *   2) tài xế bị cấm (kể cả trùng tên) → blocked theo đúng subject
 *   3) rmooc bị cấm
 *   4) lệnh cấm ghi ở tab TW AVG (field `truck`) vẫn bắt được
 *   5) bỏ tick → sạch; cert hết hạn KHÔNG bị lẫn vào blocked
 *   6) stationWarning ưu tiên level 'blk'
 * Chạy:  node tests/block-flag.test.js
 * Không cần jsdom — chỉ stub vài API DOM mà fcheck.js đụng tới khi nạp.
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---------- stubs ---------- */
const noopEl = { addEventListener(){}, classList:{ toggle(){}, add(){}, remove(){}, contains(){ return false; } },
                 querySelectorAll(){ return []; }, innerHTML:'', onclick:null, title:'' };
const sandbox = {
  console,
  setTimeout, clearTimeout,
  document: { addEventListener(){}, getElementById(){ return null; },
              querySelectorAll(){ return []; }, createElement(){ return noopEl; },
              body:{ appendChild(){} } },
  toast(){},
  /* parseDate rút gọn: chỉ cần DD/MM/YY cho test cert */
  parseDate(s){
    if(!s) return null;
    const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if(!m) return null;
    let y = +m[3]; if(y < 100) y += 2000;
    return new Date(y, +m[2]-1, +m[1]);
  },
  /* helpers từ config.js */
  isRowBlocked(r){ return !!(r && r.blocked); },
  rowBlockNote(r){ return String((r && r.blockNote) || '').trim(); },
  CERT_DEFS: {
    tanklorry:{ certs:[{k:'periodical',name:'Đăng kiểm'}] },
    tractor:{ certs:[{k:'periodical',name:'Đăng kiểm'}] },
    rmooc:{ certs:[{k:'periodical',name:'Đăng kiểm'}] },
    driver:{ certs:[{k:'license',name:'Bằng lái'}] },
    twavg:{ certs:[] }
  },
  DATA: {
    tanklorry:{
      r1:{ _rid:'r1', plate:'51D-05867', periodical:'01/01/99' },              /* sạch */
      r2:{ _rid:'r2', plate:'51C-11111', periodical:'01/01/99',
           blocked:true, blockNote:'Vi phạm an toàn 12/07' },                  /* BỊ CẤM */
      r3:{ _rid:'r3', plate:'51C-99999', periodical:'01/01/20' }               /* cert hết hạn, KHÔNG cấm */
    },
    tractor:{},
    rmooc:{
      m1:{ _rid:'m1', plate:'51R-2222', periodical:'01/01/99',
           blocked:true, blockNote:'Bồn rò rỉ' }
    },
    driver:{
      d1:{ _rid:'d1', name:'Nguyễn Văn A', license:'01/01/99' },
      d2:{ _rid:'d2', name:'Trần Văn B',  license:'01/01/99',
           blocked:true, blockNote:'Hết hạn thẻ ra vào' },
      d3:{ _rid:'d3', name:'Lê Văn C',    license:'01/01/99' },
      d4:{ _rid:'d4', name:'Lê Văn C',    license:'01/01/99',
           blocked:true, blockNote:'Bị đình chỉ' }                             /* trùng tên, 1 bản bị cấm */
    },
    twavg:{
      t1:{ _rid:'t1', truck:'51C-77777', avgWt:14000,
           blocked:true, blockNote:'Cân sai — nhà máy từ chối' }               /* cấm ghi ở TW AVG */
    }
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

/* `const FCHECK` ở top-level không gắn vào global object của vm context →
   nối thêm 1 dòng export để test lấy được module. */
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'checks', 'fcheck.js'), 'utf8')
          + '\n;globalThis.__FCHECK = FCHECK;';
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename:'fcheck.js' });
const FCHECK = sandbox.__FCHECK;

/* ---------- mini assert ---------- */
let pass = 0, fail = 0;
function ok(name, cond, extra){
  if(cond){ pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + JSON.stringify(extra) : '')); }
}
const D = new Date(2026, 6, 28);   /* 28/07/2026 */

console.log('\n1) Xe bị cấm');
{
  const c = FCHECK.checkOrder('51C-11111', '', '', D);
  ok('checkOrder trả 1 lệnh cấm', c.blocked.length === 1, c.blocked);
  ok('subject = Vehicle', c.blocked[0] && c.blocked[0].subject === 'Vehicle', c.blocked[0]);
  ok('giữ nguyên lý do', c.blocked[0] && c.blocked[0].note === 'Vi phạm an toàn 12/07', c.blocked[0]);
  const w = FCHECK.cellWarn({ plate:'51C-11111' }, 'plate');
  ok('cellWarn nhấp nháy + badge ⛔', w.blink && w.badges.indexOf('⛔') >= 0, w);
  const o = FCHECK.orderWarning({ plate:'51C-11111' }, D);
  ok('orderWarning level = blk', o.level === 'blk', o);
  ok('orderWarning có badge type blk', o.badges.some(b => b.type === 'blk'), o.badges);
}

console.log('\n2) Tài xế bị cấm');
{
  const c = FCHECK.checkOrder('', '', 'Trần Văn B', D);
  ok('bắt được lệnh cấm tài xế', c.blocked.length === 1 && c.blocked[0].subject === 'Driver', c.blocked);
  const w = FCHECK.cellWarn({ driver:'Trần Văn B' }, 'driver');
  ok('badge ⛔ ở ô Driver', w.badges.indexOf('⛔') >= 0, w);
  /* trùng tên: chỉ 1 trong 2 bản ghi bị cấm → vẫn phải cảnh báo */
  const dup = FCHECK.checkOrder('', '', 'Lê Văn C', D);
  ok('tên trùng, 1 bản bị cấm → vẫn cảnh báo', dup.blocked.length === 1, dup.blocked);
  ok('vẫn báo dupDriver', dup.dupDriver === 2, dup.dupDriver);
}

console.log('\n3) Rmooc bị cấm');
{
  const c = FCHECK.checkOrder('51D-05867', '51R-2222', '', D);
  ok('subject = Rmooc', c.blocked.length === 1 && c.blocked[0].subject === 'Rmooc', c.blocked);
  const w = FCHECK.cellWarn({ plate:'51D-05867', rmooc:'51R-2222' }, 'rmooc');
  ok('badge ⛔ ở ô Rmooc', w.badges.indexOf('⛔') >= 0, w);
  ok('ô Plate KHÔNG bị lây badge', FCHECK.cellWarn({ plate:'51D-05867', rmooc:'51R-2222' }, 'plate').badges === '');
}

console.log('\n4) Lệnh cấm ghi ở tab TW AVG');
{
  const c = FCHECK.checkOrder('51C-77777', '', '', D);
  ok('bắt được cấm từ TW AVG', c.blocked.length === 1, c.blocked);
  ok('vẫn báo thiếu trong Fleet chính', c.missing.indexOf('Vehicle') >= 0, c.missing);
}

console.log('\n5) Không tick / cert hết hạn');
{
  const clean = FCHECK.checkOrder('51D-05867', '', 'Nguyễn Văn A', D);
  ok('xe & tài xế sạch → blocked rỗng', clean.blocked.length === 0, clean.blocked);
  ok('sạch → orderWarning không cảnh báo', !FCHECK.orderWarning({ plate:'51D-05867', driver:'Nguyễn Văn A' }, D).hasWarn);
  const exp = FCHECK.checkOrder('51C-99999', '', '', D);
  ok('cert hết hạn KHÔNG bị tính là blocked', exp.blocked.length === 0 && exp.expired.length === 1, exp);
  ok('cert hết hạn → level bad (không phải blk)',
     FCHECK.orderWarning({ plate:'51C-99999' }, D).level === 'bad');
}

console.log('\n6) Thẻ trạm & tiện ích');
{
  const w = FCHECK.stationWarning({ status:'loading', plate:'51C-11111', driver:'Trần Văn B' });
  ok('stationWarning level = blk', w && w.level === 'blk', w);
  ok('text chứa cả 2 lệnh cấm',
     w && w.text.indexOf('Vi phạm an toàn') >= 0 && w.text.indexOf('Hết hạn thẻ ra vào') >= 0, w && w.text);
  ok('orderBlocked() dùng được từ scale.js',
     FCHECK.orderBlocked({ plate:'51C-11111', driver:'' }).length === 1);
  ok('compactBlocked gộp 1 dòng',
     FCHECK.compactBlocked(FCHECK.checkOrder('51C-11111','','',D).blocked)
       === '51C-11111 (Vehicle): Vi phạm an toàn 12/07');
}

console.log('\n────────────────────────────');
console.log(`PASS ${pass}   FAIL ${fail}`);
process.exit(fail ? 1 : 0);
